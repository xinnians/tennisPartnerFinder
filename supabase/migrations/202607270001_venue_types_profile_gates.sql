-- Stage 1: venue type data, profile-gate matrix, and court subscriptions.

alter table public.sessions
  add column venue_type text not null default 'booked' check (venue_type in ('booked', 'walk_on', 'candidates')),
  add column range_end timestamptz,
  add column decided_at timestamptz;

alter table public.sessions
  add constraint sessions_venue_time_shape check (
    (venue_type = 'candidates' and range_end is not null and range_end > start_at)
    or (venue_type in ('booked','walk_on') and range_end is null and decided_at is null)
  );

create table public.session_candidate_courts (
  session_id bigint not null references public.sessions(id) on delete cascade,
  court_id bigint not null references public.courts(id),
  position smallint not null check (position between 1 and 3),
  primary key (session_id, court_id),
  unique (session_id, position)
);

create table public.court_subscriptions (
  profile_id bigint not null references public.profiles(id) on delete cascade,
  court_id bigint not null references public.courts(id),
  created_at timestamptz not null default now(),
  primary key (profile_id, court_id)
);

alter table public.session_candidate_courts enable row level security;
alter table public.court_subscriptions enable row level security;

revoke all on table public.session_candidate_courts, public.court_subscriptions
from public, anon, authenticated;

create policy "court subscriptions are readable by owner"
on public.court_subscriptions for select to authenticated
using (public.owns_notification_profile(profile_id));

grant select on table public.court_subscriptions to authenticated;

create or replace function private.profile_meets_gate(p_profile_id bigint, p_level text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_level
    when 'nickname' then exists (
      select 1 from public.profiles profile_row
      where profile_row.id = p_profile_id
        and btrim(coalesce(profile_row.nickname, '')) <> ''
    )
    when 'ntrp' then exists (
      select 1 from public.profiles profile_row
      where profile_row.id = p_profile_id
        and btrim(coalesce(profile_row.nickname, '')) <> ''
        and profile_row.ntrp between 1.0 and 7.0
    )
    when 'directory' then exists (
      select 1
      from public.profiles profile_row
      where profile_row.id = p_profile_id
        and btrim(coalesce(profile_row.nickname, '')) <> ''
        and profile_row.ntrp between 1.0 and 7.0
        and exists (
          select 1
          from public.profile_courts profile_court_row
          join public.courts court_row on court_row.id = profile_court_row.court_id
          where profile_court_row.profile_id = profile_row.id
            and court_row.is_active
            and court_row.city = '台北市'
        )
    )
    else false
  end
$$;

create or replace function private.require_profile_gate(p_level text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile bigint;
begin
  if p_level not in ('nickname', 'ntrp', 'directory') then
    raise exception 'INVALID_TRANSITION';
  end if;

  viewer_profile := private.viewer_profile_id();
  if viewer_profile is null
    or not private.profile_meets_gate(viewer_profile, p_level) then
    raise exception 'PROFILE_INCOMPLETE';
  end if;

  return viewer_profile;
end;
$$;

create or replace function public.save_my_profile(
  p_nickname text,
  p_ntrp numeric,
  p_line_id text,
  p_court_ids bigint[],
  p_play_types text[],
  p_slot_codes text[]
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_profile_id bigint;
begin
  if auth.uid() is null
    or p_nickname is null
    or btrim(p_nickname) = ''
    or (p_ntrp is not null and p_ntrp not between 1.0 and 7.0) then
    raise exception 'PROFILE_INCOMPLETE';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_court_ids, '{}'::bigint[])) as requested_court(court_id)
    left join public.courts court_row
      on court_row.id = requested_court.court_id
      and court_row.is_active
      and court_row.city = '台北市'
    where court_row.id is null
  )
  or exists (
    select 1
    from unnest(coalesce(p_play_types, '{}'::text[])) as requested_play_type(play_type)
    where requested_play_type.play_type is null
      or requested_play_type.play_type not in ('單打', '雙打', '對拉', '練球')
  )
  or exists (
    select 1
    from unnest(coalesce(p_slot_codes, '{}'::text[])) as requested_slot(slot_code)
    where requested_slot.slot_code is null
      or requested_slot.slot_code not in ('wd-m', 'wd-a', 'wd-e', 'we-m', 'we-a', 'we-e')
  ) then
    raise exception 'PROFILE_INCOMPLETE';
  end if;

  insert into public.profiles (user_id, nickname, ntrp, line_id, is_public)
  values (auth.uid(), btrim(p_nickname), p_ntrp, nullif(btrim(coalesce(p_line_id, '')), ''), false)
  on conflict (user_id) do update
  set nickname = excluded.nickname,
      ntrp = excluded.ntrp,
      line_id = excluded.line_id
  returning id into saved_profile_id;

  delete from public.profile_courts where profile_id = saved_profile_id;
  delete from public.profile_play_types where profile_id = saved_profile_id;
  delete from public.profile_slots where profile_id = saved_profile_id;

  insert into public.profile_courts (profile_id, court_id)
  select saved_profile_id, distinct_court.court_id
  from (
    select distinct requested_court.court_id
    from unnest(coalesce(p_court_ids, '{}'::bigint[])) as requested_court(court_id)
  ) as distinct_court;

  insert into public.profile_play_types (profile_id, play_type)
  select saved_profile_id, distinct_play_type.play_type
  from (
    select distinct requested_play_type.play_type
    from unnest(coalesce(p_play_types, '{}'::text[])) as requested_play_type(play_type)
  ) as distinct_play_type;

  insert into public.profile_slots (profile_id, slot_code)
  select saved_profile_id, distinct_slot.slot_code
  from (
    select distinct requested_slot.slot_code
    from unnest(coalesce(p_slot_codes, '{}'::text[])) as requested_slot(slot_code)
  ) as distinct_slot;

  return saved_profile_id;
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
  host_profile := private.require_profile_gate('ntrp');

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
  select count(*) into host_open_session_count
  from public.sessions session_row
  where session_row.host_profile_id = host_profile
    and session_row.status in ('open', 'full')
    and session_row.start_at + interval '2 hours' > now();
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

  guest_profile := private.require_profile_gate('nickname');

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

