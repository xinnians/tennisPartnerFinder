begin;

select plan(77);

-- Catalog, ownership, ACL, and single-residue-implementation boundaries.
select is(
  (
    select string_agg(column_name, ',' order by ordinal_position)
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'push_device_consents'
  ),
  'id,profile_id,device_id,state,reason_code,consent_epoch,version,cleanup_token_hash_algorithm,cleanup_token_hash,cleanup_token_rotated_at,cleanup_token_revoked_at,created_at,updated_at,state_changed_at,client_binding_id,transport_revision',
  'A4 keeps the exact consent column allowlist'
);

select is(
  (
    select is_nullable || ':' || coalesce(column_default, '<null>')
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'push_device_consents'
      and column_name = 'client_binding_id'
  ),
  'NO:<null>',
  'client binding is required and has no silent default'
);

select is(
  (
    select data_type || ':' || is_nullable || ':' || coalesce(column_default, '<null>')
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'push_device_consents'
      and column_name = 'transport_revision'
  ),
  'uuid:YES:<null>',
  'transport revision is an optional UUID with no default'
);

select ok(
  (
    select count(*) = 6
    from pg_proc function_row
    join pg_roles owner_role on owner_role.oid = function_row.proowner
    where function_row.oid = any(array[
      to_regprocedure('private.clear_locked_push_consent_residue(bigint,uuid)'),
      to_regprocedure(
        'private.mutate_push_transport_v2(text,uuid,uuid,uuid,text,text,text,text,text,text,uuid,text)'
      ),
      to_regprocedure(
        'private.quarantine_locked_push_consent(bigint,uuid,text)'
      ),
      to_regprocedure('private.maintain_push_device_consent()'),
      to_regprocedure(
        'public.enable_push_device_v2(uuid,uuid,uuid,text,text,text,text,text,text,uuid,text)'
      ),
      to_regprocedure(
        'public.refresh_push_transport_v2(uuid,uuid,uuid,text,uuid,text,text,text,text,text)'
      )
    ])
      and owner_role.rolname = 'postgres'
      and function_row.prosecdef = (
        function_row.proname <> 'maintain_push_device_consent'
      )
      and coalesce(function_row.proconfig, '{}'::text[])
        @> array['search_path=""']::text[]
  ),
  'A4 functions keep the reviewed owner, security mode, and empty path'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.enable_push_device_v2(uuid,uuid,uuid,text,text,text,text,text,text,uuid,text)',
    'execute'
  )
    and not has_function_privilege(
      'public',
      'public.enable_push_device_v2(uuid,uuid,uuid,text,text,text,text,text,text,uuid,text)',
      'execute'
    )
    and not has_function_privilege(
      'anon',
      'public.enable_push_device_v2(uuid,uuid,uuid,text,text,text,text,text,text,uuid,text)',
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'public.enable_push_device_v2(uuid,uuid,uuid,text,text,text,text,text,text,uuid,text)',
      'execute'
    ),
  'only service role can execute the v2 enable wrapper'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.refresh_push_transport_v2(uuid,uuid,uuid,text,uuid,text,text,text,text,text)',
    'execute'
  )
    and not has_function_privilege(
      'public',
      'public.refresh_push_transport_v2(uuid,uuid,uuid,text,uuid,text,text,text,text,text)',
      'execute'
    )
    and not has_function_privilege(
      'anon',
      'public.refresh_push_transport_v2(uuid,uuid,uuid,text,uuid,text,text,text,text,text)',
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'public.refresh_push_transport_v2(uuid,uuid,uuid,text,uuid,text,text,text,text,text)',
      'execute'
    ),
  'only service role can execute the v2 refresh wrapper'
);

select ok(
  not has_function_privilege(
    'public',
    'private.clear_locked_push_consent_residue(bigint,uuid)',
    'execute'
  )
    and not has_function_privilege(
      'anon',
      'private.clear_locked_push_consent_residue(bigint,uuid)',
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'private.clear_locked_push_consent_residue(bigint,uuid)',
      'execute'
    )
    and not has_function_privilege(
      'service_role',
      'private.clear_locked_push_consent_residue(bigint,uuid)',
      'execute'
    )
    and not has_function_privilege(
      'public',
      'private.mutate_push_transport_v2(text,uuid,uuid,uuid,text,text,text,text,text,text,uuid,text)',
      'execute'
    )
    and not has_function_privilege(
      'anon',
      'private.mutate_push_transport_v2(text,uuid,uuid,uuid,text,text,text,text,text,text,uuid,text)',
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'private.mutate_push_transport_v2(text,uuid,uuid,uuid,text,text,text,text,text,text,uuid,text)',
      'execute'
    )
    and not has_function_privilege(
      'service_role',
      'private.mutate_push_transport_v2(text,uuid,uuid,uuid,text,text,text,text,text,text,uuid,text)',
      'execute'
    ),
  'application roles cannot execute either private A4 mutation helper'
);

select ok(
  not has_table_privilege(
    'service_role',
    'private.push_device_consents',
    'select,insert,update,delete'
  )
    and not has_table_privilege(
      'service_role',
      'private.push_endpoint_registry',
      'select,insert,update,delete'
    )
    and has_table_privilege(
      'service_role',
      'public.push_subscriptions',
      'select,delete'
    )
    and not has_table_privilege(
      'service_role',
      'public.push_subscriptions',
      'insert,update'
    ),
  'A4 does not widen raw table privileges'
);

select ok(
  pg_get_functiondef(
    'private.quarantine_locked_push_consent(bigint,uuid,text)'::regprocedure
  ) ~ 'clear_locked_push_consent_residue',
  'the quarantine parent delegates residual cleanup to the child helper'
);

select ok(
  pg_get_functiondef(
    'private.mutate_push_transport_v2(text,uuid,uuid,uuid,text,text,text,text,text,text,uuid,text)'::regprocedure
  ) ~ 'clear_locked_push_consent_residue',
  'the v2 mutation boundary delegates residual cleanup to the same helper'
);

select ok(
  not (
    regexp_replace(
      pg_get_functiondef(
        'private.mutate_push_transport_v2(text,uuid,uuid,uuid,text,text,text,text,text,text,uuid,text)'::regprocedure
      ),
      '\s+',
      ' ',
      'g'
    ) ~ $pattern$set state = 'quarantined', reason_code = 'consent_paused'$pattern$
  ),
  'the v2 command does not inline registry consent-pause cleanup'
);

select ok(
  not (
    regexp_replace(
      pg_get_functiondef(
        'private.mutate_push_transport_v2(text,uuid,uuid,uuid,text,text,text,text,text,text,uuid,text)'::regprocedure
      ),
      '\s+',
      ' ',
      'g'
    ) ~ $pattern$delete from public\.push_subscriptions[^;]+consent_id\s*(=|in\y|is not null)$pattern$
  ),
  'the v2 command does not inline consent-owned transport deletion'
);

select ok(
  not (
    regexp_replace(
      pg_get_functiondef(
        'private.mutate_push_transport_v2(text,uuid,uuid,uuid,text,text,text,text,text,text,uuid,text)'::regprocedure
      ),
      '\s+',
      ' ',
      'g'
    ) ~ $pattern$update private\.notification_deliveries[^;]+set state = 'cancelled'[^;]+error_code = 'consent_inactive'$pattern$
  ),
  'the v2 command does not inline delivery cancellation'
);

select ok(
  (
    with source as (
      select regexp_replace(
        pg_get_functiondef(
          'private.clear_locked_push_consent_residue(bigint,uuid)'::regprocedure
        ),
        '\s+',
        ' ',
        'g'
      ) as body
    ), anchors as (
      select
        strpos(body, 'from private.push_endpoint_registry registry_row') as registry_at,
        strpos(body, 'from public.push_subscriptions subscription_row where subscription_row.id = active_subscription.id') as transport_at,
        strpos(body, 'from private.notification_deliveries delivery_row') as delivery_at
      from source
    )
    select registry_at > 0
      and transport_at > 0
      and delivery_at > 0
      and registry_at < transport_at
      and transport_at < delivery_at
    from anchors
  ),
  'residue helper lock anchors exist in registry then transport then delivery order'
);

