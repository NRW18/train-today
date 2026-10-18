import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { load, html } from "./app.mjs";

const source = readFileSync(new URL("../machine-recognition.js", import.meta.url), "utf8");
const exercises = ["chest_press", "leg_press", "pec_deck", "rear_delt"].map(id => ({ id, name: id + " canonical" }));
const row = (id, confidence) => ({ id, confidence, label: "remote name" });
function runtime(options = {}) {
  const calls = [], revoked = [], dimensions = [];
  const context = vm.createContext({ URL: { createObjectURL: () => "blob:test", revokeObjectURL: value => revoked.push(value) },
    setTimeout, clearTimeout, AbortController, Uint8Array, Blob, Map, console,
    Image: class { set src(value) { if (!value) return; this.naturalWidth = 1600; this.naturalHeight = 900; queueMicrotask(() => options.badImage ? this.onerror() : this.onload()); } },
    document: { baseURI: "https://example.test/train-today/", createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }), toBlob(done) { dimensions.push([this.width, this.height]); done(new Blob(["resized"], { type: "image/jpeg" })); } }) },
    fetch: async (url, init) => { calls.push({ url: String(url), init }); return options.fetch ? options.fetch(url, init) : { ok: true, json: async () => options.results || [] }; },
    ...options.globals
  });
  // URL needs real URL construction and controlled object URL lifecycle.
  context.URL = class extends URL { static createObjectURL() { return "blob:test"; } static revokeObjectURL(value) { revoked.push(value); } };
  vm.runInContext(source, context);
  return { api: context.KryvosMachines, context, calls, revoked, dimensions };
}
const config = mode => ({ mode, threshold: .85, modelPath: "models/machines/", endpoint: "https://recognize.example.test/machines", timeoutMs: 50 });

