-- Section 1: invited participant status and invitation initiator audit field.

alter table public.session_participants
  drop constraint session_participants_status_check;
alter table public.session_participants
  add constraint session_participants_status_check
  check (status in ('requested', 'invited', 'accepted', 'declined', 'withdrawn'));

alter table public.session_participants
  add column initiated_by text not null default 'guest'
  check (initiated_by in ('guest', 'host'));

-- Section 2: invited lifecycle allowances and capacity invariants.

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
      or parent_session.start_at <= now() then
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
      or parent_session.start_at <= now() then
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

create or replace function private.enforce_session_capacity_invariant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session_id bigint;
  session_status text;
  guest_slots smallint;
  accepted_guest_count bigint;
begin
  if tg_table_name = 'sessions' then
    if tg_op = 'DELETE' then
      return null;
    end if;
    target_session_id := new.id;
  elsif tg_op = 'DELETE' then
    target_session_id := old.session_id;
  else
    target_session_id := new.session_id;
  end if;

  select session_row.status, session_row.slots_total
  into session_status, guest_slots
  from public.sessions session_row
  where session_row.id = target_session_id;

  if not found then
    return null;
  end if;

  select count(*)
  into accepted_guest_count
  from public.session_participants participant_row
  where participant_row.session_id = target_session_id
    and participant_row.role = 'guest'
    and participant_row.status = 'accepted';

  if (session_status = 'open' and accepted_guest_count >= guest_slots)
    or (session_status = 'full' and accepted_guest_count <> guest_slots)
    or (
      session_status = 'full'
      and exists (
        select 1
        from public.session_participants participant_row
        where participant_row.session_id = target_session_id
          and participant_row.role = 'guest'
          and participant_row.status in ('requested', 'invited')
      )
    ) then
    raise exception 'INVALID_TRANSITION';
  end if;

  return null;
end;
$$;

-- Section 3: profile visibility persistence and owner-only visibility control.

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
    or p_line_id is null
    or btrim(p_line_id) = ''
    or p_ntrp is null
    or p_ntrp not between 1.0 and 7.0
    or coalesce(cardinality(p_court_ids), 0) = 0
    or coalesce(cardinality(p_play_types), 0) = 0
    or coalesce(cardinality(p_slot_codes), 0) = 0 then
    raise exception 'PROFILE_INCOMPLETE';
  end if;

  if exists (
    select 1
    from unnest(p_court_ids) as requested_court(court_id)
    left join public.courts court_row
      on court_row.id = requested_court.court_id
      and court_row.is_active
      and court_row.city = '台北市'
    where court_row.id is null
  )
  or exists (
    select 1
    from unnest(p_play_types) as requested_play_type(play_type)
    where requested_play_type.play_type is null
      or requested_play_type.play_type not in ('單打', '雙打', '對拉', '練球')
  )
  or exists (
    select 1
    from unnest(p_slot_codes) as requested_slot(slot_code)
    where requested_slot.slot_code is null
      or requested_slot.slot_code not in ('wd-m', 'wd-a', 'wd-e', 'we-m', 'we-a', 'we-e')
  ) then
    raise exception 'PROFILE_INCOMPLETE';
  end if;

  insert into public.profiles (user_id, nickname, ntrp, line_id, is_public)
  values (auth.uid(), btrim(p_nickname), p_ntrp, btrim(p_line_id), false)
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
    from unnest(p_court_ids) as requested_court(court_id)
  ) as distinct_court;

  insert into public.profile_play_types (profile_id, play_type)
  select saved_profile_id, distinct_play_type.play_type
  from (
    select distinct requested_play_type.play_type
    from unnest(p_play_types) as requested_play_type(play_type)
  ) as distinct_play_type;

  insert into public.profile_slots (profile_id, slot_code)
  select saved_profile_id, distinct_slot.slot_code
  from (
    select distinct requested_slot.slot_code
    from unnest(p_slot_codes) as requested_slot(slot_code)
  ) as distinct_slot;

  return saved_profile_id;
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
  viewer_profile := private.require_complete_profile();

  if p_visible is null then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.profiles
  set is_public = p_visible
  where id = viewer_profile;

  return 'OK';
end;
$$;

revoke all on function public.set_player_visibility(boolean) from public, anon, authenticated;
grant execute on function public.set_player_visibility(boolean) to authenticated;

