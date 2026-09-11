-- 缺額改為正整數；保留 RPC integer 簽名、容量鎖定及資料權限。
-- 依賴 slots_total 型別的兩個 view 在同一 transaction 重建，不使用 CASCADE。
begin;
drop view public.session_discovery;
drop view public.my_session_participations;
alter table public.sessions drop constraint sessions_slots_total_check;
alter table public.sessions alter column slots_total type integer;
alter table public.sessions add constraint sessions_slots_total_check check (slots_total > 0);


CREATE OR REPLACE FUNCTION public.create_session(p_court_id bigint, p_play_type text, p_start_at timestamp with time zone, p_ntrp_min numeric, p_ntrp_max numeric, p_slots_total integer, p_notes text, p_join_mode text DEFAULT 'approval'::text, p_venue_type text DEFAULT 'booked'::text, p_candidate_court_ids bigint[] DEFAULT NULL::bigint[], p_range_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fee_note text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare host_profile bigint; tennis_sport_id bigint; taipei_court_id bigint; created_session_id bigint;
  host_open_session_count integer; candidate_count integer; duplicate_count integer;
begin
  host_profile := private.require_profile_gate('ntrp');
  if p_start_at is null or p_start_at < now() - interval '5 minutes' then raise exception 'SESSION_STARTED'; end if;
  if p_play_type is null or p_play_type not in ('單打','雙打','對拉','練球') or p_slots_total is null or p_slots_total < 1
    or (p_notes is not null and char_length(p_notes) > 500) or (p_fee_note is not null and char_length(p_fee_note) > 500)
    or p_join_mode is null or p_join_mode not in ('approval','instant') or p_venue_type is null or p_venue_type not in ('booked','walk_on','candidates')
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
  values (tennis_sport_id,host_profile,taipei_court_id,p_play_type,p_start_at,p_ntrp_min,p_ntrp_max,p_slots_total,p_notes,p_join_mode,p_venue_type,p_range_end,p_fee_note)
  returning id into created_session_id;
  if p_venue_type = 'candidates' then
    insert into public.session_candidate_courts(session_id,court_id,position)
    select created_session_id, candidate.court_id, candidate.position::smallint from unnest(p_candidate_court_ids) with ordinality as candidate(court_id,position);
  end if;
  insert into public.session_participants(session_id,profile_id,role,status) values(created_session_id,host_profile,'host','accepted');
  perform private.try_enqueue_court_new_session(created_session_id);
  return created_session_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_session(p_session_id bigint, p_start_at timestamp with time zone, p_court_id bigint, p_slots_missing integer, p_ntrp_min numeric, p_ntrp_max numeric, p_play_type text, p_fee_note text, p_note text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare viewer_profile bigint; locked_session public.sessions%rowtype; recipient_row record; accepted_guest_count integer;
begin
  viewer_profile := private.viewer_profile_id(); locked_session := private.lock_and_expire_session(p_session_id);
  if locked_session.status='expired' then return 'SESSION_EXPIRED'; end if;
  if viewer_profile is null or not private.is_session_host(locked_session.id,viewer_profile) then raise exception 'NOT_SESSION_HOST'; end if;
  if locked_session.status not in ('open','full') then raise exception 'SESSION_NOT_OPEN'; end if;
  if not (locked_session.venue_type='candidates' and locked_session.decided_at is null) and locked_session.start_at + interval '2 hours' <= now() then raise exception 'SESSION_STARTED'; end if;
  if locked_session.venue_type='candidates' and p_court_id is distinct from locked_session.court_id then raise exception 'INVALID_VENUE_INPUT'; end if;
  if locked_session.venue_type='candidates' and locked_session.decided_at is null and p_start_at is distinct from locked_session.start_at then raise exception 'INVALID_VENUE_INPUT'; end if;
  if p_start_at is null or p_start_at < now() - interval '5 minutes' or p_slots_missing is null or p_slots_missing < 1 or p_play_type is null or p_play_type not in ('單打','雙打','對拉','練球') or ((p_ntrp_min is null) <> (p_ntrp_max is null)) or (p_ntrp_min is not null and (p_ntrp_min not between 1 and 7 or p_ntrp_max not between 1 and 7 or p_ntrp_min>p_ntrp_max)) or (p_note is not null and char_length(p_note)>500) or (p_fee_note is not null and char_length(p_fee_note)>500) then raise exception 'INVALID_TRANSITION'; end if;
  if locked_session.venue_type in ('booked','walk_on') and not exists(select 1 from public.courts where id=p_court_id and is_active and city='台北市') then raise exception 'INVALID_VENUE_INPUT'; end if;
  select count(*) into accepted_guest_count from public.session_participants where session_id=locked_session.id and role='guest' and status='accepted';
  perform set_config('private.allow_session_time_change','1',true);
  update public.sessions set start_at=p_start_at, court_id=p_court_id, slots_total=p_slots_missing, ntrp_min=p_ntrp_min, ntrp_max=p_ntrp_max, play_type=p_play_type, fee_note=p_fee_note, notes=p_note, status=case when accepted_guest_count >= p_slots_missing then 'full' else 'open' end where id=locked_session.id;
  perform set_config('private.allow_session_time_change','',true);
  for recipient_row in select profile_id from public.session_participants where session_id=locked_session.id and role='guest' and status='accepted' loop perform private.try_enqueue_session_notification('session_updated',recipient_row.profile_id,locked_session.id,'球局資訊已更新。'); end loop;
  return 'OK';
end;
$function$;

CREATE OR REPLACE FUNCTION private.enforce_session_capacity_invariant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_session_id bigint;
  session_status text;
  guest_slots integer;
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
          and participant_row.status in ('requested', 'invited')
      )
    ) then
    raise exception 'INVALID_TRANSITION';
  end if;

  return null;
