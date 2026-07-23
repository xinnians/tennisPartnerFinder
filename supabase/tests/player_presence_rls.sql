begin;

create function pg_temp.text_outcome(p_statement text)
returns text
language plpgsql
as $$
declare
  result_text text;
begin
  execute p_statement into result_text;
  return result_text;
exception when others then
  return 'ERROR:' || sqlerrm;
end;
$$;

select plan(38);

select has_table('public', 'player_presence', 'player presence is stored in its own table');
select has_view('public', 'player_presence_directory', 'presence has a dedicated directory view');
select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'player_presence'
  ),
  3::bigint,
  'player presence schema scan is non-empty and has only its three contract columns'
);
select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'player_presence'
      and column_name in ('lat', 'lng', 'latitude', 'longitude', 'coordinates', 'location')
  ),
  0::bigint,
  'player presence never stores a raw GPS coordinate column'
);
select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name in ('share_presence', 'open_to_greeting')
  ),
  2::bigint,
  'profiles has both independent presence switches'
);
select is(
  (
    select string_agg(column_name, ',' order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'player_presence_directory'
  ),
  'profile_id,nickname,ntrp,open_to_greeting,court_id,court_name,court_district,court_lat,court_lng,minutes_ago,is_self',
  'presence directory has the exact ordered allowlist'
);
select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'player_presence_directory'
      and column_name in ('line_id', 'email', 'real_name', 'lat', 'lng', 'latitude', 'longitude')
  ),
  0::bigint,
  'presence directory never exposes LINE, identity, or raw GPS fields'
);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data
)
values
  ('00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'presence-a@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000005002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'presence-b@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000005003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'presence-c@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000005004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'presence-incomplete@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000005001', true);
