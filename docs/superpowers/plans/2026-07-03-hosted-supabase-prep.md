# Hosted Supabase Preparation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare a decision-complete handoff for moving the verified local Supabase MVP to a hosted Supabase project and deploy preview.

**Architecture:** Treat local Supabase as the source of truth. Apply the existing migration to hosted only after the project owner provides hosted Supabase access and confirms redirect/domain settings. Keep the quick-contact MVP unchanged and use Google OAuth for beta auth.

**Tech Stack:** Vite, vanilla JavaScript modules, Supabase Auth/Postgres/RLS, Google Maps JavaScript API, Netlify or Vercel deploy preview, Playwright.

---

## Current Status

- Local Supabase Auth/Data wiring is implemented and hardened.
- Local RLS verification passes against `supabase/tests/quick_contact_rls.sql`.
- Playwright coverage includes mock fallback, local Supabase flows, and Google
  OAuth redirect coverage; latest target is 15 passing tests, including a
  mobile modal animation regression.
- Local Mailpit magic-link QA was manually verified before the hosted auth decision changed.
- Hosted Supabase project `TennisPartnetFinder` is linked as project ref `ttjzxhihctrtoqdsqxdb`.
- Hosted migration `202607020001_initial_mvp_schema.sql` has been applied.
- Hosted schema checks confirmed:
  - 6 Taipei court seed rows exist.
  - `public_profile_discovery` includes `line_id`.
  - `invites`, `respond_to_invite()`, and `accepted_invite_contacts()` do not exist.
  - RLS is enabled on `profiles`, `partner_requests`, and `reports`.
- Vercel project `tennis-partner-finder` is linked under `xinnians-projects-c513dbd3`.
- Preview Supabase env vars are configured for branch `claude/tennis-partner-finder-proto-xfrr6g`.
- Preview Google Maps env is configured for branch `claude/tennis-partner-finder-proto-xfrr6g`.
- Stable Vercel branch preview is `https://tennis-partner-finder-git-cla-6f302a-xinnians-projects-c513dbd3.vercel.app`.
- Use the stable branch preview as the QA entrypoint; do not add every immutable
  Vercel hash deployment URL to Google Maps HTTP referrer restrictions.
- Hosted REST smoke checks passed for anonymous courts, public discovery, partner requests, and direct profile read isolation.
- Browser QA confirmed Google Maps renders on the stable branch preview after
  adding the branch preview URL to the Google Cloud HTTP referrer allowlist.
- Google OAuth callback returns to the preview app successfully.
- Commit `a6e2f87 Prepare beta readiness flows` added request-expiry copy and
  player/request report entry points using the existing `reports` table.
- Hosted preview beta QA on 2026-07-03 used the stable branch preview URL:
  - signed-out users can browse the map, and gated interactions open Google
    OAuth with PKCE and the stable branch preview as `redirect_to`.
  - Chrome owner session restored Google login state and showed the auth pill.
  - first-layer public player sheets hide LINE; quick contact reveals LINE only
    after the explicit action.
  - request publishing shows the 7-day auto-hide copy, wrote a hosted
    `partner_requests` row, and rendered the new request marker.
  - player and request report entry points wrote hosted `reports` rows.
  - headless desktop and 390px checks showed the map renders without request
    failures; the only browser warning observed was Google Maps Marker
    deprecation.
- Hosted preview QA found a transient 390px modal animation issue: dialogs were
  centered only after the animation ended. The fix is a dedicated centered
  `modalPopIn` animation plus Playwright coverage.
- Hosted magic-link QA was blocked by Supabase Auth email rate limiting:
  direct `/auth/v1/otp` verification returned HTTP 429 `over_email_send_rate_limit`.
- Product decision: Email magic link and custom SMTP are paused for MVP login.
  Hosted beta auth should use Google OAuth.
- LINE Login through Supabase Custom OAuth/OIDC was investigated and deferred
  after the hosted callback hit LINE Web Login HS256 token verification
  incompatibility. Future LINE support should use an auth broker such as
  Auth0/Clerk or a dedicated auth architecture decision.
- Apple sign-in is deferred until iOS native / App Store requirements make it
  necessary.

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
- [x] Configure Supabase Auth redirect URLs:
  - local dev: `http://localhost:5173`
  - deploy preview domain once available
  - production domain once available
- [x] Enable Google OAuth in Supabase Auth and confirm it returns to the deploy preview.
- [x] Run or manually reproduce RLS checks against hosted:
  - anonymous can read active courts and `public_profile_discovery`
  - private profiles are excluded from discovery
  - owner can create/update only their own profile
  - owner can create/update only their own partner requests
  - reports are scoped to reporter

## Deploy Preview Checklist

- [x] Choose deploy target: Netlify or Vercel.
- [x] Configure deploy env:
  - [x] `VITE_GOOGLE_MAPS_API_KEY`
  - [x] `VITE_SUPABASE_URL`
  - [x] `VITE_SUPABASE_ANON_KEY`
- [x] Restrict Google Maps browser key by HTTP referrer before public beta.
- [x] Ensure the deploy preview URL is added to Supabase Auth redirect URLs.
- [ ] Decide whether beta testers should use a private preview, share/bypass URL, or production alias.
- [x] Run beta readiness preview QA:
  - signed-out user can browse public map data
  - signed-out quick contact and request publishing open login
  - signed-in incomplete profile is redirected to profile (covered by local
    automated tests; optional hosted fresh-user reproduction remains below)
  - complete profile can save and publish a partner request
  - first-layer player sheet does not show LINE
  - quick contact reveal shows LINE only after explicit click
  - request publishing communicates 7-day auto-hide behavior
  - player and request report entry points write to `reports`
  - desktop and 390px mobile layouts have no obvious overlap or clipping

Completed preview QA evidence:

- Stable branch preview is the fixed QA URL.
- Referrer-restricted Google Maps key renders the map on the branch preview URL.
- Google OAuth returns to the preview app.
- Empty hosted discovery/request state renders without crashing.
- Signed-out interactions open Google OAuth with PKCE.
- Google-authenticated owner session loads on the preview.
- First-layer player sheets hide LINE, and quick contact reveals LINE after an
  explicit click.
- QA partner request publishing writes an active hosted request and renders its
  marker.
- Player and request report entry points write separate hosted `reports` rows.
- A 390px modal animation issue was found during QA and fixed locally; the next
  branch deployment should be rechecked before inviting testers.

Remaining preview QA:

- Re-check the 390px modal animation fix after the latest branch deployment is
  ready.
- Optional: create a fresh hosted test user to manually reproduce the
  incomplete-profile gate in preview. Local automated tests already cover this
  flow.
- Decide private preview vs share/bypass vs production alias for beta testers.
- Clean up `QA-20260703` hosted request/report data once the QA trail is no
  longer useful.

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
- Production domain once created.
- Decision on whether beta deploy should use private preview access, share/bypass
  access, or a production alias.
