begin;

-- Stage 3 is intentionally red until 202607270003_session_chat.sql exists.
-- The conditional runner keeps that first red run reportable: it records the
-- missing contract, then skips dependent checks instead of aborting the file
-- on an undefined relation.  Once installed, every assertion below executes
-- against the real view, RPCs, constraints, and lifecycle triggers.
select plan(167);

select has_table('public', 'session_messages', 'session messages table exists');
select has_view('public', 'session_message_feed', 'session message feed view exists');
select has_view('public', 'my_player_blocks', 'my player blocks view exists');

create function pg_temp.age_chat_session_for_expiry(p_session_id bigint)
returns void
language plpgsql
as $$
begin
  set constraints all immediate;
  perform set_config('private.allow_session_time_change', '1', true);
  update public.sessions
  set start_at = now() - interval '25 hours'
  where id = p_session_id;
  perform set_config('private.allow_session_time_change', '', true);
  set constraints all immediate;
  set constraints all deferred;
end;
$$;

create function pg_temp.post_session_message_outcome(p_session_id bigint, p_body text)
returns text
language plpgsql
as $$
begin
  return public.post_session_message(p_session_id, p_body)::text;
exception when others then
  return 'EXCEPTION:' || sqlstate || ':' || sqlerrm;
end;
$$;

create function pg_temp.respond_to_session_invite_outcome(p_session_id bigint, p_decision text)
returns text
language plpgsql
as $$
begin
  return public.respond_to_session_invite(p_session_id, p_decision)::text;
exception when others then
  return 'EXCEPTION:' || sqlstate || ':' || sqlerrm;
end;
$$;

create function pg_temp.review_join_request_outcome(p_session_id bigint, p_participant_id bigint, p_decision text)
returns text
language plpgsql
as $$
begin
  return public.review_join_request(p_session_id, p_participant_id, p_decision)::text;
exception when others then
  return 'EXCEPTION:' || sqlstate || ':' || sqlerrm;
end;
$$;

create function pg_temp.request_to_join_session_outcome(p_session_id bigint)
returns text
language plpgsql
as $$
begin
  return public.request_to_join_session(p_session_id)::text;
exception when others then
  return 'EXCEPTION:' || sqlstate || ':' || sqlerrm;
end;
$$;

create function pg_temp.invite_to_session_outcome(p_session_id bigint, p_profile_id bigint)
returns text
language plpgsql
as $$
begin
  return public.invite_to_session(p_session_id, p_profile_id)::text;
exception when others then
  return 'EXCEPTION:' || sqlstate || ':' || sqlerrm;
end;
$$;

create function pg_temp.run_session_chat_contract()
returns setof text
language plpgsql
as $$
declare
  host_user uuid := '00000000-0000-0000-0000-000000003001';
  accepted_user uuid := '00000000-0000-0000-0000-000000003002';
  requested_user uuid := '00000000-0000-0000-0000-000000003003';
  declined_user uuid := '00000000-0000-0000-0000-000000003004';
  withdrawn_user uuid := '00000000-0000-0000-0000-000000003005';
  observer_user uuid := '00000000-0000-0000-0000-000000003006';
  blocked_join_user uuid := '00000000-0000-0000-0000-000000003007';
  invite_target_user uuid := '00000000-0000-0000-0000-000000003008';
  host_id bigint;
  accepted_id bigint;
  requested_id bigint;
  declined_id bigint;
  withdrawn_id bigint;
  observer_id bigint;
  blocked_join_id bigint;
  invite_target_id bigint;
  court_id bigint;
  second_court_id bigint;
  main_session_id bigint;
  long_nickname_session_id bigint;
  archive_session_id bigint;
  update_session_id bigint;
  candidate_session_id bigint;
  post_expiry_session_id bigint;
  played_session_id bigint;
  expired_session_id bigint;
  outbox_session_id bigint;
  block_outbox_session_id bigint;
  purge_session_id bigint;
  invite_accept_session_id bigint;
  review_block_session_id bigint;
  directional_session_id bigint;
  participant_id bigint;
  review_participant_id bigint;
  directional_participant_id bigint;
  baseline_system_count bigint;
  old_system_count bigint;
  update_start_at timestamptz;
  update_court_id bigint;
  update_slots integer;
  update_ntrp_min numeric;
  update_ntrp_max numeric;
  update_play_type text;
  update_note text;
  update_fee_note text;
  host_message_id bigint;
  guest_message_id bigint;
  visible_system_message_id bigint;
  unreported_message_id bigint;
  reported_message_id bigint;
  closed_reported_message_id bigint;
  closed_report_id bigint;
  open_purge_message_id bigint;
  recent_archive_message_id bigint;
  old_system_message_id bigint;
  withdrawn_message_id bigint;
  request_blocker_outcome text;
  request_blocked_outcome text;
  invite_blocker_outcome text;
  invite_blocked_outcome text;
  respond_blocker_outcome text;
  respond_blocked_outcome text;
  review_blocker_outcome text;
  review_blocked_outcome text;
  baseline_block_count bigint;
  posted_body text := 'private body must not be pushed';
  fixture_line text := 'chat-host-line';
