begin;

select no_plan();

-- Catalog and dormant-state boundary.
select ok(
  exists (
    select 1
    from pg_roles role_row
    where role_row.rolname = 'notification_dispatcher'
      and role_row.rolcanlogin
      and not role_row.rolsuper
      and not role_row.rolinherit
      and not role_row.rolcreatedb
      and not role_row.rolcreaterole
      and not role_row.rolreplication
      and not role_row.rolbypassrls
      and (
        select auth_role.rolpassword is null
        from pg_authid auth_role
        where auth_role.oid = role_row.oid
      )
      and role_row.rolconfig = array['search_path=""']::text[]
  ),
  'dispatcher role is a passwordless dormant login without elevated attributes'
);

select is(
  (
    select count(*)::bigint
    from pg_proc function_row
    join pg_namespace namespace_row
      on namespace_row.oid = function_row.pronamespace
    where namespace_row.nspname in (
      'public',
      'private',
      'notification_dispatcher_api'
    )
      and has_function_privilege(
        'notification_dispatcher',
        function_row.oid,
        'execute'
      )
      and has_schema_privilege(
        'notification_dispatcher',
        namespace_row.oid,
        'usage'
      )
  ),
  7::bigint,
  'dispatcher can execute exactly the seven reviewed project commands'
);

select is(
  (
    select count(*)::bigint
    from pg_class relation_row
    join pg_namespace namespace_row
      on namespace_row.oid = relation_row.relnamespace
    where namespace_row.nspname in (
      'public',
      'private',
      'notification_dispatcher_api'
    )
      and relation_row.relkind in ('r', 'p', 'v', 'm', 'f')
      and (
        has_table_privilege(
          'notification_dispatcher', relation_row.oid, 'select'
        )
        or has_table_privilege(
          'notification_dispatcher', relation_row.oid, 'insert'
        )
        or has_table_privilege(
          'notification_dispatcher', relation_row.oid, 'update'
        )
        or has_table_privilege(
          'notification_dispatcher', relation_row.oid, 'delete'
        )
        or has_table_privilege(
          'notification_dispatcher', relation_row.oid, 'truncate'
        )
        or has_table_privilege(
          'notification_dispatcher', relation_row.oid, 'references'
        )
        or has_table_privilege(
          'notification_dispatcher', relation_row.oid, 'trigger'
        )
      )
  ),
  0::bigint,
  'dispatcher has no effective raw relation privilege'
);

select is(
  (
    select count(*)::bigint
    from pg_auth_members membership_row
    join pg_roles member_role on member_role.oid = membership_row.member
    where member_role.rolname = 'notification_dispatcher'
  ),
  0::bigint,
  'dispatcher inherits no role membership'
);

select ok(
  has_schema_privilege(
    'notification_dispatcher',
    'notification_dispatcher_api',
    'usage'
  )
  and not has_schema_privilege(
    'notification_dispatcher',
    'private',
    'usage'
  ),
  'dispatcher can resolve only its dedicated command schema, not private'
);

select ok(
  (
    select count(*) = 7
    from pg_proc function_row
    join pg_roles owner_role on owner_role.oid = function_row.proowner
    where function_row.oid = any(array[
      to_regprocedure('notification_dispatcher_api.begin_notification_dispatch_worker(bigint)'),
      to_regprocedure('notification_dispatcher_api.finish_notification_dispatch_worker(uuid,boolean)'),
      to_regprocedure('notification_dispatcher_api.expire_notification_dispatch_workers(bigint)'),
      to_regprocedure('notification_dispatcher_api.claim_notification_delivery(uuid)'),
      to_regprocedure('notification_dispatcher_api.prepare_notification_delivery_send(uuid,uuid)'),
      to_regprocedure(
        'notification_dispatcher_api.complete_notification_delivery(uuid,uuid,text,text,timestamptz)'
      ),
      to_regprocedure('notification_dispatcher_api.finalize_notification_outbox(bigint)')
    ])
      and owner_role.rolname = 'postgres'
      and function_row.prosecdef
      and coalesce(function_row.proconfig, '{}'::text[])
        @> array['search_path=""']::text[]
  ),
  'all dispatcher commands are postgres-owned definers with an empty path'
);

