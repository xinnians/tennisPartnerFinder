begin;

create function pg_temp.text_outcome(p_statement text)
returns text
language plpgsql
as $$
declare
  result_text text;
begin
  execute p_statement into result_text;
  return result_text;
exception when others then
  return 'ERROR:' || sqlerrm;
end;
$$;

-- Historical lifecycle fixtures require an authoritative clock setup, while
-- production start_at values are intentionally immutable. This helper runs
-- only inside pgTAP's rolled-back transaction and temporarily disables the
-- one relevant transition trigger solely to construct naturally-aged records.
create function pg_temp.set_session_fixture_state(
  p_session_id bigint,
  p_start_at timestamptz,
  p_status text default null
)
returns void
language plpgsql
as $$
begin
  set constraints all immediate;
  set constraints all deferred;
  alter table public.sessions disable trigger sessions_enforce_transition;
  alter table public.sessions disable trigger sessions_capacity_invariant;
  alter table public.sessions disable trigger sessions_host_invariant;

  begin
    if p_status is null then
      update public.sessions
      set start_at = p_start_at
      where id = p_session_id;
    else
      update public.sessions
      set start_at = p_start_at,
          status = p_status
      where id = p_session_id;
    end if;
  exception when others then
    alter table public.sessions enable trigger sessions_host_invariant;
    alter table public.sessions enable trigger sessions_capacity_invariant;
    alter table public.sessions enable trigger sessions_enforce_transition;
    raise;
  end;

  alter table public.sessions enable trigger sessions_host_invariant;
  alter table public.sessions enable trigger sessions_capacity_invariant;
  alter table public.sessions enable trigger sessions_enforce_transition;
end;
$$;

create function pg_temp.set_participant_fixture_status(
  p_participant_id bigint,
  p_status text
)
returns void
language plpgsql
as $$
begin
  set constraints all immediate;
  set constraints all deferred;
  alter table public.session_participants
  disable trigger session_participants_enforce_transition;
  alter table public.session_participants
  disable trigger session_participants_capacity_invariant;
  alter table public.session_participants
  disable trigger session_participants_host_invariant;

  begin
    update public.session_participants
    set status = p_status
    where id = p_participant_id;
  exception when others then
    alter table public.session_participants
    enable trigger session_participants_host_invariant;
    alter table public.session_participants
    enable trigger session_participants_capacity_invariant;
    alter table public.session_participants
    enable trigger session_participants_enforce_transition;
    raise;
  end;

  alter table public.session_participants
  enable trigger session_participants_host_invariant;
  alter table public.session_participants
  enable trigger session_participants_capacity_invariant;
  alter table public.session_participants
  enable trigger session_participants_enforce_transition;
end;
$$;

