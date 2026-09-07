-- FA-03 D1 dormant notification dispatcher commands.
--
-- This migration adds the database transaction boundary required by Push v2.
-- It deliberately does not change runtime-control values, enable v2, rotate a
-- worker generation, touch legacy rows, configure cron, or deploy an Edge
-- Function. All policy durations remain sourced from the singleton control row.

-- The checked-out Postgres client gets one narrow command schema. Keeping the
-- commands out of private avoids granting that login access to historical
-- private helpers whose legacy ACLs intentionally differ.
create schema notification_dispatcher_api;
revoke all on schema notification_dispatcher_api
from public, anon, authenticated, service_role;

-- A versioned SHA-256 encoder gives the three absence guards deterministic
-- int4 keys. Hash collisions only serialize unrelated work; they never permit
-- work that should have been blocked.
create function private.notification_advisory_key_v1(p_value text)
returns integer
language plpgsql
stable
strict
security invoker
set search_path = ''
as $$
declare
  digest_bytes bytea;
  unsigned_value bigint;
begin
  digest_bytes := pg_catalog.sha256(pg_catalog.convert_to(p_value, 'UTF8'));
  unsigned_value :=
      pg_catalog.get_byte(digest_bytes, 0)::bigint * 16777216
    + pg_catalog.get_byte(digest_bytes, 1)::bigint * 65536
    + pg_catalog.get_byte(digest_bytes, 2)::bigint * 256
    + pg_catalog.get_byte(digest_bytes, 3)::bigint;

  if unsigned_value >= 2147483648 then
    return (unsigned_value - 4294967296)::integer;
  end if;
  return unsigned_value::integer;
end;
$$;

create function private.lock_notification_pref_guard(p_profile_id bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_profile_id is null or p_profile_id <= 0 then
    raise exception 'NOTIFICATION_GUARD_INPUT_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    private.notification_advisory_key_v1('notification-pref-namespace-v1'),
    private.notification_advisory_key_v1(
      'notification-pref-profile-v1:' || p_profile_id::text
    )
  );
end;
$$;

