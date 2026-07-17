-- Replace quick-contact discovery with a narrow, stateful Taipei tennis
-- session boundary.  Browser roles use only the public views and RPCs below.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Archive the original quick-contact records instead of destroying history.
revoke all on table public.partner_requests, public.reports from public, anon, authenticated;
revoke all on table public.public_profile_discovery from public, anon, authenticated;
drop view if exists public.public_profile_discovery;

alter table public.partner_requests rename to legacy_partner_requests;
alter table public.legacy_partner_requests set schema private;
alter table public.reports rename to legacy_reports;
alter table public.legacy_reports set schema private;

-- Moving legacy tables private must preserve their history, not preserve their
-- former cascade/set-null behavior.  A profile (including its auth-linked
-- cascade) or legacy request therefore cannot silently erase or rewrite an
-- archived record.
alter table private.legacy_partner_requests
  drop constraint if exists partner_requests_profile_id_fkey,
  add constraint partner_requests_profile_id_fkey
    foreign key (profile_id) references public.profiles (id) on delete restrict;

alter table private.legacy_reports
  drop constraint if exists reports_reporter_profile_id_fkey,
  drop constraint if exists reports_reported_profile_id_fkey,
  drop constraint if exists reports_partner_request_id_fkey,
  add constraint reports_reporter_profile_id_fkey
    foreign key (reporter_profile_id) references public.profiles (id) on delete restrict,
  add constraint reports_reported_profile_id_fkey
    foreign key (reported_profile_id) references public.profiles (id) on delete restrict,
  add constraint reports_partner_request_id_fkey
    foreign key (partner_request_id) references private.legacy_partner_requests (id) on delete restrict;

revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all sequences in schema private from public, anon, authenticated;

create table public.sports (
  id bigint generated always as identity primary key,
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.sports (code, name, is_active)
values ('tennis', '網球', true)
on conflict (code) do update
set name = excluded.name,
    is_active = true;

create table public.sessions (
  id bigint generated always as identity primary key,
  sport_id bigint not null references public.sports (id) on delete restrict,
  host_profile_id bigint not null references public.profiles (id) on delete cascade,
  court_id bigint not null references public.courts (id) on delete restrict,
  play_type text not null check (play_type in ('單打', '雙打', '對拉', '練球')),
  start_at timestamptz not null,
  ntrp_min numeric(2, 1),
  ntrp_max numeric(2, 1),
  slots_total smallint not null check (slots_total between 1 and 3),
  notes text check (notes is null or char_length(notes) <= 500),
  status text not null default 'open'
    check (status in ('open', 'full', 'cancelled', 'played', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (ntrp_min is null and ntrp_max is null)
    or (
      ntrp_min between 1.0 and 7.0
      and ntrp_max between 1.0 and 7.0
      and ntrp_min <= ntrp_max
    )
  )
);

create table public.session_participants (
  id bigint generated always as identity primary key,
  session_id bigint not null references public.sessions (id) on delete cascade,
  profile_id bigint not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('host', 'guest')),
  status text not null check (status in ('requested', 'accepted', 'declined', 'withdrawn')),
  played_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, profile_id),
  check (role <> 'host' or status = 'accepted')
);

create table public.reports (
  id bigint generated always as identity primary key,
  reporter_profile_id bigint not null references public.profiles (id) on delete restrict,
  session_id bigint references public.sessions (id) on delete restrict,
  reported_profile_id bigint references public.profiles (id) on delete restrict,
  reason text not null check (char_length(btrim(reason)) > 0),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  check (num_nonnulls(session_id, reported_profile_id) = 1)
);

create unique index session_participants_one_host_idx
  on public.session_participants (session_id)
  where role = 'host';
create index sessions_future_discovery_idx
  on public.sessions (status, start_at)
  where status in ('open', 'full');
create index sessions_court_start_idx on public.sessions (court_id, start_at);
create index sessions_host_start_idx on public.sessions (host_profile_id, start_at desc);
create index session_participants_session_profile_status_idx
  on public.session_participants (session_id, profile_id, status);
create index session_participants_profile_status_idx
  on public.session_participants (profile_id, status, session_id);
create index reports_reporter_profile_id_idx on public.reports (reporter_profile_id);
create index reports_session_id_idx on public.reports (session_id) where session_id is not null;
create index reports_reported_profile_id_idx on public.reports (reported_profile_id) where reported_profile_id is not null;

drop trigger if exists sessions_set_updated_at on public.sessions;
create trigger sessions_set_updated_at
before update on public.sessions
for each row execute function public.set_updated_at();

drop trigger if exists session_participants_set_updated_at on public.session_participants;
create trigger session_participants_set_updated_at
before update on public.session_participants
for each row execute function public.set_updated_at();

create or replace function private.viewer_profile_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select profile_row.id
  from public.profiles profile_row
  where profile_row.user_id = auth.uid()
$$;

