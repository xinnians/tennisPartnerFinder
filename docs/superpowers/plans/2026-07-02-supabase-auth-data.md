# Supabase Auth Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the current Vite prototype to local Supabase Auth and Postgres data while preserving the quick contact MVP behavior.

**Architecture:** Keep the existing vanilla JS UI and add a thin Supabase boundary. UI handlers call local app functions, app functions call a small auth/data layer, and the data layer is the only place that imports `@supabase/supabase-js`.

**Tech Stack:** Vite, vanilla JavaScript modules, `@supabase/supabase-js`, Supabase Auth, Postgres, RLS, Playwright.

---

## Implementation Progress

Updated 2026-07-02:

- Completed the first local Supabase Auth/Data wiring pass.
- Installed `@supabase/supabase-js`.
- Added `src/supabaseClient.js` with local env detection and a stable auth
  storage key for browser/session tests.
- Added `src/dataApi.js` as the Supabase boundary for auth, courts, discovery,
  current profile persistence, and partner request publishing.
- Kept login and request modals in `src/sheets.js` instead of creating a
  separate `src/authUi.js`, so modal mounting stays with the existing sheet
  system.
- Updated `src/main.js` to load local Supabase data when env is configured and
  fall back to mock data when it is not.
- Added `tests/supabase.spec.js` for local Supabase flows: signed-out browsing,
  login gates, incomplete-profile gate, profile save, LINE first-layer hiding,
  quick contact LINE reveal, and partner request publishing.
- Still local-only: no hosted Supabase project, no deploy, no invite/accept
  flow, no quick contact event log, and no schema change.

Remaining hardening candidates:

- More explicit loading, empty, and failure states around Supabase reads/writes.
- Manual local magic-link QA through Supabase Studio/email capture.
- Sign-out reset coverage if profile state clearing behavior changes.
- Mobile visual QA for the new auth and request modal controls.

---

## Boundaries

- Do not create a hosted Supabase project in this batch.
- Do not deploy.
- Do not restore `invites`, `respond_to_invite()`, or `accepted_invite_contacts()`.
- Do not add quick contact event logging.
- Do not change the verified schema unless a local RLS test exposes a blocker.
- Use local Supabase env values:
  - `VITE_SUPABASE_URL=http://127.0.0.1:54321`
  - `VITE_SUPABASE_ANON_KEY` from `npx supabase status -o env`; current local anon key is `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0`.

## Files

- Modify: `package.json`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `index.html`
- Modify: `src/main.js`
- Modify: `src/sheets.js`
- Modify: `src/style.css`
- Create: `src/supabaseClient.js`
- Create: `src/dataApi.js`
- Auth modal lives in `src/sheets.js` for this first pass; no separate
  `src/authUi.js` was created.
- Existing `tests/smoke.spec.js` remains as mock fallback coverage.
- Create: `tests/supabase.spec.js`
- Modify after implementation: `docs/mvp-plan.md`

## Task 1: Dependency And Local Env

- [ ] **Step 1: Install Supabase client**

Run:

```bash
npm install @supabase/supabase-js
```

Expected: `package.json` and `package-lock.json` include `@supabase/supabase-js`.

- [ ] **Step 2: Keep env placeholders but document local values**

Ensure `.env.example` still contains:

```bash
VITE_GOOGLE_MAPS_API_KEY=___
VITE_SUPABASE_URL=___
VITE_SUPABASE_ANON_KEY=___
```

Do not commit `.env.local`.

- [ ] **Step 3: Create local `.env.local` manually for implementation**

Use:

```bash
VITE_GOOGLE_MAPS_API_KEY=___
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
```

Expected: Vite can read local Supabase env values, but git status does not show `.env.local`.

- [ ] **Step 4: Verify existing baseline**

Run:

```bash
npm run build
npm test
npx supabase test db supabase/tests
```

Expected: build passes, Playwright passes, and DB tests report 16 tests passing.

## Task 2: Supabase Boundary

- [ ] **Step 1: Create `src/supabaseClient.js`**

Export exactly:

```js
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured =
  Boolean(url) && Boolean(anonKey) && url !== "___" && anonKey !== "___";

export const supabase = isSupabaseConfigured ? createClient(url, anonKey) : null;
```

- [ ] **Step 2: Create `src/dataApi.js`**

Export these functions and keep all Supabase calls in this file:

