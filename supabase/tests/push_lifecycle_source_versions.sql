begin;

select plan(60);

-- Schema, trigger attachment, execution context, and direct-call ACLs.
select has_column(
  'public',
  'sessions',
  'notification_state_version',
  'sessions expose a notification state version'
);
select ok(
  exists (
    select 1
    from pg_attribute attribute_row
    join pg_attrdef default_row
      on default_row.adrelid = attribute_row.attrelid
     and default_row.adnum = attribute_row.attnum
    where attribute_row.attrelid = 'public.sessions'::regclass
      and attribute_row.attname = 'notification_state_version'
      and format_type(attribute_row.atttypid, attribute_row.atttypmod) = 'bigint'
      and attribute_row.attnotnull
      and not attribute_row.attisdropped
      and pg_get_expr(default_row.adbin, default_row.adrelid) = '1'
  ),
  'the session state version is required bigint with constant default one'
);
select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.sessions'::regclass
      and constraint_row.conname = 'sessions_notification_state_version_positive'
      and constraint_row.contype = 'c'
      and constraint_row.convalidated
      and pg_get_constraintdef(constraint_row.oid) = 'CHECK ((notification_state_version > 0))'
  ),
  'the positive session state-version constraint is validated'
);
select ok(
  exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.sessions'::regclass
      and trigger_row.tgname = 'sessions_maintain_notification_state_version'
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled = 'O'
      and trigger_row.tgtype = 23
  ),
  'the row-level BEFORE INSERT OR UPDATE session state-version trigger is enabled'
);
select ok(
  (
    select not function_row.prosecdef
      and coalesce(function_row.proconfig, '{}'::text[]) @> array['search_path=""']::text[]
    from pg_proc function_row
    where function_row.oid = to_regprocedure('private.maintain_session_notification_state_version()')
  ),
  'the session state-version helper is invoker-security with an empty search path'
);
select ok(
  to_regprocedure('private.maintain_session_notification_state_version()') is not null
    and not has_function_privilege(
      'anon',
      to_regprocedure('private.maintain_session_notification_state_version()'),
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      to_regprocedure('private.maintain_session_notification_state_version()'),
      'execute'
    )
    and not has_function_privilege(
      'service_role',
      to_regprocedure('private.maintain_session_notification_state_version()'),
      'execute'
    ),
  'public and application roles cannot execute the session state-version helper directly'
);

select has_column(
  'public',
  'session_participants',
  'notification_state_version',
  'participants expose a notification state version'
);
select ok(
  exists (
    select 1
    from pg_attribute attribute_row
    join pg_attrdef default_row
      on default_row.adrelid = attribute_row.attrelid
     and default_row.adnum = attribute_row.attnum
    where attribute_row.attrelid = 'public.session_participants'::regclass
      and attribute_row.attname = 'notification_state_version'
      and format_type(attribute_row.atttypid, attribute_row.atttypmod) = 'bigint'
      and attribute_row.attnotnull
      and not attribute_row.attisdropped
      and pg_get_expr(default_row.adbin, default_row.adrelid) = '1'
  ),
  'the participant state version is required bigint with constant default one'
);
select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.session_participants'::regclass
      and constraint_row.conname = 'session_participants_notification_state_version_positive'
      and constraint_row.contype = 'c'
      and constraint_row.convalidated
      and pg_get_constraintdef(constraint_row.oid) = 'CHECK ((notification_state_version > 0))'
  ),
  'the positive participant state-version constraint is validated'
);
select ok(
  exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.session_participants'::regclass
      and trigger_row.tgname = 'session_participants_maintain_notification_state_version'
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled = 'O'
      and trigger_row.tgtype = 23
  ),
  'the row-level BEFORE INSERT OR UPDATE participant state-version trigger is enabled'
);
select ok(
  (
    select not function_row.prosecdef
      and coalesce(function_row.proconfig, '{}'::text[]) @> array['search_path=""']::text[]
    from pg_proc function_row
    where function_row.oid = to_regprocedure('private.maintain_session_participant_notification_state_version()')
  ),
  'the participant state-version helper is invoker-security with an empty search path'
);
select ok(
  to_regprocedure('private.maintain_session_participant_notification_state_version()') is not null
    and not has_function_privilege(
      'anon',
      to_regprocedure('private.maintain_session_participant_notification_state_version()'),
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      to_regprocedure('private.maintain_session_participant_notification_state_version()'),
      'execute'
    )
    and not has_function_privilege(
      'service_role',
      to_regprocedure('private.maintain_session_participant_notification_state_version()'),
      'execute'
    ),
  'public and application roles cannot execute the participant state-version helper directly'
);

