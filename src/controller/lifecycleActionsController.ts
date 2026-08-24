import { hostCanDecideSession, hostCanEditSession } from "../features/session-lifecycle/sessionLifecycleFeature.ts";
import { profileIsReady } from "../features/profile-auth/profileAuthFeature.ts";
import { isUndecidedCandidate } from "../sessionCriteria.js";
import { sessionActionMessage } from "../sessionActionMessages.ts";

import type {
  ControllerAuthSnapshot,
  ControllerEventName,
  ControllerIdentifier,
  ControllerSurfaceHandle,
  SessionControllerState,
} from "../controllerContracts.ts";
import type { MySessionSummary, SessionSummary } from "../domainTypes.ts";
import type { Store } from "../sessionStore.ts";
import type { LifecycleActionToken } from "./mySessionsController.ts";
import type { SurfaceRegistry } from "./surfaceRegistry.ts";

interface MutationResult {
  outcome?: unknown;
  reloadRequired?: unknown;
}

interface LifecycleDataApi {
  acceptSessionParticipant?(sessionId: ControllerIdentifier, participantId: ControllerIdentifier): Promise<unknown>;
  cancelSession?(sessionId: ControllerIdentifier): Promise<unknown>;
  confirmSessionAttendance?(sessionId: ControllerIdentifier): Promise<unknown>;
  decideSessionCourt?(
    sessionId: ControllerIdentifier,
    courtId: ControllerIdentifier,
    startAt: unknown
  ): Promise<unknown>;
  declineSessionParticipant?(sessionId: ControllerIdentifier, participantId: ControllerIdentifier): Promise<unknown>;
  loadSessionSummary?(sessionId: ControllerIdentifier): Promise<unknown>;
  markSessionPlayed?(sessionId: ControllerIdentifier): Promise<unknown>;
  respondToSessionInvite?(sessionId: ControllerIdentifier, decision: string): Promise<unknown>;
  updateSession?(input: Record<string, unknown>): Promise<unknown>;
  withdrawFromSession?(sessionId: ControllerIdentifier): Promise<unknown>;
}

interface DecideHandlers {
  courts: unknown[];
  courtsReady: boolean;
  onClose(): void;
  onDecide(courtId: ControllerIdentifier, startAt: unknown): Promise<unknown>;
}

interface EditHandlers {
  courts: unknown[];
  courtsReady: boolean;
  onClose(): void;
  onSubmit(input: Record<string, unknown>): Promise<unknown>;
}

interface LifecycleActionsDependencies {
  api: LifecycleDataApi;
  beginLifecycleAction(
    kind: string,
    sessionId: ControllerIdentifier,
    authSnapshot: ControllerAuthSnapshot
  ): LifecycleActionToken | null;
  captureAuthSnapshot(): ControllerAuthSnapshot;
  finishLifecycleAction(token: LifecycleActionToken | null | undefined): void;
  isCurrentAuthSnapshot(snapshot: ControllerAuthSnapshot): boolean;
  openDecideSession(
    session: SessionSummary | null,
    handlers: DecideHandlers
  ): ControllerSurfaceHandle | null | undefined;
  openEditSession(session: MySessionSummary, handlers: EditHandlers): ControllerSurfaceHandle | null | undefined;
  openWithdrawConfirmation(handlers: { onConfirm(): unknown }): unknown;
  refreshAuthoritativeState(snapshot: ControllerAuthSnapshot): Promise<boolean>;
  sessionKey(sessionId: ControllerIdentifier): string;
  store: Store<SessionControllerState, ControllerEventName>;
  surfaceRegistry: SurfaceRegistry;
  toast(message: string): void;
  transitionSurfaces(name: string): void;
}

export interface LifecycleActionsController {
  cancelMySession(sessionId: ControllerIdentifier): Promise<unknown>;
  confirmMySessionAttendance(sessionId: ControllerIdentifier): Promise<unknown>;
  markMySessionPlayed(sessionId: ControllerIdentifier): Promise<unknown>;
  mySessionForAction(sessionId: ControllerIdentifier): MySessionSummary;
  openSessionDecision(sessionId: ControllerIdentifier): Promise<unknown>;
  openSessionEdit(sessionId: ControllerIdentifier): unknown;
  requireMySessionAction(
    sessionId: ControllerIdentifier,
    predicate: (session: MySessionSummary) => boolean
  ): { authSnapshot: ControllerAuthSnapshot; session: MySessionSummary };
  respondInvite(sessionId: ControllerIdentifier, decision: string): Promise<unknown>;
  reviewMySessionParticipant(
    sessionId: ControllerIdentifier,
    participantId: ControllerIdentifier,
    decision: string
  ): Promise<unknown>;
  withdraw(session: SessionSummary, detail: ControllerSurfaceHandle | null | undefined): unknown;
  withdrawMySession(sessionId: ControllerIdentifier): unknown;
}