select throws_ok(
  $$select * from public.player_presence$$,
  '42501',
  null,
  'authenticated cannot directly read raw presence rows'
);
select throws_ok(
  $$insert into public.player_presence (profile_id, court_id) values (1, 1)$$,
  '42501',
  null,
  'authenticated cannot directly write raw presence rows'
);
select set_config(
  'pgtap.presence_a_profile_id',
  public.save_my_profile(
    '在場甲',
    3.5,
    'presence_a_line',
    array[(select id from public.courts where is_active and city = '台北市' order by id limit 1)]::bigint[],
    array['單打']::text[],
    array['we-a']::text[]
  )::text,
  true
);
select ok(current_setting('pgtap.presence_a_profile_id')::bigint > 0, 'presence A saves a complete profile');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000005002', true);
select set_config(
  'pgtap.presence_b_profile_id',
  public.save_my_profile(
    '在場乙',
    4.0,
    'presence_b_line',
    array[(select id from public.courts where is_active and city = '台北市' order by id limit 1)]::bigint[],
    array['雙打']::text[],
    array['we-a']::text[]
  )::text,
  true
);
select ok(current_setting('pgtap.presence_b_profile_id')::bigint > 0, 'presence B saves a complete profile');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000005003', true);
select set_config(
  'pgtap.presence_c_profile_id',
  public.save_my_profile(
    '在場丙',
    4.5,
    'presence_c_line',
    array[(select id from public.courts where is_active and city = '台北市' order by id limit 1)]::bigint[],
    array['對拉']::text[],
    array['we-a']::text[]
  )::text,
  true
);
select ok(current_setting('pgtap.presence_c_profile_id')::bigint > 0, 'presence C saves a complete profile');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000005001', true);
select is(
  pg_temp.text_outcome($$select share_presence::text from public.my_profile$$),
  'false',
  'presence sharing defaults to off'
);
select is(
  pg_temp.text_outcome($$select open_to_greeting::text from public.my_profile$$),
  'false',
  'greeting marker defaults to off'
);
select ok(
  public.create_report(null, current_setting('pgtap.presence_b_profile_id')::bigint, '__pgtap_presence_profile_report__') is not null,
  'presence target remains reportable through the existing profile report contract'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000005001', true);
select is(
  pg_temp.text_outcome(
    $$select public.update_my_presence(
      (select lat from public.courts where is_active and city = '台北市' order by id limit 1),
      (select lng from public.courts where is_active and city = '台北市' order by id limit 1)
    )$$
  ),
  'OK',
  'presence update is a no-op while sharing is off'
);
reset role;
select is(
  pg_temp.text_outcome(
    $$select count(*)::text from public.player_presence where profile_id = current_setting('pgtap.presence_a_profile_id')::bigint$$
  ),
  '0',
  'sharing-off update does not create a presence row'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000005001', true);
select is(pg_temp.text_outcome($$select public.set_presence_sharing(true)$$), 'OK', 'A enables presence sharing');
select is(pg_temp.text_outcome($$select public.set_open_to_greeting(true)$$), 'OK', 'A enables the greeting marker');
select is(
  pg_temp.text_outcome(
    $$select public.update_my_presence(
      (select lat from public.courts where is_active and city = '台北市' order by id limit 1),
      (select lng from public.courts where is_active and city = '台北市' order by id limit 1)
    )$$
  ),
  'OK',
  'A writes presence only after sharing is enabled'
);
reset role;
select is(
  pg_temp.text_outcome(
    $$select count(*)::text from public.player_presence where profile_id = current_setting('pgtap.presence_a_profile_id')::bigint$$
  ),
  '1',
  'A has exactly one court-level presence row'
);

select ok(
  (select count(*) from public.player_presence) > 0,
  'presence boundary scan runs after at least one raw presence row exists'
);

set local role anon;
select throws_ok(
  $$select * from public.player_presence_directory$$,
  '42501',
  null,
  'anonymous viewer is denied the presence directory even when a presence row exists'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000005004', true);
select is(
  pg_temp.text_outcome($$select count(*)::text from public.player_presence_directory$$),
  '0',
  'incomplete viewer receives zero presence rows when a presence row exists'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000005002', true);
select is(pg_temp.text_outcome($$select public.set_presence_sharing(true)$$), 'OK', 'B enables presence sharing');
select is(
  pg_temp.text_outcome(
    $$select (count(*) = 1 and bool_and(nickname = '在場甲') and bool_and(open_to_greeting) and bool_and(minutes_ago >= 0))::text
      from public.player_presence_directory
      where profile_id = current_setting('pgtap.presence_a_profile_id')::bigint$$
  ),
  'true',
  'mutual complete viewer sees A at a court with the greeting marker'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000005003', true);
select is(
  pg_temp.text_outcome($$select count(*)::text from public.player_presence_directory$$),
  '0',
  'non-reciprocal complete viewer receives zero presence rows'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000005001', true);
select ok(
  public.save_my_profile(
    '在場甲更新',
    3.5,
    'presence_a_line_updated',
    array[(select id from public.courts where is_active and city = '台北市' order by id limit 1)]::bigint[],
    array['單打']::text[],
    array['we-a']::text[]
  ) is not null,
  'A can resave the profile after enabling presence settings'
);
select is(
  pg_temp.text_outcome($$select share_presence::text || ',' || open_to_greeting::text from public.my_profile$$),
  'true,true',
  'profile resave preserves presence sharing and greeting settings'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000005002', true);
select is(
  pg_temp.text_outcome($$select public.update_my_presence(0::double precision, 0::double precision)$$),
  'OK',
  'outside-court presence update returns the harmless no-op outcome'
);
reset role;
select is(
  pg_temp.text_outcome(
    $$select count(*)::text from public.player_presence where profile_id = current_setting('pgtap.presence_b_profile_id')::bigint$$
  ),
  '0',
  'location beyond 100 metres does not write a presence row'
);
select is(
  pg_temp.text_outcome(
    $$with aged as (
        update public.player_presence
        set updated_at = now() - interval '3 hours 1 minute'
        where profile_id = current_setting('pgtap.presence_a_profile_id')::bigint
        returning 1
      )
      select count(*)::text from aged$$
  ),
  '1',
  'fixture ages A past the three-hour presence TTL'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000005002', true);
select is(
  pg_temp.text_outcome(
    $$select count(*)::text from public.player_presence_directory
      where profile_id = current_setting('pgtap.presence_a_profile_id')::bigint$$
  ),
  '0',
  'presence older than three hours is absent from the directory'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000005001', true);
select is(
  pg_temp.text_outcome(
    $$select public.update_my_presence(
      (select lat from public.courts where is_active and city = '台北市' order by id limit 1),
      (select lng from public.courts where is_active and city = '台北市' order by id limit 1)
    )$$
  ),
  'OK',
  'A refreshes presence at the same court'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000005002', true);
select is(
  pg_temp.text_outcome(
    $$select count(*)::text from public.player_presence_directory
      where profile_id = current_setting('pgtap.presence_a_profile_id')::bigint$$
  ),
  '1',
  'mutual viewer sees refreshed presence immediately'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000005001', true);
select is(pg_temp.text_outcome($$select public.set_presence_sharing(false)$$), 'OK', 'A hides presence in one action');
reset role;
select is(
  pg_temp.text_outcome(
    $$select count(*)::text from public.player_presence where profile_id = current_setting('pgtap.presence_a_profile_id')::bigint$$
  ),
  '0',
  'hiding presence deletes A raw row immediately'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000005002', true);
select is(
  pg_temp.text_outcome(
    $$select count(*)::text from public.player_presence_directory
      where profile_id = current_setting('pgtap.presence_a_profile_id')::bigint$$
  ),
  '0',
  'mutual viewer loses A immediately after the one-click hide'
);
reset role;

select * from finish();
rollback;
