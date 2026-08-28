import { createContext, useContext, useMemo, type ReactNode } from "react";

import type {
  ControllerApi,
  ControllerIdentifier,
  ControllerMapViewPayload,
  ControllerMySessionGroups,
  SessionControllerState,
} from "../controllerContracts.ts";
import type { PageNotificationSettings, PageViewState, PageViewStore } from "../pageViewStore.ts";
import { useBeforeNearbyDrawerStoreChange } from "../nearbyDrawerFocus.ts";
import { selectControllerMapView, selectControllerMySessionsView } from "../sessionSelectors.ts";
import { selectMeState } from "../sessionSelectors.ts";
import { useStoreSelector } from "../sessionStore.ts";

type MessagesServices = Pick<ControllerApi, "openSessionChat" | "sessionStore">;

export interface MySessionsAppActions {
  onBack: () => unknown;
  onCreatedSessionFocus: (sessionId?: ControllerIdentifier) => boolean;
  onEnablePush: () => unknown;
  onSignIn: () => unknown;
}

export interface NearbyDrawerAppActions {
  onSubscribe: () => unknown;
}

export interface MeAppActions {
  lineProviderId: string;
  onEditProfile: () => unknown;
  onEnablePush: () => unknown;
  onLinkProvider: (provider: string) => unknown;
  onSaveCourtSubscriptions: (courtIds: number[]) => unknown;
  onSaveNotificationPreferences: (preferences: import("../domainTypes.ts").NotificationPreferences) => unknown;
  onSetOpenToGreeting: (enabled: boolean) => unknown;
  onSetPresenceSharing: (enabled: boolean) => unknown;
  onSignIn: () => unknown;
  onSignOut: () => unknown;
  supportHref: string;
}

export interface AppServices {
  controller: ControllerApi;
  meApp: MeAppActions;
  mySessionsApp: MySessionsAppActions;
  nearbyDrawerApp: NearbyDrawerAppActions;
  pageViewStore: PageViewStore;
}

export interface MySessionsPageView {
  createdSessionFocusId: PageViewState["createdSessionFocusId"];
  createdSessionFocusReason: PageViewState["createdSessionFocusReason"];
  notificationSettings: PageNotificationSettings;
}

export interface MePageView {
  notificationSettings: PageNotificationSettings;
  presenceLocationStatus: PageViewState["presenceLocationStatus"];
}

export type MessagesState = Pick<SessionControllerState, "courts"> & {
  groups: ControllerMySessionGroups;
};

export type MessagesActions = Pick<MessagesServices, "openSessionChat">;

type NearbyDrawerServices = Pick<
  ControllerApi,
  "expandBounds" | "openCreateIntent" | "openSession" | "resetFilters" | "retryDiscovery" | "setDrawerState"
>;

export type NearbyDrawerState = Pick<
  ControllerMapViewPayload,
  "courts" | "drawerState" | "filters" | "hasUserLocation" | "mapStatus" | "sessions"
>;

export interface NearbyDrawerActions {
  onExpandBounds: NearbyDrawerServices["expandBounds"];
  onOpenCreate: NearbyDrawerServices["openCreateIntent"];
  onOpenSession: NearbyDrawerServices["openSession"];
  onReset: NearbyDrawerServices["resetFilters"];
  onRetry: NearbyDrawerServices["retryDiscovery"];
  onToggle: NearbyDrawerServices["setDrawerState"];
}

type MySessionsServices = Pick<
  ControllerApi,
  | "cancelMySession"
  | "confirmMySessionAttendance"
  | "markMySessionPlayed"
  | "openCreateIntent"
  | "openRosterParticipantReport"
  | "openSession"
  | "openSessionChat"
  | "openSessionDecision"
  | "openSessionEdit"
  | "openSessionReport"
  | "refreshMySessions"
  | "respondInvite"
  | "reviewMySessionParticipant"
  | "sessionStore"
  | "withdrawMySession"
>;

export interface MySessionsState {
  actionScopeKey: SessionControllerState["authEpoch"];
  authenticated: boolean;
  courts: SessionControllerState["courts"];
  errorMessage: string;
  groups: ControllerMySessionGroups;
  status: SessionControllerState["mySessionsStatus"];
}

