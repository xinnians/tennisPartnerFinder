begin;

select plan(68);

-- Compatible transport shape and permissions.
select is(
  (
    select string_agg(column_name, ',' order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'push_subscriptions'
  ),
  'id,profile_id,endpoint,p256dh,auth,created_at,consent_id,endpoint_fingerprint_algorithm,endpoint_fingerprint,vapid_fingerprint_algorithm,vapid_fingerprint,transport_version,updated_at',
  'push subscriptions expose the exact compatible transport columns'
);

select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.push_subscriptions'::regclass
      and constraint_row.conname = 'push_subscriptions_transport_shape'
      and constraint_row.contype = 'c'
      and constraint_row.convalidated
  ),
  'transport metadata has a validated all-or-none shape constraint'
);

select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.push_subscriptions'::regclass
      and constraint_row.conname =
        'push_subscriptions_endpoint_fingerprint_exact'
      and constraint_row.contype = 'c'
      and constraint_row.convalidated
  ),
  'active transport fingerprint bytes are checked against the exact endpoint'
);

select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.push_subscriptions'::regclass
      and constraint_row.conname =
        'push_subscriptions_consent_profile_fkey'
      and constraint_row.contype = 'f'
      and constraint_row.confrelid =
        'private.push_device_consents'::regclass
      and constraint_row.confdeltype = 'c'
      and constraint_row.condeferrable
      and constraint_row.condeferred
  ),
  'transport has a deferred same-owner consent FK with cascade cleanup'
);

select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.push_subscriptions'::regclass
      and constraint_row.conname =
        'push_subscriptions_registry_owner_fkey'
      and constraint_row.contype = 'f'
      and constraint_row.confrelid =
        'private.push_endpoint_registry'::regclass
      and constraint_row.confdeltype = 'r'
      and constraint_row.condeferrable
      and constraint_row.condeferred
  ),
  'transport has a deferred same-owner registry FK with restricted release'
);

select ok(
  exists (
    select 1
    from pg_index index_row
    join pg_class class_row on class_row.oid = index_row.indexrelid
    where index_row.indrelid = 'public.push_subscriptions'::regclass
      and class_row.relname = 'push_subscriptions_consent_id_idx'
      and index_row.indisunique
      and index_row.indpred is not null
  ),
  'one consent can own at most one active transport'
);

select ok(
  exists (
    select 1
    from pg_index index_row
    join pg_class class_row on class_row.oid = index_row.indexrelid
    where index_row.indrelid = 'public.push_subscriptions'::regclass
      and class_row.relname =
        'push_subscriptions_endpoint_fingerprint_idx'
      and index_row.indisunique
      and index_row.indpred is not null
  ),
  'active endpoint fingerprints are globally unique'
);

select ok(
  exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.push_subscriptions'::regclass
      and trigger_row.tgname = 'push_subscriptions_maintain_transport'
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled = 'O'
      and trigger_row.tgtype = 23
  ),
  'transport metadata has an INSERT/UPDATE row trigger'
);

select ok(
  (
    select count(*) = 4
    from pg_proc function_row
    join pg_roles owner_role on owner_role.oid = function_row.proowner
    where function_row.oid = any(array[
      to_regprocedure('private.maintain_push_subscription_transport()'),
      to_regprocedure(
        'private.quarantine_locked_push_consent(bigint,uuid,text)'
      ),
      to_regprocedure('public.quarantine_push_device(uuid,uuid,bigint)'),
      to_regprocedure('public.quarantine_push_by_token(text)')
    ])
      and owner_role.rolname = 'postgres'
      and function_row.prosecdef = (
        function_row.pronamespace <> 'private'::regnamespace
        or function_row.proname = 'quarantine_locked_push_consent'
      )
      and coalesce(function_row.proconfig, '{}'::text[])
        @> array['search_path=""']::text[]
  ),
  'transport and quarantine functions use the reviewed owner and empty path'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.push_subscriptions',
    'select,insert,update,delete'
  ),
  'authenticated cannot read or mutate raw push transports'
);

select ok(
  has_table_privilege(
    'service_role',
    'public.push_subscriptions',
    'select,delete'
  )
    and not has_table_privilege(
      'service_role',
      'public.push_subscriptions',
      'insert,update,truncate,references,trigger'
    ),
  'the still-active legacy dispatcher keeps its existing transport access'
);

select ok(
  not has_sequence_privilege(
    'authenticated',
    'public.push_subscriptions_id_seq',
    'usage,select'
  )
    and not has_sequence_privilege(
      'service_role',
      'public.push_subscriptions_id_seq',
      'usage,select'
    ),
  'application roles cannot allocate or inspect raw transport IDs'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.quarantine_push_device(uuid,uuid,bigint)',
    'execute'
  )
    and not has_function_privilege(
      'public',
      'public.quarantine_push_device(uuid,uuid,bigint)',
      'execute'
    )
    and not has_function_privilege(
      'anon',
      'public.quarantine_push_device(uuid,uuid,bigint)',
      'execute'
    )
    and not has_function_privilege(
      'service_role',
      'public.quarantine_push_device(uuid,uuid,bigint)',
      'execute'
    ),
  'only authenticated owners can call owner quarantine'
);

select ok(
  has_function_privilege(
      'service_role',
      'public.quarantine_push_by_token(text)',
      'execute'
    )
    and not has_function_privilege(
      'public',
      'public.quarantine_push_by_token(text)',
      'execute'
    )
    and not has_function_privilege(
      'anon',
      'public.quarantine_push_by_token(text)',
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'public.quarantine_push_by_token(text)',
      'execute'
    ),
  'only the separate cleanup Edge boundary can execute token quarantine'
);