end;
$function$;

create view public.session_discovery with (security_barrier=true, security_invoker=false) as
SELECT session_row.id,
    session_row.id AS session_id,
    sport_row.code AS sport_code,
    session_row.court_id,
    court_row.name AS court,
    court_row.district AS court_district,
    court_row.lat AS court_lat,
    court_row.lng AS court_lng,
    session_row.start_at,
    session_row.play_type,
    session_row.ntrp_min,
    session_row.ntrp_max,
    session_row.slots_total,
    (session_row.slots_total - count(participant_row.id) FILTER (WHERE participant_row.role = 'guest'::text AND participant_row.status = 'accepted'::text))::integer AS slots_remaining,
    session_row.notes,
    host_profile.nickname AS host_nickname,
    host_profile.ntrp AS host_ntrp,
    private.profile_meets_gate(host_profile.id, 'ntrp'::text) AS host_profile_complete,
    session_row.status,
    session_row.join_mode,
    session_row.venue_type,
    session_row.range_end,
        CASE
            WHEN session_row.venue_type = 'candidates'::text THEN ( SELECT array_agg(candidate_court.court_id ORDER BY candidate_court."position") AS array_agg
               FROM session_candidate_courts candidate_court
              WHERE candidate_court.session_id = session_row.id)
            ELSE NULL::bigint[]
        END AS candidate_court_ids,
    session_row.fee_note,
    session_row.decided_at
   FROM sessions session_row
     JOIN sports sport_row ON sport_row.id = session_row.sport_id
     JOIN courts court_row ON court_row.id = session_row.court_id
     JOIN profiles host_profile ON host_profile.id = session_row.host_profile_id
     LEFT JOIN session_participants participant_row ON participant_row.session_id = session_row.id
  WHERE (session_row.status = ANY (ARRAY['open'::text, 'full'::text])) AND
        CASE
            WHEN session_row.venue_type = 'candidates'::text AND session_row.decided_at IS NULL THEN session_row.start_at > now()
            ELSE (session_row.start_at + '02:00:00'::interval) > now()
        END AND sport_row.code = 'tennis'::text AND sport_row.is_active AND court_row.is_active AND court_row.city = '台北市'::text
  GROUP BY session_row.id, sport_row.code, court_row.name, court_row.district, court_row.lat, court_row.lng, host_profile.id, host_profile.nickname, host_profile.ntrp, session_row.join_mode;

revoke all on public.session_discovery from public, anon, authenticated;
grant select on public.session_discovery to anon, authenticated;

