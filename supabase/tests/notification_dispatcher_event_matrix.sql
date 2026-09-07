begin;

select no_plan();

-- Every runtime value in this file is a transaction-local test fixture. The
-- migration itself keeps the singleton disabled and leaves all policy values
-- unset.
update private.notification_runtime_control
set new_runtime_mode = 'enabled',
    worker_lease_duration = interval '10 minutes',
    request_deadline_duration = interval '1 minute',
    delivery_lease_duration = interval '2 minutes',
    max_delivery_attempts = 3,
    push_ttl_safety_budget = interval '0 seconds'
where singleton_id = 1;

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
    '00000000-0000-0000-0000-00000000e201',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'fa03-d1-matrix-host@example.test',
    'test',
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000e202',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'fa03-d1-matrix-guest@example.test',
    'test',
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  );

insert into public.profiles (user_id, nickname, ntrp)
values
  ('00000000-0000-0000-0000-00000000e201', 'D1 Matrix Host', 3.5),
  ('00000000-0000-0000-0000-00000000e202', 'D1 Matrix Guest', 3.5);

select set_config(
  'pgtap.fa03_d1_matrix_host',
  profile_row.id::text,
  true
)
from public.profiles profile_row
where profile_row.user_id = '00000000-0000-0000-0000-00000000e201';

select set_config(
  'pgtap.fa03_d1_matrix_guest',
  profile_row.id::text,
  true
)
from public.profiles profile_row
where profile_row.user_id = '00000000-0000-0000-0000-00000000e202';

select set_config(
  'pgtap.fa03_d1_matrix_court',
  court_row.id::text,
  true
)
from public.courts court_row
where court_row.is_active
  and court_row.city = '台北市'
order by court_row.id
limit 1;

with fixed_session as (
  insert into public.sessions (
    sport_id,
    host_profile_id,
    court_id,
    play_type,
    start_at,
    slots_total,
    status
  )
  select
    sport_row.id,
    current_setting('pgtap.fa03_d1_matrix_host')::bigint,
    current_setting('pgtap.fa03_d1_matrix_court')::bigint,
    '練球',
    pg_catalog.clock_timestamp() + interval '1 day',
    3,
    'open'
  from public.sports sport_row
  where sport_row.code = 'tennis'
  returning id
)
select set_config(
  'pgtap.fa03_d1_matrix_fixed_session',
  fixed_session.id::text,
  true
)
from fixed_session;

insert into public.session_participants (
  session_id,
  profile_id,
  role,
  status,
  initiated_by
)
values
  (
    current_setting('pgtap.fa03_d1_matrix_fixed_session')::bigint,
    current_setting('pgtap.fa03_d1_matrix_host')::bigint,
    'host',
    'accepted',
    'host'
  ),
  (
    current_setting('pgtap.fa03_d1_matrix_fixed_session')::bigint,
    current_setting('pgtap.fa03_d1_matrix_guest')::bigint,
    'guest',
    'requested',
    'guest'
  );

update public.session_participants participant_row
set status = 'accepted'
where participant_row.session_id =
    current_setting('pgtap.fa03_d1_matrix_fixed_session')::bigint
  and participant_row.profile_id =
    current_setting('pgtap.fa03_d1_matrix_guest')::bigint;

select set_config(
  'pgtap.fa03_d1_matrix_fixed_guest_participant',
  participant_row.id::text,
  true
)
from public.session_participants participant_row
where participant_row.session_id =
    current_setting('pgtap.fa03_d1_matrix_fixed_session')::bigint
  and participant_row.profile_id =
    current_setting('pgtap.fa03_d1_matrix_guest')::bigint;

with invited_session as (
  insert into public.sessions (
    sport_id,
    host_profile_id,
    court_id,
    play_type,
    start_at,
    slots_total,
    status
  )
  select
    sport_row.id,
    current_setting('pgtap.fa03_d1_matrix_host')::bigint,
    current_setting('pgtap.fa03_d1_matrix_court')::bigint,
    '練球',
    pg_catalog.clock_timestamp() + interval '1 day',
    2,
    'open'
  from public.sports sport_row
  where sport_row.code = 'tennis'
  returning id
)
select set_config(
  'pgtap.fa03_d1_matrix_invited_session',
  invited_session.id::text,
  true
)
from invited_session;

