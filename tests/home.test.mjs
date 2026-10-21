import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./app.mjs";

test("Today nutrition counts today's food only, uses the protein goal and caps remaining kcal at zero", () => {
  const now = new Date(2026, 9, 14, 12).getTime();
  const a = load(["todayTotals", "sameDay", "dayKey"], {
    S: { food: [{ ts: now, kcal: 400.4, p: 25.4 }, { ts: now, kcal: 600, p: 35 }, { ts: now - 864e5, kcal: 2000, p: 150 }], prefs: { kcal: 1800, rest: 90 } },
    proteinTarget: () => 120, current: { items: [{ sets: 3 }, { sets: 2 }] }
  });
  assert.deepEqual({ ...a.todayTotals(now) }, { eaten: 1000, protein: 60, left: 800, proteinGoal: 120, exercises: 2, sets: 5, minutes: 16 });
  a.S.prefs.kcal = 900;
  assert.equal(a.todayTotals(now).left, 0);
  a.current = { rest: true };
  assert.equal(a.todayTotals(now).minutes, 0);
});

test("Today recovery uses actual logged muscle timestamps and never labels soreness or pain as ready", () => {
  const now = Date.now();
  const a = load(["recoveryRows"], {
    MUSCLES: { chest: "chest", back: "back", quads: "quads", calves: "calves", core: "core" }, RECOVER_H: 48,
    lastTrained: () => ({ chest: now - 24 * 36e5, back: now - 72 * 36e5, core: now + 36e5 }),
    bodyState: (kind, muscle) => ({ quads: "sore", calves: "pain" })[muscle]
  });
  const rows = a.recoveryRows(now);
  assert.deepEqual(Array.from(rows, row => [row.pct, row.status]), [[50, "recovering"], [100, "ready"], [100, "sore"], [100, "pain"], [0, "recovering"]]);
});

test("Today's seven days center today even on Monday and across a year boundary", () => {
  const now = new Date(2027, 0, 1, 12).getTime();
  const yesterday = new Date(2026, 11, 31, 18).getTime();
  const a = load(["todayWeekActivity", "sameDay", "dayKey"], { S: { log: [{ ts: yesterday, day: "push" }, { ts: yesterday + 36e5, day: "pull" }], runs: [{ ts: yesterday, km: 5 }] } });
  const days = a.todayWeekActivity(now);
  assert.equal(days.length, 7);
  assert.equal(days[3].today, true);
  assert.equal(new Date(days[0].ts).getFullYear(), 2026);
  assert.equal(days[2].lift, "pull");
  assert.equal(days[2].run, true);
  assert.equal(days[4].future, true);
  const monday = a.todayWeekActivity(new Date(2026, 9, 12, 9).getTime());
  assert.equal(new Date(monday[3].ts).getDay(), 1);
});

test("Today section switching hides only panels and keeps existing workout inputs intact", () => {
  const nodes = {}, calls = [];
  const a = load(["setTodaySection"], { $: id => nodes[id] ||= {}, pressed: (id, value) => calls.push([id, value]), todaySection: "plan" });
  a.setTodaySection("meals");
  assert.equal(nodes["today-plan"].hidden, true);
  assert.equal(nodes["today-meals-panel"].hidden, false);
  assert.equal(nodes["today-recovery-panel"].hidden, true);
  a.setTodaySection("recovery");
  assert.equal(nodes["today-recovery-panel"].hidden, false);
  assert.deepEqual(calls, [["today-sections", "meals"], ["today-sections", "recovery"]]);
});

test("week buttons show past rest/workout icons, centered today and future dates without using timer's rest class", () => {
  const now = new Date(2026, 9, 14, 12).getTime();
  const a = load(["weekLabel", "weekStripHtml", "todayWeekActivity", "sameDay", "dayKey"], {
    S: { log: [{ ts: now - 864e5, day: "push" }], runs: [{ ts: now - 864e5 }] },
    DAYS: { push: { name: "PUSH" } }, LOCALE: "en-GB", esc: value => value
  }, ["DAY_ICON"]);
  const markup = a.weekStripHtml(now);
  assert.equal((markup.match(/data-history-day=/g) || []).length, 7);
  assert.equal((markup.match(/ disabled/g) || []).length, 3);
  assert.match(markup, /dot restday/);
  assert.doesNotMatch(markup, /class="dot rest"/);
  assert.match(markup, /dot push/);
  assert.match(markup, /class="rd"/);
  assert.match(markup, /aria-current="date"/);
  assert.match(markup, />15<\/span>/);
});

test("empty week has three past rest icons, today's date and three disabled future dates", () => {
  const now = new Date(2026, 9, 14, 12).getTime();
  const a = load(["weekLabel", "weekStripHtml", "todayWeekActivity", "sameDay", "dayKey"], {
    S: { log: [], runs: [] }, DAYS: {}, LOCALE: "en-GB", esc: value => value
  }, ["DAY_ICON"]);
  const markup = a.weekStripHtml(now);
  assert.equal((markup.match(/dot restday/g) || []).length, 3);
  assert.equal((markup.match(/ disabled/g) || []).length, 3);
  assert.equal((markup.match(/aria-current="date"/g) || []).length, 1);
  assert.match(markup, />14<\/span>/);
  assert.doesNotMatch(markup, /dot (push|pull|legs|run)/);
});
