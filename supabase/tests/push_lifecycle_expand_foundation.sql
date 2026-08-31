begin;

select plan(33);

select has_column(
  'public',
  'sessions',
  'notification_schedule_version',
  'sessions expose a notification schedule version'
);
select is(
  (
    select format_type(attribute_row.atttypid, attribute_row.atttypmod)
    from pg_attribute attribute_row
    where attribute_row.attrelid = 'public.sessions'::regclass
      and attribute_row.attname = 'notification_schedule_version'
      and not attribute_row.attisdropped
  ),
  'bigint',
  'the notification schedule version uses bigint'
);
select ok(
  (
    select attribute_row.attnotnull
    from pg_attribute attribute_row
    where attribute_row.attrelid = 'public.sessions'::regclass
      and attribute_row.attname = 'notification_schedule_version'
      and not attribute_row.attisdropped
  ),
  'the notification schedule version is required'
);
select is(
  (
    select pg_get_expr(default_row.adbin, default_row.adrelid)
    from pg_attrdef default_row
    join pg_attribute attribute_row
      on attribute_row.attrelid = default_row.adrelid
     and attribute_row.attnum = default_row.adnum
    where default_row.adrelid = 'public.sessions'::regclass
      and attribute_row.attname = 'notification_schedule_version'
  ),
  '1',
  'new sessions start at notification schedule version one'
);
select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.sessions'::regclass
      and constraint_row.conname = 'sessions_notification_schedule_version_positive'
      and constraint_row.contype = 'c'
      and constraint_row.convalidated
      and pg_get_constraintdef(constraint_row.oid) = 'CHECK ((notification_schedule_version > 0))'
  ),
  'the positive schedule-version constraint is present and validated'
);

select has_column(
  'public',
  'notification_outbox',
  'expires_at',
  'the outbox exposes an optional deadline during expand'
);
select ok(
  exists (
    select 1
    from pg_attribute attribute_row
    where attribute_row.attrelid = 'public.notification_outbox'::regclass
      and attribute_row.attname = 'expires_at'
      and format_type(attribute_row.atttypid, attribute_row.atttypmod) = 'timestamp with time zone'
      and not attribute_row.attnotnull
      and not attribute_row.atthasdef
      and not attribute_row.attisdropped
  ),
  'the expand deadline is nullable timestamptz without a fabricated default'
);
select has_column(
  'public',
  'notification_outbox',
  'source_schedule_version',
  'the outbox exposes an optional reminder schedule version'
);
select ok(
  exists (
    select 1
    from pg_attribute attribute_row
    where attribute_row.attrelid = 'public.notification_outbox'::regclass
      and attribute_row.attname = 'source_schedule_version'
      and format_type(attribute_row.atttypid, attribute_row.atttypmod) = 'bigint'
      and not attribute_row.attnotnull
      and not attribute_row.atthasdef
      and not attribute_row.attisdropped
  ),
  'the reminder schedule version is nullable bigint without a global default'
);
select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.notification_outbox'::regclass
      and constraint_row.conname = 'notification_outbox_schedule_version_shape'
      and constraint_row.contype = 'c'
      and constraint_row.convalidated
  ),
  'the reminder schedule-version shape constraint is validated'
);
select ok(
  exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.notification_outbox'::regclass
      and trigger_row.tgname = 'notification_outbox_default_legacy_schedule_version'
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled = 'O'
      and trigger_row.tgtype = 7
  ),
  'a row-level BEFORE INSERT trigger protects legacy reminder writes'
);
select ok(
  (
    select not function_row.prosecdef
      and coalesce(function_row.proconfig, '{}'::text[]) @> array['search_path=""']::text[]
    from pg_proc function_row
    where function_row.oid = to_regprocedure('private.default_legacy_notification_schedule_version()')
  ),
  'the compatibility trigger is invoker-security with an empty search path'
);
select ok(
  to_regprocedure('private.default_legacy_notification_schedule_version()') is not null
    and not has_function_privilege(
      'anon',
      to_regprocedure('private.default_legacy_notification_schedule_version()'),
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      to_regprocedure('private.default_legacy_notification_schedule_version()'),
      'execute'
    )
    and not has_function_privilege(
      'service_role',
      to_regprocedure('private.default_legacy_notification_schedule_version()'),
      'execute'
    ),
  'app and service roles cannot execute the trigger helper directly'
);
select ok(
  exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.sessions'::regclass
      and trigger_row.tgname = 'sessions_maintain_notification_schedule_version'
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled = 'O'
      and trigger_row.tgtype = 19
  ),
  'a row-level BEFORE UPDATE trigger maintains the session schedule version'
);
select ok(
  (
    select not function_row.prosecdef
      and coalesce(function_row.proconfig, '{}'::text[]) @> array['search_path=""']::text[]
    from pg_proc function_row
    where function_row.oid = to_regprocedure('private.maintain_session_notification_schedule_version()')
  ),
  'the schedule-version trigger is invoker-security with an empty search path'
);
select ok(
  to_regprocedure('private.maintain_session_notification_schedule_version()') is not null
    and not has_function_privilege(
      'anon',
      to_regprocedure('private.maintain_session_notification_schedule_version()'),
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      to_regprocedure('private.maintain_session_notification_schedule_version()'),
      'execute'
    )
    and not has_function_privilege(
      'service_role',
      to_regprocedure('private.maintain_session_notification_schedule_version()'),
      'execute'
    ),
  'app and service roles cannot execute the schedule-version helper directly'
);

