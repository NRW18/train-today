import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./app.mjs";

// A 2x2 JPEG generated with canvas, not a user's photo.
const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AIyAD//Z";
// Unit decoder mock. Browser checks separately use Chrome's real JPEG decoder.
class DecodedImage {
  naturalWidth = 2; naturalHeight = 2;
  set src(value) { if (value === JPEG) this.onload(); else this.onerror(); }
}
function app(fail = () => false) {
  const messages = [], storage = new Map();
  const a = load(["decodeThumbnail", "decodeScanThumbs", "rememberShotSelection", "scanExerciseFor", "shotSelectionKey", "cleanThumbnail", "cleanScanThumbs", "save", "snapshot", "dayKey", "applyShot", "rebuildEx", "importBackup", "dataList", "draftTicked", "strList", "cleanGuide", "cleanCustom", "cleanEn", "cleanLog", "okTs", "cleanFood", "cleanW", "gpsCoordinate", "cleanRoute", "cleanRuns", "validate"], {
    atob, Image: DecodedImage, KEY: "train-today-v1", DATA_WORDS: {},
    S: { log: [{ ts: Date.now(), day: "push", entries: [{ ex: "press", sets: [{ kg: 25, reps: 10 }] }] }], custom: [], seen: [], off: [], today: { skip: [], add: [] }, food: [], runs: [], weights: [], prefs: { rest: 90 }, draft: {}, scanThumbs: {} },
    BASE_EX: [{ id: "press", name: "Press", m: ["chest"], j: ["shoulder"], t: "kg" }], EXBY: {}, EX: [],
    DAYS: { push: {} }, MUSCLES: { chest: "Chest" }, JOINTS: { shoulder: "Shoulder" },
    localStorage: { setItem(key, value) { if (fail(JSON.parse(value))) throw new Error("QuotaExceededError"); storage.set(key, value); } },
    toast: (msg) => messages.push(msg), confirm: () => true, renderAll() {}, renderGym() {}, renderPlan() {}, shotChanged() {}, shots: {}
  });
  a.rebuildEx(); a.messages = messages; a.storage = storage;
  return a;
}
function select(a, known = true) {
  a.shots.photo = { img: JPEG, r: { equipment: [{ ids: ["press"], conf: 0.9 }], fresh: [] } };
  const input = { dataset: { known: "press" }, checked: known };
  return { querySelectorAll(selector) { return selector === "input[data-known], input[data-new]" || selector.includes("known") && known ? [input] : []; } };
}

test("thumbnail validator accepts small JPEG only, enforcing encoded size and dimensions", () => {
  const a = app();
  assert.equal(a.cleanThumbnail(JPEG), JPEG);
  for (const invalid of [null, "https://example.com/a.jpg", JPEG.replace("jpeg", "png"), "data:image/jpeg;base64," + btoa("not a JPEG"), JPEG + "A".repeat(25000), JPEG.slice(0, -8), "data:image/svg+xml;base64," + btoa("<svg/>"), "data:image/jpeg;base64,%%%%"]) assert.equal(a.cleanThumbnail(invalid), "");
  const bytes = Buffer.from(JPEG.split(",")[1], "base64");
  const sof = bytes.indexOf(Buffer.from([255,192]));
  bytes.writeUInt16BE(321, sof + 7);
  assert.equal(a.cleanThumbnail("data:image/jpeg;base64," + bytes.toString("base64")), "", "a full-size JPEG is not a thumbnail");
});