select ok(
  (
    with source as (
      select regexp_replace(
        pg_get_functiondef(
          'private.mutate_push_transport_v2(text,uuid,uuid,uuid,text,text,text,text,text,text,uuid,text)'::regprocedure
        ),
        '\s+',
        ' ',
        'g'
      ) as body
    ), anchors as (
      select
        strpos(body, 'order by consent_row.id for update') as consent_at,
        strpos(body, 'order by registry_row.endpoint_fingerprint for update') as registry_at,
        strpos(body, 'order by subscription_row.id for update') as transport_at
      from source
    )
    select consent_at > 0
      and registry_at > 0
      and transport_at > 0
      and consent_at < registry_at
      and registry_at < transport_at
    from anchors
  ),
  'v2 mutation lock anchors exist in consent then registry then transport order'
);

select ok(
  pg_get_functiondef(
    'private.maintain_push_device_consent()'::regprocedure
  ) ~ 'transport_changed'
    and pg_get_functiondef(
      'private.maintain_push_device_consent()'::regprocedure
    ) ~ 'PUSH_CONSENT_BINDING_IMMUTABLE',
  'consent trigger tracks transport semantics and binding immutability'
);

-- Runtime fixtures.
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
    '00000000-0000-0000-0000-00000000c401',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'fa03-a4-owner@example.test',
    'test',
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000c402',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'fa03-a4-other@example.test',
    'test',
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000c403',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'fa03-a4-no-profile@example.test',
    'test',
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  );

insert into public.profiles (user_id, nickname, ntrp)
values
  ('00000000-0000-0000-0000-00000000c401', 'A4 Owner', 3.5),
  ('00000000-0000-0000-0000-00000000c402', 'A4 Other', 3.5);

select is(
  public.enable_push_device_v2(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    repeat('11', 32),
    'https://push.example.test/a4-initial',
    'p256dh-a4-initial',
    'auth-a4-initial',
    repeat('aa', 32),
    null,
    null,
    null
  ),
  '{"kind":"runtime-disabled","version":1}'::jsonb,
  'the initial runtime gate rejects enable before any write'
);