create function private.lock_player_block_guard(
  p_first_profile_id bigint,
  p_second_profile_id bigint
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  lower_profile_id bigint;
  upper_profile_id bigint;
begin
  if p_first_profile_id is null
    or p_second_profile_id is null
    or p_first_profile_id <= 0
    or p_second_profile_id <= 0
    or p_first_profile_id = p_second_profile_id then
    raise exception 'NOTIFICATION_GUARD_INPUT_INVALID';
  end if;

  lower_profile_id := least(
    p_first_profile_id,
    p_second_profile_id
  );
  upper_profile_id := greatest(
    p_first_profile_id,
    p_second_profile_id
  );

  perform pg_catalog.pg_advisory_xact_lock(
    private.notification_advisory_key_v1('player-block-namespace-v1'),
    private.notification_advisory_key_v1(
      'player-block-pair-v1:'
      || lower_profile_id::text
      || ':'
      || upper_profile_id::text
    )
  );
end;
$$;

create function private.lock_court_subscription_guard(p_profile_id bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_profile_id is null or p_profile_id <= 0 then
    raise exception 'NOTIFICATION_GUARD_INPUT_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    private.notification_advisory_key_v1('court-subscription-namespace-v1'),
    private.notification_advisory_key_v1(
      'court-subscription-profile-v1:' || p_profile_id::text
    )
  );
end;
$$;

revoke all on function private.notification_advisory_key_v1(text)
from public, anon, authenticated, service_role;
revoke all on function private.lock_notification_pref_guard(bigint)
from public, anon, authenticated, service_role;
revoke all on function private.lock_player_block_guard(bigint, bigint)
from public, anon, authenticated, service_role;
revoke all on function private.lock_court_subscription_guard(bigint)
from public, anon, authenticated, service_role;

-- The three existing setters are the only application write boundaries for
-- these tables. Taking the same transaction-scoped guard as the dispatcher
-- closes the otherwise-unlockable absent-row insert/delete races. Existing v1
-- behavior is unchanged; only dormant v2 deliveries can be cancelled here.
create or replace function public.set_notification_prefs(
  p_host_new_request_enabled boolean,
  p_guest_request_reviewed_enabled boolean,
  p_guest_invited_enabled boolean,
  p_session_updated_enabled boolean,
  p_chat_message_enabled boolean,
  p_session_reminder_enabled boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile_id bigint;
begin
  if p_host_new_request_enabled is null
    or p_guest_request_reviewed_enabled is null
    or p_guest_invited_enabled is null
    or p_session_updated_enabled is null
    or p_chat_message_enabled is null
    or p_session_reminder_enabled is null then
    raise exception 'INVALID_NOTIFICATION_PREFS';
  end if;

  viewer_profile_id := private.ensure_notification_profile();
  perform private.lock_notification_pref_guard(viewer_profile_id);

  insert into public.notification_prefs (
    profile_id,
    host_new_request_enabled,
    guest_request_reviewed_enabled,
    guest_invited_enabled,
    session_updated_enabled,
    chat_message_enabled,
    session_reminder_enabled
  )
  values (
    viewer_profile_id,
    p_host_new_request_enabled,
    p_guest_request_reviewed_enabled,
    p_guest_invited_enabled,
    p_session_updated_enabled,
    p_chat_message_enabled,
    p_session_reminder_enabled
  )
  on conflict (profile_id) do update
  set host_new_request_enabled = excluded.host_new_request_enabled,
      guest_request_reviewed_enabled = excluded.guest_request_reviewed_enabled,
      guest_invited_enabled = excluded.guest_invited_enabled,
      session_updated_enabled = excluded.session_updated_enabled,
      chat_message_enabled = excluded.chat_message_enabled,
      session_reminder_enabled = excluded.session_reminder_enabled;

  perform 1
  from private.notification_deliveries delivery_row
  join public.notification_outbox outbox_row
    on outbox_row.id = delivery_row.outbox_id
  where delivery_row.recipient_profile_id = viewer_profile_id
    and delivery_row.state in ('pending', 'processing', 'unknown')
    and outbox_row.outbox_format_version = 2
    and (
      (outbox_row.event_type = 'host_new_request'
        and not p_host_new_request_enabled)
      or (outbox_row.event_type = 'guest_request_reviewed'
        and not p_guest_request_reviewed_enabled)
      or (outbox_row.event_type = 'guest_invited'
        and not p_guest_invited_enabled)
      or (outbox_row.event_type = 'session_updated'
        and not p_session_updated_enabled)
      or (outbox_row.event_type = 'chat_message'
        and not p_chat_message_enabled)
      or (outbox_row.event_type = 'session_reminder'
        and not p_session_reminder_enabled)
    )
  order by delivery_row.id
  for update of delivery_row;

  update private.notification_deliveries delivery_row
  set state = 'cancelled',
      claim_token = null,
      lease_until = null,
      next_attempt_at = null,
      error_code = 'recipient_ineligible'
  from public.notification_outbox outbox_row
  where outbox_row.id = delivery_row.outbox_id
    and delivery_row.recipient_profile_id = viewer_profile_id
    and delivery_row.state in ('pending', 'processing', 'unknown')
    and outbox_row.outbox_format_version = 2
    and (
      (outbox_row.event_type = 'host_new_request'
        and not p_host_new_request_enabled)
      or (outbox_row.event_type = 'guest_request_reviewed'
        and not p_guest_request_reviewed_enabled)
      or (outbox_row.event_type = 'guest_invited'
        and not p_guest_invited_enabled)
      or (outbox_row.event_type = 'session_updated'
        and not p_session_updated_enabled)
      or (outbox_row.event_type = 'chat_message'
        and not p_chat_message_enabled)
      or (outbox_row.event_type = 'session_reminder'
        and not p_session_reminder_enabled)
    );

  return 'OK';
end;
$$;

create or replace function public.set_player_block(
  p_profile_id bigint,
  p_blocked boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile bigint;
begin
  viewer_profile := private.viewer_profile_id();

  if viewer_profile is null then
    raise exception 'PROFILE_INCOMPLETE';
  end if;

  if p_profile_id is null
    or p_blocked is null
    or p_profile_id = viewer_profile then
    raise exception 'INVALID_TRANSITION';
  end if;

  perform 1
  from public.profiles profile_row
  where profile_row.id = p_profile_id
  for key share;

  if not found then
    return 'OK';
  end if;

  perform private.lock_player_block_guard(viewer_profile, p_profile_id);

  if p_blocked then
    insert into public.player_blocks (blocker_profile_id, blocked_profile_id)
    values (viewer_profile, p_profile_id)
    on conflict (blocker_profile_id, blocked_profile_id) do nothing;

    perform 1
    from private.notification_deliveries delivery_row
    join public.notification_outbox outbox_row
      on outbox_row.id = delivery_row.outbox_id
    join public.session_messages message_row
      on message_row.id = outbox_row.source_id
     and outbox_row.source_kind = 'session_message'
    where delivery_row.state in ('pending', 'processing', 'unknown')
      and outbox_row.outbox_format_version = 2
      and outbox_row.event_type = 'chat_message'
      and (
        (delivery_row.recipient_profile_id = viewer_profile
          and message_row.sender_profile_id = p_profile_id)
        or (delivery_row.recipient_profile_id = p_profile_id
          and message_row.sender_profile_id = viewer_profile)
      )
    order by delivery_row.id
    for update of delivery_row;

    update private.notification_deliveries delivery_row
    set state = 'cancelled',
        claim_token = null,
        lease_until = null,
        next_attempt_at = null,
        error_code = 'recipient_ineligible'
    from public.notification_outbox outbox_row,
         public.session_messages message_row
    where outbox_row.id = delivery_row.outbox_id
      and message_row.id = outbox_row.source_id
      and outbox_row.source_kind = 'session_message'
      and delivery_row.state in ('pending', 'processing', 'unknown')
      and outbox_row.outbox_format_version = 2
      and outbox_row.event_type = 'chat_message'
      and (
        (delivery_row.recipient_profile_id = viewer_profile
          and message_row.sender_profile_id = p_profile_id)
        or (delivery_row.recipient_profile_id = p_profile_id
          and message_row.sender_profile_id = viewer_profile)
      );

    perform 1
    from private.notification_deliveries delivery_row
    join public.notification_outbox outbox_row
      on outbox_row.id = delivery_row.outbox_id
    join public.sessions session_row
      on session_row.id = outbox_row.session_id
    where delivery_row.state in ('pending', 'processing', 'unknown')
      and outbox_row.outbox_format_version = 2
      and outbox_row.event_type = 'court_new_session'
      and (
        (delivery_row.recipient_profile_id = viewer_profile
          and session_row.host_profile_id = p_profile_id)
        or (delivery_row.recipient_profile_id = p_profile_id
          and session_row.host_profile_id = viewer_profile)
      )
    order by delivery_row.id
    for update of delivery_row;

    update private.notification_deliveries delivery_row
    set state = 'cancelled',
        claim_token = null,
        lease_until = null,
        next_attempt_at = null,
        error_code = 'recipient_ineligible'
    from public.notification_outbox outbox_row,
         public.sessions session_row
    where outbox_row.id = delivery_row.outbox_id
      and session_row.id = outbox_row.session_id
      and delivery_row.state in ('pending', 'processing', 'unknown')
      and outbox_row.outbox_format_version = 2
      and outbox_row.event_type = 'court_new_session'
      and (
        (delivery_row.recipient_profile_id = viewer_profile
          and session_row.host_profile_id = p_profile_id)
        or (delivery_row.recipient_profile_id = p_profile_id
          and session_row.host_profile_id = viewer_profile)
      );
  else
    delete from public.player_blocks
    where blocker_profile_id = viewer_profile
      and blocked_profile_id = p_profile_id;
  end if;

  return 'OK';
end;
$$;

create or replace function public.set_court_subscriptions(p_court_ids bigint[])
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile_id bigint;
  max_court_count integer;
begin
  select pg_catalog.count(*)::integer
  into max_court_count
  from public.courts
  where is_active and city = '台北市';

  if coalesce(pg_catalog.cardinality(p_court_ids), 0)
      > max_court_count then
    raise exception 'INVALID_TRANSITION';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(
      coalesce(p_court_ids, '{}'::bigint[])
    ) as requested_court(court_id)
    left join public.courts court_row
      on court_row.id = requested_court.court_id
     and court_row.is_active
     and court_row.city = '台北市'
    where requested_court.court_id is null or court_row.id is null
  ) then
    raise exception 'INVALID_TRANSITION';
  end if;

  viewer_profile_id := private.ensure_notification_profile();
  perform private.lock_court_subscription_guard(viewer_profile_id);

  delete from public.court_subscriptions
  where profile_id = viewer_profile_id;

  insert into public.court_subscriptions (profile_id, court_id)
  select viewer_profile_id, distinct_court.court_id
  from (
    select distinct requested_court.court_id
    from pg_catalog.unnest(
      coalesce(p_court_ids, '{}'::bigint[])
    ) as requested_court(court_id)
  ) as distinct_court;

  perform 1
  from private.notification_deliveries delivery_row
  join public.notification_outbox outbox_row
    on outbox_row.id = delivery_row.outbox_id
  join public.sessions session_row
    on session_row.id = outbox_row.session_id
  where delivery_row.recipient_profile_id = viewer_profile_id
    and delivery_row.state in ('pending', 'processing', 'unknown')
    and outbox_row.outbox_format_version = 2
    and outbox_row.event_type = 'court_new_session'
    and not exists (
      select 1
      from public.court_subscriptions subscription_row
      where subscription_row.profile_id = viewer_profile_id
        and (
          (session_row.venue_type <> 'candidates'
            and subscription_row.court_id = session_row.court_id)
          or (
            session_row.venue_type = 'candidates'
            and exists (
              select 1
              from public.session_candidate_courts candidate_row
              where candidate_row.session_id = session_row.id
                and candidate_row.court_id = subscription_row.court_id
            )
          )
        )
    )
  order by delivery_row.id
  for update of delivery_row;

  update private.notification_deliveries delivery_row
  set state = 'cancelled',
      claim_token = null,
      lease_until = null,
      next_attempt_at = null,
      error_code = 'recipient_ineligible'
  from public.notification_outbox outbox_row,
       public.sessions session_row
  where outbox_row.id = delivery_row.outbox_id
    and session_row.id = outbox_row.session_id
    and delivery_row.recipient_profile_id = viewer_profile_id
    and delivery_row.state in ('pending', 'processing', 'unknown')
    and outbox_row.outbox_format_version = 2
    and outbox_row.event_type = 'court_new_session'
    and not exists (
      select 1
      from public.court_subscriptions subscription_row
      where subscription_row.profile_id = viewer_profile_id
        and (
          (session_row.venue_type <> 'candidates'
            and subscription_row.court_id = session_row.court_id)
          or (
            session_row.venue_type = 'candidates'
            and exists (
              select 1
              from public.session_candidate_courts candidate_row
              where candidate_row.session_id = session_row.id
                and candidate_row.court_id = subscription_row.court_id
            )
          )
        )
    );

  return 'OK';
end;
$$;

revoke all on function public.set_notification_prefs(
  boolean, boolean, boolean, boolean, boolean, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.set_notification_prefs(
  boolean, boolean, boolean, boolean, boolean, boolean
) to authenticated;
revoke all on function public.set_player_block(bigint, boolean)
from public, anon, authenticated, service_role;
grant execute on function public.set_player_block(bigint, boolean)
to authenticated;
revoke all on function public.set_court_subscriptions(bigint[])
from public, anon, authenticated, service_role;
grant execute on function public.set_court_subscriptions(bigint[])
to authenticated;

-- A reclaimed processing row needs an indexed lease lookup. The existing
-- pending/unknown index continues to serve first attempts and scheduled retry.
create index notification_deliveries_processing_lease_idx
  on private.notification_deliveries (lease_until, created_at, id)
  where state = 'processing';

-- V2 event identity is immutable. Fan-out may make its one-way open -> frozen
-- transition; once frozen, only the validated final outcome may be recorded.
create function private.maintain_notification_outbox_v2()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.outbox_format_version = 1 then
    if new.outbox_format_version <> 1 then
      raise exception 'NOTIFICATION_OUTBOX_FORMAT_IMMUTABLE';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
    or new.event_type is distinct from old.event_type
    or new.recipient_profile_id is distinct from old.recipient_profile_id
    or new.session_id is distinct from old.session_id
    or new.payload is distinct from old.payload
    or new.created_at is distinct from old.created_at
    or new.sent_at is not null
    or new.attempts <> 0
    or new.expires_at is distinct from old.expires_at
    or new.source_version is distinct from old.source_version
    or new.outbox_format_version <> 2
    or new.source_kind is distinct from old.source_kind
    or new.source_id is distinct from old.source_id
    or not (
      (
        old.fanout_state = 'open'
        and old.fanout_frozen_at is null
        and (
          (
            new.fanout_state = 'open'
            and new.fanout_frozen_at is null
          )
          or (
            new.fanout_state = 'frozen'
            and new.fanout_frozen_at is not null
          )
        )
      )
      or (
        old.fanout_state = 'frozen'
        and new.fanout_state = 'frozen'
        and new.fanout_frozen_at is not distinct from old.fanout_frozen_at
      )
    ) then
    raise exception 'NOTIFICATION_OUTBOX_V2_IDENTITY_IMMUTABLE';
  end if;

  if old.outcome is not null and (
    new.outcome is distinct from old.outcome
    or new.outcome_code is distinct from old.outcome_code
    or new.outcome_at is distinct from old.outcome_at
  ) then
    raise exception 'NOTIFICATION_OUTBOX_V2_OUTCOME_IMMUTABLE';
  end if;

  return new;
end;
$$;

revoke all on function private.maintain_notification_outbox_v2()
from public, anon, authenticated, service_role;

create trigger notification_outbox_maintain_v2
before update on public.notification_outbox
for each row execute function private.maintain_notification_outbox_v2();

create function notification_dispatcher_api.begin_notification_dispatch_worker(
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
      'generation', control_row.worker_generation
    );
  end if;

  if control_row.worker_generation <> p_expected_generation then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'stale',
      'code', 'worker_generation_changed',
      'generation', control_row.worker_generation
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
      'generation', control_row.worker_generation
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
    'generation', worker_row.generation,
    'runtimeMode', control_row.new_runtime_mode,
    'legacyWritesEnabled', control_row.legacy_writes_enabled,
    'legacyOutboxHandled', control_row.legacy_outbox_handled,
    'startedAt', worker_row.started_at,
    'leaseUntil', worker_row.lease_until,
    'databaseNow', database_now,
    'requestDeadlineMs',
      (extract(epoch from control_row.request_deadline_duration)
        * 1000)::bigint,
    'deliveryLeaseMs',
      (extract(epoch from control_row.delivery_lease_duration)
        * 1000)::bigint,
    'maxDeliveryAttempts', control_row.max_delivery_attempts,
    'pushTtlSafetyBudgetMs', case
      when control_row.push_ttl_safety_budget is null then null
      else (extract(
        epoch from control_row.push_ttl_safety_budget
      ) * 1000)::bigint
    end
  );
end;
$$;

create function notification_dispatcher_api.finish_notification_dispatch_worker(
  p_worker_token uuid,
  p_succeeded boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  worker_row private.notification_dispatch_workers%rowtype;
  database_now timestamptz;
begin
  if p_worker_token is null or p_succeeded is null then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'rejected',
      'code', 'invalid_worker_result'
    );
  end if;

  perform 1
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

  select *
  into worker_row
  from private.notification_dispatch_workers
  where worker_token = p_worker_token
  for update;

  if not found then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'stale',
      'code', 'worker_not_found'
    );
  end if;

  database_now := pg_catalog.clock_timestamp();

  if worker_row.state = 'running' then
    if database_now >= worker_row.lease_until then
      update private.notification_dispatch_workers
      set state = 'expired',
          finished_at = database_now,
          result_code = 'hard_deadline_elapsed'
      where id = worker_row.id
      returning * into worker_row;
    else
      update private.notification_dispatch_workers
      set state = case when p_succeeded then 'completed' else 'failed' end,
          finished_at = database_now,
          result_code = case
            when p_succeeded then 'normal_exit'
            else 'controlled_failure'
          end
      where id = worker_row.id
      returning * into worker_row;
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'version', 1,
    'kind', 'finished',
    'workerToken', worker_row.worker_token::text,
    'generation', worker_row.generation,
    'state', worker_row.state,
    'resultCode', worker_row.result_code,
    'finishedAt', worker_row.finished_at,
    'databaseNow', database_now
  );
