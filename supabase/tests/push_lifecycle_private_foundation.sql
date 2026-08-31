begin;

select plan(84);

-- Exact dormant schema allowlists.
select is(
  (
    select string_agg(column_name, ',' order by ordinal_position)
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'notification_runtime_control'
  ),
  'singleton_id,worker_generation,dispatch_enabled,new_runtime_mode,legacy_writes_enabled,legacy_outbox_handled,legacy_cutoff_at,worker_lease_duration,request_deadline_duration,delivery_lease_duration,max_delivery_attempts,push_ttl_safety_budget,updated_at',
  'runtime control keeps its exact column allowlist'
);
select is(
  (
    select string_agg(column_name, ',' order by ordinal_position)
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'notification_dispatch_workers'
  ),
  'id,worker_token,generation,state,started_at,lease_until,finished_at,result_code',
  'worker ledger keeps its exact column allowlist'
);
select is(
  (
    select string_agg(column_name, ',' order by ordinal_position)
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'notification_runtime_canary_profiles'
  ),
  'profile_id,created_at',
  'canary allowlist keeps its exact column allowlist'
);
select is(
  (
    select string_agg(column_name, ',' order by ordinal_position)
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'push_device_consents'
  ),
  'id,profile_id,device_id,state,reason_code,consent_epoch,version,cleanup_token_hash_algorithm,cleanup_token_hash,cleanup_token_rotated_at,cleanup_token_revoked_at,created_at,updated_at,state_changed_at',
  'device consent keeps its exact column allowlist'
);
select is(
  (
    select string_agg(column_name, ',' order by ordinal_position)
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'push_endpoint_registry'
  ),
  'fingerprint_algorithm,endpoint_fingerprint,owner_profile_id,state,reason_code,version,created_at,updated_at,state_changed_at',
  'endpoint registry keeps its exact column allowlist'
);
select is(
  (
    select string_agg(column_name, ',' order by ordinal_position)
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'notification_deliveries'
  ),
  'id,outbox_id,recipient_profile_id,consent_id,consent_epoch,notification_id,state,attempts,claim_token,claimed_at,lease_until,next_attempt_at,error_code,created_at,updated_at,state_changed_at',
  'delivery ledger keeps its exact column allowlist'
);

select is(
  (
    select count(*)::bigint
    from pg_class table_row
    where table_row.oid = any(array[
      'private.notification_runtime_control'::regclass,
      'private.notification_dispatch_workers'::regclass,
      'private.notification_runtime_canary_profiles'::regclass,
      'private.push_device_consents'::regclass,
      'private.push_endpoint_registry'::regclass,
      'private.notification_deliveries'::regclass
    ])
      and table_row.relrowsecurity
  ),
  6::bigint,
  'all six private Push tables have RLS enabled'
);
select is(
  (
    select count(*)::bigint
    from pg_policy policy_row
    where policy_row.polrelid = any(array[
      'private.notification_runtime_control'::regclass,
      'private.notification_dispatch_workers'::regclass,
      'private.notification_runtime_canary_profiles'::regclass,
      'private.push_device_consents'::regclass,
      'private.push_endpoint_registry'::regclass,
      'private.notification_deliveries'::regclass
    ])
  ),
  0::bigint,
  'private Push tables expose no RLS policy'
);
select is(
  (
    select count(*)::bigint
    from pg_class table_row
    cross join lateral aclexplode(
      coalesce(table_row.relacl, acldefault('r', table_row.relowner))
    ) acl_row
    where table_row.oid = any(array[
      'private.notification_runtime_control'::regclass,
      'private.notification_dispatch_workers'::regclass,
      'private.notification_runtime_canary_profiles'::regclass,
      'private.push_device_consents'::regclass,
      'private.push_endpoint_registry'::regclass,
      'private.notification_deliveries'::regclass
    ])
      and (
        acl_row.grantee = 0
        or acl_row.grantee in (
          select role_row.oid
          from pg_roles role_row
          where role_row.rolname in ('anon', 'authenticated', 'service_role')
        )
      )
  ),
  0::bigint,
  'PUBLIC and application roles have no private Push table privilege'
);
select is(
  (
    select count(*)::bigint
    from pg_class sequence_row
    where sequence_row.oid = any(array[
      to_regclass('private.notification_dispatch_workers_id_seq'),
      to_regclass('private.push_device_consents_id_seq'),
      to_regclass('private.notification_deliveries_id_seq')
    ])
      and sequence_row.relkind = 'S'
  ),
  3::bigint,
  'all private identity sequences exist'
);
select is(
  (
    select count(*)::bigint
    from pg_class sequence_row
    cross join lateral aclexplode(
      coalesce(sequence_row.relacl, acldefault('S', sequence_row.relowner))
    ) acl_row
    where sequence_row.oid = any(array[
      'private.notification_dispatch_workers_id_seq'::regclass,
      'private.push_device_consents_id_seq'::regclass,
      'private.notification_deliveries_id_seq'::regclass
    ])
      and (
        acl_row.grantee = 0
        or acl_row.grantee in (
          select role_row.oid
          from pg_roles role_row
          where role_row.rolname in ('anon', 'authenticated', 'service_role')
        )
      )
  ),
  0::bigint,
  'PUBLIC and application roles have no private identity-sequence privilege'
);
select is(
  (
    select count(*)::bigint
    from pg_proc function_row
    where function_row.oid = any(array[
      to_regprocedure('private.maintain_push_device_consent()'),
      to_regprocedure('private.maintain_push_endpoint_registry()'),
      to_regprocedure('private.maintain_notification_delivery()')
    ])
      and not function_row.prosecdef
      and coalesce(function_row.proconfig, '{}'::text[])
        @> array['search_path=""']::text[]
  ),
  3::bigint,
  'all three trigger helpers are invoker-security with an empty search path'
);
select is(
  (
    select count(*)::bigint
    from pg_proc function_row
    cross join lateral aclexplode(
      coalesce(function_row.proacl, acldefault('f', function_row.proowner))
    ) acl_row
    where function_row.oid = any(array[
      to_regprocedure('private.maintain_push_device_consent()'),
      to_regprocedure('private.maintain_push_endpoint_registry()'),
      to_regprocedure('private.maintain_notification_delivery()')
    ])
      and acl_row.privilege_type = 'EXECUTE'
      and (
        acl_row.grantee = 0
        or acl_row.grantee in (
          select role_row.oid
          from pg_roles role_row
          where role_row.rolname in ('anon', 'authenticated', 'service_role')
        )
      )
  ),
  0::bigint,
  'PUBLIC and application roles cannot execute private Push trigger helpers'
);
select is(
  (
    select count(*)::bigint
    from pg_trigger trigger_row
    where (
      (
        trigger_row.tgrelid = 'private.push_device_consents'::regclass
        and trigger_row.tgname = 'push_device_consents_maintain'
      )
      or (
        trigger_row.tgrelid = 'private.push_endpoint_registry'::regclass
        and trigger_row.tgname = 'push_endpoint_registry_maintain'
      )
      or (
        trigger_row.tgrelid = 'private.notification_deliveries'::regclass
        and trigger_row.tgname = 'notification_deliveries_maintain'
      )
    )
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled = 'O'
      and trigger_row.tgtype = 23
  ),
  3::bigint,
  'DB-owned INSERT and UPDATE triggers are attached to all lifecycle tables'
);