select is(
  (
    select count(*)::bigint
    from private.push_device_consents consent_row
    where consent_row.device_id = '30000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'runtime-disabled enable leaves no consent'
);

update private.notification_runtime_control
set new_runtime_mode = 'enabled',
    worker_lease_duration = interval '30 seconds',
    request_deadline_duration = interval '10 seconds',
    delivery_lease_duration = interval '30 seconds',
    max_delivery_attempts = 3,
    push_ttl_safety_budget = interval '5 seconds';

select is(
  public.enable_push_device_v2(
    '00000000-0000-0000-0000-00000000c403',
    '30000000-0000-4000-8000-000000000003',
    '31000000-0000-4000-8000-000000000003',
    repeat('13', 32),
    'https://push.example.test/a4-no-profile',
    'p256dh-a4-no-profile',
    'auth-a4-no-profile',
    repeat('ac', 32)
  ),
  '{"kind":"stale","version":1}'::jsonb,
  'enable fails closed when the verified auth user has no application profile'
);

select is(
  (
    select count(*)::bigint
    from public.profiles profile_row
    where profile_row.user_id = '00000000-0000-0000-0000-00000000c403'
  ),
  0::bigint,
  'enable never fabricates an incomplete application profile'
);

select is(
  concat_ws(
    ':',
    public.enable_push_device_v2(
      '00000000-0000-0000-0000-00000000c401',
      '30000000-0000-4000-8000-000000000074',
      '31000000-0000-4000-8000-000000000074',
      repeat('74', 32),
      'https://push.example.test/a4-missing-predecessor',
      'p256dh-a4-missing-predecessor',
      'auth-a4-missing-predecessor',
      repeat('74', 32),
      '900000000000000074',
      '32000000-0000-4000-8000-000000000074',
      '7'
    ) ->> 'kind',
    (
      select count(*)::text
      from private.push_device_consents consent_row
      where consent_row.device_id = '30000000-0000-4000-8000-000000000074'
    ),
    (
      select count(*)::text
      from public.push_subscriptions subscription_row
      where subscription_row.endpoint = 'https://push.example.test/a4-missing-predecessor'
    )
  ),
  'stale:0:0',
  'a predecessor cannot create a missing server consent'
);

select set_config(
  'pgtap.fa03_a4_initial_result',
  public.enable_push_device_v2(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    repeat('11', 32),
    'https://push.example.test/a4-initial',
    'p256dh-a4-initial',
    'auth-a4-initial',
    repeat('aa', 32),
    null,
    null,
    null
  )::text,
  true
);

select is(
  current_setting('pgtap.fa03_a4_initial_result')::jsonb ->> 'kind',
  'committed',
  'initial enable commits'
);

select is(
  (
    select concat_ws(
      ':',
      consent_row.state,
      consent_row.reason_code,
      consent_row.version,
      consent_row.client_binding_id,
      octet_length(consent_row.cleanup_token_hash),
      consent_row.transport_revision is not null
    )
    from private.push_device_consents consent_row
    where consent_row.device_id = '30000000-0000-4000-8000-000000000001'
  ),
  'enabled:user_enabled:1:31000000-0000-4000-8000-000000000001:32:t',
  'initial enable stores the exact consent shape'
);

select is(
  (
    select concat_ws(
      ':',
      subscription_row.endpoint,
      subscription_row.p256dh,
      subscription_row.auth,
      subscription_row.transport_version,
      octet_length(subscription_row.endpoint_fingerprint),
      octet_length(subscription_row.vapid_fingerprint)
    )
    from public.push_subscriptions subscription_row
    where subscription_row.consent_id =
      (current_setting('pgtap.fa03_a4_initial_result')::jsonb ->> 'consentId')::bigint
  ),
  'https://push.example.test/a4-initial:p256dh-a4-initial:auth-a4-initial:1:32:32',
  'initial enable creates one exact v2 transport'
);

select is(
  (
    select registry_row.state || ':' || registry_row.reason_code
    from private.push_endpoint_registry registry_row
    where registry_row.endpoint_fingerprint = pg_catalog.sha256(
      pg_catalog.convert_to('https://push.example.test/a4-initial', 'UTF8')
    )
  ),
  'active:transport_active',
  'initial enable activates the owner registry'
);

select set_config(
  'pgtap.fa03_a4_initial_updated_at',
  (
    select consent_row.updated_at::text
    from private.push_device_consents consent_row
    where consent_row.device_id = '30000000-0000-4000-8000-000000000001'
  ),
  true
);

select is(
  public.enable_push_device_v2(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    repeat('11', 32),
    'https://push.example.test/a4-initial',
    'p256dh-a4-initial',
    'auth-a4-initial',
    repeat('aa', 32),
    null,
    null,
    null
  ),
  current_setting('pgtap.fa03_a4_initial_result')::jsonb,
  'exact enable retry returns the original committed snapshot'
);

select is(
  (
    select consent_row.version::text || ':' || consent_row.updated_at::text
    from private.push_device_consents consent_row
    where consent_row.device_id = '30000000-0000-4000-8000-000000000001'
  ),
  '1:' || current_setting('pgtap.fa03_a4_initial_updated_at'),
  'exact enable retry changes no consent version or timestamp'
);

select is(
  public.enable_push_device_v2(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    repeat('11', 32),
    'https://push.example.test/a4-initial',
    'different-key',
    'auth-a4-initial',
    repeat('aa', 32),
    null,
    null,
    null
  ),
  '{"kind":"stale","version":1}'::jsonb,
  'same binding with different transport input is stale'
);

select is(
  public.enable_push_device_v2(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000002',
    '31000000-0000-4000-8000-000000000002',
    'ABC',
    'https://push.example.test/a4-invalid',
    'p256dh-a4-invalid',
    'auth-a4-invalid',
    repeat('aa', 32),
    null,
    null,
    null
  ),
  '{"kind":"invalid","version":1}'::jsonb,
  'malformed cleanup digest is rejected before mutation'
);

-- Refresh no-op and semantic updates.
select is(
  public.refresh_push_transport_v2(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    current_setting('pgtap.fa03_a4_initial_result')::jsonb ->> 'consentId',
    (current_setting('pgtap.fa03_a4_initial_result')::jsonb ->> 'consentEpoch')::uuid,
    current_setting('pgtap.fa03_a4_initial_result')::jsonb ->> 'consentVersion',
    'https://push.example.test/a4-initial',
    'p256dh-a4-initial',
    'auth-a4-initial',
    repeat('aa', 32)
  ),
  current_setting('pgtap.fa03_a4_initial_result')::jsonb,
  'exact refresh no-op returns the unchanged committed snapshot'
);

select set_config(
  'pgtap.fa03_a4_refresh_result',
  public.refresh_push_transport_v2(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    current_setting('pgtap.fa03_a4_initial_result')::jsonb ->> 'consentId',
    (current_setting('pgtap.fa03_a4_initial_result')::jsonb ->> 'consentEpoch')::uuid,
    current_setting('pgtap.fa03_a4_initial_result')::jsonb ->> 'consentVersion',
    'https://push.example.test/a4-initial',
    'p256dh-a4-refresh',
    'auth-a4-initial',
    repeat('aa', 32)
  )::text,
  true
);

select is(
  (
    select concat_ws(
      ':',
      current_setting('pgtap.fa03_a4_refresh_result')::jsonb ->> 'kind',
      current_setting('pgtap.fa03_a4_refresh_result')::jsonb ->> 'consentVersion',
      consent_row.version,
      subscription_row.transport_version,
      subscription_row.p256dh
    )
    from private.push_device_consents consent_row
    join public.push_subscriptions subscription_row
      on subscription_row.consent_id = consent_row.id
    where consent_row.device_id = '30000000-0000-4000-8000-000000000001'
  ),
  'committed:2:2:2:p256dh-a4-refresh',
  'refresh key change advances transport and consent versions exactly once'
);

select is(
  public.refresh_push_transport_v2(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    current_setting('pgtap.fa03_a4_initial_result')::jsonb ->> 'consentId',
    (current_setting('pgtap.fa03_a4_initial_result')::jsonb ->> 'consentEpoch')::uuid,
    current_setting('pgtap.fa03_a4_initial_result')::jsonb ->> 'consentVersion',
    'https://push.example.test/a4-stale',
    'p256dh-a4-stale',
    'auth-a4-stale',
    repeat('bb', 32)
  ),
  '{"kind":"stale","version":1}'::jsonb,
  'refresh rejects an old expected consent version'
);

select set_config(
  'pgtap.fa03_a4_endpoint_refresh_result',
  public.refresh_push_transport_v2(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    current_setting('pgtap.fa03_a4_refresh_result')::jsonb ->> 'consentId',
    (current_setting('pgtap.fa03_a4_refresh_result')::jsonb ->> 'consentEpoch')::uuid,
    current_setting('pgtap.fa03_a4_refresh_result')::jsonb ->> 'consentVersion',
    'https://push.example.test/a4-refreshed-endpoint',
    'p256dh-a4-refresh',
    'auth-a4-refresh',
    repeat('bb', 32)
  )::text,
  true
);

select is(
  (
    select concat_ws(
      ':',
      current_setting('pgtap.fa03_a4_endpoint_refresh_result')::jsonb ->> 'kind',
      consent_row.version,
      subscription_row.transport_version,
      subscription_row.endpoint
    )
    from private.push_device_consents consent_row
    join public.push_subscriptions subscription_row
      on subscription_row.consent_id = consent_row.id
    where consent_row.device_id = '30000000-0000-4000-8000-000000000001'
  ),
  'committed:3:3:https://push.example.test/a4-refreshed-endpoint',
  'refresh endpoint change advances both semantic versions once'
);

select is(
  (
    select registry_row.state || ':' || registry_row.reason_code
    from private.push_endpoint_registry registry_row
    where registry_row.endpoint_fingerprint = pg_catalog.sha256(
      pg_catalog.convert_to('https://push.example.test/a4-initial', 'UTF8')
    )
  ),
  'quarantined:transport_replaced',
  'refresh quarantines the replaced endpoint registry'
);

-- v1.2: refresh is stale without transport; enable repairs the same binding.
delete from public.push_subscriptions
where consent_id =
  (current_setting('pgtap.fa03_a4_endpoint_refresh_result')::jsonb ->> 'consentId')::bigint;

update private.push_endpoint_registry
set state = 'quarantined',
    reason_code = 'provider_stale'
where endpoint_fingerprint = pg_catalog.sha256(
  pg_catalog.convert_to('https://push.example.test/a4-refreshed-endpoint', 'UTF8')
);

select is(
  public.refresh_push_transport_v2(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    current_setting('pgtap.fa03_a4_endpoint_refresh_result')::jsonb ->> 'consentId',
    (current_setting('pgtap.fa03_a4_endpoint_refresh_result')::jsonb ->> 'consentEpoch')::uuid,
    current_setting('pgtap.fa03_a4_endpoint_refresh_result')::jsonb ->> 'consentVersion',
    'https://push.example.test/a4-refreshed-endpoint',
    'p256dh-a4-refresh',
    'auth-a4-refresh',
    repeat('bb', 32)
  ),
  '{"kind":"stale","version":1}'::jsonb,
  'refresh returns stale when the enabled consent has no transport'
);

select set_config(
  'pgtap.fa03_a4_rebuild_result',
  public.enable_push_device_v2(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    repeat('11', 32),
    'https://push.example.test/a4-refreshed-endpoint',
    'p256dh-a4-refresh',
    'auth-a4-refresh',
    repeat('bb', 32),
    null,
    null,
    null
  )::text,
  true
);

select is(
  (
    select concat_ws(
      ':',
      current_setting('pgtap.fa03_a4_rebuild_result')::jsonb ->> 'kind',
      consent_row.version,
      consent_row.client_binding_id,
      consent_row.cleanup_token_hash = decode(repeat('11', 32), 'hex'),
      consent_row.consent_epoch::text =
        current_setting('pgtap.fa03_a4_endpoint_refresh_result')::jsonb ->> 'consentEpoch',
      count(subscription_row.id),
      min(registry_row.state)
    )
    from private.push_device_consents consent_row
    left join public.push_subscriptions subscription_row
      on subscription_row.consent_id = consent_row.id
    join private.push_endpoint_registry registry_row
      on registry_row.endpoint_fingerprint = pg_catalog.sha256(
        pg_catalog.convert_to('https://push.example.test/a4-refreshed-endpoint', 'UTF8')
      )
    where consent_row.device_id = '30000000-0000-4000-8000-000000000001'
    group by consent_row.id
  ),
  'committed:4:31000000-0000-4000-8000-000000000001:t:t:1:active',
  'same-binding enable rebuilds one transport without rotating authority'
);

select set_config(
  'pgtap.fa03_a4_same_binding_hash',
  public.enable_push_device_v2(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000075',
    '31000000-0000-4000-8000-000000000075',
    repeat('75', 32),
    'https://push.example.test/a4-same-binding-hash',
    'p256dh-a4-same-binding-hash',
    'auth-a4-same-binding-hash',
    repeat('75', 32)
  )::text,
  true
);

delete from public.push_subscriptions
where consent_id =
  (current_setting('pgtap.fa03_a4_same_binding_hash')::jsonb ->> 'consentId')::bigint;

select set_config(
  'pgtap.fa03_a4_same_binding_hash_retry',
  public.enable_push_device_v2(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000075',
    '31000000-0000-4000-8000-000000000075',
    repeat('76', 32),
    'https://push.example.test/a4-same-binding-hash',
    'p256dh-a4-same-binding-hash',
    'auth-a4-same-binding-hash',
    repeat('75', 32)
  )::text,
  true
);

select is(
  concat_ws(
    ':',
    current_setting('pgtap.fa03_a4_same_binding_hash_retry')::jsonb ->> 'kind',
    (
      select concat_ws(
        ':',
        consent_row.version,
        consent_row.cleanup_token_hash = decode(repeat('75', 32), 'hex')
      )
      from private.push_device_consents consent_row
      where consent_row.device_id = '30000000-0000-4000-8000-000000000075'
    ),
    (
      select count(*)::text
      from public.push_subscriptions subscription_row
      where subscription_row.consent_id =
        (current_setting('pgtap.fa03_a4_same_binding_hash')::jsonb ->> 'consentId')::bigint
    )
  ),
  'stale:1:t:0',
  'same-binding transport rebuild rejects a different cleanup authority'
);

select set_config(
  'pgtap.fa03_a4_same_binding_paused',
  public.enable_push_device_v2(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000072',
    '31000000-0000-4000-8000-000000000072',
    repeat('72', 32),
    'https://push.example.test/a4-same-binding-paused',
    'p256dh-a4-same-binding-paused',
    'auth-a4-same-binding-paused',
    repeat('72', 32)
  )::text,
  true
);

select private.quarantine_locked_push_consent(
  (current_setting('pgtap.fa03_a4_same_binding_paused')::jsonb ->> 'consentId')::bigint,
  (current_setting('pgtap.fa03_a4_same_binding_paused')::jsonb ->> 'consentEpoch')::uuid,
  'subscription_changed'
);

select set_config(
  'pgtap.fa03_a4_same_binding_paused_retry',
  public.enable_push_device_v2(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000072',
    '31000000-0000-4000-8000-000000000072',
    repeat('72', 32),
    'https://push.example.test/a4-same-binding-paused',
    'p256dh-a4-same-binding-paused',
    'auth-a4-same-binding-paused',
    repeat('72', 32)
  )::text,
  true
);

select is(
  concat_ws(
    ':',
    current_setting('pgtap.fa03_a4_same_binding_paused_retry')::jsonb ->> 'kind',
    (
      select consent_row.state || ':' || consent_row.reason_code
      from private.push_device_consents consent_row
      where consent_row.device_id = '30000000-0000-4000-8000-000000000072'
    ),
    (
      select count(*)::text
      from public.push_subscriptions subscription_row
      where subscription_row.consent_id =
        (current_setting('pgtap.fa03_a4_same_binding_paused')::jsonb ->> 'consentId')::bigint
    )
  ),
  'stale:paused:subscription_changed:0',
  'same-binding enable cannot rebuild a paused consent transport'
);

select set_config(
  'pgtap.fa03_a4_same_binding_revoked',
  public.enable_push_device_v2(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000073',
    '31000000-0000-4000-8000-000000000073',
    repeat('73', 32),
    'https://push.example.test/a4-same-binding-revoked',
    'p256dh-a4-same-binding-revoked',
    'auth-a4-same-binding-revoked',
    repeat('73', 32)
  )::text,
  true
);

delete from public.push_subscriptions
where consent_id =
  (current_setting('pgtap.fa03_a4_same_binding_revoked')::jsonb ->> 'consentId')::bigint;

update private.push_device_consents
set state = 'revoked',
    reason_code = 'user_disabled',
    cleanup_token_hash = null
where id =
  (current_setting('pgtap.fa03_a4_same_binding_revoked')::jsonb ->> 'consentId')::bigint;

select set_config(
  'pgtap.fa03_a4_same_binding_revoked_retry',
  public.enable_push_device_v2(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000073',
    '31000000-0000-4000-8000-000000000073',
    repeat('73', 32),
    'https://push.example.test/a4-same-binding-revoked',
    'p256dh-a4-same-binding-revoked',
    'auth-a4-same-binding-revoked',
    repeat('73', 32)
  )::text,
  true
);

select is(
  concat_ws(
    ':',
    current_setting('pgtap.fa03_a4_same_binding_revoked_retry')::jsonb ->> 'kind',
    (
      select consent_row.state || ':' || consent_row.reason_code
      from private.push_device_consents consent_row
      where consent_row.device_id = '30000000-0000-4000-8000-000000000073'
    ),
    (
      select count(*)::text
      from public.push_subscriptions subscription_row
      where subscription_row.consent_id =
        (current_setting('pgtap.fa03_a4_same_binding_revoked')::jsonb ->> 'consentId')::bigint
    )
  ),
  'stale:revoked:user_disabled:0',
  'same-binding enable cannot rebuild a revoked consent transport'
);

-- Trigger-level unified binding version and binding immutability.
select set_config(
  'pgtap.fa03_a4_trigger_version',
  (
    select consent_row.version::text
    from private.push_device_consents consent_row
    where consent_row.device_id = '30000000-0000-4000-8000-000000000001'
  ),
  true
);

update private.push_device_consents consent_row
set transport_revision = consent_row.transport_revision
where consent_row.device_id = '30000000-0000-4000-8000-000000000001';

select is(
  (
    select consent_row.version::text
    from private.push_device_consents consent_row
    where consent_row.device_id = '30000000-0000-4000-8000-000000000001'
  ),
  current_setting('pgtap.fa03_a4_trigger_version'),
  'an exact transport-revision no-op does not advance consent version'
);

update private.push_device_consents
set transport_revision = pg_catalog.gen_random_uuid()
where device_id = '30000000-0000-4000-8000-000000000001';

select is(
  (
    select consent_row.version
    from private.push_device_consents consent_row
    where consent_row.device_id = '30000000-0000-4000-8000-000000000001'
  ),
  current_setting('pgtap.fa03_a4_trigger_version')::bigint + 1,
  'a transport-revision change advances consent version exactly once'
);

select throws_ok(
  $$
    update private.push_device_consents
    set client_binding_id = '31000000-0000-4000-8000-000000000099'
    where device_id = '30000000-0000-4000-8000-000000000001'
  $$,
  'P0001',
  'PUSH_CONSENT_BINDING_IMMUTABLE',
  'an enabled consent cannot silently change its binding identity'
);

create function pg_temp.enable_a4(
  p_auth_user_id uuid,
  p_device_id uuid,
  p_binding_id uuid,
  p_hash_pair text,
  p_endpoint text,
  p_predecessor_id text default null,
  p_predecessor_epoch uuid default null,
  p_predecessor_version text default null
)
returns jsonb
language sql
as $$
  select public.enable_push_device_v2(
    p_auth_user_id,
    p_device_id,
    p_binding_id,
    repeat(p_hash_pair, 32),
    p_endpoint,
    'p256dh-' || p_device_id::text,
    'auth-' || p_device_id::text,
    repeat('cc', 32),
    p_predecessor_id,
    p_predecessor_epoch,
    p_predecessor_version
  )
$$;

-- predecessor-null recovery from each server state.
select set_config(
  'pgtap.fa03_a4_enabled_before',
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000010',
    '31000000-0000-4000-8000-000000000010',
    '20',
    'https://push.example.test/a4-rotate-enabled'
  )::text,
  true
);

