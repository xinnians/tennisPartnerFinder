import { LAUNCH_CITY } from "../../config.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COURTS,
  MOCK_PLAYER_PRESENCE,
  MOCK_PLAYERS,
  MOCK_SESSION_JOIN_PREVIEWS,
  MOCK_SESSIONS,
} from "../../mockData.js";
import { isSupabaseConfigured, supabase } from "../../supabaseClient.js";
import type { NotificationPreferences, Profile, SessionSummary } from "../../domainTypes.ts";
import type { Database } from "../databaseTypes.ts";
import {
  DataApiUnavailableError,
  SESSION_ACTION_CODES,
  SessionActionError,
  asDataApiError,
  asSessionActionError,
} from "../dataErrors.ts";
import {
  defaultNotificationPreferences,
  mapCourt,
  mapCurrentProfile,
  mapMyPlayerBlockRow,
  mapNotificationPreferences,
  mapPlayerDirectoryRow,
  mapPlayerPresenceDirectoryRow,
} from "../mappers/profileMappers.ts";
import type { DataCourt } from "../mappers/profileMappers.ts";
import { discoveryQuery, withinBounds, withinDiscoveryQuery } from "../mappers/queryMappers.ts";
import type { DiscoveryQueryInput, MapBounds } from "../mappers/queryMappers.ts";
import {
  mapMockSessionJoinPreviewRow,
  mapMockSessionSummary,
  mapMySession,
  mapSessionJoinPreviewRow,
  mapSessionMessageRow,
  mapSessionRosterRow,
  mapSessionSummary,
} from "../mappers/sessionMappers.ts";
import { asArray, asNumber, asText, profileValues } from "../mappers/valueMappers.ts";
import {
  COURT_SELECT,
  COURT_SUBSCRIPTIONS_SELECT,
  MY_PLAYER_BLOCKS_SELECT,
  MY_PROFILE_SELECT,
  MY_SESSIONS_SELECT,
  NOTIFICATION_PREFS_SELECT,
  PLAYER_DIRECTORY_SELECT,
  PLAYER_PRESENCE_DIRECTORY_SELECT,
  SESSION_DISCOVERY_SELECT,
  SESSION_JOIN_PREVIEW_SELECT,
  SESSION_MESSAGE_FEED_SELECT,
  SESSION_ROSTER_SELECT,
} from "./selects.ts";

type PublicSchema = Database["public"];
type RpcName = keyof PublicSchema["Functions"];
// The generated function Args omit SQL nullability, while frozen browser
// contracts intentionally send null (notably p_line_id and candidate venues).
// Keep generated names and non-null value types, adding only the missing null.
type RpcFunctions = {
  [Name in RpcName]: Omit<PublicSchema["Functions"][Name], "Args"> & {
    Args: {
      [Key in keyof PublicSchema["Functions"][Name]["Args"]]: PublicSchema["Functions"][Name]["Args"][Key] | null;
    };
  };
};
type RepositoryDatabase = Omit<Database, "public"> & {
  public: Omit<PublicSchema, "Functions"> & { Functions: RpcFunctions };
};
type RpcArgs<Name extends RpcName> = RpcFunctions[Name]["Args"];
type CourtRow = Partial<PublicSchema["Tables"]["courts"]["Row"]>;
type MockRow = Record<string, unknown>;

interface MockDataTestHook {
  consumedCount?: number;
  delayMs?: unknown;
  errorMessage?: string;
  failuresRemaining?: number;
}

type TestHookGlobal = typeof globalThis & {
  __tennisE2ETestHooks?: { dataApi?: Record<string, MockDataTestHook> };
};

interface RepositoryOptions {
  client?: SupabaseClient<RepositoryDatabase> | null;
  configured?: boolean;
  mockCourts?: CourtRow[];
  mockPlayerPresence?: MockRow[];
  mockPlayers?: MockRow[];
  mockSessionJoinPreviews?: MockRow[];
  mockSessions?: MockRow[];
  now?: unknown;
}

interface PushSubscriptionInput {
  endpoint?: unknown;
  keys?: { auth?: unknown; p256dh?: unknown };
}

