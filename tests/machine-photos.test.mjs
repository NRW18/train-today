import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
import { load, html, fnSource } from "./app.mjs";

const scope = {};
vm.runInNewContext(readFileSync(new URL("../machine-photos.js", import.meta.url), "utf8"), scope);
const photos = scope.MACHINE_PHOTOS;
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

test("equipment references cover canonical IDs with licensed, compact local WebP files", () => {
  const base = html.slice(html.indexOf("var BASE_EX = ["), html.indexOf("var EN_NAME = {"));
  const data={t:value=>value};vm.runInNewContext(base,data);
  const ids = Array.from(data.BASE_EX,ex=>ex.id);
  for (const id of data.BASE_EX.filter(ex=>!ex.optional).map(ex=>ex.id)) assert.ok(photos[id],id+" retains artwork");
  assert.ok(sw.includes('"machine-photos.js"'));
  for (const [id,photo] of Object.entries(photos)) {
    assert.ok(ids.includes(id),id+" is a canonical machine");
    assert.match(photo.src, /^assets\/machines\/cutouts\/[a-z-]+\.webp$/);
    assert.ok(existsSync(new URL("../" + photo.src, import.meta.url)));
    const bytes = readFileSync(new URL("../" + photo.src, import.meta.url));
    assert.ok(bytes.length <= 60000, photo.src + " must be at most 60 KB");
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
    assert.equal(photo.presentation,"photograph",id+" uses an actual photographic source");
    assert.match(photo.source, /^https:\/\/(?:commons\.wikimedia\.org\/wiki\/File:|www\.flickr\.com\/photos\/[a-zA-Z0-9@_-]+\/\d+\/)/);
    assert.ok(photo.author && photo.title && photo.license && photo.changes);
    assert.match(photo.licenseUrl, /^https:\/\/(creativecommons\.org|commons\.wikimedia\.org)\//);
    assert.match(photo.changes,/AI-assisted background extraction/);
    assert.equal(photo.backgroundRemoved,true,id+" has its surroundings removed");
    assert.equal(photo.singleEquipment,true,id+" is one selected equipment item");
    assert.equal(bytes.toString("ascii",12,16),"VP8X");
    assert.ok(bytes[20] & 0x10,photo.src+" retains alpha transparency");
    assert.equal(sw.includes(JSON.stringify(photo.src)),false,photo.src+" loads on demand, not at install");
  }
});

test("cardio has real photographs and shared equipment keeps source attribution", () => {
  for(const id of ["treadmill","stationary_bike","elliptical","stair_climber","rower","incline_chest_press","smith_bench_press","cable_fly","lying_leg_curl","biceps_curl_machine","chest_supported_row","triceps_extension_machine","lateral_raise_machine","hip_adduction","leg_raise_station","preacher_curl","chest_press","shoulder_press","lat_pulldown","leg_curl","triceps_dip"])
    assert.equal(photos[id].presentation,"photograph",id+" uses a photograph");
  assert.equal(photos.pec_deck.src,photos.rear_delt.src);
  assert.equal(photos.db_curl.src,photos.lateral_raise.src);
  assert.equal(photos.pushup.src,photos.plank.src);
  assert.equal(photos.smith_squat.src,photos.smith_bench_press.src);
  assert.equal(Object.values(photos).some(photo=>photo.presentation!=="photograph"),false,"no legacy AI reconstruction is displayed as machine artwork");
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
    sheet, $: () => creditButton, BASE_EX:[{id:"leg_press",name:"Leg press"},{id:"treadmill",name:"Treadmill"}], EX:[],
    MACHINE_PHOTOS:{leg_press:{...photos.leg_press,author:'Author <script>',authorUrl:'https://example.test/author'}, treadmill:photos.treadmill},
    esc:value => String(value).replaceAll("<", "&lt;"),
    sheetHead:value => value, openSheet() {}, closeSheet() {}
  });
  a.showMachinePhotoCredits();
  assert.match(sheet.innerHTML, /Leg press/);
  assert.match(sheet.innerHTML, /Treadmill/);
  assert.match(sheet.innerHTML, /no AI reconstruction/);
  assert.match(sheet.innerHTML, /Author &lt;script>/);
  assert.match(sheet.innerHTML, /https:\/\/example.test\/author/);
  assert.match(sheet.innerHTML, /creativecommons.org/);
  assert.match(sheet.innerHTML, /commons.wikimedia.org/);
});