select ok(
  not has_function_privilege(
    'public',
    'private.maintain_push_subscription_transport()',
    'execute'
  )
    and not has_function_privilege(
      'anon',
      'private.quarantine_locked_push_consent(bigint,uuid,text)',
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'private.quarantine_locked_push_consent(bigint,uuid,text)',
      'execute'
    )
    and not has_function_privilege(
      'service_role',
      'private.quarantine_locked_push_consent(bigint,uuid,text)',
      'execute'
    ),
  'trigger and mutation helpers cannot be executed directly by app roles'
);

select is(
  to_regprocedure('public.resume_push_device(uuid)')::text,
  null,
  'no automatic Push resume command exists'
);

-- Actors used by both the legacy shim and v2 quarantine fixtures.
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
    '00000000-0000-0000-0000-00000000b501',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'fa03-quarantine-owner@example.test',
    'test',
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000b502',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'fa03-quarantine-other@example.test',
    'test',
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  );

insert into public.profiles (user_id, nickname, ntrp)
values
  ('00000000-0000-0000-0000-00000000b501', 'Quarantine Owner', 3.5),
  ('00000000-0000-0000-0000-00000000b502', 'Quarantine Other', 4.0);

select set_config(
  'pgtap.fa03_quarantine_owner_profile_id',
  (
    select profile_row.id::text
    from public.profiles profile_row
    where profile_row.user_id =
      '00000000-0000-0000-0000-00000000b501'
  ),
  true
);
select set_config(
  'pgtap.fa03_quarantine_other_profile_id',
  (
    select profile_row.id::text
    from public.profiles profile_row
    where profile_row.user_id =
      '00000000-0000-0000-0000-00000000b502'
  ),
  true
);

-- Existing clients remain compatible only through the two legacy RPCs.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-00000000b501',
  true
);
select is(
  public.save_push_subscription(
    '  https://push.example.test/fa03-legacy  ',
    ' legacy-p256dh ',
    ' legacy-auth '
  ),
  'OK',
  'legacy save RPC remains compatible while the control permits writes'
);
select throws_ok(
  $$select * from public.push_subscriptions$$,
  '42501',
  null,
  'authenticated cannot bypass the legacy RPC to read transports'
);
reset role;

select ok(
  (
    select subscription_row.endpoint =
        'https://push.example.test/fa03-legacy'
      and subscription_row.p256dh = 'legacy-p256dh'
      and subscription_row.auth = 'legacy-auth'
      and subscription_row.consent_id is null
      and subscription_row.endpoint_fingerprint is null
      and subscription_row.transport_version is null
      and subscription_row.updated_at is null
    from public.push_subscriptions subscription_row
    where subscription_row.endpoint =
      'https://push.example.test/fa03-legacy'
  ),
  'legacy RPC writes remain trimmed and cannot forge v2 metadata'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-00000000b501',
  true
);
select is(
  public.save_push_subscription(
    'https://push.example.test/fa03-legacy',
    'legacy-p256dh-updated',
    'legacy-auth-updated'
  ),
  'OK',
  'legacy save RPC can refresh its own legacy row'
);
reset role;

select ok(
  (
    select subscription_row.p256dh = 'legacy-p256dh-updated'
      and subscription_row.auth = 'legacy-auth-updated'
      and subscription_row.consent_id is null
      and subscription_row.transport_version is null
    from public.push_subscriptions subscription_row
    where subscription_row.endpoint =
      'https://push.example.test/fa03-legacy'
  ),
  'legacy refresh stays in legacy mode'
);

update private.notification_runtime_control
set legacy_writes_enabled = false,
    legacy_cutoff_at = statement_timestamp()
where singleton_id = 1;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-00000000b501',
  true
);
select throws_ok(
  $$select public.save_push_subscription(
    'https://push.example.test/fa03-barrier', 'key', 'auth'
  )$$,
  'P0001',
  'PUSH_CLIENT_UPGRADE_REQUIRED',
  'legacy save cannot cross the control cutoff'
);
select throws_ok(
  $$select public.remove_push_subscription(
    'https://push.example.test/fa03-legacy'
  )$$,
  'P0001',
  'PUSH_CLIENT_UPGRADE_REQUIRED',
  'legacy remove cannot cross the control cutoff'
);
reset role;

update private.notification_runtime_control
set legacy_writes_enabled = true,
    legacy_cutoff_at = null
where singleton_id = 1;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-00000000b501',
  true
);
select is(
  public.remove_push_subscription(
    'https://push.example.test/fa03-legacy'
  ),
  'OK',
  'legacy remove RPC remains compatible before the barrier'
);
reset role;

select is(
  (
    select count(*)::bigint
    from public.push_subscriptions subscription_row
    where subscription_row.endpoint =
      'https://push.example.test/fa03-legacy'
  ),
  0::bigint,
  'legacy remove deletes only its legacy row'
);

-- One session supplies durable outbox rows for per-device delivery fixtures.
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
    current_setting('pgtap.fa03_quarantine_owner_profile_id')::bigint,
    court_row.id,
    '雙打',
    date_trunc('minute', now()) + interval '21 days',
    3,
    '__fa03_quarantine_commands__'
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
  'pgtap.fa03_quarantine_session_id',
  (select inserted_session.id::text from inserted_session),
  true
);

