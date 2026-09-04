begin;

select plan(29);

select is(
  (
    select string_agg(column_name, ',' order by ordinal_position)
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'push_cleanup_rate_limit_buckets'
  ),
  'scope,bucket_hash,tokens,refilled_at,expires_at',
  'the limiter stores only scope, opaque digest, token state, and expiry'
);

select ok(
  (
    select count(*) = 4
    from pg_constraint constraint_row
    where constraint_row.conrelid =
        'private.push_cleanup_rate_limit_buckets'::regclass
      and constraint_row.contype = 'c'
      and constraint_row.convalidated
  ),
  'all limiter shape constraints are validated'
);

select ok(
  exists (
    select 1
    from pg_index index_row
    join pg_class class_row on class_row.oid = index_row.indexrelid
    where index_row.indrelid =
        'private.push_cleanup_rate_limit_buckets'::regclass
      and class_row.relname =
        'push_cleanup_rate_limit_buckets_expiry_idx'
      and index_row.indisvalid
  ),
  'expired buckets have a cleanup index'
);

select ok(
  not has_table_privilege(
    'public',
    'private.push_cleanup_rate_limit_buckets',
    'select,insert,update,delete,truncate,references,trigger'
  )
    and not has_table_privilege(
      'anon',
      'private.push_cleanup_rate_limit_buckets',
      'select,insert,update,delete,truncate,references,trigger'
    )
    and not has_table_privilege(
      'authenticated',
      'private.push_cleanup_rate_limit_buckets',
      'select,insert,update,delete,truncate,references,trigger'
    )
    and not has_table_privilege(
      'service_role',
      'private.push_cleanup_rate_limit_buckets',
      'select,insert,update,delete,truncate,references,trigger'
    ),
  'application roles cannot access raw limiter state'
);

select ok(
  (
    select count(*) = 3
    from pg_proc function_row
    join pg_roles owner_role on owner_role.oid = function_row.proowner
    where function_row.oid = any(array[
      to_regprocedure(
        'private.consume_push_cleanup_rate_limit_at(text,text,integer,integer,integer,integer,integer,timestamptz)'
      ),
      to_regprocedure(
        'private.reap_one_push_cleanup_rate_limit_bucket(bytea,bytea,timestamptz)'
      ),
      to_regprocedure(
        'public.consume_push_cleanup_rate_limit(text,text,integer,integer,integer,integer,integer)'
      )
    ])
      and owner_role.rolname = 'postgres'
      and function_row.prosecdef
      and coalesce(function_row.proconfig, '{}'::text[])
        @> array['search_path=""']::text[]
  ),
  'limiter functions use the reviewed owner, definer mode, and empty path'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.consume_push_cleanup_rate_limit(text,text,integer,integer,integer,integer,integer)',
    'execute'
  )
    and not has_function_privilege(
      'public',
      'public.consume_push_cleanup_rate_limit(text,text,integer,integer,integer,integer,integer)',
      'execute'
    )
    and not has_function_privilege(
      'anon',
      'public.consume_push_cleanup_rate_limit(text,text,integer,integer,integer,integer,integer)',
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'public.consume_push_cleanup_rate_limit(text,text,integer,integer,integer,integer,integer)',
      'execute'
    ),
  'only service role can execute the public limiter wrapper'
);

select ok(
  not has_function_privilege(
    'public',
    'private.consume_push_cleanup_rate_limit_at(text,text,integer,integer,integer,integer,integer,timestamptz)',
    'execute'
  )
    and not has_function_privilege(
      'anon',
      'private.consume_push_cleanup_rate_limit_at(text,text,integer,integer,integer,integer,integer,timestamptz)',
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'private.consume_push_cleanup_rate_limit_at(text,text,integer,integer,integer,integer,integer,timestamptz)',
      'execute'
    )
    and not has_function_privilege(
      'service_role',
      'private.consume_push_cleanup_rate_limit_at(text,text,integer,integer,integer,integer,integer,timestamptz)',
      'execute'
    )
    and not has_function_privilege(
      'public',
      'private.reap_one_push_cleanup_rate_limit_bucket(bytea,bytea,timestamptz)',
      'execute'
    )
    and not has_function_privilege(
      'anon',
      'private.reap_one_push_cleanup_rate_limit_bucket(bytea,bytea,timestamptz)',
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'private.reap_one_push_cleanup_rate_limit_bucket(bytea,bytea,timestamptz)',
      'execute'
    )
    and not has_function_privilege(
      'service_role',
      'private.reap_one_push_cleanup_rate_limit_bucket(bytea,bytea,timestamptz)',
      'execute'
    ),
  'application roles cannot execute the deterministic private helper'
);