export interface MySessionsActions {
  onAccept(
    sessionId?: ControllerIdentifier,
    participantId?: ControllerIdentifier
  ): ReturnType<ControllerApi["reviewMySessionParticipant"]>;
  onAcceptInvite(sessionId?: ControllerIdentifier): ReturnType<ControllerApi["respondInvite"]>;
  onCancel: MySessionsServices["cancelMySession"];
  onConfirmAttendance: MySessionsServices["confirmMySessionAttendance"];
  onCreateSession(): ReturnType<ControllerApi["openCreateIntent"]>;
  onDecline(
    sessionId?: ControllerIdentifier,
    participantId?: ControllerIdentifier
  ): ReturnType<ControllerApi["reviewMySessionParticipant"]>;
  onDeclineInvite(sessionId?: ControllerIdentifier): ReturnType<ControllerApi["respondInvite"]>;
  onDecide: MySessionsServices["openSessionDecision"];
  onEdit: MySessionsServices["openSessionEdit"];
  onMarkPlayed: MySessionsServices["markMySessionPlayed"];
  onOpenChat: MySessionsServices["openSessionChat"];
  onOpenSession: MySessionsServices["openSession"];
  onRefresh: () => ReturnType<ControllerApi["refreshMySessions"]>;
  onReportParticipant: MySessionsServices["openRosterParticipantReport"];
  onReportSession: MySessionsServices["openSessionReport"];
  onWithdraw: MySessionsServices["withdrawMySession"];
}

interface AppServicesContextValue {
  controller: ControllerApi;
  meApp?: MeAppActions;
  mySessionsApp?: MySessionsAppActions;
  nearbyDrawerApp?: NearbyDrawerAppActions;
  pageViewStore?: PageViewStore;
}

const AppServicesContext = createContext<AppServicesContextValue | null>(null);

function useAppServices(): AppServicesContextValue {
  const services = useContext(AppServicesContext);
  if (!services) throw new Error("App services are unavailable outside AppServicesProvider.");
  return services;
}

function selectMessagesGroups(state: Readonly<SessionControllerState>): ControllerMySessionGroups {
  return selectControllerMySessionsView(state).groups;
}

function selectMessagesCourts(state: Readonly<SessionControllerState>): SessionControllerState["courts"] {
  return state.courts;
}

function selectMySessionsState(state: Readonly<SessionControllerState>): Omit<MySessionsState, "courts"> {
  const view = selectControllerMySessionsView(state);
  return {
    actionScopeKey: view.viewGeneration,
    authenticated: view.authenticated,
    errorMessage: view.error,
    groups: view.groups,
    status: view.status,
  };
}

function selectNearbyDrawerState(state: Readonly<SessionControllerState>): NearbyDrawerState {
  const { courts, drawerState, filters, hasUserLocation, mapStatus, sessions } = selectControllerMapView(state);
  return { courts, drawerState, filters, hasUserLocation, mapStatus, sessions };
}

function selectMySessionsPageView(state: Readonly<PageViewState>): MySessionsPageView {
  return {
    createdSessionFocusId: state.createdSessionFocusId,
    createdSessionFocusReason: state.createdSessionFocusReason,
    notificationSettings: state.notificationSettings,
  };
}

function selectMePageView(state: Readonly<PageViewState>): MePageView {
  return {
    notificationSettings: state.notificationSettings,
    presenceLocationStatus: state.presenceLocationStatus,
  };
}

export function AppServicesProvider({
  children,
  controller,
  meApp,
  mySessionsApp,
  nearbyDrawerApp,
  pageViewStore,
}: {
  children: ReactNode;
  controller: ControllerApi;
  meApp?: MeAppActions;
  mySessionsApp?: MySessionsAppActions;
  nearbyDrawerApp?: NearbyDrawerAppActions;
  pageViewStore?: PageViewStore;
}) {
  const services = useMemo(
    () => ({ controller, meApp, mySessionsApp, nearbyDrawerApp, pageViewStore }),
    [controller, meApp, mySessionsApp, nearbyDrawerApp, pageViewStore]
  );
  return <AppServicesContext.Provider value={services}>{children}</AppServicesContext.Provider>;
}

export function useMessagesState(): MessagesState {
  const { sessionStore } = useAppServices().controller;
  const current = sessionStore.getState();
  const groups = useStoreSelector(sessionStore, "mySessions", selectMessagesGroups, selectMessagesGroups(current));
  const courts = useStoreSelector(sessionStore, "courts", selectMessagesCourts, selectMessagesCourts(current));
  return { courts, groups };
}

export function useMeState() {
  const { sessionStore } = useAppServices().controller;
  const current = sessionStore.getState();
  return useStoreSelector(sessionStore, "me", selectMeState, selectMeState(current));
}