insert into public.session_participants (
  session_id,
  profile_id,
  role,
  status
)
values (
  current_setting('pgtap.fa03_quarantine_session_id')::bigint,
  current_setting('pgtap.fa03_quarantine_owner_profile_id')::bigint,
  'host',
  'accepted'
);
set constraints all immediate;
set constraints all deferred;

create function pg_temp.create_quarantine_outbox(
  p_recipient_profile_id bigint
)
returns bigint
language plpgsql
as $$
declare
  created_outbox_id bigint;
begin
  insert into public.notification_outbox (
    event_type,
    recipient_profile_id,
    session_id,
    payload
  )
  values (
    'session_updated',
    p_recipient_profile_id,
    current_setting('pgtap.fa03_quarantine_session_id')::bigint,
    '{"message":"FA03 quarantine fixture"}'::jsonb
  )
  returning id into created_outbox_id;
  return created_outbox_id;
end;
$$;

-- Owner-command fixture: active consent, registry, transport and four states.
with inserted_consent as (
  insert into private.push_device_consents (
    profile_id,
    device_id,
    state,
    reason_code,
    cleanup_token_hash
  )
  values (
    current_setting('pgtap.fa03_quarantine_owner_profile_id')::bigint,
    '20000000-0000-4000-8000-000000000001',
    'enabled',
    'user_enabled',
    pg_catalog.sha256(pg_catalog.decode(repeat('00', 32), 'hex'))
  )
  returning id, consent_epoch, version
)
select
  set_config(
    'pgtap.fa03_quarantine_owner_consent_id',
    inserted_consent.id::text,
    true
  ),
  set_config(
    'pgtap.fa03_quarantine_owner_epoch',
    inserted_consent.consent_epoch::text,
    true
  ),
  set_config(
    'pgtap.fa03_quarantine_owner_version',
    inserted_consent.version::text,
    true
  )
from inserted_consent;

insert into private.push_endpoint_registry (
  endpoint_fingerprint,
  owner_profile_id,
  state,
  reason_code
)
values (
  pg_catalog.sha256(
    pg_catalog.convert_to(
      'https://push.example.test/fa03-owner-v2',
      'UTF8'
    )
  ),
  current_setting('pgtap.fa03_quarantine_owner_profile_id')::bigint,
  'active',
  'transport_active'
);

insert into public.push_subscriptions (
  profile_id,
  endpoint,
  p256dh,
  auth,
  consent_id,
  endpoint_fingerprint_algorithm,
  endpoint_fingerprint,
  vapid_fingerprint_algorithm,
  vapid_fingerprint,
  transport_version,
  updated_at
)
values (
  current_setting('pgtap.fa03_quarantine_owner_profile_id')::bigint,
  'https://push.example.test/fa03-owner-v2',
  'owner-v2-p256dh',
  'owner-v2-auth',
  current_setting('pgtap.fa03_quarantine_owner_consent_id')::bigint,
  'sha256-endpoint-utf8-v1',
  pg_catalog.sha256(
    pg_catalog.convert_to(
      'https://push.example.test/fa03-owner-v2',
      'UTF8'
    )
  ),
  'sha256-vapid-p256-uncompressed-v1',
  pg_catalog.decode(repeat('ab', 32), 'hex'),
  999,
  '2000-01-01 00:00:00+00'
);

select ok(
  (
    select subscription_row.transport_version = 1
      and subscription_row.updated_at = subscription_row.created_at
    from public.push_subscriptions subscription_row
    where subscription_row.consent_id =
      current_setting(
        'pgtap.fa03_quarantine_owner_consent_id'
      )::bigint
  ),
  'DB owns initial transport version and timestamps'
);

update public.push_subscriptions
set p256dh = 'owner-v2-p256dh-refreshed',
    transport_version = 999,
    updated_at = '2000-01-01 00:00:00+00'
where consent_id =
  current_setting('pgtap.fa03_quarantine_owner_consent_id')::bigint;

select ok(
  (
    select subscription_row.transport_version = 2
      and subscription_row.updated_at > subscription_row.created_at
    from public.push_subscriptions subscription_row
    where subscription_row.consent_id =
      current_setting(
        'pgtap.fa03_quarantine_owner_consent_id'
      )::bigint
  ),
  'DB increments transport version and rejects caller-owned timestamps'
);

select throws_ok(
  format(
    $sql$
      insert into public.push_subscriptions (
        profile_id, endpoint, p256dh, auth, consent_id,
        endpoint_fingerprint_algorithm, endpoint_fingerprint,
        vapid_fingerprint_algorithm, vapid_fingerprint
      )
      values (
        %s, 'https://push.example.test/fa03-wrong-hash', 'key', 'auth',
        %s, 'sha256-endpoint-utf8-v1', decode(repeat('ef', 32), 'hex'),
        'sha256-vapid-p256-uncompressed-v1', decode(repeat('cd', 32), 'hex')
      )
    $sql$,
    current_setting('pgtap.fa03_quarantine_owner_profile_id')::bigint,
    current_setting('pgtap.fa03_quarantine_owner_consent_id')::bigint
  ),
  '23514',
  null,
  'a v2 transport cannot forge the exact endpoint fingerprint'
);

