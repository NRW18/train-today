# KRYVOS feature preservation inventory

Created before application changes on `feat/simple-flow-machine-memory` (2026-10-18).
Source of truth: HTML entry points, script functions/data, service worker, translations,
tests, Android sources and worker. README is supporting context only.
Baseline: `node --test "tests/*.test.mjs"`: **218 passed, 0 failed**.
Locations below use searchable symbols so they survive line movement.

## Today

| Existing capability | Source location | Verification / preservation criterion |
|---|---|---|
| Morning / upper, evening / legs, any time; good / normal / tired energy | index.html `#slot`, `#energy`, `seg`, `renderCheckin`, `load` | today/home/state tests; switch each option and reload |
| Muscle tap cycles clear → sore → pain; painful joints; visible symptom summaries | `bodyClick`, `chip`, `capValue`, `#cap-m`, `#cap-j` | today/sets tests; keyboard and symptom UI checks |
| PUSH/PULL/LEGS/rest, 48-hour recovery, reasons, excluded movements, pain warnings | `plan`, `exStatus`, `isPainful`, `lastTrained`, `renderPlan` | today/home/goals tests; no algorithm changes; pain remains prominent |
| Training/nutrition overview, activity days and day details, plan/meals/recovery panels | `renderTodayOverview`, `todayTotals`, `todayWeekActivity`, `showDayActivity`, `setTodaySection` | home/today/weekweight tests; all panels reachable |
| Bodyweight/home plans, time caps, focus priorities, first-week adaptation | `homePlan`, `capPlanMinutes`, `firstWeekLevel`, `focusRank`, `setTrainingPlace` | home/onboarding tests |
| Suggested load, sets/reps, double progression, fatigue and running adjustments | `suggest`, `plan`, `setMissing`, `isFirstKg` | sets/today/decimals tests; retain rules unchanged |
| Skip, restore, recommend and add exercises | `skippedBlock`, `recBlock`, `recommend`, `addBlock`, event handlers | today/home tests; existing controls retained |
| Per-set edit/tick, progress, automatic draft, finish partial workout | `prepDraft`, `editSet`, `tickSet`, `refreshProgress`, `finish`, `cleanDraft` | sets/state/overwrite tests; reload pending sets, save once |

## Equipment and rest

| Existing capability | Source location | Verification / preservation criterion |
|---|---|---|
| Canonical exercise knowledge, muscles/joints, how-to and common mistakes | `BASE_EX`, `GUIDE`, `guideHtml`, `explain`, `EXBY` | videos/scan-results tests; keep original IDs and guides |
| Expanded optional strength catalog, bilingual manual search, folded categories with remembered open state | `BASE_EX` optional entries, `machineMatches`, `renderMachineGrid`, `machineGroups`, assets/machines.svg | catalog tests and browser-catalog; all old metadata preserved, new entries default off, no custom-exercise merge; five cardio stations are catalog-only and excluded from strength planning; exact AI aliases and filter chips covered |
| YouTube Thai/English video searches, equipment search | `ytUrl`, `ytLinks`, `exVideos`, `howtoHtml`, `#howto-q` | videos/language tests; links/search remain |
| Enable/disable exercises, folded groups with remembered choice, custom group | `renderGym`, `gymGroupItems`, `toggleGymGroup`, `S.off` | gym tests; checkbox state and group persistence |
| Gym/home/both selection, only scanned equipment | `setTrainingPlace`, `placeOff`, `#only-seen`, `S.seen` | home/gym/state tests; retain place and availability rules |
| Explicit Gemini camera/gallery scanning, key/proxy choice and daily limits | `requestPhoto`, `scan`, `shrink`, `callGemini`, `callProxy`, `#key-ready` | permissions/retry/worker tests; never implicit local fallback |
| Known and proposed new exercises, diagnostic results, retry, confidence validation | `validate`, `validateScan`, `scanDiagnosticHtml`, `drawShots`, `shotItems` | scan-diagnostics/scan-results/errors tests |
| Review/select/edit/confirm, English names, AI guide generation and share | `drawShot`, `applyShot`, `explain`, `share`, `cleanCustom` | scan-results/ailang/language tests; original workflow stays available |
| Validated/compressed photo thumbnails, backup and broken image handling | `makeThumbnail`, `cleanThumbnail`, `decodeScanThumbs`, `thumbnailHtml` | scan-results/state tests |
| Hide AI exercise without destroying history; rebuild canonical index | `hideCustom`, `rebuildEx`, `ALL_EX` | state/scan-results tests; history still resolves hidden IDs |
| Automatic rest on set completion; −15/+15, skip, beep and vibration | `startRest`, `drawRest`, `beep`, `vibrateRest`, `#rest-sec` | sets/permissions tests; timer controls and preference remain |

## Running and shoes

