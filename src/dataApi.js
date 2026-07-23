import { DISCOVERY_WINDOW_DAYS, LAUNCH_CITY, TAIPEI_CITY_BOUNDS } from "./config.js";
import { COURTS, MOCK_PLAYERS, MOCK_SESSIONS } from "./mockData.js";
import { isSupabaseConfigured, supabase, SUPABASE_AUTH_STORAGE_KEY } from "./supabaseClient.js";

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

const SESSION_CONTACT_COLUMNS = ["session_id", "counterpart_profile_id", "nickname", "line_id"];
const COURT_COLUMNS = ["id", "name", "city", "district", "lat", "lng"];
const MY_PROFILE_COLUMNS = ["nickname", "ntrp", "line_id", "court_ids", "play_types", "slot_codes", "is_public"];
const NOTIFICATION_PREFS_COLUMNS = ["host_new_request_enabled", "guest_request_reviewed_enabled", "guest_invited_enabled"];
const DISTRICT_SUBSCRIPTION_COLUMNS = ["district"];
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
];

export const SESSION_DISCOVERY_SELECT = SESSION_SUMMARY_COLUMNS.join(",");
export const MY_SESSIONS_SELECT = MY_SESSION_COLUMNS.join(",");
export const SESSION_ROSTER_SELECT = SESSION_ROSTER_COLUMNS.join(",");
export const SESSION_CONTACTS_SELECT = SESSION_CONTACT_COLUMNS.join(",");
export const MY_PROFILE_SELECT = MY_PROFILE_COLUMNS.join(",");
export const PLAYER_DIRECTORY_SELECT = PLAYER_DIRECTORY_COLUMNS.join(",");
export const NOTIFICATION_PREFS_SELECT = NOTIFICATION_PREFS_COLUMNS.join(",");
export const DISTRICT_SUBSCRIPTIONS_SELECT = DISTRICT_SUBSCRIPTION_COLUMNS.join(",");

export const SESSION_ACTION_CODES = Object.freeze([
  "PROFILE_INCOMPLETE",
  "SESSION_NOT_FOUND",
  "SESSION_NOT_OPEN",
  "SESSION_FULL",
  "SESSION_CANCELLED",
  "SESSION_EXPIRED",
  "SESSION_STARTED",
  "SESSION_LIMIT",
  "ALREADY_REQUESTED",
  "ALREADY_DECIDED",
  "NOT_SESSION_HOST",
  "NOT_ACCEPTED_PARTICIPANT",
  "INVALID_TRANSITION",
  "INVITEE_NOT_AVAILABLE",
  "ALREADY_INVITED",
  "NOT_INVITED",
  "INVITE_LIMIT",
]);

const ACTION_MESSAGES = {
  PROFILE_INCOMPLETE: "請先完成個人檔案。",
  SESSION_NOT_FOUND: "找不到這個球局。",
  SESSION_NOT_OPEN: "這個球局目前無法操作。",
  SESSION_FULL: "這個球局已額滿。",
  SESSION_CANCELLED: "這個球局已取消。",
  SESSION_EXPIRED: "球局狀態已更新，請重新載入。",
  SESSION_STARTED: "球局已開始，無法進行這個操作。",
  SESSION_LIMIT: "你同時開放中的球局已達上限，請先處理現有球局。",
  ALREADY_REQUESTED: "您已申請加入這個球局。",
  ALREADY_DECIDED: "這筆申請已經處理。",
  NOT_SESSION_HOST: "只有主揪可以執行這個操作。",
  NOT_ACCEPTED_PARTICIPANT: "只有已接受的參與者可以執行這個操作。",
  INVALID_TRANSITION: "目前的球局狀態不允許這個操作。",
  INVITEE_NOT_AVAILABLE: "這位球友目前未開放邀請。",
  ALREADY_INVITED: "你已邀請過這位球友。",
  NOT_INVITED: "找不到你的邀請，球局狀態可能已更新。",
  INVITE_LIMIT: "24 小時內邀請次數已達上限。",
  UNKNOWN_ACTION_ERROR: "球局操作失敗，請重新載入後再試。",
};

export class SessionActionError extends Error {
  constructor(code, cause = null) {
    super(ACTION_MESSAGES[code] ?? ACTION_MESSAGES.UNKNOWN_ACTION_ERROR);
    this.name = "SessionActionError";
    this.code = code;
    this.cause = cause;
  }
}

