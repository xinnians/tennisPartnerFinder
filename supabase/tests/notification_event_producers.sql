begin;
select no_plan();
create function pg_temp.run_notification_producers() returns setof text language plpgsql as $$
declare
  host_user uuid := gen_random_uuid(); guest_user uuid := gen_random_uuid();
  host_id bigint; guest_id bigint; court_id bigint; target_session_id bigint; participant_id bigint;
  result_id bigint; event_id bigint; version_id bigint; first_count bigint;
begin
  insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
  values (host_user, 'authenticated', 'authenticated', 'producer-host@example.test', '{}', '{}'),
         (guest_user, 'authenticated', 'authenticated', 'producer-guest@example.test', '{}', '{}');
  insert into public.profiles(user_id, nickname, ntrp) values(host_user,'Producer Host',3.5) returning id into host_id;
  insert into public.profiles(user_id, nickname, ntrp) values(guest_user,'Producer Guest',3.5) returning id into guest_id;
  select id into court_id from public.courts where is_active and city='台北市' order by id limit 1;
  update private.notification_runtime_control set new_runtime_mode='canary', worker_lease_duration='2 minutes',
    request_deadline_duration='10 seconds', delivery_lease_duration='30 seconds', max_delivery_attempts=3,
    push_ttl_safety_budget='1 second';
  insert into private.notification_runtime_canary_profiles(profile_id) values(host_id),(guest_id);
  insert into private.push_device_consents(profile_id,device_id,client_binding_id,transport_revision,state,reason_code,cleanup_token_hash)
  values(host_id,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'enabled','user_enabled',extensions.digest(gen_random_uuid()::text,'sha256')),
        (guest_id,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'enabled','user_enabled',extensions.digest(gen_random_uuid()::text,'sha256')),
        (guest_id,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'enabled','user_enabled',extensions.digest(gen_random_uuid()::text,'sha256'));
  insert into public.court_subscriptions(profile_id,court_id) values(guest_id,court_id);
  perform set_config('request.jwt.claim.sub',host_user::text,true);
  execute 'set local role authenticated';
  select public.create_session(court_id,'雙打',now()+interval '1 hour',3,4,3,'producer fixture','approval','booked',null,null,null) into target_session_id;
  execute 'reset role';
  select id into event_id from public.notification_outbox where notification_outbox.session_id=target_session_id and event_type='court_new_session' and outbox_format_version=2;
  return next ok(event_id is not null,'create_session emits a real v2 court event');
  return next is((select count(*) from private.notification_deliveries where outbox_id=event_id),2::bigint,'one frozen event fans out to both current devices');
  return next is((select fanout_state from public.notification_outbox where id=event_id),'frozen','fanout freezes in the event transaction');

  perform set_config('request.jwt.claim.sub',guest_user::text,true);
  execute 'set local role authenticated'; perform public.request_to_join_session(target_session_id); execute 'reset role';
  select id, notification_state_version into participant_id, version_id from public.session_participants
    where session_participants.session_id=target_session_id and profile_id=guest_id;
  return next ok(exists(select 1 from public.notification_outbox where notification_outbox.session_id=target_session_id and event_type='host_new_request' and source_id=participant_id and source_version=version_id),'join request captures the exact participant source');
  perform set_config('request.jwt.claim.sub',host_user::text,true);
  execute 'set local role authenticated'; perform public.review_join_request(target_session_id,participant_id,'accepted'); execute 'reset role';
  return next ok(exists(select 1 from public.notification_outbox o join public.session_participants p on p.id=o.source_id where o.session_id=target_session_id and event_type='guest_request_reviewed' and o.source_version=p.notification_state_version),'review captures the updated participant version');

  perform set_config('request.jwt.claim.sub',guest_user::text,true);
  execute 'set local role authenticated'; perform public.post_session_message(target_session_id,'producer chat'); execute 'reset role';
  return next ok(exists(select 1 from public.notification_outbox o join public.session_messages m on m.id=o.source_id where o.session_id=target_session_id and event_type='chat_message' and m.body='producer chat' and o.source_version=1),'chat captures the exact inserted message');
  perform private.enqueue_session_reminders();
  select count(*) into first_count from public.notification_outbox where notification_outbox.session_id=target_session_id and event_type='session_reminder' and outbox_format_version=2;
  return next is(first_count,2::bigint,'reminders target both accepted accounts');
  perform private.enqueue_session_reminders();
  return next is((select count(*) from public.notification_outbox where notification_outbox.session_id=target_session_id and event_type='session_reminder' and outbox_format_version=2),first_count,'same schedule reminder is idempotent');
  return next is((select count(*) from public.notification_outbox where notification_outbox.session_id=target_session_id and outbox_format_version=1 and recipient_profile_id in (host_id,guest_id)),0::bigint,'v2-only devices do not create legacy duplicates');

  delete from private.notification_runtime_canary_profiles where profile_id=guest_id;
  perform private.enqueue_notification('session_updated',guest_id,target_session_id,private.notification_session_payload(target_session_id,'updated'));
  return next ok(exists(select 1 from public.notification_outbox where notification_outbox.session_id=target_session_id and event_type='session_updated' and outbox_format_version=1),'accounts outside canary retain legacy events');
  return next is((select count(*) from public.notification_outbox where fanout_state='open'),0::bigint,'no open fanout can escape the producer');
end;
$$;
select * from pg_temp.run_notification_producers();
select * from finish();
rollback;