function mutationResult(value: unknown): MutationResult {
  return typeof value === "object" && value !== null ? (value as MutationResult) : {};
}

/** Owns lifecycle RPC orchestration and host decision/edit surfaces. */
export function createLifecycleActionsController({
  api,
  beginLifecycleAction,
  captureAuthSnapshot,
  finishLifecycleAction,
  isCurrentAuthSnapshot,
  openDecideSession,
  openEditSession,
  openWithdrawConfirmation,
  refreshAuthoritativeState,
  sessionKey,
  store,
  surfaceRegistry,
  toast,
  transitionSurfaces,
}: LifecycleActionsDependencies): LifecycleActionsController {
  const read = store.getState;

  function withdraw(session: SessionSummary, detail: ControllerSurfaceHandle | null | undefined): unknown {
    return openWithdrawConfirmation({ onConfirm: () => performDetailWithdrawal(session, detail) });
  }

  async function performDetailWithdrawal(
    session: SessionSummary,
    detail: ControllerSurfaceHandle | null | undefined
  ): Promise<void> {
    const authSnapshot = captureAuthSnapshot();
    if (!isCurrentAuthSnapshot(authSnapshot)) return;
    const mutation = beginLifecycleAction("withdraw", session.sessionId, authSnapshot);
    if (!mutation) {
      toast("這個球局的操作正在處理中。");
      return;
    }
    try {
      if (typeof api.withdrawFromSession !== "function") throw new Error("目前無法退出這個球局。");
      const result = await api.withdrawFromSession(session.sessionId);
      if (!isCurrentAuthSnapshot(authSnapshot)) return;
      if (!(await refreshAuthoritativeState(authSnapshot))) {
        if (surfaceRegistry.is("detail", detail)) toast("球局狀態暫時無法重新載入，請重新整理後再試。");
        return;
      }
      const outcome = mutationResult(result);
      if (outcome.reloadRequired || outcome.outcome === "SESSION_EXPIRED") {
        surfaceRegistry.close("detail", undefined, detail);
        toast("球局狀態已更新，請重新載入。");
        return;
      }
      surfaceRegistry.close("detail", undefined, detail);
      toast("已撤回申請。");
    } catch (error) {
      if (!isCurrentAuthSnapshot(authSnapshot)) return;
      await refreshAuthoritativeState(authSnapshot);
      toast(sessionActionMessage(error, "撤回失敗，請稍後再試。"));
    } finally {
      finishLifecycleAction(mutation);
    }
  }

  function mySessionForAction(sessionId: ControllerIdentifier): MySessionSummary {
    const session = read().mySessions.find((entry) => String(entry.sessionId) === String(sessionId));
    if (!session) throw new Error("這個球局已更新，請重新整理後再試。");
    return session;
  }

  function requireMySessionAction(
    sessionId: ControllerIdentifier,
    predicate: (session: MySessionSummary) => boolean
  ): { authSnapshot: ControllerAuthSnapshot; session: MySessionSummary } {
    const authSnapshot = captureAuthSnapshot();
    if (!isCurrentAuthSnapshot(authSnapshot) || !profileIsReady(read().profileEligibility)) {
      throw new Error("登入或個人檔案狀態已變更，請重新整理後再試。");
    }
    const session = mySessionForAction(sessionId);
    if (!predicate(session)) throw new Error("這個球局的狀態已更新，請重新整理後再試。");
    return { authSnapshot, session };
  }

  async function runMySessionMutation(
    kind: string,
    session: MySessionSummary,
    authSnapshot: ControllerAuthSnapshot,
    execute: () => Promise<unknown>,
    successMessage: string
  ): Promise<unknown> {
    const mutation = beginLifecycleAction(kind, session.sessionId, authSnapshot);
    if (!mutation) throw new Error("這個球局的操作正在處理中。");
    let refreshed = false;
    try {
      const result = await execute();
      if (!isCurrentAuthSnapshot(authSnapshot)) throw new Error("登入狀態已變更，請重新整理後再試。");
      refreshed = await refreshAuthoritativeState(authSnapshot);
      if (!refreshed) throw new Error("球局狀態暫時無法重新載入，請重新整理後再試。");
      const outcome = mutationResult(result);
      if (outcome.reloadRequired || outcome.outcome === "SESSION_EXPIRED") {
        throw new Error("球局狀態已更新，請重新載入。");
      }
      toast(successMessage);
      return result;
    } catch (error) {
      if (isCurrentAuthSnapshot(authSnapshot) && !refreshed) await refreshAuthoritativeState(authSnapshot);
      throw error;
    } finally {
      finishLifecycleAction(mutation);
    }
  }

  async function reviewMySessionParticipant(
    sessionId: ControllerIdentifier,
    participantId: ControllerIdentifier,
    decision: string
  ): Promise<unknown> {
    const { authSnapshot, session } = requireMySessionAction(
      sessionId,
      (candidate) => String(candidate.viewerRole) === "host" && Boolean(candidate.canCancel)
    );
    const participant = (read().mySessionRosters.get(sessionKey(sessionId)) ?? []).find(
      (candidate) =>
        String(candidate.participantId) === String(participantId) &&
        candidate.role === "guest" &&
        candidate.status === "requested"
    );
    if (!participant || !["accepted", "declined"].includes(decision)) {
      throw new Error("這筆申請已更新，請重新整理後再試。");
    }
    const apiAction = decision === "accepted" ? api.acceptSessionParticipant : api.declineSessionParticipant;
    if (typeof apiAction !== "function") throw new Error("目前無法處理這筆申請。");
    return runMySessionMutation(
      decision === "accepted" ? "accept" : "decline",
      session,
      authSnapshot,
      () => apiAction(session.sessionId, participant.participantId),
      decision === "accepted" ? "已接受申請。" : "已婉拒申請。"
    );
  }

  async function respondInvite(sessionId: ControllerIdentifier, decision: string): Promise<unknown> {
    const { authSnapshot, session } = requireMySessionAction(
      sessionId,
      (candidate) =>
        String(candidate.viewerRole) === "guest" &&
        String(candidate.viewerParticipantStatus) === "invited" &&
        Boolean(candidate.canRespondInvite)
    );
    if (!["accepted", "declined"].includes(decision)) {
      throw new Error("這筆邀請已更新，請重新整理後再試。");
    }
    if (typeof api.respondToSessionInvite !== "function") throw new Error("目前無法回覆這筆邀請。");
    return runMySessionMutation(
      decision === "accepted" ? "accept-invite" : "decline-invite",
      session,
      authSnapshot,
      () => api.respondToSessionInvite?.(session.sessionId, decision) ?? Promise.resolve(),
      decision === "accepted" ? "已接受邀請。" : "已婉拒邀請。"
    );
  }

  async function cancelMySession(sessionId: ControllerIdentifier): Promise<unknown> {
    const { authSnapshot, session } = requireMySessionAction(sessionId, (candidate) => Boolean(candidate.canCancel));
    if (typeof api.cancelSession !== "function") throw new Error("目前無法取消這個球局。");
    return runMySessionMutation(
      "cancel",
      session,
      authSnapshot,
      () => api.cancelSession?.(session.sessionId) ?? Promise.resolve(),
      "已取消球局。"
    );
  }

  function withdrawMySession(sessionId: ControllerIdentifier): unknown {
    return openWithdrawConfirmation({ onConfirm: () => performMySessionWithdrawal(sessionId) });
  }

  async function performMySessionWithdrawal(sessionId: ControllerIdentifier): Promise<unknown> {
    const { authSnapshot, session } = requireMySessionAction(sessionId, (candidate) => Boolean(candidate.canWithdraw));
    if (typeof api.withdrawFromSession !== "function") throw new Error("目前無法退出這個球局。");
    return runMySessionMutation(
      "withdraw",
      session,
      authSnapshot,
      () => api.withdrawFromSession?.(session.sessionId) ?? Promise.resolve(),
      "已退出球局。"
    );
  }

  async function markMySessionPlayed(sessionId: ControllerIdentifier): Promise<unknown> {
    const { authSnapshot, session } = requireMySessionAction(sessionId, (candidate) =>
      Boolean(candidate.canConfirmPlayed)
    );
    if (typeof api.markSessionPlayed !== "function") throw new Error("目前無法回報這個球局。");
    return runMySessionMutation(
      "played",
      session,
      authSnapshot,
      () => api.markSessionPlayed?.(session.sessionId) ?? Promise.resolve(),
      "已回報打成。"
    );
  }

  async function confirmMySessionAttendance(sessionId: ControllerIdentifier): Promise<unknown> {
    const { authSnapshot, session } = requireMySessionAction(
      sessionId,
      (candidate) => Boolean(candidate.canConfirmAttendance) && !candidate.viewerPlayedConfirmed
    );
    if (typeof api.confirmSessionAttendance !== "function") throw new Error("目前無法確認到場。");
    return runMySessionMutation(
      "attendance",
      session,
      authSnapshot,
      () => api.confirmSessionAttendance?.(session.sessionId) ?? Promise.resolve(),
      "已確認到場。"
    );
  }

  async function openSessionDecision(sessionId: ControllerIdentifier): Promise<unknown> {
    const { authSnapshot, session } = requireMySessionAction(sessionId, hostCanDecideSession);
    if (typeof api.loadSessionSummary !== "function" || typeof api.decideSessionCourt !== "function") {
      throw new Error("目前無法定案這個候選球局。");
    }
    let summary: unknown = null;
    try {
      summary = await api.loadSessionSummary(session.sessionId);
    } catch {
      throw new Error("候選球局暫時無法載入，請稍後再試。");
    }
    if (!isCurrentAuthSnapshot(authSnapshot)) throw new Error("登入狀態已變更，請重新整理後再試。");
    transitionSurfaces("openDecision");
    let sheet: ControllerSurfaceHandle | null | undefined = null;
    const decisionSummary = isUndecidedCandidate(summary) ? (summary as SessionSummary) : null;
    sheet = openDecideSession(decisionSummary, {
      courts: read().courts,
      courtsReady: read().courtsReady,
      onClose: () => {
        surfaceRegistry.release("decisionSession", sheet);
      },
      onDecide: async (courtId, startAt) => {
        if (!decisionSummary) return { outcome: "SESSION_EXPIRED", reloadRequired: true };
        if (!isCurrentAuthSnapshot(authSnapshot)) throw new Error("登入狀態已變更，請重新整理後再試。");
        const mutation = beginLifecycleAction("decide", session.sessionId, authSnapshot);
        if (!mutation) throw new Error("這個球局的操作正在處理中。");
        let refreshed = false;
        try {
          const result = await api.decideSessionCourt?.(session.sessionId, courtId, startAt);
          if (!isCurrentAuthSnapshot(authSnapshot)) throw new Error("登入狀態已變更，請重新整理後再試。");
          refreshed = await refreshAuthoritativeState(authSnapshot);
          const outcome = mutationResult(result);
          if (outcome.reloadRequired || outcome.outcome === "SESSION_EXPIRED") {
            sheet?.setTerminal?.("候選球局已逾期或下架，無法再定案。");
            return result;
          }
          if (!refreshed) throw new Error("球局狀態暫時無法重新載入，請重新整理後再試。");
          surfaceRegistry.close("decisionSession", { reason: "complete" });
          toast("候選球局已定案。");
          return result;
        } catch (error) {
          if (isCurrentAuthSnapshot(authSnapshot) && !refreshed) await refreshAuthoritativeState(authSnapshot);
          throw error;
        } finally {
          finishLifecycleAction(mutation);
        }
      },
    });
    return surfaceRegistry.set("decisionSession", sheet?.close ? sheet : null);
  }

  function openSessionEdit(sessionId: ControllerIdentifier): unknown {
    const { authSnapshot, session } = requireMySessionAction(sessionId, hostCanEditSession);
    if (typeof api.updateSession !== "function") throw new Error("目前無法編輯這個球局。");
    transitionSurfaces("openEdit");
    let sheet: ControllerSurfaceHandle | null | undefined = null;
    sheet = openEditSession(session, {
      courts: read().courts,
      courtsReady: read().courtsReady,
      onClose: () => {
        surfaceRegistry.release("editSession", sheet);
      },
      onSubmit: async (input) => {
        const result = await runMySessionMutation(
          "update",
          session,
          authSnapshot,
          () => api.updateSession?.({ sessionId: session.sessionId, ...input }) ?? Promise.resolve(),
          "已更新球局資訊。"
        );
        surfaceRegistry.close("editSession", { reason: "complete" });
        return result;
      },
    });
    return surfaceRegistry.set("editSession", sheet?.close ? sheet : null);
  }

  return {
    cancelMySession,
    confirmMySessionAttendance,
    markMySessionPlayed,
    mySessionForAction,
    openSessionDecision,
    openSessionEdit,
    requireMySessionAction,
    respondInvite,
    reviewMySessionParticipant,
    withdraw,
    withdrawMySession,
  };
}
