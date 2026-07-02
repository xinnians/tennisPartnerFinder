# Tennis Partner Finder MVP Plan

Last updated: 2026-07-02

This document is the project planning source of truth. Keep it updated when scope,
product decisions, data model assumptions, or implementation order changes, so a
new session can resume without relying on chat memory.

## Current Direction

Build the first usable version around:

- Primary flow: find public tennis partners near real courts.
- Supporting flow: publish short-lived partner requests for a specific court/time.

The current repository is a Vite frontend prototype. It already has the map,
player pins, demand pins, filters, quick contact modal, and profile UI. Data is
still hard-coded in `src/mockData.js`; profile edits and quick contact choices
are in-memory only.

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
- Milestone 3 and Milestone 4 are not implemented yet.

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

Begin Milestone 3: wire the frontend to local Supabase Auth and data.

Recommended next implementation batch:

1. Add `@supabase/supabase-js`.
2. Add a small Supabase auth/data layer instead of calling Supabase directly
   inside UI handlers.
3. Add Email magic link sign-in/sign-out UI.
4. Persist the current profile form to `profiles`, `profile_courts`,
   `profile_play_types`, and `profile_slots`.
5. Load map players from `public_profile_discovery` and keep LINE hidden until
   the user taps quick contact.
6. Load and publish active `partner_requests`.
7. Keep this batch local-only: do not create a hosted Supabase project, do not
   deploy, and do not change the verified schema unless a blocker is found and
   covered by local RLS tests.