export class DataApiUnavailableError extends Error {
  constructor(message = "此操作需要已設定的 Supabase 環境。") {
    super(message);
    this.name = "DataApiUnavailableError";
  }
}

function asNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asText(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value) {
  return value === true || value === "true";
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function defaultNotificationPreferences() {
  return {
    guestInvitedEnabled: true,
    guestRequestReviewedEnabled: true,
    hostNewRequestEnabled: true,
  };
}

function mapNotificationPreferences(row = {}) {
  return {
    hostNewRequestEnabled: row.host_new_request_enabled !== false,
    guestRequestReviewedEnabled: row.guest_request_reviewed_enabled !== false,
    guestInvitedEnabled: row.guest_invited_enabled !== false,
  };
}

function sessionSummaryValues(row = {}) {
  return {
    sessionId: asNumber(row.session_id),
    sportCode: asText(row.sport_code),
    courtId: asNumber(row.court_id),
    court: asText(row.court),
    courtDistrict: asText(row.court_district),
    courtLat: asNumber(row.court_lat),
    courtLng: asNumber(row.court_lng),
    startAt: asText(row.start_at),
    playType: asText(row.play_type),
    ntrpMin: asNumber(row.ntrp_min),
    ntrpMax: asNumber(row.ntrp_max),
    slotsTotal: asNumber(row.slots_total),
    slotsRemaining: asNumber(row.slots_remaining),
    notes: asText(row.notes),
    hostNickname: asText(row.host_nickname),
    hostNtrp: asNumber(row.host_ntrp),
    hostProfileComplete: asBoolean(row.host_profile_complete),
    status: asText(row.status),
    joinMode: asText(row.join_mode),
  };
}

/** Public-only mapper: every output field is intentionally named here. */
export function mapSessionSummary(row) {
  return sessionSummaryValues(row);
}

function mapMockSessionSummary(session = {}) {
  return {
    sessionId: asNumber(session.sessionId),
    sportCode: asText(session.sportCode),
    courtId: asNumber(session.courtId),
    court: asText(session.court),
    courtDistrict: asText(session.courtDistrict),
    courtLat: asNumber(session.courtLat),
    courtLng: asNumber(session.courtLng),
    startAt: asText(session.startAt),
    playType: asText(session.playType),
    ntrpMin: asNumber(session.ntrpMin),
    ntrpMax: asNumber(session.ntrpMax),
    slotsTotal: asNumber(session.slotsTotal),
    slotsRemaining: asNumber(session.slotsRemaining),
    notes: asText(session.notes),
    hostNickname: asText(session.hostNickname),
    hostNtrp: asNumber(session.hostNtrp),
    hostProfileComplete: asBoolean(session.hostProfileComplete),
    status: asText(session.status),
    joinMode: asText(session.joinMode),
  };
}

/** Authenticated history mapper, still without contact/profile identifiers. */
export function mapMySession(row = {}) {
  const session = sessionSummaryValues(row);
  return {
    sessionId: session.sessionId,
    sportCode: session.sportCode,
    courtId: session.courtId,
    court: session.court,
    courtDistrict: session.courtDistrict,
    courtLat: session.courtLat,
    courtLng: session.courtLng,
    startAt: session.startAt,
    playType: session.playType,
    ntrpMin: session.ntrpMin,
    ntrpMax: session.ntrpMax,
    slotsTotal: session.slotsTotal,
    slotsRemaining: session.slotsRemaining,
    notes: session.notes,
    hostNickname: session.hostNickname,
    hostNtrp: session.hostNtrp,
    hostProfileComplete: session.hostProfileComplete,
    status: session.status,
    joinMode: session.joinMode,
    viewerRole: asText(row.viewer_role),
    viewerParticipantStatus: asText(row.viewer_participant_status),
    viewerPlayedConfirmed: asBoolean(row.viewer_played_confirmed),
    updatedAt: asText(row.updated_at),
    canCancel: asBoolean(row.can_cancel),
    canWithdraw: asBoolean(row.can_withdraw),
    canConfirmPlayed: asBoolean(row.can_confirm_played),
    canConfirmAttendance: asBoolean(row.can_confirm_attendance),
    canRespondInvite: asBoolean(row.can_respond_invite),
  };
}

/** Private roster mapper. It is never used for public discovery UI. */
export function mapSessionRosterRow(row = {}) {
  return {
    sessionId: asNumber(row.session_id),
    participantId: asNumber(row.participant_id),
    profileId: asNumber(row.profile_id),
    nickname: asText(row.nickname),
    ntrp: asNumber(row.ntrp),
    playTypes: asArray(row.play_types).filter((value) => typeof value === "string"),
    homeCourts: asArray(row.home_courts).filter((value) => typeof value === "string"),
    role: asText(row.role),
    status: asText(row.status),
  };
}

/** Accepted-pair contact mapper. LINE may exist only in this private model. */
export function mapSessionContactRow(row = {}) {
  return {
    sessionId: asNumber(row.session_id),
    counterpartProfileId: asNumber(row.counterpart_profile_id),
    nickname: asText(row.nickname),
    lineId: asText(row.line_id),
  };
}

/** Public player-directory mapper: every output field is intentionally named here. */
export function mapPlayerDirectoryRow(row = {}) {
  return {
    profileId: asNumber(row.profile_id),
    nickname: asText(row.nickname),
    ntrp: asNumber(row.ntrp),
    playTypes: asArray(row.play_types),
    slotCodes: asArray(row.slot_codes),
    courtId: asNumber(row.court_id),
    courtName: asText(row.court_name),
    courtDistrict: asText(row.court_district),
    courtLat: asNumber(row.court_lat),
    courtLng: asNumber(row.court_lng),
    isSelf: asBoolean(row.is_self),
  };
}

function mapCourt(row = {}) {
  return {
    id: asNumber(row.id),
    name: asText(row.name),
    city: asText(row.city),
    district: asText(row.district),
    lat: asNumber(row.lat),
    lng: asNumber(row.lng),
  };
}

export function mapCurrentProfile(row = {}, courts = []) {
  const courtNamesById = new Map(courts.map((court) => [String(court.id), court.name]));
  const selectedCourts = asArray(row.court_ids)
    .map((courtId) => courtNamesById.get(String(courtId)))
    .filter((name) => typeof name === "string");

  return {
    nick: asText(row.nickname),
    ntrp: asNumber(row.ntrp) ?? 3.5,
    types: new Set(asArray(row.play_types).filter((value) => typeof value === "string")),
    courts: new Set(selectedCourts),
    slots: new Set(asArray(row.slot_codes).filter((value) => typeof value === "string")),
    lineId: asText(row.line_id),
    isPublic: asBoolean(row.is_public),
  };
}

function asDate(value) {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoForQuery(value, fallback) {
  if (typeof value === "string" && asDate(value)) return value;
  if (value instanceof Date && asDate(value)) return value.toISOString();
  return fallback.toISOString();
}

function normalizedBounds(bounds) {
  const candidate = bounds ?? TAIPEI_CITY_BOUNDS;
  const south = asNumber(candidate.south);
  const west = asNumber(candidate.west);
  const north = asNumber(candidate.north);
  const east = asNumber(candidate.east);

  if (south == null || west == null || north == null || east == null || south > north || west > east) {
    return TAIPEI_CITY_BOUNDS;
  }

  return { south, west, north, east };
}

function discoveryQuery(input = {}, now = new Date()) {
  const currentTime = asDate(now) ?? new Date();
  const defaultEnd = new Date(currentTime.getTime() + DISCOVERY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return {
    bounds: normalizedBounds(input.bounds),
    startAfter: isoForQuery(input.startAfter, currentTime),
    startBefore: isoForQuery(input.startBefore, defaultEnd),
  };
}

function withinDiscoveryQuery(session, query) {
  const lat = asNumber(session.courtLat);
  const lng = asNumber(session.courtLng);
  const startAt = asDate(session.startAt);
  const startAfter = asDate(query.startAfter);
  const startBefore = asDate(query.startBefore);
  return (
    lat != null &&
    lng != null &&
    startAt &&
    startAfter &&
    startBefore &&
    lat >= query.bounds.south &&
    lat <= query.bounds.north &&
    lng >= query.bounds.west &&
    lng <= query.bounds.east &&
    startAt > startAfter &&
    startAt < startBefore
  );
}

function withinBounds(entry, bounds) {
  if (!bounds) return true;
  const lat = asNumber(entry.courtLat);
  const lng = asNumber(entry.courtLng);
  return (
    lat != null &&
    lng != null &&
    lat >= bounds.south &&
    lat <= bounds.north &&
    lng >= bounds.west &&
    lng <= bounds.east
  );
}

function codeFromSupabaseError(error) {
  const errorText = [error?.message, error?.details, error?.hint, error?.code]
    .filter((part) => typeof part === "string")
    .join(" ")
    .toUpperCase();
  return SESSION_ACTION_CODES.find((code) => errorText.includes(code)) ?? "UNKNOWN_ACTION_ERROR";
}

function asSessionActionError(error) {
  return error instanceof SessionActionError ? error : new SessionActionError(codeFromSupabaseError(error), error);
}

function profileValues(value) {
  if (value instanceof Set) return [...value];
  return Array.isArray(value) ? value : [];
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
    if (!configured) return mockCourts.filter((court) => court.city === city).map(mapCourt);

    const activeClient = requireClient();
    const { data, error } = await activeClient
      .from("courts")
      .select(COURT_COLUMNS.join(","))
      .eq("is_active", true)
      .eq("city", city)
      .order("id");
    if (error) throw error;
    return asArray(data).map(mapCourt);
  }

  async function loadSessionDiscovery(input = {}) {
    const query = discoveryQuery(input, currentTime());
    if (!configured) {
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
    if (error) throw error;
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
    if (error) throw error;
    return asArray(data).map(mapPlayerDirectoryRow);
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
    if (error) throw error;
    return data ? mapSessionSummary(data) : null;
  }

  async function loadMySessions() {
    if (!configured) return [];
    const activeClient = requireClient();
    const { data, error } = await activeClient
      .from("my_session_participations")
      .select(MY_SESSIONS_SELECT)
      .order("updated_at", { ascending: false });
    if (error) throw error;
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
    if (error) throw error;
    return asArray(data).map(mapSessionRosterRow);
  }

  async function loadSessionContacts(sessionId) {
    if (!configured) return [];
    const activeClient = requireClient();
    const { data, error } = await activeClient
      .from("session_contacts")
      .select(SESSION_CONTACTS_SELECT)
      .eq("session_id", sessionId)
      .order("counterpart_profile_id");
    if (error) throw error;
    return asArray(data).map(mapSessionContactRow);
  }

  async function loadCurrentProfile() {
    if (!configured) return null;
    const activeClient = requireClient();
    const { data, error } = await activeClient.from("my_profile").select(MY_PROFILE_SELECT).maybeSingle();
    if (error) throw error;
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
    if (error) throw error;
    return mapNotificationPreferences(data ?? {});
  }

  async function loadDistrictSubscriptions() {
    if (!configured) return [];
    const activeClient = requireClient();
    const { data, error } = await activeClient
      .from("district_subscriptions")
      .select(DISTRICT_SUBSCRIPTIONS_SELECT)
      .order("district");
    if (error) throw error;
    return asArray(data)
      .map((row) => asText(row?.district).trim())
      .filter(Boolean);
  }

  async function saveCurrentProfile(profile) {
    const courts = await loadCourts();
    const courtIds = selectedCourtIds(profile, courts);
    await callRpc("save_my_profile", {
      p_nickname: asText(profile?.nick).trim(),
      p_ntrp: asNumber(profile?.ntrp),
      p_line_id: asText(profile?.lineId).trim(),
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
      p_host_new_request_enabled: preferences.hostNewRequestEnabled === true,
      p_guest_request_reviewed_enabled: preferences.guestRequestReviewedEnabled === true,
      p_guest_invited_enabled: preferences.guestInvitedEnabled === true,
    });
    if (outcome !== "OK") throw new SessionActionError("UNKNOWN_ACTION_ERROR");
    return { outcome };
  }

  async function saveDistrictSubscriptions(districts) {
    const normalizedDistricts = [...new Set(asArray(districts).map((district) => asText(district).trim()).filter(Boolean))];
    const outcome = await callRpc("set_district_subscriptions", { p_districts: normalizedDistricts });
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
    joinMode = "approval",
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
    });
    return { sessionId: asNumber(sessionId) };
  }

  async function requestToJoinSession(sessionId) {
    const outcome = await callRpc("request_to_join_session", { p_session_id: sessionId });
    if (outcome !== "OK" && outcome !== "ACCEPTED" && outcome !== "SESSION_EXPIRED") {
      throw new SessionActionError("UNKNOWN_ACTION_ERROR");
    }
    return { outcome, accepted: outcome === "ACCEPTED", reloadRequired: outcome === "SESSION_EXPIRED" };
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

  async function createReport({ sessionId = null, reportedProfileId = null, reason }) {
    const reportId = await callRpc("create_report", {
      p_session_id: sessionId,
      p_reported_profile_id: reportedProfileId,
      p_reason: asText(reason).trim(),
    });
    return { reportId: asNumber(reportId) };
  }

  return {
    loadCourts,
    loadSessionDiscovery,
    loadPlayerDirectory,
    loadSessionSummary,
    loadMySessions,
    loadSessionRoster,
    loadSessionContacts,
    loadCurrentProfile,
    loadNotificationPreferences,
    loadDistrictSubscriptions,
    saveCurrentProfile,
    savePushSubscription,
    removePushSubscription,
    saveNotificationPreferences,
    saveDistrictSubscriptions,
    createSession,
    requestToJoinSession,
    inviteToSession,
    respondToSessionInvite,
    setPlayerVisibility,
    acceptSessionParticipant,
    declineSessionParticipant,
    withdrawFromSession,
    cancelSession,
    markSessionPlayed,
    confirmSessionAttendance,
    createReport,
  };
}

const defaultDataApi = createDataApi();

export const loadCourts = (...args) => defaultDataApi.loadCourts(...args);
export const loadSessionDiscovery = (...args) => defaultDataApi.loadSessionDiscovery(...args);
export const loadPlayerDirectory = (...args) => defaultDataApi.loadPlayerDirectory(...args);
export const loadSessionSummary = (...args) => defaultDataApi.loadSessionSummary(...args);
export const loadMySessions = (...args) => defaultDataApi.loadMySessions(...args);
export const loadSessionRoster = (...args) => defaultDataApi.loadSessionRoster(...args);
export const loadSessionContacts = (...args) => defaultDataApi.loadSessionContacts(...args);
export const loadCurrentProfile = (...args) => defaultDataApi.loadCurrentProfile(...args);
export const loadNotificationPreferences = (...args) => defaultDataApi.loadNotificationPreferences(...args);
export const loadDistrictSubscriptions = (...args) => defaultDataApi.loadDistrictSubscriptions(...args);
export const saveCurrentProfile = (...args) => defaultDataApi.saveCurrentProfile(...args);
export const savePushSubscription = (...args) => defaultDataApi.savePushSubscription(...args);
export const removePushSubscription = (...args) => defaultDataApi.removePushSubscription(...args);
export const saveNotificationPreferences = (...args) => defaultDataApi.saveNotificationPreferences(...args);
export const saveDistrictSubscriptions = (...args) => defaultDataApi.saveDistrictSubscriptions(...args);
export const createSession = (...args) => defaultDataApi.createSession(...args);
export const requestToJoinSession = (...args) => defaultDataApi.requestToJoinSession(...args);
export const inviteToSession = (...args) => defaultDataApi.inviteToSession(...args);
export const respondToSessionInvite = (...args) => defaultDataApi.respondToSessionInvite(...args);
export const setPlayerVisibility = (...args) => defaultDataApi.setPlayerVisibility(...args);
export const acceptSessionParticipant = (...args) => defaultDataApi.acceptSessionParticipant(...args);
export const declineSessionParticipant = (...args) => defaultDataApi.declineSessionParticipant(...args);
export const withdrawFromSession = (...args) => defaultDataApi.withdrawFromSession(...args);
export const cancelSession = (...args) => defaultDataApi.cancelSession(...args);
export const markSessionPlayed = (...args) => defaultDataApi.markSessionPlayed(...args);
export const confirmSessionAttendance = (...args) => defaultDataApi.confirmSessionAttendance(...args);
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
  if (error) throw error;
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
  if (restoreError) throw restoreError;
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
  if (error) throw error;
}

export async function signOut() {
  const client = requireDefaultSupabase();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}
