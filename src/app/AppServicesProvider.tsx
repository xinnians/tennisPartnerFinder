import { createContext, useContext, useMemo, type ReactNode } from "react";

import type {
  ControllerApi,
  ControllerIdentifier,
  ControllerMySessionGroups,
  SessionControllerState,
} from "../controllerContracts.ts";
import { selectControllerMySessionsView } from "../sessionSelectors.ts";
import { useStoreSelector } from "../sessionStore.ts";

type MessagesServices = Pick<ControllerApi, "openSessionChat" | "sessionStore">;

export type MessagesState = Pick<SessionControllerState, "courts"> & {
  groups: ControllerMySessionGroups;
};

export type MessagesActions = Pick<MessagesServices, "openSessionChat">;

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
  onRefresh(): ReturnType<ControllerApi["refreshMySessions"]>;
  onReportParticipant: MySessionsServices["openRosterParticipantReport"];
  onReportSession: MySessionsServices["openSessionReport"];
  onWithdraw: MySessionsServices["withdrawMySession"];
}

const AppServicesContext = createContext<ControllerApi | null>(null);

function useAppServices(): ControllerApi {
  const controller = useContext(AppServicesContext);
  if (!controller) throw new Error("App services are unavailable outside AppServicesProvider.");
  return controller;
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

export function AppServicesProvider({ children, controller }: { children: ReactNode; controller: ControllerApi }) {
  return <AppServicesContext.Provider value={controller}>{children}</AppServicesContext.Provider>;
}

export function useMessagesState(): MessagesState {
  const { sessionStore } = useAppServices();
  const current = sessionStore.getState();
  const groups = useStoreSelector(sessionStore, "mySessions", selectMessagesGroups, selectMessagesGroups(current));
  const courts = useStoreSelector(sessionStore, "courts", selectMessagesCourts, selectMessagesCourts(current));
  return { courts, groups };
}

export function useMessagesActions(): MessagesActions {
  const controller = useAppServices();
  return useMemo(() => ({ openSessionChat: controller.openSessionChat }), [controller]);
}

export function useMySessionsState(): MySessionsState {
  const { sessionStore } = useAppServices();
  const current = sessionStore.getState();
  const view = useStoreSelector(sessionStore, "mySessions", selectMySessionsState, selectMySessionsState(current));
  const courts = useStoreSelector(sessionStore, "courts", selectMessagesCourts, selectMessagesCourts(current));
  return { ...view, courts };
}

export function useMySessionsActions(): MySessionsActions {
  const controller = useAppServices();
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
