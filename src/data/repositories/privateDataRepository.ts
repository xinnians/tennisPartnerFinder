import type { SupabaseClient } from "@supabase/supabase-js";

import type { NotificationPreferences, Profile } from "../../domainTypes.ts";
import { defaultNotificationPreferences } from "../../notificationPreferences.ts";
import type { Database } from "../databaseTypes.ts";
import {
  DataApiUnavailableError,
  SESSION_ACTION_CODES,
  SessionActionError,
  asDataApiError,
  asSessionActionError,
} from "../dataErrors.ts";
import {
  mapCurrentProfile,
  mapMockPlayerDirectoryRow,
  mapMockPlayerPresenceDirectoryRow,
  mapMyPlayerBlockRow,
  mapNotificationPreferences,
  mapPlayerDirectoryRow,
  mapPlayerPresenceDirectoryRow,
} from "../mappers/profileMappers.ts";
import type { DataCourt } from "../mappers/profileMappers.ts";
import { withinBounds } from "../mappers/queryMappers.ts";
import type { MapBounds } from "../mappers/queryMappers.ts";
import {
  mapMockSessionJoinPreviewRow,
  mapMySession,
  mapSessionJoinPreviewRow,
  mapSessionMessageRow,
  mapSessionRosterRow,
} from "../mappers/sessionMappers.ts";
import { asArray, asNumber, asText, profileValues } from "../mappers/valueMappers.ts";
import { MY_SESSIONS_LIMIT, PLAYER_DIRECTORY_LIMIT, SESSION_MESSAGES_LIMIT } from "./listQueryLimits.ts";
import {
  COURT_SUBSCRIPTIONS_SELECT,
  MY_PLAYER_BLOCKS_SELECT,
  MY_PROFILE_SELECT,
  MY_SESSIONS_SELECT,
  NOTIFICATION_PREFS_SELECT,
  PLAYER_DIRECTORY_SELECT,
  PLAYER_PRESENCE_DIRECTORY_SELECT,
  SESSION_JOIN_PREVIEW_SELECT,
  SESSION_MESSAGE_FEED_SELECT,
  SESSION_ROSTER_SELECT,
} from "./selects.ts";

type PublicSchema = Database["public"];
type RpcName = keyof PublicSchema["Functions"];
type RpcFunctions = {
  [Name in RpcName]: Omit<PublicSchema["Functions"][Name], "Args"> & {
    Args: {
      [Key in keyof PublicSchema["Functions"][Name]["Args"]]: PublicSchema["Functions"][Name]["Args"][Key] | null;
    };
  };
};
export type RepositoryDatabase = Omit<Database, "public"> & {
  public: Omit<PublicSchema, "Functions"> & { Functions: RpcFunctions };
};
type RpcArgs<Name extends RpcName> = RpcFunctions[Name]["Args"];
type MockRow = Record<string, unknown>;
const PRIVATE_DATA_CHUNK_MARKER = "tennis_private_data_repository_v1";

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

export interface PrivateDataRepositoryOptions {
  client: SupabaseClient<RepositoryDatabase> | null;
  configured: boolean;
  loadCourts(city?: string): Promise<DataCourt[]>;
  mockPlayerPresence: MockRow[];
  mockPlayers: MockRow[];
  mockSessionJoinPreviews: MockRow[];
}

function rowsOrEmpty<Row>(value: Row[] | null): Row[] {
  return Array.isArray(value) ? value : [];
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

export function createPrivateDataApi({
  client,
  configured,
  loadCourts,
  mockPlayerPresence,
  mockPlayers,
  mockSessionJoinPreviews,
}: PrivateDataRepositoryOptions) {
  if (![mockPlayerPresence, mockPlayers, mockSessionJoinPreviews].every(Array.isArray)) {
    throw new Error(`${PRIVATE_DATA_CHUNK_MARKER}: invalid mock repository inputs`);
  }

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
    return { outcome, reloadRequired: outcome === "SESSION_EXPIRED" };
  }

  async function loadPlayerDirectory({ bounds }: { bounds?: MapBounds | null } = {}) {
    if (!configured) {
      return mockPlayers
        .filter((entry) => withinBounds(entry, bounds))
        .map(mapMockPlayerDirectoryRow)
        .sort(
          (left, right) =>
            left.nickname.localeCompare(right.nickname) ||
            Number(left.profileId) - Number(right.profileId) ||
            Number(left.courtId) - Number(right.courtId)
        )
        .slice(0, PLAYER_DIRECTORY_LIMIT);
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
    const { data, error } = await query
      .order("nickname", { ascending: true })
      .order("profile_id", { ascending: true })
      .order("court_id", { ascending: true })
      .limit(PLAYER_DIRECTORY_LIMIT);
    if (error) throw asDataApiError(error);
    return rowsOrEmpty(data).map(mapPlayerDirectoryRow);
  }

  async function loadPlayerPresenceDirectory({ bounds }: { bounds?: MapBounds | null } = {}) {
    if (!configured) {
      return mockPlayerPresence.filter((entry) => withinBounds(entry, bounds)).map(mapMockPlayerPresenceDirectoryRow);
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

  async function loadMySessions() {
    if (!configured) return [];
    const activeClient = requireClient();
    const { data, error } = await activeClient
      .from("my_session_participations")
      .select(MY_SESSIONS_SELECT)
      .order("updated_at", { ascending: false })
      .order("session_id", { ascending: false })
      .limit(MY_SESSIONS_LIMIT);
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
      .order("created_at", { ascending: false })
      .order("message_id", { ascending: false })
      .limit(SESSION_MESSAGES_LIMIT);
    if (error) throw asDataApiError(error);
    return rowsOrEmpty(data).map(mapSessionMessageRow).reverse();
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

  async function loadCurrentProfileWithCourts(courts?: DataCourt[]) {
    const activeClient = requireClient();
    const { data, error } = await activeClient.from("my_profile").select(MY_PROFILE_SELECT).maybeSingle();
    if (error) throw asDataApiError(error);
    if (!data) return null;
    return mapCurrentProfile(data, courts ?? (await loadCourts()));
  }

  async function loadCurrentProfile() {
    if (!configured) return null;
    return loadCurrentProfileWithCourts();
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
    return loadCurrentProfileWithCourts(courts);
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
    acceptSessionParticipant,
    cancelSession,
    confirmSessionAttendance,
    createReport,
    createSession,
    decideSessionCourt,
    declineSessionParticipant,
    inviteToSession,
    loadCourtSubscriptions,
    loadCurrentProfile,
    loadMyPlayerBlocks,
    loadMySessions,
    loadNotificationPreferences,
    loadPlayerDirectory,
    loadPlayerPresenceDirectory,
    loadSessionJoinPreview,
    loadSessionMessages,
    loadSessionRoster,
    markSessionChatRead,
    markSessionPlayed,
    postSessionMessage,
    removePushSubscription,
    requestToJoinSession,
    respondToSessionInvite,
    saveCourtSubscriptions,
    saveCurrentProfile,
    saveNotificationPreferences,
    savePushSubscription,
    setOpenToGreeting,
    setPlayerBlock,
    setPlayerVisibility,
    setPresenceSharing,
    updateMyPresence,
    updateSession,
    withdrawFromSession,
  };
}

export type PrivateDataApi = ReturnType<typeof createPrivateDataApi>;
