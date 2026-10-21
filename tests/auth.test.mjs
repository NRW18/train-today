// Google sign-in + sync (proxy/auth.js through proxy/worker.js). Google's keys are a local test key;
// nothing leaves this machine.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import worker from "../proxy/worker.js";
import { resetJwksCache, verifyGoogleIdToken, cleanSyncBody } from "../proxy/auth.js";

const ORIGIN = "https://nrw18.github.io", CLIENT = "test-client.apps.googleusercontent.com";
const enc = new TextEncoder();
const b64u = (bytes) => Buffer.from(bytes).toString("base64url");

function database() {
  const raw = new DatabaseSync(":memory:");
  function stmt(sql, args = []) {
    return { sql, args, bind: (...v) => stmt(sql, v),
      first: async () => raw.prepare(sql).get(...args) ?? null,
      run: async () => ({ meta: { changes: Number(raw.prepare(sql).run(...args).changes) } }) };
  }
  return { raw, prepare: (sql) => stmt(sql), batch: async (rows) => {
    raw.exec("BEGIN IMMEDIATE");
    try { const out = rows.map((s) => /^\s*SELECT/i.test(s.sql) ? { results: raw.prepare(s.sql).all(...s.args) } : { results: [], meta: { changes: Number(raw.prepare(s.sql).run(...s.args).changes) } }); raw.exec("COMMIT"); return out; }
    catch (e) { raw.exec("ROLLBACK"); throw e; } } };
}

let keyPair, otherPair, jwk, realFetch, jwksCalls;
async function rsa() { return crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]); }
async function sign(claims, { pair = keyPair, kid = "k1", alg = "RS256" } = {}) {
  const h = b64u(enc.encode(JSON.stringify({ alg, kid, typ: "JWT" }))), p = b64u(enc.encode(JSON.stringify(claims)));
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, enc.encode(h + "." + p)));
  return h + "." + p + "." + b64u(sig);
}
const now = () => Math.floor(Date.now() / 1000);
const good = (over = {}) => ({ iss: "https://accounts.google.com", aud: CLIENT, sub: "1234567890", email: "a@example.com", email_verified: true, name: "Oreo", iat: now(), exp: now() + 600, ...over });

