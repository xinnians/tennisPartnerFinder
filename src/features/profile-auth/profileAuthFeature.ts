import type {
  ControllerAuthSession,
  ControllerAuthSnapshot,
  ControllerPendingIntent,
  ControllerProfileEligibility,
  ControllerProfileGate,
  SessionControllerState,
} from "../../controllerContracts.ts";
import { clearPendingIntent, readPendingIntent, savePendingIntent } from "../../sessionIntent.ts";

export interface ProfileReadiness {
  source: "courts" | "profile" | null;
  state: "error" | "loading" | "ready";
}

export interface PendingIntentStore {
  clear(): void;
  read(): ControllerPendingIntent | null;
  save(intent: ControllerPendingIntent): ControllerPendingIntent;
}

export function sessionIdentity(session: ControllerAuthSession | null | undefined): string | null {
  const value = session?.user?.id ?? session?.access_token ?? null;
  return value == null ? null : String(value);
}

export function profileMeetsGate(
  eligibility: ControllerProfileEligibility | null | undefined,
  level: ControllerProfileGate
): boolean {
  return eligibility?.[level] === true;
}

export function profileGateForIntent(intent: ControllerPendingIntent | null | undefined): ControllerProfileGate | null {
  if (["create", "players"].includes(intent?.action ?? "")) return "ntrp";
  if (["directory", "visibility"].includes(intent?.action ?? "")) return "directory";
  if (intent?.action === "join") return "nickname";
  return null;
}

export function profileIsPublic(eligibility: ControllerProfileEligibility | null | undefined): boolean {
  return eligibility?.isPublic === true;
}

export function profileReadiness(
  eligibility: ControllerProfileEligibility | null | undefined,
  level: ControllerProfileGate | null = null
): ProfileReadiness {
  if (eligibility?.status === "loading") return { source: "profile", state: "loading" };
  if (eligibility?.status === "error") return { source: "profile", state: "error" };
  if (level === "directory" && eligibility?.directoryStatus === "loading") {
    return { source: "courts", state: "loading" };
  }
  if (level === "directory" && eligibility?.directoryStatus === "error") {
    return { source: "courts", state: "error" };
  }
  return { source: null, state: "ready" };
}

export function profileIsReady(
  eligibility: ControllerProfileEligibility | null | undefined,
  level: ControllerProfileGate | null = null
): boolean {
  return profileReadiness(eligibility, level).state === "ready";
}

export function profileUnavailableMessage(readiness: ProfileReadiness): string {
  if (readiness.source === "courts") {
    return readiness.state === "loading" ? "正在讀取球場資料，請稍候。" : "球場資料暫時無法載入，請稍後再試。";
  }
  return readiness.state === "loading" ? "正在讀取個人檔案，請稍候。" : "個人檔案暫時無法載入，請重新整理後再試。";
}

export function samePendingIntent(
  left: ControllerPendingIntent | null | undefined,
  right: ControllerPendingIntent | null | undefined
): boolean {
  if (!left || !right || left.action !== right.action) return false;
  return left.action !== "join" || (right.action === "join" && String(left.sessionId) === String(right.sessionId));
}

export function browserIntentStore(): PendingIntentStore {
  return {
    clear: () => clearPendingIntent(),
    read: () => readPendingIntent(),
    save: (intent) => savePendingIntent(intent),
  };
}

export function authSnapshotForState(
  state: Pick<SessionControllerState, "authEpoch" | "authSession">
): ControllerAuthSnapshot {
  return { epoch: state.authEpoch, identity: sessionIdentity(state.authSession) };
}

export function authSnapshotIsCurrent(
  snapshot: ControllerAuthSnapshot | null | undefined,
  state: Pick<SessionControllerState, "authEpoch" | "authSession">
): boolean {
  return (
    Boolean(snapshot?.identity) &&
    snapshot?.epoch === state.authEpoch &&
    sessionIdentity(state.authSession) === snapshot.identity
  );
}
