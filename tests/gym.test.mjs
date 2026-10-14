import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./app.mjs";

function app(count = 9, stored = null, blocked = false) {
  const nodes = {};
  const storage = { value: stored, getItem() { if (blocked) throw Error("blocked"); return this.value; }, setItem(key, value) { if (blocked) throw Error("blocked"); this.value = value; } };
  const events = [];
  const a = load(["readGymGroups", "gymGroupOpen", "gymGroupItems", "gymGroupLabel", "toggleGymGroup", "updateGymCounts", "renderGym"], {
    esc: (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;"),
    EX: Array.from({ length: count }, (_, i) => ({ id: "ex" + i, name: "Machine " + i, day: i % 2 ? "pull" : "push", ai: i === count - 1 })),
    ORDER: ["push", "pull", "legs"], DAYS: { push: { name: "PUSH" }, pull: { name: "PULL" }, legs: { name: "LEGS" } },
    S: { off: ["ex0"], seen: ["ex1"], scanned: false }, localStorage: storage,
    $: (id) => nodes[id] ||= { value: "", hidden: false },
    howtoHtml: () => "", getKey: () => "", hasAI: () => false, ownKeyOpen: false, PROXY_URL: "", pressed: () => {},
    track: (event) => events.push(event)
  }, ["GYM_GROUP_KEY", "gymGroups"]);
  return { a, nodes, storage, events };
}

test("gym groups default open through 8 items and folded above 8; saved choices override defaults", () => {
  assert.equal(app(8).a.gymGroupOpen("push"), true);
  assert.equal(app(9).a.gymGroupOpen("push"), false);
  const { a } = app(9, '{"push":true,"pull":false,"custom":"false"}');
  assert.equal(a.gymGroupOpen("push"), true);
  assert.equal(a.gymGroupOpen("pull"), false);
  assert.equal(a.gymGroupOpen("custom"), false);
});

test("gym storage tolerates invalid JSON and blocked reads and writes", () => {
  assert.equal(app(9, "broken").a.gymGroupOpen("push"), false);
  const { a } = app(9, null, true);
  const button = { dataset: { gymGroup: "push" }, getAttribute: () => "false", setAttribute() {} };
  assert.doesNotThrow(() => a.toggleGymGroup(button));
  assert.equal(a.gymGroupOpen("push"), true);
});

test("gym rendering separates custom exercises and preserves checkboxes, delete and scanned tags", () => {
  const { a, nodes } = app();
  a.renderGym();
  const markup = nodes.equip.innerHTML;
  assert.equal((markup.match(/data-ex=/g) || []).length, 9);
  assert.equal((markup.match(/data-ex="ex8"/g) || []).length, 1);
  assert.match(markup, /PUSH · 3\/4 เปิดอยู่/);
  assert.match(markup, /กำหนดเอง · 1\/1 เปิดอยู่/);
  assert.match(markup, /aria-expanded="false" aria-controls="equip-group-push"/);
  assert.match(markup, /id="equip-group-push" hidden/);
  assert.match(markup, /data-del="ex8"/);
  assert.match(markup, /class="ai-tag">สแกนเจอ/);
  assert.match(markup, /data-ex="ex0"><\/label>/);
  assert.equal(nodes["only-seen"].hidden, false);
});

test("toggling persists only that group's state, updates accessibility and tracks usage", () => {
  const { a, nodes, storage, events } = app();
  let expanded = "false";
  const button = { dataset: { gymGroup: "custom" }, getAttribute: () => expanded, setAttribute: (key, value) => { expanded = value; } };
  a.toggleGymGroup(button);
  assert.equal(expanded, "true");
  assert.equal(nodes["equip-group-custom"].hidden, false);
  assert.deepEqual(JSON.parse(storage.value), { custom: true });
  assert.equal(app(9, storage.value).a.gymGroupOpen("custom"), true);
  a.toggleGymGroup(button);
  assert.equal(expanded, "false");
  assert.equal(nodes["equip-group-custom"].hidden, true);
  assert.deepEqual(events, ["gym_group_toggle", "gym_group_toggle"]);
});