export function useMeActions() {
  const { controller } = useAppServices();
  return useMemo(
    () => ({
      onTogglePlayerVisibility: controller.togglePlayerVisibility,
      onUnblockPlayer: controller.unblockPlayer,
    }),
    [controller]
  );
}

export function useMeAppActions(): MeAppActions {
  const { meApp } = useAppServices();
  if (!meApp) throw new Error("Me app actions are unavailable.");
  return meApp;
}

export function useMePageView(): MePageView {
  const { pageViewStore } = useAppServices();
  if (!pageViewStore) throw new Error("Me page-view service is unavailable.");
  const current = pageViewStore.getState();
  return useStoreSelector(pageViewStore, "me", selectMePageView, selectMePageView(current));
}

export function composeMePresence(
  profile: SessionControllerState["profile"],
  pageView: MePageView
): {
  locationStatus: MePageView["presenceLocationStatus"];
  openToGreeting: boolean;
  sharePresence: boolean;
} {
  return {
    locationStatus: pageView.presenceLocationStatus,
    openToGreeting: profile?.openToGreeting === true,
    sharePresence: profile?.sharePresence === true,
  };
}

export function useMessagesActions(): MessagesActions {
  const { controller } = useAppServices();
  return useMemo(() => ({ openSessionChat: controller.openSessionChat }), [controller]);
}

export function useNearbyDrawerState(): NearbyDrawerState {
  const { sessionStore } = useAppServices().controller;
  const beforeStoreChange = useBeforeNearbyDrawerStoreChange();
  const current = sessionStore.getState();
  return useStoreSelector(
    sessionStore,
    "map",
    selectNearbyDrawerState,
    selectNearbyDrawerState(current),
    beforeStoreChange
  );
}

export function useNearbyDrawerActions(): NearbyDrawerActions {
  const { controller } = useAppServices();
  return useMemo(
    () => ({
      onExpandBounds: controller.expandBounds,
      onOpenCreate: controller.openCreateIntent,
      onOpenSession: controller.openSession,
      onReset: controller.resetFilters,
      onRetry: controller.retryDiscovery,
      onToggle: controller.setDrawerState,
    }),
    [controller]
  );
}

export function useNearbyDrawerAppActions(): NearbyDrawerAppActions {
  const { nearbyDrawerApp } = useAppServices();
  if (!nearbyDrawerApp) throw new Error("NearbyDrawer app actions are unavailable.");
  return nearbyDrawerApp;
}

export function useMySessionsState(): MySessionsState {
  const { sessionStore } = useAppServices().controller;
  const current = sessionStore.getState();
  const view = useStoreSelector(sessionStore, "mySessions", selectMySessionsState, selectMySessionsState(current));
  const courts = useStoreSelector(sessionStore, "courts", selectMessagesCourts, selectMessagesCourts(current));
  return { ...view, courts };
}

export function useMySessionsActions(): MySessionsActions {
  const { controller } = useAppServices();
  return useMemo(
    () => ({
      onAccept: (sessionId, participantId) =>
        controller.reviewMySessionParticipant(sessionId, participantId, "accepted"),
      onAcceptInvite: (sessionId) => controller.respondInvite(sessionId, "accepted"),
      onCancel: controller.cancelMySession,
      onConfirmAttendance: controller.confirmMySessionAttendance,
      onCreateSession: () => controller.openCreateIntent(),
      onDecline: (sessionId, participantId) =>
        controller.reviewMySessionParticipant(sessionId, participantId, "declined"),
      onDeclineInvite: (sessionId) => controller.respondInvite(sessionId, "declined"),
      onDecide: controller.openSessionDecision,
      onEdit: controller.openSessionEdit,
      onMarkPlayed: controller.markMySessionPlayed,
      onOpenChat: controller.openSessionChat,
      onOpenSession: controller.openSession,
      onRefresh: () => controller.refreshMySessions(),
      onReportParticipant: controller.openRosterParticipantReport,
      onReportSession: controller.openSessionReport,
      onWithdraw: controller.withdrawMySession,
    }),
    [controller]
  );
}

export function useMySessionsPageView(): MySessionsPageView {
  const { pageViewStore } = useAppServices();
  if (!pageViewStore) throw new Error("MySessions page-view service is unavailable.");
  const current = pageViewStore.getState();
  return useStoreSelector(pageViewStore, "mySessions", selectMySessionsPageView, selectMySessionsPageView(current));
}

export function useMySessionsAppActions(): MySessionsAppActions {
  const { mySessionsApp } = useAppServices();
  if (!mySessionsApp) throw new Error("MySessions app actions are unavailable.");
  return mySessionsApp;
}
