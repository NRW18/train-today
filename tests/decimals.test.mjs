// Weights with decimals show cleanly in the per-exercise graph and the weekly summary (TASKS 13).
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./app.mjs";

function page() {
  const els = {};
  const $ = (id) => (els[id] = els[id] || { innerHTML: "", hidden: false });
  return { els, $ };
}

test("graph label: 10.1 kg then 10.4 kg shows +0.3, not +0.30000000000000004", () => {
  const { els, $ } = page();
  const S = { log: [
    { ts: 1, day: "push", entries: [{ ex: "a", sets: [{ kg: 10.1, reps: 12 }] }] },
    { ts: 2, day: "push", entries: [{ ex: "a", sets: [{ kg: 10.4, reps: 12 }] }] }], runs: [] };
  const a = load(["renderHistory", "r2", "fmtDate", "fmtTime", "spark", "pace"], {
    S, $, ALL_EX: [{ id: "a", name: "A", t: "kg" }], EXBY: { a: { id: "a", name: "A", t: "kg" } },
    DAYS: { push: { name: "PUSH" } }, RUN_TYPES: {}, renderWeek: () => {}, esc: String
  });
  a.renderHistory();
  assert.match(els.progress.innerHTML, /\+0\.3 กก\./);
  assert.doesNotMatch(els.progress.innerHTML, /0000/);
});

test("quarter-kg plates are kept", () => {
  const a = load(["r2"]);
  assert.equal(a.r2(11.25 - 10), 1.25);
  assert.equal(a.r2(10.4 - 10.1), 0.3);
});
