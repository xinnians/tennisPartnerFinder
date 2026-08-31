begin;

select plan(10);

select ok(
  (
    select function_row.prosecdef
      and coalesce(function_row.proconfig, '{}'::text[])
        @> array['search_path=""']::text[]
    from pg_proc function_row
    where function_row.oid = to_regprocedure(
      'private.reject_open_notification_outbox_commit()'
    )
  ),
  'the deferred outbox guard is definer-security with an empty search path'
);

select is(
  (
    select owner_role.rolname
    from pg_proc function_row
    join pg_roles owner_role on owner_role.oid = function_row.proowner
    where function_row.oid = to_regprocedure(
      'private.reject_open_notification_outbox_commit()'
    )
  ),
  'postgres',
  'the deferred outbox guard runs only as the trusted migration owner'
);

select ok(
  not has_function_privilege(
    'public',
    to_regprocedure('private.reject_open_notification_outbox_commit()'),
    'execute'
  )
    and not has_function_privilege(
      'anon',
      to_regprocedure('private.reject_open_notification_outbox_commit()'),
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      to_regprocedure('private.reject_open_notification_outbox_commit()'),
      'execute'
    )
    and not has_function_privilege(
      'service_role',
      to_regprocedure('private.reject_open_notification_outbox_commit()'),
      'execute'
    ),
  'no app or service role can execute the deferred outbox guard directly'
);

select ok(
  not has_table_privilege(
    'anon',
    'public.notification_outbox',
    'select'
  )
    and not has_table_privilege(
      'authenticated',
      'public.notification_outbox',
      'select'
    ),
  'browser roles still have no notification_outbox SELECT privilege'
);

select set_config(
  'pgtap.outbox_guard_host_user_id',
  gen_random_uuid()::text,
  true
);
select set_config(
  'pgtap.outbox_guard_recipient_user_id',
  gen_random_uuid()::text,
  true
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
    current_setting('pgtap.outbox_guard_host_user_id')::uuid,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'outbox-guard-host-' || current_setting('pgtap.outbox_guard_host_user_id') || '@example.test',
    'test',
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  ),
  (
    current_setting('pgtap.outbox_guard_recipient_user_id')::uuid,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'outbox-guard-recipient-' || current_setting('pgtap.outbox_guard_recipient_user_id') || '@example.test',
    'test',
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  );

insert into public.profiles (user_id, nickname, ntrp)
values
  (
    current_setting('pgtap.outbox_guard_host_user_id')::uuid,
    'Outbox Guard Host',
    3.5
  ),
  (
    current_setting('pgtap.outbox_guard_recipient_user_id')::uuid,
    'Outbox Guard Recipient',
    3.5
  );

select set_config(
  'pgtap.outbox_guard_host_profile_id',
  (
    select profile_row.id::text
    from public.profiles profile_row
    where profile_row.user_id =
      current_setting('pgtap.outbox_guard_host_user_id')::uuid
  ),
  true
);
select set_config(
  'pgtap.outbox_guard_recipient_profile_id',
  (
    select profile_row.id::text
    from public.profiles profile_row
    where profile_row.user_id =
      current_setting('pgtap.outbox_guard_recipient_user_id')::uuid
  ),
  true
);
select set_config(
  'pgtap.outbox_guard_court_id',
  (
    select court_row.id::text
    from public.courts court_row
    where court_row.is_active
      and court_row.city = '台北市'
    order by court_row.id
    limit 1
  ),
  true
);

insert into public.court_subscriptions (profile_id, court_id)
values (
  current_setting('pgtap.outbox_guard_recipient_profile_id')::bigint,
  current_setting('pgtap.outbox_guard_court_id')::bigint
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  current_setting('pgtap.outbox_guard_host_user_id'),
  true
);

