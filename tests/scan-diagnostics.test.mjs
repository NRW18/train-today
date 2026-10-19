import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./app.mjs";

const recognized = { equipment: [{ label_th: "Press", known: ["press"], confidence: .9 }], new_exercises: [] };
const envelope = (text, finishReason = "STOP") => ({ candidates: [{ finishReason, content: { parts: [{ text }] } }] });
const privateMarker = "PRIVATE_SENTINEL_DO_NOT_DISPLAY";
function app(steps = [], personal = true) {
  const calls = [], waits = [], nodes = {};
  const a = load(["aiError", "aiHttpError", "readAIResponse", "parseGemini", "callGemini", "callProxy", "validate", "validateScan", "cleanEn", "errText", "scanCacheKey", "scanAI", "scan", "scanDiagnosticHtml", "snapshot"], {
    Response, navigator: { onLine: true }, withLang: (parts) => parts,
    getKey: () => personal ? "test-only-not-a-real-key" : "", PROXY_URL: "https://worker.example/",
    S: { log: [], custom: [] }, EX: [{ id: "press", name: "Press" }], EXBY: { press: { id: "press", name: "Press", m: ["chest"] } },
    DAYS: { push: {} }, MUSCLES: { chest: 1 }, JOINTS: { shoulder: 1 },
    shots: {}, shotN: 0, drawShots() {}, openShot() {}, shotChanged() {},
    $: (id) => nodes[id] ||= { classList: { add() {}, remove() {} } },
    shrink: async () => "data:image/jpeg;base64,VEVTVA==", makeThumbnail: async () => "thumbnail", buildPrompt: () => "test prompt",
    esc: (value) => String(value).replaceAll("<", "&lt;").replaceAll('"', "&quot;"),
    setTimeout: (fn, ms) => { waits.push(ms); fn(); },
    fetch: async (url) => {
      calls.push({ model: url.includes("/models/") ? url.split("/models/")[1].split(":")[0] : "worker" });
      const step = steps.shift() || {};
      if (step.network) throw new TypeError(privateMarker);
      if (step.bodyError) return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"candidates":'));
          controller.error(step.bodyError === "abort" ? new DOMException(privateMarker, "AbortError") : new TypeError(privateMarker));
        }
      }), { status: step.status || 200 });
      return new Response(step.nonJSON ? "not JSON " + privateMarker : JSON.stringify(step.body || envelope(JSON.stringify(recognized))), { status: step.status || 200 });
    }
  }, ["MODELS", "SCAN_ERRORS", "AI_FAIL"]);
  a.calls = calls; a.waits = waits;
  return a;
}

test("personal-key HTTP failures have distinct safe categories without retrying auth/quota/server errors", async () => {
  for (const [status, body, code] of [
    [400, { error: { details: [{ reason: "API_KEY_INVALID" }], message: privateMarker } }, "auth"],
    [401, { error: { message: privateMarker } }, "auth"],
    [403, { error: { message: privateMarker } }, "permission"],
    [400, { error: { status: "INVALID_ARGUMENT", message: privateMarker } }, "request"],
    [429, { error: { message: privateMarker } }, "quota"],
    [503, { error: { message: privateMarker } }, "upstream"]
  ]) {
    const a = app([{ status, body }]);
    await assert.rejects(a.callGemini([{ text: "test" }]), (error) => {
      assert.equal(error.aiCode, code); assert.equal(error.status, status);
      assert.ok(!JSON.stringify(error).includes(privateMarker));
      assert.ok(!a.errText(error, "scan").includes("ให้เห็นเครื่องชัด")); return true;
    });
    assert.equal(a.calls.length, 1);
  }
});

test("404 preserves the exact existing fallback order and reports model access failure after all three", async () => {
  const a = app(Array.from({ length: 3 }, () => ({ status: 404, body: { error: { message: privateMarker } } })));
  const diagnostic = {};
  await assert.rejects(a.callGemini([{ text: "test" }], 0, diagnostic), (error) => error.aiCode === "model");
  assert.deepEqual(a.calls.map((call) => call.model), ["gemini-3-flash-preview", "gemini-3.1-flash-lite", "gemini-flash-latest"]);
  assert.equal(diagnostic.model, "gemini-flash-latest"); assert.equal(diagnostic.http, 404);
});

