// Optional Google sign-in and backup sync for KRYVOS.
// The app works fully without it. Nothing here runs unless GOOGLE_CLIENT_ID is set (wrangler.toml [vars])
// and the D1 binding DB exists.
//
//   POST   /auth/google   {credential}  Google ID token from Google Identity Services -> our own session token
//   POST   /auth/logout                 end this session
//   GET    /sync                        this user's backup {version, updated, data} (204 when none)
//   PUT    /sync                        save a backup; header If-Match: <version we last saw> (0 = first upload)
//   DELETE /account                     delete the backup, all sessions and the user row
//
// Stored per user: Google "sub" (a number-like id, not the email), sessions as SHA-256 hashes, one backup blob.
// Email and name are NOT stored; they are returned once at sign-in for the app to show.
// No client secret and no Google access tokens are used.

const GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];
const GOOGLE_JWKS = "https://www.googleapis.com/oauth2/v3/certs";
const SESSION_DAYS = 30;
const MAX_CREDENTIAL = 4096;
const MAX_SYNC_BYTES = 1000000;
// Free D1 allows 100,000 rows written per day; stats already uses part of it.
const LOGINS_DAILY = 2000;          // whole app
const LOGINS_PER_IP_DAILY = 30;     // keyed by a salted hash of the IP, kept 2 days
const SYNC_WRITES_PER_USER_DAILY = 300; // the app uploads at most once per 5 minutes
const SYNC_WRITES_DAILY = 15000;    // whole app

export const AUTH_SCHEMA = [
  "CREATE TABLE IF NOT EXISTS users (sub TEXT PRIMARY KEY, created INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, sub TEXT NOT NULL, expires INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS sessions_sub ON sessions(sub)",
  "CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires)",
  "CREATE TABLE IF NOT EXISTS sync_blobs (sub TEXT PRIMARY KEY, data TEXT NOT NULL, version INTEGER NOT NULL, updated INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS auth_limits (k TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(k, day))",
  "CREATE INDEX IF NOT EXISTS auth_limits_day ON auth_limits(day)"
];
const ready = new WeakMap();
function ensureAuthSchema(db) {
  let p = ready.get(db);
  if (!p) { p = db.batch(AUTH_SCHEMA.map((q) => db.prepare(q))).catch((e) => { ready.delete(db); throw e; }); ready.set(db, p); }
  return p;
}

/* ---------- small helpers ---------- */
const enc = new TextEncoder();
function b64urlToBytes(s) {
  if (typeof s !== "string" || !/^[A-Za-z0-9_-]*$/.test(s)) throw new Error("b64");
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64url(bytes) {
  let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function sha256Hex(text) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function bkkDay(ts) { return new Date(ts + 7 * 3600e3).toISOString().slice(0, 10); }

// Read at most `limit` bytes of the body, including chunked bodies without Content-Length.
async function readBounded(request, limit) {
  const reader = request.body && request.body.getReader();
  if (!reader) return "";
  let size = 0, raw = ""; const decoder = new TextDecoder();
  while (true) {
    const chunk = await reader.read(); if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > limit) { await reader.cancel(); return null; }
    raw += decoder.decode(chunk.value, { stream: true });
  }
  return raw + decoder.decode();
}

/* ---------- Google ID token verification ---------- */
let jwksCache = { keys: null, until: 0 };
export function resetJwksCache() { jwksCache = { keys: null, until: 0 }; }
async function googleKeys(force) {
  const now = Date.now();
  if (!force && jwksCache.keys && jwksCache.until > now) return jwksCache.keys;
  const res = await fetch(GOOGLE_JWKS);
  if (!res.ok) throw new Error("jwks " + res.status);
  const body = await res.json();
  const m = /max-age=(\d+)/.exec(res.headers.get("Cache-Control") || "");
  jwksCache = { keys: Array.isArray(body.keys) ? body.keys : [], until: now + Math.min(86400, m ? Number(m[1]) : 3600) * 1000 };
  return jwksCache.keys;
}

// Returns the verified claims, or null. Never trusts anything the app decoded itself.
export async function verifyGoogleIdToken(token, clientId, now = Date.now()) {
  if (typeof token !== "string" || token.length > MAX_CREDENTIAL || !clientId) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header, claims;
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
  } catch { return null; }
  if (!header || header.alg !== "RS256" || typeof header.kid !== "string" || !claims || typeof claims !== "object") return null;
  let keys = await googleKeys(false), jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) { keys = await googleKeys(true); jwk = keys.find((k) => k.kid === header.kid); }
  if (!jwk || jwk.kty !== "RSA") return null;
  let ok = false;
  try {
    const key = await crypto.subtle.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(parts[2]), enc.encode(parts[0] + "." + parts[1]));
  } catch { return null; }
  if (!ok) return null;
  const skew = 60;
  const sec = Math.floor(now / 1000);
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!GOOGLE_ISSUERS.includes(claims.iss)) return null;
  if (!aud.includes(clientId) || (Array.isArray(claims.aud) && claims.azp !== clientId)) return null;
  if (typeof claims.exp !== "number" || claims.exp + skew < sec) return null;
  if (typeof claims.iat === "number" && claims.iat - skew > sec) return null;
  if (claims.email_verified !== true && claims.email_verified !== "true") return null;
  if (typeof claims.sub !== "string" || !/^[0-9A-Za-z_-]{1,64}$/.test(claims.sub)) return null;
  return claims;
}

