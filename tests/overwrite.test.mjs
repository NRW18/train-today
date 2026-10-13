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
