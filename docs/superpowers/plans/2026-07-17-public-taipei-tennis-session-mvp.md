# Public Taipei Tennis Session MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace the rushed player-card and one-way request prototype with a public Taipei City tennis session board: anyone can browse real upcoming sessions, a signed-in player can request to join, the host accepts or declines, and only an accepted host/guest pair can read each other's LINE ID.

**Architecture:** Keep Vite and vanilla JavaScript. Add a small session controller/view layer above a map-first home screen with a collapsible nearby-sessions drawer, use Supabase security-definer views and RPCs as the only session mutation boundary, and keep the existing 82-court dual-North catalogue as data while enforcing Taipei City for the first public launch. A scheduled Postgres job makes expiry persistent; every lifecycle RPC also checks expiry so a job delay cannot admit a stale session.

**Tech Stack:** Vite 6, browser-native ES modules, Supabase Auth/Postgres/RLS/pg_cron, Google Maps JavaScript API, Playwright, pgTAP.

## Global Constraints

- The confirmed product authorities are [the public-MVP design](../specs/2026-07-17-taipei-tennis-public-mvp-design.md) and the later [approved UX flow](../specs/2026-07-17-public-taipei-tennis-ux-flow-design.md). The UX flow prevails where its map, public-detail, create-form, My Sessions, or resume-flow decisions differ from older plans.
- First release is public Web for **Taipei City tennis**. Preserve the existing 82-court dual-North source catalogue, but add a persisted city field and permit public session creation/discovery only where city is 台北市. This keeps existing data intact and makes a future Twin-North expansion a deliberate policy change.
- The atomic public unit is a concrete session. Do not retain player cards, direct invitations, or direct contact as an alternate discovery path in this MVP.
- Do not add duration, court booking, payments, chat, push notifications, waitlists, rating, coach matching, another city, or another sport UI. The schema may seed tennis through sport_id only.
- Never scrape, republish, or store posts or identities from private LINE/Facebook communities. Configured Supabase mode must show only host-created real sessions; mock sessions are local-test/demo data only.
- LINE ID must be absent from every anonymous REST response, DOM node, marker title, list card, and unaccepted roster. It is exposed only by the database-backed host-to-accepted-guest contact view.
- The only host profile data public discovery may reveal is the explicitly allowlisted `host_nickname`, `host_ntrp`, and `host_profile_complete`. It must never expose `host_profile_id`, a profile URL, real name, LINE ID, phone, e-mail, usual courts, history, or any other participant data.
- The homepage starts on a Taipei City map with a collapsed nearby-sessions drawer, not a map/list mode switch. Do not call the browser location API until the user taps `使用我的位置`; then center to an approximately 5 km view, keep the user position only in memory, and continue discovery by current map bounds after a pan or zoom.
- No UI code may call Supabase tables or RPCs directly. All client data access goes through src/dataApi.js.
- Do not edit the already-applied generated migration 202607080001_courts_catalog_double_north.sql. New catalogue output must be generated from data/courts.json with a new migration stamp.
- Keep the user-owned untracked file docs/ai-cross-project-setup-handoff.md untouched and unstaged.
- Public launch is not blocked by ecosystem research, but it is blocked by the security, lifecycle, privacy, mobile, and hosted-QA gates in the release task below.
- Use a pg_cron job every 15 minutes for persistent expiry. The scheduled function transitions open/full sessions that passed start_at + 24 hours to expired. Lifecycle RPCs must independently reject the same condition immediately; the UI must never depend on cron timing.
- The production support contact must come from VITE_SUPPORT_EMAIL. Do not invent a public email address; the public deployment is not launch-ready until that environment variable is configured.

---

## Target file map

| Path | Change |
|---|---|
| supabase/migrations/202607170001_courts_city_scope.sql | New manual migration: add/backfill guarded courts.city for the existing catalogue. |
| scripts/generate-courts-seed.mjs | Include city in deterministic catalogue migration and pgTAP output. |
| supabase/migrations/202607170002_courts_catalog_double_north.sql | Newly generated city-aware catalogue migration; never hand-edit. |
| supabase/tests/courts_catalog.sql | Newly generated city-aware catalogue assertions. |
| supabase/migrations/202607170003_public_taipei_tennis_sessions.sql | New sports/session/participant/report schema, RLS, safe views, RPCs, archival of legacy quick-contact records, and expiry schedule. |
| supabase/tests/session_rls.sql | New pgTAP contract for privacy, permissions, state transitions, reports, and expiry. |
| supabase/tests/quick_contact_rls.sql | Delete after session_rls.sql provides replacement coverage. |
| src/config.js | Add launch city, city bounds, discovery window, map debounce, 5 km location radius, and support-email configuration. |
| src/mockData.js | Replace registered players and demand pins with safe, future-dated MOCK_SESSIONS. |
| src/filters.js | Keep common NTRP bands/play types; replace player/demand filtering with session range-overlap filtering. |
| src/dataApi.js | Replace discovery/request writes with safe session mappers, profile-save RPC, lifecycle RPC callers, and typed action errors. |
| src/sessionIntent.js | New sessionStorage-only action-intent adapter. |
| src/sessionController.js | New orchestration layer for map-first discovery, explicit location, nearby-sessions drawer, auth/profile gates, lifecycle refresh, and My Sessions. |
| src/sessionViews.js | New DOM-only renderer for nearby-sessions drawer/cards, sheets, forms, My Sessions, and contact copy actions. |
| src/session.css | New session-specific responsive styles, imported by main.js after the legacy base stylesheet. |
| src/map.js and src/pins.js | Render sessions rather than people/demands and publish debounced map bounds. |
| src/sheets.js | Keep accessible overlay primitives, login, and report dialog; remove player/demand/quick-contact/request modal exports. |
| src/main.js | Become a thin boot/auth/profile/map shell that wires sessionController. |
| index.html | Replace quick-contact controls with map-first session discovery, a collapsible nearby-sessions drawer, explicit-location control, session filters, My Sessions, privacy/contact affordances, and stable test IDs. |
| src/style.css | Remove only obsolete player/demand/quick-contact selectors after callers are gone; keep shared primitives. |
| tests/fixtures/fakeMaps.js | New single fake Maps implementation, including bounds/idle support. |
| tests/fixtures/localSupabase.js | New single local URL/key/auth-session/profile helper. |
| tests/fixtures/sessionFactory.js | New run-isolated host/guest/observer/session factory using legal RPC setup. |
| tests/smoke.spec.js | Rewrite as mock-only anonymous session discovery and fallback coverage. |
| tests/supabase.spec.js | Delete and replace with focused session specs; it must no longer reset the database in a hook. |
| tests/session.spec.js | New desktop local-Supabase two-user lifecycle and privacy journeys. |
| tests/session-mobile.spec.js | New Pixel 5 local-Supabase critical flow. |
| tests/performance.spec.js | New slow-discovery, bounds/debounce, loading/retry regression coverage. |
| scripts/reset-local-test-db.mjs | New explicit, guarded local-only destructive reset command. |
| playwright.config.js and package.json | New non-destructive test projects and scripts. |
| CLAUDE.md, .claude/rules/supabase.md, .claude/rules/testing.md, README.md, supabase/README.md, docs/mvp-plan.md | Replace obsolete quick-contact guidance with the shipped session model and runbook. |

