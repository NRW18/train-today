// Tests for ticking sets and the next weight suggestion. Run: node --test "tests/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./app.mjs";

function app(log = []) {
  return load(["setMissing", "suggest", "lastEntry", "num", "unit"], { S: { log }, HI: 12, LO: 8, STEP: 2.5 });
}
const KG = { id: "chest_press", t: "kg" }, SEC = { id: "plank", t: "sec" }, REPS = { id: "pushup", t: "reps" };

test("cannot tick a weighted set without a weight", () => {
  const a = app();
  assert.equal(a.setMissing(KG, { kg: "", reps: 12 }), "ใส่น้ำหนัก (กก.) ก่อนกด ✓");
  assert.equal(a.setMissing(KG, { kg: "0", reps: 12 }), "ใส่น้ำหนัก (กก.) ก่อนกด ✓");
  assert.equal(a.setMissing(KG, { kg: "", reps: "" }), "ใส่น้ำหนักและจำนวนครั้งก่อนกด ✓");
  assert.equal(a.setMissing(KG, { kg: "25", reps: "" }), "ใส่จำนวนครั้งก่อนกด ✓");
  assert.equal(a.setMissing(KG, { kg: "22.5", reps: "10" }), "");
  assert.equal(a.setMissing(KG, { kg: 25, reps: 12 }), "");
});

test("bodyweight and timed sets need no weight", () => {
  const a = app();
  assert.equal(a.setMissing(REPS, { kg: "", reps: 10 }), "");
  assert.equal(a.setMissing(SEC, { kg: "", reps: 30 }), "");
  assert.equal(a.setMissing(SEC, { kg: "", reps: "" }), "ใส่จำนวนวินาทีก่อนกด ✓");
});

test("old sets saved at 0 kg give the first-time tip, not 'add 2.5 kg to 0'", () => {
  const a = app([{ ts: 1, day: "push", entries: [{ ex: "chest_press", sets: [{ kg: 0, reps: 12 }, { kg: 0, reps: 12 }] }] }]);
  const s = a.suggest(KG, false);
  assert.equal(s.kg, "");
  assert.match(s.tip, /^ครั้งแรก/);
});

test("real weights still progress as before", () => {
  const a = app([{ ts: 1, day: "push", entries: [{ ex: "chest_press", sets: [{ kg: 25, reps: 12 }, { kg: 25, reps: 12 }] }] }]);
  const s = a.suggest(KG, false);
  assert.equal(s.kg, 27.5);
  assert.equal(s.reps, 8);
});
