-- Keep a scheduled format-2 dispatcher fully data-free while either database
-- dispatch control is disabled. This replaces only the existing command body;
-- ownership, signature, ACL, and the dedicated role stay unchanged.

create or replace function notification_dispatcher_api.begin_notification_dispatch_worker(
  p_expected_generation bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  control_row private.notification_runtime_control%rowtype;
  worker_row private.notification_dispatch_workers%rowtype;
  database_now timestamptz;
begin
  if p_expected_generation is null or p_expected_generation <= 0 then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'rejected',
      'code', 'invalid_generation'
    );
  end if;

  select *
  into control_row
  from private.notification_runtime_control
  where singleton_id = 1
  for share;

  if not found then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'unavailable',
      'code', 'runtime_control_missing'
    );
  end if;

  database_now := pg_catalog.clock_timestamp();

  if not control_row.dispatch_enabled then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'disabled',
      'code', 'dispatch_disabled',
      'generation', control_row.worker_generation::text,
      'databaseNow', database_now
    );
  end if;

  if control_row.new_runtime_mode = 'disabled' then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'disabled',
      'code', 'runtime_mode_disabled',
      'generation', control_row.worker_generation::text,
      'databaseNow', database_now
    );
  end if;

  if control_row.worker_generation <> p_expected_generation then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'stale',
      'code', 'worker_generation_changed',
      'generation', control_row.worker_generation::text
    );
  end if;

  if control_row.worker_lease_duration is null
    or control_row.request_deadline_duration is null
    or control_row.delivery_lease_duration is null
    or control_row.max_delivery_attempts is null
    or control_row.worker_lease_duration
      <= control_row.request_deadline_duration
    or control_row.delivery_lease_duration
      <= control_row.request_deadline_duration then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'unavailable',
      'code', 'runtime_policy_incomplete',
      'generation', control_row.worker_generation::text
    );
  end if;

  insert into private.notification_dispatch_workers (
    generation,
    state,
    started_at,
    lease_until
  )
  values (
    control_row.worker_generation,
    'running',
    database_now,
    database_now + control_row.worker_lease_duration
  )
  returning * into worker_row;

  return pg_catalog.jsonb_build_object(
    'version', 1,
    'kind', 'ready',
    'workerToken', worker_row.worker_token::text,
    'generation', worker_row.generation::text,
    'runtimeMode', control_row.new_runtime_mode,
    'legacyWritesEnabled', control_row.legacy_writes_enabled,
    'legacyOutboxHandled', control_row.legacy_outbox_handled,
    'startedAt', worker_row.started_at,
    'leaseUntil', worker_row.lease_until,
    'databaseNow', database_now,
    'requestDeadlineMs',
      (extract(epoch from control_row.request_deadline_duration)
        * 1000)::bigint::text,
    'deliveryLeaseMs',
      (extract(epoch from control_row.delivery_lease_duration)
        * 1000)::bigint::text,
    'maxDeliveryAttempts', control_row.max_delivery_attempts,
    'pushTtlSafetyBudgetMs', case
      when control_row.push_ttl_safety_budget is null then null
      else (extract(
        epoch from control_row.push_ttl_safety_budget
      ) * 1000)::bigint::text
    end
  );
end;
$$;

revoke all on function notification_dispatcher_api.begin_notification_dispatch_worker(bigint)
from public, anon, authenticated, service_role;

grant execute on function notification_dispatcher_api.begin_notification_dispatch_worker(bigint)
to notification_dispatcher;
