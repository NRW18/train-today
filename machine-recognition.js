/* Image recognition adapter. No app state, Gemini calls, keys or analytics here. */
(function (root) {
  "use strict";
  function cleanResults(value, exercises) {
    if (!Array.isArray(value)) throw new Error("response");
    var found = new Map();
    value.forEach(function (row) {
      if (!row || typeof row.id !== "string" || typeof row.label !== "string" || !row.label.trim() ||
          typeof row.confidence !== "number" || !Number.isFinite(row.confidence) || row.confidence < 0 || row.confidence > 1) return;
      var ex = exercises.find(function (item) { return item.id === row.id && !item.hidden; });
      if (!ex) return;
      var previous = found.get(row.id);
      // UI always uses the canonical translated name, not an untrusted remote label.
      if (!previous || previous.confidence < row.confidence) found.set(row.id, { id: row.id, label: ex.name, confidence: row.confidence });
    });
    return Array.from(found.values()).sort(function (a, b) { return b.confidence - a.confidence; });
  }
  function choices(results, threshold, rejected) {
    var available = results.filter(function (row) { return (rejected || []).indexOf(row.id) < 0; });
    return { confirm: available.length > 0 && !(rejected || []).length && available[0].confidence >= threshold,
      items: available.slice(0, 3) };
  }
  async function timedFetch(url, options, timeout) {
    var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, timeout);
    try {
      var response = await root.fetch(url, Object.assign({}, options, { signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer" }));
      if (!response.ok) throw new Error("network");
      return await response.json(); // keep the timeout active while reading the body too
    } finally { clearTimeout(timer); }
  }
  function loadScript(path) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script"), timer;
      function finish(error) { clearTimeout(timer); script.onload = script.onerror = null; if (error) { script.remove(); reject(error); } else resolve(); }
      script.src = new URL(path, document.baseURI).href;
      script.onload = function () { finish(); };
      script.onerror = function () { finish(new Error("model")); };
      timer = setTimeout(function () { finish(new Error("model")); }, 15000);
      document.head.appendChild(script);
    });
  }
  function decode(blob) {
    return new Promise(function (resolve, reject) {
      var image = new Image(), url = URL.createObjectURL(blob);
      image.onload = function () { URL.revokeObjectURL(url); if (!image.naturalWidth || !image.naturalHeight) reject(new Error("image")); else resolve(image); };
      image.onerror = function () { URL.revokeObjectURL(url); reject(new Error("image")); };
      image.src = url;
    });
  }
  async function resizeImage(blob) {
    var image;
    try {
      image = await decode(blob);
      var ratio = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
      var canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      return await new Promise(function (resolve, reject) { canvas.toBlob(function (result) { if (result) resolve(result); else reject(new Error("image")); }, "image/jpeg", 0.82); });
    } catch (error) { throw new Error("image"); }
    finally { if (image) image.src = ""; }
  }
  function create(config, getExercises) {
    var modelPromise = null, assets = [];
    async function prepare() {
      if (config.mode !== "local") throw new Error("config");
      if (!modelPromise) modelPromise = (async function () {
        // Check metadata before loading the relatively large runtime. A missing model
        // is an ordinary fallback, never an upload or an app startup dependency.
        var base = new URL(config.modelPath, document.baseURI);
        if (base.origin !== new URL(document.baseURI).origin) throw new Error("config");
        assets = ["vendor/tf-4.22.0.min.js", "vendor/tm-image-0.8.5.min.js"].map(function (path) { return new URL(path, document.baseURI).href; });
        assets.push(new URL("metadata.json", base).href, new URL("model.json", base).href);
        var metadata = await timedFetch(new URL("metadata.json", base), {}, config.timeoutMs);
        if (!metadata || !Array.isArray(metadata.labels) || !metadata.labels.length ||
            metadata.labels.some(function (id) { return typeof id !== "string" || !getExercises().some(function (ex) { return ex.id === id && !ex.hidden; }); })) throw new Error("model");
        if (!root.tf) await loadScript("vendor/tf-4.22.0.min.js");
        if (!root.tmImage) await loadScript("vendor/tm-image-0.8.5.min.js");
        // Fetch topology and every weight shard explicitly: validate same-origin paths,
        // bound network waits and allow the SW to cache all successful requests.
        var topology = await timedFetch(new URL("model.json", base), {}, config.timeoutMs);
        if (!Array.isArray(topology.weightsManifest)) throw new Error("model");
        var specs = [], buffers = [];
        for (var group of topology.weightsManifest) {
          if (!Array.isArray(group.paths) || !Array.isArray(group.weights)) throw new Error("model");
          specs = specs.concat(group.weights);
          for (var path of group.paths) {
            var target = new URL(path, base);
            if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) throw new Error("model");
            assets.push(target.href);
            var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, config.timeoutMs);
            try {
              var response = await root.fetch(target.href, { signal: controller.signal, credentials: "omit" });
              if (!response.ok) throw new Error("model");
              buffers.push(new Uint8Array(await response.arrayBuffer()));
            } finally { clearTimeout(timer); }
          }
        }
        var joined = new Uint8Array(buffers.reduce(function (sum, buffer) { return sum + buffer.length; }, 0)), offset = 0;
        buffers.forEach(function (buffer) { joined.set(buffer, offset); offset += buffer.length; });
        var layers = await root.tf.loadLayersModel(root.tf.io.fromMemory({ modelTopology: topology.modelTopology, weightSpecs: specs, weightData: joined.buffer }));
        try { return new root.tmImage.CustomMobileNet(layers, metadata); }
        catch (error) { layers.dispose(); throw error; }
      })().catch(function () { modelPromise = null; throw new Error("model"); });
      return modelPromise;
    }
    async function recognizeMachine(imageBlob) {
      var blob = await resizeImage(imageBlob), results;
      if (config.mode === "local") {
        var model = await prepare(), image = await decode(blob);
        try { results = (await model.predict(image, false)).map(function (row) { return { id: row.className, label: row.className, confidence: row.probability }; }); }
        finally { image.src = ""; } // TM predict uses tf.tidy and disposes its output tensor
      } else if (config.mode === "remote") {
        var endpoint;
        try { endpoint = new URL(config.endpoint); } catch (error) { throw new Error("config"); }
        if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) throw new Error("config");
        results = await timedFetch(endpoint.href, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob }, config.timeoutMs);
      } else throw new Error("config");
      return cleanResults(results, getExercises());
    }
    async function prepareOffline() {
      await prepare();
      if (!root.caches || !root.navigator.serviceWorker || !root.navigator.serviceWorker.controller) throw new Error("offline");
      // Optional assets use a separate cache. They never enter the required shell.
      var cache = await root.caches.open("kryvos-machine-assets-v1");
      await cache.addAll(assets);
      return true;
    }
    return { recognizeMachine: recognizeMachine, prepare: prepare, prepareOffline: prepareOffline };
  }
  root.KryvosMachines = { create: create, cleanResults: cleanResults, choices: choices, resizeImage: resizeImage };
})(typeof window === "undefined" ? globalThis : window);
