-- FA-03 compatible transport metadata and quarantine-only commands.
-- The v2 runtime remains disabled. Legacy rows stay readable by the existing
-- dispatcher and writable through the control-aware compatibility RPCs.

alter table public.push_subscriptions
  add column consent_id bigint,
  add column endpoint_fingerprint_algorithm text,
  add column endpoint_fingerprint bytea,
  add column vapid_fingerprint_algorithm text,
  add column vapid_fingerprint bytea,
  add column transport_version bigint,
  add column updated_at timestamptz;

alter table public.push_subscriptions
  add constraint push_subscriptions_transport_shape
  check (
    (
      consent_id is null
      and endpoint_fingerprint_algorithm is null
      and endpoint_fingerprint is null
      and vapid_fingerprint_algorithm is null
      and vapid_fingerprint is null
      and transport_version is null
      and updated_at is null
    )
    or (
      consent_id is not null
      and endpoint_fingerprint_algorithm = 'sha256-endpoint-utf8-v1'
      and endpoint_fingerprint is not null
      and octet_length(endpoint_fingerprint) = 32
      and vapid_fingerprint_algorithm = 'sha256-vapid-p256-uncompressed-v1'
      and vapid_fingerprint is not null
      and octet_length(vapid_fingerprint) = 32
      and transport_version is not null
      and transport_version > 0
      and updated_at is not null
    )
  ),
  add constraint push_subscriptions_endpoint_fingerprint_exact
  check (
    consent_id is null
    or endpoint_fingerprint = pg_catalog.sha256(
      pg_catalog.convert_to(endpoint, 'UTF8')
    )
  ),
  add constraint push_subscriptions_consent_profile_fkey
  foreign key (consent_id, profile_id)
  references private.push_device_consents (id, profile_id)
  on update no action
  on delete cascade
  deferrable initially deferred,
  add constraint push_subscriptions_registry_owner_fkey
  foreign key (
    endpoint_fingerprint_algorithm,
    endpoint_fingerprint,
    profile_id
  )
  references private.push_endpoint_registry (
    fingerprint_algorithm,
    endpoint_fingerprint,
    owner_profile_id
  )
  match simple
  on update no action
  on delete restrict
  deferrable initially deferred;

create unique index push_subscriptions_consent_id_idx
  on public.push_subscriptions (consent_id)
  where consent_id is not null;

create unique index push_subscriptions_endpoint_fingerprint_idx
  on public.push_subscriptions (
    endpoint_fingerprint_algorithm,
    endpoint_fingerprint
  )
  where endpoint_fingerprint is not null;

create function private.maintain_push_subscription_transport()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  semantic_changed boolean;
  old_is_legacy boolean;
  new_is_legacy boolean;
begin
  new_is_legacy := new.consent_id is null;

  if tg_op = 'INSERT' then
    if new_is_legacy then
      new.transport_version := null;
      new.updated_at := null;
    else
      new.transport_version := 1;
      new.created_at := statement_timestamp();
      new.updated_at := new.created_at;
    end if;
    return new;
  end if;

  old_is_legacy := old.consent_id is null;

  if new.id is distinct from old.id
    or new.profile_id is distinct from old.profile_id then
    raise exception 'PUSH_TRANSPORT_IDENTITY_IMMUTABLE';
  end if;

  if new_is_legacy is distinct from old_is_legacy
    or new.consent_id is distinct from old.consent_id then
    raise exception 'PUSH_TRANSPORT_MODE_IMMUTABLE';
  end if;

  if old_is_legacy then
    new.transport_version := null;
    new.updated_at := null;
    return new;
  end if;

  semantic_changed := new.endpoint is distinct from old.endpoint
    or new.p256dh is distinct from old.p256dh
    or new.auth is distinct from old.auth
    or new.endpoint_fingerprint_algorithm
      is distinct from old.endpoint_fingerprint_algorithm
    or new.endpoint_fingerprint is distinct from old.endpoint_fingerprint
    or new.vapid_fingerprint_algorithm
      is distinct from old.vapid_fingerprint_algorithm
    or new.vapid_fingerprint is distinct from old.vapid_fingerprint;

  new.created_at := old.created_at;
  if semantic_changed then
    new.transport_version := old.transport_version + 1;
    new.updated_at := statement_timestamp();
  else
    new.transport_version := old.transport_version;
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

revoke all on function private.maintain_push_subscription_transport()
from public, anon, authenticated, service_role;

create trigger push_subscriptions_maintain_transport
before insert or update on public.push_subscriptions
for each row execute function private.maintain_push_subscription_transport();

-- Existing web clients use only these RPCs. They remain compatible while the
-- control row permits legacy writes, but cannot mutate a v2 transport.
create or replace function public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile_id bigint;
  existing_subscription record;
  legacy_writes_enabled boolean;
  normalized_endpoint text;
  normalized_endpoint_fingerprint bytea;
