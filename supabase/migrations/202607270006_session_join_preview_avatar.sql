-- Stage T4.5: authenticated pre-join roster and allowlisted Google avatars.

alter table public.profiles
  add column avatar_url text;

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
  metadata_avatar_url text;
  synced_avatar_url text;
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

  select coalesce(
    user_row.raw_user_meta_data ->> 'avatar_url',
    user_row.raw_user_meta_data ->> 'picture'
  )
  into metadata_avatar_url
  from auth.users user_row
  where user_row.id = auth.uid();

  synced_avatar_url := case
    when metadata_avatar_url ~ '^https://lh[0-9]+[.]googleusercontent[.]com/' then metadata_avatar_url
    else null
  end;

  insert into public.profiles (user_id, nickname, ntrp, line_id, is_public, avatar_url)
  values (
    auth.uid(),
    btrim(p_nickname),
    p_ntrp,
    nullif(btrim(coalesce(p_line_id, '')), ''),
    false,
    synced_avatar_url
  )
  on conflict (user_id) do update
  set nickname = excluded.nickname,
      ntrp = excluded.ntrp,
      line_id = excluded.line_id,
      avatar_url = excluded.avatar_url
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

create or replace view public.session_join_preview
with (security_barrier = true, security_invoker = false)
as
select
  session_row.id as session_id,
  participant_row.role,
  profile_row.nickname,
  profile_row.ntrp,
  profile_row.avatar_url
from public.sessions session_row
join public.session_participants participant_row
  on participant_row.session_id = session_row.id
join public.profiles profile_row
  on profile_row.id = participant_row.profile_id
join public.sports sport_row
  on sport_row.id = session_row.sport_id
join public.courts court_row
  on court_row.id = session_row.court_id
where auth.uid() is not null
  and participant_row.status = 'accepted'
  and session_row.status in ('open', 'full')
  and (
    case
      when session_row.venue_type = 'candidates' and session_row.decided_at is null
        then session_row.start_at > now()
      else session_row.start_at + interval '2 hours' > now()
    end
  )
  and sport_row.code = 'tennis'
  and sport_row.is_active
  and court_row.is_active
  and court_row.city = '台北市';

revoke all on table public.session_join_preview from public, anon, authenticated;
grant select on table public.session_join_preview to authenticated;