insert into public.session_participants (
  session_id,
  profile_id,
  role,
  status,
  initiated_by
)
values
  (
    current_setting('pgtap.fa03_d1_matrix_invited_session')::bigint,
    current_setting('pgtap.fa03_d1_matrix_host')::bigint,
    'host',
    'accepted',
    'host'
  ),
  (
    current_setting('pgtap.fa03_d1_matrix_invited_session')::bigint,
    current_setting('pgtap.fa03_d1_matrix_guest')::bigint,
    'guest',
    'invited',
    'host'
  );

select set_config(
  'pgtap.fa03_d1_matrix_invited_participant',
  participant_row.id::text,
  true
)
from public.session_participants participant_row
where participant_row.session_id =
    current_setting('pgtap.fa03_d1_matrix_invited_session')::bigint
  and participant_row.profile_id =
    current_setting('pgtap.fa03_d1_matrix_guest')::bigint;

with candidate_session as (
  insert into public.sessions (
    sport_id,
    host_profile_id,
    court_id,
    play_type,
    start_at,
    slots_total,
    status,
    venue_type,
    range_end
  )
  select
    sport_row.id,
    current_setting('pgtap.fa03_d1_matrix_host')::bigint,
    current_setting('pgtap.fa03_d1_matrix_court')::bigint,
    '練球',
    pg_catalog.clock_timestamp() + interval '1 day',
    3,
    'open',
    'candidates',
    pg_catalog.clock_timestamp() + interval '1 day 2 hours'
  from public.sports sport_row
  where sport_row.code = 'tennis'
  returning id
)
select set_config(
  'pgtap.fa03_d1_matrix_candidate_session',
  candidate_session.id::text,
  true
)
from candidate_session;

insert into public.session_candidate_courts (session_id, court_id, position)
values (
  current_setting('pgtap.fa03_d1_matrix_candidate_session')::bigint,
  current_setting('pgtap.fa03_d1_matrix_court')::bigint,
  1
);

insert into public.session_participants (
  session_id,
  profile_id,
  role,
  status,
  initiated_by
)
values
  (
    current_setting('pgtap.fa03_d1_matrix_candidate_session')::bigint,
    current_setting('pgtap.fa03_d1_matrix_host')::bigint,
    'host',
    'accepted',
    'host'
  ),
  (
    current_setting('pgtap.fa03_d1_matrix_candidate_session')::bigint,
    current_setting('pgtap.fa03_d1_matrix_guest')::bigint,
    'guest',
    'requested',
    'guest'
  );

update public.session_participants participant_row
set status = 'accepted'
where participant_row.session_id =
    current_setting('pgtap.fa03_d1_matrix_candidate_session')::bigint
  and participant_row.profile_id =
    current_setting('pgtap.fa03_d1_matrix_guest')::bigint;

with message_row as (
  insert into public.session_messages (
    session_id,
    sender_profile_id,
    body
  )
  values (
    current_setting('pgtap.fa03_d1_matrix_fixed_session')::bigint,
    current_setting('pgtap.fa03_d1_matrix_host')::bigint,
    'D1 event matrix message'
  )
  returning id
)
select set_config(
  'pgtap.fa03_d1_matrix_message',
  message_row.id::text,
  true
)
from message_row;

insert into public.court_subscriptions (profile_id, court_id)
values (
  current_setting('pgtap.fa03_d1_matrix_guest')::bigint,
  current_setting('pgtap.fa03_d1_matrix_court')::bigint
);

select is(
  public.enable_push_device_v2(
    '00000000-0000-0000-0000-00000000e201',
    '20000000-0000-4000-8000-00000000e201',
    '21000000-0000-4000-8000-00000000e201',
    repeat('21', 32),
    'https://push.example.test/fa03-d1-matrix-host',
    'p256dh-fa03-d1-matrix-host',
    'auth-fa03-d1-matrix-host',
    repeat('31', 32)
  ) ->> 'kind',
  'committed',
  'event matrix creates the host transport through the reviewed command'
);

