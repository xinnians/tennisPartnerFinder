-- FA-03 session schedule foundation. This migration only locks sessions; the
-- outbox expansion is isolated in the next migration to avoid reversing the
-- lock order used by the existing reminder function.

-- PostgreSQL 17 can expose a constant default to existing rows without issuing
-- an UPDATE, so the existing sessions.updated_at values remain untouched.
alter table public.sessions
  add column notification_schedule_version bigint default 1;

alter table public.sessions
  add constraint sessions_notification_schedule_version_positive
  check (notification_schedule_version > 0)
  not valid;

alter table public.sessions
  validate constraint sessions_notification_schedule_version_positive;

alter table public.sessions
  alter column notification_schedule_version set not null;

-- The database owns this version. Callers cannot forge it, and one UPDATE can
-- increment it at most once even when several schedule fields change together.
create function private.maintain_session_notification_schedule_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.start_at is distinct from old.start_at
    or new.court_id is distinct from old.court_id
    or new.venue_type is distinct from old.venue_type
    or new.range_end is distinct from old.range_end
    or new.decided_at is distinct from old.decided_at
    or (
      (old.status in ('open', 'full'))
      is distinct from (new.status in ('open', 'full'))
    ) then
    new.notification_schedule_version := old.notification_schedule_version + 1;
  else
    new.notification_schedule_version := old.notification_schedule_version;
  end if;

  return new;
end;
$$;

revoke all on function private.maintain_session_notification_schedule_version()
from public, anon, authenticated, service_role;

create trigger sessions_maintain_notification_schedule_version
before update on public.sessions
for each row execute function private.maintain_session_notification_schedule_version();