/* ---------- limits (D1 counters, one transaction) ---------- */
// Adds 1 to every key only if all of them are still under their limit. Returns true when counted.
// Read-then-write: under heavy concurrency a few extra calls may pass, which is fine for abuse limits.
async function takeLimit(db, items, now) {
  const day = bkkDay(now);
  const guard = items.map(() => "COALESCE((SELECT count FROM auth_limits WHERE k = ? AND day = ?), 0) < ?").join(" AND ");
  const pre = await db.prepare("SELECT " + guard + " AS ok").bind(...items.flatMap((x) => [x.k, day, x.max])).first();
  if (!pre || !pre.ok) return false;
  await db.batch([db.prepare("DELETE FROM auth_limits WHERE day < ?").bind(bkkDay(now - 2 * 864e5))]
    .concat(items.map((it) => db.prepare("INSERT INTO auth_limits (k, day, count) VALUES (?, ?, 1) ON CONFLICT(k, day) DO UPDATE SET count = count + 1").bind(it.k, day))));
  return true;
}

/* ---------- sessions ---------- */
async function newSession(db, sub, now) {
  const raw = new Uint8Array(32); crypto.getRandomValues(raw);
  const token = bytesToB64url(raw);
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE expires < ?").bind(now),
    db.prepare("INSERT INTO users (sub, created) VALUES (?, ?) ON CONFLICT(sub) DO NOTHING").bind(sub, now),
    db.prepare("INSERT INTO sessions (hash, sub, expires) VALUES (?, ?, ?)").bind(await sha256Hex(token), sub, now + SESSION_DAYS * 864e5)
  ]);
  return token;
}
async function sessionUser(request, db, now) {
  const m = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get("Authorization") || "");
  if (!m) return null;
  const hash = await sha256Hex(m[1]);
  const row = await db.prepare("SELECT sub FROM sessions WHERE hash = ? AND expires > ?").bind(hash, now).first();
  return row ? { sub: row.sub, hash } : null;
}