end;
$$;

create function notification_dispatcher_api.expire_notification_dispatch_workers(
  p_generation bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  database_now timestamptz;
  expired_count integer;
begin
  if p_generation is null or p_generation <= 0 then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'rejected',
      'code', 'invalid_generation'
    );
  end if;

  perform 1
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

  with expired_worker as (
    select worker_row.id
    from private.notification_dispatch_workers worker_row
    where worker_row.generation = p_generation
      and worker_row.state = 'running'
      and worker_row.lease_until <= database_now
    order by worker_row.lease_until, worker_row.id
    for update skip locked
  )
  update private.notification_dispatch_workers worker_row
  set state = 'expired',
      finished_at = database_now,
      result_code = 'hard_deadline_elapsed'
  from expired_worker
  where worker_row.id = expired_worker.id;

  get diagnostics expired_count = row_count;

  return pg_catalog.jsonb_build_object(
    'version', 1,
    'kind', 'expired',
    'generation', p_generation,
    'count', expired_count,
    'databaseNow', database_now
  );
end;
$$;

create function notification_dispatcher_api.claim_notification_delivery(
  p_worker_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  control_row private.notification_runtime_control%rowtype;
  worker_row private.notification_dispatch_workers%rowtype;
  candidate_row record;
  database_now timestamptz;
  new_claim_token uuid;
  new_lease_until timestamptz;
  candidate_expires_at timestamptz;
begin
  if p_worker_token is null then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'rejected',
      'code', 'invalid_worker_token'
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

  select *
  into worker_row
  from private.notification_dispatch_workers
  where worker_token = p_worker_token
  for update;

  if not found or worker_row.state <> 'running' then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'stale',
      'code', 'worker_not_running'
    );
  end if;

  database_now := pg_catalog.clock_timestamp();

  if database_now >= worker_row.lease_until then
    update private.notification_dispatch_workers
    set state = 'expired',
        finished_at = database_now,
        result_code = 'hard_deadline_elapsed'
    where id = worker_row.id;

    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'stale',
      'code', 'worker_lease_expired'
    );
  end if;

  if worker_row.generation <> control_row.worker_generation then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'stale',
      'code', 'worker_generation_changed',
      'generation', control_row.worker_generation
    );
  end if;

  if not control_row.dispatch_enabled
    or control_row.new_runtime_mode = 'disabled' then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'disabled',
      'code', 'new_runtime_disabled'
    );
  end if;

  if control_row.request_deadline_duration is null
    or control_row.delivery_lease_duration is null
    or control_row.max_delivery_attempts is null
    or control_row.delivery_lease_duration
      <= control_row.request_deadline_duration then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'unavailable',
      'code', 'runtime_policy_incomplete'
    );
  end if;

  if worker_row.lease_until
      <= database_now + control_row.request_deadline_duration then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'empty',
      'code', 'worker_capacity_exhausted',
      'databaseNow', database_now,
      'leaseUntil', worker_row.lease_until
    );
  end if;

  select
    delivery_row.*,
    outbox_row.expires_at as outbox_expires_at,
    outbox_row.recipient_profile_id as outbox_recipient_profile_id
  into candidate_row
  from private.notification_deliveries delivery_row
  join public.notification_outbox outbox_row
    on outbox_row.id = delivery_row.outbox_id
  where outbox_row.outbox_format_version = 2
    and outbox_row.fanout_state = 'frozen'
    and outbox_row.outcome is null
    and (
      control_row.new_runtime_mode = 'enabled'
      or (
        control_row.new_runtime_mode = 'canary'
        and exists (
          select 1
          from private.notification_runtime_canary_profiles canary_row
          where canary_row.profile_id = delivery_row.recipient_profile_id
        )
      )
    )
    and (
      (
        delivery_row.state in ('pending', 'unknown')
        and (
          delivery_row.next_attempt_at is null
          or delivery_row.next_attempt_at <= database_now
        )
      )
      or (
        delivery_row.state = 'processing'
        and delivery_row.lease_until <= database_now
      )
    )
  order by delivery_row.created_at, delivery_row.id
  for update of delivery_row skip locked
  limit 1;

  if not found then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'empty',
      'code', 'no_ready_delivery',
      'databaseNow', database_now
    );
  end if;

  candidate_expires_at := candidate_row.outbox_expires_at;

  if candidate_expires_at <= database_now then
    update private.notification_deliveries
    set state = 'cancelled',
        claim_token = null,
        lease_until = null,
        next_attempt_at = null,
        error_code = 'event_expired'
    where id = candidate_row.id;

    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'terminalized',
      'code', 'event_expired',
      'deliveryId', candidate_row.id,
      'outboxId', candidate_row.outbox_id
    );
  end if;

  if candidate_row.attempts >= control_row.max_delivery_attempts then
    update private.notification_deliveries
    set state = 'failed',
        claim_token = null,
        lease_until = null,
        next_attempt_at = null,
        error_code = 'attempts_exhausted'
    where id = candidate_row.id;

    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'terminalized',
      'code', 'attempts_exhausted',
      'deliveryId', candidate_row.id,
      'outboxId', candidate_row.outbox_id
    );
  end if;

  new_claim_token := pg_catalog.gen_random_uuid();
  new_lease_until := least(
    database_now + control_row.delivery_lease_duration,
    worker_row.lease_until,
    candidate_expires_at
  );

  if new_lease_until <= database_now then
    update private.notification_deliveries
    set state = 'cancelled',
        claim_token = null,
        lease_until = null,
        next_attempt_at = null,
        error_code = 'event_expired'
    where id = candidate_row.id;

    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'terminalized',
      'code', 'event_expired',
      'deliveryId', candidate_row.id,
      'outboxId', candidate_row.outbox_id
    );
  end if;

  update private.notification_deliveries
  set state = 'processing',
      attempts = attempts + 1,
      claim_token = new_claim_token,
      claimed_at = database_now,
      lease_until = new_lease_until,
      next_attempt_at = null,
      error_code = null
  where id = candidate_row.id
  returning * into candidate_row;

  return pg_catalog.jsonb_build_object(
    'version', 1,
    'kind', 'claimed',
    'deliveryId', candidate_row.id,
    'outboxId', candidate_row.outbox_id,
    'recipientProfileId', candidate_row.recipient_profile_id,
    'claimToken', candidate_row.claim_token::text,
    'notificationId', candidate_row.notification_id::text,
    'attempt', candidate_row.attempts,
    'claimedAt', candidate_row.claimed_at,
    'leaseUntil', candidate_row.lease_until,
    'expiresAt', candidate_expires_at,
    'databaseNow', database_now
  );
