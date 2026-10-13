// How-to video links: YouTube search URLs built from exercise names, and the AI's English names kept safe.
import { test } from "node:test";
import assert from "node:assert/strict";
import { load, html } from "./app.mjs";

const EN_NAME = new Function("return " + html.match(/var EN_NAME = (\{[\s\S]*?\});/)[1])();
// the app's esc() holds quote characters the source cutter can't skip, so use the same logic here
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const app = () => load(["ytUrl", "thName", "ytLinks", "exVideos", "cleanEn"], { EN_NAME, esc }, ["YT_ICON"]);

test("Thai search drops the bracket note; English uses the English name", () => {
  const a = app();
  const h = a.exVideos({ id: "chest_press", name: "เชสต์เพรส (เครื่อง)" });
  assert.ok(h.includes(encodeURIComponent("วิธีเล่น เชสต์เพรส ท่าที่ถูกต้อง")));
  assert.ok(h.includes(encodeURIComponent("how to machine chest press proper form")));
  assert.ok(h.includes('href="https://www.youtube.com/results?search_query='));
});

test("an AI-added exercise without an English name gets only the Thai link", () => {
  const h = app().exVideos({ id: "c_x_0", name: "สมิธสควอท (สมิธแมชชีน)" });
  assert.equal((h.match(/<a /g) || []).length, 1);
});

test("names can't break out of the link", () => {
  const h = app().ytLinks('ท่า"><img src=x onerror=alert(1)>', "", true);
  assert.ok(!h.includes("<img"));
});

test("cleanEn keeps plain English names only", () => {
  const a = app();
  assert.equal(a.cleanEn(" Smith machine squat "), "Smith machine squat");
  assert.equal(a.cleanEn("สมิธ"), "");
  assert.equal(a.cleanEn("<script>"), "");
  assert.equal(a.cleanEn(42), "");
});
