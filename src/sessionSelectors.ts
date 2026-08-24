import type {
  ControllerMapViewPayload,
  ControllerMySessionsViewState,
  ControllerPlayerLayerViewState,
  SessionControllerState,
} from "./controllerContracts.ts";
import { groupPlayersByCourt } from "./features/player-directory/playerDirectoryFeature.ts";
import { mapStatusForState, selectVisibleSessions } from "./features/discovery/discoveryFeature.ts";
import { groupMySessions } from "./features/session-lifecycle/sessionLifecycleFeature.ts";
import { profileIsPublic } from "./features/profile-auth/profileAuthFeature.ts";

function sessionsWithRequests(state: Readonly<SessionControllerState>) {
  return state.mySessions.map((session) => ({
    ...session,
    pendingRequests: [...(state.mySessionRosters.get(String(session.sessionId)) ?? [])],
  }));
}

export function selectControllerMapView(state: Readonly<SessionControllerState>): ControllerMapViewPayload {
  return {
    courts: state.courts,
    drawerState: state.drawerState,
    filters: state.filters,
    hasUserLocation: Boolean(state.userLocation),
    locationMessage: state.locationMessage,
    mapStatus: mapStatusForState(state),
    sessions: selectVisibleSessions(state),
  };
}

export function selectControllerMySessionsView(state: Readonly<SessionControllerState>): ControllerMySessionsViewState {
  return {
    authenticated: Boolean(state.authSession),
    blockedPlayers: [...state.blockedPlayers],
    blockedPlayersError: state.blockedPlayersError,
    blockedPlayersStatus: state.blockedPlayersStatus,
    error: state.mySessionsError,
    groups: groupMySessions(sessionsWithRequests(state)),
    isPublic: profileIsPublic(state.profileEligibility),
    status: state.mySessionsStatus,
    viewGeneration: state.authEpoch,
  };
}

export function selectControllerPlayerLayerView(
  state: Readonly<SessionControllerState>
): ControllerPlayerLayerViewState {
  return {
    groups: state.playerLayerOn ? groupPlayersByCourt(state.players) : [],
    message: state.playerLayerMessage,
    on: state.playerLayerOn,
    status: state.playerLayerStatus,
  };
}
