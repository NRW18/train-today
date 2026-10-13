// Tests for saving and loading user data (index.html "state"). Run: node --test "tests/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./app.mjs";

const STATE_FNS = ["strList", "cleanGuide", "cleanCustom", "cleanDraft", "okTs", "cleanFood", "cleanW", "cleanRuns", "cleanLog", "cleanPrefs",
  "load", "snapshot", "save", "rebuildEx", "dayKey", "lastTrained", "lastEntry", "hoursSince", "editSet", "tickSet", "setMissing", "num"];

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
    S: freshS(), localStorage: storage, KEY: "train-today-v1", DRAFT_TTL: 12 * 36e5,
    DAYS: { push: {}, pull: {}, legs: {} }, MUSCLES: { chest: 1, back: 1, quads: 1 }, JOINTS: { shoulder: 1, knee: 1 },
    BASE_EX: [{ id: "chest_press", m: ["chest"], t: "kg" }, { id: "leg_press", m: ["quads"], t: "kg" }], EX: [], EXBY: {},
    toast: (t) => toasts.push(t)
  });
  ctx.toasts = toasts;
  ctx.storage = storage;
  return ctx;
}

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
