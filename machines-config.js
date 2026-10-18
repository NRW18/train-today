// Public settings only. Never put API keys here. Relative paths support /train-today/.
window.MACHINE_CONFIG = Object.freeze({
  mode: "local",
  modelPath: "models/machines/",
  // >= 0.85 asks yes/no; lower scores offer up to three choices. This is a UX
  // starting point, NOT a measured accuracy claim. Calibrate on held-out photos.
  threshold: 0.85,
  endpoint: "", // remote: HTTPS endpoint accepting an image/jpeg POST, returning an array
  timeoutMs: 15000
});