end;
$$;

-- This command must be called inside the checked-out send transaction. Its row
-- and advisory locks stay held after the function returns, so the dispatcher
-- can call exactly one external adapter before completing on the same client.
create function notification_dispatcher_api.prepare_notification_delivery_send(
  p_worker_token uuid,
  p_claim_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  control_row private.notification_runtime_control%rowtype;
  worker_row private.notification_dispatch_workers%rowtype;
  delivery_snapshot record;
  locked_delivery private.notification_deliveries%rowtype;
  outbox_row public.notification_outbox%rowtype;
  session_row public.sessions%rowtype;
  source_participant public.session_participants%rowtype;
  source_message public.session_messages%rowtype;
  consent_row private.push_device_consents%rowtype;
  transport_row public.push_subscriptions%rowtype;
  registry_row private.push_endpoint_registry%rowtype;
  database_now timestamptz;
  source_valid boolean := false;
  recipient_eligible boolean := false;
  recipient_is_accepted boolean := false;
  accepted_guest_count integer := 0;
  payload_message text;
  safe_payload jsonb;
  cancellation_code text;
  block_other_profile_id bigint;
  matching_court_name text;
begin
  if p_worker_token is null or p_claim_token is null then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'rejected',
      'code', 'invalid_claim'
    );
  end if;

  select *
  into control_row
  from private.notification_runtime_control
  where singleton_id = 1
  for share;

  if not found
    or not control_row.dispatch_enabled
    or control_row.new_runtime_mode = 'disabled' then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'disabled',
      'code', 'new_runtime_disabled'
    );
  end if;

  database_now := pg_catalog.clock_timestamp();

  select *
  into worker_row
  from private.notification_dispatch_workers
  where worker_token = p_worker_token
  for share;

  if not found
    or worker_row.state <> 'running'
    or worker_row.generation <> control_row.worker_generation
    or worker_row.lease_until <= database_now then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'stale',
      'code', 'worker_not_current'
    );
  end if;

  if control_row.new_runtime_mode = 'canary' then
    perform 1
    from private.notification_runtime_canary_profiles canary_row
    join private.notification_deliveries delivery_row
      on delivery_row.recipient_profile_id = canary_row.profile_id
    where delivery_row.claim_token = p_claim_token
    for share of canary_row;

    if not found then
      return pg_catalog.jsonb_build_object(
        'version', 1,
        'kind', 'stale',
        'code', 'canary_scope_changed'
      );
    end if;
  end if;

  select
    delivery_row.id as delivery_id,
    delivery_row.outbox_id,
    delivery_row.recipient_profile_id,
    delivery_row.consent_id,
    delivery_row.consent_epoch
  into delivery_snapshot
  from private.notification_deliveries delivery_row
  where delivery_row.claim_token = p_claim_token;

  if not found then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'stale',
      'code', 'claim_not_found'
    );
  end if;

  select *
  into outbox_row
  from public.notification_outbox
  where id = delivery_snapshot.outbox_id;

  select *
  into session_row
  from public.sessions
  where id = outbox_row.session_id
  for share;

  if found then
    perform 1
    from public.session_participants participant_row
    where participant_row.session_id = session_row.id
    order by participant_row.id
    for share;

    select pg_catalog.count(*)::integer
    into accepted_guest_count
    from public.session_participants participant_row
    where participant_row.session_id = session_row.id
      and participant_row.role = 'guest'
      and participant_row.status = 'accepted';

    select exists (
      select 1
      from public.session_participants participant_row
      where participant_row.session_id = session_row.id
        and participant_row.profile_id = delivery_snapshot.recipient_profile_id
        and participant_row.status = 'accepted'
    ) into recipient_is_accepted;

    if outbox_row.source_kind = 'session_participant' then
      select *
      into source_participant
      from public.session_participants participant_row
      where participant_row.id = outbox_row.source_id
        and participant_row.session_id = session_row.id;
    elsif outbox_row.source_kind = 'session_message' then
      select *
      into source_message
      from public.session_messages message_row
      where message_row.id = outbox_row.source_id
        and message_row.session_id = session_row.id
      for share;
    end if;
  end if;

  perform private.lock_notification_pref_guard(
    delivery_snapshot.recipient_profile_id
  );

  perform 1
  from public.notification_prefs pref_row
  where pref_row.profile_id = delivery_snapshot.recipient_profile_id
  for share;

  if outbox_row.event_type = 'chat_message'
    and source_message.sender_profile_id is not null
    and source_message.sender_profile_id
      <> delivery_snapshot.recipient_profile_id then
    block_other_profile_id := source_message.sender_profile_id;
  elsif outbox_row.event_type = 'court_new_session'
    and session_row.host_profile_id is not null
    and session_row.host_profile_id
      <> delivery_snapshot.recipient_profile_id then
    block_other_profile_id := session_row.host_profile_id;
  end if;

  if block_other_profile_id is not null then
    perform private.lock_player_block_guard(
      delivery_snapshot.recipient_profile_id,
      block_other_profile_id
    );

    perform 1
    from public.player_blocks block_row
    where (
      block_row.blocker_profile_id = delivery_snapshot.recipient_profile_id
      and block_row.blocked_profile_id = block_other_profile_id
    ) or (
      block_row.blocker_profile_id = block_other_profile_id
      and block_row.blocked_profile_id = delivery_snapshot.recipient_profile_id
    )
    order by block_row.blocker_profile_id, block_row.blocked_profile_id
    for share;
  end if;

  if outbox_row.event_type = 'court_new_session' then
    perform private.lock_court_subscription_guard(
      delivery_snapshot.recipient_profile_id
    );

    perform 1
    from public.court_subscriptions subscription_row
    where subscription_row.profile_id = delivery_snapshot.recipient_profile_id
    order by subscription_row.court_id
    for share;
  end if;

  select *
  into consent_row
  from private.push_device_consents
  where id = delivery_snapshot.consent_id
    and profile_id = delivery_snapshot.recipient_profile_id
  for update;

  if found then
    select *
    into transport_row
    from public.push_subscriptions
    where consent_id = consent_row.id;

    if found then
      select *
      into registry_row
      from private.push_endpoint_registry
      where fingerprint_algorithm = transport_row.endpoint_fingerprint_algorithm
        and endpoint_fingerprint = transport_row.endpoint_fingerprint
        and owner_profile_id = consent_row.profile_id
      for share;

      select *
      into transport_row
      from public.push_subscriptions
      where id = transport_row.id
        and consent_id = consent_row.id
      for share;
    end if;
  end if;

  select *
  into locked_delivery
  from private.notification_deliveries
  where id = delivery_snapshot.delivery_id
  for update;

  if not found
    or locked_delivery.state <> 'processing'
    or locked_delivery.claim_token <> p_claim_token
    then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'stale',
      'code', 'claim_lease_changed'
    );
  end if;

  database_now := pg_catalog.clock_timestamp();

  if worker_row.state <> 'running'
    or worker_row.generation <> control_row.worker_generation
    or worker_row.lease_until <= database_now
    or locked_delivery.lease_until <= database_now then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'stale',
      'code', 'claim_lease_changed'
    );
  end if;

  if outbox_row.outbox_format_version <> 2
    or outbox_row.fanout_state <> 'frozen'
    or outbox_row.outcome is not null then
    cancellation_code := 'source_invalid';
  elsif outbox_row.expires_at <= database_now then
    cancellation_code := 'event_expired';
  elsif consent_row.id is null or consent_row.state <> 'enabled' then
    cancellation_code := 'consent_inactive';
  elsif consent_row.consent_epoch <> locked_delivery.consent_epoch then
    cancellation_code := 'consent_epoch_changed';
  elsif transport_row.id is null
    or transport_row.consent_id <> consent_row.id
    or registry_row.endpoint_fingerprint is null
    or registry_row.state <> 'active' then
    cancellation_code := 'transport_unavailable';
  end if;

  if cancellation_code is null and session_row.id is not null then
    case outbox_row.event_type
      when 'session_reminder' then
        source_valid := outbox_row.source_kind = 'session_schedule'
          and outbox_row.source_id = session_row.id
          and outbox_row.source_version =
            session_row.notification_schedule_version
          and session_row.status in ('open', 'full')
          and not (
            session_row.venue_type = 'candidates'
            and session_row.decided_at is null
          )
          and session_row.start_at > database_now;
        recipient_eligible := recipient_is_accepted;
        payload_message := '球局將在約一小時後開始。';
      when 'decide_reminder' then
        source_valid := outbox_row.source_kind = 'session_schedule'
          and outbox_row.source_id = session_row.id
          and outbox_row.source_version =
            session_row.notification_schedule_version
          and session_row.status in ('open', 'full')
          and session_row.venue_type = 'candidates'
          and session_row.decided_at is null
          and session_row.start_at > database_now;
        recipient_eligible :=
          session_row.host_profile_id = locked_delivery.recipient_profile_id;
        payload_message := '候選球局即將開始，請定案場地與時間。';
      when 'chat_message' then
        source_valid := outbox_row.source_kind = 'session_message'
          and outbox_row.source_version = 1
          and source_message.id = outbox_row.source_id
          and source_message.session_id = session_row.id
          and source_message.sender_profile_id is not null;
        recipient_eligible := recipient_is_accepted
          and source_message.sender_profile_id
            <> locked_delivery.recipient_profile_id
          and not exists (
            select 1
            from public.player_blocks block_row
            where (
              block_row.blocker_profile_id =
                locked_delivery.recipient_profile_id
              and block_row.blocked_profile_id =
                source_message.sender_profile_id
            ) or (
              block_row.blocker_profile_id =
                source_message.sender_profile_id
              and block_row.blocked_profile_id =
                locked_delivery.recipient_profile_id
            )
          );
        payload_message := '群組有新訊息';
      when 'host_new_request' then
        source_valid := outbox_row.source_kind = 'session_participant'
          and source_participant.id = outbox_row.source_id
          and source_participant.session_id = session_row.id
          and source_participant.notification_state_version =
            outbox_row.source_version
          and source_participant.initiated_by = 'guest'
          and source_participant.status in ('requested', 'accepted')
          and session_row.status not in ('cancelled', 'expired');
        recipient_eligible :=
          session_row.host_profile_id = locked_delivery.recipient_profile_id;
        payload_message := case source_participant.status
          when 'accepted' then '有球友直接加入你的球局。'
          else '有人申請加入你的球局。'
        end;
      when 'guest_invited' then
        source_valid := outbox_row.source_kind = 'session_participant'
          and source_participant.id = outbox_row.source_id
          and source_participant.session_id = session_row.id
          and source_participant.notification_state_version =
            outbox_row.source_version
          and source_participant.initiated_by = 'host'
          and source_participant.status = 'invited'
          and session_row.status in ('open', 'full')
          and session_row.start_at + interval '2 hours' > database_now;
        recipient_eligible := source_participant.profile_id =
          locked_delivery.recipient_profile_id;
        payload_message := '你收到一個球局邀請。';
      when 'guest_request_reviewed' then
        source_valid := outbox_row.source_kind = 'session_participant'
          and source_participant.id = outbox_row.source_id
          and source_participant.session_id = session_row.id
          and source_participant.notification_state_version =
            outbox_row.source_version
          and source_participant.initiated_by = 'guest'
          and source_participant.status in ('accepted', 'declined');
        recipient_eligible := source_participant.profile_id =
          locked_delivery.recipient_profile_id;
        payload_message := case source_participant.status
          when 'accepted' then '你的加入申請已被接受。'
          else '你的加入申請已被婉拒。'
        end;
      when 'session_updated' then
        source_valid := outbox_row.source_kind = 'session_state'
          and outbox_row.source_id = session_row.id
          and outbox_row.source_version =
            session_row.notification_state_version;
        recipient_eligible := recipient_is_accepted;
        payload_message := '球局資訊已更新。';
      when 'session_decided' then
        source_valid := outbox_row.source_kind = 'session_state'
          and outbox_row.source_id = session_row.id
          and outbox_row.source_version =
            session_row.notification_state_version
          and session_row.decided_at is not null
          and session_row.status not in ('cancelled', 'expired');
        recipient_eligible := recipient_is_accepted;
        payload_message := '候選球局已定案。';
      when 'session_cancelled' then
        source_valid := outbox_row.source_kind = 'session_state'
          and outbox_row.source_id = session_row.id
          and outbox_row.source_version =
            session_row.notification_state_version
          and session_row.status = 'cancelled';
        recipient_eligible := recipient_is_accepted;
        payload_message := '球局已取消。';
      when 'court_new_session' then
        select pg_catalog.min(court_row.name)
        into matching_court_name
        from public.court_subscriptions subscription_row
        join public.courts court_row
          on court_row.id = subscription_row.court_id
        where subscription_row.profile_id =
            locked_delivery.recipient_profile_id
          and (
            (session_row.venue_type <> 'candidates'
              and subscription_row.court_id = session_row.court_id)
            or (
              session_row.venue_type = 'candidates'
              and exists (
                select 1
                from public.session_candidate_courts candidate_row
                where candidate_row.session_id = session_row.id
                  and candidate_row.court_id = subscription_row.court_id
              )
            )
          );

        source_valid := outbox_row.source_kind = 'session_state'
          and outbox_row.source_id = session_row.id
          and outbox_row.source_version =
            session_row.notification_state_version
          and session_row.status = 'open'
          and accepted_guest_count < session_row.slots_total
          and case
            when session_row.venue_type = 'candidates'
              and session_row.decided_at is null
              then session_row.start_at > database_now
            else session_row.start_at + interval '2 hours' > database_now
          end
          and exists (
            select 1
            from public.sports sport_row
            join public.courts court_row
              on court_row.id = session_row.court_id
            where sport_row.id = session_row.sport_id
              and sport_row.code = 'tennis'
              and sport_row.is_active
              and court_row.is_active
              and court_row.city = '台北市'
          );
        recipient_eligible := matching_court_name is not null
          and session_row.host_profile_id
            <> locked_delivery.recipient_profile_id
          and not exists (
            select 1
            from public.player_blocks block_row
            where (
              block_row.blocker_profile_id =
                locked_delivery.recipient_profile_id
              and block_row.blocked_profile_id = session_row.host_profile_id
            ) or (
              block_row.blocker_profile_id = session_row.host_profile_id
              and block_row.blocked_profile_id =
                locked_delivery.recipient_profile_id
            )
          );
        payload_message := '你訂閱的球場有新球局。';
      else
        source_valid := false;
        recipient_eligible := false;
    end case;
  end if;

  if cancellation_code is null and not source_valid then
    cancellation_code := 'source_invalid';
  elsif cancellation_code is null and (
    not recipient_eligible
    or not private.notification_pref_enabled(
      locked_delivery.recipient_profile_id,
      outbox_row.event_type
    )
  ) then
    cancellation_code := 'recipient_ineligible';
  end if;

  if cancellation_code is not null then
    update private.notification_deliveries
    set state = 'cancelled',
        claim_token = null,
        lease_until = null,
        next_attempt_at = null,
        error_code = cancellation_code
    where id = locked_delivery.id;

    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'cancelled',
      'code', cancellation_code,
      'deliveryId', locked_delivery.id,
      'outboxId', locked_delivery.outbox_id
    );
  end if;

  safe_payload := private.notification_session_payload(
    session_row.id,
    payload_message
  );

  if outbox_row.event_type = 'court_new_session' then
    safe_payload := safe_payload
      || pg_catalog.jsonb_build_object('court', matching_court_name);
  end if;

  if safe_payload is null
    or pg_catalog.jsonb_typeof(safe_payload) <> 'object'
    or not (
      safe_payload ?& array[
        'court', 'message', 'slots_remaining', 'start_at', 'url'
      ]
    )
    or safe_payload - array[
      'court', 'message', 'slots_remaining', 'start_at', 'url'
    ] <> '{}'::jsonb then
    update private.notification_deliveries
    set state = 'failed',
        claim_token = null,
        lease_until = null,
        next_attempt_at = null,
        error_code = 'payload_invalid'
    where id = locked_delivery.id;

    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'failed',
      'code', 'payload_invalid',
      'deliveryId', locked_delivery.id,
      'outboxId', locked_delivery.outbox_id
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'version', 1,
    'kind', 'ready',
    'deliveryId', locked_delivery.id,
    'outboxId', locked_delivery.outbox_id,
    'eventType', outbox_row.event_type,
    'claimToken', locked_delivery.claim_token::text,
    'notificationId', locked_delivery.notification_id::text,
    'consentEpoch', locked_delivery.consent_epoch::text,
    'endpoint', transport_row.endpoint,
    'p256dh', transport_row.p256dh,
    'auth', transport_row.auth,
    'endpointFingerprintAlgorithm',
      transport_row.endpoint_fingerprint_algorithm,
    'endpointFingerprintHex',
      pg_catalog.encode(transport_row.endpoint_fingerprint, 'hex'),
    'vapidFingerprintAlgorithm', transport_row.vapid_fingerprint_algorithm,
    'vapidFingerprintHex',
      pg_catalog.encode(transport_row.vapid_fingerprint, 'hex'),
    'transportVersion', transport_row.transport_version,
    'payload', safe_payload,
    'expiresAt', outbox_row.expires_at,
    'databaseNow', database_now,
    'requestDeadlineMs',
      (extract(epoch from control_row.request_deadline_duration)
        * 1000)::bigint,
    'pushTtlSafetyBudgetMs', case
      when control_row.push_ttl_safety_budget is null then null
      else (extract(
        epoch from control_row.push_ttl_safety_budget
      ) * 1000)::bigint
    end
  );
