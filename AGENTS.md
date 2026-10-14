# AGENTS.md: KRYVOS

Instructions for coding agents (Codex, Claude Code, etc.) working in this repo. Read this before changing anything.
Team docs in Thai: [TEAM.md](TEAM.md) (code map, workflow), [README.md](README.md) (features, backend), [TASKS.md](TASKS.md).

## What this is

KRYVOS is a daily training coach PWA: it picks today's workout (PUSH / PULL / LEGS / rest) from muscle recovery and
reported soreness or pain, logs sets with a rest timer, logs runs and recommends running shoes, counts calories
(with AI photo estimates), and gives an AI weekly summary. Made by Norrawat Nakphut & Krittanun Boonman.

- Live app: https://nrw18.github.io/train-today/ (GitHub Pages, deploys automatically from `main`)
- Usage stats dashboard: https://nrw18.github.io/train-today/stats.html (needs the STATS_KEY password)
- Android: Trusted Web Activity in `android/`; `.github/workflows/android.yml` builds `KRYVOS.apk` into the
  `android-test` release whenever `android/**` or the workflow changes on `main`.

## Layout

| Path | What it is |
|---|---|
| `index.html` | The whole app: HTML, CSS and JS in one file, no framework, no build step. Sections are marked with comments such as `/* ---------- the decision ---------- */`; see the code map in TEAM.md |
| `en.js` | English translations. Keys are the Thai source strings (`EN`), plus page-text overrides (`EN_UI`) |
| `sw.js` | Service worker (offline cache). `VERSION` must be bumped on every change to `index.html` or `en.js` |
| `stats.html` | Usage stats dashboard (reads `GET /stats` from the worker) |
| `proxy/worker.js`, `proxy/wrangler.toml` | Cloudflare Worker: Gemini proxy (key stays server side), KV daily limits, D1 usage stats |
| `tests/*.test.mjs` | Node built-in test runner. `tests/app.mjs` cuts functions out of `index.html` into a vm sandbox, so tests run the real code |
| `android/` | TWA wrapper (package `io.github.nrw18.traintoday`, start URL `/train-today/`) |

## Commands

```bash
node --test "tests/*.test.mjs"     # all tests; must pass before every commit (Node 22+, uses node:sqlite)
python3 -m http.server 8000        # run locally, open http://localhost:8000 (never file://)
```

AI features do not work on localhost (the worker only accepts the live origin). To test AI locally, enter your own
Gemini key in the Gym tab ("use my own key").

## Rules

1. **No secrets in the repo.** It is public. `GEMINI_KEY` and `STATS_KEY` are Cloudflare Worker secrets and never
   appear in code, tests, logs or commits. The D1 `database_id` and KV `id` in `wrangler.toml` are not secrets.
2. **`main` is the live site.** Work on a branch, open a Pull Request, and wait for Oreo (repo owner) to approve
   before merging. Never force-push `main`.
3. **The worker is deployed by hand** by Oreo with `npx wrangler deploy` from `proxy/`. If you change
   `proxy/worker.js` or `wrangler.toml`, say so in the PR so it gets redeployed. Keep `wrangler.toml` in step with
   the Cloudflare dashboard (logs on, preview URLs off).
4. **Bump `VERSION` in `sw.js`** (e.g. `train-today-v37` -> `train-today-v38`) with every change to `index.html` or
   `en.js`, otherwise installed apps keep the old version.
5. **Do not lose user data.** All personal data lives in `localStorage` key `train-today-v1`. Old saved data and old
   backup files must keep loading. Exercises added by AI are hidden, never deleted (history needs them).
6. **Check AI output before using it** (see `validate()` and `validFood()`); never trust model JSON shapes.
7. **Escape user and AI text** with `esc()` before putting it into HTML.
8. **Health:** the app never diagnoses. Pain means skip and suggest seeing a doctor.

## Two languages (English first, Thai for Thai users)

- Strings in code are written in Thai and wrapped in `t("...")`; add the English to `en.js` (`"บันทึกแล้ว": "Saved"`).
- Numbers inside sentences: `tf(t("วิ่ง {n} ครั้ง"), { n: 3 })` with `"วิ่ง {n} ครั้ง": "Runs: {n}"` in `en.js`.
- Thai text in HTML markup is translated at start-up by `translateDom()`; it only needs an `en.js` entry.
- **Never name a local variable or parameter `t`.** It hides the translator and breaks text silently.
- `tests/i18n.test.mjs` fails if any Thai string has no English.
- Language choice is stored in `localStorage` key `kryvos-lang`; AI prompts follow it via `AI_LANG` / `withLang()`.

## Design

- Colors only from the CSS variables in `:root` (`--blue`, `--hero`, `--bg`, `--card`, ...), which have light and
  dark values. No hard-coded colors.
- Mobile first: check 320, 360, 375 and 430 px wide, light and dark, English and Thai. No sideways scrolling.
- Visible keyboard focus; new animation must respect `prefers-reduced-motion`.
- Fonts: Bai Jamjuree (headings) and IBM Plex Sans Thai (body).

## Usage stats (anonymous)

- The app calls `track("event_name")` (or `trackOnce`) at feature use. Events are queued in `localStorage` and sent
  with `sendBeacon` to `POST /e` (10 at a time or when the app is hidden), only from the live site, and only if the
  Settings switch is on.
- Sent: random device id, language, phone type, installed flag, event names. **Never** names, weights, food,
  workouts or typed text. Keep it that way; the app tells users so.
- **Adding an event:** add the name to `EVENTS` in `proxy/worker.js`, call `track("name")` in `index.html`, add a
  Thai label to `NAMES` in `stats.html`, then the worker must be redeployed. `tests/stats.test.mjs` checks that every
  `track("...")` name is accepted by the worker.
- Free-plan limits to respect: D1 100,000 rows written/day (app caps 400 events per device per day); KV 1,000
  writes/day (used by the AI limit: 40 calls per person, 450 per app per day).

## Pull request checklist

- [ ] `node --test "tests/*.test.mjs"` passes; new logic has a test
- [ ] `sw.js` `VERSION` bumped if `index.html` / `en.js` changed
- [ ] Every new Thai string has English in `en.js`
- [ ] Checked on a phone-sized screen, light and dark
- [ ] PR says whether the worker needs a redeploy
