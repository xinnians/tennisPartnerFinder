-- Stage 3: private session chat, player blocks, message reports, and archival.

create table public.session_messages (
  id bigint generated always as identity primary key,
  session_id bigint not null references public.sessions(id) on delete cascade,
  sender_profile_id bigint references public.profiles(id),
  kind text not null default 'user' check (kind in ('user','system')),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table public.player_blocks (
  blocker_profile_id bigint not null references public.profiles(id) on delete cascade,
  blocked_profile_id bigint not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_profile_id, blocked_profile_id),
  check (blocker_profile_id <> blocked_profile_id)
);

create index session_messages_session_created_idx
  on public.session_messages (session_id, created_at, id);
create index player_blocks_blocked_blocker_idx
  on public.player_blocks (blocked_profile_id, blocker_profile_id);

alter table public.session_messages enable row level security;
alter table public.player_blocks enable row level security;

revoke all on table public.session_messages, public.player_blocks
from public, anon, authenticated;
revoke all on sequence public.session_messages_id_seq
from public, anon, authenticated;

alter table public.sessions
  add column archived_at timestamptz;

alter table public.reports
  add column message_id bigint references public.session_messages(id);
alter table public.reports
  drop constraint reports_check;
alter table public.reports
  add constraint reports_target_check check (
    (
      message_id is null
      and num_nonnulls(session_id, reported_profile_id) = 1
    )
    or (
      message_id is not null
      and session_id is null
    )
  );

create index reports_message_id_idx
  on public.reports (message_id)
  where message_id is not null;

alter table public.notification_outbox
  drop constraint notification_outbox_event_type_check;
alter table public.notification_outbox
  add constraint notification_outbox_event_type_check check (event_type in (
    'host_new_request', 'guest_request_reviewed', 'guest_invited', 'district_new_session',
    'court_new_session', 'session_updated', 'session_decided', 'session_cancelled',
    'chat_message'
  ));

alter table public.notification_outbox
  drop constraint notification_outbox_payload_check;
alter table public.notification_outbox
  add constraint notification_outbox_payload_check check (
    jsonb_typeof(payload) = 'object'
    and payload ?| array['court', 'message', 'slots_remaining', 'start_at', 'url']
    and not (payload ? 'line_id')
    and payload - array['court', 'message', 'slots_remaining', 'start_at', 'url'] = '{}'::jsonb
  );

create index notification_outbox_chat_throttle_idx
  on public.notification_outbox (session_id, recipient_profile_id, created_at desc)
  where event_type = 'chat_message';

create or replace function private.notification_pref_enabled(p_profile_id bigint, p_event_type text)
returns boolean language sql security definer set search_path = '' stable as $$
  select case p_event_type
    when 'host_new_request' then coalesce(pref_row.host_new_request_enabled, true)
    when 'guest_request_reviewed' then coalesce(pref_row.guest_request_reviewed_enabled, true)
    when 'guest_invited' then coalesce(pref_row.guest_invited_enabled, true)
    when 'district_new_session' then true
    when 'court_new_session' then true
    when 'session_updated' then true
    when 'session_decided' then true
    when 'session_cancelled' then true
    when 'chat_message' then true
    else false
  end
  from (select p_profile_id as profile_id) input_row
  left join public.notification_prefs pref_row on pref_row.profile_id = input_row.profile_id
$$;

