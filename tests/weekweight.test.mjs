// "Body weight 7 days" starts from a weighing no older than 14 days, and says which date (TASKS 15).
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./app.mjs";

const D = 864e5, now = Date.now();
function stats(weights) {
  const a = load(["weekStats", "r1", "r2", "sameDay", "dayKey"], {
    S: { log: [], runs: [], food: [], weights, prefs: { kcal: 2800, goalKg: null } },
    ALL_EX: [], proteinTarget: () => 120
  });
  return a.weekStats();
}

test("a weighing from 3 months ago is not used as the start", () => {
  const w = stats([{ ts: now - 90 * D, kg: 70 }, { ts: now - 3 * D, kg: 60 }, { ts: now - 1 * D, kg: 60.4 }]);
  assert.equal(w.weightFrom, 60);
  assert.equal(w.weightTo, 60.4);
  assert.equal(w.weightFromTs, now - 3 * D);
});

test("a weighing 10 days ago is still the start", () => {
  const w = stats([{ ts: now - 10 * D, kg: 59 }, { ts: now - 1 * D, kg: 60 }]);
  assert.equal(w.weightFrom, 59);
  assert.equal(w.weightFromTs, now - 10 * D);
});

test("one weighing is not a change", () => {
  const w = stats([{ ts: now - 90 * D, kg: 70 }, { ts: now - 1 * D, kg: 60 }]);
  assert.equal(w.weightFrom, null);
  assert.equal(w.weightTo, null);
  assert.equal(w.weighIns, 1);
});
