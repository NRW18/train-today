// Tests for saving and loading user data (index.html "state"). Run: node --test "tests/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { load, fnSource } from "./app.mjs";
import vm from "node:vm";

const STATE_FNS = ["checkLoadedThumbnails", "decodeThumbnail", "decodeScanThumbs", "cleanThumbnail", "cleanScanThumbs","strList", "cleanEn", "cleanGuide", "cleanCustom", "cleanDraft", "okTs", "cleanFood", "cleanW", "gpsCoordinate", "cleanRoute", "cleanRuns", "cleanLog", "cleanPrefs", "cleanProfile", "cleanShoe", "cleanShoeQ",
  "load", "snapshot", "save", "rebuildEx", "hideCustom", "blankState", "wipe", "syncFromOtherTab", "importBackup", "dataList", "draftTicked", "dayKey", "lastTrained", "lastEntry", "hoursSince", "editSet", "tickSet", "setMissing", "num"];

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}
function freshS() {
  return { log: [], off: [], slot: "any", energy: "ok", body: {}, draft: {}, custom: [], seen: [], scanned: false,
    food: [], weights: [], runs: [], prefs: { rest: 90, kcal: 2800, protein: null, goalKg: null }, summary: null,
    today: { skip: [], add: [] }, picker: false, onboarded: false, draftTs: 0 };
}
// A sandbox app with its own storage; S starts empty like a fresh page load.
export function app(storage = fakeStorage()) {
  const toasts = [];
  const ctx = load(STATE_FNS, {
    atob, S: freshS(), localStorage: storage, KEY: "train-today-v1", DRAFT_TTL: 12 * 36e5,
    DAYS: { push: {}, pull: {}, legs: {} }, MUSCLES: { chest: 1, back: 1, quads: 1 }, JOINTS: { shoulder: 1, knee: 1 },
    BASE_EX: [{ id: "chest_press", m: ["chest"], t: "kg" }, { id: "leg_press", m: ["quads"], t: "kg" }], EX: [], EXBY: {},
    RUN_TYPES: { easy: 1, tempo: 1, long: 1, race: 1 }, SHOE_USE: { daily: 1, cushion: 1, speed: 1, race: 1, trail: 1 },
    toast: (t) => toasts.push(t)
  }, ["SHOE_BRANDS"]);
  ctx.toasts = toasts;
  ctx.storage = storage;
  return ctx;
}

test("confirmed machine memory survives reopening and backup import without duplicate exercises or history", () => {
  const a = app(); a.load();
  a.S.log = [{ ts: Date.now() - 5000, day: "push", entries: [{ ex: "chest_press", sets: [{ kg: 20, reps: 10 }] }] }];
  a.S.off = ["chest_press", "leg_press"];
  a.S.prefs.homeAutoOff = ["chest_press"];
  vm.runInContext(fnSource("rememberMachine"), a);
  assert.equal(a.rememberMachine("chest_press"), true);
  assert.equal(a.rememberMachine("chest_press"), true);
  assert.equal(a.rememberMachine("not_real"), false);
  assert.equal(a.S.custom.length, 0); assert.equal(a.S.log.length, 1);
  assert.deepEqual(Array.from(a.S.seen), ["chest_press"]);
  assert.deepEqual(Array.from(a.S.off), ["leg_press"]);
  assert.equal(a.S.prefs.homeAutoOff.length, 0);
  const b = app(a.storage); b.load();
  assert.deepEqual(Array.from(b.S.seen), ["chest_press"]);
  assert.equal(b.S.log[0].entries[0].ex, "chest_press");
  Object.assign(b, { confirm: () => true, renderAll() {}, DATA_WORDS: {} });
  b.importBackup(JSON.stringify(a.snapshot()));
  assert.equal(b.S.seen.length, 1); assert.equal(b.S.custom.length, 0);
  b.importBackup(JSON.stringify({ log: a.S.log }));
  assert.equal(b.S.log.length, 1, "old backup without recognition fields still loads");
});

test("failed machine memory save rolls back availability, seen and scanned state", () => {
  const a = app(); a.load(); a.S.off = ["chest_press"];
  const before = JSON.stringify(a.S);
  a.save = () => false;
  vm.runInContext(fnSource("rememberMachine"), a);
  assert.equal(a.rememberMachine("chest_press"), false);
  assert.equal(JSON.stringify(a.S), before);
});

