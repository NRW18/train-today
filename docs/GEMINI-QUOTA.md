# Gemini quota changes (v66)

This change reduces repeat requests and bounds generation. It does **not** prove
unchanged model accuracy, answer completeness or live latency. Those checks still
require an authenticated Gemini test route and a labelled test set. The PR must
remain a draft until that quality gate is run.

## Policy and API compatibility

`ai-config.js` is shared by the browser's personal-key route and the bundled
Worker. The client sends `task`, never a token budget. The Worker ignores supplied
generation config and chooses its own policy. An absent task supports old installed
clients using the previous model order and the scan budget; other unknown tasks
are rejected before any upstream call or quota write.

| Task | First model | Output cap | Image processing |
|---|---|---:|---|
| scan | Existing Gemini 3 Flash preview | 800 | Medium |
| food | Existing Gemini 3 Flash preview | 500 | Medium |
| explain | Existing Gemini 3.1 Flash-Lite | 300 | No image setting |
| week | Existing Gemini 3.1 Flash-Lite | 500 | No image setting |

Scan/food keep the full original order: 3 Flash preview, 3.1 Flash-Lite,
flash-latest. Explain/week move only Flash-Lite to the front. 404 fallback stays;
a 400 explicitly identifying an unsupported thinking/media/token config skips
only that model. Other HTTP failures retain existing retry/error behavior.
Existing validation, escaping, language rule, and guide persistence are retained.
Truncated/invalid responses are still rejected, never treated as valid JSON.

Google documentation checked on 2026-10-19:

- [REST generateContent reference](https://ai.google.dev/api/generate-content?hl=en):
  `generationConfig.responseMimeType`, `temperature`, `maxOutputTokens`,
  `thinkingConfig.thinkingLevel`, and `mediaResolution` are REST fields. The JSON
  MIME string and existing temperature are unchanged.
- [Thinking guide](https://ai.google.dev/gemini-api/docs/generate-content/thinking):
  Gemini 3 Flash and 3.1 Flash-Lite support `minimal`. This is not a guarantee of
  zero thought tokens. No `thinkingBudget` is mixed with `thinkingLevel`.
- [Model aliases](https://ai.google.dev/gemini-api/docs/models): `flash-latest`
  can change family. Its undocumented current thinking support is not guessed;
  that final fallback omits thinkingConfig, retaining compatibility.
- [Media resolution](https://ai.google.dev/gemini-api/docs/generate-content/media-resolution):
  global `generationConfig.mediaResolution: "MEDIA_RESOLUTION_MEDIUM"` works
  with multimodal models. This is a generation-level enum, not a Part object.
  Model-specific token counts in that guide take precedence over generic enum
  descriptions. Evaluate image quality; medium can lose fine detail.

## Accounting and caches

Worker quotas are still 40 successful calls/IP/day and 450 successful calls/app/day.
The preflight KV check reads only. Only a completed Google HTTP 200 triggers two
KV writes; 404/config skips, 429, 5xx and network failures do not consume app quota.
The existing one retry after proxy 502/503 therefore counts only its success.
Google may independently count failed upstream attempts against its own limits.

Only post-success accounting is serialized within an isolate; Google calls stay
parallel. The counters are re-read after success so simultaneous local requests
do not overwrite one another. KV remains eventually consistent across isolates;
this is the existing approximate limiter, not a new globally atomic reservation
system. Existing fail-open behavior on KV failure is retained. No new backend,
binding, raw client token controls, or analytics event is introduced.

Weekly cache uses the existing persisted `S.summary`, with an optional cacheKey
containing the local date, language, goal and exact weekStats data. Old summaries
without a key still load and are refreshed on the next request. Same input/day
reuses the saved result; `สรุปใหม่` / `Summarize again` forces a request. Concurrent
clicks share one pending request. Data replacement during a request cannot write
its old answer into the replacement state. No change to the storage key or backup
format is required.

Scan cache holds at most five pending/successful results in memory. SHA-256 covers
the resized image bytes represented in the request plus the prompt/known IDs and
language. Only validated results are retained, each caller gets an independent
copy, failures are evicted, and unavailable Web Crypto falls back to an ordinary
request. Nothing is saved to localStorage or uploaded on a hit. Existing explain
guide persistence remains unchanged.

## Savings: requests versus tokens

These are defensible estimates for each type, **not measured overall savings**:

| Task | New unique request: reduction in call count | Reuse | Token estimate |
|---|---:|---|---|
| scan | 0% (still one successful request) | 100% fewer calls on an in-memory hit | Gemini 3 image component ~50% lower (1120 to 560); prompt/output/thought tokens additional |
| food | 0% | No new food cache | Same ~50% image-component estimate |
| explain | 0% | Existing saved guide already avoids calls; no additional cache saving claimed | Cap 300; minimal thinking and Lite first, total saving unmeasured |
| week | 0% | 100% fewer calls for unchanged same-day input; forced refresh saves 0% calls | Cap 500; minimal thinking and Lite first, total saving unmeasured |

Scan cap is 800, food cap 500. Caps constrain a maximum; they are not tokens saved
when the old answer was already shorter. Likewise switching models does not by
itself reduce the number of requests. For a workload with cache-hit fraction h,
repeat-call reduction is 100*h percent. Compare actual `usageMetadata` token
counts and latency before claiming a combined percentage. Do not divide these
caps by a model's theoretical maximum and present that as measured savings.

## Image/quality gate: NOT RUN

No labelled set of five real machine/food photos or authenticated Gemini test
route was supplied in this session. There is no legitimate before/after accuracy
result to report. Synthetic browser photos and mocked responses prove routing
and caching only. Consequently `shrink()` stays at **1024px / JPEG 0.82**; the
requested 768px / JPEG 0.8 reduction is deliberately deferred. No fabricated
comparison, image-count, accuracy or latency claim is made.

Before marking the PR ready:

1. Prepare at least five held-out, consented machine/food photos, covering both
   tasks, clutter/small labels and mixed meals. Record expected machine IDs or
   food items/portion estimates. Keep private photos and keys out of Git/logs.
2. Use the same prompts/language and documented model versions on baseline main
   `8afb9b4` and this branch. Run both image settings (1024/.82 and 768/.8) and
   compare the new thinking/output/media policy as well as image compression.
3. Record valid JSON/completeness, correct known IDs/new exercises, food items,
   portion/kcal/protein error against references, warnings, finishReason,
   usageMetadata and elapsed time for each photo. Repeat to expose variance.
4. Compare explain safety/step coverage and weekly factual accuracy in TH/EN too.
   Small output caps include thinking tokens and can truncate answers. If any
   task regresses, adjust its budget/media/thinking/model policy and re-evaluate.
5. Adopt 768/.8 only if image results do not worsen; otherwise retain 1024/.82.
   Replace this pending status with the real per-photo results and measurements.

## Deployment

**Worker redeploy is required.** The owner must deploy from `proxy/` with the
existing secrets/bindings; `wrangler.toml` is unchanged. Wrangler bundles the
shared `../ai-config.js` import. Deploy the Worker before releasing the frontend
so task policy applies immediately. No deployment is performed by this PR.
The app shell caches ai-config.js and all seven CSS/script URLs use v66.
