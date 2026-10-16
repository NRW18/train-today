import { test } from "node:test";
import assert from "node:assert/strict";
import { load, html, fnSource } from "./app.mjs";

function app({ first = false, reduce = false, hidden = false, failObserver = false, missingLogo = false } = {}) {
  const timers = new Map(); let timerId = 0, observerCallback, observerStopped = false;
  const events = () => ({ listeners: new Map(), addEventListener(name, fn) { const set = this.listeners.get(name) || new Set(); set.add(fn); this.listeners.set(name, set); }, removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }, dispatch(name, event = {}) { for (const fn of [...this.listeners.get(name) || []]) fn(event); } });
  let document;
  function node(tag) {
    const element = Object.assign(events(), { tagName: tag.toUpperCase(), nodeType: 1, children: [], attrs: new Map(), inert: false, isConnected: false,
      getAttribute(key) { return this.attrs.get(key) ?? null; }, setAttribute(key, value) { this.attrs.set(key, value); }, removeAttribute(key) { this.attrs.delete(key); },
      appendChild(child) { this.children.push(child); child.parent = this; child.isConnected = this.isConnected; return child; },
      remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.isConnected = false; },
      focus() { document.activeElement = this; }, contains(target) { return target === this || this.children.some(child => child.contains(target)); },
      closest() { return this.inert || this.attrs.has("hidden") ? this : this.parent?.closest() || null; },
      cloneNode() { const clone = node(tag); clone.attrs = new Map(this.attrs); clone.className = this.className; return clone; }
    });
    return element;
  }
  const body = node("body"); body.isConnected = true;
  const classes = new Set(); body.classList = { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) };
  const content = node("main"), todayTitle = node("h2"), setup = node("div"), setupTitle = node("h2"), source = node("svg");
  body.appendChild(content); content.appendChild(todayTitle); todayTitle.isConnected = true;
  if (first) { content.inert = true; body.appendChild(setup); setup.appendChild(setupTitle); setupTitle.isConnected = true; setupTitle.setAttribute("tabindex", "-1"); }
  document = Object.assign(events(), { body, hidden, activeElement: first ? setupTitle : body,
    createElement: node,
    querySelector(selector) { return selector === "header.top .wordmark" ? missingLogo ? null : source : selector === ".profile-setup #setup-title" ? first ? setupTitle : null : todayTitle; }
  });
  const motion = Object.assign(events(), { matches: reduce });
  const window = Object.assign(events(), { matchMedia: () => motion });
  const a = load(["startOpeningSplash"], { document, window, MutationObserver: class { constructor(callback) { if (failObserver) throw Error("observer failed"); observerCallback = callback; } observe() {} disconnect() { observerStopped = true; } },
    setTimeout(fn, ms) { const id = timerId++; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id)
  }, ["splashStarted"]);
  return Object.assign(a, { timers, content, todayTitle, setup, setupTitle, motion,
    overlay: () => body.children.find(child => child.className === "splash-v2"),
    fireTimer(ms) { const timer = [...timers.values()].find(timer => timer.ms === ms); assert.ok(timer); timer.fn(); },
    addSurface() { const extra = node("div"); body.appendChild(extra); observerCallback([{ addedNodes: [extra] }]); return extra; },
    observerStopped: () => observerStopped
  });
}

test("opening uses 1050ms completion plus a 1500ms fallback and cleans up even without animation events", () => {
  for (const ms of [1050, 1500]) {
    const a = app(); a.startOpeningSplash();
    assert.deepEqual([...a.timers.values()].map(timer => timer.ms).sort((x, y) => x - y), [1050, 1500]);
    assert.equal(a.content.inert, true); assert.equal(a.document.activeElement, a.overlay());
    const extra = a.addSurface(); assert.equal(extra.inert, true);
    a.fireTimer(ms);
    assert.equal(a.overlay(), undefined); assert.equal(a.content.inert, false); assert.equal(extra.inert, false);
    assert.equal(a.document.body.classList.contains("splash-open"), false); assert.equal(a.timers.size, 0);
    assert.equal(a.document.activeElement, a.todayTitle); assert.equal(a.observerStopped(), true);
  }
});

test("reduced motion and initially hidden documents skip immediately without blocking or stealing focus", () => {
  for (const options of [{ reduce: true }, { hidden: true }]) {
    const a = app(options), previous = a.document.activeElement;
    a.startOpeningSplash(); assert.equal(a.overlay(), undefined); assert.equal(a.timers.size, 0);
    assert.equal(a.content.inert, false); assert.equal(a.document.activeElement, previous);
    a.document.hidden = false; a.startOpeningSplash(); assert.equal(a.overlay(), undefined);
  }
});

test("first-run routing stays in onboarding and restores its focus/inert state; existing users stay on Today", () => {
  for (const first of [false, true]) {
    const a = app({ first }); a.startOpeningSplash();
    a.content.setAttribute("aria-hidden", "true"); // cleanup must restore the captured value, not the temporary one
    if (first) assert.equal(a.setup.inert, true);
    a.fireTimer(1050);
    assert.equal(a.content.inert, first); assert.equal(a.content.getAttribute("aria-hidden"), null);
    assert.equal(a.document.activeElement, first ? a.setupTitle : a.todayTitle);
    if (first) assert.equal(a.setup.inert, false);
  }
  assert.ok(html.indexOf("  startOpeningSplash();") > html.lastIndexOf("if (!S.onboarded)"), "use the existing route before opening the splash");
});

test("missing logo, missing runner, setup errors and runtime errors cannot leave a blocking overlay", () => {
  for (const options of [{ missingLogo: true }, { failObserver: true }, {}]) {
    const a = app(options); a.startOpeningSplash();
    if (a.overlay()) a.window.dispatch("error");
    assert.equal(a.overlay(), undefined); assert.equal(a.content.inert, false); assert.equal(a.timers.size, 0);
    assert.equal(a.document.body.classList.contains("splash-open"), false);
  }
  const a = app(); a.startOpeningSplash(); a.overlay().children[0].children[0].dispatch("error");
  assert.equal(a.overlay(), undefined); assert.equal(a.content.inert, false);
});

test("hidden/resumed pages, tab/sheet changes and a second invocation never replay the opening", () => {
  const a = app(); a.startOpeningSplash(); a.document.hidden = true; a.document.dispatch("visibilitychange");
  a.document.hidden = false; a.document.dispatch("visibilitychange"); a.window.dispatch("pageshow", { persisted: true });
  a.startOpeningSplash(); assert.equal(a.overlay(), undefined); assert.equal(a.timers.size, 0);
  assert.equal((html.match(/^  startOpeningSplash\(\);/gm) || []).length, 1);
  assert.doesNotMatch(fnSource("startOpeningSplash"), /localStorage|sessionStorage|fetch\(|fonts\.ready|\.decode\(|navigator\.vibrate|Audio\(/);
});

test("keyboard stays on the opening, Escape cleans up and a changed motion preference skips the rest", () => {
  const a = app(); a.startOpeningSplash(); let prevented = 0;
  const event = key => ({ key, preventDefault() { prevented++; }, stopPropagation() {} });
  a.document.dispatch("keydown", event("Tab")); assert.equal(prevented, 1);
  a.document.dispatch("keydown", event("Escape")); assert.equal(a.overlay(), undefined); assert.equal(prevented, 2);
  const b = app(); b.startOpeningSplash(); b.motion.matches = true; b.motion.dispatch("change");
  assert.equal(b.overlay(), undefined); assert.equal(b.content.inert, false);
});