begin
  if to_regclass('public.session_messages') is null
    or to_regclass('public.session_message_feed') is null
    or to_regclass('public.my_player_blocks') is null then
    return query select * from skip('Stage 3 session-chat schema is not installed yet', 164);
    return;
  end if;

  return next is(
    (
      select string_agg(column_name, ',' order by ordinal_position)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'session_message_feed'
    ),
    'message_id,session_id,sender_profile_id,sender_nickname,kind,body,created_at,is_self',
    'session message feed keeps its exact ordered allowlist'
  );
  return next is(
    (
      select string_agg(column_name, ',' order by ordinal_position)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'my_player_blocks'
    ),
    'blocked_profile_id,blocked_nickname,created_at',
    'my player blocks keeps its exact ordered allowlist'
  );

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  )
  values
    (host_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chat-host@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
    (accepted_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chat-accepted@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
    (requested_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chat-requested@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
    (declined_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chat-declined@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
    (withdrawn_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chat-withdrawn@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
    (observer_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chat-observer@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
    (blocked_join_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chat-blocked-join@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
    (invite_target_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chat-invite-target@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);

  select id into court_id from public.courts where is_active and city = '台北市' order by id limit 1;
  select id into second_court_id from public.courts where is_active and city = '台北市' order by id offset 1 limit 1;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', host_user::text, true);
  perform public.save_my_profile('Chat Host', 3.5, fixture_line, array[court_id], array['雙打'], array['we-a']);
  perform set_config('request.jwt.claim.sub', accepted_user::text, true);
  perform public.save_my_profile('Chat Accepted', 3.5, 'chat-accepted-line', array[court_id], array['雙打'], array['we-a']);
  perform set_config('request.jwt.claim.sub', requested_user::text, true);
  perform public.save_my_profile('Chat Requested', 3.5, 'chat-requested-line', array[court_id], array['雙打'], array['we-a']);
  perform set_config('request.jwt.claim.sub', declined_user::text, true);
  perform public.save_my_profile('Chat Declined', 3.5, 'chat-declined-line', array[court_id], array['雙打'], array['we-a']);
  perform set_config('request.jwt.claim.sub', withdrawn_user::text, true);
  perform public.save_my_profile('Chat Withdrawn', 3.5, 'chat-withdrawn-line', array[court_id], array['雙打'], array['we-a']);
  perform set_config('request.jwt.claim.sub', observer_user::text, true);
  perform public.save_my_profile('Chat Observer', 3.5, 'chat-observer-line', array[court_id], array['雙打'], array['we-a']);
  perform set_config('request.jwt.claim.sub', blocked_join_user::text, true);
  perform public.save_my_profile('Chat Blocked Join', 3.5, 'chat-blocked-join-line', array[court_id], array['雙打'], array['we-a']);
  perform set_config('request.jwt.claim.sub', invite_target_user::text, true);
  perform public.save_my_profile('Chat Invite Target', 3.5, 'chat-invite-target-line', array[court_id], array['雙打'], array['we-a']);
  execute 'reset role';

  select id into host_id from public.profiles where user_id = host_user;
  select id into accepted_id from public.profiles where user_id = accepted_user;
  select id into requested_id from public.profiles where user_id = requested_user;
  select id into declined_id from public.profiles where user_id = declined_user;
  select id into withdrawn_id from public.profiles where user_id = withdrawn_user;
  select id into observer_id from public.profiles where user_id = observer_user;
  select id into blocked_join_id from public.profiles where user_id = blocked_join_user;
  select id into invite_target_id from public.profiles where user_id = invite_target_user;

  -- Main fixture: one accepted, requested, declined, and withdrawn guest.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', host_user::text, true);
  select public.create_session(court_id, '雙打', now() + interval '14 days', 3, 4, 3, '__pgtap_chat_main__', 'approval', 'booked', null, null, null) into main_session_id;
  execute 'reset role';
  return next throws_ok(
    format('insert into public.session_messages(session_id, sender_profile_id, kind, body) values (%s, %s, %L, %L)', main_session_id, host_id, 'user', ''),
    '23514',
    null,
    'session messages body CHECK rejects an empty body'
  );
  return next throws_ok(
    format('insert into public.player_blocks(blocker_profile_id, blocked_profile_id) values (%s, %s)', host_id, host_id),
    '23514',
    null,
    'player blocks CHECK rejects self-blocking'
  );
  delete from public.session_messages
  where session_id = main_session_id
    and sender_profile_id = host_id
    and kind = 'user'
    and body = '';
  delete from public.player_blocks
  where blocker_profile_id = host_id
    and blocked_profile_id = host_id;
  select count(*) into baseline_system_count from public.session_messages where session_id = main_session_id and kind = 'system';
  return next is((select count(*) from public.session_messages where session_id = main_session_id and kind = 'system' and body = 'Chat Host 加入了球局'), 0::bigint, 'host session creation does not produce its forbidden guest-join system message');

  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', accepted_user::text, true); perform public.request_to_join_session(main_session_id); execute 'reset role';
  select id into participant_id from public.session_participants where session_id = main_session_id and profile_id = accepted_id;
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  perform public.review_join_request(main_session_id, participant_id, 'accepted');
  execute 'reset role';
  return next is((select count(*) from public.session_messages where session_id = main_session_id and kind = 'system'), 1::bigint, 'guest acceptance produces exactly one system message');

  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', requested_user::text, true); perform public.request_to_join_session(main_session_id); execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', declined_user::text, true); perform public.request_to_join_session(main_session_id); execute 'reset role';
  select id into participant_id from public.session_participants where session_id = main_session_id and profile_id = declined_id;
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  perform public.review_join_request(main_session_id, participant_id, 'declined');
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', withdrawn_user::text, true); perform public.request_to_join_session(main_session_id); execute 'reset role';
  select id into participant_id from public.session_participants where session_id = main_session_id and profile_id = withdrawn_id;
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  perform public.review_join_request(main_session_id, participant_id, 'accepted');
  execute 'reset role';
  select count(*) into old_system_count from public.session_messages where session_id = main_session_id and kind = 'system';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', withdrawn_user::text, true); perform public.post_session_message(main_session_id, 'withdrawn former-member message'); execute 'reset role';
  select id into withdrawn_message_id from public.session_messages where session_id = main_session_id and sender_profile_id = withdrawn_id and body = 'withdrawn former-member message' order by id desc limit 1;
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', withdrawn_user::text, true); perform public.withdraw_from_session(main_session_id); execute 'reset role';
  return next is((select count(*) from public.session_messages where session_id = main_session_id and kind = 'system'), old_system_count + 1, 'guest withdrawal produces exactly one system message');
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  return next is(public.set_player_block(withdrawn_id, true), 'OK', 'host can block a former member after withdrawal');
  return next is((select count(*) from public.session_message_feed where message_id = withdrawn_message_id), 0::bigint, 'blocking a former member hides their historical user message');
  execute 'reset role';
  return next is((select count(*) from public.player_blocks where blocker_profile_id = host_id and blocked_profile_id = withdrawn_id), 1::bigint, 'former-member block materializes a player_blocks row');
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  return next is((select blocked_nickname from public.my_player_blocks where blocked_profile_id = withdrawn_id), 'Chat Withdrawn', 'withdrawn shared-session participant row exposes the true nickname regardless of status');
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', withdrawn_user::text, true);
  return next is(public.set_player_block(host_id, true), 'OK', 'former member can block after leaving the group');
  execute 'reset role';
  return next is((select count(*) from public.player_blocks where blocker_profile_id = withdrawn_id and blocked_profile_id = host_id), 1::bigint, 'former-member post-withdrawal block materializes a player_blocks row');

  -- Stage 1 permits a long nickname; its generated system message must not
  -- turn an otherwise valid acceptance into a 1000-character CHECK failure.
  update public.profiles set nickname = repeat('長', 1000) where id = observer_id;
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  select public.create_session(court_id, '雙打', now() + interval '14 days 1 hour', 3, 4, 2, '__pgtap_chat_long_nickname__', 'approval', 'booked', null, null, null) into long_nickname_session_id;
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', observer_user::text, true); perform public.request_to_join_session(long_nickname_session_id); execute 'reset role';
  select id into participant_id from public.session_participants where session_id = long_nickname_session_id and profile_id = observer_id;
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  return next lives_ok(format('select public.review_join_request(%s, %s, %L)', long_nickname_session_id, participant_id, 'accepted'), 'long-nickname guest can be accepted without a system-message CHECK failure');
  execute 'reset role';
  return next ok((select char_length(body) = 1000 and right(body, char_length(' 加入了球局')) = ' 加入了球局' from public.session_messages where session_id = long_nickname_session_id and kind = 'system' order by id desc limit 1), 'long-nickname system message is capped and retains its lifecycle suffix');
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true); perform public.cancel_session(long_nickname_session_id); execute 'reset role';

  -- A pre-block invitation/request is not an existing accepted relationship:
  -- only its accepted branch is blocked; either party may still decline it.
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  select public.create_session(court_id, '雙打', now() + interval '14 days 2 hours', 3, 4, 2, '__pgtap_chat_block_invite_accept__', 'approval', 'booked', null, null, null) into invite_accept_session_id;
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', invite_target_user::text, true); perform public.set_player_visibility(true); execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true); perform public.invite_to_session(invite_accept_session_id, invite_target_id); perform public.set_player_block(invite_target_id, true); execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', invite_target_user::text, true);
  respond_blocked_outcome := pg_temp.respond_to_session_invite_outcome(invite_accept_session_id, 'accepted');
  return next is(
    respond_blocked_outcome,
    'EXCEPTION:P0001:SESSION_UNAVAILABLE',
    'invitee blocked by the host receives neutral SESSION_UNAVAILABLE when accepting'
  );
  execute 'reset role';
  return next is((select status from public.session_participants where session_id = invite_accept_session_id and profile_id = invite_target_id), 'invited', 'blocked invitation acceptance leaves the participant invited');
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', invite_target_user::text, true);
  return next is(pg_temp.respond_to_session_invite_outcome(invite_accept_session_id, 'declined'), 'OK', 'blocked invitee can decline a pre-existing invitation');
  return next is(public.set_player_block(host_id, true), 'OK', 'invitee can block the hidden inviter before an accepted relationship');
  execute 'reset role';
  return next is((select count(*) from public.player_blocks where blocker_profile_id = invite_target_id and blocked_profile_id = host_id), 1::bigint, 'hidden-inviter block materializes a player_blocks row');
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', invite_target_user::text, true);
  perform public.set_player_block(host_id, false);
  perform public.set_player_visibility(false);
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  return next is(public.set_player_block(invite_target_id, false), 'OK', 'host can unblock an invitee after they opt out of the directory');
  execute 'reset role';
  return next is((select count(*) from public.player_blocks where blocker_profile_id = host_id and blocked_profile_id = invite_target_id), 0::bigint, 'opt-out unblock removes the player_blocks row');
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  return next is(public.set_player_block(invite_target_id, true), 'OK', 'host can block an invitee again after directory opt-out');
  -- Anchor: c1759ee allowed the preceding unblock; this re-block protects the regression.
  execute 'reset role';
  return next is((select count(*) from public.player_blocks where blocker_profile_id = host_id and blocked_profile_id = invite_target_id), 1::bigint, 'opt-out re-block anchor materializes a player_blocks row');
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  perform public.set_player_block(invite_target_id, false);
  perform public.cancel_session(invite_accept_session_id);
  execute 'reset role';

  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  select public.create_session(court_id, '雙打', now() + interval '14 days 3 hours', 3, 4, 2, '__pgtap_chat_block_review_accept__', 'approval', 'booked', null, null, null) into review_block_session_id;
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', requested_user::text, true); perform public.request_to_join_session(review_block_session_id); execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  return next is(public.set_player_block(requested_id, true), 'OK', 'host can block a hidden requester before acceptance');
  execute 'reset role';
  return next is((select count(*) from public.player_blocks where blocker_profile_id = host_id and blocked_profile_id = requested_id), 1::bigint, 'hidden-requester block materializes a player_blocks row');
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  perform public.set_player_block(requested_id, false);
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', requested_user::text, true); perform public.set_player_block(host_id, true); execute 'reset role';
  select id into review_participant_id from public.session_participants where session_id = review_block_session_id and profile_id = requested_id;
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  review_blocked_outcome := pg_temp.review_join_request_outcome(review_block_session_id, review_participant_id, 'accepted');
  return next is(
    review_blocked_outcome,
    'EXCEPTION:P0001:GUEST_UNAVAILABLE',
    'host blocked by the requester receives neutral GUEST_UNAVAILABLE when accepting'
  );
  execute 'reset role';
  return next is((select status from public.session_participants where id = review_participant_id), 'requested', 'blocked request acceptance leaves the participant requested');
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  return next is(pg_temp.review_join_request_outcome(review_block_session_id, review_participant_id, 'declined'), 'OK', 'host can decline a request after requester blocks the host');
  perform public.cancel_session(review_block_session_id);
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', requested_user::text, true); perform public.set_player_block(host_id, false); execute 'reset role';

  -- Feed gate: these are the Stage 3 three-beat canary assertions.
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', observer_user::text, true);
  return next is((select count(*) from public.session_message_feed where session_id = main_session_id), 0::bigint, 'non-member sees zero session message feed rows');
  return next throws_ok(
    format('select public.post_session_message(%s, %L)', main_session_id, 'non-member post'),
    'P0001',
    'NOT_SESSION_MEMBER',
    'non-member post_session_message raises NOT_SESSION_MEMBER'
  );
  perform set_config('request.jwt.claim.sub', host_user::text, true);
  return next ok((select count(*) > 0 from public.session_message_feed where session_id = main_session_id), 'host sees a non-empty session message feed');
  perform set_config('request.jwt.claim.sub', accepted_user::text, true);
  return next ok((select count(*) > 0 from public.session_message_feed where session_id = main_session_id), 'Stage 3 three-beat canary: accepted member feed gate returns rows');
  perform set_config('request.jwt.claim.sub', requested_user::text, true);
  return next is((select count(*) from public.session_message_feed where session_id = main_session_id), 0::bigint, 'requested guest sees zero session message feed rows');
  return next throws_ok(
    format('select public.post_session_message(%s, %L)', main_session_id, 'requested guest post'),
    'P0001',
    'NOT_SESSION_MEMBER',
    'requested guest cannot post_session_message'
  );
  perform set_config('request.jwt.claim.sub', declined_user::text, true);
  return next is((select count(*) from public.session_message_feed where session_id = main_session_id), 0::bigint, 'declined guest sees zero session message feed rows');
  return next throws_ok(
    format('select public.post_session_message(%s, %L)', main_session_id, 'declined guest post'),
    'P0001',
    'NOT_SESSION_MEMBER',
    'declined guest cannot post_session_message'
  );
  perform set_config('request.jwt.claim.sub', withdrawn_user::text, true);
  return next is((select count(*) from public.session_message_feed where session_id = main_session_id), 0::bigint, 'withdrawn guest sees zero session message feed rows');
  return next throws_ok(
    format('select public.post_session_message(%s, %L)', main_session_id, 'withdrawn guest post'),
    'P0001',
    'NOT_SESSION_MEMBER',
    'withdrawn guest cannot post_session_message'
  );
  execute 'reset role';
  -- This later invitation fixture requires a directory-visible invitee; it is
  -- independent of the preceding opt-out/unblock regression assertion.
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', invite_target_user::text, true); perform public.set_player_visibility(true); execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true); perform public.invite_to_session(main_session_id, invite_target_id); execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', invite_target_user::text, true);
  return next throws_ok(
    format('select public.post_session_message(%s, %L)', main_session_id, 'invited guest post'),
    'P0001',
    'NOT_SESSION_MEMBER',
    'invited guest cannot post_session_message'
  );
  execute 'reset role';

  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  select count(*) into baseline_block_count from public.my_player_blocks;
  return next is(public.set_player_block(-1, true), 'OK', 'unknown target block is a silent OK no-op');
  return next is(
    (select count(*) from public.my_player_blocks),
    baseline_block_count,
    'unknown target block adds no player-block row'
  );
  return next is(public.set_player_block(-1, false), 'OK', 'unknown target unblock is a silent OK no-op');
  return next is(
    (select count(*) from public.my_player_blocks),
    baseline_block_count,
    'unknown target unblock leaves player-block rows unchanged'
  );
  return next is(public.set_player_block(blocked_join_id, true), 'OK', 'complete hidden unrelated profile can be blocked');
  return next is(
    (select count(*) from public.my_player_blocks where blocked_profile_id = blocked_join_id),
    1::bigint,
    'hidden unrelated target appears in my_player_blocks'
  );
  execute 'reset role';
  return next is(
    (
      select count(*)
      from public.session_participants viewer_participant
      join public.session_participants blocked_participant
        on blocked_participant.session_id = viewer_participant.session_id
      where viewer_participant.profile_id = host_id
        and blocked_participant.profile_id = blocked_join_id
    ),
    0::bigint,
    'hidden block-list fixture has no shared session-participant relationship'
  );
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  return next is((select blocked_nickname from public.my_player_blocks where blocked_profile_id = blocked_join_id), '已封鎖的使用者', 'unrelated hidden block-list row uses the fixed nickname placeholder');
  return next isnt((select blocked_nickname from public.my_player_blocks where blocked_profile_id = blocked_join_id), 'Chat Blocked Join', 'unrelated hidden block-list row never reveals the target true nickname');
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', blocked_join_user::text, true); perform public.set_player_visibility(true); execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  return next is((select blocked_nickname from public.my_player_blocks where blocked_profile_id = blocked_join_id), 'Chat Blocked Join', 'directory-visible block-list row exposes the target true nickname without a shared session');
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', blocked_join_user::text, true); perform public.set_player_visibility(false); execute 'reset role';
  delete from public.profile_courts where profile_id = blocked_join_id;
  update public.profiles set is_public = true where id = blocked_join_id;
  return next ok((select is_public and not private.profile_meets_gate(id, 'directory') from public.profiles where id = blocked_join_id), 'public block-list fixture deliberately fails the directory gate');
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  return next is((select blocked_nickname from public.my_player_blocks where blocked_profile_id = blocked_join_id), '已封鎖的使用者', 'public directory-gate-ineligible block-list row keeps the fixed nickname placeholder');
  execute 'reset role';

  select id into visible_system_message_id from public.session_messages where session_id = main_session_id and kind = 'system' order by id limit 1;
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  return next throws_ok(
    format('select public.create_report(null, null, %L, %s)', 'system messages are not reportable', visible_system_message_id),
    'P0001',
    'INVALID_TRANSITION',
    'visible system message cannot be reported through create_report'
  );
  execute 'reset role';

  -- Archived members retain the feed but cannot post.
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  select public.create_session(court_id, '雙打', now() + interval '15 days', 3, 4, 2, '__pgtap_chat_archive__', 'approval', 'booked', null, null, null) into archive_session_id;
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', accepted_user::text, true); perform public.request_to_join_session(archive_session_id); execute 'reset role';
  select id into participant_id from public.session_participants where session_id = archive_session_id and profile_id = accepted_id;
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  perform public.review_join_request(archive_session_id, participant_id, 'accepted');
  execute 'reset role';
  select count(*) into old_system_count from public.session_messages where session_id = archive_session_id and kind = 'system';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  perform public.cancel_session(archive_session_id);
  execute 'reset role';
  return next is((select count(*) from public.session_messages where session_id = archive_session_id and kind = 'system'), old_system_count + 1, 'cancellation produces exactly one system message');
  return next ok((select archived_at is not null from public.sessions where id = archive_session_id), 'cancelled session populates archived_at');
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', accepted_user::text, true);
  return next is(pg_temp.post_session_message_outcome(archive_session_id, 'archived write'), 'SESSION_ARCHIVED', 'archived session returns SESSION_ARCHIVED from post_session_message');
  return next ok((select count(*) > 0 from public.session_message_feed where session_id = archive_session_id), 'accepted member can still read archived session feed');
  execute 'reset role';

  -- Both block directions hide user messages but leave the lifecycle history.
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true); perform public.post_session_message(main_session_id, 'host user message'); execute 'reset role';
  select id into host_message_id from public.session_messages where session_id = main_session_id and kind = 'user' and sender_profile_id = host_id order by id desc limit 1;
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', accepted_user::text, true); perform public.post_session_message(main_session_id, 'accepted user message'); perform public.set_player_block(host_id, true); execute 'reset role';
  select id into guest_message_id from public.session_messages where session_id = main_session_id and kind = 'user' and sender_profile_id = accepted_id order by id desc limit 1;
  return next is((select status from public.session_participants where session_id = main_session_id and profile_id = accepted_id), 'accepted', 'block leaves its own pre-existing accepted pair unchanged');
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', accepted_user::text, true);
  return next is((select count(*) from public.session_message_feed where message_id = host_message_id), 0::bigint, 'guest-to-host block filters blocked host user message');
  return next ok((select count(*) > 0 from public.session_message_feed where session_id = main_session_id and kind = 'system'), 'guest-to-host block does not filter system messages');
  perform set_config('request.jwt.claim.sub', host_user::text, true);
  return next is((select count(*) from public.session_message_feed where message_id = guest_message_id), 0::bigint, 'guest-to-host block also filters guest user message for host');
  return next ok((select count(*) > 0 from public.session_message_feed where session_id = main_session_id and kind = 'system'), 'reverse feed still retains system messages');
  perform set_config('request.jwt.claim.sub', accepted_user::text, true);
  perform public.set_player_block(host_id, false);
  return next is((select count(*) from public.session_message_feed where message_id = host_message_id), 1::bigint, 'unblocking guest-to-host restores the host user message');
  perform set_config('request.jwt.claim.sub', host_user::text, true);
  perform public.set_player_block(accepted_id, true);
  if to_regclass('public.my_player_blocks') is null then
    return next ok(false, 'blocker can read their own narrow player-block row');
  else
    return next is(
      (
        select count(*)
        from public.my_player_blocks block_row
        where block_row.blocked_profile_id = accepted_id
          and block_row.blocked_nickname = 'Chat Accepted'
          and block_row.created_at is not null
      ),
      1::bigint,
      'shared-session block-list row exposes the target true nickname'
    );
  end if;
  perform set_config('request.jwt.claim.sub', accepted_user::text, true);
  if to_regclass('public.my_player_blocks') is null then
    return next ok(false, 'another authenticated player cannot read the host block row');
  else
    return next is(
      (select count(*) from public.my_player_blocks where blocked_profile_id = accepted_id),
      0::bigint,
      'another authenticated player cannot read the host block row'
    );
  end if;
  return next is((select count(*) from public.session_message_feed where message_id = host_message_id), 0::bigint, 'host-to-guest block filters host user message for guest');
  return next ok((select count(*) > 0 from public.session_message_feed where session_id = main_session_id and kind = 'system'), 'host-to-guest block leaves system messages visible to guest');
  perform set_config('request.jwt.claim.sub', host_user::text, true);
  return next is((select count(*) from public.session_message_feed where message_id = guest_message_id), 0::bigint, 'host-to-guest block also filters guest user message for host');
  return next ok((select count(*) > 0 from public.session_message_feed where session_id = main_session_id and kind = 'system'), 'host-to-guest block leaves system messages visible to host');
  perform public.set_player_block(accepted_id, false);
  return next ok(public.create_report(null, accepted_id, 'visible message report', guest_message_id) is not null, 'create_report accepts a visible user message without a session target');
  perform public.create_report(null, null, 'message report derives its sender', host_message_id);
  execute 'reset role';
  return next is((select reported_profile_id from public.reports where message_id = host_message_id order by id desc limit 1), host_id, 'message-only report derives the visible sender as its profile target');

  -- A block forbids new joins/invites but cannot alter an accepted row.
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', blocked_join_user::text, true); perform public.set_player_block(host_id, true);
  request_blocker_outcome := pg_temp.request_to_join_session_outcome(main_session_id);
  return next is(request_blocker_outcome, 'EXCEPTION:P0001:BLOCKED', 'guest blocker receives BLOCKED from request_to_join_session');
  execute 'reset role';
  return next is((select status from public.session_participants where session_id = main_session_id and profile_id = accepted_id), 'accepted', 'blocked join leaves existing accepted participant unchanged');
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', invite_target_user::text, true); perform public.set_player_visibility(true); execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true); perform public.set_player_block(invite_target_id, true);
  invite_blocker_outcome := pg_temp.invite_to_session_outcome(main_session_id, invite_target_id);
  return next is(invite_blocker_outcome, 'EXCEPTION:P0001:BLOCKED', 'host blocker receives BLOCKED from invite_to_session');
  execute 'reset role';
  return next is((select status from public.session_participants where session_id = main_session_id and profile_id = accepted_id), 'accepted', 'blocked invite leaves existing accepted participant unchanged');

  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true); perform public.set_player_block(observer_id, true); execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', observer_user::text, true);
  request_blocked_outcome := pg_temp.request_to_join_session_outcome(main_session_id);
  return next is(request_blocked_outcome, 'EXCEPTION:P0001:SESSION_UNAVAILABLE', 'guest blocked by the host receives neutral SESSION_UNAVAILABLE from request_to_join_session');
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true); perform public.set_player_block(observer_id, false); execute 'reset role';
  return next isnt(request_blocker_outcome, request_blocked_outcome, 'request blocker and blocked-side outcomes are observably different');

  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', accepted_user::text, true); perform public.set_player_visibility(true); perform public.set_player_block(host_id, true); execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  invite_blocked_outcome := pg_temp.invite_to_session_outcome(main_session_id, accepted_id);
  return next is(invite_blocked_outcome, 'EXCEPTION:P0001:INVITEE_NOT_AVAILABLE', 'host blocked by a visible invitee receives INVITEE_NOT_AVAILABLE');
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', accepted_user::text, true); perform public.set_player_block(host_id, false); execute 'reset role';

  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  select public.create_session(court_id, '雙打', now() + interval '15 days 12 hours', 3, 4, 2, '__pgtap_chat_directional_blocks__', 'approval', 'booked', null, null, null) into directional_session_id;
  perform public.invite_to_session(directional_session_id, accepted_id);
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', accepted_user::text, true);
  perform public.set_player_block(host_id, true);
  respond_blocker_outcome := pg_temp.respond_to_session_invite_outcome(directional_session_id, 'accepted');
  return next is(respond_blocker_outcome, 'EXCEPTION:P0001:BLOCKED', 'invitee blocker receives BLOCKED when accepting an invitation');
  perform public.set_player_block(host_id, false);
  execute 'reset role';

  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', requested_user::text, true); perform public.request_to_join_session(directional_session_id); execute 'reset role';
  select id into directional_participant_id from public.session_participants where session_id = directional_session_id and profile_id = requested_id;
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  perform public.set_player_block(requested_id, true);
  review_blocker_outcome := pg_temp.review_join_request_outcome(directional_session_id, directional_participant_id, 'accepted');
  return next is(review_blocker_outcome, 'EXCEPTION:P0001:BLOCKED', 'host blocker receives BLOCKED when reviewing a join request');
  perform public.set_player_block(requested_id, false);
  perform public.cancel_session(directional_session_id);
  execute 'reset role';

  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', observer_user::text, true); perform public.set_player_block(host_id, true); execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  return next throws_ok(
    format('select public.invite_to_session(%s, %s)', main_session_id, observer_id),
    'P0001',
    'INVITEE_NOT_AVAILABLE',
    'a hidden profile returns unavailable even when it blocks the host'
  );
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', observer_user::text, true); perform public.set_player_block(host_id, false); execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  return next throws_ok(
    format('select public.invite_to_session(%s, %s)', main_session_id, observer_id),
    'P0001',
    'INVITEE_NOT_AVAILABLE',
    'an unblocked hidden profile remains unavailable for invitation'
  );
  execute 'reset role';

  -- Outbox fan-out and its five-minute, sent_at-independent throttle.
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  select public.create_session(court_id, '雙打', now() + interval '16 days', 3, 4, 2, '__pgtap_chat_outbox__', 'approval', 'booked', null, null, null) into outbox_session_id;
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', accepted_user::text, true); perform public.request_to_join_session(outbox_session_id); execute 'reset role';
  select id into participant_id from public.session_participants where session_id = outbox_session_id and profile_id = accepted_id;
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  perform public.review_join_request(outbox_session_id, participant_id, 'accepted');
  perform public.post_session_message(outbox_session_id, posted_body);
  execute 'reset role';
  return next is((select count(*) from public.notification_outbox where event_type = 'chat_message' and session_id = outbox_session_id and recipient_profile_id = host_id), 0::bigint, 'chat outbox excludes sender');
  return next is((select count(*) from public.notification_outbox where event_type = 'chat_message' and session_id = outbox_session_id and recipient_profile_id = accepted_id), 1::bigint, 'chat outbox fans out exactly once to the other accepted member');
  return next ok((select payload - array['court', 'message', 'slots_remaining', 'start_at', 'url'] = '{}'::jsonb from public.notification_outbox where event_type = 'chat_message' and session_id = outbox_session_id and recipient_profile_id = accepted_id), 'chat outbox payload uses the exact allowlist');
  return next is((select payload->>'message' from public.notification_outbox where event_type = 'chat_message' and session_id = outbox_session_id and recipient_profile_id = accepted_id), '群組有新訊息', 'chat outbox payload uses the constant summary message');
  return next is((select payload ? 'body' from public.notification_outbox where event_type = 'chat_message' and session_id = outbox_session_id and recipient_profile_id = accepted_id), false, 'chat outbox payload never contains message body');
  return next is((select position(posted_body in payload::text) from public.notification_outbox where event_type = 'chat_message' and session_id = outbox_session_id and recipient_profile_id = accepted_id), 0, 'chat outbox payload never contains the posted body sentinel');
  return next is((select position(fixture_line in payload::text) from public.notification_outbox where event_type = 'chat_message' and session_id = outbox_session_id and recipient_profile_id = accepted_id), 0, 'chat outbox payload never contains the fixture LINE sentinel');
  update public.notification_outbox set sent_at = now() - interval '1 hour' where event_type = 'chat_message' and session_id = outbox_session_id and recipient_profile_id = accepted_id;
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true); perform public.post_session_message(outbox_session_id, 'second private body must not be pushed'); execute 'reset role';
  return next is((select count(*) from public.notification_outbox where event_type = 'chat_message' and session_id = outbox_session_id and recipient_profile_id = accepted_id), 1::bigint, 'chat throttle ignores sent_at and suppresses a second recipient row within five minutes');
  return next throws_ok(format($q$insert into public.notification_outbox(event_type,recipient_profile_id,session_id,payload) values ('chat_message',%s,%s,'{"court":"x","message":"群組有新訊息","slots_remaining":1,"start_at":"2026-01-01T00:00:00Z","url":"#/session/1","body":"leak"}'::jsonb)$q$, accepted_id, outbox_session_id), '23514', null, 'payload CHECK rejects otherwise-valid body payload');
  return next throws_ok(format($q$insert into public.notification_outbox(event_type,recipient_profile_id,session_id,payload) values ('chat_message',%s,%s,'{"court":"x","message":"群組有新訊息","slots_remaining":1,"start_at":"2026-01-01T00:00:00Z","url":"#/session/1","line_id":"leak"}'::jsonb)$q$, accepted_id, outbox_session_id), '23514', null, 'payload CHECK rejects otherwise-valid line_id payload');
  return next throws_ok(format($q$insert into public.notification_outbox(event_type,recipient_profile_id,session_id,payload) values ('chat_message',%s,%s,'{"court":"x","message":"private body must not be pushed","slots_remaining":1,"start_at":"2026-01-01T00:00:00Z","url":"#/session/1"}'::jsonb)$q$, accepted_id, outbox_session_id), '23514', null, 'payload CHECK rejects chat body smuggled through message');

  -- Chat push recipients use the same bidirectional block rule as the feed.
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  select public.create_session(court_id, '雙打', now() + interval '16 days 1 hour', 3, 4, 3, '__pgtap_chat_block_outbox__', 'approval', 'booked', null, null, null) into block_outbox_session_id;
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', accepted_user::text, true); perform public.request_to_join_session(block_outbox_session_id); execute 'reset role';
  select id into participant_id from public.session_participants where session_id = block_outbox_session_id and profile_id = accepted_id;
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true); perform public.review_join_request(block_outbox_session_id, participant_id, 'accepted'); execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', observer_user::text, true); perform public.request_to_join_session(block_outbox_session_id); execute 'reset role';
  select id into participant_id from public.session_participants where session_id = block_outbox_session_id and profile_id = observer_id;
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true); perform public.review_join_request(block_outbox_session_id, participant_id, 'accepted'); perform public.set_player_block(accepted_id, true); perform public.post_session_message(block_outbox_session_id, 'host-to-blocked-recipient'); execute 'reset role';
  return next ok(exists(select 1 from public.notification_outbox where event_type = 'chat_message' and session_id = block_outbox_session_id), 'blocked-recipient chat outbox scan is non-empty for the unblocked third member');
  return next is((select count(*) from public.notification_outbox where event_type = 'chat_message' and session_id = block_outbox_session_id and recipient_profile_id = accepted_id), 0::bigint, 'host message does not enqueue chat outbox for the blocked accepted member');
  return next is((select count(*) from public.notification_outbox where event_type = 'chat_message' and session_id = block_outbox_session_id and recipient_profile_id = observer_id), 1::bigint, 'host message still enqueues chat outbox for the unblocked third member');
  delete from public.notification_outbox where event_type = 'chat_message' and session_id = block_outbox_session_id;
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', accepted_user::text, true); perform public.post_session_message(block_outbox_session_id, 'blocked-recipient-to-host'); execute 'reset role';
  return next ok(exists(select 1 from public.notification_outbox where event_type = 'chat_message' and session_id = block_outbox_session_id), 'reverse blocked-recipient chat outbox scan is non-empty for the unblocked third member');
  return next is((select count(*) from public.notification_outbox where event_type = 'chat_message' and session_id = block_outbox_session_id and recipient_profile_id = host_id), 0::bigint, 'accepted member message does not enqueue chat outbox for the blocker host');
  return next is((select count(*) from public.notification_outbox where event_type = 'chat_message' and session_id = block_outbox_session_id and recipient_profile_id = observer_id), 1::bigint, 'accepted member message still enqueues chat outbox for the unblocked third member');
  delete from public.notification_outbox where event_type = 'chat_message' and session_id = block_outbox_session_id;
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', observer_user::text, true); perform public.post_session_message(block_outbox_session_id, 'third-member-across-block'); execute 'reset role';
  return next is((select count(*) from public.notification_outbox where event_type = 'chat_message' and session_id = block_outbox_session_id and recipient_profile_id = host_id), 1::bigint, 'third-member message still enqueues chat outbox for the blocker host');
  return next is((select count(*) from public.notification_outbox where event_type = 'chat_message' and session_id = block_outbox_session_id and recipient_profile_id = accepted_id), 1::bigint, 'third-member message still enqueues chat outbox for the blocked accepted member');
  delete from public.notification_outbox where event_type = 'chat_message' and session_id = block_outbox_session_id;
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true); perform public.set_player_block(accepted_id, false); perform public.post_session_message(block_outbox_session_id, 'unblocked-three-member-control'); execute 'reset role';
  return next is((select count(*) from public.notification_outbox where event_type = 'chat_message' and session_id = block_outbox_session_id and recipient_profile_id = accepted_id), 1::bigint, 'unblocked three-member control enqueues chat outbox for the accepted member');
  return next is((select count(*) from public.notification_outbox where event_type = 'chat_message' and session_id = block_outbox_session_id and recipient_profile_id = observer_id), 1::bigint, 'unblocked three-member control enqueues chat outbox for the third member');
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true); perform public.cancel_session(block_outbox_session_id); execute 'reset role';

  -- Update and candidate-decision system events.
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  select public.create_session(court_id, '雙打', now() + interval '17 days', 3, 4, 2, '__pgtap_chat_update__', 'approval', 'booked', null, null, null) into update_session_id;
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', accepted_user::text, true); perform public.request_to_join_session(update_session_id); execute 'reset role';
  select id into participant_id from public.session_participants where session_id = update_session_id and profile_id = accepted_id;
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  perform public.review_join_request(update_session_id, participant_id, 'accepted');
  execute 'reset role';
  select count(*) into old_system_count from public.session_messages where session_id = update_session_id and kind = 'system';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  perform public.update_session(update_session_id, now() + interval '18 days', court_id, 2, 3, 4, '雙打', null, 'updated');
  execute 'reset role';
  return next is((select count(*) from public.session_messages where session_id = update_session_id and kind = 'system'), old_system_count + 1, 'session update produces exactly one system message');
  select count(*) into old_system_count from public.session_messages where session_id = update_session_id and kind = 'system';
  select session_for_fee.start_at, session_for_fee.court_id, session_for_fee.slots_total, session_for_fee.ntrp_min, session_for_fee.ntrp_max, session_for_fee.play_type, session_for_fee.notes
  into update_start_at, update_court_id, update_slots, update_ntrp_min, update_ntrp_max, update_play_type, update_note
  from public.sessions session_for_fee where session_for_fee.id = update_session_id;
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  perform public.update_session(
    update_session_id,
    update_start_at,
    update_court_id,
    update_slots,
    update_ntrp_min,
    update_ntrp_max,
    update_play_type,
    'fee-only system update',
    update_note
  );
  execute 'reset role';
  return next is((select count(*) from public.session_messages where session_id = update_session_id and kind = 'system'), old_system_count + 1, 'fee-only session update produces exactly one system message');
  update_fee_note := 'fee-only system update';
  select count(*) into old_system_count from public.session_messages where session_id = update_session_id and kind = 'system';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  perform public.update_session(update_session_id, update_start_at, update_court_id, update_slots, 3.25, update_ntrp_max, update_play_type, update_fee_note, update_note);
  execute 'reset role';
  return next is((select count(*) from public.session_messages where session_id = update_session_id and kind = 'system'), old_system_count + 1, 'NTRP-only session update produces exactly one system message');
  update_ntrp_min := 3.25;
  select count(*) into old_system_count from public.session_messages where session_id = update_session_id and kind = 'system';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  perform public.update_session(update_session_id, update_start_at, update_court_id, update_slots, update_ntrp_min, update_ntrp_max, '單打', update_fee_note, update_note);
  execute 'reset role';
  return next is((select count(*) from public.session_messages where session_id = update_session_id and kind = 'system'), old_system_count + 1, 'play-type-only session update produces exactly one system message');
  update_play_type := '單打';
  select count(*) into old_system_count from public.session_messages where session_id = update_session_id and kind = 'system';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  perform public.update_session(update_session_id, update_start_at, update_court_id, update_slots, update_ntrp_min, update_ntrp_max, update_play_type, update_fee_note, 'notes-only system update');
  execute 'reset role';
  return next is((select count(*) from public.session_messages where session_id = update_session_id and kind = 'system'), old_system_count + 1, 'notes-only session update produces exactly one system message');
  update_note := 'notes-only system update';

  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  select public.create_session(court_id, '雙打', now() + interval '19 days', 3, 4, 2, '__pgtap_chat_candidate__', 'approval', 'candidates', array[court_id, second_court_id], now() + interval '19 days 2 hours', null) into candidate_session_id;
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', accepted_user::text, true); perform public.request_to_join_session(candidate_session_id); execute 'reset role';
  select id into participant_id from public.session_participants where session_id = candidate_session_id and profile_id = accepted_id;
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  perform public.review_join_request(candidate_session_id, participant_id, 'accepted');
  execute 'reset role';
  select count(*) into old_system_count from public.session_messages where session_id = candidate_session_id and kind = 'system';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  perform public.decide_session_court(candidate_session_id, second_court_id, now() + interval '19 days 1 hour');
  execute 'reset role';
  return next is((select count(*) from public.session_messages where session_id = candidate_session_id and kind = 'system'), old_system_count + 1, 'candidate decision produces exactly one system message');

  -- Lifecycle RPC entry: an overdue undecided candidate must archive before a
  -- member can post, even when the cron sweep has not run.
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', blocked_join_user::text, true);
  select public.create_session(court_id, '雙打', now() + interval '19 days', 3, 4, 2, '__pgtap_chat_post_expiry__', 'approval', 'candidates', array[court_id, second_court_id], now() + interval '19 days 2 hours', null) into post_expiry_session_id;
  execute 'reset role';
  perform pg_temp.age_chat_session_for_expiry(post_expiry_session_id);
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', blocked_join_user::text, true);
  return next is(pg_temp.post_session_message_outcome(post_expiry_session_id, 'late candidate post'), 'SESSION_ARCHIVED', 'overdue undecided candidate returns SESSION_ARCHIVED from post_session_message');
  execute 'reset role';
  return next is((select status from public.sessions where id = post_expiry_session_id), 'expired', 'post_session_message lifecycle entry expires overdue undecided candidate');

  -- All three archival transitions set archived_at through real lifecycle paths.
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  select public.create_session(court_id, '雙打', now() - interval '1 minute', 3, 4, 2, '__pgtap_chat_played__', 'approval', 'booked', null, null, null) into played_session_id;
  execute 'reset role';
  select count(*) into old_system_count from public.session_messages where session_id = played_session_id and kind = 'system';
  update public.sessions set status = 'played', court_id = second_court_id where id = played_session_id;
  return next is(
    (select count(*) from public.session_messages where session_id = played_session_id and kind = 'system'),
    old_system_count,
    'played transition suppresses system messages even when session fields also change'
  );
  return next ok((select archived_at is not null from public.sessions where id = played_session_id), 'played session populates archived_at');
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  select public.create_session(court_id, '雙打', now() + interval '20 days', 3, 4, 2, '__pgtap_chat_expired__', 'approval', 'booked', null, null, null) into expired_session_id;
  execute 'reset role';
  perform pg_temp.age_chat_session_for_expiry(expired_session_id);
  perform private.expire_stale_sessions();
  return next ok((select archived_at is not null from public.sessions where id = expired_session_id), 'expired session populates archived_at');

  -- Purge fixture contains a scan-visible aged archive, a reported user
  -- message that must survive, an unreported one that must not, and a system
  -- message that must never be retained.
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  select public.create_session(court_id, '雙打', now() + interval '21 days', 3, 4, 2, '__pgtap_chat_purge__', 'approval', 'booked', null, null, null) into purge_session_id;
  perform public.cancel_session(purge_session_id);
  execute 'reset role';
  update public.sessions set archived_at = now() - interval '91 days' where id = purge_session_id;
  insert into public.session_messages(session_id, sender_profile_id, kind, body)
  values (purge_session_id, host_id, 'user', 'unreported purge body') returning id into unreported_message_id;
  insert into public.session_messages(session_id, sender_profile_id, kind, body)
  values (purge_session_id, accepted_id, 'user', 'reported retain body') returning id into reported_message_id;
  insert into public.session_messages(session_id, sender_profile_id, kind, body)
  values (purge_session_id, accepted_id, 'user', 'closed report purge body') returning id into closed_reported_message_id;
  insert into public.session_messages(session_id, sender_profile_id, kind, body)
  values (purge_session_id, null, 'system', 'system purge body') returning id into old_system_message_id;
  insert into public.session_messages(session_id, sender_profile_id, kind, body)
  values (main_session_id, host_id, 'user', 'open purge retain body') returning id into open_purge_message_id;
  update public.sessions set archived_at = now() - interval '89 days' where id = archive_session_id;
  insert into public.session_messages(session_id, sender_profile_id, kind, body)
  values (archive_session_id, host_id, 'user', 'recent archive retain body') returning id into recent_archive_message_id;
  insert into public.reports(reporter_profile_id, reported_profile_id, reason, message_id)
  values (host_id, accepted_id, 'test report retains its message', reported_message_id);
  insert into public.reports(reporter_profile_id, reported_profile_id, reason, message_id, status)
  values (host_id, accepted_id, 'closed report permits purge', closed_reported_message_id, 'reviewed')
  returning id into closed_report_id;
  return next ok(exists(select 1 from public.session_messages message_row join public.sessions session_row on session_row.id = message_row.session_id where session_row.id = purge_session_id and session_row.archived_at < now() - interval '90 days'), 'purge scan has a non-empty archived-message candidate set');
  return next ok(private.purge_archived_session_messages() > 0, 'purge removes at least one aged archived message');
  return next is((select count(*) from public.session_messages where id = unreported_message_id), 0::bigint, 'purge removes unreported user message from aged archive');
  return next is((select count(*) from public.session_messages where id = reported_message_id), 1::bigint, 'purge preserves user message linked by reports.message_id');
  return next is((select count(*) from public.session_messages where id = closed_reported_message_id), 0::bigint, 'purge removes message after its report is closed');
  return next is((select message_id from public.reports where id = closed_report_id), null::bigint, 'purge preserves the closed report audit record after removing its message');
  return next is((select count(*) from public.session_messages where id = old_system_message_id), 0::bigint, 'purge removes the system message from an aged archive');
  return next is((select count(*) from public.session_messages where id = open_purge_message_id), 1::bigint, 'purge preserves a message from an unarchived open session');
  return next is((select count(*) from public.session_messages where id = recent_archive_message_id), 1::bigint, 'purge preserves a message from an archive newer than ninety days');
  return next ok(exists(select 1 from public.sessions where status in ('cancelled', 'played', 'expired')), 'terminal archived_at scan has a non-empty predecessor set');
  return next is((select count(*) from public.sessions where status in ('cancelled', 'played', 'expired') and archived_at is null), 0::bigint, 'terminal sessions have a non-null archived_at anchor');

  -- Browser grants: raw tables stay RPC-only and the feed is never anonymous.
  return next is(has_table_privilege('anon', 'public.session_messages', 'select'), false, 'anon cannot select session_messages');
  return next is(has_table_privilege('anon', 'public.session_messages', 'insert'), false, 'anon cannot insert session_messages');
  return next is(has_table_privilege('anon', 'public.session_messages', 'update'), false, 'anon cannot update session_messages');
  return next is(has_table_privilege('anon', 'public.session_messages', 'delete'), false, 'anon cannot delete session_messages');
  return next is(has_table_privilege('anon', 'public.player_blocks', 'select'), false, 'anon cannot select player_blocks');
  return next is(has_table_privilege('anon', 'public.player_blocks', 'insert'), false, 'anon cannot insert player_blocks');
  return next is(has_table_privilege('anon', 'public.player_blocks', 'update'), false, 'anon cannot update player_blocks');
  return next is(has_table_privilege('anon', 'public.player_blocks', 'delete'), false, 'anon cannot delete player_blocks');
  return next is(has_table_privilege('anon', 'public.session_message_feed', 'select'), false, 'anon cannot select session_message_feed');
  return next is(has_table_privilege('anon', 'public.session_message_feed', 'insert'), false, 'anon cannot insert session_message_feed');
  return next is(has_table_privilege('anon', 'public.session_message_feed', 'update'), false, 'anon cannot update session_message_feed');
  return next is(has_table_privilege('anon', 'public.session_message_feed', 'delete'), false, 'anon cannot delete session_message_feed');
  return next is(
    coalesce((select has_table_privilege('anon', class_row.oid, 'select') from pg_class class_row join pg_namespace namespace_row on namespace_row.oid = class_row.relnamespace where namespace_row.nspname = 'public' and class_row.relname = 'my_player_blocks'), false),
    false,
    'anon cannot select my_player_blocks'
  );
  return next is(
    coalesce((select has_table_privilege('authenticated', class_row.oid, 'select') from pg_class class_row join pg_namespace namespace_row on namespace_row.oid = class_row.relnamespace where namespace_row.nspname = 'public' and class_row.relname = 'my_player_blocks'), false),
    true,
    'authenticated can select my_player_blocks'
  );
  return next is(has_table_privilege('authenticated', 'public.session_messages', 'select'), false, 'authenticated cannot directly select session_messages');
  return next is(has_table_privilege('authenticated', 'public.session_messages', 'insert'), false, 'authenticated cannot directly insert session_messages');
  return next is(has_table_privilege('authenticated', 'public.session_messages', 'update'), false, 'authenticated cannot directly update session_messages');
  return next is(has_table_privilege('authenticated', 'public.session_messages', 'delete'), false, 'authenticated cannot directly delete session_messages');
  return next is(has_table_privilege('authenticated', 'public.player_blocks', 'select'), false, 'authenticated cannot directly select player_blocks');
  return next is(has_table_privilege('authenticated', 'public.player_blocks', 'insert'), false, 'authenticated cannot directly insert player_blocks');
  return next is(has_table_privilege('authenticated', 'public.player_blocks', 'update'), false, 'authenticated cannot directly update player_blocks');
  return next is(has_table_privilege('authenticated', 'public.player_blocks', 'delete'), false, 'authenticated cannot directly delete player_blocks');

  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  return next throws_ok(
    format('select public.post_session_message(%s, %s)', main_session_id, 'null'),
    'P0001',
    'INVALID_MESSAGE',
    'post_session_message rejects a null body with INVALID_MESSAGE'
  );
  return next throws_ok(
    format('select public.post_session_message(%s, %L)', main_session_id, '   '),
    'P0001',
    'INVALID_MESSAGE',
    'post_session_message rejects ASCII-whitespace-only input with INVALID_MESSAGE'
  );
  return next throws_ok(
    format('select public.post_session_message(%s, %L)', main_session_id, repeat(chr(12288), 3)),
    'P0001',
    'INVALID_MESSAGE',
    'post_session_message rejects fullwidth-whitespace-only input with INVALID_MESSAGE'
  );
  return next throws_ok(
    format('select public.post_session_message(%s, %L)', main_session_id, repeat(chr(160), 3)),
    'P0001',
    'INVALID_MESSAGE',
    'post_session_message rejects NBSP-only input with INVALID_MESSAGE'
  );
  return next throws_ok(
    format('select public.post_session_message(%s, %L)', main_session_id, repeat(chr(8203), 3)),
    'P0001',
    'INVALID_MESSAGE',
    'post_session_message rejects zero-width-space-only input with INVALID_MESSAGE'
  );
  return next throws_ok(
    format('select public.post_session_message(%s, %L)', main_session_id, repeat(chr(65279), 3)),
    'P0001',
    'INVALID_MESSAGE',
    'post_session_message rejects byte-order-mark-only input with INVALID_MESSAGE'
  );
  return next throws_ok(
    format('select public.post_session_message(%s, %L)', main_session_id, ''),
    'P0001',
    'INVALID_MESSAGE',
    'post_session_message rejects an empty body with INVALID_MESSAGE'
  );
  return next throws_ok(
    format('select public.post_session_message(%s, %L)', main_session_id, repeat('x', 1001)),
    'P0001',
    'INVALID_MESSAGE',
    'post_session_message rejects a body longer than one thousand characters with INVALID_MESSAGE'
  );
  return next is(public.post_session_message(main_session_id, '  normalized chat body  '), 'OK', 'post_session_message accepts a normalized valid body');
  perform public.post_session_message(main_session_id, chr(12288) || 'fullwidth trimmed body' || chr(12288));
  return next is(pg_temp.post_session_message_outcome(main_session_id, chr(160) || 'nbsp-edge' || chr(160) || 'nbsp-inner' || chr(160)), 'OK', 'post_session_message trims only the NBSP edges');
  return next is(pg_temp.post_session_message_outcome(main_session_id, chr(8203) || 'zwsp-edge' || chr(8203) || 'zwsp-inner' || chr(8203)), 'OK', 'post_session_message trims only the zero-width-space edges');
  return next is(pg_temp.post_session_message_outcome(main_session_id, chr(65279) || 'bom-edge' || chr(65279) || 'bom-inner' || chr(65279)), 'OK', 'post_session_message trims only the byte-order-mark edges');
  execute 'reset role';
  return next is((select body from public.session_messages where session_id = main_session_id and body = 'normalized chat body' order by id desc limit 1), 'normalized chat body', 'post_session_message stores the btrim-normalized body');
  return next is((select body from public.session_messages where session_id = main_session_id and body = 'fullwidth trimmed body' order by id desc limit 1), 'fullwidth trimmed body', 'fullwidth leading and trailing whitespace is normalized while content remains');
  return next is((select body from public.session_messages where session_id = main_session_id and sender_profile_id = host_id and body = 'nbsp-edge' || chr(160) || 'nbsp-inner' order by id desc limit 1), 'nbsp-edge' || chr(160) || 'nbsp-inner', 'NBSP edges are trimmed while the inner NBSP and content remain');
  return next is((select body from public.session_messages where session_id = main_session_id and sender_profile_id = host_id and body = 'zwsp-edge' || chr(8203) || 'zwsp-inner' order by id desc limit 1), 'zwsp-edge' || chr(8203) || 'zwsp-inner', 'zero-width-space edges are trimmed while the inner character and content remain');
  return next is((select body from public.session_messages where session_id = main_session_id and sender_profile_id = host_id and body = 'bom-edge' || chr(65279) || 'bom-inner' order by id desc limit 1), 'bom-edge' || chr(65279) || 'bom-inner', 'byte-order-mark edges are trimmed while the inner character and content remain');
end;
$$;

select * from pg_temp.run_session_chat_contract();

select * from finish();

rollback;