select plan(192);

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
  (
    select confdeltype::text
    from pg_constraint
    where conrelid = 'private.legacy_partner_requests'::regclass
      and conname = 'partner_requests_profile_id_fkey'
  ),
  'r',
  'legacy request profile FK preserves archival rows with RESTRICT'
);
select is(
  (
    select confdeltype::text
    from pg_constraint
    where conrelid = 'private.legacy_reports'::regclass
      and conname = 'reports_reporter_profile_id_fkey'
  ),
  'r',
  'legacy report reporter FK preserves archival rows with RESTRICT'
);
select is(
  (
    select confdeltype::text
    from pg_constraint
    where conrelid = 'private.legacy_reports'::regclass
      and conname = 'reports_reported_profile_id_fkey'
  ),
  'r',
  'legacy report subject FK cannot be set null by profile deletion'
);
select is(
  (
    select confdeltype::text
    from pg_constraint
    where conrelid = 'private.legacy_reports'::regclass
      and conname = 'reports_partner_request_id_fkey'
  ),
  'r',
  'legacy report request FK cannot be set null by request deletion'
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
  ('00000000-0000-0000-0000-000000001005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'session-incomplete@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000001007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'session-archive-witness@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb)
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

-- A disposable auth-linked archival profile proves that moving legacy tables
-- private does not leave cascade or set-null paths back into their history.
insert into public.profiles (user_id, nickname, ntrp, line_id)
values ('00000000-0000-0000-0000-000000001007', 'Archive Witness', 3.0, 'archive_line')
on conflict (user_id) do nothing;
select set_config(
  'pgtap.archive_profile_id',
  (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000001007'),
  true
);
insert into private.legacy_partner_requests (
  profile_id, court_id, desired_time_text, request_text, expires_at
)
values (
  current_setting('pgtap.archive_profile_id')::bigint,
  (select id from public.courts where is_active and city = '台北市' order by id limit 1),
  'archive witness time', '__pgtap_archive_request__', now() + interval '1 day'
);
select set_config(
  'pgtap.archive_request_id',
  (select id::text from private.legacy_partner_requests where request_text = '__pgtap_archive_request__'),
  true
);
insert into private.legacy_reports (
  reporter_profile_id, reported_profile_id, partner_request_id, reason
)
values (
  current_setting('pgtap.archive_profile_id')::bigint,
  current_setting('pgtap.archive_profile_id')::bigint,
  current_setting('pgtap.archive_request_id')::bigint,
  '__pgtap_archive_report__'
);
select throws_ok(
  $$delete from public.profiles where id = current_setting('pgtap.archive_profile_id')::bigint$$,
  '23503', null, 'profile deletion cannot cascade or rewrite archived records'
);
select throws_ok(
  $$delete from auth.users where id = '00000000-0000-0000-0000-000000001007'$$,
  '23503', null, 'auth-linked profile deletion cannot cascade archived records'
);
select is(
  (select count(*) from private.legacy_partner_requests where id = current_setting('pgtap.archive_request_id')::bigint),
  1::bigint,
  'legacy request remains after blocked profile deletion'
);
select is(
  (
    select count(*)
    from private.legacy_reports
    where partner_request_id = current_setting('pgtap.archive_request_id')::bigint
      and reporter_profile_id = current_setting('pgtap.archive_profile_id')::bigint
      and reported_profile_id = current_setting('pgtap.archive_profile_id')::bigint
  ),
  1::bigint,
  'legacy report retains its complete archival request and profile linkage'
);

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
select is(
  has_schema_privilege('authenticated', 'private', 'usage'),
  false,
  'authenticated users have no USAGE on the private schema'
);
select throws_ok($$select private.viewer_profile_id()$$, '42501', null, 'authenticated users cannot execute private helpers');
select throws_ok($$select * from private.legacy_partner_requests$$, '42501', null, 'authenticated users cannot select private legacy records');
reset role;

-- Request, acceptance, contact, capacity, and re-open state machine.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001002', true);
select is(
  public.request_to_join_session(current_setting('pgtap.main_session_id')::bigint),
  'OK',
  'complete guest request returns the normal OK outcome'
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
select is(
  public.review_join_request(
    current_setting('pgtap.main_session_id')::bigint,
    current_setting('pgtap.guest_one_participant_id')::bigint,
    'accepted'
  ),
  'OK',
  'host review returns the normal OK outcome'
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

-- Task 3's non-host roster contract is intentionally status-agnostic: a
-- requested or declined guest sees only their own safe row and the host.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001004', true);
select is(
  (select count(*) from public.session_participant_roster where session_id = current_setting('pgtap.main_session_id')::bigint),
  2::bigint,
  'requested guest sees only self and host in the safe roster'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select is(
  (select count(*) from public.session_participant_roster where session_id = current_setting('pgtap.main_session_id')::bigint),
  4::bigint,
  'host sees all safe participant rows including a requested guest'
);
reset role;

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
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001003', true);
select is(
  (select count(*) from public.session_participant_roster where session_id = current_setting('pgtap.main_session_id')::bigint),
  2::bigint,
  'accepted guest sees only self and host in the safe roster'
);
select is(
  (
    select count(*)
    from public.session_participant_roster
    where session_id = current_setting('pgtap.main_session_id')::bigint
      and nickname in ('Guest One', 'Guest Three')
  ),
  0::bigint,
  'accepted guest cannot see other guests in the roster'
);
select is(
  (select count(*) from public.my_session_participations where session_id = current_setting('pgtap.main_session_id')::bigint),
  1::bigint,
  'My Sessions exposes only the viewer participant row'
);
select is(
  (select can_withdraw from public.my_session_participations where session_id = current_setting('pgtap.main_session_id')::bigint),
  true,
  'My Sessions exposes the accepted guest withdraw action flag'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001004', true);
select is(
  (select count(*) from public.session_participant_roster where session_id = current_setting('pgtap.main_session_id')::bigint),
  2::bigint,
  'declined guest still sees only self and host in the safe roster'
);
select is(
  (select count(*) from public.session_contacts where session_id = current_setting('pgtap.main_session_id')::bigint),
  0::bigint,
  'declined guest receives no LINE contact rows'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001005', true);
select is(
  (select count(*) from public.session_participant_roster),
  0::bigint,
  'observer with no participant row sees no roster rows'
);
select is(
  (select count(*) from public.session_contacts),
  0::bigint,
  'observer with no participant row sees no contact rows'
);
select is(
  (select count(*) from public.my_session_participations),
  0::bigint,
  'observer with no participant row sees no My Sessions rows'
);
reset role;

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
select is(
  public.withdraw_from_session(current_setting('pgtap.main_session_id')::bigint),
  'OK',
  'accepted guest withdrawal returns the normal OK outcome'
);
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
select is(
  public.cancel_session(current_setting('pgtap.cancel_session_id')::bigint),
  'OK',
  'host cancellation returns the normal OK outcome'
);
reset role;
select is(
  (select status from public.sessions where id = current_setting('pgtap.cancel_session_id')::bigint),
  'cancelled',
  'host cancellation sets terminal cancelled status'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select is(
  (select status from public.my_session_participations where session_id = current_setting('pgtap.cancel_session_id')::bigint),
  'cancelled',
  'My Sessions retains terminal cancellation history'
);
select is(
  (select can_cancel from public.my_session_participations where session_id = current_setting('pgtap.cancel_session_id')::bigint),
  false,
  'My Sessions disables cancellation after a terminal transition'
);
reset role;

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
select pg_temp.set_session_fixture_state(
  current_setting('pgtap.played_session_id')::bigint,
  now() - interval '1 hour'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001002', true);
select throws_ok(
  $$select public.mark_session_played(current_setting('pgtap.played_session_id')::bigint)$$,
  'P0001', 'NOT_SESSION_HOST', 'guest cannot mark a session played'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select is(
  public.mark_session_played(current_setting('pgtap.played_session_id')::bigint),
  'OK',
  'host played transition returns the normal OK outcome'
);
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
select pg_temp.set_session_fixture_state(
  current_setting('pgtap.attendance_session_id')::bigint,
  now() - interval '1 hour'
);
select throws_ok(
  $$
    insert into public.session_participants (session_id, profile_id, role, status)
    values (
      current_setting('pgtap.attendance_session_id')::bigint,
      (select id from public.profiles where user_id = '00000000-0000-0000-0000-000000001006'),
      'guest',
      'requested'
    )
  $$,
  'P0001', 'INVALID_TRANSITION', 'raw insert cannot create a requested waitlist row on a full session'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select is(
  public.mark_session_played(current_setting('pgtap.attendance_session_id')::bigint),
  'OK',
  'attendance fixture can be marked played during the confirmation window'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001004', true);
select throws_ok(
  $$select public.confirm_session_attendance(current_setting('pgtap.attendance_session_id')::bigint)$$,
  'P0001', 'NOT_ACCEPTED_PARTICIPANT', 'non-accepted user cannot confirm attendance after the session is played'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001003', true);
select is(
  public.confirm_session_attendance(current_setting('pgtap.attendance_session_id')::bigint),
  'OK',
  'accepted guest attendance confirmation returns the normal OK outcome'
);
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
  'played',
  'attendance confirmation preserves the played lifecycle status'
);
reset role;
select pg_temp.set_session_fixture_state(
  current_setting('pgtap.attendance_session_id')::bigint,
  now() - interval '25 hours'
);
update public.session_participants
set played_confirmed = false
where id = current_setting('pgtap.attendance_guest_participant_id')::bigint;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001003', true);
select is(
  public.confirm_session_attendance(current_setting('pgtap.attendance_session_id')::bigint),
  'SESSION_EXPIRED',
  'played attendance after the 24-hour window returns SESSION_EXPIRED'
);
reset role;
select is(
  (
    select played_confirmed
    from public.session_participants
    where id = current_setting('pgtap.attendance_guest_participant_id')::bigint
  ),
  false,
  'expired played attendance does not mutate the participant confirmation flag'
);
select is(
  (select status from public.sessions where id = current_setting('pgtap.attendance_session_id')::bigint),
  'played',
  'played sessions remain played rather than transitioning to expired'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001003', true);
select is(
  (select can_confirm_attendance from public.my_session_participations where session_id = current_setting('pgtap.attendance_session_id')::bigint),
  false,
  'My Sessions disables attendance confirmation after the 24-hour window'
);
reset role;

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
select pg_temp.set_session_fixture_state(
  current_setting('pgtap.stale_session_id')::bigint,
  now() - interval '25 hours'
);
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
select throws_ok(
  $$
    insert into public.session_participants (session_id, profile_id, role, status)
    values (
      current_setting('pgtap.cancel_session_id')::bigint,
      (select id from public.profiles where user_id = '00000000-0000-0000-0000-000000001006'),
      'guest',
      'requested'
    )
  $$,
  'P0001', 'INVALID_TRANSITION', 'raw insert cannot create a requested waitlist row on a cancelled session'
);
select throws_ok(
  $$
    insert into public.session_participants (session_id, profile_id, role, status)
    values (
      current_setting('pgtap.played_session_id')::bigint,
      (select id from public.profiles where user_id = '00000000-0000-0000-0000-000000001006'),
      'guest',
      'requested'
    )
  $$,
  'P0001', 'INVALID_TRANSITION', 'raw insert cannot create a requested waitlist row on a played session'
);
select throws_ok(
  $$
    insert into public.session_participants (session_id, profile_id, role, status)
    values (
      current_setting('pgtap.stale_session_id')::bigint,
      (select id from public.profiles where user_id = '00000000-0000-0000-0000-000000001006'),
      'guest',
      'requested'
    )
  $$,
  'P0001', 'INVALID_TRANSITION', 'raw insert cannot create a requested waitlist row on an expired session'
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
select pg_temp.set_session_fixture_state(
  current_setting('pgtap.cron_stale_session_id')::bigint,
  now() - interval '25 hours'
);
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
select is(
  (select schedule from cron.job where jobname = 'expire-stale-tennis-sessions'),
  '*/15 * * * *',
  'cron expiry job runs every 15 minutes'
);

-- Expiry is a committed text outcome before host authorization is considered.
-- Each fixture is separate so every non-host path proves its own lock+expiry.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select set_config(
  'pgtap.non_host_stale_review_session_id',
  public.create_session(
    (select id from public.courts where is_active and city = '台北市' order by id limit 1),
    '雙打', now() + interval '15 days', 3.0, 5.0, 1, '__pgtap_non_host_stale_review__'
  )::text,
  true
);
reset role;
select pg_temp.set_session_fixture_state(
  current_setting('pgtap.non_host_stale_review_session_id')::bigint,
  now() - interval '25 hours'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001002', true);
select is(
  pg_temp.text_outcome(
    $$select public.review_join_request(current_setting('pgtap.non_host_stale_review_session_id')::bigint, 0, 'accepted')$$
  ),
  'SESSION_EXPIRED',
  'non-host stale review returns SESSION_EXPIRED before authorization rejection'
);
reset role;
select is(
  (select status from public.sessions where id = current_setting('pgtap.non_host_stale_review_session_id')::bigint),
  'expired',
  'non-host stale review persists expiry before returning'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select set_config(
  'pgtap.non_host_stale_cancel_session_id',
  public.create_session(
    (select id from public.courts where is_active and city = '台北市' order by id limit 1),
    '雙打', now() + interval '15 days', 3.0, 5.0, 1, '__pgtap_non_host_stale_cancel__'
  )::text,
  true
);
reset role;
select pg_temp.set_session_fixture_state(
  current_setting('pgtap.non_host_stale_cancel_session_id')::bigint,
  now() - interval '25 hours'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001002', true);
select is(
  pg_temp.text_outcome(
    $$select public.cancel_session(current_setting('pgtap.non_host_stale_cancel_session_id')::bigint)$$
  ),
  'SESSION_EXPIRED',
  'non-host stale cancellation returns SESSION_EXPIRED before authorization rejection'
);
reset role;
select is(
  (select status from public.sessions where id = current_setting('pgtap.non_host_stale_cancel_session_id')::bigint),
  'expired',
  'non-host stale cancellation persists expiry before returning'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select set_config(
  'pgtap.non_host_stale_played_session_id',
  public.create_session(
    (select id from public.courts where is_active and city = '台北市' order by id limit 1),
    '雙打', now() + interval '15 days', 3.0, 5.0, 1, '__pgtap_non_host_stale_played__'
  )::text,
  true
);
reset role;
select pg_temp.set_session_fixture_state(
  current_setting('pgtap.non_host_stale_played_session_id')::bigint,
  now() - interval '25 hours'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001002', true);
select is(
  pg_temp.text_outcome(
    $$select public.mark_session_played(current_setting('pgtap.non_host_stale_played_session_id')::bigint)$$
  ),
  'SESSION_EXPIRED',
  'non-host stale played transition returns SESSION_EXPIRED before authorization rejection'
);
reset role;
select is(
  (select status from public.sessions where id = current_setting('pgtap.non_host_stale_played_session_id')::bigint),
  'expired',
  'non-host stale played transition persists expiry before returning'
);

-- A full session exercises the complete six-RPC response protocol after its
-- 24-hour expiry boundary.  No due call may perform its requested mutation.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select set_config(
  'pgtap.full_stale_session_id',
  public.create_session(
    (select id from public.courts where is_active and city = '台北市' order by id limit 1),
    '雙打', now() + interval '16 days', 3.0, 5.0, 1, '__pgtap_full_stale_session__'
  )::text,
  true
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001006', true);
select is(
  public.request_to_join_session(current_setting('pgtap.full_stale_session_id')::bigint),
  'OK',
  'full-session fixture request returns the normal OK outcome'
);
reset role;
select set_config(
  'pgtap.full_stale_guest_participant_id',
  (
    select participant_row.id::text
    from public.session_participants participant_row
    join public.profiles profile_row on profile_row.id = participant_row.profile_id
    where participant_row.session_id = current_setting('pgtap.full_stale_session_id')::bigint
      and profile_row.user_id = '00000000-0000-0000-0000-000000001006'
  ),
  true
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select is(
  public.review_join_request(
    current_setting('pgtap.full_stale_session_id')::bigint,
    current_setting('pgtap.full_stale_guest_participant_id')::bigint,
    'accepted'
  ),
  'OK',
  'full-session fixture review returns the normal OK outcome'
);
reset role;
select is(
  (select status from public.sessions where id = current_setting('pgtap.full_stale_session_id')::bigint),
  'full',
  'full-session expiry fixture reaches full before becoming stale'
);
select pg_temp.set_session_fixture_state(
  current_setting('pgtap.full_stale_session_id')::bigint,
  now() - interval '25 hours'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001002', true);
select is(
  public.request_to_join_session(current_setting('pgtap.full_stale_session_id')::bigint),
  'SESSION_EXPIRED',
  'stale full-session request returns SESSION_EXPIRED'
);
reset role;
select is(
  (
    select count(*)
    from public.session_participants participant_row
    join public.profiles profile_row on profile_row.id = participant_row.profile_id
    where participant_row.session_id = current_setting('pgtap.full_stale_session_id')::bigint
      and profile_row.user_id = '00000000-0000-0000-0000-000000001002'
  ),
  0::bigint,
  'stale full-session request does not create a participant row'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select is(
  public.review_join_request(
    current_setting('pgtap.full_stale_session_id')::bigint,
    current_setting('pgtap.full_stale_guest_participant_id')::bigint,
    'declined'
  ),
  'SESSION_EXPIRED',
  'stale full-session review returns SESSION_EXPIRED'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001006', true);
select is(
  public.withdraw_from_session(current_setting('pgtap.full_stale_session_id')::bigint),
  'SESSION_EXPIRED',
  'stale full-session withdrawal returns SESSION_EXPIRED'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select is(
  public.cancel_session(current_setting('pgtap.full_stale_session_id')::bigint),
  'SESSION_EXPIRED',
  'stale full-session cancellation returns SESSION_EXPIRED'
);
select is(
  public.mark_session_played(current_setting('pgtap.full_stale_session_id')::bigint),
  'SESSION_EXPIRED',
  'stale full-session played transition returns SESSION_EXPIRED'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001006', true);
select is(
  public.confirm_session_attendance(current_setting('pgtap.full_stale_session_id')::bigint),
  'SESSION_EXPIRED',
  'stale full-session attendance confirmation returns SESSION_EXPIRED'
);
reset role;
select is(
  (select status from public.sessions where id = current_setting('pgtap.full_stale_session_id')::bigint),
  'expired',
  'stale full-session action path persists expired status'
);
select is(
  (
    select status
    from public.session_participants
    where id = current_setting('pgtap.full_stale_guest_participant_id')::bigint
  ),
  'accepted',
  'stale full-session review and withdrawal do not mutate the accepted guest'
);
select is(
  (
    select played_confirmed
    from public.session_participants
    where id = current_setting('pgtap.full_stale_guest_participant_id')::bigint
  ),
  false,
  'stale full-session attendance confirmation does not mutate the guest flag'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select set_config(
  'pgtap.cron_full_session_id',
  public.create_session(
    (select id from public.courts where is_active and city = '台北市' order by id limit 1),
    '雙打', now() + interval '17 days', 3.0, 5.0, 1, '__pgtap_cron_full_session__'
  )::text,
  true
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001006', true);
select is(
  public.request_to_join_session(current_setting('pgtap.cron_full_session_id')::bigint),
  'OK',
  'full cron fixture request returns the normal OK outcome'
);
reset role;
select set_config(
  'pgtap.cron_full_guest_participant_id',
  (
    select participant_row.id::text
    from public.session_participants participant_row
    join public.profiles profile_row on profile_row.id = participant_row.profile_id
    where participant_row.session_id = current_setting('pgtap.cron_full_session_id')::bigint
      and profile_row.user_id = '00000000-0000-0000-0000-000000001006'
  ),
  true
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select is(
  public.review_join_request(
    current_setting('pgtap.cron_full_session_id')::bigint,
    current_setting('pgtap.cron_full_guest_participant_id')::bigint,
    'accepted'
  ),
  'OK',
  'full cron fixture review returns the normal OK outcome'
);
reset role;
select is(
  (select status from public.sessions where id = current_setting('pgtap.cron_full_session_id')::bigint),
  'full',
  'full cron fixture reaches full before worker expiry'
);
select pg_temp.set_session_fixture_state(
  current_setting('pgtap.cron_full_session_id')::bigint,
  now() - interval '25 hours'
);
select is(
  private.expire_stale_sessions(),
  1,
  'cron worker expires a stale full session'
);
select is(
  (select status from public.sessions where id = current_setting('pgtap.cron_full_session_id')::bigint),
  'expired',
  'cron worker persists expiry for a stale full session'
);

-- Trusted/raw writers must obey the same clock boundaries as public RPCs.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select set_config(
  'pgtap.raw_future_played_session_id',
  public.create_session(
    (select id from public.courts where is_active and city = '台北市' order by id limit 1),
    '雙打', now() + interval '18 days', 3.0, 5.0, 1, '__pgtap_raw_future_played__'
  )::text,
  true
);
select set_config(
  'pgtap.raw_future_expired_session_id',
  public.create_session(
    (select id from public.courts where is_active and city = '台北市' order by id limit 1),
    '雙打', now() + interval '18 days', 3.0, 5.0, 1, '__pgtap_raw_future_expired__'
  )::text,
  true
);
select set_config(
  'pgtap.raw_started_cancel_session_id',
  public.create_session(
    (select id from public.courts where is_active and city = '台北市' order by id limit 1),
    '雙打', now() + interval '18 days', 3.0, 5.0, 1, '__pgtap_raw_started_cancel__'
  )::text,
  true
);
select set_config(
  'pgtap.raw_recent_expired_session_id',
  public.create_session(
    (select id from public.courts where is_active and city = '台北市' order by id limit 1),
    '雙打', now() + interval '18 days', 3.0, 5.0, 1, '__pgtap_raw_recent_expired__'
  )::text,
  true
);
select set_config(
  'pgtap.raw_stale_played_session_id',
  public.create_session(
    (select id from public.courts where is_active and city = '台北市' order by id limit 1),
    '雙打', now() + interval '18 days', 3.0, 5.0, 1, '__pgtap_raw_stale_played__'
  )::text,
  true
);
select set_config(
  'pgtap.raw_time_only_session_id',
  public.create_session(
    (select id from public.courts where is_active and city = '台北市' order by id limit 1),
    '雙打', now() + interval '18 days', 3.0, 5.0, 1, '__pgtap_raw_time_only__'
  )::text,
  true
);
select set_config(
  'pgtap.raw_combined_played_session_id',
  public.create_session(
    (select id from public.courts where is_active and city = '台北市' order by id limit 1),
    '雙打', now() + interval '18 days', 3.0, 5.0, 1, '__pgtap_raw_combined_played__'
  )::text,
  true
);
select set_config(
  'pgtap.raw_combined_expired_session_id',
  public.create_session(
    (select id from public.courts where is_active and city = '台北市' order by id limit 1),
    '雙打', now() + interval '18 days', 3.0, 5.0, 1, '__pgtap_raw_combined_expired__'
  )::text,
  true
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001006', true);
select set_config(
  'pgtap.raw_started_accept_request_outcome',
  public.request_to_join_session(current_setting('pgtap.raw_started_cancel_session_id')::bigint),
  true
);
reset role;
select set_config(
  'pgtap.raw_started_accept_participant_id',
  (
    select participant_row.id::text
    from public.session_participants participant_row
    join public.profiles profile_row on profile_row.id = participant_row.profile_id
    where participant_row.session_id = current_setting('pgtap.raw_started_cancel_session_id')::bigint
      and profile_row.user_id = '00000000-0000-0000-0000-000000001006'
  ),
  true
);
select throws_ok(
  $$update public.sessions set start_at = now() - interval '1 hour' where id = current_setting('pgtap.raw_time_only_session_id')::bigint$$,
  'P0001', 'INVALID_TRANSITION', 'raw time-only update cannot rewrite a session start'
);
select throws_ok(
  $$update public.sessions set start_at = now() - interval '1 hour', status = 'played' where id = current_setting('pgtap.raw_combined_played_session_id')::bigint$$,
  'P0001', 'INVALID_TRANSITION', 'raw combined backdate and played transition cannot forge lifecycle timing'
);
select throws_ok(
  $$update public.sessions set start_at = now() - interval '25 hours', status = 'expired' where id = current_setting('pgtap.raw_combined_expired_session_id')::bigint$$,
  'P0001', 'INVALID_TRANSITION', 'raw combined backdate and expiry transition cannot forge lifecycle timing'
);
select throws_ok(
  $$update public.sessions set status = 'played' where id = current_setting('pgtap.raw_future_played_session_id')::bigint$$,
  'P0001', 'INVALID_TRANSITION', 'raw future session cannot transition to played'
);
select throws_ok(
  $$update public.sessions set status = 'expired' where id = current_setting('pgtap.raw_future_expired_session_id')::bigint$$,
  'P0001', 'INVALID_TRANSITION', 'raw future session cannot transition to expired'
);
select pg_temp.set_session_fixture_state(
  current_setting('pgtap.raw_started_cancel_session_id')::bigint,
  now() - interval '1 hour'
);
select pg_temp.set_session_fixture_state(
  current_setting('pgtap.raw_recent_expired_session_id')::bigint,
  now() - interval '1 hour'
);
select throws_ok(
  $$update public.sessions set status = 'cancelled' where id = current_setting('pgtap.raw_started_cancel_session_id')::bigint$$,
  'P0001', 'INVALID_TRANSITION', 'raw started session cannot transition to cancelled'
);
select throws_ok(
  $$update public.sessions set status = 'expired' where id = current_setting('pgtap.raw_recent_expired_session_id')::bigint$$,
  'P0001', 'INVALID_TRANSITION', 'raw recently started session cannot transition to expired'
);
select pg_temp.set_session_fixture_state(
  current_setting('pgtap.raw_stale_played_session_id')::bigint,
  now() - interval '25 hours'
);
select throws_ok(
  $$update public.sessions set status = 'played' where id = current_setting('pgtap.raw_stale_played_session_id')::bigint$$,
  'P0001', 'INVALID_TRANSITION', 'raw stale session cannot transition to played'
);

-- A trusted raw participant write must not bypass the parent-session review
-- contract. In particular, it must not create an accepted row that exposes a
-- host LINE ID after a session has left its open, future, capacity-available
-- state.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select set_config(
  'pgtap.raw_accept_guard_session_id',
  public.create_session(
    (select id from public.courts where is_active and city = '台北市' order by id limit 1),
    '雙打', now() + interval '18 days', 3.0, 5.0, 1, '__pgtap_raw_accept_guard__'
  )::text,
  true
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001006', true);
select set_config(
  'pgtap.raw_accept_guard_request_outcome',
  public.request_to_join_session(current_setting('pgtap.raw_accept_guard_session_id')::bigint),
  true
);
reset role;
select set_config(
  'pgtap.raw_accept_guard_participant_id',
  (
    select participant_row.id::text
    from public.session_participants participant_row
    join public.profiles profile_row on profile_row.id = participant_row.profile_id
    where participant_row.session_id = current_setting('pgtap.raw_accept_guard_session_id')::bigint
      and profile_row.user_id = '00000000-0000-0000-0000-000000001006'
  ),
  true
);
select pg_temp.set_session_fixture_state(
  current_setting('pgtap.raw_accept_guard_session_id')::bigint,
  now() + interval '18 days',
  'cancelled'
);
select throws_ok(
  $$update public.session_participants set status = 'accepted' where id = current_setting('pgtap.raw_accept_guard_participant_id')::bigint$$,
  'P0001', 'INVALID_TRANSITION', 'raw acceptance cannot occur on a cancelled session'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001006', true);
select is(
  (select count(*) from public.session_contacts where session_id = current_setting('pgtap.raw_accept_guard_session_id')::bigint),
  0::bigint,
  'cancelled-session raw acceptance cannot leak the host LINE contact'
);
reset role;
select pg_temp.set_participant_fixture_status(
  current_setting('pgtap.raw_accept_guard_participant_id')::bigint,
  'requested'
);
select pg_temp.set_session_fixture_state(
  current_setting('pgtap.raw_accept_guard_session_id')::bigint,
  now() - interval '1 hour',
  'played'
);
select throws_ok(
  $$update public.session_participants set status = 'accepted' where id = current_setting('pgtap.raw_accept_guard_participant_id')::bigint$$,
  'P0001', 'INVALID_TRANSITION', 'raw acceptance cannot occur on a played session'
);
select pg_temp.set_participant_fixture_status(
  current_setting('pgtap.raw_accept_guard_participant_id')::bigint,
  'requested'
);
select pg_temp.set_session_fixture_state(
  current_setting('pgtap.raw_accept_guard_session_id')::bigint,
  now() - interval '25 hours',
  'expired'
);
select throws_ok(
  $$update public.session_participants set status = 'accepted' where id = current_setting('pgtap.raw_accept_guard_participant_id')::bigint$$,
  'P0001', 'INVALID_TRANSITION', 'raw acceptance cannot occur on an expired session'
);
select pg_temp.set_participant_fixture_status(
  current_setting('pgtap.raw_accept_guard_participant_id')::bigint,
  'requested'
);
select pg_temp.set_session_fixture_state(
  current_setting('pgtap.raw_accept_guard_session_id')::bigint,
  now() + interval '18 days',
  'full'
);
select throws_ok(
  $$update public.session_participants set status = 'accepted' where id = current_setting('pgtap.raw_accept_guard_participant_id')::bigint$$,
  'P0001', 'INVALID_TRANSITION', 'raw acceptance cannot occur on a full session'
);
select pg_temp.set_participant_fixture_status(
  current_setting('pgtap.raw_accept_guard_participant_id')::bigint,
  'requested'
);
delete from public.sessions
where id = current_setting('pgtap.raw_accept_guard_session_id')::bigint;
select throws_ok(
  $$update public.session_participants set status = 'accepted' where id = current_setting('pgtap.raw_started_accept_participant_id')::bigint$$,
  'P0001', 'INVALID_TRANSITION', 'raw acceptance cannot occur after an open session has started'
);
delete from public.sessions
where id = current_setting('pgtap.raw_started_cancel_session_id')::bigint;

-- Confirmation is a post-play attendance action, not an arbitrary participant
-- flag. Raw writers receive the same accepted/played/24-hour boundary.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select set_config(
  'pgtap.raw_confirm_guard_session_id',
  public.create_session(
    (select id from public.courts where is_active and city = '台北市' order by id limit 1),
    '雙打', now() + interval '18 days', 3.0, 5.0, 1, '__pgtap_raw_confirm_guard__'
  )::text,
  true
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001003', true);
select set_config(
  'pgtap.raw_confirm_guard_request_outcome',
  public.request_to_join_session(current_setting('pgtap.raw_confirm_guard_session_id')::bigint),
  true
);
reset role;
select set_config(
  'pgtap.raw_confirm_guard_participant_id',
  (
    select participant_row.id::text
    from public.session_participants participant_row
    join public.profiles profile_row on profile_row.id = participant_row.profile_id
    where participant_row.session_id = current_setting('pgtap.raw_confirm_guard_session_id')::bigint
      and profile_row.user_id = '00000000-0000-0000-0000-000000001003'
  ),
  true
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select set_config(
  'pgtap.raw_confirm_guard_review_outcome',
  public.review_join_request(
    current_setting('pgtap.raw_confirm_guard_session_id')::bigint,
    current_setting('pgtap.raw_confirm_guard_participant_id')::bigint,
    'accepted'
  ),
  true
);
reset role;
select pg_temp.set_session_fixture_state(
  current_setting('pgtap.raw_confirm_guard_session_id')::bigint,
  now() + interval '18 days',
  'played'
);
select throws_ok(
  $$update public.session_participants set played_confirmed = true where id = current_setting('pgtap.raw_confirm_guard_participant_id')::bigint$$,
  'P0001', 'INVALID_TRANSITION', 'raw attendance confirmation cannot occur before a played session starts'
);
update public.session_participants
set played_confirmed = false
where id = current_setting('pgtap.raw_confirm_guard_participant_id')::bigint;
select pg_temp.set_session_fixture_state(
  current_setting('pgtap.raw_confirm_guard_session_id')::bigint,
  now() + interval '18 days',
  'cancelled'
);
select throws_ok(
  $$update public.session_participants set played_confirmed = true where id = current_setting('pgtap.raw_confirm_guard_participant_id')::bigint$$,
  'P0001', 'INVALID_TRANSITION', 'raw attendance confirmation cannot occur on a cancelled session'
);
update public.session_participants
set played_confirmed = false
where id = current_setting('pgtap.raw_confirm_guard_participant_id')::bigint;
select pg_temp.set_session_fixture_state(
  current_setting('pgtap.raw_confirm_guard_session_id')::bigint,
  now() - interval '25 hours',
  'expired'
);
select throws_ok(
  $$update public.session_participants set played_confirmed = true where id = current_setting('pgtap.raw_confirm_guard_participant_id')::bigint$$,
  'P0001', 'INVALID_TRANSITION', 'raw attendance confirmation cannot occur on an expired session'
);
update public.session_participants
set played_confirmed = false
where id = current_setting('pgtap.raw_confirm_guard_participant_id')::bigint;
select pg_temp.set_session_fixture_state(
  current_setting('pgtap.raw_confirm_guard_session_id')::bigint,
  now() - interval '25 hours',
  'played'
);
select throws_ok(
  $$update public.session_participants set played_confirmed = true where id = current_setting('pgtap.raw_confirm_guard_participant_id')::bigint$$,
  'P0001', 'INVALID_TRANSITION', 'raw attendance confirmation cannot occur after the played-session window'
);
update public.session_participants
set played_confirmed = false
where id = current_setting('pgtap.raw_confirm_guard_participant_id')::bigint;
select pg_temp.set_session_fixture_state(
  current_setting('pgtap.raw_confirm_guard_session_id')::bigint,
  now() - interval '1 hour',
  'played'
);
select lives_ok(
  $$update public.session_participants set played_confirmed = true where id = current_setting('pgtap.raw_confirm_guard_participant_id')::bigint$$,
  'raw attendance confirmation remains valid for an accepted guest during the played-session window'
);
update public.session_participants
set played_confirmed = false
where id = current_setting('pgtap.raw_confirm_guard_participant_id')::bigint;

-- A host-row constraint allows parent session deletes to cascade, but refuses
-- a raw child deletion that would leave a live session orphaned.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select set_config(
  'pgtap.host_cascade_session_id',
  public.create_session(
    (select id from public.courts where is_active and city = '台北市' order by id limit 1),
    '雙打', now() + interval '19 days', 3.0, 5.0, 1, '__pgtap_host_cascade_session__'
  )::text,
  true
);
reset role;
select lives_ok(
  $$delete from public.sessions where id = current_setting('pgtap.host_cascade_session_id')::bigint$$,
  'trusted raw session deletion remains cascade-safe'
);
select lives_ok(
  $$set constraints session_participants_host_invariant immediate$$,
  'host invariant permits participant cascade after parent session deletion'
);
select lives_ok(
  $$set constraints session_participants_host_invariant deferred$$,
  'host invariant returns to deferred mode for raw-delete regression coverage'
);
select is(
  (select count(*) from public.session_participants where session_id = current_setting('pgtap.host_cascade_session_id')::bigint),
  0::bigint,
  'parent session deletion removes its host participant through the FK cascade'
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
delete from public.sessions
where id = current_setting('pgtap.capacity_trigger_session_id')::bigint;
select lives_ok(
  $$set constraints session_participants_capacity_invariant immediate$$,
  'capacity invariant can clear after the invalid fixture is removed'
);
select lives_ok(
  $$set constraints session_participants_capacity_invariant deferred$$,
  'capacity invariant returns to deferred mode after cleanup'
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

-- A raw full transition must leave no requested waitlist row after all
-- deferred work has settled; the RPC's final-accept flow already declines it.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select set_config(
  'pgtap.raw_full_decline_session_id',
  public.create_session(
    (select id from public.courts where is_active and city = '台北市' order by id limit 1),
    '雙打', now() + interval '20 days', 3.0, 5.0, 1, '__pgtap_raw_full_decline__'
  )::text,
  true
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001002', true);
select is(
  public.request_to_join_session(current_setting('pgtap.raw_full_decline_session_id')::bigint),
  'OK',
  'raw full-decline fixture first request returns OK'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001003', true);
select is(
  public.request_to_join_session(current_setting('pgtap.raw_full_decline_session_id')::bigint),
  'OK',
  'raw full-decline fixture second request returns OK'
);
reset role;
select set_config(
  'pgtap.raw_full_accepted_participant_id',
  (
    select participant_row.id::text
    from public.session_participants participant_row
    join public.profiles profile_row on profile_row.id = participant_row.profile_id
    where participant_row.session_id = current_setting('pgtap.raw_full_decline_session_id')::bigint
      and profile_row.user_id = '00000000-0000-0000-0000-000000001002'
  ),
  true
);
select set_config(
  'pgtap.raw_full_requested_participant_id',
  (
    select participant_row.id::text
    from public.session_participants participant_row
    join public.profiles profile_row on profile_row.id = participant_row.profile_id
    where participant_row.session_id = current_setting('pgtap.raw_full_decline_session_id')::bigint
      and profile_row.user_id = '00000000-0000-0000-0000-000000001003'
  ),
  true
);
update public.session_participants
set status = 'accepted'
where id = current_setting('pgtap.raw_full_accepted_participant_id')::bigint;
update public.sessions
set status = 'full'
where id = current_setting('pgtap.raw_full_decline_session_id')::bigint;
select throws_ok(
  $$
    update public.session_participants
    set updated_at = now()
    where id = current_setting('pgtap.raw_full_requested_participant_id')::bigint
  $$,
  'P0001', 'INVALID_TRANSITION', 'raw participant update cannot retain a requested row on a full session'
);
select throws_ok(
  $$set constraints session_participants_capacity_invariant immediate$$,
  'P0001', 'INVALID_TRANSITION', 'raw full transition cannot retain a requested waitlist after deferred checks'
);
delete from public.sessions
where id = current_setting('pgtap.raw_full_decline_session_id')::bigint;
select lives_ok(
  $$set constraints session_participants_capacity_invariant immediate$$,
  'final-decline fixture cleanup clears deferred capacity work'
);
select lives_ok(
  $$set constraints session_participants_capacity_invariant deferred$$,
  'capacity invariant returns to deferred mode after final-decline cleanup'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select set_config(
  'pgtap.host_orphan_session_id',
  public.create_session(
    (select id from public.courts where is_active and city = '台北市' order by id limit 1),
    '雙打', now() + interval '21 days', 3.0, 5.0, 1, '__pgtap_host_orphan__'
  )::text,
  true
);
reset role;
select set_config(
  'pgtap.host_orphan_participant_id',
  (
    select id::text
    from public.session_participants
    where session_id = current_setting('pgtap.host_orphan_session_id')::bigint
      and role = 'host'
  ),
  true
);
select lives_ok(
  $$delete from public.session_participants where id = current_setting('pgtap.host_orphan_participant_id')::bigint$$,
  'raw host deletion queues the deferred host invariant'
);
select is(
  (select count(*) from public.sessions where id = current_setting('pgtap.host_orphan_session_id')::bigint),
  1::bigint,
  'host invariant checks a still-existing parent session'
);
select throws_ok(
  $$set constraints session_participants_host_invariant immediate$$,
  'P0001', 'INVALID_TRANSITION', 'raw host deletion cannot commit an orphaned live session'
);

select * from finish();

rollback;