select set_config(
  'pgtap.fa03_a4_enabled_after',
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000010',
    '31000000-0000-4000-8000-000000000110',
    '21',
    'https://push.example.test/a4-rotate-enabled'
  )::text,
  true
);

select ok(
  current_setting('pgtap.fa03_a4_enabled_after')::jsonb ->> 'kind' = 'committed'
    and current_setting('pgtap.fa03_a4_enabled_after')::jsonb ->> 'consentEpoch'
      <> current_setting('pgtap.fa03_a4_enabled_before')::jsonb ->> 'consentEpoch'
    and (
      select consent_row.state = 'enabled'
        and consent_row.reason_code = 'user_enabled'
        and consent_row.client_binding_id =
          '31000000-0000-4000-8000-000000000110'
        and consent_row.cleanup_token_hash = decode(repeat('21', 32), 'hex')
        and count(subscription_row.id) = 1
      from private.push_device_consents consent_row
      left join public.push_subscriptions subscription_row
        on subscription_row.consent_id = consent_row.id
      where consent_row.device_id = '30000000-0000-4000-8000-000000000010'
      group by consent_row.id
    ),
  'predecessor-null enable rotates an enabled consent and leaves one transport'
);

select set_config(
  'pgtap.fa03_a4_paused_before',
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000011',
    '31000000-0000-4000-8000-000000000011',
    '22',
    'https://push.example.test/a4-rotate-paused'
  )::text,
  true
);