test("machine results validate shape, IDs, finite numeric range; deduplicate and sort descending", () => {
  const { api } = runtime();
  const results = api.cleanResults([row("leg_press", .3), row("chest_press", .8), row("leg_press", .9),
    row("unknown", 1), row("pec_deck", NaN), row("pec_deck", Infinity), row("pec_deck", -.1), row("pec_deck", 1.1),
    row("pec_deck", "0.9"), null, {}, { id: "pec_deck", confidence: .8 }, { ...row("pec_deck", .8), label: "" }], exercises);
  assert.deepEqual(Array.from(results, result => [result.id, result.confidence]), [["leg_press", .9], ["chest_press", .8]]);
  assert.equal(results[0].label, "leg_press canonical");
  assert.throws(() => api.cleanResults({ results: [] }, exercises), /response/);
  assert.throws(() => api.cleanResults(null, exercises), /response/);
  assert.equal(api.cleanResults([row("leg_press", 1)], [{ id: "leg_press", hidden: true }]).length, 0);
  assert.deepEqual(Array.from(api.cleanResults([row("leg_press", 0), row("chest_press", 1)], exercises), item => item.confidence), [1, 0]);
});
test("threshold is inclusive; below threshold, top-three and short/empty lists never invent candidates", () => {
  const { api } = runtime();
  assert.equal(api.choices([row("leg_press", .849999)], .85, []).confirm, false);
  assert.equal(api.choices([row("leg_press", .85)], .85, []).confirm, true);
  assert.equal(api.choices([row("leg_press", .850001)], .85, []).confirm, true);
  assert.equal(api.choices([row("leg_press", 0)], 0, []).confirm, true);
  assert.equal(api.choices([row("leg_press", 1)], 1, []).confirm, true);
  assert.equal(api.choices(exercises.map((ex, index) => row(ex.id, .8 - index / 10)), .85, []).items.length, 3);
  assert.equal(api.choices([row("leg_press", .2)], .85, []).items.length, 1);
  assert.equal(api.choices([], .85, []).items.length, 0);
});
test("rejecting a candidate excludes it for the photo, including high-confidence runners-up", () => {
  const { api } = runtime();
  const result = api.choices([row("leg_press", 1), row("chest_press", .99)], .85, ["leg_press"]);
  assert.equal(result.confirm, false);
  assert.deepEqual(Array.from(result.items, item => item.id), ["chest_press"]);
});
test("remote sends a resized JPEG without credentials; normalizes response", async () => {
  const r = runtime({ results: [row("leg_press", .4), row("chest_press", .9)] });
  const result = await r.api.create(config("remote"), () => exercises).recognizeMachine(new Blob(["original"]));
  assert.equal(result[0].id, "chest_press");
  assert.deepEqual(r.dimensions, [[512, 288]]);
  assert.equal(await r.calls[0].init.body.text(), "resized");
  assert.equal(r.calls[0].init.headers["Content-Type"], "image/jpeg");
  assert.equal(r.calls[0].init.credentials, "omit");
  assert.equal(r.calls[0].init.referrerPolicy, "no-referrer");
  assert.equal(r.revoked.length, 1);
});
for (const scenario of ["offline", "http", "bad-json", "bad-shape", "unknown", "timeout"]) {
  test("remote failure remains a rejected operation or empty validated result: " + scenario, async () => {
    const r = runtime({ fetch: async (url, init) => {
      if (scenario === "offline") throw Error("offline");
      if (scenario === "timeout") return new Promise((resolve, reject) => init.signal.addEventListener("abort", () => reject(Error("timeout"))));
      return { ok: scenario !== "http", json: async () => {
        if (scenario === "bad-json") throw SyntaxError("bad JSON");
        return scenario === "bad-shape" ? {} : [row("unknown", 1)];
      } };
    } });
    const action = r.api.create(config("remote"), () => exercises).recognizeMachine(new Blob());
    if (scenario === "unknown") assert.equal((await action).length, 0);
    else await assert.rejects(action);
  });
}
test("remote rejects insecure endpoints and embedded credentials before network use", async () => {
  for (const endpoint of ["", "http://remote.test", "https://user:password@remote.test"]) {
    const r = runtime();
    await assert.rejects(r.api.create({ ...config("remote"), endpoint }, () => exercises).recognizeMachine(new Blob()), /config/);
    assert.equal(r.calls.length, 0);
  }
});
for (const scenario of ["missing", "offline", "malformed-metadata", "unknown-class", "runtime-failed"]) {
  test("local model fallback retries safely, never POSTs or calls remote: " + scenario, async () => {
    const r = runtime({ fetch: async () => {
      if (scenario === "offline") throw Error("offline");
      return { ok: scenario !== "missing", json: async () => scenario === "malformed-metadata" ? {} : { labels: [scenario === "unknown-class" ? "unknown" : "leg_press"] } };
    }, globals: scenario === "runtime-failed" ? { document: { baseURI: "https://example.test/train-today/", createElement: kind => {
      if (kind === "script") return { remove() {} };
      return { getContext: () => ({ drawImage() {} }), toBlob: done => done(new Blob()) };
    }, head: { appendChild: script => queueMicrotask(() => script.onerror()) } } } : {} });
    const adapter = r.api.create(config("local"), () => exercises);
    await assert.rejects(adapter.recognizeMachine(new Blob()), /model/);
    await assert.rejects(adapter.prepare(), /model/);
    assert.ok(r.calls.length >= 2, "a failed promise must not permanently poison retries");
    assert.ok(r.calls.every(call => call.url.startsWith("https://example.test/train-today/models/machines/") && call.init.method !== "POST" && !call.init.body));
  });
}
test("unreadable images release object URLs and never reach network in either mode", async () => {
  for (const mode of ["local", "remote"]) {
    const r = runtime({ badImage: true });
    await assert.rejects(r.api.create(config(mode), () => exercises).recognizeMachine(new Blob()), /image/);
    assert.equal(r.calls.length, 0); assert.equal(r.revoked.length, 1);
  }
});
function localRuntime(extra = {}) {
  return runtime({ fetch: async url => {
    if (String(url).endsWith("metadata.json")) return { ok: true, json: async () => ({ labels: ["leg_press"] }) };
    if (String(url).endsWith("model.json")) return { ok: true, json: async () => ({ modelTopology: {}, weightsManifest: [{ paths: ["weights.bin"], weights: [] }] }) };
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
  }, globals: { tf: { io: { fromMemory: value => value }, loadLayersModel: async () => ({ dispose() {} }) },
    tmImage: { CustomMobileNet: class { async predict() { return [{ className: "leg_press", probability: .91 }]; } } }, ...extra } });
}
test("local adapter uses TM prediction, existing IDs and Pages-relative assets without upload", async () => {
  const r = localRuntime();
  const adapter = r.api.create(config("local"), () => exercises);
  assert.equal((await adapter.recognizeMachine(new Blob()))[0].id, "leg_press");
  await adapter.recognizeMachine(new Blob());
  assert.equal(r.calls.length, 3, "one reusable model instance");
  assert.ok(r.calls.every(call => call.url.startsWith("https://example.test/train-today/") && !call.init.body));
  assert.equal(r.revoked.length, 4, "resize and prediction images released each time");
});
test("offline preparation caches runtime, metadata, topology and every shard only after model loads", async () => {
  let files;
  const r = localRuntime({ navigator: { serviceWorker: { controller: {} } }, caches: { open: async () => ({ addAll: async assets => { files = assets; } }) } });
  await r.api.create(config("local"), () => exercises).prepareOffline();
  assert.equal(files.length, 5);
  assert.ok(files.every(path => path.startsWith("https://example.test/train-today/")));
  assert.ok(files.some(path => path.endsWith("weights.bin")));
  const noCache = localRuntime();
  await assert.rejects(noCache.api.create(config("local"), () => exercises).prepareOffline(), /offline/);
});
test("manual grid always retains canonical exercise names and IDs; high/low score cards separate photo and examples", () => {
  const nodes = {};
  const r = runtime();
  const a = load(["machineCard", "drawMachineResults", "rejectMachine"], {
    EXBY: Object.fromEntries(exercises.map(ex => [ex.id, ex])), esc: value => String(value).replaceAll("<", "&lt;"),
    machineArt: id => '<svg data-example="' + id + '"></svg>', machineConfig: () => config("local"),
    machineResults: [row("leg_press", .9), row("chest_press", .7)], machineRejected: [], machinePhoto: "blob:photo",
    window: { KryvosMachines: r.api }, $: id => nodes[id] ||= { focus() {} }
  });
  a.drawMachineResults();
  assert.match(nodes["machine-results"].innerHTML, /data-machine-confirm="leg_press"/);
  assert.match(nodes["machine-results"].innerHTML, /รูปที่คุณถ่ายหรือเลือก/);
  assert.match(nodes["machine-results"].innerHTML, /ภาพตัวอย่างหรือรูปย่อ/);
  a.rejectMachine("leg_press");
  assert.doesNotMatch(nodes["machine-results"].innerHTML, /data-machine-confirm="leg_press"/);
  assert.match(nodes["machine-results"].innerHTML, /data-machine-confirm="chest_press"/);
  assert.match(html, /id="machine-manual" open/);
  assert.match(html, /id="machine-input" accept="image\/\*" capture="environment"/);
});
test("confirmation opens the original guide and the same exercise's rest timer", () => {
  const ex = { id: "leg_press", name: "Leg Press", m: [], j: [] }, labels = {};
  const sheet = { focus() {} }; let started = false, guide;
  const a = load(["openMachineInfo"], { EXBY: { leg_press: ex }, MACHINE_RELATIONS: {}, machineSequence: 0,
    S: { prefs: { rest: 90 } }, openGuides: {}, document: { activeElement: {} }, sheet,
    openSheet() {}, closeSheet() {}, sheetHead: name => name, esc: value => value,
    machineArt: () => "", isPainful: () => false, guideHtml: item => { guide = item; return "guide"; },
    restText: value => String(value), startRest: () => { started = true; }, $: id => labels[id] ||= {}
  });
  a.openMachineInfo("leg_press", true);
  assert.equal(guide, ex);
  assert.match(sheet.innerHTML, /data-machine-rest="leg_press"/);
  sheet.onclick({ target: { closest: () => ({ hasAttribute: () => false, dataset: { machineRest: "leg_press" } }) } });
  assert.equal(started, true); assert.match(labels["rest-lb"].textContent, /Leg Press/);
});
test("remote consent cancellation never calls adapter; unavailable/invalid images keep manual fallback", async () => {
  const nodes = {}; let uploaded = false;
  const a = load(["scanMachinePhoto"], { machineSequence: 0, machineConfig: () => config("remote"), confirm: () => false,
    recognizeMachine: () => { uploaded = true; }, $: id => nodes[id] ||= {} });
  await a.scanMachinePhoto(new Blob()); assert.equal(uploaded, false);
  a.confirm = () => true; a.clearMachinePhoto = () => {}; a.drawMachineResults = () => {};
  a.window = { KryvosMachines: { resizeImage: async () => { throw Error("image"); } } };
  await a.scanMachinePhoto(new Blob()); assert.match(nodes["machine-status"].textContent, /อ่านรูปไม่ได้/);
  a.window.KryvosMachines.resizeImage = async blob => blob;
  a.URL = { createObjectURL: () => "blob:test" };
  a.recognizeMachine = async () => { throw Error("network"); };
  await a.scanMachinePhoto(new Blob()); assert.match(nodes["machine-status"].textContent, /ไม่พร้อม/);
});

