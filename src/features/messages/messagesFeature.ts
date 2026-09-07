import type { SessionControllerState } from "../../controllerContracts.ts";
import type { MySessionSummary } from "../../domainTypes.ts";

export type MessagesSession = MySessionSummary;

/**
 * Messages only lists sessions whose current viewer is an accepted member.
 * Cancelled and expired sessions have no active chat destination; played
 * sessions remain available as read-only history.
 */
export function messagesFromSessions(sessions: readonly MySessionSummary[] | null | undefined): MessagesSession[] {
  if (!Array.isArray(sessions)) return [];
  const source = sessions as readonly MySessionSummary[];
  return source
    .filter((session) => {
      const participantStatus = String(session?.viewerParticipantStatus ?? "").toLowerCase();
      const status = String(session?.status ?? "").toLowerCase();
      return participantStatus === "accepted" && status !== "cancelled" && status !== "expired";
    })
    .sort((left, right) => String(left?.startAt ?? "").localeCompare(String(right?.startAt ?? "")));
}

export function selectMessagesSessions(state: Readonly<Pick<SessionControllerState, "mySessions">>): MessagesSession[] {
  return messagesFromSessions(state.mySessions);
}

export function selectMessagesCourts(
  state: Readonly<Pick<SessionControllerState, "courts">>
): SessionControllerState["courts"] {
  return state.courts;
}
