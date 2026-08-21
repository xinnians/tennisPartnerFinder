import { LAUNCH_CITY } from "./config.js";
import { COURTS, MOCK_PLAYER_PRESENCE, MOCK_PLAYERS, MOCK_SESSION_JOIN_PREVIEWS, MOCK_SESSIONS } from "./mockData.js";
import { isSupabaseConfigured, supabase, SUPABASE_AUTH_STORAGE_KEY } from "./supabaseClient.js";
import {
  defaultNotificationPreferences,
  mapCourt,
  mapCurrentProfile,
  mapMyPlayerBlockRow,
  mapNotificationPreferences,
  mapPlayerDirectoryRow,
  mapPlayerPresenceDirectoryRow,
} from "./data/mappers/profileMappers.ts";
import { discoveryQuery, withinBounds, withinDiscoveryQuery } from "./data/mappers/queryMappers.ts";
import {
  mapMockSessionJoinPreviewRow,
  mapMockSessionSummary,
  mapMySession,
  mapSessionJoinPreviewRow,
  mapSessionMessageRow,
  mapSessionRosterRow,
  mapSessionSummary,
} from "./data/mappers/sessionMappers.ts";
import { asArray, asNumber, asText, profileValues } from "./data/mappers/valueMappers.ts";

export {
  mapCurrentProfile,
  mapMyPlayerBlockRow,
  mapMySession,
  mapPlayerDirectoryRow,
  mapPlayerPresenceDirectoryRow,
  mapSessionJoinPreviewRow,
  mapSessionMessageRow,
  mapSessionRosterRow,
  mapSessionSummary,
};