test("thumbnail compression retries large JPEG output and handles unavailable canvas without rejecting the scan", async () => {
  let attempts = 0;
  class ImageStub {
    naturalWidth = 3000; naturalHeight = 2000;
    set src(value) { this.naturalWidth = value === JPEG ? 2 : 3000; this.naturalHeight = value === JPEG ? 2 : 2000; this.onload(); }
  }
  const canvas = { getContext: () => ({ drawImage() {} }), toDataURL: () => ++attempts < 4 ? JPEG + "A".repeat(25000) : JPEG };
  const a = load(["makeThumbnail", "cleanThumbnail", "decodeThumbnail"], { Image: ImageStub, atob, document: { createElement: () => canvas } });
  assert.equal(await a.makeThumbnail("temporary analysis image"), JPEG);
  assert.ok(attempts >= 4); assert.ok(canvas.width <= 320 && canvas.height <= 320);
  canvas.getContext = () => { throw new Error("canvas unavailable"); };
  assert.equal(await a.makeThumbnail("temporary analysis image"), "", "a missing thumbnail must not prevent AI analysis or exercise saving");
});

test("import limits thumbnails to 30 verified exercise IDs and drops malformed values", async () => {
  const a = app(), ids = Array.from({ length: 40 }, (_, i) => "ex" + i);
  const map = Object.fromEntries(ids.map((id) => [id, JPEG]));
  map.ex0 = "data:image/jpeg;base64," + btoa("invalid"); map.unknown = JPEG;
  const clean = a.cleanScanThumbs(map, ids);
  assert.equal(Object.keys(clean).length, 30); assert.ok(!clean.ex0 && !clean.unknown);
  await a.importBackup(JSON.stringify({ log: a.S.log, seen: ["press"], scanThumbs: { press: JPEG, unknown: JPEG } }));
  assert.deepEqual(Object.keys(a.S.scanThumbs), ["press"]);
  await a.importBackup(JSON.stringify({ log: a.S.log, scanThumbs: { press: JPEG + "A".repeat(25000) } }));
  assert.equal(Object.keys(a.S.scanThumbs).length, 0); assert.equal(a.S.log.length, 1);
  await a.importBackup(JSON.stringify({ log: a.S.log }));
  assert.equal(Object.keys(a.S.scanThumbs).length, 0, "old backups need no photo field");
});

test("saving a scan persists its thumbnail and leaves workout sets untouched", () => {
  const a = app(), before = JSON.stringify(a.S.log);
  a.applyShot("photo", select(a));
  const saved = JSON.parse(a.storage.get(a.KEY));
  assert.equal(saved.scanThumbs.press, JPEG); assert.deepEqual(saved.seen, ["press"]);
  assert.equal(JSON.stringify(saved.log), before);
  assert.equal(a.snapshot().scanThumbs.press, JPEG, "backups include the bounded thumbnail");
});

test("quota failure retries without photos and still saves the exercise and every workout", () => {
  const a = app((value) => Object.keys(value.scanThumbs).length > 0), before = JSON.stringify(a.S.log);
  a.applyShot("photo", select(a));
  const saved = JSON.parse(a.storage.get(a.KEY));
  assert.equal(Object.keys(saved.scanThumbs).length, 0); assert.deepEqual(saved.seen, ["press"]);
  assert.equal(JSON.stringify(saved.log), before); assert.ok(a.messages.some((x) => x.includes("รูปย่อ")));
  assert.match(a.shots.photo.msg, /ไม่มีรูปย่อใหม่/);
});

test("total storage failure leaves the previous saved data intact and scan retryable", () => {
  let blocked = false;
  const a = app(() => blocked); a.S.scanThumbs.previous = JPEG;
  a.save(); const persisted = a.storage.get(a.KEY), before = JSON.stringify(a.S), box = select(a);
  blocked = true; a.applyShot("photo", box);
  assert.equal(a.storage.get(a.KEY), persisted); assert.equal(JSON.stringify(a.S), before);
  assert.equal(a.shots.photo.msg, ""); assert.ok(a.messages.some((x) => x.includes("บันทึกไม่สำเร็จ")));
  blocked = false; a.applyShot("photo", box);
  const saved = JSON.parse(a.storage.get(a.KEY));
  assert.equal(saved.scanThumbs.previous, JPEG); assert.equal(saved.scanThumbs.press, JPEG);
  assert.deepEqual(saved.log, JSON.parse(before).log); assert.deepEqual(saved.seen, ["press"]);
});

