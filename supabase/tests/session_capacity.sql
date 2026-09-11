begin;
select no_plan();

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
select ('00000000-0000-0000-0000-' || n)::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'capacity-' || n || '@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
from unnest(array['000000009811','000000009812']) as fixture(n);
select set_config('pgtap.capacity_court', (select id::text from public.courts where city='台北市' and is_active order by id limit 1), true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000009811', true);
select public.save_my_profile('人數測試主揪', 3.5, null, null, null, null);
select set_config('pgtap.capacity_session', public.create_session(current_setting('pgtap.capacity_court')::bigint, '雙打', now()+interval '1 day', null, null, 6, null, 'instant')::text, true);
select is((select slots_total from public.my_session_participations where session_id=current_setting('pgtap.capacity_session')::bigint), 6, 'create accepts more than three guests');

create function pg_temp.update_capacity(capacity integer) returns text language sql as $$
  select public.update_session(current_setting('pgtap.capacity_session')::bigint, now()+interval '1 day', current_setting('pgtap.capacity_court')::bigint, capacity, null, null, '雙打', null, null);
$$;
select is(pg_temp.update_capacity(32768), 'OK', 'update crosses old smallint boundary');
select is((select slots_remaining from public.my_session_participations where session_id=current_setting('pgtap.capacity_session')::bigint), 32768, 'private view preserves large capacity');
select is(pg_temp.update_capacity(2147483647), 'OK', 'update supports full existing integer RPC range');
set constraints all immediate;
select is((select slots_remaining from public.my_session_participations where session_id=current_setting('pgtap.capacity_session')::bigint), 2147483647, 'capacity invariant supports integer maximum');
select throws_ok($$select pg_temp.update_capacity(0)$$, 'P0001', 'INVALID_TRANSITION', 'update rejects zero');
select throws_ok($$select pg_temp.update_capacity(-1)$$, 'P0001', 'INVALID_TRANSITION', 'update rejects negative');
select throws_ok($$select pg_temp.update_capacity(null)$$, 'P0001', 'INVALID_TRANSITION', 'update rejects null');
select throws_ok($$select public.create_session(current_setting('pgtap.capacity_court')::bigint, '雙打', now()+interval '1 day', null, null, 0, null)$$, 'P0001', 'INVALID_TRANSITION', 'create rejects zero');
select throws_ok($$select public.create_session(current_setting('pgtap.capacity_court')::bigint, '雙打', now()+interval '1 day', null, null, -1, null)$$, 'P0001', 'INVALID_TRANSITION', 'create rejects negative');
select throws_ok($$select public.create_session(current_setting('pgtap.capacity_court')::bigint, '雙打', now()+interval '1 day', null, null, null, null)$$, 'P0001', 'INVALID_TRANSITION', 'create rejects null');
reset role;
set local role anon;
select is((select slots_total from public.session_discovery where id=current_setting('pgtap.capacity_session')::bigint), 2147483647, 'anonymous discovery preserves large total');
select is((select slots_remaining from public.session_discovery where id=current_setting('pgtap.capacity_session')::bigint), 2147483647, 'anonymous discovery preserves large remaining');
select throws_ok($$select * from public.my_session_participations$$, '42501', null, 'private participation view still denies anonymous reads');
select throws_ok($$select * from public.sessions$$, '42501', null, 'raw session table still denies anonymous reads');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000009812', true);
select public.save_my_profile('人數測試球友', 3.5, null, null, null, null);
select is(public.request_to_join_session(current_setting('pgtap.capacity_session')::bigint), 'ACCEPTED', 'guest can join large-capacity session');
select is((select slots_remaining from public.my_session_participations where session_id=current_setting('pgtap.capacity_session')::bigint), 2147483646, 'joining decrements remaining exactly');
select throws_ok($$select pg_temp.update_capacity(6)$$, 'P0001', 'NOT_SESSION_HOST', 'guest cannot change capacity');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000009811', true);
select is(pg_temp.update_capacity(1), 'OK', 'host can reduce to accepted count');
select is((select status from public.my_session_participations where session_id=current_setting('pgtap.capacity_session')::bigint), 'full', 'exact capacity is full');
select is(pg_temp.update_capacity(6), 'OK', 'host can expand full session');
select is((select slots_remaining from public.my_session_participations where session_id=current_setting('pgtap.capacity_session')::bigint), 5, 'expanded session retains accepted guest');
select is((select status from public.my_session_participations where session_id=current_setting('pgtap.capacity_session')::bigint), 'open', 'expanded session reopens');
set constraints all deferred;
select lives_ok($$select public.create_session(current_setting('pgtap.capacity_court')::bigint, '練球', now()+interval '1 day', null, null, 32768, null, 'approval', 'walk_on')$$, 'walk-on creation supports large capacity');
select lives_ok($$select public.create_session(null, '練球', now()+interval '1 day', null, null, 2147483647, null, 'approval', 'candidates', (select array_agg(id) from (select id from public.courts where city='台北市' and is_active order by id limit 2) c), now()+interval '2 days')$$, 'candidate creation supports integer maximum');
reset role;
set constraints all immediate;
select * from finish();
rollback;
