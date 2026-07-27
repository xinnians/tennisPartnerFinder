-- Stage 2: three venue flows, session management, candidate decisions, and
-- court-subscription notifications. Stage 1 is intentionally left immutable.

alter table public.sessions add column fee_note text;

alter table public.notification_outbox drop constraint notification_outbox_event_type_check;
alter table public.notification_outbox
  add constraint notification_outbox_event_type_check check (event_type in (
    'host_new_request', 'guest_request_reviewed', 'guest_invited', 'district_new_session',
    'court_new_session', 'session_updated', 'session_decided', 'session_cancelled'
  ));
alter table public.notification_outbox drop constraint notification_outbox_payload_check;
alter table public.notification_outbox
  add constraint notification_outbox_payload_check check (
    jsonb_typeof(payload) = 'object'
    and payload ?| array['court', 'message', 'slots_remaining', 'start_at', 'url']
    and not (payload ? 'line_id')
    and payload - array['court', 'message', 'slots_remaining', 'start_at', 'url'] = '{}'::jsonb
  );

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
    else false
  end
  from (select p_profile_id as profile_id) input_row
  left join public.notification_prefs pref_row on pref_row.profile_id = input_row.profile_id
$$;

create or replace function private.try_enqueue_court_new_session(p_session_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare recipient_row record;
begin
  for recipient_row in
    select subscription_row.profile_id, min(court_row.name) as name
    from public.court_subscriptions subscription_row
    join public.courts court_row on court_row.id = subscription_row.court_id
    where subscription_row.court_id in (
      select case when session_row.venue_type = 'candidates' then candidate_row.court_id else session_row.court_id end
      from public.sessions session_row
      left join public.session_candidate_courts candidate_row on candidate_row.session_id = session_row.id
      where session_row.id = p_session_id
    )
    group by subscription_row.profile_id
  loop
    perform private.enqueue_notification(
      'court_new_session', recipient_row.profile_id, p_session_id,
      (private.notification_session_payload(p_session_id, '你訂閱的球場有新球局。') || jsonb_build_object('court', recipient_row.name))
    );
  end loop;
exception when others then
  raise warning 'court notification fan-out skipped';
end;
$$;

create or replace function private.expire_candidate_session(p_session_id bigint)
returns public.sessions language plpgsql security definer set search_path = '' as $$
declare locked_session public.sessions%rowtype; recipient_row record;
begin
  select * into locked_session from public.sessions where id = p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if locked_session.status in ('open', 'full')
    and locked_session.venue_type = 'candidates'
    and locked_session.decided_at is null
    and locked_session.start_at <= now() then
    update public.sessions set status = 'expired' where id = locked_session.id returning * into locked_session;
    for recipient_row in select profile_id from public.session_participants where session_id = locked_session.id and role = 'guest' and status = 'accepted' loop
      perform private.try_enqueue_session_notification('session_updated', recipient_row.profile_id, locked_session.id, '候選球局逾期未定案,已下架');
    end loop;
  end if;
  return locked_session;
end;
$$;

-- The legacy transition guard required every expiry to wait 24 hours. A
-- candidate session has a distinct expiry anchor: its undecided range start.
create or replace function private.enforce_session_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'open' or new.start_at < now() - interval '5 minutes' then raise exception 'INVALID_TRANSITION'; end if;
    return new;
  end if;
  if new.host_profile_id is distinct from old.host_profile_id
    or (new.start_at is distinct from old.start_at and coalesce(current_setting('private.allow_session_time_change', true), '') <> '1') then raise exception 'INVALID_TRANSITION'; end if;
  if new.status is distinct from old.status then
    if not ((old.status='open' and new.status in ('full','cancelled','played','expired')) or (old.status='full' and new.status in ('open','cancelled','played','expired'))) then raise exception 'INVALID_TRANSITION'; end if;
    if (
      new.status in ('open','full','cancelled') and old.start_at <= now() and not ((old.status='full' and new.status='open' and pg_trigger_depth()>1 and (select count(*) from public.session_participants where session_id=new.id and role='guest' and status='accepted') < new.slots_total) or (old.status='open' and new.status='full' and (select count(*) from public.session_participants where session_id=new.id and role='guest' and status='accepted') >= new.slots_total))
    ) or (
      new.status='played' and (old.start_at > now() or old.start_at <= now()-interval '24 hours')
    ) or (
      new.status='expired' and old.start_at > now()-interval '24 hours'
      and not (old.venue_type='candidates' and old.decided_at is null and old.start_at <= now())
    ) then raise exception 'INVALID_TRANSITION'; end if;
  end if;
  return new;
end;
$$;

create or replace function private.lock_and_expire_session(p_session_id bigint)
returns public.sessions language plpgsql security definer set search_path = '' as $$
declare locked_session public.sessions%rowtype; recipient_row record;
begin
  select * into locked_session from public.sessions session_row where session_row.id = p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if locked_session.status in ('open', 'full') and (
    locked_session.start_at <= now() - interval '24 hours'
    or (locked_session.venue_type = 'candidates' and locked_session.decided_at is null and locked_session.start_at <= now())
  ) then
    update public.sessions set status = 'expired' where id = locked_session.id returning * into locked_session;
    if locked_session.venue_type = 'candidates' and locked_session.decided_at is null then
      for recipient_row in select profile_id from public.session_participants where session_id = locked_session.id and role = 'guest' and status = 'accepted' loop
        perform private.try_enqueue_session_notification('session_updated', recipient_row.profile_id, locked_session.id, '候選球局逾期未定案,已下架');
      end loop;
    end if;
  end if;
  return locked_session;
end;
$$;

create or replace function private.expire_stale_sessions()
returns integer language plpgsql security definer set search_path = '' as $$
declare changed_count integer; session_row record; recipient_row record;
begin
  for session_row in
    update public.sessions set status = 'expired'
    where status in ('open','full') and (
      start_at <= now() - interval '24 hours'
      or (venue_type = 'candidates' and decided_at is null and start_at <= now())
    ) returning *
  loop
    changed_count := coalesce(changed_count, 0) + 1;
    if session_row.venue_type = 'candidates' and session_row.decided_at is null then
      for recipient_row in select profile_id from public.session_participants where session_id = session_row.id and role = 'guest' and status = 'accepted' loop
        perform private.try_enqueue_session_notification('session_updated', recipient_row.profile_id, session_row.id, '候選球局逾期未定案,已下架');
      end loop;
    end if;
  end loop;
  return coalesce(changed_count, 0);
end;
$$;

drop function public.create_session(bigint, text, timestamptz, numeric, numeric, integer, text, text);
create function public.create_session(
  p_court_id bigint, p_play_type text, p_start_at timestamptz, p_ntrp_min numeric,
  p_ntrp_max numeric, p_slots_total integer, p_notes text, p_join_mode text default 'approval',
  p_venue_type text default 'booked', p_candidate_court_ids bigint[] default null,
  p_range_end timestamptz default null, p_fee_note text default null
) returns bigint language plpgsql security definer set search_path = '' as $$
declare host_profile bigint; tennis_sport_id bigint; taipei_court_id bigint; created_session_id bigint;
  host_open_session_count integer; candidate_count integer; duplicate_count integer;
begin
  host_profile := private.require_profile_gate('ntrp');
  if p_start_at is null or p_start_at < now() - interval '5 minutes' then raise exception 'SESSION_STARTED'; end if;
  if p_play_type is null or p_play_type not in ('單打','雙打','對拉','練球') or p_slots_total is null or p_slots_total not between 1 and 3
    or (p_notes is not null and char_length(p_notes) > 500) or (p_fee_note is not null and char_length(p_fee_note) > 500)
    or p_join_mode is null or p_join_mode not in ('approval','instant') or p_venue_type not in ('booked','walk_on','candidates')
    or ((p_ntrp_min is null) <> (p_ntrp_max is null)) or (p_ntrp_min is not null and (p_ntrp_min not between 1.0 and 7.0 or p_ntrp_max not between 1.0 and 7.0 or p_ntrp_min > p_ntrp_max))
  then raise exception 'INVALID_TRANSITION'; end if;
  select id into tennis_sport_id from public.sports where code = 'tennis' and is_active;
  if tennis_sport_id is null then raise exception 'INVALID_TRANSITION'; end if;
  if p_venue_type in ('booked','walk_on') then
    if p_candidate_court_ids is not null or p_range_end is not null then raise exception 'INVALID_VENUE_INPUT'; end if;
    select id into taipei_court_id from public.courts where id = p_court_id and is_active and city = '台北市';
    if taipei_court_id is null then raise exception 'INVALID_VENUE_INPUT'; end if;
  else
    candidate_count := cardinality(p_candidate_court_ids);
    duplicate_count := (select count(*) - count(distinct court_id) from unnest(p_candidate_court_ids) as candidate(court_id));
    if candidate_count is null or candidate_count not between 2 and 3 or duplicate_count <> 0 or p_range_end is null or p_range_end <= p_start_at then raise exception 'INVALID_VENUE_INPUT'; end if;
    if (select count(*) from public.courts where id = any(p_candidate_court_ids) and is_active and city = '台北市') <> candidate_count then raise exception 'INVALID_VENUE_INPUT'; end if;
    taipei_court_id := p_candidate_court_ids[1];
  end if;
  perform 1 from public.profiles where id = host_profile for update;
  select count(*) into host_open_session_count from public.sessions where host_profile_id = host_profile and status in ('open','full') and start_at + interval '2 hours' > now();
  if host_open_session_count >= 5 then raise exception 'SESSION_LIMIT'; end if;
  insert into public.sessions (sport_id,host_profile_id,court_id,play_type,start_at,ntrp_min,ntrp_max,slots_total,notes,join_mode,venue_type,range_end,fee_note)
  values (tennis_sport_id,host_profile,taipei_court_id,p_play_type,p_start_at,p_ntrp_min,p_ntrp_max,p_slots_total::smallint,p_notes,p_join_mode,p_venue_type,p_range_end,p_fee_note)
  returning id into created_session_id;
  if p_venue_type = 'candidates' then
    insert into public.session_candidate_courts(session_id,court_id,position)
    select created_session_id, candidate.court_id, candidate.position::smallint from unnest(p_candidate_court_ids) with ordinality as candidate(court_id,position);
  end if;
  insert into public.session_participants(session_id,profile_id,role,status) values(created_session_id,host_profile,'host','accepted');
  perform private.try_enqueue_court_new_session(created_session_id);
  return created_session_id;
end;
$$;

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

create or replace function public.update_session(p_session_id bigint, p_start_at timestamptz, p_court_id bigint, p_slots_missing integer, p_ntrp_min numeric, p_ntrp_max numeric, p_play_type text, p_fee_note text, p_note text)
returns text language plpgsql security definer set search_path = '' as $$
declare viewer_profile bigint; locked_session public.sessions%rowtype; recipient_row record; accepted_guest_count integer;
begin
  viewer_profile := private.viewer_profile_id(); locked_session := private.lock_and_expire_session(p_session_id);
  if locked_session.status='expired' then return 'SESSION_EXPIRED'; end if;
  if viewer_profile is null or not private.is_session_host(locked_session.id,viewer_profile) then raise exception 'NOT_SESSION_HOST'; end if;
  if locked_session.status not in ('open','full') then raise exception 'SESSION_NOT_OPEN'; end if;
  if not (locked_session.venue_type='candidates' and locked_session.decided_at is null) and locked_session.start_at + interval '2 hours' <= now() then raise exception 'SESSION_STARTED'; end if;
  if locked_session.venue_type='candidates' and p_court_id is distinct from locked_session.court_id then raise exception 'INVALID_VENUE_INPUT'; end if;
  if locked_session.venue_type='candidates' and locked_session.decided_at is null and p_start_at is distinct from locked_session.start_at then raise exception 'INVALID_VENUE_INPUT'; end if;
  if p_start_at is null or p_start_at < now() - interval '5 minutes' or p_slots_missing not between 1 and 3 or p_play_type not in ('單打','雙打','對拉','練球') or ((p_ntrp_min is null) <> (p_ntrp_max is null)) or (p_ntrp_min is not null and (p_ntrp_min not between 1 and 7 or p_ntrp_max not between 1 and 7 or p_ntrp_min>p_ntrp_max)) or (p_note is not null and char_length(p_note)>500) or (p_fee_note is not null and char_length(p_fee_note)>500) then raise exception 'INVALID_TRANSITION'; end if;
  if locked_session.venue_type in ('booked','walk_on') and not exists(select 1 from public.courts where id=p_court_id and is_active and city='台北市') then raise exception 'INVALID_VENUE_INPUT'; end if;
  select count(*) into accepted_guest_count from public.session_participants where session_id=locked_session.id and role='guest' and status='accepted';
  perform set_config('private.allow_session_time_change','1',true);
  update public.sessions set start_at=p_start_at, court_id=p_court_id, slots_total=p_slots_missing::smallint, ntrp_min=p_ntrp_min, ntrp_max=p_ntrp_max, play_type=p_play_type, fee_note=p_fee_note, notes=p_note, status=case when accepted_guest_count >= p_slots_missing then 'full' else 'open' end where id=locked_session.id;
  perform set_config('private.allow_session_time_change','',true);
  for recipient_row in select profile_id from public.session_participants where session_id=locked_session.id and role='guest' and status='accepted' loop perform private.try_enqueue_session_notification('session_updated',recipient_row.profile_id,locked_session.id,'球局資訊已更新。'); end loop;
  return 'OK';
end;
$$;

create function public.decide_session_court(p_session_id bigint, p_court_id bigint, p_start_at timestamptz)
returns text language plpgsql security definer set search_path = '' as $$
declare viewer_profile bigint; locked_session public.sessions%rowtype; recipient_row record;
begin
  viewer_profile := private.viewer_profile_id(); locked_session := private.lock_and_expire_session(p_session_id);
  if locked_session.status='expired' then return 'SESSION_EXPIRED'; end if;
  if viewer_profile is null or not private.is_session_host(locked_session.id,viewer_profile) then raise exception 'NOT_SESSION_HOST'; end if;
  if locked_session.status not in ('open','full') then raise exception 'SESSION_NOT_OPEN'; end if;
  if locked_session.venue_type <> 'candidates' or locked_session.decided_at is not null or p_start_at is null or p_start_at < locked_session.start_at or p_start_at > locked_session.range_end or not exists(select 1 from public.session_candidate_courts where session_id=locked_session.id and court_id=p_court_id) then raise exception 'INVALID_DECISION'; end if;
  perform set_config('private.allow_session_time_change','1',true);
  update public.sessions set court_id=p_court_id,start_at=p_start_at,decided_at=now() where id=locked_session.id;
  perform set_config('private.allow_session_time_change','',true);
  for recipient_row in select profile_id from public.session_participants where session_id=locked_session.id and role='guest' and status='accepted' loop perform private.try_enqueue_session_notification('session_decided',recipient_row.profile_id,locked_session.id,'候選球局已定案。'); end loop;
  return 'OK';
end;
$$;

create or replace function public.cancel_session(p_session_id bigint)
returns text language plpgsql security definer set search_path = '' as $$
declare viewer_profile bigint; locked_session public.sessions%rowtype; recipient_row record;
begin
  viewer_profile := private.viewer_profile_id(); locked_session := private.lock_and_expire_session(p_session_id);
  if locked_session.status='expired' then return 'SESSION_EXPIRED'; end if;
  if viewer_profile is null or not private.is_session_host(locked_session.id,viewer_profile) then raise exception 'NOT_SESSION_HOST'; end if;
  if locked_session.status='cancelled' then raise exception 'SESSION_CANCELLED'; elsif locked_session.status not in ('open','full') then raise exception 'INVALID_TRANSITION'; elsif locked_session.start_at<=now() then raise exception 'SESSION_STARTED'; end if;
  update public.sessions set status='cancelled' where id=locked_session.id;
  for recipient_row in select profile_id from public.session_participants where session_id=locked_session.id and role='guest' and status='accepted' loop perform private.try_enqueue_session_notification('session_cancelled',recipient_row.profile_id,locked_session.id,'球局已取消。'); end loop;
  return 'OK';
end;
$$;

create or replace view public.session_discovery with (security_barrier=true, security_invoker=false) as
select session_row.id, session_row.id as session_id, sport_row.code as sport_code, session_row.court_id, court_row.name as court, court_row.district as court_district, court_row.lat as court_lat, court_row.lng as court_lng, session_row.start_at, session_row.play_type, session_row.ntrp_min, session_row.ntrp_max, session_row.slots_total,
  (session_row.slots_total-count(participant_row.id) filter(where participant_row.role='guest' and participant_row.status='accepted'))::smallint as slots_remaining,
  session_row.notes, host_profile.nickname as host_nickname, host_profile.ntrp as host_ntrp, private.profile_meets_gate(host_profile.id,'ntrp') as host_profile_complete, session_row.status, session_row.join_mode, session_row.venue_type, session_row.range_end,
  case when session_row.venue_type='candidates' then (select array_agg(candidate_court.court_id order by candidate_court.position) from public.session_candidate_courts candidate_court where candidate_court.session_id=session_row.id) else null end as candidate_court_ids,
  session_row.fee_note
from public.sessions session_row join public.sports sport_row on sport_row.id=session_row.sport_id join public.courts court_row on court_row.id=session_row.court_id join public.profiles host_profile on host_profile.id=session_row.host_profile_id left join public.session_participants participant_row on participant_row.session_id=session_row.id
where session_row.status in ('open','full') and (case when session_row.venue_type='candidates' and session_row.decided_at is null then session_row.start_at>now() else session_row.start_at+interval '2 hours'>now() end) and sport_row.code='tennis' and sport_row.is_active and court_row.is_active and court_row.city='台北市'
group by session_row.id,sport_row.code,court_row.name,court_row.district,court_row.lat,court_row.lng,host_profile.id,host_profile.nickname,host_profile.ntrp,session_row.join_mode;

create or replace view public.my_session_participations with (security_barrier=true, security_invoker=false) as
select session_row.id, session_row.id as session_id, sport_row.code as sport_code, session_row.court_id, court_row.name as court, court_row.district as court_district, court_row.lat as court_lat, court_row.lng as court_lng, session_row.start_at, session_row.play_type, session_row.ntrp_min, session_row.ntrp_max, session_row.slots_total,
  (session_row.slots_total-count(accepted_guest.id) filter(where accepted_guest.role='guest' and accepted_guest.status='accepted'))::smallint as slots_remaining, session_row.notes,host_profile.nickname as host_nickname,host_profile.ntrp as host_ntrp,true as host_profile_complete,session_row.status,viewer_participant.role as viewer_role,viewer_participant.status as viewer_participant_status,viewer_participant.played_confirmed as viewer_played_confirmed,session_row.updated_at,
  (viewer_participant.role='host' and session_row.status in ('open','full') and session_row.start_at>now()) as can_cancel,(viewer_participant.role='guest' and viewer_participant.status in ('requested','accepted') and session_row.status in ('open','full') and session_row.start_at>now()) as can_withdraw,(viewer_participant.role='host' and session_row.status in ('open','full') and session_row.start_at<=now() and session_row.start_at>now()-interval '24 hours') as can_confirm_played,(viewer_participant.status='accepted' and session_row.status in ('open','full','played') and session_row.start_at<=now() and session_row.start_at>now()-interval '24 hours') as can_confirm_attendance,session_row.join_mode,(viewer_participant.status='invited' and session_row.status in ('open','full') and session_row.start_at+interval '2 hours'>now()) as can_respond_invite,session_row.venue_type,session_row.range_end,session_row.decided_at,session_row.fee_note
from public.sessions session_row join public.session_participants viewer_participant on viewer_participant.session_id=session_row.id and viewer_participant.profile_id=(select id from public.profiles where user_id=auth.uid()) join public.sports sport_row on sport_row.id=session_row.sport_id join public.courts court_row on court_row.id=session_row.court_id join public.profiles host_profile on host_profile.id=session_row.host_profile_id left join public.session_participants accepted_guest on accepted_guest.session_id=session_row.id
group by session_row.id,sport_row.code,court_row.name,court_row.district,court_row.lat,court_row.lng,host_profile.nickname,host_profile.ntrp,viewer_participant.id,viewer_participant.role,viewer_participant.status,viewer_participant.played_confirmed,session_row.join_mode;

revoke all on function public.create_session(bigint,text,timestamptz,numeric,numeric,integer,text,text,text,bigint[],timestamptz,text) from public,anon,authenticated;
revoke all on function public.update_session(bigint,timestamptz,bigint,integer,numeric,numeric,text,text,text) from public,anon,authenticated;
revoke all on function public.decide_session_court(bigint,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.create_session(bigint,text,timestamptz,numeric,numeric,integer,text,text,text,bigint[],timestamptz,text) to authenticated;
grant execute on function public.update_session(bigint,timestamptz,bigint,integer,numeric,numeric,text,text,text) to authenticated;
grant execute on function public.decide_session_court(bigint,bigint,timestamptz) to authenticated;
