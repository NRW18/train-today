// The AI must answer in the app's language even though JSON keys end in _th.
// Run from the repo root: node --test "tests/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const src = html.slice(html.indexOf("  var LANG_RULE"), html.indexOf("function callProxy("));
function load(AI_LANG) { const ctx = { AI_LANG }; vm.createContext(ctx); vm.runInContext(src, ctx); return ctx; }

test("English mode adds an English rule to the first text part only", () => {
  const { withLang } = load("English");
  const img = { inline_data: { mime_type: "image/jpeg", data: "x" } };
  const out = withLang([{ text: "prompt" }, img]);
  assert.match(out[0].text, /^prompt\nLANGUAGE: .*in English, including fields whose key ends in _th/);
  assert.equal(out[1], img);
  assert.equal(out.length, 2);
});

test("rule is added once, even on retry", () => {
  const { withLang } = load("Thai");
  const once = withLang([{ text: "p" }]);
  assert.equal(withLang(once), once);
  assert.match(once[0].text, /in Thai/);
});

test("does not change the caller's array", () => {
  const { withLang } = load("English");
  const parts = [{ text: "p" }];
  withLang(parts);
  assert.equal(parts[0].text, "p");
});