-- Delete actions and deferred audit ownership are verified from the live
-- catalog, then exercised again by the account-deletion fixture below.
select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'private.push_device_consents'::regclass
      and constraint_row.conname = 'push_device_consents_profile_id_fkey'
      and constraint_row.confrelid = 'public.profiles'::regclass
      and constraint_row.confdeltype = 'c'
  ),
  'consent ownership cascades from profile deletion'
);
select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'private.push_endpoint_registry'::regclass
      and constraint_row.conname = 'push_endpoint_registry_owner_profile_id_fkey'
      and constraint_row.confrelid = 'public.profiles'::regclass
      and constraint_row.confdeltype = 'n'
  ),
  'endpoint owner deletion uses SET NULL for deny conversion'
);
select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'private.notification_runtime_canary_profiles'::regclass
      and constraint_row.conname = 'notification_runtime_canary_profiles_profile_id_fkey'
      and constraint_row.confrelid = 'public.profiles'::regclass
      and constraint_row.confdeltype = 'c'
  ),
  'canary membership cascades from profile deletion'
);
select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'private.notification_deliveries'::regclass
      and constraint_row.conname = 'notification_deliveries_outbox_recipient_fkey'
      and constraint_row.confrelid = 'public.notification_outbox'::regclass
      and constraint_row.confdeltype = 'c'
      and not constraint_row.condeferrable
  ),
  'delivery ownership uses an immediate composite outbox cascade FK'
);
select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'private.notification_deliveries'::regclass
      and constraint_row.conname = 'notification_deliveries_consent_recipient_fkey'
      and constraint_row.confrelid = 'private.push_device_consents'::regclass
      and constraint_row.confdeltype = 'a'
      and constraint_row.condeferrable
      and constraint_row.condeferred
  ),
  'delivery audit uses a deferred initially-deferred composite consent NO ACTION FK'
);
select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'private.notification_deliveries'::regclass
      and constraint_row.conname = 'notification_deliveries_event_consent_epoch_key'
      and constraint_row.contype = 'u'
  )
    and exists (
      select 1
      from pg_class index_row
      join pg_index index_meta on index_meta.indexrelid = index_row.oid
      where index_row.relnamespace = 'private'::regnamespace
        and index_row.relname = 'notification_deliveries_claim_token_idx'
        and index_meta.indisunique
        and index_meta.indpred is not null
    ),
  'delivery event identity and non-null claim tokens are unique'
);

-- Runtime control starts fail-closed for v2 and carries no guessed limits.
select is(
  (select count(*)::bigint from private.notification_runtime_control),
  1::bigint,
  'runtime control contains exactly one singleton row'
);
select ok(
  (
    select control_row.singleton_id = 1
      and control_row.worker_generation = 1
      and control_row.dispatch_enabled
      and control_row.new_runtime_mode = 'disabled'
      and control_row.legacy_writes_enabled
      and not control_row.legacy_outbox_handled
    from private.notification_runtime_control control_row
  ),
  'runtime control records the exact legacy-compatible initial state'
);
select ok(
  (
    select control_row.legacy_cutoff_at is null
      and control_row.worker_lease_duration is null
      and control_row.request_deadline_duration is null
      and control_row.delivery_lease_duration is null
      and control_row.max_delivery_attempts is null
      and control_row.push_ttl_safety_budget is null
    from private.notification_runtime_control control_row
  ),
  'runtime control leaves every unverified deadline and limit NULL'
);
select throws_ok(
  $$update private.notification_runtime_control set new_runtime_mode = 'invalid' where singleton_id = 1$$,
  '23514',
  null,
  'runtime control rejects an unknown mode'
);
select throws_ok(
  $$update private.notification_runtime_control set new_runtime_mode = 'canary' where singleton_id = 1$$,
  '23514',
  null,
  'runtime control rejects canary mode while required limits remain unknown'
);
select throws_ok(
  $$insert into private.notification_runtime_control (singleton_id) values (2)$$,
  '23514',
  null,
  'runtime control rejects a second singleton identity'
);

