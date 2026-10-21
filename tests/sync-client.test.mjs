// App side of the optional Google sign-in + sync.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { load, fnSource, html } from "./app.mjs";

test("sign-in stays hidden unless a real Google client ID is configured", () => {
  const off = load(["authOn"], { GOOGLE_CLIENT_ID: "" });
  assert.equal(off.authOn(), false);
  assert.equal(load(["authOn"], { GOOGLE_CLIENT_ID: "<script>" }).authOn(), false);
  assert.equal(load(["authOn"], { GOOGLE_CLIENT_ID: "123-abc.apps.googleusercontent.com" }).authOn(), true);
  assert.match(readFileSync(new URL("../auth-config.js", import.meta.url), "utf8"), /GOOGLE_CLIENT_ID = "";/, "shipped switched off");
});

test("the upload is the backup without any photos", () => {
  const S = { onboarded: true };
  const a = load(["stripImages", "syncPayload"], { S, snapshot: () => ({ log: [{ ts: 1 }], scanThumbs: { c_1: "data:image/webp;base64,AAA" }, food: [{ ts: 2, img: "data:image/jpeg;base64,BBB", name: "ข้าว" }] }) });
  const out = a.syncPayload();
  assert.equal("scanThumbs" in out, false);
  assert.doesNotMatch(JSON.stringify(out), /data:image/);
  assert.equal(out.food[0].name, "ข้าว"); assert.equal(out.onboarded, true);
});

test("combining keeps every entry once and this phone's custom exercises win", () => {
  const a = load(["mergeSyncData"]);
  const local = { log: [{ ts: 1, d: "push" }, { ts: 3, d: "legs" }], runs: [], food: [{ ts: 5 }], weights: [], custom: [{ id: "c_1", name: "mine" }], seen: ["a"] };
  const remote = { log: [{ ts: 1, d: "push" }, { ts: 2, d: "pull" }], runs: [{ ts: 4 }], food: [], weights: [{ ts: 6 }], custom: [{ id: "c_1", name: "theirs" }, { id: "c_2", name: "x" }], seen: ["a", "b"], scanThumbs: { c_1: "x" } };
  const m = JSON.parse(JSON.stringify(a.mergeSyncData(local, remote)));
  assert.deepEqual(m.log.map((x) => x.ts), [1, 2, 3]);
  assert.equal(m.runs.length, 1); assert.equal(m.food.length, 1); assert.equal(m.weights.length, 1);
  assert.deepEqual(m.custom.map((c) => c.name), ["mine", "x"]);
  assert.deepEqual([...m.seen].sort(), ["a", "b"]);
  assert.equal("scanThumbs" in m, false);
});

test("the session token is not part of backups or stats", () => {
  assert.doesNotMatch(fnSource("snapshot"), /kryvos-auth|token/);
  assert.doesNotMatch(fnSource("track"), /kryvos-auth|token/);
  assert.match(html, /var AUTH_KEY = "kryvos-auth"/);
});

test("applying account data keeps this phone's photos and never asks twice", () => {
  assert.match(fnSource("applyRemote"), /replace: true, quiet: true, keepThumbs: true/);
  assert.match(fnSource("importBackup"), /lost\.length && !opts\.replace/);
  assert.match(fnSource("importBackup"), /opts\.keepThumbs \? Object\.assign/);
});

test("nothing is uploaded before consent", () => {
  assert.match(fnSource("upload"), /!auth\.consent/);
  assert.match(fnSource("markSyncDirty"), /!auth\.consent/);
});
