// The whole app script in index.html must still parse. Run: node --test "tests/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync, existsSync } from "node:fs";
import { html } from "./app.mjs";

test("index.html script has no syntax errors", () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 1);
  for (const s of scripts) assert.doesNotThrow(() => new vm.Script(s));
});

test("stats.html script still parses", () => {
  const stats = readFileSync(new URL("../stats.html", import.meta.url), "utf8");
  for (const match of stats.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new vm.Script(match[1]));
});

test("local stylesheets used by app and stats exist and are available offline", () => {
  const stats = readFileSync(new URL("../stats.html", import.meta.url), "utf8");
  const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  for (const page of [html, stats]) {
    const links = [...page.matchAll(/<link rel="stylesheet" href="([^":]+)">/g)];
    assert.ok(links.length, "shared local stylesheet missing");
    for (const [, file] of links) {
      assert.ok(existsSync(new URL("../" + file, import.meta.url)), file + " missing");
      assert.ok(sw.includes('"' + file + '"'), file + " missing from offline shell");
    }
  }
});