test("primary workout action follows actual progress and hides for rest; pain stays visible", () => {
  const nodes = {};
  const a = load(["renderStartAction"], { $: id => nodes[id] ||= {}, current: { items:[{}] }, S:{body:{}}, progress: () => ({done:0,total:3}) });
  a.renderStartAction(); assert.equal(nodes["start-workout"].textContent, "เริ่มฝึก");
  a.progress = () => ({done:1,total:3}); a.renderStartAction(); assert.equal(nodes["start-workout"].textContent, "ฝึกต่อ");
  a.progress = () => ({done:3,total:3}); a.renderStartAction(); assert.equal(nodes["start-workout"].textContent, "บันทึกการซ้อม");
  a.current = {rest:true}; a.S.body = {"j:knee":"pain"}; a.renderStartAction();
  assert.equal(nodes["start-workout"].hidden, true); assert.equal(nodes["start-safety"].hidden, false);
});
test("draft status distinguishes unsaved edits, persisted draft and storage failure", () => {
  const node = {};
  const a = load(["draftSaveStatus"], {$: () => node});
  a.draftSaveStatus("dirty"); assert.match(node.textContent, /กำลังแก้ไข/);
  a.draftSaveStatus("saved"); assert.match(node.textContent, /เก็บร่างในเครื่องแล้ว/);
  a.draftSaveStatus("failed"); assert.match(node.textContent, /ยังเก็บร่างไม่ได้/);
});
test("a late recognition response cannot replace the manual selection", async () => {
  let resolve;
  const nodes = {};
  const a = load(["scanMachinePhoto"], { machineSequence:0, machineConfig: () => config("local"),
    clearMachinePhoto() {}, window:{KryvosMachines:{resizeImage: async blob => blob}}, URL:{createObjectURL: () => "blob:test"},
    $: id => nodes[id] ||= {}, recognizeMachine: () => new Promise(done => {resolve = done;}),
    drawMachineResults: () => {throw Error("stale UI redraw");} });
  const pending = a.scanMachinePhoto(new Blob());
  await new Promise(done => setImmediate(done));
  a.machineSequence++; resolve([row("leg_press", 1)]); await pending;
  assert.equal(a.machineResults.length, 0);
});
