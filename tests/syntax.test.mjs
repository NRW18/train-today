// The whole app script in index.html must still parse. Run: node --test "tests/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { html } from "./app.mjs";

test("index.html script has no syntax errors", () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 1);
  for (const s of scripts) assert.doesNotThrow(() => new vm.Script(s));
});
