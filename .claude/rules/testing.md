---
paths:
  - "tests/**"
  - "playwright.config.js"
---

# Playwright E2E — running details & gotchas

Always scope `-g` with `--project`: title patterns also match `supabase.spec.js`
titles, and running that project without the local stack fails.

`playwright.config.js` auto-starts **two** dev servers: port **5174** with no
Supabase env (mock-data path, used by `desktop-chromium` + `mobile-chromium` /
`smoke.spec.js`) and port **5175** wired to a local Supabase stack (used by
`supabase-chromium` / `supabase.spec.js`). The `supabase-chromium` project only
passes when the local Supabase stack is running.

Test gotchas:

- The supabase suite's `beforeAll` runs `npx supabase db reset` — running
  `npm test` **wipes any manually created local Supabase data**, then self-seeds
  the profiles it needs.
- Both webServer entries set `reuseExistingServer: false` — kill anything on
  ports 5174/5175 first (the most common test-failure cause). The test servers
  inject all `VITE_*` vars inline (Maps key = `e2e`), so tests ignore `.env.local`.
- Tests never load real Google Maps: both spec files carry a **duplicated**
  `window.google.maps` stub that signals readiness via
  `window.__onGoogleMapsReady` — the exact callback `map.js` registers. Changing
  the loader or using Maps APIs beyond Map/Marker means updating the stub in
  **both** files.
- `supabase.spec.js` signs in by writing session JSON into `localStorage` under
  the hardcoded key `tennis-partner-finder-auth` (must match the
  `supabaseClient.js` storageKey) using local email/password `signUp` — the local
  stack has **no Google provider**; real OAuth exists only on the hosted project.
  The local demo anon JWT is hardcoded in both `playwright.config.js` and
  `supabase.spec.js`; keep them in sync.
- The smoke test collects every `console.error`/`pageerror` and asserts the list
  is empty — a zero-console-error policy enforced by tests.
- `supabase.spec.js` runs serial with a 120s timeout; one failure skips the rest,
  so "skipped" output usually means an earlier test failed.
