# Machine recognition model

**No trained model or evaluation photos are included.** The app's camera, confirmation,
gym memory and manual illustrated grid work without one; automatic recognition is
unavailable until you supply a model. A confirmed ID is remembered in `S.seen` in
the existing `train-today-v1` storage/backup. This does not train a model from a photo.

## Train and export

1. Use [Teachable Machine](https://teachablemachine.withgoogle.com/), Image Project,
   standard image model (TensorFlow.js export).
2. Each class name must be an **exact existing exercise ID**, such as `chest_press`,
   `lat_pulldown`, `leg_press`. See `BASE_EX` in index.html. Never use translated
   display names. Metadata labels must all resolve to current exercises. Avoid
   device-specific custom IDs for a shared model.
3. Collect consented, varied photos: different machines of the same type, lighting,
   distances, angles and backgrounds. Avoid people. Split by physical machine /
   photo session **before** training so near-duplicates cannot cross the split.
4. Export TensorFlow.js → Download. Put `model.json`, `metadata.json`, `weights.bin`
   (or all named weight shards) in this directory. Keep the export's manifest paths.
   All shards must stay within this directory. Do not commit personal training photos.
5. Serve the app over HTTP, including a `/train-today/` prefix when verifying Pages.
   Paths resolve relative to the document; there are no root-relative `/models/` URLs.

One class selects one canonical exercise. Existing equipment may support several
movements. The guide offers related existing IDs for pec-deck/reverse pec-deck and
dumbbells; the user checks their particular machine before adding another movement.
No new exercise records or workout history are created by confirmation.

## Config and privacy

Edit `machines-config.js` (public, no secrets):

- `mode: "local"` (default): TensorFlow.js 4.22.0 and Teachable Machine Image 0.8.5
  are vendored in `vendor/`. The runtime is loaded only when requested, after a
  metadata availability check. TM does its standard center crop/224px preprocessing;
  the app first limits the source image to 512px. Nothing is uploaded, and there is
  **no Gemini fallback**. Gemini remains a separate, explicitly online option.
- `threshold: 0.85`: `>=` asks yes/no; below it shows up to three valid candidates.
  This conservative UX default is **not** a calibrated accuracy or probability
  guarantee. Tune using held-out photos and false-confirmation rates. Even high
  scores always require confirmation. Rejected IDs are excluded for that photo.
- `mode: "remote"`, `endpoint: "https://…"`: provide your own existing service.
  No backend is added here. CORS must accept this app's origin and JPEG POSTs.
  The app asks consent before sending only a resized JPEG (no original metadata,
  workout data, cookies or API key). Response: `[{"id":"leg_press","label":"Leg press",
  "confidence":0.9}]`. Scores must be finite numbers in [0,1]; only known, visible
  IDs survive. Duplicates use the highest score. Names displayed come from the app.
- `timeoutMs: 15000`: network requests/body reads are aborted on timeout. Errors,
  invalid JSON, no known matches and unreadable images leave manual selection usable.

## Prepare offline

Open online after a service worker is controlling the page, then press **Prepare model
for offline use** in Equipment. Success requires loading the actual model and caching
both vendored scripts, metadata, model topology and every weight shard. Missing models
are optional and cannot fail PWA installation. The optional `kryvos-machine-assets-v1`
cache survives shell upgrades; model requests refresh online and fall back offline.
After replacing a model, prepare it again online and test offline before relying on it.
If replacing class order/topology, clear the optional model cache first to avoid mixing
old and new artifacts after a partially failed download. Browsers may evict caches;
the app falls back to manual selection if any dependency is unavailable. Remote mode
requires a network connection and is not advertised as offline recognition.

## Evaluate separately from software tests

Use photos of unseen physical machines/sessions that were never used in training.
Include unrelated objects, empty scenes, ambiguous close-ups and unsupported machines.
Report model/export version, dataset size, class balance, top-1/top-3 accuracy, confusion
matrix, false high-confidence matches, rejection rate, latency, memory over repeated
photos and results across iPhone Safari/Android Chrome. Choose threshold on a validation
split, then report final results on a separate test split.

The model can confuse similar machines and always chooses among its trained classes;
it does not establish that equipment is safe, supports all related exercises, or is
in working order. A mock response test verifies UI/validation only. **Recognition
accuracy is not evaluated until a real model and held-out dataset are supplied.**

Runtime reference: [Teachable Machine Image](https://github.com/googlecreativelab/teachablemachine-community/tree/master/libraries/image),
[TensorFlow.js loading](https://www.tensorflow.org/js/guide/save_load).
