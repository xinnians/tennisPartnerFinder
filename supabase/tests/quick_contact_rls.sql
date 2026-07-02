begin;

select plan(16);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'partner_requests', 'partner_requests table exists');
select has_table('public', 'reports', 'reports table exists');
select has_view('public', 'public_profile_discovery', 'public discovery view exists');
select has_column('public', 'public_profile_discovery', 'line_id', 'public discovery includes line_id for UI-gated quick contact');
select isnt(
  exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'invites'
  ),
  true,
  'invite table is not part of the quick contact MVP schema'
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
  (
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'owner@example.test',
    'test',
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000202',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'other@example.test',
    'test',
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  )
on conflict (id) do nothing;

insert into public.profiles (user_id, nickname, ntrp, line_id, is_public)
values
  ('00000000-0000-0000-0000-000000000101', 'Public Player', 3.5, 'public_line', true),
  ('00000000-0000-0000-0000-000000000202', 'Private Player', 4.0, 'private_line', false);

insert into public.profile_courts (profile_id, court_id)
select p.id, c.id
from public.profiles p
cross join public.courts c
where p.nickname in ('Public Player', 'Private Player')
  and c.name = '大安森林公園網球場';

insert into public.profile_play_types (profile_id, play_type)
select id, '單打'
from public.profiles
where nickname in ('Public Player', 'Private Player');

set local role anon;

select is(
  (select count(*) from public.courts where is_active),
  6::bigint,
  'anon can read active Taipei courts'
);

select is(
  (select count(*) from public.public_profile_discovery where line_id = 'public_line'),
  1::bigint,
  'anon can read public discovery line_id for quick contact UI gating'
);

select is(
  (select count(*) from public.public_profile_discovery where line_id = 'private_line'),
  0::bigint,
  'private profiles are not included in public discovery'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);

select is(
  (select count(*) from public.profiles where line_id = 'public_line'),
  1::bigint,
  'authenticated owner can read their own full profile'
);

update public.profiles
set nickname = 'Updated Public Player'
where line_id = 'public_line';

select is(
  (select nickname from public.profiles where line_id = 'public_line'),
  'Updated Public Player',
  'authenticated owner can update their own profile'
);

update public.profiles
set nickname = 'Hacked Private Player'
where line_id = 'private_line';

reset role;

select is(
  (select nickname from public.profiles where line_id = 'private_line'),
  'Private Player',
  'authenticated owner cannot update another profile'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);

insert into public.partner_requests (
  profile_id,
  court_id,
  desired_time_text,
  request_text,
  expires_at
)
select p.id, c.id, '週六下午', '想找 3.5 左右球友對拉', now() + interval '7 days'
from public.profiles p
cross join public.courts c
where p.line_id = 'public_line'
  and c.name = '大安森林公園網球場';

select is(
  (select count(*) from public.partner_requests where request_text = '想找 3.5 左右球友對拉'),
  1::bigint,
  'authenticated owner can create their own partner request'
);

select throws_ok(
  $$
    insert into public.partner_requests (
      profile_id,
      court_id,
      desired_time_text,
      request_text,
      expires_at
    )
    select p.id, c.id, '週日早上', 'spoofed request', now() + interval '7 days'
    from public.profiles p
    cross join public.courts c
    where p.line_id = 'private_line'
      and c.name = '大安森林公園網球場'
  $$,
  '42501',
  null,
  'authenticated user cannot create a partner request for another profile'
);

insert into public.reports (reporter_profile_id, reported_profile_id, reason)
select owner_profile.id, other_profile.id, 'bad behavior'
from public.profiles owner_profile
cross join public.profiles other_profile
where owner_profile.line_id = 'public_line'
  and other_profile.line_id = 'private_line';

select is(
  (select count(*) from public.reports where reason = 'bad behavior'),
  1::bigint,
  'authenticated owner can create and read their own report'
);

select throws_ok(
  $$
    insert into public.reports (reporter_profile_id, reported_profile_id, reason)
    select other_profile.id, owner_profile.id, 'spoofed reporter'
    from public.profiles owner_profile
    cross join public.profiles other_profile
    where owner_profile.line_id = 'public_line'
      and other_profile.line_id = 'private_line'
  $$,
  '42501',
  null,
  'authenticated user cannot create a report as another reporter'
);

select * from finish();

rollback;