create or replace function private.require_complete_profile()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile bigint;
begin
  viewer_profile := private.viewer_profile_id();

  if viewer_profile is null
    or not exists (
      select 1
      from public.profiles profile_row
      where profile_row.id = viewer_profile
        and btrim(profile_row.nickname) <> ''
        and btrim(coalesce(profile_row.line_id, '')) <> ''
        and profile_row.ntrp between 1.0 and 7.0
    )
    or not exists (
      select 1
      from public.profile_play_types play_type_row
      where play_type_row.profile_id = viewer_profile
    )
    or not exists (
      select 1
      from public.profile_courts profile_court_row
      join public.courts court_row on court_row.id = profile_court_row.court_id
      where profile_court_row.profile_id = viewer_profile
        and court_row.is_active
        and court_row.city = '台北市'
    ) then
    raise exception 'PROFILE_INCOMPLETE';
  end if;

  return viewer_profile;
end;
$$;

create or replace function private.is_session_host(p_session_id bigint, p_profile_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.sessions session_row
    where session_row.id = p_session_id
      and session_row.host_profile_id = p_profile_id
  )
$$;

create or replace function private.lock_and_expire_session(p_session_id bigint)
returns public.sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_session public.sessions%rowtype;
begin
  select *
  into locked_session
  from public.sessions session_row
  where session_row.id = p_session_id
  for update;

  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if locked_session.status in ('open', 'full')
    and locked_session.start_at <= now() - interval '24 hours' then
    update public.sessions
    set status = 'expired'
    where id = locked_session.id
    returning * into locked_session;
  end if;

  return locked_session;
end;
$$;

create or replace function private.expire_stale_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_count integer;
begin
  update public.sessions
  set status = 'expired'
  where status in ('open', 'full')
    and start_at <= now() - interval '24 hours';

  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;

create or replace function private.enforce_session_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'open' or new.start_at <= now() then
      raise exception 'INVALID_TRANSITION';
    end if;

    return new;
  end if;

  if new.host_profile_id is distinct from old.host_profile_id then
    raise exception 'INVALID_TRANSITION';
  end if;

  if new.start_at is distinct from old.start_at then
    raise exception 'INVALID_TRANSITION';
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'open' and new.status in ('full', 'cancelled', 'played', 'expired'))
      or (old.status = 'full' and new.status in ('open', 'cancelled', 'played', 'expired'))
    ) then
      raise exception 'INVALID_TRANSITION';
    end if;

    if (
      new.status in ('open', 'full', 'cancelled')
      and old.start_at <= now()
    ) or (
      new.status = 'played'
      and (
        old.start_at > now()
        or old.start_at <= now() - interval '24 hours'
      )
    ) or (
      new.status = 'expired'
      and old.start_at > now() - interval '24 hours'
    ) then
      raise exception 'INVALID_TRANSITION';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.enforce_session_participant_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_session public.sessions%rowtype;
  accepted_guest_count bigint;
  played_confirmation_is_new boolean;
begin
  if tg_op = 'INSERT' then
    if new.role = 'host' then
      if new.status <> 'accepted'
        or not exists (
          select 1
          from public.sessions session_row
          where session_row.id = new.session_id
            and session_row.host_profile_id = new.profile_id
        ) then
        raise exception 'INVALID_TRANSITION';
      end if;
    elsif new.status <> 'requested' then
      raise exception 'INVALID_TRANSITION';
    end if;
  else
    if new.session_id is distinct from old.session_id
      or new.profile_id is distinct from old.profile_id
      or new.role is distinct from old.role then
      raise exception 'INVALID_TRANSITION';
    end if;

    if old.role = 'host' then
      if new.status <> 'accepted' then
        raise exception 'INVALID_TRANSITION';
      end if;
    elsif new.status is distinct from old.status
      and not (
        (old.status = 'requested' and new.status in ('accepted', 'declined', 'withdrawn'))
        or (old.status = 'accepted' and new.status = 'withdrawn')
      ) then
      raise exception 'INVALID_TRANSITION';
    end if;
  end if;

  if tg_op = 'INSERT' then
    played_confirmation_is_new := new.played_confirmed;
  else
    played_confirmation_is_new := new.played_confirmed and not old.played_confirmed;
  end if;

  if new.role = 'guest' and new.status = 'requested' then
    select *
    into parent_session
    from public.sessions session_row
    where session_row.id = new.session_id
    for update;

    if not found
      or parent_session.status <> 'open'
      or parent_session.start_at <= now() then
      raise exception 'INVALID_TRANSITION';
    end if;
  end if;

  if new.status <> 'accepted' and new.played_confirmed then
    raise exception 'INVALID_TRANSITION';
  end if;

  if tg_op = 'UPDATE'
    and new.role = 'guest'
    and new.status = 'accepted'
    and new.status is distinct from old.status then
    if old.status <> 'requested' then
      raise exception 'INVALID_TRANSITION';
    end if;

    select *
    into parent_session
    from public.sessions session_row
    where session_row.id = new.session_id
    for update;

    if not found
      or parent_session.status <> 'open'
      or parent_session.start_at <= now() then
      raise exception 'INVALID_TRANSITION';
    end if;

    select count(*)
    into accepted_guest_count
    from public.session_participants participant_row
    where participant_row.session_id = new.session_id
      and participant_row.role = 'guest'
      and participant_row.status = 'accepted';

    if accepted_guest_count >= parent_session.slots_total then
      raise exception 'INVALID_TRANSITION';
    end if;
  end if;

  if tg_op = 'UPDATE'
    and new.role = 'guest'
    and new.status = 'withdrawn'
    and new.status is distinct from old.status then
    select *
    into parent_session
    from public.sessions session_row
    where session_row.id = new.session_id
    for update;

    if not found
      or parent_session.status not in ('open', 'full')
      or parent_session.start_at <= now() then
      raise exception 'INVALID_TRANSITION';
    end if;
  end if;

  if played_confirmation_is_new then
    select *
    into parent_session
    from public.sessions session_row
    where session_row.id = new.session_id
    for update;

    if not found
      or new.status <> 'accepted'
      or parent_session.status not in ('open', 'full', 'played')
      or parent_session.start_at > now()
      or parent_session.start_at <= now() - interval '24 hours' then
      raise exception 'INVALID_TRANSITION';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.enforce_session_capacity_invariant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session_id bigint;
  session_status text;
  guest_slots smallint;
  accepted_guest_count bigint;