select ok(
  exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.session_messages'::regclass
      and trigger_row.tgname = 'session_messages_reject_updates'
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled = 'O'
      and trigger_row.tgtype = 19
  ),
  'the row-level BEFORE UPDATE message immutability trigger is enabled'
);
select ok(
  (
    select not function_row.prosecdef
      and coalesce(function_row.proconfig, '{}'::text[]) @> array['search_path=""']::text[]
    from pg_proc function_row
    where function_row.oid = to_regprocedure('private.reject_session_message_updates()')
  ),
  'the message immutability helper is invoker-security with an empty search path'
);
select ok(
  to_regprocedure('private.reject_session_message_updates()') is not null
    and not has_function_privilege(
      'anon',
      to_regprocedure('private.reject_session_message_updates()'),
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      to_regprocedure('private.reject_session_message_updates()'),
      'execute'
    )
    and not has_function_privilege(
      'service_role',
      to_regprocedure('private.reject_session_message_updates()'),
      'execute'
    ),
  'public and application roles cannot execute the message immutability helper directly'
);

-- A trigger probe isolates every session domain field from unrelated business
-- transition guards while executing the same production trigger function.
create temporary table fa03_session_version_probe (
  sport_id bigint,
  host_profile_id bigint,
  court_id bigint,
  play_type text,
  start_at timestamptz,
  ntrp_min numeric,
  ntrp_max numeric,
  slots_total smallint,
  notes text,
  status text,
  join_mode text,
  venue_type text,
  range_end timestamptz,
  decided_at timestamptz,
  fee_note text,
  archived_at timestamptz,
  notification_state_version bigint not null default 1
) on commit drop;

create trigger fa03_session_version_probe_maintain
before update on fa03_session_version_probe
for each row execute function private.maintain_session_notification_state_version();

insert into fa03_session_version_probe (
  sport_id,
  host_profile_id,
  court_id,
  play_type,
  start_at,
  slots_total,
  status,
  join_mode,
  venue_type
)
values (1, 1, 1, '單打', '2030-01-01 00:00:00+00', 1, 'open', 'approval', 'booked');

update fa03_session_version_probe set sport_id = 2;
select is((select notification_state_version from fa03_session_version_probe), 2::bigint, 'sport_id changes increment the session source version');
update fa03_session_version_probe set host_profile_id = 2;
select is((select notification_state_version from fa03_session_version_probe), 3::bigint, 'host_profile_id changes increment the session source version');
update fa03_session_version_probe set court_id = 2;
select is((select notification_state_version from fa03_session_version_probe), 4::bigint, 'court_id changes increment the session source version');
update fa03_session_version_probe set play_type = '雙打';
select is((select notification_state_version from fa03_session_version_probe), 5::bigint, 'play_type changes increment the session source version');
update fa03_session_version_probe set start_at = start_at + interval '1 hour';
select is((select notification_state_version from fa03_session_version_probe), 6::bigint, 'start_at changes increment the session source version');
update fa03_session_version_probe set ntrp_min = 3.0;
select is((select notification_state_version from fa03_session_version_probe), 7::bigint, 'ntrp_min changes increment the session source version');
update fa03_session_version_probe set ntrp_max = 4.0;
select is((select notification_state_version from fa03_session_version_probe), 8::bigint, 'ntrp_max changes increment the session source version');
update fa03_session_version_probe set slots_total = 2;
select is((select notification_state_version from fa03_session_version_probe), 9::bigint, 'slots_total changes increment the session source version');
update fa03_session_version_probe set notes = 'changed';
select is((select notification_state_version from fa03_session_version_probe), 10::bigint, 'notes changes increment the session source version');
update fa03_session_version_probe set status = 'full';
select is((select notification_state_version from fa03_session_version_probe), 11::bigint, 'status changes increment the session source version');
update fa03_session_version_probe set join_mode = 'instant';
select is((select notification_state_version from fa03_session_version_probe), 12::bigint, 'join_mode changes increment the session source version');
update fa03_session_version_probe set venue_type = 'candidates';
select is((select notification_state_version from fa03_session_version_probe), 13::bigint, 'venue_type changes increment the session source version');
update fa03_session_version_probe set range_end = start_at + interval '2 hours';
select is((select notification_state_version from fa03_session_version_probe), 14::bigint, 'range_end changes increment the session source version');
update fa03_session_version_probe set decided_at = start_at + interval '30 minutes';
select is((select notification_state_version from fa03_session_version_probe), 15::bigint, 'decided_at changes increment the session source version');
update fa03_session_version_probe set fee_note = 'fee changed';
select is((select notification_state_version from fa03_session_version_probe), 16::bigint, 'fee_note changes increment the session source version');
update fa03_session_version_probe set archived_at = start_at + interval '3 hours';
select is((select notification_state_version from fa03_session_version_probe), 17::bigint, 'archived_at changes increment the session source version');

