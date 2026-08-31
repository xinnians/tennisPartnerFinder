-- FA-03 participant source version. This migration only locks
-- session_participants so it stays independent of the session DDL lock.

alter table public.session_participants
  add column notification_state_version bigint default 1;

alter table public.session_participants
  add constraint session_participants_notification_state_version_positive
  check (notification_state_version > 0)
  not valid;

alter table public.session_participants
  validate constraint session_participants_notification_state_version_positive;

alter table public.session_participants
  alter column notification_state_version set not null;

-- INSERT always starts at one. played_confirmed deliberately does not
-- invalidate request/invite/review events. The three currently immutable
-- identity fields remain in this guard as a defensive boundary for future
-- transition-policy changes.
create function private.maintain_session_participant_notification_state_version()
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

  if new.session_id is distinct from old.session_id
    or new.profile_id is distinct from old.profile_id
    or new.role is distinct from old.role
    or new.status is distinct from old.status
    or new.initiated_by is distinct from old.initiated_by then
    new.notification_state_version := old.notification_state_version + 1;
  else
    new.notification_state_version := old.notification_state_version;
  end if;

  return new;
end;
$$;

revoke all on function private.maintain_session_participant_notification_state_version()
from public, anon, authenticated, service_role;

create trigger session_participants_maintain_notification_state_version
before insert or update on public.session_participants
for each row execute function private.maintain_session_participant_notification_state_version();