## Contracts to preserve across database, API, and UI

### Public summary

~~~js
// Produced only from public.session_discovery.
const SessionSummary = {
  id: "session-123",
  sessionId: 123,
  sportCode: "tennis",
  courtId: 45,
  court: "青年公園網球場",
  courtDistrict: "萬華區",
  courtLat: 25.02306,
  courtLng: 121.506928,
  startAt: "2026-07-18T10:00:00.000Z",
  playType: "雙打",
  ntrpMin: 3.0,
  ntrpMax: 4.0,
  slotsTotal: 2,
  slotsRemaining: 1,
  notes: "自備新球",
  hostNickname: "阿漢", // deliberately public display name, never a profile link
  hostNtrp: 3.5,
  hostProfileComplete: true,
  status: "open" // public view may also return future "full"
};
~~~

`hostNickname`, `hostNtrp`, and `hostProfileComplete` are the sole exception to the normal profile-data ban: the approved UX deliberately shows them in the public session sheet. It must never contain hostProfileId, participantId, a profile URL, LINE ID, real name, phone, e-mail, usual courts, history, or roster data. No duration field belongs in v1 because the approved product did not choose one.

### Authenticated session data

~~~js
const MySession = {
  ...SessionSummary,
  viewerRole: "host" || "guest",
  viewerParticipantStatus: "requested" || "accepted" || "declined" || "withdrawn",
  viewerPlayedConfirmed: false,
  updatedAt: "2026-07-17T10:00:00.000Z",
  canCancel: false,
  canWithdraw: false,
  canConfirmPlayed: false,
  canConfirmAttendance: false
};

const RosterParticipant = {
  participantId: 18,
  profileId: 9,
  nickname: "小林",
  ntrp: 3.5,
  playTypes: ["雙打"],
  homeCourts: ["青年公園網球場"],
  role: "guest",
  status: "requested"
};

const SessionContact = {
  sessionId: 123,
  counterpartProfileId: 9,
  nickname: "小林",
  lineId: "only-after-acceptance"
};
~~~

Only the host may request a roster. An accepted guest can see their own row and the host's safe roster row, but no other guest. SessionContact is generated only after both rows are accepted and exactly one party is the host.

### Stable RPC names and error codes

~~~text
save_my_profile(...)
create_session(...)
request_to_join_session(p_session_id)
review_join_request(p_session_id, p_participant_id, p_decision)
withdraw_from_session(p_session_id)
cancel_session(p_session_id)
mark_session_played(p_session_id)
confirm_session_attendance(p_session_id)
create_report(p_session_id, p_reported_profile_id, p_reason)

PROFILE_INCOMPLETE
SESSION_NOT_FOUND
SESSION_NOT_OPEN
SESSION_FULL
SESSION_CANCELLED
SESSION_EXPIRED
SESSION_STARTED
ALREADY_REQUESTED
ALREADY_DECIDED
NOT_SESSION_HOST
NOT_ACCEPTED_PARTICIPANT
INVALID_TRANSITION
~~~

Security-definer RPCs raise these codes in their exception message. src/dataApi.js maps them to short Traditional-Chinese UI copy and always refreshes a rejected session before allowing another action.

## Database implementation decisions

### Session rows and capacity

~~~sql
create table public.sessions (
  id bigint generated always as identity primary key,
  sport_id bigint not null references public.sports(id) on delete restrict,
  host_profile_id bigint not null references public.profiles(id) on delete cascade,
  court_id bigint not null references public.courts(id) on delete restrict,
  play_type text not null check (play_type in ('單打', '雙打', '對拉', '練球')),
  start_at timestamptz not null,
  ntrp_min numeric(2,1),
  ntrp_max numeric(2,1),
  slots_total smallint not null check (slots_total between 1 and 3),
  notes text check (notes is null or char_length(notes) <= 500),
  status text not null default 'open'
    check (status in ('open', 'full', 'cancelled', 'played', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (ntrp_min is null and ntrp_max is null)
    or (ntrp_min between 1.0 and 7.0
        and ntrp_max between 1.0 and 7.0
        and ntrp_min <= ntrp_max)
  )
);
~~~

slots_total means guest vacancies, not total attendees. The host is always the one accepted host participant and never consumes a vacancy. slots_remaining is server-calculated as slots_total minus accepted guest rows; the browser never calculates or writes capacity.

~~~sql
create table public.session_participants (
  id bigint generated always as identity primary key,
  session_id bigint not null references public.sessions(id) on delete cascade,
  profile_id bigint not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('host', 'guest')),
  status text not null check (status in ('requested', 'accepted', 'declined', 'withdrawn')),
  played_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, profile_id),
  check (role <> 'host' or status = 'accepted')
);

create unique index session_participants_one_host_idx
  on public.session_participants(session_id)
  where role = 'host';
~~~

### Views, grants, and lifecycle semantics

- session_discovery is a definer view with a narrow join to the session host profile. Its WHERE clause requires a Taipei City active court, session status in open/full, and start_at greater than now(). Its explicit SELECT list returns only SessionSummary fields, including `profiles.nickname as host_nickname`, `profiles.ntrp as host_ntrp`, and `true as host_profile_complete`; it contains no profile ID, contact field, profile URL, or wildcard profile column even when a session is full.
- my_session_participations, session_participant_roster, and session_contacts use auth.uid through private.viewer_profile_id. They are definer views because owner-only profiles RLS would otherwise hide legitimate counterpart data. Each view has an explicit column list; none uses a wildcard.
- session_contacts requires viewer and counterpart accepted rows in the same session and the pair of roles to be host/guest. This relation is the database proof that guest A cannot learn guest B's LINE.
- create_session and request_to_join_session call private.require_complete_profile. They also validate courts.city = '台北市' and courts.is_active, so changing a browser request cannot create a New Taipei session.
- review_join_request locks the session before counting accepted guests. If it accepts the final slot, it sets status = 'full' and changes every remaining requested row to declined in the same transaction.
- withdrawal is guest-only and pre-start. Its accepted/full path changes session status back to open only when an accepted guest has actually vacated a slot.
- cancel_session is host-only and pre-start; mark_session_played is host-only after start; confirm_session_attendance is accepted-only after start. These functions reject a due session even if the periodic cron run has not yet executed.

