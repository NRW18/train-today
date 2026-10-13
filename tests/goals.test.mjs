// Weight goal, calorie target and shoe finder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { load, html } from "./app.mjs";

const SHOES = new Function("t", "return " + html.match(/var SHOES = (\[[\s\S]*?\n  \]);/)[1])((x) => x);

test("energy plan: Mifflin-St Jeor with goal surplus/deficit", () => {
  const a = load(["energyPlan"], {}, ["GOAL_KCAL", "PROTEIN_PER_KG"]);
  const pf = { sex: "m", age: 18, h: 175, act: 1.55 };
  const keep = a.energyPlan(pf, 60, "keep"); // BMR = 600 + 1093.75 - 90 + 5 = 1608.75
  assert.equal(keep.bmr, 1609);
  assert.equal(keep.kcal, 2490);
  assert.equal(a.energyPlan(pf, 60, "gain").kcal, 2790);
  assert.equal(a.energyPlan(pf, 60, "lose").kcal, 1990);
  assert.equal(a.energyPlan(pf, 60, "lose").p, 120); // 2.0 g/kg when cutting
  assert.equal(a.energyPlan({ ...pf, sex: null }, 60, "keep"), null);
});

test("a deficit never goes below resting energy or the floor", () => {
  const a = load(["energyPlan"], {}, ["GOAL_KCAL", "PROTEIN_PER_KG"]);
  const small = { sex: "f", age: 30, h: 150, act: 1.375 }; // BMR ~1086, TDEE ~1493
  assert.equal(a.energyPlan(small, 45, "lose").kcal, 1200);
});

function trendApp(goal, weights, goalKg = null) {
  return load(["weightTrend", "weightRate", "latestWeight", "goalReached", "r1"], { S: { prefs: { goal, goalKg }, weights } });
}
const day = 864e5, now = Date.now();
const series = (start, perWeek) => [0, 7, 14, 21].map((d) => ({ ts: now - (21 - d) * day, kg: +(start + perWeek * d / 7).toFixed(2) }));

test("losing: steady loss is praised, too fast warns, gaining says cut", () => {
  assert.match(trendApp("lose", series(80, -0.5)).weightTrend(), /ลงกำลังดี/);
  assert.match(trendApp("lose", series(80, -1.5)).weightTrend(), /ลงเร็วเกินไป/);
  assert.match(trendApp("lose", series(80, 0.3)).weightTrend(), /น้ำหนักยังขึ้น/);
  assert.match(trendApp("lose", series(80, -0.5), 79).weightTrend(), /ถึงน้ำหนักเป้าหมายแล้ว/);
});

test("gaining and keeping still work", () => {
  assert.match(trendApp("gain", series(60, 0.3)).weightTrend(), /ขึ้นกำลังดี/);
  assert.match(trendApp("keep", series(60, 0.05)).weightTrend(), /คงที่ดี/);
  assert.match(trendApp("keep", series(60, 0.5)).weightTrend(), /น้ำหนักขึ้น/);
});

function finder(q, ctx) {
  const a = load(["pickShoes"], { SHOES, SHOE_USE: { daily: "ซ้อมทั่วไป", cushion: "นุ่ม", speed: "ซ้อมเร็ว", race: "แข่ง", trail: "เทรล" } });
  return a.pickShoes(q, ctx);
}
const base = { use: "daily", sex: "m", width: "normal", arch: "normal", budget: 6500 };

test("shoe finder never shows a pick over budget", () => {
  for (const use of ["daily", "cushion", "speed", "race", "trail"]) for (const budget of [2000, 4000, 6500, 10000]) {
    const r = finder({ ...base, use, budget }, {});
    r.picks.forEach((x) => assert.ok(x.s.p <= budget, x.s.n + " over " + budget));
  }
});

test("flat feet get a stability shoe on top; wide feet get a wide model", () => {
  assert.ok(finder({ ...base, arch: "flat" }, {}).picks[0].s.st);
  assert.ok(finder({ ...base, width: "wide" }, {}).picks[0].s.w);
});

test("a mid budget gets proven trainers, not just the cheapest", () => {
  const top = finder(base, {}).picks[0].s;
  assert.ok(top.r >= 3 && top.p >= 4500, top.n);
});

test("budget too low: no picks, but the nearest model is offered", () => {
  const r = finder({ ...base, use: "race", budget: 3000 }, {});
  assert.equal(r.picks.length, 0);
  assert.ok(r.nearest && r.nearest.s.p > 3000);
});

test("saving the goal numbers keeps the chosen goal and rest time", () => {
  const a = load(["withGoals", "cleanPrefs"]);
  const p = a.withGoals({ rest: 120, kcal: 2800, protein: null, goalKg: null, goal: "lose" }, 2000, 130, 65);
  assert.equal(p.goal, "lose");
  assert.equal(p.rest, 120);
  assert.equal(p.kcal, 2000);
  assert.equal(p.goalKg, 65);
  assert.equal(a.withGoals({ rest: 90, kcal: 2500, goal: "keep" }, null, null, null).kcal, 2500, "empty calories keep the old target");
});