test("shoe brand choices and an older named shoe survive save/reload and backup import", () => {
  const storage = fakeStorage();
  const a = app(storage), start = Date.now() - 10000;
  a.S.shoe = { name: "Legacy Pegasus 37", ts: start, base: 120 };
  a.S.runs = [{ ts: start - 1, km: 8, min: 50, type: "easy" }, { ts: start + 1, km: 5.5, min: 32, type: "easy" }];
  a.S.shoeQ = { use: "cushion", sex: "f", width: "wide", arch: "flat", budget: 7300, brands: ["HOKA", "ASICS"] };
  a.save();
  const b = app(storage); b.load();
  assert.equal(b.S.shoe.name, "Legacy Pegasus 37");
  assert.equal(b.S.shoe.base, 120);
  assert.equal(b.S.shoeQ.sex, "f"); assert.equal(b.S.shoeQ.budget, 7300);
  assert.deepEqual(Array.from(b.S.shoeQ.brands), ["ASICS", "HOKA"]);
  const mileage = load(["shoeKm", "r1"], { S: b.S });
  assert.equal(mileage.shoeKm(), 125.5, "only runs after this pair's start count");
  const backup = JSON.parse(JSON.stringify({ ...b.snapshot(), app: "train-today", v: 3 }));
  const c = app(); c.load();
  Object.assign(c, { confirm: () => true, renderAll: () => {}, DATA_WORDS: {} });
  c.importBackup(JSON.stringify(backup));
  assert.equal(c.S.shoe.name, "Legacy Pegasus 37");
  assert.deepEqual(Array.from(c.S.shoeQ.brands), ["ASICS", "HOKA"]);
  assert.equal(load(["shoeKm", "r1"], { S: c.S }).shoeKm(), 125.5);
  delete backup.shoeQ.brands;
  c.importBackup(JSON.stringify(backup));
  assert.equal(c.S.shoeQ.brands.length, 0, "old backups use every brand");
  assert.equal(c.S.shoe.name, "Legacy Pegasus 37");
});

test("GPS runs, disconnected routes and IDs survive real save/load and backup import; old shoe mileage stays compatible", () => {
  const a = app(); a.load();
  a.S.shoe = { ts: 100, base: 40, name: "Original shoe" };
  a.S.runs = [{ ts: 101, km: 3.25, min: 20, t: "easy", gpsId: "gps-original-run", route: [[[13.123456, 100], [13.124, 100]], [[13.2, 100.2], [13.3, 100.3]]] }, { ts: 99, km: 5, min: 35 }];
  a.save(); const b = app(a.storage); b.load();
  assert.equal(b.S.runs[0].gpsId, "gps-original-run"); assert.equal(b.S.runs[0].route.length, 2); assert.equal(b.S.runs[0].route[0][0][0], 13.12346);
  Object.assign(b, { confirm: () => true, renderAll() {}, DATA_WORDS: {} });
  b.importBackup(JSON.stringify({ ...a.snapshot(), app: "train-today", v: 3 }));
  assert.equal(b.S.runs[0].route.length, 2); assert.equal(b.S.runs[1].route, undefined);
  assert.equal(load(["shoeKm", "r1"], { S: b.S }).shoeKm(), 43.3);
  b.importBackup(JSON.stringify({ log: [], runs: [{ ts: 102, km: 5, min: 30, route: [[["invalid", 100], [14, 101]]] }] }));
  assert.equal(b.S.runs[0].km, 5); assert.equal(b.S.runs[0].route[0].length, 1); assert.equal(b.S.shoe.name, "Original shoe");
});

test("invalid thumbnail imports are dropped without interrupting load of existing workouts", () => {
  const storage = fakeStorage({ "train-today-v1": JSON.stringify({
    log: [{ ts: Date.now(), day: "push", entries: [{ ex: "chest_press", sets: [{ kg: 25, reps: 10 }] }] }],
    onboarded: true, scanThumbs: { chest_press: "data:image/jpeg;base64,bm90LWFuLWltYWdl" },
    seen: ["chest_press"], prefs: { rest: 90 }
  }) });
  const a = app(storage); a.load();
  assert.equal(a.S.log[0].entries[0].sets[0].kg, 25);
  assert.equal(a.S.onboarded, true); assert.equal(Object.keys(a.S.scanThumbs).length, 0);
  a.save(); const b = app(storage); b.load();
  assert.equal(b.S.log[0].entries[0].sets[0].reps, 10);
  assert.deepEqual(Array.from(b.S.seen), ["chest_press"]);
});

