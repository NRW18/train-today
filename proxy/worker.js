// Cloudflare Worker: lets the KRYVOS app use Gemini without each user entering a key.
// The Gemini key lives only in this worker as a secret (GEMINI_KEY) and is never sent to the app.
//
// Deploy: in this folder run  npx wrangler login  then  npx wrangler deploy  (settings in wrangler.toml,
// including the KV binding RL). The secret GEMINI_KEY is set once in the Cloudflare dashboard
// (Worker -> Settings -> Variables and Secrets) and deploys keep it.
//
// Limits: each visitor (by IP) gets PER_IP_DAILY calls a day, and the whole app gets GLOBAL_DAILY.
// Only requests from ALLOWED_ORIGINS are accepted from browsers. This keeps casual abuse away;
// it is not bank-grade security, so keep the limits low and watch your Gemini usage.
//
// Usage stats (optional, needs the D1 binding DB and the secret STATS_KEY):
//   POST /e      the app sends anonymous feature counts: a random device id, app language, phone type
//                and event names from EVENTS below. No IP, no names, no workout or food data is stored.
//   GET  /stats  totals for the stats page (stats.html); needs the header X-Stats-Key = STATS_KEY.
// Set the key once from this folder:  npx wrangler secret put STATS_KEY

const ALLOWED_ORIGINS = ["https://nrw18.github.io"];
const MODELS = ["gemini-3-flash-preview", "gemini-3.1-flash-lite", "gemini-flash-latest"];
const PER_IP_DAILY = 40;
const GLOBAL_DAILY = 450;     // each counted call writes KV twice; free KV allows 1,000 writes/day
const MAX_TEXT = 8000;        // characters of prompt text
const MAX_IMAGE_B64 = 2000000; // ~1.5 MB image after base64
const UPSTREAM = "https://generativelanguage.googleapis.com/v1beta/models/";

function cors(origin) {
  const ok = ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Stats-Key, X-Stats-Id",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors(origin) } });
}

// Accept only the shape the app sends: text parts and at most one JPEG/PNG image.
function cleanParts(parts) {
  if (!Array.isArray(parts) || !parts.length || parts.length > 3) return null;
  let text = 0, images = 0;
  const out = [];
  for (const p of parts) {
    if (p && typeof p.text === "string") {
      text += p.text.length;
      out.push({ text: p.text });
    } else if (p && p.inline_data && typeof p.inline_data.data === "string") {
      const mt = p.inline_data.mime_type;
      if (mt !== "image/jpeg" && mt !== "image/png") return null;
      if (p.inline_data.data.length > MAX_IMAGE_B64) return null;
      images++;
      out.push({ inline_data: { mime_type: mt, data: p.inline_data.data } });
    } else return null;
  }
  if (text === 0 || text > MAX_TEXT || images > 1) return null;
  return out;
}

// If KV fails (e.g. the free plan's 1,000 writes/day ran out) we log it and let the request through
// rather than answering 500: Gemini's own quota is the backstop for that day.
async function countAndCheck(env, ip) {
  if (!env.RL) return { ok: true };            // no KV bound: no limits (set it up!)
  const day = new Date().toISOString().slice(0, 10);
  const ipKey = "ip:" + day + ":" + ip, allKey = "all:" + day;
  let a, g;
  try {
    const [ipN, allN] = await Promise.all([env.RL.get(ipKey), env.RL.get(allKey)]);
    a = parseInt(ipN || "0", 10) || 0;
    g = parseInt(allN || "0", 10) || 0;
  } catch (e) {
    console.log("KV read failed, skipping limits:", e && e.message);
    return { ok: true };
  }
  if (a >= PER_IP_DAILY) return { ok: false, why: "user" };
  if (g >= GLOBAL_DAILY) return { ok: false, why: "app" };
  try {
    await Promise.all([
      env.RL.put(ipKey, String(a + 1), { expirationTtl: 172800 }),
      env.RL.put(allKey, String(g + 1), { expirationTtl: 172800 })
    ]);
  } catch (e) {
    console.log("KV write failed, not counted:", e && e.message);
  }
  return { ok: true, left: PER_IP_DAILY - a - 1 };
}

/* ---------- usage stats (D1) ---------- */