test("404 then a valid response succeeds without changing model order", async () => {
  const a = app([{ status: 404 }, {}]);
  assert.equal((await a.callGemini([{ text: "test" }])).equipment[0].known[0], "press");
  assert.equal(a.calls.length, 2);
});

test("worker keeps one transient retry, local quota metadata and safe upstream status", async () => {
  const a = app([{ status: 502, body: { error: "upstream", status: 404 } }, { status: 502, body: { error: "upstream", status: 404 } }], false);
  await assert.rejects(a.callGemini([{ text: "test" }]), (error) => error.aiCode === "model" && error.proxy && error.upstreamStatus === 404);
  assert.equal(a.calls.length, 2); assert.deepEqual(a.waits, [1500]);
  const quota = app([{ status: 429, body: { error: "limit", scope: "app" } }], false);
  await assert.rejects(quota.callGemini([{ text: "test" }]), (error) => error.limit && error.scope === "app");
  assert.equal(quota.calls.length, 1);
  const permission = a.aiHttpError(502, { error: "upstream", status: 403, message: privateMarker }, true);
  assert.equal(permission.aiCode, "permission");
  assert.match(a.errText(permission, "scan"), /AI ของแอป/);
  assert.ok(!a.errText(permission, "scan").includes(privateMarker));
  const upstreamQuota = a.aiHttpError(429, { error: "upstream", status: 429 }, true);
  assert.match(a.errText(upstreamQuota, "scan"), /AI ของแอป/);
});

test("network, non-JSON HTTP response and invalid model JSON are separated", async () => {
  for (const [step, code] of [[{ network: true }, "network"], [{ nonJSON: true }, "response_json"], [{ body: envelope("not JSON " + privateMarker) }, "invalid_json"]]) {
    const a = app([step]);
    await assert.rejects(a.callGemini([{ text: "test" }]), (error) => error.aiCode === code && !error.message.includes(privateMarker));
    assert.equal(a.calls.length, 1);
  }
  const badHTTP = app([{ status: 403, nonJSON: true }]);
  await assert.rejects(badHTTP.callGemini([{ text: "test" }]), (error) => error.aiCode === "permission", "HTTP status takes priority over a malformed error body");
});

test("HTTP 200 body-stream failures are network errors without extra retries or sensitive diagnostics", async () => {
  for (const personal of [true, false]) for (const bodyError of ["type", "abort"]) {
    const a = app([{ bodyError }], personal);
    await a.scan({});
    const result = a.shots.shot1;
    assert.equal(result.state, "err");
    assert.equal(result.diagnostic.code, "network");
    assert.equal(result.diagnostic.stage, "response");
    assert.equal(result.diagnostic.http, 200);
    assert.equal(a.calls.length, 1); assert.deepEqual(a.waits, []);
    const diagnostic = JSON.stringify(result.diagnostic) + a.scanDiagnosticHtml(result.diagnostic) + result.err;
    for (const secret of [privateMarker, "test-only-not-a-real-key", "data:image", "base64", '{"candidates":']) assert.ok(!diagnostic.includes(secret));
  }
});

test("HTTP 200 malformed JSON stays response_json on both request routes", async () => {
  for (const personal of [true, false]) {
    const a = app([{ nonJSON: true }], personal);
    await assert.rejects(a.callGemini([{ text: "test" }]), (error) => error.aiCode === "response_json" && error.status === 200 && !error.message.includes(privateMarker));
    assert.equal(a.calls.length, 1); assert.deepEqual(a.waits, []);
  }
});

test("non-2xx status takes precedence over broken bodies and preserves worker retry policy", async () => {
  for (const personal of [true, false]) for (const failure of [{ bodyError: "type" }, { bodyError: "abort" }, { nonJSON: true }]) {
    for (const [status, code] of [[403, "permission"], [429, "quota"], [503, "upstream"]]) {
      const a = app([{ status, ...failure }, { status, ...failure }], personal);
      await assert.rejects(a.callGemini([{ text: "test" }]), (error) => error.aiCode === code && error.status === status && !error.message.includes(privateMarker));
      const retries = !personal && status === 503;
      assert.equal(a.calls.length, retries ? 2 : 1);
      assert.deepEqual(a.waits, retries ? [1500] : []);
    }
  }
});

test("parser handles whitespace around JSON fences and excludes thought parts", () => {
  const a = app();
  const response = envelope("\n  ```json\n" + JSON.stringify(recognized) + "\n```\n  ");
  response.candidates[0].content.parts.unshift({ thought: true, text: privateMarker });
  assert.equal(a.parseGemini(response).equipment[0].known[0], "press");
});

