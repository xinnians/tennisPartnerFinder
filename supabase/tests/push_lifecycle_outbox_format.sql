begin;

select plan(33);

select has_column(
  'public',
  'notification_outbox',
  'outbox_format_version',
  'notification_outbox exposes an explicit format version'
);
select ok(
  exists (
    select 1
    from pg_attribute attribute_row
    join pg_attrdef default_row
      on default_row.adrelid = attribute_row.attrelid
     and default_row.adnum = attribute_row.attnum
    where attribute_row.attrelid = 'public.notification_outbox'::regclass
      and attribute_row.attname = 'outbox_format_version'
      and format_type(attribute_row.atttypid, attribute_row.atttypmod) = 'smallint'
      and attribute_row.attnotnull
      and not attribute_row.attisdropped
      and pg_get_expr(default_row.adbin, default_row.adrelid) = '1'
  ),
  'the format version is required smallint with a legacy default of one'
);
select is(
  (
    select string_agg(column_name, ',' order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notification_outbox'
      and column_name in (
        'source_version',
        'outbox_format_version',
        'source_kind',
        'source_id',
        'fanout_state',
        'fanout_frozen_at',
        'outcome',
        'outcome_code',
        'outcome_at'
      )
  ),
  'source_version,outbox_format_version,source_kind,source_id,fanout_state,fanout_frozen_at,outcome,outcome_code,outcome_at',
  'the outbox exposes the exact FA-03A3 format/source/fan-out column set'
);
select ok(
  exists (
    select 1
    from pg_attribute attribute_row
    join pg_attrdef default_row
      on default_row.adrelid = attribute_row.attrelid
     and default_row.adnum = attribute_row.attnum
    where attribute_row.attrelid = 'public.notification_outbox'::regclass
      and attribute_row.attname = 'fanout_state'
      and format_type(attribute_row.atttypid, attribute_row.atttypmod) = 'text'
      and attribute_row.attnotnull
      and not attribute_row.attisdropped
      and pg_get_expr(default_row.adbin, default_row.adrelid) = '''legacy''::text'
  ),
  'fanout_state is required text with the legacy sentinel default'
);
select is(
  (
    select count(*)
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.notification_outbox'::regclass
      and constraint_row.convalidated
      and constraint_row.conname in (
        'notification_outbox_format_version_check',
        'notification_outbox_fanout_shape',
        'notification_outbox_schedule_version_shape',
        'notification_outbox_event_source_mapping',
        'notification_outbox_session_source_matches',
        'notification_outbox_outcome_shape'
      )
  ),
  6::bigint,
  'all six FA-03A3 outbox constraints are present and validated'
);
select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.notification_outbox'::regclass
      and constraint_row.conname = 'notification_outbox_id_recipient_profile_id_key'
      and constraint_row.contype = 'u'
      and not constraint_row.condeferrable
      and not constraint_row.condeferred
  ),
  'the delivery owner-matching key is an immediate UNIQUE constraint'
);
select ok(
  to_regclass('public.notification_outbox_active_source_idx') is not null
    and position(
      'WHERE ((outbox_format_version = 2) AND (outcome IS NULL))'
      in pg_get_indexdef('public.notification_outbox_active_source_idx'::regclass)
    ) > 0,
  'the active source index only covers unresolved format 2 rows'
);
select ok(
  to_regclass('public.notification_outbox_unfinalized_idx') is not null
    and position(
      'WHERE ((outbox_format_version = 2) AND (outcome IS NULL))'
      in pg_get_indexdef('public.notification_outbox_unfinalized_idx'::regclass)
    ) > 0,
  'the unfinalized scan index only covers unresolved format 2 rows'
);
select ok(
  to_regclass('public.notification_outbox_reminder_once_idx') is not null
    and position('(session_id, recipient_profile_id, event_type)' in pg_get_indexdef('public.notification_outbox_reminder_once_idx'::regclass)) > 0
    and position(
      'WHERE ((outbox_format_version = 1) AND (event_type = ANY (ARRAY['
      in pg_get_indexdef('public.notification_outbox_reminder_once_idx'::regclass)
    ) > 0,
  'legacy reminder dedupe is isolated to format 1'
);
select ok(
  to_regclass('public.notification_outbox_v2_reminder_once_idx') is not null
    and position('(session_id, recipient_profile_id, event_type, source_version)' in pg_get_indexdef('public.notification_outbox_v2_reminder_once_idx'::regclass)) > 0
    and position(
      'WHERE ((outbox_format_version = 2) AND (event_type = ANY (ARRAY['
      in pg_get_indexdef('public.notification_outbox_v2_reminder_once_idx'::regclass)
    ) > 0,
  'the format 2 reminder dedupe includes source_version'
);
select ok(
  (
    select not function_row.prosecdef
      and coalesce(function_row.proconfig, '{}'::text[]) @> array['search_path=""']::text[]
    from pg_proc function_row
    where function_row.oid = to_regprocedure('private.default_legacy_notification_schedule_version()')
  ),
  'the legacy reminder compatibility helper is invoker-security with an empty search path'
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
  'app and service roles cannot execute the legacy reminder helper directly'
);
select ok(
  (
    select function_row.prosecdef
      and coalesce(function_row.proconfig, '{}'::text[]) @> array['search_path=""']::text[]
    from pg_proc function_row
    where function_row.oid = to_regprocedure('private.reject_open_notification_outbox_commit()')
  ),
  'the deferred open-commit helper is definer-security with an empty search path'
);
select ok(
  to_regprocedure('private.reject_open_notification_outbox_commit()') is not null
    and not has_function_privilege(
      'anon',
      to_regprocedure('private.reject_open_notification_outbox_commit()'),
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      to_regprocedure('private.reject_open_notification_outbox_commit()'),
      'execute'
    )
    and not has_function_privilege(
      'service_role',
      to_regprocedure('private.reject_open_notification_outbox_commit()'),
      'execute'
    ),
  'app and service roles cannot execute the deferred open-commit helper directly'
);
select ok(
  exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.notification_outbox'::regclass
      and trigger_row.tgname = 'notification_outbox_reject_open_commit'
      and not trigger_row.tgisinternal
      and position(
        'AFTER INSERT OR UPDATE'
        in upper(pg_get_triggerdef(trigger_row.oid))
      ) > 0
      and position(
        'DEFERRABLE INITIALLY DEFERRED'
        in upper(pg_get_triggerdef(trigger_row.oid))
      ) > 0
  ),
  'a deferred constraint trigger rejects format 2 rows that stay open at commit'
);

select set_config('pgtap.fa03_outbox_host_user_id', gen_random_uuid()::text, true);
select set_config('pgtap.fa03_outbox_guest_user_id', gen_random_uuid()::text, true);

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
    current_setting('pgtap.fa03_outbox_host_user_id')::uuid,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'fa03-outbox-host-' || current_setting('pgtap.fa03_outbox_host_user_id') || '@example.test',
    'test',
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  ),
  (
    current_setting('pgtap.fa03_outbox_guest_user_id')::uuid,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'fa03-outbox-guest-' || current_setting('pgtap.fa03_outbox_guest_user_id') || '@example.test',
    'test',
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  );

insert into public.profiles (user_id, nickname, ntrp)
values
  (current_setting('pgtap.fa03_outbox_host_user_id')::uuid, 'FA03 Outbox Host', 3.5),
  (current_setting('pgtap.fa03_outbox_guest_user_id')::uuid, 'FA03 Outbox Guest', 4.0);

select set_config(
  'pgtap.fa03_outbox_host_profile_id',
  (
    select profile_row.id::text
    from public.profiles profile_row
    where profile_row.user_id = current_setting('pgtap.fa03_outbox_host_user_id')::uuid
  ),
  true
);
select set_config(
  'pgtap.fa03_outbox_guest_profile_id',
  (
    select profile_row.id::text
    from public.profiles profile_row
    where profile_row.user_id = current_setting('pgtap.fa03_outbox_guest_user_id')::uuid
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
    current_setting('pgtap.fa03_outbox_host_profile_id')::bigint,
    court_row.id,
    '單打',
    date_trunc('minute', now()) + interval '21 days',
    2,
    '__fa03_outbox_format__'
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
  'pgtap.fa03_outbox_session_id',
  (select inserted_session.id::text from inserted_session),
  true
);

insert into public.session_participants (session_id, profile_id, role, status)
values
  (
    current_setting('pgtap.fa03_outbox_session_id')::bigint,
    current_setting('pgtap.fa03_outbox_host_profile_id')::bigint,
    'host',
    'accepted'
  ),
  (
    current_setting('pgtap.fa03_outbox_session_id')::bigint,
    current_setting('pgtap.fa03_outbox_guest_profile_id')::bigint,
    'guest',
    'requested'
  );

set constraints all immediate;
set constraints all deferred;

select set_config(
  'pgtap.fa03_outbox_participant_id',
  (
    select participant_row.id::text
    from public.session_participants participant_row
    where participant_row.session_id = current_setting('pgtap.fa03_outbox_session_id')::bigint
      and participant_row.profile_id = current_setting('pgtap.fa03_outbox_guest_profile_id')::bigint
  ),
  true
);

insert into public.session_messages (session_id, sender_profile_id, kind, body)
values (
  current_setting('pgtap.fa03_outbox_session_id')::bigint,
  current_setting('pgtap.fa03_outbox_host_profile_id')::bigint,
  'user',
  '__fa03_outbox_message__'
);

select set_config(
  'pgtap.fa03_outbox_message_id',
  (
    select message_row.id::text
    from public.session_messages message_row
    where message_row.session_id = current_setting('pgtap.fa03_outbox_session_id')::bigint
      and message_row.body = '__fa03_outbox_message__'
    order by message_row.id desc
    limit 1
  ),
  true
);

insert into public.notification_outbox (
  event_type,
  recipient_profile_id,
  session_id,
  payload
)
values (
  'session_reminder',
  current_setting('pgtap.fa03_outbox_host_profile_id')::bigint,
  current_setting('pgtap.fa03_outbox_session_id')::bigint,
  private.notification_session_payload(
    current_setting('pgtap.fa03_outbox_session_id')::bigint,
    'legacy reminder sentinel'
  )
);
select ok(
  (
    select outbox_row.outbox_format_version = 1
      and outbox_row.source_version = 0
      and outbox_row.fanout_state = 'legacy'
      and outbox_row.source_kind is null
      and outbox_row.source_id is null
      and outbox_row.fanout_frozen_at is null
    from public.notification_outbox outbox_row
    where outbox_row.session_id = current_setting('pgtap.fa03_outbox_session_id')::bigint
      and outbox_row.recipient_profile_id = current_setting('pgtap.fa03_outbox_host_profile_id')::bigint
      and outbox_row.event_type = 'session_reminder'
    order by outbox_row.id desc
    limit 1
  ),
  'legacy reminder rows keep the format 1 sentinel shape'
);

insert into public.notification_outbox (
  event_type,
  recipient_profile_id,
  session_id,
  payload,
  sent_at,
  outcome,
  outcome_code,
  outcome_at
)
values (
  'host_new_request',
  current_setting('pgtap.fa03_outbox_host_profile_id')::bigint,
  current_setting('pgtap.fa03_outbox_session_id')::bigint,
  private.notification_session_payload(
    current_setting('pgtap.fa03_outbox_session_id')::bigint,
    'legacy completed outcome'
  ),
  now(),
  'completed',
  'legacy_sent_at_recorded',
  now()
);
select ok(
  (
    select outbox_row.outbox_format_version = 1
      and outbox_row.outcome = 'completed'
      and outbox_row.outcome_code = 'legacy_sent_at_recorded'
      and outbox_row.sent_at is not null
    from public.notification_outbox outbox_row
    where outbox_row.session_id = current_setting('pgtap.fa03_outbox_session_id')::bigint
      and outbox_row.event_type = 'host_new_request'
    order by outbox_row.id desc
    limit 1
  ),
  'legacy rows accept only the documented completed outcome mapping'
);

select throws_ok(
  format(
    $query$
      insert into public.notification_outbox (
        event_type,
        recipient_profile_id,
        session_id,
        payload,
        source_kind,
        source_id,
        source_version,
        expires_at
      )
      values ('session_updated', %s, %s, %L::jsonb, 'session_state', %s, 1, now() + interval '1 day')
    $query$,
    current_setting('pgtap.fa03_outbox_host_profile_id')::bigint,
    current_setting('pgtap.fa03_outbox_session_id')::bigint,
    private.notification_session_payload(
      current_setting('pgtap.fa03_outbox_session_id')::bigint,
      'legacy source triple must stay null'
    )::text,
    current_setting('pgtap.fa03_outbox_session_id')::bigint
  ),
  '23514',
  null,
  'format 1 rows cannot smuggle the format 2 source triple'
);
select throws_ok(
  format(
    $query$
      insert into public.notification_outbox (
        event_type,
        recipient_profile_id,
        session_id,
        payload,
        outbox_format_version,
        source_kind,
        source_version,
        expires_at,
        fanout_state
      )
      values ('session_updated', %s, %s, %L::jsonb, 2, 'session_state', 1, now() + interval '1 day', 'open')
    $query$,
    current_setting('pgtap.fa03_outbox_host_profile_id')::bigint,
    current_setting('pgtap.fa03_outbox_session_id')::bigint,
    private.notification_session_payload(
      current_setting('pgtap.fa03_outbox_session_id')::bigint,
      'null source_id'
    )::text
  ),
  '23514',
  null,
  'format 2 rows reject a NULL source_id'
);
select throws_ok(
  format(
    $query$
      insert into public.notification_outbox (
        event_type,
        recipient_profile_id,
        session_id,
        payload,
        outbox_format_version,
        source_kind,
        source_id,
        expires_at,
        fanout_state
      )
      values ('session_updated', %s, %s, %L::jsonb, 2, 'session_state', %s, now() + interval '1 day', 'open')
    $query$,
    current_setting('pgtap.fa03_outbox_host_profile_id')::bigint,
    current_setting('pgtap.fa03_outbox_session_id')::bigint,
    private.notification_session_payload(
      current_setting('pgtap.fa03_outbox_session_id')::bigint,
      'null source_version'
    )::text,
    current_setting('pgtap.fa03_outbox_session_id')::bigint
  ),
  '23514',
  null,
  'format 2 rows reject a NULL source_version'
);
select throws_ok(
  format(
    $query$
      insert into public.notification_outbox (
        event_type,
        recipient_profile_id,
        session_id,
        payload,
        outbox_format_version,
        source_kind,
        source_id,
        source_version,
        fanout_state
      )
      values ('session_updated', %s, %s, %L::jsonb, 2, 'session_state', %s, 1, 'open')
    $query$,
    current_setting('pgtap.fa03_outbox_host_profile_id')::bigint,
    current_setting('pgtap.fa03_outbox_session_id')::bigint,
    private.notification_session_payload(
      current_setting('pgtap.fa03_outbox_session_id')::bigint,
      'null expires_at'
    )::text,
    current_setting('pgtap.fa03_outbox_session_id')::bigint
  ),
  '23514',
  null,
  'format 2 rows require an expiry'
);
select throws_ok(
  format(
    $query$
      insert into public.notification_outbox (
        event_type,
        recipient_profile_id,
        session_id,
        payload,
        outbox_format_version,
        source_kind,
        source_id,
        source_version,
        expires_at,
        fanout_state
      )
      values ('session_updated', %s, %s, %L::jsonb, 2, 'session_state', %s, 1, now(), 'open')
    $query$,
    current_setting('pgtap.fa03_outbox_host_profile_id')::bigint,
    current_setting('pgtap.fa03_outbox_session_id')::bigint,
    private.notification_session_payload(
      current_setting('pgtap.fa03_outbox_session_id')::bigint,
      'non-future expiry'
    )::text,
    current_setting('pgtap.fa03_outbox_session_id')::bigint
  ),
  '23514',
  null,
  'format 2 rows require an expiry later than created_at'
);
select throws_ok(
  format(
    $query$
      insert into public.notification_outbox (
        event_type,
        recipient_profile_id,
        session_id,
        payload,
        sent_at,
        outbox_format_version,
        source_kind,
        source_id,
        source_version,
        expires_at,
        fanout_state
      )
      values ('session_updated', %s, %s, %L::jsonb, now(), 2, 'session_state', %s, 1, now() + interval '1 day', 'open')
    $query$,
    current_setting('pgtap.fa03_outbox_host_profile_id')::bigint,
    current_setting('pgtap.fa03_outbox_session_id')::bigint,
    private.notification_session_payload(
      current_setting('pgtap.fa03_outbox_session_id')::bigint,
      'format 2 sent_at must stay null'
    )::text,
    current_setting('pgtap.fa03_outbox_session_id')::bigint
  ),
  '23514',
  null,
  'format 2 rows reject a non-NULL sent_at'
);
select throws_ok(
  format(
    $query$
      insert into public.notification_outbox (
        event_type,
        recipient_profile_id,
        session_id,
        payload,
        attempts,
        outbox_format_version,
        source_kind,
        source_id,
        source_version,
        expires_at,
        fanout_state
      )
      values ('session_updated', %s, %s, %L::jsonb, 1, 2, 'session_state', %s, 1, now() + interval '1 day', 'open')
    $query$,
    current_setting('pgtap.fa03_outbox_host_profile_id')::bigint,
    current_setting('pgtap.fa03_outbox_session_id')::bigint,
    private.notification_session_payload(
      current_setting('pgtap.fa03_outbox_session_id')::bigint,
      'format 2 attempts must stay zero'
    )::text,
    current_setting('pgtap.fa03_outbox_session_id')::bigint
  ),
  '23514',
  null,
  'format 2 rows reject attempts greater than zero'
);
select throws_ok(
  format(
    $query$
      insert into public.notification_outbox (
        event_type,
        recipient_profile_id,
        session_id,
        payload,
        outbox_format_version,
        source_kind,
        source_id,
        source_version,
        expires_at,
        fanout_state
      )
      values ('host_new_request', %s, %s, %L::jsonb, 2, 'session_state', %s, 1, now() + interval '1 day', 'open')
    $query$,
    current_setting('pgtap.fa03_outbox_host_profile_id')::bigint,
    current_setting('pgtap.fa03_outbox_session_id')::bigint,
    private.notification_session_payload(
      current_setting('pgtap.fa03_outbox_session_id')::bigint,
      'wrong event-source mapping'
    )::text,
    current_setting('pgtap.fa03_outbox_session_id')::bigint
  ),
  '23514',
  null,
  'participant events reject a non-participant source kind'
);
select throws_ok(
  format(
    $query$
      insert into public.notification_outbox (
        event_type,
        recipient_profile_id,
        session_id,
        payload,
        outbox_format_version,
        source_kind,
        source_id,
        source_version,
        expires_at,
        fanout_state
      )
      values ('session_reminder', %s, %s, %L::jsonb, 2, 'session_schedule', %s + 1, 1, now() + interval '1 day', 'open')
    $query$,
    current_setting('pgtap.fa03_outbox_host_profile_id')::bigint,
    current_setting('pgtap.fa03_outbox_session_id')::bigint,
    private.notification_session_payload(
      current_setting('pgtap.fa03_outbox_session_id')::bigint,
      'mismatched session source'
    )::text,
    current_setting('pgtap.fa03_outbox_session_id')::bigint
  ),
  '23514',
  null,
  'session-backed sources must reuse the outbox session_id'
);
select throws_ok(
  format(
    $query$
      insert into public.notification_outbox (
        event_type,
        recipient_profile_id,
        session_id,
        payload,
        outbox_format_version,
        source_kind,
        source_id,
        source_version,
        expires_at,
        fanout_state
      )
      values ('chat_message', %s, %s, %L::jsonb, 2, 'session_message', %s, 2, now() + interval '1 day', 'open')
    $query$,
    current_setting('pgtap.fa03_outbox_host_profile_id')::bigint,
    current_setting('pgtap.fa03_outbox_session_id')::bigint,
    private.notification_session_payload(
      current_setting('pgtap.fa03_outbox_session_id')::bigint,
      '群組有新訊息'
    )::text,
    current_setting('pgtap.fa03_outbox_message_id')::bigint
  ),
  '23514',
  null,
  'chat_message format 2 rows keep the immutable source version one'
);
select throws_ok(
  format(
    $query$
      insert into public.notification_outbox (
        event_type,
        recipient_profile_id,
        session_id,
        payload,
        outbox_format_version,
        source_kind,
        source_id,
        source_version,
        expires_at,
        fanout_state,
        fanout_frozen_at,
        outcome,
        outcome_code,
        outcome_at
      )
      values ('session_updated', %s, %s, %L::jsonb, 2, 'session_state', %s, 1, now() + interval '1 day', 'frozen', now(), 'completed', 'fanout_no_targets', now())
    $query$,
    current_setting('pgtap.fa03_outbox_host_profile_id')::bigint,
    current_setting('pgtap.fa03_outbox_session_id')::bigint,
    private.notification_session_payload(
      current_setting('pgtap.fa03_outbox_session_id')::bigint,
      'wrong outcome pairing'
    )::text,
    current_setting('pgtap.fa03_outbox_session_id')::bigint
  ),
  '23514',
  null,
  'format 2 rows reject mismatched outcome and outcome_code pairs'
);

insert into public.notification_outbox (
  event_type,
  recipient_profile_id,
  session_id,
  payload,
  outbox_format_version,
  source_kind,
  source_id,
  source_version,
  expires_at,
  fanout_state,
  fanout_frozen_at,
  outcome,
  outcome_code,
  outcome_at
)
values (
  'session_updated',
  current_setting('pgtap.fa03_outbox_host_profile_id')::bigint,
  current_setting('pgtap.fa03_outbox_session_id')::bigint,
  private.notification_session_payload(
    current_setting('pgtap.fa03_outbox_session_id')::bigint,
    'format 2 no-targets'
  ),
  2,
  'session_state',
  current_setting('pgtap.fa03_outbox_session_id')::bigint,
  1,
  now() + interval '1 day',
  'frozen',
  now(),
  'no_targets',
  'fanout_no_targets',
  now()
);
select ok(
  (
    select outbox_row.outbox_format_version = 2
      and outbox_row.source_kind = 'session_state'
      and outbox_row.source_id = current_setting('pgtap.fa03_outbox_session_id')::bigint
      and outbox_row.source_version = 1
      and outbox_row.fanout_state = 'frozen'
      and outbox_row.outcome = 'no_targets'
      and outbox_row.outcome_code = 'fanout_no_targets'
      and outbox_row.sent_at is null
      and outbox_row.attempts = 0
    from public.notification_outbox outbox_row
    where outbox_row.session_id = current_setting('pgtap.fa03_outbox_session_id')::bigint
      and outbox_row.event_type = 'session_updated'
      and outbox_row.outbox_format_version = 2
    order by outbox_row.id desc
    limit 1
  ),
  'format 2 rows keep the frozen no-targets terminal shape'
);

select throws_ok(
  format(
    $query$
      do $body$
      begin
        insert into public.notification_outbox (
          event_type,
          recipient_profile_id,
          session_id,
          payload,
          outbox_format_version,
          source_kind,
          source_id,
          source_version,
          expires_at,
          fanout_state
        )
        values (
          'session_updated',
          %s,
          %s,
          %L::jsonb,
          2,
          'session_state',
          %s,
          1,
          now() + interval '1 day',
          'open'
        );
        execute 'set constraints notification_outbox_reject_open_commit immediate';
      end
      $body$;
    $query$,
    current_setting('pgtap.fa03_outbox_host_profile_id')::bigint,
    current_setting('pgtap.fa03_outbox_session_id')::bigint,
    private.notification_session_payload(
      current_setting('pgtap.fa03_outbox_session_id')::bigint,
      'commit-visible open row'
    )::text,
    current_setting('pgtap.fa03_outbox_session_id')::bigint
  ),
  '23514',
  'NOTIFICATION_OUTBOX_FANOUT_OPEN',
  'the deferred open-commit guard rejects a format 2 row that stays open'
);
with inserted_outbox as (
  insert into public.notification_outbox (
    event_type,
    recipient_profile_id,
    session_id,
    payload,
    outbox_format_version,
    source_kind,
    source_id,
    source_version,
    expires_at,
    fanout_state
  )
  values (
    'session_updated',
    current_setting('pgtap.fa03_outbox_host_profile_id')::bigint,
    current_setting('pgtap.fa03_outbox_session_id')::bigint,
    private.notification_session_payload(
      current_setting('pgtap.fa03_outbox_session_id')::bigint,
      'transaction-local open then frozen'
    ),
    2,
    'session_state',
    current_setting('pgtap.fa03_outbox_session_id')::bigint,
    1,
    now() + interval '1 day',
    'open'
  )
  returning id
)
select set_config(
  'pgtap.fa03_outbox_open_row_id',
  (select inserted_outbox.id::text from inserted_outbox),
  true
);

update public.notification_outbox
set fanout_state = 'frozen',
    fanout_frozen_at = created_at + interval '1 second',
    outcome = 'no_targets',
    outcome_code = 'fanout_no_targets',
    outcome_at = created_at + interval '1 second'
where id = current_setting('pgtap.fa03_outbox_open_row_id')::bigint;

select lives_ok(
  $$set constraints notification_outbox_reject_open_commit immediate$$,
  'the deferred open-commit guard allows rows that freeze before commit'
);
set constraints notification_outbox_reject_open_commit deferred;

insert into public.notification_outbox (
  event_type,
  recipient_profile_id,
  session_id,
  payload,
  outbox_format_version,
  source_kind,
  source_id,
  source_version,
  expires_at,
  fanout_state,
  fanout_frozen_at,
  outcome,
  outcome_code,
  outcome_at
)
values (
  'session_reminder',
  current_setting('pgtap.fa03_outbox_guest_profile_id')::bigint,
  current_setting('pgtap.fa03_outbox_session_id')::bigint,
  private.notification_session_payload(
    current_setting('pgtap.fa03_outbox_session_id')::bigint,
    'format 2 reminder v1'
  ),
  2,
  'session_schedule',
  current_setting('pgtap.fa03_outbox_session_id')::bigint,
  1,
  now() + interval '1 day',
  'frozen',
  now(),
  'no_targets',
  'fanout_no_targets',
  now()
);
select is(
  (
    select count(*)
    from public.notification_outbox outbox_row
    where outbox_row.event_type = 'session_reminder'
      and outbox_row.recipient_profile_id = current_setting('pgtap.fa03_outbox_guest_profile_id')::bigint
      and outbox_row.session_id = current_setting('pgtap.fa03_outbox_session_id')::bigint
      and outbox_row.outbox_format_version = 2
  ),
  1::bigint,
  'a single format 2 reminder row is insertable before the compatible batch switches the runtime'
);
select lives_ok(
  format(
    $query$
      insert into public.notification_outbox (
        event_type,
        recipient_profile_id,
        session_id,
        payload,
        outbox_format_version,
        source_kind,
        source_id,
        source_version,
        expires_at,
        fanout_state,
        fanout_frozen_at,
        outcome,
        outcome_code,
        outcome_at
      )
      values (
        'session_reminder',
        %s,
        %s,
        %L::jsonb,
        2,
        'session_schedule',
        %s,
        2,
        now() + interval '3 days',
        'frozen',
        now(),
        'no_targets',
        'fanout_no_targets',
        now()
      )
    $query$,
    current_setting('pgtap.fa03_outbox_guest_profile_id')::bigint,
    current_setting('pgtap.fa03_outbox_session_id')::bigint,
    private.notification_session_payload(
      current_setting('pgtap.fa03_outbox_session_id')::bigint,
      'format 2 reminder duplicate version'
    )::text,
    current_setting('pgtap.fa03_outbox_session_id')::bigint
  ),
  'a changed schedule produces a new v2 reminder without colliding with legacy dedupe'
);

select * from finish();

rollback;