select set_config('pgtap.fa03_foundation_user_id', gen_random_uuid()::text, true);
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
values (
  current_setting('pgtap.fa03_foundation_user_id')::uuid,
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'fa03-foundation-' || current_setting('pgtap.fa03_foundation_user_id') || '@example.test',
  'test',
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb
);
insert into public.profiles (user_id, nickname, ntrp)
values (
  current_setting('pgtap.fa03_foundation_user_id')::uuid,
  'FA03 Foundation Host',
  3.5
);
select set_config(
  'pgtap.fa03_foundation_profile_id',
  (
    select profile_row.id::text
    from public.profiles profile_row
    where profile_row.user_id = current_setting('pgtap.fa03_foundation_user_id')::uuid
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
    notes
  )
  select
    sport_row.id,
    current_setting('pgtap.fa03_foundation_profile_id')::bigint,
    court_row.id,
    '單打',
    date_trunc('minute', now()) + interval '14 days',
    1,
    '__fa03_expand_foundation__'
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
  'pgtap.fa03_foundation_session_id',
  (select inserted_session.id::text from inserted_session),
  true
);
insert into public.session_participants (session_id, profile_id, role, status)
values (
  current_setting('pgtap.fa03_foundation_session_id')::bigint,
  current_setting('pgtap.fa03_foundation_profile_id')::bigint,
  'host',
  'accepted'
);
set constraints all immediate;
set constraints all deferred;

select is(
  (
    select session_row.notification_schedule_version
    from public.sessions session_row
    where session_row.id = current_setting('pgtap.fa03_foundation_session_id')::bigint
  ),
  1::bigint,
  'a new session receives schedule version one'
);

select set_config(
  'pgtap.fa03_foundation_second_court_id',
  (
    select court_row.id::text
    from public.courts court_row
    where court_row.is_active
      and court_row.city = '台北市'
      and court_row.id <> (
        select session_row.court_id
        from public.sessions session_row
        where session_row.id = current_setting('pgtap.fa03_foundation_session_id')::bigint
      )
    order by court_row.id
    limit 1
  ),
  true
);

update public.sessions
set notes = '__fa03_unrelated_update__',
    notification_schedule_version = 999
where id = current_setting('pgtap.fa03_foundation_session_id')::bigint;
select is(
  (
    select session_row.notification_schedule_version
    from public.sessions session_row
    where session_row.id = current_setting('pgtap.fa03_foundation_session_id')::bigint
  ),
  1::bigint,
  'an unrelated update cannot increment or forge the schedule version'
);

select set_config('private.allow_session_time_change', '1', true);
update public.sessions
set start_at = start_at + interval '1 hour'
where id = current_setting('pgtap.fa03_foundation_session_id')::bigint;
select set_config('private.allow_session_time_change', '', true);
select is(
  (
    select session_row.notification_schedule_version
    from public.sessions session_row
    where session_row.id = current_setting('pgtap.fa03_foundation_session_id')::bigint
  ),
  2::bigint,
  'changing start_at increments the schedule version once'
);

