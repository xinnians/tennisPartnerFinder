begin;

select plan(100);

-- Structural boundary: the quick-contact tables are archived, while the
-- session boundary is the only public product model.
select has_table('public', 'sessions', 'sessions table exists');
select has_table('public', 'session_participants', 'session participants table exists');
select has_table('public', 'sports', 'sports table exists');
select has_table('public', 'reports', 'new reports table exists');
select has_table('private', 'legacy_partner_requests', 'legacy partner requests are private');
select has_table('private', 'legacy_reports', 'legacy reports are private');
select has_view('public', 'session_discovery', 'public session discovery view exists');
select has_view('public', 'my_session_participations', 'my sessions view exists');
select has_view('public', 'session_participant_roster', 'session roster view exists');
select has_view('public', 'session_contacts', 'session contacts view exists');
select is(
  exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'partner_requests'
  ),
  false,
  'partner requests are not public'
);
select is(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reports' and column_name = 'partner_request_id'
  ),
  false,
  'new reports have no partner_request_id'
);
select is(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'private.legacy_reports'::regclass
      and constraint_row.confrelid = 'private.legacy_partner_requests'::regclass
      and constraint_row.contype = 'f'
  ),
  true,
  'legacy reports retain their archival partner-request foreign key'
);
select is(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.reports'::regclass
      and pg_get_constraintdef(constraint_row.oid) like '%num_nonnulls%'
  ),
  true,
  'reports enforce exactly one target with num_nonnulls'
);
select is((select relrowsecurity from pg_class where oid = 'public.sports'::regclass), true, 'sports RLS is enabled');
select is((select relrowsecurity from pg_class where oid = 'public.sessions'::regclass), true, 'sessions RLS is enabled');
select is((select relrowsecurity from pg_class where oid = 'public.session_participants'::regclass), true, 'participants RLS is enabled');
select is((select relrowsecurity from pg_class where oid = 'public.reports'::regclass), true, 'reports RLS is enabled');

