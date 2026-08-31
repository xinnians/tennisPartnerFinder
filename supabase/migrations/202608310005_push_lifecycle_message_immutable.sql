-- FA-03 message sources use immutable version 1. This migration only locks
-- session_messages and leaves INSERT, SELECT, report FKs, and purge DELETE
-- unchanged.

create function private.reject_session_message_updates()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'SESSION_MESSAGE_IMMUTABLE';
end;
$$;

revoke all on function private.reject_session_message_updates()
from public, anon, authenticated, service_role;

create trigger session_messages_reject_updates
before update on public.session_messages
for each row execute function private.reject_session_message_updates();
