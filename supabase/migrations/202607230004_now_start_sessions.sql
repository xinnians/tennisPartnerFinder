-- 允許 now-start 球局；探索與新加入只開放至排定開始後兩小時。
-- 既有 24 小時到期與開打後生命週期規則維持不變。

create or replace function private.enforce_session_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'open'
      or new.start_at < now() - interval '5 minutes' then
      raise exception 'INVALID_TRANSITION';
    end if;

    return new;
  end if;

  if new.host_profile_id is distinct from old.host_profile_id then
    raise exception 'INVALID_TRANSITION';
  end if;

  if new.start_at is distinct from old.start_at then
    raise exception 'INVALID_TRANSITION';
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'open' and new.status in ('full', 'cancelled', 'played', 'expired'))
      or (old.status = 'full' and new.status in ('open', 'cancelled', 'played', 'expired'))
    ) then
      raise exception 'INVALID_TRANSITION';
    end if;

    if (
      new.status in ('open', 'full', 'cancelled')
      and old.start_at <= now()
      and not (
        (
          old.status = 'full'
          and new.status = 'open'
          and pg_trigger_depth() > 1
          and (
            select count(*)
            from public.session_participants participant_row
            where participant_row.session_id = new.id
              and participant_row.role = 'guest'
              and participant_row.status = 'accepted'
          ) < new.slots_total
        ) or (
          old.status = 'open'
          and new.status = 'full'
          and (
            select count(*)
            from public.session_participants participant_row
            where participant_row.session_id = new.id
              and participant_row.role = 'guest'
              and participant_row.status = 'accepted'
          ) >= new.slots_total
        )
      )
    ) or (
      new.status = 'played'
      and (
        old.start_at > now()
        or old.start_at <= now() - interval '24 hours'
      )
    ) or (
      new.status = 'expired'
      and old.start_at > now() - interval '24 hours'
    ) then
      raise exception 'INVALID_TRANSITION';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.enforce_session_participant_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_session public.sessions%rowtype;
  accepted_guest_count bigint;
  played_confirmation_is_new boolean;
