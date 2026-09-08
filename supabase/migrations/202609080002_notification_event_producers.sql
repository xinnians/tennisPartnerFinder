-- Connect existing domain event producers to the immutable v2 fan-out ledger.
-- No runtime switch is changed by this migration. Legacy devices remain live
-- during canary; the dispatcher isolates transports using consent_id.
-- The old reminder index must only deduplicate legacy events, otherwise it
-- would suppress v2 reminders after a schedule change.
drop index public.notification_outbox_reminder_once_idx;
create unique index notification_outbox_reminder_once_idx
  on public.notification_outbox (session_id, recipient_profile_id, event_type)
  where outbox_format_version = 1 and event_type in ('session_reminder', 'decide_reminder');

create function private.enqueue_notification_event(
  p_event_type text, p_recipient_profile_id bigint, p_session_id bigint,
  p_payload jsonb, p_source_kind text, p_source_id bigint, p_source_version bigint,
  p_expires_at timestamptz
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  control_row private.notification_runtime_control%rowtype;
  event_id bigint;
  consent_row record;
  target_count integer := 0;
  wrote_event boolean := false;
  v2_recipient boolean;
begin
  if not private.notification_pref_enabled(p_recipient_profile_id, p_event_type) then return false; end if;
  select * into strict control_row from private.notification_runtime_control where singleton_id = 1 for share;
  v2_recipient := control_row.new_runtime_mode = 'enabled' or (
    control_row.new_runtime_mode = 'canary' and exists (
      select 1 from private.notification_runtime_canary_profiles where profile_id = p_recipient_profile_id
    )
  );

  if v2_recipient and p_expires_at > statement_timestamp() then
    insert into public.notification_outbox (
      event_type, recipient_profile_id, session_id, payload,
      outbox_format_version, source_kind, source_id, source_version, expires_at, fanout_state
    ) values (
      p_event_type, p_recipient_profile_id, p_session_id, p_payload,
      2, p_source_kind, p_source_id, p_source_version, p_expires_at, 'open'
    ) on conflict do nothing returning id into event_id;
    if event_id is not null then
      -- Serialize snapshot fan-out against consent revocation; a consent added
      -- after this snapshot is intentionally not a target of historical events.
      for consent_row in
        select id, consent_epoch from private.push_device_consents
        where profile_id = p_recipient_profile_id and state = 'enabled'
        order by id for share
      loop
        insert into private.notification_deliveries (outbox_id, recipient_profile_id, consent_id, consent_epoch)
        values (event_id, p_recipient_profile_id, consent_row.id, consent_row.consent_epoch);
        target_count := target_count + 1;
      end loop;
      update public.notification_outbox set fanout_state = 'frozen', fanout_frozen_at = statement_timestamp(),
        outcome = case when target_count = 0 then 'no_targets' end,
        outcome_code = case when target_count = 0 then 'fanout_no_targets' end,
        outcome_at = case when target_count = 0 then statement_timestamp() end
      where id = event_id;
      wrote_event := true;
    end if;
  end if;

  -- During coexistence both formats may exist for the same account, but each
  -- dispatcher only sends to its own transport type. No duplicate device send.
  if control_row.legacy_writes_enabled and (
    not v2_recipient or exists (
      select 1 from public.push_subscriptions where profile_id = p_recipient_profile_id and consent_id is null
    )
  ) then
    insert into public.notification_outbox (event_type, recipient_profile_id, session_id, payload)
    values (p_event_type, p_recipient_profile_id, p_session_id, p_payload)
    on conflict do nothing;
    wrote_event := wrote_event or found;
  end if;
  return wrote_event;
end;
$$;
revoke all on function private.enqueue_notification_event(text,bigint,bigint,jsonb,text,bigint,bigint,timestamptz)
from public, anon, authenticated, service_role;

create or replace function private.enqueue_notification(
  p_event_type text, p_recipient_profile_id bigint, p_session_id bigint, p_payload jsonb
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  session_row public.sessions%rowtype;
  source_kind text;
  source_id bigint;
  source_version bigint;
  event_expiry timestamptz;
begin
  -- Domain RPCs already hold this session lock before mutating participants or
  -- messages. Keeping it here also protects future callers' source snapshot.
  select * into strict session_row from public.sessions where id = p_session_id for share;
  event_expiry := least(statement_timestamp() + interval '24 hours', session_row.start_at + interval '2 hours');
  if p_event_type in ('host_new_request', 'guest_invited', 'guest_request_reviewed') then
    source_kind := 'session_participant';
    select id, notification_state_version into strict source_id, source_version
    from public.session_participants where session_id = p_session_id and profile_id =
      case when p_event_type = 'host_new_request' then private.viewer_profile_id() else p_recipient_profile_id end;
  elsif p_event_type = 'chat_message' then
    -- post_session_message serializes on the session before INSERT, so the
    -- newest message from this caller is the exact event source in this tx.
    source_kind := 'session_message';
    select id into strict source_id from public.session_messages
    where session_id = p_session_id and sender_profile_id = private.viewer_profile_id() and kind = 'user'
    order by created_at desc, id desc limit 1;
    source_version := 1;
    event_expiry := least(statement_timestamp() + interval '1 hour', session_row.start_at + interval '2 hours');
  elsif p_event_type in ('session_reminder', 'decide_reminder') then
    source_kind := 'session_schedule'; source_id := p_session_id;
    source_version := session_row.notification_schedule_version;
    event_expiry := session_row.start_at;
  else
    source_kind := 'session_state'; source_id := p_session_id;
    source_version := session_row.notification_state_version;
  end if;
  perform private.enqueue_notification_event(p_event_type, p_recipient_profile_id, p_session_id, p_payload,
    source_kind, source_id, source_version, event_expiry);
end;
$$;
revoke all on function private.enqueue_notification(text,bigint,bigint,jsonb)
from public, anon, authenticated, service_role;

create or replace function private.enqueue_session_reminders(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  session_row public.sessions%rowtype;
  recipient record;
  inserted_count integer := 0;
begin
  -- Lock each source before reading its schedule version. Do not attach an old
  -- reminder window to a concurrently edited schedule.
  for session_row in select * from public.sessions
    where status in ('open', 'full') and start_at > p_now and start_at <= p_now + interval '3 hours'
    order by id for share
  loop
    if session_row.venue_type = 'candidates' and session_row.decided_at is null then
      if private.enqueue_notification_event('decide_reminder', session_row.host_profile_id, session_row.id,
        private.notification_session_payload(session_row.id, '候選球局即將開始，請定案場地與時間。'),
        'session_schedule', session_row.id, session_row.notification_schedule_version, session_row.start_at)
      then inserted_count := inserted_count + 1; end if;
    elsif session_row.start_at >= p_now + interval '55 minutes' and session_row.start_at < p_now + interval '65 minutes' then
      for recipient in select profile_id from public.session_participants
        where session_id = session_row.id and status = 'accepted' order by id for share
      loop
        if private.enqueue_notification_event('session_reminder', recipient.profile_id, session_row.id,
          private.notification_session_payload(session_row.id, '球局將在約一小時後開始。'),
          'session_schedule', session_row.id, session_row.notification_schedule_version, session_row.start_at)
        then inserted_count := inserted_count + 1; end if;
      end loop;
    end if;
  end loop;
  return inserted_count;
end;
$$;
revoke all on function private.enqueue_session_reminders(timestamptz) from public, anon, authenticated;

-- The browser learns only whether its own account is in the staged rollout.
create function public.notification_push_runtime_status()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('enabled',
    dispatch_enabled and (new_runtime_mode = 'enabled' or
      (new_runtime_mode = 'canary' and exists (
        select 1 from private.notification_runtime_canary_profiles
        where profile_id = private.viewer_profile_id()
      )))
  ) from private.notification_runtime_control where singleton_id = 1;
$$;
revoke all on function public.notification_push_runtime_status() from public, anon, authenticated, service_role;
grant execute on function public.notification_push_runtime_status() to authenticated;