/* ---------- backup validation ---------- */
// The same JSON as the app's backup file, minus photos. Reject anything carrying images.
export function cleanSyncBody(raw) {
  if (typeof raw !== "string" || !raw.length) return null;
  if (/data:image\//i.test(raw)) return null;
  let d;
  try { d = JSON.parse(raw); } catch { return null; }
  if (!d || typeof d !== "object" || Array.isArray(d) || !Array.isArray(d.log)) return null;
  if (d.scanThumbs && Object.keys(d.scanThumbs).length) return null;
  return JSON.stringify(d);
}

/* ---------- handlers ---------- */
export async function handleAuth(request, env, origin, path, json, cors) {
  if (!env.DB || !env.GOOGLE_CLIENT_ID) return json({ error: "not_configured" }, 503, origin);
  const db = env.DB, now = Date.now(), method = request.method;
  try { await ensureAuthSchema(db); } catch { return json({ error: "db" }, 503, origin); }

  if (path === "/auth/google") {
    if (method !== "POST") return json({ error: "method" }, 405, origin);
    const raw = await readBounded(request, MAX_CREDENTIAL + 100);
    let body; try { body = raw === null ? null : JSON.parse(raw); } catch { body = null; }
    if (!body || typeof body.credential !== "string") return json({ error: "bad_request" }, 400, origin);
    const ipHash = await sha256Hex("kryvos-login:" + (request.headers.get("CF-Connecting-IP") || "unknown") + ":" + bkkDay(now));
    if (!(await takeLimit(db, [{ k: "login:all", max: LOGINS_DAILY }, { k: "login:" + ipHash.slice(0, 32), max: LOGINS_PER_IP_DAILY }], now))) return json({ error: "limit" }, 429, origin);
    let claims;
    try { claims = await verifyGoogleIdToken(body.credential, env.GOOGLE_CLIENT_ID, now); } catch { return json({ error: "google_unavailable" }, 503, origin); }
    if (!claims) return json({ error: "invalid_token" }, 401, origin);
    const token = await newSession(db, claims.sub, now);
    return json({ token, name: typeof claims.name === "string" ? claims.name.slice(0, 80) : "", email: typeof claims.email === "string" ? claims.email.slice(0, 120) : "", expires: now + SESSION_DAYS * 864e5 }, 200, origin);
  }

  const user = await sessionUser(request, db, now);
  if (!user) return json({ error: "signed_out" }, 401, origin);

  if (path === "/auth/logout") {
    if (method !== "POST") return json({ error: "method" }, 405, origin);
    await db.prepare("DELETE FROM sessions WHERE hash = ?").bind(user.hash).run();
    return new Response(null, { status: 204, headers: cors(origin) });
  }

  if (path === "/account") {
    if (method !== "DELETE") return json({ error: "method" }, 405, origin);
    await db.batch([
      db.prepare("DELETE FROM sync_blobs WHERE sub = ?").bind(user.sub),
      db.prepare("DELETE FROM sessions WHERE sub = ?").bind(user.sub),
      db.prepare("DELETE FROM users WHERE sub = ?").bind(user.sub),
      db.prepare("DELETE FROM auth_limits WHERE k = ?").bind("sync:" + user.sub)
    ]);
    return new Response(null, { status: 204, headers: cors(origin) });
  }

  if (path === "/sync") {
    if (method === "GET") {
      const row = await db.prepare("SELECT data, version, updated FROM sync_blobs WHERE sub = ?").bind(user.sub).first();
      if (!row) return new Response(null, { status: 204, headers: cors(origin) });
      return json({ version: row.version, updated: row.updated, data: JSON.parse(row.data) }, 200, origin);
    }
    if (method !== "PUT") return json({ error: "method" }, 405, origin);
    const ifMatch = request.headers.get("If-Match") || "";
    const expected = /^\d{1,9}$/.test(ifMatch) ? Number(ifMatch) : -1;
    if (expected < 0) return json({ error: "if_match" }, 428, origin);
    const raw = await readBounded(request, MAX_SYNC_BYTES);
    if (raw === null) return json({ error: "too_large" }, 413, origin);
    const data = cleanSyncBody(raw);
    if (!data) return json({ error: "bad_request" }, 400, origin);
    if (!(await takeLimit(db, [{ k: "sync:all", max: SYNC_WRITES_DAILY }, { k: "sync:" + user.sub, max: SYNC_WRITES_PER_USER_DAILY }], now))) return json({ error: "limit" }, 429, origin);
    const next = expected + 1;
    const r = expected === 0
      ? await db.prepare("INSERT INTO sync_blobs (sub, data, version, updated) VALUES (?, ?, 1, ?) ON CONFLICT(sub) DO NOTHING").bind(user.sub, data, now).run()
      : await db.prepare("UPDATE sync_blobs SET data = ?, version = ?, updated = ? WHERE sub = ? AND version = ?").bind(data, next, now, user.sub, expected).run();
    if (!r || !r.meta || r.meta.changes !== 1) {
      const cur = await db.prepare("SELECT version, updated FROM sync_blobs WHERE sub = ?").bind(user.sub).first();
      return json({ error: "conflict", version: cur ? cur.version : 0, updated: cur ? cur.updated : 0 }, 409, origin);
    }
    return json({ version: next, updated: now }, 200, origin);
  }
  return json({ error: "not_found" }, 404, origin);
}

export const AUTH_PATHS = ["/auth/google", "/auth/logout", "/sync", "/account"];
