import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { load, html } from "./app.mjs";

const pure = ["gpsCoordinate", "cleanRoute", "haversine", "simplifyRoute", "newGPSSession", "gpsElapsed", "pauseGPSSession", "resumeGPSSession", "acceptGPSPoint", "gpsCurrentPace", "gpsTime", "cleanRuns", "okTs", "gpsRouteHTML"];
const lifecycle = ["gpsStoredDraft", "gpsOwnDraft", "checkpointGPS", "restoreGPS", "releaseGPSWake", "requestGPSWake", "stopGPSResources", "withGPSLock", "refreshLocationPermission", "gpsError", "gpsHeartbeat", "watchGPS", "beginGPS", "pauseGPS", "resumeGPS", "finishGPS", "gpsRunRecord", "clearGPSDraft", "saveGPSRun", "discardGPS", "gpsVisibility"];
const plain = value => JSON.parse(JSON.stringify(value));
function app(shared = new Map()) {
  let wall = 1800000000000, clock = 0, nextWatch = 0, nextTimer = 0, quota = false;
  const watches = new Map(), timers = new Map(), clears = [], vibrations = [], events = [], nodes = {}, wake = [];
  const localStorage = { getItem: key => shared.get(key) ?? null, setItem(key, value) { if (quota) throw Error("quota"); shared.set(key, String(value)); }, removeItem: key => shared.delete(key) };
  const a = load([...pure, ...lifecycle, "save", "snapshot", "dayKey", "shoeKm", "r1", "vibrateRest"], {
    Date: class extends Date { static now() { return wall; } }, performance: { now: () => clock },
    gpsSession: null, GPS_KEY: "gps-draft", gpsOwner: "owner-test-001", gpsForeign: false, gpsWatch: null, gpsTick: null, gpsEpoch: 0,
    gpsUnlock: null, gpsLockPending: false, gpsWake: null, gpsWakePending: false, gpsWakeEpoch: 0, gpsStorageOK: true, gpsCheckpointAt: 0, locationState: "unknown",
    RUN_TYPES: { easy: 1, tempo: 1 }, runType: "easy", S: { log: [], runs: [], custom: [], scanThumbs: { original: "old-photo" }, today: {}, food: [{ ts: 1, name: "old-food" }], prefs: {}, weights: [] }, KEY: "main-data",
    localStorage, window: { isSecureContext: true }, document: { hidden: false },
    $: id => nodes[id] ||= { focus() {} }, renderGPS() {}, renderAll() {}, renderPermissions() {}, toast() {}, confirm: () => true,
    explainOnce: (_, proceed) => proceed(), explanationSeen: () => true, vibrationEnabled: () => true,
    navigator: { geolocation: { watchPosition(success, error, options) { const id = nextWatch++; watches.set(id, { success, error, options }); return id; }, clearWatch(id) { clears.push(id); watches.delete(id); } }, vibrate: pattern => vibrations.push(pattern), wakeLock: { request: async () => { const lock = { released: false, async release() { this.released = true; }, addEventListener() {} }; wake.push(lock); return lock; } } },
    setInterval: fn => { const id = nextTimer++; timers.set(id, fn); return id; }, clearInterval: id => timers.delete(id), setTimeout() {},
    track: (...args) => events.push(args), esc: value => String(value)
  });
  return Object.assign(a, {
    shared, watches, timers, clears, vibrations, events, wake, nodes,
    advance(ms) { clock += ms; wall += ms; a.gpsLastTick = clock; },
    quota(value) { quota = value; },
    position(lat, lng = 0, accuracy = 5, stamp = wall) { return { timestamp: stamp, coords: { latitude: lat, longitude: lng, accuracy } }; },
    point(lat, lng = 0) { const watch = [...watches.values()][0]; watch.success(this.position(lat, lng)); },
    now: () => wall, clock: () => clock
  });
}

function storageEvent(a, event) {
  a.window.addEventListener = (name, listener) => { if (name === "storage") a.gpsStorageListener = listener; };
  const registration = html.split("\n").find(line => line.includes('window.addEventListener("storage"') && line.includes("GPS_KEY"));
  assert.ok(registration, "exercise the real GPS storage listener");
  vm.runInContext(registration, a);
  a.gpsStorageListener(event);
}

