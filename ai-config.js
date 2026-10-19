/* Shared browser/Worker policy. Google REST fields verified 2026-10-19;
 * references and quality-evaluation limits: docs/GEMINI-QUOTA.md. No credentials. */
(function (root) {
  "use strict";
  var limits = { scan: 2000, food: 1000, explain: 600, week: 800 };
  var models = ["gemini-3-flash-preview", "gemini-3.1-flash-lite", "gemini-flash-latest"];
  root.KryvosAI = Object.freeze({
    validTask: function (task) { return Object.prototype.hasOwnProperty.call(limits, task); },
    models: function (task) { return task === "explain" || task === "week" ? [models[1], models[0], models[2]] : models.slice(); },
    config: function (task, model) {
      var config = { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: limits[task] || limits.scan };
      // Do not guess the thinking family behind the moving flash-latest alias.
      if (model === models[0] || model === models[1]) config.thinkingConfig = { thinkingLevel: "minimal" };
      if (task === "scan" || task === "food") config.mediaResolution = "MEDIA_RESOLUTION_MEDIUM";
      return config;
    },
    unsupportedConfig: function (status, body) {
      var message = body && body.error && body.error.message;
      return status === 400 && typeof message === "string" &&
        /thinking[_ ]?(config|level|budget)|media[_ ]?resolution|max[_ ]?output[_ ]?tokens/i.test(message) &&
        /not supported|unsupported|unknown|invalid/i.test(message);
    }
  });
})(globalThis);
