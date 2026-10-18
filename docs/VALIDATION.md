# Simple flow and machine memory: acceptance evidence

Date: 2026-10-18. Branch: `feat/simple-flow-machine-memory`.
Inventory was committed separately **before** app changes: `2ccc053`,
[FEATURES.md](FEATURES.md). No original feature or test was removed.

## Results

- Baseline: **218/218** Node tests passed.
- Final: `node --test "tests/*.test.mjs"`: **245/245 passed**, no skipped tests.
  The additional 27 tests cover recognition, canonical gym memory, primary action,
  save status and stale asynchronous results. The test
  extractor now preserves `async` when extracting real application functions.
- `git diff --check`: clean.
- `tests/browser-simple-flow.cjs`: **16/16** mobile layout combinations passed:
  320, 360, 375, 430px × Thai/English × light/dark, using desktop Chrome headless.
  Each combination exercises all six tabs, expanded secondary options, symptom
  changes/warnings, original guides, keyboard focus/Escape/focus return, reduced
  motion and horizontal overflow. Start fits within the first 650px of each viewport.
  The last control in each tab can scroll above the fixed bottom navigation.
- Additional browser flows passed: `/train-today/` asset prefix, service worker
  install without a model, offline reload/manual grid, missing-model and failed
  preparation fallback, unreadable image, canonical confirmation/reload/no duplicate
  records, matching rest timer with −15/+15/skip, high-confidence confirmation,
  rejection/top-three, remote consent/cancel, resized JPEG POST and network failure.
  Local-mode browser requests contained **zero POST uploads**.
- Actual vendored TensorFlow.js 4.22.0 and Teachable Machine Image 0.8.5 load in
  Chrome and expose the expected API. Recognition UI tests use controlled responses;
  they do **not** measure model accuracy.
- Representative rendered screenshots visually inspected: 320px Thai light Today,
  375px English dark Today, 320px English dark Equipment (including all original
  exercise illustrations). The suite writes screenshots to OS temp
  `kryvos-simple-flow/`; synthetic test state only, not committed user data.

Run browser checks after installing Playwright externally, for example PowerShell:

```powershell
$env:PLAYWRIGHT_MODULE = 'C:/path/to/node_modules/playwright'
$env:BROWSER_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
node tests/browser-simple-flow.cjs
```

The script serves this checkout under `/train-today/` on an ephemeral local port.
It does not use the live app or a real recognition endpoint. `--flows-only` runs
just functional browser checks while iterating; final validation used the full suite.

## Feature preservation audit

| FEATURES.md category | Preservation evidence |
|---|---|
| Today / time and energy / symptoms | Existing controls and event handlers retained. Time/energy moved into More options; symptoms moved directly below the compact answer. Browser toggles tired/normal and painful knee; original today/home/sets tests pass. |
| Recommendation quality / recovery / progression | `plan`, `suggest`, `homePlan`, `exStatus`, `isPainful`, `recommend`, energy/protein/weight formulas and underlying exercise data retained. Existing today/home/goals/weekweight/sets tests pass. Start scrolls/focuses the original plan including warnings; it does not choose a different workout. |
| Per-set logging / unfinished drafts / workout save | Existing editor, tick, draft TTL and finish semantics retained. New primary action changes Start → Continue → Save using existing progress/finish. Added live dirty/saved/failure status; sets/state/overwrite tests pass. |
| Plan / meals / recovery / activity / quick actions | Original panels, nutrition mode, day detail, six tabs and quick-add remain. Quick machine entry opens the new on-device camera path. Browser visits all tabs; home/today tests pass. |
| Equipment / guides / search / videos | Original BASE_EX/GUIDE/EXBY, search and YouTube links retained. New illustrated manual grid opens original guides; browser verifies opened guides and canonical timer. videos/gym tests pass. |
| Availability / place / hide / history | Original toggles, group memory, place filtering and only-seen control retained. New memory updates existing seen/off/homeAutoOff with save rollback; no exercise/history insertion. Added reload and old/new backup tests; existing gym/state/overwrite tests pass. |
| Gemini scan and custom exercises | Existing scan/gallery/key/retry/diagnostics/review/edit/confirm/share/thumbnail/hide paths retained within an explicitly online disclosure. Browser verifies original camera remains reachable; scan-results/scan-diagnostics/retry/errors/language/ailang tests pass. No automatic Gemini fallback. |
| Rest timer / feedback | Original automatic set-rest timer, preference, controls, sound and vibration retained. New guide uses the same timer and labels the chosen exercise. Browser includes existing vibration explanation and −15/+15/skip; sets/permissions tests pass. |
| Running / GPS / recovery | No changes to GPS, manual records, route filtering/export, tab ownership, drafts or run-load rules. gps/decimals/state/permissions tests pass. Browser opens Run and its secondary shoe controls. |
| Shoe finding / mileage | Entire catalog/scoring/filter/purchase-mileage logic retained; only wrapped in a secondary disclosure. shoes/state tests pass; browser expands it at all viewports. |
| Food / portions / AI / weight / goals | Food camera, editable AI review, manual/quick/frequent meals, portions and weight graphs retained. Goals/calculator wrapped in a secondary disclosure. goals/weekweight/decimals/errors/ailang tests pass; browser expands calculator section. |
| History / weekly AI | Original graphs/timeline/weekly statistics and AI summary retained; history/weekweight/ailang tests pass, browser visits History. |
| Profile / onboarding / locale / permissions | Existing setup and onboarding retained; existing onboarding/language/i18n/splash/permissions tests pass. Every added Thai string has English. Native camera cancellation/denial keeps gallery/manual alternatives visible; no new permission gate or notification service. |
| Data / backup / sample / deletion / multiple tabs | No storage key/schema migration. Original snapshot/load/import/sample/wipe/sync code retained; added confirmed machine memory through existing seen. state/overwrite/gps tests pass, including older backups, hidden custom IDs and failed-save rollback. |
| Anonymous stats / worker / Android | No changes to proxy/, stats.html, android/ or Android workflow. No new analytics events or image/workout payloads. Existing stats/worker tests pass. Worker redeployment **not needed**. |
| PWA / themes / accessibility / credits | SW bumped v57 → v58; required new UI assets cached; absent models excluded from shell. Native disclosures/buttons, focusable plan/status, existing modal focus trap and reduced-motion rules preserved. Theme tokens, dark #0C0F14, footer medical disclaimer and exact creator credit retained. Browser offline/keyboard/layout checks pass. |