```js
export async function getSession();
export function onAuthChange(callback);
export async function signInWithEmail(email);
export async function signOut();
export async function loadCourts();
export async function loadDiscoveryPlayers();
export async function loadActivePartnerRequests();
export async function loadCurrentProfile();
export async function saveCurrentProfile(profile);
export async function createPartnerRequest(request);
```

Required behavior:

- If Supabase env is not configured, read-only functions return current mock data shapes and write functions return `{ ok: false, reason: "not_configured" }`.
- `loadDiscoveryPlayers()` reads `public_profile_discovery` and maps every row to the existing registered-player shape used by `src/map.js`.
- `loadActivePartnerRequests()` reads `partner_requests` with the related `courts` row and maps each request to the existing demand-pin shape.
- `loadCurrentProfile()` reads owned `profiles`, `profile_courts`, `profile_play_types`, and `profile_slots`.
- `saveCurrentProfile(profile)` upserts the owned `profiles` row, then replaces owned join rows for courts, play types, and slots.
- `createPartnerRequest(request)` inserts an `open` request owned by the current user's profile.

- [ ] **Step 3: Data shape mapping**

Use these mappings:

- discovery row to player:
  - `id`: `${profile_id}:${court_id}`
  - `profileId`: `profile_id`
  - `displayName`: `nickname`
  - `ntrp`: `Number(ntrp)`
  - `goals`: `play_types ?? []`
  - `homeCourt`: `court_name`
  - `courtLat`: `Number(court_lat)`
  - `courtLng`: `Number(court_lng)`
  - `availability`: convert slot codes to labels with `wd-m -> 平日早上`, `wd-a -> 平日下午`, `wd-e -> 平日晚上`, `we-m -> 週末早上`, `we-a -> 週末下午`, `we-e -> 週末晚上`
  - `lineId`: `line_id`
- request row to demand pin:
  - `id`: `request:${id}`
  - `court`: related `courts.name`
  - `courtLat`: `Number(courts.lat)`
  - `courtLng`: `Number(courts.lng)`
  - `ntrp`: `ntrp_min` when `ntrp_min === ntrp_max`, otherwise `null`
  - `rawSkill`: `raw_skill_text`
  - `demandText`: `request_text`
  - `sourceUrl`: empty string

- [ ] **Step 4: Verify**

Run:

```bash
npm run build
```

Expected: build passes and existing UI still renders with mock fallback when Supabase env is unset.

## Task 3: Auth UI

- [ ] **Step 1: Create `src/authUi.js`**

Export:

```js
export function openLoginModal({ onSubmit });
export function closeLoginModal();
```

UI requirements:

- Modal title: `登入後繼續`
- Email input label: `Email`
- Primary button: `寄送登入連結`
- Success message after submit: `已寄出登入連結，請檢查信箱。`
- Error message on failure: `登入連結寄送失敗，請稍後再試。`

- [ ] **Step 2: Add auth entry points to `index.html`**

Add a compact auth status area inside the profile page header:

- Signed out text: `尚未登入`
- Signed in text: user's email
- Button text when signed out: `登入`
- Button text when signed in: `登出`

- [ ] **Step 3: Wire auth in `src/main.js`**

Required behavior:

- On app boot, call `getSession()` and render auth state.
- Listen to `onAuthChange()` and refresh auth state.
- Clicking `登入` opens the login modal.
- Login modal submit calls `signInWithEmail(email)`.
- Clicking `登出` calls `signOut()`, clears loaded current-user profile state, and keeps public map data visible.
- Quick contact, save profile, and publish request require a signed-in session.

- [ ] **Step 4: Verify**

Run:

```bash
npm run build
npm test
```

Expected: build passes and existing smoke tests pass. Existing tests may still operate in mock fallback mode.

## Task 4: Profile Persistence

- [ ] **Step 1: Load current profile after sign-in**

In `src/main.js`, after a session is available:

- Call `loadCurrentProfile()`.
- If profile exists, populate nickname, NTRP, play types, usual courts, slots, public toggle, and LINE ID.
- If profile does not exist, keep current prototype defaults but show unsigned local state as unsaved.

- [ ] **Step 2: Save profile to Supabase**

Change `儲存檔案` behavior:

- If signed out, open login modal.
- If signed in, call `saveCurrentProfile(state.profile)`.
- On success, show `已儲存到 Supabase` toast.
- On failure, show `儲存失敗，請稍後再試` toast.