begin
  if tg_op = 'INSERT' then
    if new.role = 'host' then
      if new.status <> 'accepted'
        or not exists (
          select 1
          from public.sessions session_row
          where session_row.id = new.session_id
            and session_row.host_profile_id = new.profile_id
        ) then
        raise exception 'INVALID_TRANSITION';
      end if;
    elsif new.status not in ('requested', 'invited') then
      raise exception 'INVALID_TRANSITION';
    end if;
  else
    if new.session_id is distinct from old.session_id
      or new.profile_id is distinct from old.profile_id
      or new.role is distinct from old.role then
      raise exception 'INVALID_TRANSITION';
    end if;

    if old.role = 'host' then
      if new.status <> 'accepted' then
        raise exception 'INVALID_TRANSITION';
      end if;
    elsif new.status is distinct from old.status
      and not (
        (old.status = 'requested' and new.status in ('accepted', 'declined', 'withdrawn'))
        or (old.status = 'invited' and new.status in ('accepted', 'declined'))
        or (old.status = 'accepted' and new.status = 'withdrawn')
      ) then
      raise exception 'INVALID_TRANSITION';
    end if;
  end if;

  if tg_op = 'INSERT' then
    played_confirmation_is_new := new.played_confirmed;
  else
    played_confirmation_is_new := new.played_confirmed and not old.played_confirmed;
  end if;

  if new.role = 'guest' and new.status in ('requested', 'invited') then
    select *
    into parent_session
    from public.sessions session_row
    where session_row.id = new.session_id
    for update;

    if not found
      or parent_session.status <> 'open'
      or parent_session.start_at + interval '2 hours' <= now() then
      raise exception 'INVALID_TRANSITION';
    end if;
  end if;

  if new.status <> 'accepted' and new.played_confirmed then
    raise exception 'INVALID_TRANSITION';
  end if;

  if tg_op = 'UPDATE'
    and new.role = 'guest'
    and new.status = 'accepted'
    and new.status is distinct from old.status then
    if old.status not in ('requested', 'invited') then
      raise exception 'INVALID_TRANSITION';
    end if;

    select *
    into parent_session
    from public.sessions session_row
    where session_row.id = new.session_id
    for update;

    if not found
      or parent_session.status <> 'open'
      or parent_session.start_at + interval '2 hours' <= now() then
      raise exception 'INVALID_TRANSITION';
    end if;

    select count(*)
    into accepted_guest_count
    from public.session_participants participant_row
    where participant_row.session_id = new.session_id
      and participant_row.role = 'guest'
      and participant_row.status = 'accepted';

    if accepted_guest_count >= parent_session.slots_total then
      raise exception 'INVALID_TRANSITION';
    end if;
  end if;

  if tg_op = 'UPDATE'
    and new.role = 'guest'
    and new.status = 'withdrawn'
    and new.status is distinct from old.status then
    select *
    into parent_session
    from public.sessions session_row
    where session_row.id = new.session_id
    for update;

    if not found
      or parent_session.status not in ('open', 'full')
      or parent_session.start_at <= now() then
      raise exception 'INVALID_TRANSITION';
    end if;
  end if;

  if played_confirmation_is_new then
    select *
    into parent_session
    from public.sessions session_row
    where session_row.id = new.session_id
    for update;

    if not found
      or new.status <> 'accepted'
      or parent_session.status not in ('open', 'full', 'played')
      or parent_session.start_at > now()
      or parent_session.start_at <= now() - interval '24 hours' then
      raise exception 'INVALID_TRANSITION';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.create_session(
  p_court_id bigint,
  p_play_type text,
  p_start_at timestamptz,
  p_ntrp_min numeric,
  p_ntrp_max numeric,
  p_slots_total integer,
  p_notes text,
  p_join_mode text default 'approval'
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  host_profile bigint;
  tennis_sport_id bigint;
  taipei_court_id bigint;
  created_session_id bigint;
  host_open_session_count integer;
  session_district text;
begin
  host_profile := private.require_complete_profile();

  if p_start_at is null or p_start_at < now() - interval '5 minutes' then
    raise exception 'SESSION_STARTED';
  end if;

  if p_play_type is null
    or p_play_type not in ('單打', '雙打', '對拉', '練球')
    or p_slots_total is null
    or p_slots_total not between 1 and 3
    or (p_notes is not null and char_length(p_notes) > 500)
    or p_join_mode is null
    or p_join_mode not in ('approval', 'instant')
    or ((p_ntrp_min is null) <> (p_ntrp_max is null))
    or (p_ntrp_min is not null and (
      p_ntrp_min not between 1.0 and 7.0
      or p_ntrp_max not between 1.0 and 7.0
      or p_ntrp_min > p_ntrp_max
    )) then
    raise exception 'INVALID_TRANSITION';
  end if;

  select sport_row.id
  into tennis_sport_id
  from public.sports sport_row
  where sport_row.code = 'tennis'
    and sport_row.is_active;

  if tennis_sport_id is null then
    raise exception 'INVALID_TRANSITION';
  end if;

  select court_row.id, court_row.district
  into taipei_court_id, session_district
  from public.courts court_row
  where court_row.id = p_court_id
    and court_row.is_active
    and court_row.city = '台北市';

  if taipei_court_id is null then
    raise exception 'INVALID_TRANSITION';
  end if;

  perform 1
  from public.profiles profile_row
  where profile_row.id = host_profile
  for update;
  select count(*)
  into host_open_session_count
  from public.sessions session_row
  where session_row.host_profile_id = host_profile
    and session_row.status in ('open', 'full')
    and session_row.start_at > now();

  if host_open_session_count >= 5 then
    raise exception 'SESSION_LIMIT';
  end if;

  insert into public.sessions (
    sport_id, host_profile_id, court_id, play_type, start_at,
    ntrp_min, ntrp_max, slots_total, notes, join_mode
  )
  values (
    tennis_sport_id, host_profile, taipei_court_id, p_play_type, p_start_at,
    p_ntrp_min, p_ntrp_max, p_slots_total::smallint, p_notes, p_join_mode
  )
  returning id into created_session_id;

  insert into public.session_participants (session_id, profile_id, role, status)
  values (created_session_id, host_profile, 'host', 'accepted');

  perform private.try_enqueue_district_new_session(created_session_id, session_district);
  return created_session_id;
end;
$$;

create or replace function public.request_to_join_session(p_session_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  guest_profile bigint;
  locked_session public.sessions%rowtype;
  prior_status text;
  accepted_guest_count integer;
begin
  locked_session := private.lock_and_expire_session(p_session_id);

  if locked_session.status = 'expired' then
    return 'SESSION_EXPIRED';
  end if;

  guest_profile := private.require_complete_profile();

  if locked_session.status = 'cancelled' then
    raise exception 'SESSION_CANCELLED';
  elsif locked_session.status = 'full' then
    raise exception 'SESSION_FULL';
  elsif locked_session.status <> 'open' then
    raise exception 'SESSION_NOT_OPEN';
  elsif locked_session.start_at + interval '2 hours' <= now() then
    raise exception 'SESSION_STARTED';
  end if;

  if not exists (
    select 1
    from public.courts court_row
    join public.sports sport_row on sport_row.id = locked_session.sport_id
    where court_row.id = locked_session.court_id
      and court_row.is_active
      and court_row.city = '台北市'
      and sport_row.code = 'tennis'
      and sport_row.is_active
  ) then
    raise exception 'INVALID_TRANSITION';
  end if;

  if locked_session.host_profile_id = guest_profile then
    raise exception 'INVALID_TRANSITION';
  end if;

  select participant_row.status
  into prior_status
  from public.session_participants participant_row
  where participant_row.session_id = locked_session.id
    and participant_row.profile_id = guest_profile;

  if found then
    if prior_status = 'requested' then
      raise exception 'ALREADY_REQUESTED';
    end if;
    raise exception 'ALREADY_DECIDED';
  end if;

  if locked_session.join_mode = 'instant' then
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

    insert into public.session_participants (session_id, profile_id, role, status)
    values (locked_session.id, guest_profile, 'guest', 'requested');

    update public.session_participants
    set status = 'accepted'
    where session_id = locked_session.id
      and profile_id = guest_profile;

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

    perform private.try_enqueue_session_notification(
      'host_new_request',
      locked_session.host_profile_id,
      locked_session.id,
      '有球友直接加入你的球局。'
    );
    return 'ACCEPTED';
  end if;

  insert into public.session_participants (session_id, profile_id, role, status)
  values (locked_session.id, guest_profile, 'guest', 'requested');

  perform private.try_enqueue_session_notification(
    'host_new_request',
    locked_session.host_profile_id,
    locked_session.id,
    '有人申請加入你的球局。'
  );
  return 'OK';
end;
$$;

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
      and private.has_complete_profile(profile_row.user_id)
  ) then
    raise exception 'INVITEE_NOT_AVAILABLE';
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

create or replace view public.session_discovery
with (security_barrier = true, security_invoker = false)
as
select
  session_row.id,
  session_row.id as session_id,
  sport_row.code as sport_code,
  session_row.court_id,
  court_row.name as court,
  court_row.district as court_district,
  court_row.lat as court_lat,
  court_row.lng as court_lng,
  session_row.start_at,
  session_row.play_type,
  session_row.ntrp_min,
  session_row.ntrp_max,
  session_row.slots_total,
  (
    session_row.slots_total
    - count(participant_row.id) filter (
      where participant_row.role = 'guest' and participant_row.status = 'accepted'
    )
  )::smallint as slots_remaining,
  session_row.notes,
  host_profile.nickname as host_nickname,
  host_profile.ntrp as host_ntrp,
  true as host_profile_complete,
  session_row.status,
  session_row.join_mode
from public.sessions session_row
join public.sports sport_row on sport_row.id = session_row.sport_id
join public.courts court_row on court_row.id = session_row.court_id
join public.profiles host_profile on host_profile.id = session_row.host_profile_id
left join public.session_participants participant_row
  on participant_row.session_id = session_row.id
where session_row.status in ('open', 'full')
  and session_row.start_at + interval '2 hours' > now()
  and sport_row.code = 'tennis'
  and sport_row.is_active
  and court_row.is_active
  and court_row.city = '台北市'
group by
  session_row.id,
  sport_row.code,
  court_row.name,
  court_row.district,
  court_row.lat,
  court_row.lng,
  host_profile.nickname,
  host_profile.ntrp,
  session_row.join_mode;

create or replace view public.my_session_participations
with (security_barrier = true, security_invoker = false)
as
select
  session_row.id,
  session_row.id as session_id,
  sport_row.code as sport_code,
  session_row.court_id,
  court_row.name as court,
  court_row.district as court_district,
  court_row.lat as court_lat,
  court_row.lng as court_lng,
  session_row.start_at,
  session_row.play_type,
  session_row.ntrp_min,
  session_row.ntrp_max,
  session_row.slots_total,
  (
    session_row.slots_total
    - count(accepted_guest.id) filter (
      where accepted_guest.role = 'guest' and accepted_guest.status = 'accepted'
    )
  )::smallint as slots_remaining,
  session_row.notes,
  host_profile.nickname as host_nickname,
  host_profile.ntrp as host_ntrp,
  true as host_profile_complete,
  session_row.status,
  viewer_participant.role as viewer_role,
  viewer_participant.status as viewer_participant_status,
  viewer_participant.played_confirmed as viewer_played_confirmed,
  session_row.updated_at,
  (
    viewer_participant.role = 'host'
    and session_row.status in ('open', 'full')
    and session_row.start_at > now()
  ) as can_cancel,
  (
    viewer_participant.role = 'guest'
    and viewer_participant.status in ('requested', 'accepted')
    and session_row.status in ('open', 'full')
    and session_row.start_at > now()
  ) as can_withdraw,
  (
    viewer_participant.role = 'host'
    and session_row.status in ('open', 'full')
    and session_row.start_at <= now()
    and session_row.start_at > now() - interval '24 hours'
  ) as can_confirm_played,
  (
    viewer_participant.status = 'accepted'
    and session_row.status in ('open', 'full', 'played')
    and session_row.start_at <= now()
    and session_row.start_at > now() - interval '24 hours'
  ) as can_confirm_attendance,
  session_row.join_mode,
  (
    viewer_participant.status = 'invited'
    and session_row.status in ('open', 'full')
    and session_row.start_at + interval '2 hours' > now()
  ) as can_respond_invite
from public.sessions session_row
join public.session_participants viewer_participant
  on viewer_participant.session_id = session_row.id
  and viewer_participant.profile_id = (
    select profile_row.id
    from public.profiles profile_row
    where profile_row.user_id = auth.uid()
  )
join public.sports sport_row on sport_row.id = session_row.sport_id
join public.courts court_row on court_row.id = session_row.court_id
join public.profiles host_profile on host_profile.id = session_row.host_profile_id
left join public.session_participants accepted_guest
  on accepted_guest.session_id = session_row.id
group by
  session_row.id,
  sport_row.code,
  court_row.name,
  court_row.district,
  court_row.lat,
  court_row.lng,
  host_profile.nickname,
  host_profile.ntrp,
  viewer_participant.id,
  viewer_participant.role,
  viewer_participant.status,
  viewer_participant.played_confirmed,
  session_row.join_mode;

revoke all on function public.create_session(bigint, text, timestamptz, numeric, numeric, integer, text, text) from public, anon, authenticated;
revoke all on function public.request_to_join_session(bigint) from public, anon, authenticated;
revoke all on function public.review_join_request(bigint, bigint, text) from public, anon, authenticated;
revoke all on function public.invite_to_session(bigint, bigint) from public, anon, authenticated;
revoke all on function public.respond_to_session_invite(bigint, text) from public, anon, authenticated;
grant execute on function public.create_session(bigint, text, timestamptz, numeric, numeric, integer, text, text) to authenticated;
grant execute on function public.request_to_join_session(bigint) to authenticated;
grant execute on function public.review_join_request(bigint, bigint, text) to authenticated;
grant execute on function public.invite_to_session(bigint, bigint) to authenticated;
grant execute on function public.respond_to_session_invite(bigint, text) to authenticated;

revoke all on table public.my_session_participations from public, anon, authenticated;
grant select on table public.my_session_participations to authenticated;