test("an expired lease never lets a stale tab checkpoint over a newer recovered run", () => {
  const a = app(); a.beginGPS(); a.point(0); a.advance(10000); a.point(.0005); a.pauseGPS();
  a.advance(16000);
  const b = app(a.shared); b.advance(26000); b.gpsOwner = "recovered-owner"; b.restoreGPS(); b.resumeGPS();
  b.point(.01); b.advance(10000); b.point(.0105); b.pauseGPS();
  const latest = a.shared.get("gps-draft");
  assert.ok(JSON.parse(latest).meters > a.gpsSession.meters * 1.9);
  a.advance(26000); // the new owner's lease has expired too
  assert.equal(a.checkpointGPS(), false);
  assert.equal(a.shared.get("gps-draft"), latest, "pagehide's checkpoint must not roll progress back");
  a.finishGPS(); assert.equal(a.S.runs.length, 0, "a stale view must not save an older version either");
});

test("deleting a draft from another tab clears tracking resources and cannot resurrect locations", async () => {
  for (const key of ["gps-draft", null]) {
    const a = app(); a.save(); const oldData = a.shared.get("main-data");
    a.beginGPS(); a.point(0); a.advance(10000); a.point(.0005); await new Promise(setImmediate);
    const queued = [...a.watches.values()][0].success, lock = a.gpsWake;
    a.shared.delete("gps-draft"); storageEvent(a, { key, newValue: null });
    assert.equal(a.gpsSession, null); assert.equal(a.watches.size, 0); assert.equal(a.timers.size, 0);
    assert.equal(lock.released, true); queued(a.position(.001));
    assert.equal(a.checkpointGPS(), false);
    assert.equal(a.shared.has("gps-draft"), false);
    assert.equal(a.shared.get("main-data"), oldData, "cleanup does not modify other saved data");
  }
});

test("route compaction keeps the active tail and never joins disconnected segments above 750 segments", () => {
  const a = app(), wall = a.now(), s = a.newGPSSession("compaction-regression", wall, 0, "easy");
  s.segments = Array.from({ length: 750 }, (_, i) => [[i * .00001, 100], [i * .00001 + .000001, 100]]);
  s.segments.push(Array.from({ length: 300 }, (_, i) => [1 + i * .000001, 100]));
  s.last = { point: [1.000299, 100], stamp: wall }; s.lastStamp = wall;
  assert.equal(a.acceptGPSPoint(s, a.position(1.0003, 100, 5, wall + 1000), wall + 1000, 1000), true);
  assert.ok(s.segments.at(-1).at(-1)[0] >= 1, "compaction retains the active segment");
  assert.equal(a.acceptGPSPoint(s, a.position(1.000301, 100, 5, wall + 2000), wall + 2000, 2000), true);
  const saved = a.simplifyRoute(s.segments);
  assert.ok(saved.flat().length <= 1500); assert.deepEqual(plain(saved.at(-1).at(-1)), [1.0003, 100]);
  for (const segment of saved) for (let i = 1; i < segment.length; i++) {
    assert.ok(a.haversine(segment[i - 1], segment[i]) < 100, "no invented edge across separate segments");
  }
  assert.ok(s.meters > .2 && s.meters < .3, "route compaction never changes the measured distance");
});

test("deleting the draft also cancels a pending Web Lock before its callback can start GPS", async () => {
  const a = app(); let acquired;
  a.navigator.locks = { request: async (_, options, callback) => { acquired = callback; } };
  a.beginGPS(); assert.equal(a.gpsLockPending, true);
  storageEvent(a, { key: "gps-draft", newValue: null });
  await acquired({});
  assert.equal(a.gpsLockPending, false); assert.equal(a.gpsSession, null); assert.equal(a.watches.size, 0); assert.equal(a.timers.size, 0);
  assert.equal(a.shared.has("gps-draft"), false);
});