select ok(
  pg_get_functiondef(
    'public.consume_push_cleanup_rate_limit(text,text,integer,integer,integer,integer,integer)'::regprocedure
  ) ~ 'clock_timestamp',
  'the public boundary always supplies the database clock'
);

select ok(
  pg_get_functiondef(
    'private.consume_push_cleanup_rate_limit_at(text,text,integer,integer,integer,integer,integer,timestamptz)'::regprocedure
  ) ~ 'on conflict \(scope, bucket_hash\) do nothing',
  'first-use bucket creation uses an atomic conflict boundary'
);

select ok(
  strpos(
    pg_get_functiondef(
      'private.consume_push_cleanup_rate_limit_at(text,text,integer,integer,integer,integer,integer,timestamptz)'::regprocedure
    ),
    $$where bucket_row.scope = 'global'$$
  ) < strpos(
    pg_get_functiondef(
      'private.consume_push_cleanup_rate_limit_at(text,text,integer,integer,integer,integer,integer,timestamptz)'::regprocedure
    ),
    $$where bucket_row.scope = 'source'$$
  ),
  'the implementation locks global before source'
);

select ok(
  strpos(
    pg_get_functiondef(
      'private.consume_push_cleanup_rate_limit_at(text,text,integer,integer,integer,integer,integer,timestamptz)'::regprocedure
    ),
    $$where bucket_row.scope = 'global'$$
  ) < strpos(
    pg_get_functiondef(
      'private.consume_push_cleanup_rate_limit_at(text,text,integer,integer,integer,integer,integer,timestamptz)'::regprocedure
    ),
    'reap_one_push_cleanup_rate_limit_bucket'
  )
    and regexp_count(
      pg_get_functiondef(
        'private.consume_push_cleanup_rate_limit_at(text,text,integer,integer,integer,integer,integer,timestamptz)'::regprocedure
      ),
      'perform private\.reap_one_push_cleanup_rate_limit_bucket'
    ) = 3
    and pg_get_functiondef(
      'private.reap_one_push_cleanup_rate_limit_bucket(bytea,bytea,timestamptz)'::regprocedure
    ) ~ 'for update skip locked',
  'reaping happens after target locks and never waits on another bucket'
);

select throws_ok(
  $$
    select private.consume_push_cleanup_rate_limit_at(
      'AA', repeat('22', 32), 2, 1000, 2, 1000, 60,
      '2026-09-04 00:00:00+00'::timestamptz
    )
  $$,
  'P0001',
  'PUSH_CLEANUP_RATE_LIMIT_BUCKET_INVALID',
  'malformed bucket digests fail closed'
);

select throws_ok(
  $$
    select private.consume_push_cleanup_rate_limit_at(
      repeat('11', 32), repeat('11', 32), 2, 1000, 2, 1000, 60,
      '2026-09-04 00:00:00+00'::timestamptz
    )
  $$,
  'P0001',
  'PUSH_CLEANUP_RATE_LIMIT_BUCKET_INVALID',
  'global and source digests must be domain-separated'
);

select throws_ok(
  $$
    select private.consume_push_cleanup_rate_limit_at(
      repeat('11', 32), repeat('22', 32), 0, 1000, 2, 1000, 60,
      '2026-09-04 00:00:00+00'::timestamptz
    )
  $$,
  'P0001',
  'PUSH_CLEANUP_RATE_LIMIT_POLICY_INVALID',
  'non-positive policy values fail closed'
);

truncate private.push_cleanup_rate_limit_buckets;

select is(
  private.consume_push_cleanup_rate_limit_at(
    repeat('11', 32), repeat('22', 32), 3, 1000000, 2, 1000, 60,
    '2026-09-04 00:00:00+00'::timestamptz
  ),
  'ALLOW',
  'a new global and source bucket allow the first token'
);

