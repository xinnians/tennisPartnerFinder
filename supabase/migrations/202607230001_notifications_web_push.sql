-- Web Push notification ownership stays private to the signed-in account.
-- A profile skeleton permits notification setup before the public player
-- profile is complete; all existing session gates still require completeness.

alter table public.profiles
  alter column nickname drop not null,
  alter column ntrp drop not null;

create table public.push_subscriptions (
  id bigint generated always as identity primary key,
  profile_id bigint not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 1 and 4096),
  p256dh text not null check (char_length(p256dh) between 1 and 1024),
  auth text not null check (char_length(auth) between 1 and 1024),
  created_at timestamptz not null default now()
);

create table public.notification_prefs (
  profile_id bigint primary key references public.profiles (id) on delete cascade,
  host_new_request_enabled boolean not null default true,
  guest_request_reviewed_enabled boolean not null default true,
  guest_invited_enabled boolean not null default true
);

create table public.district_subscriptions (
  profile_id bigint not null references public.profiles (id) on delete cascade,
  district text not null check (
    district in ('中正區', '大同區', '中山區', '松山區', '大安區', '萬華區', '信義區', '士林區', '北投區', '內湖區', '南港區', '文山區')
  ),
  primary key (profile_id, district)
);

create table public.notification_outbox (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in ('host_new_request', 'guest_request_reviewed', 'guest_invited', 'district_new_session')),
  recipient_profile_id bigint not null references public.profiles (id) on delete cascade,
  session_id bigint not null references public.sessions (id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and not (payload ? 'line_id')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0)
);

create index push_subscriptions_profile_id_idx on public.push_subscriptions (profile_id);
create index notification_outbox_pending_idx on public.notification_outbox (created_at, id)
  where sent_at is null and attempts < 3;
create index district_subscriptions_district_profile_idx on public.district_subscriptions (district, profile_id);

alter table public.push_subscriptions enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.district_subscriptions enable row level security;
alter table public.notification_outbox enable row level security;

create or replace function public.owns_notification_profile(p_profile_id bigint)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select p_profile_id is not null and p_profile_id = private.viewer_profile_id()
$$;

revoke all on function public.owns_notification_profile(bigint) from public, anon, authenticated;
grant execute on function public.owns_notification_profile(bigint) to authenticated;

create policy "push subscriptions are readable by owner"
on public.push_subscriptions for select to authenticated
using (public.owns_notification_profile(profile_id));

create policy "push subscriptions are insertable by owner"
on public.push_subscriptions for insert to authenticated
with check (public.owns_notification_profile(profile_id));

create policy "push subscriptions are deletable by owner"
on public.push_subscriptions for delete to authenticated
using (public.owns_notification_profile(profile_id));

create policy "notification preferences are readable by owner"
on public.notification_prefs for select to authenticated
using (public.owns_notification_profile(profile_id));

create policy "district subscriptions are readable by owner"
on public.district_subscriptions for select to authenticated
using (public.owns_notification_profile(profile_id));

revoke all on table public.push_subscriptions, public.notification_prefs, public.district_subscriptions, public.notification_outbox
from public, anon, authenticated;
grant select, insert, delete on table public.push_subscriptions to authenticated;
grant select on table public.notification_prefs, public.district_subscriptions to authenticated;
grant usage, select on sequence public.push_subscriptions_id_seq to authenticated;

create or replace function private.ensure_notification_profile()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  notification_profile_id bigint;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  insert into public.profiles (user_id)
  values (auth.uid())
  on conflict (user_id) do update
  set user_id = excluded.user_id
  returning id into notification_profile_id;

  return notification_profile_id;
end;
$$;