update public.sessions
set court_id = current_setting('pgtap.fa03_foundation_second_court_id')::bigint
where id = current_setting('pgtap.fa03_foundation_session_id')::bigint;
select is(
  (
    select session_row.notification_schedule_version
    from public.sessions session_row
    where session_row.id = current_setting('pgtap.fa03_foundation_session_id')::bigint
  ),
  3::bigint,
  'changing court_id increments the schedule version once'
);

update public.sessions
set venue_type = 'walk_on'
where id = current_setting('pgtap.fa03_foundation_session_id')::bigint;
select is(
  (
    select session_row.notification_schedule_version
    from public.sessions session_row
    where session_row.id = current_setting('pgtap.fa03_foundation_session_id')::bigint
  ),
  4::bigint,
  'changing venue_type alone increments the schedule version once'
);

update public.sessions
set venue_type = 'candidates',
    range_end = start_at + interval '2 hours'
where id = current_setting('pgtap.fa03_foundation_session_id')::bigint;
select is(
  (
    select session_row.notification_schedule_version
    from public.sessions session_row
    where session_row.id = current_setting('pgtap.fa03_foundation_session_id')::bigint
  ),
  5::bigint,
  'changing venue_type and range_end together increments only once'
);

update public.sessions
set range_end = range_end + interval '1 hour'
where id = current_setting('pgtap.fa03_foundation_session_id')::bigint;
select is(
  (
    select session_row.notification_schedule_version
    from public.sessions session_row
    where session_row.id = current_setting('pgtap.fa03_foundation_session_id')::bigint
  ),
  6::bigint,
  'changing range_end increments the schedule version once'
);

update public.sessions
set decided_at = date_trunc('minute', now())
where id = current_setting('pgtap.fa03_foundation_session_id')::bigint;
select is(
  (
    select session_row.notification_schedule_version
    from public.sessions session_row
    where session_row.id = current_setting('pgtap.fa03_foundation_session_id')::bigint
  ),
  7::bigint,
  'changing decided_at increments the schedule version once'
);

update public.sessions
set start_at = start_at,
    court_id = court_id,
    venue_type = venue_type,
    range_end = range_end,
    decided_at = decided_at,
    status = status,
    notification_schedule_version = 999
where id = current_setting('pgtap.fa03_foundation_session_id')::bigint;
select is(
  (
    select session_row.notification_schedule_version
    from public.sessions session_row
    where session_row.id = current_setting('pgtap.fa03_foundation_session_id')::bigint
  ),
  7::bigint,
  'no-op schedule fields do not increment and cannot forge the version'
);

insert into public.notification_outbox (
  event_type,
  recipient_profile_id,
  session_id,
  payload
)
values (
  'session_reminder',
  current_setting('pgtap.fa03_foundation_profile_id')::bigint,
  current_setting('pgtap.fa03_foundation_session_id')::bigint,
  private.notification_session_payload(
    current_setting('pgtap.fa03_foundation_session_id')::bigint,
    'legacy reminder sentinel'
  )
);
select is(
  (
    select outbox_row.source_schedule_version
    from public.notification_outbox outbox_row
    where outbox_row.session_id = current_setting('pgtap.fa03_foundation_session_id')::bigint
      and outbox_row.event_type = 'session_reminder'
  ),
  0::bigint,
  'a legacy reminder insert with no version receives sentinel zero'
);
select throws_ok(
  format(
    $query$
      insert into public.notification_outbox (
        event_type,
        recipient_profile_id,
        session_id,
        payload,
        source_schedule_version
      )
      values ('decide_reminder', %s, %s, %L::jsonb, -1)
    $query$,
    current_setting('pgtap.fa03_foundation_profile_id')::bigint,
    current_setting('pgtap.fa03_foundation_session_id')::bigint,
    private.notification_session_payload(
      current_setting('pgtap.fa03_foundation_session_id')::bigint,
      'negative schedule version'
    )::text
  ),
  '23514',
  null,
  'a reminder cannot store a negative schedule version'
);
select throws_ok(
  format(
    $query$
      insert into public.notification_outbox (
        event_type,
        recipient_profile_id,
        session_id,
        payload,
        source_schedule_version
      )
      values ('session_updated', %s, %s, %L::jsonb, 0)
    $query$,
    current_setting('pgtap.fa03_foundation_profile_id')::bigint,
    current_setting('pgtap.fa03_foundation_session_id')::bigint,
    private.notification_session_payload(
      current_setting('pgtap.fa03_foundation_session_id')::bigint,
      'non-reminder schedule version'
    )::text
  ),
  '23514',
  null,
  'a non-reminder cannot claim a reminder schedule version'
);
select is(
  (
    select string_agg(attribute_row.attname, ',' order by key_row.ordinality)
    from pg_index index_row
    cross join lateral unnest(index_row.indkey::smallint[]) with ordinality key_row(attnum, ordinality)
    join pg_attribute attribute_row
      on attribute_row.attrelid = index_row.indrelid
     and attribute_row.attnum = key_row.attnum
    where index_row.indexrelid = 'public.notification_outbox_reminder_once_idx'::regclass
      and key_row.ordinality <= index_row.indnkeyatts
  ),
  'session_id,recipient_profile_id,event_type',
  'the dormant expand keeps the current three-column reminder dedupe index'
);
select throws_ok(
  format(
    $query$
      insert into public.notification_outbox (
        event_type,
        recipient_profile_id,
        session_id,
        payload,
        source_schedule_version
      )
      values ('session_reminder', %s, %s, %L::jsonb, 0)
    $query$,
    current_setting('pgtap.fa03_foundation_profile_id')::bigint,
    current_setting('pgtap.fa03_foundation_session_id')::bigint,
    private.notification_session_payload(
      current_setting('pgtap.fa03_foundation_session_id')::bigint,
      'duplicate legacy reminder'
    )::text
  ),
  '23505',
  null,
  'the existing reminder dedupe still rejects a duplicate legacy insert'
);