select is(
  (
    select tokens
    from private.push_cleanup_rate_limit_buckets
    where scope = 'global'
      and bucket_hash = decode(repeat('11', 32), 'hex')
  ),
  2::numeric,
  'the first request consumes one global token'
);

select is(
  (
    select tokens
    from private.push_cleanup_rate_limit_buckets
    where scope = 'source'
      and bucket_hash = decode(repeat('22', 32), 'hex')
  ),
  1::numeric,
  'the first request consumes one source token'
);

select is(
  private.consume_push_cleanup_rate_limit_at(
    repeat('11', 32), repeat('22', 32), 3, 1000000, 2, 1000, 60,
    '2026-09-04 00:00:00+00'::timestamptz
  ),
  'ALLOW',
  'the same source can consume its second burst token'
);

select is(
  private.consume_push_cleanup_rate_limit_at(
    repeat('11', 32), repeat('22', 32), 3, 1000000, 2, 1000, 60,
    '2026-09-04 00:00:00+00'::timestamptz
  ),
  'LIMIT',
  'an exhausted source is limited'
);

select is(
  (
    select tokens
    from private.push_cleanup_rate_limit_buckets
    where scope = 'global'
      and bucket_hash = decode(repeat('11', 32), 'hex')
  ),
  1::numeric,
  'a source denial does not consume a global token'
);

select is(
  private.consume_push_cleanup_rate_limit_at(
    repeat('11', 32), repeat('22', 32), 3, 1000000, 2, 1000, 60,
    '2026-09-04 00:00:01+00'::timestamptz
  ),
  'ALLOW',
  'elapsed time refills the source bucket exactly'
);

select is(
  private.consume_push_cleanup_rate_limit_at(
    repeat('11', 32), repeat('33', 32), 3, 1000000, 2, 1000, 60,
    '2026-09-04 00:00:01+00'::timestamptz
  ),
  'LIMIT',
  'the global bucket limits a different source after its burst is spent'
);

select is(
  (
    select count(*)
    from private.push_cleanup_rate_limit_buckets
    where scope = 'source'
      and bucket_hash = decode(repeat('33', 32), 'hex')
  ),
  0::bigint,
  'a global denial does not create an attacker-selected source bucket'
);

select is(
  private.consume_push_cleanup_rate_limit_at(
    repeat('11', 32), repeat('22', 32), 3, 1000000, 2, 1000, 60,
    '2026-09-03 23:59:59+00'::timestamptz
  ),
  'LIMIT',
  'a backward clock observation cannot mint tokens'
);

update private.push_cleanup_rate_limit_buckets
set expires_at = '2026-09-04 00:00:01+00'::timestamptz
where scope = 'source';

insert into private.push_cleanup_rate_limit_buckets (
  scope, bucket_hash, tokens, refilled_at, expires_at
) values (
  'source', decode(repeat('44', 32), 'hex'), 1,
  '2026-09-04 00:00:00+00'::timestamptz,
  '2026-09-04 00:00:01+00'::timestamptz
);

select is(
  private.consume_push_cleanup_rate_limit_at(
    repeat('55', 32), repeat('66', 32), 1, 1000, 1, 1000, 60,
    '2026-09-04 00:01:01+00'::timestamptz
  ),
  'ALLOW',
  'a later request succeeds while reclaiming stale state'
);

select is(
  (
    select count(*)
    from private.push_cleanup_rate_limit_buckets
    where bucket_hash in (
      decode(repeat('22', 32), 'hex'),
      decode(repeat('44', 32), 'hex')
    )
  ),
  1::bigint,
  'each request removes exactly one unrelated expired bucket'
);

select is(
  (
    select count(*)
    from private.push_cleanup_rate_limit_buckets
    where scope = 'global'
      and bucket_hash = decode(repeat('55', 32), 'hex')
  ),
  1::bigint,
  'the current global bucket survives opportunistic cleanup'
);

select is(
  (
    select count(*)
    from private.push_cleanup_rate_limit_buckets
    where scope = 'source'
      and bucket_hash = decode(repeat('66', 32), 'hex')
  ),
  1::bigint,
  'the current source bucket survives opportunistic cleanup'
);

select is(
  (
    select count(*)
    from private.push_cleanup_rate_limit_buckets
  ),
  4::bigint,
  'limiter state contains only active rows after one stale row is reclaimed'
);

select * from finish();

rollback;
