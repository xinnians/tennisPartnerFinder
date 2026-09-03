-- FA-03A4 dormant Push v2 database commands. The runtime gate remains
-- disabled, so these commands cannot create a v2 transport until a later
-- dispatcher-barrier migration explicitly enables the new runtime.

do $$
begin
  if exists (select 1 from private.push_device_consents) then
    raise exception 'PUSH_V2_CONSENT_TABLE_MUST_BE_EMPTY';
  end if;
end;
$$;

alter table private.push_device_consents
  add column client_binding_id uuid not null,
  add column transport_revision uuid;

create or replace function private.maintain_push_device_consent()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  semantic_changed boolean;
  state_changed boolean;
  epoch_changed boolean;
  hash_changed boolean;
  transport_changed boolean;
begin
  if tg_op = 'INSERT' then
    if new.state <> 'enabled' then
      raise exception 'PUSH_CONSENT_MUST_START_ENABLED';
    end if;

    new.consent_epoch := pg_catalog.gen_random_uuid();
    new.version := 1;
    new.cleanup_token_rotated_at := statement_timestamp();
    new.cleanup_token_revoked_at := null;
    new.created_at := statement_timestamp();
    new.updated_at := new.created_at;
    new.state_changed_at := new.created_at;
    return new;
  end if;

  if new.profile_id is distinct from old.profile_id
    or new.device_id is distinct from old.device_id then
    raise exception 'PUSH_CONSENT_IDENTITY_IMMUTABLE';
  end if;

  if new.client_binding_id is distinct from old.client_binding_id
    and not (old.state <> 'enabled' and new.state = 'enabled') then
    raise exception 'PUSH_CONSENT_BINDING_IMMUTABLE';
  end if;

  if new.cleanup_token_hash_algorithm is distinct from old.cleanup_token_hash_algorithm then
    raise exception 'PUSH_CLEANUP_HASH_ALGORITHM_IMMUTABLE';
  end if;

  epoch_changed := new.consent_epoch is distinct from old.consent_epoch;
  hash_changed := new.cleanup_token_hash is distinct from old.cleanup_token_hash;
  transport_changed := new.transport_revision is distinct from old.transport_revision;

  if new.state = 'paused'
    and (epoch_changed or hash_changed) then
    raise exception 'PUSH_PAUSE_CANNOT_ROTATE_CONSENT';
  end if;

  if new.state = 'revoked' then
    if epoch_changed or new.cleanup_token_hash is not null then
      raise exception 'PUSH_REVOKE_CANNOT_ROTATE_CONSENT';
    end if;
  elsif new.state = 'enabled' then
    if old.state <> 'enabled' and not hash_changed then
      raise exception 'PUSH_REENABLE_MUST_ROTATE_CONSENT';
    end if;

    if old.state = 'enabled' and (epoch_changed or hash_changed) then
      raise exception 'PUSH_ENABLED_CONSENT_CANNOT_ROTATE';
    end if;

    if old.state <> 'enabled' then
      new.consent_epoch := pg_catalog.gen_random_uuid();
      epoch_changed := true;
    else
      new.consent_epoch := old.consent_epoch;
      epoch_changed := false;
    end if;
  end if;

  if old.state = 'revoked' and new.state = 'paused' then
    raise exception 'PUSH_REVOKED_CONSENT_CANNOT_PAUSE';
  end if;

  state_changed := new.state is distinct from old.state
    or new.reason_code is distinct from old.reason_code;
  semantic_changed := state_changed
    or epoch_changed
    or hash_changed
    or transport_changed;

  new.created_at := old.created_at;

  if hash_changed and new.cleanup_token_hash is not null then
    new.cleanup_token_rotated_at := statement_timestamp();
  else
    new.cleanup_token_rotated_at := old.cleanup_token_rotated_at;
  end if;

  if new.state = 'revoked' then
    if old.state = 'revoked' then
      new.cleanup_token_revoked_at := old.cleanup_token_revoked_at;
    else
      new.cleanup_token_revoked_at := statement_timestamp();
    end if;
  else
    new.cleanup_token_revoked_at := null;
  end if;

  if semantic_changed then
    new.version := old.version + 1;
    new.updated_at := statement_timestamp();
  else
    new.version := old.version;
    new.updated_at := old.updated_at;
  end if;

  if state_changed then
    new.state_changed_at := statement_timestamp();
  else
    new.state_changed_at := old.state_changed_at;
  end if;

  return new;