-- Worker state/result pairs and hard-lease timing are fail-closed.
select lives_ok(
  $$
    insert into private.notification_dispatch_workers (generation, state, lease_until)
    values (1, 'running', statement_timestamp() + interval '1 hour')
  $$,
  'a running worker has no terminal fields'
);
select lives_ok(
  $$
    insert into private.notification_dispatch_workers (
      generation, state, started_at, lease_until, finished_at, result_code
    )
    values (
      1, 'completed', statement_timestamp() - interval '2 hours',
      statement_timestamp() + interval '1 hour',
      statement_timestamp() - interval '1 hour', 'normal_exit'
    )
  $$,
  'a completed worker accepts only its fixed result code'
);
select lives_ok(
  $$
    insert into private.notification_dispatch_workers (
      generation, state, started_at, lease_until, finished_at, result_code
    )
    values (
      1, 'failed', statement_timestamp() - interval '2 hours',
      statement_timestamp() + interval '1 hour',
      statement_timestamp() - interval '1 hour', 'controlled_failure'
    )
  $$,
  'a failed worker accepts only its fixed result code'
);
select lives_ok(
  $$
    insert into private.notification_dispatch_workers (
      generation, state, started_at, lease_until, finished_at, result_code
    )
    values (
      1, 'expired', statement_timestamp() - interval '2 hours',
      statement_timestamp() - interval '1 hour',
      statement_timestamp(), 'hard_deadline_elapsed'
    )
  $$,
  'an expired worker finishes no earlier than its hard lease'
);
select is(
  (
    select string_agg(
      worker_row.state || ':' || coalesce(worker_row.result_code, 'NULL'),
      ',' order by worker_row.state
    )
    from private.notification_dispatch_workers worker_row
  ),
  'completed:normal_exit,expired:hard_deadline_elapsed,failed:controlled_failure,running:NULL',
  'worker ledger preserves the exact four state/result mappings'
);
select throws_ok(
  $$
    insert into private.notification_dispatch_workers (generation, state, lease_until)
    values (1, 'stuck', statement_timestamp() + interval '1 hour')
  $$,
  '23514',
  null,
  'worker ledger rejects an unknown state'
);
select throws_ok(
  $$
    insert into private.notification_dispatch_workers (
      generation, state, lease_until, finished_at, result_code
    )
    values (
      1, 'running', statement_timestamp() + interval '1 hour',
      statement_timestamp(), 'normal_exit'
    )
  $$,
  '23514',
  null,
  'running workers reject terminal fields'
);
select throws_ok(
  $$
    insert into private.notification_dispatch_workers (
      generation, state, lease_until, finished_at, result_code
    )
    values (
      1, 'completed', statement_timestamp() + interval '1 hour',
      statement_timestamp(), 'controlled_failure'
    )
  $$,
  '23514',
  null,
  'completed workers reject a mismatched result code'
);
select is(
  (select count(*)::bigint from private.notification_runtime_canary_profiles),
  0::bigint,
  'the canary allowlist starts empty'
);

-- Real users and profiles are used so every delete action below executes the
-- production FK path rather than a simplified temporary-table copy.
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
    '00000000-0000-0000-0000-00000000a401',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'fa03-private-owner@example.test',
    'test',
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000a402',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'fa03-private-other@example.test',
    'test',
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  );

insert into public.profiles (user_id, nickname, ntrp)
values
  ('00000000-0000-0000-0000-00000000a401', 'FA03 Private Owner', 3.5),
  ('00000000-0000-0000-0000-00000000a402', 'FA03 Private Other', 3.5);

select set_config(
  'pgtap.fa03_private_owner_profile_id',
  (
    select profile_row.id::text
    from public.profiles profile_row
    where profile_row.user_id = '00000000-0000-0000-0000-00000000a401'
  ),
  true
);
select set_config(
  'pgtap.fa03_private_other_profile_id',
  (
    select profile_row.id::text
    from public.profiles profile_row
    where profile_row.user_id = '00000000-0000-0000-0000-00000000a402'
  ),
  true
);

with inserted_session as (
  insert into public.sessions (
    sport_id, host_profile_id, court_id, play_type, start_at, slots_total, notes
  )
  select
    sport_row.id,
    current_setting('pgtap.fa03_private_owner_profile_id')::bigint,
    court_row.id,
    '雙打',
    date_trunc('minute', now()) + interval '21 days',
    3,
    '__fa03_private_foundation__'
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
  'pgtap.fa03_private_session_id',
  (select inserted_session.id::text from inserted_session),
  true
);

insert into public.session_participants (session_id, profile_id, role, status)
values (
  current_setting('pgtap.fa03_private_session_id')::bigint,
  current_setting('pgtap.fa03_private_owner_profile_id')::bigint,
  'host',
  'accepted'
);
set constraints all immediate;
set constraints all deferred;

insert into private.notification_runtime_canary_profiles (profile_id)
values (current_setting('pgtap.fa03_private_owner_profile_id')::bigint);

select throws_ok(
  format(
    $sql$
      insert into private.push_device_consents (
        profile_id, device_id, state, reason_code, cleanup_token_hash
      )
      values (%s, %L, 'paused', 'user_logout', decode(repeat('11', 32), 'hex'))
    $sql$,
    current_setting('pgtap.fa03_private_owner_profile_id')::bigint,
    '10000000-0000-4000-8000-000000000001'
  ),
  'P0001',
  'PUSH_CONSENT_MUST_START_ENABLED',
  'consent INSERT must start enabled'
);