begin
  if tg_table_name = 'sessions' then
    if tg_op = 'DELETE' then
      return null;
    end if;
    target_session_id := new.id;
  elsif tg_op = 'DELETE' then
    target_session_id := old.session_id;
  else
    target_session_id := new.session_id;
  end if;

  select session_row.status, session_row.slots_total
  into session_status, guest_slots
  from public.sessions session_row
  where session_row.id = target_session_id;

  if not found then
    return null;
  end if;

  select count(*)
  into accepted_guest_count
  from public.session_participants participant_row
  where participant_row.session_id = target_session_id
    and participant_row.role = 'guest'
    and participant_row.status = 'accepted';

  if (session_status = 'open' and accepted_guest_count >= guest_slots)
    or (session_status = 'full' and accepted_guest_count <> guest_slots)
    or (
      session_status = 'full'
      and exists (
        select 1
        from public.session_participants participant_row
        where participant_row.session_id = target_session_id
          and participant_row.role = 'guest'
          and participant_row.status = 'requested'
      )
    ) then
    raise exception 'INVALID_TRANSITION';
  end if;

  return null;
end;
$$;

create or replace function private.enforce_session_host_invariant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session_id bigint;
  session_host_profile_id bigint;
  host_count bigint;
  matching_host_count bigint;
begin
  if tg_table_name = 'sessions' then
    if tg_op = 'DELETE' then
      return null;
    end if;
    target_session_id := new.id;
  elsif tg_op = 'DELETE' then
    target_session_id := old.session_id;
  else
    target_session_id := new.session_id;
  end if;

  select session_row.host_profile_id
  into session_host_profile_id
  from public.sessions session_row
  where session_row.id = target_session_id;

  if not found then
    return null;
  end if;

  select count(*)
  into host_count
  from public.session_participants participant_row
  where participant_row.session_id = target_session_id
    and participant_row.role = 'host';

  select count(*)
  into matching_host_count
  from public.session_participants participant_row
  where participant_row.session_id = target_session_id
    and participant_row.role = 'host'
    and participant_row.profile_id = session_host_profile_id
    and participant_row.status = 'accepted';

  if host_count <> 1 or matching_host_count <> 1 then
    raise exception 'INVALID_TRANSITION';
  end if;

  return null;
end;
$$;

drop trigger if exists sessions_enforce_transition on public.sessions;
create trigger sessions_enforce_transition
before insert or update on public.sessions
for each row execute function private.enforce_session_transition();

drop trigger if exists session_participants_enforce_transition on public.session_participants;
create trigger session_participants_enforce_transition
before insert or update on public.session_participants
for each row execute function private.enforce_session_participant_transition();

drop trigger if exists session_participants_capacity_invariant on public.session_participants;
create constraint trigger session_participants_capacity_invariant
after insert or update or delete on public.session_participants
deferrable initially deferred
for each row execute function private.enforce_session_capacity_invariant();

drop trigger if exists sessions_capacity_invariant on public.sessions;
create constraint trigger sessions_capacity_invariant
after insert or update on public.sessions
deferrable initially deferred
for each row execute function private.enforce_session_capacity_invariant();

drop trigger if exists session_participants_host_invariant on public.session_participants;
create constraint trigger session_participants_host_invariant
after insert or update or delete on public.session_participants
deferrable initially deferred
for each row execute function private.enforce_session_host_invariant();

drop trigger if exists sessions_host_invariant on public.sessions;
create constraint trigger sessions_host_invariant
after insert or update or delete on public.sessions
deferrable initially deferred
for each row execute function private.enforce_session_host_invariant();