end;
$$;

create function notification_dispatcher_api.complete_notification_delivery(
  p_worker_token uuid,
  p_claim_token uuid,
  p_outcome text,
  p_error_code text,
  p_next_attempt_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  control_row private.notification_runtime_control%rowtype;
  worker_row private.notification_dispatch_workers%rowtype;
  delivery_snapshot private.notification_deliveries%rowtype;
  locked_delivery private.notification_deliveries%rowtype;
  outbox_row public.notification_outbox%rowtype;
  consent_row private.push_device_consents%rowtype;
  transport_row public.push_subscriptions%rowtype;
  registry_row private.push_endpoint_registry%rowtype;
  database_now timestamptz;
  final_state text;
  final_error_code text;
begin
  if p_worker_token is null
    or p_claim_token is null
    or p_outcome is null
    or p_outcome not in (
      'accepted',
      'retry_pending',
      'unknown',
      'cancelled',
      'failed',
      'provider_endpoint_inactive'
    ) then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'rejected',
      'code', 'invalid_completion'
    );
  end if;

  select *
  into control_row
  from private.notification_runtime_control
  where singleton_id = 1
  for share;

  if not found
    or not control_row.dispatch_enabled
    or control_row.new_runtime_mode = 'disabled' then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'disabled',
      'code', 'new_runtime_disabled'
    );
  end if;

  database_now := pg_catalog.clock_timestamp();

  select *
  into worker_row
  from private.notification_dispatch_workers
  where worker_token = p_worker_token
  for share;

  if not found
    or worker_row.state <> 'running'
    or worker_row.generation <> control_row.worker_generation
    or worker_row.lease_until <= database_now then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'stale',
      'code', 'worker_not_current'
    );
  end if;

  select *
  into delivery_snapshot
  from private.notification_deliveries
  where claim_token = p_claim_token;

  if not found then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'stale',
      'code', 'claim_not_found'
    );
  end if;

  select *
  into outbox_row
  from public.notification_outbox
  where id = delivery_snapshot.outbox_id;

  select *
  into consent_row
  from private.push_device_consents
  where id = delivery_snapshot.consent_id
    and profile_id = delivery_snapshot.recipient_profile_id
  for update;

  if found then
    select *
    into transport_row
    from public.push_subscriptions
    where consent_id = consent_row.id;

    if found then
      select *
      into registry_row
      from private.push_endpoint_registry
      where fingerprint_algorithm = transport_row.endpoint_fingerprint_algorithm
        and endpoint_fingerprint = transport_row.endpoint_fingerprint
        and owner_profile_id = consent_row.profile_id
      for update;

      select *
      into transport_row
      from public.push_subscriptions
      where id = transport_row.id
        and consent_id = consent_row.id
      for update;
    end if;
  end if;

  select *
  into locked_delivery
  from private.notification_deliveries
  where id = delivery_snapshot.id
  for update;

  if not found
    or locked_delivery.state <> 'processing'
    or locked_delivery.claim_token <> p_claim_token
    or outbox_row.id is null
    or outbox_row.outbox_format_version <> 2 then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'stale',
      'code', 'claim_lease_changed'
    );
  end if;

  database_now := pg_catalog.clock_timestamp();

  if worker_row.state <> 'running'
    or worker_row.generation <> control_row.worker_generation
    or worker_row.lease_until <= database_now
    or locked_delivery.lease_until <= database_now then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'stale',
      'code', 'claim_lease_changed'
    );
  end if;

  if p_outcome = 'provider_endpoint_inactive' then
    if p_error_code is null
      or p_error_code <> 'provider_endpoint_inactive'
      or p_next_attempt_at is not null
      or consent_row.id is null
      or transport_row.id is null
      or registry_row.endpoint_fingerprint is null then
      return pg_catalog.jsonb_build_object(
        'version', 1,
        'kind', 'rejected',
        'code', 'invalid_completion_shape'
      );
    end if;

    perform 1
    from private.notification_deliveries delivery_row
    where delivery_row.consent_id = consent_row.id
      and delivery_row.consent_epoch = locked_delivery.consent_epoch
      and delivery_row.state in ('pending', 'processing', 'unknown')
    order by delivery_row.id
    for update;

    update private.notification_deliveries delivery_row
    set state = 'cancelled',
        claim_token = null,
        lease_until = null,
        next_attempt_at = null,
        error_code = 'provider_endpoint_inactive'
    where delivery_row.consent_id = consent_row.id
      and delivery_row.consent_epoch = locked_delivery.consent_epoch
      and delivery_row.state in ('pending', 'processing', 'unknown');

    delete from public.push_subscriptions
    where id = transport_row.id
      and consent_id = consent_row.id;

    delete from private.push_endpoint_registry
    where fingerprint_algorithm = registry_row.fingerprint_algorithm
      and endpoint_fingerprint = registry_row.endpoint_fingerprint
      and owner_profile_id = consent_row.profile_id;

    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'completed',
      'state', 'cancelled',
      'code', 'provider_endpoint_inactive',
      'deliveryId', locked_delivery.id,
      'outboxId', locked_delivery.outbox_id,
      'databaseNow', database_now
    );
  end if;

  if p_outcome = 'accepted' then
    if p_error_code is not null or p_next_attempt_at is not null then
      return pg_catalog.jsonb_build_object(
        'version', 1,
        'kind', 'rejected',
        'code', 'invalid_completion_shape'
      );
    end if;
    final_state := 'accepted';
    final_error_code := null;
  elsif p_outcome = 'retry_pending' then
    if p_error_code is null
      or p_error_code not in ('provider_rate_limited', 'provider_transient')
      or p_next_attempt_at is null
      or p_next_attempt_at <= database_now then
      return pg_catalog.jsonb_build_object(
        'version', 1,
        'kind', 'rejected',
        'code', 'invalid_completion_shape'
      );
    end if;
    final_state := 'pending';
    final_error_code := p_error_code;
  elsif p_outcome = 'unknown' then
    if p_error_code is null
      or p_error_code <> 'adapter_outcome_unknown'
      or p_next_attempt_at is null
      or p_next_attempt_at <= database_now then
      return pg_catalog.jsonb_build_object(
        'version', 1,
        'kind', 'rejected',
        'code', 'invalid_completion_shape'
      );
    end if;
    final_state := 'unknown';
    final_error_code := 'adapter_outcome_unknown';
  elsif p_outcome = 'cancelled' then
    if p_error_code is null
      or p_error_code <> 'transport_unavailable'
      or p_next_attempt_at is not null then
      return pg_catalog.jsonb_build_object(
        'version', 1,
        'kind', 'rejected',
        'code', 'invalid_completion_shape'
      );
    end if;
    final_state := 'cancelled';
    final_error_code := 'transport_unavailable';
  elsif p_outcome = 'failed' then
    if p_error_code is null
      or p_error_code not in ('payload_invalid', 'provider_permanent')
      or p_next_attempt_at is not null then
      return pg_catalog.jsonb_build_object(
        'version', 1,
        'kind', 'rejected',
        'code', 'invalid_completion_shape'
      );
    end if;
    final_state := 'failed';
    final_error_code := p_error_code;
  end if;

  if final_state in ('pending', 'unknown') then
    if outbox_row.expires_at <= database_now
      or p_next_attempt_at >= outbox_row.expires_at then
      final_state := 'cancelled';
      final_error_code := 'event_expired';
      p_next_attempt_at := null;
    elsif locked_delivery.attempts >= control_row.max_delivery_attempts then
      final_state := 'failed';
      final_error_code := 'attempts_exhausted';
      p_next_attempt_at := null;
    end if;
  end if;

  update private.notification_deliveries
  set state = final_state,
      claim_token = null,
      lease_until = null,
      next_attempt_at = case
        when final_state in ('pending', 'unknown') then p_next_attempt_at
        else null
      end,
      error_code = final_error_code
  where id = locked_delivery.id;

  return pg_catalog.jsonb_build_object(
    'version', 1,
    'kind', 'completed',
    'state', final_state,
    'code', final_error_code,
    'deliveryId', locked_delivery.id,
    'outboxId', locked_delivery.outbox_id,
    'databaseNow', database_now
  );
