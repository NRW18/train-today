// Tests that replacing the user's data always asks first and says what will be lost.
// Run: node --test "tests/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./app.mjs";

function app(S, answer) {
  const asked = [], toasts = [];
  const ctx = load(["dataList", "draftTicked", "useSample", "sample"], {
    S, BASE_EX: [{ id: "chest_press", day: "push", t: "kg" }, { id: "leg_press", day: "legs", t: "kg" }], STEP: 2.5,
    confirm: (msg) => { asked.push(msg); return answer; },
    save: () => {}, renderAll: () => {}, toast: (t) => toasts.push(t)
  }, ["DATA_WORDS"]);
  ctx.asked = asked;
  ctx.toasts = toasts;
  return ctx;
}
function emptyS() { return { log: [], runs: [], food: [], weights: [], custom: [], draft: {} }; }

test("sample data on an empty app does not ask", () => {
  const a = app(emptyS(), false);
  a.useSample();
  assert.equal(a.asked.length, 0);
  assert.equal(a.S.log.length, 6);
});

test("sample data asks even with no workouts, and names what would be lost", () => {
  const S = emptyS();
  S.food = [{ ts: 1, name: "ข้าว", kcal: 500, p: 20 }, { ts: 2, name: "ไข่", kcal: 80, p: 6 }];
  S.weights = [{ ts: 1, kg: 59 }];
  const a = app(S, false);
  a.useSample();
  assert.equal(a.asked.length, 1);
  assert.match(a.asked[0], /อาหาร 2 รายการ/);
  assert.match(a.asked[0], /น้ำหนักตัว 1 ครั้ง/);
  assert.doesNotMatch(a.asked[0], /การซ้อม/); // nothing to lose there, so not listed
  assert.equal(a.S.food.length, 2, "cancel keeps the data");
});

test("sample data mentions ticked sets that are not saved yet", () => {
  const S = emptyS();
  S.draft = { chest_press: [{ kg: 25, reps: 12, done: true }] };
  const a = app(S, false);
  a.useSample();
  assert.match(a.asked[0], /เซ็ตที่ติ๊กไว้แต่ยังไม่กดบันทึก/);
});

// ---- importing a backup ----
const IMPORT_FNS = ["dataList", "draftTicked", "importBackup", "strList", "cleanGuide", "cleanCustom", "okTs", "cleanFood", "cleanW",
  "cleanRuns", "cleanLog", "cleanPrefs", "rebuildEx"];
function importer(S, answer) {
  const asked = [], toasts = [];
  const ctx = load(IMPORT_FNS, {
    S, DAYS: { push: {}, pull: {}, legs: {} }, MUSCLES: { chest: 1, quads: 1 }, JOINTS: { knee: 1 },
    BASE_EX: [{ id: "chest_press" }, { id: "leg_press" }], EX: [], EXBY: {},
    confirm: (msg) => { asked.push(msg); return answer; },
    save: () => {}, renderAll: () => {}, toast: (t) => toasts.push(t)
  }, ["DATA_WORDS"]);
  ctx.rebuildEx();
  ctx.asked = asked;
  ctx.toasts = toasts;
  return ctx;
}
const BACKUP = JSON.stringify({
  app: "train-today", v: 3,
  log: [{ ts: 1760000000000, day: "push", entries: [{ ex: "chest_press", sets: [{ kg: 25, reps: 12 }] }] },
    { ts: 1760100000000, day: "legs", entries: [{ ex: "leg_press", sets: [{ kg: 60, reps: 10 }] }] }],
  off: ["leg_press"], seen: [], custom: [], food: [{ ts: 1760000000000, name: "ข้าว", kcal: 500, p: 20 }], weights: [], runs: []
});

test("import into an empty app does not ask", () => {
  const a = importer(emptyS(), false);
  a.importBackup(BACKUP);
  assert.equal(a.asked.length, 0);
  assert.equal(a.S.log.length, 2);
  assert.equal(a.toasts[0], "นำเข้า 2 ครั้งแล้ว");
});

test("import over existing data asks, says what is lost and what is in the file", () => {
  const S = emptyS();
  S.log = [{ ts: 1, day: "pull", entries: [] }, { ts: 2, day: "push", entries: [] }, { ts: 3, day: "legs", entries: [] }];
  S.custom = [{ id: "c_x_0", name: "ท่าใหม่", day: "legs", m: ["quads"], j: ["knee"], t: "kg", ai: true }];
  S.off = [];
  const a = importer(S, false);
  a.importBackup(BACKUP);
  assert.equal(a.asked.length, 1);
  const msg = a.asked[0];
  assert.match(msg, /จะหาย: การซ้อม 3 ครั้ง, ท่าที่ AI เพิ่ม 1 ท่า/);
  assert.match(msg, /ในไฟล์มี: การซ้อม 2 ครั้ง, อาหาร 1 รายการ/);
  assert.match(msg, /เครื่องที่เปิดหรือปิดไว้/);
  // cancelled: nothing changed
  assert.equal(a.S.log.length, 3);
  assert.equal(a.S.custom.length, 1);
  assert.equal(a.S.off.length, 0);
  assert.equal(a.toasts.length, 0);
});

test("import replaces after OK", () => {
  const S = emptyS();
  S.weights = [{ ts: 1, kg: 60 }];
  const a = importer(S, true);
  a.importBackup(BACKUP);
  assert.match(a.asked[0], /น้ำหนักตัว 1 ครั้ง/);
  assert.equal(a.S.log.length, 2);
  assert.equal(a.S.weights.length, 0);
  assert.deepEqual([...a.S.off], ["leg_press"]);
});

test("a file that is not a backup changes nothing and does not ask", () => {
  const S = emptyS();
  S.log = [{ ts: 1, day: "pull", entries: [] }];
  const a = importer(S, true);
  a.importBackup("{not json");
  a.importBackup(JSON.stringify({ hello: 1 }));
  assert.equal(a.asked.length, 0);
  assert.equal(a.S.log.length, 1);
  assert.equal(a.toasts[1], "ไฟล์นี้ไม่ใช่ไฟล์สำรองของแอป");
});

test("sample data replaces after OK", () => {
  const S = emptyS();
  S.log = [{ ts: 1, day: "push", entries: [] }];
  S.runs = [{ ts: 1, km: 3, min: 20 }];
  const a = app(S, true);
  a.useSample();
  assert.match(a.asked[0], /การซ้อม 1 ครั้ง/);
  assert.match(a.asked[0], /การวิ่ง 1 ครั้ง/);
  assert.equal(a.S.log.length, 6);
  assert.equal(a.toasts[0], "ใส่ข้อมูลตัวอย่างแล้ว");
});
