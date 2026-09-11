-- Service-only eligibility query; do not grant raw sessions access to the dispatcher.
create function public.filter_legacy_court_notification_ids(p_outbox_ids bigint[])
returns table (id bigint)
language sql stable security definer set search_path = ''
as $$
  select o.id from public.notification_outbox o
  join public.sessions s on s.id = o.session_id
  where o.id = any(p_outbox_ids)
    and o.outbox_format_version = 1
    and o.event_type = 'court_new_session'
    and o.recipient_profile_id <> s.host_profile_id;
$$;
revoke all on function public.filter_legacy_court_notification_ids(bigint[])
from public, anon, authenticated;
grant execute on function public.filter_legacy_court_notification_ids(bigint[]) to service_role;
