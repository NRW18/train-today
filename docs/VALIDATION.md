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

## People-free transparent equipment follow-up (2026-10-18)

- Replaced the default images with **12 transparent equipment cutouts covering
  all 15 existing exercise IDs**. No people are present. Pec-deck/rear-delt share
  one apparatus; lateral-raise/curl share dumbbells; pushup/plank share an empty
  mat. Exercise instructions, recognition mappings, recommendations, rest timer,
  navigation and saved personal thumbnails retain their existing behavior.
- These are AI-edited photographic-style examples, with reconstructed equipment
  parts, not untouched product photos. This is disclosed in Thai and English on
  the equipment page and in Photo credits. The shoulder-press example depicts an
  upright overhead press, correcting the incline-press reference. Provenance,
  original attribution, derivative licenses and the prompt set are retained in
  `assets/machines/`. AI edits used the built-in image tool; only resize/WebP
  encoding was performed afterward, preserving alpha.
- Final WebP assets: **543,490 bytes**, maximum 640 px per side. Real transparency
  and appearance were inspected against a contrasting background and in the app.
  The v60 offline shell caches these 12 files instead of the 14 old photo defaults.
  Original reference photographs remain in the repository with their credits.
- Node tests: **250/250 passed**, including preserved photo priority/fallback,
  attribution, alpha-bearing WebP, shared apparatus and canonical ID coverage.
- Browser acceptance: **16/16** layouts passed (320/360/375/430 px, Thai/English,
  light/dark), all 15 cards decoded, credits remained reachable, PWA offline reload
  and manual/confirmed machine → correct guide/rest timer passed. Controlled
  remote recognition, resize, consent and network-fallback checks also passed.
  The Thai dark 375px equipment screenshot was visually inspected.
- No model training, model-accuracy claim, backend change, physical-device test or
  merge is included. The earlier modal-return-focus finding remains outstanding.

## Approved release checks (2026-10-19)

- Owner approved publishing PR #19, including image commits `8ca3290` and
  `1161af5`. Both commits are retained. The current defaults are 12 AI-edited
  transparent equipment examples for all 15 original exercise IDs, with original
  source credits and derivative licenses. They are not trained recognition models.
- Reproduced the outstanding return-focus failure after adding a machine: drawing
  the grid removes the trigger node. The guide now retains its outside origin and
  resolves the replacement card on close. Added unit and browser regressions for
  save/redraw, nested related guides and recognition confirmation. Existing dialogs
  retain their previous element-based focus behavior.
- Reproduced a PWA update failure: older workers can recreate old caches from
  in-flight requests, and the script loader can retain old same-URL resources.
  v61 reads the current shell cache, refreshes HTTP cache during installation and
  tags CSS/scripts with `?v=61`. Only this worker's own release tag aliases the
  canonical offline asset; a future tag reaches the network instead of receiving
  an old shell. A read-only version message verifies the actual controlling worker.
- Node suite: **255/255 passed**, no skips. All prior tests remain; new focused
  coverage checks focus resolution, release tags, cache isolation and installation.
- Full browser acceptance: **16/16** layouts (320/360/375/430 × TH/EN × light/dark),
  all six tabs, decoded images and credits, keyboard/reduced motion, bottom-nav
  clearance, local/manual fallback and controlled remote flows passed.