create view public.my_session_participations with (security_barrier=true, security_invoker=false) as
SELECT session_row.id,
    session_row.id AS session_id,
    sport_row.code AS sport_code,
    session_row.court_id,
    court_row.name AS court,
    court_row.district AS court_district,
    court_row.lat AS court_lat,
    court_row.lng AS court_lng,
    session_row.start_at,
    session_row.play_type,
    session_row.ntrp_min,
    session_row.ntrp_max,
    session_row.slots_total,
    (session_row.slots_total - count(accepted_guest.id) FILTER (WHERE accepted_guest.role = 'guest'::text AND accepted_guest.status = 'accepted'::text))::integer AS slots_remaining,
    session_row.notes,
    host_profile.nickname AS host_nickname,
    host_profile.ntrp AS host_ntrp,
    true AS host_profile_complete,
    session_row.status,
    viewer_participant.role AS viewer_role,
    viewer_participant.status AS viewer_participant_status,
    viewer_participant.played_confirmed AS viewer_played_confirmed,
    session_row.updated_at,
    viewer_participant.role = 'host'::text AND (session_row.status = ANY (ARRAY['open'::text, 'full'::text])) AND session_row.start_at > now() AS can_cancel,
    viewer_participant.role = 'guest'::text AND (viewer_participant.status = ANY (ARRAY['requested'::text, 'accepted'::text])) AND (session_row.status = ANY (ARRAY['open'::text, 'full'::text])) AND session_row.start_at > now() AS can_withdraw,
    viewer_participant.role = 'host'::text AND (session_row.status = ANY (ARRAY['open'::text, 'full'::text])) AND session_row.start_at <= now() AND session_row.start_at > (now() - '24:00:00'::interval) AS can_confirm_played,
    viewer_participant.status = 'accepted'::text AND (session_row.status = ANY (ARRAY['open'::text, 'full'::text, 'played'::text])) AND session_row.start_at <= now() AND session_row.start_at > (now() - '24:00:00'::interval) AS can_confirm_attendance,
    session_row.join_mode,
    viewer_participant.status = 'invited'::text AND (session_row.status = ANY (ARRAY['open'::text, 'full'::text])) AND (session_row.start_at + '02:00:00'::interval) > now() AS can_respond_invite,
    session_row.venue_type,
    session_row.range_end,
    session_row.decided_at,
    session_row.fee_note,
        CASE
            WHEN viewer_participant.status = 'accepted'::text THEN ( SELECT count(*)::integer AS count
               FROM session_messages unread_message_row
              WHERE unread_message_row.session_id = session_row.id AND unread_message_row.id > COALESCE(( SELECT cursor_row.last_read_message_id
                       FROM session_chat_read_cursors cursor_row
                      WHERE cursor_row.session_id = session_row.id AND cursor_row.profile_id = viewer_participant.profile_id), 0::bigint) AND unread_message_row.sender_profile_id IS DISTINCT FROM viewer_participant.profile_id AND (unread_message_row.kind = 'system'::text OR NOT (EXISTS ( SELECT 1
                       FROM player_blocks block_row
                      WHERE block_row.blocker_profile_id = viewer_participant.profile_id AND block_row.blocked_profile_id = unread_message_row.sender_profile_id OR block_row.blocker_profile_id = unread_message_row.sender_profile_id AND block_row.blocked_profile_id = viewer_participant.profile_id))))
            ELSE 0
        END AS unread_message_count
   FROM sessions session_row
     JOIN session_participants viewer_participant ON viewer_participant.session_id = session_row.id AND viewer_participant.profile_id = (( SELECT profiles.id
           FROM profiles
          WHERE profiles.user_id = auth.uid()))
     JOIN sports sport_row ON sport_row.id = session_row.sport_id
     JOIN courts court_row ON court_row.id = session_row.court_id
     JOIN profiles host_profile ON host_profile.id = session_row.host_profile_id
     LEFT JOIN session_participants accepted_guest ON accepted_guest.session_id = session_row.id
  GROUP BY session_row.id, sport_row.code, court_row.name, court_row.district, court_row.lat, court_row.lng, host_profile.nickname, host_profile.ntrp, viewer_participant.id, viewer_participant.role, viewer_participant.status, viewer_participant.played_confirmed, viewer_participant.profile_id, session_row.join_mode;

revoke all on public.my_session_participations from public, anon, authenticated;
grant select on public.my_session_participations to authenticated;

notify pgrst, 'reload schema';
commit;
