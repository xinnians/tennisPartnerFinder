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

select plan(25);

select has_column('public', 'profiles', 'avatar_url', 'profiles stores the allowlisted Google avatar URL');
select has_view('public', 'session_join_preview', 'authenticated join preview view exists');
select is(
  (
    select string_agg(column_name, ',' order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'session_join_preview'
  ),
  'session_id,role,nickname,ntrp,avatar_url,hosted_played_count',
  'join preview has the exact ordered six-column allowlist'
);
select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'session_join_preview'
  ),
  6::bigint,
  'join preview schema scan is nonempty and contains exactly six columns'
);
select is(
  coalesce(has_table_privilege('authenticated', to_regclass('public.session_join_preview'), 'select'), false),
  true,
  'authenticated receives only the join preview read boundary'
);

set local role anon;
select throws_ok(
  $$select * from public.session_join_preview$$,
  '42501',
  null,
  'anon cannot select the authenticated join preview'
);
reset role;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
values
  ('00000000-0000-0000-0000-000000009601', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'preview-host@example.test', 'test', now(), now(), now(), '{"provider":"google","providers":["google"]}'::jsonb, '{"avatar_url":"https://lh3.googleusercontent.com/a/stage-t45-host"}'::jsonb),
  ('00000000-0000-0000-0000-000000009602', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'preview-accepted@example.test', 'test', now(), now(), now(), '{"provider":"google","providers":["google"]}'::jsonb, '{"avatar_url":"https://evil.example/x.png"}'::jsonb),
  ('00000000-0000-0000-0000-000000009603', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'preview-requested@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000009604', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'preview-invited@example.test', 'test', now(), now(), now(), '{"provider":"google","providers":["google"]}'::jsonb, '{"picture":"https://lh4.googleusercontent.com/a/stage-t45-picture"}'::jsonb),
  ('00000000-0000-0000-0000-000000009605', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'preview-declined@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000009606', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'preview-withdrawn@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000009607', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'preview-viewer@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000009601', true);