### Persistent expiry

~~~sql
create or replace function private.expire_stale_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare changed_count integer;
begin
  update public.sessions
  set status = 'expired', updated_at = now()
  where status in ('open', 'full')
    and start_at <= now() - interval '24 hours';
  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;

select cron.schedule(
  'expire-stale-tennis-sessions',
  '*/15 * * * *',
  'select private.expire_stale_sessions()'
);
~~~

The actual migration first unschedules a same-named job if one exists. All function calls use fully qualified object names because their search path is empty. If local pg_cron is unavailable, the implementation must fail the migration/test setup visibly rather than silently substitute lazy UI expiry.

## Implementation tasks

### Task 0: Protect the current workspace and establish the release baseline

**Files:** no product-file modification

- [ ] Confirm the worktree only has the user-owned untracked handoff file before each implementation commit; never add it with a broad git add command.
- [ ] Read the current migration list locally and remotely before any schema work. Record the applied 202607020001 and 202607080001 stamps in the implementation PR description.
- [ ] Before migrating hosted data, make a read-only count of public.partner_requests and public.reports, then take a data-only backup through the approved Supabase operator path. The migration below archives rather than silently deletes legacy rows, but this backup is still a release safeguard.
- [ ] Confirm pg_cron is enabled in both local and hosted environments before applying the session migration. The relevant Supabase Cron workflow supports scheduling a database function directly with cron.schedule; record the job name expire-stale-tennis-sessions in hosted QA.
- [ ] Run node scripts/generate-courts-seed.mjs --check and npm run build as the pre-change baseline. If either fails, diagnose that existing failure before changing session behavior.

### Task 1: Make the test harness safe, shared, and non-destructive

**Files:**
- Create tests/fixtures/fakeMaps.js
- Create tests/fixtures/localSupabase.js
- Create tests/fixtures/sessionFactory.js
- Create scripts/reset-local-test-db.mjs
- Modify playwright.config.js
- Modify package.json
- Modify tests/smoke.spec.js temporarily only to consume the shared Maps fixture
- Modify tests/supabase.spec.js temporarily only to remove the reset hook; it is deleted in Task 7

- [ ] Extract the duplicated fake Maps script from both existing Playwright specs into tests/fixtures/fakeMaps.js. Export installFakeMaps(page), expectWithinViewport(page, locator), and a fake map that supports getBounds(), addListener("idle", callback), and a test-only bounds mutation that fires idle.
- [ ] Extract the local URL, anon key, auth storage key, signUpUser, setBrowserSession, and profile creation helpers into tests/fixtures/localSupabase.js. Read the storage key from the same exported constant used by src/supabaseClient.js rather than retaining a second magic string.
- [ ] Add tests/fixtures/sessionFactory.js. Each test gets an ISO-safe run identifier, distinct host/guest/observer e-mails, a future session factory, a started session factory, and legal RPC-based helpers; no test uses a hard-coded profile ID or inserts directly into sessions.
- [ ] Add a failing safety test for scripts/reset-local-test-db.mjs: without CONFIRM_LOCAL_DB_RESET=1 it exits non-zero and does not invoke Supabase. Implement the script with Node child_process, require that exact environment value, parse npx supabase status -o env, require API_URL to be http://127.0.0.1:54321, then run npx supabase db reset. Refuse every other target.
- [ ] Replace the implicit beforeAll reset with explicit scripts:

~~~json
{
  "test": "npm run test:mock",
  "test:mock": "playwright test --project=desktop-chromium --project=mobile-chromium",
  "test:db": "npx supabase test db supabase/tests",
  "test:local": "playwright test --project=supabase-chromium --project=supabase-mobile-chromium",
  "db:reset:test": "node scripts/reset-local-test-db.mjs"
}
~~~

- [ ] Configure four Playwright projects: desktop mock on port 5174, mobile mock on 5174, desktop local Supabase on 5175, and Pixel 5 local Supabase on 5175. Keep webServer reuseExistingServer false and make testMatch explicit so mock tests never accidentally run against local Supabase.
- [ ] Run npm run test:mock. Then run scripts/reset-local-test-db.mjs without the confirmation flag and verify it refuses safely. Do not run an actual reset as part of this commit.
- [ ] Commit as: test: isolate safe session test infrastructure

### Task 2: Persist the Taipei City launch boundary without deleting the dual-North catalogue

**Files:**
- Create supabase/migrations/202607170001_courts_city_scope.sql
- Modify scripts/generate-courts-seed.mjs
- Generate supabase/migrations/202607170002_courts_catalog_double_north.sql
- Generate supabase/tests/courts_catalog.sql
- Modify src/config.js
- Modify src/mockData.js
- Modify src/dataApi.js
- Modify src/courtPicker.js

- [ ] First update the generator test expectation: the generated pgTAP file must assert that every active court has city in 台北市 or 新北市 and that the catalogue count remains 82. Run the generator check to observe the expected drift before creating the new generated files.
- [ ] Create 202607170001_courts_city_scope.sql. It adds nullable courts.city, adds a check permitting null, 台北市, or 新北市, and leaves the three inactive historical fictional rows valid. Do not make city NOT NULL because those archived inactive rows are intentionally outside data/courts.json.
- [ ] Update buildMigration in scripts/generate-courts-seed.mjs so each generated upsert includes name, city, district, lat, and lng; conflict updates city too. Update buildPgTap so active catalogue assertions prove city is present and valid. The generator remains the only writer of 202607170002 and courts_catalog.sql.
- [ ] Generate the new migration exactly with node scripts/generate-courts-seed.mjs --stamp 202607170002. Do not patch its SQL manually. Run node scripts/generate-courts-seed.mjs --check and require a clean result.
- [ ] Export LAUNCH_CITY = "台北市", TAIPEI_CITY_BOUNDS, DISCOVERY_WINDOW_DAYS = 14, MAP_IDLE_DEBOUNCE_MS = 250, LOCATION_INITIAL_RADIUS_METERS = 5000, and SUPPORT_EMAIL from src/config.js. TAIPEI_CITY_BOUNDS is the query fallback before the map yields its first viewport; LOCATION_INITIAL_RADIUS_METERS is used only after the user explicitly requests their current position.
- [ ] Change loadCourts in src/dataApi.js to request id,name,city,district,lat,lng and default its city filter to LAUNCH_CITY. The map base pins, profile picker, and session form therefore use Taipei City courts from day one.
- [ ] Add city to every mock court and revise src/courtPicker.js to group by court.city rather than maintaining a second hard-coded city grouping. With the launch filter it renders only 台北市, while the catalogue keeps both cities.
- [ ] Reset local data using the explicit confirmed command, then run npm run test:db and node scripts/generate-courts-seed.mjs --check. Verify a New Taipei court remains in the raw active catalogue but loadCourts() does not present it to launch UI.
- [ ] Commit as: feat: enforce Taipei City launch court scope