select throws_ok(
  format(
    $sql$
      insert into public.push_subscriptions (
        profile_id, endpoint, p256dh, auth, consent_id
      )
      values (
        %s, 'https://push.example.test/fa03-partial', 'key', 'auth', %s
      )
    $sql$,
    current_setting('pgtap.fa03_quarantine_owner_profile_id')::bigint,
    current_setting('pgtap.fa03_quarantine_owner_consent_id')::bigint
  ),
  '23514',
  null,
  'partial v2 transport metadata is rejected'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-00000000b501',
  true
);
select throws_ok(
  $$select public.save_push_subscription(
    'https://push.example.test/fa03-owner-v2', 'legacy-key', 'legacy-auth'
  )$$,
  'P0001',
  'PUSH_CLIENT_UPGRADE_REQUIRED',
  'legacy save cannot mutate a v2 transport'
);
select throws_ok(
  $$select public.remove_push_subscription(
    'https://push.example.test/fa03-owner-v2'
  )$$,
  'P0001',
  'PUSH_CLIENT_UPGRADE_REQUIRED',
  'legacy remove cannot delete a v2 transport'
);
reset role;

select set_config(
  'pgtap.fa03_quarantine_pending_outbox_id',
  pg_temp.create_quarantine_outbox(
    current_setting('pgtap.fa03_quarantine_owner_profile_id')::bigint
  )::text,
  true
);
select set_config(
  'pgtap.fa03_quarantine_processing_outbox_id',
  pg_temp.create_quarantine_outbox(
    current_setting('pgtap.fa03_quarantine_owner_profile_id')::bigint
  )::text,
  true
);
select set_config(
  'pgtap.fa03_quarantine_unknown_outbox_id',
  pg_temp.create_quarantine_outbox(
    current_setting('pgtap.fa03_quarantine_owner_profile_id')::bigint
  )::text,
  true
);
select set_config(
  'pgtap.fa03_quarantine_accepted_outbox_id',
  pg_temp.create_quarantine_outbox(
    current_setting('pgtap.fa03_quarantine_owner_profile_id')::bigint
  )::text,
  true
);

insert into private.notification_deliveries (
  outbox_id,
  recipient_profile_id,
  consent_id,
  consent_epoch
)
select
  fixture_row.outbox_id,
  current_setting('pgtap.fa03_quarantine_owner_profile_id')::bigint,
  consent_row.id,
  consent_row.consent_epoch
from private.push_device_consents consent_row
cross join lateral (
  values
    (current_setting(
      'pgtap.fa03_quarantine_pending_outbox_id'
    )::bigint),
    (current_setting(
      'pgtap.fa03_quarantine_processing_outbox_id'
    )::bigint),
    (current_setting(
      'pgtap.fa03_quarantine_unknown_outbox_id'
    )::bigint),
    (current_setting(
      'pgtap.fa03_quarantine_accepted_outbox_id'
    )::bigint)
) fixture_row(outbox_id)
where consent_row.id =
  current_setting('pgtap.fa03_quarantine_owner_consent_id')::bigint;

update private.notification_deliveries
set state = 'processing',
    attempts = 1,
    claim_token = '30000000-0000-4000-8000-000000000001',
    claimed_at = statement_timestamp(),
    lease_until = statement_timestamp() + interval '5 minutes'
where outbox_id =
  current_setting('pgtap.fa03_quarantine_processing_outbox_id')::bigint;

update private.notification_deliveries
set state = 'unknown',
    attempts = 1,
    claimed_at = statement_timestamp(),
    next_attempt_at = statement_timestamp() + interval '5 minutes',
    error_code = 'adapter_outcome_unknown'
where outbox_id =
  current_setting('pgtap.fa03_quarantine_unknown_outbox_id')::bigint;

update private.notification_deliveries
set state = 'accepted',
    attempts = 1,
    claimed_at = statement_timestamp()
where outbox_id =
  current_setting('pgtap.fa03_quarantine_accepted_outbox_id')::bigint;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-00000000b502',
  true
);
select is(
  public.quarantine_push_device(
    '20000000-0000-4000-8000-000000000001',
    current_setting('pgtap.fa03_quarantine_owner_epoch')::uuid,
    current_setting('pgtap.fa03_quarantine_owner_version')::bigint
  ),
  'OK',
  'another account receives the non-disclosing owner-command response'
);
reset role;

select is(
  (
    select consent_row.state
    from private.push_device_consents consent_row
    where consent_row.id =
      current_setting('pgtap.fa03_quarantine_owner_consent_id')::bigint
  ),
  'enabled',
  'another account cannot pause the owner consent'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-00000000b501',
  true
);
select is(
  public.quarantine_push_device(
    '20000000-0000-4000-8000-000000000001',
    current_setting('pgtap.fa03_quarantine_owner_epoch')::uuid,
    999
  ),
  'STALE_PUSH_DEVICE',
  'stale owner metadata returns an explicit retry outcome'
);
reset role;

select is(
  (
    select consent_row.state
    from private.push_device_consents consent_row
    where consent_row.id =
      current_setting('pgtap.fa03_quarantine_owner_consent_id')::bigint
  ),
  'enabled',
  'stale owner metadata cannot pause a newer consent state'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-00000000b501',
  true
);
select is(
  public.quarantine_push_device(
    '20000000-0000-4000-8000-000000000001',
    current_setting('pgtap.fa03_quarantine_owner_epoch')::uuid,
    current_setting('pgtap.fa03_quarantine_owner_version')::bigint
  ),
  'OK',
  'the exact owner command completes quarantine'
);
reset role;

select ok(
  (
    select consent_row.state = 'paused'
      and consent_row.reason_code = 'user_logout'
      and consent_row.consent_epoch =
        current_setting('pgtap.fa03_quarantine_owner_epoch')::uuid
      and consent_row.version =
        current_setting('pgtap.fa03_quarantine_owner_version')::bigint + 1
      and consent_row.cleanup_token_hash is not null
      and consent_row.cleanup_token_revoked_at is null
    from private.push_device_consents consent_row
    where consent_row.id =
      current_setting('pgtap.fa03_quarantine_owner_consent_id')::bigint
  ),
  'owner quarantine pauses without rotating or revoking cleanup authority'
);