with inserted_consent as (
  insert into private.push_device_consents (
    profile_id,
    device_id,
    state,
    reason_code,
    consent_epoch,
    version,
    cleanup_token_hash,
    cleanup_token_rotated_at,
    cleanup_token_revoked_at,
    created_at,
    updated_at,
    state_changed_at
  )
  values (
    current_setting('pgtap.fa03_private_owner_profile_id')::bigint,
    '10000000-0000-4000-8000-000000000001',
    'enabled',
    'user_enabled',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    999,
    decode(repeat('11', 32), 'hex'),
    '2000-01-01 00:00:00+00',
    '2000-01-01 00:00:00+00',
    '2000-01-01 00:00:00+00',
    '2000-01-01 00:00:00+00',
    '2000-01-01 00:00:00+00'
  )
  returning id
)
select set_config(
  'pgtap.fa03_private_consent_id',
  (select inserted_consent.id::text from inserted_consent),
  true
);
select set_config(
  'pgtap.fa03_private_initial_epoch',
  (
    select consent_row.consent_epoch::text
    from private.push_device_consents consent_row
    where consent_row.id = current_setting('pgtap.fa03_private_consent_id')::bigint
  ),
  true
);

select ok(
  (
    select consent_row.state = 'enabled'
      and consent_row.reason_code = 'user_enabled'
      and consent_row.consent_epoch <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and consent_row.version = 1
      and consent_row.cleanup_token_hash_algorithm = 'sha256-cleanup-token-32-v1'
      and consent_row.cleanup_token_hash = decode(repeat('11', 32), 'hex')
      and consent_row.cleanup_token_revoked_at is null
    from private.push_device_consents consent_row
    where consent_row.id = current_setting('pgtap.fa03_private_consent_id')::bigint
  ),
  'consent INSERT forces enabled state metadata, a fresh epoch, and version one'
);
select ok(
  (
    select consent_row.created_at = consent_row.updated_at
      and consent_row.created_at = consent_row.state_changed_at
      and consent_row.created_at = consent_row.cleanup_token_rotated_at
      and consent_row.created_at > '2001-01-01 00:00:00+00'
    from private.push_device_consents consent_row
    where consent_row.id = current_setting('pgtap.fa03_private_consent_id')::bigint
  ),
  'consent INSERT overwrites all caller-supplied lifecycle timestamps'
);
update private.push_device_consents
set version = 999,
    created_at = '2000-01-01 00:00:00+00',
    updated_at = '2000-01-01 00:00:00+00',
    state_changed_at = '2000-01-01 00:00:00+00'
where id = current_setting('pgtap.fa03_private_consent_id')::bigint;
select is(
  (
    select consent_row.version
    from private.push_device_consents consent_row
    where consent_row.id = current_setting('pgtap.fa03_private_consent_id')::bigint
  ),
  1::bigint,
  'a no-op consent UPDATE cannot forge the DB-owned version'
);
select throws_ok(
  format(
    'update private.push_device_consents set device_id = %L where id = %s',
    '10000000-0000-4000-8000-000000000002',
    current_setting('pgtap.fa03_private_consent_id')::bigint
  ),
  'P0001',
  'PUSH_CONSENT_IDENTITY_IMMUTABLE',
  'consent device identity cannot change'
);
select throws_ok(
  format(
    'update private.push_device_consents set cleanup_token_hash_algorithm = %L where id = %s',
    'other-hash',
    current_setting('pgtap.fa03_private_consent_id')::bigint
  ),
  'P0001',
  'PUSH_CLEANUP_HASH_ALGORITHM_IMMUTABLE',
  'consent cleanup hash algorithm cannot change'
);
select throws_ok(
  format(
    $sql$
      update private.push_device_consents
      set cleanup_token_hash = decode(repeat('22', 32), 'hex')
      where id = %s
    $sql$,
    current_setting('pgtap.fa03_private_consent_id')::bigint
  ),
  'P0001',
  'PUSH_ENABLED_CONSENT_CANNOT_ROTATE',
  'an already-enabled consent cannot rotate its token'
);

update private.push_device_consents
set state = 'paused', reason_code = 'user_logout'
where id = current_setting('pgtap.fa03_private_consent_id')::bigint;
select ok(
  (
    select consent_row.version = 2
      and consent_row.state = 'paused'
      and consent_row.reason_code = 'user_logout'
      and consent_row.consent_epoch = current_setting('pgtap.fa03_private_initial_epoch')::uuid
      and consent_row.cleanup_token_hash = decode(repeat('11', 32), 'hex')
    from private.push_device_consents consent_row
    where consent_row.id = current_setting('pgtap.fa03_private_consent_id')::bigint
  ),
  'pause increments once without rotating epoch or cleanup hash'
);
select throws_ok(
  format(
    $sql$
      update private.push_device_consents
      set cleanup_token_hash = decode(repeat('22', 32), 'hex')
      where id = %s
    $sql$,
    current_setting('pgtap.fa03_private_consent_id')::bigint
  ),
  'P0001',
  'PUSH_PAUSE_CANNOT_ROTATE_CONSENT',
  'paused consent cannot rotate its cleanup token'
);
select throws_ok(
  format(
    $sql$
      update private.push_device_consents
      set state = 'enabled', reason_code = 'user_enabled'
      where id = %s
    $sql$,
    current_setting('pgtap.fa03_private_consent_id')::bigint
  ),
  'P0001',
  'PUSH_REENABLE_MUST_ROTATE_CONSENT',
  're-enable requires a new cleanup hash'
);

update private.push_device_consents
set state = 'enabled',
    reason_code = 'user_enabled',
    cleanup_token_hash = decode(repeat('22', 32), 'hex')
where id = current_setting('pgtap.fa03_private_consent_id')::bigint;
select set_config(
  'pgtap.fa03_private_second_epoch',
  (
    select consent_row.consent_epoch::text
    from private.push_device_consents consent_row
    where consent_row.id = current_setting('pgtap.fa03_private_consent_id')::bigint
  ),
  true
);
select ok(
  (
    select consent_row.version = 3
      and consent_row.consent_epoch <> current_setting('pgtap.fa03_private_initial_epoch')::uuid
      and consent_row.cleanup_token_hash = decode(repeat('22', 32), 'hex')
    from private.push_device_consents consent_row
    where consent_row.id = current_setting('pgtap.fa03_private_consent_id')::bigint
  ),
  're-enable accepts only a new hash and generates a fresh epoch in the DB'
);

