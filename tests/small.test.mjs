// Small fixes from TASKS 16.
import { test } from "node:test";
import assert from "node:assert/strict";
import { load, html } from "./app.mjs";

test("run note has a space: \"5 ชม. ที่แล้ว\"", () => {
  const a = load(["fmtH"]);
  assert.equal(a.fmtH(5) + " ที่แล้ว", "5 ชม. ที่แล้ว");
  assert.match(html, /fmtH\(hoursSince\(runTs\)\) \+ t\(" ที่แล้ว/);
});

test("deleting a meal asks first", () => {
  const h = html.slice(html.indexOf('$("meals").addEventListener'), html.indexOf('$("bw-save")'));
  assert.match(h, /confirm\(/);
});

test("−15 shortens the rest total too, so the bar stays right", () => {
  const h = html.slice(html.indexOf('$("rest-minus")'), html.indexOf('$("rest-plus")'));
  assert.match(h, /restTotal = Math\.max\(1, restTotal - 15\)/);
});

test("last welcome page has no empty skip button", () => {
  const h = html.slice(html.indexOf("function showOnboarding"), html.indexOf("$(\"show-onb\")"));
  assert.doesNotMatch(h, /\(last \? "" : t\("ข้าม"\)\)/);
  assert.match(h, /last \? "<span><\/span>"/);
});

test("sample data's food is not offered as a usual meal", () => {
  const now = Date.now();
  const a = load(["recentMeals"], { S: { food: [{ ts: now - 864e5, name: "ตัวอย่าง (3 มื้อ)", kcal: 2640, p: 100 }, { ts: now, name: "ข้าวมันไก่ต้ม", kcal: 585, p: 25 }] } });
  assert.deepEqual([...a.recentMeals().map((m) => m.n)], ["ข้าวมันไก่ต้ม"]);
});
