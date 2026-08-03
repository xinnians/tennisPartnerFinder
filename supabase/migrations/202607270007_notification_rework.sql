-- Stage 5: notification preferences, reminders, district retirement, and
-- block-list disclosure alignment. Migrations 001-006 remain immutable.

alter table public.notification_outbox
  drop constraint notification_outbox_event_type_check;
alter table public.notification_outbox
  add constraint notification_outbox_event_type_check check (event_type in (
    'host_new_request', 'guest_request_reviewed', 'guest_invited',
    'court_new_session', 'session_updated', 'session_decided',
    'session_cancelled', 'chat_message', 'session_reminder', 'decide_reminder'
  )) not valid;

alter table public.notification_prefs
  add column session_updated_enabled boolean not null default true,
  add column chat_message_enabled boolean not null default true,
  add column session_reminder_enabled boolean not null default true;

drop function public.set_notification_prefs(boolean, boolean, boolean);
create function public.set_notification_prefs(
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
  return 'OK';
end;
$$;

revoke all on function public.set_notification_prefs(boolean, boolean, boolean, boolean, boolean, boolean)
from public, anon, authenticated;
grant execute on function public.set_notification_prefs(boolean, boolean, boolean, boolean, boolean, boolean)
to authenticated;

create or replace function private.notification_pref_enabled(p_profile_id bigint, p_event_type text)
returns boolean language sql security definer set search_path = '' stable as $$
  select case p_event_type
    when 'host_new_request' then coalesce(pref_row.host_new_request_enabled, true)
    when 'guest_request_reviewed' then coalesce(pref_row.guest_request_reviewed_enabled, true)
    when 'guest_invited' then coalesce(pref_row.guest_invited_enabled, true)
    when 'session_updated' then coalesce(pref_row.session_updated_enabled, true)
    when 'chat_message' then coalesce(pref_row.chat_message_enabled, true)
    when 'session_reminder' then coalesce(pref_row.session_reminder_enabled, true)
    when 'session_decided' then true
    when 'session_cancelled' then true
    when 'court_new_session' then true
    when 'decide_reminder' then true
    else false
  end
  from (select p_profile_id as profile_id) input_row
  left join public.notification_prefs pref_row on pref_row.profile_id = input_row.profile_id
$$;

revoke all on function private.notification_pref_enabled(bigint, text)
from public, anon, authenticated;

create unique index notification_outbox_reminder_once_idx
  on public.notification_outbox (session_id, recipient_profile_id, event_type)
  where event_type in ('session_reminder', 'decide_reminder');

create function private.enqueue_session_reminders(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch_count integer;
  inserted_count integer := 0;
begin
  insert into public.notification_outbox (
    event_type,
    recipient_profile_id,
    session_id,
    payload
  )
  select
    'session_reminder',
    participant_row.profile_id,
    session_row.id,
    private.notification_session_payload(session_row.id, '球局將在約一小時後開始。')
  from public.sessions session_row
  join public.session_participants participant_row
    on participant_row.session_id = session_row.id
   and participant_row.status = 'accepted'
  where session_row.status in ('open', 'full')
    and session_row.start_at >= p_now + interval '55 minutes'
    and session_row.start_at < p_now + interval '65 minutes'
    and (session_row.venue_type <> 'candidates' or session_row.decided_at is not null)
    and private.notification_pref_enabled(participant_row.profile_id, 'session_reminder')
  on conflict do nothing;
  get diagnostics batch_count = row_count;
  inserted_count := inserted_count + batch_count;

  insert into public.notification_outbox (
    event_type,
    recipient_profile_id,
    session_id,
    payload
  )
  select
    'decide_reminder',
    session_row.host_profile_id,
    session_row.id,
    private.notification_session_payload(session_row.id, '候選球局即將開始，請定案場地與時間。')
  from public.sessions session_row
  where session_row.status in ('open', 'full')
    and session_row.venue_type = 'candidates'
    and session_row.decided_at is null
    and session_row.start_at > p_now
    and session_row.start_at <= p_now + interval '3 hours'
  on conflict do nothing;
  get diagnostics batch_count = row_count;
  inserted_count := inserted_count + batch_count;

  return inserted_count;
end;
$$;

revoke all on function private.enqueue_session_reminders(timestamptz)
from public, anon, authenticated;

do $$
declare
  existing_job_id integer;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'enqueue-session-reminders'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'enqueue-session-reminders',
    '*/5 * * * *',
    'select private.enqueue_session_reminders()'
  );
end;
$$;

drop function private.try_enqueue_district_new_session(bigint, text);
drop function public.set_district_subscriptions(text[]);
drop table public.district_subscriptions;

create or replace view public.my_player_blocks
with (security_barrier = true, security_invoker = false)
as
select
  block_row.blocked_profile_id,
  case
    when exists (
      select 1
      from public.session_participants viewer_participant
      join public.session_participants blocked_participant
        on blocked_participant.session_id = viewer_participant.session_id
      where viewer_participant.profile_id = viewer_profile.id
        and blocked_participant.profile_id = block_row.blocked_profile_id
    ) or (
      private.profile_meets_gate(viewer_profile.id, 'directory')
      and blocked_profile.is_public
      and private.profile_meets_gate(blocked_profile.id, 'directory')
    ) then blocked_profile.nickname
    else '已封鎖的使用者'
  end as blocked_nickname,
  block_row.created_at
from public.player_blocks block_row
join public.profiles blocked_profile
  on blocked_profile.id = block_row.blocked_profile_id
cross join lateral (
  select profile_row.id
  from public.profiles profile_row
  where profile_row.user_id = auth.uid()
) viewer_profile
where block_row.blocker_profile_id = viewer_profile.id;

revoke all on table public.my_player_blocks
from public, anon, authenticated;
grant select on table public.my_player_blocks to authenticated;