update fa03_session_version_probe set notification_state_version = 999;
select is((select notification_state_version from fa03_session_version_probe), 17::bigint, 'a forged session version without a domain change is ignored');
update fa03_session_version_probe set notes = 'null forgery', notification_state_version = null;
select is((select notification_state_version from fa03_session_version_probe), 18::bigint, 'a NULL session version is replaced by the single legitimate increment');
update fa03_session_version_probe
set court_id = 3, play_type = '對拉', notes = 'multi-field', notification_state_version = 999;
select is((select notification_state_version from fa03_session_version_probe), 19::bigint, 'one multi-field session update increments only once');
update fa03_session_version_probe set notes = notes;
select is((select notification_state_version from fa03_session_version_probe), 19::bigint, 'a no-op session update does not increment');

-- Production-table fixtures prove the trigger is not merely present in the
-- catalog: normal writes receive and maintain the DB-owned version.
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
  (
    '00000000-0000-0000-0000-00000000a301',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'fa03-source-host@example.test',
    'test',
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000a302',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'fa03-source-guest@example.test',
    'test',
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  );

insert into public.profiles (user_id, nickname, ntrp)
values
  ('00000000-0000-0000-0000-00000000a301', 'FA03 Source Host', 3.5),
  ('00000000-0000-0000-0000-00000000a302', 'FA03 Source Guest', 3.5);

select set_config(
  'pgtap.fa03_source_host_profile_id',
  (
    select profile_row.id::text
    from public.profiles profile_row
    where profile_row.user_id = '00000000-0000-0000-0000-00000000a301'
  ),
  true
);
select set_config(
  'pgtap.fa03_source_guest_profile_id',
  (
    select profile_row.id::text
    from public.profiles profile_row
    where profile_row.user_id = '00000000-0000-0000-0000-00000000a302'
  ),
  true
);

with inserted_session as (
  insert into public.sessions (
    sport_id,
    host_profile_id,
    court_id,
    play_type,
    start_at,
    slots_total,
    notes,
    notification_state_version
  )
  select
    sport_row.id,
    current_setting('pgtap.fa03_source_host_profile_id')::bigint,
    court_row.id,
    '雙打',
    date_trunc('minute', now()) + interval '14 days',
    3,
    '__fa03_source_versions__',
    999
  from public.sports sport_row
  cross join lateral (
    select court_candidate.id
    from public.courts court_candidate
    where court_candidate.is_active
      and court_candidate.city = '台北市'
    order by court_candidate.id
    limit 1
  ) court_row
  where sport_row.code = 'tennis'
  returning id
)
select set_config(
  'pgtap.fa03_source_session_id',
  (select inserted_session.id::text from inserted_session),
  true
);

insert into public.session_participants (
  session_id,
  profile_id,
  role,
  status,
  notification_state_version
)
values (
  current_setting('pgtap.fa03_source_session_id')::bigint,
  current_setting('pgtap.fa03_source_host_profile_id')::bigint,
  'host',
  'accepted',
  null
);

select is(
  (
    select participant_row.notification_state_version
    from public.session_participants participant_row
    where participant_row.session_id = current_setting('pgtap.fa03_source_session_id')::bigint
      and participant_row.profile_id = current_setting('pgtap.fa03_source_host_profile_id')::bigint
  ),
  1::bigint,
  'a caller-supplied NULL participant version is replaced on INSERT'
);

