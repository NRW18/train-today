// Tests for proxy/worker.js. Run from the repo root: node --test "tests/*.test.mjs"
// KV (env.RL) and Google's API (global fetch) are faked, so nothing leaves this machine.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../proxy/worker.js";

const ORIGIN = "https://nrw18.github.io";
const GOOD_BODY = { parts: [{ text: "เครื่องนี้คืออะไร" }] };

function fakeKV({ failGet = false, failPut = false, data = {} } = {}) {
  const store = new Map(Object.entries(data));
  return {
    store,
    async get(k) { if (failGet) throw new Error("KV get failed"); return store.has(k) ? store.get(k) : null; },
    async put(k, v) { if (failPut) throw new Error("KV put limit exceeded"); store.set(k, v); }
  };
}

function req(body, { origin = ORIGIN, ip = "1.2.3.4", method = "POST" } = {}) {
  const headers = { "Content-Type": "application/json", "CF-Connecting-IP": ip };
  if (origin) headers.Origin = origin;
  return new Request("https://train-today-ai.example/", {
    method,
    headers,
    body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined
  });
}

const realFetch = globalThis.fetch;
const realLog = console.log;
let calls, logs;

// Each entry is the status Google returns for the next call (200 returns a small JSON body).
function fakeGoogle(...statuses) {
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const s = statuses.length ? statuses.shift() : 200;
    const body = s === 200 ? JSON.stringify({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }) : JSON.stringify({ error: { message: "secret detail" } });
    return new Response(body, { status: s, headers: { "Content-Type": "application/json" } });
  };
}

beforeEach(() => {
  calls = [];
  logs = [];
  console.log = (...a) => logs.push(a.join(" "));
  fakeGoogle();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  console.log = realLog;
});

test("wrong origin gets 403 and never reaches Google", async () => {
  const env = { GEMINI_KEY: "test", RL: fakeKV() };
  const res = await worker.fetch(req(GOOD_BODY, { origin: "https://evil.example" }), env);
  assert.equal(res.status, 403);
  assert.equal(calls.length, 0);
});

test("malformed requests get 400", async () => {
  const env = { GEMINI_KEY: "test", RL: fakeKV() };
  const bad = [
    "{not json",
    {},
    { parts: [] },
    { parts: [{ text: "" }] },
    { parts: [{ text: "x".repeat(8001) }] },
    { parts: [{ text: "a" }, { inline_data: { mime_type: "image/gif", data: "AAAA" } }] },
    { parts: [{ text: "a" }, { inline_data: { mime_type: "image/png", data: "A" } }, { inline_data: { mime_type: "image/png", data: "B" } }] }
  ];
  for (const b of bad) {
    const res = await worker.fetch(req(b), env);
    assert.equal(res.status, 400, "body: " + JSON.stringify(b).slice(0, 60));
  }
  assert.equal(calls.length, 0);
});

test("over the per-user daily limit gets 429", async () => {
  const day = new Date().toISOString().slice(0, 10);
  const env = { GEMINI_KEY: "test", RL: fakeKV({ data: { ["ip:" + day + ":9.9.9.9"]: "40" } }) };
  const res = await worker.fetch(req(GOOD_BODY, { ip: "9.9.9.9" }), env);
  assert.equal(res.status, 429);
  const j = await res.json();
  assert.equal(j.error, "limit");
  assert.equal(j.scope, "user");
  assert.equal(calls.length, 0);
});

test("counts each call in KV", async () => {
  const day = new Date().toISOString().slice(0, 10);
  const kv = fakeKV();
  const res = await worker.fetch(req(GOOD_BODY, { ip: "5.5.5.5" }), { GEMINI_KEY: "test", RL: kv });
  assert.equal(res.status, 200);
  assert.equal(kv.store.get("ip:" + day + ":5.5.5.5"), "1");
  assert.equal(kv.store.get("all:" + day), "1");
});

test("KV put throwing still answers 200 and logs it", async () => {
  const env = { GEMINI_KEY: "test", RL: fakeKV({ failPut: true }) };
  const res = await worker.fetch(req(GOOD_BODY), env);
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  assert.ok(logs.some((l) => l.includes("KV write failed")));
});

test("KV get throwing still answers 200 and logs it", async () => {
  const env = { GEMINI_KEY: "test", RL: fakeKV({ failGet: true }) };
  const res = await worker.fetch(req(GOOD_BODY), env);
  assert.equal(res.status, 200);
  assert.ok(logs.some((l) => l.includes("KV read failed")));
});

test("Google 404 falls through to the next model", async () => {
  fakeGoogle(404, 200);
  const env = { GEMINI_KEY: "test", RL: fakeKV() };
  const res = await worker.fetch(req(GOOD_BODY), env);
  assert.equal(res.status, 200);
  assert.equal(calls.length, 2);
  assert.notEqual(calls[0].split("/models/")[1], calls[1].split("/models/")[1]);
});

test("Google errors are not passed through to the app", async () => {
  fakeGoogle(500);
  const res = await worker.fetch(req(GOOD_BODY), { GEMINI_KEY: "test", RL: fakeKV() });
  assert.equal(res.status, 502);
  assert.ok(!(await res.text()).includes("secret detail"));
});

test("Google unreachable: 502 with CORS, not a crash", async () => {
  globalThis.fetch = async () => { throw new TypeError("network connection lost"); };
  const res = await worker.fetch(req(GOOD_BODY), { GEMINI_KEY: "test", RL: fakeKV() });
  assert.equal(res.status, 502);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.equal((await res.json()).error, "upstream");
});
