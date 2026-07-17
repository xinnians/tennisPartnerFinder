begin;

select plan(16);

select has_view('public', 'my_profile', 'owner-only profile form view exists');
select is(
  (
    select string_agg(column_name, ',' order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'my_profile'
  ),
  'nickname,ntrp,line_id,court_ids,play_types,slot_codes',
  'my profile view has the exact form-field allowlist'
);
select is(has_table_privilege('authenticated', 'public.profiles', 'select'), false, 'authenticated has no raw profiles SELECT');
select is(has_table_privilege('authenticated', 'public.profile_courts', 'select'), false, 'authenticated has no raw profile_courts SELECT');
select is(has_table_privilege('authenticated', 'public.profile_play_types', 'select'), false, 'authenticated has no raw profile_play_types SELECT');
select is(has_table_privilege('authenticated', 'public.profile_slots', 'select'), false, 'authenticated has no raw profile_slots SELECT');

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
  ('00000000-0000-0000-0000-000000004001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'my-profile-owner@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000004002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'my-profile-other@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000004003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'my-profile-empty@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);

set local role anon;
select throws_ok($$select * from public.my_profile$$, '42501', null, 'anon cannot read my profile');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000004001', true);
select ok(
  public.save_my_profile(
    'Profile Owner',
    3.5,
    'owner_line',
    array[(select id from public.courts where is_active and city = '台北市' order by id limit 1)]::bigint[],
    array['單打', '雙打']::text[],
    array['wd-e', 'we-m']::text[]
  ) is not null,
  'owner writes profile only through save_my_profile'
);
select is((select nickname from public.my_profile), 'Profile Owner', 'owner sees own nickname');
select is((select line_id from public.my_profile), 'owner_line', 'owner sees own LINE ID only in the private form contract');
select is(
  (select play_types from public.my_profile),
  array['單打', '雙打']::text[],
  'owner receives deterministic play-type aggregation'
);
select throws_ok($$select * from public.profiles$$, '42501', null, 'authenticated cannot bypass the form contract through profiles');
select throws_ok($$select * from public.profile_courts$$, '42501', null, 'authenticated cannot bypass the form contract through profile joins');
reset role;

insert into public.profiles (user_id, nickname, ntrp, line_id)
values ('00000000-0000-0000-0000-000000004003', 'Incomplete Owner', 3.0, 'empty_line');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000004003', true);
select is((select court_ids from public.my_profile), '{}'::bigint[], 'empty court aggregation is stable');
select is((select play_types from public.my_profile), '{}'::text[], 'empty play-type aggregation is stable');
select is((select slot_codes from public.my_profile), '{}'::text[], 'empty slot aggregation is stable');
reset role;

select * from finish();
rollback;