### Task 3: Replace the quick-contact schema with a secure, stateful session boundary

**Files:**
- Create supabase/migrations/202607170003_public_taipei_tennis_sessions.sql
- Create supabase/tests/session_rls.sql
- Delete supabase/tests/quick_contact_rls.sql

- [ ] Write supabase/tests/session_rls.sql first, wrapped in begin/rollback. It must fail against the current schema and enumerate the contracts in the Verification section below before the migration is added.
- [ ] In the migration, create schema private and revoke all access to it from anon, authenticated, and public. Preserve legacy QA/history rather than dropping it: rename public.reports to legacy_reports and public.partner_requests to legacy_partner_requests, move both to private, and revoke their old API grants. Their foreign key relationship remains archival-only. A later operator may purge private legacy data only with an explicit retention decision.
- [ ] Recreate a new public.reports table with reporter_profile_id, exactly one target among session_id and reported_profile_id, reason, moderation status, and created_at. Use a check based on num_nonnulls; direct writes are not granted to browser roles.
- [ ] Create public.sports and idempotently seed tennis. Create public.sessions with sport_id, host_profile_id, court_id, play_type, start_at, nullable NTRP range, slots_total from 1 through 3, notes capped at 500 characters, and status limited to open/full/cancelled/played/expired. Do not add an unapproved duration column or client-controlled expires_at.
- [ ] Create public.session_participants with one host or guest row per profile/session, status limited to requested/accepted/declined/withdrawn, played_confirmed, timestamps, and unique(session_id, profile_id). Add a partial unique index allowing exactly one host per session and enforce that a host row is accepted.
- [ ] Add session query indexes for future discovery, court/time lookup, host/time lookup, and participant session/profile status lookup. Reuse set_updated_at triggers for sessions and participants.
- [ ] Define private helpers with SECURITY DEFINER and SET search_path = '':

~~~text
private.viewer_profile_id()
private.require_complete_profile()
private.lock_and_expire_session(p_session_id)
private.expire_stale_sessions()
private.is_session_host(p_session_id, p_profile_id)
~~~

  A complete profile has a nonblank nickname and LINE ID, valid NTRP, at least one play type, and at least one active Taipei City usual court. The helper locks a session row and immediately makes a due open/full row expired before any mutation continues.

- [ ] Create public session views owned by the migration role and grant only their intended SELECT access:

  - public.session_discovery: anon and authenticated can read only future Taipei City open/full sessions. Return only the exact SessionSummary allowlist, calculate slots_remaining from accepted guest rows, and expose the approved public host fields `host_nickname`, `host_ntrp`, and `host_profile_complete` through a narrow host-profile join. It must not return `host_profile_id`, a profile URL, LINE, or any other profile field.
  - public.my_session_participations: authenticated users see their own lifecycle rows, including terminal session status, `updated_at` for history ordering, and action flags.
  - public.session_participant_roster: host sees all safe request/guest rows; a guest sees only self and the host; no row has line_id.
  - public.session_contacts: authenticated host sees each accepted guest; each accepted guest sees only that host; accepted guest-to-guest contact is impossible.

  Revoke anon/authenticated SELECT on the obsolete public.public_profile_discovery and remove it from this MVP's client contracts; player-card discovery is not a launch feature. If a future browse-only version is reintroduced, it needs a separate approved allowlist with no LINE, profile IDs, profile URLs, or historical/profile-detail fields.

- [ ] Enable RLS on all new tables. Revoke raw session, participant, report, sports, profile insert/update, and profile-join-table DML privileges from anon/authenticated; profile writes must now use save_my_profile. Retain only owner-safe profile SELECT reads and court catalogue reads. Revoke default PUBLIC execute on all security-definer functions, then grant only the public action RPCs to authenticated.
- [ ] Implement save_my_profile so profiles, profile_courts, profile_play_types, and profile_slots are replaced in one transaction. It validates all referenced court IDs are active Taipei City courts; src/dataApi.js will call this RPC instead of delete-then-insert browser writes.
- [ ] Implement the public RPCs with a FOR UPDATE lock on the target session:

~~~text
create_session: require complete host, active tennis, active Taipei City court, future start;
                insert the session and its accepted host row atomically.
request_to_join_session: require complete guest, future open session, non-host, no prior row;
                         insert requested only.
review_join_request: host alone accepts or declines a requested guest;
                     acceptance counts accepted guests under lock, changes final vacancy to full,
                     and declines any remaining requested rows when it fills the final slot.
withdraw_from_session: guest alone, before start; accepted withdrawal reopens a full session.
cancel_session: host alone, before start.
mark_session_played: host alone, after start and before expiry.
confirm_session_attendance: accepted participant, after start and before expiry;
                            changes only played_confirmed.
create_report: derives the reporter from auth.uid and accepts exactly one session/profile target.
~~~

  Existing requested rows are applications, not a waitlist. The final acceptance explicitly declines the remaining requests, so no hidden queue survives a full session.

- [ ] Add immutable-role/host-identity and legal-transition trigger checks as defense in depth. Direct raw DML must fail even if a future UI accidentally attempts it.
- [ ] Install or verify pg_cron and schedule private.expire_stale_sessions every 15 minutes under the idempotent job name expire-stale-tennis-sessions. Before scheduling, unschedule the existing job with that name if present. The scheduled body is a direct SELECT of the private function, not an HTTP callback.
- [ ] Assert in pgTAP that `session_discovery` has the three approved host display columns and lacks `host_profile_id`, `line_id`, profile URLs, and all non-allowlisted profile columns; anon/authenticated cannot select the retired public_profile_discovery view. Run the pgTAP suite locally after an explicitly confirmed local reset. Do not proceed until it is green.
- [ ] Commit as: feat: add private session lifecycle and contact boundary