test("recovery under quota can retry its unchanged latest draft but cannot overwrite another owner", () => {
  const a = app(); a.beginGPS(); a.point(0); a.advance(10000); a.point(.0005); a.pauseGPS(); a.advance(16000);
  const b = app(a.shared); b.advance(26000); b.gpsOwner = "quota-recovery-owner"; b.quota(true); b.restoreGPS();
  assert.equal(b.gpsStorageOK, false); assert.equal(b.gpsOwnDraft(), true);
  assert.equal(b.S.runs.length, 0); b.quota(false); b.finishGPS(); assert.equal(b.S.runs.length, 1);

  const c = app(); c.beginGPS(); c.point(0); c.advance(10000); c.point(.0005); c.pauseGPS(); c.advance(16000);
  const d = app(c.shared); d.advance(26000); d.gpsOwner = "stale-recovery-owner"; d.quota(true); d.restoreGPS();
  c.checkpointGPS(); // the original owner has advanced the stored snapshot after d read it
  const latest = c.shared.get("gps-draft");
  d.quota(false); assert.equal(d.gpsOwnDraft(), false); assert.equal(d.checkpointGPS(), false); assert.equal(c.shared.get("gps-draft"), latest);
});

test("haversine uses metres, handles identical points and the date line", () => {
  const a = app();
  assert.ok(Math.abs(a.haversine([0, 0], [0, 1]) - 111194.9266) < .01);
  assert.equal(a.haversine([13, 100], [13, 100]), 0);
  assert.ok(a.haversine([0, 179.999], [0, -179.999]) < 223);
});

test("GPS rejects invalid coordinates/accuracy, stale or non-increasing timestamps and speed over 7 m/s", () => {
  const a = app(), s = a.newGPSSession("session-test", a.now(), 0, "easy");
  assert.equal(a.acceptGPSPoint(s, a.position(0), a.now(), 0), true);
  a.advance(10000);
  for (const p of [a.position(91), a.position(NaN), a.position(0, 181), a.position(0, 0, 31), a.position(0, 0, -1), a.position(0, 0, NaN), a.position(0, 0, 5, s.lastStamp), a.position(0, 0, 5, a.now() + 2000), a.position(1)]) {
    assert.equal(a.acceptGPSPoint(s, p, a.now(), a.clock()), false);
  }
  assert.equal(s.meters, 0); assert.equal(s.segments[0].length, 1);
  assert.equal(a.acceptGPSPoint(s, a.position(.0005, 0, 30), a.now(), a.clock()), true);
  assert.ok(s.meters > 55 && s.meters < 56);
  a.advance(30000);
  assert.equal(a.acceptGPSPoint(s, a.position(.0006, 0, 5, a.now() - 16000), a.now(), a.clock()), false);
});

test("pause/resume excludes paused time and movement, ignores queued old fixes and starts a disconnected segment", () => {
  const a = app(); a.beginGPS(); a.point(0); a.advance(10000); a.point(.0005);
  const s = a.gpsSession, distance = s.meters, oldCallback = [...a.watches.values()][0].success;
  a.pauseGPS(); assert.equal(s.ms, 10000); assert.equal(a.watches.size, 0); assert.equal(a.timers.size, 0);
  a.advance(60000); oldCallback(a.position(.01)); assert.equal(s.meters, distance);
  a.resumeGPS(); const watch = [...a.watches.values()][0];
  watch.success(a.position(.01, 0, 5, a.now() - 1)); assert.equal(s.last, null);
  a.point(.01); assert.equal(s.meters, distance); assert.equal(s.segments.length, 2);
  a.advance(10000); a.point(.0105); assert.ok(s.meters > distance + 55 && s.meters < distance + 56);
  assert.equal(a.gpsElapsed(s, a.clock()), 20000);
});

test("GPS gaps create new segments without connecting unknown movement", () => {
  const a = app(); a.beginGPS(); a.point(0); a.advance(20000); a.point(.0005);
  assert.equal(a.gpsSession.meters, 0); assert.equal(a.gpsSession.segments.length, 2);
});