begin
  if p_endpoint is null or pg_catalog.btrim(p_endpoint) = ''
    or p_p256dh is null or pg_catalog.btrim(p_p256dh) = ''
    or p_auth is null or pg_catalog.btrim(p_auth) = ''
    or pg_catalog.char_length(p_endpoint) > 4096
    or pg_catalog.char_length(p_p256dh) > 1024
    or pg_catalog.char_length(p_auth) > 1024 then
    raise exception 'INVALID_PUSH_SUBSCRIPTION';
  end if;

  normalized_endpoint := pg_catalog.btrim(p_endpoint);
  normalized_endpoint_fingerprint := pg_catalog.sha256(
    pg_catalog.convert_to(normalized_endpoint, 'UTF8')
  );

  select control_row.legacy_writes_enabled
  into legacy_writes_enabled
  from private.notification_runtime_control control_row
  where control_row.singleton_id = 1
  for update;

  if not found or not legacy_writes_enabled then
    raise exception 'PUSH_CLIENT_UPGRADE_REQUIRED';
  end if;

  viewer_profile_id := private.ensure_notification_profile();

  perform 1
  from public.profiles profile_row
  where profile_row.id = viewer_profile_id
  for key share;

  perform 1
  from private.push_endpoint_registry registry_row
  where registry_row.fingerprint_algorithm = 'sha256-endpoint-utf8-v1'
    and registry_row.endpoint_fingerprint = normalized_endpoint_fingerprint
  for update;

  if found then
    raise exception 'PUSH_CLIENT_UPGRADE_REQUIRED';
  end if;

  select subscription_row.id,
         subscription_row.profile_id,
         subscription_row.consent_id
  into existing_subscription
  from public.push_subscriptions subscription_row
  where subscription_row.endpoint = normalized_endpoint
  for update;

  if found then
    if existing_subscription.profile_id <> viewer_profile_id then
      raise exception 'PUSH_ENDPOINT_OWNERSHIP';
    end if;
    if existing_subscription.consent_id is not null then
      raise exception 'PUSH_CLIENT_UPGRADE_REQUIRED';
    end if;

    update public.push_subscriptions
    set p256dh = pg_catalog.btrim(p_p256dh),
        auth = pg_catalog.btrim(p_auth),
        created_at = statement_timestamp()
    where id = existing_subscription.id;
  else
    insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
    values (
      viewer_profile_id,
      normalized_endpoint,
      pg_catalog.btrim(p_p256dh),
      pg_catalog.btrim(p_auth)
    );
  end if;

  return 'OK';
end;
$$;