// Data saved by the version before this change (no draft fields). Must still load the same.
const OLD_SAVE = {
  log: [{ ts: 1760000000000, day: "push", energy: "ok", entries: [{ ex: "chest_press", sets: [{ kg: 25, reps: 12 }, { kg: 25, reps: 11 }] }] }],
  off: ["pec_deck"], slot: "am", energy: "tired", body: {}, bodyDay: "2000-1-1", scanned: true, seen: ["chest_press"],
  custom: [{ id: "c_abc_0", name: "สมิธสควอท (สมิธแมชชีน)", day: "legs", m: ["quads"], j: ["knee"], t: "kg", ai: true }],
  food: [{ ts: 1760000000000, name: "ข้าวมันไก่", kcal: 600, p: 30 }], weights: [{ ts: 1760000000000, kg: 59.3 }],
  runs: [{ ts: 1760000000000, km: 5, min: 30 }], prefs: { rest: 120, kcal: 3000, protein: 110, goalKg: 62 },
  summary: { ts: 1760000000000, text: "ดีมาก", tips: ["กินเพิ่ม"] }, onboarded: true
};

test("old saved data (no draft) still loads the same", () => {
  const a = app(fakeStorage({ "train-today-v1": JSON.stringify(OLD_SAVE) }));
  a.load();
  assert.deepEqual(JSON.parse(JSON.stringify(a.S.log)), OLD_SAVE.log);
  assert.deepEqual([...a.S.off], OLD_SAVE.off);
  assert.equal(a.S.slot, "am");
  assert.equal(a.S.energy, "tired");
  assert.equal(a.S.custom.length, 1);
  assert.equal(a.S.food[0].name, "ข้าวมันไก่");
  assert.equal(a.S.weights[0].kg, 59.3);
  assert.equal(a.S.runs[0].km, 5);
  assert.equal(a.S.prefs.kcal, 3000);
  assert.equal(a.S.summary.text, "ดีมาก");
  assert.equal(a.S.onboarded, true);
  assert.deepEqual(JSON.parse(JSON.stringify(a.S.draft)), {});
});

test("ticked sets survive the tab being closed and reopened", () => {
  const storage = fakeStorage();
  const a = app(storage);
  a.rebuildEx();
  a.S.draft = { chest_press: [{ kg: 25, reps: 12, done: false }, { kg: "", reps: "", done: false }] };
  assert.equal(a.tickSet("chest_press", 0), "");
  a.editSet("chest_press", 1, "kg", "27.5");
  a.editSet("chest_press", 1, "reps", "10");
  a.save();
  const b = app(storage); // new page load, same phone
  b.load();
  assert.deepEqual(JSON.parse(JSON.stringify(b.S.draft)), {
    chest_press: [{ kg: "25", reps: "12", done: true, ed: false }, { kg: "27.5", reps: "10", done: false, ed: true }]
  });
});

test("a draft older than 12 hours is dropped", () => {
  const saved = { ...OLD_SAVE, draft: { chest_press: [{ kg: 25, reps: 12, done: true }] }, draftTs: Date.now() - 13 * 36e5 };
  const a = app(fakeStorage({ "train-today-v1": JSON.stringify(saved) }));
  a.load();
  assert.deepEqual(JSON.parse(JSON.stringify(a.S.draft)), {});
});

