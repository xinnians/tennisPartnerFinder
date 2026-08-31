-- FA-03 outbox expand foundation. This migration does not enable the new
-- dispatcher, change the current reminder dedupe key, or erase send material.

-- These fields stay nullable throughout expand. Legacy rows do not have a
-- verified deadline, and only reminder events have a schedule version.
alter table public.notification_outbox
  add column expires_at timestamptz,
  add column source_schedule_version bigint;

-- An invocation of the old reminder function can cross the migration lock.
-- Giving every version-less reminder the legacy sentinel before validation
-- makes that compatibility boundary explicit without changing current sends.
create function private.default_legacy_notification_schedule_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.event_type in ('session_reminder', 'decide_reminder')
    and new.source_schedule_version is null then
    new.source_schedule_version := 0;
  end if;

  return new;
end;
$$;

revoke all on function private.default_legacy_notification_schedule_version()
from public, anon, authenticated, service_role;

create trigger notification_outbox_default_legacy_schedule_version
before insert on public.notification_outbox
for each row execute function private.default_legacy_notification_schedule_version();

update public.notification_outbox
set source_schedule_version = 0
where event_type in ('session_reminder', 'decide_reminder')
  and source_schedule_version is null;

alter table public.notification_outbox
  add constraint notification_outbox_schedule_version_shape
  check (
    (
      event_type in ('session_reminder', 'decide_reminder')
      and source_schedule_version is not null
      and source_schedule_version >= 0
    )
    or (
      event_type not in ('session_reminder', 'decide_reminder')
      and source_schedule_version is null
    )
  )
  not valid;

alter table public.notification_outbox
  validate constraint notification_outbox_schedule_version_shape;