select ok(
  not exists (
    select 1
    from unnest(array['public', 'anon', 'authenticated', 'service_role'])
      as caller(role_name)
    cross join unnest(array[
      'notification_dispatcher_api.begin_notification_dispatch_worker(bigint)'::regprocedure,
      'notification_dispatcher_api.finish_notification_dispatch_worker(uuid,boolean)'::regprocedure,
      'notification_dispatcher_api.expire_notification_dispatch_workers(bigint)'::regprocedure,
      'notification_dispatcher_api.claim_notification_delivery(uuid)'::regprocedure,
      'notification_dispatcher_api.prepare_notification_delivery_send(uuid,uuid)'::regprocedure,
      'notification_dispatcher_api.complete_notification_delivery(uuid,uuid,text,text,timestamptz)'::regprocedure,
      'notification_dispatcher_api.finalize_notification_outbox(bigint)'::regprocedure
    ]) as command(function_oid)
    where has_function_privilege(
      caller.role_name,
      command.function_oid,
      'execute'
    )
  ),
  'application roles cannot execute dispatcher commands'
);

select ok(
  exists (
    select 1
    from pg_index index_row
    join pg_class index_class on index_class.oid = index_row.indexrelid
    where index_row.indrelid = 'private.notification_deliveries'::regclass
      and index_class.relname = 'notification_deliveries_processing_lease_idx'
      and index_row.indisvalid
      and pg_get_expr(index_row.indpred, index_row.indrelid)
        = '(state = ''processing''::text)'
  ),
  'expired processing leases have a valid partial index'
);

select ok(
  exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.notification_outbox'::regclass
      and trigger_row.tgname = 'notification_outbox_maintain_v2'
      and trigger_row.tgenabled = 'O'
      and not trigger_row.tgisinternal
  ),
  'v2 outbox immutability trigger is active'
);

select is(
  (
    select concat_ws(
      ':',
      worker_generation::text,
      dispatch_enabled::text,
      new_runtime_mode,
      legacy_writes_enabled::text,
      legacy_outbox_handled::text,
      coalesce(worker_lease_duration::text, 'null'),
      coalesce(request_deadline_duration::text, 'null'),
      coalesce(delivery_lease_duration::text, 'null'),
      coalesce(max_delivery_attempts::text, 'null'),
      coalesce(push_ttl_safety_budget::text, 'null')
    )
    from private.notification_runtime_control
    where singleton_id = 1
  ),
  '1:true:disabled:true:false:null:null:null:null:null',
  'migration preserves every runtime control value'
);

select is(
  notification_dispatcher_api.begin_notification_dispatch_worker(1) ->> 'code',
  'runtime_policy_incomplete',
  'worker begin fails closed while policy values are still unset'
);

-- All durations below are isolated test fixtures and roll back with this file.
update private.notification_runtime_control
set new_runtime_mode = 'enabled',
    worker_lease_duration = interval '10 minutes',
    request_deadline_duration = interval '1 minute',
    delivery_lease_duration = interval '2 minutes',
    max_delivery_attempts = 3,
    push_ttl_safety_budget = interval '0 seconds'
where singleton_id = 1;

select set_config(
  'pgtap.fa03_d1_worker',
  notification_dispatcher_api.begin_notification_dispatch_worker(1) ->> 'workerToken',
  true
);

select ok(
  current_setting('pgtap.fa03_d1_worker', true) is not null,
  'configured current generation can begin a worker'
);

select is(
  (
    select state
    from private.notification_dispatch_workers
    where worker_token = current_setting('pgtap.fa03_d1_worker')::uuid
  ),
  'running',
  'worker begin records a running lease'
);

select is(
  notification_dispatcher_api.begin_notification_dispatch_worker(2) ->> 'code',
  'worker_generation_changed',
  'worker begin rejects a stale expected generation'
);

with expired_worker as (
  insert into private.notification_dispatch_workers (
    generation,
    state,
    started_at,
    lease_until
  )
  values (
    1,
    'running',
    pg_catalog.clock_timestamp() - interval '2 minutes',
    pg_catalog.clock_timestamp() - interval '1 minute'
  )
  returning worker_token::text
)
select set_config(
  'pgtap.fa03_d1_expired_worker',
  expired_worker.worker_token,
  true
)
from expired_worker;

select is(
  notification_dispatcher_api.expire_notification_dispatch_workers(1) ->> 'count',
  '1',
  'worker expiry command closes an elapsed running lease'
);

