-- FA-03A3 outbox format/source/fan-out foundation. This migration keeps the
-- legacy writer and dispatcher active; new writers must opt in with format 2.

alter table public.notification_outbox
  rename column source_schedule_version to source_version;

alter table public.notification_outbox
  drop constraint notification_outbox_schedule_version_shape;

-- Keep the compatibility trigger used by the old reminder writer, but point
-- its sentinel at the generalized source version column.
create or replace function private.default_legacy_notification_schedule_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.outbox_format_version = 1
    and new.event_type in ('session_reminder', 'decide_reminder')
    and new.source_version is null then
    new.source_version := 0;
  end if;

  return new;
end;
$$;

revoke all on function private.default_legacy_notification_schedule_version()
from public, anon, authenticated, service_role;

alter table public.notification_outbox
  add column outbox_format_version smallint not null default 1,
  add column source_kind text,
  add column source_id bigint,
  add column fanout_state text not null default 'legacy',
  add column fanout_frozen_at timestamptz,
  add column outcome text,
  add column outcome_code text,
  add column outcome_at timestamptz;

alter table public.notification_outbox
  add constraint notification_outbox_format_version_check
  check (outbox_format_version in (1, 2))
  not valid,
  add constraint notification_outbox_fanout_shape
  check (
    (
      outbox_format_version = 1
      and fanout_state = 'legacy'
      and fanout_frozen_at is null
    )
    or (
      outbox_format_version = 2
      and sent_at is null
      and attempts = 0
      and (
        (
          fanout_state = 'open'
          and fanout_frozen_at is null
          and outcome is null
          and outcome_code is null
          and outcome_at is null
        )
        or (
          fanout_state = 'frozen'
          and fanout_frozen_at is not null
          and fanout_frozen_at >= created_at
        )
      )
    )
  )
  not valid,
  add constraint notification_outbox_schedule_version_shape
  check (
    (
      outbox_format_version = 1
      and source_kind is null
      and source_id is null
      and expires_at is null
      and (
        (
          event_type in ('session_reminder', 'decide_reminder')
          and source_version = 0
        )
        or (
          event_type not in ('session_reminder', 'decide_reminder')
          and source_version is null
        )
      )
    )
    or (
      outbox_format_version = 2
      and source_kind is not null
      and source_id is not null
      and source_id > 0
      and source_version is not null
      and source_version > 0
      and expires_at is not null
      and expires_at > created_at
    )
  )
  not valid,
  add constraint notification_outbox_event_source_mapping
  check (
    outbox_format_version = 1
    or (
      (event_type in ('session_reminder', 'decide_reminder') and source_kind = 'session_schedule')
      or (event_type = 'chat_message' and source_kind = 'session_message' and source_version = 1)
      or (
        event_type in ('host_new_request', 'guest_invited', 'guest_request_reviewed')
        and source_kind = 'session_participant'
      )
      or (
        event_type in ('court_new_session', 'session_updated', 'session_decided', 'session_cancelled')
        and source_kind = 'session_state'
      )
    )
  )
  not valid,
  add constraint notification_outbox_session_source_matches
  check (
    outbox_format_version = 1
    or source_kind not in ('session_schedule', 'session_state')
    or source_id = session_id
  )
  not valid,
  add constraint notification_outbox_outcome_shape
  check (
    (
      outcome is null
      and outcome_code is null
      and outcome_at is null
    )
    or (
      outcome_at is not null
      and outcome_at >= created_at
      and (
        (
          outbox_format_version = 1
          and (
            (
              outcome = 'completed'
              and outcome_code = 'legacy_sent_at_recorded'
              and sent_at is not null
            )
            or (
              outcome = 'failed'
              and outcome_code = 'legacy_attempts_exhausted'
              and sent_at is null
            )
            or (
              outcome = 'cancelled'
              and outcome_code in ('legacy_cutoff_cancelled', 'legacy_unclassifiable_cancelled')
              and sent_at is null
            )
          )
        )
        or (
          outbox_format_version = 2
          and fanout_state = 'frozen'
          and outcome_at >= fanout_frozen_at
          and (
            (outcome = 'no_targets' and outcome_code = 'fanout_no_targets')
            or (
              outcome = 'completed'
              and outcome_code = 'deliveries_terminal_with_acceptance'
            )
            or (outcome = 'failed' and outcome_code = 'deliveries_terminal_failed')
            or (
              outcome = 'cancelled'
              and outcome_code = 'deliveries_terminal_cancelled'
            )
          )
        )
      )
    )
  )
  not valid;

alter table public.notification_outbox
  validate constraint notification_outbox_format_version_check,
  validate constraint notification_outbox_fanout_shape,
  validate constraint notification_outbox_schedule_version_shape,
  validate constraint notification_outbox_event_source_mapping,
  validate constraint notification_outbox_session_source_matches,
  validate constraint notification_outbox_outcome_shape;

-- The delivery table added by a later migration uses this owner-matching key.
-- It must be a real, immediate UNIQUE constraint rather than a partial index.
alter table public.notification_outbox
  add constraint notification_outbox_id_recipient_profile_id_key
  unique (id, recipient_profile_id);

create index notification_outbox_active_source_idx
  on public.notification_outbox (source_kind, source_id, source_version, id)
  where outbox_format_version = 2 and outcome is null;

create index notification_outbox_unfinalized_idx
  on public.notification_outbox (fanout_state, created_at, id)
  where outbox_format_version = 2 and outcome is null;

create unique index notification_outbox_v2_reminder_once_idx
  on public.notification_outbox (
    session_id,
    recipient_profile_id,
    event_type,
    source_version
  )
  where outbox_format_version = 2
    and event_type in ('session_reminder', 'decide_reminder');

create function private.reject_open_notification_outbox_commit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Read the row's final transaction-local state. A deferred INSERT event can
  -- still fire after the same transaction has changed open -> frozen.
  if new.outbox_format_version = 2
    and exists (
      select 1
      from public.notification_outbox outbox_row
      where outbox_row.id = new.id
        and outbox_row.outbox_format_version = 2
        and outbox_row.fanout_state = 'open'
    ) then
    raise exception using
      errcode = '23514',
      message = 'NOTIFICATION_OUTBOX_FANOUT_OPEN';
  end if;

  return null;
end;
$$;

revoke all on function private.reject_open_notification_outbox_commit()
from public, anon, authenticated, service_role;

create constraint trigger notification_outbox_reject_open_commit
after insert or update on public.notification_outbox
deferrable initially deferred
for each row execute function private.reject_open_notification_outbox_commit();
