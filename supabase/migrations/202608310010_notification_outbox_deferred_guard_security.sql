-- Deferred constraint triggers run after the public SECURITY DEFINER writer
-- returns.  The guard therefore needs its own narrowly scoped definer context
-- to inspect the final outbox row without granting browser roles table access.
alter function private.reject_open_notification_outbox_commit()
  security definer;

alter function private.reject_open_notification_outbox_commit()
  set search_path = '';

revoke all on function private.reject_open_notification_outbox_commit()
from public, anon, authenticated, service_role;
