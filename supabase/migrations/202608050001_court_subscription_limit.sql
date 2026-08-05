create or replace function public.set_court_subscriptions(p_court_ids bigint[])
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile_id bigint;
  max_court_count integer;
begin
  select count(*)::integer
  into max_court_count
  from public.courts
  where is_active and city = '台北市';

  if coalesce(cardinality(p_court_ids), 0) > max_court_count then
    raise exception 'INVALID_TRANSITION';
  end if;

  if exists (
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