create or replace function private.notification_pref_enabled(
  p_profile_id bigint,
  p_event_type text
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select case p_event_type
    when 'host_new_request' then coalesce(pref_row.host_new_request_enabled, true)
    when 'guest_request_reviewed' then coalesce(pref_row.guest_request_reviewed_enabled, true)
    when 'guest_invited' then coalesce(pref_row.guest_invited_enabled, true)
    when 'district_new_session' then true
    else false
  end
  from (select p_profile_id as profile_id) input_row
  left join public.notification_prefs pref_row on pref_row.profile_id = input_row.profile_id
$$;

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
  endpoint_owner_profile_id bigint;
begin
  if p_endpoint is null or btrim(p_endpoint) = ''
    or p_p256dh is null or btrim(p_p256dh) = ''
    or p_auth is null or btrim(p_auth) = ''
    or char_length(p_endpoint) > 4096
    or char_length(p_p256dh) > 1024
    or char_length(p_auth) > 1024 then
    raise exception 'INVALID_PUSH_SUBSCRIPTION';
  end if;

  viewer_profile_id := private.ensure_notification_profile();

  select profile_id
  into endpoint_owner_profile_id
  from public.push_subscriptions
  where endpoint = btrim(p_endpoint)
  for update;

  if found and endpoint_owner_profile_id <> viewer_profile_id then
    raise exception 'PUSH_ENDPOINT_OWNERSHIP';
  end if;

  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
  values (viewer_profile_id, btrim(p_endpoint), btrim(p_p256dh), btrim(p_auth))
  on conflict (endpoint) do update
  set p256dh = excluded.p256dh,
      auth = excluded.auth,
      created_at = now()
  where public.push_subscriptions.profile_id = viewer_profile_id;

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
begin
  if p_endpoint is null or btrim(p_endpoint) = '' then
    raise exception 'INVALID_PUSH_SUBSCRIPTION';
  end if;

  viewer_profile_id := private.ensure_notification_profile();
  delete from public.push_subscriptions
  where profile_id = viewer_profile_id
    and endpoint = btrim(p_endpoint);
  return 'OK';
end;
$$;

create or replace function public.set_notification_prefs(
  p_host_new_request_enabled boolean,
  p_guest_request_reviewed_enabled boolean,
  p_guest_invited_enabled boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile_id bigint;
begin
  if p_host_new_request_enabled is null
    or p_guest_request_reviewed_enabled is null
    or p_guest_invited_enabled is null then
    raise exception 'INVALID_NOTIFICATION_PREFS';
  end if;

  viewer_profile_id := private.ensure_notification_profile();
  insert into public.notification_prefs (
    profile_id,
    host_new_request_enabled,
    guest_request_reviewed_enabled,
    guest_invited_enabled
  )
  values (
    viewer_profile_id,
    p_host_new_request_enabled,
    p_guest_request_reviewed_enabled,
    p_guest_invited_enabled
  )
  on conflict (profile_id) do update
  set host_new_request_enabled = excluded.host_new_request_enabled,
      guest_request_reviewed_enabled = excluded.guest_request_reviewed_enabled,
      guest_invited_enabled = excluded.guest_invited_enabled;
  return 'OK';
end;
$$;

create or replace function public.set_district_subscriptions(p_districts text[])
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile_id bigint;
begin
  if p_districts is null
    or exists (
      select 1
      from unnest(p_districts) as requested_district(district)
      where requested_district.district is null
        or requested_district.district not in ('中正區', '大同區', '中山區', '松山區', '大安區', '萬華區', '信義區', '士林區', '北投區', '內湖區', '南港區', '文山區')
    ) then
    raise exception 'INVALID_NOTIFICATION_DISTRICT';
  end if;

  viewer_profile_id := private.ensure_notification_profile();
  delete from public.district_subscriptions
  where profile_id = viewer_profile_id;

  insert into public.district_subscriptions (profile_id, district)
  select viewer_profile_id, distinct_district.district
  from (
    select distinct requested_district.district
    from unnest(p_districts) as requested_district(district)
  ) as distinct_district;
  return 'OK';
end;
$$;

create or replace function private.notification_session_payload(
  p_session_id bigint,
  p_message text
)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'court', court_row.name,
    'start_at', session_row.start_at,
    'slots_remaining', (
      session_row.slots_total
      - count(participant_row.id) filter (
        where participant_row.role = 'guest' and participant_row.status = 'accepted'
      )
    ),
    'message', p_message,
    'url', '#/session/' || session_row.id::text
  )
  from public.sessions session_row
  join public.courts court_row on court_row.id = session_row.court_id
  left join public.session_participants participant_row on participant_row.session_id = session_row.id
  where session_row.id = p_session_id
  group by session_row.id, court_row.name
$$;

create or replace function private.enqueue_notification(
  p_event_type text,
  p_recipient_profile_id bigint,
  p_session_id bigint,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.notification_pref_enabled(p_recipient_profile_id, p_event_type) then
    return;
  end if;

  insert into public.notification_outbox (event_type, recipient_profile_id, session_id, payload)
  values (p_event_type, p_recipient_profile_id, p_session_id, p_payload);
end;
$$;

create or replace function private.try_enqueue_session_notification(
  p_event_type text,
  p_recipient_profile_id bigint,
  p_session_id bigint,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enqueue_notification(
    p_event_type,
    p_recipient_profile_id,
    p_session_id,
    private.notification_session_payload(p_session_id, p_message)
  );
exception when others then
  raise warning 'notification outbox insert skipped for event %', p_event_type;
end;
$$;

create or replace function private.try_enqueue_district_new_session(
  p_session_id bigint,
  p_district text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_row record;
begin
  for recipient_row in
    select subscription_row.profile_id
    from public.district_subscriptions subscription_row
    where subscription_row.district = p_district
  loop
    perform private.try_enqueue_session_notification(
      'district_new_session',
      recipient_row.profile_id,
      p_session_id,
      '你訂閱的行政區有新球局。'
    );
  end loop;
exception when others then
  raise warning 'district notification fan-out skipped';
end;
$$;

create or replace function public.create_session(
  p_court_id bigint,
  p_play_type text,
  p_start_at timestamptz,
  p_ntrp_min numeric,
  p_ntrp_max numeric,
  p_slots_total integer,
  p_notes text,
  p_join_mode text default 'approval'
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
  host_open_session_count integer;
  session_district text;
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
    or p_join_mode is null
    or p_join_mode not in ('approval', 'instant')
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

  select court_row.id, court_row.district
  into taipei_court_id, session_district
  from public.courts court_row
  where court_row.id = p_court_id
    and court_row.is_active
    and court_row.city = '台北市';

  if taipei_court_id is null then
    raise exception 'INVALID_TRANSITION';
  end if;

  perform 1
  from public.profiles profile_row
  where profile_row.id = host_profile
  for update;
  select count(*)
  into host_open_session_count
  from public.sessions session_row
  where session_row.host_profile_id = host_profile
    and session_row.status in ('open', 'full')
    and session_row.start_at > now();

  if host_open_session_count >= 5 then
    raise exception 'SESSION_LIMIT';
  end if;

  insert into public.sessions (
    sport_id, host_profile_id, court_id, play_type, start_at,
    ntrp_min, ntrp_max, slots_total, notes, join_mode
  )
  values (
    tennis_sport_id, host_profile, taipei_court_id, p_play_type, p_start_at,
    p_ntrp_min, p_ntrp_max, p_slots_total::smallint, p_notes, p_join_mode
  )
  returning id into created_session_id;

  insert into public.session_participants (session_id, profile_id, role, status)
  values (created_session_id, host_profile, 'host', 'accepted');

  perform private.try_enqueue_district_new_session(created_session_id, session_district);
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
  accepted_guest_count integer;
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

  if locked_session.join_mode = 'instant' then
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

    insert into public.session_participants (session_id, profile_id, role, status)
    values (locked_session.id, guest_profile, 'guest', 'requested');

    update public.session_participants
    set status = 'accepted'
    where session_id = locked_session.id
      and profile_id = guest_profile;

    if accepted_guest_count + 1 = locked_session.slots_total then
      update public.sessions
      set status = 'full'
      where id = locked_session.id;

      update public.session_participants
      set status = 'declined'
      where session_id = locked_session.id
        and role = 'guest'
        and status in ('requested', 'invited');
    end if;

    perform private.try_enqueue_session_notification(
      'host_new_request',
      locked_session.host_profile_id,
      locked_session.id,
      '有球友直接加入你的球局。'
    );
    return 'ACCEPTED';
  end if;

  insert into public.session_participants (session_id, profile_id, role, status)
  values (locked_session.id, guest_profile, 'guest', 'requested');

  perform private.try_enqueue_session_notification(
    'host_new_request',
    locked_session.host_profile_id,
    locked_session.id,
    '有人申請加入你的球局。'
  );
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
  notification_message text;
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
    notification_message := '你的加入申請未被接受。';
  else
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
        and status in ('requested', 'invited');
    end if;
    notification_message := '你的加入申請已被接受。';
  end if;

  perform private.try_enqueue_session_notification(
    'guest_request_reviewed',
    requested_participant.profile_id,
    locked_session.id,
    notification_message
  );
  return 'OK';
end;
$$;

create or replace function public.invite_to_session(
  p_session_id bigint,
  p_profile_id bigint
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile bigint;
  locked_session public.sessions%rowtype;
  prior_status text;
  recent_invite_count integer;
begin
  locked_session := private.lock_and_expire_session(p_session_id);

  if locked_session.status = 'expired' then
    return 'SESSION_EXPIRED';
  end if;

  viewer_profile := private.viewer_profile_id();

  if viewer_profile is null or not private.is_session_host(locked_session.id, viewer_profile) then
    raise exception 'NOT_SESSION_HOST';
  end if;

  if locked_session.status = 'cancelled' then
    raise exception 'SESSION_CANCELLED';
  elsif locked_session.status = 'full' then
    raise exception 'SESSION_FULL';
  elsif locked_session.status <> 'open' then
    raise exception 'SESSION_NOT_OPEN';
  elsif locked_session.start_at <= now() then
    raise exception 'SESSION_STARTED';
  end if;

  if p_profile_id is null or p_profile_id = viewer_profile then
    raise exception 'INVALID_TRANSITION';
  end if;

  if not exists (
    select 1
    from public.profiles profile_row
    where profile_row.id = p_profile_id
      and profile_row.is_public
      and private.has_complete_profile(profile_row.user_id)
  ) then
    raise exception 'INVITEE_NOT_AVAILABLE';
  end if;

  select participant_row.status
  into prior_status
  from public.session_participants participant_row
  where participant_row.session_id = locked_session.id
    and participant_row.profile_id = p_profile_id;

  if found then
    if prior_status = 'requested' then
      raise exception 'ALREADY_REQUESTED';
    elsif prior_status = 'invited' then
      raise exception 'ALREADY_INVITED';
    end if;
    raise exception 'ALREADY_DECIDED';
  end if;

  perform 1
  from public.profiles profile_row
  where profile_row.id = viewer_profile
  for update;

  select count(*)
  into recent_invite_count
  from public.session_participants participant_row
  join public.sessions session_row on session_row.id = participant_row.session_id
  where session_row.host_profile_id = viewer_profile
    and participant_row.initiated_by = 'host'
    and participant_row.created_at > now() - interval '24 hours';

  if recent_invite_count >= 10 then
    raise exception 'INVITE_LIMIT';
  end if;

  insert into public.session_participants (session_id, profile_id, role, status, initiated_by)
  values (locked_session.id, p_profile_id, 'guest', 'invited', 'host');

  perform private.try_enqueue_session_notification(
    'guest_invited',
    p_profile_id,
    locked_session.id,
    '你收到一個球局邀請。'
  );
  return 'OK';
end;
$$;

revoke all on function public.save_push_subscription(text, text, text) from public, anon, authenticated;
revoke all on function public.remove_push_subscription(text) from public, anon, authenticated;
revoke all on function public.set_notification_prefs(boolean, boolean, boolean) from public, anon, authenticated;
revoke all on function public.set_district_subscriptions(text[]) from public, anon, authenticated;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
grant execute on function public.remove_push_subscription(text) to authenticated;
grant execute on function public.set_notification_prefs(boolean, boolean, boolean) to authenticated;
grant execute on function public.set_district_subscriptions(text[]) to authenticated;

revoke all on function public.create_session(bigint, text, timestamptz, numeric, numeric, integer, text, text) from public, anon, authenticated;
revoke all on function public.request_to_join_session(bigint) from public, anon, authenticated;
revoke all on function public.review_join_request(bigint, bigint, text) from public, anon, authenticated;
revoke all on function public.invite_to_session(bigint, bigint) from public, anon, authenticated;
grant execute on function public.create_session(bigint, text, timestamptz, numeric, numeric, integer, text, text) to authenticated;
grant execute on function public.request_to_join_session(bigint) to authenticated;
grant execute on function public.review_join_request(bigint, bigint, text) to authenticated;
grant execute on function public.invite_to_session(bigint, bigint) to authenticated;