- [ ] **Step 3: Enforce public-card completeness**

When toggling `公開我的球友卡` on, require:

- nickname
- NTRP
- LINE ID
- at least one usual court

If missing fields exist, keep the toggle off and show `公開前請先補齊 ${fields}`.

- [ ] **Step 4: Verify owner RLS remains valid**

Run:

```bash
npx supabase test db supabase/tests
npm run build
npm test
```

Expected: DB tests still pass, build passes, Playwright passes.

## Task 5: Discovery And Map Data

- [ ] **Step 1: Load real public players**

In app boot, replace static `DATA.players` with:

```js
const players = await loadDiscoveryPlayers();
```

Fallback to `REGISTERED_PLAYERS` only when Supabase env is not configured or the read fails.

- [ ] **Step 2: Keep first-layer LINE hidden**

Do not show `lineId` in `openPlayerSheet`. Keep using it only in `openQuickContactModal()` after `快速約球`.

- [ ] **Step 3: Load active partner requests**

Load `partner_requests` through `loadActivePartnerRequests()` and merge them into map data as demand pins. For platform requests, the sheet should show the request details and not show an external source link unless `sourceUrl` is non-empty.

- [ ] **Step 4: Verify map behavior**

Run:

```bash
npm test
```

Expected:

- Public player sheet does not contain LINE before quick contact.
- Quick contact modal contains LINE after the button is clicked.
- External demand pins still show source links.
- Platform partner requests do not require source links.

## Task 6: Partner Request Publishing

- [ ] **Step 1: Add a map action**

Add a compact map action button labeled `發布需求` near existing map controls.

- [ ] **Step 2: Add request modal**

Fields:

- court select, populated from `loadCourts()`
- desired time text
- rough skill text
- request text
- expiration, default 7 days

- [ ] **Step 3: Gate publishing**

Publishing requires signed-in session and a complete profile with nickname, NTRP, LINE ID, and at least one usual court. The user does not need `is_public = true` to publish a request.

- [ ] **Step 4: Insert request**

Call `createPartnerRequest()` with:

- selected `court_id`
- `desired_time_text`
- `raw_skill_text`
- `request_text`
- `expires_at = now + selected days`
- `status = open`

On success, close modal, refresh map data, and show `需求已發布`.

- [ ] **Step 5: Verify**

Run:

```bash
npm run build
npm test
npx supabase test db supabase/tests
```

Expected: build passes, Playwright passes, DB tests pass.

## Task 7: Playwright Coverage

- [ ] **Step 1: Keep mock fallback test**

Existing smoke coverage should still pass with placeholder Supabase env.

- [ ] **Step 2: Add authenticated local Supabase flow**

Add a Playwright test that starts with local Supabase env and verifies:

- signed-out user can browse map
- signed-out quick contact opens login modal
- signed-in incomplete profile is redirected to profile before quick contact
- completed profile can save to Supabase
- public discovery loaded from Supabase still hides LINE in the first sheet
- quick contact reveals LINE after explicit click

- [ ] **Step 3: Add partner request flow**

Verify:

- signed-out publish request opens login modal
- signed-in complete profile can publish a request
- the new request appears as a demand pin after map refresh

- [ ] **Step 4: Full verification**

Run:

```bash
npx supabase db reset
npx supabase test db supabase/tests
npm run build
npm test
npm audit --audit-level=moderate
git diff --check
```

Expected: all commands exit 0.

## Task 8: Documentation And Commit

- [ ] **Step 1: Update docs**

Update `docs/mvp-plan.md`:

- Mark Milestone 3 as in progress or complete based on actual implementation.
- Record whether tests used local Supabase or mock fallback.
- Keep the quick contact privacy note: LINE visibility is UI-gated, not DB-hidden.

Update `README.md`:

- Add local Supabase env setup for frontend wiring.
- Explain that hosted Supabase is still not required for local Milestone 3.

- [ ] **Step 2: Final verification**

Run:

```bash
npx supabase test db supabase/tests
npm run build
npm test
npm audit --audit-level=moderate
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Commit**

Run:

```bash
git add package.json package-lock.json README.md docs/mvp-plan.md index.html src tests
git commit -m "Wire frontend to local Supabase auth data"
```

Expected: commit created on the current feature branch.
