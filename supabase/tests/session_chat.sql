begin;

-- Stage 3 is intentionally red until 202607270003_session_chat.sql exists.
-- The conditional runner keeps that first red run reportable: it records the
-- missing contract, then skips dependent checks instead of aborting the file
-- on an undefined relation.  Once installed, every assertion below executes
-- against the real view, RPCs, constraints, and lifecycle triggers.
select plan(67);

select has_table('public', 'session_messages', 'session messages table exists');
select has_view('public', 'session_message_feed', 'session message feed view exists');

create function pg_temp.age_chat_session_for_expiry(p_session_id bigint)
returns void
language plpgsql
as $$
begin
  set constraints all immediate;
  set constraints all deferred;
  alter table public.sessions disable trigger sessions_enforce_transition;
  begin
    update public.sessions
    set start_at = now() - interval '25 hours'
    where id = p_session_id;
  exception when others then
    alter table public.sessions enable trigger sessions_enforce_transition;
    raise;
  end;
  alter table public.sessions enable trigger sessions_enforce_transition;
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
  archive_session_id bigint;
  update_session_id bigint;
  candidate_session_id bigint;
  played_session_id bigint;
  expired_session_id bigint;
  outbox_session_id bigint;
  purge_session_id bigint;
  participant_id bigint;
  baseline_system_count bigint;
  old_system_count bigint;
  host_message_id bigint;
  guest_message_id bigint;
  unreported_message_id bigint;
  reported_message_id bigint;
  posted_body text := 'private body must not be pushed';
  fixture_line text := 'chat-host-line';