test("quota fallback removes only new thumbnails and preserves existing photos and personal data", () => {
  const attempts = [];
  const a = app((value) => { attempts.push(value); return !!value.scanThumbs.press; });
  a.S.scanThumbs.previous = JPEG;
  a.S.food = [{ ts: Date.now(), name: "Lunch", kcal: 500, p: 20 }];
  a.S.weights = [{ ts: Date.now(), kg: 65 }]; a.S.runs = [{ ts: Date.now(), km: 5, min: 30 }];
  a.S.profile = { age: 25, h: 170 }; a.S.shoe = { name: "Old pair", base: 120 };
  a.S.draft = { press: [{ kg: 25, reps: 10, done: true }] };
  const before = JSON.parse(JSON.stringify(a.S));
  a.applyShot("photo", select(a));
  assert.equal(attempts.length, 2);
  const saved = JSON.parse(a.storage.get(a.KEY));
  assert.equal(saved.scanThumbs.previous, JPEG); assert.ok(!saved.scanThumbs.press);
  for (const field of ["log", "food", "weights", "runs", "profile", "shoe", "draft", "prefs"]) assert.deepEqual(saved[field], before[field], field);
  assert.equal(a.S.scanThumbs.previous, JPEG); assert.match(a.shots.photo.msg, /รูปเดิมยังอยู่ครบ/);
});

test("ordinary saves never discard old thumbnails to force a write under quota", () => {
  const a = app((value) => Object.keys(value.scanThumbs).length > 0);
  a.S.scanThumbs.previous = JPEG;
  assert.equal(a.save(), false); assert.equal(a.S.scanThumbs.previous, JPEG);
  assert.equal(a.storage.size, 0);
});

test("unchecked selections survive redraw state and a failed save followed by successful retry", () => {
  let blocked = true;
  const a = app(() => blocked);
  a.BASE_EX.push({ id: "row", name: "Row", m: ["chest"], t: "kg" }); a.rebuildEx();
  a.shots.photo = { img: JPEG, r: { equipment: [{ ids: ["press", "row"], conf: .95 }], fresh: [] } };
  const inputs = [{ dataset: { known: "press" }, checked: false }, { dataset: { known: "row" }, checked: true }];
  const box = { querySelectorAll: (selector) => selector === "input[data-known], input[data-new]" ? inputs : selector.includes("known") ? inputs.filter((input) => input.checked) : [] };
  a.rememberShotSelection(a.shots.photo, box);
  assert.equal(a.shots.photo.selection[a.shotSelectionKey({ id: "press" })], false);
  a.applyShot("photo", box);
  assert.equal(a.shots.photo.selection["known:press"], false); assert.ok(!a.shots.photo.msg);
  blocked = false; a.applyShot("photo", box);
  assert.deepEqual(JSON.parse(a.storage.get(a.KEY)).seen, ["row"]);
  assert.equal(a.shots.photo.selection["known:press"], false);
});

test("restored exercise preview uses canonical muscles, level inputs and guide without overwriting them", () => {
  const a = app();
  a.S.custom = [{ id: "c_old", name: "Old press", day: "push", m: ["chest"], j: ["shoulder"], t: "kg", hidden: true, guide: { how: ["One", "Two", "Three"] } }];
  a.rebuildEx();
  const fresh = { name: "Old press", day: "pull", m: ["back"], j: [], back: "c_old" };
  const item = { fresh, k: 0 };
  assert.equal(a.scanExerciseFor(item), a.EXBY.c_old);
  assert.deepEqual(Array.from(a.scanExerciseFor(item).m), ["chest"]);
  a.shots.photo = { img: JPEG, r: { equipment: [], fresh: [fresh] } };
  const input = { dataset: { new: "0" }, checked: true };
  a.applyShot("photo", { querySelectorAll: (selector) => selector === "input[data-known], input[data-new]" || selector.includes("data-new]:checked") ? [input] : [] });
  const saved = JSON.parse(a.storage.get(a.KEY)).custom[0];
  assert.deepEqual(saved.m, ["chest"]); assert.equal(saved.day, "push"); assert.equal(saved.guide.how.length, 3);
});