select is(
  (
    select state || ':' || result_code
    from private.notification_dispatch_workers
    where worker_token = current_setting('pgtap.fa03_d1_expired_worker')::uuid
  ),
  'expired:hard_deadline_elapsed',
  'expired worker records the fixed terminal reason'
);

-- Domain and transport fixtures.
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
    '00000000-0000-0000-0000-00000000d101',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'fa03-d1-host@example.test',
    'test',
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000d102',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'fa03-d1-recipient@example.test',
    'test',
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  );

insert into public.profiles (user_id, nickname, ntrp)
values
  ('00000000-0000-0000-0000-00000000d101', 'D1 Host', 3.5),
  ('00000000-0000-0000-0000-00000000d102', 'D1 Recipient', 3.5);

with inserted_session as (
  insert into public.sessions (
    sport_id,
    host_profile_id,
    court_id,
    play_type,
    start_at,
    slots_total,
    status
  )
  select
    sport_row.id,
    host_profile.id,
    court_row.id,
    '練球',
    statement_timestamp() + interval '1 day',
    2,
    'open'
  from public.sports sport_row
  cross join lateral (
    select profile_row.id
    from public.profiles profile_row
    where profile_row.user_id =
      '00000000-0000-0000-0000-00000000d101'
  ) host_profile
  cross join lateral (
    select court_value.id
    from public.courts court_value
    where court_value.is_active
      and court_value.city = '台北市'
    order by court_value.id
    limit 1
  ) court_row
  where sport_row.code = 'tennis'
  returning id
)
select set_config('pgtap.fa03_d1_session', id::text, true)
from inserted_session;

insert into public.session_participants (
  session_id,
  profile_id,
  role,
  status
)
select
  current_setting('pgtap.fa03_d1_session')::bigint,
  profile_row.id,
  'host',
  'accepted'
from public.profiles profile_row
where profile_row.user_id = '00000000-0000-0000-0000-00000000d101';

insert into public.session_participants (
  session_id,
  profile_id,
  role,
  status
)
select
  current_setting('pgtap.fa03_d1_session')::bigint,
  profile_row.id,
  'guest',
  'requested'
from public.profiles profile_row
where profile_row.user_id = '00000000-0000-0000-0000-00000000d102';

update public.session_participants participant_row
set status = 'accepted'
where participant_row.session_id =
    current_setting('pgtap.fa03_d1_session')::bigint
  and participant_row.role = 'guest';

select set_config(
  'pgtap.fa03_d1_enable',
  public.enable_push_device_v2(
    '00000000-0000-0000-0000-00000000d102',
    '10000000-0000-4000-8000-00000000d102',
    '11000000-0000-4000-8000-00000000d102',
    repeat('d1', 32),
    'https://push.example.test/fa03-d1-recipient',
    'p256dh-fa03-d1',
    'auth-fa03-d1',
    repeat('a1', 32)
  )::text,
  true
);

select is(
  current_setting('pgtap.fa03_d1_enable')::jsonb ->> 'kind',
  'committed',
  'fixture creates a v2 consent and transport through the reviewed A4 command'
);

-- Helper creates one frozen session_updated event and delivery. Its payload is
-- intentionally stale so prepare must rebuild it from locked domain rows.
create function pg_temp.fa03_d1_enqueue_delivery(p_payload_message text)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  target_session public.sessions%rowtype;
  target_profile_id bigint;
  target_consent private.push_device_consents%rowtype;
  created_outbox_id bigint;
  frozen_at timestamptz := pg_catalog.clock_timestamp();
begin
  select * into target_session
  from public.sessions
  where id = current_setting('pgtap.fa03_d1_session')::bigint;

  select id into target_profile_id
  from public.profiles
  where user_id = '00000000-0000-0000-0000-00000000d102';

  select * into target_consent
  from private.push_device_consents
  where profile_id = target_profile_id;

  insert into public.notification_outbox (
    event_type,
    recipient_profile_id,
    session_id,
    payload,
    created_at,
    expires_at,
    source_version,
    outbox_format_version,
    source_kind,
    source_id,
    fanout_state,
    fanout_frozen_at
  )
  values (
    'session_updated',
    target_profile_id,
    target_session.id,
    private.notification_session_payload(
      target_session.id,
      p_payload_message
    ),
    frozen_at,
    frozen_at + interval '1 day',
    target_session.notification_state_version,
    2,
    'session_state',
    target_session.id,
    'frozen',
    frozen_at
  )
  returning id into created_outbox_id;

  insert into private.notification_deliveries (
    outbox_id,
    recipient_profile_id,
    consent_id,
    consent_epoch
  )
  values (
    created_outbox_id,
    target_profile_id,
    target_consent.id,
    target_consent.consent_epoch
  );

  return created_outbox_id;