end;
$$;

-- The finalizer intentionally locks only the outbox row. It reads deliveries
-- without row locks and never returns to domain/consent relations.
create function notification_dispatcher_api.finalize_notification_outbox(
  p_outbox_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  outbox_row public.notification_outbox%rowtype;
  delivery_count integer;
  nonterminal_count integer;
  accepted_count integer;
  failed_count integer;
  final_outcome text;
  final_code text;
  database_now timestamptz;
begin
  if p_outbox_id is null or p_outbox_id <= 0 then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'rejected',
      'code', 'invalid_outbox_id'
    );
  end if;

  select *
  into outbox_row
  from public.notification_outbox
  where id = p_outbox_id
  for update;

  if not found or outbox_row.outbox_format_version <> 2 then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'stale',
      'code', 'v2_outbox_not_found'
    );
  end if;

  database_now := pg_catalog.clock_timestamp();

  if outbox_row.outcome is not null then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'finalized',
      'outboxId', outbox_row.id,
      'outcome', outbox_row.outcome,
      'outcomeCode', outbox_row.outcome_code,
      'outcomeAt', outbox_row.outcome_at
    );
  end if;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (
      where state in ('pending', 'processing', 'unknown')
    )::integer,
    pg_catalog.count(*) filter (where state = 'accepted')::integer,
    pg_catalog.count(*) filter (where state = 'failed')::integer
  into delivery_count, nonterminal_count, accepted_count, failed_count
  from private.notification_deliveries
  where outbox_id = outbox_row.id;

  if delivery_count = 0 then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'incomplete',
      'code', 'frozen_outbox_without_delivery',
      'outboxId', outbox_row.id
    );
  end if;

  if nonterminal_count > 0 then
    return pg_catalog.jsonb_build_object(
      'version', 1,
      'kind', 'pending',
      'code', 'deliveries_nonterminal',
      'outboxId', outbox_row.id,
      'nonterminalCount', nonterminal_count
    );
  end if;

  if accepted_count > 0 then
    final_outcome := 'completed';
    final_code := 'deliveries_terminal_with_acceptance';
  elsif failed_count > 0 then
    final_outcome := 'failed';
    final_code := 'deliveries_terminal_failed';
  else
    final_outcome := 'cancelled';
    final_code := 'deliveries_terminal_cancelled';
  end if;

  update public.notification_outbox
  set outcome = final_outcome,
      outcome_code = final_code,
      outcome_at = database_now
  where id = outbox_row.id
  returning * into outbox_row;

  return pg_catalog.jsonb_build_object(
    'version', 1,
    'kind', 'finalized',
    'outboxId', outbox_row.id,
    'outcome', outbox_row.outcome,
    'outcomeCode', outbox_row.outcome_code,
    'outcomeAt', outbox_row.outcome_at
  );