test("malformed and undecodable JPEG imports discard only the photo, preserving valid backup data", async () => {
  const a = app();
  const malformed = "data:image/jpeg;base64,/9j/wAAICAABAAEA/9k=";
  // Frame + scan headers with invalid sample precision: header-shaped, not decodable.
  const undecodable = "data:image/jpeg;base64," + Buffer.from([255,216,255,192,0,17,0,0,1,0,1,3,1,17,0,2,17,0,3,17,0,255,218,0,12,3,1,0,2,17,3,17,0,63,0,0,255,217]).toString("base64");
  assert.equal(a.cleanThumbnail(malformed), "");
  assert.equal(a.cleanThumbnail(undecodable), undecodable, "decoder must check beyond the structural size guard");
  assert.equal(await a.decodeThumbnail(undecodable), "");
  for (const image of [malformed, undecodable]) {
    const log = JSON.parse(JSON.stringify(a.S.log));
    await a.importBackup(JSON.stringify({ log, seen: ["press"], scanThumbs: { press: image } }));
    assert.equal(Object.keys(a.S.scanThumbs).length, 0); assert.deepEqual(JSON.parse(JSON.stringify(a.S.log)), log);
    assert.ok(a.S.seen.includes("press"));
  }
});

test("broken thumbnail UI is hidden while its exercise and workout remain usable", () => {
  const a = load(["hideBrokenThumbnail"], { S: { scanThumbs: { press: "broken" }, seen: ["press"], log: [{ ts: 1 }] } });
  const image = { dataset: { thumbId: "press" }, getAttribute: () => "broken", removeAttribute() { this.removed = true; } };
  a.hideBrokenThumbnail(image);
  assert.equal(image.hidden, true); assert.equal(image.removed, true);
  assert.ok(!a.S.scanThumbs.press); assert.ok(a.S.seen.includes("press")); assert.equal(a.S.log.length, 1);
});

test("decoder checks actual dimensions, decode failures and the 30-photo limit", async () => {
  const a = app();
  const ids = Array.from({ length: 40 }, (_, i) => "ex" + i);
  assert.equal(Object.keys(await a.decodeScanThumbs(Object.fromEntries(ids.map((id) => [id, JPEG])), ids)).length, 30);
  a.Image = class { naturalWidth = 321; naturalHeight = 2; set src(value) { this.onload(); } };
  assert.equal(await a.decodeThumbnail(JPEG), "", "decoded dimensions must satisfy the cap too");
  a.Image = class { naturalWidth = 2; naturalHeight = 2; decode() { return Promise.reject(new Error("EncodingError")); } set src(value) { this.onload(); } };
  assert.equal(await a.decodeThumbnail(JPEG), "", "an onload event alone must not override a decoder error");
});

test("an import that cannot be persisted leaves existing personal data and photos intact", async () => {
  let blocked = false;
  const a = app(() => blocked); a.S.scanThumbs.press = JPEG; a.save();
  const before = JSON.stringify(a.S), persisted = a.storage.get(a.KEY); blocked = true;
  const result = await a.importBackup(JSON.stringify({ log: [], seen: ["press"], scanThumbs: { press: JPEG } }));
  assert.equal(result, false); assert.equal(JSON.stringify(a.S), before); assert.equal(a.storage.get(a.KEY), persisted);
  assert.ok(!a.messages.some((message) => message.startsWith("นำเข้า ")));
});

test("background validation never deletes a newer thumbnail while an old image is decoding", async () => {
  let failOld;
  class WaitingImage { set src(value) { failOld = () => this.onerror(); } }
  const a = load(["checkLoadedThumbnails", "decodeScanThumbs", "decodeThumbnail", "cleanScanThumbs", "cleanThumbnail"], {
    Image: WaitingImage, atob, S: { scanThumbs: { press: JPEG } }, EXBY: { press: {} }, renderGym() {}
  });
  const checking = a.checkLoadedThumbnails();
  a.S.scanThumbs.press = "a newer thumbnail";
  failOld(); await checking;
  assert.equal(a.S.scanThumbs.press, "a newer thumbnail");
});