### Task 4: Establish safe client models, filters, mock data, and API calls

**Files:**
- Modify src/config.js
- Modify src/mockData.js
- Modify src/filters.js
- Modify src/dataApi.js
- Create src/sessionIntent.js

- [ ] Add a failing mock smoke assertion that the public session card, sheet, and captured discovery payload contain the approved hostNickname/hostNtrp/hostProfileComplete fields but contain no seeded LINE ID, profile ID, profile URL, real name, or unallowlisted profile field. Keep a second assertion that configured Supabase mode returns no mock session if the database is empty.
- [ ] Replace REGISTERED_PLAYERS and DEMAND_PINS in src/mockData.js with 4 to 6 dynamically future-dated MOCK_SESSIONS at verified Taipei City courts. Each includes a clearly fictional public nickname, NTRP, and completion marker because the same safe SessionSummary contract is rendered in demo mode. Their labels, notes, and data are clearly local-demo-only; they include no source URLs, LINE IDs, real-looking social posts, or profile identifiers.
- [ ] Replace filterData with filterSessions(sessions, filters, now). Filter fields are district, courtId, local date, NTRP band, and a set of play types. For selected NTRP bands, compare interval overlap rather than the old single player rating:

~~~js
const overlaps = sessionMax >= bandMin && sessionMin <= bandMax;
~~~

  Treat an unspecified session range as a match, convert date filtering in Asia/Taipei, and exclude nonfuture/terminal sessions. Preserve the filtered set's order here. Export `sortSessionsForDrawer(sessions, userLocation)` for sessionController: with no location it sorts by startAt ascending; with an in-memory `{ lat, lng }` it calculates ephemeral straight-line distance and sorts by distance, then startAt. It returns new arrays and never writes location to a session or storage.

- [ ] In src/dataApi.js, remove mapDiscoveryRow, mapRequestRow, loadDiscoveryPlayers, loadActivePartnerRequests, createPartnerRequest, and partnerRequestId reporting. Add narrow field lists and mappers for loadSessionDiscovery, loadSessionSummary, loadMySessions, loadSessionRoster, and loadSessionContacts. The public discovery mapper maps only `host_nickname`, `host_ntrp`, and `host_profile_complete` into `hostNickname`, `hostNtrp`, and `hostProfileComplete`; the My Sessions mapper maps `updated_at` into `updatedAt` for history ordering. Neither mapper may spread a row or admit unexpected contact/profile identifier columns.
- [ ] Make loadSessionDiscovery accept bounds, startAfter, and startBefore. Query session_discovery only with court_lat/court_lng bounds and start_at predicates, then map strictly to SessionSummary. Do not use select("*").
- [ ] Add createSession, requestToJoinSession, acceptSessionParticipant, declineSessionParticipant, withdrawFromSession, cancelSession, markSessionPlayed, confirmSessionAttendance, and createReport RPC wrappers. Centralize Supabase errors into the documented action codes and never issue direct insert/update/delete calls for session lifecycle tables.
- [ ] Replace saveCurrentProfile's browser-side delete/reinsert sequence with save_my_profile RPC followed by loadCurrentProfile. Keep loadCurrentProfile owner-only and map it to the existing profile form shape without is_public/share.
- [ ] Create src/sessionIntent.js with savePendingIntent, readPendingIntent, and clearPendingIntent. Store only:

~~~json
{ "action": "join", "sessionId": 123 }
~~~

  or:

~~~json
{ "action": "create" }
~~~

  Use a namespaced sessionStorage key. Never store LINE, an auth token, profile fields, location, a draft note, or any form content.

- [ ] Run mock Playwright tests and a local API fixture test. Verify every public mapper has an explicit allowlist of fields, not a spread of database rows.
- [ ] Commit as: feat: define safe session client data boundary

### Task 5: Build map-first anonymous discovery with a nearby-sessions drawer

**Files:**
- Create src/sessionViews.js
- Create src/sessionController.js
- Create src/session.css
- Modify index.html
- Modify src/main.js
- Modify src/map.js
- Modify src/pins.js
- Modify src/sheets.js
- Modify src/style.css
- Modify tests/smoke.spec.js
- Modify tests/fixtures/fakeMaps.js

- [ ] Replace the old player/demand smoke tests with failing anonymous tests for the initial map, a collapsed nearby-sessions drawer, drawer expansion, session filters, session card/sheet field order and CTA states, empty/reset actions, base-court drawer, explicit-location success/rejection/recenter, and Maps-auth fallback. Extend fakeMaps to record fitBounds/setCenter calls and user-marker creation. Assert the initial load does not call navigator.geolocation; it may call it exactly after the user presses the location control; a successful fixed coordinate produces an approximately 5 km fitted view and `你` marker; a second press gets a fresh coordinate and recenters; a denial keeps the drawer usable and does not trigger a second prompt. Assert the coordinate is absent from sessionStorage and every create/profile/report mutation payload; only the normal current-map-bounds discovery query may use the resulting viewport. Preserve the zero-console-error policy.
- [ ] Change the map from role application to a labelled region. Do not add a 地圖／列表 segmented control. Add a `使用我的位置` button, a map-first layout, a collapsed nearby-sessions drawer, district/court/date filters, existing NTRP/type controls, a 台北市 location label, and an 開球局 button. The collapsed drawer shows `這個地圖範圍內 N 場可加入` before location or `附近 N 場可加入` after it, plus the nearest session's time/court/type/vacancy summary. Give dynamic controls these stable identifiers:

~~~text
use-my-location
nearby-sessions-drawer
nearby-sessions-toggle
nearby-sessions-summary
nearby-sessions-list
map-data-status
map-retry
session-card
session-sheet
discovery-empty
discovery-retry
~~~