create or replace function public.set_player_visibility(p_visible boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile bigint;
begin
  viewer_profile := private.require_profile_gate('directory');

  if p_visible is null then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.profiles
  set is_public = p_visible
  where id = viewer_profile;

  return 'OK';
end;
$$;

create or replace function public.set_presence_sharing(p_enabled boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile bigint;
begin
  viewer_profile := private.require_profile_gate('ntrp');

  if p_enabled is null then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.profiles
  set share_presence = p_enabled
  where id = viewer_profile;

  if not p_enabled then
    delete from public.player_presence
    where profile_id = viewer_profile;
  end if;

  return 'OK';
end;
$$;

create or replace function public.set_open_to_greeting(p_enabled boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile bigint;
begin
  viewer_profile := private.require_profile_gate('ntrp');

  if p_enabled is null then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.profiles
  set open_to_greeting = p_enabled
  where id = viewer_profile;

  return 'OK';
end;
$$;

create or replace function public.update_my_presence(
  p_lat double precision,
  p_lng double precision
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile bigint;
  sharing_enabled boolean;
  nearest_court_id bigint;
begin
  viewer_profile := private.require_profile_gate('ntrp');

  if p_lat is null
    or p_lng is null
    or p_lat not between -90 and 90
    or p_lng not between -180 and 180 then
    raise exception 'INVALID_TRANSITION';
  end if;

  select profile_row.share_presence
  into sharing_enabled
  from public.profiles profile_row
  where profile_row.id = viewer_profile
  for update;

  if not coalesce(sharing_enabled, false) then
    return 'OK';
  end if;

  select candidate.court_id
  into nearest_court_id
  from (
    select
      court_row.id as court_id,
      6371000 * 2 * asin(
        sqrt(
          power(sin(radians(court_row.lat - p_lat) / 2), 2)
          + cos(radians(p_lat)) * cos(radians(court_row.lat))
            * power(sin(radians(court_row.lng - p_lng) / 2), 2)
        )
      ) as distance_metres
    from public.courts court_row
    where court_row.is_active
      and court_row.city = '台北市'
  ) as candidate
  where candidate.distance_metres <= 100
  order by candidate.distance_metres, candidate.court_id
  limit 1;

  if nearest_court_id is null then
    return 'OK';
  end if;

  insert into public.player_presence (profile_id, court_id, updated_at)
  values (viewer_profile, nearest_court_id, now())
  on conflict (profile_id) do update
  set court_id = excluded.court_id,
      updated_at = excluded.updated_at;

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
  private.profile_meets_gate(host_profile.id, 'ntrp') as host_profile_complete,
  session_row.status,
  session_row.join_mode,
  session_row.venue_type, session_row.range_end,
  case when session_row.venue_type = 'candidates' then (
    select array_agg(candidate_court.court_id order by candidate_court.position)
    from public.session_candidate_courts candidate_court
    where candidate_court.session_id = session_row.id
  ) else null end as candidate_court_ids
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
  host_profile.id,
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
  ) as can_respond_invite,
  session_row.venue_type, session_row.range_end, session_row.decided_at
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

create or replace function public.set_court_subscriptions(p_court_ids bigint[])
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare viewer_profile_id bigint;
begin
  if coalesce(cardinality(p_court_ids), 0) > 10
    or exists (
      select 1 from unnest(coalesce(p_court_ids, '{}'::bigint[])) as requested_court(court_id)
      left join public.courts court_row on court_row.id = requested_court.court_id and court_row.is_active and court_row.city = '台北市'
      where requested_court.court_id is null or court_row.id is null
    ) then
    raise exception 'INVALID_TRANSITION';
  end if;
  viewer_profile_id := private.ensure_notification_profile();
  delete from public.court_subscriptions where profile_id = viewer_profile_id;
  insert into public.court_subscriptions (profile_id, court_id)
  select viewer_profile_id, distinct_court.court_id from (select distinct requested_court.court_id from unnest(coalesce(p_court_ids, '{}'::bigint[])) as requested_court(court_id)) as distinct_court;
  return 'OK';
end;
$$;

revoke all on function public.set_court_subscriptions(bigint[]) from public, anon, authenticated;
grant execute on function public.set_court_subscriptions(bigint[]) to authenticated;

revoke all on function public.create_session(bigint, text, timestamptz, numeric, numeric, integer, text, text) from public, anon, authenticated;
revoke all on function public.request_to_join_session(bigint) from public, anon, authenticated;
revoke all on function public.invite_to_session(bigint, bigint) from public, anon, authenticated;
revoke all on function public.set_player_visibility(boolean) from public, anon, authenticated;
revoke all on function public.set_presence_sharing(boolean) from public, anon, authenticated;
revoke all on function public.set_open_to_greeting(boolean) from public, anon, authenticated;
revoke all on function public.update_my_presence(double precision, double precision) from public, anon, authenticated;
grant execute on function public.create_session(bigint, text, timestamptz, numeric, numeric, integer, text, text) to authenticated;
grant execute on function public.request_to_join_session(bigint) to authenticated;
grant execute on function public.invite_to_session(bigint, bigint) to authenticated;
grant execute on function public.set_player_visibility(boolean) to authenticated;
grant execute on function public.set_presence_sharing(boolean) to authenticated;
grant execute on function public.set_open_to_greeting(boolean) to authenticated;
grant execute on function public.update_my_presence(double precision, double precision) to authenticated;