insert into public.notification_outbox (
  event_type,
  recipient_profile_id,
  session_id,
  payload
)
values (
  'session_updated',
  current_setting('pgtap.fa03_foundation_profile_id')::bigint,
  current_setting('pgtap.fa03_foundation_session_id')::bigint,
  private.notification_session_payload(
    current_setting('pgtap.fa03_foundation_session_id')::bigint,
    'ordinary legacy event'
  )
);
select ok(
  (
    select outbox_row.expires_at is null
      and outbox_row.source_schedule_version is null
    from public.notification_outbox outbox_row
    where outbox_row.session_id = current_setting('pgtap.fa03_foundation_session_id')::bigint
      and outbox_row.event_type = 'session_updated'
  ),
  'ordinary legacy events keep both expand-only fields null'
);

update public.sessions
set status = 'cancelled'
where id = current_setting('pgtap.fa03_foundation_session_id')::bigint;
select is(
  (
    select session_row.notification_schedule_version
    from public.sessions session_row
    where session_row.id = current_setting('pgtap.fa03_foundation_session_id')::bigint
  ),
  8::bigint,
  'leaving the open/full status set increments the schedule version once'
);

create temporary table schedule_version_probe (
  notification_schedule_version bigint not null,
  start_at timestamptz not null,
  court_id bigint not null,
  venue_type text not null,
  range_end timestamptz,
  decided_at timestamptz,
  status text not null
);
create trigger schedule_version_probe_maintain
before update on schedule_version_probe
for each row execute function private.maintain_session_notification_schedule_version();
create temporary table schedule_version_probe_log (
  step integer generated always as identity,
  version bigint not null
);
insert into schedule_version_probe (
  notification_schedule_version,
  start_at,
  court_id,
  venue_type,
  status
)
values (1, now(), 1, 'booked', 'open');
update schedule_version_probe set status = 'full';
insert into schedule_version_probe_log (version)
select notification_schedule_version from schedule_version_probe;
update schedule_version_probe set status = 'open';
insert into schedule_version_probe_log (version)
select notification_schedule_version from schedule_version_probe;
update schedule_version_probe set status = 'cancelled';
insert into schedule_version_probe_log (version)
select notification_schedule_version from schedule_version_probe;
update schedule_version_probe set status = 'open';
insert into schedule_version_probe_log (version)
select notification_schedule_version from schedule_version_probe;
select is(
  (
    select string_agg(probe_row.version::text, ',' order by probe_row.step)
    from schedule_version_probe_log probe_row
  ),
  '1,1,2,3',
  'open/full changes stay stable while leaving or returning increments once'
);

select * from finish();

rollback;