-- The discovery projection is deliberately exact: no profile identifier or
-- profile detail can be smuggled into an anonymous response.
select is(
  (
    select string_agg(column_name, ',' order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'session_discovery'
  ),
  'id,session_id,sport_code,court_id,court,court_district,court_lat,court_lng,start_at,play_type,ntrp_min,ntrp_max,slots_total,slots_remaining,notes,host_nickname,host_ntrp,host_profile_complete,status',
  'discovery has the exact public SessionSummary allowlist'
);
select is(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'my_session_participations'
      and column_name in ('viewer_role', 'viewer_participant_status', 'viewer_played_confirmed', 'updated_at', 'can_cancel', 'can_withdraw', 'can_confirm_played', 'can_confirm_attendance')
    group by table_schema, table_name
    having count(*) = 8
  ),
  true,
  'my sessions includes viewer lifecycle and action fields'
);
select is(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'session_participant_roster' and column_name = 'line_id'
  ),
  false,
  'roster never includes LINE ID'
);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data
)
values
  ('00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'session-host@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'session-guest-one@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000001003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'session-guest-two@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000001004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'session-guest-three@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000001006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'session-guest-four@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000001005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'session-incomplete@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

-- Build four complete profiles solely through the browser RPC.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select ok(
  public.save_my_profile(
    'Session Host',
    3.5,
    'host_line',
    array[(select id from public.courts where is_active and city = '台北市' order by id limit 1)]::bigint[],
    array['雙打']::text[],
    array['we-a']::text[]
  ) is not null,
  'complete host saves a profile through the RPC'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001002', true);
select ok(
  public.save_my_profile(
    'Guest One',
    3.0,
    'guest_one_line',
    array[(select id from public.courts where is_active and city = '台北市' order by id limit 1)]::bigint[],
    array['雙打']::text[],
    array['we-a']::text[]
  ) is not null,
  'first guest saves a complete profile through the RPC'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001003', true);
select ok(
  public.save_my_profile(
    'Guest Two',
    4.0,
    'guest_two_line',
    array[(select id from public.courts where is_active and city = '台北市' order by id limit 1)]::bigint[],
    array['雙打']::text[],
    array['we-a']::text[]
  ) is not null,
  'second guest saves a complete profile through the RPC'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001004', true);
select ok(
  public.save_my_profile(
    'Guest Three',
    4.5,
    'guest_three_line',
    array[(select id from public.courts where is_active and city = '台北市' order by id limit 1)]::bigint[],
    array['雙打']::text[],
    array['we-a']::text[]
  ) is not null,
  'third guest saves a complete profile through the RPC'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001006', true);
select ok(
  public.save_my_profile(
    'Guest Four',
    4.0,
    'guest_four_line',
    array[(select id from public.courts where is_active and city = '台北市' order by id limit 1)]::bigint[],
    array['雙打']::text[],
    array['we-a']::text[]
  ) is not null,
  'fourth guest saves a complete profile through the RPC'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select throws_ok(
  $$
    select public.save_my_profile(
      'Session Host',
      3.5,
      'host_line',
      array[(select id from public.courts where is_active and city = '新北市' order by id limit 1)]::bigint[],
      array['雙打']::text[],
      array['we-a']::text[]
    )
  $$,
  'P0001',
  'PROFILE_INCOMPLETE',
  'profile save rejects an active New Taipei usual court'
);
select throws_ok(
  $$
    select public.save_my_profile(
      'Session Host',
      3.5,
      'host_line',
      array[(select id from public.courts where is_active and city = '台北市' order by id limit 1)]::bigint[],
      array['invalid-play-type']::text[],
      array['we-a']::text[]
    )
  $$,
  'P0001',
  'PROFILE_INCOMPLETE',
  'profile save rejects an invalid play type'
);

select ok(
  public.create_session(
    (select id from public.courts where is_active and city = '台北市' order by id limit 1),
    '雙打',
    now() + interval '7 days',
    3.0,
    5.0,
    2,
    '__pgtap_main_session__'
  ) is not null,
  'complete host creates the main session'
);
reset role;

select set_config(
  'pgtap.main_session_id',
  (select id::text from public.sessions where notes = '__pgtap_main_session__'),
  true
);
select set_config(
  'pgtap.host_profile_id',
  (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000001001'),
  true
);
select is(
  (
    select count(*)
    from public.session_participants participant_row
    where participant_row.session_id = current_setting('pgtap.main_session_id')::bigint
      and participant_row.profile_id = current_setting('pgtap.host_profile_id')::bigint
      and participant_row.role = 'host'
      and participant_row.status = 'accepted'
  ),
  1::bigint,
  'session creation adds exactly one accepted host participant'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001005', true);
select throws_ok(
  $$
    select public.create_session(
      (select id from public.courts where is_active and city = '台北市' order by id limit 1),
      '雙打', now() + interval '8 days', 3.0, 5.0, 1, '__pgtap_incomplete_create__'
    )
  $$,
  'P0001',
  'PROFILE_INCOMPLETE',
  'incomplete profile cannot create a session'
);
select throws_ok(
  $$select public.request_to_join_session(current_setting('pgtap.main_session_id')::bigint)$$,
  'P0001',
  'PROFILE_INCOMPLETE',
  'incomplete profile cannot request a session'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select throws_ok(
  $$
    select public.create_session(
      (select id from public.courts where is_active and city = '新北市' order by id limit 1),
      '雙打', now() + interval '8 days', 3.0, 5.0, 1, '__pgtap_new_taipei_session__'
    )
  $$,
  'P0001',
  'INVALID_TRANSITION',
  'session creation rejects an active New Taipei court'
);
reset role;

-- Anon gets the narrow discovery view and nothing else, including no retired
-- profile discovery route.
set local role anon;
select is(
  (select count(*) from public.session_discovery where notes = '__pgtap_main_session__'),
  1::bigint,
  'anon can discover the safe future session summary'
);
select throws_ok($$select * from public.sessions$$, '42501', null, 'anon cannot select raw sessions');
select throws_ok($$select * from public.session_participants$$, '42501', null, 'anon cannot select raw participants');
select throws_ok($$select * from public.sports$$, '42501', null, 'anon cannot select raw sports');
select throws_ok($$select * from private.legacy_partner_requests$$, '42501', null, 'anon cannot select private legacy requests');
select throws_ok($$select * from public.session_participant_roster$$, '42501', null, 'anon cannot select the roster');
select throws_ok($$select * from public.session_contacts$$, '42501', null, 'anon cannot select contacts');
select throws_ok($$select * from public.my_session_participations$$, '42501', null, 'anon cannot select My Sessions');
select throws_ok($$select * from public.public_profile_discovery$$, '42P01', null, 'anon has no retired profile discovery route');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select throws_ok($$select * from public.public_profile_discovery$$, '42P01', null, 'authenticated users have no retired profile discovery route');
select throws_ok($$update public.profiles set nickname = 'bypassed' where id = current_setting('pgtap.host_profile_id')::bigint$$, '42501', null, 'direct profile updates are denied');
select throws_ok(
  $$
    insert into public.sessions (sport_id, host_profile_id, court_id, play_type, start_at, slots_total)
    values (1, current_setting('pgtap.host_profile_id')::bigint, 1, '雙打', now() + interval '9 days', 1)
  $$,
  '42501', null, 'direct session inserts are denied'
);
select throws_ok(
  $$
    insert into public.session_participants (session_id, profile_id, role, status)
    values (current_setting('pgtap.main_session_id')::bigint, current_setting('pgtap.host_profile_id')::bigint, 'guest', 'requested')
  $$,
  '42501', null, 'direct participant inserts are denied'
);
select throws_ok(
  $$
    insert into public.reports (reporter_profile_id, session_id, reason)
    values (current_setting('pgtap.host_profile_id')::bigint, current_setting('pgtap.main_session_id')::bigint, 'bypass')
  $$,
  '42501', null, 'direct report inserts are denied'
);
reset role;

-- Request, acceptance, contact, capacity, and re-open state machine.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001002', true);
select lives_ok(
  $$select public.request_to_join_session(current_setting('pgtap.main_session_id')::bigint)$$,
  'complete guest can request the session'
);
reset role;
select set_config(
  'pgtap.guest_one_participant_id',
  (
    select participant_row.id::text
    from public.session_participants participant_row
    join public.profiles profile_row on profile_row.id = participant_row.profile_id
    where participant_row.session_id = current_setting('pgtap.main_session_id')::bigint
      and profile_row.user_id = '00000000-0000-0000-0000-000000001002'
  ),
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select is(
  (select count(*) from public.session_contacts where session_id = current_setting('pgtap.main_session_id')::bigint),
  0::bigint,
  'host has no contact row before accepting an applicant'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001002', true);
select is(
  (select count(*) from public.session_contacts where session_id = current_setting('pgtap.main_session_id')::bigint),
  0::bigint,
  'applicant has no contact row before acceptance'
);
select throws_ok(
  $$
    select public.review_join_request(
      current_setting('pgtap.main_session_id')::bigint,
      current_setting('pgtap.guest_one_participant_id')::bigint,
      'accepted'
    )
  $$,
  'P0001', 'NOT_SESSION_HOST', 'guest cannot accept their own request'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select lives_ok(
  $$
    select public.review_join_request(
      current_setting('pgtap.main_session_id')::bigint,
      current_setting('pgtap.guest_one_participant_id')::bigint,
      'accepted'
    )
  $$,
  'host accepts the first guest'
);
select is(
  (select count(*) from public.session_contacts where session_id = current_setting('pgtap.main_session_id')::bigint),
  1::bigint,
  'host receives one accepted guest contact'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001002', true);
select is(
  (select count(*) from public.session_contacts where session_id = current_setting('pgtap.main_session_id')::bigint),
  1::bigint,
  'accepted guest receives the reciprocal host contact'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001003', true);
select lives_ok($$select public.request_to_join_session(current_setting('pgtap.main_session_id')::bigint)$$, 'second guest requests the session');
reset role;
select set_config(
  'pgtap.guest_two_participant_id',
  (
    select participant_row.id::text
    from public.session_participants participant_row
    join public.profiles profile_row on profile_row.id = participant_row.profile_id
    where participant_row.session_id = current_setting('pgtap.main_session_id')::bigint
      and profile_row.user_id = '00000000-0000-0000-0000-000000001003'
  ),
  true
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001004', true);
select lives_ok($$select public.request_to_join_session(current_setting('pgtap.main_session_id')::bigint)$$, 'third guest requests the session');
reset role;
select set_config(
  'pgtap.guest_three_participant_id',
  (
    select participant_row.id::text
    from public.session_participants participant_row
    join public.profiles profile_row on profile_row.id = participant_row.profile_id
    where participant_row.session_id = current_setting('pgtap.main_session_id')::bigint
      and profile_row.user_id = '00000000-0000-0000-0000-000000001004'
  ),
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select lives_ok(
  $$
    select public.review_join_request(
      current_setting('pgtap.main_session_id')::bigint,
      current_setting('pgtap.guest_two_participant_id')::bigint,
      'accepted'
    )
  $$,
  'host accepts the final vacancy'
);
reset role;
select is(
  (select status from public.sessions where id = current_setting('pgtap.main_session_id')::bigint),
  'full',
  'last acceptance marks the session full'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001006', true);
select throws_ok(
  $$select public.request_to_join_session(current_setting('pgtap.main_session_id')::bigint)$$,
  'P0001', 'SESSION_FULL', 'full session rejects a new complete applicant'
);
reset role;
select is(
  (
    select status
    from public.session_participants
    where id = current_setting('pgtap.guest_three_participant_id')::bigint
  ),
  'declined',
  'last acceptance declines all remaining requested guests'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select throws_ok(
  $$
    select public.review_join_request(
      current_setting('pgtap.main_session_id')::bigint,
      current_setting('pgtap.guest_three_participant_id')::bigint,
      'accepted'
    )
  $$,
  'P0001', 'ALREADY_DECIDED', 'declined request cannot be accepted to overfill the session'
);
reset role;
select is(
  (
    select count(*)
    from public.session_participants
    where session_id = current_setting('pgtap.main_session_id')::bigint
      and role = 'guest' and status = 'accepted'
  ),
  2::bigint,
  'rejected acceptance cannot overfill accepted guest capacity'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select is(
  (select count(*) from public.session_contacts where session_id = current_setting('pgtap.main_session_id')::bigint),
  2::bigint,
  'host sees both accepted guest contacts'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001002', true);
select is(
  (
    select count(*)
    from public.session_contacts
    where session_id = current_setting('pgtap.main_session_id')::bigint
      and nickname = 'Session Host'
  ),
  1::bigint,
  'accepted guest sees the host and no guest-to-guest contact'
);
select lives_ok($$select public.withdraw_from_session(current_setting('pgtap.main_session_id')::bigint)$$, 'accepted guest can withdraw before start');
select is(
  (select count(*) from public.session_contacts where session_id = current_setting('pgtap.main_session_id')::bigint),
  0::bigint,
  'withdrawn guest loses the contact row'
);
reset role;
select is(
  (select status from public.sessions where id = current_setting('pgtap.main_session_id')::bigint),
  'open',
  'accepted pre-start withdrawal reopens a full session'
);

-- Host-only cancel, host-only post-start played, accepted-only attendance, and
-- immediate expiry are all independent lifecycle paths.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select ok(
  public.create_session(
    (select id from public.courts where is_active and city = '台北市' order by id limit 1),
    '雙打', now() + interval '9 days', 3.0, 5.0, 1, '__pgtap_cancel_session__'
  ) is not null,
  'host creates a cancelable session'
);
reset role;
select set_config('pgtap.cancel_session_id', (select id::text from public.sessions where notes = '__pgtap_cancel_session__'), true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001002', true);
select throws_ok(
  $$select public.cancel_session(current_setting('pgtap.cancel_session_id')::bigint)$$,
  'P0001', 'NOT_SESSION_HOST', 'guest cannot cancel a host session'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select lives_ok($$select public.cancel_session(current_setting('pgtap.cancel_session_id')::bigint)$$, 'host can cancel before start');
reset role;
select is(
  (select status from public.sessions where id = current_setting('pgtap.cancel_session_id')::bigint),
  'cancelled',
  'host cancellation sets terminal cancelled status'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select ok(
  public.create_session(
    (select id from public.courts where is_active and city = '台北市' order by id limit 1),
    '雙打', now() + interval '10 days', 3.0, 5.0, 1, '__pgtap_played_session__'
  ) is not null,
  'host creates a played-session fixture'
);
reset role;
select set_config('pgtap.played_session_id', (select id::text from public.sessions where notes = '__pgtap_played_session__'), true);
update public.sessions
set start_at = now() - interval '1 hour'
where id = current_setting('pgtap.played_session_id')::bigint;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001002', true);
select throws_ok(
  $$select public.mark_session_played(current_setting('pgtap.played_session_id')::bigint)$$,
  'P0001', 'NOT_SESSION_HOST', 'guest cannot mark a session played'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select lives_ok($$select public.mark_session_played(current_setting('pgtap.played_session_id')::bigint)$$, 'host can mark a started session played');
reset role;
select is(
  (select status from public.sessions where id = current_setting('pgtap.played_session_id')::bigint),
  'played',
  'host post-start played transition is persisted'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select ok(
  public.create_session(
    (select id from public.courts where is_active and city = '台北市' order by id limit 1),
    '雙打', now() + interval '11 days', 3.0, 5.0, 1, '__pgtap_attendance_session__'
  ) is not null,
  'host creates an attendance fixture'
);
reset role;
select set_config('pgtap.attendance_session_id', (select id::text from public.sessions where notes = '__pgtap_attendance_session__'), true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001003', true);
select lives_ok($$select public.request_to_join_session(current_setting('pgtap.attendance_session_id')::bigint)$$, 'guest can request attendance fixture');
reset role;
select set_config(
  'pgtap.attendance_guest_participant_id',
  (
    select participant_row.id::text
    from public.session_participants participant_row
    join public.profiles profile_row on profile_row.id = participant_row.profile_id
    where participant_row.session_id = current_setting('pgtap.attendance_session_id')::bigint
      and profile_row.user_id = '00000000-0000-0000-0000-000000001003'
  ),
  true
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select throws_ok(
  $$
    select public.review_join_request(
      current_setting('pgtap.attendance_session_id')::bigint,
      current_setting('pgtap.attendance_guest_participant_id')::bigint,
      null
    )
  $$,
  'P0001', 'INVALID_TRANSITION', 'host cannot accept a request with a null decision'
);
select lives_ok(
  $$
    select public.review_join_request(
      current_setting('pgtap.attendance_session_id')::bigint,
      current_setting('pgtap.attendance_guest_participant_id')::bigint,
      'accepted'
    )
  $$,
  'host accepts the attendance guest'
);
reset role;
update public.sessions
set start_at = now() - interval '1 hour'
where id = current_setting('pgtap.attendance_session_id')::bigint;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001004', true);
select throws_ok(
  $$select public.confirm_session_attendance(current_setting('pgtap.attendance_session_id')::bigint)$$,
  'P0001', 'NOT_ACCEPTED_PARTICIPANT', 'non-accepted user cannot confirm attendance'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001003', true);
select lives_ok($$select public.confirm_session_attendance(current_setting('pgtap.attendance_session_id')::bigint)$$, 'accepted guest can confirm attendance after start');
reset role;
select is(
  (
    select played_confirmed
    from public.session_participants
    where id = current_setting('pgtap.attendance_guest_participant_id')::bigint
  ),
  true,
  'attendance confirmation changes only the accepted participant flag'
);
select is(
  (select status from public.sessions where id = current_setting('pgtap.attendance_session_id')::bigint),
  'full',
  'attendance confirmation does not change session lifecycle status'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select ok(
  public.create_session(
    (select id from public.courts where is_active and city = '台北市' order by id limit 1),
    '雙打', now() + interval '12 days', 3.0, 5.0, 1, '__pgtap_stale_session__'
  ) is not null,
  'host creates a stale-session fixture'
);
reset role;
select set_config('pgtap.stale_session_id', (select id::text from public.sessions where notes = '__pgtap_stale_session__'), true);
update public.sessions
set start_at = now() - interval '25 hours'
where id = current_setting('pgtap.stale_session_id')::bigint;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select is(
  public.cancel_session(current_setting('pgtap.stale_session_id')::bigint),
  'SESSION_EXPIRED',
  'due mutation returns the committed expiry outcome instead of raising'
);
reset role;
select is(
  (select status from public.sessions where id = current_setting('pgtap.stale_session_id')::bigint),
  'expired',
  'stale session is persisted as expired before a mutation can continue'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select ok(
  public.create_session(
    (select id from public.courts where is_active and city = '台北市' order by id limit 1),
    '雙打', now() + interval '13 days', 3.0, 5.0, 1, '__pgtap_cron_stale_session__'
  ) is not null,
  'host creates a cron-expiry fixture'
);
reset role;
select set_config('pgtap.cron_stale_session_id', (select id::text from public.sessions where notes = '__pgtap_cron_stale_session__'), true);
update public.sessions
set start_at = now() - interval '25 hours'
where id = current_setting('pgtap.cron_stale_session_id')::bigint;
select is(
  private.expire_stale_sessions(),
  1,
  'cron worker function expires a stale open session'
);
select is(
  (select status from public.sessions where id = current_setting('pgtap.cron_stale_session_id')::bigint),
  'expired',
  'cron worker persists the expired status'
);
select is(
  (select count(*) from cron.job where jobname = 'expire-stale-tennis-sessions'),
  1::bigint,
  'pg_cron schedules exactly one idempotent expiry job'
);
select is(
  (select command from cron.job where jobname = 'expire-stale-tennis-sessions'),
  'select private.expire_stale_sessions()',
  'cron job directly invokes the private expiry function'
);

-- A deferred database invariant protects capacity even if a future privileged
-- backend accidentally bypasses the public review RPC.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select ok(
  public.create_session(
    (select id from public.courts where is_active and city = '台北市' order by id limit 1),
    '雙打', now() + interval '14 days', 3.0, 5.0, 1, '__pgtap_capacity_trigger_session__'
  ) is not null,
  'host creates a capacity-trigger fixture'
);
reset role;
select set_config('pgtap.capacity_trigger_session_id', (select id::text from public.sessions where notes = '__pgtap_capacity_trigger_session__'), true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001006', true);
select lives_ok(
  $$select public.request_to_join_session(current_setting('pgtap.capacity_trigger_session_id')::bigint)$$,
  'guest requests the capacity-trigger fixture'
);
reset role;
select set_config(
  'pgtap.capacity_trigger_participant_id',
  (
    select participant_row.id::text
    from public.session_participants participant_row
    join public.profiles profile_row on profile_row.id = participant_row.profile_id
    where participant_row.session_id = current_setting('pgtap.capacity_trigger_session_id')::bigint
      and profile_row.user_id = '00000000-0000-0000-0000-000000001006'
  ),
  true
);
update public.session_participants
set status = 'accepted'
where id = current_setting('pgtap.capacity_trigger_participant_id')::bigint;
select throws_ok(
  $$set constraints session_participants_capacity_invariant immediate$$,
  'P0001', 'INVALID_TRANSITION', 'deferred trigger rejects a raw accepted guest while session remains open'
);

-- Reports derive their reporter from auth, and the RPC enforces one target.
select set_config(
  'pgtap.guest_one_profile_id',
  (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000001002'),
  true
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select ok(
  public.create_report(
    current_setting('pgtap.main_session_id')::bigint,
    null,
    '__pgtap_session_report__'
  ) is not null,
  'reporter can create a session-target report through the RPC'
);
reset role;
select is(
  (
    select reporter_profile_id
    from public.reports
    where reason = '__pgtap_session_report__'
  ),
  current_setting('pgtap.host_profile_id')::bigint,
  'report RPC derives and cannot spoof reporter identity'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select throws_ok(
  $$select public.create_report(null, null, '__pgtap_zero_target__')$$,
  'P0001', 'INVALID_TRANSITION', 'report rejects zero targets'
);
select throws_ok(
  $$
    select public.create_report(
      current_setting('pgtap.main_session_id')::bigint,
      current_setting('pgtap.host_profile_id')::bigint,
      '__pgtap_two_targets__'
    )
  $$,
  'P0001', 'INVALID_TRANSITION', 'report rejects two targets'
);
select ok(
  public.create_report(
    null,
    current_setting('pgtap.guest_one_profile_id')::bigint,
    '__pgtap_profile_report__'
  ) is not null,
  'report permits exactly one profile target'
);
reset role;
select is(
  (
    select count(*)
    from public.reports
    where reason in ('__pgtap_session_report__', '__pgtap_profile_report__')
      and num_nonnulls(session_id, reported_profile_id) = 1
  ),
  2::bigint,
  'all RPC-created reports have exactly one target'
);

select * from finish();

rollback;
