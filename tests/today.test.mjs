// Today tab: the set meter, the save button label and the folded check-in summary.
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./app.mjs";

function app(draft, body = {}) {
  const items = [{ e: { id: "a" }, sets: 3 }, { e: { id: "b" }, sets: 2 }];
  return load(["setsDone", "progress", "meterText", "finishLabel", "ciSummary"], {
    S: { draft, slot: "any", energy: "ok", body },
    current: { items },
    MUSCLES: { chest: "อก", quads: "ต้นขาหน้า" }, JOINTS: { knee: "เข่า" }
  }, ["SLOT_TH", "ENERGY_TH"]);
}

test("nothing ticked: meter explains what to do, save button has no count", () => {
  const a = app({ a: [{ done: false }, { done: false }, { done: false }], b: [{ done: false }, { done: false }] });
  assert.deepEqual({ ...a.progress() }, { done: 0, total: 5 });
  assert.match(a.meterText(a.progress()), /5 เซ็ต กด ✓/);
  assert.equal(a.finishLabel(), "บันทึกการซ้อม");
});

test("some ticked: counts sets across exercises", () => {
  const a = app({ a: [{ done: true }, { done: true }, { done: false }], b: [{ done: true }, { done: false }] });
  assert.equal(a.finishLabel(), "บันทึกการซ้อม (3/5 เซ็ต)");
  assert.match(a.meterText(a.progress()), /เหลือ 2 เซ็ต/);
});

test("all ticked: tells the user to save", () => {
  const a = app({ a: [{ done: true }, { done: true }, { done: true }], b: [{ done: true }, { done: true }] });
  assert.match(a.meterText(a.progress()), /ครบแล้ว/);
});

test("check-in summary lists sore and painful parts, or asks", () => {
  assert.match(app({}).ciSummary(), /เมื่อยหรือเจ็บตรงไหน/);
  const s = app({}, { "m:chest": "sore", "j:knee": "pain" }).ciSummary();
  assert.match(s, /class="sore">เมื่อย อก/);
  assert.match(s, /class="pain">เจ็บ เข่า/);
});
