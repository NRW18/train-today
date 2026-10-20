# Machine photo requests — PR B

Depends on catalog PR #26 (`feat/machine-catalog`, based on main `faa6319`). This PR targets that branch to keep the review limited to requests. After the owner merges A, retarget/rebase B onto main before merging. No other PR is merged here. Existing open PR #25 also touches machine artwork and may need conflict resolution by the owner.

Machine list and photo status: [CATALOG.md](CATALOG.md). All 43 additions currently use SVG (`photo missing`); the 15 existing photo entries keep their credits. This PR adds no images and changes no photo metadata.

Missing-photo cards, guides and AI scan results expose a secondary Request a photo button. No request is sent on scan, render, page load or consent changes. A tap requires anonymous stats enabled, connectivity and the live Pages hostname. Localhost sends nothing. Without a validated English label, the button stays disabled; the app never falls back to the user's editable name. English names are trimmed/lowercased, limited to 60 ASCII letters/digits/spaces/hyphens, and otherwise rejected.

The POST JSON is **only** `{"name":"treadmill"}`. Header `X-Stats-Id` reuses the existing random anonymous stats ID solely for the existing 400/day device budget. No new device attributes, cookies, referrer, IP persistence, photo, weight, workout, Thai label or typed exercise name is sent. The worker rejects additional JSON fields and bodies over 160 bytes. Origin/method checks and STATS_KEY protection are retained. No Gemini call or KV write is made for a photo request.

Local key `kryvos-machine-photo-requests-v1` remembers names across reload. Requests from tabs are serialized with Web Locks where supported, with a synchronous local reservation as fallback. Failed HTTP/network requests release the reservation for an explicit retry; a 10-second timeout restores the button. There is no automatic retry. Clearing browser storage resets device-side deduplication, as with the existing anonymous stats ID.

`machine_requests(name, day, count)` has a primary key on `(name, day)`. A transactional batch reserves daily room and upserts the aggregate only when reservation succeeds. The separate `machine_request_limits` table contains only the existing anonymous ID, Bangkok day and counter; quota rows older than 30 days are removed. /e subtracts these counts from its existing device budget too. The combined cap is 400/day, without consuming Gemini's limited KV write budget.

GET /stats returns `machineRequests` (top 30 names with `count`, descending count then name), always for Bangkok today plus the previous 29 days, independent of the dashboard's 7/14/30 selector. Future dates are excluded. Access requires the existing STATS_KEY header. The new dashboard section has Thai/English labels and an empty state; all values are escaped and long names wrap.

## Owner steps after review — not run in this task

The SQL is [proxy/migrations/0001_machine_requests.sql](../proxy/migrations/0001_machine_requests.sql). It is idempotent and does not change existing event or personal data. The worker also uses the same CREATE IF NOT EXISTS schema on first use for compatibility with its existing initialization path.

From `proxy/`, using the owner's existing Cloudflare sign-in:

```powershell
npx wrangler d1 migrations list kryvos-stats --remote
npx wrangler d1 migrations apply kryvos-stats --remote
npx wrangler deploy
```

Apply this migration once before deploying the Worker and merging the frontend change. The migration command records applied filenames. Existing DB/RL bindings, logs enabled, preview URLs disabled and secrets remain as configured; `wrangler.toml` is unchanged. No API keys or STATS_KEY need to enter the repository or PR. After deployment, the owner can inspect the protected stats page with their existing key and make an explicit test request using the live app.

Cloudflare references: [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch).

## Evidence

- Node built-in test suite: **282/282**. New cases exercise strict validation, CORS/method/ID checks, real SQLite upsert SQL, concurrent quota boundary, /e shared cap, key protection, Bangkok 30-day/top-30 behavior, idempotent migration, errors, consent, storage failure, double taps, retry and lock/consent races.
- `browser-machine-requests.cjs`: 320/360/375/430 × TH/EN × light/dark, synthetic contexts with all worker calls intercepted. Consent off sends nothing; keyboard tap sends the exact payload; duplicate/reload stays disabled; 503 permits explicit retry; 60-character dashboard names wrap. The controlled AI scan path checks a new English name too. No production requests.
- Catalog and original simple-flow browser suites rerun on B. Photos/credits and plan/history/data preservation tests remain intact. Service worker and all release tags: **v71**.
- Screenshots: [machine-requests](screenshots/machine-requests/). Demo statistics are synthetic. No physical phone test or live Gemini recognition claim.

**Worker redeploy and one D1 migration are required. Neither migration nor deploy has been run against production.**