end;
$$;

select set_config(
  'pgtap.fa03_d1_outbox_accepted',
  pg_temp.fa03_d1_enqueue_delivery('stale snapshot')::text,
  true
);

select set_config(
  'pgtap.fa03_d1_claim_accepted',
  notification_dispatcher_api.claim_notification_delivery(
    current_setting('pgtap.fa03_d1_worker')::uuid
  )::text,
  true
);

select is(
  current_setting('pgtap.fa03_d1_claim_accepted')::jsonb ->> 'kind',
  'claimed',
  'claim reserves one ready delivery'
);

select is(
  (
    select state || ':' || attempts::text
    from private.notification_deliveries
    where outbox_id =
      current_setting('pgtap.fa03_d1_outbox_accepted')::bigint
  ),
  'processing:1',
  'claim records processing state and one attempt reservation'
);

select is(
  notification_dispatcher_api.prepare_notification_delivery_send(
    current_setting('pgtap.fa03_d1_worker')::uuid,
    '20000000-0000-4000-8000-000000000001'
  ) ->> 'code',
  'claim_not_found',
  'prepare rejects an unrelated claim token before exposing send material'
);

select set_config(
  'pgtap.fa03_d1_prepare_accepted',
  notification_dispatcher_api.prepare_notification_delivery_send(
    current_setting('pgtap.fa03_d1_worker')::uuid,
    (
      current_setting('pgtap.fa03_d1_claim_accepted')::jsonb
        ->> 'claimToken'
    )::uuid
  )::text,
  true
);

select is(
  concat_ws(
    ':',
    current_setting('pgtap.fa03_d1_prepare_accepted')::jsonb ->> 'kind',
    current_setting('pgtap.fa03_d1_prepare_accepted')::jsonb ->> 'eventType',
    current_setting('pgtap.fa03_d1_prepare_accepted')::jsonb
      #>> '{payload,message}',
    current_setting('pgtap.fa03_d1_prepare_accepted')::jsonb ->> 'endpoint'
  ),
  'ready:session_updated:球局資訊已更新。:https://push.example.test/fa03-d1-recipient',
  'prepare returns the event, current payload, and locked v2 transport'
);

select is(
  notification_dispatcher_api.complete_notification_delivery(
    current_setting('pgtap.fa03_d1_worker')::uuid,
    (
      current_setting('pgtap.fa03_d1_claim_accepted')::jsonb
        ->> 'claimToken'
    )::uuid,
    'accepted',
    null,
    null
  ) ->> 'state',
  'accepted',
  'accepted completion records provider acceptance without claiming delivery'
);

select is(
  (
    select state
    from private.notification_deliveries
    where outbox_id =
      current_setting('pgtap.fa03_d1_outbox_accepted')::bigint
  ),
  'accepted',
  'accepted delivery is terminal'
);

select is(
  notification_dispatcher_api.finalize_notification_outbox(
    current_setting('pgtap.fa03_d1_outbox_accepted')::bigint
  ) ->> 'outcomeCode',
  'deliveries_terminal_with_acceptance',
  'finalizer aggregates a terminal accepted delivery'
);

select is(
  notification_dispatcher_api.finalize_notification_outbox(
    current_setting('pgtap.fa03_d1_outbox_accepted')::bigint
  ) ->> 'outcomeCode',
  'deliveries_terminal_with_acceptance',
  'finalizer is idempotent'
);

select throws_ok(
  format(
    'update public.notification_outbox set source_version = source_version + 1 where id = %s',
    current_setting('pgtap.fa03_d1_outbox_accepted')
  ),
  'P0001',
  'NOTIFICATION_OUTBOX_V2_IDENTITY_IMMUTABLE',
  'v2 source identity cannot be changed after fan-out'
);

-- A domain version change after claim is rejected by the send-time recheck.
select set_config(
  'pgtap.fa03_d1_outbox_stale',
  pg_temp.fa03_d1_enqueue_delivery('another stale snapshot')::text,
  true
);
select set_config(
  'pgtap.fa03_d1_claim_stale',
  notification_dispatcher_api.claim_notification_delivery(
    current_setting('pgtap.fa03_d1_worker')::uuid
  )::text,
  true
);