// The only event names the app may send. Anything else is dropped.
const EVENTS = [
  "open", "install", "today_mode_toggle", "today_section_toggle", "today_day_open", "quick_add_open",
  "tab_today", "tab_gym", "tab_run", "tab_food", "tab_history", "tab_settings",
  "checkin", "set_done", "workout_done", "ex_skip", "ex_add",
  "howto_open", "video_open", "scan_machine", "gym_group_toggle", "machine_photo_request",
  "food_photo", "food_manual", "food_quick",
  "run_log", "run_gps", "shoe_finder", "shoe_set",
  "weight_log", "goal_set", "ai_summary", "ai_explain",
  "lang_en", "lang_th", "backup", "import", "sample", "onb_done", "onb_skip", "permission_explain", "permission_fallback"
];
const EVENT_SET = new Set(EVENTS);
const MAX_BATCH = 40;          // events per request
const PER_DEVICE_DAILY = 400;  // events kept per device per day (free D1: 100,000 rows written/day)
const MACHINE_REQUESTS_DAILY = 2000; // photo requests for the whole app per day, so forged device IDs cannot burn the D1 write quota
const PLATFORMS = ["android", "ios", "desktop", "other"];

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS ev (id INTEGER PRIMARY KEY, day TEXT NOT NULL, ts INTEGER NOT NULL, anon TEXT NOT NULL, ev TEXT NOT NULL, lang TEXT, plat TEXT, inst INTEGER, ver TEXT)",
  "CREATE INDEX IF NOT EXISTS ev_day ON ev(day)",
  "CREATE INDEX IF NOT EXISTS ev_anon_day ON ev(anon, day)",
  "CREATE TABLE IF NOT EXISTS machine_requests (name TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0 CHECK(count >= 0), PRIMARY KEY(name, day))",
  "CREATE INDEX IF NOT EXISTS machine_requests_day ON machine_requests(day)",
  "CREATE TABLE IF NOT EXISTS machine_request_limits (anon TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0 CHECK(count >= 0), PRIMARY KEY(anon, day))",
  "CREATE INDEX IF NOT EXISTS machine_request_limits_day ON machine_request_limits(day)"
];
// The table is created on first use, once per worker instance (no separate setup step).
const schemaReady = new WeakMap();
function ensureSchema(db) {
  let p = schemaReady.get(db);
  if (!p) {
    p = db.batch(SCHEMA.map((q) => db.prepare(q))).catch((e) => { schemaReady.delete(db); throw e; });
    schemaReady.set(db, p);
  }
  return p;
}

// Days are counted in Thai time (UTC+7).
function bkkDay(ts) { return new Date(ts + 7 * 3600e3).toISOString().slice(0, 10); }

// Turn the app's batch into rows, or null if the batch is not in the expected shape.
function cleanEvents(body, now) {
  if (!body || typeof body !== "object") return null;
  const anon = typeof body.a === "string" && /^[A-Za-z0-9-]{8,40}$/.test(body.a) ? body.a : null;
  if (!anon || !Array.isArray(body.e)) return null;
  const lang = body.l === "en" || body.l === "th" ? body.l : null;
  const plat = PLATFORMS.includes(body.p) ? body.p : "other";
  const inst = body.i === 1 || body.i === true ? 1 : 0;
  const ver = typeof body.v === "string" ? body.v.slice(0, 24) : null;
  const rows = [];
  for (const item of body.e.slice(0, MAX_BATCH)) {
    if (!Array.isArray(item) || !EVENT_SET.has(item[0])) continue;
    let ts = Number(item[1]);
    // Queued events can arrive a few days late; anything odd is filed under now.
    if (!Number.isFinite(ts) || ts < now - 8 * 864e5 || ts > now + 36e5) ts = now;
    rows.push({ day: bkkDay(ts), ts: Math.round(ts), anon, ev: item[0], lang, plat, inst, ver });
  }
  return rows;
}

