-- FA-03 dormant account/device consent and endpoint owner registry. No public
-- command writes these tables until the compatible runtime batch.

create table private.push_device_consents (
  id bigint generated always as identity primary key,
  profile_id bigint not null
    references public.profiles (id) on delete cascade,
  device_id uuid not null,
  state text not null
    check (state in ('enabled', 'paused', 'revoked')),
  reason_code text not null,
  consent_epoch uuid not null default pg_catalog.gen_random_uuid(),
  version bigint not null default 1 check (version > 0),
  cleanup_token_hash_algorithm text not null
    default 'sha256-cleanup-token-32-v1'
    check (cleanup_token_hash_algorithm = 'sha256-cleanup-token-32-v1'),
  cleanup_token_hash bytea,
  cleanup_token_rotated_at timestamptz not null default statement_timestamp(),
  cleanup_token_revoked_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  state_changed_at timestamptz not null default statement_timestamp(),
  constraint push_device_consents_profile_device_key
    unique (profile_id, device_id),
  constraint push_device_consents_id_profile_key
    unique (id, profile_id),
  constraint push_device_consents_hash_length
    check (
      cleanup_token_hash is null
      or octet_length(cleanup_token_hash) = 32
    ),
  constraint push_device_consents_state_shape
    check (
      (
        state = 'enabled'
        and reason_code = 'user_enabled'
        and cleanup_token_hash is not null
        and cleanup_token_revoked_at is null
      )
      or (
        state = 'paused'
        and reason_code in (
          'user_logout',
          'cleanup_quarantine',
          'permission_revoked',
          'subscription_changed'
        )
        and cleanup_token_hash is not null
        and cleanup_token_revoked_at is null
      )
      or (
        state = 'revoked'
        and reason_code = 'user_disabled'
        and cleanup_token_hash is null
        and cleanup_token_revoked_at is not null
      )
    )
);

create unique index push_device_consents_cleanup_hash_idx
  on private.push_device_consents (cleanup_token_hash)
  where cleanup_token_hash is not null;

create index push_device_consents_profile_state_idx
  on private.push_device_consents (profile_id, state, id);

create function private.maintain_push_device_consent()
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

  if new.cleanup_token_hash_algorithm is distinct from old.cleanup_token_hash_algorithm then
    raise exception 'PUSH_CLEANUP_HASH_ALGORITHM_IMMUTABLE';
  end if;

  epoch_changed := new.consent_epoch is distinct from old.consent_epoch;
  hash_changed := new.cleanup_token_hash is distinct from old.cleanup_token_hash;

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
  semantic_changed := state_changed or epoch_changed or hash_changed;

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

create trigger push_device_consents_maintain
before insert or update on private.push_device_consents
for each row execute function private.maintain_push_device_consent();

create table private.push_endpoint_registry (
  fingerprint_algorithm text not null
    default 'sha256-endpoint-utf8-v1'
    check (fingerprint_algorithm = 'sha256-endpoint-utf8-v1'),
  endpoint_fingerprint bytea not null
    check (octet_length(endpoint_fingerprint) = 32),
  owner_profile_id bigint
    references public.profiles (id) on delete set null,
  state text not null
    check (state in ('active', 'quarantined', 'deny')),
  reason_code text not null,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz,
  updated_at timestamptz,
  state_changed_at timestamptz,
  constraint push_endpoint_registry_pkey
    primary key (fingerprint_algorithm, endpoint_fingerprint),
  constraint push_endpoint_registry_owner_key
    unique (fingerprint_algorithm, endpoint_fingerprint, owner_profile_id),
  constraint push_endpoint_registry_state_shape
    check (
      (
        state = 'active'
        and reason_code = 'transport_active'
        and owner_profile_id is not null
        and created_at is not null
        and updated_at is not null
        and state_changed_at is not null
      )
      or (
        state = 'quarantined'
        and reason_code in (
          'consent_paused',
          'consent_revoked',
          'transport_replaced',
          'provider_stale'
        )
        and owner_profile_id is not null
        and created_at is not null
        and updated_at is not null
        and state_changed_at is not null
      )
      or (
        state = 'deny'
        and reason_code = 'owner_deleted'
        and owner_profile_id is null
        and created_at is null
        and updated_at is null
        and state_changed_at is null
      )
    )
);

create index push_endpoint_registry_owner_state_idx
  on private.push_endpoint_registry (owner_profile_id, state)
  where owner_profile_id is not null;

create function private.maintain_push_endpoint_registry()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  semantic_changed boolean;
  state_changed boolean;
begin
  if tg_op = 'INSERT' then
    if new.state = 'deny' then
      raise exception 'PUSH_ENDPOINT_DENY_REQUIRES_OWNER_DELETE';
    end if;

    new.version := 1;
    new.created_at := statement_timestamp();
    new.updated_at := new.created_at;
    new.state_changed_at := new.created_at;
    return new;
  end if;

  if new.fingerprint_algorithm is distinct from old.fingerprint_algorithm
    or new.endpoint_fingerprint is distinct from old.endpoint_fingerprint then
    raise exception 'PUSH_ENDPOINT_FINGERPRINT_IMMUTABLE';
  end if;

  if old.state = 'deny' then
    raise exception 'PUSH_ENDPOINT_DENY_IMMUTABLE';
  end if;

  if old.owner_profile_id is not null and new.owner_profile_id is null then
    new.state := 'deny';
    new.reason_code := 'owner_deleted';
    new.version := old.version + 1;
    new.created_at := null;
    new.updated_at := null;
    new.state_changed_at := null;
    return new;
  end if;

  if new.owner_profile_id is distinct from old.owner_profile_id then
    raise exception 'PUSH_ENDPOINT_OWNER_TRANSFER_FORBIDDEN';
  end if;

  state_changed := new.state is distinct from old.state
    or new.reason_code is distinct from old.reason_code;
  semantic_changed := state_changed;

  new.created_at := old.created_at;

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

revoke all on function private.maintain_push_endpoint_registry()
from public, anon, authenticated, service_role;

create trigger push_endpoint_registry_maintain
before insert or update on private.push_endpoint_registry
for each row execute function private.maintain_push_endpoint_registry();

alter table private.push_device_consents enable row level security;
alter table private.push_endpoint_registry enable row level security;

revoke all on table
  private.push_device_consents,
  private.push_endpoint_registry
from public, anon, authenticated, service_role;

revoke all on sequence private.push_device_consents_id_seq
from public, anon, authenticated, service_role;
