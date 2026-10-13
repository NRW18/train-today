// English translations (en.js) must cover every Thai string in the app, and keep its markup and {placeholders}.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { html } from "./app.mjs";

const ctx = {}; vm.runInNewContext(readFileSync(new URL("../en.js", import.meta.url), "utf8") + ";this.EN=EN;this.EN_UI=EN_UI;", ctx);
const { EN, EN_UI } = ctx;
const TH = /[฀-๿]/;
const KEEP = new Set(["ไทย", "Language / ภาษา", "฿"]); // shown as-is in both languages

// Thai strings passed to t("...") or t('...') in the app script
const script = html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>", html.indexOf("<script>")));
const keys = [...script.matchAll(/\bt\(("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\)/g)].map((m) => (m[1][0] === '"' ? JSON.parse(m[1]) : JSON.parse('"' + m[1].slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"') + '"')));

test("every Thai string in the code has English", () => {
  const missing = keys.filter((k) => TH.test(k) && !KEEP.has(k) && EN[k] == null);
  assert.deepEqual(missing, []);
});

test("every Thai text in the page markup has English", () => {
  const body = html.slice(html.indexOf("<body>"), html.indexOf("<script"));
  const texts = [...body.matchAll(/>([^<>]*[฀-๿][^<>]*)</g)].map((m) => m[1].trim())
    .concat([...body.matchAll(/(?:placeholder|aria-label|title|alt)="([^"]*[฀-๿][^"]*)"/g)].map((m) => m[1]));
  assert.deepEqual(texts.filter((k) => !KEEP.has(k) && EN[k] == null && EN_UI[k] == null), []);
});

test("translations keep the same HTML tags and {placeholders}", () => {
  const tags = (s) => (s.match(/<\/?[a-z][^>]*>/gi) || []).map((x) => x.replace(/\s(aria-label|alt|title|placeholder)="[^"]*"/g, "")).join("");
  const holes = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  const bad = Object.keys(EN).filter((k) => tags(k) !== tags(EN[k]) || holes(k) !== holes(EN[k]));
  assert.deepEqual(bad, []);
});

test("no Thai left in the English text", () => {
  assert.deepEqual(Object.values(EN).filter((v) => TH.test(v.replace("฿", ""))), []);
});
