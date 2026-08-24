// Keep these as string literals: Supabase's select parser uses the literal type
// to reject unknown columns during typecheck.
export const COURT_SELECT = "id,name,city,district,lat,lng";
export const SESSION_DISCOVERY_SELECT =
  "session_id,sport_code,court_id,court,court_district,court_lat,court_lng,start_at,play_type,ntrp_min,ntrp_max,slots_total,slots_remaining,notes,host_nickname,host_ntrp,host_profile_complete,status,join_mode,venue_type,range_end,candidate_court_ids,fee_note,decided_at";
export const MY_SESSIONS_SELECT =
  "session_id,sport_code,court_id,court,court_district,court_lat,court_lng,start_at,play_type,ntrp_min,ntrp_max,slots_total,slots_remaining,notes,host_nickname,host_ntrp,host_profile_complete,status,join_mode,viewer_role,viewer_participant_status,viewer_played_confirmed,updated_at,can_cancel,can_withdraw,can_confirm_played,can_confirm_attendance,can_respond_invite,venue_type,range_end,decided_at,fee_note,unread_message_count";
export const SESSION_ROSTER_SELECT =
  "session_id,participant_id,profile_id,nickname,ntrp,play_types,home_courts,role,status";
export const SESSION_JOIN_PREVIEW_SELECT = "session_id,role,nickname,ntrp,avatar_url,hosted_played_count";
export const SESSION_MESSAGE_FEED_SELECT =
  "message_id,session_id,sender_profile_id,sender_nickname,kind,body,created_at,is_self";
export const MY_PLAYER_BLOCKS_SELECT = "blocked_profile_id,blocked_nickname,created_at";
export const MY_PROFILE_SELECT =
  "nickname,ntrp,court_ids,play_types,slot_codes,is_public,share_presence,open_to_greeting";
export const PLAYER_DIRECTORY_SELECT =
  "profile_id,nickname,ntrp,play_types,slot_codes,court_id,court_name,court_district,court_lat,court_lng,is_self,played_count";
export const PLAYER_PRESENCE_DIRECTORY_SELECT =
  "profile_id,nickname,ntrp,open_to_greeting,court_id,court_name,court_district,court_lat,court_lng,minutes_ago,is_self";
export const NOTIFICATION_PREFS_SELECT =
  "host_new_request_enabled,guest_request_reviewed_enabled,guest_invited_enabled,session_updated_enabled,chat_message_enabled,session_reminder_enabled";
export const COURT_SUBSCRIPTIONS_SELECT = "court_id";
