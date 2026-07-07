# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Vite + **vanilla-JavaScript (ES modules)** single-page prototype: a Taipei tennis
"partner finder" map. No framework, no TypeScript, no bundled UI library, and **no
linter/formatter/typecheck configured** — do not invent `lint`/`tsc` commands.
The whole UI is two tabs (map + profile) driven by imperative DOM code in `src/`.

`docs/mvp-plan.md` is the declared **planning source of truth** (scope, product
decisions, milestone status). Update it when scope or data-model decisions change.
Dated implementation plans/specs from past sessions live under
`docs/superpowers/plans/` and `docs/superpowers/specs/`. `README.md` is the setup
guide. Both `README.md` and all in-code comments/UI strings are in **Traditional
Chinese (zh-TW)** — match that language when editing copy and comments.

### Current direction — read before extending the schema or product flows

`docs/mvp-plan.md` carries a "Direction update (2026-07-07)" pointing to
`docs/superpowers/plans/2026-07-07-session-first-and-court-guide-plan.md`
(status: planned, **not yet implemented**). It supersedes the partner-request
model with first-class sessions, replaces the current quick-contact design with a
mutual-consent gate that removes `line_id` from the anon-readable discovery view,
and adds a court-guide layer. Everything below documents the **shipped** code;
new data-model work should follow that plan. The 2026-07-03 monetization plan is
explicitly deferred by it.