select ok(
  (
    select registry_row.state = 'quarantined'
      and registry_row.reason_code = 'consent_paused'
      and registry_row.owner_profile_id =
        current_setting('pgtap.fa03_quarantine_owner_profile_id')::bigint
      and registry_row.version = 2
    from private.push_endpoint_registry registry_row
    where registry_row.endpoint_fingerprint = pg_catalog.sha256(
      pg_catalog.convert_to(
        'https://push.example.test/fa03-owner-v2',
        'UTF8'
      )
    )
  ),
  'owner quarantine preserves the owner lock and marks it quarantined'
);

select is(
  (
    select count(*)::bigint
    from public.push_subscriptions subscription_row
    where subscription_row.consent_id =
      current_setting('pgtap.fa03_quarantine_owner_consent_id')::bigint
  ),
  0::bigint,
  'owner quarantine removes endpoint and key send material'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-00000000b502',
  true
);
select throws_ok(
  $$select public.save_push_subscription(
    'https://push.example.test/fa03-owner-v2',
    'cross-owner-legacy-key',
    'cross-owner-legacy-auth'
  )$$,
  'P0001',
  'PUSH_CLIENT_UPGRADE_REQUIRED',
  'another account cannot bypass a quarantined endpoint lock through legacy save'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-00000000b501',
  true
);
select throws_ok(
  $$select public.save_push_subscription(
    'https://push.example.test/fa03-owner-v2',
    'same-owner-legacy-key',
    'same-owner-legacy-auth'
  )$$,
  'P0001',
  'PUSH_CLIENT_UPGRADE_REQUIRED',
  'the owner cannot reactivate a quarantined endpoint through legacy save'
);
reset role;

select is(
  (
    select count(*)::bigint
    from public.push_subscriptions subscription_row
    where subscription_row.endpoint =
      'https://push.example.test/fa03-owner-v2'
  ),
  0::bigint,
  'quarantined endpoint send material remains absent after legacy attempts'
);

select is(
  (
    select count(*)::bigint
    from private.notification_deliveries delivery_row
    where delivery_row.consent_id =
        current_setting('pgtap.fa03_quarantine_owner_consent_id')::bigint
      and delivery_row.state = 'cancelled'
      and delivery_row.error_code = 'consent_inactive'
      and delivery_row.claim_token is null
      and delivery_row.lease_until is null
      and delivery_row.next_attempt_at is null
  ),
  3::bigint,
  'owner quarantine cancels every non-terminal delivery and clears claims'
);

select is(
  (
    select count(*)::bigint
    from private.notification_deliveries delivery_row
    where delivery_row.consent_id =
        current_setting('pgtap.fa03_quarantine_owner_consent_id')::bigint
      and delivery_row.state = 'accepted'
  ),
  1::bigint,
  'owner quarantine does not rewrite terminal delivery audit'
);

-- Token-command fixture uses a distinct account, token and active transport.
with inserted_consent as (
  insert into private.push_device_consents (
    profile_id,
    device_id,
    state,
    reason_code,
    cleanup_token_hash
  )
  values (
    current_setting('pgtap.fa03_quarantine_other_profile_id')::bigint,
    '20000000-0000-4000-8000-000000000002',
    'enabled',
    'user_enabled',
    pg_catalog.sha256(pg_catalog.decode(repeat('01', 32), 'hex'))
  )
  returning id, consent_epoch
)
select
  set_config(
    'pgtap.fa03_quarantine_token_consent_id',
    inserted_consent.id::text,
    true
  ),
  set_config(
    'pgtap.fa03_quarantine_token_epoch',
    inserted_consent.consent_epoch::text,
    true
  )
from inserted_consent;

insert into private.push_endpoint_registry (
  endpoint_fingerprint,
  owner_profile_id,
  state,
  reason_code
)
values (
  pg_catalog.sha256(
    pg_catalog.convert_to(
      'https://push.example.test/fa03-token-v2',
      'UTF8'
    )
  ),
  current_setting('pgtap.fa03_quarantine_other_profile_id')::bigint,
  'active',
  'transport_active'
);

insert into public.push_subscriptions (
  profile_id,
  endpoint,
  p256dh,
  auth,
  consent_id,
  endpoint_fingerprint_algorithm,
  endpoint_fingerprint,
  vapid_fingerprint_algorithm,
  vapid_fingerprint
)
values (
  current_setting('pgtap.fa03_quarantine_other_profile_id')::bigint,
  'https://push.example.test/fa03-token-v2',
  'token-v2-p256dh',
  'token-v2-auth',
  current_setting('pgtap.fa03_quarantine_token_consent_id')::bigint,
  'sha256-endpoint-utf8-v1',
  pg_catalog.sha256(
    pg_catalog.convert_to(
      'https://push.example.test/fa03-token-v2',
      'UTF8'
    )
  ),
  'sha256-vapid-p256-uncompressed-v1',
  pg_catalog.decode(repeat('bc', 32), 'hex')
);

select set_config(
  'pgtap.fa03_quarantine_token_outbox_id',
  pg_temp.create_quarantine_outbox(
    current_setting('pgtap.fa03_quarantine_other_profile_id')::bigint
  )::text,
  true
);

insert into private.notification_deliveries (
  outbox_id,
  recipient_profile_id,
  consent_id,
  consent_epoch
)
select
  current_setting('pgtap.fa03_quarantine_token_outbox_id')::bigint,
  consent_row.profile_id,
  consent_row.id,
  consent_row.consent_epoch
