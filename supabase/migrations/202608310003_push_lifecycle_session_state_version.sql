-- FA-03 general session source version. This migration only locks sessions so
-- it cannot introduce a cross-relation DDL lock order.

-- PostgreSQL 17 exposes this constant default to existing rows without a data
-- rewrite. The NOT VALID/validate sequence proves old rows satisfy the check
-- before the column is made required.
alter table public.sessions
  add column notification_state_version bigint default 1;

alter table public.sessions
  add constraint sessions_notification_state_version_positive
  check (notification_state_version > 0)
  not valid;

alter table public.sessions
  validate constraint sessions_notification_state_version_positive;

alter table public.sessions
  alter column notification_state_version set not null;

-- The database owns this version. INSERT always starts at one; one UPDATE
-- increments it at most once when any notification-relevant session field
-- actually changes. Caller-provided values, including NULL, are always ignored.
create function private.maintain_session_notification_state_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.notification_state_version := 1;
    return new;
  end if;

  if new.sport_id is distinct from old.sport_id
    or new.host_profile_id is distinct from old.host_profile_id
    or new.court_id is distinct from old.court_id
    or new.play_type is distinct from old.play_type
    or new.start_at is distinct from old.start_at
    or new.ntrp_min is distinct from old.ntrp_min
    or new.ntrp_max is distinct from old.ntrp_max
    or new.slots_total is distinct from old.slots_total
    or new.notes is distinct from old.notes
    or new.status is distinct from old.status
    or new.join_mode is distinct from old.join_mode
    or new.venue_type is distinct from old.venue_type
    or new.range_end is distinct from old.range_end
    or new.decided_at is distinct from old.decided_at
    or new.fee_note is distinct from old.fee_note
    or new.archived_at is distinct from old.archived_at then
    new.notification_state_version := old.notification_state_version + 1;
  else
    new.notification_state_version := old.notification_state_version;
  end if;

  return new;
end;
$$;

revoke all on function private.maintain_session_notification_state_version()
from public, anon, authenticated, service_role;

create trigger sessions_maintain_notification_state_version
before insert or update on public.sessions
for each row execute function private.maintain_session_notification_state_version();