update private.push_device_consents
set state = 'revoked', reason_code = 'user_disabled', cleanup_token_hash = null
where id = current_setting('pgtap.fa03_private_consent_id')::bigint;
select ok(
  (
    select consent_row.version = 4
      and consent_row.state = 'revoked'
      and consent_row.reason_code = 'user_disabled'
      and consent_row.consent_epoch = current_setting('pgtap.fa03_private_second_epoch')::uuid
      and consent_row.cleanup_token_hash is null
      and consent_row.cleanup_token_revoked_at is not null
    from private.push_device_consents consent_row
    where consent_row.id = current_setting('pgtap.fa03_private_consent_id')::bigint
  ),
  'revoke preserves epoch, clears the hash, and records revocation at version four'
);
select throws_ok(
  format(
    $sql$
      update private.push_device_consents
      set state = 'paused', reason_code = 'user_logout'
      where id = %s
    $sql$,
    current_setting('pgtap.fa03_private_consent_id')::bigint
  ),
  'P0001',
  'PUSH_REVOKED_CONSENT_CANNOT_PAUSE',
  'a revoked consent cannot move to paused'
);

update private.push_device_consents
set state = 'enabled',
    reason_code = 'user_enabled',
    cleanup_token_hash = decode(repeat('33', 32), 'hex')
where id = current_setting('pgtap.fa03_private_consent_id')::bigint;
select ok(
  (
    select consent_row.version = 5
      and consent_row.consent_epoch <> current_setting('pgtap.fa03_private_second_epoch')::uuid
      and consent_row.cleanup_token_hash = decode(repeat('33', 32), 'hex')
      and consent_row.cleanup_token_revoked_at is null
    from private.push_device_consents consent_row
    where consent_row.id = current_setting('pgtap.fa03_private_consent_id')::bigint
  ),
  're-enable after revoke rotates epoch/hash and clears the revoked timestamp'
);

select throws_ok(
  $$
    insert into private.push_endpoint_registry (
      endpoint_fingerprint, owner_profile_id, state, reason_code
    )
    values (decode(repeat('dd', 32), 'hex'), null, 'deny', 'owner_deleted')
  $$,
  'P0001',
  'PUSH_ENDPOINT_DENY_REQUIRES_OWNER_DELETE',
  'a deny fingerprint cannot be inserted directly'
);

insert into private.push_endpoint_registry (
  endpoint_fingerprint,
  owner_profile_id,
  state,
  reason_code,
  version,
  created_at,
  updated_at,
  state_changed_at
)
values (
  pg_catalog.sha256(convert_to('https://push.example.test/fa03-private', 'UTF8')),
  current_setting('pgtap.fa03_private_owner_profile_id')::bigint,
  'active',
  'transport_active',
  999,
  '2000-01-01 00:00:00+00',
  '2000-01-01 00:00:00+00',
  '2000-01-01 00:00:00+00'
);
select set_config(
  'pgtap.fa03_private_fingerprint_hex',
  encode(
    pg_catalog.sha256(convert_to('https://push.example.test/fa03-private', 'UTF8')),
    'hex'
  ),
  true
);
select ok(
  (
    select registry_row.owner_profile_id = current_setting('pgtap.fa03_private_owner_profile_id')::bigint
      and registry_row.state = 'active'
      and registry_row.reason_code = 'transport_active'
      and registry_row.version = 1
      and registry_row.created_at = registry_row.updated_at
      and registry_row.created_at = registry_row.state_changed_at
      and registry_row.created_at > '2001-01-01 00:00:00+00'
    from private.push_endpoint_registry registry_row
    where registry_row.endpoint_fingerprint = decode(
      current_setting('pgtap.fa03_private_fingerprint_hex'), 'hex'
    )
  ),
  'registry INSERT forces version one and overwrites all lifecycle timestamps'
);
update private.push_endpoint_registry
set version = 999,
    created_at = '2000-01-01 00:00:00+00',
    updated_at = '2000-01-01 00:00:00+00',
    state_changed_at = '2000-01-01 00:00:00+00'
where endpoint_fingerprint = decode(current_setting('pgtap.fa03_private_fingerprint_hex'), 'hex');
select is(
  (
    select registry_row.version
    from private.push_endpoint_registry registry_row
    where registry_row.endpoint_fingerprint = decode(
      current_setting('pgtap.fa03_private_fingerprint_hex'), 'hex'
    )
  ),
  1::bigint,
  'a no-op registry UPDATE cannot forge the DB-owned version'
);
update private.push_endpoint_registry
set state = 'quarantined', reason_code = 'consent_paused'
where endpoint_fingerprint = decode(current_setting('pgtap.fa03_private_fingerprint_hex'), 'hex');
select is(
  (
    select registry_row.version
    from private.push_endpoint_registry registry_row
    where registry_row.endpoint_fingerprint = decode(
      current_setting('pgtap.fa03_private_fingerprint_hex'), 'hex'
    )
  ),
  2::bigint,
  'registry quarantine increments its semantic version once'
);
update private.push_endpoint_registry
set state = 'active', reason_code = 'transport_active'
where endpoint_fingerprint = decode(current_setting('pgtap.fa03_private_fingerprint_hex'), 'hex');
select is(
  (
    select registry_row.version
    from private.push_endpoint_registry registry_row
    where registry_row.endpoint_fingerprint = decode(
      current_setting('pgtap.fa03_private_fingerprint_hex'), 'hex'
    )
  ),
  3::bigint,
  'registry reactivation increments its semantic version once'
);
select throws_ok(
  format(
    $sql$
      update private.push_endpoint_registry
      set owner_profile_id = %s
      where endpoint_fingerprint = decode(%L, 'hex')
    $sql$,
    current_setting('pgtap.fa03_private_other_profile_id')::bigint,
    current_setting('pgtap.fa03_private_fingerprint_hex')
  ),
  'P0001',
  'PUSH_ENDPOINT_OWNER_TRANSFER_FORBIDDEN',
  'registry owner cannot transfer directly to another account'
);
select throws_ok(
  format(
    $sql$
      update private.push_endpoint_registry
      set endpoint_fingerprint = decode(repeat('ee', 32), 'hex')
      where endpoint_fingerprint = decode(%L, 'hex')
    $sql$,
    current_setting('pgtap.fa03_private_fingerprint_hex')
  ),
  'P0001',
  'PUSH_ENDPOINT_FINGERPRINT_IMMUTABLE',
  'registry fingerprint identity cannot change'
);

insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
values (
  current_setting('pgtap.fa03_private_owner_profile_id')::bigint,
  'https://push.example.test/fa03-private',
  'fa03-p256dh',
  'fa03-auth'
);

create function pg_temp.create_private_outbox(p_recipient_profile_id bigint)
returns bigint
language plpgsql
as $$
declare
  created_outbox_id bigint;
begin
  insert into public.notification_outbox (
    event_type, recipient_profile_id, session_id, payload
  )
  values (
    'session_updated',
    p_recipient_profile_id,
    current_setting('pgtap.fa03_private_session_id')::bigint,
    '{"message":"FA03 private fixture"}'::jsonb
  )
  returning id into created_outbox_id;

  return created_outbox_id;
end;
$$;

select set_config(
  'pgtap.fa03_private_outbox_main',
  pg_temp.create_private_outbox(
    current_setting('pgtap.fa03_private_owner_profile_id')::bigint
  )::text,
  true
);
select set_config(
  'pgtap.fa03_private_outbox_cancelled',
  pg_temp.create_private_outbox(
    current_setting('pgtap.fa03_private_owner_profile_id')::bigint
  )::text,
  true
);
select set_config(
  'pgtap.fa03_private_outbox_failed',
  pg_temp.create_private_outbox(
    current_setting('pgtap.fa03_private_owner_profile_id')::bigint
  )::text,
  true
);
select set_config(
  'pgtap.fa03_private_outbox_bad_outbox_owner',
  pg_temp.create_private_outbox(
    current_setting('pgtap.fa03_private_owner_profile_id')::bigint
  )::text,
  true
);
select set_config(
  'pgtap.fa03_private_outbox_bad_consent_owner',
  pg_temp.create_private_outbox(
    current_setting('pgtap.fa03_private_other_profile_id')::bigint
  )::text,
  true
);

select throws_ok(
  format(
    $sql$
      insert into private.notification_deliveries (
        outbox_id, recipient_profile_id, consent_id, consent_epoch,
        state, attempts, claimed_at
      )
      select %s, %s, consent_row.id, consent_row.consent_epoch,
        'accepted', 1, statement_timestamp()
      from private.push_device_consents consent_row
      where consent_row.id = %s
    $sql$,
    current_setting('pgtap.fa03_private_outbox_main')::bigint,
    current_setting('pgtap.fa03_private_owner_profile_id')::bigint,
    current_setting('pgtap.fa03_private_consent_id')::bigint
  ),
  'P0001',
  'NOTIFICATION_DELIVERY_MUST_START_PENDING',
  'delivery INSERT must start as untouched pending'
);

with inserted_delivery as (
  insert into private.notification_deliveries (
    outbox_id,
    recipient_profile_id,
    consent_id,
    consent_epoch,
    notification_id,
    created_at,
    updated_at,
    state_changed_at
  )
  select
    current_setting('pgtap.fa03_private_outbox_main')::bigint,
    current_setting('pgtap.fa03_private_owner_profile_id')::bigint,
    consent_row.id,
    consent_row.consent_epoch,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '2000-01-01 00:00:00+00',
    '2000-01-01 00:00:00+00',
    '2000-01-01 00:00:00+00'
  from private.push_device_consents consent_row
  where consent_row.id = current_setting('pgtap.fa03_private_consent_id')::bigint
  returning id
)
select set_config(
  'pgtap.fa03_private_delivery_main',
  (select inserted_delivery.id::text from inserted_delivery),
  true
);
select ok(
  (
    select delivery_row.state = 'pending'
      and delivery_row.attempts = 0
      and delivery_row.notification_id <> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      and delivery_row.claim_token is null
      and delivery_row.claimed_at is null
      and delivery_row.lease_until is null
      and delivery_row.next_attempt_at is null
      and delivery_row.error_code is null
      and delivery_row.created_at = delivery_row.updated_at
      and delivery_row.created_at = delivery_row.state_changed_at
      and delivery_row.created_at > '2001-01-01 00:00:00+00'
    from private.notification_deliveries delivery_row
    where delivery_row.id = current_setting('pgtap.fa03_private_delivery_main')::bigint
  ),
  'delivery INSERT generates identity/timestamps and starts in pristine pending state'
);
select throws_ok(
  format(
    'update private.notification_deliveries set state = %L, attempts = 1 where id = %s',
    'processing',
    current_setting('pgtap.fa03_private_delivery_main')::bigint
  ),
  '23514',
  null,
  'processing delivery requires claim identity and lease timestamps'
);
select throws_ok(
  format(
    'update private.notification_deliveries set notification_id = %L where id = %s',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    current_setting('pgtap.fa03_private_delivery_main')::bigint
  ),
  'P0001',
  'NOTIFICATION_DELIVERY_IDENTITY_IMMUTABLE',
  'delivery notification identity cannot change'
);

