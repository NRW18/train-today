import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
import { load, html, fnSource } from "./app.mjs";

const scope = {};
vm.runInNewContext(readFileSync(new URL("../machine-photos.js", import.meta.url), "utf8"), scope);
const photos = scope.MACHINE_PHOTOS;
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

test("all original 15 canonical exercises retain their transparent cutouts, attribution and offline shell entries", () => {
  const base = html.slice(html.indexOf("var BASE_EX = ["), html.indexOf("var EN_NAME = {"));
  const data={t:value=>value};vm.runInNewContext(base,data);
  const ids = Array.from(data.BASE_EX.filter(ex=>!ex.optional),ex=>ex.id);
  assert.equal(ids.length,15);
  assert.deepEqual(Object.keys(photos).sort(), ids.sort());
  assert.ok(sw.includes('"machine-photos.js"'));
  for (const photo of Object.values(photos)) {
    assert.match(photo.src, /^assets\/machines\/cutouts\/[a-z-]+\.webp$/);
    assert.ok(existsSync(new URL("../" + photo.src, import.meta.url)));
    const bytes = readFileSync(new URL("../" + photo.src, import.meta.url));
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
    assert.equal(bytes.toString("ascii", 12, 16), "VP8X");
    assert.ok(bytes[20] & 0x10, photo.src + " must retain transparency");
    assert.equal(photo.presentation, "ai-edited-cutout");
    assert.match(photo.changes, /AI-/);
    assert.ok(sw.includes(JSON.stringify(photo.src)), photo.src + " unavailable offline");
    assert.match(photo.source, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    assert.ok(photo.author && photo.title && photo.license && photo.changes);
    assert.match(photo.licenseUrl, /^https:\/\/(creativecommons\.org|commons\.wikimedia\.org)\//);
  }
});

test("shared equipment uses one file without changing the original exercise IDs", () => {
  assert.equal(new Set(Object.values(photos).map(photo => photo.src)).size, 12);
  assert.equal(photos.pec_deck.src, photos.rear_delt.src);
  assert.equal(photos.lateral_raise.src, photos.db_curl.src);
  assert.equal(photos.pushup.src, photos.plank.src);
  assert.match(photos.pushup.src, /exercise-mat/);
  assert.equal(photos.seated_row.source, photos.triceps_pushdown.source);
  assert.match(photos.shoulder_press.changes, /upright overhead/);
});

test("machineArt never reads personal photos, with or without app artwork", () => {
  const saved = {leg_press:"personal photograph",custom:"personal photograph"};
  const a = load(["machineArt"], {
    thumbnailHtml: () => { throw Error("must never read user thumbnails"); },
    S: {scanThumbs:saved}, BASE_EX: [{id:"leg_press"}], EXBY: {leg_press:{name:"Leg press"}},
    MACHINE_PHOTOS: photos, esc: value => String(value)
  });
  assert.doesNotMatch(fnSource("machineArt"), /thumbnailHtml|scanThumbs/);
  assert.match(a.machineArt("leg_press"), /class="machine-example"/);
  assert.match(a.machineArt("leg_press"), /alt="Leg press"/);
  assert.match(a.machineArt("leg_press"), /class="machine-art" hidden/);
  assert.match(a.machineArt("custom"), /assets\/machines.svg#generic/);
  assert.doesNotMatch(a.machineArt("custom"), /<img|personal photograph/);
  a.MACHINE_PHOTOS = {};
  assert.match(a.machineArt("leg_press"), /assets\/machines.svg#leg_press/);
  assert.doesNotMatch(a.machineArt("leg_press"), /<img|personal photograph/);
  delete a.MACHINE_PHOTOS;
  assert.match(a.machineArt("leg_press"), /#leg_press/);
  assert.deepEqual(a.S.scanThumbs,saved);
});

test("exercise toggles use the same app artwork, never personal thumbnails", () => {
  assert.match(fnSource("renderGym"), /machineArt\(e.id\)/);
  assert.doesNotMatch(fnSource("renderGym"), /thumbnailHtml|scanThumbs/);
});

test("an unavailable photograph reveals its illustration without touching saved user photos", () => {
  const fallback = {hidden:true, classList:{contains:value => value === "machine-art"}};
  const image = {hidden:false, nextElementSibling:fallback};
  const a = load(["machinePhotoFailed"]);
  a.machinePhotoFailed(image);
  assert.equal(image.hidden, true);
  assert.equal(fallback.hidden, false);
});

test("photo credits are reachable and preserve source, author link and license with escaped text", () => {
  const sheet = {focus() {}}, creditButton = {};
  const a = load(["showMachinePhotoCredits"], {
    sheet, $: () => creditButton, EX:[{id:"leg_press",name:"Leg press"}],
    MACHINE_PHOTOS:{leg_press:{...photos.leg_press,author:'Author <script>',authorUrl:'https://example.test/author'}},
    esc:value => String(value).replaceAll("<", "&lt;"),
    sheetHead:value => value, openSheet() {}, closeSheet() {}
  });
  a.showMachinePhotoCredits();
  assert.match(sheet.innerHTML, /Leg press/);
  assert.match(sheet.innerHTML, /Author &lt;script>/);
  assert.match(sheet.innerHTML, /https:\/\/example.test\/author/);
  assert.match(sheet.innerHTML, /creativecommons.org/);
  assert.match(sheet.innerHTML, /commons.wikimedia.org/);
});