async function handleEvents(request, env, origin) {
  // Stats must never break the app: every failure here still answers 204.
  if (!env.DB) return new Response(null, { status: 204, headers: cors(origin) });
  let body;
  try { body = JSON.parse(await request.text()); } catch (e) { return json({ error: "bad_json" }, 400, origin); }
  const now = Date.now();
  const rows = cleanEvents(body, now);
  if (!rows) return json({ error: "bad_request" }, 400, origin);
  if (!rows.length) return new Response(null, { status: 204, headers: cors(origin) });
  try {
    await ensureSchema(env.DB);
    const seen = await env.DB.prepare("SELECT COUNT(*) AS n FROM ev WHERE anon = ? AND day = ?").bind(rows[0].anon, bkkDay(now)).first();
    const requests = await env.DB.prepare("SELECT count AS n FROM machine_request_limits WHERE anon = ? AND day = ?").bind(rows[0].anon, bkkDay(now)).first();
    const room = PER_DEVICE_DAILY - ((seen && seen.n) || 0) - ((requests && requests.n) || 0);
    if (room > 0) {
      const ins = env.DB.prepare("INSERT INTO ev (day, ts, anon, ev, lang, plat, inst, ver) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      await env.DB.batch(rows.slice(0, room).map((r) => ins.bind(r.day, r.ts, r.anon, r.ev, r.lang, r.plat, r.inst, r.ver)));
    }
  } catch (e) {
    console.log("stats write failed:", e && e.message);
  }
  return new Response(null, { status: 204, headers: cors(origin) });
}

// The body contains only an English machine name. The existing stats anon ID is
// carried separately for the same 400/day device budget; no IP is retained.
function cleanMachineRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.prototype.hasOwnProperty.call(body, "name")) return null;
  const name = body.name;
  return typeof name === "string" && name.length <= 60 && name === name.trim().toLowerCase() && /^[a-z0-9][a-z0-9 -]*$/.test(name) && /[a-z]/.test(name) ? name : null;
}
async function handleMachineRequest(request, env, origin) {
  if (!env.DB) return json({ error: "not_configured" }, 503, origin);
  const anon = request.headers.get("X-Stats-Id") || "";
  if (!/^[A-Za-z0-9-]{8,40}$/.test(anon)) return json({ error: "bad_request" }, 400, origin);
  let name;
  try {
    // Bound the actual stream, including chunked bodies with no Content-Length.
    const reader = request.body && request.body.getReader();
    if (!reader) return json({ error: "bad_request" }, 400, origin);
    let size = 0, raw = ""; const decoder = new TextDecoder();
    while (true) { const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 160) { await reader.cancel(); return json({ error: "bad_request" }, 400, origin); }
      raw += decoder.decode(chunk.value, { stream: true });
    }
    name = cleanMachineRequest(JSON.parse(raw + decoder.decode()));
  } catch { return json({ error: "bad_request" }, 400, origin); }
  if (!name) return json({ error: "bad_request" }, 400, origin);
  try {
    await ensureSchema(env.DB);
    const day = bkkDay(Date.now()), from = bkkDay(Date.now() - 29 * 864e5);
    // D1 batch is transactional. The aggregate increments only when the budget
    // statement changed a row (device budget and app-wide daily cap), including at the
    // boundary under concurrent calls.
    const results = await env.DB.batch([
      env.DB.prepare("DELETE FROM machine_request_limits WHERE day < ?").bind(from),
      env.DB.prepare("INSERT INTO machine_request_limits (anon, day, count) SELECT ?, ?, 1 WHERE (SELECT COUNT(*) FROM ev WHERE anon = ? AND day = ?) < ? AND (SELECT COALESCE(SUM(count), 0) FROM machine_requests WHERE day = ?) < ? ON CONFLICT(anon, day) DO UPDATE SET count = count + 1 WHERE count + (SELECT COUNT(*) FROM ev WHERE anon = ? AND day = ?) < ?").bind(anon, day, anon, day, PER_DEVICE_DAILY, day, MACHINE_REQUESTS_DAILY, anon, day, PER_DEVICE_DAILY),
      env.DB.prepare("INSERT INTO machine_requests (name, day, count) SELECT ?, ?, 1 WHERE changes() > 0 ON CONFLICT(name, day) DO UPDATE SET count = count + 1").bind(name, day)
    ]);
    if (!results[2] || !results[2].meta || results[2].meta.changes !== 1) return json({ error: "limit" }, 429, origin);
    return new Response(null, { status: 204, headers: cors(origin) });
  } catch { return json({ error: "db" }, 503, origin); }
}