Product red lines (from the plans; easy to violate by accident): never scrape or
auto-import from Facebook groups or LINE groups; any future demand aggregation is
PTT public-board only, de-identified, linking back to the source post. No
realtime chat, no payments/booking, no native app; player matching stays free.

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
npx playwright test tests/smoke.spec.js                            # one file
npx playwright test --project=desktop-chromium                     # one project
npx playwright test --project=supabase-chromium                    # needs local Supabase up
npx playwright test -g "quick contact" --project=desktop-chromium  # by title substring
```

Before running or editing tests, read `.claude/rules/testing.md` (two dev
servers, port conflicts, Maps stub, supabase sign-in — it auto-loads when
touching `tests/**` or `playwright.config.js`, but a bare `npm test` run does
**not** trigger it; read it explicitly first).

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

- **Not configured** → the app runs on `src/mockData.js` (6 real Taipei courts,
  6 players, 6 demands). Auth is disabled, "save" is a toast, no network.
- **Configured** → the app reads/writes real Supabase Auth + Postgres.

`src/dataApi.js` is the **single data boundary**, but the mock fallback is
**asymmetric**: only the three read loaders (`loadCourts`, `loadDiscoveryPlayers`,
`loadActivePartnerRequests`) return mock data; `loadCurrentProfile` returns
`null`, and the writes (`saveCurrentProfile`, `createPartnerRequest`,
`createReport`) **throw** via `requireSupabase()`. Mock-mode UX lives in the
`main.js` callers (the save button short-circuits to a toast; reporting is
blocked) — a new dataApi write will not no-op in mock mode by itself. 發布需求
(publish) is effectively Supabase-only: mock courts have no `id`, and the publish
modal's `try/finally` swallows the resulting error.

`mapDiscoveryRow`/`mapRequestRow`/`normalizeProfile` convert DB rows into the
mock object shapes **plus** Supabase-only `profileId`/`requestId` — when those
ids are absent (mock rows), tapping 檢舉 (report) early-returns with a toast
instead of opening the report modal. When you add a
field, keep the mock shape and the `dataApi` mapper in sync. Discovery is one row
per (profile, court): a player with N home courts renders as N separate pins.

**Court names are the cross-backend join key**: the profile tab's court checklist
always renders from mockData `COURTS` (even when Supabase is live), and
`saveCurrentProfile` converts checked names to DB ids by matching
`courts.name`. Renaming or adding a court in only one place silently drops it
from saves.

### Runtime flow

`src/main.js` is the entry point and the only stateful orchestrator. It holds an
in-memory `state` object (`session`, `dataStatus`, `filters`, `profile`) — the
prototype keeps app state in memory, so a refresh resets everything **except** what
Supabase persists. `init()` wires tabs/filters/controls, initializes auth, calls
`loadAppData()` (which fills `courts` + `dataSet`), then loads Google Maps and draws
pins. Filters re-run `refreshPins()`, which pipes `filterData()` → `groupPinsByCourt()`
→ `renderPins()`. Every filter change closes any open sheet and re-renders all
markers from scratch — an intentional prototype simplification.

Layer responsibilities:
- `config.js` — Maps key + map center/zoom (Taipei).
- `map.js` — loads Google Maps, applies the sage-green style, groups pins by court, draws markers.
- `pins.js` — SVG for the three pin types.
- `filters.js` — pure filter functions + the NTRP `BANDS` / play-`TYPES` constants.
- `sheets.js` — all bottom cards, the court drawer, and the login / quick-contact / publish / report modals.
- `util.js` — `esc()` (HTML-escape), `safeUrl()` (http(s)-only hrefs), `sourceLabel()`, `ntrpDesc()`.
- `style.css` — one stylesheet; design tokens live at the top.

Filter semantics: the play-type chips intentionally filter **player pins only**
(demands have no structured play type), and null-NTRP items always pass the band
filter.

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

Quick contact (快速約球) and publish are gated on **viewer profile completeness**
even in mock mode: the default profile (nick 「我」, empty LINE ID) fails the
check, so a fresh load always toasts and bounces to the profile tab. Any demo,
screenshot, or E2E of quick contact must first fill nick + LINE ID.

### Data model / privacy (Supabase)

Schema lives in `supabase/migrations/202607020001_initial_mvp_schema.sql` (the
only migration): `profiles`, `courts`, join tables `profile_courts` /
`profile_play_types` / `profile_slots`, `partner_requests`, `reports`, plus the
`public_profile_discovery` view. **RLS is enabled on all tables**; the frontend
reads discovery via that view, and open+unexpired partner requests are the only
publicly readable requests.

**Critical product principle (shipped code) — do not violate:** quick contact is
a *UI gate, not a database secrecy boundary*. `line_id` IS present in
`public_profile_discovery` for public profiles; the UI must keep it hidden on the
first card layer and reveal it only after the user taps 快速約球. The MVP creates
**no** invite/accept/contact-history records. (The 2026-07-07 session-first plan
is the approved path to change this — see "Current direction" above.)

Backend gotchas:

- `public_profile_discovery` works **because** it is a default (non
  `security_invoker`) view that bypasses the owner-only SELECT policy on
  `profiles`. Recreating it with `security_invoker = true`, or reading `profiles`
  directly, silently breaks all discovery.
- The only `partner_requests` SELECT policy is `open + unexpired` — owners cannot
  read their own closed/expired rows, and there is no DELETE policy. Any
  request-management feature needs a new policy migration.
- Courts are seeded **inside the migration** (`[db.seed]` is disabled, no
  seed.sql) and clients have no court write path. Adding a court = a new
  migration **plus** updating the pgTAP test that hard-asserts exactly 6 active
  courts.
- `createPartnerRequest` hardcodes a 7-day `expires_at` (the column has no DB
  default) and never sets `ntrp_min`/`ntrp_max` — which is where demand-pin NTRP
  is read from, so UI-created requests render without NTRP.
- Schema changes are **local-first**: migration + pgTAP green locally before
  applying to the hosted project (see `supabase/README.md`).

### Shared enums (keep in sync)

These values are enforced by DB `CHECK` constraints and must match the frontend:

- **play types** (`單打`, `雙打`, `對拉`, `練球`): the migration, `TYPES` in
  `filters.js`, the hard-coded filter chips in `index.html`, and mock data.
- **slot codes** (`wd-m`, `wd-a`, `wd-e`, `we-m`, `we-a`, `we-e`): the migration,
  the slot grid + `defaultProfile` in `main.js`, and the `slotLabels` code→label
  map in `dataApi.js`.

## Conventions & gotchas

- Build DOM via template strings + `innerHTML`; always wrap dynamic/user values in
  `esc()` and URLs in `safeUrl()` from `util.js`.
- Sheets, modals, and toasts mount into `#sheet-root`/`#modal-root`/`#toast-root`
  and are torn down by innerHTML wipe — re-attach listeners on every render. Every
  modal opener hides the floating 發布需求 button and `closeModal()` re-shows it;
  keep that pairing for new modals.
- No Google Maps key (or an invalid/referrer-blocked key) must **not** break the
  page: `main.js` shows a placeholder overlay listing courts instead. Key failure
  arrives **asynchronously** via the global `window.gm_authFailure` callback (not
  a rejected promise), and `loadGoogleMaps` memoizes its promise — preserve both
  when touching map init.
- The Google Maps browser key is referrer-restricted in Google Cloud Console. Keep
  the allowlist to stable entries only (local dev, production domain, the stable
  Vercel branch preview) — do not add per-deploy immutable hash URLs.
- Deployment is Vercel (`npm run build` → `dist/`). Hosted Supabase project ref is
  `ttjzxhihctrtoqdsqxdb`; the stable branch-preview URL is the QA entrypoint, not
  per-deploy URLs.
- Doc upkeep: after editing this file run `wc -l CLAUDE.md` — keep it ≤ 200 lines
  (~10 KB). Over the cap, move the most situational section to `.claude/rules/`
  (scope it with `paths` frontmatter) or `docs/` and leave a one-line pointer here.
  One source of truth per rule: other files point to it, never copy it.

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
