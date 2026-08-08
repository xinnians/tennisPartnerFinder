-- Batch C4-1: group-chat read cursors and unread counts.
--
-- New browser-inaccessible table tracks each accepted member's last-read
-- session_messages.id per session. mark_session_chat_read() upserts it;
-- my_session_participations exposes the derived unread_message_count so the
-- front end can show "N unread" without ever reading raw session_messages.

create table public.session_chat_read_cursors (
  session_id bigint not null references public.sessions(id) on delete cascade,
  profile_id bigint not null references public.profiles(id) on delete cascade,
  last_read_message_id bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (session_id, profile_id)
);

-- Unread counting filters on `session_id = X and id > cursor`. The existing
-- (session_id, created_at, id) index sorts by created_at first, so it cannot
-- serve an efficient range scan on id; add a dedicated composite index.
create index session_messages_session_id_idx
  on public.session_messages (session_id, id);

alter table public.session_chat_read_cursors enable row level security;

revoke all on table public.session_chat_read_cursors
from public, anon, authenticated;

-- mark_session_chat_read: reuses the exact accepted-member gate from
-- post_session_message / session_message_feed, but (per spec 2.2) has no
-- SESSION_ARCHIVED branch — archived sessions may still be marked read so a
-- member can clear a stale unread count on a closed group.
create or replace function public.mark_session_chat_read(
  p_session_id bigint
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile bigint;
  locked_session public.sessions%rowtype;
  latest_message_id bigint;
begin
  viewer_profile := private.viewer_profile_id();
  locked_session := private.lock_and_expire_session(p_session_id);

  if viewer_profile is null
    or not exists (
      select 1
      from public.session_participants participant_row
      where participant_row.session_id = locked_session.id
        and participant_row.profile_id = viewer_profile
        and participant_row.status = 'accepted'
    ) then
    raise exception 'NOT_SESSION_MEMBER';
  end if;

  select coalesce(max(message_row.id), 0)
  into latest_message_id
  from public.session_messages message_row
  where message_row.session_id = locked_session.id;

  insert into public.session_chat_read_cursors (session_id, profile_id, last_read_message_id, updated_at)
  values (locked_session.id, viewer_profile, latest_message_id, now())
  on conflict (session_id, profile_id) do update
  set last_read_message_id = excluded.last_read_message_id,
      updated_at = excluded.updated_at
  where excluded.last_read_message_id > public.session_chat_read_cursors.last_read_message_id;

  return 'OK';
end;
$$;

revoke all on function public.mark_session_chat_read(bigint)
from public, anon, authenticated;

grant execute on function public.mark_session_chat_read(bigint)
to authenticated;

-- Rebuild my_session_participations in full (existing columns/order
-- untouched) to add unread_message_count. The view is a GROUP BY aggregate
-- over one row per (session, viewer participant), so the new column has to
-- be a correlated scalar subquery keyed on session_row.id /
-- viewer_participant.profile_id rather than a joined column; both are
-- already functionally determined by viewer_participant.id, which is
-- grouped, but profile_id is added to GROUP BY explicitly for clarity.
--
-- The membership gate (`viewer_participant.status = 'accepted'`) and the
-- bidirectional block filter mirror session_message_feed's predicates:
-- membership is expressed as a CASE on the already-joined viewer_participant
-- row (equivalent to feed's EXISTS, since that row is already scoped to
-- this exact session + viewer by the outer JOIN) and the block filter is
-- copied verbatim from session_message_feed. `IS DISTINCT FROM` (not `<>`)
-- is required for the self-exclusion check because system messages have a
-- null sender_profile_id, and `<>` against NULL would silently drop them
-- from every viewer's count.
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
    session_row.slots_total - count(accepted_guest.id) filter (
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
  ) as can_confirm_attendance,
  session_row.join_mode,
  (
    viewer_participant.status = 'invited'
    and session_row.status in ('open', 'full')
    and session_row.start_at + interval '2 hours' > now()
  ) as can_respond_invite,
  session_row.venue_type,
  session_row.range_end,
  session_row.decided_at,
  session_row.fee_note,
  case
    when viewer_participant.status = 'accepted' then (
      select count(*)::int
      from public.session_messages unread_message_row
      where unread_message_row.session_id = session_row.id
        and unread_message_row.id > coalesce(
          (
            select cursor_row.last_read_message_id
            from public.session_chat_read_cursors cursor_row
            where cursor_row.session_id = session_row.id
              and cursor_row.profile_id = viewer_participant.profile_id
          ),
          0
        )
        and unread_message_row.sender_profile_id is distinct from viewer_participant.profile_id
        and (
          unread_message_row.kind = 'system'
          or not exists (
            select 1
            from public.player_blocks block_row
            where (
              block_row.blocker_profile_id = viewer_participant.profile_id
              and block_row.blocked_profile_id = unread_message_row.sender_profile_id
            )
            or (
              block_row.blocker_profile_id = unread_message_row.sender_profile_id
              and block_row.blocked_profile_id = viewer_participant.profile_id
            )
          )
        )
    )
    else 0
  end as unread_message_count
from public.sessions session_row
join public.session_participants viewer_participant
  on viewer_participant.session_id = session_row.id
  and viewer_participant.profile_id = (select id from public.profiles where user_id = auth.uid())
join public.sports sport_row on sport_row.id = session_row.sport_id
join public.courts court_row on court_row.id = session_row.court_id
join public.profiles host_profile on host_profile.id = session_row.host_profile_id
left join public.session_participants accepted_guest on accepted_guest.session_id = session_row.id
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
  viewer_participant.played_confirmed,
  viewer_participant.profile_id,
  session_row.join_mode;

revoke all on table public.my_session_participations
from public, anon, authenticated;
grant select on table public.my_session_participations to authenticated;