alter table public.sports enable row level security;
alter table public.sessions enable row level security;
alter table public.session_participants enable row level security;
alter table public.reports enable row level security;

-- The original owner-write policies are intentionally replaced by the
-- atomic profile RPC below.  Owner-only profile reads and court catalogue
-- reads remain available to their existing client use cases.
drop policy if exists "profiles are insertable by owner" on public.profiles;
drop policy if exists "profiles are updatable by owner" on public.profiles;
drop policy if exists "profile courts are manageable by profile owner" on public.profile_courts;
drop policy if exists "profile play types are manageable by profile owner" on public.profile_play_types;
drop policy if exists "profile slots are manageable by profile owner" on public.profile_slots;
drop policy if exists "reports are insertable by reporter" on public.reports;
drop policy if exists "reports are readable by reporter" on public.reports;

revoke all on table public.sports, public.sessions, public.session_participants, public.reports from public, anon, authenticated;
revoke all on table public.profiles, public.profile_courts, public.profile_play_types, public.profile_slots from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
grant select on table public.profiles to authenticated;
grant select on table public.courts to anon, authenticated;

create or replace function public.save_my_profile(
  p_nickname text,
  p_ntrp numeric,
  p_line_id text,
  p_court_ids bigint[],
  p_play_types text[],
  p_slot_codes text[]
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_profile_id bigint;
begin
  if auth.uid() is null
    or p_nickname is null
    or btrim(p_nickname) = ''
    or p_line_id is null
    or btrim(p_line_id) = ''
    or p_ntrp is null
    or p_ntrp not between 1.0 and 7.0
    or coalesce(cardinality(p_court_ids), 0) = 0
    or coalesce(cardinality(p_play_types), 0) = 0
    or coalesce(cardinality(p_slot_codes), 0) = 0 then
    raise exception 'PROFILE_INCOMPLETE';
  end if;

  if exists (
    select 1
    from unnest(p_court_ids) as requested_court(court_id)
    left join public.courts court_row
      on court_row.id = requested_court.court_id
      and court_row.is_active
      and court_row.city = '台北市'
    where court_row.id is null
  )
  or exists (
    select 1
    from unnest(p_play_types) as requested_play_type(play_type)
    where requested_play_type.play_type is null
      or requested_play_type.play_type not in ('單打', '雙打', '對拉', '練球')
  )
  or exists (
    select 1
    from unnest(p_slot_codes) as requested_slot(slot_code)
    where requested_slot.slot_code is null
      or requested_slot.slot_code not in ('wd-m', 'wd-a', 'wd-e', 'we-m', 'we-a', 'we-e')
  ) then
    raise exception 'PROFILE_INCOMPLETE';
  end if;

  insert into public.profiles (user_id, nickname, ntrp, line_id, is_public)
  values (auth.uid(), btrim(p_nickname), p_ntrp, btrim(p_line_id), false)
  on conflict (user_id) do update
  set nickname = excluded.nickname,
      ntrp = excluded.ntrp,
      line_id = excluded.line_id,
      is_public = false
  returning id into saved_profile_id;

  delete from public.profile_courts where profile_id = saved_profile_id;
  delete from public.profile_play_types where profile_id = saved_profile_id;
  delete from public.profile_slots where profile_id = saved_profile_id;

  insert into public.profile_courts (profile_id, court_id)
  select saved_profile_id, distinct_court.court_id
  from (
    select distinct requested_court.court_id
    from unnest(p_court_ids) as requested_court(court_id)
  ) as distinct_court;

  insert into public.profile_play_types (profile_id, play_type)
  select saved_profile_id, distinct_play_type.play_type
  from (
    select distinct requested_play_type.play_type
    from unnest(p_play_types) as requested_play_type(play_type)
  ) as distinct_play_type;

  insert into public.profile_slots (profile_id, slot_code)
  select saved_profile_id, distinct_slot.slot_code
  from (
    select distinct requested_slot.slot_code
    from unnest(p_slot_codes) as requested_slot(slot_code)
  ) as distinct_slot;

  return saved_profile_id;
end;
$$;

create or replace function public.create_session(
  p_court_id bigint,
  p_play_type text,
  p_start_at timestamptz,
  p_ntrp_min numeric,
  p_ntrp_max numeric,
  p_slots_total integer,
  p_notes text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  host_profile bigint;
  tennis_sport_id bigint;
  taipei_court_id bigint;
  created_session_id bigint;
begin
  host_profile := private.require_complete_profile();

  if p_start_at is null or p_start_at <= now() then
    raise exception 'SESSION_STARTED';
  end if;

  if p_play_type is null
    or p_play_type not in ('單打', '雙打', '對拉', '練球')
    or p_slots_total is null
    or p_slots_total not between 1 and 3
    or (p_notes is not null and char_length(p_notes) > 500)
    or ((p_ntrp_min is null) <> (p_ntrp_max is null))
    or (p_ntrp_min is not null and (
      p_ntrp_min not between 1.0 and 7.0
      or p_ntrp_max not between 1.0 and 7.0
      or p_ntrp_min > p_ntrp_max
    )) then
    raise exception 'INVALID_TRANSITION';
  end if;

  select sport_row.id
  into tennis_sport_id
  from public.sports sport_row
  where sport_row.code = 'tennis'
    and sport_row.is_active;

  if tennis_sport_id is null then
    raise exception 'INVALID_TRANSITION';
  end if;

  select court_row.id
  into taipei_court_id
  from public.courts court_row
  where court_row.id = p_court_id
    and court_row.is_active
    and court_row.city = '台北市';

  if taipei_court_id is null then
    raise exception 'INVALID_TRANSITION';
  end if;

  insert into public.sessions (
    sport_id,
    host_profile_id,
    court_id,
    play_type,
    start_at,
    ntrp_min,
    ntrp_max,
    slots_total,
    notes
  )
  values (
    tennis_sport_id,
    host_profile,
    taipei_court_id,
    p_play_type,
    p_start_at,
    p_ntrp_min,
    p_ntrp_max,
    p_slots_total::smallint,
    p_notes
  )
  returning id into created_session_id;

  insert into public.session_participants (session_id, profile_id, role, status)
  values (created_session_id, host_profile, 'host', 'accepted');

  return created_session_id;
end;
$$;

create or replace function public.request_to_join_session(p_session_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  guest_profile bigint;
  locked_session public.sessions%rowtype;
  prior_status text;
begin
  locked_session := private.lock_and_expire_session(p_session_id);

  if locked_session.status = 'expired' then
    return 'SESSION_EXPIRED';
  end if;

  guest_profile := private.require_complete_profile();

  if locked_session.status = 'cancelled' then
    raise exception 'SESSION_CANCELLED';
  elsif locked_session.status = 'full' then
    raise exception 'SESSION_FULL';
  elsif locked_session.status <> 'open' then
    raise exception 'SESSION_NOT_OPEN';
  elsif locked_session.start_at <= now() then
    raise exception 'SESSION_STARTED';
  end if;

  if not exists (
    select 1
    from public.courts court_row
    join public.sports sport_row on sport_row.id = locked_session.sport_id
    where court_row.id = locked_session.court_id
      and court_row.is_active
      and court_row.city = '台北市'
      and sport_row.code = 'tennis'
      and sport_row.is_active
  ) then
    raise exception 'INVALID_TRANSITION';
  end if;

  if locked_session.host_profile_id = guest_profile then
    raise exception 'INVALID_TRANSITION';
  end if;

  select participant_row.status
  into prior_status
  from public.session_participants participant_row
  where participant_row.session_id = locked_session.id
    and participant_row.profile_id = guest_profile;

  if found then
    if prior_status = 'requested' then
      raise exception 'ALREADY_REQUESTED';
    end if;
    raise exception 'ALREADY_DECIDED';
  end if;

  insert into public.session_participants (session_id, profile_id, role, status)
  values (locked_session.id, guest_profile, 'guest', 'requested');

  return 'OK';
end;
$$;

create or replace function public.review_join_request(
  p_session_id bigint,
  p_participant_id bigint,
  p_decision text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile bigint;
  locked_session public.sessions%rowtype;
  requested_participant public.session_participants%rowtype;
  accepted_guest_count integer;
begin
  viewer_profile := private.viewer_profile_id();
  locked_session := private.lock_and_expire_session(p_session_id);

  if locked_session.status = 'expired' then
    return 'SESSION_EXPIRED';
  end if;

  if viewer_profile is null or not private.is_session_host(locked_session.id, viewer_profile) then
    raise exception 'NOT_SESSION_HOST';
  end if;

  if locked_session.status = 'cancelled' then
    raise exception 'SESSION_CANCELLED';
  elsif locked_session.status not in ('open', 'full') then
    raise exception 'SESSION_NOT_OPEN';
  elsif locked_session.start_at <= now() then
    raise exception 'SESSION_STARTED';
  end if;

  if p_decision is null or p_decision not in ('accepted', 'declined') then
    raise exception 'INVALID_TRANSITION';
  end if;

  select *
  into requested_participant
  from public.session_participants participant_row
  where participant_row.id = p_participant_id
    and participant_row.session_id = locked_session.id
  for update;

  if not found or requested_participant.role <> 'guest' then
    raise exception 'INVALID_TRANSITION';
  elsif requested_participant.status <> 'requested' then
    raise exception 'ALREADY_DECIDED';
  end if;

  if locked_session.status = 'full' then
    raise exception 'SESSION_FULL';
  end if;

  if p_decision = 'declined' then
    update public.session_participants
    set status = 'declined'
    where id = requested_participant.id;
    return 'OK';
  end if;

  select count(*)
  into accepted_guest_count
  from public.session_participants participant_row
  where participant_row.session_id = locked_session.id
    and participant_row.role = 'guest'
    and participant_row.status = 'accepted';

  if accepted_guest_count >= locked_session.slots_total then
    update public.sessions
    set status = 'full'
    where id = locked_session.id
      and status = 'open';
    raise exception 'SESSION_FULL';
  end if;

  update public.session_participants
  set status = 'accepted'
  where id = requested_participant.id;

  if accepted_guest_count + 1 = locked_session.slots_total then
    update public.sessions
    set status = 'full'
    where id = locked_session.id;

    update public.session_participants
    set status = 'declined'
    where session_id = locked_session.id
      and role = 'guest'
      and status = 'requested';
  end if;

  return 'OK';
end;
$$;

create or replace function public.withdraw_from_session(p_session_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile bigint;
  locked_session public.sessions%rowtype;
  viewer_participant public.session_participants%rowtype;
begin
  viewer_profile := private.viewer_profile_id();
  locked_session := private.lock_and_expire_session(p_session_id);

  if locked_session.status = 'expired' then
    return 'SESSION_EXPIRED';
  elsif locked_session.status = 'cancelled' then
    raise exception 'SESSION_CANCELLED';
  elsif locked_session.status not in ('open', 'full') then
    raise exception 'INVALID_TRANSITION';
  elsif locked_session.start_at <= now() then
    raise exception 'SESSION_STARTED';
  end if;

  select *
  into viewer_participant
  from public.session_participants participant_row
  where participant_row.session_id = locked_session.id
    and participant_row.profile_id = viewer_profile
  for update;

  if not found
    or viewer_participant.role <> 'guest'
    or viewer_participant.status not in ('requested', 'accepted') then
    raise exception 'NOT_ACCEPTED_PARTICIPANT';
  end if;

  update public.session_participants
  set status = 'withdrawn',
      played_confirmed = false
  where id = viewer_participant.id;

  if viewer_participant.status = 'accepted' and locked_session.status = 'full' then
    update public.sessions
    set status = 'open'
    where id = locked_session.id;
  end if;

  return 'OK';
end;
$$;

create or replace function public.cancel_session(p_session_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile bigint;
  locked_session public.sessions%rowtype;
begin
  viewer_profile := private.viewer_profile_id();
  locked_session := private.lock_and_expire_session(p_session_id);

  if locked_session.status = 'expired' then
    return 'SESSION_EXPIRED';
  end if;

  if viewer_profile is null or not private.is_session_host(locked_session.id, viewer_profile) then
    raise exception 'NOT_SESSION_HOST';
  end if;

  if locked_session.status = 'cancelled' then
    raise exception 'SESSION_CANCELLED';
  elsif locked_session.status not in ('open', 'full') then
    raise exception 'INVALID_TRANSITION';
  elsif locked_session.start_at <= now() then
    raise exception 'SESSION_STARTED';
  end if;

  update public.sessions
  set status = 'cancelled'
  where id = locked_session.id;

  return 'OK';
end;
$$;

create or replace function public.mark_session_played(p_session_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile bigint;
  locked_session public.sessions%rowtype;
begin
  viewer_profile := private.viewer_profile_id();
  locked_session := private.lock_and_expire_session(p_session_id);

  if locked_session.status = 'expired' then
    return 'SESSION_EXPIRED';
  end if;

  if viewer_profile is null or not private.is_session_host(locked_session.id, viewer_profile) then
    raise exception 'NOT_SESSION_HOST';
  end if;

  if locked_session.status = 'cancelled' then
    raise exception 'SESSION_CANCELLED';
  elsif locked_session.status not in ('open', 'full') then
    raise exception 'INVALID_TRANSITION';
  elsif locked_session.start_at > now() then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.sessions
  set status = 'played'
  where id = locked_session.id;

  return 'OK';
end;
$$;

create or replace function public.confirm_session_attendance(p_session_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile bigint;
  locked_session public.sessions%rowtype;
begin
  viewer_profile := private.viewer_profile_id();
  locked_session := private.lock_and_expire_session(p_session_id);

  if locked_session.status = 'expired' then
    return 'SESSION_EXPIRED';
  elsif locked_session.status = 'played'
    and locked_session.start_at <= now() - interval '24 hours' then
    return 'SESSION_EXPIRED';
  elsif locked_session.status = 'cancelled' then
    raise exception 'SESSION_CANCELLED';
  elsif locked_session.status not in ('open', 'full', 'played') then
    raise exception 'INVALID_TRANSITION';
  elsif locked_session.start_at > now() then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.session_participants
  set played_confirmed = true
  where session_id = locked_session.id
    and profile_id = viewer_profile
    and status = 'accepted';

  if not found then
    raise exception 'NOT_ACCEPTED_PARTICIPANT';
  end if;

  return 'OK';
end;
$$;

create or replace function public.create_report(
  p_session_id bigint,
  p_reported_profile_id bigint,
  p_reason text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  reporter_profile bigint;
  created_report_id bigint;
begin
  reporter_profile := private.viewer_profile_id();

  if reporter_profile is null then
    raise exception 'PROFILE_INCOMPLETE';
  end if;

  if num_nonnulls(p_session_id, p_reported_profile_id) <> 1
    or p_reason is null
    or btrim(p_reason) = '' then
    raise exception 'INVALID_TRANSITION';
  end if;

  if p_session_id is not null
    and not exists (select 1 from public.sessions where id = p_session_id) then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if p_reported_profile_id is not null
    and not exists (select 1 from public.profiles where id = p_reported_profile_id) then
    raise exception 'INVALID_TRANSITION';
  end if;

  insert into public.reports (reporter_profile_id, session_id, reported_profile_id, reason)
  values (reporter_profile, p_session_id, p_reported_profile_id, btrim(p_reason))
  returning id into created_report_id;

  return created_report_id;
end;
$$;

-- These views are definer views owned by the migration role.  Every SELECT
-- list is explicit so adding a profile field cannot silently make it public.
create or replace view public.session_discovery
with (security_barrier = true, security_invoker = false)
as
select
  session_row.id,
  session_row.id as session_id,
  sport_row.code as sport_code,
  session_row.court_id,
  court_row.name as court,
  court_row.district as court_district,
  court_row.lat as court_lat,
  court_row.lng as court_lng,
  session_row.start_at,
  session_row.play_type,
  session_row.ntrp_min,
  session_row.ntrp_max,
  session_row.slots_total,
  (
    session_row.slots_total
    - count(participant_row.id) filter (
      where participant_row.role = 'guest' and participant_row.status = 'accepted'
    )
  )::smallint as slots_remaining,
  session_row.notes,
  host_profile.nickname as host_nickname,
  host_profile.ntrp as host_ntrp,
  true as host_profile_complete,
  session_row.status
from public.sessions session_row
join public.sports sport_row on sport_row.id = session_row.sport_id
join public.courts court_row on court_row.id = session_row.court_id
join public.profiles host_profile on host_profile.id = session_row.host_profile_id
left join public.session_participants participant_row
  on participant_row.session_id = session_row.id
where session_row.status in ('open', 'full')
  and session_row.start_at > now()
  and sport_row.code = 'tennis'
  and sport_row.is_active
  and court_row.is_active
  and court_row.city = '台北市'
group by
  session_row.id,
  sport_row.code,
  court_row.name,
  court_row.district,
  court_row.lat,
  court_row.lng,
  host_profile.nickname,
  host_profile.ntrp;

create or replace view public.my_session_participations
with (security_barrier = true, security_invoker = false)
as
select
  session_row.id,
  session_row.id as session_id,
  sport_row.code as sport_code,
  session_row.court_id,
  court_row.name as court,
  court_row.district as court_district,
  court_row.lat as court_lat,
  court_row.lng as court_lng,
  session_row.start_at,
  session_row.play_type,
  session_row.ntrp_min,
  session_row.ntrp_max,
  session_row.slots_total,
  (
    session_row.slots_total
    - count(accepted_guest.id) filter (
      where accepted_guest.role = 'guest' and accepted_guest.status = 'accepted'
    )
  )::smallint as slots_remaining,
  session_row.notes,
  host_profile.nickname as host_nickname,
  host_profile.ntrp as host_ntrp,
  true as host_profile_complete,
  session_row.status,
  viewer_participant.role as viewer_role,
  viewer_participant.status as viewer_participant_status,
  viewer_participant.played_confirmed as viewer_played_confirmed,
  session_row.updated_at,
  (
    viewer_participant.role = 'host'
    and session_row.status in ('open', 'full')
    and session_row.start_at > now()
  ) as can_cancel,
  (
    viewer_participant.role = 'guest'
    and viewer_participant.status in ('requested', 'accepted')
    and session_row.status in ('open', 'full')
    and session_row.start_at > now()
  ) as can_withdraw,
  (
    viewer_participant.role = 'host'
    and session_row.status in ('open', 'full')
    and session_row.start_at <= now()
    and session_row.start_at > now() - interval '24 hours'
  ) as can_confirm_played,
  (
    viewer_participant.status = 'accepted'
    and session_row.status in ('open', 'full', 'played')
    and session_row.start_at <= now()
    and session_row.start_at > now() - interval '24 hours'
  ) as can_confirm_attendance
from public.sessions session_row
join public.session_participants viewer_participant
  on viewer_participant.session_id = session_row.id
  and viewer_participant.profile_id = (
    select profile_row.id
    from public.profiles profile_row
    where profile_row.user_id = auth.uid()
  )
join public.sports sport_row on sport_row.id = session_row.sport_id
join public.courts court_row on court_row.id = session_row.court_id
join public.profiles host_profile on host_profile.id = session_row.host_profile_id
left join public.session_participants accepted_guest
  on accepted_guest.session_id = session_row.id
group by
  session_row.id,
  sport_row.code,
  court_row.name,
  court_row.district,
  court_row.lat,
  court_row.lng,
  host_profile.nickname,
  host_profile.ntrp,
  viewer_participant.id,
  viewer_participant.role,
  viewer_participant.status,
  viewer_participant.played_confirmed;

create or replace view public.session_participant_roster
with (security_barrier = true, security_invoker = false)
as
select
  participant_row.session_id,
  participant_row.id as participant_id,
  participant_row.profile_id,
  profile_row.nickname,
  profile_row.ntrp,
  coalesce(
    array_agg(distinct play_type_row.play_type) filter (where play_type_row.play_type is not null),
    '{}'::text[]
  ) as play_types,
  coalesce(
    array_agg(distinct home_court_row.name) filter (where home_court_row.name is not null),
    '{}'::text[]
  ) as home_courts,
  participant_row.role,
  participant_row.status
from public.session_participants participant_row
join public.session_participants viewer_participant
  on viewer_participant.session_id = participant_row.session_id
  and viewer_participant.profile_id = (
    select profile_row.id
    from public.profiles profile_row
    where profile_row.user_id = auth.uid()
  )
join public.profiles profile_row on profile_row.id = participant_row.profile_id
left join public.profile_play_types play_type_row on play_type_row.profile_id = participant_row.profile_id
left join public.profile_courts profile_court_row on profile_court_row.profile_id = participant_row.profile_id
left join public.courts home_court_row on home_court_row.id = profile_court_row.court_id
where viewer_participant.role = 'host'
  or (
    viewer_participant.role = 'guest'
    and (participant_row.profile_id = viewer_participant.profile_id or participant_row.role = 'host')
  )
group by
  participant_row.session_id,
  participant_row.id,
  participant_row.profile_id,
  profile_row.nickname,
  profile_row.ntrp,
  participant_row.role,
  participant_row.status;

create or replace view public.session_contacts
with (security_barrier = true, security_invoker = false)
as
select
  viewer_participant.session_id,
  counterpart_participant.profile_id as counterpart_profile_id,
  counterpart_profile.nickname,
  counterpart_profile.line_id
from public.session_participants viewer_participant
join public.session_participants counterpart_participant
  on counterpart_participant.session_id = viewer_participant.session_id
  and counterpart_participant.profile_id <> viewer_participant.profile_id
join public.profiles counterpart_profile on counterpart_profile.id = counterpart_participant.profile_id
where viewer_participant.profile_id = (
    select profile_row.id
    from public.profiles profile_row
    where profile_row.user_id = auth.uid()
  )
  and viewer_participant.status = 'accepted'
  and counterpart_participant.status = 'accepted'
  and (
    (viewer_participant.role = 'host' and counterpart_participant.role = 'guest')
    or (viewer_participant.role = 'guest' and counterpart_participant.role = 'host')
  );

revoke all on table public.session_discovery, public.my_session_participations, public.session_participant_roster, public.session_contacts from public, anon, authenticated;
grant select on table public.session_discovery to anon, authenticated;
grant select on table public.my_session_participations, public.session_participant_roster, public.session_contacts to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.save_my_profile(text, numeric, text, bigint[], text[], text[]) from public, anon, authenticated;
revoke all on function public.create_session(bigint, text, timestamptz, numeric, numeric, integer, text) from public, anon, authenticated;
revoke all on function public.request_to_join_session(bigint) from public, anon, authenticated;
revoke all on function public.review_join_request(bigint, bigint, text) from public, anon, authenticated;
revoke all on function public.withdraw_from_session(bigint) from public, anon, authenticated;
revoke all on function public.cancel_session(bigint) from public, anon, authenticated;
revoke all on function public.mark_session_played(bigint) from public, anon, authenticated;
revoke all on function public.confirm_session_attendance(bigint) from public, anon, authenticated;
revoke all on function public.create_report(bigint, bigint, text) from public, anon, authenticated;

grant execute on function public.save_my_profile(text, numeric, text, bigint[], text[], text[]) to authenticated;
grant execute on function public.create_session(bigint, text, timestamptz, numeric, numeric, integer, text) to authenticated;
grant execute on function public.request_to_join_session(bigint) to authenticated;
grant execute on function public.review_join_request(bigint, bigint, text) to authenticated;
grant execute on function public.withdraw_from_session(bigint) to authenticated;
grant execute on function public.cancel_session(bigint) to authenticated;
grant execute on function public.mark_session_played(bigint) to authenticated;
grant execute on function public.confirm_session_attendance(bigint) to authenticated;
grant execute on function public.create_report(bigint, bigint, text) to authenticated;

-- Persistent expiry is intentionally database-native: a direct private call,
-- never an HTTP callback, and an idempotent job name for repeatable deploys.
create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  existing_job_id integer;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'expire-stale-tennis-sessions'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'expire-stale-tennis-sessions',
    '*/15 * * * *',
    'select private.expire_stale_sessions()'
  );
end;
$$;
