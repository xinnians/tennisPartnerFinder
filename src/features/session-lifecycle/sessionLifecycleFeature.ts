import type {
  ControllerMySessionAction,
  ControllerMySessionGroups,
  ControllerSessionWithRequests,
} from "../../controllerContracts.ts";
import type { MySessionSummary, SessionSummary } from "../../domainTypes.ts";
import { isSessionFull, isUndecidedCandidate } from "../../sessionCriteria.js";

export const MY_SESSION_FINAL_STATUSES = new Set(["cancelled", "expired", "played"]);
export const MY_SESSION_OPEN_STATUSES = new Set(["open", "full"]);

const KIND_ORDER: Record<string, number> = { "host-request": 0, invite: 1, "guest-request": 2 };
const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_DETAIL_FIELDS: Array<keyof SessionSummary> = [
  "sessionId",
  "sportCode",
  "courtId",
  "court",
  "courtDistrict",
  "courtLat",
  "courtLng",
  "startAt",
  "playType",
  "ntrpMin",
  "ntrpMax",
  "slotsTotal",
  "slotsRemaining",
  "notes",
  "status",
  "hostNickname",
  "hostNtrp",
  "hostProfileComplete",
  "venueType",
  "rangeEnd",
  "feeNote",
  "joinMode",
  "decidedAt",
];

interface ActionPresentation {
  disabled?: boolean;
  label?: unknown;
  note?: unknown;
  secondaryLabel?: unknown;
}

export function terminalAction(session: Partial<SessionSummary>): string | null {
  const status = String(session.status || "").toLowerCase();
  if (status === "cancelled") return "球局已取消";
  if (status === "expired") return "球局已結束";
  if (status === "started") return "球局已開始";
  return null;
}

export function timeValue(value: unknown, fallback = 0): number {
  const time = new Date((value ?? "") as string | number | Date).getTime();
  return Number.isFinite(time) ? time : fallback;
}

export function compareSessionStart(left: Partial<MySessionSummary>, right: Partial<MySessionSummary>): number {
  return (
    timeValue(left?.startAt, Number.POSITIVE_INFINITY) - timeValue(right?.startAt, Number.POSITIVE_INFINITY) ||
    Number(left?.sessionId) - Number(right?.sessionId)
  );
}

function compareHistorySession(left: Partial<MySessionSummary>, right: Partial<MySessionSummary>): number {
  return (
    timeValue(right?.updatedAt, timeValue(right?.startAt)) - timeValue(left?.updatedAt, timeValue(left?.startAt)) ||
    timeValue(right?.startAt) - timeValue(left?.startAt) ||
    Number(right?.sessionId) - Number(left?.sessionId)
  );
}

/** Arrange private My Sessions rows around the next safe action. */
export function groupMySessions(
  items: ControllerSessionWithRequests[] = [],
  now = new Date()
): ControllerMySessionGroups {
  const currentTime = timeValue(now, Date.now());
  const needsAction: ControllerMySessionAction[] = [];
  const upcoming: ControllerSessionWithRequests[] = [];
  const history: ControllerSessionWithRequests[] = [];
  let hasUnread = false;

  for (const session of Array.isArray(items) ? items : []) {
    if (Number(session?.unreadMessageCount) > 0) hasUnread = true;
    const status = String(session?.status ?? "").toLowerCase();
    const viewerRole = String(session?.viewerRole ?? "").toLowerCase();
    const participantStatus = String(session?.viewerParticipantStatus ?? "").toLowerCase();
    const startedMoreThanADayAgo =
      MY_SESSION_OPEN_STATUSES.has(status) &&
      timeValue(session?.startAt, Number.NEGATIVE_INFINITY) <= currentTime - DAY_MS;

    if (
      MY_SESSION_FINAL_STATUSES.has(status) ||
      startedMoreThanADayAgo ||
      (viewerRole === "guest" && (participantStatus === "declined" || participantStatus === "withdrawn"))
    ) {
      history.push(session);
      continue;
    }

    if (viewerRole === "guest" && participantStatus === "invited") {
      if (session?.canRespondInvite) needsAction.push({ kind: "invite", session });
      else history.push(session);
      continue;
    }

    if (viewerRole === "guest" && participantStatus === "requested") {
      if (session?.canWithdraw) needsAction.push({ kind: "guest-request", session });
      else history.push(session);
      continue;
    }

    if (!MY_SESSION_OPEN_STATUSES.has(status) || participantStatus !== "accepted") {
      history.push(session);
      continue;
    }

    upcoming.push(session);
    if (viewerRole !== "host" || !session?.canCancel) continue;
    const requests = (Array.isArray(session?.pendingRequests) ? session.pendingRequests : [])
      .filter((participant) => participant?.role === "guest" && participant?.status === "requested")
      .sort((left, right) => Number(left?.participantId) - Number(right?.participantId));
    for (const participant of requests) needsAction.push({ kind: "host-request", participant, session });
  }

  needsAction.sort((left, right) => {
    const kindOrder = (KIND_ORDER[left.kind] ?? 9) - (KIND_ORDER[right.kind] ?? 9);
    return (
      kindOrder ||
      compareSessionStart(left.session, right.session) ||
      Number(("participant" in left ? left.participant?.participantId : 0) ?? 0) -
        Number(("participant" in right ? right.participant?.participantId : 0) ?? 0)
    );
  });
  upcoming.sort(compareSessionStart);
  history.sort(compareHistorySession);
  return {
    hasUnread,
    history,
    needsAction,
    needsActionCount: needsAction.length,
    upcoming,
  };
}

export function staleIntentMessage(session: Partial<SessionSummary> | null | undefined): string | null {
  if (!session) return "球局已取消、結束或不再開放，已回到附近球局。";
  const status = String(session.status || "").toLowerCase();
  if (isSessionFull(session)) return "球局已額滿，已回到附近球局。";
  if (status === "cancelled") return "球局已取消，已回到附近球局。";
  if (status === "expired") return "球局已結束，已回到附近球局。";
  if (status === "started") return "球局已開始，已回到附近球局。";
  return null;
}

export function sameSessionDetail(
  left: Partial<SessionSummary> | null | undefined,
  right: Partial<SessionSummary> | null | undefined
): boolean {
  return SESSION_DETAIL_FIELDS.every((key) => left?.[key] === right?.[key]);
}

export function actionKey(action: ActionPresentation | null | undefined): string {
  return JSON.stringify([
    action?.label ?? "",
    Boolean(action?.disabled),
    action?.secondaryLabel ?? "",
    action?.note ?? "",
  ]);
}

export function hostCanDecideSession(session: Partial<MySessionSummary> | null | undefined): boolean {
  return String(session?.viewerRole) === "host" && Boolean(session?.canCancel) && isUndecidedCandidate(session);
}

export function hostCanEditSession(session: Partial<MySessionSummary> | null | undefined): boolean {
  return (
    String(session?.viewerRole) === "host" &&
    Boolean(session?.canCancel) &&
    ["booked", "walk_on"].includes(session?.venueType ?? "")
  );
}
