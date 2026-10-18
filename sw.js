// Offline support: keep the app shell cached so it opens in the gym without internet.
// Bump VERSION whenever index.html changes so phones pick up the new version.
var VERSION = "train-today-v58";
var SHELL = ["./", "index.html", "en.js", "theme.css", "simple-flow.css", "machines-config.js", "machine-recognition.js", "assets/machines.svg", "manifest.json", "cover.jpg", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png", "assets/onboarding/athlete-male.webp", "assets/onboarding/athlete-female.webp", "assets/onboarding/runner.webp", "assets/onboarding/runner-mark.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== VERSION && k !== "kryvos-machine-assets-v1"; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // Optional models: refresh online, use a successfully cached copy offline.
  // Missing model files are never required during service worker installation.
  if (url.origin === location.origin && url.pathname.indexOf("/models/machines/") >= 0) {
    e.respondWith(fetch(req).then(function (res) {
      if (!res.ok) return caches.match(req).then(function (hit) { return hit || res; });
      var copy = res.clone();
      e.waitUntil(caches.open("kryvos-machine-assets-v1").then(function (cache) { return cache.put(req, copy); }));
      return res;
    }).catch(function () { return caches.match(req).then(function (hit) { return hit || Response.error(); }); }));
    return;
  }

  // Other pages (like stats.html) go straight to the network and are never stored as the app.
  if (req.mode === "navigate" && !/\/(index\.html)?$/.test(url.pathname)) return;

  // The app page: try the network first so updates show up, fall back to the cache offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put("index.html", copy); });
        return res;
      }).catch(function () { return caches.match("index.html"); })
    );
    return;
  }

  // Fonts and app files: cache first, then fill the cache from the network.
  if (url.origin === location.origin || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(
      caches.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          if (res && (res.ok || res.type === "opaque")) {
            var copy = res.clone();
            caches.open(VERSION).then(function (c) { c.put(req, copy); });
          }
          return res;
        });
      })
    );
  }
});
