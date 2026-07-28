-- Stage 3 supplement: accept-seam block enforcement and chat safety hardening.

update public.sessions
set archived_at = coalesce(archived_at, updated_at)
where status in ('cancelled', 'played', 'expired');

create or replace view public.my_player_blocks
with (security_barrier = true, security_invoker = false)
as
select
  block_row.blocked_profile_id,
  blocked_profile.nickname as blocked_nickname,
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

-- Retain the current invite-response definition, adding the bidirectional
-- block guard only to the accepted branch.
create or replace function public.respond_to_session_invite(
  p_session_id bigint,
  p_decision text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile bigint;
  locked_session public.sessions%rowtype;
  invited_participant public.session_participants%rowtype;
  accepted_guest_count integer;
begin
  locked_session := private.lock_and_expire_session(p_session_id);

  if locked_session.status = 'expired' then
    return 'SESSION_EXPIRED';
  end if;

  viewer_profile := private.viewer_profile_id();

  if p_decision is null or p_decision not in ('accepted', 'declined') then
    raise exception 'INVALID_TRANSITION';
  end if;

  select *
  into invited_participant
  from public.session_participants participant_row
  where participant_row.session_id = locked_session.id
    and participant_row.profile_id = viewer_profile
    and participant_row.role = 'guest'
    and participant_row.status = 'invited'
  for update;

  if viewer_profile is null or not found then
    raise exception 'NOT_INVITED';
  end if;

  if locked_session.status = 'cancelled' then
    raise exception 'SESSION_CANCELLED';
  elsif locked_session.start_at + interval '2 hours' <= now() then
    raise exception 'SESSION_STARTED';
  end if;

  if p_decision = 'declined' then
    update public.session_participants
    set status = 'declined'
    where id = invited_participant.id;

    return 'OK';
  end if;

  if exists (
    select 1
    from public.player_blocks block_row
    where (
      block_row.blocker_profile_id = locked_session.host_profile_id
      and block_row.blocked_profile_id = viewer_profile
    )
    or (
      block_row.blocker_profile_id = viewer_profile
      and block_row.blocked_profile_id = locked_session.host_profile_id
    )
  ) then
    raise exception 'BLOCKED';
  end if;

  if locked_session.status = 'full' then
    raise exception 'SESSION_FULL';
  elsif locked_session.status <> 'open' then
    raise exception 'SESSION_NOT_OPEN';
  end if;

  select count(*)
  into accepted_guest_count
  from public.session_participants participant_row
  where participant_row.session_id = locked_session.id
    and participant_row.role = 'guest'
    and participant_row.status = 'accepted';

  if accepted_guest_count >= locked_session.slots_total then
    update public.sessions
    set status = 'full'
    where id = locked_session.id
      and status = 'open';
    raise exception 'SESSION_FULL';
  end if;

  update public.session_participants
  set status = 'accepted'
  where id = invited_participant.id;

  if accepted_guest_count + 1 = locked_session.slots_total then
    update public.sessions
    set status = 'full'
    where id = locked_session.id;

    update public.session_participants
    set status = 'declined'
    where session_id = locked_session.id
      and role = 'guest'
      and status in ('requested', 'invited');
  end if;

  return 'OK';
end;
$$;

-- Retain the current join-review definition, adding the bidirectional block
-- guard only to the accepted branch.
create or replace function public.review_join_request(
  p_session_id bigint,
  p_participant_id bigint,
  p_decision text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile bigint;
  locked_session public.sessions%rowtype;
  requested_participant public.session_participants%rowtype;
  accepted_guest_count integer;
  notification_message text;
begin
  viewer_profile := private.viewer_profile_id();
  locked_session := private.lock_and_expire_session(p_session_id);

  if locked_session.status = 'expired' then
    return 'SESSION_EXPIRED';
  end if;

  if viewer_profile is null or not private.is_session_host(locked_session.id, viewer_profile) then
    raise exception 'NOT_SESSION_HOST';
  end if;

  if locked_session.status = 'cancelled' then
    raise exception 'SESSION_CANCELLED';
  elsif locked_session.status not in ('open', 'full') then
    raise exception 'SESSION_NOT_OPEN';
  elsif locked_session.start_at + interval '2 hours' <= now() then
    raise exception 'SESSION_STARTED';
  end if;

  if p_decision is null or p_decision not in ('accepted', 'declined') then
    raise exception 'INVALID_TRANSITION';
  end if;

  select *
  into requested_participant
  from public.session_participants participant_row
  where participant_row.id = p_participant_id
    and participant_row.session_id = locked_session.id
  for update;

  if not found or requested_participant.role <> 'guest' then
    raise exception 'INVALID_TRANSITION';
  elsif requested_participant.status <> 'requested' then
    raise exception 'ALREADY_DECIDED';
  end if;

  if locked_session.status = 'full' then
    raise exception 'SESSION_FULL';
  end if;

  if p_decision = 'declined' then
    update public.session_participants
    set status = 'declined'
    where id = requested_participant.id;
    notification_message := '你的加入申請未被接受。';
  else
    if exists (
      select 1
      from public.player_blocks block_row
      where (
        block_row.blocker_profile_id = locked_session.host_profile_id
        and block_row.blocked_profile_id = requested_participant.profile_id
      )
      or (
        block_row.blocker_profile_id = requested_participant.profile_id
        and block_row.blocked_profile_id = locked_session.host_profile_id
      )
    ) then
      raise exception 'BLOCKED';
    end if;

    select count(*)
    into accepted_guest_count
    from public.session_participants participant_row
    where participant_row.session_id = locked_session.id
      and participant_row.role = 'guest'
      and participant_row.status = 'accepted';

    if accepted_guest_count >= locked_session.slots_total then
      update public.sessions
      set status = 'full'
      where id = locked_session.id
        and status = 'open';
      raise exception 'SESSION_FULL';
    end if;

    update public.session_participants
    set status = 'accepted'
    where id = requested_participant.id;

    if accepted_guest_count + 1 = locked_session.slots_total then
      update public.sessions
      set status = 'full'
      where id = locked_session.id;

      update public.session_participants
      set status = 'declined'
      where session_id = locked_session.id
        and role = 'guest'
        and status in ('requested', 'invited');
    end if;
    notification_message := '你的加入申請已被接受。';
  end if;

  perform private.try_enqueue_session_notification(
    'guest_request_reviewed',
    requested_participant.profile_id,
    locked_session.id,
    notification_message
  );
  return 'OK';
end;
$$;

-- Retain the effective Stage 3 invite definition. Availability comes before
-- the block guard so a hidden profile cannot disclose its block state.
create or replace function public.invite_to_session(
  p_session_id bigint,
  p_profile_id bigint
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile bigint;
  locked_session public.sessions%rowtype;
  prior_status text;
  recent_invite_count integer;
begin
  locked_session := private.lock_and_expire_session(p_session_id);

  if locked_session.status = 'expired' then
    return 'SESSION_EXPIRED';
  end if;

  perform private.require_profile_gate('ntrp');

  viewer_profile := private.viewer_profile_id();

  if viewer_profile is null or not private.is_session_host(locked_session.id, viewer_profile) then
    raise exception 'NOT_SESSION_HOST';
  end if;

  if locked_session.status = 'cancelled' then
    raise exception 'SESSION_CANCELLED';
  elsif locked_session.status = 'full' then
    raise exception 'SESSION_FULL';
  elsif locked_session.status <> 'open' then
    raise exception 'SESSION_NOT_OPEN';
  elsif locked_session.start_at + interval '2 hours' <= now() then
    raise exception 'SESSION_STARTED';
  end if;

  if p_profile_id is null or p_profile_id = viewer_profile then
    raise exception 'INVALID_TRANSITION';
  end if;

  if not exists (
    select 1
    from public.profiles profile_row
    where profile_row.id = p_profile_id
      and profile_row.is_public
      and private.profile_meets_gate(profile_row.id, 'directory')
  ) then
    raise exception 'INVITEE_NOT_AVAILABLE';
  end if;

  if exists (
    select 1
    from public.player_blocks block_row
    where (
      block_row.blocker_profile_id = viewer_profile
      and block_row.blocked_profile_id = p_profile_id
    )
    or (
      block_row.blocker_profile_id = p_profile_id
      and block_row.blocked_profile_id = viewer_profile
    )
  ) then
    raise exception 'BLOCKED';
  end if;

  select participant_row.status
  into prior_status
  from public.session_participants participant_row
  where participant_row.session_id = locked_session.id
    and participant_row.profile_id = p_profile_id;

  if found then
    if prior_status = 'requested' then
      raise exception 'ALREADY_REQUESTED';
    elsif prior_status = 'invited' then
      raise exception 'ALREADY_INVITED';
    end if;
    raise exception 'ALREADY_DECIDED';
  end if;

  perform 1
  from public.profiles profile_row
  where profile_row.id = viewer_profile
  for update;

  select count(*)
  into recent_invite_count
  from public.session_participants participant_row
  join public.sessions session_row on session_row.id = participant_row.session_id
  where session_row.host_profile_id = viewer_profile
    and participant_row.initiated_by = 'host'
    and participant_row.created_at > now() - interval '24 hours';

  if recent_invite_count >= 10 then
    raise exception 'INVITE_LIMIT';
  end if;

  insert into public.session_participants (session_id, profile_id, role, status, initiated_by)
  values (locked_session.id, p_profile_id, 'guest', 'invited', 'host');

  perform private.try_enqueue_session_notification(
    'guest_invited',
    p_profile_id,
    locked_session.id,
    '你收到一個球局邀請。'
  );
  return 'OK';
end;
$$;

create or replace function public.set_player_block(
  p_profile_id bigint,
  p_blocked boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile bigint;
begin
  viewer_profile := private.viewer_profile_id();

  if viewer_profile is null then
    raise exception 'PROFILE_INCOMPLETE';
  end if;

  if p_profile_id is null
    or p_blocked is null
    or p_profile_id = viewer_profile then
    raise exception 'INVALID_TRANSITION';
  end if;

  if not exists (
    select 1
    from public.profiles profile_row
    where profile_row.id = p_profile_id
  ) then
    raise exception 'INVALID_TRANSITION';
  end if;

  if p_blocked then
    insert into public.player_blocks (blocker_profile_id, blocked_profile_id)
    values (viewer_profile, p_profile_id)
    on conflict (blocker_profile_id, blocked_profile_id) do nothing;
  else
    delete from public.player_blocks
    where blocker_profile_id = viewer_profile
      and blocked_profile_id = p_profile_id;
  end if;

  return 'OK';
end;
$$;

create or replace function public.post_session_message(
  p_session_id bigint,
  p_body text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile bigint;
  locked_session public.sessions%rowtype;
  recipient_row record;
begin
  viewer_profile := private.viewer_profile_id();
  locked_session := private.lock_and_expire_session(p_session_id);

  if viewer_profile is null
    or not exists (
      select 1
      from public.session_participants participant_row
      where participant_row.session_id = locked_session.id
        and participant_row.profile_id = viewer_profile
        and participant_row.status = 'accepted'
    ) then
    raise exception 'NOT_SESSION_MEMBER';
  end if;

  if locked_session.status not in ('open', 'full') then
    return 'SESSION_ARCHIVED';
  end if;

  p_body := btrim(
    p_body,
    chr(32) || chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(12288)
  );
  if p_body is null or p_body = '' or char_length(p_body) > 1000 then
    raise exception 'INVALID_MESSAGE';
  end if;

  insert into public.session_messages (
    session_id,
    sender_profile_id,
    kind,
    body
  )
  values (
    locked_session.id,
    viewer_profile,
    'user',
    p_body
  );

  for recipient_row in
    select participant_row.profile_id
    from public.session_participants participant_row
    where participant_row.session_id = locked_session.id
      and participant_row.status = 'accepted'
      and participant_row.profile_id <> viewer_profile
  loop
    begin
      if not exists (
        select 1
        from public.notification_outbox outbox_row
        where outbox_row.event_type = 'chat_message'
          and outbox_row.session_id = locked_session.id
          and outbox_row.recipient_profile_id = recipient_row.profile_id
          and outbox_row.created_at > now() - interval '5 minutes'
      ) then
        perform private.enqueue_notification(
          'chat_message',
          recipient_row.profile_id,
          locked_session.id,
          private.notification_session_payload(
            locked_session.id,
            '群組有新訊息'
          )
        );
      end if;
    exception when others then
      raise warning 'chat notification recipient skipped for session %', locked_session.id;
    end;
  end loop;

  return 'OK';
end;
$$;
