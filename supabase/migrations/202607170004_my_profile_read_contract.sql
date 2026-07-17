-- Owner-only profile form read contract. Browser roles must not reconstruct
-- profile joins themselves after save_my_profile performs the atomic write.
-- This definer view exposes only the fields the profile form needs.

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
  ) as slot_codes
from public.profiles profile_row
where profile_row.user_id = auth.uid();

-- The form reads only through my_profile.  The definer view retains the
-- minimum server-side access it needs; browser roles receive no raw profile
-- or profile-join SELECT privilege.
revoke all on table public.profiles, public.profile_courts, public.profile_play_types, public.profile_slots
from public, anon, authenticated;

revoke all on table public.my_profile from public, anon, authenticated;
grant select on table public.my_profile to authenticated;