update private.push_device_consents
set state = 'paused',
    reason_code = 'user_logout'
where device_id = '30000000-0000-4000-8000-000000000011';

select set_config(
  'pgtap.fa03_a4_paused_after',
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000011',
    '31000000-0000-4000-8000-000000000111',
    '23',
    'https://push.example.test/a4-rotate-paused'
  )::text,
  true
);

select ok(
  current_setting('pgtap.fa03_a4_paused_after')::jsonb ->> 'kind' = 'committed'
    and current_setting('pgtap.fa03_a4_paused_after')::jsonb ->> 'consentEpoch'
      <> current_setting('pgtap.fa03_a4_paused_before')::jsonb ->> 'consentEpoch'
    and (
      select consent_row.state = 'enabled'
        and consent_row.reason_code = 'user_enabled'
        and count(subscription_row.id) = 1
      from private.push_device_consents consent_row
      left join public.push_subscriptions subscription_row
        on subscription_row.consent_id = consent_row.id
      where consent_row.device_id = '30000000-0000-4000-8000-000000000011'
      group by consent_row.id
    ),
  'predecessor-null enable clears paused residue and creates a new epoch'
);

select set_config(
  'pgtap.fa03_a4_revoked_before',
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000012',
    '31000000-0000-4000-8000-000000000012',
    '24',
    'https://push.example.test/a4-rotate-revoked'
  )::text,
  true
);

update private.push_device_consents
set state = 'revoked',
    reason_code = 'user_disabled',
    cleanup_token_hash = null
where device_id = '30000000-0000-4000-8000-000000000012';

select set_config(
  'pgtap.fa03_a4_revoked_after',
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000012',
    '31000000-0000-4000-8000-000000000112',
    '25',
    'https://push.example.test/a4-rotate-revoked'
  )::text,
  true
);

select ok(
  current_setting('pgtap.fa03_a4_revoked_after')::jsonb ->> 'kind' = 'committed'
    and current_setting('pgtap.fa03_a4_revoked_after')::jsonb ->> 'consentEpoch'
      <> current_setting('pgtap.fa03_a4_revoked_before')::jsonb ->> 'consentEpoch'
    and (
      select consent_row.state = 'enabled'
        and consent_row.reason_code = 'user_enabled'
        and consent_row.cleanup_token_revoked_at is null
        and count(subscription_row.id) = 1
      from private.push_device_consents consent_row
      left join public.push_subscriptions subscription_row
        on subscription_row.consent_id = consent_row.id
      where consent_row.device_id = '30000000-0000-4000-8000-000000000012'
      group by consent_row.id
    ),
  'predecessor-null enable recovers revoked state without an illegal pause'
);

-- Exact predecessor paths and stale rollback.
select set_config(
  'pgtap.fa03_a4_pred_enabled_before',
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000013',
    '31000000-0000-4000-8000-000000000013',
    '26',
    'https://push.example.test/a4-pred-enabled'
  )::text,
  true
);

select set_config(
  'pgtap.fa03_a4_pred_enabled_after',
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000013',
    '31000000-0000-4000-8000-000000000113',
    '27',
    'https://push.example.test/a4-pred-enabled',
    current_setting('pgtap.fa03_a4_pred_enabled_before')::jsonb ->> 'consentId',
    (current_setting('pgtap.fa03_a4_pred_enabled_before')::jsonb ->> 'consentEpoch')::uuid,
    current_setting('pgtap.fa03_a4_pred_enabled_before')::jsonb ->> 'consentVersion'
  )::text,
  true
);

select is(
  current_setting('pgtap.fa03_a4_pred_enabled_after')::jsonb ->> 'kind',
  'committed',
  'an exact enabled predecessor can rotate to a new binding'
);

select set_config(
  'pgtap.fa03_a4_pred_cleanup_before',
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000014',
    '31000000-0000-4000-8000-000000000014',
    '28',
    'https://push.example.test/a4-pred-cleanup'
  )::text,
  true
);

select is(
  public.quarantine_push_by_token(repeat('28', 32)),
  'OK',
  'token cleanup produces the one-step paused predecessor successor'
);

select set_config(
  'pgtap.fa03_a4_pred_cleanup_after',
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000014',
    '31000000-0000-4000-8000-000000000114',
    '29',
    'https://push.example.test/a4-pred-cleanup',
    current_setting('pgtap.fa03_a4_pred_cleanup_before')::jsonb ->> 'consentId',
    (current_setting('pgtap.fa03_a4_pred_cleanup_before')::jsonb ->> 'consentEpoch')::uuid,
    current_setting('pgtap.fa03_a4_pred_cleanup_before')::jsonb ->> 'consentVersion'
  )::text,
  true
);

select is(
  current_setting('pgtap.fa03_a4_pred_cleanup_after')::jsonb ->> 'kind',
  'committed',
  'the exact cleanup successor re-enables without requiring lost predecessor storage'
);

select set_config(
  'pgtap.fa03_a4_stale_before',
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000015',
    '31000000-0000-4000-8000-000000000015',
    '2a',
    'https://push.example.test/a4-stale-predecessor'
  )::text,
  true
);

select is(
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000015',
    '31000000-0000-4000-8000-000000000115',
    '2b',
    'https://push.example.test/a4-stale-predecessor',
    current_setting('pgtap.fa03_a4_stale_before')::jsonb ->> 'consentId',
    (current_setting('pgtap.fa03_a4_stale_before')::jsonb ->> 'consentEpoch')::uuid,
    '999'
  ),
  '{"kind":"stale","version":1}'::jsonb,
  'a stale predecessor fails closed'
);

select is(
  (
    select concat_ws(
      ':',
      consent_row.state,
      consent_row.client_binding_id,
      count(subscription_row.id)
    )
    from private.push_device_consents consent_row
    left join public.push_subscriptions subscription_row
      on subscription_row.consent_id = consent_row.id
    where consent_row.device_id = '30000000-0000-4000-8000-000000000015'
    group by consent_row.id
  ),
  'enabled:31000000-0000-4000-8000-000000000015:1',
  'stale predecessor rollback preserves the old consent and transport'
);

-- Every exact-retry field is independently significant.
select set_config(
  'pgtap.fa03_a4_retry_matrix',
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000016',
    '31000000-0000-4000-8000-000000000016',
    '30',
    'https://push.example.test/a4-retry-matrix'
  )::text,
  true
);

select is(
  public.enable_push_device_v2(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000016',
    '31000000-0000-4000-8000-000000000016',
    repeat('31', 32),
    'https://push.example.test/a4-retry-matrix',
    'p256dh-30000000-0000-4000-8000-000000000016',
    'auth-30000000-0000-4000-8000-000000000016',
    repeat('cc', 32),
    null,
    null,
    null
  ),
  '{"kind":"stale","version":1}'::jsonb,
  'same-binding retry with another cleanup hash is stale'
);