- `tests/browser-release.cjs` successfully upgrades real repository revisions
  **v57 (`8afaafd`), v59 (`8ca3290`), v60 (`1161af5`) → v61** in synthetic profiles.
  It closes/reopens the page without deleting localStorage, compares latest
  HTML/CSS/scripts and all 12 cutouts by SHA-256 (text normalized to Git's LF),
  verifies all 15 rendered card images/contain sizing and offline reopening, and
  checks training/custom/seen/availability/food/weight/run/shoe/draft data preserved.
  Existing optional absent draft flags are compared with their original boolean
  meaning, while every set, weight, repetition and timestamp remains checked.
- Diff audited against FEATURES.md: image presentation, focus and PWA caching are
  the changed layers. Canonical exercise IDs, recommendation/nutrition/shoe/GPS
  algorithms, data key/load/import/overwrite protection and disclaimer/creator
  credit remain. No changes to proxy/, stats.html or android/. No worker deployment.
- PR inspection before final push found no merge conflicts and **zero configured
  PR check runs/statuses**; there is no Node CI workflow to report as passed.
  Local test and browser evidence above supplies the acceptance gate. Deployment
  workflow status and live-site verification are recorded in PR #19 after merging.
- Physical iPhone/Android, real camera/GPS and real model inference/accuracy remain
  untested. `models/machines/` still contains documentation only, so recognition
  accuracy and real-model readiness are not claimed.

## UI clarity follow-up (2026-10-19, separate PR)

1. Gym retains one primary camera button and a smaller `.btn.line` gallery button.
   Recognition settings default closed and contain privacy/offline preparation;
   the original illustrated manual grid remains open. Status copy is conversational
   Thai/English and does not describe an absent model as ready.
2. Ordinary links and video-link hover use blue. Delete actions remain red;
   pain/unsafe-exercise/worn-shoe warnings and form/photo errors retain red.
   Over-target calorie presentation uses yellow. Only
   color presentation changed; calculations and error handling are unchanged.
3. A single-line symptom summary below Start reads existing `S.body`, with no
   new application state. Pain is first and uses red background/ink. Edit opens
   the existing muscle choices, scrolls to check-in and focuses the first choice,
   respecting reduced motion. Existing full pain warnings remain visible.
4. Quick add has an explicit bilingual accessible name and a permanent short
   label below its icon. No first-use flag or other storage key was introduced.
5. Service worker and all six CSS/script release tags bumped together to **v63**.

- `node --test "tests/*.test.mjs"`: **260/260 passed**, no skips. Five additional
  tests cover no symptoms, soreness, painful joints, mixed symptoms/no mutation,
  and Edit focus/reduced motion. Existing changed-copy assertions were updated to
  the new expected text while retaining their behavior checks.
- `tests/browser-ui-clarity.cjs`: **16/16** sizes/languages/themes passed, including
  44px targets for controls changed in this PR, blue links, collapsed settings, existing grid, symptom
  updates/red tokens/Edit focus, quick-add dialog/return focus and no overflow.
- Original `tests/browser-simple-flow.cjs`: **16/16** layouts plus equipment,
  offline/manual, rest timer, focus and controlled local/remote regression flows
  passed. `tests/browser-release.cjs` passed **v57/v59/v60/v61 → v62**, including
  exact latest assets, offline reopening and preserved training/food/body/run/
  shoe/draft data. No changes to load/save/import, algorithm/config or backend.
- Review screenshots: [before/after directory](screenshots/ui-clarity/), Today and
  Gym in Thai/light and English/dark at 375×860. Before is main `ab1ca8d`, after is
  the UI change, both with the same synthetic empty-workout profile. Reproduce with
  `node tests/browser-ui-clarity.cjs --before` and `--screenshots-only` using the
  existing Playwright/browser environment described above.
- FEATURES.md audited: all existing controls and capabilities remain reachable;
  only secondary settings moved into a disclosure. No trained recognition model
  added, no worker redeploy needed, no actual iPhone/Android testing. This separate
  UI PR is submitted for owner review and is not merged automatically.

### PR #20 review corrections (v63)

- Restored red error messages, including dark machine sheets; calorie over-target text and ring use yellow. Ordinary links remain blue.
- Removed global button/link sizing. Scoped new target sizing to the changed controls. Quick add label is .7rem, wraps within its button, and passes font/containment checks at all 16 viewport/language/theme combinations including 320px.
- Re-ran all 260 Node tests, both 16-case browser suites, and local PWA upgrade checks; refreshed the four after screenshots. No algorithm, user-data, backend or model changes. No physical phone testing.

## App-only machine artwork (v65, 2026-10-19)

- Based on main 4ab366a (PRs #20/#21 already merged). machineArt uses MACHINE_PHOTOS or assets/machines.svg; missing canonical photos use their symbol and unknown IDs use #generic. It never reads saved scan photos. Manual grid, confirmation cards and guides share this renderer.
- Exercise toggles use the same app artwork at 48px. Failed app images retain the SVG fallback. Credits and offline image assets remain unchanged.
- No changes to load/save/import/export, train-today-v1, S.scanThumbs, exercise IDs, algorithms, Gemini scanning or transient scan comparison. FEATURES.md categories remain available; legacy thumbnail validation/storage and backup tests remain in the full suite.
- Node: 261 tests passed. App-only artwork browser acceptance: 16 viewport/theme/language combinations (320/360/375/430, light/dark, TH/EN), saved JPEG scan photos retained across reload, missing-photo SVG fallback, manual guide, current scan comparison/confirmation and no horizontal overflow. Toggle close-ups additionally check 48px dimensions at 320/375 in both themes.
- Original browser-simple-flow suite: 16 combinations plus offline/manual, recognition-controlled flows and rest/focus regression passed. Local PWA upgrade checks from v57/v59/v60/v61 to v65 verify matching assets and retained data.
- Before/after screenshots: [app-only-machine-art](screenshots/app-only-machine-art/). Before index is 4ab366a; both sides use synthetic gray JPEG scan photos. For this fixture only, the leg_press app-photo entry is omitted at runtime to demonstrate SVG fallback; production MACHINE_PHOTOS is unchanged. Gym overview and expanded toggle close-ups captured at 320/375, Thai, light/dark. Reproduce with tests/browser-machine-art.cjs, adding --before for baseline.
- No physical iPhone/Android testing; no trained model added or recognition accuracy claim. No backend change or worker deployment required. Submitted as one PR; not merged.

## Gemini quota follow-up (v66, 2026-10-19)

- Baseline main: 8afb9b4. Shared ai-config.js supplies browser/Worker task budgets (800/500/300/500), minimal supported thinking, medium media resolution for vision and Lite-first explain/week. Existing scan/food order, 404 fallback, validation, escaping, diagnostic categories, language and guide persistence remain.
- Worker reads quota before Google and writes only after 200; failures/retries do not spend app slots. The 40/450 limits and existing KV failure behavior remain. Same-isolate post-success writes serialize to avoid losing simultaneous counts; KV remains approximate across isolates.
- Weekly results reuse existing S.summary for the same data/local day/language/goal, with an explicit bilingual refresh button. Scan cache is memory-only, at most five validated results, using SHA-256 of the resized-image request plus prompt/language; concurrent hits share a pending call and each caller gets independent data.
- All 274 Node tests passed, zero skips (13 new cases). New tests prove task config, server-side ownership of budgets, unsupported-config fallback, failed/retried and concurrent quota accounting, summary invalidation/force/reload, five-entry scan cache, invalid-result eviction and original image geometry/JPEG quality.
- tests/browser-ai-quota.cjs: 16/16 combinations at 320/360/375/430 x TH/EN x light/dark; actual DOM buttons and mocked request interception verify summary reuse, explicit refresh, reload, resized scan reuse and no horizontal overflow. These are system tests, not model-quality tests.
- tests/browser-simple-flow.cjs: 16/16 original layout combinations plus manual/offline/recognition/rest/focus regression passed. tests/browser-release.cjs: v57/v59/v60/v61/v65 to v66 passed, including exact shared config bytes offline and unchanged stored training/food/body/run/shoe/draft data.
- Wrangler 4.151.2 deploy --dry-run bundled the Worker successfully (13.50 KiB, gzip 4.48 KiB), including the shared config import; nothing deployed and wrangler.toml unchanged.
- FEATURES.md preservation audit: training/recovery/recommendation algorithms and logging untouched; equipment/Gemini review, add/hide/share, timer and existing photo persistence retained; food review, runs/GPS/shoes/weight/history/settings untouched; original import/export/multi-tab protection, stats consent, PWA, accessibility and Android remain covered by the existing suite/source diff. No new analytics event or data schema/key change.
- Not evaluated: live Gemini accuracy, answer completeness, latency or aggregate token savings; no labelled five-photo set/authenticated test route was supplied. shrink remains 1024px/JPEG .82, deliberately deferring 768px/.8 pending real comparison. No physical phone testing. See GEMINI-QUOTA.md for verified API sources, savings by component and required quality gate. PR remains draft; Worker redeploy by owner is required before frontend release.

### PR #23 review corrections (v67)

- Output budgets raised for Thai: scan 2000, food 1000, explain 600, week 800, shared by personal-key and Worker paths.
- Worker detects MAX_TOKENS/CONTINUATION before accounting and returns only {error:"truncated"}, HTTP 422 with CORS. No quota writes and no same-budget automatic proxy retry; the app uses its existing translated truncation guidance.
- tests/ai-eval.mjs is opt-in, takes an image folder and GEMINI_KEY from the environment, and pairs the real app prompt/same image bytes under old versus new config. Prints names/IDs, reported token metadata, elapsed time, status and model version. No photo/key/output files are written. Defaults to five image pairs; food/English/pinned existing model options documented in GEMINI-QUOTA.md.
- Node: all 278 tests passed with zero skips, including Worker truncation/accounting, proxy non-retry, revised budgets and two evaluator tests with fake fetch plus temporary synthetic bytes. CLI --help checked. No real Gemini evaluation run or accuracy/latency claim.
- Current browser-ai-quota suite passed all 16 mobile/language/theme combinations; current production v65-to-v67 PWA upgrade passed with exact offline assets and preserved data. Worker dry-run passed (13.82 KiB, gzip 4.58 KiB); nothing deployed.
- App features/data unchanged. Image resizing stays 1024px/.82 pending real five-photo evaluation. PR stays draft; owner Worker redeploy is still required.
