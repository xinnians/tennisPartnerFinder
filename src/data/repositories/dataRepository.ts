import type { SupabaseClient } from "@supabase/supabase-js";

import { LAUNCH_CITY } from "../../config.js";
import type { SessionSummary } from "../../domainTypes.ts";
import { getE2ETestHooks } from "../../e2eTestHooks.ts";
import {
  COURTS,
  MOCK_PLAYER_PRESENCE,
  MOCK_PLAYERS,
  MOCK_SESSION_JOIN_PREVIEWS,
  MOCK_SESSIONS,
} from "../../mockData.js";
import { isSupabaseConfigured, supabase } from "../../supabaseClient.js";
import type { Database } from "../databaseTypes.ts";
import { DataApiUnavailableError, asDataApiError } from "../dataErrors.ts";
import { mapCourt } from "../mappers/profileMappers.ts";
import { discoveryQuery, withinDiscoveryQuery } from "../mappers/queryMappers.ts";
import type { DiscoveryQueryInput } from "../mappers/queryMappers.ts";
import { mapMockSessionSummary, mapSessionSummary } from "../mappers/sessionMappers.ts";
import type { PrivateDataApi, PrivateDataRepositoryOptions, RepositoryDatabase } from "./privateDataRepository.ts";
import { COURT_SELECT, SESSION_DISCOVERY_SELECT } from "./selects.ts";

type PublicSchema = Database["public"];
type CourtRow = Partial<PublicSchema["Tables"]["courts"]["Row"]>;
type MockRow = Record<string, unknown>;

interface MockDataTestHook {
  consumedCount?: number;
  delayMs?: unknown;
  errorMessage?: string;
  failuresRemaining?: number;
}

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

function rowsOrEmpty<Row>(value: Row[] | null): Row[] {
  return Array.isArray(value) ? value : [];
}

async function runMockDataTestHook(name: string): Promise<void> {
  const hook = getE2ETestHooks<{ dataApi?: Record<string, MockDataTestHook> }>()?.dataApi?.[name];
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
    return rowsOrEmpty(data).map(mapSessionSummary);
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

  let privateDataApiRequest: Promise<PrivateDataApi> | null = null;
  function loadPrivateDataApi(): Promise<PrivateDataApi> {
    if (privateDataApiRequest) return privateDataApiRequest;
    const options: PrivateDataRepositoryOptions = {
      client,
      configured,
      loadCourts,
      mockPlayerPresence,
      mockPlayers,
      mockSessionJoinPreviews,
    };
    privateDataApiRequest = import("./privateDataRepository.ts").then(({ createPrivateDataApi }) =>
      createPrivateDataApi(options)
    );
    return privateDataApiRequest;
  }

  function bindPrivateMethod<Name extends keyof PrivateDataApi>(name: Name): PrivateDataApi[Name] {
    return ((...args: unknown[]) =>
      loadPrivateDataApi().then((api) => {
        const method = api[name] as (...values: unknown[]) => unknown;
        return method(...args);
      })) as PrivateDataApi[Name];
  }

  const acceptSessionParticipant = bindPrivateMethod("acceptSessionParticipant");
  const cancelSession = bindPrivateMethod("cancelSession");
  const confirmSessionAttendance = bindPrivateMethod("confirmSessionAttendance");
  const createReport = bindPrivateMethod("createReport");
  const createSession = bindPrivateMethod("createSession");
  const decideSessionCourt = bindPrivateMethod("decideSessionCourt");
  const declineSessionParticipant = bindPrivateMethod("declineSessionParticipant");
  const inviteToSession = bindPrivateMethod("inviteToSession");
  const loadCourtSubscriptions = bindPrivateMethod("loadCourtSubscriptions");
  const loadCurrentProfile = bindPrivateMethod("loadCurrentProfile");
  const loadMyPlayerBlocks = bindPrivateMethod("loadMyPlayerBlocks");
  const loadMySessions = bindPrivateMethod("loadMySessions");
  const loadNotificationPreferences = bindPrivateMethod("loadNotificationPreferences");
  const loadPlayerDirectory = bindPrivateMethod("loadPlayerDirectory");
  const loadPlayerPresenceDirectory = bindPrivateMethod("loadPlayerPresenceDirectory");
  const loadSessionJoinPreview = bindPrivateMethod("loadSessionJoinPreview");
  const loadSessionMessages = bindPrivateMethod("loadSessionMessages");
  const loadSessionRoster = bindPrivateMethod("loadSessionRoster");
  const markSessionChatRead = bindPrivateMethod("markSessionChatRead");
  const markSessionPlayed = bindPrivateMethod("markSessionPlayed");
  const postSessionMessage = bindPrivateMethod("postSessionMessage");
  const removePushSubscription = bindPrivateMethod("removePushSubscription");
  const requestToJoinSession = bindPrivateMethod("requestToJoinSession");
  const respondToSessionInvite = bindPrivateMethod("respondToSessionInvite");
  const saveCourtSubscriptions = bindPrivateMethod("saveCourtSubscriptions");
  const saveCurrentProfile = bindPrivateMethod("saveCurrentProfile");
  const saveNotificationPreferences = bindPrivateMethod("saveNotificationPreferences");
  const savePushSubscription = bindPrivateMethod("savePushSubscription");
  const setOpenToGreeting = bindPrivateMethod("setOpenToGreeting");
  const setPlayerBlock = bindPrivateMethod("setPlayerBlock");
  const setPlayerVisibility = bindPrivateMethod("setPlayerVisibility");
  const setPresenceSharing = bindPrivateMethod("setPresenceSharing");
  const updateMyPresence = bindPrivateMethod("updateMyPresence");
  const updateSession = bindPrivateMethod("updateSession");
  const withdrawFromSession = bindPrivateMethod("withdrawFromSession");

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
    loadCourts,
    loadCurrentProfile,
    loadMyPlayerBlocks,
    loadMySessions,
    loadNotificationPreferences,
    loadPlayerDirectory,
    loadPlayerPresenceDirectory,
    loadSessionDiscovery,
    loadSessionJoinPreview,
    loadSessionMessages,
    loadSessionRoster,
    loadSessionSummary,
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
