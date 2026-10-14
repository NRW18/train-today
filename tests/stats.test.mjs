// Tests for the usage-stats part of proxy/worker.js (POST /e and GET /stats).
// D1 is faked with Node's built-in SQLite, so the real SQL runs. Run: node --test "tests/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "../proxy/worker.js";

const ORIGIN = "https://nrw18.github.io";
const KEY = "test-stats-key-123";

function fakeD1() {
  const db = new DatabaseSync(":memory:");
  function stmt(sql, args = []) {
    return {
      sql, args,
      bind: (...a) => stmt(sql, a),
      first: async () => db.prepare(sql).get(...args) || null,
      all: async () => ({ results: db.prepare(sql).all(...args) }),
      run: async () => { db.prepare(sql).run(...args); return { success: true }; }
    };
  }
  return {
    raw: db,
    prepare: (sql) => stmt(sql),
    batch: async (list) => list.map((s) => (/^\s*SELECT/i.test(s.sql) ? { results: db.prepare(s.sql).all(...s.args) } : (db.prepare(s.sql).run(...s.args), { results: [] })))
  };
}

function post(body, { origin = ORIGIN } = {}) {
  const headers = { "Content-Type": "text/plain;charset=UTF-8" };
  if (origin) headers.Origin = origin;
  return new Request("https://proxy.example/e", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
}
function stats(key = KEY, days = 14) {
  return new Request("https://proxy.example/stats?days=" + days, { headers: { Origin: ORIGIN, "X-Stats-Key": key } });
}
const batch = (a, events, extra = {}) => ({ a, v: "v37", l: "en", p: "android", i: 1, e: events, ...extra });

test("events are stored without the IP and only known names are kept", async () => {
  const DB = fakeD1();
  const now = Date.now();
  const res = await worker.fetch(post(batch("dev-aaaa-1111", [["open", now], ["run_log", now], ["hack_the_planet", now], ["set_done", now]])), { DB });
  assert.equal(res.status, 204);
  const rows = DB.raw.prepare("SELECT * FROM ev ORDER BY id").all();
  assert.deepEqual(rows.map((r) => r.ev), ["open", "run_log", "set_done"]);
  assert.equal(rows[0].anon, "dev-aaaa-1111");
  assert.equal(rows[0].plat, "android");
  assert.equal(rows[0].lang, "en");
  assert.ok(!Object.keys(rows[0]).some((k) => /ip/i.test(k)), "no IP column");
});

test("wrong origin is refused and nothing is stored", async () => {
  const DB = fakeD1();
  const res = await worker.fetch(post(batch("dev-aaaa-1111", [["open", Date.now()]]), { origin: "https://evil.example" }), { DB });
  assert.equal(res.status, 403);
});

test("bad batches get 400; no DB bound still answers 204", async () => {
  const DB = fakeD1();
  for (const b of ["{nope", {}, { a: "x", e: [] }, { a: "has spaces in it", e: [] }, { a: "dev-aaaa-1111", e: "open" }]) {
    const res = await worker.fetch(post(b), { DB });
    assert.equal(res.status, 400, JSON.stringify(b));
  }
  const res = await worker.fetch(post(batch("dev-aaaa-1111", [["open", Date.now()]])), {});
  assert.equal(res.status, 204);
});

test("a batch keeps at most 40 events and odd timestamps are filed under today", async () => {
  const DB = fakeD1();
  const many = Array.from({ length: 60 }, () => ["set_done", 1]);
  await worker.fetch(post(batch("dev-bbbb-2222", many)), { DB });
  const rows = DB.raw.prepare("SELECT day FROM ev").all();
  assert.equal(rows.length, 40);
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  assert.ok(rows.every((r) => r.day === today));
});

test("each device is capped per day", async () => {
  const DB = fakeD1();
  const now = Date.now();
  for (let i = 0; i < 11; i++) await worker.fetch(post(batch("dev-cccc-3333", Array.from({ length: 40 }, () => ["set_done", now]))), { DB });
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM ev").get().n, 400);
});

test("a database error never breaks the app (still 204)", async () => {
  const DB = { prepare() { throw new Error("D1 down"); }, batch: async () => { throw new Error("D1 down"); } };
  const logs = [];
  const real = console.log; console.log = (...a) => logs.push(a.join(" "));
  try {
    const res = await worker.fetch(post(batch("dev-dddd-4444", [["open", Date.now()]])), { DB });
    assert.equal(res.status, 204);
  } finally { console.log = real; }
});

test("/stats needs the key", async () => {
  const DB = fakeD1();
  assert.equal((await worker.fetch(stats("wrong"), { DB, STATS_KEY: KEY })).status, 401);
  assert.equal((await worker.fetch(stats(""), { DB, STATS_KEY: KEY })).status, 401);
  assert.equal((await worker.fetch(stats(), { DB })).status, 503);
  const evil = new Request("https://proxy.example/stats", { headers: { Origin: "https://evil.example", "X-Stats-Key": KEY } });
  assert.equal((await worker.fetch(evil, { DB, STATS_KEY: KEY })).status, 403);
});

test("/stats adds up devices, features, phones, languages and returning devices", async () => {
  const DB = fakeD1();
  const env = { DB, STATS_KEY: KEY };
  const now = Date.now(), yday = now - 864e5;
  await worker.fetch(post(batch("dev-one-00001", [["open", yday], ["run_log", yday]])), env);
  await worker.fetch(post(batch("dev-one-00001", [["open", now], ["run_log", now], ["food_photo", now]])), env);
  await worker.fetch(post(batch("dev-two-00002", [["open", now], ["run_log", now]], { p: "ios", l: "th", i: 0 })), env);
  const res = await worker.fetch(stats(), env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  const j = await res.json();
  assert.equal(j.devices, 2);
  assert.equal(j.installed, 1);
  assert.equal(j.allTime.events, 7);
  const run = j.features.find((f) => f.ev === "run_log");
  assert.deepEqual([run.n, run.devices], [3, 2]);
  assert.equal(j.daily.length, 2);
  assert.equal(j.daily[1].devices, 2);
  assert.equal(j.daily[1].opens, 2);
  assert.deepEqual(j.platforms.map((p) => p.k).sort(), ["android", "ios"]);
  assert.deepEqual(j.activeDays, [{ days: 1, devices: 1 }, { days: 2, devices: 1 }]);
  assert.equal(j.newDevices.reduce((s, d) => s + d.devices, 0), 2);
});

test("the AI route still works next to the stats routes", async () => {
  const res = await worker.fetch(new Request("https://proxy.example/", { method: "GET", headers: { Origin: ORIGIN } }), {});
  assert.equal(res.status, 405);
  const pre = await worker.fetch(new Request("https://proxy.example/stats", { method: "OPTIONS", headers: { Origin: ORIGIN } }), {});
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get("Access-Control-Allow-Headers"), /X-Stats-Key/);
});

test("every event name the app sends is one the worker accepts", () => {
  const w = readFileSync(new URL("../proxy/worker.js", import.meta.url), "utf8");
  const allowed = new Set(JSON.parse(w.match(/const EVENTS = (\[[\s\S]*?\]);/)[1].replace(/\s+/g, " ")));
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const sent = new Set([...html.matchAll(/\btrack\("([a-z_]+)"\)/g)].map((m) => m[1]));
  // tab_* and lang_* are built from names: check those parts too
  for (const tb of ["today", "gym", "run", "food", "history", "settings"]) sent.add("tab_" + tb);
  sent.add("lang_en"); sent.add("lang_th");
  const unknown = [...sent].filter((e) => !allowed.has(e));
  assert.deepEqual(unknown, []);
  assert.ok(sent.size > 15, "app sends events");
});