| Existing capability | Source location | Verification / preservation criterion |
|---|---|---|
| Manual distance, minutes, run type, calculated pace and deletion | `#run-km`, `runInputs`, `renderRun`, `pace`, `cleanRuns` | decimals/small/state tests |
| GPS start/pause/resume/finish/save/discard/export; route preview | `beginGPS`, `pauseGPS`, `resumeGPS`, `finishGPS`, `saveGPSRun`, `exportGPSRun`, `gpsRouteHTML` | gps tests; all state actions reachable |
| GPS accuracy/speed filters, wake lock, visibility, draft recovery and tab ownership | `acceptGPSPoint`, `checkpointGPS`, `restoreGPS`, `withGPSLock`, `gpsVisibility` | gps/permissions tests |
| Weekly distance, load increase warning, recent run history, leg training adjustment | `weeklyKm`, `weekAdvice`, `renderRun`, `plan` | gps/shoes/today tests |
| Shoe finder: usage/arch/width/weight/budget/brands, ranked reasons and links | `SHOES`, `pickShoes`, `finderHtml`, `shoeCard`, `cleanShoeQ` | shoes tests; filters and scoring unchanged |
| Owned shoe and mileage since purchase; replacement warnings | `shoeKm`, `shoeHtml`, `cleanShoe` | shoes/state tests |

## Food and weight

| Existing capability | Source location | Verification / preservation criterion |
|---|---|---|
| Daily calories/protein, targets/rings, meal list and deletion | `renderFood`, `ring`, `mealsHtml`, `addFood`, `deleteMeal` | small/weekweight/state tests |
| Food camera/gallery, validated AI estimates, editable review before saving | `foodScan`, `validFood`, `drawFoodSheet`, `foodPrompt` | errors/ailang/permissions tests |
| Quick Thai dishes, portion multipliers, recent/frequent meals | `FOODS`, `quickHtml`, `recentMeals`, `quickFoodClick` | decimals/small/weekweight tests |
| Body weight logging, graph, weekly rate and four-week trend | `latestWeight`, `weightRate`, `weightTrend`, `spark` | weekweight/goals tests |
| Gain/lose/maintain goals, profile calculator, energy floor and protein targets | `energyPlan`, `proteinTarget`, `withGoals`, `#calc`, `#goal-h` | goals/onboarding tests; preserve formulas and safety floors |

## History, settings and platform

| Existing capability | Source location | Verification / preservation criterion |
|---|---|---|
| Workout/run timeline, exercise weight graphs, weekly totals and AI summary | `renderHistory`, `weekStats`, `renderWeek`, `weekAI` | weekweight/ailang/sets tests |
| English first / Thai locale, DOM translation and language-aware AI | `detectLanguage`, `translateDom`, `withLang`, en.js | i18n/language/ailang tests |
| Profile setup, goal/focus/time/place choices, illustrated onboarding and replay | `showProfileSetup`, `setupBody`, `showOnboarding`, `#setup-again` | onboarding/home/splash tests |
| Camera/location status, explanations, manual alternatives, vibration consent | `renderPermissions`, `explainOnce`, `showPhotoFallback` | permissions tests |
| JSON export/import (old backups), sample six days, clear personal data | `snapshot`, `importBackup`, `finishImport`, `sample`, `wipe` | state/overwrite/scan-results tests; preserve storage key `train-today-v1` |
| Concurrent-tab overwrite prevention including destructive actions | `save`, `syncFromOtherTab`, `lastSaved`, `finishImport`, storage listener | overwrite/gps tests; use existing save path |
| Anonymous analytics opt-in/out, queue/limits; no personal payload | `track`, `flushStats`, `setStatsConsent`, proxy/worker.js `EVENTS`, stats.html | stats/worker tests; photo-request event added explicitly; no image/personal payloads |
| Explicit machine photo requests, deduplication, daily counters and protected top 30 | `requestMachinePhoto`, `photoRequestHtml`, `handleMachineRequest`, `machine_requests`, stats.html | machine-requests tests; consent/tap only, English equipment label + existing anonymous ID, 400/day shared cap, fixed Bangkok 30-day window; migration/deploy documented in MACHINE-REQUESTS.md |
| Static PWA, manifest/icons, install hints/iOS instructions, offline shell/update | sw.js, manifest.json, `runInstall`, `showBar` | syntax/small tests + browser offline check; optional missing model cannot break SW install |
| Light/dark themes, theme choice, responsive six-tab navigation | theme.css, index.html styles, `.tabs`, theme control | 320/360/375/430 browser matrix, both languages/themes, no horizontal overflow |
| Focus, modal focus trap/return, escape, reduced motion, live status, splash | `openSheet`, `closeSheet`, `startOpeningSplash`, CSS media rules | splash/permissions tests + keyboard/reduced-motion browser checks |
| Medical disclaimer and creator credit | footer `.note` | retain exact credit and Thai disclaimer |
| Android TWA wrapper and APK workflow | android/app/src/main/AndroidManifest.xml, android/app/build.gradle, .github/workflows/android.yml | source diff: unchanged; real-device verification reported separately |
| Server-side Gemini proxy, quotas/CORS, anonymous stats dashboard | proxy/worker.js, proxy/wrangler.toml, stats.html | worker/stats tests; no backend change/deployment needed |

## Acceptance evidence after implementation

Record final results in `docs/VALIDATION.md`, including mapping to these categories,
browser checks, limitations and model accuracy separately. Mock recognition tests
prove application behavior only. Recognition accuracy requires an actual trained
model and a held-out photo set; neither is present in the starting repository.
