begin;

select plan(43);

select has_column('public', 'notification_prefs', 'session_updated_enabled', 'notification preferences expose the session update switch');
select has_column('public', 'notification_prefs', 'chat_message_enabled', 'notification preferences expose the chat message switch');
select has_column('public', 'notification_prefs', 'session_reminder_enabled', 'notification preferences expose the session reminder switch');
select has_function(
  'public',
  'set_notification_prefs',
  array['boolean','boolean','boolean','boolean','boolean','boolean'],
  'notification preference RPC accepts the six Stage 5 switches'
);
select is(
  to_regprocedure('public.set_notification_prefs(boolean,boolean,boolean)')::text,
  null,
  'the retired three-argument notification preference RPC is absent'
);
select has_function(
  'private',
  'enqueue_session_reminders',
  array['timestamp with time zone'],
  'the reminder enqueue function remains directly testable with a clock anchor'
);
select is(to_regclass('public.district_subscriptions')::text, null, 'district subscriptions table is retired');
select is(to_regprocedure('public.set_district_subscriptions(text[])')::text, null, 'district subscription RPC is retired');
select is(to_regprocedure('private.try_enqueue_district_new_session(bigint,text)')::text, null, 'district fan-out helper is retired');
select ok(
  position('session_reminder' in (select pg_get_constraintdef(oid) from pg_constraint where conname = 'notification_outbox_event_type_check')) > 0
    and position('decide_reminder' in (select pg_get_constraintdef(oid) from pg_constraint where conname = 'notification_outbox_event_type_check')) > 0
    and position('district_new_session' in (select pg_get_constraintdef(oid) from pg_constraint where conname = 'notification_outbox_event_type_check')) = 0,
  'outbox event CHECK contains both reminders and no district event'
);
select ok(
  to_regclass('public.notification_outbox_reminder_once_idx') is not null,
  'reminders use a dedicated partial unique index'
);
select is(
  (select count(*) from cron.job where jobname = 'enqueue-session-reminders'),
  1::bigint,
  'pg_cron schedules exactly one reminder job'
);
select is(
  (select schedule from cron.job where jobname = 'enqueue-session-reminders'),
  '*/5 * * * *',
  'the reminder job runs every five minutes'
);
select ok(
  to_regclass('public.notification_outbox_chat_throttle_idx') is not null,
  'the chat throttle partial index survives the notification rework'
);

create function pg_temp.run_notification_rework_contract()
returns setof text
language plpgsql
as $$
declare
  base_session_id bigint;
  decided_session_id bigint;
  event_name text;
  far_candidate_session_id bigint;
  fixed_session_id bigint;
  guest_id bigint;
  host_id bigint;
  pref_id bigint;
  reminder_now timestamptz := date_trunc('minute', now());
  sport_id bigint;
  court_id bigint;
  undecided_session_id bigint;
  valid_payload jsonb;