- [ ] Keep the existing shared sheet/modal shell in src/sheets.js, but remove openPlayerSheet, openDemandSheet, openQuickContactModal, and openPublishRequestModal. Export focus-aware mountSheet/mountDialog helpers. The expanded nearby-sessions drawer, session detail, join confirmation, and create sheet all use a labelled semantic dialog/sheet with close, Escape, focus trap, and focus restoration; the collapsed drawer summary is its button opener. Each dialog uses role=dialog and aria-modal=true.
- [ ] Implement sessionViews renderNearbySessionsDrawer, openSessionSheet, openJoinSessionConfirmation, openCourtSessionDrawer, and renderDiscoveryEmpty. The drawer is collapsed by default, can be tapped or swiped open, and renders the same session rows when expanded; a drawer row and its corresponding map pin must call the same `openSessionSheet(sessionId)` path. Without a user position, order rows by start time; with one, order by ephemeral distance then start time. The public detail sheet order is exact: court/district; Taipei-local date/time; play type/NTRP range/vacancies; host public nickname/NTRP/completion marker; notes; then the primary action. Its action state is `申請加入` for anonymous/incomplete/eligible users, waiting plus withdrawal for requested users, `查看聯絡方式` for accepted users, `已額滿` for full sessions, and a clear disabled reason for cancelled/expired/started sessions. `renderDiscoveryEmpty` renders `這個範圍暫時沒有可加入的球局` with both `擴大地圖範圍` and `開第一局` actions. Cards and sheets never show LINE, a profile ID/link, real name, usual courts, or any other participant data.
- [ ] Change map grouping to accept session items. A single session pin opens openSessionSheet; two or more visible sessions at one court use a numeric count pin that opens a session-only court drawer. Replace the demand pin with a session pin labelled 局 or a vacancy count, never a nickname, NTRP, name, or contact. Keep lower-z-index base-court pins.
- [ ] Add a map idle subscription that supplies bounds through a 250ms debounce. The controller uses TAIPEI_CITY_BOUNDS until the first idle event, loads sessions independently, and applies local filters to the current viewport result. The drawer always describes the current map bounds; the five-kilometre view is not a hard query radius.
- [ ] Implement and export `setUserLocation({ lat, lng }, radiusMeters)` from src/map.js; it fits an approximately `LOCATION_INITIAL_RADIUS_METERS` viewport and renders/updates the `你` marker without adding the coordinate to a session pin or marker title. Implement requestCurrentLocation in sessionController and call navigator.geolocation.getCurrentPosition only from the `use-my-location` click handler. On success, retain `{ lat, lng }` only in controller memory, call `setUserLocation`, then refresh by the resulting map bounds. A later map pan/zoom continues with bounds discovery; pressing the control again recenters to the latest location. Never write the coordinate to sessionStorage, a profile, a session, a report, or analytics.
- [ ] Handle location denial, timeout, and unavailable-location errors inline with `無法取得位置；你仍可移動地圖或依球場尋找球局。`; leave the map and drawer usable and do not repeat the permission request. The first discovery remains Taipei City bounds with the before-location drawer wording.
- [ ] Refactor main.js boot sequence so init wires static controls, starts auth restoration, immediately loads Taipei courts, mounts map/base pins once courts resolve, and starts discovery without waiting for profile or session discovery. This makes a base-court drawer usable while the session query is slow.
- [ ] On Maps script/key failure, keep the nearby-sessions drawer usable and expanded as the session-list fallback, using the last successful bounds or TAIPEI_CITY_BOUNDS. Announce that the map is unavailable without exposing a developer-only API-key instruction overlay; retain a development-only diagnostic in the console.
- [ ] Add session.css for the map-first shell, collapsed/expanded drawer, compact cards, state badges, location feedback, and 390px layouts. The drawer toggle exposes aria-expanded and aria-controls; no element may overflow a 390px viewport. Remove legacy style rules only after searching confirms no caller remains.
- [ ] Run npm run test:mock and verify an anonymous browser sees the approved public nickname/NTRP only in session cards/sheets, while session HTML, data attributes, marker titles, and captured JSON contain neither LINE nor an addressable profile identifier.
- [ ] Commit as: feat: replace public player pins with session discovery

### Task 6: Add profile completion, create-session, and auth-intent resume

**Files:**
- Modify index.html
- Modify src/main.js
- Modify src/sessionController.js
- Modify src/sessionViews.js
- Modify src/session.css
- Modify src/dataApi.js
- Modify tests/session.spec.js
- Modify tests/smoke.spec.js

- [ ] Start with failing tests for five cases: a signed-out visitor starts Join and returns to the same session after a simulated local auth restore; a signed-in incomplete profile saves then returns to a join confirmation; a full/cancelled/expired target clears the intent and shows a meaningful stale-target message; the profile calls the nickname `公開暱稱` and discloses its public NTRP use; and the create sheet repeats that disclosure before submit.
- [ ] Replace state.session with state.authSession in main.js. Make defaultProfile incomplete: empty nickname/LINE/courts/play types, valid editable NTRP default, no share flag. The completion check requires nickname, NTRP, LINE ID, one type, and one court.
- [ ] Remove the public-player-card toggle from index.html and all profile code. Relabel the nickname field `公開暱稱` and place this exact disclosure beside it: `開球局後，這個暱稱與你的 NTRP 會顯示給瀏覽該球局的人；LINE ID 只會在你核准加入者後顯示。` Keep LINE input but change its hint to say that only an accepted host/guest pair can see it. Profile save calls the atomic RPC from Task 3.
- [ ] Implement requireSessionAction in sessionController. Before opening the login modal or profile tab, save a join/create intent. On the incomplete-profile page, show the fixed return context `完成後將回到：{球場}・{開始時間}` for a join intent. Closing login, cancelling the join confirmation, or signing out clears the intent. After auth-state restoration and after a successful profile save, resumePendingIntent reloads the target and reopens only the join confirmation; it never sends a request automatically. If the target is now full, cancelled, expired, or started, clear the intent, explain why, and return to the nearby map/drawer instead of a dead detail surface.
- [ ] Implement openCreateSessionSheet as one scrollable mobile bottom sheet, not a multi-step wizard, with test IDs session-create-modal, session-form, session-court, session-start-at, session-play-type, session-slots-total, and session-submit. Keep required fields in this first-screen order: Taipei City court, required datetime-local labelled 台北時間, one play type, then required 1–3 vacancy count. Place optional NTRP min/max and optional notes after those fields. Immediately before submit, repeat the exact `公開暱稱`/NTRP disclosure from the profile form.
- [ ] Validate client-side before the RPC: time must be future, NTRP endpoints are 1.0–7.0 in 0.5 steps, minimum is not larger than maximum, and notes fit 500 characters. Convert input explicitly as Asia/Taipei to ISO. Retain the form and render role=alert on any RPC failure.
- [ ] On create success, clear intent, close the sheet, refresh the current map/drawer discovery, route to the My Sessions `即將打球` section, and focus the created session card. In mock mode, show a clear local-demo unavailable message; never pretend a session was created.
- [ ] Run the new local session tests after the explicit reset, then npm run test:mock. Verify the configured Google OAuth flow remains hosted-only manual QA; local tests continue with e-mail/password sessions.
- [ ] Commit as: feat: add session creation and recoverable auth intent

