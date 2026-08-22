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
