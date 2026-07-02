-- Tennis Partner Finder MVP schema draft.
-- Target backend: Supabase Auth + Postgres + Row Level Security.
-- This migration is intentionally UI-neutral; the frontend will be wired in a later milestone.

create table if not exists public.profiles (
  id bigint generated always as identity primary key,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  nickname text not null,
  ntrp numeric(2, 1) not null check (ntrp >= 1.0 and ntrp <= 7.0),
  line_id text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.courts (
  id bigint generated always as identity primary key,
  name text not null unique,
  district text not null,
  lat numeric(9, 6) not null,
  lng numeric(9, 6) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profile_courts (
  profile_id bigint not null references public.profiles (id) on delete cascade,
  court_id bigint not null references public.courts (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (profile_id, court_id)
);

create table if not exists public.profile_play_types (
  profile_id bigint not null references public.profiles (id) on delete cascade,
  play_type text not null check (play_type in ('單打', '雙打', '對拉', '練球')),
  created_at timestamptz not null default now(),
  primary key (profile_id, play_type)
);

create table if not exists public.profile_slots (
  profile_id bigint not null references public.profiles (id) on delete cascade,
  slot_code text not null check (slot_code in ('wd-m', 'wd-a', 'wd-e', 'we-m', 'we-a', 'we-e')),
  created_at timestamptz not null default now(),
  primary key (profile_id, slot_code)
);

create table if not exists public.partner_requests (
  id bigint generated always as identity primary key,
  profile_id bigint not null references public.profiles (id) on delete cascade,
  court_id bigint not null references public.courts (id) on delete restrict,
  desired_time_text text not null,
  ntrp_min numeric(2, 1) check (ntrp_min is null or (ntrp_min >= 1.0 and ntrp_min <= 7.0)),
  ntrp_max numeric(2, 1) check (ntrp_max is null or (ntrp_max >= 1.0 and ntrp_max <= 7.0)),
  raw_skill_text text,
  request_text text not null,
  status text not null default 'open' check (status in ('open', 'closed', 'expired', 'removed')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ntrp_min is null or ntrp_max is null or ntrp_min <= ntrp_max)
);

create table if not exists public.reports (
  id bigint generated always as identity primary key,
  reporter_profile_id bigint not null references public.profiles (id) on delete cascade,
  reported_profile_id bigint references public.profiles (id) on delete set null,
  partner_request_id bigint references public.partner_requests (id) on delete set null,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists courts_set_updated_at on public.courts;
create trigger courts_set_updated_at
before update on public.courts
for each row execute function public.set_updated_at();

drop trigger if exists partner_requests_set_updated_at on public.partner_requests;
create trigger partner_requests_set_updated_at
before update on public.partner_requests
for each row execute function public.set_updated_at();

create index if not exists courts_active_name_idx on public.courts (name) where is_active;
create index if not exists profiles_public_ntrp_idx on public.profiles (ntrp, updated_at desc) where is_public;
create index if not exists profile_courts_court_id_idx on public.profile_courts (court_id);
create index if not exists profile_play_types_type_profile_idx on public.profile_play_types (play_type, profile_id);
create index if not exists profile_slots_slot_profile_idx on public.profile_slots (slot_code, profile_id);
create index if not exists partner_requests_profile_id_idx on public.partner_requests (profile_id);
create index if not exists partner_requests_court_id_idx on public.partner_requests (court_id);
create index if not exists partner_requests_open_expiry_idx on public.partner_requests (status, expires_at)
  where status = 'open';
create index if not exists reports_reporter_profile_id_idx on public.reports (reporter_profile_id);
create index if not exists reports_reported_profile_id_idx on public.reports (reported_profile_id);
create index if not exists reports_partner_request_id_idx on public.reports (partner_request_id);

alter table public.profiles enable row level security;
alter table public.courts enable row level security;
alter table public.profile_courts enable row level security;
alter table public.profile_play_types enable row level security;
alter table public.profile_slots enable row level security;
alter table public.partner_requests enable row level security;
alter table public.reports enable row level security;

create policy "active courts are readable"
on public.courts for select
to anon, authenticated
using (is_active);

create policy "profiles are readable by owner"
on public.profiles for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "profiles are insertable by owner"
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "profiles are updatable by owner"
on public.profiles for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "profile courts are manageable by profile owner"
on public.profile_courts for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = profile_id and p.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = profile_id and p.user_id = (select auth.uid())
  )
);

create policy "profile play types are manageable by profile owner"
on public.profile_play_types for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = profile_id and p.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = profile_id and p.user_id = (select auth.uid())
  )
);

create policy "profile slots are manageable by profile owner"
on public.profile_slots for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = profile_id and p.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = profile_id and p.user_id = (select auth.uid())
  )
);

create policy "open partner requests are readable"
on public.partner_requests for select
to anon, authenticated
using (status = 'open' and expires_at > now());

create policy "partner requests are insertable by owner"
on public.partner_requests for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = profile_id and p.user_id = (select auth.uid())
  )
);

create policy "partner requests are updatable by owner"
on public.partner_requests for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = profile_id and p.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = profile_id and p.user_id = (select auth.uid())
  )
);

create policy "reports are insertable by reporter"
on public.reports for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = reporter_profile_id and p.user_id = (select auth.uid())
  )
);

create policy "reports are readable by reporter"
on public.reports for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = reporter_profile_id and p.user_id = (select auth.uid())
  )
);

create or replace view public.public_profile_discovery as
select
  p.id as profile_id,
  p.nickname,
  p.ntrp,
  p.line_id,
  c.id as court_id,
  c.name as court_name,
  c.district as court_district,
  c.lat as court_lat,
  c.lng as court_lng,
  array_remove(array_agg(distinct ppt.play_type), null) as play_types,
  array_remove(array_agg(distinct ps.slot_code), null) as slot_codes
from public.profiles p
join public.profile_courts pc on pc.profile_id = p.id
join public.courts c on c.id = pc.court_id and c.is_active
left join public.profile_play_types ppt on ppt.profile_id = p.id
left join public.profile_slots ps on ps.profile_id = p.id
where p.is_public
group by p.id, p.nickname, p.ntrp, p.line_id, c.id, c.name, c.district, c.lat, c.lng;

grant select on public.courts to anon, authenticated;
grant select on public.public_profile_discovery to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.profile_courts to authenticated;
grant select, insert, update, delete on public.profile_play_types to authenticated;
grant select, insert, update, delete on public.profile_slots to authenticated;
grant select on public.partner_requests to anon, authenticated;
grant insert, update on public.partner_requests to authenticated;
grant select, insert on public.reports to authenticated;
grant usage, select on all sequences in schema public to authenticated;

insert into public.courts (name, district, lat, lng)
values
  ('台北網球中心', '內湖區', 25.069, 121.593),
  ('大安森林公園網球場', '大安區', 25.030, 121.536),
  ('中正網球中心', '中正區', 25.018, 121.523),
  ('迎風河濱公園網球場', '松山區', 25.068, 121.557),
  ('百齡河濱公園網球場', '士林區', 25.089, 121.514),
  ('青年公園網球場', '萬華區', 25.022, 121.504)
on conflict (name) do update
set district = excluded.district,
    lat = excluded.lat,
    lng = excluded.lng,
    is_active = true,
    updated_at = now();