### Task 7: Implement mutual-consent joining, lifecycle controls, contacts, and reports

**Files:**
- Modify index.html
- Modify src/main.js
- Modify src/sessionController.js
- Modify src/sessionViews.js
- Modify src/session.css
- Modify src/dataApi.js
- Delete tests/supabase.spec.js
- Create tests/session.spec.js
- Create tests/session-mobile.spec.js

- [ ] Add a third bottom tab named 我的球局 with test ID my-sessions-tab, a my-sessions-refresh control, and a my-sessions-badge. Replace role-based containers with `my-needs-action`, `my-upcoming-sessions`, and `my-history`. The badge count includes only host-owned requested guests; a guest's own pending request never increments it.
- [ ] Implement `groupMySessions(items, now)` in sessionController. It returns `{ needsAction, upcoming, history, pendingHostRequestCount }`: `needsAction` contains a host's requested guests and the viewer's own requested rows; `upcoming` contains non-terminal host rows and accepted guest rows; `history` contains played, cancelled, expired, declined, and withdrawn rows. Sort `upcoming` by startAt ascending and `history` descending by final/update time. `pendingHostRequestCount` counts only requested guest rows on sessions where the viewer role is host.
- [ ] Implement a join confirmation in openSessionSheet with test IDs join-session and session-join-form. It repeats the full safe public summary, including public host nickname/NTRP/completion marker, never submits before confirmation, and on success becomes `已送出申請，等待主揪回覆。`.
- [ ] Render `需要你處理` first. It contains host-owned requested guests with safe roster rows and participant-scoped test IDs participant-row, accept-participant-<participantId>, and decline-participant-<participantId>. Make the approved interpretation explicit: the viewer's own requested session also appears here solely to offer withdraw-session, but has a passive `等待主揪回覆` state and never contributes to the badge. Before acceptance, a host may see the applicant's nickname/NTRP/types/usual courts but never the applicant's LINE.
- [ ] Render `即將打球` second, merging the viewer's non-terminal hosted sessions and accepted guest sessions in ascending start time. Mark each card `我是主揪` or `已核准加入`; hosts can view requests/cancel before start and accepted guests can view accepted-only contact/withdraw before start. A started, non-terminal session remains here long enough for host confirm-played and accepted-participant confirm-attendance actions.
- [ ] Render `過去紀錄` last for played, cancelled, expired, declined, and withdrawn states, with a human-readable reason and no action that contradicts final state. Terminal status remains visible here but disappears from public discovery.
- [ ] Call loadSessionContacts only after rendering accepted states. Each contact row uses session-contact-<profileId> and contains a copyable LINE/opening message. A host with multiple accepted guests sees one separate contact row per guest; guests never see one another.
- [ ] Add session report flow through the retained report dialog. It calls createReport with sessionId, not any legacy request field. An authenticated user with a saved profile can report a public session; roster profile reporting is available only where a safe roster row exists.
- [ ] For every lifecycle mutation, disable only the initiating button, retain the current surface on failure, show the mapped action error, refresh the session/discovery/My Sessions state, and restore focus. A full/cancelled/expired race must never show a false success.
- [ ] Write desktop local-Supabase journeys in tests/session.spec.js:

  1. anonymous browse and join-intent recovery, with a captured discovery REST payload proving public host nickname/NTRP is allowlisted while LINE and profile IDs are absent;
  2. host creates, guest requests, host sees safe roster, the pending host review appears before upcoming cards with the only badge count, and neither sees contact before acceptance;
  3. host accepts, then only the host/that guest see each other's LINE;
  4. final slot becomes full, a remaining request is declined, and an accepted pre-start withdrawal reopens the session;
  5. host cancellation, post-start played reporting, attendance confirmation, report write, error/retry, and expiry invisibility.

- [ ] Write tests/session-mobile.spec.js for a 390px Pixel 5 user: browse through the collapsed/expanded drawer, sign in/resume, join, and action-first My Sessions. Assert every drawer/dialog/card/action stays inside the viewport and remains keyboard reachable.
- [ ] Run the desktop and mobile local projects after an explicit reset. Then run npm run test:mock to prove the protected changes did not break anonymous fallback.
- [ ] Commit as: feat: complete mutual-consent session lifecycle

### Task 8: Enforce performance, accessibility, and concurrency behavior

**Files:**
- Create tests/performance.spec.js
- Modify tests/fixtures/fakeMaps.js
- Modify tests/session.spec.js
- Modify src/map.js
- Modify src/sessionController.js
- Modify src/sessionViews.js
- Modify src/session.css

- [ ] Add a delayed-discovery test that responds to courts immediately and delays session discovery by 2.5 seconds. Within one second, assert the map-first shell, collapsed nearby-sessions drawer, usable base-court drawer, and visible loading feedback. Then assert the delayed session result renders in the drawer.
- [ ] Capture the REST discovery URL in tests/performance.spec.js. Assert it contains four viewport predicates and start_at lower/upper bounds derived from DISCOVERY_WINDOW_DAYS; assert a burst of fake bounds idle events results in one debounced request.
- [ ] Make error, loading, empty, and success states semantic: map-data-status uses role=status with aria-live=polite; request/form errors use role=alert; retry controls maintain context; filters use aria-pressed; the nearby-sessions drawer toggle exposes aria-expanded/aria-controls; and tabs expose selected state and controls.
- [ ] Add keyboard tests for the expanded nearby-sessions drawer, session detail, join confirmation, and create sheet: each opens as a labelled dialog, traps focus, closes on Escape, and returns focus to its original trigger. Verify the empty-state buttons, location error, and stale-join recovery leave a usable next action in the same context.
- [ ] Add a direct race test using two isolated clients: create a one-vacancy session, create two requested guests, send two review_join_request acceptance calls concurrently, and require exactly one fulfilled response. Assert one accepted guest, session full, and no second contact disclosure.
- [ ] Retain tests for asynchronous Google Maps authentication failure, but assert the expanded nearby-sessions drawer fallback rather than a developer setup overlay. Run the same zero-console-error capture on every successful mock journey.
- [ ] Run npm run test:db, npm run test:mock, npm run test:local, and npm run build. The literal three-second mobile-network budget is additionally checked manually on the hosted preview with a 390px physical/device-emulation network profile; record the result in the release checklist.
- [ ] Commit as: test: enforce responsive session discovery reliability

