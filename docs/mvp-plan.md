# Tennis Partner Finder MVP Plan

Last updated: 2026-07-08

This document is the project planning source of truth. Keep it updated when scope,
product decisions, data model assumptions, or implementation order changes, so a
new session can resume without relying on chat memory.

## Current Direction

> **Direction update (2026-07-08，排程 SoT）:** 競品重盤後的開發批次行程定於
> `docs/superpowers/plans/2026-07-08-dev-roadmap.md`。觸發原因：發現直接競品
> baseline.tw（雙北 112 座球場庫＋地圖＋session 制揪團，2026-05 上線、traction
> 趨近於零）。session-first 方向保留（被獨立驗證），差異化改押「地圖上的人＋
> accepted 才互露 LINE＋深度球場指南（全雙北、分波滾動，SEO 獲客資產）」。該 roadmap
> 對 07-07 計畫有三條技術修正（session_contacts 改 definer view、participant
> status 加 'invited' 堵 self-accept 提權、補 roster view），實作前必讀其 §4。
>
> **Direction update (2026-07-07):** a session-first reframe plus a Taipei court
> guide cold-start layer is planned in
> `docs/superpowers/plans/2026-07-07-session-first-and-court-guide-plan.md`.
> That plan supersedes the "partner request" model with a first-class `sessions`
> entity (slots 1-3, played/回訪 metrics), makes contact reveal a mutual-consent
> gate that finally removes `line_id` from the anon-readable discovery view, and
> defers monetization. Read it before extending the data model. Sections below
> still describe the current shipped prototype.

Build the first usable version around:

- Primary flow: find public tennis partners near real courts.
- Supporting flow: publish short-lived partner requests for a specific court/time.

The current repository is a Vite frontend prototype that has moved through
local Supabase wiring and hosted preview beta QA. It already has the map,
player pins, demand pins, filters, quick contact modal, profile UI, Supabase
Auth/Data boundary, profile persistence, public discovery reads, partner
request publishing, request expiry copy, and report entry points. When Supabase
env is not configured, it still falls back to `src/mockData.js`.

## Implementation Status

- Milestone 1 prototype foundation is complete:
  - Google Maps key is read from `VITE_GOOGLE_MAPS_API_KEY`.
  - `.env.example` documents the required local environment variable.
  - README setup instructions point to `.env.local` instead of editing source.
  - Playwright smoke tests cover app load, tab switching, player sheet,
    quick contact, profile save feedback, external demand source links, Maps
    auth fallback, and desktop/mobile Chromium viewports.
- Milestone 2 local migration/RLS verification is complete:
  - `supabase/migrations/202607020001_initial_mvp_schema.sql`
  - Includes core tables, Taipei court seed data, indexes, RLS policies, and a
    public discovery view for quick contact.
  - `supabase/tests/quick_contact_rls.sql` verifies the quick-contact schema
    against local Supabase.
  - Verified on 2026-07-02 with Supabase CLI `2.109.0` and Docker `29.6.1`.
  - Passing checks: `npx supabase db reset`,
    `npx supabase test db supabase/tests`, `npm run build`, `npm test`,
    `npm audit --audit-level=moderate`, and `git diff --check`.
- Milestone 3 Auth/Data wiring is complete for the local and hosted preview
  baseline:
  - `@supabase/supabase-js` is installed.
  - `src/supabaseClient.js` owns Supabase client configuration and auth storage.
    OAuth uses PKCE.
  - `src/dataApi.js` owns Supabase reads/writes for auth, profile, discovery,
    courts, and partner requests.
  - Google OAuth replaced Email magic link for beta login; LINE Login is
    deferred because LINE Web Login does not fit Supabase Custom OIDC cleanly.
    sign-out UI, profile persistence, public discovery loading, quick contact
    UI-gated LINE display, and partner request publishing have a first local
    implementation.
  - Playwright local Supabase coverage verifies signed-out browsing,
    login gates, incomplete-profile gates, profile save, first-layer LINE
    hiding, quick-contact LINE display, partner request publishing,
    expired/non-open request hiding, and player/request report creation.
  - Hardening pass added loading, empty, error, and retry states for Supabase
    map data; login modal success/failure messaging; disabled submit states;
    profile reset on sign-out; and profile-page auth controls.
  - Browser QA covered desktop and 390px mobile login/profile surfaces with no
    relevant console errors before the OAuth switch. Hosted Google OAuth and
    Maps preview QA are now verified on the stable branch preview URL.
  - Local Mailpit magic-link QA was completed earlier, but Email magic link is
    now intentionally paused for the MVP because hosted Supabase built-in email
    hit rate limits and the project will not add SMTP for login.
  - Latest local verification target has 21 Playwright tests, including Google
    OAuth redirect coverage and a mobile modal animation regression.
  - Hosted Supabase preparation started on 2026-07-03:
    - Hosted project `TennisPartnetFinder` is linked as project ref
      `ttjzxhihctrtoqdsqxdb`.
    - The verified initial migration was applied to hosted Supabase.
    - Hosted schema checks confirmed 6 Taipei court seed rows, `line_id` in
      `public_profile_discovery`, no invite/accept functions, and RLS enabled on
      `profiles`, `partner_requests`, and `reports`.
    - Vercel project `tennis-partner-finder` is linked, with preview Supabase
      env vars configured for branch `claude/tennis-partner-finder-proto-xfrr6g`.
    - Stable Vercel branch preview is
      `https://tennis-partner-finder-git-cla-6f302a-xinnians-projects-c513dbd3.vercel.app`.
      Use this as the QA entrypoint instead of per-deploy immutable hash URLs.
    - Preview env now includes hosted Supabase URL/key and
      `VITE_GOOGLE_MAPS_API_KEY`.
    - Hosted REST smoke checks passed for anonymous courts, public discovery,
      partner requests, and direct profile read isolation.
    - Browser QA confirmed the referrer-restricted Google Maps key renders the
      map on the stable branch preview after adding that URL to Google Cloud
      HTTP referrer restrictions.
    - Hosted Google OAuth returns to the preview successfully.
    - Hosted preview QA on 2026-07-03 used the stable branch preview. It
      verified signed-out map browsing and Google OAuth gating, restored a
      Google-authenticated owner session, confirmed first-layer player cards do
      not show LINE, confirmed quick contact reveals LINE only after the
      explicit action, published a QA partner request, and verified hosted DB
      writes for the request and both player/request reports.
    - Hosted preview QA also found a transient 390px mobile modal animation
      issue where dialogs started partly offscreen. This was fixed by giving
      `.modal` a dedicated centered animation and adding Playwright regression
      coverage. The stable branch preview deployment was rechecked after the
      fix and the paused first-frame modal stayed within the 390px viewport.
    - Hosted Email magic link QA was blocked by Supabase Auth email rate
      limiting: direct `/auth/v1/otp` verification returned HTTP 429
      `over_email_send_rate_limit`. Product decision: do not add SMTP now;
      use Google OAuth for beta login.
    - LINE Custom OAuth/OIDC was investigated and deferred: LINE Web Login ID
      token verification hit an HS256/ES256 incompatibility path in Supabase.
      Future LINE support should use an auth broker such as Auth0/Clerk or a
      dedicated auth architecture decision.
    - Apple sign-in is deferred until iOS native / App Store requirements make
      it necessary.
    - Google Maps referrer allowlist should keep stable entries only: local dev,
      production domain, and stable branch preview. Do not chase every Vercel
      immutable deployment URL.
- Milestone 4 beta readiness is in progress:
  - Commit `a6e2f87 Prepare beta readiness flows` added request-expiry UI copy
    and minimal player/request report entry points using the existing
    `reports` table.
  - Hosted preview QA confirmed the 7-day request copy, request map pin, and
    report writes against hosted Supabase.
  - Block lists remain out of scope until beta feedback proves they are needed.
- Batch 1（全雙北球場資料庫，2026-07-08 dev roadmap §5）is complete:
  - `data/courts.json` is now the single courts-catalog source of truth: 82
    座雙北網球場（官方開放資料，data.gov.tw #22849 為主，vbs.sports.taipei／
    hrcm.ntpc.gov.tw 交叉查核），`scripts/generate-courts-seed.mjs` 從它同源
    產出 courts migration 與 `supabase/tests/courts_catalog.sql`。
  - 校真修正：既有 6 座 seed 中的「大安森林公園網球場」「中正網球中心」
    「迎風河濱公園網球場」經三份官方來源查證為虛構場館，已停用（`is_active
    = false`）；「台北網球中心」「百齡河濱公園網球場」「青年公園網球場」查
    證為真，保留 active 並沿用為 join-key 錨點。
  - Profile 球場選單改用 `src/courtPicker.js`（分區＋可搜尋，改吃
    `loadCourts()`）取代原本永遠讀 mock `COURTS` 的 checklist；地圖新增球場
    底圖 pin（`src/pins.js`／`src/map.js`）。`src/mockData.js` 的 6 座 mock
    demo 資料同步校真，維持與新 courts.json 一致的真實名稱。
  - `npm test` 一路維持 21/21 綠。

## Product Principles

- Pins represent tennis courts, not home addresses.
- Users explicitly choose whether their profile appears publicly.
- Public discovery data may include LINE ID for public profiles. This is an
  accepted MVP tradeoff: LINE visibility is gated by UI, not by a database
  secrecy boundary.
- LINE ID is not shown in the first card layer. It is shown only after an
  explicit quick-contact action on a public player card; the MVP sends the real
  conversation to LINE instead of managing in-app invite states.
- A public player with multiple usual courts appears once per usual court.
- First private beta scope is Taipei City.
- The MVP should favor a small trusted trial group before broad public launch.

## Backend Decision Record

Status: accepted for MVP.

Decision: use Supabase Auth + Postgres + Row Level Security as the first MVP
backend.

Why Supabase fits this product:

- The product data is relational: profiles, courts, play types, availability,
  partner requests, and reports all reference each other.
- Postgres keeps the data model portable if the project later outgrows the BaaS
  layer.
- Row Level Security can enforce ownership rules at the database layer,
  especially for profile editing, request publishing, and reporting. LINE ID
  visibility for public profiles is intentionally handled as a UI gate.
- Supabase Auth, generated APIs, and local tooling should keep the MVP faster
  than building a custom backend first.
- PostGIS remains available later if court proximity or geographic search
  becomes important.

Alternatives considered:

- Firebase / Firestore: strong for mobile-first realtime apps, but its document
  model makes this app's relational invite/contact rules more awkward.
- Appwrite: attractive BaaS with managed and self-hosted options, but the
  permission and data model are less direct for complex relational privacy
  rules than Postgres + RLS.
- PocketBase: very fast for a small self-hosted prototype, but production
  hosting, backups, and scaling would become our responsibility.
- Neon + Clerk + custom API: strong long-term control with Postgres and polished
  auth, but requires building the API and authorization layer earlier.
- Rails/Django/Laravel + Postgres: robust and explicit, but heavier than needed
  for the first small-group MVP.

Reconsider this decision if:

- RLS policies become too hard to reason about safely.
- The app needs substantial custom server-side workflows beyond Supabase Edge
  Functions.
- Pricing or vendor constraints become a problem during beta.
- The product pivots toward realtime chat or social-feed behavior where another
  backend shape is clearly better.

## MVP Scope

### In Scope

- User sign-in.
- Editable user profile:
  - nickname
  - NTRP level
  - play types: singles, doubles, rally, practice
  - usual courts
  - recurring availability slots
  - LINE ID
  - public visibility toggle
- Public player discovery on the map.
- Filtering by NTRP band and play type.
- Partner request publishing:
  - court
  - desired time
  - rough skill level
  - short request text
  - expiration/status
- Quick contact flow:
  - registered player cards do not show LINE on the first layer
  - a viewer taps quick contact
  - the app shows the target player's LINE ID
  - the app generates a copyable opener
  - the real conversation continues in LINE
  - no in-app invite, accept, decline, or contact-history state is created

### Not In Scope for First MVP

- Public-post crawling or automatic import from Facebook/PTT/Dcard.
- Real-time chat.
- Payments, court booking, or scheduling automation.
- Advanced recommendation algorithm.
- Native mobile app.
- Full admin console beyond minimal moderation needs.

## Implementation Milestones

### Milestone 1: Stabilize Current Prototype

Goal: make the existing prototype clean and safe to extend.

- Move Google Maps key to Vite environment variables.
- Add `.env.example`.
- Keep mock data, but align object shapes with the future API model.
- Add basic empty/loading/error states for map and filtered results.
- Add smoke tests for:
  - app loads
  - tab switching works
  - player sheet opens
  - quick contact reveals LINE only after an explicit action
  - external demand pins keep the source-link flow
  - profile save shows feedback
- Verify responsive behavior on mobile and desktop.

### Milestone 2: Supabase Data Model

Goal: define the backend schema and privacy boundaries before wiring the UI.

Preferred backend: Supabase Auth + Postgres + Row Level Security.

Status: local Supabase migration and RLS tests passed on 2026-07-02.

Initial tables:

- `profiles`
- `courts`
- `profile_courts`
- `profile_play_types`
- `profile_slots`
- `partner_requests`
- `reports`

Schema guidelines:

- Use lowercase snake_case identifiers.
- Prefer `bigint generated always as identity` for internal sequential IDs.
- Use foreign keys for ownership and relationships.
- Add indexes on all foreign key columns.
- Add composite indexes for common map/list filters.
- Use partial indexes for commonly filtered active/public rows.
- Enable RLS on user-owned and privacy-sensitive tables.
- Index columns used in RLS policies.

### Milestone 3: Wire Real Auth and Data

Goal: turn the prototype into a usable MVP.

Status: local Supabase first pass implemented on 2026-07-02, local hardening
implemented on 2026-07-03, and hosted preview QA completed on 2026-07-03.
Production alias rollout and public beta remain intentionally out of scope.

- Add Supabase client configuration.
- Implement sign-in and sign-out.
- Load public player pins from Supabase.
- Save profile edits to Supabase.
- Publish partner requests.
- Load active partner requests on the map.
- Read `line_id` from `public_profile_discovery`, but keep it hidden in the
  first-layer UI until the user taps quick contact.
- Generate copyable LINE openers from profile and request context.
- Keep full invite status management out of the MVP unless user research shows
  that extra recipient control is needed.

### Milestone 4: Launch Readiness

Goal: make the MVP safe enough for a small real-world trial.

- Add request expiration and hide expired requests by default.
- Add block/report flow.
- Add minimal moderation workflow.
- Improve loading, empty, and failure states.
- Add production environment variables.
- Restrict Google Maps API key by HTTP referrer.
- Deploy to Netlify or Vercel.
- Run a small private beta with real tennis players.

## Draft Data Model

This is a planning reference. The SQL source of truth is
`supabase/migrations/202607020001_initial_mvp_schema.sql`.

### `profiles`

- `id`: primary key
- `user_id`: Supabase auth user id, unique
- `nickname`
- `ntrp`
- `line_id`
- `is_public`
- `created_at`
- `updated_at`

Public discovery includes `line_id` for public profiles. The first-layer UI must
hide it until the viewer taps quick contact.

### `courts`

- `id`: primary key
- `name`
- `district`
- `lat`
- `lng`
- `is_active`

Courts are shared reference data.

### `profile_courts`

- `profile_id`
- `court_id`

Many-to-many relationship for usual courts.

### `profile_play_types`

- `profile_id`
- `play_type`

Allowed values should match the frontend chips.

### `profile_slots`

- `profile_id`
- `slot_code`

Slot codes can start simple, such as `wd-m`, `wd-a`, `wd-e`, `we-m`, `we-a`,
`we-e`.

### `partner_requests`

- `id`: primary key
- `profile_id`
- `court_id`
- `desired_time_text`
- `ntrp_min`
- `ntrp_max`
- `raw_skill_text`
- `request_text`
- `status`
- `expires_at`
- `created_at`
- `updated_at`

Statuses can start with `open`, `closed`, `expired`, and `removed`.

### `reports`

- `id`: primary key
- `reporter_profile_id`
- `reported_profile_id`: nullable
- `partner_request_id`: nullable
- `reason`
- `status`
- `created_at`

Statuses can start with `open`, `reviewed`, and `dismissed`.

## Privacy and RLS Notes

- A user can read and update their own full profile.
- Anyone can read public discovery fields for `profiles.is_public = true`.
- LINE ID is included in public discovery for public profiles. This is UI-gated,
  not database-hidden.
- Quick contact should reveal LINE only after an explicit user action on a
  public player card.
- The MVP does not create invite or quick-contact event records.
- Partner requests are publicly readable only when active and not expired.
- Users can update or close only their own partner requests.

## Next Concrete Step

**Batch 1（全雙北球場資料庫）已完成**——見下方 Implementation Status。執行
`docs/superpowers/plans/2026-07-08-dev-roadmap.md` 的 **Batch 2（指南基礎建設
＋第一波深度內容，SEO 獲客資產）**：

1. 第一波球場內容查證（費用/預約方式/搶場規則/材質/面數/燈光/尖離峰，官方來源
   附 `verifiedAt`＋`sourceUrl`）；錨點見 roadmap §4 修正後的清單。
2. 新增 `src/courtGuide.js`（指南內容 SoT）＋`scripts/build-court-pages.mjs`
   （靜態落地頁＋sitemap 產生器）。
3. 球場抽屜補指南摘要區塊＋整頁連結；`?court=<slug>` deep-link。

內容波次 C2–C5（分波滾動至全雙北）與 Batch 3–5（sessions 重構）穿插進行；
「beta handoff」批次在 roadmap Batch 6；原第 4 點（quick contact 維持 UI-gate）
已被 roadmap Batch 3-4 的 mutual-consent 重構取代，不再適用。