## Recognition acceptance: two separate gates

1. **System and UX readiness: passed within the tested environment**, including
   absence of a model. Interface `recognizeMachine(imageBlob)` uses configurable
   local/remote adapters; both resize, normalize/sort/deduplicate known IDs. Threshold
   boundary, top-three, malformed/unknown/duplicate results, timeout, image errors,
   local no-upload, missing/offline/runtime failures and offline cache preparation
   are covered by unit tests. Photo previews have separate labels from examples;
   object URLs and prediction images are released. TM manages per-prediction tensors.
2. **Real recognition accuracy: not evaluated.** No trained `model.json`, metadata,
   weights or held-out photo set exists in this repo. No fake model is supplied.
   Need an actual Teachable Machine image export with canonical ID labels and a
   held-out dataset from different machines/photo sessions. Evaluate top-1/top-3,
   false high-confidence matches, confusion matrix and threshold calibration as
   described in [models/machines/README.md](../models/machines/README.md).

## Limits of this evidence

- No physical iPhone/Android testing, camera hardware/OS denial testing, GPS run,
  Android APK build, screen reader session or real Gemini requests in this change.
  Browser simulation and existing unit tests are reported separately from hardware.
- Remote responses were served by a controlled browser route; no production remote
  endpoint was supplied. Timeout and malformed JSON are additionally unit tested.
- Actual offline **inference** and real-model repeated-prediction memory/latency
  cannot be verified until model files exist. Preparation caching is unit tested;
  actual PWA offline/manual fallback is browser tested. Cache eviction remains a
  browser limitation, disclosed in UI and model README.
- No backend or worker deployment, no merge to main. Owner review remains required.

## Real-photo presentation follow-up (2026-10-18)

- Replaced the default schematic presentation with 14 real photographs / credited
  photographic video stills for all 15 original exercise IDs. Pec-deck and rear-delt
  deliberately share the same apparatus example. No exercise or recognition data
  was replaced. Existing personal scan thumbnails still take priority; custom IDs
  and failed photo loads retain their schematic fallback.
- Sources, authors, license links, transformation notes and apparatus/variant
  caveats are recorded in `assets/machines/CREDITS.md` and `machine-photos.js`.
  Equipment has an accessible Photo credits dialog. No remote photo hotlinks are
  required: WebP assets total 627,802 bytes and are part of the v59 offline shell.
- Node tests: **249/249 passed**, including four photo/credit/cache/fallback tests.
- Full browser acceptance: **16/16** layouts passed; all 15 images decoded, credits
  opened/closed, and a real photo decoded after offline reload. Original machine
  confirmation, timer and local-no-upload checks also passed. Thai dark equipment
  screenshot visually inspected at 375px width after replacing the pictures.
- This changes presentation assets only. It does not train the recognition model,
  assess model accuracy, fix the separately reviewed modal-return-focus issue, or
  add physical-device testing. No worker redeployment is needed.