begin
  if to_regclass('public.session_messages') is null
    or to_regclass('public.session_message_feed') is null then
    return query select * from skip('Stage 3 session-chat schema is not installed yet', 65);
    return;
  end if;

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
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', withdrawn_user::text, true); perform public.withdraw_from_session(main_session_id); execute 'reset role';
  return next is((select count(*) from public.session_messages where session_id = main_session_id and kind = 'system'), old_system_count + 1, 'guest withdrawal produces exactly one system message');

  -- Feed gate: these are the Stage 3 three-beat canary assertions.
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', observer_user::text, true);
  return next is((select count(*) from public.session_message_feed where session_id = main_session_id), 0::bigint, 'non-member sees zero session message feed rows');
  perform set_config('request.jwt.claim.sub', host_user::text, true);
  return next ok((select count(*) > 0 from public.session_message_feed where session_id = main_session_id), 'host sees a non-empty session message feed');
  perform set_config('request.jwt.claim.sub', accepted_user::text, true);
  return next ok((select count(*) > 0 from public.session_message_feed where session_id = main_session_id), 'Stage 3 three-beat canary: accepted member feed gate returns rows');
  perform set_config('request.jwt.claim.sub', requested_user::text, true);
  return next is((select count(*) from public.session_message_feed where session_id = main_session_id), 0::bigint, 'requested guest sees zero session message feed rows');
  perform set_config('request.jwt.claim.sub', declined_user::text, true);
  return next is((select count(*) from public.session_message_feed where session_id = main_session_id), 0::bigint, 'declined guest sees zero session message feed rows');
  perform set_config('request.jwt.claim.sub', withdrawn_user::text, true);
  return next is((select count(*) from public.session_message_feed where session_id = main_session_id), 0::bigint, 'withdrawn guest sees zero session message feed rows');
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
  return next throws_ok(format('select public.post_session_message(%s, %L)', archive_session_id, 'archived write'), 'P0001', 'SESSION_ARCHIVED', 'archived session rejects post_session_message with SESSION_ARCHIVED');
  return next ok((select count(*) > 0 from public.session_message_feed where session_id = archive_session_id), 'accepted member can still read archived session feed');
  execute 'reset role';

  -- Both block directions hide user messages but leave the lifecycle history.
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true); perform public.post_session_message(main_session_id, 'host user message'); execute 'reset role';
  select id into host_message_id from public.session_messages where session_id = main_session_id and kind = 'user' and sender_profile_id = host_id order by id desc limit 1;
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', accepted_user::text, true); perform public.post_session_message(main_session_id, 'accepted user message'); perform public.set_player_block(host_id, true); execute 'reset role';
  select id into guest_message_id from public.session_messages where session_id = main_session_id and kind = 'user' and sender_profile_id = accepted_id order by id desc limit 1;
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
  perform set_config('request.jwt.claim.sub', accepted_user::text, true);
  return next is((select count(*) from public.session_message_feed where message_id = host_message_id), 0::bigint, 'host-to-guest block filters host user message for guest');
  return next ok((select count(*) > 0 from public.session_message_feed where session_id = main_session_id and kind = 'system'), 'host-to-guest block leaves system messages visible to guest');
  perform set_config('request.jwt.claim.sub', host_user::text, true);
  return next is((select count(*) from public.session_message_feed where message_id = guest_message_id), 0::bigint, 'host-to-guest block also filters guest user message for host');
  return next ok((select count(*) > 0 from public.session_message_feed where session_id = main_session_id and kind = 'system'), 'host-to-guest block leaves system messages visible to host');
  perform public.set_player_block(accepted_id, false);
  execute 'reset role';

  -- A block forbids new joins/invites but cannot alter an accepted row.
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', blocked_join_user::text, true); perform public.set_player_block(host_id, true);
  return next throws_ok(format('select public.request_to_join_session(%s)', main_session_id), 'P0001', 'BLOCKED', 'block makes request_to_join_session raise BLOCKED');
  execute 'reset role';
  return next is((select status from public.session_participants where session_id = main_session_id and profile_id = accepted_id), 'accepted', 'blocked join leaves existing accepted participant unchanged');
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', invite_target_user::text, true); perform public.set_player_visibility(true); execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true); perform public.set_player_block(invite_target_id, true);
  return next throws_ok(format('select public.invite_to_session(%s, %s)', main_session_id, invite_target_id), 'P0001', 'BLOCKED', 'block makes invite_to_session raise BLOCKED');
  execute 'reset role';
  return next is((select status from public.session_participants where session_id = main_session_id and profile_id = accepted_id), 'accepted', 'blocked invite leaves existing accepted participant unchanged');

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

  -- All three archival transitions set archived_at through real lifecycle paths.
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', host_user::text, true);
  select public.create_session(court_id, '雙打', now() - interval '1 minute', 3, 4, 2, '__pgtap_chat_played__', 'approval', 'booked', null, null, null) into played_session_id;
  perform public.mark_session_played(played_session_id);
  execute 'reset role';
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
  values (purge_session_id, null, 'system', 'system purge body');
  insert into public.reports(reporter_profile_id, reported_profile_id, reason, message_id)
  values (host_id, accepted_id, 'test report retains its message', reported_message_id);
  return next ok(exists(select 1 from public.session_messages message_row join public.sessions session_row on session_row.id = message_row.session_id where session_row.id = purge_session_id and session_row.archived_at < now() - interval '90 days'), 'purge scan has a non-empty archived-message candidate set');
  return next ok(private.purge_archived_session_messages() > 0, 'purge removes at least one aged archived message');
  return next is((select count(*) from public.session_messages where id = unreported_message_id), 0::bigint, 'purge removes unreported user message from aged archive');
  return next is((select count(*) from public.session_messages where id = reported_message_id), 1::bigint, 'purge preserves user message linked by reports.message_id');
  return next is((select count(*) from public.session_messages where session_id = purge_session_id and kind = 'system'), 0::bigint, 'purge removes system messages from aged archive');

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
  return next is(has_table_privilege('authenticated', 'public.session_messages', 'select'), false, 'authenticated cannot directly select session_messages');
  return next is(has_table_privilege('authenticated', 'public.session_messages', 'insert'), false, 'authenticated cannot directly insert session_messages');
  return next is(has_table_privilege('authenticated', 'public.session_messages', 'update'), false, 'authenticated cannot directly update session_messages');
  return next is(has_table_privilege('authenticated', 'public.session_messages', 'delete'), false, 'authenticated cannot directly delete session_messages');
  return next is(has_table_privilege('authenticated', 'public.player_blocks', 'select'), false, 'authenticated cannot directly select player_blocks');
  return next is(has_table_privilege('authenticated', 'public.player_blocks', 'insert'), false, 'authenticated cannot directly insert player_blocks');
  return next is(has_table_privilege('authenticated', 'public.player_blocks', 'update'), false, 'authenticated cannot directly update player_blocks');
  return next is(has_table_privilege('authenticated', 'public.player_blocks', 'delete'), false, 'authenticated cannot directly delete player_blocks');
end;
$$;

select * from pg_temp.run_session_chat_contract();

select * from finish();

rollback;