test("current pace averages about 30 seconds and becomes unavailable for stale or poor GPS and pauses", () => {
  const a = app(); a.beginGPS(); a.point(0);
  for (let i = 1; i <= 8; i++) { a.advance(5000); a.point(i * .0001); }
  assert.ok(Math.abs(a.gpsCurrentPace(a.gpsSession, a.now()) - 7.4943) < .01);
  a.advance(10001); assert.equal(a.gpsCurrentPace(a.gpsSession, a.now()), null);
  a.point(.0009); assert.notEqual(a.gpsCurrentPace(a.gpsSession, a.now()), null);
  a.gpsSession.status = "accuracy"; assert.equal(a.gpsCurrentPace(a.gpsSession, a.now()), null);
  a.pauseGPS(); assert.equal(a.gpsCurrentPace(a.gpsSession, a.now()), null);
});

test("each kilometre is marked/vibrated once; jitter repeats and resume never replay splits", () => {
  const a = app(); a.beginGPS(); a.point(0);
  for (let i = 1; i <= 21; i++) { a.advance(10000); a.point(i * .00045); }
  assert.equal(a.gpsSession.splits.length, 1); assert.equal(a.vibrations.length, 1);
  a.advance(10000); a.point(21 * .00045); assert.equal(a.vibrations.length, 1);
  a.pauseGPS(); a.advance(10000); a.resumeGPS(); a.point(.02);
  assert.equal(a.vibrations.length, 1);
  a.vibrationEnabled = () => false;
  for (let i = 1; i <= 21; i++) { a.advance(10000); a.point(.02 + i * .00045); }
  assert.equal(a.gpsSession.splits.length, 2); assert.equal(a.vibrations.length, 1);
});

test("route simplification rounds coordinates, preserves segment endpoints and caps total at 1500", () => {
  const a = app(), segments = [Array.from({ length: 2000 }, (_, i) => [13.1234567 + i / 1e6, 100]), Array.from({ length: 2000 }, (_, i) => [14 + i / 1e6, 101])];
  const route = a.simplifyRoute(segments);
  assert.equal(route.length, 2); assert.ok(route.flat().length <= 1500);
  assert.deepEqual(plain(route[0][0]), [13.12346, 100]);
  assert.deepEqual(plain(route[1].at(-1)), [14.002, 101]);
  for (const p of route.flat()) assert.equal(p[0], +p[0].toFixed(5));
  assert.equal((a.gpsRouteHTML(route).match(/<polyline/g) || []).length, 2);
  assert.doesNotMatch(a.gpsRouteHTML(route), /https?:|<image/);
});

test("malformed route imports do not discard a valid run or connect across invalid coordinates", () => {
  const a = app();
  const cleaned = a.cleanRuns([{ ts: 1, km: 5, min: 30, t: "easy", route: [[[13, 100], [NaN, 2], [14, 101]], "bad", [["13", 100], [91, 100]]] }, { ts: 2, km: 4, min: 25, route: { malicious: true } }]);
  assert.equal(cleaned.length, 2); assert.equal(cleaned[0].route.length, 2); assert.equal(cleaned[0].route.flat().length, 2);
  assert.ok(!("route" in cleaned[1]));
  const capped = a.cleanRuns([{ ts: 3, km: 5, min: 30, route: [Array.from({ length: 5000 }, () => [13, 100])] }]);
  assert.equal(capped[0].route.flat().length, 1500);
});

test("finish saves normal run fields once, cleans watcher/timer including ID zero, and preserves shoe mileage", () => {
  const a = app(); a.S.shoe = { ts: a.now() - 1, base: 100, name: "old shoe" };
  a.beginGPS(); a.point(0); a.advance(10000); a.point(.0005);
  assert.equal(a.gpsWatch, 0); assert.equal(a.gpsTick, 0);
  a.finishGPS(); a.finishGPS(); a.saveGPSRun();
  assert.equal(a.S.runs.length, 1); assert.equal(a.S.runs[0].min, 1 / 6); assert.equal(a.S.runs[0].t, "easy");
  assert.equal(a.gpsSession, null); assert.equal(a.watches.size, 0); assert.equal(a.timers.size, 0); assert.deepEqual(a.clears, [0]);
  assert.deepEqual(a.events, [["run_gps"]]); assert.equal(a.shoeKm(), 100.1);
});