set constraints all immediate;
set constraints all deferred;

select is(
  (
    select session_row.notification_state_version
    from public.sessions session_row
    where session_row.id = current_setting('pgtap.fa03_source_session_id')::bigint
  ),
  1::bigint,
  'a real new session starts at state version one'
);
update public.sessions
set notes = '__fa03_source_versions_changed__'
where id = current_setting('pgtap.fa03_source_session_id')::bigint;
select is(
  (
    select session_row.notification_state_version
    from public.sessions session_row
    where session_row.id = current_setting('pgtap.fa03_source_session_id')::bigint
  ),
  2::bigint,
  'a real session domain update increments the attached trigger'
);
update public.sessions
set notification_state_version = 999
where id = current_setting('pgtap.fa03_source_session_id')::bigint;
select is(
  (
    select session_row.notification_state_version
    from public.sessions session_row
    where session_row.id = current_setting('pgtap.fa03_source_session_id')::bigint
  ),
  2::bigint,
  'the real session trigger rejects a caller-forged version'
);

-- Participant probe covers the three identity fields that current production
-- transition policy intentionally rejects before this version trigger runs.
create temporary table fa03_participant_version_probe (
  session_id bigint,
  profile_id bigint,
  role text,
  status text,
  initiated_by text,
  played_confirmed boolean,
  notification_state_version bigint not null default 1
) on commit drop;

create trigger fa03_participant_version_probe_maintain
before update on fa03_participant_version_probe
for each row execute function private.maintain_session_participant_notification_state_version();

insert into fa03_participant_version_probe (
  session_id,
  profile_id,
  role,
  status,
  initiated_by,
  played_confirmed
)
values (1, 1, 'host', 'accepted', 'guest', false);

update fa03_participant_version_probe set session_id = 2;
select is((select notification_state_version from fa03_participant_version_probe), 2::bigint, 'session_id changes increment the participant source version');
update fa03_participant_version_probe set profile_id = 2;
select is((select notification_state_version from fa03_participant_version_probe), 3::bigint, 'profile_id changes increment the participant source version');
update fa03_participant_version_probe set role = 'guest';
select is((select notification_state_version from fa03_participant_version_probe), 4::bigint, 'role changes increment the participant source version');
update fa03_participant_version_probe set status = 'requested';
select is((select notification_state_version from fa03_participant_version_probe), 5::bigint, 'status changes increment the participant source version');
update fa03_participant_version_probe set initiated_by = 'host';
select is((select notification_state_version from fa03_participant_version_probe), 6::bigint, 'initiated_by changes increment the participant source version');
update fa03_participant_version_probe set played_confirmed = true;
select is((select notification_state_version from fa03_participant_version_probe), 6::bigint, 'played_confirmed changes do not invalidate participant notification sources');
update fa03_participant_version_probe
set status = 'accepted', initiated_by = 'guest';
select is((select notification_state_version from fa03_participant_version_probe), 7::bigint, 'one multi-field participant update increments only once');
update fa03_participant_version_probe set status = status;
select is((select notification_state_version from fa03_participant_version_probe), 7::bigint, 'a no-op participant update does not increment');
update fa03_participant_version_probe set notification_state_version = null;
select is((select notification_state_version from fa03_participant_version_probe), 7::bigint, 'a caller-supplied NULL participant version is ignored');
update fa03_participant_version_probe set notification_state_version = 999;
select is((select notification_state_version from fa03_participant_version_probe), 7::bigint, 'a caller-forged participant version is ignored');

with inserted_participant as (
  insert into public.session_participants (
    session_id,
    profile_id,
    role,
    status,
    initiated_by,
    notification_state_version
  )
  values (
    current_setting('pgtap.fa03_source_session_id')::bigint,
    current_setting('pgtap.fa03_source_guest_profile_id')::bigint,
    'guest',
    'requested',
    'guest',
    999
  )
  returning id
)
select set_config(
  'pgtap.fa03_source_participant_id',
  (select inserted_participant.id::text from inserted_participant),
  true
);