select is(
  public.enable_push_device_v2(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000016',
    '31000000-0000-4000-8000-000000000016',
    repeat('30', 32),
    'https://push.example.test/a4-retry-matrix-other',
    'p256dh-30000000-0000-4000-8000-000000000016',
    'auth-30000000-0000-4000-8000-000000000016',
    repeat('cc', 32),
    null,
    null,
    null
  ),
  '{"kind":"stale","version":1}'::jsonb,
  'same-binding retry with another endpoint is stale'
);

select is(
  public.enable_push_device_v2(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000016',
    '31000000-0000-4000-8000-000000000016',
    repeat('30', 32),
    'https://push.example.test/a4-retry-matrix',
    'p256dh-30000000-0000-4000-8000-000000000016',
    'different-auth',
    repeat('cc', 32),
    null,
    null,
    null
  ),
  '{"kind":"stale","version":1}'::jsonb,
  'same-binding retry with another auth key is stale'
);

select is(
  public.enable_push_device_v2(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000016',
    '31000000-0000-4000-8000-000000000016',
    repeat('30', 32),
    'https://push.example.test/a4-retry-matrix',
    'p256dh-30000000-0000-4000-8000-000000000016',
    'auth-30000000-0000-4000-8000-000000000016',
    repeat('cd', 32),
    null,
    null,
    null
  ),
  '{"kind":"stale","version":1}'::jsonb,
  'same-binding retry with another VAPID fingerprint is stale'
);

-- Refresh endpoint, p256dh, auth, and VAPID changes each advance one version.
select set_config(
  'pgtap.fa03_a4_refresh_matrix_1',
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000017',
    '31000000-0000-4000-8000-000000000017',
    '32',
    'https://push.example.test/a4-refresh-matrix'
  )::text,
  true
);

select set_config(
  'pgtap.fa03_a4_refresh_matrix_2',
  public.refresh_push_transport_v2(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000017',
    '31000000-0000-4000-8000-000000000017',
    current_setting('pgtap.fa03_a4_refresh_matrix_1')::jsonb ->> 'consentId',
    (current_setting('pgtap.fa03_a4_refresh_matrix_1')::jsonb ->> 'consentEpoch')::uuid,
    current_setting('pgtap.fa03_a4_refresh_matrix_1')::jsonb ->> 'consentVersion',
    'https://push.example.test/a4-refresh-matrix',
    'matrix-p256dh-2',
    'auth-30000000-0000-4000-8000-000000000017',
    repeat('cc', 32)
  )::text,
  true
);

select set_config(
  'pgtap.fa03_a4_refresh_matrix_3',
  public.refresh_push_transport_v2(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000017',
    '31000000-0000-4000-8000-000000000017',
    current_setting('pgtap.fa03_a4_refresh_matrix_2')::jsonb ->> 'consentId',
    (current_setting('pgtap.fa03_a4_refresh_matrix_2')::jsonb ->> 'consentEpoch')::uuid,
    current_setting('pgtap.fa03_a4_refresh_matrix_2')::jsonb ->> 'consentVersion',
    'https://push.example.test/a4-refresh-matrix',
    'matrix-p256dh-2',
    'matrix-auth-3',
    repeat('cc', 32)
  )::text,
  true
);

select set_config(
  'pgtap.fa03_a4_refresh_matrix_4',
  public.refresh_push_transport_v2(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000017',
    '31000000-0000-4000-8000-000000000017',
    current_setting('pgtap.fa03_a4_refresh_matrix_3')::jsonb ->> 'consentId',
    (current_setting('pgtap.fa03_a4_refresh_matrix_3')::jsonb ->> 'consentEpoch')::uuid,
    current_setting('pgtap.fa03_a4_refresh_matrix_3')::jsonb ->> 'consentVersion',
    'https://push.example.test/a4-refresh-matrix',
    'matrix-p256dh-2',
    'matrix-auth-3',
    repeat('dd', 32)
  )::text,
  true
);

select set_config(
  'pgtap.fa03_a4_refresh_matrix_5',
  public.refresh_push_transport_v2(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000017',
    '31000000-0000-4000-8000-000000000017',
    current_setting('pgtap.fa03_a4_refresh_matrix_4')::jsonb ->> 'consentId',
    (current_setting('pgtap.fa03_a4_refresh_matrix_4')::jsonb ->> 'consentEpoch')::uuid,
    current_setting('pgtap.fa03_a4_refresh_matrix_4')::jsonb ->> 'consentVersion',
    'https://push.example.test/a4-refresh-matrix-new',
    'matrix-p256dh-2',
    'matrix-auth-3',
    repeat('dd', 32)
  )::text,
  true
);

select is(
  (
    select string_agg(
      result_row.value::jsonb ->> 'consentVersion',
      ','
      order by result_row.ordinality
    )
    from unnest(array[
      current_setting('pgtap.fa03_a4_refresh_matrix_1'),
      current_setting('pgtap.fa03_a4_refresh_matrix_2'),
      current_setting('pgtap.fa03_a4_refresh_matrix_3'),
      current_setting('pgtap.fa03_a4_refresh_matrix_4'),
      current_setting('pgtap.fa03_a4_refresh_matrix_5')
    ]) with ordinality result_row(value, ordinality)
  ),
  '1,2,3,4,5',
  'each independent refresh semantic change advances consent version once'
);

select is(
  (
    select subscription_row.transport_version::text || ':' || subscription_row.endpoint
    from public.push_subscriptions subscription_row
    where subscription_row.consent_id =
      (current_setting('pgtap.fa03_a4_refresh_matrix_5')::jsonb ->> 'consentId')::bigint
  ),
  '5:https://push.example.test/a4-refresh-matrix-new',
  'the transport version matches the four independent refresh changes'
);

-- Different owner and deny registry conflicts roll every tentative write back.
select set_config(
  'pgtap.fa03_a4_other_endpoint',
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c402',
    '30000000-0000-4000-8000-000000000020',
    '31000000-0000-4000-8000-000000000020',
    '40',
    'https://push.example.test/a4-other-owner'
  )::text,
  true
);

select is(
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000021',
    '31000000-0000-4000-8000-000000000021',
    '41',
    'https://push.example.test/a4-other-owner'
  ),
  '{"kind":"endpoint-unavailable","version":1}'::jsonb,
  'a different endpoint owner receives only the generic conflict'
);

select is(
  (
    select count(*)::bigint
    from private.push_device_consents consent_row
    where consent_row.device_id = '30000000-0000-4000-8000-000000000021'
  ),
  0::bigint,
  'different-owner conflict rolls back the tentative consent'
);

insert into private.push_endpoint_registry (
  endpoint_fingerprint,
  owner_profile_id,
  state,
  reason_code
)
select
  pg_catalog.sha256(
    pg_catalog.convert_to('https://push.example.test/a4-deny', 'UTF8')
  ),
  profile_row.id,
  'active',
  'transport_active'
from public.profiles profile_row
where profile_row.user_id = '00000000-0000-0000-0000-00000000c402';

update private.push_endpoint_registry
set owner_profile_id = null
where endpoint_fingerprint = pg_catalog.sha256(
  pg_catalog.convert_to('https://push.example.test/a4-deny', 'UTF8')
);

select is(
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000022',
    '31000000-0000-4000-8000-000000000022',
    '42',
    'https://push.example.test/a4-deny'
  ),
  '{"kind":"endpoint-unavailable","version":1}'::jsonb,
  'an ownerless deny registry is never transferred'
);

select is(
  (
    select concat_ws(
      ':',
      registry_row.state,
      registry_row.reason_code,
      registry_row.owner_profile_id is null
    )
    from private.push_endpoint_registry registry_row
    where registry_row.endpoint_fingerprint = pg_catalog.sha256(
      pg_catalog.convert_to('https://push.example.test/a4-deny', 'UTF8')
    )
  ),
  'deny:owner_deleted:t',
  'deny conflict preserves the ownerless registry state'
);

