const SESSION_SUMMARY_COLUMNS = [
  "session_id",
  "sport_code",
  "court_id",
  "court",
  "court_district",
  "court_lat",
  "court_lng",
  "start_at",
  "play_type",
  "ntrp_min",
  "ntrp_max",
  "slots_total",
  "slots_remaining",
  "notes",
  "host_nickname",
  "host_ntrp",
  "host_profile_complete",
  "status",
  "join_mode",
];
const SESSION_DISCOVERY_VENUE_COLUMNS = ["venue_type", "range_end", "candidate_court_ids", "fee_note", "decided_at"];

const MY_SESSION_COLUMNS = [
  ...SESSION_SUMMARY_COLUMNS,
  "viewer_role",
  "viewer_participant_status",
  "viewer_played_confirmed",
  "updated_at",
  "can_cancel",
  "can_withdraw",
  "can_confirm_played",
  "can_confirm_attendance",
  "can_respond_invite",
  "venue_type",
  "range_end",
  "decided_at",
  "fee_note",
  "unread_message_count",
];

const SESSION_ROSTER_COLUMNS = [
  "session_id",
  "participant_id",
  "profile_id",
  "nickname",
  "ntrp",
  "play_types",
  "home_courts",
  "role",
  "status",
];
const SESSION_JOIN_PREVIEW_COLUMNS = ["session_id", "role", "nickname", "ntrp", "avatar_url", "hosted_played_count"];

const SESSION_MESSAGE_FEED_COLUMNS = [
  "message_id",
  "session_id",
  "sender_profile_id",
  "sender_nickname",
  "kind",
  "body",
  "created_at",
  "is_self",
];
const MY_PLAYER_BLOCKS_COLUMNS = ["blocked_profile_id", "blocked_nickname", "created_at"];
export const COURT_COLUMNS = ["id", "name", "city", "district", "lat", "lng"];
const MY_PROFILE_COLUMNS = [
  "nickname",
  "ntrp",
  "court_ids",
  "play_types",
  "slot_codes",
  "is_public",
  "share_presence",
  "open_to_greeting",
];
const NOTIFICATION_PREFS_COLUMNS = [
  "host_new_request_enabled",
  "guest_request_reviewed_enabled",
  "guest_invited_enabled",
  "session_updated_enabled",
  "chat_message_enabled",
  "session_reminder_enabled",
];
const PLAYER_DIRECTORY_COLUMNS = [
  "profile_id",
  "nickname",
  "ntrp",
  "play_types",
  "slot_codes",
  "court_id",
  "court_name",
  "court_district",
  "court_lat",
  "court_lng",
  "is_self",
  "played_count",
];
const PLAYER_PRESENCE_DIRECTORY_COLUMNS = [
  "profile_id",
  "nickname",
  "ntrp",
  "open_to_greeting",
  "court_id",
  "court_name",
  "court_district",
  "court_lat",
  "court_lng",
  "minutes_ago",
  "is_self",
];

export const SESSION_DISCOVERY_SELECT = [...SESSION_SUMMARY_COLUMNS, ...SESSION_DISCOVERY_VENUE_COLUMNS].join(",");
export const MY_SESSIONS_SELECT = MY_SESSION_COLUMNS.join(",");
export const SESSION_ROSTER_SELECT = SESSION_ROSTER_COLUMNS.join(",");
export const SESSION_JOIN_PREVIEW_SELECT = SESSION_JOIN_PREVIEW_COLUMNS.join(",");
export const SESSION_MESSAGE_FEED_SELECT = SESSION_MESSAGE_FEED_COLUMNS.join(",");
export const MY_PLAYER_BLOCKS_SELECT = MY_PLAYER_BLOCKS_COLUMNS.join(",");
export const MY_PROFILE_SELECT = MY_PROFILE_COLUMNS.join(",");
export const PLAYER_DIRECTORY_SELECT = PLAYER_DIRECTORY_COLUMNS.join(",");
export const PLAYER_PRESENCE_DIRECTORY_SELECT = PLAYER_PRESENCE_DIRECTORY_COLUMNS.join(",");
export const NOTIFICATION_PREFS_SELECT = NOTIFICATION_PREFS_COLUMNS.join(",");
export const COURT_SUBSCRIPTIONS_SELECT = "court_id";
