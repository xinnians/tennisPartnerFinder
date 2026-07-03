# Hosted Supabase Preparation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare a decision-complete handoff for moving the verified local Supabase MVP to a hosted Supabase project and deploy preview.

**Architecture:** Treat local Supabase as the source of truth. Apply the existing migration to hosted only after the project owner provides hosted Supabase access and confirms redirect/domain settings. Keep the quick-contact MVP unchanged.

**Tech Stack:** Vite, vanilla JavaScript modules, Supabase Auth/Postgres/RLS, Google Maps JavaScript API, Netlify or Vercel deploy preview, Playwright.

---

## Current Status

- Local Supabase Auth/Data wiring is implemented and hardened.
- Local RLS verification passes against `supabase/tests/quick_contact_rls.sql`.
- Playwright coverage includes mock fallback and local Supabase flows; latest target is 11 passing tests.
- Local Mailpit magic-link QA has been manually verified.
- Hosted Supabase project `TennisPartnetFinder` is linked as project ref `ttjzxhihctrtoqdsqxdb`.
- Hosted migration `202607020001_initial_mvp_schema.sql` has been applied.
- Hosted schema checks confirmed:
  - 6 Taipei court seed rows exist.
  - `public_profile_discovery` includes `line_id`.
  - `invites`, `respond_to_invite()`, and `accepted_invite_contacts()` do not exist.
  - RLS is enabled on `profiles`, `partner_requests`, and `reports`.
- Vercel project `tennis-partner-finder` is linked under `xinnians-projects-c513dbd3`.
- Preview Supabase env vars are configured for branch `claude/tennis-partner-finder-proto-xfrr6g`.
- Vercel preview is ready at `https://tennis-partner-finder-qr5bagfl9-xinnians-projects-c513dbd3.vercel.app`.
- The preview is currently protected by Vercel Authentication, and Google Maps env is not configured yet.

## Boundaries

- This plan is preparation only; do not create external resources until the project owner confirms access and target provider.
- Do not modify the verified schema unless hosted integration exposes a blocker and a matching local RLS test is added.
- Do not restore `invites`, `respond_to_invite()`, or `accepted_invite_contacts()`.
- Do not add quick contact event logging.
- Keep LINE visibility as a UI gate: public discovery may include `line_id`, but first-layer UI must not display it.
- Keep first beta scope to Taipei City.

## Hosted Supabase Checklist

- [x] Create or identify the hosted Supabase project.
- [x] Record project URL and anon key for deploy env only:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- [x] Apply the existing migration from `supabase/migrations/202607020001_initial_mvp_schema.sql`.
- [x] Confirm Taipei court seed rows exist in hosted `courts`.
- [x] Verify hosted schema still excludes `invites`, `respond_to_invite()`, and `accepted_invite_contacts()`.
- [ ] Configure Supabase Auth redirect URLs:
  - local dev: `http://localhost:5173`
  - deploy preview domain once available
  - production domain once available
- [ ] Confirm Email magic link works against the deploy preview callback URL.
- [ ] Run or manually reproduce RLS checks against hosted:
  - anonymous can read active courts and `public_profile_discovery`
  - private profiles are excluded from discovery
  - owner can create/update only their own profile
  - owner can create/update only their own partner requests
  - reports are scoped to reporter

## Deploy Preview Checklist

- [x] Choose deploy target: Netlify or Vercel.
- [ ] Configure deploy env:
  - `VITE_GOOGLE_MAPS_API_KEY`
  - [x] `VITE_SUPABASE_URL`
  - [x] `VITE_SUPABASE_ANON_KEY`
- [ ] Restrict Google Maps browser key by HTTP referrer before public beta.
- [ ] Ensure the deploy preview URL is added to Supabase Auth redirect URLs.
- [ ] Decide whether to keep Vercel Authentication enabled or provide a share/bypass URL for QA.
- [ ] Run preview QA:
  - signed-out user can browse public map data
  - signed-out quick contact and request publishing open login
  - signed-in incomplete profile is redirected to profile
  - complete profile can save and publish a partner request
  - first-layer player sheet does not show LINE
  - quick contact reveal shows LINE only after explicit click
  - desktop and 390px mobile layouts have no obvious overlap or clipping

## Local Verification Before Hosted Work

Run before attempting hosted integration:

```bash
npx supabase db reset
npx supabase test db supabase/tests
npm run build
npm test
npm audit --audit-level=moderate
git diff --check
```

Expected:

- pgTAP reports 16 tests passing.
- Playwright reports all smoke and local Supabase tests passing.
- Build exits 0.
- Audit reports 0 moderate-or-higher vulnerabilities.
- No whitespace errors.

## Inputs Needed From Project Owner

- Hosted Supabase project access or confirmation to create one.
- Preferred deploy target: Netlify or Vercel.
- Deploy preview domain once created.
- Google Cloud access to rotate or restrict the Maps API key.
- Decision on whether beta deploy should use a private preview URL or a public-but-unlisted URL.