beforeEach(async () => {
  keyPair ||= await rsa(); otherPair ||= await rsa();
  jwk ||= { ...(await crypto.subtle.exportKey("jwk", keyPair.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  resetJwksCache(); jwksCalls = 0; realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { jwksCalls++; assert.equal(String(url), "https://www.googleapis.com/oauth2/v3/certs"); return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" } }); };
});
afterEach(() => { globalThis.fetch = realFetch; });

function call(path, { method = "POST", body, token, ifMatch, origin = ORIGIN, ip = "1.2.3.4" } = {}) {
  const headers = { Origin: origin, "CF-Connecting-IP": ip };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = "Bearer " + token;
  if (ifMatch !== undefined) headers["If-Match"] = String(ifMatch);
  return new Request("https://proxy.example" + path, { method, headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
}
async function signIn(env, claims = good()) {
  const res = await worker.fetch(call("/auth/google", { body: { credential: await sign(claims) } }), env);
  return { res, out: res.status === 200 ? await res.json() : null };
}

test("a valid Google token gives a session; email and name are returned but not stored", async () => {
  const DB = database(), env = { DB, GOOGLE_CLIENT_ID: CLIENT };
  const { res, out } = await signIn(env);
  assert.equal(res.status, 200);
  assert.match(out.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(out.email, "a@example.com"); assert.equal(out.name, "Oreo");
  const dump = JSON.stringify(DB.raw.prepare("SELECT * FROM users").all()) + JSON.stringify(DB.raw.prepare("SELECT * FROM sessions").all());
  assert.doesNotMatch(dump, /example\.com|Oreo/);
  assert.doesNotMatch(dump, new RegExp(out.token), "only the hash of the session token is stored");
});

test("tokens with a bad audience, issuer, expiry, signature, algorithm or unverified email are rejected", async () => {
  const cases = [
    await sign(good({ aud: "someone-else" })),
    await sign(good({ iss: "https://evil.example" })),
    await sign(good({ exp: now() - 3600 })),
    await sign(good({ iat: now() + 3600 })),
    await sign(good({ email_verified: false })),
    await sign(good(), { pair: otherPair }),
    await sign(good(), { alg: "HS256" }),
    await sign(good(), { kid: "unknown" }),
    "not.a.jwt", "x".repeat(5000)
  ];
  for (const token of cases) assert.equal(await verifyGoogleIdToken(token, CLIENT), null, token.slice(0, 40));
  assert.ok(await verifyGoogleIdToken(await sign(good()), CLIENT));
  assert.equal(await verifyGoogleIdToken(await sign(good()), ""), null, "no client id configured means nothing verifies");
});

test("Google keys are cached between sign-ins", async () => {
  const env = { DB: database(), GOOGLE_CLIENT_ID: CLIENT };
  await signIn(env); await signIn(env);
  assert.equal(jwksCalls, 1);
});

test("sign-in is off until GOOGLE_CLIENT_ID is set, and other origins are refused", async () => {
  assert.equal((await worker.fetch(call("/auth/google", { body: { credential: "x" } }), { DB: database() })).status, 503);
  assert.equal((await worker.fetch(call("/auth/google", { body: { credential: "x" }, origin: "https://evil.example" }), { DB: database(), GOOGLE_CLIENT_ID: CLIENT })).status, 403);
  const pre = await worker.fetch(new Request("https://proxy.example/sync", { method: "OPTIONS", headers: { Origin: ORIGIN } }), {});
  assert.match(pre.headers.get("Access-Control-Allow-Methods"), /PUT/);
  assert.match(pre.headers.get("Access-Control-Allow-Headers"), /Authorization/);
});

test("sync: first upload, read back, version conflict and size/photo limits", async () => {
  const env = { DB: database(), GOOGLE_CLIENT_ID: CLIENT };
  const { out } = await signIn(env), token = out.token;
  assert.equal((await worker.fetch(call("/sync", { method: "GET", token }), env)).status, 204);
  const data = { log: [{ ts: 1, day: "push" }], runs: [], food: [], weights: [] };
  let r = await worker.fetch(call("/sync", { method: "PUT", token, ifMatch: 0, body: data }), env);
  assert.equal(r.status, 200); assert.equal((await r.json()).version, 1);
  r = await worker.fetch(call("/sync", { method: "GET", token }), env);
  const got = await r.json(); assert.equal(got.version, 1); assert.deepEqual(got.data, data);
  r = await worker.fetch(call("/sync", { method: "PUT", token, ifMatch: 0, body: data }), env);
  assert.equal(r.status, 409, "a stale version never overwrites newer data");
  assert.equal((await r.json()).version, 1);
  assert.equal((await worker.fetch(call("/sync", { method: "PUT", token, body: data }), env)).status, 428);
  assert.equal((await worker.fetch(call("/sync", { method: "PUT", token, ifMatch: 1, body: { ...data, scanThumbs: { x: "data:image/webp;base64,AAAA" } } }), env)).status, 400);
  assert.equal((await worker.fetch(call("/sync", { method: "PUT", token, ifMatch: 1, body: { nope: 1 } }), env)).status, 400);
  assert.equal((await worker.fetch(call("/sync", { method: "PUT", token, ifMatch: 1, body: { log: [], pad: "x".repeat(1000001) } }), env)).status, 413);
  r = await worker.fetch(call("/sync", { method: "PUT", token, ifMatch: 1, body: { ...data, log: [] } }), env);
  assert.equal(r.status, 200); assert.equal((await r.json()).version, 2);
});

test("users only see their own backup; bad or missing tokens are signed out", async () => {
  const env = { DB: database(), GOOGLE_CLIENT_ID: CLIENT };
  const a = (await signIn(env)).out.token, b = (await signIn(env, good({ sub: "999" }))).out.token;
  await worker.fetch(call("/sync", { method: "PUT", token: a, ifMatch: 0, body: { log: [{ ts: 5 }] } }), env);
  assert.equal((await worker.fetch(call("/sync", { method: "GET", token: b }), env)).status, 204);
  assert.equal((await worker.fetch(call("/sync", { method: "GET", token: "A".repeat(43) }), env)).status, 401);
  assert.equal((await worker.fetch(call("/sync", { method: "GET" }), env)).status, 401);
});

test("logout ends the session; deleting the account removes backup, sessions and user", async () => {
  const DB = database(), env = { DB, GOOGLE_CLIENT_ID: CLIENT };
  const t1 = (await signIn(env)).out.token, t2 = (await signIn(env)).out.token;
  await worker.fetch(call("/sync", { method: "PUT", token: t1, ifMatch: 0, body: { log: [] } }), env);
  assert.equal((await worker.fetch(call("/auth/logout", { token: t1 }), env)).status, 204);
  assert.equal((await worker.fetch(call("/sync", { method: "GET", token: t1 }), env)).status, 401);
  assert.equal((await worker.fetch(call("/account", { method: "DELETE", token: t2 }), env)).status, 204);
  for (const table of ["users", "sessions", "sync_blobs"]) assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM " + table).get().n, 0, table);
});

test("sign-in attempts are limited per IP per day", async () => {
  const env = { DB: database(), GOOGLE_CLIENT_ID: CLIENT };
  let last;
  for (let i = 0; i < 31; i++) last = await worker.fetch(call("/auth/google", { body: { credential: "bad" }, ip: "9.9.9.9" }), env);
  assert.equal(last.status, 429);
  assert.equal((await worker.fetch(call("/auth/google", { body: { credential: "bad" }, ip: "8.8.8.8" }), env)).status, 401, "another IP is unaffected");
});

test("cleanSyncBody accepts the backup shape only", () => {
  assert.ok(cleanSyncBody(JSON.stringify({ log: [] })));
  assert.equal(cleanSyncBody("[]"), null);
  assert.equal(cleanSyncBody('{"log":[],"x":"data:image/png;base64,AA"}'), null);
});