test("broken workout history is cleaned instead of crashing the app", () => {
  const good = OLD_SAVE.log[0];
  const saved = { ...OLD_SAVE, log: [
    good,
    null,
    { ts: 1760100000000, day: "legs", entries: [null, { ex: "leg_press" }, { ex: "leg_press", sets: [{ kg: "60", reps: "10" }, { kg: "x", reps: 8 }, { reps: "abc" }, null] }] },
    { ts: 1760050000000, day: "sunday", entries: [] },
    { day: "pull", entries: [] },
    { ts: 1759900000000, day: "pull" }
  ] };
  const a = app(fakeStorage({ "train-today-v1": JSON.stringify(saved) }));
  a.load();
  assert.equal(a.S.log.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(a.S.log[0])), good); // app-written data unchanged
  assert.deepEqual(JSON.parse(JSON.stringify(a.S.log[1].entries)), [{ ex: "leg_press", sets: [{ kg: 60, reps: 10 }, { kg: 0, reps: 8 }] }]);
  // these walked every entry and crashed on the broken ones before
  assert.equal(a.lastTrained().quads, 1760100000000);
  assert.equal(a.lastEntry("leg_press").sets.length, 2);
});

test("history is kept in time order", () => {
  const saved = { ...OLD_SAVE, log: [{ ts: 3e12, day: "pull", entries: [] }, { ts: 2e12, day: "push", entries: [] }] };
  const a = app(fakeStorage({ "train-today-v1": JSON.stringify(saved) }));
  a.load();
  assert.deepEqual([...a.S.log].map((s) => s.day), ["push", "pull"]);
});

// Simulate the clock: Date.now() inside the sandbox returns `now`.
function withClock(a) {
  const clock = { now: Date.now() };
  a.Date = class extends Date { static now() { return clock.now; } };
  return clock;
}

test("saving other things does not keep an old draft alive", () => {
  const storage = fakeStorage();
  const a = app(storage);
  const clock = withClock(a);
  a.rebuildEx();
  a.S.draft = { chest_press: [{ kg: 25, reps: 12, done: false }] };
  a.tickSet("chest_press", 0);
  a.save();
  const tickedAt = JSON.parse(storage.getItem("train-today-v1")).draftTs;
  clock.now += 10 * 36e5; // 10 h later the user logs food, a run, etc.
  a.save();
  assert.equal(JSON.parse(storage.getItem("train-today-v1")).draftTs, tickedAt, "save() alone must not move draftTs");
  clock.now += 3 * 36e5; // 13 h after the last tick
  const b = app(storage);
  b.Date = a.Date;
  b.load();
  assert.deepEqual(JSON.parse(JSON.stringify(b.S.draft)), {});
});

test("typing or ticking moves draftTs; a blocked tick does not", () => {
  const a = app();
  const clock = withClock(a);
  a.rebuildEx();
  a.S.draft = { chest_press: [{ kg: "", reps: "", done: false }] };
  assert.equal(a.tickSet("chest_press", 0), "ใส่น้ำหนักและจำนวนครั้งก่อนกด ✓");
  assert.equal(a.S.draftTs, 0);
  clock.now = 1000;
  a.editSet("chest_press", 0, "kg", "20");
  assert.equal(a.S.draftTs, 1000);
  clock.now = 2000;
  a.editSet("chest_press", 0, "reps", "12");
  clock.now = 3000;
  assert.equal(a.tickSet("chest_press", 0), "");
  assert.equal(a.S.draftTs, 3000);
  assert.equal(a.S.draft.chest_press[0].done, true);
});

test("a draft kept alive by recent typing survives a reload", () => {
  const storage = fakeStorage();
  const a = app(storage);
  const clock = withClock(a);
  a.rebuildEx();
  a.S.draft = { chest_press: [{ kg: 25, reps: 12, done: false }] };
  a.tickSet("chest_press", 0);
  clock.now += 11 * 36e5;
  a.editSet("chest_press", 0, "reps", "11"); // still working out
  a.save();
  clock.now += 2 * 36e5; // 13 h after the first tick, 2 h after the last edit
  const b = app(storage);
  b.Date = a.Date;
  b.load();
  assert.equal(b.S.draft.chest_press[0].reps, "11");
  assert.equal(b.S.draftTs, clock.now - 2 * 36e5);
});

test("a broken draft in storage does not break loading", () => {
  const saved = { ...OLD_SAVE, draft: { chest_press: "oops", leg_press: [null, 5, { kg: {}, reps: 8, done: 1 }] }, draftTs: Date.now() };
  const a = app(fakeStorage({ "train-today-v1": JSON.stringify(saved) }));
  a.load();
  assert.equal(a.S.draft.chest_press, undefined);
  assert.equal(a.S.draft.leg_press.length, 1);
  assert.equal(a.S.draft.leg_press[0].reps, "8");
  assert.equal(a.S.draft.leg_press[0].done, true);
  assert.equal(a.S.log.length, 1);
});