async function runMockDataTestHook(name) {
  const hook = globalThis.__tennisE2ETestHooks?.dataApi?.[name];
  if (!hook) return;
  hook.consumedCount = (hook.consumedCount ?? 0) + 1;
  const delayMs = Number(hook.delayMs);
  if (Number.isFinite(delayMs) && delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  if (Number(hook.failuresRemaining) > 0) {
    hook.failuresRemaining -= 1;
    throw new Error(hook.errorMessage || "forced mock data failure");
  }
}

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
const COURT_COLUMNS = ["id", "name", "city", "district", "lat", "lng"];
const MY_PROFILE_COLUMNS = ["nickname", "ntrp", "court_ids", "play_types", "slot_codes", "is_public", "share_presence", "open_to_greeting"];
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

export const SESSION_ACTION_CODES = Object.freeze([
  "PROFILE_INCOMPLETE",
  "SESSION_NOT_FOUND",
  "SESSION_NOT_OPEN",
  "SESSION_FULL",
  "SESSION_CANCELLED",
  "SESSION_EXPIRED",
  "SESSION_ARCHIVED",
  "SESSION_STARTED",
  "SESSION_LIMIT",
  "ALREADY_REQUESTED",
  "ALREADY_DECIDED",
  "NOT_SESSION_HOST",
  "NOT_ACCEPTED_PARTICIPANT",
  "NOT_SESSION_MEMBER",
  "INVALID_TRANSITION",
  "INVALID_VENUE_INPUT",
  "INVALID_DECISION",
  "INVITEE_NOT_AVAILABLE",
  "ALREADY_INVITED",
  "NOT_INVITED",
  "INVITE_LIMIT",
  "BLOCKED",
  // 刻意不揭露封鎖，不要改成「你已被封鎖」。
  "SESSION_UNAVAILABLE",
  "GUEST_UNAVAILABLE",
  "MESSAGE_NOT_VISIBLE",
  "INVALID_MESSAGE",
]);

const ACTION_MESSAGES = {
  PROFILE_INCOMPLETE: "請先完成個人檔案。",
  SESSION_NOT_FOUND: "找不到這個球局。",
  SESSION_NOT_OPEN: "這個球局目前無法操作。",
  SESSION_FULL: "這個球局已額滿。",
  SESSION_CANCELLED: "這個球局已取消。",
  SESSION_EXPIRED: "球局狀態已更新，請重新載入。",
  SESSION_ARCHIVED: "這個球局已封存，無法再傳送訊息。",
  SESSION_STARTED: "球局已超過可加入時間。",
  SESSION_LIMIT: "你同時開放中的球局已達上限，請先處理現有球局。",
  ALREADY_REQUESTED: "你已申請加入這個球局。",
  ALREADY_DECIDED: "你先前已退出或未通過這一局，無法再次申請。",
  NOT_SESSION_HOST: "只有主揪可以執行這個操作。",
  NOT_ACCEPTED_PARTICIPANT: "只有已接受的參與者可以執行這個操作。",
  NOT_SESSION_MEMBER: "只有這個球局的成員可以傳送訊息。",
  INVALID_TRANSITION: "目前的球局狀態不允許這個操作。",
  INVALID_VENUE_INPUT: "場地或候選球場資料不符合規則。",
  INVALID_DECISION: "候選球場或定案時間不符合規則。",
  INVITEE_NOT_AVAILABLE: "這位球友目前未開放邀請。",
  ALREADY_INVITED: "你已邀請過這位球友。",
  NOT_INVITED: "找不到你的邀請，球局狀態可能已更新。",
  INVITE_LIMIT: "24 小時內邀請次數已達上限。",
  BLOCKED: "此操作因封鎖關係無法完成。",
  SESSION_UNAVAILABLE: "這個球局目前無法加入。",
  GUEST_UNAVAILABLE: "這位球友目前無法加入這個球局。",
  MESSAGE_NOT_VISIBLE: "這則訊息目前無法檢舉。",
  INVALID_MESSAGE: "訊息不可為空白或超過 1000 字。",
  UNKNOWN_ACTION_ERROR: "球局操作失敗，請重新載入後再試。",
};

export class DataApiError extends Error {
  constructor(message = "", { cause = null, code = undefined, name = "DataApiError" } = {}) {
    super(message);
    this.name = name;
    this.code = code;
    this.cause = cause;
  }
}

export class SessionActionError extends DataApiError {
  constructor(code, cause = null) {
    super(ACTION_MESSAGES[code] ?? ACTION_MESSAGES.UNKNOWN_ACTION_ERROR, { cause, code, name: "SessionActionError" });
  }
}

export class DataApiUnavailableError extends DataApiError {
  constructor(message = "此操作需要已設定的 Supabase 環境。") {
    super(message, { name: "DataApiUnavailableError" });
  }
}

function codeFromSupabaseError(error) {
  if (error?.code !== "P0001" || typeof error?.message !== "string") {
    return "UNKNOWN_ACTION_ERROR";
  }
  return SESSION_ACTION_CODES.includes(error.message) ? error.message : "UNKNOWN_ACTION_ERROR";
}

function asSessionActionError(error) {
  return error instanceof SessionActionError ? error : new SessionActionError(codeFromSupabaseError(error), error);
}

function asDataApiError(error) {
  if (error instanceof DataApiError) return error;
  return new DataApiError(typeof error?.message === "string" ? error.message : "", {
    cause: error,
    code: error?.code,
    name: typeof error?.name === "string" ? error.name : "DataApiError",
  });
}

function selectedCourtIds(profile, courts) {
  const selected = profileValues(profile?.courts);
  const ids = selected.map((selection) => {
    const byId = courts.find((court) => String(court.id) === String(selection));
    const byName = courts.find((court) => court.name === selection);
    return (byId ?? byName)?.id ?? null;
  });

  if (ids.some((id) => id == null)) throw new SessionActionError("PROFILE_INCOMPLETE");
  return [...new Set(ids)];
}

export function createDataApi({
  client = supabase,
  configured = isSupabaseConfigured,
  mockSessions = MOCK_SESSIONS,
  mockPlayers = MOCK_PLAYERS,
  mockPlayerPresence = MOCK_PLAYER_PRESENCE,
  mockSessionJoinPreviews = MOCK_SESSION_JOIN_PREVIEWS,
  mockCourts = COURTS,
  now = () => new Date(),
} = {}) {
  const currentTime = () => (typeof now === "function" ? now() : now);

  function requireClient() {
    if (!configured || !client) throw new DataApiUnavailableError();
    return client;
  }

  async function callRpc(name, params) {
    const activeClient = requireClient();
    const { data, error } = await activeClient.rpc(name, params);
    if (error) throw asSessionActionError(error);
    return data;
  }

  async function callLifecycleRpc(name, params) {
    const outcome = await callRpc(name, params);
    if (outcome !== "OK" && outcome !== "SESSION_EXPIRED") {
      throw new SessionActionError("UNKNOWN_ACTION_ERROR");
    }
    // SESSION_EXPIRED only says the RPC persisted a state change. It does not
    // identify the final state; callers must refresh an authoritative view.
    return { outcome, reloadRequired: outcome === "SESSION_EXPIRED" };
  }

  async function loadCourts(city = LAUNCH_CITY) {
    if (!configured) {
      await runMockDataTestHook("loadCourts");
      return mockCourts.filter((court) => court.city === city).map(mapCourt);
    }

    const activeClient = requireClient();
    const { data, error } = await activeClient
      .from("courts")
      .select(COURT_COLUMNS.join(","))
      .eq("is_active", true)
      .eq("city", city)
      .order("id");
    if (error) throw asDataApiError(error);
    return asArray(data).map(mapCourt);
  }

  async function loadSessionDiscovery(input = {}) {
    const query = discoveryQuery(input, currentTime());
    if (!configured) {
      await runMockDataTestHook("loadSessionDiscovery");
      return asArray(mockSessions).filter((session) => withinDiscoveryQuery(session, query)).map(mapMockSessionSummary);
    }

    const activeClient = requireClient();
    const { data, error } = await activeClient
      .from("session_discovery")
      .select(SESSION_DISCOVERY_SELECT)
      .gte("court_lat", query.bounds.south)
      .lte("court_lat", query.bounds.north)
      .gte("court_lng", query.bounds.west)
      .lte("court_lng", query.bounds.east)
      .gt("start_at", query.startAfter)
      .lt("start_at", query.startBefore)
      .order("start_at", { ascending: true });
    if (error) throw asDataApiError(error);
    // An empty configured database is a real empty state, never a demo fallback.
    return asArray(data).map(mapSessionSummary);
  }

  async function loadPlayerDirectory({ bounds } = {}) {
    if (!configured) {
      return asArray(mockPlayers).filter((entry) => withinBounds(entry, bounds)).map((entry) => ({ ...entry }));
    }

    const activeClient = requireClient();
    let query = activeClient.from("player_directory").select(PLAYER_DIRECTORY_SELECT);
    if (bounds) {
      query = query
        .gte("court_lat", bounds.south)
        .lte("court_lat", bounds.north)
        .gte("court_lng", bounds.west)
        .lte("court_lng", bounds.east);
    }
    const { data, error } = await query;
    if (error) throw asDataApiError(error);
    return asArray(data).map(mapPlayerDirectoryRow);
  }

  async function loadPlayerPresenceDirectory({ bounds } = {}) {
    if (!configured) {
      return asArray(mockPlayerPresence).filter((entry) => withinBounds(entry, bounds)).map((entry) => ({ ...entry }));
    }

    const activeClient = requireClient();
    let query = activeClient.from("player_presence_directory").select(PLAYER_PRESENCE_DIRECTORY_SELECT);
    if (bounds) {
      query = query
        .gte("court_lat", bounds.south)
        .lte("court_lat", bounds.north)
        .gte("court_lng", bounds.west)
        .lte("court_lng", bounds.east);
    }
    const { data, error } = await query;
    if (error) throw asDataApiError(error);
    return asArray(data).map(mapPlayerPresenceDirectoryRow);
  }

  async function loadSessionSummary(sessionId) {
    if (!configured) {
      const found = asArray(mockSessions).find((session) => String(session.sessionId) === String(sessionId));
      return found ? mapMockSessionSummary(found) : null;
    }

    const activeClient = requireClient();
    const { data, error } = await activeClient
      .from("session_discovery")
      .select(SESSION_DISCOVERY_SELECT)
      .eq("session_id", sessionId)
      .maybeSingle();
    if (error) throw asDataApiError(error);
    return data ? mapSessionSummary(data) : null;
  }

  async function loadMySessions() {
    if (!configured) return [];
    const activeClient = requireClient();
    const { data, error } = await activeClient
      .from("my_session_participations")
      .select(MY_SESSIONS_SELECT)
      .order("updated_at", { ascending: false });
    if (error) throw asDataApiError(error);
    return asArray(data).map(mapMySession);
  }

  async function loadSessionRoster(sessionId) {
    if (!configured) return [];
    const activeClient = requireClient();
    const { data, error } = await activeClient
      .from("session_participant_roster")
      .select(SESSION_ROSTER_SELECT)
      .eq("session_id", sessionId)
      .order("participant_id");
    if (error) throw asDataApiError(error);
    return asArray(data).map(mapSessionRosterRow);
  }

  async function loadSessionJoinPreview(sessionId) {
    const normalizedSessionId = asNumber(sessionId);
    if (!configured) {
      return asArray(mockSessionJoinPreviews)
        .filter((participant) => asNumber(participant.sessionId) === normalizedSessionId)
        .map(mapMockSessionJoinPreviewRow);
    }
    const activeClient = requireClient();
    const { data, error } = await activeClient
      .from("session_join_preview")
      .select(SESSION_JOIN_PREVIEW_SELECT)
      .eq("session_id", normalizedSessionId);
    if (error) throw asDataApiError(error);
    return asArray(data).map(mapSessionJoinPreviewRow);
  }

  async function loadSessionMessages(sessionId) {
    if (!configured) return [];
    const activeClient = requireClient();
    const { data, error } = await activeClient
      .from("session_message_feed")
      .select(SESSION_MESSAGE_FEED_SELECT)
      .eq("session_id", asNumber(sessionId))
      .order("created_at", { ascending: true })
      .order("message_id", { ascending: true });
    if (error) throw asDataApiError(error);
    return asArray(data).map(mapSessionMessageRow);
  }

  async function loadMyPlayerBlocks() {
    if (!configured) return [];
    const activeClient = requireClient();
    const { data, error } = await activeClient
      .from("my_player_blocks")
      .select(MY_PLAYER_BLOCKS_SELECT)
      .order("created_at", { ascending: false });
    if (error) throw asDataApiError(error);
    return asArray(data).map(mapMyPlayerBlockRow);
  }

  async function loadCurrentProfile() {
    if (!configured) return null;
    const activeClient = requireClient();
    const { data, error } = await activeClient.from("my_profile").select(MY_PROFILE_SELECT).maybeSingle();
    if (error) throw asDataApiError(error);
    if (!data) return null;
    const courts = await loadCourts();
    return mapCurrentProfile(data, courts);
  }

  async function loadNotificationPreferences() {
    if (!configured) return defaultNotificationPreferences();
    const activeClient = requireClient();
    const { data, error } = await activeClient
      .from("notification_prefs")
      .select(NOTIFICATION_PREFS_SELECT)
      .maybeSingle();
    if (error) throw asDataApiError(error);
    return mapNotificationPreferences(data ?? {});
  }

  async function loadCourtSubscriptions() {
    if (!configured) return [];
    const activeClient = requireClient();
    const { data, error } = await activeClient
      .from("court_subscriptions")
      .select(COURT_SUBSCRIPTIONS_SELECT)
      .order("court_id");
    if (error) throw asDataApiError(error);
    return asArray(data).map((row) => asNumber(row?.court_id)).filter((courtId) => courtId != null);
  }

  async function saveCurrentProfile(profile) {
    const courts = await loadCourts();
    const courtIds = selectedCourtIds(profile, courts);
    await callRpc("save_my_profile", {
      p_nickname: asText(profile?.nick).trim(),
      p_ntrp: asNumber(profile?.ntrp),
      // save_my_profile 的簽名已凍結(202607270006:9),p_line_id 無預設值,呼叫端必須傳。
      // 這是 src/ 唯一允許出現 line_id 的位置;drop 該欄位前必須先改簽名或給預設值。
      p_line_id: null,
      p_court_ids: courtIds,
      p_play_types: profileValues(profile?.types).filter((value) => typeof value === "string"),
      p_slot_codes: profileValues(profile?.slots).filter((value) => typeof value === "string"),
    });
    return loadCurrentProfile();
  }

  async function savePushSubscription(subscription) {
    const endpoint = asText(subscription?.endpoint).trim();
    const p256dh = asText(subscription?.keys?.p256dh).trim();
    const auth = asText(subscription?.keys?.auth).trim();
    const outcome = await callRpc("save_push_subscription", {
      p_endpoint: endpoint,
      p_p256dh: p256dh,
      p_auth: auth,
    });
    if (outcome !== "OK") throw new SessionActionError("UNKNOWN_ACTION_ERROR");
    return { outcome };
  }

  async function removePushSubscription(endpoint) {
    const outcome = await callRpc("remove_push_subscription", { p_endpoint: asText(endpoint).trim() });
    if (outcome !== "OK") throw new SessionActionError("UNKNOWN_ACTION_ERROR");
    return { outcome };
  }

  async function saveNotificationPreferences(preferences = {}) {
    const outcome = await callRpc("set_notification_prefs", {
      p_chat_message_enabled: preferences.chatMessageEnabled === true,
      p_host_new_request_enabled: preferences.hostNewRequestEnabled === true,
      p_guest_request_reviewed_enabled: preferences.guestRequestReviewedEnabled === true,
      p_guest_invited_enabled: preferences.guestInvitedEnabled === true,
      p_session_reminder_enabled: preferences.sessionReminderEnabled === true,
      p_session_updated_enabled: preferences.sessionUpdatedEnabled === true,
    });
    if (outcome !== "OK") throw new SessionActionError("UNKNOWN_ACTION_ERROR");
    return { outcome };
  }

  async function saveCourtSubscriptions(courtIds) {
    const normalizedCourtIds = asArray(courtIds).map(asNumber).filter((courtId) => courtId != null);
    const outcome = await callRpc("set_court_subscriptions", { p_court_ids: normalizedCourtIds });
    if (outcome !== "OK") throw new SessionActionError("UNKNOWN_ACTION_ERROR");
    return { outcome };
  }

  async function createSession({
    courtId,
    playType,
    startAt,
    ntrpMin = null,
    ntrpMax = null,
    slotsTotal,
    notes = null,
    joinMode = "instant",
    venueType = "booked",
    candidateCourtIds = null,
    rangeEnd = null,
    feeNote = null,
  }) {
    const sessionId = await callRpc("create_session", {
      p_court_id: asNumber(courtId),
      p_play_type: playType,
      p_start_at: startAt,
      p_ntrp_min: ntrpMin == null ? null : asNumber(ntrpMin),
      p_ntrp_max: ntrpMax == null ? null : asNumber(ntrpMax),
      p_slots_total: asNumber(slotsTotal),
      p_notes: notes == null ? null : asText(notes),
      p_join_mode: joinMode,
      p_venue_type: venueType,
      p_candidate_court_ids: candidateCourtIds == null ? null : asArray(candidateCourtIds).map(asNumber).filter((id) => id != null),
      p_range_end: rangeEnd == null ? null : asText(rangeEnd),
      p_fee_note: feeNote == null ? null : asText(feeNote),
    });
    return { sessionId: asNumber(sessionId) };
  }

  async function requestToJoinSession(sessionId) {
    const outcome = await callRpc("request_to_join_session", { p_session_id: sessionId });
    if (!["OK", "ACCEPTED", "OK_NTRP_MISSING", "OK_NTRP_OUT_OF_RANGE", "SESSION_EXPIRED"].includes(outcome)) {
      throw new SessionActionError("UNKNOWN_ACTION_ERROR");
    }
    return { outcome, accepted: outcome === "ACCEPTED", reloadRequired: outcome === "SESSION_EXPIRED" };
  }

  async function updateSession({ sessionId, startAt, courtId, slotsMissing, ntrpMin = null, ntrpMax = null, playType, feeNote = null, notes = null }) {
    return callLifecycleRpc("update_session", {
      p_session_id: asNumber(sessionId), p_start_at: startAt, p_court_id: asNumber(courtId), p_slots_missing: asNumber(slotsMissing),
      p_ntrp_min: ntrpMin == null ? null : asNumber(ntrpMin), p_ntrp_max: ntrpMax == null ? null : asNumber(ntrpMax),
      p_play_type: playType, p_fee_note: feeNote == null ? null : asText(feeNote), p_note: notes == null ? null : asText(notes),
    });
  }

  async function decideSessionCourt(sessionId, courtId, startAt) {
    return callLifecycleRpc("decide_session_court", { p_session_id: asNumber(sessionId), p_court_id: asNumber(courtId), p_start_at: startAt });
  }

  async function inviteToSession(sessionId, profileId) {
    return callLifecycleRpc("invite_to_session", { p_session_id: sessionId, p_profile_id: asNumber(profileId) });
  }

  async function respondToSessionInvite(sessionId, decision) {
    return callLifecycleRpc("respond_to_session_invite", { p_session_id: sessionId, p_decision: decision });
  }

  async function setPlayerVisibility(visible) {
    return callLifecycleRpc("set_player_visibility", { p_visible: Boolean(visible) });
  }

  async function setPresenceSharing(shared) {
    const outcome = await callRpc("set_presence_sharing", { p_enabled: Boolean(shared) });
    if (outcome !== "OK") throw new SessionActionError("UNKNOWN_ACTION_ERROR");
    return { outcome };
  }

  async function setOpenToGreeting(open) {
    const outcome = await callRpc("set_open_to_greeting", { p_enabled: Boolean(open) });
    if (outcome !== "OK") throw new SessionActionError("UNKNOWN_ACTION_ERROR");
    return { outcome };
  }

  async function updateMyPresence({ lat, lng } = {}) {
    const outcome = await callRpc("update_my_presence", { p_lat: asNumber(lat), p_lng: asNumber(lng) });
    if (outcome !== "OK") throw new SessionActionError("UNKNOWN_ACTION_ERROR");
    return { outcome };
  }

  async function acceptSessionParticipant(sessionId, participantId) {
    return callLifecycleRpc("review_join_request", {
      p_session_id: sessionId,
      p_participant_id: participantId,
      p_decision: "accepted",
    });
  }

  async function declineSessionParticipant(sessionId, participantId) {
    return callLifecycleRpc("review_join_request", {
      p_session_id: sessionId,
      p_participant_id: participantId,
      p_decision: "declined",
    });
  }

  async function withdrawFromSession(sessionId) {
    return callLifecycleRpc("withdraw_from_session", { p_session_id: sessionId });
  }

  async function cancelSession(sessionId) {
    return callLifecycleRpc("cancel_session", { p_session_id: sessionId });
  }

  async function markSessionPlayed(sessionId) {
    return callLifecycleRpc("mark_session_played", { p_session_id: sessionId });
  }

  async function confirmSessionAttendance(sessionId) {
    return callLifecycleRpc("confirm_session_attendance", { p_session_id: sessionId });
  }

  async function postSessionMessage(sessionId, body) {
    const outcome = await callRpc("post_session_message", {
      p_session_id: asNumber(sessionId),
      p_body: asText(body).trim(),
    });
    if (outcome !== "OK") {
      throw new SessionActionError(SESSION_ACTION_CODES.includes(outcome) ? outcome : "UNKNOWN_ACTION_ERROR");
    }
    return { outcome };
  }

  async function markSessionChatRead(sessionId) {
    // 比照 loadSessionMessages/loadSessionRoster 這對緊鄰的聊天讀取函式：mock 模式
    // 直接給合理值,不讓 sessionController 的 best-effort 呼叫點必須自己 try/catch
    // 一個在 mock 模式下必然因 requireClient() 而丟例外的呼叫。
    if (!configured) return { outcome: "OK" };
    const outcome = await callRpc("mark_session_chat_read", { p_session_id: asNumber(sessionId) });
    if (outcome !== "OK") throw new SessionActionError("UNKNOWN_ACTION_ERROR");
    return { outcome };
  }

  async function setPlayerBlock(profileId, blocked) {
    const outcome = await callRpc("set_player_block", {
      p_profile_id: asNumber(profileId),
      p_blocked: Boolean(blocked),
    });
    if (outcome !== "OK") throw new SessionActionError("UNKNOWN_ACTION_ERROR");
    return { outcome };
  }

  async function createReport({ sessionId = null, reportedProfileId = null, reason, messageId = null }) {
    const normalizedMessageId = messageId == null ? null : asNumber(messageId);
    const reportId = await callRpc("create_report", {
      p_session_id: normalizedMessageId == null ? sessionId : null,
      p_reported_profile_id: reportedProfileId,
      p_reason: asText(reason).trim(),
      p_message_id: normalizedMessageId,
    });
    return { reportId: asNumber(reportId) };
  }

  return {
    loadCourts,
    loadSessionDiscovery,
    loadPlayerDirectory,
    loadPlayerPresenceDirectory,
    loadSessionSummary,
    loadMySessions,
    loadSessionRoster,
    loadSessionJoinPreview,
    loadSessionMessages,
    loadMyPlayerBlocks,
    loadCurrentProfile,
    loadNotificationPreferences,
    loadCourtSubscriptions,
    saveCurrentProfile,
    savePushSubscription,
    removePushSubscription,
    saveNotificationPreferences,
    saveCourtSubscriptions,
    createSession,
    requestToJoinSession,
    updateSession,
    decideSessionCourt,
    inviteToSession,
    respondToSessionInvite,
    setPlayerVisibility,
    setPresenceSharing,
    setOpenToGreeting,
    updateMyPresence,
    acceptSessionParticipant,
    declineSessionParticipant,
    withdrawFromSession,
    cancelSession,
    markSessionPlayed,
    confirmSessionAttendance,
    postSessionMessage,
    markSessionChatRead,
    setPlayerBlock,
    createReport,
  };
}

const defaultDataApi = createDataApi();

export const loadCourts = (...args) => defaultDataApi.loadCourts(...args);
export const loadSessionDiscovery = (...args) => defaultDataApi.loadSessionDiscovery(...args);
export const loadPlayerDirectory = (...args) => defaultDataApi.loadPlayerDirectory(...args);
export const loadPlayerPresenceDirectory = (...args) => defaultDataApi.loadPlayerPresenceDirectory(...args);
export const loadSessionSummary = (...args) => defaultDataApi.loadSessionSummary(...args);
export const loadMySessions = (...args) => defaultDataApi.loadMySessions(...args);
export const loadSessionRoster = (...args) => defaultDataApi.loadSessionRoster(...args);
export const loadSessionJoinPreview = (...args) => defaultDataApi.loadSessionJoinPreview(...args);
export const loadSessionMessages = (...args) => defaultDataApi.loadSessionMessages(...args);
export const loadMyPlayerBlocks = (...args) => defaultDataApi.loadMyPlayerBlocks(...args);
export const loadCurrentProfile = (...args) => defaultDataApi.loadCurrentProfile(...args);
export const loadNotificationPreferences = (...args) => defaultDataApi.loadNotificationPreferences(...args);
export const loadCourtSubscriptions = (...args) => defaultDataApi.loadCourtSubscriptions(...args);
export const saveCurrentProfile = (...args) => defaultDataApi.saveCurrentProfile(...args);
export const savePushSubscription = (...args) => defaultDataApi.savePushSubscription(...args);
export const removePushSubscription = (...args) => defaultDataApi.removePushSubscription(...args);
export const saveNotificationPreferences = (...args) => defaultDataApi.saveNotificationPreferences(...args);
export const saveCourtSubscriptions = (...args) => defaultDataApi.saveCourtSubscriptions(...args);
export const createSession = (...args) => defaultDataApi.createSession(...args);
export const requestToJoinSession = (...args) => defaultDataApi.requestToJoinSession(...args);
export const updateSession = (...args) => defaultDataApi.updateSession(...args);
export const decideSessionCourt = (...args) => defaultDataApi.decideSessionCourt(...args);
export const inviteToSession = (...args) => defaultDataApi.inviteToSession(...args);
export const respondToSessionInvite = (...args) => defaultDataApi.respondToSessionInvite(...args);
export const setPlayerVisibility = (...args) => defaultDataApi.setPlayerVisibility(...args);
export const setPresenceSharing = (...args) => defaultDataApi.setPresenceSharing(...args);
export const setOpenToGreeting = (...args) => defaultDataApi.setOpenToGreeting(...args);
export const updateMyPresence = (...args) => defaultDataApi.updateMyPresence(...args);
export const acceptSessionParticipant = (...args) => defaultDataApi.acceptSessionParticipant(...args);
export const declineSessionParticipant = (...args) => defaultDataApi.declineSessionParticipant(...args);
export const withdrawFromSession = (...args) => defaultDataApi.withdrawFromSession(...args);
export const cancelSession = (...args) => defaultDataApi.cancelSession(...args);
export const markSessionPlayed = (...args) => defaultDataApi.markSessionPlayed(...args);
export const confirmSessionAttendance = (...args) => defaultDataApi.confirmSessionAttendance(...args);
export const postSessionMessage = (...args) => defaultDataApi.postSessionMessage(...args);
export const markSessionChatRead = (...args) => defaultDataApi.markSessionChatRead(...args);
export const setPlayerBlock = (...args) => defaultDataApi.setPlayerBlock(...args);
export const createReport = (...args) => defaultDataApi.createReport(...args);

function requireDefaultSupabase() {
  if (!isSupabaseConfigured || !supabase) throw new DataApiUnavailableError();
  return supabase;
}

/**
 * A null return is deliberately reserved for a confirmed anonymous state.
 * Transport/refresh failures reject so callers can retain a recoverable
 * post-login intent instead of treating a temporary auth failure as logout.
 */
export async function resolveInitialSession(client, storedSession = null) {
  const { data, error } = await client.auth.getSession();
  if (error) throw asDataApiError(error);
  if (data?.session) return data.session;
  if (!storedSession) return null;

  let session = null;
  try {
    session = JSON.parse(storedSession);
  } catch {
    return null;
  }
  if (!session?.access_token || !session?.refresh_token) return null;

  const { data: restored, error: restoreError } = await client.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (restoreError) throw asDataApiError(restoreError);
  return restored?.session ?? null;
}

export async function getInitialSession() {
  if (!isSupabaseConfigured) return null;
  const client = requireDefaultSupabase();
  const stored = globalThis.localStorage?.getItem(SUPABASE_AUTH_STORAGE_KEY);
  return resolveInitialSession(client, stored);
}

export function onAuthStateChange(callback) {
  if (!isSupabaseConfigured) return () => {};
  const client = requireDefaultSupabase();
  const { data } = client.auth.onAuthStateChange((event, session) => callback(session, event));
  return () => data.subscription.unsubscribe();
}

export async function signInWithOAuthProvider(provider) {
  const client = requireDefaultSupabase();
  const { error } = await client.auth.signInWithOAuth({
    provider,
    options: { redirectTo: globalThis.location?.origin },
  });
  if (error) throw asDataApiError(error);
}

export async function signOut() {
  const client = requireDefaultSupabase();
  const { error } = await client.auth.signOut();
  if (error) throw asDataApiError(error);
}

// manual identity linking:把另一個登入 provider 掛到「目前已登入」的帳號(整頁 redirect,
// 需要 Supabase 專案開啟 manual linking)。連結狀態一律讀 session user 的 identities,不另外 fetch。
export async function linkLoginIdentity(provider) {
  const client = requireDefaultSupabase();
  const { error } = await client.auth.linkIdentity({
    provider,
    options: { redirectTo: globalThis.location?.origin },
  });
  if (error) throw asDataApiError(error);
}