function sameKey(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function handleStats(request, env, origin) {
  if (!env.DB || !env.STATS_KEY) return json({ error: "not_configured" }, 503, origin);
  if (!sameKey(request.headers.get("X-Stats-Key") || "", env.STATS_KEY)) return json({ error: "key" }, 401, origin);
  const url = new URL(request.url);
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get("days") || "14", 10) || 14));
  const now = Date.now();
  const from = bkkDay(now - (days - 1) * 864e5);
  try {
    await ensureSchema(env.DB);
    const q = (sql, ...args) => env.DB.prepare(sql).bind(...args);
    const r = await env.DB.batch([
      q("SELECT day, COUNT(DISTINCT anon) AS devices, SUM(ev = 'open') AS opens, COUNT(*) AS events FROM ev WHERE day >= ? GROUP BY day ORDER BY day", from),
      q("SELECT ev, COUNT(*) AS n, COUNT(DISTINCT anon) AS devices FROM ev WHERE day >= ? GROUP BY ev ORDER BY n DESC", from),
      q("SELECT plat AS k, COUNT(DISTINCT anon) AS devices FROM ev WHERE day >= ? GROUP BY plat ORDER BY devices DESC", from),
      q("SELECT lang AS k, COUNT(DISTINCT anon) AS devices FROM ev WHERE day >= ? GROUP BY lang ORDER BY devices DESC", from),
      q("SELECT COUNT(DISTINCT anon) AS devices FROM ev WHERE day >= ?", from),
      q("SELECT COUNT(DISTINCT anon) AS devices FROM ev WHERE day >= ? AND inst = 1", from),
      q("SELECT n AS days, COUNT(*) AS devices FROM (SELECT anon, COUNT(DISTINCT day) AS n FROM ev WHERE day >= ? GROUP BY anon) GROUP BY n ORDER BY n", from),
      q("SELECT d AS day, COUNT(*) AS devices FROM (SELECT anon, MIN(day) AS d FROM ev GROUP BY anon) WHERE d >= ? GROUP BY d ORDER BY d", from),
      q("SELECT COUNT(DISTINCT anon) AS devices, COUNT(*) AS events, MIN(day) AS first FROM ev"),
      q("SELECT name, SUM(count) AS count FROM machine_requests WHERE day >= ? AND day <= ? GROUP BY name ORDER BY count DESC, name ASC LIMIT 30", bkkDay(now - 29 * 864e5), bkkDay(now))
    ]);
    const rows = (i) => (r[i] && r[i].results) || [];
    return json({
      days, from, today: bkkDay(now),
      machineRequests: rows(9), machineRequestsDays: 30,
      daily: rows(0), features: rows(1), platforms: rows(2), langs: rows(3),
      devices: (rows(4)[0] || {}).devices || 0,
      installed: (rows(5)[0] || {}).devices || 0,
      activeDays: rows(6), newDevices: rows(7),
      allTime: rows(8)[0] || { devices: 0, events: 0, first: null }
    }, 200, origin);
  } catch (e) {
    console.log("stats read failed:", e && e.message);
    return json({ error: "db" }, 500, origin);
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    const path = new URL(request.url).pathname;
    if (path === "/stats") {
      if (request.method !== "GET") return json({ error: "method" }, 405, origin);
      if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: "origin" }, 403, origin);
      return handleStats(request, env, origin);
    }
    if (request.method !== "POST") return json({ error: "method" }, 405, origin);
    if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: "origin" }, 403, origin);
    if (path === "/e") return handleEvents(request, env, origin);
    if (path === "/machine-request") return handleMachineRequest(request, env, origin);
    if (!env.GEMINI_KEY) return json({ error: "not_configured" }, 500, origin);

    let body;
    try { body = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400, origin); }
    const parts = cleanParts(body && body.parts);
    if (!parts) return json({ error: "bad_request" }, 400, origin);

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const lim = await countAndCheck(env, ip);
    if (!lim.ok) return json({ error: "limit", scope: lim.why, per_user_daily: PER_IP_DAILY }, 429, origin);

    const payload = JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: "application/json", temperature: 0.2 } });
    for (let i = 0; i < MODELS.length; i++) {
      let res, text;
      try {
        res = await fetch(UPSTREAM + MODELS[i] + ":generateContent", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_KEY },
          body: payload
        });
        if (res.status === 404 && i + 1 < MODELS.length) continue;
        text = await res.text();
      } catch (e) {
        // Google unreachable: answer like any other upstream failure (with CORS), so the app retries once
        // and then says the AI is having trouble, instead of a bare 500 the browser reports as "offline".
        console.log("Google fetch failed:", e && e.message);
        return json({ error: "upstream", status: 0 }, 502, origin);
      }
      // Never pass Google's error details through: they can mention the key or project.
      if (!res.ok) return json({ error: "upstream", status: res.status }, res.status === 429 ? 429 : 502, origin);
      return new Response(text, { status: 200, headers: { "Content-Type": "application/json", ...cors(origin) } });
    }
    return json({ error: "no_model" }, 502, origin);
  }
};