begin
  if to_regprocedure('private.enqueue_session_reminders(timestamp with time zone)') is null
    or to_regprocedure('public.set_notification_prefs(boolean,boolean,boolean,boolean,boolean,boolean)') is null
    or not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'notification_prefs'
        and column_name = 'session_reminder_enabled'
    ) then
    return query select * from skip('Stage 5 notification rework is not installed yet', 29);
    return;
  end if;

  return next is(
    (
      select string_agg(column_name, ',' order by ordinal_position)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'notification_prefs'
    ),
    'profile_id,host_new_request_enabled,guest_request_reviewed_enabled,guest_invited_enabled,session_updated_enabled,chat_message_enabled,session_reminder_enabled',
    'notification preferences keep the exact ordered seven-column contract'
  );

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  )
  values
    ('00000000-0000-0000-0000-000000007001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stage5-pref@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
    ('00000000-0000-0000-0000-000000007002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stage5-host@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
    ('00000000-0000-0000-0000-000000007003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stage5-guest@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);

  insert into public.profiles (user_id, nickname, ntrp)
  values
    ('00000000-0000-0000-0000-000000007001', 'Stage Five Pref', 3.5),
    ('00000000-0000-0000-0000-000000007002', 'Stage Five Host', 3.5),
    ('00000000-0000-0000-0000-000000007003', 'Stage Five Guest', 3.5);

  select id into pref_id from public.profiles where user_id = '00000000-0000-0000-0000-000000007001';
  select id into host_id from public.profiles where user_id = '00000000-0000-0000-0000-000000007002';
  select id into guest_id from public.profiles where user_id = '00000000-0000-0000-0000-000000007003';
  select id into sport_id from public.sports where code = 'tennis';
  select id into court_id from public.courts where is_active and city = '台北市' order by id limit 1;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000007001', true);
  return next is(
    public.set_notification_prefs(false, true, false, false, true, false),
    'OK',
    'an authenticated owner can save all six notification preferences'
  );
  execute 'reset role';

  return next is(
    (
      select concat_ws(
        ',',
        host_new_request_enabled,
        guest_request_reviewed_enabled,
        guest_invited_enabled,
        session_updated_enabled,
        chat_message_enabled,
        session_reminder_enabled
      )
      from public.notification_prefs
      where profile_id = pref_id
    ),
    'f,t,f,f,t,f',
    'the six saved preference values retain their independent boundaries'
  );
  return next is(
    concat_ws(
      ',',
      private.notification_pref_enabled(pref_id, 'host_new_request'),
      private.notification_pref_enabled(pref_id, 'guest_request_reviewed'),
      private.notification_pref_enabled(pref_id, 'guest_invited'),
      private.notification_pref_enabled(pref_id, 'session_updated'),
      private.notification_pref_enabled(pref_id, 'chat_message'),
      private.notification_pref_enabled(pref_id, 'session_reminder'),
      private.notification_pref_enabled(pref_id, 'session_decided'),
      private.notification_pref_enabled(pref_id, 'session_cancelled'),
      private.notification_pref_enabled(pref_id, 'court_new_session'),
      private.notification_pref_enabled(pref_id, 'decide_reminder'),
      private.notification_pref_enabled(pref_id, 'unknown_event')
    ),
    'f,t,f,f,t,f,t,t,t,t,f',
    'preference routing keeps lifecycle constants, reminder policy, and unknown fallback distinct'
  );

  insert into public.sessions (sport_id, host_profile_id, court_id, play_type, start_at, slots_total, notes)
  values (sport_id, pref_id, court_id, '單打', reminder_now + interval '1 day', 1, '__stage5_payload__')
  returning id into base_session_id;
  insert into public.session_participants (session_id, profile_id, role, status)
  values (base_session_id, pref_id, 'host', 'accepted');
  set constraints all immediate;
  set constraints all deferred;

  perform private.enqueue_notification(
    'session_decided', pref_id, base_session_id,
    private.notification_session_payload(base_session_id, '定案通知')
  );
  perform private.enqueue_notification(
    'session_cancelled', pref_id, base_session_id,
    private.notification_session_payload(base_session_id, '取消通知')
  );
  return next is(
    (select count(*) from public.notification_outbox where session_id = base_session_id),
    2::bigint,
    'session decided and cancelled enqueue even when every optional lifecycle preference is disabled'
  );

  delete from public.notification_outbox where session_id = base_session_id;
  for event_name in
    select unnest(array[
      'host_new_request', 'guest_request_reviewed', 'guest_invited', 'court_new_session',
      'session_updated', 'session_decided', 'session_cancelled', 'chat_message',
      'session_reminder', 'decide_reminder'
    ]::text[])
  loop
    valid_payload := jsonb_build_object(
      'court', 'Stage Five Court',
      'start_at', reminder_now + interval '1 day',
      'slots_remaining', 1,
      'message', case when event_name = 'chat_message' then '群組有新訊息' else 'Stage Five summary' end,
      'url', '#/session/' || base_session_id::text
    );
    return next throws_ok(
      format(
        'insert into public.notification_outbox(event_type,recipient_profile_id,session_id,payload) values (%L,%s,%s,%L::jsonb)',
        event_name,
        pref_id,
        base_session_id,
        (valid_payload || jsonb_build_object('line_id', 'forbidden'))::text
      ),
      '23514',
      null,
      event_name || ' payload CHECK rejects a field outside the shared allowlist'
    );
    insert into public.notification_outbox (event_type, recipient_profile_id, session_id, payload)
    values (event_name, pref_id, base_session_id, valid_payload);
  end loop;

  return next is(
    (select count(distinct event_type) from public.notification_outbox where session_id = base_session_id),
    10::bigint,
    'the active event scan contains one valid row for every Stage 5 event type'
  );
  return next ok(
    exists (select 1 from public.notification_outbox where session_id = base_session_id)
      and not exists (
        select 1
        from public.notification_outbox outbox_row,
             lateral jsonb_object_keys(outbox_row.payload) payload_key
        where outbox_row.session_id = base_session_id
          and payload_key not in ('court', 'message', 'slots_remaining', 'start_at', 'url')
      ),
    'the active event payload scan is non-empty and contains only shared allowlist keys'
  );
  return next is(
    (
      select count(*)
      from public.notification_outbox
      where session_id = base_session_id
        and (payload ? 'line_id' or payload ? 'body')
    ),
    0::bigint,
    'no active event payload stores LINE or chat message body fields'
  );

  delete from public.notification_outbox;
  insert into public.notification_prefs (profile_id, session_reminder_enabled)
  values (guest_id, false);

  insert into public.sessions (sport_id, host_profile_id, court_id, play_type, start_at, slots_total, notes)
  values (sport_id, host_id, court_id, '雙打', reminder_now + interval '60 minutes', 2, '__stage5_fixed__')
  returning id into fixed_session_id;
  insert into public.sessions (sport_id, host_profile_id, court_id, play_type, start_at, slots_total, notes, venue_type, range_end, decided_at)
  values (sport_id, host_id, court_id, '雙打', reminder_now + interval '60 minutes', 2, '__stage5_decided__', 'candidates', reminder_now + interval '2 hours', reminder_now)
  returning id into decided_session_id;
  insert into public.sessions (sport_id, host_profile_id, court_id, play_type, start_at, slots_total, notes, venue_type, range_end)
  values (sport_id, host_id, court_id, '雙打', reminder_now + interval '2 hours', 2, '__stage5_undecided__', 'candidates', reminder_now + interval '3 hours')
  returning id into undecided_session_id;
  insert into public.sessions (sport_id, host_profile_id, court_id, play_type, start_at, slots_total, notes, venue_type, range_end)
  values (sport_id, host_id, court_id, '雙打', reminder_now + interval '4 hours', 2, '__stage5_far_candidate__', 'candidates', reminder_now + interval '5 hours')
  returning id into far_candidate_session_id;

  insert into public.session_participants (session_id, profile_id, role, status)
  select fixture_session.id, host_id, 'host', 'accepted'
  from (
    values
      (fixed_session_id),
      (decided_session_id),
      (undecided_session_id),
      (far_candidate_session_id)
  ) fixture_session(id);
  insert into public.session_participants (session_id, profile_id, role, status)
  select fixture_session.id, guest_id, 'guest', 'requested'
  from (
    values
      (fixed_session_id),
      (decided_session_id),
      (undecided_session_id),
      (far_candidate_session_id)
  ) fixture_session(id);
  update public.session_participants
  set status = 'accepted'
  where profile_id = guest_id
    and session_id in (fixed_session_id, decided_session_id, undecided_session_id, far_candidate_session_id);
  set constraints all immediate;
  set constraints all deferred;

  return next is(
    private.enqueue_session_reminders(reminder_now),
    3,
    'the first reminder scan enqueues two start reminders and one decision reminder'
  );
  return next ok(
    exists (
      select 1
      from public.notification_outbox
      where event_type in ('session_reminder', 'decide_reminder')
    ),
    'reminder scan set is non-empty'
  );
  return next is(
    (select count(*) from public.notification_outbox where event_type = 'session_reminder'),
    2::bigint,
    'fixed and decided candidate sessions each enqueue one enabled start reminder'
  );
  return next is(
    (select count(*) from public.notification_outbox where event_type = 'session_reminder' and session_id = undecided_session_id),
    0::bigint,
    'an undecided candidate session never receives a start reminder'
  );
  return next is(
    (select count(*) from public.notification_outbox where event_type = 'decide_reminder' and session_id = undecided_session_id and recipient_profile_id = host_id),
    1::bigint,
    'an undecided candidate within three hours receives one host decision reminder'
  );
  return next is(
    (select count(*) from public.notification_outbox where event_type = 'session_reminder' and recipient_profile_id = guest_id),
    0::bigint,
    'a disabled session reminder preference suppresses every guest start reminder'
  );
  return next is(
    (select count(*) from public.notification_outbox where session_id = far_candidate_session_id),
    0::bigint,
    'a candidate more than three hours away receives no early decision reminder'
  );
  return next ok(
    not exists (
      select 1
      from public.notification_outbox outbox_row,
           lateral jsonb_object_keys(outbox_row.payload) payload_key
      where outbox_row.event_type in ('session_reminder', 'decide_reminder')
        and payload_key not in ('court', 'message', 'slots_remaining', 'start_at', 'url')
    )
      and not exists (
        select 1
        from public.notification_outbox outbox_row
        where outbox_row.event_type in ('session_reminder', 'decide_reminder')
          and outbox_row.payload->>'url' <> '#/session/' || outbox_row.session_id::text
      ),
    'reminder payloads use the shared allowlist and authoritative session deep link'
  );
  return next is(
    private.enqueue_session_reminders(reminder_now),
    0,
    'a second reminder scan inserts no duplicate rows'
  );
  return next is(
    (select count(*) from public.notification_outbox where event_type in ('session_reminder', 'decide_reminder')),
    3::bigint,
    'running the reminder job twice leaves exactly one row per session recipient and event type'
  );
  return next throws_ok(
    format(
      'insert into public.notification_outbox(event_type,recipient_profile_id,session_id,payload) values (%L,%s,%s,%L::jsonb)',
      'session_reminder',
      host_id,
      fixed_session_id,
      private.notification_session_payload(fixed_session_id, 'duplicate reminder')::text
    ),
    '23505',
    null,
    'the reminder unique index rejects a direct duplicate insert'
  );
end;
$$;

select * from pg_temp.run_notification_rework_contract();

select * from finish();

rollback;
