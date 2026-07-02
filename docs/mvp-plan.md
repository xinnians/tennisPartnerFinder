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
player pins, demand pins, filters, invite modal, invite list, and profile UI.
Data is still hard-coded in `src/mockData.js`; profile edits and invites are
in-memory only.

## Implementation Status

- Milestone 1 has been started in the repo:
  - Google Maps key is read from `VITE_GOOGLE_MAPS_API_KEY`.
  - `.env.example` documents the required local environment variable.
  - README setup instructions point to `.env.local` instead of editing source.
  - Playwright smoke tests cover app load, tab switching, player sheet, invite
    creation, profile save feedback, Maps auth fallback, and desktop/mobile
    Chromium viewports.
- Milestone 2 has an initial migration draft:
  - `supabase/migrations/202607020001_initial_mvp_schema.sql`
  - Includes core tables, Taipei court seed data, indexes, RLS policies, public
    discovery view, and controlled invite/contact functions.
- Milestone 3 and Milestone 4 are not implemented yet.

## Product Principles

- Pins represent tennis courts, not home addresses.
- Users explicitly choose whether their profile appears publicly.
- Public map data should not expose LINE ID or private contact details.
- LINE ID becomes visible only after an invite is accepted.
- The MVP should favor a small trusted trial group before broad public launch.

## Backend Decision Record

Status: accepted for MVP.

Decision: use Supabase Auth + Postgres + Row Level Security as the first MVP
backend.

Why Supabase fits this product:

- The product data is relational: profiles, courts, play types, availability,
  partner requests, invites, and reports all reference each other.
- Postgres keeps the data model portable if the project later outgrows the BaaS
  layer.
- Row Level Security can enforce privacy rules at the database layer, especially
  for public profiles, private LINE IDs, and accepted-invite contact disclosure.
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
- Invite flow:
  - send invite
  - recipient sees invite
  - recipient accepts or declines
  - accepted invite reveals contact info to both sides.

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
  - invite flow adds an invite
  - profile save shows feedback
- Verify responsive behavior on mobile and desktop.

### Milestone 2: Supabase Data Model

Goal: define the backend schema and privacy boundaries before wiring the UI.

Preferred backend: Supabase Auth + Postgres + Row Level Security.

Initial tables:

- `profiles`
- `courts`
- `profile_courts`
- `profile_play_types`
- `profile_slots`
- `partner_requests`
- `invites`
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
- Send invites.
- Show received and sent invites.
- Accept or decline invites.
- Reveal LINE ID only for accepted invite pairs.

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

This is a planning draft, not final SQL.

### `profiles`

- `id`: primary key
- `user_id`: Supabase auth user id, unique
- `nickname`
- `ntrp`
- `line_id`
- `is_public`
- `created_at`
- `updated_at`

Public reads should expose only safe profile fields. `line_id` needs stricter
access through accepted invite logic.

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

### `invites`

- `id`: primary key
- `sender_profile_id`
- `recipient_profile_id`
- `partner_request_id`: nullable
- `court_id`: nullable
- `slot_text`
- `message`
- `status`
- `created_at`
- `responded_at`

Statuses can start with `pending`, `accepted`, `declined`, and `cancelled`.

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
- LINE ID should not be included in public discovery queries.
- Invite participants can read invite records they sent or received.
- Contact details are readable only when an invite between the two profiles is
  accepted.
- Partner requests are publicly readable only when active and not expired.
- Users can update or close only their own partner requests.

## Open Questions

- Which sign-in method should MVP use first: email magic link, Google login, or
  LINE Login?
- Should partner requests require a full profile, or can users publish after a
  lighter onboarding step?
- Should public player pins show exact usual court, or aggregate multiple usual
  courts?
- Should accepted invites reveal LINE ID both ways immediately, or only reveal
  the recipient's contact to the sender?
- What is the first beta area: Taipei only, or Taipei plus nearby cities?

## Next Concrete Step

Finish Milestone 1 verification, then begin Milestone 2 review:

1. Run `npm run build`.
2. Run `npm test`.
3. Review the Supabase migration locally before applying it to a hosted project.
4. Add Supabase env placeholders when starting Milestone 3:
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
