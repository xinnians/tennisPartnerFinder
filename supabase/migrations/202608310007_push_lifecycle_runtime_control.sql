-- FA-03 dormant runtime control. Existing workers do not read these tables yet;
-- the initial row records the legacy-compatible state without enabling v2.

create table private.notification_runtime_control (
  singleton_id smallint primary key default 1
    check (singleton_id = 1),
  worker_generation bigint not null default 1
    check (worker_generation > 0),
  dispatch_enabled boolean not null default true,
  new_runtime_mode text not null default 'disabled'
    check (new_runtime_mode in ('disabled', 'canary', 'enabled')),
  legacy_writes_enabled boolean not null default true,
  legacy_outbox_handled boolean not null default false,
  legacy_cutoff_at timestamptz,
  worker_lease_duration interval
    check (worker_lease_duration > interval '0'),
  request_deadline_duration interval
    check (request_deadline_duration > interval '0'),
  delivery_lease_duration interval
    check (delivery_lease_duration > interval '0'),
  max_delivery_attempts smallint
    check (max_delivery_attempts > 0),
  push_ttl_safety_budget interval
    check (push_ttl_safety_budget >= interval '0'),
  updated_at timestamptz not null default statement_timestamp(),
  check (
    (legacy_writes_enabled and legacy_cutoff_at is null)
    or (not legacy_writes_enabled and legacy_cutoff_at is not null)
  ),
  check (
    not legacy_outbox_handled
    or (not legacy_writes_enabled and legacy_cutoff_at is not null)
  ),
  check (
    new_runtime_mode = 'disabled'
    or (
      dispatch_enabled
      and worker_lease_duration is not null
      and request_deadline_duration is not null
      and delivery_lease_duration is not null
      and max_delivery_attempts is not null
    )
  )
);

insert into private.notification_runtime_control (
  singleton_id,
  worker_generation,
  dispatch_enabled,
  new_runtime_mode,
  legacy_writes_enabled,
  legacy_outbox_handled
)
values (1, 1, true, 'disabled', true, false);

create table private.notification_dispatch_workers (
  id bigint generated always as identity primary key,
  worker_token uuid not null default pg_catalog.gen_random_uuid() unique,
  generation bigint not null check (generation > 0),
  state text not null
    check (state in ('running', 'completed', 'failed', 'expired')),
  started_at timestamptz not null default statement_timestamp(),
  lease_until timestamptz not null,
  finished_at timestamptz,
  result_code text,
  check (lease_until > started_at),
  check (
    (state = 'running' and finished_at is null and result_code is null)
    or (
      state = 'completed'
      and finished_at is not null
      and finished_at >= started_at
      and result_code = 'normal_exit'
    )
    or (
      state = 'failed'
      and finished_at is not null
      and finished_at >= started_at
      and result_code = 'controlled_failure'
    )
    or (
      state = 'expired'
      and finished_at is not null
      and finished_at >= lease_until
      and result_code = 'hard_deadline_elapsed'
    )
  )
);

create index notification_dispatch_workers_running_idx
  on private.notification_dispatch_workers (generation, lease_until, id)
  where state = 'running';

create table private.notification_runtime_canary_profiles (
  profile_id bigint primary key
    references public.profiles (id) on delete cascade,
  created_at timestamptz not null default statement_timestamp()
);

alter table private.notification_runtime_control enable row level security;
alter table private.notification_dispatch_workers enable row level security;
alter table private.notification_runtime_canary_profiles enable row level security;

revoke all on table
  private.notification_runtime_control,
  private.notification_dispatch_workers,
  private.notification_runtime_canary_profiles
from public, anon, authenticated, service_role;

revoke all on sequence private.notification_dispatch_workers_id_seq
from public, anon, authenticated, service_role;