test("blocked, truncated, empty and malformed response structures are not unrecognized equipment", () => {
  const a = app();
  for (const [response, code] of [
    [{ promptFeedback: { blockReason: "SAFETY" } }, "blocked"],
    [envelope("{}", "SAFETY"), "blocked"], [envelope("{", "MAX_TOKENS"), "truncated"],
    [{ candidates: [] }, "empty_response"], [{ candidates: [{ content: { parts: {} } }] }, "response_shape"]
  ]) assert.throws(() => a.parseGemini(response), (error) => error.aiCode === code);
});

test("only explicit empty arrays mean unrecognized equipment; rejected data is a validation failure", () => {
  const a = app();
  assert.equal(a.validateScan({ equipment: [], new_exercises: [] }).equipment.length, 0);
  for (const raw of [null, [], {}, { equipment: "invalid" }, { equipment: [], new_exercises: [{ name_th: "Invalid", day: "push", muscles: ["bogus"] }] }, { equipment: [{ known: ["constructor", "missing"] }], new_exercises: [] }]) {
    assert.throws(() => a.validateScan(raw), (error) => error.aiCode === "validation");
  }
  assert.equal(a.validateScan(recognized).equipment[0].ids[0], "press");
});

test("scan integration records the failing stage, keeps old results, and never persists diagnostics", async () => {
  const a = app([{ body: envelope("not JSON " + privateMarker) }]);
  a.shots.previous = { img: "old thumbnail", msg: "saved" };
  await a.scan({});
  const result = a.shots.shot1;
  assert.equal(result.state, "err"); assert.equal(result.diagnostic.stage, "parse");
  assert.equal(result.diagnostic.code, "invalid_json"); assert.equal(result.diagnostic.http, 200);
  assert.equal(a.shots.previous.img, "old thumbnail"); assert.equal(a.calls.length, 1);
  assert.ok(!JSON.stringify(result).includes(privateMarker)); assert.ok(!JSON.stringify(a.snapshot()).includes("diagnostic"));
});

test("image preparation, validation and rendering failures are attributed without extra AI requests", async () => {
  const image = app(); image.shrink = async () => { throw Error(privateMarker); };
  await image.scan({}); assert.equal(image.shots.shot1.diagnostic.code, "image"); assert.equal(image.calls.length, 0);
  const validation = app([{ body: envelope("{}") }]); await validation.scan({});
  assert.equal(validation.shots.shot1.diagnostic.stage, "validate"); assert.equal(validation.shots.shot1.diagnostic.code, "validation");
  const rendering = app(); rendering.shotChanged = (id) => { if (rendering.shots[id].state === "done") throw Error(privateMarker); };
  await rendering.scan({}); assert.equal(rendering.shots.shot1.diagnostic.code, "render"); assert.equal(rendering.calls.length, 1);
  const empty = app([{ body: envelope('{"equipment":[],"new_exercises":[]}') }]); await empty.scan({});
  assert.equal(empty.shots.shot1.state, "empty"); assert.ok(!empty.shots.shot1.err);
});

test("diagnostic UI accepts only fixed codes, model IDs, routes, stages and HTTP numbers", () => {
  const a = app();
  const hidden = a.scanDiagnosticHtml({ route: privateMarker, stage: privateMarker, model: privateMarker, http: privateMarker, upstream: privateMarker, code: privateMarker, response: privateMarker, key: privateMarker, image: privateMarker });
  assert.ok(!hidden.includes(privateMarker));
  const safe = a.scanDiagnosticHtml({ route: "personal", stage: "response", model: "gemini-3-flash-preview", http: 503, code: "upstream" });
  assert.match(safe, /HTTP 503/); assert.match(safe, /gemini-3-flash-preview/);
});

test("canvas exceptions reject image preparation instead of leaving the scan pending", async () => {
  let revoked = 0;
  class ImageStub { naturalWidth = 100; naturalHeight = 100; set src(value) { this.onload(); } }
  const a = load(["shrink", "aiError"], { Image: ImageStub, URL: { createObjectURL: () => "blob:test", revokeObjectURL: () => revoked++ }, document: { createElement: () => ({ getContext: () => { throw Error(privateMarker); } }) } });
  await assert.rejects(a.shrink({}), (error) => error.aiCode === "image"); assert.equal(revoked, 1);
});