test("delete all data really deletes everything, keeps the language and own key (TASKS 10)", () => {
  const storage = fakeStorage({ "train-today-v1": JSON.stringify(OLD_SAVE), "kryvos-lang": "en", "train-today-gemini-key": "k".repeat(39) });
  const a = app(storage);
  a.load();
  assert.equal(a.S.custom.length, 1);
  a.wipe();
  const saved = JSON.parse(storage.getItem("train-today-v1"));
  a.S = a.blankState(); a.load(); // a fresh page load reads what was saved
  for (const k of ["log", "custom", "seen", "off", "food", "weights", "runs"]) assert.equal(a.S[k].length, 0, k);
  assert.equal(a.S.scanned, false);
  assert.equal(a.S.summary, null);
  assert.equal(a.S.shoe, null);
  assert.deepEqual({ ...a.S.prefs }, { rest: 90, kcal: 2800, protein: null, goalKg: null, goal: "gain" });
  assert.equal(saved.onboarded, true, "the welcome screens are not shown again");
  assert.equal(storage.getItem("kryvos-lang"), "en");
  assert.equal(storage.getItem("train-today-gemini-key").length, 39);
  assert.equal(a.EX.length, 2, "only the built-in exercises are left");
});

test("removing an AI exercise hides it: history and recovery still know it (TASKS 11)", () => {
  const save = { ...OLD_SAVE, log: OLD_SAVE.log.concat([{ ts: Date.now() - 36e5, day: "legs", energy: "ok", entries: [{ ex: "c_abc_0", sets: [{ kg: 40, reps: 10 }] }] }]), today: { day: "", skip: [], add: [] } };
  const storage = fakeStorage({ "train-today-v1": JSON.stringify(save) });
  const a = app(storage);
  a.load();
  a.S.seen.push("c_abc_0"); a.S.today.add.push("c_abc_0");
  a.hideCustom("c_abc_0"); a.save();
  assert.equal(a.EX.some((e) => e.id === "c_abc_0"), false, "no longer offered");
  assert.equal(a.EXBY.c_abc_0.name, "สมิธสควอท (สมิธแมชชีน)", "name still known for history");
  assert.ok(a.lastTrained().quads, "its sets still count for recovery");
  assert.equal(a.S.seen.includes("c_abc_0"), false);
  assert.equal(a.S.today.add.includes("c_abc_0"), false);
  // and after a reload
  const b = app(storage); b.load();
  assert.equal(b.S.custom[0].hidden, true);
  assert.equal(b.EX.some((e) => e.id === "c_abc_0"), false);
  assert.ok(b.EXBY.c_abc_0);
});

test("old saves without the hidden flag load as visible", () => {
  const a = app(fakeStorage({ "train-today-v1": JSON.stringify(OLD_SAVE) }));
  a.load();
  assert.equal(a.S.custom[0].hidden, undefined);
  assert.ok(a.EX.some((e) => e.id === "c_abc_0"));
});

test("scanning a removed AI exercise again brings the same one back instead of a copy", () => {
  const hidden = { id: "c_abc_0", name: "สมิธสควอท (สมิธแมชชีน)", day: "legs", m: ["quads"], j: ["knee"], t: "kg", ai: true, hidden: true };
  const v = load(["validate", "cleanEn"], {
    S: { custom: [hidden] }, EX: [{ id: "leg_press", name: "เลกเพรส" }], EXBY: { leg_press: {}, c_abc_0: hidden },
    DAYS: { legs: {} }, MUSCLES: { quads: 1 }, JOINTS: { knee: 1 }
  });
  const r = v.validate({ equipment: [{ label_th: "สมิธ", known: ["c_abc_0", "leg_press"] }], new_exercises: [{ name_th: "สมิธสควอท (สมิธแมชชีน)", day: "legs", muscles: ["quads"], joints: ["knee"] }] });
  assert.deepEqual([...r.equipment[0].ids], ["leg_press"], "a hidden id is not offered as known");
  assert.equal(r.fresh[0].back, "c_abc_0");
});

