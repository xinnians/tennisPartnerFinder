import { createDataApi } from "./data/repositories/dataRepository.ts";

export {
  getInitialSession,
  linkLoginIdentity,
  onAuthStateChange,
  resolveInitialSession,
  signInWithOAuthProvider,
  signOut,
} from "./data/authApi.ts";
export { isSupabaseConfigured } from "./supabaseClient.js";
export { DataApiError, DataApiUnavailableError, SESSION_ACTION_CODES, SessionActionError } from "./data/dataErrors.ts";
export {
  mapCurrentProfile,
  mapMyPlayerBlockRow,
  mapPlayerDirectoryRow,
  mapPlayerPresenceDirectoryRow,
} from "./data/mappers/profileMappers.ts";
export {
  mapMySession,
  mapSessionJoinPreviewRow,
  mapSessionMessageRow,
  mapSessionRosterRow,
  mapSessionSummary,
} from "./data/mappers/sessionMappers.ts";
export { createDataApi };
export {
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
} from "./data/repositories/selects.ts";

type DataApi = ReturnType<typeof createDataApi>;

const defaultDataApi = createDataApi();

export const loadCourts = (...args: Parameters<DataApi["loadCourts"]>) => defaultDataApi.loadCourts(...args);
export const loadSessionDiscovery = (...args: Parameters<DataApi["loadSessionDiscovery"]>) =>
  defaultDataApi.loadSessionDiscovery(...args);
export const loadPlayerDirectory = (...args: Parameters<DataApi["loadPlayerDirectory"]>) =>
  defaultDataApi.loadPlayerDirectory(...args);
export const loadPlayerPresenceDirectory = (...args: Parameters<DataApi["loadPlayerPresenceDirectory"]>) =>
  defaultDataApi.loadPlayerPresenceDirectory(...args);
export const loadSessionSummary = (...args: Parameters<DataApi["loadSessionSummary"]>) =>
  defaultDataApi.loadSessionSummary(...args);
export const loadMySessions = (...args: Parameters<DataApi["loadMySessions"]>) =>
  defaultDataApi.loadMySessions(...args);
export const loadSessionRoster = (...args: Parameters<DataApi["loadSessionRoster"]>) =>
  defaultDataApi.loadSessionRoster(...args);
export const loadSessionJoinPreview = (...args: Parameters<DataApi["loadSessionJoinPreview"]>) =>
  defaultDataApi.loadSessionJoinPreview(...args);
export const loadSessionMessages = (...args: Parameters<DataApi["loadSessionMessages"]>) =>
  defaultDataApi.loadSessionMessages(...args);
export const loadMyPlayerBlocks = (...args: Parameters<DataApi["loadMyPlayerBlocks"]>) =>
  defaultDataApi.loadMyPlayerBlocks(...args);
export const loadCurrentProfile = (...args: Parameters<DataApi["loadCurrentProfile"]>) =>
  defaultDataApi.loadCurrentProfile(...args);
export const loadNotificationPreferences = (...args: Parameters<DataApi["loadNotificationPreferences"]>) =>
  defaultDataApi.loadNotificationPreferences(...args);
export const loadCourtSubscriptions = (...args: Parameters<DataApi["loadCourtSubscriptions"]>) =>
  defaultDataApi.loadCourtSubscriptions(...args);
export const saveCurrentProfile = (...args: Parameters<DataApi["saveCurrentProfile"]>) =>
  defaultDataApi.saveCurrentProfile(...args);
export const savePushSubscription = (...args: Parameters<DataApi["savePushSubscription"]>) =>
  defaultDataApi.savePushSubscription(...args);
export const removePushSubscription = (...args: Parameters<DataApi["removePushSubscription"]>) =>
  defaultDataApi.removePushSubscription(...args);
export const saveNotificationPreferences = (...args: Parameters<DataApi["saveNotificationPreferences"]>) =>
  defaultDataApi.saveNotificationPreferences(...args);
export const saveCourtSubscriptions = (...args: Parameters<DataApi["saveCourtSubscriptions"]>) =>
  defaultDataApi.saveCourtSubscriptions(...args);
export const createSession = (...args: Parameters<DataApi["createSession"]>) => defaultDataApi.createSession(...args);
export const requestToJoinSession = (...args: Parameters<DataApi["requestToJoinSession"]>) =>
  defaultDataApi.requestToJoinSession(...args);
export const updateSession = (...args: Parameters<DataApi["updateSession"]>) => defaultDataApi.updateSession(...args);
export const decideSessionCourt = (...args: Parameters<DataApi["decideSessionCourt"]>) =>
  defaultDataApi.decideSessionCourt(...args);
export const inviteToSession = (...args: Parameters<DataApi["inviteToSession"]>) =>
  defaultDataApi.inviteToSession(...args);
export const respondToSessionInvite = (...args: Parameters<DataApi["respondToSessionInvite"]>) =>
  defaultDataApi.respondToSessionInvite(...args);
export const setPlayerVisibility = (...args: Parameters<DataApi["setPlayerVisibility"]>) =>
  defaultDataApi.setPlayerVisibility(...args);
export const setPresenceSharing = (...args: Parameters<DataApi["setPresenceSharing"]>) =>
  defaultDataApi.setPresenceSharing(...args);
export const setOpenToGreeting = (...args: Parameters<DataApi["setOpenToGreeting"]>) =>
  defaultDataApi.setOpenToGreeting(...args);
export const updateMyPresence = (...args: Parameters<DataApi["updateMyPresence"]>) =>
  defaultDataApi.updateMyPresence(...args);
export const acceptSessionParticipant = (...args: Parameters<DataApi["acceptSessionParticipant"]>) =>
  defaultDataApi.acceptSessionParticipant(...args);
export const declineSessionParticipant = (...args: Parameters<DataApi["declineSessionParticipant"]>) =>
  defaultDataApi.declineSessionParticipant(...args);
export const withdrawFromSession = (...args: Parameters<DataApi["withdrawFromSession"]>) =>
  defaultDataApi.withdrawFromSession(...args);
export const cancelSession = (...args: Parameters<DataApi["cancelSession"]>) => defaultDataApi.cancelSession(...args);
export const markSessionPlayed = (...args: Parameters<DataApi["markSessionPlayed"]>) =>
  defaultDataApi.markSessionPlayed(...args);
export const confirmSessionAttendance = (...args: Parameters<DataApi["confirmSessionAttendance"]>) =>
  defaultDataApi.confirmSessionAttendance(...args);
export const postSessionMessage = (...args: Parameters<DataApi["postSessionMessage"]>) =>
  defaultDataApi.postSessionMessage(...args);
export const markSessionChatRead = (...args: Parameters<DataApi["markSessionChatRead"]>) =>
  defaultDataApi.markSessionChatRead(...args);
export const setPlayerBlock = (...args: Parameters<DataApi["setPlayerBlock"]>) =>
  defaultDataApi.setPlayerBlock(...args);
export const createReport = (...args: Parameters<DataApi["createReport"]>) => defaultDataApi.createReport(...args);
