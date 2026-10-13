// Tests the AI retry in index.html (callProxy). Run from the repo root: node --test "tests/*.test.mjs"
// The function is cut out of index.html and run with a fake fetch, so the test checks the real code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("function callProxy(");
const end = html.indexOf("function callGemini(");
assert.ok(start > 0 && end > start, "callProxy not found in index.html");
const src = html.slice(start, end);

// Build callProxy with a fake fetch. Each step is a status number, or "net" for a dropped connection.
function setup(...steps) {
  const calls = { fetch: 0, waits: [] };
  const ctx = {
    PROXY_URL: "https://proxy.example/",
    parseGemini: (j) => j.answer,
    setTimeout: (fn, ms) => { calls.waits.push(ms); fn(); },
    Promise,
    fetch: async () => {
      calls.fetch++;
      const s = steps.length ? steps.shift() : 200;
      if (s === "net") throw new TypeError("Failed to fetch");
      const body = s === 200 ? { answer: "ok" } : s === 429 ? { error: "limit", scope: "user" } : { error: "upstream" };
      return new Response(JSON.stringify(body), { status: s });
    }
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { callProxy: (p) => ctx.callProxy(p, false), calls };
}

const parts = [{ text: "hi" }];

test("502 then 200: retries once after 1.5 s", async () => {
  const { callProxy, calls } = setup(502, 200);
  assert.equal(await callProxy(parts), "ok");
  assert.equal(calls.fetch, 2);
  assert.deepEqual(calls.waits, [1500]);
});

test("503 then 200: retries once", async () => {
  const { callProxy, calls } = setup(503, 200);
  assert.equal(await callProxy(parts), "ok");
  assert.equal(calls.fetch, 2);
});

test("network drop then 200: retries once", async () => {
  const { callProxy, calls } = setup("net", 200);
  assert.equal(await callProxy(parts), "ok");
  assert.equal(calls.fetch, 2);
});

test("502 twice: gives up after one retry with the proxy error", async () => {
  const { callProxy, calls } = setup(502, 502);
  await assert.rejects(callProxy(parts), (e) => e.proxy === true && e.status === 502);
  assert.equal(calls.fetch, 2);
});

test("network drop twice: gives up after one retry", async () => {
  const { callProxy, calls } = setup("net", "net");
  await assert.rejects(callProxy(parts), TypeError);
  assert.equal(calls.fetch, 2);
});

test("429 is not retried and keeps the limit info", async () => {
  const { callProxy, calls } = setup(429);
  await assert.rejects(callProxy(parts), (e) => e.status === 429 && e.limit === true && e.scope === "user");
  assert.equal(calls.fetch, 1);
  assert.equal(calls.waits.length, 0);
});

test("400 is not retried", async () => {
  const { callProxy, calls } = setup(400);
  await assert.rejects(callProxy(parts), (e) => e.status === 400);
  assert.equal(calls.fetch, 1);
});
