# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Vite + **vanilla-JavaScript (ES modules)** single-page prototype: a Taipei tennis
"partner finder" map. No framework, no TypeScript, no bundled UI library, and **no
linter/formatter/typecheck configured** — do not invent `lint`/`tsc` commands.
The whole UI is two tabs (map + profile) driven by imperative DOM code in `src/`.

`docs/mvp-plan.md` is the declared **planning source of truth** (scope, product
decisions, milestone status). Update it when scope or data-model decisions change.
`README.md` is the setup guide. Both `README.md` and all in-code comments/UI
strings are in **Traditional Chinese (zh-TW)** — match that language when editing
copy and comments.

## Commands

```bash
npm install                 # install deps
cp .env.example .env.local  # then fill in keys (see Environment)
npm run dev                 # Vite dev server → http://localhost:5173
npm run build               # production build → dist/
npm run preview             # preview the built dist/
npm test                    # Playwright E2E (auto-starts its own dev servers)
```

Run a single Playwright project or test:

```bash
npx playwright test tests/smoke.spec.js                 # one file
npx playwright test --project=desktop-chromium          # one project
npx playwright test --project=supabase-chromium         # needs local Supabase up
npx playwright test -g "quick contact"                  # by title substring
```

`playwright.config.js` auto-starts **two** dev servers: port **5174** with no
Supabase env (mock-data path, used by `desktop-chromium` + `mobile-chromium` /
`smoke.spec.js`) and port **5175** wired to a local Supabase stack (used by
`supabase-chromium` / `supabase.spec.js`). The `supabase-chromium` project only
passes when the local Supabase stack is running.

Local Supabase (requires Docker + Supabase CLI):

```bash
npx supabase start                       # boot local stack
npx supabase db reset                    # recreate DB + apply supabase/migrations
npx supabase test db supabase/tests      # run pgTAP RLS tests
npx supabase status -o env               # print local URL + ANON_KEY for .env.local
```

## Architecture

### The mock-vs-Supabase fallback (most important concept)

`src/supabaseClient.js` exports `isSupabaseConfigured` (true only when
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are set and not the `___` placeholder).
This one boolean gates the entire app:

- **Not configured** → the app runs entirely on `src/mockData.js` (6 real Taipei
  courts, 6 players, 6 demands). Auth is disabled, "save" is a toast, no network.
- **Configured** → the app reads/writes real Supabase Auth + Postgres.

`src/dataApi.js` is the **single data boundary**. Every function
(`loadCourts`, `loadDiscoveryPlayers`, `loadActivePartnerRequests`,
`loadCurrentProfile`, `saveCurrentProfile`, `createPartnerRequest`, `createReport`,
plus the auth helpers) returns mock data when `!isSupabaseConfigured` and otherwise
talks to Supabase. Crucially, `mapDiscoveryRow`/`mapRequestRow`/`normalizeProfile`
convert DB rows into the **exact same object shapes** `mockData.js` exports — so
`map.js`, `filters.js`, and `sheets.js` never know or care which backend is live.
When you add a field, keep the mock shape and the `dataApi` mapper in sync.

### Runtime flow

`src/main.js` is the entry point and the only stateful orchestrator. It holds an
in-memory `state` object (`session`, `dataStatus`, `filters`, `profile`) — the
prototype keeps app state in memory, so a refresh resets everything **except** what
Supabase persists. `init()` wires tabs/filters/controls, initializes auth, calls
`loadAppData()` (which fills `courts` + `dataSet`), then loads Google Maps and draws
pins. Filters re-run `refreshPins()`, which pipes `filterData()` → `groupPinsByCourt()`
→ `renderPins()`.

Layer responsibilities:
- `config.js` — Maps key + map center/zoom (Taipei).
- `map.js` — loads Google Maps, applies the sage-green style, groups pins by court, draws markers.
- `pins.js` — SVG for the three pin types.
- `filters.js` — pure filter functions + the NTRP `BANDS` / play-`TYPES` constants.
- `sheets.js` — all bottom cards, the court drawer, and the login / quick-contact / publish / report modals.
- `util.js` — `esc()` (HTML-escape), `safeUrl()` (http(s)-only hrefs), `sourceLabel()`, `ntrpDesc()`.
- `style.css` — one stylesheet; design tokens live at the top.

### Three pin types

Player pins (public registered players), demand pins (someone's partner request),
and cluster pins (multiple items at one court). **Pins sit on court coordinates,
never home addresses** ("圖釘=球場"). Multiple items at the same court auto-collapse
into a cluster.

### Auth

Google OAuth only (PKCE flow), configured in `src/supabaseClient.js` with a custom
`storageKey`. `getInitialSession()` in `dataApi.js` restores a session from
`localStorage` manually if `getSession()` is empty. Email magic link and LINE/Apple
login are intentionally **out of scope** (see `docs/mvp-plan.md`). When not
configured, auth UI shows "原型" and is disabled.

### Data model / privacy (Supabase)

Schema lives in `supabase/migrations/202607020001_initial_mvp_schema.sql`:
`profiles`, `courts`, join tables `profile_courts` / `profile_play_types` /
`profile_slots`, `partner_requests`, `reports`, plus the `public_profile_discovery`
view. **RLS is enabled** on user-owned tables; the frontend reads discovery via that
view, and open+unexpired partner requests are the only publicly readable requests.

**Critical product principle — do not violate:** quick contact is a *UI gate, not a
database secrecy boundary*. `line_id` IS present in `public_profile_discovery` for
public profiles; the UI must keep it hidden on the first card layer and reveal it
only after the user taps 快速約球 (quick contact). The MVP creates **no**
invite/accept/contact-history records.

### Shared enums (keep in sync across three places)

These values are enforced by DB `CHECK` constraints and must match the frontend
constants and mock data:
- **play types:** `單打`, `雙打`, `對拉`, `練球`
- **slot codes:** `wd-m`, `wd-a`, `wd-e`, `we-m`, `we-a`, `we-e`

Changing either means editing the migration, `filters.js`/`main.js`, and any mock
data together.

## Conventions & gotchas

- Build DOM via template strings + `innerHTML`; always wrap dynamic/user values in
  `esc()` and URLs in `safeUrl()` from `util.js`.
- No Google Maps key (or an invalid/referrer-blocked key) must **not** break the
  page: `main.js` shows a placeholder overlay listing courts instead. Preserve this
  graceful degradation when touching map init.
- The Google Maps browser key is referrer-restricted in Google Cloud Console. Keep
  the allowlist to stable entries only (local dev, production domain, the stable
  Vercel branch preview) — do not add per-deploy immutable hash URLs.
- Deployment is Vercel (`npm run build` → `dist/`). Hosted Supabase project ref is
  `ttjzxhihctrtoqdsqxdb`; the stable branch-preview URL is the QA entrypoint, not
  per-deploy URLs.

## Environment

`.env.local` (git-ignored), copied from `.env.example`:

```
VITE_GOOGLE_MAPS_API_KEY=___
VITE_SUPABASE_URL=___
VITE_SUPABASE_ANON_KEY=___
```

Leave the two Supabase vars as `___` to run the mock prototype. For the local
Supabase path, set them to `http://127.0.0.1:54321` and the ANON_KEY from
`npx supabase status -o env`.