end;
$$;

revoke all on function private.maintain_push_device_consent()
from public, anon, authenticated, service_role;

-- Caller must already hold the consent row lock. This helper never changes
-- consent state. It takes only registry, transport, and delivery locks, in
-- that order, and owns the single implementation of residual cleanup.
create function private.clear_locked_push_consent_residue(
  p_consent_id bigint,
  p_consent_epoch uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_subscription record;
begin
  select
    subscription_row.id,
    subscription_row.profile_id,
    subscription_row.endpoint_fingerprint_algorithm,
    subscription_row.endpoint_fingerprint
  into active_subscription
  from public.push_subscriptions subscription_row
  where subscription_row.consent_id = p_consent_id;

  if found then
    perform 1
    from private.push_endpoint_registry registry_row
    where registry_row.fingerprint_algorithm =
        active_subscription.endpoint_fingerprint_algorithm
      and registry_row.endpoint_fingerprint =
        active_subscription.endpoint_fingerprint
      and registry_row.owner_profile_id = active_subscription.profile_id
    for update;

    perform 1
    from public.push_subscriptions subscription_row
    where subscription_row.id = active_subscription.id
      and subscription_row.consent_id = p_consent_id
    for update;
  end if;

  if active_subscription.id is not null then
    update private.push_endpoint_registry registry_row
    set state = 'quarantined',
        reason_code = 'consent_paused'
    where registry_row.fingerprint_algorithm =
        active_subscription.endpoint_fingerprint_algorithm
      and registry_row.endpoint_fingerprint =
        active_subscription.endpoint_fingerprint
      and registry_row.owner_profile_id = active_subscription.profile_id
      and registry_row.state = 'active';

    delete from public.push_subscriptions subscription_row
    where subscription_row.id = active_subscription.id
      and subscription_row.consent_id = p_consent_id;
  end if;

  perform 1
  from private.notification_deliveries delivery_row
  where delivery_row.consent_id = p_consent_id
    and delivery_row.consent_epoch = p_consent_epoch
    and delivery_row.state in ('pending', 'processing', 'unknown')
  order by delivery_row.id
  for update;

  update private.notification_deliveries delivery_row
  set state = 'cancelled',
      claim_token = null,
      lease_until = null,
      next_attempt_at = null,
      error_code = 'consent_inactive'
  where delivery_row.consent_id = p_consent_id
    and delivery_row.consent_epoch = p_consent_epoch
    and delivery_row.state in ('pending', 'processing', 'unknown');
end;
$$;

revoke all on function private.clear_locked_push_consent_residue(bigint, uuid)
from public, anon, authenticated, service_role;

create or replace function private.quarantine_locked_push_consent(
  p_consent_id bigint,
  p_consent_epoch uuid,
  p_reason_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_reason_code not in (
    'user_logout',
    'cleanup_quarantine',
    'subscription_changed'
  ) then
    raise exception 'INVALID_PUSH_QUARANTINE_REASON';
  end if;

  update private.push_device_consents consent_row
  set state = 'paused',
      reason_code = p_reason_code
  where consent_row.id = p_consent_id
    and consent_row.consent_epoch = p_consent_epoch
    and consent_row.state = 'enabled';

  if not found then
    return;
  end if;

  perform private.clear_locked_push_consent_residue(
    p_consent_id,
    p_consent_epoch
  );
end;
$$;

revoke all on function private.quarantine_locked_push_consent(bigint, uuid, text)
from public, anon, authenticated, service_role;

-- Both public commands delegate to this one mutation boundary. All scalar
-- values were already structurally validated by the future Edge adapter, but
-- this function repeats the storage-critical checks before taking locks.
create function private.mutate_push_transport_v2(
  p_kind text,
  p_auth_user_id uuid,
  p_device_id uuid,
  p_client_binding_id uuid,
  p_cleanup_token_hash_hex text,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_vapid_fingerprint_hex text,
  p_reference_consent_id_text text,
  p_reference_consent_epoch uuid,
  p_reference_consent_version_text text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  runtime_mode text;
  target_profile_id bigint;
  target_consent_id bigint;
  endpoint_consent_id bigint;
  endpoint_profile_id bigint;
  target_consent record;
  endpoint_consent record;
  target_transport record;
  endpoint_transport record;
  legacy_transport record;
  target_registry record;
  reference_consent_id bigint;
  reference_consent_version bigint;
  target_cleanup_token_hash bytea;
  target_endpoint_fingerprint bytea;
  target_vapid_fingerprint bytea;
  target_was_inserted boolean := false;
  reference_present boolean;
  semantics_equal boolean;
begin
  if p_kind not in ('enable', 'refresh')
    or p_auth_user_id is null
    or p_device_id is null
    or p_client_binding_id is null
    or p_endpoint is null
    or p_endpoint = ''
    or pg_catalog.octet_length(p_endpoint) > 4096
    or pg_catalog.char_length(p_endpoint) > 4096
    or p_p256dh is null
    or p_p256dh = ''
    or pg_catalog.char_length(p_p256dh) > 1024
    or p_auth is null
    or p_auth = ''
    or pg_catalog.char_length(p_auth) > 1024
    or p_vapid_fingerprint_hex is null
    or pg_catalog.char_length(p_vapid_fingerprint_hex) <> 64
    or p_vapid_fingerprint_hex !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'PZ001', message = 'PUSH_V2_INVALID';
  end if;

  reference_present := p_reference_consent_id_text is not null
    or p_reference_consent_epoch is not null
    or p_reference_consent_version_text is not null;

  if reference_present and (
    p_reference_consent_id_text is null
    or p_reference_consent_epoch is null
    or p_reference_consent_version_text is null
  ) then
    raise exception using errcode = 'PZ001', message = 'PUSH_V2_INVALID';
  end if;

  if p_kind = 'enable' then
    if p_cleanup_token_hash_hex is null
      or pg_catalog.char_length(p_cleanup_token_hash_hex) <> 64
      or p_cleanup_token_hash_hex !~ '^[0-9a-f]{64}$' then
      raise exception using errcode = 'PZ001', message = 'PUSH_V2_INVALID';
    end if;
  elsif p_cleanup_token_hash_hex is not null or not reference_present then
    raise exception using errcode = 'PZ001', message = 'PUSH_V2_INVALID';
  end if;

  if reference_present and (
    p_reference_consent_id_text !~ '^[1-9][0-9]*$'
    or p_reference_consent_version_text !~ '^[1-9][0-9]*$'
  ) then
    raise exception using errcode = 'PZ001', message = 'PUSH_V2_INVALID';
  end if;

  begin
    if reference_present then
      reference_consent_id := p_reference_consent_id_text::bigint;
      reference_consent_version := p_reference_consent_version_text::bigint;
    end if;
  exception
    when numeric_value_out_of_range then
      raise exception using errcode = 'PZ001', message = 'PUSH_V2_INVALID';
  end;

  if p_kind = 'enable' then
    target_cleanup_token_hash := pg_catalog.decode(
      p_cleanup_token_hash_hex,
      'hex'
    );
  end if;
  target_endpoint_fingerprint := pg_catalog.sha256(
    pg_catalog.convert_to(p_endpoint, 'UTF8')
  );
  target_vapid_fingerprint := pg_catalog.decode(
    p_vapid_fingerprint_hex,
    'hex'
  );

  select control_row.new_runtime_mode
  into runtime_mode
  from private.notification_runtime_control control_row
  where control_row.singleton_id = 1
  for share;

  if not found or runtime_mode = 'disabled' then
    raise exception using errcode = 'PZ004', message = 'PUSH_V2_RUNTIME_DISABLED';
  end if;

  select profile_row.id
  into target_profile_id
  from public.profiles profile_row
  where profile_row.user_id = p_auth_user_id
  for key share;

  if target_profile_id is null then
    if runtime_mode = 'canary' then
      raise exception using errcode = 'PZ004', message = 'PUSH_V2_RUNTIME_DISABLED';
    end if;
    raise exception using errcode = 'PZ002', message = 'PUSH_V2_STALE';
  end if;

  if runtime_mode = 'canary' and not exists (
    select 1
    from private.notification_runtime_canary_profiles canary_row
    where canary_row.profile_id = target_profile_id
  ) then
    raise exception using errcode = 'PZ004', message = 'PUSH_V2_RUNTIME_DISABLED';
  end if;

  select consent_row.id
  into target_consent_id
  from private.push_device_consents consent_row
  where consent_row.profile_id = target_profile_id
    and consent_row.device_id = p_device_id;

  select subscription_row.consent_id,
         subscription_row.profile_id
  into endpoint_consent_id,
       endpoint_profile_id
  from public.push_subscriptions subscription_row
  where subscription_row.endpoint_fingerprint_algorithm =
      'sha256-endpoint-utf8-v1'
    and subscription_row.endpoint_fingerprint = target_endpoint_fingerprint;

  -- Every existing consent that this invocation can mutate is locked in
  -- ascending ID order before any registry or transport lock is taken.
  perform 1
  from private.push_device_consents consent_row
  where consent_row.id = target_consent_id
    or (
      endpoint_profile_id = target_profile_id
      and consent_row.id = endpoint_consent_id
    )
  order by consent_row.id
  for update;

  select consent_row.*
  into target_consent
  from private.push_device_consents consent_row
  where consent_row.profile_id = target_profile_id
    and consent_row.device_id = p_device_id;

  if not found then
    if p_kind = 'refresh' or reference_present then
      raise exception using errcode = 'PZ002', message = 'PUSH_V2_STALE';
    end if;

    insert into private.push_device_consents (
      profile_id,
      device_id,
      client_binding_id,
      state,
      reason_code,
      cleanup_token_hash,
      transport_revision
    )
    values (
      target_profile_id,
      p_device_id,
      p_client_binding_id,
      'enabled',
      'user_enabled',
      target_cleanup_token_hash,
      pg_catalog.gen_random_uuid()
    )
    returning * into target_consent;
    target_consent_id := target_consent.id;
    target_was_inserted := true;
  else
    target_consent_id := target_consent.id;
  end if;

  select subscription_row.*
  into target_transport
  from public.push_subscriptions subscription_row
  where subscription_row.consent_id = target_consent_id;

  select subscription_row.*
  into endpoint_transport
  from public.push_subscriptions subscription_row
  where subscription_row.endpoint_fingerprint_algorithm =
      'sha256-endpoint-utf8-v1'
    and subscription_row.endpoint_fingerprint = target_endpoint_fingerprint;

  -- A missing target registry is inserted before any registry row lock. The
  -- unique key serializes a concurrent insert; the enclosing public wrapper
  -- rolls this write back when the final result is stale or conflicting.
  insert into private.push_endpoint_registry (
    endpoint_fingerprint,
    owner_profile_id,
    state,
    reason_code
  )
  values (
    target_endpoint_fingerprint,
    target_profile_id,
    'active',
    'transport_active'
  )
  on conflict (fingerprint_algorithm, endpoint_fingerprint) do nothing;

  perform 1
  from private.push_endpoint_registry registry_row
  where registry_row.endpoint_fingerprint = target_endpoint_fingerprint
    or registry_row.endpoint_fingerprint = target_transport.endpoint_fingerprint
    or registry_row.endpoint_fingerprint = endpoint_transport.endpoint_fingerprint
  order by registry_row.endpoint_fingerprint
  for update;

  select registry_row.*
  into target_registry
  from private.push_endpoint_registry registry_row
  where registry_row.fingerprint_algorithm = 'sha256-endpoint-utf8-v1'
    and registry_row.endpoint_fingerprint = target_endpoint_fingerprint;

  if not found
    or target_registry.owner_profile_id is distinct from target_profile_id
    or target_registry.state = 'deny' then
    raise exception using errcode = 'PZ003', message = 'PUSH_V2_ENDPOINT_UNAVAILABLE';
  end if;

  perform 1
  from public.push_subscriptions subscription_row
  where subscription_row.consent_id = target_consent_id
    or subscription_row.consent_id = endpoint_consent_id
    or subscription_row.endpoint = p_endpoint
  order by subscription_row.id
  for update;

  select subscription_row.*
  into target_transport
  from public.push_subscriptions subscription_row
  where subscription_row.consent_id = target_consent_id;

  select subscription_row.*
  into endpoint_transport
  from public.push_subscriptions subscription_row
  where subscription_row.endpoint_fingerprint_algorithm =
      'sha256-endpoint-utf8-v1'
    and subscription_row.endpoint_fingerprint = target_endpoint_fingerprint;

  select subscription_row.*
  into legacy_transport
  from public.push_subscriptions subscription_row
  where subscription_row.endpoint = p_endpoint
    and subscription_row.consent_id is null;

  if legacy_transport.id is not null then
    if p_kind <> 'enable'
      or legacy_transport.profile_id is distinct from target_profile_id then
      raise exception using errcode = 'PZ003', message = 'PUSH_V2_ENDPOINT_UNAVAILABLE';
    end if;
  end if;

  if endpoint_transport.id is not null
    and endpoint_transport.consent_id is distinct from target_consent_id then
    if endpoint_transport.profile_id is distinct from target_profile_id
      or p_kind <> 'enable' then
      raise exception using errcode = 'PZ003', message = 'PUSH_V2_ENDPOINT_UNAVAILABLE';
    end if;

    select consent_row.*
    into endpoint_consent
    from private.push_device_consents consent_row
    where consent_row.id = endpoint_transport.consent_id
      and consent_row.profile_id = target_profile_id;

    if not found or endpoint_consent.id is distinct from endpoint_consent_id then
      raise exception using errcode = 'PZ004', message = 'PUSH_V2_RUNTIME_DISABLED';
    end if;

    if endpoint_consent.state = 'enabled' then
      perform private.quarantine_locked_push_consent(
        endpoint_consent.id,
        endpoint_consent.consent_epoch,
        'subscription_changed'
      );
    else
      perform private.clear_locked_push_consent_residue(
        endpoint_consent.id,
        endpoint_consent.consent_epoch
      );
    end if;
  end if;

  if p_kind = 'enable' and not target_was_inserted then
    if target_consent.client_binding_id = p_client_binding_id then
      if target_consent.state <> 'enabled' then
        raise exception using errcode = 'PZ002', message = 'PUSH_V2_STALE';
      end if;

      if target_consent.cleanup_token_hash is distinct from target_cleanup_token_hash then
        raise exception using errcode = 'PZ002', message = 'PUSH_V2_STALE';
      end if;

      if target_transport.id is not null then
        semantics_equal := target_consent.cleanup_token_hash = target_cleanup_token_hash
          and target_transport.endpoint_fingerprint = target_endpoint_fingerprint
          and target_transport.p256dh = p_p256dh
          and target_transport.auth = p_auth
          and target_transport.vapid_fingerprint = target_vapid_fingerprint;

        if not semantics_equal then
          raise exception using errcode = 'PZ002', message = 'PUSH_V2_STALE';
        end if;
      else
        update private.push_device_consents consent_row
        set transport_revision = pg_catalog.gen_random_uuid()
        where consent_row.id = target_consent.id
        returning * into target_consent;
      end if;
    else
      if reference_present and not (
        (
          target_consent.id = reference_consent_id
          and target_consent.consent_epoch = p_reference_consent_epoch
          and target_consent.version = reference_consent_version
          and target_consent.state = 'enabled'
        )
        or (
          target_consent.id = reference_consent_id
          and target_consent.consent_epoch = p_reference_consent_epoch
          and target_consent.version > 1
          and target_consent.version - 1 = reference_consent_version
          and target_consent.state = 'paused'
          and target_consent.reason_code = 'cleanup_quarantine'
        )
      ) then
        raise exception using errcode = 'PZ002', message = 'PUSH_V2_STALE';
      end if;

      if target_consent.state = 'enabled' then
        perform private.quarantine_locked_push_consent(
          target_consent.id,
          target_consent.consent_epoch,
          'subscription_changed'
        );
      elsif not (
        reference_present
        and target_consent.state = 'paused'
        and target_consent.reason_code = 'cleanup_quarantine'
        and target_consent.id = reference_consent_id
        and target_consent.consent_epoch = p_reference_consent_epoch
        and target_consent.version > 1
        and target_consent.version - 1 = reference_consent_version
      ) then
        perform private.clear_locked_push_consent_residue(
          target_consent.id,
          target_consent.consent_epoch
        );
      end if;

      update private.push_device_consents consent_row
      set state = 'enabled',
          reason_code = 'user_enabled',
          client_binding_id = p_client_binding_id,
          cleanup_token_hash = target_cleanup_token_hash,
          transport_revision = pg_catalog.gen_random_uuid()
      where consent_row.id = target_consent.id
      returning * into target_consent;
    end if;
  elsif p_kind = 'refresh' then
    if target_consent.id <> reference_consent_id
      or target_consent.consent_epoch <> p_reference_consent_epoch
      or target_consent.version <> reference_consent_version
      or target_consent.client_binding_id <> p_client_binding_id
      or target_consent.state <> 'enabled'
      or target_transport.id is null then
      raise exception using errcode = 'PZ002', message = 'PUSH_V2_STALE';
    end if;

    semantics_equal := target_transport.endpoint_fingerprint = target_endpoint_fingerprint
      and target_transport.p256dh = p_p256dh
      and target_transport.auth = p_auth
      and target_transport.vapid_fingerprint = target_vapid_fingerprint;

    if not semantics_equal then
      if target_transport.endpoint_fingerprint is distinct from target_endpoint_fingerprint then
        update private.push_endpoint_registry registry_row
        set state = 'quarantined',
            reason_code = 'transport_replaced'
        where registry_row.fingerprint_algorithm =
            target_transport.endpoint_fingerprint_algorithm
          and registry_row.endpoint_fingerprint =
            target_transport.endpoint_fingerprint
          and registry_row.owner_profile_id = target_profile_id
          and registry_row.state = 'active';
      end if;

      update public.push_subscriptions subscription_row
      set endpoint = p_endpoint,
          p256dh = p_p256dh,
          auth = p_auth,
          endpoint_fingerprint_algorithm = 'sha256-endpoint-utf8-v1',
          endpoint_fingerprint = target_endpoint_fingerprint,
          vapid_fingerprint_algorithm =
            'sha256-vapid-p256-uncompressed-v1',
          vapid_fingerprint = target_vapid_fingerprint
      where subscription_row.id = target_transport.id
        and subscription_row.consent_id = target_consent.id;

      update private.push_device_consents consent_row
      set transport_revision = pg_catalog.gen_random_uuid()
      where consent_row.id = target_consent.id
      returning * into target_consent;
    end if;
  end if;

  if legacy_transport.id is not null then
    delete from public.push_subscriptions subscription_row
    where subscription_row.id = legacy_transport.id
      and subscription_row.profile_id = target_profile_id
      and subscription_row.consent_id is null;
  end if;

  update private.push_endpoint_registry registry_row
  set state = 'active',
      reason_code = 'transport_active'
  where registry_row.fingerprint_algorithm = 'sha256-endpoint-utf8-v1'
    and registry_row.endpoint_fingerprint = target_endpoint_fingerprint
    and registry_row.owner_profile_id = target_profile_id
    and registry_row.state = 'quarantined';

  if p_kind = 'enable' and (
    target_was_inserted
    or target_transport.id is null
    or target_consent.client_binding_id = p_client_binding_id
  ) and not exists (
    select 1
    from public.push_subscriptions subscription_row
    where subscription_row.consent_id = target_consent.id
  ) then
    insert into public.push_subscriptions (
      profile_id,
      endpoint,
      p256dh,
      auth,
      consent_id,
      endpoint_fingerprint_algorithm,
      endpoint_fingerprint,
      vapid_fingerprint_algorithm,
      vapid_fingerprint
    )
    values (
      target_profile_id,
      p_endpoint,
      p_p256dh,
      p_auth,
      target_consent.id,
      'sha256-endpoint-utf8-v1',
      target_endpoint_fingerprint,
      'sha256-vapid-p256-uncompressed-v1',
      target_vapid_fingerprint
    );
  end if;

  select consent_row.*
  into target_consent
  from private.push_device_consents consent_row
  where consent_row.id = target_consent.id;

  return pg_catalog.jsonb_build_object(
    'bindingId', target_consent.client_binding_id::text,
    'consentEpoch', target_consent.consent_epoch::text,
    'consentId', target_consent.id::text,
    'consentVersion', target_consent.version::text,
    'kind', 'committed',
    'version', 1
  );
end;
$$;

revoke all on function private.mutate_push_transport_v2(
  text, uuid, uuid, uuid, text, text, text, text, text, text, uuid, text
)
from public, anon, authenticated, service_role;

create function public.enable_push_device_v2(
  p_auth_user_id uuid,
  p_device_id uuid,
  p_client_binding_id uuid,
  p_cleanup_token_hash_hex text,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_vapid_fingerprint_hex text,
  p_predecessor_consent_id text default null,
  p_predecessor_consent_epoch uuid default null,
  p_predecessor_consent_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.mutate_push_transport_v2(
    'enable',
    p_auth_user_id,
    p_device_id,
    p_client_binding_id,
    p_cleanup_token_hash_hex,
    p_endpoint,
    p_p256dh,
    p_auth,
    p_vapid_fingerprint_hex,
    p_predecessor_consent_id,
    p_predecessor_consent_epoch,
    p_predecessor_consent_version
  );
exception
  when sqlstate 'PZ001' then
    return '{"kind":"invalid","version":1}'::jsonb;
  when sqlstate 'PZ002' then
    return '{"kind":"stale","version":1}'::jsonb;
  when sqlstate 'PZ003' then
    return '{"kind":"endpoint-unavailable","version":1}'::jsonb;
  when sqlstate 'PZ004' then
    return '{"kind":"runtime-disabled","version":1}'::jsonb;
  when others then
    return '{"kind":"unavailable","version":1}'::jsonb;
end;
$$;

create function public.refresh_push_transport_v2(
  p_auth_user_id uuid,
  p_device_id uuid,
  p_client_binding_id uuid,
  p_expected_consent_id text,
  p_expected_consent_epoch uuid,
  p_expected_consent_version text,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_vapid_fingerprint_hex text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.mutate_push_transport_v2(
    'refresh',
    p_auth_user_id,
    p_device_id,
    p_client_binding_id,
    null,
    p_endpoint,
    p_p256dh,
    p_auth,
    p_vapid_fingerprint_hex,
    p_expected_consent_id,
    p_expected_consent_epoch,
    p_expected_consent_version
  );
exception
  when sqlstate 'PZ001' then
    return '{"kind":"invalid","version":1}'::jsonb;
  when sqlstate 'PZ002' then
    return '{"kind":"stale","version":1}'::jsonb;
  when sqlstate 'PZ003' then
    return '{"kind":"endpoint-unavailable","version":1}'::jsonb;
  when sqlstate 'PZ004' then
    return '{"kind":"runtime-disabled","version":1}'::jsonb;
  when others then
    return '{"kind":"unavailable","version":1}'::jsonb;
end;
$$;

revoke all on function public.enable_push_device_v2(
  uuid, uuid, uuid, text, text, text, text, text, text, uuid, text
)
from public, anon, authenticated, service_role;
revoke all on function public.refresh_push_transport_v2(
  uuid, uuid, uuid, text, uuid, text, text, text, text, text
)
from public, anon, authenticated, service_role;

grant execute on function public.enable_push_device_v2(
  uuid, uuid, uuid, text, text, text, text, text, text, uuid, text
)
to service_role;
grant execute on function public.refresh_push_transport_v2(
  uuid, uuid, uuid, text, uuid, text, text, text, text, text
)
to service_role;