from private.push_device_consents consent_row
where consent_row.id =
  current_setting('pgtap.fa03_quarantine_token_consent_id')::bigint;

set local role service_role;
select is(
  public.quarantine_push_by_token('not-a-hash'),
  'OK',
  'malformed cleanup hashes receive the fixed response'
);
select is(
  public.quarantine_push_by_token(
    '75877bb41d393b5fb8455ce60ecd8dda001d06316496b14dfa7f895656eeca4a'
  ),
  'OK',
  'unknown well-formed cleanup hashes receive the fixed response'
);
reset role;

select is(
  (
    select consent_row.state
    from private.push_device_consents consent_row
    where consent_row.id =
      current_setting('pgtap.fa03_quarantine_token_consent_id')::bigint
  ),
  'enabled',
  'invalid and unknown cleanup tokens cannot change consent'
);

set local role service_role;
select is(
  public.quarantine_push_by_token(
    '72cd6e8422c407fb6d098690f1130b7ded7ec2f7f5e1d30bd9d521f015363793'
  ),
  'OK',
  'the exact cleanup token receives the same fixed response'
);
reset role;

select ok(
  (
    select consent_row.state = 'paused'
      and consent_row.reason_code = 'cleanup_quarantine'
      and consent_row.consent_epoch =
        current_setting('pgtap.fa03_quarantine_token_epoch')::uuid
      and consent_row.cleanup_token_hash is not null
    from private.push_device_consents consent_row
    where consent_row.id =
      current_setting('pgtap.fa03_quarantine_token_consent_id')::bigint
  ),
  'token cleanup pauses the matching epoch without exposing account state'
);

select ok(
  (
    select registry_row.state = 'quarantined'
      and registry_row.reason_code = 'consent_paused'
      and registry_row.owner_profile_id =
        current_setting('pgtap.fa03_quarantine_other_profile_id')::bigint
    from private.push_endpoint_registry registry_row
    where registry_row.endpoint_fingerprint = pg_catalog.sha256(
      pg_catalog.convert_to(
        'https://push.example.test/fa03-token-v2',
        'UTF8'
      )
    )
  ),
  'token cleanup preserves the endpoint owner lock'
);

select is(
  (
    select count(*)::bigint
    from public.push_subscriptions subscription_row
    where subscription_row.consent_id =
      current_setting('pgtap.fa03_quarantine_token_consent_id')::bigint
  ),
  0::bigint,
  'token cleanup removes only the matching active transport'
);

select is(
  (
    select concat_ws(
      ',',
      delivery_row.state,
      delivery_row.error_code
    )
    from private.notification_deliveries delivery_row
    where delivery_row.outbox_id =
      current_setting('pgtap.fa03_quarantine_token_outbox_id')::bigint
  ),
  'cancelled,consent_inactive',
  'token cleanup cancels the matching epoch delivery'
);

select set_config(
  'pgtap.fa03_quarantine_token_paused_version',
  (
    select consent_row.version::text
    from private.push_device_consents consent_row
    where consent_row.id =
      current_setting('pgtap.fa03_quarantine_token_consent_id')::bigint
  ),
  true
);

set local role service_role;
select is(
  public.quarantine_push_by_token(
    '72cd6e8422c407fb6d098690f1130b7ded7ec2f7f5e1d30bd9d521f015363793'
  ),
  'OK',
  'cleanup token replay remains idempotent'
);
reset role;

select is(
  (
    select consent_row.version
    from private.push_device_consents consent_row
    where consent_row.id =
      current_setting('pgtap.fa03_quarantine_token_consent_id')::bigint
  ),
  current_setting('pgtap.fa03_quarantine_token_paused_version')::bigint,
  'cleanup token replay does not rewrite an inactive consent'
);

-- A deliberate re-enable rotates both epoch and cleanup authority.
update private.push_device_consents
set state = 'enabled',
    reason_code = 'user_enabled',
    cleanup_token_hash = pg_catalog.sha256(
      pg_catalog.decode(repeat('03', 32), 'hex')
    )
where id =
  current_setting('pgtap.fa03_quarantine_token_consent_id')::bigint;

select set_config(
  'pgtap.fa03_quarantine_token_rotated_epoch',
  (
    select consent_row.consent_epoch::text
    from private.push_device_consents consent_row
    where consent_row.id =
      current_setting('pgtap.fa03_quarantine_token_consent_id')::bigint
  ),
  true
);

update private.push_endpoint_registry
set state = 'active',
    reason_code = 'transport_active'
where endpoint_fingerprint = pg_catalog.sha256(
  pg_catalog.convert_to(
    'https://push.example.test/fa03-token-v2',
    'UTF8'
  )
);

insert into public.push_subscriptions (
  profile_id,
  endpoint,
  p256dh,
  auth,
  consent_id,
  endpoint_fingerprint_algorithm,
  endpoint_fingerprint,
  vapid_fingerprint_algorithm,
  vapid_fingerprint
)
values (
  current_setting('pgtap.fa03_quarantine_other_profile_id')::bigint,
  'https://push.example.test/fa03-token-v2',
  'token-v2-p256dh-rotated',
  'token-v2-auth-rotated',
  current_setting('pgtap.fa03_quarantine_token_consent_id')::bigint,
  'sha256-endpoint-utf8-v1',
  pg_catalog.sha256(
    pg_catalog.convert_to(
      'https://push.example.test/fa03-token-v2',
      'UTF8'
    )
  ),
  'sha256-vapid-p256-uncompressed-v1',
  pg_catalog.decode(repeat('bd', 32), 'hex')
);