create or replace view public.my_profile
with (security_barrier = true, security_invoker = false)
as
select
  profile_row.nickname,
  profile_row.ntrp,
  profile_row.line_id,
  coalesce(
    (
      select array_agg(profile_court_row.court_id order by profile_court_row.court_id)
      from public.profile_courts profile_court_row
      where profile_court_row.profile_id = profile_row.id
    ),
    '{}'::bigint[]
  ) as court_ids,
  coalesce(
    (
      select array_agg(profile_play_type_row.play_type order by profile_play_type_row.play_type)
      from public.profile_play_types profile_play_type_row
      where profile_play_type_row.profile_id = profile_row.id
    ),
    '{}'::text[]
  ) as play_types,
  coalesce(
    (
      select array_agg(profile_slot_row.slot_code order by profile_slot_row.slot_code)
      from public.profile_slots profile_slot_row
      where profile_slot_row.profile_id = profile_row.id
    ),
    '{}'::text[]
  ) as slot_codes,
  profile_row.is_public
from public.profiles profile_row
where profile_row.user_id = auth.uid();

-- Section 4: complete-profile helper and authenticated player directory.

create or replace function private.has_complete_profile(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile_row
    where profile_row.user_id = p_user_id
      and btrim(profile_row.nickname) <> ''
      and btrim(coalesce(profile_row.line_id, '')) <> ''
      and profile_row.ntrp between 1.0 and 7.0
      and exists (
        select 1
        from public.profile_play_types play_type_row
        where play_type_row.profile_id = profile_row.id
      )
      and exists (
        select 1
        from public.profile_courts profile_court_row
        join public.courts court_row on court_row.id = profile_court_row.court_id
        where profile_court_row.profile_id = profile_row.id
          and court_row.is_active
          and court_row.city = '台北市'
      )
  );
$$;

revoke all on function private.has_complete_profile(uuid) from public, anon, authenticated;
grant execute on function private.has_complete_profile(uuid) to authenticated;

create or replace view public.player_directory
with (security_barrier = true, security_invoker = false)
as
select
  profile_row.id as profile_id,
  profile_row.nickname,
  profile_row.ntrp,
  coalesce(
    (select array_agg(play_type_row.play_type order by play_type_row.play_type)
     from public.profile_play_types play_type_row
     where play_type_row.profile_id = profile_row.id),
    '{}'::text[]
  ) as play_types,
  coalesce(
    (select array_agg(slot_row.slot_code order by slot_row.slot_code)
     from public.profile_slots slot_row
     where slot_row.profile_id = profile_row.id),
    '{}'::text[]
  ) as slot_codes,
  court_row.id as court_id,
  court_row.name as court_name,
  court_row.district as court_district,
  court_row.lat as court_lat,
  court_row.lng as court_lng,
  (profile_row.user_id = auth.uid()) as is_self
from public.profiles profile_row
join public.profile_courts profile_court_row on profile_court_row.profile_id = profile_row.id
join public.courts court_row on court_row.id = profile_court_row.court_id
where profile_row.is_public
  and court_row.is_active
  and court_row.city = '台北市'
  and private.has_complete_profile(profile_row.user_id)
  and private.has_complete_profile(auth.uid());

revoke all on table public.player_directory from public, anon, authenticated;
grant select on table public.player_directory to authenticated;

-- Section 5: host-to-player invitation RPC.

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
  elsif locked_session.start_at <= now() then
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

  -- 鎖住主揪 profile，序列化同一主揪跨球局的 24 小時邀請計數與新增。
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

  return 'OK';
end;
$$;

revoke all on function public.invite_to_session(bigint, bigint) from public, anon, authenticated;
grant execute on function public.invite_to_session(bigint, bigint) to authenticated;

-- Section 6: invited-player response RPC.

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
  elsif locked_session.start_at <= now() then
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

revoke all on function public.respond_to_session_invite(bigint, text) from public, anon, authenticated;
grant execute on function public.respond_to_session_invite(bigint, text) to authenticated;

-- Section 7: full-slot cleanup for existing RPCs and invite response projection.

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
  elsif locked_session.start_at <= now() then
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
    return 'OK';
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

  return 'OK';
end;
$$;

revoke all on function public.review_join_request(bigint, bigint, text) from public, anon, authenticated;
grant execute on function public.review_join_request(bigint, bigint, text) to authenticated;

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
        and status in ('requested', 'invited');
    end if;

    return 'ACCEPTED';
  end if;

  insert into public.session_participants (session_id, profile_id, role, status)
  values (locked_session.id, guest_profile, 'guest', 'requested');

  return 'OK';
end;
$$;

revoke all on function public.request_to_join_session(bigint) from public, anon, authenticated;
grant execute on function public.request_to_join_session(bigint) to authenticated;

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
    and session_row.start_at > now()
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

revoke all on table public.my_session_participations from public, anon, authenticated;
grant select on table public.my_session_participations to authenticated;