update public.sessions
set notes = 'version changed after claim'
where id = current_setting('pgtap.fa03_d1_session')::bigint;

select is(
  notification_dispatcher_api.prepare_notification_delivery_send(
    current_setting('pgtap.fa03_d1_worker')::uuid,
    (
      current_setting('pgtap.fa03_d1_claim_stale')::jsonb
        ->> 'claimToken'
    )::uuid
  ) ->> 'code',
  'source_invalid',
  'prepare cancels a claimed delivery when its source version changed'
);

select is(
  (
    select state || ':' || error_code
    from private.notification_deliveries
    where outbox_id = current_setting('pgtap.fa03_d1_outbox_stale')::bigint
  ),
  'cancelled:source_invalid',
  'source-invalid prepare persists an exact terminal code'
);

-- Retry timestamps are caller supplied; DB validates but never invents one.
select set_config(
  'pgtap.fa03_d1_outbox_retry',
  pg_temp.fa03_d1_enqueue_delivery('retry snapshot')::text,
  true
);
select set_config(
  'pgtap.fa03_d1_claim_retry',
  notification_dispatcher_api.claim_notification_delivery(
    current_setting('pgtap.fa03_d1_worker')::uuid
  )::text,
  true
);

select is(
  notification_dispatcher_api.complete_notification_delivery(
    current_setting('pgtap.fa03_d1_worker')::uuid,
    (
      current_setting('pgtap.fa03_d1_claim_retry')::jsonb
        ->> 'claimToken'
    )::uuid,
    'retry_pending',
    null,
    pg_catalog.clock_timestamp() + interval '5 minutes'
  ) ->> 'code',
  'invalid_completion_shape',
  'retry completion rejects a missing fixed error code'
);

select is(
  notification_dispatcher_api.complete_notification_delivery(
    current_setting('pgtap.fa03_d1_worker')::uuid,
    (
      current_setting('pgtap.fa03_d1_claim_retry')::jsonb
        ->> 'claimToken'
    )::uuid,
    'retry_pending',
    'provider_transient',
    pg_catalog.clock_timestamp() + interval '5 minutes'
  ) ->> 'state',
  'pending',
  'valid retry completion stores caller-supplied scheduling'
);

select ok(
  (
    select state = 'pending'
      and error_code = 'provider_transient'
      and next_attempt_at is not null
    from private.notification_deliveries
    where outbox_id = current_setting('pgtap.fa03_d1_outbox_retry')::bigint
  ),
  'retry state retains no claim token and has an explicit next attempt'
);

-- An elapsed processing lease is reclaimable, but the attempt reservation is
-- never lost or double-counted.
select set_config(
  'pgtap.fa03_d1_outbox_reclaim',
  pg_temp.fa03_d1_enqueue_delivery('reclaim snapshot')::text,
  true
);
select set_config(
  'pgtap.fa03_d1_claim_reclaim_1',
  notification_dispatcher_api.claim_notification_delivery(
    current_setting('pgtap.fa03_d1_worker')::uuid
  )::text,
  true
);

update private.notification_deliveries
set claimed_at = pg_catalog.clock_timestamp() - interval '2 minutes',
    lease_until = pg_catalog.clock_timestamp() - interval '1 minute'
where outbox_id = current_setting('pgtap.fa03_d1_outbox_reclaim')::bigint;

select set_config(
  'pgtap.fa03_d1_claim_reclaim_2',
  notification_dispatcher_api.claim_notification_delivery(
    current_setting('pgtap.fa03_d1_worker')::uuid
  )::text,
  true
);

select is(
  concat_ws(
    ':',
    current_setting('pgtap.fa03_d1_claim_reclaim_2')::jsonb ->> 'kind',
    current_setting('pgtap.fa03_d1_claim_reclaim_2')::jsonb ->> 'attempt'
  ),
  'claimed:2',
  'an elapsed delivery lease is reclaimed as the next attempt'
);

select is(
  notification_dispatcher_api.complete_notification_delivery(
    current_setting('pgtap.fa03_d1_worker')::uuid,
    (
      current_setting('pgtap.fa03_d1_claim_reclaim_2')::jsonb
        ->> 'claimToken'
    )::uuid,
    'accepted',
    null,
    null
  ) ->> 'state',
  'accepted',
  'reclaimed work can complete through the same exact claim contract'
);