select is(
  (
    select participant_row.notification_state_version
    from public.session_participants participant_row
    where participant_row.id = current_setting('pgtap.fa03_source_participant_id')::bigint
  ),
  1::bigint,
  'a real new participant starts at state version one'
);
update public.session_participants
set initiated_by = 'host'
where id = current_setting('pgtap.fa03_source_participant_id')::bigint;
select is(
  (
    select participant_row.notification_state_version
    from public.session_participants participant_row
    where participant_row.id = current_setting('pgtap.fa03_source_participant_id')::bigint
  ),
  2::bigint,
  'a real initiated_by change increments the participant version'
);
update public.session_participants
set status = 'accepted'
where id = current_setting('pgtap.fa03_source_participant_id')::bigint;
select is(
  (
    select participant_row.notification_state_version
    from public.session_participants participant_row
    where participant_row.id = current_setting('pgtap.fa03_source_participant_id')::bigint
  ),
  3::bigint,
  'a real status change increments the participant version'
);

select set_config('private.allow_session_time_change', '1', true);
update public.sessions
set start_at = date_trunc('minute', now()) - interval '1 hour'
where id = current_setting('pgtap.fa03_source_session_id')::bigint;
select set_config('private.allow_session_time_change', '', true);

update public.session_participants
set played_confirmed = true
where id = current_setting('pgtap.fa03_source_participant_id')::bigint;
select is(
  (
    select participant_row.notification_state_version
    from public.session_participants participant_row
    where participant_row.id = current_setting('pgtap.fa03_source_participant_id')::bigint
  ),
  3::bigint,
  'a real played_confirmed change leaves the participant version unchanged'
);
update public.session_participants
set initiated_by = initiated_by
where id = current_setting('pgtap.fa03_source_participant_id')::bigint;
select is(
  (
    select participant_row.notification_state_version
    from public.session_participants participant_row
    where participant_row.id = current_setting('pgtap.fa03_source_participant_id')::bigint
  ),
  3::bigint,
  'a real participant no-op leaves the version unchanged'
);
update public.session_participants
set notification_state_version = null
where id = current_setting('pgtap.fa03_source_participant_id')::bigint;
select is(
  (
    select participant_row.notification_state_version
    from public.session_participants participant_row
    where participant_row.id = current_setting('pgtap.fa03_source_participant_id')::bigint
  ),
  3::bigint,
  'the real participant trigger rejects a caller-supplied NULL version'
);
update public.session_participants
set notification_state_version = 999
where id = current_setting('pgtap.fa03_source_participant_id')::bigint;
select is(
  (
    select participant_row.notification_state_version
    from public.session_participants participant_row
    where participant_row.id = current_setting('pgtap.fa03_source_participant_id')::bigint
  ),
  3::bigint,
  'the real participant trigger rejects a caller-forged version'
);

with inserted_message as (
  insert into public.session_messages (session_id, sender_profile_id, kind, body)
  values (
    current_setting('pgtap.fa03_source_session_id')::bigint,
    current_setting('pgtap.fa03_source_host_profile_id')::bigint,
    'user',
    '__fa03_immutable_message__'
  )
  returning id
)
select set_config(
  'pgtap.fa03_source_message_id',
  (select inserted_message.id::text from inserted_message),
  true
);

select is(
  (
    select message_row.body
    from public.session_messages message_row
    where message_row.id = current_setting('pgtap.fa03_source_message_id')::bigint
  ),
  '__fa03_immutable_message__',
  'message INSERT remains allowed'
);
select throws_ok(
  $$
    update public.session_messages
    set body = '__fa03_forbidden_edit__'
    where id = current_setting('pgtap.fa03_source_message_id')::bigint
  $$,
  'P0001',
  'SESSION_MESSAGE_IMMUTABLE',
  'message UPDATE is rejected by the immutable-source trigger'
);
select is(
  (
    select message_row.body
    from public.session_messages message_row
    where message_row.id = current_setting('pgtap.fa03_source_message_id')::bigint
  ),
  '__fa03_immutable_message__',
  'a rejected message UPDATE leaves the stored body unchanged'
);
delete from public.session_messages
where id = current_setting('pgtap.fa03_source_message_id')::bigint;
select is(
  (
    select count(*)::bigint
    from public.session_messages message_row
    where message_row.id = current_setting('pgtap.fa03_source_message_id')::bigint
  ),
  0::bigint,
  'message DELETE remains allowed for existing purge behavior'
);

select * from finish();
rollback;
