// Cloudflare Worker: lets the วันนี้ฝึกอะไร app use Gemini without each user entering a key.
// The Gemini key lives only in this worker as a secret (GEMINI_KEY) and is never sent to the app.
//
// Deploy: in this folder run  npx wrangler login  then  npx wrangler deploy  (settings in wrangler.toml,
// including the KV binding RL). The secret GEMINI_KEY is set once in the Cloudflare dashboard
// (Worker -> Settings -> Variables and Secrets) and deploys keep it.
//
// Limits: each visitor (by IP) gets PER_IP_DAILY calls a day, and the whole app gets GLOBAL_DAILY.
// Only requests from ALLOWED_ORIGINS are accepted from browsers. This keeps casual abuse away;
// it is not bank-grade security, so keep the limits low and watch your Gemini usage.

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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== "POST") return json({ error: "method" }, 405, origin);
    if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: "origin" }, 403, origin);
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
      const res = await fetch(UPSTREAM + MODELS[i] + ":generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_KEY },
        body: payload
      });
      if (res.status === 404 && i + 1 < MODELS.length) continue;
      const text = await res.text();
      // Never pass Google's error details through: they can mention the key or project.
      if (!res.ok) return json({ error: "upstream", status: res.status }, res.status === 429 ? 429 : 502, origin);
      return new Response(text, { status: 200, headers: { "Content-Type": "application/json", ...cors(origin) } });
    }
    return json({ error: "no_model" }, 502, origin);
  }
};