create or replace function private.post_system_message(
  p_session_id bigint,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.session_messages (session_id, sender_profile_id, kind, body)
  values (p_session_id, null, 'system', p_body);
end;
$$;

create or replace function private.record_session_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('cancelled', 'played', 'expired')
    and new.status is distinct from old.status
    and old.status not in ('cancelled', 'played', 'expired') then
    new.archived_at := now();
  end if;
  return new;
end;
$$;

create trigger sessions_record_archive
before update on public.sessions
for each row execute function private.record_session_archive();

create or replace function private.record_session_participant_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  participant_nickname text;
begin
  if new.role <> 'guest' then
    return new;
  end if;

  if new.status = 'accepted'
    and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    select profile_row.nickname
    into participant_nickname
    from public.profiles profile_row
    where profile_row.id = new.profile_id;

    perform private.post_system_message(
      new.session_id,
      participant_nickname || ' 加入了球局'
    );
  elsif tg_op = 'UPDATE'
    and old.status = 'accepted'
    and new.status = 'withdrawn' then
    select profile_row.nickname
    into participant_nickname
    from public.profiles profile_row
    where profile_row.id = new.profile_id;

    perform private.post_system_message(
      new.session_id,
      participant_nickname || ' 退出了球局'
    );
  end if;

  return new;
end;
$$;

create trigger session_participants_record_message
after insert or update on public.session_participants
for each row execute function private.record_session_participant_message();

create or replace function private.record_session_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  court_name text;
begin
  if new.status in ('played', 'expired')
    and new.status is distinct from old.status then
    return new;
  end if;

  if new.status = 'cancelled'
    and new.status is distinct from old.status then
    perform private.post_system_message(
      new.id,
      '主揪已取消這場球局'
    );
  elsif old.decided_at is null
    and new.decided_at is not null then
    select court_row.name
    into court_name
    from public.courts court_row
    where court_row.id = new.court_id;

    perform private.post_system_message(
      new.id,
      '場地與時間已定案:' || court_name
    );
  elsif new.start_at is distinct from old.start_at
    or new.court_id is distinct from old.court_id
    or new.slots_total is distinct from old.slots_total then
    perform private.post_system_message(
      new.id,
      '球局資訊已更新'
    );
  end if;

  return new;
end;
$$;

create trigger sessions_record_message
after update on public.sessions
for each row execute function private.record_session_message();

create or replace view public.session_message_feed
with (security_barrier = true, security_invoker = false)
as
select
  message_row.id as message_id,
  message_row.session_id,
  message_row.sender_profile_id,
  sender_profile.nickname as sender_nickname,
  message_row.kind,
  message_row.body,
  message_row.created_at,
  coalesce(message_row.sender_profile_id = viewer_profile.id, false) as is_self
from public.session_messages message_row
left join public.profiles sender_profile
  on sender_profile.id = message_row.sender_profile_id
cross join lateral (
  select profile_row.id
  from public.profiles profile_row
  where profile_row.user_id = auth.uid()
) viewer_profile
where exists (
    select 1
    from public.session_participants viewer_participant
    where viewer_participant.session_id = message_row.session_id
      and viewer_participant.profile_id = viewer_profile.id
      and viewer_participant.status = 'accepted'
  )
  and (
    message_row.kind = 'system'
    or not exists (
      select 1
      from public.player_blocks block_row
      where (
        block_row.blocker_profile_id = viewer_profile.id
        and block_row.blocked_profile_id = message_row.sender_profile_id
      )
      or (
        block_row.blocker_profile_id = message_row.sender_profile_id
        and block_row.blocked_profile_id = viewer_profile.id
      )
    )
  );

revoke all on table public.session_message_feed
from public, anon, authenticated;
grant select on table public.session_message_feed to authenticated;

create or replace function public.post_session_message(
  p_session_id bigint,
  p_body text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile bigint;
  locked_session public.sessions%rowtype;
  recipient_row record;
  created_message_id bigint;
begin
  viewer_profile := private.viewer_profile_id();

  select *
  into locked_session
  from public.sessions session_row
  where session_row.id = p_session_id
  for update;

  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if viewer_profile is null
    or not exists (
      select 1
      from public.session_participants participant_row
      where participant_row.session_id = locked_session.id
        and participant_row.profile_id = viewer_profile
        and participant_row.status = 'accepted'
    ) then
    raise exception 'NOT_ACCEPTED_PARTICIPANT';
  end if;

  if locked_session.status not in ('open', 'full') then
    raise exception 'SESSION_ARCHIVED';
  end if;

  insert into public.session_messages (
    session_id,
    sender_profile_id,
    kind,
    body
  )
  values (
    locked_session.id,
    viewer_profile,
    'user',
    p_body
  )
  returning id into created_message_id;

  for recipient_row in
    select participant_row.profile_id
    from public.session_participants participant_row
    where participant_row.session_id = locked_session.id
      and participant_row.status = 'accepted'
      and participant_row.profile_id <> viewer_profile
  loop
    begin
      if not exists (
        select 1
        from public.notification_outbox outbox_row
        where outbox_row.event_type = 'chat_message'
          and outbox_row.session_id = locked_session.id
          and outbox_row.recipient_profile_id = recipient_row.profile_id
          and outbox_row.created_at > now() - interval '5 minutes'
      ) then
        perform private.enqueue_notification(
          'chat_message',
          recipient_row.profile_id,
          locked_session.id,
          private.notification_session_payload(
            locked_session.id,
            '群組有新訊息'
          )
        );
      end if;
    exception when others then
      raise warning 'chat notification recipient skipped for session %', locked_session.id;
    end;
  end loop;

  return created_message_id;
end;
$$;

create or replace function public.set_player_block(
  p_profile_id bigint,
  p_blocked boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile bigint;
begin
  viewer_profile := private.viewer_profile_id();

  if viewer_profile is null then
    raise exception 'PROFILE_INCOMPLETE';
  end if;

  if p_profile_id is null
    or p_blocked is null
    or p_profile_id = viewer_profile then
    raise exception 'INVALID_TRANSITION';
  end if;

  if p_blocked then
    insert into public.player_blocks (blocker_profile_id, blocked_profile_id)
    values (viewer_profile, p_profile_id)
    on conflict (blocker_profile_id, blocked_profile_id) do nothing;
  else
    delete from public.player_blocks
    where blocker_profile_id = viewer_profile
      and blocked_profile_id = p_profile_id;
  end if;

  return 'OK';
end;
$$;

-- Retain the effective Stage 2 definition, adding only the block predicate
-- after both host and guest identities are known.
create or replace function public.request_to_join_session(p_session_id bigint)
returns text language plpgsql security definer set search_path = '' as $$
declare guest_profile bigint; locked_session public.sessions%rowtype; prior_status text; accepted_guest_count integer; guest_ntrp numeric; outcome text := 'OK';
begin
  locked_session := private.lock_and_expire_session(p_session_id);
  if locked_session.status = 'expired' then return 'SESSION_EXPIRED'; end if;
  guest_profile := private.require_profile_gate('nickname');
  if locked_session.status = 'cancelled' then raise exception 'SESSION_CANCELLED'; elsif locked_session.status = 'full' then raise exception 'SESSION_FULL'; elsif locked_session.status <> 'open' then raise exception 'SESSION_NOT_OPEN';
  elsif (locked_session.venue_type = 'candidates' and locked_session.decided_at is null and locked_session.start_at <= now()) or (not (locked_session.venue_type = 'candidates' and locked_session.decided_at is null) and locked_session.start_at + interval '2 hours' <= now()) then raise exception 'SESSION_STARTED'; end if;
  if not exists (select 1 from public.courts court_row join public.sports sport_row on sport_row.id=locked_session.sport_id where court_row.id=locked_session.court_id and court_row.is_active and court_row.city='台北市' and sport_row.code='tennis' and sport_row.is_active) then raise exception 'INVALID_TRANSITION'; end if;
  if locked_session.host_profile_id = guest_profile then raise exception 'INVALID_TRANSITION'; end if;
  if exists (select 1 from public.player_blocks block_row where (block_row.blocker_profile_id=locked_session.host_profile_id and block_row.blocked_profile_id=guest_profile) or (block_row.blocker_profile_id=guest_profile and block_row.blocked_profile_id=locked_session.host_profile_id)) then raise exception 'BLOCKED'; end if;
  select status into prior_status from public.session_participants where session_id=locked_session.id and profile_id=guest_profile;
  if found then if prior_status='requested' then raise exception 'ALREADY_REQUESTED'; end if; raise exception 'ALREADY_DECIDED'; end if;
  select ntrp into guest_ntrp from public.profiles where id=guest_profile;
  if locked_session.join_mode = 'instant' and guest_ntrp is not null and (locked_session.ntrp_min is null or guest_ntrp between locked_session.ntrp_min and locked_session.ntrp_max) then
    select count(*) into accepted_guest_count from public.session_participants where session_id=locked_session.id and role='guest' and status='accepted';
    if accepted_guest_count >= locked_session.slots_total then update public.sessions set status='full' where id=locked_session.id and status='open'; raise exception 'SESSION_FULL'; end if;
    insert into public.session_participants(session_id,profile_id,role,status) values(locked_session.id,guest_profile,'guest','requested');
    update public.session_participants set status='accepted' where session_id=locked_session.id and profile_id=guest_profile;
    if accepted_guest_count + 1 = locked_session.slots_total then update public.sessions set status='full' where id=locked_session.id; update public.session_participants set status='declined' where session_id=locked_session.id and role='guest' and status in ('requested','invited'); end if;
    perform private.try_enqueue_session_notification('host_new_request',locked_session.host_profile_id,locked_session.id,'有球友直接加入你的球局。');
    return 'ACCEPTED';
  end if;
  insert into public.session_participants(session_id,profile_id,role,status) values(locked_session.id,guest_profile,'guest','requested');
  if locked_session.join_mode='instant' and guest_ntrp is null then outcome := 'OK_NTRP_MISSING';
  elsif locked_session.join_mode='instant' then outcome := 'OK_NTRP_OUT_OF_RANGE'; end if;
  perform private.try_enqueue_session_notification('host_new_request',locked_session.host_profile_id,locked_session.id,'有人申請加入你的球局。');
  return outcome;
end;
$$;

-- Retain the effective Stage 1 invite definition, adding only the block
-- predicate after both host and invitee identities are known.
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

  perform private.require_profile_gate('ntrp');

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
  elsif locked_session.start_at + interval '2 hours' <= now() then
    raise exception 'SESSION_STARTED';
  end if;

  if p_profile_id is null or p_profile_id = viewer_profile then
    raise exception 'INVALID_TRANSITION';
  end if;

  if exists (
    select 1
    from public.player_blocks block_row
    where (
      block_row.blocker_profile_id = viewer_profile
      and block_row.blocked_profile_id = p_profile_id
    )
    or (
      block_row.blocker_profile_id = p_profile_id
      and block_row.blocked_profile_id = viewer_profile
    )
  ) then
    raise exception 'BLOCKED';
  end if;

  if not exists (
    select 1
    from public.profiles profile_row
    where profile_row.id = p_profile_id
      and profile_row.is_public
      and private.profile_meets_gate(profile_row.id, 'directory')
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

drop function public.create_report(bigint, bigint, text);
create function public.create_report(
  p_session_id bigint,
  p_reported_profile_id bigint,
  p_reason text,
  p_message_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  reporter_profile bigint;
  created_report_id bigint;
  visible_message_sender bigint;
  visible_message_kind text;
begin
  reporter_profile := private.viewer_profile_id();

  if reporter_profile is null then
    raise exception 'PROFILE_INCOMPLETE';
  end if;

  if p_reason is null
    or btrim(p_reason) = ''
    or not (
      (
        p_message_id is null
        and num_nonnulls(p_session_id, p_reported_profile_id) = 1
      )
      or (
        p_message_id is not null
        and p_session_id is null
      )
    ) then
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

  if p_message_id is not null then
    select feed_row.sender_profile_id, feed_row.kind
    into visible_message_sender, visible_message_kind
    from public.session_message_feed feed_row
    where feed_row.message_id = p_message_id;

    if not found then
      raise exception 'MESSAGE_NOT_VISIBLE';
    end if;

    if visible_message_kind <> 'user' then
      raise exception 'INVALID_TRANSITION';
    end if;

    if p_reported_profile_id is not null
      and p_reported_profile_id is distinct from visible_message_sender then
      raise exception 'INVALID_TRANSITION';
    end if;
  end if;

  insert into public.reports (
    reporter_profile_id,
    session_id,
    reported_profile_id,
    message_id,
    reason
  )
  values (
    reporter_profile,
    p_session_id,
    p_reported_profile_id,
    p_message_id,
    btrim(p_reason)
  )
  returning id into created_report_id;

  return created_report_id;
end;
$$;

create or replace function private.purge_archived_session_messages()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  delete from public.session_messages message_row
  using public.sessions session_row
  where session_row.id = message_row.session_id
    and session_row.archived_at < now() - interval '90 days'
    and (
      message_row.kind = 'system'
      or (
        message_row.kind = 'user'
        and not exists (
          select 1
          from public.reports report_row
          where report_row.message_id = message_row.id
        )
      )
    );

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function private.post_system_message(bigint, text)
from public, anon, authenticated;
revoke all on function private.record_session_archive()
from public, anon, authenticated;
revoke all on function private.record_session_participant_message()
from public, anon, authenticated;
revoke all on function private.record_session_message()
from public, anon, authenticated;
revoke all on function private.purge_archived_session_messages()
from public, anon, authenticated;

revoke all on function public.post_session_message(bigint, text)
from public, anon, authenticated;
revoke all on function public.set_player_block(bigint, boolean)
from public, anon, authenticated;
revoke all on function public.create_report(bigint, bigint, text, bigint)
from public, anon, authenticated;

grant execute on function public.post_session_message(bigint, text)
to authenticated;
grant execute on function public.set_player_block(bigint, boolean)
to authenticated;
grant execute on function public.create_report(bigint, bigint, text, bigint)
to authenticated;

do $$
declare
  existing_job_id integer;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'purge-archived-session-messages'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'purge-archived-session-messages',
    '30 3 * * *',
    'select private.purge_archived_session_messages()'
  );
end;
$$;
