-- 批 7:出席回報的用途——中性聚合數。
--
-- 兩個 authenticated-only view 各加一個末欄,讓既有的 played 記錄產生用途:
--   session_join_preview.hosted_played_count:該 host 已成局的球局數
--   player_directory.played_count:該球友已確認打成的場數
--
-- 硬約束:**不得擴充匿名面**。public.session_discovery 的主揪欄位維持
-- host_nickname / host_ntrp / host_profile_complete 三項,本檔零觸碰。
-- 兩個 view 的 where 條件與權限逐字沿用原定義(202607270006 / 202607270001),
-- 只在 select 清單末端加一欄;新欄位以相關子查詢取得,不加觸發器、不加快取欄位。
--
-- 另含定詞表修正:review_join_request 的婉拒 body 由「未被接受」改為「已被婉拒」。
-- 該函式最新定義在 202607270004:196-316,本檔逐字複製後只改該一行
-- (零行為遺失:與原文 diff 恰好一行)。

create or replace view public.session_join_preview
with (security_barrier = true, security_invoker = false)
as
select
  session_row.id as session_id,
  participant_row.role,
  profile_row.nickname,
  profile_row.ntrp,
  profile_row.avatar_url,
  (
    select count(*)::integer
    from public.sessions played_row
    where played_row.host_profile_id = profile_row.id
      and played_row.status = 'played'
  ) as hosted_played_count
from public.sessions session_row
join public.session_participants participant_row
  on participant_row.session_id = session_row.id
join public.profiles profile_row
  on profile_row.id = participant_row.profile_id
join public.sports sport_row
  on sport_row.id = session_row.sport_id
join public.courts court_row
  on court_row.id = session_row.court_id
where auth.uid() is not null
  and participant_row.status = 'accepted'
  and session_row.status in ('open', 'full')
  and (
    case
      when session_row.venue_type = 'candidates' and session_row.decided_at is null
        then session_row.start_at > now()
      else session_row.start_at + interval '2 hours' > now()
    end
  )
  and sport_row.code = 'tennis'
  and sport_row.is_active
  and court_row.is_active
  and court_row.city = '台北市';

revoke all on table public.session_join_preview from public, anon, authenticated;
grant select on table public.session_join_preview to authenticated;

create or replace view public.player_directory
with (security_barrier = true, security_invoker = false)
as
select
  profile_row.id as profile_id,
  profile_row.nickname,
  profile_row.ntrp,
  coalesce(
    (select array_agg(play_type_row.play_type order by play_type_row.play_type)
     from public.profile_play_types play_type_row
     where play_type_row.profile_id = profile_row.id),
    '{}'::text[]
  ) as play_types,
  coalesce(
    (select array_agg(slot_row.slot_code order by slot_row.slot_code)
     from public.profile_slots slot_row
     where slot_row.profile_id = profile_row.id),
    '{}'::text[]
  ) as slot_codes,
  court_row.id as court_id,
  court_row.name as court_name,
  court_row.district as court_district,
  court_row.lat as court_lat,
  court_row.lng as court_lng,
  (profile_row.user_id = auth.uid()) as is_self,
  (
    select count(*)::integer
    from public.session_participants played_row
    where played_row.profile_id = profile_row.id
      and played_row.status = 'accepted'
      and played_row.played_confirmed
  ) as played_count
from public.profiles profile_row
join public.profile_courts profile_court_row on profile_court_row.profile_id = profile_row.id
join public.courts court_row on court_row.id = profile_court_row.court_id
where profile_row.is_public
  and court_row.is_active
  and court_row.city = '台北市'
  and private.profile_meets_gate(profile_row.id, 'directory')
  and exists (
    select 1
    from public.profiles viewer_profile
    where viewer_profile.user_id = auth.uid()
      and private.profile_meets_gate(viewer_profile.id, 'directory')
  );

revoke all on table public.player_directory from public, anon, authenticated;
grant select on table public.player_directory to authenticated;

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
  elsif locked_session.start_at + interval '2 hours' <= now() then
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
    notification_message := '你的加入申請已被婉拒。';
  else
    if exists (
      select 1
      from public.player_blocks block_row
      where block_row.blocker_profile_id = viewer_profile
        and block_row.blocked_profile_id = requested_participant.profile_id
    ) then
      raise exception 'BLOCKED';
    elsif exists (
      select 1
      from public.player_blocks block_row
      where block_row.blocker_profile_id = requested_participant.profile_id
        and block_row.blocked_profile_id = viewer_profile
    ) then
      raise exception 'GUEST_UNAVAILABLE';
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