-- A same-owner endpoint can move to a new logical device without two active transports.
select set_config(
  'pgtap.fa03_a4_old_device_enabled',
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000030',
    '31000000-0000-4000-8000-000000000030',
    '50',
    'https://push.example.test/a4-move-enabled'
  )::text,
  true
);

select set_config(
  'pgtap.fa03_a4_new_device_enabled',
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000031',
    '31000000-0000-4000-8000-000000000031',
    '51',
    'https://push.example.test/a4-move-enabled'
  )::text,
  true
);

select is(
  (
    select concat_ws(
      ':',
      old_consent.state,
      old_consent.reason_code,
      new_consent.state,
      count(subscription_row.id)
    )
    from private.push_device_consents old_consent
    join private.push_device_consents new_consent
      on new_consent.device_id = '30000000-0000-4000-8000-000000000031'
    left join public.push_subscriptions subscription_row
      on subscription_row.profile_id = old_consent.profile_id
      and subscription_row.endpoint = 'https://push.example.test/a4-move-enabled'
    where old_consent.device_id = '30000000-0000-4000-8000-000000000030'
    group by old_consent.id, new_consent.id
  ),
  'paused:subscription_changed:enabled:1',
  'same-owner replacement pauses the old enabled device and leaves one transport'
);

select set_config(
  'pgtap.fa03_a4_old_device_paused',
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000032',
    '31000000-0000-4000-8000-000000000032',
    '52',
    'https://push.example.test/a4-move-paused'
  )::text,
  true
);

update private.push_device_consents
set state = 'paused',
    reason_code = 'permission_revoked'
where device_id = '30000000-0000-4000-8000-000000000032';

select set_config(
  'pgtap.fa03_a4_new_device_paused',
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000033',
    '31000000-0000-4000-8000-000000000033',
    '53',
    'https://push.example.test/a4-move-paused'
  )::text,
  true
);

select is(
  (
    select concat_ws(
      ':',
      old_consent.state,
      old_consent.reason_code,
      new_consent.state,
      count(subscription_row.id)
    )
    from private.push_device_consents old_consent
    join private.push_device_consents new_consent
      on new_consent.device_id = '30000000-0000-4000-8000-000000000033'
    left join public.push_subscriptions subscription_row
      on subscription_row.profile_id = old_consent.profile_id
      and subscription_row.endpoint = 'https://push.example.test/a4-move-paused'
    where old_consent.device_id = '30000000-0000-4000-8000-000000000032'
    group by old_consent.id, new_consent.id
  ),
  'paused:permission_revoked:enabled:1',
  'same-owner replacement preserves the old paused reason and clears residue'
);

select set_config(
  'pgtap.fa03_a4_old_device_revoked',
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000034',
    '31000000-0000-4000-8000-000000000034',
    '54',
    'https://push.example.test/a4-move-revoked'
  )::text,
  true
);

update private.push_device_consents
set state = 'revoked',
    reason_code = 'user_disabled',
    cleanup_token_hash = null
where device_id = '30000000-0000-4000-8000-000000000034';

select set_config(
  'pgtap.fa03_a4_new_device_revoked',
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000035',
    '31000000-0000-4000-8000-000000000035',
    '55',
    'https://push.example.test/a4-move-revoked'
  )::text,
  true
);

select is(
  (
    select concat_ws(
      ':',
      old_consent.state,
      old_consent.reason_code,
      new_consent.state,
      count(subscription_row.id)
    )
    from private.push_device_consents old_consent
    join private.push_device_consents new_consent
      on new_consent.device_id = '30000000-0000-4000-8000-000000000035'
    left join public.push_subscriptions subscription_row
      on subscription_row.profile_id = old_consent.profile_id
      and subscription_row.endpoint = 'https://push.example.test/a4-move-revoked'
    where old_consent.device_id = '30000000-0000-4000-8000-000000000034'
    group by old_consent.id, new_consent.id
  ),
  'revoked:user_disabled:enabled:1',
  'same-owner replacement preserves revoked state and clears its residue'
);

-- Legacy coexistence is enable-only and never transfers ownership.
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
select
  profile_row.id,
  'https://push.example.test/a4-legacy-owner',
  'legacy-owner-key',
  'legacy-owner-auth'
from public.profiles profile_row
where profile_row.user_id = '00000000-0000-0000-0000-00000000c401';

select is(
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000040',
    '31000000-0000-4000-8000-000000000040',
    '60',
    'https://push.example.test/a4-legacy-owner'
  ) ->> 'kind',
  'committed',
  'same-owner legacy transport is replaced by v2 in one transaction'
);

select is(
  (
    select concat_ws(
      ':',
      count(*) filter (where subscription_row.consent_id is null),
      count(*) filter (where subscription_row.consent_id is not null)
    )
    from public.push_subscriptions subscription_row
    where subscription_row.endpoint = 'https://push.example.test/a4-legacy-owner'
  ),
  '0:1',
  'legacy replacement leaves no duplicate transport'
);

insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
select
  profile_row.id,
  'https://push.example.test/a4-legacy-other',
  'legacy-other-key',
  'legacy-other-auth'
from public.profiles profile_row
where profile_row.user_id = '00000000-0000-0000-0000-00000000c402';

select is(
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000041',
    '31000000-0000-4000-8000-000000000041',
    '61',
    'https://push.example.test/a4-legacy-other'
  ),
  '{"kind":"endpoint-unavailable","version":1}'::jsonb,
  'different-owner legacy transport is never transferred'
);

select is(
  (
    select count(*)::bigint
    from public.push_subscriptions subscription_row
    join public.profiles profile_row on profile_row.id = subscription_row.profile_id
    where subscription_row.endpoint = 'https://push.example.test/a4-legacy-other'
      and subscription_row.consent_id is null
      and profile_row.user_id = '00000000-0000-0000-0000-00000000c402'
  ),
  1::bigint,
  'different-owner conflict preserves the legacy transport'
);

-- Canary mode is fail-closed until the profile is explicitly listed.
update private.notification_runtime_control
set new_runtime_mode = 'canary';

select is(
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000050',
    '31000000-0000-4000-8000-000000000050',
    '70',
    'https://push.example.test/a4-canary'
  ),
  '{"kind":"runtime-disabled","version":1}'::jsonb,
  'canary mode denies a profile outside the server allowlist'
);

insert into private.notification_runtime_canary_profiles (profile_id)
select profile_row.id
from public.profiles profile_row
where profile_row.user_id = '00000000-0000-0000-0000-00000000c401';

select is(
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000050',
    '31000000-0000-4000-8000-000000000050',
    '70',
    'https://push.example.test/a4-canary'
  ) ->> 'kind',
  'committed',
  'canary mode permits an explicitly listed profile'
);

update private.notification_runtime_control
set new_runtime_mode = 'enabled';

-- Refresh owner conflict rolls back without touching the old transport.
select set_config(
  'pgtap.fa03_a4_refresh_conflict_before',
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000060',
    '31000000-0000-4000-8000-000000000060',
    '80',
    'https://push.example.test/a4-refresh-conflict-source'
  )::text,
  true
);

select is(
  public.refresh_push_transport_v2(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000060',
    '31000000-0000-4000-8000-000000000060',
    current_setting('pgtap.fa03_a4_refresh_conflict_before')::jsonb ->> 'consentId',
    (current_setting('pgtap.fa03_a4_refresh_conflict_before')::jsonb ->> 'consentEpoch')::uuid,
    current_setting('pgtap.fa03_a4_refresh_conflict_before')::jsonb ->> 'consentVersion',
    'https://push.example.test/a4-other-owner',
    'conflict-key',
    'conflict-auth',
    repeat('ee', 32)
  ),
  '{"kind":"endpoint-unavailable","version":1}'::jsonb,
  'refresh cannot move a binding onto another owner endpoint'
);