select set_config('pgtap.preview_host_profile_id', public.save_my_profile('預覽主揪', 3.5, null, null, null, null)::text, true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000009602', true);
select set_config('pgtap.preview_accepted_profile_id', public.save_my_profile('已確認球友', 4.0, null, null, null, null)::text, true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000009603', true);
select set_config('pgtap.preview_requested_profile_id', public.save_my_profile('申請中球友', 3.0, null, null, null, null)::text, true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000009604', true);
select set_config('pgtap.preview_invited_profile_id', public.save_my_profile('受邀球友', 3.5, null, null, null, null)::text, true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000009605', true);
select set_config('pgtap.preview_declined_profile_id', public.save_my_profile('已婉拒球友', 4.5, null, null, null, null)::text, true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000009606', true);
select set_config('pgtap.preview_withdrawn_profile_id', public.save_my_profile('已退出球友', null, null, null, null, null)::text, true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000009607', true);
select set_config('pgtap.preview_viewer_profile_id', public.save_my_profile('登入旁觀者', null, null, null, null, null)::text, true);
reset role;

insert into public.sessions (
  sport_id, host_profile_id, court_id, play_type, start_at,
  ntrp_min, ntrp_max, slots_total, notes, join_mode
)
values (
  (select id from public.sports where code = 'tennis'),
  current_setting('pgtap.preview_host_profile_id')::bigint,
  (select id from public.courts where is_active and city = '台北市' order by id limit 1),
  '雙打', now() + interval '40 days', 3.0, 5.0, 3, '__pgtap_t45_active__', 'approval'
);

create temporary table active_preview_session on commit drop as
select id from public.sessions where notes = '__pgtap_t45_active__';
select set_config('pgtap.active_preview_session_id', (select id::text from pg_temp.active_preview_session), true);

insert into public.session_participants (session_id, profile_id, role, status, initiated_by)
select id, current_setting('pgtap.preview_host_profile_id')::bigint, 'host', 'accepted', 'guest' from pg_temp.active_preview_session
union all select id, current_setting('pgtap.preview_accepted_profile_id')::bigint, 'guest', 'requested', 'guest' from pg_temp.active_preview_session
union all select id, current_setting('pgtap.preview_requested_profile_id')::bigint, 'guest', 'requested', 'guest' from pg_temp.active_preview_session
union all select id, current_setting('pgtap.preview_invited_profile_id')::bigint, 'guest', 'invited', 'host' from pg_temp.active_preview_session
union all select id, current_setting('pgtap.preview_declined_profile_id')::bigint, 'guest', 'requested', 'guest' from pg_temp.active_preview_session
union all select id, current_setting('pgtap.preview_withdrawn_profile_id')::bigint, 'guest', 'requested', 'guest' from pg_temp.active_preview_session;

update public.session_participants
set status = 'accepted'
where session_id = (select id from pg_temp.active_preview_session)
  and profile_id = current_setting('pgtap.preview_accepted_profile_id')::bigint;

update public.session_participants
set status = 'declined'
where session_id = (select id from pg_temp.active_preview_session)
  and profile_id = current_setting('pgtap.preview_declined_profile_id')::bigint;

update public.session_participants
set status = 'withdrawn'
where session_id = (select id from pg_temp.active_preview_session)
  and profile_id = current_setting('pgtap.preview_withdrawn_profile_id')::bigint;

insert into public.player_blocks (blocker_profile_id, blocked_profile_id)
values (current_setting('pgtap.preview_viewer_profile_id')::bigint, current_setting('pgtap.preview_host_profile_id')::bigint);

insert into public.sessions (
  sport_id, host_profile_id, court_id, play_type, start_at, range_end,
  ntrp_min, ntrp_max, slots_total, notes, join_mode, venue_type
)
values (
  (select id from public.sports where code = 'tennis'),
  current_setting('pgtap.preview_host_profile_id')::bigint,
  (select id from public.courts where is_active and city = '台北市' order by id limit 1),
  '雙打', now() + interval '40 days', now() + interval '41 days', 3.0, 5.0, 3,
  '__pgtap_t45_active_candidate__', 'approval', 'candidates'
);

create temporary table active_candidate_session on commit drop as
select id from public.sessions where notes = '__pgtap_t45_active_candidate__';
select set_config('pgtap.active_candidate_session_id', (select id::text from pg_temp.active_candidate_session), true);

insert into public.session_participants (session_id, profile_id, role, status)
select id, current_setting('pgtap.preview_host_profile_id')::bigint, 'host', 'accepted' from pg_temp.active_candidate_session
union all
select id, current_setting('pgtap.preview_accepted_profile_id')::bigint, 'guest', 'requested' from pg_temp.active_candidate_session;

update public.session_participants
set status = 'accepted'
where session_id = (select id from pg_temp.active_candidate_session)
  and profile_id = current_setting('pgtap.preview_accepted_profile_id')::bigint;

insert into public.sessions (
  sport_id, host_profile_id, court_id, play_type, start_at,
  ntrp_min, ntrp_max, slots_total, notes, join_mode
)
values (
  (select id from public.sports where code = 'tennis'),
  current_setting('pgtap.preview_host_profile_id')::bigint,
  (select id from public.courts where is_active and city = '台北市' order by id limit 1),
  '單打', now() + interval '41 days', 3.0, 5.0, 1, '__pgtap_t45_expired_booked__', 'approval'
);

create temporary table expired_booked_session on commit drop as
select id from public.sessions where notes = '__pgtap_t45_expired_booked__';
select set_config('pgtap.expired_booked_session_id', (select id::text from pg_temp.expired_booked_session), true);

insert into public.session_participants (session_id, profile_id, role, status)
select id, current_setting('pgtap.preview_host_profile_id')::bigint, 'host', 'accepted' from pg_temp.expired_booked_session;

select set_config('private.allow_session_time_change', '1', true);
update public.sessions set start_at = now() - interval '3 hours'
where id = (select id from pg_temp.expired_booked_session);
select set_config('private.allow_session_time_change', '', true);

insert into public.sessions (
  sport_id, host_profile_id, court_id, play_type, start_at, range_end,
  ntrp_min, ntrp_max, slots_total, notes, join_mode, venue_type
)
values (
  (select id from public.sports where code = 'tennis'),
  current_setting('pgtap.preview_host_profile_id')::bigint,
  (select id from public.courts where is_active and city = '台北市' order by id limit 1),
  '單打', now() + interval '42 days', now() + interval '43 days', 3.0, 5.0, 1,
  '__pgtap_t45_expired_candidate__', 'approval', 'candidates'
);

create temporary table expired_candidate_session on commit drop as
select id from public.sessions where notes = '__pgtap_t45_expired_candidate__';
select set_config('pgtap.expired_candidate_session_id', (select id::text from pg_temp.expired_candidate_session), true);

insert into public.session_participants (session_id, profile_id, role, status)
select id, current_setting('pgtap.preview_host_profile_id')::bigint, 'host', 'accepted' from pg_temp.expired_candidate_session;

select set_config('private.allow_session_time_change', '1', true);
update public.sessions set start_at = now() - interval '1 hour', range_end = now() + interval '1 hour'
where id = (select id from pg_temp.expired_candidate_session);
select set_config('private.allow_session_time_change', '', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000009607', true);
select is(
  pg_temp.text_outcome($$select count(*)::text from public.session_join_preview where session_id = current_setting('pgtap.active_preview_session_id')::bigint$$),
  '2',
  'a nickname-only authenticated viewer sees exactly host plus accepted guest'
);
select is(
  pg_temp.text_outcome($$select count(*)::text from public.session_join_preview where session_id = current_setting('pgtap.active_preview_session_id')::bigint and role = 'host'$$),
  '1',
  'active join preview contains exactly one host row'
);
select is(
  pg_temp.text_outcome($$select count(*)::text from public.session_join_preview where session_id = current_setting('pgtap.active_preview_session_id')::bigint and role = 'guest'$$),
  '1',
  'active join preview contains exactly one accepted guest row'
);
select is(
  pg_temp.text_outcome($$select count(*)::text from public.session_join_preview where nickname in ('申請中球友','受邀球友','已婉拒球友','已退出球友')$$),
  '0',
  'requested invited declined and withdrawn participants stay outside the preview'
);
select is(
  pg_temp.text_outcome($$select count(*)::text from public.session_join_preview where session_id = current_setting('pgtap.active_preview_session_id')::bigint$$),
  '2',
  'a block relationship does not hide existing session members from the preview'
);
select is(
  pg_temp.text_outcome($$select count(*)::text from public.session_join_preview where session_id = current_setting('pgtap.expired_booked_session_id')::bigint$$),
  '0',
  'booked session outside the discovery window exposes no preview rows'
);
select is(
  pg_temp.text_outcome($$select count(*)::text from public.session_join_preview where session_id = current_setting('pgtap.active_candidate_session_id')::bigint$$),
  '2',
  'undecided candidate session before its range start exposes host plus accepted guest'
);
select is(
  pg_temp.text_outcome($$select count(*)::text from public.session_join_preview where session_id = current_setting('pgtap.expired_candidate_session_id')::bigint$$),
  '0',
  'undecided candidate session past its range start exposes no preview rows'
);
reset role;

select is(
  pg_temp.text_outcome($$select coalesce(avatar_url, '<null>') from public.profiles where user_id = '00000000-0000-0000-0000-000000009601'$$),
  'https://lh3.googleusercontent.com/a/stage-t45-host',
  'save_my_profile persists an allowlisted googleusercontent avatar_url'
);
select is(
  pg_temp.text_outcome($$select coalesce(avatar_url, '<null>') from public.profiles where user_id = '00000000-0000-0000-0000-000000009604'$$),
  'https://lh4.googleusercontent.com/a/stage-t45-picture',
  'save_my_profile falls back to an allowlisted metadata picture'
);
select is(
  pg_temp.text_outcome($$select coalesce(avatar_url, '<null>') from public.profiles where user_id = '00000000-0000-0000-0000-000000009602'$$),
  '<null>',
  'save_my_profile rejects a non-Google avatar domain to null'
);
select is(
  pg_temp.text_outcome($$select coalesce(avatar_url, '<null>') from public.profiles where user_id = '00000000-0000-0000-0000-000000009603'$$),
  '<null>',
  'save_my_profile stores null when auth metadata has no avatar'
);

update public.profiles
set share_presence = true, open_to_greeting = true, is_public = true
where user_id = '00000000-0000-0000-0000-000000009601';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000009601', true);
select public.save_my_profile('預覽主揪更新', 3.5, null, null, null, null);
reset role;

select is(
  pg_temp.text_outcome($$select (share_presence and open_to_greeting)::text from public.profiles where user_id = '00000000-0000-0000-0000-000000009601'$$),
  'true',
  'avatar synchronization does not overwrite presence or greeting switches'
);
select is(
  pg_temp.text_outcome($$select is_public::text from public.profiles where user_id = '00000000-0000-0000-0000-000000009601'$$),
  'true',
  'avatar synchronization does not overwrite player-directory visibility'
);

-- 主揪的中性聚合數:只計該 profile 作為 host 且 sessions.status = 'played' 的球局。
-- 這段刻意放在檔尾,前面所有斷言都已跑完,轉狀態不會擾動它們。
-- 三個相異值 0 → 1 → 2 逐一釘死,不與動態 count(*) 互比——動態比對在計數寫成
-- 「全表 count」時仍會兩邊一起錯而假綠。

select is(
  (select hosted_played_count from public.session_join_preview
   where session_id = current_setting('pgtap.active_preview_session_id')::bigint
     and role = 'host' limit 1),
  0,
  'hosted_played_count is 0 when the host has no played session'
);

-- 狀態機允許 open → played 的條件是 old.start_at 已過且未逾 24 小時。
-- 這兩局的 start_at 在 fixture 就已經是過去式(-3h / -1h),不需要動時間逃生門。
update public.sessions set status = 'played'
where id = current_setting('pgtap.expired_booked_session_id')::bigint;

select is(
  (select hosted_played_count from public.session_join_preview
   where session_id = current_setting('pgtap.active_preview_session_id')::bigint
     and role = 'host' limit 1),
  1,
  'hosted_played_count is 1 after exactly one hosted session turns played'
);

update public.sessions set status = 'played'
where id = current_setting('pgtap.expired_candidate_session_id')::bigint;

select is(
  (select hosted_played_count from public.session_join_preview
   where session_id = current_setting('pgtap.active_preview_session_id')::bigint
     and role = 'host' limit 1),
  2,
  'hosted_played_count is 2 after a second hosted session turns played'
);

-- 錨點:主揪名下共 4 局但只有 2 局 played。若計數漏掉 status 過濾,上一條會拿到 4。
select is(
  (select count(*)::integer from public.sessions
   where host_profile_id = current_setting('pgtap.preview_host_profile_id')::bigint),
  4,
  'the preview host owns four sessions in total, so 2 is not a bare all-status count'
);

-- 這一欄是 per-profile 不是 per-session:同一局的已確認 guest 沒主辦過任何球局,應為 0。
select is(
  (select hosted_played_count from public.session_join_preview
   where session_id = current_setting('pgtap.active_preview_session_id')::bigint
     and role = 'guest'
     and nickname = '已確認球友' limit 1),
  0,
  'hosted_played_count stays 0 for a guest row in a session whose host has two'
);

select * from finish();

rollback;
