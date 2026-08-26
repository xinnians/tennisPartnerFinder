import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { ControllerApi, ControllerMySessionGroups, SessionControllerState } from "../controllerContracts.ts";
import { selectControllerMySessionsView } from "../sessionSelectors.ts";
import { useStoreSelector } from "../sessionStore.ts";

type MessagesServices = Pick<ControllerApi, "openSessionChat" | "sessionStore">;

export type MessagesState = Pick<SessionControllerState, "courts"> & {
  groups: ControllerMySessionGroups;
};

export type MessagesActions = Pick<MessagesServices, "openSessionChat">;

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