test("quota failure preserves old workouts/photos/personal data and finished result; retry saves exactly once", () => {
  const a = app(); a.save(); const original = a.shared.get("main-data");
  a.beginGPS(); a.point(0); a.advance(10000); a.point(.0005); a.quota(true); a.finishGPS();
  assert.equal(a.S.runs.length, 0); assert.equal(a.shared.get("main-data"), original);
  assert.equal(a.gpsSession.state, "finished"); assert.equal(a.gpsSession.status, "save_failed"); assert.equal(a.gpsStorageOK, false);
  assert.equal(a.watches.size, 0); assert.equal(a.timers.size, 0);
  a.quota(false); assert.equal(a.saveGPSRun(), true); assert.equal(a.saveGPSRun(), false);
  const stored = JSON.parse(a.shared.get("main-data")); assert.equal(stored.runs.length, 1); assert.equal(stored.scanThumbs.original, "old-photo"); assert.equal(stored.food[0].name, "old-food");
});

test("recovery pauses an interrupted session without auto tracking/saving; finished draft stays ready for explicit save", () => {
  const a = app(); a.beginGPS(); a.point(0); a.advance(10000); a.point(.0005); a.checkpointGPS();
  const stored = JSON.parse(a.shared.get("gps-draft")); stored.updated = 0; a.shared.set("gps-draft", JSON.stringify(stored));
  const b = app(a.shared); b.gpsOwner = "second-owner"; b.restoreGPS();
  assert.equal(b.gpsSession.state, "paused"); assert.equal(b.gpsSession.ms, 10000); assert.equal(b.watches.size, 0); assert.equal(b.S.runs.length, 0);
  b.quota(true); b.finishGPS(); b.quota(false); b.checkpointGPS();
  const c = app(b.shared); c.gpsOwner = b.gpsOwner; c.restoreGPS(); assert.equal(c.gpsSession.state, "finished"); assert.equal(c.S.runs.length, 0);
  assert.equal(c.saveGPSRun(), true); assert.equal(c.S.runs.length, 1);
});

test("persisted session IDs prevent duplicate saves after reload even if draft removal fails", () => {
  const a = app(); a.beginGPS(); a.point(0); a.advance(10000); a.point(.0005); a.pauseGPS();
  a.gpsSession.state = "finished"; a.gpsSession.finishedAt = a.now(); a.checkpointGPS(); const draft = a.shared.get("gps-draft");
  a.saveGPSRun(); a.shared.set("gps-draft", draft); a.restoreGPS();
  assert.equal(a.gpsSession, null); assert.equal(a.S.runs.length, 1); assert.equal(a.shared.get("gps-draft"), undefined);
});

test("location denial pauses and cleans resources; timeout/unavailable stay recoverable without false permission grants", async () => {
  const a = app(); a.beginGPS();
  assert.equal(a.locationState, "unknown");
  a.gpsError(3); assert.equal(a.gpsSession.status, "timeout"); assert.equal(a.watches.size, 1);
  a.gpsError(2); assert.equal(a.gpsSession.status, "unavailable"); assert.equal(a.gpsSession.last, null);
  a.gpsError(1); assert.equal(a.gpsSession.state, "paused"); assert.equal(a.locationState, "denied"); assert.equal(a.watches.size, 0);
  a.navigator.permissions = { query: async () => { throw Error("not supported"); } };
  await a.refreshLocationPermission(); assert.equal(a.locationState, "unknown");
});