end;
$$;

-- A dormant login role is created without a password. A later, separately
-- approved Hosted rollout must provision its credential out of band.
do $$
declare
  existing_role record;
begin
  select *
  into existing_role
  from pg_catalog.pg_roles
  where rolname = 'notification_dispatcher';

  if not found then
    create role notification_dispatcher
      login
      noinherit
      nosuperuser
      nocreatedb
      nocreaterole
      noreplication
      nobypassrls;
  elsif existing_role.rolsuper
    or existing_role.rolcreatedb
    or existing_role.rolcreaterole
    or existing_role.rolreplication
    or existing_role.rolbypassrls then
    raise exception 'NOTIFICATION_DISPATCHER_ROLE_PRIVILEGE_DRIFT';
  elsif exists (
    select 1
    from pg_catalog.pg_auth_members membership_row
    where membership_row.member = existing_role.oid
  ) then
    raise exception 'NOTIFICATION_DISPATCHER_ROLE_MEMBERSHIP_DRIFT';
  end if;
end;
$$;

alter role notification_dispatcher
  login
  noinherit
  nocreatedb
  nocreaterole
  password null;
alter role notification_dispatcher reset all;
alter role notification_dispatcher set search_path = '';

-- The role never receives private-schema USAGE or raw relation access. The one
-- historical public trigger helper is also closed to PUBLIC so the dispatcher
-- has exactly the seven reviewed project entry points.
revoke execute on function public.set_updated_at()
from public, anon, authenticated, service_role, notification_dispatcher;
revoke all on all tables in schema public, private
from notification_dispatcher;
revoke all on all sequences in schema public, private
from notification_dispatcher;
revoke all on schema private from notification_dispatcher;
revoke all on schema notification_dispatcher_api from notification_dispatcher;
grant usage on schema notification_dispatcher_api to notification_dispatcher;