update private.notification_deliveries
set state = 'processing',
    attempts = 1,
    claim_token = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    claimed_at = statement_timestamp(),
    lease_until = statement_timestamp() + interval '1 hour'
where id = current_setting('pgtap.fa03_private_delivery_main')::bigint;
select ok(
  (
    select delivery_row.state = 'processing'
      and delivery_row.attempts = 1
      and delivery_row.claim_token is not null
      and delivery_row.claimed_at is not null
      and delivery_row.lease_until > delivery_row.claimed_at
    from private.notification_deliveries delivery_row
    where delivery_row.id = current_setting('pgtap.fa03_private_delivery_main')::bigint
  ),
  'delivery accepts a complete processing claim shape'
);
update private.notification_deliveries
set state = 'unknown',
    claim_token = null,
    lease_until = null,
    next_attempt_at = statement_timestamp() + interval '2 hours',
    error_code = 'adapter_outcome_unknown'
where id = current_setting('pgtap.fa03_private_delivery_main')::bigint;
select ok(
  (
    select delivery_row.state = 'unknown'
      and delivery_row.claim_token is null
      and delivery_row.next_attempt_at is not null
      and delivery_row.error_code = 'adapter_outcome_unknown'
    from private.notification_deliveries delivery_row
    where delivery_row.id = current_setting('pgtap.fa03_private_delivery_main')::bigint
  ),
  'delivery accepts the fixed unknown-outcome shape'
);
update private.notification_deliveries
set state = 'pending',
    next_attempt_at = statement_timestamp() + interval '2 hours',
    error_code = 'provider_transient'
where id = current_setting('pgtap.fa03_private_delivery_main')::bigint;
select ok(
  (
    select delivery_row.state = 'pending'
      and delivery_row.attempts = 1
      and delivery_row.claimed_at is not null
      and delivery_row.next_attempt_at is not null
      and delivery_row.error_code = 'provider_transient'
    from private.notification_deliveries delivery_row
    where delivery_row.id = current_setting('pgtap.fa03_private_delivery_main')::bigint
  ),
  'delivery accepts only an evidenced retry-pending shape'
);
update private.notification_deliveries
set state = 'processing',
    claim_token = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    claimed_at = statement_timestamp(),
    lease_until = statement_timestamp() + interval '1 hour',
    next_attempt_at = null,
    error_code = null
where id = current_setting('pgtap.fa03_private_delivery_main')::bigint;
update private.notification_deliveries
set state = 'accepted', claim_token = null, lease_until = null
where id = current_setting('pgtap.fa03_private_delivery_main')::bigint;
select is(
  (
    select delivery_row.state
    from private.notification_deliveries delivery_row
    where delivery_row.id = current_setting('pgtap.fa03_private_delivery_main')::bigint
  ),
  'accepted',
  'delivery accepts an evidence-complete accepted terminal shape'
);
select throws_ok(
  format(
    'update private.notification_deliveries set attempts = attempts + 1 where id = %s',
    current_setting('pgtap.fa03_private_delivery_main')::bigint
  ),
  'P0001',
  'NOTIFICATION_DELIVERY_TERMINAL',
  'terminal delivery rows cannot change'
);

insert into private.notification_deliveries (
  outbox_id, recipient_profile_id, consent_id, consent_epoch
)
select
  current_setting('pgtap.fa03_private_outbox_cancelled')::bigint,
  current_setting('pgtap.fa03_private_owner_profile_id')::bigint,
  consent_row.id,
  consent_row.consent_epoch
from private.push_device_consents consent_row
where consent_row.id = current_setting('pgtap.fa03_private_consent_id')::bigint;
update private.notification_deliveries delivery_row
set state = 'cancelled', error_code = 'event_expired'
where delivery_row.outbox_id = current_setting('pgtap.fa03_private_outbox_cancelled')::bigint;
select is(
  (
    select count(*)::bigint
    from private.notification_deliveries delivery_row
    where delivery_row.outbox_id = current_setting('pgtap.fa03_private_outbox_cancelled')::bigint
      and delivery_row.state = 'cancelled'
      and delivery_row.error_code = 'event_expired'
  ),
  1::bigint,
  'delivery accepts a fixed-code cancelled terminal shape'
);

insert into private.notification_deliveries (
  outbox_id, recipient_profile_id, consent_id, consent_epoch
)
select
  current_setting('pgtap.fa03_private_outbox_failed')::bigint,
  current_setting('pgtap.fa03_private_owner_profile_id')::bigint,
  consent_row.id,
  consent_row.consent_epoch
from private.push_device_consents consent_row
where consent_row.id = current_setting('pgtap.fa03_private_consent_id')::bigint;
update private.notification_deliveries delivery_row
set state = 'failed',
    attempts = 1,
    claimed_at = statement_timestamp(),
    error_code = 'payload_invalid'
where delivery_row.outbox_id = current_setting('pgtap.fa03_private_outbox_failed')::bigint;
select is(
  (
    select count(*)::bigint
    from private.notification_deliveries delivery_row
    where delivery_row.outbox_id = current_setting('pgtap.fa03_private_outbox_failed')::bigint
      and delivery_row.state = 'failed'
      and delivery_row.error_code = 'payload_invalid'
  ),
  1::bigint,
  'delivery accepts a fixed-code failed terminal shape'
);

select throws_ok(
  format(
    $sql$
      insert into private.notification_deliveries (
        outbox_id, recipient_profile_id, consent_id, consent_epoch
      )
      select %s, %s, consent_row.id, consent_row.consent_epoch
      from private.push_device_consents consent_row
      where consent_row.id = %s
    $sql$,
    current_setting('pgtap.fa03_private_outbox_bad_outbox_owner')::bigint,
    current_setting('pgtap.fa03_private_other_profile_id')::bigint,
    current_setting('pgtap.fa03_private_consent_id')::bigint
  ),
  '23503',
  null,
  'delivery immediate FK rejects an outbox recipient mismatch'
);

