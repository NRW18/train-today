// AI error messages match the job the AI was doing (TASKS 9).
import { test } from "node:test";
import assert from "node:assert/strict";
import { load, html } from "./app.mjs";

const a = load(["errText"], { navigator: { onLine: true } }, ["AI_FAIL"]);

test("an unreadable answer gets a message for that job", () => {
  const bad = new SyntaxError("Unexpected token");
  assert.match(a.errText(bad, "scan"), /สแกนไม่สำเร็จ/);
  assert.match(a.errText(bad, "food"), /อาหาร/);
  assert.doesNotMatch(a.errText(bad, "food"), /เครื่อง/);
  assert.match(a.errText(bad, "week"), /สรุปไม่สำเร็จ/);
  assert.match(a.errText(bad, "explain"), /อธิบายท่าไม่สำเร็จ/);
});

test("quota and network messages are the same for every job", () => {
  const lim = Object.assign(new Error("proxy"), { proxy: true, limit: true, status: 429 });
  assert.equal(a.errText(lim, "food"), a.errText(lim, "scan"));
  assert.match(a.errText(new Error("offline"), "week"), /อินเทอร์เน็ต/);
});

test("no job given still falls back to the scan message", () => {
  assert.match(a.errText(new Error("x")), /สแกนไม่สำเร็จ/);
});

test("every job the app passes has a message", () => {
  const jobs = [...html.matchAll(/errText\(\w+, "(\w+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(jobs.sort(), ["explain", "food", "scan", "week"]);
  jobs.forEach((j) => assert.ok(a.AI_FAIL[j], j));
});
