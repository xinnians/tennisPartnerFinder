-- A court subscription announces other hosts' sessions, including during legacy/v2 coexistence.
create or replace function private.try_enqueue_court_new_session(p_session_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare recipient_row record;
begin
  for recipient_row in
    select subscription_row.profile_id, min(court_row.name) as name
    from public.court_subscriptions subscription_row
    join public.courts court_row on court_row.id = subscription_row.court_id
    where subscription_row.court_id in (
      select case when session_row.venue_type = 'candidates' then candidate_row.court_id else session_row.court_id end
      from public.sessions session_row
      left join public.session_candidate_courts candidate_row on candidate_row.session_id = session_row.id
      where session_row.id = p_session_id
    )
    and subscription_row.profile_id <> (
      select host_profile_id from public.sessions where id = p_session_id
    )
    group by subscription_row.profile_id
  loop
    begin
      perform private.enqueue_notification(
        'court_new_session', recipient_row.profile_id, p_session_id,
        (private.notification_session_payload(p_session_id, '你訂閱的球場有新球局。') || jsonb_build_object('court', recipient_row.name))
      );
    exception when others then
      raise warning 'court notification recipient skipped for session %', p_session_id;
    end;
  end loop;
end;
$$;

-- Exhaust pending legacy self-notifications without falsely recording delivery.
update public.notification_outbox outbox_row
set attempts = 3
from public.sessions session_row
where outbox_row.session_id = session_row.id
  and outbox_row.event_type = 'court_new_session'
  and outbox_row.recipient_profile_id = session_row.host_profile_id
  and outbox_row.outbox_format_version = 1
  and outbox_row.sent_at is null
  and outbox_row.attempts < 3;