interface CreateSessionInput {
  candidateCourtIds?: unknown;
  courtId?: unknown;
  feeNote?: unknown;
  joinMode?: unknown;
  notes?: unknown;
  ntrpMax?: unknown;
  ntrpMin?: unknown;
  playType?: unknown;
  rangeEnd?: unknown;
  slotsTotal?: unknown;
  startAt?: unknown;
  venueType?: unknown;
}

interface UpdateSessionInput {
  courtId?: unknown;
  feeNote?: unknown;
  notes?: unknown;
  ntrpMax?: unknown;
  ntrpMin?: unknown;
  playType?: unknown;
  sessionId?: unknown;
  slotsMissing?: unknown;
  startAt?: unknown;
}

interface ReportInput {
  messageId?: unknown;
  reason?: unknown;
  reportedProfileId?: unknown;
  sessionId?: unknown;
}

function rowsOrEmpty<Row>(value: Row[] | null): Row[] {
  return Array.isArray(value) ? value : [];
}

async function runMockDataTestHook(name: string): Promise<void> {
  const hook = (globalThis as TestHookGlobal).__tennisE2ETestHooks?.dataApi?.[name];
  if (!hook) return;
  hook.consumedCount = (hook.consumedCount ?? 0) + 1;
  const delayMs = Number(hook.delayMs);
  if (Number.isFinite(delayMs) && delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  const failuresRemaining = Number(hook.failuresRemaining);
  if (failuresRemaining > 0) {
    hook.failuresRemaining = failuresRemaining - 1;
    throw new Error(hook.errorMessage || "forced mock data failure");
  }
}

function selectedCourtIds(profile: Partial<Profile> | null | undefined, courts: DataCourt[]): number[] {
  const selected = profileValues(profile?.courts);
  const ids = selected.map((selection) => {
    const byId = courts.find((court) => String(court.id) === String(selection));
    const byName = courts.find((court) => court.name === selection);
    return asNumber((byId ?? byName)?.id);
  });

  if (ids.some((id) => id == null)) throw new SessionActionError("PROFILE_INCOMPLETE");
  return [...new Set(ids.filter((id): id is number => id != null))];
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
}: RepositoryOptions = {}) {
  const currentTime = () => (typeof now === "function" ? now() : now);

  function requireClient() {
    if (!configured || !client) throw new DataApiUnavailableError();
    return client;
  }

  async function callRpc<Name extends RpcName>(name: Name, params: RpcArgs<Name>): Promise<unknown> {
    const activeClient = requireClient();
    const { data, error } = await activeClient.rpc(name, params);
    if (error) throw asSessionActionError(error);
    return data;
  }

  async function callLifecycleRpc<Name extends RpcName>(name: Name, params: RpcArgs<Name>) {
    const outcome = (await callRpc(name, params)) as string;
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
      .select(COURT_SELECT)
      .eq("is_active", true)
      .eq("city", city)
      .order("id");
    if (error) throw asDataApiError(error);
    return rowsOrEmpty(data).map(mapCourt);
  }

  async function loadSessionDiscovery(input: DiscoveryQueryInput = {}) {
    const query = discoveryQuery(input, currentTime());
    if (!configured) {
      await runMockDataTestHook("loadSessionDiscovery");
      return mockSessions
        .filter((session) => withinDiscoveryQuery(session as Partial<SessionSummary>, query))
        .map(mapMockSessionSummary);
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
    return rowsOrEmpty(data).map(mapSessionSummary);
  }

  async function loadPlayerDirectory({ bounds }: { bounds?: MapBounds | null } = {}) {
    if (!configured) {
      return mockPlayers.filter((entry) => withinBounds(entry, bounds)).map((entry) => ({ ...entry }));
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
    return rowsOrEmpty(data).map(mapPlayerDirectoryRow);
  }

  async function loadPlayerPresenceDirectory({ bounds }: { bounds?: MapBounds | null } = {}) {
    if (!configured) {
      return mockPlayerPresence.filter((entry) => withinBounds(entry, bounds)).map((entry) => ({ ...entry }));
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
    return rowsOrEmpty(data).map(mapPlayerPresenceDirectoryRow);
  }

  async function loadSessionSummary(sessionId: number) {
    if (!configured) {
      const found = mockSessions.find((session) => String(session.sessionId) === String(sessionId));
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
    return rowsOrEmpty(data).map(mapMySession);
  }

  async function loadSessionRoster(sessionId: number) {
    if (!configured) return [];
    const activeClient = requireClient();
    const { data, error } = await activeClient
      .from("session_participant_roster")
      .select(SESSION_ROSTER_SELECT)
      .eq("session_id", sessionId)
      .order("participant_id");
    if (error) throw asDataApiError(error);
    return rowsOrEmpty(data).map(mapSessionRosterRow);
  }

  async function loadSessionJoinPreview(sessionId: unknown) {
    const normalizedSessionId = asNumber(sessionId);
    if (!configured) {
      return mockSessionJoinPreviews
        .filter((participant) => asNumber(participant.sessionId) === normalizedSessionId)
        .map(mapMockSessionJoinPreviewRow);
    }
    const activeClient = requireClient();
    const previewQuery = activeClient.from("session_join_preview").select(SESSION_JOIN_PREVIEW_SELECT);
    const { data, error } = await (normalizedSessionId == null
      ? previewQuery.is("session_id", null)
      : previewQuery.eq("session_id", normalizedSessionId));
    if (error) throw asDataApiError(error);
    return rowsOrEmpty(data).map(mapSessionJoinPreviewRow);
  }

  async function loadSessionMessages(sessionId: unknown) {
    if (!configured) return [];
    const activeClient = requireClient();
    const normalizedSessionId = asNumber(sessionId);
    const messagesQuery = activeClient.from("session_message_feed").select(SESSION_MESSAGE_FEED_SELECT);
    const filteredMessagesQuery =
      normalizedSessionId == null
        ? messagesQuery.is("session_id", null)
        : messagesQuery.eq("session_id", normalizedSessionId);
    const { data, error } = await filteredMessagesQuery
      .order("created_at", { ascending: true })
      .order("message_id", { ascending: true });
    if (error) throw asDataApiError(error);
    return rowsOrEmpty(data).map(mapSessionMessageRow);
  }

  async function loadMyPlayerBlocks() {
    if (!configured) return [];
    const activeClient = requireClient();
    const { data, error } = await activeClient
      .from("my_player_blocks")
      .select(MY_PLAYER_BLOCKS_SELECT)
      .order("created_at", { ascending: false });
    if (error) throw asDataApiError(error);
    return rowsOrEmpty(data).map(mapMyPlayerBlockRow);
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
    return rowsOrEmpty(data)
      .map((row) => asNumber(row.court_id))
      .filter((courtId): courtId is number => courtId != null);
  }

  async function saveCurrentProfile(profile: Partial<Profile> | null | undefined) {
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

  async function savePushSubscription(subscription: PushSubscriptionInput | null | undefined) {
    const endpoint = asText(subscription?.endpoint).trim();
    const p256dh = asText(subscription?.keys?.p256dh).trim();
    const auth = asText(subscription?.keys?.auth).trim();
    const outcome = (await callRpc("save_push_subscription", {
      p_endpoint: endpoint,
      p_p256dh: p256dh,
      p_auth: auth,
    })) as string;
    if (outcome !== "OK") throw new SessionActionError("UNKNOWN_ACTION_ERROR");
    return { outcome };
  }

  async function removePushSubscription(endpoint: unknown) {
    const outcome = (await callRpc("remove_push_subscription", { p_endpoint: asText(endpoint).trim() })) as string;
    if (outcome !== "OK") throw new SessionActionError("UNKNOWN_ACTION_ERROR");
    return { outcome };
  }

  async function saveNotificationPreferences(preferences: Partial<NotificationPreferences> = {}) {
    const outcome = (await callRpc("set_notification_prefs", {
      p_chat_message_enabled: preferences.chatMessageEnabled === true,
      p_host_new_request_enabled: preferences.hostNewRequestEnabled === true,
      p_guest_request_reviewed_enabled: preferences.guestRequestReviewedEnabled === true,
      p_guest_invited_enabled: preferences.guestInvitedEnabled === true,
      p_session_reminder_enabled: preferences.sessionReminderEnabled === true,
      p_session_updated_enabled: preferences.sessionUpdatedEnabled === true,
    })) as string;
    if (outcome !== "OK") throw new SessionActionError("UNKNOWN_ACTION_ERROR");
    return { outcome };
  }

  async function saveCourtSubscriptions(courtIds: unknown) {
    const normalizedCourtIds = asArray(courtIds)
      .map(asNumber)
      .filter((courtId) => courtId != null);
    const outcome = (await callRpc("set_court_subscriptions", { p_court_ids: normalizedCourtIds })) as string;
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
  }: CreateSessionInput) {
    const sessionId = await callRpc("create_session", {
      p_court_id: asNumber(courtId),
      p_play_type: asText(playType),
      p_start_at: asText(startAt),
      p_ntrp_min: ntrpMin == null ? null : asNumber(ntrpMin),
      p_ntrp_max: ntrpMax == null ? null : asNumber(ntrpMax),
      p_slots_total: asNumber(slotsTotal),
      p_notes: notes == null ? null : asText(notes),
      p_join_mode: asText(joinMode),
      p_venue_type: asText(venueType),
      p_candidate_court_ids:
        candidateCourtIds == null
          ? null
          : asArray(candidateCourtIds)
              .map(asNumber)
              .filter((id) => id != null),
      p_range_end: rangeEnd == null ? null : asText(rangeEnd),
      p_fee_note: feeNote == null ? null : asText(feeNote),
    });
    return { sessionId: asNumber(sessionId) };
  }

  async function requestToJoinSession(sessionId: unknown) {
    const outcome = (await callRpc("request_to_join_session", { p_session_id: asNumber(sessionId) })) as string;
    if (!["OK", "ACCEPTED", "OK_NTRP_MISSING", "OK_NTRP_OUT_OF_RANGE", "SESSION_EXPIRED"].includes(outcome)) {
      throw new SessionActionError("UNKNOWN_ACTION_ERROR");
    }
    return { outcome, accepted: outcome === "ACCEPTED", reloadRequired: outcome === "SESSION_EXPIRED" };
  }

  async function updateSession({
    sessionId,
    startAt,
    courtId,
    slotsMissing,
    ntrpMin = null,
    ntrpMax = null,
    playType,
    feeNote = null,
    notes = null,
  }: UpdateSessionInput) {
    return callLifecycleRpc("update_session", {
      p_session_id: asNumber(sessionId),
      p_start_at: asText(startAt),
      p_court_id: asNumber(courtId),
      p_slots_missing: asNumber(slotsMissing),
      p_ntrp_min: ntrpMin == null ? null : asNumber(ntrpMin),
      p_ntrp_max: ntrpMax == null ? null : asNumber(ntrpMax),
      p_play_type: asText(playType),
      p_fee_note: feeNote == null ? null : asText(feeNote),
      p_note: notes == null ? null : asText(notes),
    });
  }

  async function decideSessionCourt(sessionId: unknown, courtId: unknown, startAt: unknown) {
    return callLifecycleRpc("decide_session_court", {
      p_session_id: asNumber(sessionId),
      p_court_id: asNumber(courtId),
      p_start_at: asText(startAt),
    });
  }

  async function inviteToSession(sessionId: unknown, profileId: unknown) {
    return callLifecycleRpc("invite_to_session", {
      p_session_id: asNumber(sessionId),
      p_profile_id: asNumber(profileId),
    });
  }

  async function respondToSessionInvite(sessionId: unknown, decision: unknown) {
    return callLifecycleRpc("respond_to_session_invite", {
      p_session_id: asNumber(sessionId),
      p_decision: asText(decision),
    });
  }

  async function setPlayerVisibility(visible: unknown) {
    return callLifecycleRpc("set_player_visibility", { p_visible: Boolean(visible) });
  }

  async function setPresenceSharing(shared: unknown) {
    const outcome = (await callRpc("set_presence_sharing", { p_enabled: Boolean(shared) })) as string;
    if (outcome !== "OK") throw new SessionActionError("UNKNOWN_ACTION_ERROR");
    return { outcome };
  }

  async function setOpenToGreeting(open: unknown) {
    const outcome = (await callRpc("set_open_to_greeting", { p_enabled: Boolean(open) })) as string;
    if (outcome !== "OK") throw new SessionActionError("UNKNOWN_ACTION_ERROR");
    return { outcome };
  }

  async function updateMyPresence({ lat, lng }: { lat?: unknown; lng?: unknown } = {}) {
    const outcome = (await callRpc("update_my_presence", { p_lat: asNumber(lat), p_lng: asNumber(lng) })) as string;
    if (outcome !== "OK") throw new SessionActionError("UNKNOWN_ACTION_ERROR");
    return { outcome };
  }

  async function acceptSessionParticipant(sessionId: unknown, participantId: unknown) {
    return callLifecycleRpc("review_join_request", {
      p_session_id: asNumber(sessionId),
      p_participant_id: asNumber(participantId),
      p_decision: "accepted",
    });
  }

  async function declineSessionParticipant(sessionId: unknown, participantId: unknown) {
    return callLifecycleRpc("review_join_request", {
      p_session_id: asNumber(sessionId),
      p_participant_id: asNumber(participantId),
      p_decision: "declined",
    });
  }

  async function withdrawFromSession(sessionId: unknown) {
    return callLifecycleRpc("withdraw_from_session", { p_session_id: asNumber(sessionId) });
  }

  async function cancelSession(sessionId: unknown) {
    return callLifecycleRpc("cancel_session", { p_session_id: asNumber(sessionId) });
  }

  async function markSessionPlayed(sessionId: unknown) {
    return callLifecycleRpc("mark_session_played", { p_session_id: asNumber(sessionId) });
  }

  async function confirmSessionAttendance(sessionId: unknown) {
    return callLifecycleRpc("confirm_session_attendance", { p_session_id: asNumber(sessionId) });
  }

  async function postSessionMessage(sessionId: unknown, body: unknown) {
    const outcome = (await callRpc("post_session_message", {
      p_session_id: asNumber(sessionId),
      p_body: asText(body).trim(),
    })) as string;
    if (outcome !== "OK") {
      throw new SessionActionError(SESSION_ACTION_CODES.includes(outcome) ? outcome : "UNKNOWN_ACTION_ERROR");
    }
    return { outcome };
  }

  async function markSessionChatRead(sessionId: unknown) {
    // 比照 loadSessionMessages/loadSessionRoster 這對緊鄰的聊天讀取函式：mock 模式
    // 直接給合理值,不讓 sessionController 的 best-effort 呼叫點必須自己 try/catch
    // 一個在 mock 模式下必然因 requireClient() 而丟例外的呼叫。
    if (!configured) return { outcome: "OK" };
    const outcome = (await callRpc("mark_session_chat_read", { p_session_id: asNumber(sessionId) })) as string;
    if (outcome !== "OK") throw new SessionActionError("UNKNOWN_ACTION_ERROR");
    return { outcome };
  }

  async function setPlayerBlock(profileId: unknown, blocked: unknown) {
    const outcome = (await callRpc("set_player_block", {
      p_profile_id: asNumber(profileId),
      p_blocked: Boolean(blocked),
    })) as string;
    if (outcome !== "OK") throw new SessionActionError("UNKNOWN_ACTION_ERROR");
    return { outcome };
  }

  async function createReport({ sessionId = null, reportedProfileId = null, reason, messageId = null }: ReportInput) {
    const normalizedMessageId = messageId == null ? null : asNumber(messageId);
    const reportId = await callRpc("create_report", {
      p_session_id: normalizedMessageId == null ? asNumber(sessionId) : null,
      p_reported_profile_id: asNumber(reportedProfileId),
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