select lives_ok(
  $$
    select set_config(
      'pgtap.outbox_guard_session_id',
      public.create_session(
        current_setting('pgtap.outbox_guard_court_id')::bigint,
        '雙打',
        now() + interval '120 days',
        3,
        4,
        2,
        '__pgtap_outbox_guard_format1__',
        'approval',
        'booked',
        null,
        null,
        null
      )::text,
      true
    )
  $$,
  'authenticated can call the existing definer notification writer'
);
select lives_ok(
  $$set constraints notification_outbox_reject_open_commit immediate$$,
  'the deferred guard accepts the writer format 1 row'
);
reset role;

select is(
  (
    select count(*)
    from public.notification_outbox outbox_row
    where outbox_row.session_id =
      current_setting('pgtap.outbox_guard_session_id')::bigint
      and outbox_row.recipient_profile_id =
        current_setting('pgtap.outbox_guard_recipient_profile_id')::bigint
      and outbox_row.event_type = 'court_new_session'
      and outbox_row.outbox_format_version = 1
  ),
  1::bigint,
  'the existing notification writer emitted exactly one format 1 row'
);

set constraints notification_outbox_reject_open_commit deferred;

-- This test-only public RPC models the same trust boundary as the existing
-- notification writers while allowing both legal format 2 states to be
-- exercised before the runtime switches its production writer to format 2.
create function public.__pgtap_write_notification_outbox_format2(
  p_session_id bigint,
  p_recipient_profile_id bigint,
  p_fanout_state text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_outbox_id bigint;
begin
  insert into public.notification_outbox (
    event_type,
    recipient_profile_id,
    session_id,
    payload,
    outbox_format_version,
    source_kind,
    source_id,
    source_version,
    expires_at,
    fanout_state,
    fanout_frozen_at,
    outcome,
    outcome_code,
    outcome_at
  )
  values (
    'session_updated',
    p_recipient_profile_id,
    p_session_id,
    private.notification_session_payload(
      p_session_id,
      '__pgtap_outbox_guard_format2__'
    ),
    2,
    'session_state',
    p_session_id,
    1,
    now() + interval '1 day',
    p_fanout_state,
    case when p_fanout_state = 'frozen' then now() end,
    case when p_fanout_state = 'frozen' then 'no_targets' end,
    case when p_fanout_state = 'frozen' then 'fanout_no_targets' end,
    case when p_fanout_state = 'frozen' then now() end
  )
  returning id into inserted_outbox_id;

  return inserted_outbox_id;
end;
$$;

revoke all on function public.__pgtap_write_notification_outbox_format2(
  bigint,
  bigint,
  text
) from public, anon, authenticated, service_role;
grant execute on function public.__pgtap_write_notification_outbox_format2(
  bigint,
  bigint,
  text
) to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  current_setting('pgtap.outbox_guard_host_user_id'),
  true
);
select set_config(
  'pgtap.outbox_guard_frozen_id',
  public.__pgtap_write_notification_outbox_format2(
    current_setting('pgtap.outbox_guard_session_id')::bigint,
    current_setting('pgtap.outbox_guard_host_profile_id')::bigint,
    'frozen'
  )::text,
  true
);
select lives_ok(
  $$set constraints notification_outbox_reject_open_commit immediate$$,
  'the deferred guard accepts a frozen format 2 row written through a definer RPC'
);
reset role;

select is(
  (
    select outbox_row.fanout_state
    from public.notification_outbox outbox_row
    where outbox_row.id =
      current_setting('pgtap.outbox_guard_frozen_id')::bigint
  ),
  'frozen',
  'the accepted format 2 row remains frozen'
);

set constraints notification_outbox_reject_open_commit deferred;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  current_setting('pgtap.outbox_guard_host_user_id'),
  true
);
select public.__pgtap_write_notification_outbox_format2(
  current_setting('pgtap.outbox_guard_session_id')::bigint,
  current_setting('pgtap.outbox_guard_recipient_profile_id')::bigint,
  'open'
);
select throws_ok(
  $$set constraints notification_outbox_reject_open_commit immediate$$,
  '23514',
  'NOTIFICATION_OUTBOX_FANOUT_OPEN',
  'the deferred guard rejects an open format 2 row with its contract error'
);
reset role;

select * from finish();

rollback;