select is(
  (
    select concat_ws(
      ':',
      consent_row.version,
      subscription_row.transport_version,
      subscription_row.endpoint
    )
    from private.push_device_consents consent_row
    join public.push_subscriptions subscription_row
      on subscription_row.consent_id = consent_row.id
    where consent_row.device_id = '30000000-0000-4000-8000-000000000060'
  ),
  '1:1:https://push.example.test/a4-refresh-conflict-source',
  'refresh owner conflict rolls the consent and transport back'
);

-- Existing authenticated owner quarantine and v2 enable converge in one test transaction.
select set_config(
  'pgtap.fa03_a4_owner_interleave_before',
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000061',
    '31000000-0000-4000-8000-000000000061',
    '81',
    'https://push.example.test/a4-owner-interleave'
  )::text,
  true
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-00000000c401',
  true
);
select is(
  public.quarantine_push_device(
    '30000000-0000-4000-8000-000000000061',
    (current_setting('pgtap.fa03_a4_owner_interleave_before')::jsonb ->> 'consentEpoch')::uuid,
    (current_setting('pgtap.fa03_a4_owner_interleave_before')::jsonb ->> 'consentVersion')::bigint
  ),
  'OK',
  'existing owner quarantine runs between two v2 enable calls'
);
reset role;

select set_config(
  'pgtap.fa03_a4_owner_interleave_after',
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000061',
    '31000000-0000-4000-8000-000000000161',
    '82',
    'https://push.example.test/a4-owner-interleave'
  )::text,
  true
);

select is(
  (
    select concat_ws(
      ':',
      current_setting('pgtap.fa03_a4_owner_interleave_after')::jsonb ->> 'kind',
      consent_row.state,
      consent_row.reason_code,
      count(subscription_row.id)
    )
    from private.push_device_consents consent_row
    left join public.push_subscriptions subscription_row
      on subscription_row.consent_id = consent_row.id
    where consent_row.device_id = '30000000-0000-4000-8000-000000000061'
    group by consent_row.id
  ),
  'committed:enabled:user_enabled:1',
  'owner quarantine followed by explicit enable converges to one active transport'
);

-- The parent and paused direct-child paths produce identical residue cleanup.
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
    profile_row.id,
    court_row.id,
    '雙打',
    date_trunc('minute', now()) + interval '45 days',
    3,
    '__fa03_a4_residue__'
  from public.sports sport_row
  join public.profiles profile_row
    on profile_row.user_id = '00000000-0000-0000-0000-00000000c401'
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
  'pgtap.fa03_a4_residue_session_id',
  (select inserted_session.id::text from inserted_session),
  true
);

insert into public.session_participants (session_id, profile_id, role, status)
select
  current_setting('pgtap.fa03_a4_residue_session_id')::bigint,
  profile_row.id,
  'host',
  'accepted'
from public.profiles profile_row
where profile_row.user_id = '00000000-0000-0000-0000-00000000c401';

create function pg_temp.create_a4_outbox()
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
  select
    'session_updated',
    profile_row.id,
    current_setting('pgtap.fa03_a4_residue_session_id')::bigint,
    '{"message":"FA03 A4 residue fixture"}'::jsonb
  from public.profiles profile_row
  where profile_row.user_id = '00000000-0000-0000-0000-00000000c401'
  returning id into created_outbox_id;
  return created_outbox_id;
end;
$$;

select set_config(
  'pgtap.fa03_a4_parent_fixture',
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000070',
    '31000000-0000-4000-8000-000000000070',
    '90',
    'https://push.example.test/a4-residue-parent'
  )::text,
  true
);
select set_config(
  'pgtap.fa03_a4_child_fixture',
  pg_temp.enable_a4(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000071',
    '31000000-0000-4000-8000-000000000071',
    '91',
    'https://push.example.test/a4-residue-child'
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
  pg_temp.create_a4_outbox(),
  consent_row.profile_id,
  consent_row.id,
  consent_row.consent_epoch
from private.push_device_consents consent_row
where consent_row.device_id in (
  '30000000-0000-4000-8000-000000000070',
  '30000000-0000-4000-8000-000000000071'
);

update private.push_device_consents
set state = 'paused',
    reason_code = 'user_logout'
where device_id = '30000000-0000-4000-8000-000000000071';

create function pg_temp.run_a4_parent_cleanup(
  p_consent_id bigint,
  p_consent_epoch uuid
)
returns void
language plpgsql
as $$
begin
  perform 1
  from private.push_device_consents consent_row
  where consent_row.id = p_consent_id
  for update;
  perform private.quarantine_locked_push_consent(
    p_consent_id,
    p_consent_epoch,
    'subscription_changed'
  );
end;
$$;

create function pg_temp.run_a4_child_cleanup(
  p_consent_id bigint,
  p_consent_epoch uuid
)
returns void
language plpgsql
as $$
begin
  perform 1
  from private.push_device_consents consent_row
  where consent_row.id = p_consent_id
  for update;
  perform private.clear_locked_push_consent_residue(
    p_consent_id,
    p_consent_epoch
  );
end;
$$;

select lives_ok(
  format(
    'select pg_temp.run_a4_parent_cleanup(%s, %L)',
    current_setting('pgtap.fa03_a4_parent_fixture')::jsonb ->> 'consentId',
    current_setting('pgtap.fa03_a4_parent_fixture')::jsonb ->> 'consentEpoch'
  ),
  'the parent helper accepts subscription_changed while the consent is locked'
);

select lives_ok(
  format(
    'select pg_temp.run_a4_child_cleanup(%s, %L)',
    current_setting('pgtap.fa03_a4_child_fixture')::jsonb ->> 'consentId',
    current_setting('pgtap.fa03_a4_child_fixture')::jsonb ->> 'consentEpoch'
  ),
  'the direct child path clears paused residue while the consent is locked'
);

select is(
  (
    select string_agg(
      fixture_row.result,
      ','
      order by fixture_row.device_id
    )
    from (
      select
        consent_row.device_id,
        concat_ws(
          ':',
          consent_row.device_id,
          registry_row.state,
          registry_row.reason_code,
          count(subscription_row.id),
          min(delivery_row.state),
          min(delivery_row.error_code)
        ) as result
      from private.push_device_consents consent_row
      join private.push_endpoint_registry registry_row
        on registry_row.owner_profile_id = consent_row.profile_id
        and registry_row.endpoint_fingerprint = case consent_row.device_id
          when '30000000-0000-4000-8000-000000000070'::uuid then
            pg_catalog.sha256(
              pg_catalog.convert_to('https://push.example.test/a4-residue-parent', 'UTF8')
            )
          else
            pg_catalog.sha256(
              pg_catalog.convert_to('https://push.example.test/a4-residue-child', 'UTF8')
            )
        end
      left join public.push_subscriptions subscription_row
        on subscription_row.consent_id = consent_row.id
      join private.notification_deliveries delivery_row
        on delivery_row.consent_id = consent_row.id
      where consent_row.device_id in (
        '30000000-0000-4000-8000-000000000070',
        '30000000-0000-4000-8000-000000000071'
      )
      group by consent_row.id, registry_row.fingerprint_algorithm,
        registry_row.endpoint_fingerprint
    ) fixture_row
  ),
  '30000000-0000-4000-8000-000000000070:quarantined:consent_paused:0:cancelled:consent_inactive,30000000-0000-4000-8000-000000000071:quarantined:consent_paused:0:cancelled:consent_inactive',
  'parent and paused direct-child paths leave identical residue state'
);

select is(
  public.enable_push_device_v2(
    '00000000-0000-0000-0000-00000000c401',
    '30000000-0000-4000-8000-000000000080',
    '31000000-0000-4000-8000-000000000080',
    repeat('a0', 32),
    'https://push.example.test/a4-default-predecessor',
    'default-predecessor-key',
    'default-predecessor-auth',
    repeat('ef', 32)
  ) ->> 'kind',
  'committed',
  'initial enable may omit all three predecessor parameters together'
);

select * from finish();
rollback;
