begin;

select no_plan();

-- dblink is test-only: it is created inside this transaction and disappears on
-- rollback. The two named connections are independent PostgreSQL sessions.
create extension if not exists dblink with schema extensions;

select is(
  extensions.dblink_connect(
    'fa03_d1_a',
    'host=supabase_db_tennisPartnerFinder port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'first independent database connection is available'
);
select is(
  extensions.dblink_connect(
    'fa03_d1_b',
    'host=supabase_db_tennisPartnerFinder port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'second independent database connection is available'
);

create temporary table fa03_d1_concurrency_results (
  scenario text not null,
  connection_name text not null,
  result jsonb not null
) on commit drop;

-- Make repeated local runs recoverable, then create committed identities that
-- both dblink sessions can see. This cleanup touches only fixed test UUIDs.
select extensions.dblink_exec(
  'fa03_d1_a',
  $setup$
    delete from public.push_subscriptions
    where profile_id in (
      select id from public.profiles
      where user_id between
        '00000000-0000-0000-0000-00000000e101'::uuid
        and '00000000-0000-0000-0000-00000000e109'::uuid
    );
    delete from private.push_endpoint_registry
    where owner_profile_id in (
      select id from public.profiles
      where user_id between
        '00000000-0000-0000-0000-00000000e101'::uuid
        and '00000000-0000-0000-0000-00000000e109'::uuid
    );
    delete from private.push_device_consents
    where profile_id in (
      select id from public.profiles
      where user_id between
        '00000000-0000-0000-0000-00000000e101'::uuid
        and '00000000-0000-0000-0000-00000000e109'::uuid
    );
    delete from public.profiles
    where user_id between
      '00000000-0000-0000-0000-00000000e101'::uuid
      and '00000000-0000-0000-0000-00000000e109'::uuid;
    delete from auth.users
    where id between
      '00000000-0000-0000-0000-00000000e101'::uuid
      and '00000000-0000-0000-0000-00000000e109'::uuid;

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
    select
      ('00000000-0000-0000-0000-00000000e1'
        || lpad(identity_row.ordinal::text, 2, '0'))::uuid,
      '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated',
      'authenticated',
      'fa03-d1-concurrency-' || identity_row.ordinal::text || '@example.test',
      'test',
      statement_timestamp(),
      statement_timestamp(),
      statement_timestamp(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb
    from generate_series(1, 9) identity_row(ordinal);

    insert into public.profiles (user_id, nickname, ntrp)
    select
      user_row.id,
      'D1 Concurrency ' || row_number() over (order by user_row.id)::text,
      3.5
    from auth.users user_row
    where user_row.id between
      '00000000-0000-0000-0000-00000000e101'::uuid
      and '00000000-0000-0000-0000-00000000e109'::uuid;

    update private.notification_runtime_control
    set worker_generation = 1,
        dispatch_enabled = true,
        new_runtime_mode = 'enabled',
        legacy_writes_enabled = true,
        legacy_outbox_handled = false,
        legacy_cutoff_at = null,
        worker_lease_duration = interval '10 minutes',
        request_deadline_duration = interval '1 minute',
        delivery_lease_duration = interval '2 minutes',
        max_delivery_attempts = 3,
        push_ttl_safety_budget = interval '0 seconds'
    where singleton_id = 1;
  $setup$
);

-- Race 1: two first-time requests for the same owner/device. The unique insert
-- boundary and consent lock must converge to one consent without deadlock.
select is(
  extensions.dblink_send_query(
    'fa03_d1_a',
    $query$
      with mutation as materialized (
        select public.enable_push_device_v2(
          '00000000-0000-0000-0000-00000000e101',
          '21000000-0000-4000-8000-00000000e101',
          '22000000-0000-4000-8000-00000000e101',
          repeat('01', 32),
          'https://push.example.test/fa03-d1-consent-insert',
          'p256dh-consent-insert',
          'auth-consent-insert',
          repeat('a1', 32)
        ) as result
      ), pause as materialized (
        select pg_sleep(0.25) from mutation
      )
      select mutation.result::text from mutation cross join pause
    $query$
  ),
  1,
  'same-consent race starts on connection A'
);
select pg_sleep(0.05);
select is(
  extensions.dblink_send_query(
    'fa03_d1_b',
    $query$
      select public.enable_push_device_v2(
        '00000000-0000-0000-0000-00000000e101',
        '21000000-0000-4000-8000-00000000e101',
        '22000000-0000-4000-8000-00000000e101',
        repeat('01', 32),
        'https://push.example.test/fa03-d1-consent-insert',
        'p256dh-consent-insert',
        'auth-consent-insert',
        repeat('a1', 32)
      )::text
    $query$
  ),
  1,
  'same-consent race starts on connection B'
);

insert into fa03_d1_concurrency_results
select 'consent_insert', 'b', result_value::jsonb
from extensions.dblink_get_result('fa03_d1_b') as result_row(result_value text);
insert into fa03_d1_concurrency_results
select 'consent_insert', 'a', result_value::jsonb
from extensions.dblink_get_result('fa03_d1_a') as result_row(result_value text);
insert into fa03_d1_concurrency_results
select 'consent_insert_drain', 'b', result_value::jsonb
from extensions.dblink_get_result('fa03_d1_b') as result_row(result_value text);
insert into fa03_d1_concurrency_results
select 'consent_insert_drain', 'a', result_value::jsonb
from extensions.dblink_get_result('fa03_d1_a') as result_row(result_value text);

select is(
  (
    select string_agg(result ->> 'kind', ',' order by connection_name)
    from fa03_d1_concurrency_results
    where scenario = 'consent_insert'
  ),
  'committed,unavailable',
  'concurrent same-device inserts fail closed for one caller without residue'
);
select is(
  (
    select count(*)::bigint
    from private.push_device_consents consent_row
    join public.profiles profile_row on profile_row.id = consent_row.profile_id
    where profile_row.user_id =
      '00000000-0000-0000-0000-00000000e101'
  ),
  1::bigint,
  'same-device race leaves exactly one consent row'
);

-- Race 2: different owners attempt the same endpoint for the first time. The
-- registry fingerprint lock must admit one owner and reject the other.
select is(
  extensions.dblink_send_query(
    'fa03_d1_a',
    $query$
      with mutation as materialized (
        select public.enable_push_device_v2(
          '00000000-0000-0000-0000-00000000e102',
          '21000000-0000-4000-8000-00000000e102',
          '22000000-0000-4000-8000-00000000e102',
          repeat('02', 32),
          'https://push.example.test/fa03-d1-registry-insert',
          'p256dh-registry-a',
          'auth-registry-a',
          repeat('a2', 32)
        ) as result
      ), pause as materialized (
        select pg_sleep(0.25) from mutation
      )
      select mutation.result::text from mutation cross join pause
    $query$
  ),
  1,
  'same-registry race starts on connection A'
);
select pg_sleep(0.05);
select is(
  extensions.dblink_send_query(
    'fa03_d1_b',
    $query$
      select public.enable_push_device_v2(
        '00000000-0000-0000-0000-00000000e103',
        '21000000-0000-4000-8000-00000000e103',
        '22000000-0000-4000-8000-00000000e103',
        repeat('03', 32),
        'https://push.example.test/fa03-d1-registry-insert',
        'p256dh-registry-b',
        'auth-registry-b',
        repeat('a3', 32)
      )::text
    $query$
  ),
  1,
  'same-registry race starts on connection B'
);

insert into fa03_d1_concurrency_results
select 'registry_insert', 'b', result_value::jsonb
from extensions.dblink_get_result('fa03_d1_b') as result_row(result_value text);
insert into fa03_d1_concurrency_results
select 'registry_insert', 'a', result_value::jsonb
from extensions.dblink_get_result('fa03_d1_a') as result_row(result_value text);
insert into fa03_d1_concurrency_results
select 'registry_insert_drain', 'b', result_value::jsonb
from extensions.dblink_get_result('fa03_d1_b') as result_row(result_value text);
insert into fa03_d1_concurrency_results
select 'registry_insert_drain', 'a', result_value::jsonb
from extensions.dblink_get_result('fa03_d1_a') as result_row(result_value text);

select is(
  (
    select string_agg(result ->> 'kind', ',' order by result ->> 'kind')
    from fa03_d1_concurrency_results
    where scenario = 'registry_insert'
  ),
  'committed,endpoint-unavailable',
  'same endpoint admits one owner and rejects the other without an orphan'
);
select is(
  (
    select count(*)::bigint
    from private.push_device_consents consent_row
    join public.profiles profile_row on profile_row.id = consent_row.profile_id
    where profile_row.user_id in (
      '00000000-0000-0000-0000-00000000e102',
      '00000000-0000-0000-0000-00000000e103'
    )
  ),
  1::bigint,
  'losing endpoint owner leaves no consent residue'
);

-- Race 3: different owners collide on the cleanup-token digest while using
-- different endpoints. The unique digest boundary must roll back one request.
select is(
  extensions.dblink_send_query(
    'fa03_d1_a',
    $query$
      with mutation as materialized (
        select public.enable_push_device_v2(
          '00000000-0000-0000-0000-00000000e104',
          '21000000-0000-4000-8000-00000000e104',
          '22000000-0000-4000-8000-00000000e104',
          repeat('04', 32),
          'https://push.example.test/fa03-d1-cleanup-a',
          'p256dh-cleanup-a',
          'auth-cleanup-a',
          repeat('a4', 32)
        ) as result
      ), pause as materialized (
        select pg_sleep(0.25) from mutation
      )
      select mutation.result::text from mutation cross join pause
    $query$
  ),
  1,
  'cleanup-hash race starts on connection A'
);
select pg_sleep(0.05);
select is(
  extensions.dblink_send_query(
    'fa03_d1_b',
    $query$
      select public.enable_push_device_v2(
        '00000000-0000-0000-0000-00000000e105',
        '21000000-0000-4000-8000-00000000e105',
        '22000000-0000-4000-8000-00000000e105',
        repeat('04', 32),
        'https://push.example.test/fa03-d1-cleanup-b',
        'p256dh-cleanup-b',
        'auth-cleanup-b',
        repeat('a5', 32)
      )::text
    $query$
  ),
  1,
  'cleanup-hash race starts on connection B'
);

insert into fa03_d1_concurrency_results
select 'cleanup_hash', 'b', result_value::jsonb
from extensions.dblink_get_result('fa03_d1_b') as result_row(result_value text);
insert into fa03_d1_concurrency_results
select 'cleanup_hash', 'a', result_value::jsonb
from extensions.dblink_get_result('fa03_d1_a') as result_row(result_value text);
insert into fa03_d1_concurrency_results
select 'cleanup_hash_drain', 'b', result_value::jsonb
from extensions.dblink_get_result('fa03_d1_b') as result_row(result_value text);
insert into fa03_d1_concurrency_results
select 'cleanup_hash_drain', 'a', result_value::jsonb
from extensions.dblink_get_result('fa03_d1_a') as result_row(result_value text);

select is(
  (
    select string_agg(result ->> 'kind', ',' order by result ->> 'kind')
    from fa03_d1_concurrency_results
    where scenario = 'cleanup_hash'
  ),
  'committed,unavailable',
  'cleanup hash collision commits one request and rolls back the other'
);
select is(
  (
    select count(*)::bigint
    from private.push_device_consents
    where cleanup_token_hash = decode(repeat('04', 32), 'hex')
  ),
  1::bigint,
  'cleanup hash collision leaves exactly one consent owner'
);

-- Deadlock probe: two owners try to swap their active endpoints. Both commands
-- lock the old/new registry fingerprints in byte order, so neither can form a
-- cycle; both return endpoint-unavailable and retain their original transport.
select extensions.dblink_exec(
  'fa03_d1_a',
  $setup$
    do $body$
    begin
      perform public.enable_push_device_v2(
        '00000000-0000-0000-0000-00000000e106',
        '21000000-0000-4000-8000-00000000e106',
        '22000000-0000-4000-8000-00000000e106',
        repeat('06', 32),
        'https://push.example.test/fa03-d1-swap-a',
        'p256dh-swap-a',
        'auth-swap-a',
        repeat('a6', 32)
      );
      perform public.enable_push_device_v2(
        '00000000-0000-0000-0000-00000000e107',
        '21000000-0000-4000-8000-00000000e107',
        '22000000-0000-4000-8000-00000000e107',
        repeat('07', 32),
        'https://push.example.test/fa03-d1-swap-b',
        'p256dh-swap-b',
        'auth-swap-b',
        repeat('a7', 32)
      );
    end
    $body$;
  $setup$
);

select is(
  extensions.dblink_send_query(
    'fa03_d1_a',
    format(
      $query$
        with mutation as materialized (
          select public.refresh_push_transport_v2(
            '00000000-0000-0000-0000-00000000e106',
            '21000000-0000-4000-8000-00000000e106',
            '22000000-0000-4000-8000-00000000e106',
            %L,
            %L::uuid,
            %L,
            'https://push.example.test/fa03-d1-swap-b',
            'p256dh-swap-a-new',
            'auth-swap-a-new',
            repeat('a6', 32)
          ) as result
        ), pause as materialized (
          select pg_sleep(0.25) from mutation
        )
        select mutation.result::text from mutation cross join pause
      $query$,
      consent_row.id::text,
      consent_row.consent_epoch::text,
      consent_row.version::text
    )
  ),
  1,
  'cross-endpoint refresh starts on connection A'
)
from private.push_device_consents consent_row
join public.profiles profile_row on profile_row.id = consent_row.profile_id
where profile_row.user_id = '00000000-0000-0000-0000-00000000e106';
select pg_sleep(0.05);
select is(
  extensions.dblink_send_query(
    'fa03_d1_b',
    format(
      $query$
        select public.refresh_push_transport_v2(
          '00000000-0000-0000-0000-00000000e107',
          '21000000-0000-4000-8000-00000000e107',
          '22000000-0000-4000-8000-00000000e107',
          %L,
          %L::uuid,
          %L,
          'https://push.example.test/fa03-d1-swap-a',
          'p256dh-swap-b-new',
          'auth-swap-b-new',
          repeat('a7', 32)
        )::text
      $query$,
      consent_row.id::text,
      consent_row.consent_epoch::text,
      consent_row.version::text
    )
  ),
  1,
  'cross-endpoint refresh starts on connection B'
)
from private.push_device_consents consent_row
join public.profiles profile_row on profile_row.id = consent_row.profile_id
where profile_row.user_id = '00000000-0000-0000-0000-00000000e107';

insert into fa03_d1_concurrency_results
select 'deadlock_swap', 'b', result_value::jsonb
from extensions.dblink_get_result('fa03_d1_b') as result_row(result_value text);
insert into fa03_d1_concurrency_results
select 'deadlock_swap', 'a', result_value::jsonb
from extensions.dblink_get_result('fa03_d1_a') as result_row(result_value text);
insert into fa03_d1_concurrency_results
select 'deadlock_swap_drain', 'b', result_value::jsonb
from extensions.dblink_get_result('fa03_d1_b') as result_row(result_value text);
insert into fa03_d1_concurrency_results
select 'deadlock_swap_drain', 'a', result_value::jsonb
from extensions.dblink_get_result('fa03_d1_a') as result_row(result_value text);

select is(
  (
    select string_agg(result ->> 'kind', ',' order by connection_name)
    from fa03_d1_concurrency_results
    where scenario = 'deadlock_swap'
  ),
  'endpoint-unavailable,endpoint-unavailable',
  'cross-endpoint lock contention completes without deadlock'
);
select is(
  (
    select string_agg(
      subscription_row.endpoint,
      ',' order by subscription_row.endpoint
    )
    from public.push_subscriptions subscription_row
    join public.profiles profile_row
      on profile_row.id = subscription_row.profile_id
    where profile_row.user_id in (
      '00000000-0000-0000-0000-00000000e106',
      '00000000-0000-0000-0000-00000000e107'
    )
  ),
  'https://push.example.test/fa03-d1-swap-a,https://push.example.test/fa03-d1-swap-b',
  'failed cross-swap keeps both original transports intact'
);

-- Dispatcher claim probe: two current workers target one committed delivery.
-- Connection A deliberately holds its transaction after claim; connection B
-- must SKIP LOCKED and return empty instead of waiting or double-reserving.
select extensions.dblink_exec(
  'fa03_d1_a',
  $setup$
    do $body$
    declare
      host_profile_id bigint;
      recipient_profile_id bigint;
      created_session_id bigint;
      consent_row private.push_device_consents%rowtype;
      session_row public.sessions%rowtype;
      outbox_id bigint;
      frozen_at timestamptz := clock_timestamp();
    begin
      select id into host_profile_id from public.profiles
      where user_id = '00000000-0000-0000-0000-00000000e108';
      select id into recipient_profile_id from public.profiles
      where user_id = '00000000-0000-0000-0000-00000000e109';

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
        host_profile_id,
        court_row.id,
        '練球',
        statement_timestamp() + interval '1 day',
        2,
        'open'
      from public.sports sport_row
      cross join lateral (
        select id from public.courts
        where is_active and city = '台北市'
        order by id limit 1
      ) court_row
      where sport_row.code = 'tennis'
      returning id into created_session_id;

      insert into public.session_participants (
        session_id, profile_id, role, status
      ) values (
        created_session_id,
        host_profile_id,
        'host',
        'accepted'
      );
      insert into public.session_participants (
        session_id, profile_id, role, status
      ) values (
        created_session_id,
        recipient_profile_id,
        'guest',
        'requested'
      );
      update public.session_participants
      set status = 'accepted'
      where public.session_participants.session_id = created_session_id
        and profile_id = recipient_profile_id;

      perform public.enable_push_device_v2(
        '00000000-0000-0000-0000-00000000e109',
        '21000000-0000-4000-8000-00000000e109',
        '22000000-0000-4000-8000-00000000e109',
        repeat('09', 32),
        'https://push.example.test/fa03-d1-claim',
        'p256dh-claim',
        'auth-claim',
        repeat('a9', 32)
      );

      select * into consent_row
      from private.push_device_consents
      where profile_id = recipient_profile_id;
      select * into session_row
      from public.sessions
      where id = created_session_id;

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
      ) values (
        'session_updated',
        recipient_profile_id,
        created_session_id,
        private.notification_session_payload(created_session_id, 'claim race'),
        frozen_at,
        frozen_at + interval '1 day',
        session_row.notification_state_version,
        2,
        'session_state',
        created_session_id,
        'frozen',
        frozen_at
      ) returning id into outbox_id;

      insert into private.notification_deliveries (
        outbox_id,
        recipient_profile_id,
        consent_id,
        consent_epoch
      ) values (
        outbox_id,
        recipient_profile_id,
        consent_row.id,
        consent_row.consent_epoch
      );

      perform notification_dispatcher_api.begin_notification_dispatch_worker(1);
      perform notification_dispatcher_api.begin_notification_dispatch_worker(1);
    end
    $body$;
  $setup$
);

select is(
  extensions.dblink_send_query(
    'fa03_d1_a',
    format(
      $query$
        with claimed as materialized (
          select notification_dispatcher_api.claim_notification_delivery(%L::uuid) as result
        ), pause as materialized (
          select pg_sleep(0.25) from claimed
        )
        select claimed.result::text from claimed cross join pause
      $query$,
      worker_row.worker_token::text
    )
  ),
  1,
  'delivery claim starts on connection A'
)
from private.notification_dispatch_workers worker_row
where worker_row.state = 'running'
order by worker_row.id
limit 1;
select pg_sleep(0.05);
select is(
  extensions.dblink_send_query(
    'fa03_d1_b',
    format(
      'select notification_dispatcher_api.claim_notification_delivery(%L::uuid)::text',
      worker_row.worker_token::text
    )
  ),
  1,
  'delivery claim starts on connection B'
)
from private.notification_dispatch_workers worker_row
where worker_row.state = 'running'
order by worker_row.id desc
limit 1;

insert into fa03_d1_concurrency_results
select 'delivery_claim', 'b', result_value::jsonb
from extensions.dblink_get_result('fa03_d1_b') as result_row(result_value text);
insert into fa03_d1_concurrency_results
select 'delivery_claim', 'a', result_value::jsonb
from extensions.dblink_get_result('fa03_d1_a') as result_row(result_value text);
insert into fa03_d1_concurrency_results
select 'delivery_claim_drain', 'b', result_value::jsonb
from extensions.dblink_get_result('fa03_d1_b') as result_row(result_value text);
insert into fa03_d1_concurrency_results
select 'delivery_claim_drain', 'a', result_value::jsonb
from extensions.dblink_get_result('fa03_d1_a') as result_row(result_value text);

select is(
  (
    select string_agg(result ->> 'kind', ',' order by result ->> 'kind')
    from fa03_d1_concurrency_results
    where scenario = 'delivery_claim'
  ),
  'claimed,empty',
  'two workers reserve one delivery exactly once with SKIP LOCKED'
);
select is(
  (
    select delivery_row.state || ':' || delivery_row.attempts::text
    from private.notification_deliveries delivery_row
    join public.notification_outbox outbox_row
      on outbox_row.id = delivery_row.outbox_id
    where outbox_row.payload ->> 'message' = 'claim race'
  ),
  'processing:1',
  'claim contention leaves one processing attempt and one claim token'
);

select is(
  extensions.dblink_disconnect('fa03_d1_b'),
  'OK',
  'second dblink connection closes cleanly'
);

-- Restore the exact dormant defaults and remove committed test fixtures before
-- closing the last connection. This makes the test safe to rerun locally.
select extensions.dblink_exec(
  'fa03_d1_a',
  $cleanup$
    delete from public.sessions
    where host_profile_id in (
      select id from public.profiles
      where user_id between
        '00000000-0000-0000-0000-00000000e101'::uuid
        and '00000000-0000-0000-0000-00000000e109'::uuid
    );
    delete from public.push_subscriptions
    where profile_id in (
      select id from public.profiles
      where user_id between
        '00000000-0000-0000-0000-00000000e101'::uuid
        and '00000000-0000-0000-0000-00000000e109'::uuid
    );
    delete from private.push_endpoint_registry
    where owner_profile_id in (
      select id from public.profiles
      where user_id between
        '00000000-0000-0000-0000-00000000e101'::uuid
        and '00000000-0000-0000-0000-00000000e109'::uuid
    );
    delete from private.push_device_consents
    where profile_id in (
      select id from public.profiles
      where user_id between
        '00000000-0000-0000-0000-00000000e101'::uuid
        and '00000000-0000-0000-0000-00000000e109'::uuid
    );
    delete from public.profiles
    where user_id between
      '00000000-0000-0000-0000-00000000e101'::uuid
      and '00000000-0000-0000-0000-00000000e109'::uuid;
    delete from auth.users
    where id between
      '00000000-0000-0000-0000-00000000e101'::uuid
      and '00000000-0000-0000-0000-00000000e109'::uuid;
    delete from private.notification_dispatch_workers;
    update private.notification_runtime_control
    set worker_generation = 1,
        dispatch_enabled = true,
        new_runtime_mode = 'disabled',
        legacy_writes_enabled = true,
        legacy_outbox_handled = false,
        legacy_cutoff_at = null,
        worker_lease_duration = null,
        request_deadline_duration = null,
        delivery_lease_duration = null,
        max_delivery_attempts = null,
        push_ttl_safety_budget = null
    where singleton_id = 1;
  $cleanup$
);

select is(
  extensions.dblink_disconnect('fa03_d1_a'),
  'OK',
  'first dblink connection closes cleanly after cleanup'
);

select is(
  (
    select concat_ws(
      ':',
      new_runtime_mode,
      coalesce(worker_lease_duration::text, 'null'),
      coalesce(request_deadline_duration::text, 'null'),
      coalesce(delivery_lease_duration::text, 'null'),
      coalesce(max_delivery_attempts::text, 'null'),
      coalesce(push_ttl_safety_budget::text, 'null')
    )
    from private.notification_runtime_control
    where singleton_id = 1
  ),
  'disabled:null:null:null:null:null',
  'concurrency test restores the dormant runtime configuration'
);

select is(
  (
    select count(*)::bigint
    from auth.users
    where id between
      '00000000-0000-0000-0000-00000000e101'::uuid
      and '00000000-0000-0000-0000-00000000e109'::uuid
  ),
  0::bigint,
  'concurrency test removes every committed identity fixture'
);

select * from finish();

rollback;