// TASKS 14: two tabs share one storage. Each test is one tab saving, then the other tab hearing about it.
function twoTabs() {
  const storage = fakeStorage({ "train-today-v1": JSON.stringify(OLD_SAVE) });
  const a = app(storage), b = app(storage);
  a.load(); b.load();
  return { storage, a, b };
}

test("another tab's save is picked up, so this tab no longer writes old data over it", () => {
  const { storage, a, b } = twoTabs();
  b.S.food.push({ ts: Date.now(), name: "ไข่ต้ม", kcal: 76, p: 6 }); b.save();
  a.syncFromOtherTab();
  assert.equal(a.S.food.length, 2);
  a.S.weights.push({ ts: Date.now(), kg: 60 }); a.save(); // tab A saves later: B's meal must survive
  const d = JSON.parse(storage.getItem("train-today-v1"));
  assert.equal(d.food.length, 2);
  assert.equal(d.weights.length, 2);
});

test("sets being typed or ticked in this tab are kept when the other tab's draft is older", () => {
  const { a, b } = twoTabs();
  b.S.draft = { leg_press: [{ kg: "50", reps: "10", done: true, ed: true }] }; b.S.draftTs = Date.now() - 60000;
  b.S.food.push({ ts: Date.now(), name: "นม", kcal: 130, p: 7 }); b.save();
  a.S.draft = { chest_press: [{ kg: "30", reps: "12", done: true, ed: true }] }; a.S.draftTs = Date.now();
  assert.equal(a.syncFromOtherTab(), true, "this tab's draft won, so it is saved back");
  assert.deepEqual(Object.keys(a.S.draft), ["chest_press"]);
  assert.equal(a.S.food.length, 2, "the rest still comes from the other tab");
});

test("the other tab's newer draft wins over this tab's older one", () => {
  const { a, b } = twoTabs();
  a.S.draft = { chest_press: [{ kg: "30", reps: "12", done: true, ed: true }] }; a.S.draftTs = Date.now() - 60000;
  b.S.draft = { leg_press: [{ kg: "50", reps: "10", done: true, ed: true }] }; b.S.draftTs = Date.now(); b.save();
  assert.equal(a.syncFromOtherTab(), false);
  assert.deepEqual(Object.keys(a.S.draft), ["leg_press"]);
  assert.equal(a.S.draft.leg_press[0].done, true);
});

test("a tab with nothing typed takes the other tab's draft", () => {
  const { a, b } = twoTabs();
  b.S.draft = { leg_press: [{ kg: "50", reps: "10", done: false, ed: true }] }; b.S.draftTs = Date.now(); b.save();
  a.syncFromOtherTab();
  assert.equal(a.S.draft.leg_press[0].kg, "50");
});

test("import restores body details, shoes and shoe finder answers, and drops the old AI summary", () => {
  const a = app();
  a.load();
  Object.assign(a, { confirm: () => true, renderAll: () => {}, DATA_WORDS: {} });
  a.S.summary = { ts: 1, text: "old", tips: [] };
  const backup = { ...OLD_SAVE, profile: { sex: "f", age: 30, h: 165, act: 1.725 }, shoe: { name: "Pegasus 42", ts: 1760000000000, base: 120 },
    shoeQ: { use: "race", sex: "f", width: "wide", arch: "flat", budget: 9000 }, app: "train-today", v: 3 };
  a.importBackup(JSON.stringify(backup));
  assert.deepEqual({ ...a.S.profile }, backup.profile);
  assert.equal(a.S.shoe.name, "Pegasus 42");
  assert.equal(a.S.shoe.base, 120);
  assert.equal(a.S.shoeQ.use, "race");
  assert.equal(a.S.summary, null);
});

test("importing an older backup without body details keeps the current ones", () => {
  const a = app();
  a.load();
  Object.assign(a, { confirm: () => true, renderAll: () => {}, DATA_WORDS: {} });
  a.S.profile = { sex: "m", age: 20, h: 175, act: 1.55 };
  a.importBackup(JSON.stringify(OLD_SAVE));
  assert.equal(a.S.profile.age, 20);
});