select set_config(
  'pgtap.fa03_d1_outbox_exhausted',
  pg_temp.fa03_d1_enqueue_delivery('exhausted snapshot')::text,
  true
);
select set_config(
  'pgtap.fa03_d1_claim_exhausted',
  notification_dispatcher_api.claim_notification_delivery(
    current_setting('pgtap.fa03_d1_worker')::uuid
  )::text,
  true
);

update private.notification_deliveries
set attempts = 3,
    claimed_at = pg_catalog.clock_timestamp() - interval '2 minutes',
    lease_until = pg_catalog.clock_timestamp() - interval '1 minute'
where outbox_id = current_setting('pgtap.fa03_d1_outbox_exhausted')::bigint;

select is(
  notification_dispatcher_api.claim_notification_delivery(
    current_setting('pgtap.fa03_d1_worker')::uuid
  ) ->> 'code',
  'attempts_exhausted',
  'claim terminalizes an elapsed delivery that reached the configured limit'
);

select is(
  notification_dispatcher_api.finalize_notification_outbox(
    current_setting('pgtap.fa03_d1_outbox_exhausted')::bigint
  ) ->> 'outcomeCode',
  'deliveries_terminal_failed',
  'finalizer aggregates an all-failed delivery set'
);

-- Preference mutation takes the shared absence guard and proactively cancels
-- matching v2 work without touching legacy outbox rows.
select set_config(
  'pgtap.fa03_d1_outbox_pref',
  pg_temp.fa03_d1_enqueue_delivery('pref snapshot')::text,
  true
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-00000000d102',
  true
);
select is(
  public.set_notification_prefs(true, true, true, false, true, true),
  'OK',
  'authenticated owner can change notification preferences through the guarded setter'
);
reset role;

select is(
  (
    select state || ':' || error_code
    from private.notification_deliveries
    where outbox_id = current_setting('pgtap.fa03_d1_outbox_pref')::bigint
  ),
  'cancelled:recipient_ineligible',
  'turning off a preference proactively cancels matching v2 delivery'
);

select is(
  notification_dispatcher_api.finalize_notification_outbox(
    current_setting('pgtap.fa03_d1_outbox_pref')::bigint
  ) ->> 'outcomeCode',
  'deliveries_terminal_cancelled',
  'finalizer aggregates an all-cancelled delivery set'
);

-- Generation rotation blocks an old worker from claiming new work but does not
-- prevent it from closing its own worker ledger row.
update private.notification_runtime_control
set worker_generation = 2
where singleton_id = 1;

select is(
  notification_dispatcher_api.claim_notification_delivery(
    current_setting('pgtap.fa03_d1_worker')::uuid
  ) ->> 'code',
  'worker_generation_changed',
  'old generation cannot claim after control rotation'
);

select is(
  notification_dispatcher_api.finish_notification_dispatch_worker(
    current_setting('pgtap.fa03_d1_worker')::uuid,
    true
  ) ->> 'state',
  'completed',
  'rotated worker can still close its ledger record cleanly'
);

select set_config(
  'pgtap.fa03_d1_worker_2',
  notification_dispatcher_api.begin_notification_dispatch_worker(2) ->> 'workerToken',
  true
);

select ok(
  current_setting('pgtap.fa03_d1_worker_2', true) is not null,
  'new generation can begin after rotation'
);

-- Canary mode filters at claim time and rechecks membership at the send
-- boundary, so an out-of-scope delivery never exposes transport material.
set local role authenticated;
select is(
  public.set_notification_prefs(true, true, true, true, true, true),
  'OK',
  'preference is restored before the canary send-boundary check'
);
reset role;

update private.notification_runtime_control
set new_runtime_mode = 'canary'
where singleton_id = 1;

select set_config(
  'pgtap.fa03_d1_outbox_canary',
  pg_temp.fa03_d1_enqueue_delivery('canary snapshot')::text,
  true
);

select is(
  notification_dispatcher_api.claim_notification_delivery(
    current_setting('pgtap.fa03_d1_worker_2')::uuid
  ) ->> 'code',
  'no_ready_delivery',
  'canary mode does not claim a recipient outside the allowlist'
);

insert into private.notification_runtime_canary_profiles (profile_id)
select profile_row.id
from public.profiles profile_row
where profile_row.user_id = '00000000-0000-0000-0000-00000000d102';

