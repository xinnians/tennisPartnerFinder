-- FA-03 dormant per-device delivery ledger. Runtime commands are added later;
-- this migration only establishes fail-closed storage and ownership links.

create table private.notification_deliveries (
  id bigint generated always as identity primary key,
  outbox_id bigint not null,
  recipient_profile_id bigint not null,
  consent_id bigint not null,
  consent_epoch uuid not null,
  notification_id uuid not null default pg_catalog.gen_random_uuid() unique,
  state text not null default 'pending'
    check (state in (
      'pending',
      'processing',
      'unknown',
      'accepted',
      'cancelled',
      'failed'
    )),
  attempts integer not null default 0 check (attempts >= 0),
  claim_token uuid,
  claimed_at timestamptz,
  lease_until timestamptz,
  next_attempt_at timestamptz,
  error_code text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  state_changed_at timestamptz not null default statement_timestamp(),
  constraint notification_deliveries_event_consent_epoch_key
    unique (outbox_id, consent_id, consent_epoch),
  constraint notification_deliveries_outbox_recipient_fkey
    foreign key (outbox_id, recipient_profile_id)
    references public.notification_outbox (id, recipient_profile_id)
    on delete cascade,
  constraint notification_deliveries_consent_recipient_fkey
    foreign key (consent_id, recipient_profile_id)
    references private.push_device_consents (id, profile_id)
    on delete no action
    deferrable initially deferred,
  constraint notification_deliveries_timestamp_order
    check (
      updated_at >= created_at
      and state_changed_at >= created_at
    ),
  constraint notification_deliveries_state_shape
    check (
      (
        state = 'pending'
        and claim_token is null
        and lease_until is null
        and (
          (
            error_code is null
            and next_attempt_at is null
            and attempts = 0
            and claimed_at is null
          )
          or (
            error_code in ('provider_rate_limited', 'provider_transient')
            and next_attempt_at is not null
            and attempts > 0
            and claimed_at is not null
          )
        )
      )
      or (
        state = 'processing'
        and claim_token is not null
        and claimed_at is not null
        and lease_until is not null
        and lease_until > claimed_at
        and next_attempt_at is null
        and error_code is null
        and attempts > 0
      )
      or (
        state = 'unknown'
        and claim_token is null
        and claimed_at is not null
        and lease_until is null
        and next_attempt_at is not null
        and error_code = 'adapter_outcome_unknown'
        and attempts > 0
      )
      or (
        state = 'accepted'
        and claim_token is null
        and claimed_at is not null
        and lease_until is null
        and next_attempt_at is null
        and error_code is null
        and attempts > 0
      )
      or (
        state = 'cancelled'
        and claim_token is null
        and lease_until is null
        and next_attempt_at is null
        and error_code in (
          'event_expired',
          'consent_inactive',
          'consent_epoch_changed',
          'source_invalid',
          'recipient_ineligible',
          'transport_unavailable',
          'provider_endpoint_inactive'
        )
      )
      or (
        state = 'failed'
        and claim_token is null
        and claimed_at is not null
        and lease_until is null
        and next_attempt_at is null
        and error_code in (
          'payload_invalid',
          'attempts_exhausted',
          'provider_permanent'
        )
        and attempts > 0
      )
    )
);

create function private.maintain_notification_delivery()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  semantic_changed boolean;
begin
  if tg_op = 'INSERT' then
    if new.state <> 'pending'
      or new.attempts <> 0
      or new.claim_token is not null
      or new.claimed_at is not null
      or new.lease_until is not null
      or new.next_attempt_at is not null
      or new.error_code is not null then
      raise exception 'NOTIFICATION_DELIVERY_MUST_START_PENDING';
    end if;

    new.notification_id := pg_catalog.gen_random_uuid();
    new.created_at := statement_timestamp();
    new.updated_at := new.created_at;
    new.state_changed_at := new.created_at;
    return new;
  end if;

  if new.outbox_id is distinct from old.outbox_id
    or new.recipient_profile_id is distinct from old.recipient_profile_id
    or new.consent_id is distinct from old.consent_id
    or new.consent_epoch is distinct from old.consent_epoch
    or new.notification_id is distinct from old.notification_id then
    raise exception 'NOTIFICATION_DELIVERY_IDENTITY_IMMUTABLE';
  end if;

  semantic_changed := new.state is distinct from old.state
    or new.attempts is distinct from old.attempts
    or new.claim_token is distinct from old.claim_token
    or new.claimed_at is distinct from old.claimed_at
    or new.lease_until is distinct from old.lease_until
    or new.next_attempt_at is distinct from old.next_attempt_at
    or new.error_code is distinct from old.error_code;

  if old.state in ('accepted', 'cancelled', 'failed') and semantic_changed then
    raise exception 'NOTIFICATION_DELIVERY_TERMINAL';
  end if;

  new.created_at := old.created_at;

  if semantic_changed then
    new.updated_at := statement_timestamp();
  else
    new.updated_at := old.updated_at;
  end if;

  if new.state is distinct from old.state then
    new.state_changed_at := statement_timestamp();
  else
    new.state_changed_at := old.state_changed_at;
  end if;

  return new;
end;
$$;

revoke all on function private.maintain_notification_delivery()
from public, anon, authenticated, service_role;

create trigger notification_deliveries_maintain
before insert or update on private.notification_deliveries
for each row execute function private.maintain_notification_delivery();

create unique index notification_deliveries_claim_token_idx
  on private.notification_deliveries (claim_token)
  where claim_token is not null;

create index notification_deliveries_claimable_idx
  on private.notification_deliveries (state, next_attempt_at, created_at, id)
  where state in ('pending', 'unknown');

create index notification_deliveries_consent_nonterminal_idx
  on private.notification_deliveries (consent_id, consent_epoch, state, id)
  where state in ('pending', 'processing', 'unknown');

create index notification_deliveries_outbox_state_idx
  on private.notification_deliveries (outbox_id, state, id);

alter table private.notification_deliveries enable row level security;

revoke all on table private.notification_deliveries
from public, anon, authenticated, service_role;

revoke all on sequence private.notification_deliveries_id_seq
from public, anon, authenticated, service_role;
