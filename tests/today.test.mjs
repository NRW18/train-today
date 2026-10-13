// Today tab: the set meter, the save button label and the folded check-in summary.
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./app.mjs";

function app(draft, body = {}) {
  const items = [{ e: { id: "a" }, sets: 3 }, { e: { id: "b" }, sets: 2 }];
  return load(["setsDone", "progress", "meterText", "finishLabel", "capValue", "bodyState"], {
    S: { draft, slot: "any", energy: "ok", body },
    current: { items },
    MUSCLES: { chest: "อก", quads: "ต้นขาหน้า" }, JOINTS: { knee: "เข่า" }
  });
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

test("check-in capsules show the sore and painful parts, or ask to choose", () => {
  assert.match(app({}).capValue("m"), /แตะเพื่อเลือก/);
  const a = app({}, { "m:chest": "sore", "j:knee": "pain" });
  assert.match(a.capValue("m"), /class="tag sore">อก<span class="st">เมื่อย/);
  assert.doesNotMatch(a.capValue("m"), /เข่า/);
  assert.match(a.capValue("j"), /class="tag pain">เข่า<span class="st">เจ็บ/);
});

// Design: "Your Activity" strip, this week Monday to Sunday.
test("week strip: workout and run per day, today, days still to come", () => {
  const mon = new Date(2026, 9, 12, 0, 0, 0).getTime(), H = 36e5; // Monday 12 Oct 2026
  const now = mon + 2 * 24 * H + 9 * H; // Wednesday 09:00
  const a = load(["weekActivity", "weekStart", "sameDay", "dayKey"], {
    S: { log: [{ ts: mon + 18 * H, day: "push" }, { ts: mon + 24 * H + 18 * H, day: "legs" }], runs: [{ ts: mon + 24 * H + 7 * H, km: 5, min: 30 }] }
  });
  const w = a.weekActivity(now);
  assert.equal(w.length, 7);
  assert.equal(new Date(w[0].ts).getDay(), 1, "starts on Monday");
  assert.deepEqual([w[0].lift, w[0].run], ["push", false]);
  assert.deepEqual([w[1].lift, w[1].run], ["legs", true], "Tuesday: legs and a run");
  assert.deepEqual([w[2].lift, w[2].run, w[2].today], [null, false, true]);
  assert.equal(w[3].future, true);
  assert.equal(w[2].future, false);
});

test("scan sheet lists exercises the AI is surest of first, then new ones", () => {
  const a = load(["shotItems"]);
  const items = a.shotItems({
    equipment: [{ ids: ["leg_curl"], conf: 0.4 }, { ids: ["leg_extension", "leg_curl"], conf: 0.9 }],
    fresh: [{ name: "สมิธสควอท" }]
  });
  assert.deepEqual([...items.map((x) => x.id || x.fresh.name)], ["leg_extension", "leg_curl", "สมิธสควอท"]);
  assert.equal(items[1].conf, 0.9, "listed once, with the surer confidence");
});