create or replace function public.remove_push_subscription(p_endpoint text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile_id bigint;
  existing_subscription record;
  legacy_writes_enabled boolean;
  normalized_endpoint text;
  normalized_endpoint_fingerprint bytea;
begin
  if p_endpoint is null or pg_catalog.btrim(p_endpoint) = '' then
    raise exception 'INVALID_PUSH_SUBSCRIPTION';
  end if;

  normalized_endpoint := pg_catalog.btrim(p_endpoint);
  normalized_endpoint_fingerprint := pg_catalog.sha256(
    pg_catalog.convert_to(normalized_endpoint, 'UTF8')
  );

  select control_row.legacy_writes_enabled
  into legacy_writes_enabled
  from private.notification_runtime_control control_row
  where control_row.singleton_id = 1
  for update;

  if not found or not legacy_writes_enabled then
    raise exception 'PUSH_CLIENT_UPGRADE_REQUIRED';
  end if;

  viewer_profile_id := private.ensure_notification_profile();

  perform 1
  from public.profiles profile_row
  where profile_row.id = viewer_profile_id
  for key share;

  perform 1
  from private.push_endpoint_registry registry_row
  where registry_row.fingerprint_algorithm = 'sha256-endpoint-utf8-v1'
    and registry_row.endpoint_fingerprint = normalized_endpoint_fingerprint
  for update;

  if found then
    raise exception 'PUSH_CLIENT_UPGRADE_REQUIRED';
  end if;

  select subscription_row.id,
         subscription_row.profile_id,
         subscription_row.consent_id
  into existing_subscription
  from public.push_subscriptions subscription_row
  where subscription_row.endpoint = normalized_endpoint
  for update;

  if found
    and existing_subscription.profile_id = viewer_profile_id
    and existing_subscription.consent_id is not null then
    raise exception 'PUSH_CLIENT_UPGRADE_REQUIRED';
  end if;

  if found
    and existing_subscription.profile_id = viewer_profile_id
    and existing_subscription.consent_id is null then
    delete from public.push_subscriptions
    where id = existing_subscription.id;
  end if;

  return 'OK';
end;
$$;

revoke all on table public.push_subscriptions
from public, anon, authenticated, service_role;

grant select, delete on table public.push_subscriptions
to service_role;

revoke all on sequence public.push_subscriptions_id_seq
from public, anon, authenticated, service_role;

revoke all on function public.save_push_subscription(text, text, text)
from public, anon, authenticated, service_role;
revoke all on function public.remove_push_subscription(text)
from public, anon, authenticated, service_role;
grant execute on function public.save_push_subscription(text, text, text)
to authenticated;
grant execute on function public.remove_push_subscription(text)
to authenticated;

-- Caller must already hold the consent row lock. This helper takes the
-- remaining locks in registry -> transport -> delivery order and performs the
-- complete no-send transition in the caller's transaction.
create function private.quarantine_locked_push_consent(
  p_consent_id bigint,
  p_consent_epoch uuid,
  p_reason_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_subscription record;
begin
  if p_reason_code not in ('user_logout', 'cleanup_quarantine') then
    raise exception 'INVALID_PUSH_QUARANTINE_REASON';
  end if;

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

  update private.push_device_consents consent_row
  set state = 'paused',
      reason_code = p_reason_code
  where consent_row.id = p_consent_id
    and consent_row.consent_epoch = p_consent_epoch
    and consent_row.state = 'enabled';

  if not found then
    return;
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

revoke all on function private.quarantine_locked_push_consent(bigint, uuid, text)
from public, anon, authenticated, service_role;

create function public.quarantine_push_device(
  p_device_id uuid,
  p_consent_epoch uuid,
  p_expected_version bigint
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile_id bigint;
  target_consent record;
begin
  if p_device_id is null
    or p_consent_epoch is null
    or p_expected_version is null
    or p_expected_version <= 0 then
    raise exception 'INVALID_PUSH_DEVICE';
  end if;

  viewer_profile_id := private.viewer_profile_id();
  if viewer_profile_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  perform 1
  from public.profiles profile_row
  where profile_row.id = viewer_profile_id
  for key share;

  select consent_row.id,
         consent_row.consent_epoch,
         consent_row.version,
         consent_row.state
  into target_consent
  from private.push_device_consents consent_row
  where consent_row.profile_id = viewer_profile_id
    and consent_row.device_id = p_device_id
  for update;

  if found and target_consent.state = 'enabled' and (
    target_consent.consent_epoch <> p_consent_epoch
    or target_consent.version <> p_expected_version
  ) then
    return 'STALE_PUSH_DEVICE';
  end if;

  if found and target_consent.state = 'enabled' then
    perform private.quarantine_locked_push_consent(
      target_consent.id,
      target_consent.consent_epoch,
      'user_logout'
    );
  end if;

  return 'OK';
end;
$$;

-- The separate cleanup Edge endpoint validates the 43-character canonical
-- base64url token and hashes its decoded 32 bytes. This DB command receives
-- only the lowercase 32-byte digest, never the reusable raw token.
create function public.quarantine_push_by_token(
  p_cleanup_token_hash_hex text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_cleanup_token_hash bytea;
  target_consent record;
begin
  -- Malformed and unknown hashes get the same response and expose no state.
  if p_cleanup_token_hash_hex is null
    or pg_catalog.char_length(p_cleanup_token_hash_hex) <> 64
    or p_cleanup_token_hash_hex !~ '^[0-9a-f]{64}$' then
    return 'OK';
  end if;

  target_cleanup_token_hash := pg_catalog.decode(
    p_cleanup_token_hash_hex,
    'hex'
  );

  select consent_row.id,
         consent_row.profile_id
  into target_consent
  from private.push_device_consents consent_row
  where consent_row.cleanup_token_hash_algorithm =
      'sha256-cleanup-token-32-v1'
    and consent_row.cleanup_token_hash = target_cleanup_token_hash;

  if not found then
    return 'OK';
  end if;

  perform 1
  from public.profiles profile_row
  where profile_row.id = target_consent.profile_id
  for key share;

  if not found then
    return 'OK';
  end if;

  select consent_row.id,
         consent_row.consent_epoch,
         consent_row.state
  into target_consent
  from private.push_device_consents consent_row
  where consent_row.id = target_consent.id
    and consent_row.profile_id = target_consent.profile_id
    and consent_row.cleanup_token_hash_algorithm =
      'sha256-cleanup-token-32-v1'
    and consent_row.cleanup_token_hash = target_cleanup_token_hash
  for update;

  if found and target_consent.state = 'enabled' then
    perform private.quarantine_locked_push_consent(
      target_consent.id,
      target_consent.consent_epoch,
      'cleanup_quarantine'
    );
  end if;

  return 'OK';
end;
$$;

revoke all on function public.quarantine_push_device(uuid, uuid, bigint)
from public, anon, authenticated, service_role;
revoke all on function public.quarantine_push_by_token(text)
from public, anon, authenticated, service_role;

grant execute on function public.quarantine_push_device(uuid, uuid, bigint)
to authenticated;
grant execute on function public.quarantine_push_by_token(text)
to service_role;
