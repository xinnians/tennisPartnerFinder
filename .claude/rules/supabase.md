---
paths:
  - "supabase/**"
  - "src/dataApi.js"
  - "src/supabaseClient.js"
---

# Supabase data model / privacy — schema & RLS details

（自 CLAUDE.md 移入，2026-07-08；描述的是 **shipped** code。session-first 重構的
排程見 `docs/superpowers/plans/2026-07-08-dev-roadmap.md`。）

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
**no** invite/accept/contact-history records. (The 2026-07-08 dev roadmap's
Batch 2-3 mutual-consent rework is the approved path to change this.)

Backend gotchas:

- `public_profile_discovery` works **because** it is a default (non
  `security_invoker`) view that bypasses the owner-only SELECT policy on
  `profiles`. Recreating it with `security_invoker = true`, or reading `profiles`
  directly, silently breaks all discovery.
- The only `partner_requests` SELECT policy is `open + unexpired` — owners cannot
  read their own closed/expired rows, and there is no DELETE policy. Any
  request-management feature needs a new policy migration.
- Courts catalog SoT is `data/courts.json` (82 雙北 courts); clients have no
  court write path, and `[db.seed]` is disabled (no seed.sql) — courts only
  land via generated migrations. Adding/editing a court = edit the JSON, then
  run `node scripts/generate-courts-seed.mjs --stamp <新 stamp>` to regenerate
  the migration **and** `supabase/tests/courts_catalog.sql` from the same
  source (same-source-same-sync). **A migration already pushed to hosted must
  never be edited — always cut a new stamp.** `--check` diffs a fresh
  regeneration against what's on disk and exits non-zero on drift.
- `createPartnerRequest` hardcodes a 7-day `expires_at` (the column has no DB
  default) and never sets `ntrp_min`/`ntrp_max` — which is where demand-pin NTRP
  is read from, so UI-created requests render without NTRP.
- Schema changes are **local-first**: migration + pgTAP green locally before
  applying to the hosted project (see `supabase/README.md`).