test("the 31st thumbnail never displaces stored photos and does not block exercise saving", () => {
  const a = app(); for (let i = 0; i < 30; i++) a.S.scanThumbs["ex" + i] = JPEG;
  a.applyShot("photo", select(a));
  assert.equal(Object.keys(a.S.scanThumbs).length, 30); assert.ok(!a.S.scanThumbs.press);
  assert.ok(a.S.seen.includes("press")); assert.match(a.shots.photo.msg, /ไม่มีรูปย่อใหม่/);
});

test("no selection does not mark a scan saved, and unknown AI IDs cannot be added", () => {
  const a = app(); a.applyShot("photo", select(a, false));
  assert.ok(!a.shots.photo.msg); assert.equal(a.S.seen.length, 0);
  const result = a.validate({ equipment: [{ label_th: "Test", known: ["press", "missing"] }], new_exercises: [{ name_th: "Invalid", day: "push", muscles: ["bogus"] }] });
  assert.deepEqual(Array.from(result.equipment[0].ids), ["press"]); assert.equal(result.fresh.length, 0);
});

test("rescanning a hidden custom exercise restores the same ID, saved guide and thumbnail", () => {
  const a = app();
  a.S.custom = [{ id: "c_old", name: "Old press", m: ["chest"], j: ["shoulder"], day: "push", t: "kg", hidden: true, guide: { how: ["One", "Two", "Three"] } }];
  a.S.off = ["c_old"]; a.rebuildEx();
  a.shots.photo = { img: JPEG, r: { equipment: [], fresh: [{ name: "Old press", day: "push", m: ["chest"], j: ["shoulder"], back: "c_old" }] } };
  a.applyShot("photo", { querySelectorAll: (selector) => selector.includes("data-new") ? [{ dataset: { new: "0" } }] : [] });
  assert.equal(a.S.custom.length, 1); assert.ok(!a.S.custom[0].hidden);
  assert.ok(!a.S.off.includes("c_old")); assert.equal(a.S.custom[0].guide.how.length, 3);
  assert.equal(a.S.scanThumbs.c_old, JPEG); assert.equal(a.S.log.length, 1);
});

test("result cards reuse existing dose/guide/video data, escape AI strings and highlight only targets", () => {
  const a = load(["scanExerciseHtml", "scanMuscles", "suggest", "firstWeekLevel", "names", "restText", "exVideos", "ytLinks", "ytUrl", "thName"], {
    esc: (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
    S: { prefs: { level: 0, rest: 90 }, log: [], energy: "ok" }, GUIDE: {}, EN_NAME: {}, MUSCLES: { chest: "Chest", back: "Back" }, YT_ICON: "", HI: 12, lastEntry: () => null
  });
  const ex = { id: "c_test", name: '<img src=x onerror="alert(1)">', en: "Safe press", m: ["chest"], t: "kg", guide: { how: ["One <script>", "Two", "Three"] } };
  const card = a.scanExerciseHtml(ex, { fresh: ex, k: 0 }, false);
  assert.doesNotMatch(card, /<img|<script>/); assert.match(card, /2 เซ็ต/); assert.match(card, /8 ครั้ง/);
  assert.equal((card.match(/<li>/g) || []).length, 3); assert.match(card, /class="scan-region on" data-muscle="chest"/);
  assert.doesNotMatch(card, /class="scan-region on" data-muscle="back"/); assert.match(card, /rel="noopener noreferrer"/);
  delete ex.guide;
  assert.match(a.scanExerciseHtml(ex, { fresh: ex, k: 0 }, false), /ยังไม่มีขั้นตอนที่ครบถ้วน/);
});