select set_config(
  'pgtap.fa03_d1_claim_canary',
  notification_dispatcher_api.claim_notification_delivery(
    current_setting('pgtap.fa03_d1_worker_2')::uuid
  )::text,
  true
);

select is(
  current_setting('pgtap.fa03_d1_claim_canary')::jsonb ->> 'kind',
  'claimed',
  'canary mode claims an allowlisted recipient'
);

select is(
  notification_dispatcher_api.prepare_notification_delivery_send(
    current_setting('pgtap.fa03_d1_worker_2')::uuid,
    (
      current_setting('pgtap.fa03_d1_claim_canary')::jsonb
        ->> 'claimToken'
    )::uuid
  ) ->> 'kind',
  'ready',
  'send boundary rechecks the allowlisted canary delivery'
);

select is(
  notification_dispatcher_api.complete_notification_delivery(
    current_setting('pgtap.fa03_d1_worker_2')::uuid,
    (
      current_setting('pgtap.fa03_d1_claim_canary')::jsonb
        ->> 'claimToken'
    )::uuid,
    'accepted',
    null,
    null
  ) ->> 'state',
  'accepted',
  'allowlisted canary delivery completes normally'
);

delete from private.notification_runtime_canary_profiles;
update private.notification_runtime_control
set new_runtime_mode = 'enabled'
where singleton_id = 1;

-- Provider-inactive is the only completion that removes the proven stale
-- transport and releases its registry owner lock.
set local role authenticated;
select is(
  public.set_notification_prefs(true, true, true, true, true, true),
  'OK',
  'provider-inactive fixture keeps the restored preference enabled'
);
reset role;

select set_config(
  'pgtap.fa03_d1_outbox_provider_stale',
  pg_temp.fa03_d1_enqueue_delivery('provider stale snapshot')::text,
  true
);
select set_config(
  'pgtap.fa03_d1_claim_provider_stale',
  notification_dispatcher_api.claim_notification_delivery(
    current_setting('pgtap.fa03_d1_worker_2')::uuid
  )::text,
  true
);

select is(
  notification_dispatcher_api.prepare_notification_delivery_send(
    current_setting('pgtap.fa03_d1_worker_2')::uuid,
    (
      current_setting('pgtap.fa03_d1_claim_provider_stale')::jsonb
        ->> 'claimToken'
    )::uuid
  ) ->> 'kind',
  'ready',
  'provider-inactive fixture reaches a locked send boundary'
);

select is(
  notification_dispatcher_api.complete_notification_delivery(
    current_setting('pgtap.fa03_d1_worker_2')::uuid,
    (
      current_setting('pgtap.fa03_d1_claim_provider_stale')::jsonb
        ->> 'claimToken'
    )::uuid,
    'provider_endpoint_inactive',
    'provider_endpoint_inactive',
    null
  ) ->> 'code',
  'provider_endpoint_inactive',
  'verified provider-inactive completion uses the dedicated terminal outcome'
);

select is(
  (
    select count(*)::bigint
    from public.push_subscriptions subscription_row
    where subscription_row.profile_id = (
      select profile_row.id
      from public.profiles profile_row
      where profile_row.user_id =
        '00000000-0000-0000-0000-00000000d102'
    )
      and subscription_row.consent_id is not null
  ),
  0::bigint,
  'provider-inactive completion removes raw send material'
);

select is(
  (
    select count(*)::bigint
    from private.push_endpoint_registry registry_row
    where registry_row.owner_profile_id = (
      select profile_row.id
      from public.profiles profile_row
      where profile_row.user_id =
        '00000000-0000-0000-0000-00000000d102'
    )
  ),
  0::bigint,
  'provider-inactive completion releases the proven stale endpoint owner lock'
);

select is(
  (
    select count(*)::bigint
    from private.notification_deliveries delivery_row
    join private.push_device_consents consent_row
      on consent_row.id = delivery_row.consent_id
    where consent_row.profile_id = (
      select profile_row.id
      from public.profiles profile_row
      where profile_row.user_id =
        '00000000-0000-0000-0000-00000000d102'
    )
      and delivery_row.state in ('pending', 'processing', 'unknown')
  ),
  0::bigint,
  'provider-inactive completion cancels every remaining delivery in the epoch'
);

select * from finish();

rollback;
