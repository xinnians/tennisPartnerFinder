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