### Task 9: Update source-of-truth docs and execute the safe public-launch runbook

**Files:**
- Modify CLAUDE.md
- Modify .claude/rules/supabase.md
- Modify .claude/rules/testing.md
- Modify README.md
- Modify supabase/README.md
- Modify docs/mvp-plan.md
- Create docs/tennis-ecosystem/README.md

- [ ] Remove every claim that quick contact is a UI-only privacy gate. Document session_discovery's exact public host allowlist (public nickname, NTRP, completed-basic-profile marker only), session_contacts, roster limits, lifecycle RPCs, city scope, pg_cron job, and the fact that LINE is a database-enforced secret revealed only after acceptance. Keep CLAUDE.md at or below 200 lines.
- [ ] Document the non-destructive local test workflow: npx supabase start, explicit confirmed reset, npm run test:db, npm run test:mock, npm run test:local, npm run build. State that normal npm test never resets a database.
- [ ] Update README product copy and screenshots/instructions from player-demand pins to map-first public sessions, the collapsed nearby-sessions drawer, explicit `使用我的位置`, join request, host review, and accepted-only contact. Include Google OAuth hosted QA, VITE_SUPPORT_EMAIL, and Maps-referrer configuration without committing secrets.
- [ ] Add docs/tennis-ecosystem/README.md as a repeatable research template for 15 official-source court cards: court, district/transport, booking model, verified availability, fixed activity/course evidence, source URL, verification date, and pilot suitability. It must explicitly prohibit private-group scraping or unverified club-occupation claims.
- [ ] Before hosted push, run the full local gate and git diff --check. Verify the generated court file with node scripts/generate-courts-seed.mjs --check.
- [ ] Apply migrations to hosted only after the backup/count preflight. Run npx supabase migration list and require each local migration stamp to match remote.
- [ ] In hosted QA, use an anonymous REST client to prove discovery returns only the documented safe fields, including public host nickname/NTRP/completion marker but no host profile ID, profile URL, LINE, or other profile data; raw sessions/participants/roster/contacts and retired public_profile_discovery are denied. Then use two real QA accounts to prove the accepted pair sees only one another. Confirm the cron job exists and force a controlled stale-session check.
- [ ] On the stable preview, manually test Google OAuth callback, 390px map/drawer fallback, initial no-location-prompt behavior, explicit location success/rejection and ~5 km view, drawer expansion/empty state, create, join, host acceptance, contact disclosure, cancel, played report, report submission, and support/privacy links. Do not manufacture public sessions; remove QA sessions before sharing in communities.
- [ ] Configure VITE_SUPPORT_EMAIL in the production environment and verify the rendered mailto target. This is a hard launch prerequisite, not a committed default.
- [ ] Share the launch link only after all gates pass, first with approved Taipei tennis LINE/Facebook communities. For the first two weeks, query sessions/participants for the agreed funnel: real users, sessions, accepted joins, and played reports; make one evidence-based friction change per week.
- [ ] Commit as: docs: publish Taipei session MVP release runbook

## Verification matrix

### pgTAP requirements in supabase/tests/session_rls.sql

- [ ] sessions, session_participants, sports, discovery, roster, contacts, and My Sessions views exist; public.partner_requests and reports.partner_request_id do not.
- [ ] The retired public_profile_discovery view is unavailable to anon/authenticated; it is not an alternate route to profile IDs or contact data.
- [ ] Anonymous can select safe future session_discovery rows but receives permission errors for raw sessions, raw participants, private legacy tables, roster, contacts, and My Sessions.
- [ ] session_discovery's anonymous allowlist contains `host_nickname`, `host_ntrp`, and `host_profile_complete`, but excludes `host_profile_id`, profile URLs, LINE, real names, phone/e-mail, usual courts, and every other profile/participant field.
- [ ] A complete host creates exactly one accepted host participant; incomplete profiles cannot create or request.
- [ ] Direct browser-role DML for sessions, participants, and reports is denied.
- [ ] Before acceptance, host and applicant receive zero contact rows; guest self-accept fails; host acceptance enables exactly one reciprocal host/guest contact pair.
- [ ] With a host and two accepted guests, the host sees both guest contacts and either guest sees only the host, never the other guest.
- [ ] Last acceptance changes the session to full, rejected acceptance cannot overfill it, and a pre-start accepted withdrawal changes full to open.
- [ ] Host-only pre-start cancel, host-only post-start played, accepted-only attendance confirmation, and stale-session expiry are enforced.
- [ ] create_report derives reporter identity, permits exactly one target, rejects zero/both targets, and cannot be spoofed.
- [ ] Taipei City enforcement rejects a New Taipei court even though it remains active in the catalogue.

### Playwright requirements

- [ ] Mock desktop/mobile: map-first public discovery with a collapsed/expanded nearby-sessions drawer, initial no-location-prompt behavior, explicit location success/rejection, public host display fields without contact leakage, base-court drawer, empty/reset, Maps failure fallback, and no console errors.
- [ ] Local desktop: anonymous browse, intent recovery, atomic profile save and public-disclosure copy, one-sheet creation, action-first My Sessions ordering/badge, request, accept/decline, contact secrecy, reopen, cancel, played, attendance, report, retry, expiry, and acceptance race.
- [ ] Local mobile: collapsed/expanded drawer to login/profile completion to join to action-first My Sessions at 390px.
- [ ] Performance: first usable base-map/drawer state within one second despite a 2.5-second discovery delay; one bounds-request for a burst; bounded REST query predicates.
- [ ] Hosted manual: OAuth, Maps, initial no-location-prompt/explicit-location behavior, production referrer key, anonymous REST allowlist/secrecy, cron schedule, two-account pair disclosure, support/privacy links, and 3-second mobile observation.

## Final implementation command order

Run these as separate commands so a failure stops investigation at its source:

~~~bash
npx supabase start
CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test
npm run test:db
npm run test:mock
npm run test:local
node scripts/generate-courts-seed.mjs --check
npm run build
git diff --check
~~~

Hosted deployment follows only after these succeed and the backup/count preflight is recorded:

~~~bash
npx supabase db push
npx supabase migration list
~~~

## Explicit non-goals after this plan

- No fake sessions to make an empty board look active.
- No raw social-community ingestion, scheduling automation, or court-booking promise.
- No direct player-to-player invitation state, invited participant status, or hidden waitlist.
- No expansion to New Taipei public sessions or another sport until the Taipei City tennis funnel repeatedly produces played sessions.