revoke all on function notification_dispatcher_api.begin_notification_dispatch_worker(bigint)
from public, anon, authenticated, service_role, notification_dispatcher;
revoke all on function notification_dispatcher_api.finish_notification_dispatch_worker(uuid, boolean)
from public, anon, authenticated, service_role, notification_dispatcher;
revoke all on function notification_dispatcher_api.expire_notification_dispatch_workers(bigint)
from public, anon, authenticated, service_role, notification_dispatcher;
revoke all on function notification_dispatcher_api.claim_notification_delivery(uuid)
from public, anon, authenticated, service_role, notification_dispatcher;
revoke all on function notification_dispatcher_api.prepare_notification_delivery_send(uuid, uuid)
from public, anon, authenticated, service_role, notification_dispatcher;
revoke all on function notification_dispatcher_api.complete_notification_delivery(
  uuid, uuid, text, text, timestamptz
) from public, anon, authenticated, service_role, notification_dispatcher;
revoke all on function notification_dispatcher_api.finalize_notification_outbox(bigint)
from public, anon, authenticated, service_role, notification_dispatcher;

grant execute on function notification_dispatcher_api.begin_notification_dispatch_worker(bigint)
to notification_dispatcher;
grant execute on function notification_dispatcher_api.finish_notification_dispatch_worker(uuid, boolean)
to notification_dispatcher;
grant execute on function notification_dispatcher_api.expire_notification_dispatch_workers(bigint)
to notification_dispatcher;
grant execute on function notification_dispatcher_api.claim_notification_delivery(uuid)
to notification_dispatcher;
grant execute on function notification_dispatcher_api.prepare_notification_delivery_send(uuid, uuid)
to notification_dispatcher;
grant execute on function notification_dispatcher_api.complete_notification_delivery(
  uuid, uuid, text, text, timestamptz
) to notification_dispatcher;
grant execute on function notification_dispatcher_api.finalize_notification_outbox(bigint)
to notification_dispatcher;