select is(
  public.enable_push_device_v2(
    '00000000-0000-0000-0000-00000000e202',
    '20000000-0000-4000-8000-00000000e202',
    '21000000-0000-4000-8000-00000000e202',
    repeat('22', 32),
    'https://push.example.test/fa03-d1-matrix-guest',
    'p256dh-fa03-d1-matrix-guest',
    'auth-fa03-d1-matrix-guest',
    repeat('32', 32)
  ) ->> 'kind',
  'committed',
  'event matrix creates the guest transport through the reviewed command'
);

select set_config(
  'pgtap.fa03_d1_matrix_worker',
  notification_dispatcher_api.begin_notification_dispatch_worker(1) ->> 'workerToken',
  true
);

create function pg_temp.fa03_d1_prepare_matrix_event(
  p_event_type text,
  p_recipient_profile_id bigint,
  p_session_id bigint,
  p_source_kind text,
  p_source_id bigint,
  p_source_version bigint
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  target_consent private.push_device_consents%rowtype;
  created_outbox_id bigint;
  claim_result jsonb;
  prepare_result jsonb;
  complete_result jsonb;
  frozen_at timestamptz := pg_catalog.clock_timestamp();
begin
  select *
  into target_consent
  from private.push_device_consents consent_row
  where consent_row.profile_id = p_recipient_profile_id
    and consent_row.state = 'enabled';

  insert into public.notification_outbox (
    event_type,
    recipient_profile_id,
    session_id,
    payload,
    created_at,
    expires_at,
    source_version,
    outbox_format_version,
    source_kind,
    source_id,
    fanout_state,
    fanout_frozen_at
  )
  values (
    p_event_type,
    p_recipient_profile_id,
    p_session_id,
    private.notification_session_payload(
      p_session_id,
      case
        when p_event_type = 'chat_message' then '群組有新訊息'
        else 'stale event-matrix snapshot'
      end
    ),
    frozen_at,
    frozen_at + interval '1 day',
    p_source_version,
    2,
    p_source_kind,
    p_source_id,
    'frozen',
    frozen_at
  )
  returning id into created_outbox_id;

  insert into private.notification_deliveries (
    outbox_id,
    recipient_profile_id,
    consent_id,
    consent_epoch
  )
  values (
    created_outbox_id,
    p_recipient_profile_id,
    target_consent.id,
    target_consent.consent_epoch
  );

  claim_result := notification_dispatcher_api.claim_notification_delivery(
    current_setting('pgtap.fa03_d1_matrix_worker')::uuid
  );

  if claim_result ->> 'kind' <> 'claimed' then
    return pg_catalog.jsonb_build_object(
      'kind', 'fixture_failed',
      'stage', 'claim',
      'result', claim_result
    );
  end if;

  prepare_result := notification_dispatcher_api.prepare_notification_delivery_send(
    current_setting('pgtap.fa03_d1_matrix_worker')::uuid,
    (claim_result ->> 'claimToken')::uuid
  );

  if prepare_result ->> 'kind' = 'ready' then
    complete_result := notification_dispatcher_api.complete_notification_delivery(
      current_setting('pgtap.fa03_d1_matrix_worker')::uuid,
      (claim_result ->> 'claimToken')::uuid,
      'accepted',
      null,
      null
    );
    prepare_result := prepare_result || pg_catalog.jsonb_build_object(
      'completionState', complete_result ->> 'state'
    );
  end if;

  return prepare_result;
end;
$$;

select is(
  concat_ws(
    ':',
    event_result ->> 'kind',
    event_result ->> 'eventType',
    event_result ->> 'completionState',
    event_result #>> '{payload,message}'
  ),
  'ready:session_reminder:accepted:球局將在約一小時後開始。',
  'session_reminder rechecks schedule state and rebuilds its payload'
)
from (
  select pg_temp.fa03_d1_prepare_matrix_event(
    'session_reminder',
    current_setting('pgtap.fa03_d1_matrix_guest')::bigint,
    session_row.id,
    'session_schedule',
    session_row.id,
    session_row.notification_schedule_version
  ) as event_result
  from public.sessions session_row
  where session_row.id =
    current_setting('pgtap.fa03_d1_matrix_fixed_session')::bigint
) result_row;

select is(
  concat_ws(
    ':',
    event_result ->> 'kind',
    event_result ->> 'eventType',
    event_result ->> 'completionState',
    event_result #>> '{payload,message}'
  ),
  'ready:decide_reminder:accepted:候選球局即將開始，請定案場地與時間。',
  'decide_reminder rechecks an undecided candidate session'
)
from (
  select pg_temp.fa03_d1_prepare_matrix_event(
    'decide_reminder',
    current_setting('pgtap.fa03_d1_matrix_host')::bigint,
    session_row.id,
    'session_schedule',
    session_row.id,
    session_row.notification_schedule_version
  ) as event_result
  from public.sessions session_row
  where session_row.id =
    current_setting('pgtap.fa03_d1_matrix_candidate_session')::bigint
) result_row;

select is(
  concat_ws(
    ':',
    event_result ->> 'kind',
    event_result ->> 'eventType',
    event_result ->> 'completionState',
    event_result #>> '{payload,message}'
  ),
  'ready:chat_message:accepted:群組有新訊息',
  'chat_message rechecks participant and block state without exposing body text'
)
from (
  select pg_temp.fa03_d1_prepare_matrix_event(
    'chat_message',
    current_setting('pgtap.fa03_d1_matrix_guest')::bigint,
    current_setting('pgtap.fa03_d1_matrix_fixed_session')::bigint,
    'session_message',
    current_setting('pgtap.fa03_d1_matrix_message')::bigint,
    1
  ) as event_result
) result_row;

select is(
  concat_ws(
    ':',
    event_result ->> 'kind',
    event_result ->> 'eventType',
    event_result ->> 'completionState',
    event_result #>> '{payload,message}'
  ),
  'ready:host_new_request:accepted:有球友直接加入你的球局。',
  'host_new_request rechecks the current participant state'
)
from (
  select pg_temp.fa03_d1_prepare_matrix_event(
    'host_new_request',
    current_setting('pgtap.fa03_d1_matrix_host')::bigint,
    current_setting('pgtap.fa03_d1_matrix_fixed_session')::bigint,
    'session_participant',
    participant_row.id,
    participant_row.notification_state_version
  ) as event_result
  from public.session_participants participant_row
  where participant_row.id =
    current_setting('pgtap.fa03_d1_matrix_fixed_guest_participant')::bigint
) result_row;

select is(
  concat_ws(
    ':',
    event_result ->> 'kind',
    event_result ->> 'eventType',
    event_result ->> 'completionState',
    event_result #>> '{payload,message}'
  ),
  'ready:guest_invited:accepted:你收到一個球局邀請。',
  'guest_invited rechecks a host-created invitation'
)
from (
  select pg_temp.fa03_d1_prepare_matrix_event(
    'guest_invited',
    current_setting('pgtap.fa03_d1_matrix_guest')::bigint,
    current_setting('pgtap.fa03_d1_matrix_invited_session')::bigint,
    'session_participant',
    participant_row.id,
    participant_row.notification_state_version
  ) as event_result
  from public.session_participants participant_row
  where participant_row.id =
    current_setting('pgtap.fa03_d1_matrix_invited_participant')::bigint
) result_row;

select is(
  concat_ws(
    ':',
    event_result ->> 'kind',
    event_result ->> 'eventType',
    event_result ->> 'completionState',
    event_result #>> '{payload,message}'
  ),
  'ready:guest_request_reviewed:accepted:你的加入申請已被接受。',
  'guest_request_reviewed rechecks the reviewed participant state'
)
from (
  select pg_temp.fa03_d1_prepare_matrix_event(
    'guest_request_reviewed',
    current_setting('pgtap.fa03_d1_matrix_guest')::bigint,
    current_setting('pgtap.fa03_d1_matrix_fixed_session')::bigint,
    'session_participant',
    participant_row.id,
    participant_row.notification_state_version
  ) as event_result
  from public.session_participants participant_row
  where participant_row.id =
    current_setting('pgtap.fa03_d1_matrix_fixed_guest_participant')::bigint
) result_row;

select is(
  concat_ws(
    ':',
    event_result ->> 'kind',
    event_result ->> 'eventType',
    event_result ->> 'completionState',
    event_result #>> '{payload,message}'
  ),
  'ready:session_updated:accepted:球局資訊已更新。',
  'session_updated rechecks current session state'
)
from (
  select pg_temp.fa03_d1_prepare_matrix_event(
    'session_updated',
    current_setting('pgtap.fa03_d1_matrix_guest')::bigint,
    session_row.id,
    'session_state',
    session_row.id,
    session_row.notification_state_version
  ) as event_result
  from public.sessions session_row
  where session_row.id =
    current_setting('pgtap.fa03_d1_matrix_fixed_session')::bigint
) result_row;

select is(
  concat_ws(
    ':',
    event_result ->> 'kind',
    event_result ->> 'eventType',
    event_result ->> 'completionState',
    event_result #>> '{payload,message}'
  ),
  'ready:court_new_session:accepted:你訂閱的球場有新球局。',
  'court_new_session rechecks subscription, block, capacity, and court state'
)
from (
  select pg_temp.fa03_d1_prepare_matrix_event(
    'court_new_session',
    current_setting('pgtap.fa03_d1_matrix_guest')::bigint,
    session_row.id,
    'session_state',
    session_row.id,
    session_row.notification_state_version
  ) as event_result
  from public.sessions session_row
  where session_row.id =
    current_setting('pgtap.fa03_d1_matrix_fixed_session')::bigint
) result_row;

update public.sessions
set decided_at = pg_catalog.clock_timestamp()
where id = current_setting('pgtap.fa03_d1_matrix_candidate_session')::bigint;

select is(
  concat_ws(
    ':',
    event_result ->> 'kind',
    event_result ->> 'eventType',
    event_result ->> 'completionState',
    event_result #>> '{payload,message}'
  ),
  'ready:session_decided:accepted:候選球局已定案。',
  'session_decided rechecks the decided session version'
)
from (
  select pg_temp.fa03_d1_prepare_matrix_event(
    'session_decided',
    current_setting('pgtap.fa03_d1_matrix_guest')::bigint,
    session_row.id,
    'session_state',
    session_row.id,
    session_row.notification_state_version
  ) as event_result
  from public.sessions session_row
  where session_row.id =
    current_setting('pgtap.fa03_d1_matrix_candidate_session')::bigint
) result_row;

update public.sessions
set status = 'cancelled'
where id = current_setting('pgtap.fa03_d1_matrix_fixed_session')::bigint;

select is(
  concat_ws(
    ':',
    event_result ->> 'kind',
    event_result ->> 'eventType',
    event_result ->> 'completionState',
    event_result #>> '{payload,message}'
  ),
  'ready:session_cancelled:accepted:球局已取消。',
  'session_cancelled rechecks the cancelled session version'
)
from (
  select pg_temp.fa03_d1_prepare_matrix_event(
    'session_cancelled',
    current_setting('pgtap.fa03_d1_matrix_guest')::bigint,
    session_row.id,
    'session_state',
    session_row.id,
    session_row.notification_state_version
  ) as event_result
  from public.sessions session_row
  where session_row.id =
    current_setting('pgtap.fa03_d1_matrix_fixed_session')::bigint
) result_row;

select is(
  (
    select pg_catalog.count(*)::bigint
    from private.notification_deliveries delivery_row
    join public.notification_outbox outbox_row
      on outbox_row.id = delivery_row.outbox_id
    where outbox_row.outbox_format_version = 2
      and delivery_row.state = 'accepted'
  ),
  10::bigint,
  'all ten supported event contracts complete exactly one accepted delivery'
);

select is(
  notification_dispatcher_api.finish_notification_dispatch_worker(
    current_setting('pgtap.fa03_d1_matrix_worker')::uuid,
    true
  ) ->> 'state',
  'completed',
  'event-matrix worker closes cleanly'
);

select * from finish();

rollback;