test("permission explanation gates watching, duplicate Start does nothing, and watch options request fresh high accuracy", () => {
  const a = app(); let proceed;
  a.explainOnce = (feature, cb) => { assert.equal(feature, "location"); proceed = cb; };
  a.beginGPS(); assert.equal(a.watches.size, 0); proceed(); a.beginGPS();
  assert.equal(a.watches.size, 1); assert.equal(a.timers.size, 1);
  assert.deepEqual(plain([...a.watches.values()][0].options), { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
});

test("a live session in another tab blocks a second session and stale callbacks after finish are ignored", () => {
  const a = app(); a.beginGPS(); a.point(0); const cb = [...a.watches.values()][0].success;
  const b = app(a.shared); b.gpsOwner = "another-owner"; b.restoreGPS(); b.beginGPS();
  assert.equal(b.gpsForeign, true); assert.equal(b.watches.size, 0);
  a.advance(10000); a.point(.0005); a.finishGPS(); cb(a.position(.001)); assert.equal(a.S.runs.length, 1);
});

test("wake lock resolves/rejects safely, releases on pause and reacquires on resume; hiding pauses", async () => {
  const a = app(); a.beginGPS(); await new Promise(setImmediate);
  assert.equal(a.wake.length, 1); assert.equal(a.gpsWake, a.wake[0]);
  a.pauseGPS(); assert.equal(a.wake[0].released, true); a.advance(1000); a.resumeGPS(); await new Promise(setImmediate);
  assert.equal(a.wake.length, 2); a.document.hidden = true; a.gpsVisibility();
  assert.equal(a.gpsSession.state, "paused"); assert.equal(a.wake[1].released, true); assert.equal(a.watches.size, 0);
  a.document.hidden = false; a.gpsVisibility(); assert.equal(a.watches.size, 0);
  const b = app(); let resolve; b.navigator.wakeLock.request = () => new Promise(done => resolve = done);
  b.beginGPS(); b.pauseGPS(); const late = { release: async () => { late.released = true; } }; resolve(late); await new Promise(setImmediate); assert.equal(late.released, true); assert.equal(b.gpsWake, null);
});

test("old runs keep their fields and GPS data cannot enter the AI weekly payload or analytics", () => {
  const a = app(), old = { ts: 123, km: 5, min: 30, t: "easy" };
  assert.deepEqual(plain(a.cleanRuns([old])[0]), old);
  const start = html.indexOf("function weekStats("), end = html.indexOf("function renderWeek(", start);
  assert.ok(start > 0); assert.doesNotMatch(html.slice(start, end), /\.route|\.segments|gpsSession/);
  assert.match(html, /track\("run_gps"\)/); assert.doesNotMatch(html, /track\("run_gps",/);
});

test("a suspended timer pauses at its last live heartbeat and never counts the gap", () => {
  const a = app(); a.beginGPS(); a.point(0); a.advance(5000); a.point(.0001);
  a.advance(60000); a.gpsLastTick = 5000;
  [...a.timers.values()][0]();
  assert.equal(a.gpsSession.state, "paused"); assert.equal(a.gpsSession.status, "interrupted"); assert.equal(a.gpsSession.ms, 5000);
  assert.equal(a.watches.size, 0); assert.equal(a.timers.size, 0); assert.equal(a.S.runs.length, 0);
});

test("Web Lock serializes simultaneous starts and is released on pause, without waiting on another run", async () => {
  let held = false;
  const locks = { request: async (_, options, callback) => {
    assert.equal(options.ifAvailable, true);
    if (held) return callback(null);
    held = true; try { return await callback({}); } finally { held = false; }
  } };
  const a = app(), b = app(); a.navigator.locks = b.navigator.locks = locks;
  a.beginGPS(); b.beginGPS(); await new Promise(setImmediate);
  assert.equal(a.watches.size, 1); assert.equal(b.watches.size, 0); assert.equal(b.gpsForeign, true);
  a.pauseGPS(); await new Promise(setImmediate); assert.equal(held, false);
});

test("wake lock rejection and unsupported GPS do not break tracking or request fake permissions", async () => {
  const a = app(); a.navigator.wakeLock.request = async () => { throw Error("denied"); };
  a.beginGPS(); await new Promise(setImmediate); assert.equal(a.watches.size, 1); assert.equal(a.gpsWake, null); assert.equal(a.gpsWakePending, false);
  const b = app(); delete b.navigator.geolocation; b.beginGPS(); assert.equal(b.gpsSession, null); assert.equal(b.watches.size, 0);
  const c = app(); c.window.isSecureContext = false; c.beginGPS(); assert.equal(c.gpsSession, null);
});

test("finishing without accepted distance never auto saves a fake run", () => {
  const a = app(); a.beginGPS(); a.advance(5000); a.finishGPS();
  assert.equal(a.S.runs.length, 0); assert.equal(a.gpsSession.status, "no_data"); assert.equal(a.watches.size, 0); assert.equal(a.gpsRunRecord(), null);
});
