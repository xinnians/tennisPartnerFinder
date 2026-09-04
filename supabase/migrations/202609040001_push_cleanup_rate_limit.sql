-- FA-03 push-cleanup distributed rate-limit foundation. This migration does
-- not enable the hosted Edge handler and does not choose production limits.

create table private.push_cleanup_rate_limit_buckets (
  scope text not null,
  bucket_hash bytea not null,
  tokens numeric not null,
  refilled_at timestamptz not null,
  expires_at timestamptz not null,
  primary key (scope, bucket_hash),
  constraint push_cleanup_rate_limit_buckets_scope
    check (scope in ('global', 'source')),
  constraint push_cleanup_rate_limit_buckets_hash
    check (pg_catalog.octet_length(bucket_hash) = 32),
  constraint push_cleanup_rate_limit_buckets_tokens
    check (tokens >= 0),
  constraint push_cleanup_rate_limit_buckets_expiry
    check (expires_at >= refilled_at)
);

create index push_cleanup_rate_limit_buckets_expiry_idx
  on private.push_cleanup_rate_limit_buckets (expires_at, scope, bucket_hash);

revoke all on table private.push_cleanup_rate_limit_buckets
from public, anon, authenticated, service_role;

-- Call only after the current request has finished updating its own buckets.
-- SKIP LOCKED prevents the reaper from waiting on another limiter request and
-- creating a reverse lock edge. Each invocation removes at most one row, the
-- same maximum number of source rows one request can create.
create function private.reap_one_push_cleanup_rate_limit_bucket(
  p_global_bucket_hash bytea,
  p_source_bucket_hash bytea,
  p_observed_at timestamptz
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from private.push_cleanup_rate_limit_buckets bucket_row
  where bucket_row.ctid = (
    select expired_row.ctid
    from private.push_cleanup_rate_limit_buckets expired_row
    where expired_row.expires_at <= p_observed_at
      and not (
        expired_row.scope = 'global'
        and expired_row.bucket_hash = p_global_bucket_hash
      )
      and not (
        expired_row.scope = 'source'
        and expired_row.bucket_hash = p_source_bucket_hash
      )
    order by expired_row.expires_at,
             expired_row.scope,
             expired_row.bucket_hash
    limit 1
    for update skip locked
  );
$$;

revoke all on function private.reap_one_push_cleanup_rate_limit_bucket(
  bytea, bytea, timestamptz
)
from public, anon, authenticated, service_role;

-- The public wrapper below supplies clock_timestamp(). Keeping the clock as an
-- argument here makes the token-bucket state machine deterministic under
-- pgTAP without exposing a caller-controlled clock to the Edge role.
create function private.consume_push_cleanup_rate_limit_at(
  p_global_bucket_hash_hex text,
  p_source_bucket_hash_hex text,
  p_global_capacity integer,
  p_global_refill_milliseconds integer,
  p_source_capacity integer,
  p_source_refill_milliseconds integer,
  p_idle_ttl_seconds integer,
  p_observed_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  global_bucket_hash bytea;
  source_bucket_hash bytea;
  global_tokens numeric;
  global_refilled_at timestamptz;
  global_effective_at timestamptz;
  source_tokens numeric;
  source_refilled_at timestamptz;
  source_effective_at timestamptz;
begin
  if p_global_bucket_hash_hex is null
    or pg_catalog.char_length(p_global_bucket_hash_hex) <> 64
    or p_global_bucket_hash_hex !~ '^[0-9a-f]{64}$'
    or p_source_bucket_hash_hex is null
    or pg_catalog.char_length(p_source_bucket_hash_hex) <> 64
    or p_source_bucket_hash_hex !~ '^[0-9a-f]{64}$'
    or p_global_bucket_hash_hex = p_source_bucket_hash_hex then
    raise exception 'PUSH_CLEANUP_RATE_LIMIT_BUCKET_INVALID';
  end if;

  if p_global_capacity is null
    or p_global_capacity <= 0
    or p_global_refill_milliseconds is null
    or p_global_refill_milliseconds <= 0
    or p_source_capacity is null
    or p_source_capacity <= 0
    or p_source_refill_milliseconds is null
    or p_source_refill_milliseconds <= 0
    or p_idle_ttl_seconds is null
    or p_idle_ttl_seconds <= 0
    or p_observed_at is null
    or not pg_catalog.isfinite(p_observed_at) then
    raise exception 'PUSH_CLEANUP_RATE_LIMIT_POLICY_INVALID';
  end if;

  global_bucket_hash := pg_catalog.decode(p_global_bucket_hash_hex, 'hex');
  source_bucket_hash := pg_catalog.decode(p_source_bucket_hash_hex, 'hex');

  -- Every caller inserts and locks global first, then source. The unique key
  -- serializes first-use races without a SELECT-then-INSERT gap.
  insert into private.push_cleanup_rate_limit_buckets (
    scope,
    bucket_hash,
    tokens,
    refilled_at,
    expires_at
  ) values (
    'global',
    global_bucket_hash,
    p_global_capacity::numeric,
    p_observed_at,
    p_observed_at + pg_catalog.make_interval(secs => p_idle_ttl_seconds)
  )
  on conflict (scope, bucket_hash) do nothing;

  select bucket_row.tokens,
         bucket_row.refilled_at
  into global_tokens,
       global_refilled_at
  from private.push_cleanup_rate_limit_buckets bucket_row
  where bucket_row.scope = 'global'
    and bucket_row.bucket_hash = global_bucket_hash
  for update;

  global_effective_at := case
    when p_observed_at < global_refilled_at then global_refilled_at
    else p_observed_at
  end;
  global_tokens := least(
    p_global_capacity::numeric,
    global_tokens
      + (
          extract(epoch from (global_effective_at - global_refilled_at))
          * 1000
        ) / p_global_refill_milliseconds::numeric
  );

  if global_tokens < 1 then
    update private.push_cleanup_rate_limit_buckets bucket_row
    set tokens = global_tokens,
        refilled_at = global_effective_at,
        expires_at = global_effective_at
          + pg_catalog.make_interval(secs => p_idle_ttl_seconds)
    where bucket_row.scope = 'global'
      and bucket_row.bucket_hash = global_bucket_hash;
    perform private.reap_one_push_cleanup_rate_limit_bucket(
      global_bucket_hash,
      source_bucket_hash,
      p_observed_at
    );
    return 'LIMIT';
  end if;

  insert into private.push_cleanup_rate_limit_buckets (
    scope,
    bucket_hash,
    tokens,
    refilled_at,
    expires_at
  ) values (
    'source',
    source_bucket_hash,
    p_source_capacity::numeric,
    p_observed_at,
    p_observed_at + pg_catalog.make_interval(secs => p_idle_ttl_seconds)
  )
  on conflict (scope, bucket_hash) do nothing;

  select bucket_row.tokens,
         bucket_row.refilled_at
  into source_tokens,
       source_refilled_at
  from private.push_cleanup_rate_limit_buckets bucket_row
  where bucket_row.scope = 'source'
    and bucket_row.bucket_hash = source_bucket_hash
  for update;

  source_effective_at := case
    when p_observed_at < source_refilled_at then source_refilled_at
    else p_observed_at
  end;
  source_tokens := least(
    p_source_capacity::numeric,
    source_tokens
      + (
          extract(epoch from (source_effective_at - source_refilled_at))
          * 1000
        ) / p_source_refill_milliseconds::numeric
  );

  if source_tokens < 1 then
    update private.push_cleanup_rate_limit_buckets bucket_row
    set tokens = global_tokens,
        refilled_at = global_effective_at,
        expires_at = global_effective_at
          + pg_catalog.make_interval(secs => p_idle_ttl_seconds)
    where bucket_row.scope = 'global'
      and bucket_row.bucket_hash = global_bucket_hash;

    update private.push_cleanup_rate_limit_buckets bucket_row
    set tokens = source_tokens,
        refilled_at = source_effective_at,
        expires_at = source_effective_at
          + pg_catalog.make_interval(secs => p_idle_ttl_seconds)
    where bucket_row.scope = 'source'
      and bucket_row.bucket_hash = source_bucket_hash;
    perform private.reap_one_push_cleanup_rate_limit_bucket(
      global_bucket_hash,
      source_bucket_hash,
      p_observed_at
    );
    return 'LIMIT';
  end if;

  update private.push_cleanup_rate_limit_buckets bucket_row
  set tokens = global_tokens - 1,
      refilled_at = global_effective_at,
      expires_at = global_effective_at
        + pg_catalog.make_interval(secs => p_idle_ttl_seconds)
  where bucket_row.scope = 'global'
    and bucket_row.bucket_hash = global_bucket_hash;

  update private.push_cleanup_rate_limit_buckets bucket_row
  set tokens = source_tokens - 1,
      refilled_at = source_effective_at,
      expires_at = source_effective_at
        + pg_catalog.make_interval(secs => p_idle_ttl_seconds)
  where bucket_row.scope = 'source'
    and bucket_row.bucket_hash = source_bucket_hash;

  perform private.reap_one_push_cleanup_rate_limit_bucket(
    global_bucket_hash,
    source_bucket_hash,
    p_observed_at
  );

  return 'ALLOW';
end;
$$;

revoke all on function private.consume_push_cleanup_rate_limit_at(
  text, text, integer, integer, integer, integer, integer, timestamptz
)
from public, anon, authenticated, service_role;

create function public.consume_push_cleanup_rate_limit(
  p_global_bucket_hash_hex text,
  p_source_bucket_hash_hex text,
  p_global_capacity integer,
  p_global_refill_milliseconds integer,
  p_source_capacity integer,
  p_source_refill_milliseconds integer,
  p_idle_ttl_seconds integer
)
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select private.consume_push_cleanup_rate_limit_at(
    p_global_bucket_hash_hex,
    p_source_bucket_hash_hex,
    p_global_capacity,
    p_global_refill_milliseconds,
    p_source_capacity,
    p_source_refill_milliseconds,
    p_idle_ttl_seconds,
    pg_catalog.clock_timestamp()
  );
$$;

revoke all on function public.consume_push_cleanup_rate_limit(
  text, text, integer, integer, integer, integer, integer
)
from public, anon, authenticated, service_role;

grant execute on function public.consume_push_cleanup_rate_limit(
  text, text, integer, integer, integer, integer, integer
)
to service_role;
