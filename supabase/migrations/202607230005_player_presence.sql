-- Foreground-only player presence: retain a Taipei court ID, never a raw GPS
-- coordinate. Visibility is reciprocal and expires from the directory after
-- three hours without a browser foreground refresh.

alter table public.profiles
  add column if not exists share_presence boolean not null default false,
  add column if not exists open_to_greeting boolean not null default false;

create table public.player_presence (
  profile_id bigint primary key references public.profiles(id) on delete cascade,
  court_id bigint not null references public.courts(id),
  updated_at timestamptz not null default now()
);

alter table public.player_presence enable row level security;

revoke all on table public.player_presence from public, anon, authenticated;

create or replace function public.set_presence_sharing(p_enabled boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile bigint;
begin
  viewer_profile := private.require_complete_profile();

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
  viewer_profile := private.require_complete_profile();

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
  viewer_profile := private.require_complete_profile();

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

revoke all on function public.set_presence_sharing(boolean) from public, anon, authenticated;
revoke all on function public.set_open_to_greeting(boolean) from public, anon, authenticated;
revoke all on function public.update_my_presence(double precision, double precision) from public, anon, authenticated;
grant execute on function public.set_presence_sharing(boolean) to authenticated;
grant execute on function public.set_open_to_greeting(boolean) to authenticated;
grant execute on function public.update_my_presence(double precision, double precision) to authenticated;

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
  profile_row.is_public,
  profile_row.share_presence,
  profile_row.open_to_greeting
from public.profiles profile_row
where profile_row.user_id = auth.uid();

revoke all on table public.my_profile from public, anon, authenticated;
grant select on table public.my_profile to authenticated;

create or replace view public.player_presence_directory
with (security_barrier = true, security_invoker = false)
as
select
  profile_row.id as profile_id,
  profile_row.nickname,
  profile_row.ntrp,
  profile_row.open_to_greeting,
  court_row.id as court_id,
  court_row.name as court_name,
  court_row.district as court_district,
  court_row.lat as court_lat,
  court_row.lng as court_lng,
  floor(extract(epoch from now() - presence_row.updated_at) / 60)::integer as minutes_ago,
  (profile_row.user_id = auth.uid()) as is_self
from public.player_presence presence_row
join public.profiles profile_row on profile_row.id = presence_row.profile_id
join public.courts court_row on court_row.id = presence_row.court_id
where presence_row.updated_at > now() - interval '3 hours'
  and profile_row.share_presence
  and court_row.is_active
  and court_row.city = '台北市'
  and btrim(profile_row.nickname) <> ''
  and btrim(coalesce(profile_row.line_id, '')) <> ''
  and profile_row.ntrp between 1.0 and 7.0
  and exists (
    select 1
    from public.profile_play_types target_play_type
    where target_play_type.profile_id = profile_row.id
  )
  and exists (
    select 1
    from public.profile_courts target_profile_court
    join public.courts target_home_court on target_home_court.id = target_profile_court.court_id
    where target_profile_court.profile_id = profile_row.id
      and target_home_court.is_active
      and target_home_court.city = '台北市'
  )
  and exists (
    select 1
    from public.profiles viewer_profile
    where viewer_profile.user_id = auth.uid()
      and viewer_profile.share_presence
      and btrim(viewer_profile.nickname) <> ''
      and btrim(coalesce(viewer_profile.line_id, '')) <> ''
      and viewer_profile.ntrp between 1.0 and 7.0
      and exists (
        select 1
        from public.profile_play_types viewer_play_type
        where viewer_play_type.profile_id = viewer_profile.id
      )
      and exists (
        select 1
        from public.profile_courts viewer_profile_court
        join public.courts viewer_home_court on viewer_home_court.id = viewer_profile_court.court_id
        where viewer_profile_court.profile_id = viewer_profile.id
          and viewer_home_court.is_active
          and viewer_home_court.city = '台北市'
      )
  );

revoke all on table public.player_presence_directory from public, anon, authenticated;
grant select on table public.player_presence_directory to anon, authenticated;