select set_config(
  'pgtap.fa03_quarantine_rotated_outbox_id',
  pg_temp.create_quarantine_outbox(
    current_setting('pgtap.fa03_quarantine_other_profile_id')::bigint
  )::text,
  true
);

insert into private.notification_deliveries (
  outbox_id,
  recipient_profile_id,
  consent_id,
  consent_epoch
)
values (
  current_setting('pgtap.fa03_quarantine_rotated_outbox_id')::bigint,
  current_setting('pgtap.fa03_quarantine_other_profile_id')::bigint,
  current_setting('pgtap.fa03_quarantine_token_consent_id')::bigint,
  current_setting('pgtap.fa03_quarantine_token_rotated_epoch')::uuid
);

set local role service_role;
select is(
  public.quarantine_push_by_token(
    '72cd6e8422c407fb6d098690f1130b7ded7ec2f7f5e1d30bd9d521f015363793'
  ),
  'OK',
  'the old cleanup token keeps the fixed response after rotation'
);
reset role;

select ok(
  (
    select consent_row.state = 'enabled'
      and consent_row.consent_epoch =
        current_setting('pgtap.fa03_quarantine_token_rotated_epoch')::uuid
    from private.push_device_consents consent_row
    where consent_row.id =
      current_setting('pgtap.fa03_quarantine_token_consent_id')::bigint
  )
    and exists (
      select 1
      from public.push_subscriptions subscription_row
      where subscription_row.consent_id =
        current_setting('pgtap.fa03_quarantine_token_consent_id')::bigint
    ),
  'the old cleanup token cannot quarantine a re-enabled epoch'
);

set local role service_role;
select is(
  public.quarantine_push_by_token(
    '648aa5c579fb30f38af744d97d6ec840c7a91277a499a0d780f3e7314eca090b'
  ),
  'OK',
  'the rotated cleanup token keeps the same fixed response'
);
reset role;

select ok(
  (
    select consent_row.state = 'paused'
      and consent_row.reason_code = 'cleanup_quarantine'
      and consent_row.consent_epoch =
        current_setting('pgtap.fa03_quarantine_token_rotated_epoch')::uuid
    from private.push_device_consents consent_row
    where consent_row.id =
      current_setting('pgtap.fa03_quarantine_token_consent_id')::bigint
  )
    and not exists (
      select 1
      from public.push_subscriptions subscription_row
      where subscription_row.consent_id =
        current_setting('pgtap.fa03_quarantine_token_consent_id')::bigint
    )
    and exists (
      select 1
      from private.notification_deliveries delivery_row
      where delivery_row.outbox_id =
          current_setting(
            'pgtap.fa03_quarantine_rotated_outbox_id'
          )::bigint
        and delivery_row.state = 'cancelled'
        and delivery_row.error_code = 'consent_inactive'
    ),
  'only the rotated token can quarantine the re-enabled epoch'
);

-- A forced last-step failure proves all four quarantine mutations roll back.
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
  '00000000-0000-0000-0000-00000000b503',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'fa03-quarantine-rollback@example.test',
  'test',
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb
);

insert into public.profiles (user_id, nickname, ntrp)
values (
  '00000000-0000-0000-0000-00000000b503',
  'Quarantine Rollback',
  3.0
);

select set_config(
  'pgtap.fa03_quarantine_rollback_profile_id',
  (
    select profile_row.id::text
    from public.profiles profile_row
    where profile_row.user_id =
      '00000000-0000-0000-0000-00000000b503'
  ),
  true
);

with inserted_consent as (
  insert into private.push_device_consents (
    profile_id,
    device_id,
    state,
    reason_code,
    cleanup_token_hash
  )
  values (
    current_setting('pgtap.fa03_quarantine_rollback_profile_id')::bigint,
    '20000000-0000-4000-8000-000000000003',
    'enabled',
    'user_enabled',
    pg_catalog.sha256(pg_catalog.decode(repeat('04', 32), 'hex'))
  )
  returning id, consent_epoch, version
)
select
  set_config(
    'pgtap.fa03_quarantine_rollback_consent_id',
    inserted_consent.id::text,
    true
  ),
  set_config(
    'pgtap.fa03_quarantine_rollback_epoch',
    inserted_consent.consent_epoch::text,
    true
  ),
  set_config(
    'pgtap.fa03_quarantine_rollback_version',
    inserted_consent.version::text,
    true
  )
from inserted_consent;

insert into private.push_endpoint_registry (
  endpoint_fingerprint,
  owner_profile_id,
  state,
  reason_code
)
values (
  pg_catalog.sha256(
    pg_catalog.convert_to(
      'https://push.example.test/fa03-rollback-v2',
      'UTF8'
    )
  ),
  current_setting('pgtap.fa03_quarantine_rollback_profile_id')::bigint,
  'active',
  'transport_active'
);

insert into public.push_subscriptions (
  profile_id,
  endpoint,
  p256dh,
  auth,
  consent_id,
  endpoint_fingerprint_algorithm,
  endpoint_fingerprint,
  vapid_fingerprint_algorithm,
  vapid_fingerprint
)
values (
  current_setting('pgtap.fa03_quarantine_rollback_profile_id')::bigint,
  'https://push.example.test/fa03-rollback-v2',
  'rollback-v2-p256dh',
  'rollback-v2-auth',
  current_setting('pgtap.fa03_quarantine_rollback_consent_id')::bigint,
  'sha256-endpoint-utf8-v1',
  pg_catalog.sha256(
    pg_catalog.convert_to(
      'https://push.example.test/fa03-rollback-v2',
      'UTF8'
    )
  ),
  'sha256-vapid-p256-uncompressed-v1',
  pg_catalog.decode(repeat('be', 32), 'hex')
);