create function pg_temp.insert_bad_consent_owner_and_force_fk()
returns void
language plpgsql
as $$
begin
  insert into private.notification_deliveries (
    outbox_id, recipient_profile_id, consent_id, consent_epoch
  )
  select
    current_setting('pgtap.fa03_private_outbox_bad_consent_owner')::bigint,
    current_setting('pgtap.fa03_private_other_profile_id')::bigint,
    consent_row.id,
    consent_row.consent_epoch
  from private.push_device_consents consent_row
  where consent_row.id = current_setting('pgtap.fa03_private_consent_id')::bigint;

  set constraints private.notification_deliveries_consent_recipient_fkey immediate;
end;
$$;
select throws_ok(
  $$select pg_temp.insert_bad_consent_owner_and_force_fk()$$,
  '23503',
  null,
  'delivery deferred FK rejects a consent recipient mismatch'
);
set constraints private.notification_deliveries_consent_recipient_fkey deferred;

create function pg_temp.delete_consent_and_force_audit_fk()
returns void
language plpgsql
as $$
begin
  delete from private.push_device_consents
  where id = current_setting('pgtap.fa03_private_consent_id')::bigint;

  set constraints private.notification_deliveries_consent_recipient_fkey immediate;
end;
$$;
select throws_ok(
  $$select pg_temp.delete_consent_and_force_audit_fk()$$,
  '23503',
  null,
  'ordinary consent deletion is blocked while delivery audit rows remain'
);
set constraints private.notification_deliveries_consent_recipient_fkey deferred;
select is(
  (
    select count(*)::bigint
    from private.push_device_consents consent_row
    where consent_row.id = current_setting('pgtap.fa03_private_consent_id')::bigint
  ),
  1::bigint,
  'the rejected ordinary delete leaves consent intact'
);

-- Deleting the auth owner removes every sensitive Push row in the same
-- transaction. The outbox cascade clears delivery first, allowing the
-- deferred consent audit FK to settle without blocking account deletion.
select lives_ok(
  $$delete from auth.users where id = '00000000-0000-0000-0000-00000000a401'$$,
  'auth user deletion queues the complete Push cascade'
);
select lives_ok(
  $$set constraints all immediate$$,
  'the complete Push cascade satisfies all deferred audit and session invariants'
);
select is(
  (
    select count(*)::bigint
    from auth.users user_row
    where user_row.id = '00000000-0000-0000-0000-00000000a401'
  ),
  0::bigint,
  'account deletion removes the auth user'
);
select is(
  (
    select count(*)::bigint
    from public.profiles profile_row
    where profile_row.id = current_setting('pgtap.fa03_private_owner_profile_id')::bigint
  ),
  0::bigint,
  'account deletion removes the profile'
);
select is(
  (
    select count(*)::bigint
    from private.push_device_consents consent_row
    where consent_row.id = current_setting('pgtap.fa03_private_consent_id')::bigint
  ),
  0::bigint,
  'account deletion removes consent, device ID, cleanup hash, and epoch'
);
select is(
  (
    select count(*)::bigint
    from public.push_subscriptions subscription_row
    where subscription_row.endpoint = 'https://push.example.test/fa03-private'
  ),
  0::bigint,
  'account deletion removes the raw endpoint and subscription keys'
);
select is(
  (
    select count(*)::bigint
    from public.notification_outbox outbox_row
    where outbox_row.session_id = current_setting('pgtap.fa03_private_session_id')::bigint
  ),
  0::bigint,
  'account deletion removes every fixture outbox and payload'
);
select is(
  (
    select count(*)::bigint
    from private.notification_deliveries delivery_row
    where delivery_row.consent_id = current_setting('pgtap.fa03_private_consent_id')::bigint
  ),
  0::bigint,
  'account deletion removes all per-device delivery audit rows'
);
select is(
  (
    select count(*)::bigint
    from private.notification_runtime_canary_profiles canary_row
    where canary_row.profile_id = current_setting('pgtap.fa03_private_owner_profile_id')::bigint
  ),
  0::bigint,
  'account deletion removes canary allowlist membership'
);
select is(
  (
    select count(*)::bigint
    from public.sessions session_row
    where session_row.id = current_setting('pgtap.fa03_private_session_id')::bigint
  ),
  0::bigint,
  'account deletion removes the owned session'
);
select ok(
  (
    select registry_row.owner_profile_id is null
      and registry_row.state = 'deny'
      and registry_row.reason_code = 'owner_deleted'
      and registry_row.version = 4
    from private.push_endpoint_registry registry_row
    where registry_row.endpoint_fingerprint = decode(
      current_setting('pgtap.fa03_private_fingerprint_hex'), 'hex'
    )
  ),
  'the fingerprint is the only fixture Push row retained, as ownerless deny'
);
select ok(
  (
    select registry_row.created_at is null
      and registry_row.updated_at is null
      and registry_row.state_changed_at is null
    from private.push_endpoint_registry registry_row
    where registry_row.endpoint_fingerprint = decode(
      current_setting('pgtap.fa03_private_fingerprint_hex'), 'hex'
    )
  ),
  'ownerless deny retains none of the three lifecycle timestamps'
);
select throws_ok(
  format(
    $sql$
      update private.push_endpoint_registry
      set owner_profile_id = %s, state = 'active', reason_code = 'transport_active'
      where endpoint_fingerprint = decode(%L, 'hex')
    $sql$,
    current_setting('pgtap.fa03_private_other_profile_id')::bigint,
    current_setting('pgtap.fa03_private_fingerprint_hex')
  ),
  'P0001',
  'PUSH_ENDPOINT_DENY_IMMUTABLE',
  'ownerless deny cannot be reactivated or transferred'
);

select * from finish();
rollback;
