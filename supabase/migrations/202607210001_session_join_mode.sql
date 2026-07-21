alter table public.sessions
  add column join_mode text not null default 'approval'
  check (join_mode in ('approval', 'instant'));

drop function public.create_session(bigint, text, timestamptz, numeric, numeric, integer, text);

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
begin
  host_profile := private.require_complete_profile();

  if p_start_at is null or p_start_at <= now() then
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

  select court_row.id
  into taipei_court_id
  from public.courts court_row
  where court_row.id = p_court_id
    and court_row.is_active
    and court_row.city = '台北市';

  if taipei_court_id is null then
    raise exception 'INVALID_TRANSITION';
  end if;

  -- 單一主揪同時掛在架上的未來球局上限，siege 防護。
  -- 鎖住主揪 profile，序列化同一主揪的並行開局計數與新增。
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

  return created_session_id;
end;
$$;

revoke all on function public.create_session(bigint, text, timestamptz, numeric, numeric, integer, text, text) from public, anon, authenticated;
grant execute on function public.create_session(bigint, text, timestamptz, numeric, numeric, integer, text, text) to authenticated;

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
  elsif locked_session.start_at <= now() then
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
    -- 直接加入：insert requested 再同交易轉 accepted，
    -- 完整沿用 participant trigger 的轉移與容量防護。
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
        and status = 'requested';
    end if;

    return 'ACCEPTED';
  end if;

  insert into public.session_participants (session_id, profile_id, role, status)
  values (locked_session.id, guest_profile, 'guest', 'requested');

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
  and session_row.start_at > now()
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
  session_row.join_mode
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