select set_config(
  'pgtap.fa03_quarantine_rollback_outbox_id',
  pg_temp.create_quarantine_outbox(
    current_setting('pgtap.fa03_quarantine_rollback_profile_id')::bigint
  )::text,
  true
);

insert into private.notification_deliveries (
  outbox_id,
  recipient_profile_id,
  consent_id,
  consent_epoch
)
values (
  current_setting('pgtap.fa03_quarantine_rollback_outbox_id')::bigint,
  current_setting('pgtap.fa03_quarantine_rollback_profile_id')::bigint,
  current_setting('pgtap.fa03_quarantine_rollback_consent_id')::bigint,
  current_setting('pgtap.fa03_quarantine_rollback_epoch')::uuid
);

create function pg_temp.reject_quarantine_delivery_update()
returns trigger
language plpgsql
as $$
begin
  if new.consent_id = current_setting(
    'pgtap.fa03_quarantine_rollback_consent_id'
  )::bigint then
    raise exception 'TEST_DELIVERY_CANCEL_FAILURE';
  end if;
  return new;
end;
$$;

create trigger reject_quarantine_delivery_update
before update on private.notification_deliveries
for each row execute function pg_temp.reject_quarantine_delivery_update();

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-00000000b503',
  true
);
select throws_ok(
  format(
    $sql$
      select public.quarantine_push_device(
        '20000000-0000-4000-8000-000000000003', %L, %s
      )
    $sql$,
    current_setting('pgtap.fa03_quarantine_rollback_epoch'),
    current_setting('pgtap.fa03_quarantine_rollback_version')::bigint
  ),
  'P0001',
  'TEST_DELIVERY_CANCEL_FAILURE',
  'a delivery failure aborts the complete quarantine statement'
);
reset role;

drop trigger reject_quarantine_delivery_update
on private.notification_deliveries;

select is(
  (
    select concat_ws(',', consent_row.state, consent_row.reason_code)
    from private.push_device_consents consent_row
    where consent_row.id =
      current_setting('pgtap.fa03_quarantine_rollback_consent_id')::bigint
  ),
  'enabled,user_enabled',
  'failed quarantine rolls consent back to its original state'
);

select is(
  (
    select concat_ws(',', registry_row.state, registry_row.reason_code)
    from private.push_endpoint_registry registry_row
    where registry_row.endpoint_fingerprint = pg_catalog.sha256(
      pg_catalog.convert_to(
        'https://push.example.test/fa03-rollback-v2',
        'UTF8'
      )
    )
  ),
  'active,transport_active',
  'failed quarantine rolls the registry back to active'
);

select is(
  (
    select count(*)::bigint
    from public.push_subscriptions subscription_row
    where subscription_row.consent_id =
      current_setting('pgtap.fa03_quarantine_rollback_consent_id')::bigint
  ),
  1::bigint,
  'failed quarantine restores the active send material'
);

select is(
  (
    select delivery_row.state
    from private.notification_deliveries delivery_row
    where delivery_row.outbox_id =
      current_setting('pgtap.fa03_quarantine_rollback_outbox_id')::bigint
  ),
  'pending',
  'failed quarantine leaves its delivery pending'
);

-- The new transport FKs preserve the already-approved account-delete shape.
delete from auth.users user_row
where user_row.id = '00000000-0000-0000-0000-00000000b503';
set constraints all immediate;

select is(
  (
    select count(*)::bigint
    from public.profiles profile_row
    where profile_row.id =
      current_setting('pgtap.fa03_quarantine_rollback_profile_id')::bigint
  ),
  0::bigint,
  'account deletion still removes the profile'
);

select is(
  (
    select count(*)::bigint
    from private.push_device_consents consent_row
    where consent_row.id =
      current_setting('pgtap.fa03_quarantine_rollback_consent_id')::bigint
  ),
  0::bigint,
  'account deletion removes device consent and cleanup authority'
);

select is(
  (
    select count(*)::bigint
    from public.push_subscriptions subscription_row
    where subscription_row.endpoint =
      'https://push.example.test/fa03-rollback-v2'
  ),
  0::bigint,
  'account deletion removes v2 endpoint and key material'
);

select ok(
  not exists (
    select 1
    from public.notification_outbox outbox_row
    where outbox_row.id =
      current_setting('pgtap.fa03_quarantine_rollback_outbox_id')::bigint
  )
    and not exists (
      select 1
      from private.notification_deliveries delivery_row
      where delivery_row.outbox_id =
        current_setting(
          'pgtap.fa03_quarantine_rollback_outbox_id'
        )::bigint
    ),
  'account deletion removes outbox payload and delivery audit together'
);

select ok(
  (
    select registry_row.owner_profile_id is null
      and registry_row.state = 'deny'
      and registry_row.reason_code = 'owner_deleted'
      and registry_row.created_at is null
      and registry_row.updated_at is null
      and registry_row.state_changed_at is null
    from private.push_endpoint_registry registry_row
    where registry_row.endpoint_fingerprint = pg_catalog.sha256(
      pg_catalog.convert_to(
        'https://push.example.test/fa03-rollback-v2',
        'UTF8'
      )
    )
  ),
  'account deletion leaves only the minimal ownerless deny fingerprint'
);

select * from finish();
rollback;
