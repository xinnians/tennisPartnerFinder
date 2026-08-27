import { DataApiUnavailableError } from "../dataApi.ts";
import { actionKey, staleIntentMessage } from "../features/session-lifecycle/sessionLifecycleFeature.ts";
import {
  profileGateForIntent,
  profileIsReady,
  profileMeetsGate,
  profileReadiness,
  profileUnavailableMessage,
  samePendingIntent,
} from "../features/profile-auth/profileAuthFeature.ts";
import { sessionActionMessage } from "../sessionActionMessages.ts";

import type {
  ControllerAuthSnapshot,
  ControllerEventName,
  ControllerIdentifier,
  ControllerPendingIntent,
  ControllerRequestGate,
  ControllerSurfaceHandle,
  SessionControllerState,
} from "../controllerContracts.ts";
import type { MySessionSummary, SessionSummary } from "../domainTypes.ts";
import type { Store } from "../sessionStore.ts";
import type { LifecycleActionToken } from "./mySessionsController.ts";
import type { ControllerSessionAction } from "./mySessionsController.ts";
import type { SurfaceRegistry } from "./surfaceRegistry.ts";

const LOCATION_UNAVAILABLE_MESSAGE = "無法取得位置；你仍可移動地圖或依球場尋找球局。";

interface IntentStore {
  clear?(): void;
  read?(): ControllerPendingIntent | null;
  save?(intent: ControllerPendingIntent): ControllerPendingIntent;
}

interface IntentDataApi {
  createSession?(input: unknown): Promise<unknown>;
  loadSessionSummary?(sessionId: ControllerIdentifier): Promise<unknown>;
  requestToJoinSession?(sessionId: ControllerIdentifier): Promise<unknown>;
}

interface MutationResult extends Record<string, unknown> {
  outcome?: unknown;
  reloadRequired?: unknown;
}

interface IntentControllerDependencies {
  actionFor(session: SessionSummary): ControllerSessionAction;
  api: IntentDataApi;
  beginLifecycleAction(
    kind: string,
    sessionId: ControllerIdentifier,
    snapshot: ControllerAuthSnapshot
  ): LifecycleActionToken | null;
  captureAuthSnapshot(): ControllerAuthSnapshot;
  clearPlayerLayer(options?: { closeReason?: string }): void;
  commitPlayerVisibility(): Promise<void>;
  currentParticipation(sessionId: ControllerIdentifier): MySessionSummary | null;
  finishLifecycleAction(token: LifecycleActionToken | null | undefined): void;
  intentStore: IntentStore;
  isCurrentAuthSnapshot(snapshot: ControllerAuthSnapshot | null | undefined): boolean;
  lifecycleActionIsInFlight(sessionId: ControllerIdentifier): boolean;
  loadDiscovery(): Promise<boolean | void>;
  loadPlayerDirectoryList(): Promise<boolean>;
  loadPlayers(): Promise<boolean>;
  locationGate: ControllerRequestGate;
  openCreateSession(handlers: {
    courts: unknown[];
    courtsReady: boolean;
    onClose(options?: { reason?: string }): void;
    onSubmit(input: unknown): Promise<unknown>;
    onViewMySessions(sessionId: ControllerIdentifier): void;
  }): ControllerSurfaceHandle | null | undefined;
  openLogin(handlers: { action: string; onClose(options?: { reason?: string }): void }): unknown;
  openSessionChat(sessionId: ControllerIdentifier): unknown;
  openSessionDetail(session: SessionSummary, options?: { initialStage?: string }): unknown;
  profilePrompt(context: {
    courts: unknown[];
    courtsReady: boolean;
    intent: ControllerPendingIntent;
    onClose(options?: { reason?: string; saved?: boolean }): void;
    returnSession: SessionSummary | null;
  }): ControllerSurfaceHandle | null | undefined;
  publish(): void;
  refreshLocationViewport(location: { lat: number; lng: number }): Promise<boolean | void> | void;
  reloadParticipation(epoch: number, identity: string | null): Promise<boolean>;
  showCreatedSession(sessionId: ControllerIdentifier): void;
  store: Store<SessionControllerState, ControllerEventName>;
  surfaceRegistry: SurfaceRegistry;
  toast(message: string): void;
}

export interface IntentController {
  capturePendingIntentVersion(): number;
  clearIntent(expectedIntent?: ControllerPendingIntent | null): boolean;
  clearPendingIntentIfUnchanged(version: number): boolean;
  isReconcileSuppressed(session: SessionSummary | MySessionSummary | null | undefined): boolean;
  openCreateIntent(): void;
  refreshAuthoritativeState(snapshot: ControllerAuthSnapshot): Promise<boolean>;
  requestCurrentLocation(): void;
  requestJoin(
    session: SessionSummary,
    detail: ControllerSurfaceHandle | null | undefined,
    confirmingAuth: ControllerAuthSnapshot | null
  ): Promise<Record<string, unknown>>;
  requireSessionAction(
    intent: ControllerPendingIntent,
    options?: {
      detail?: ControllerSurfaceHandle | null;
      session?: SessionSummary | null;
    }
  ): unknown;
  resumePendingIntent(): Promise<boolean>;
  startPrimaryAction(session: SessionSummary, detail: ControllerSurfaceHandle | null | undefined): unknown;
  togglePlayerLayer(): Promise<boolean> | void;
}

function mutationResult(value: unknown): MutationResult {
  return typeof value === "object" && value !== null ? (value as MutationResult) : {};
}

/** Owns persisted action intents, join/create resumption, and location/player entry intents. */
export function createIntentController({
  actionFor,
  api,
  beginLifecycleAction,
  captureAuthSnapshot,
  clearPlayerLayer,
  commitPlayerVisibility,
  currentParticipation,
  finishLifecycleAction,
  intentStore,
  isCurrentAuthSnapshot,
  lifecycleActionIsInFlight,
  loadDiscovery,
  loadPlayerDirectoryList,
  loadPlayers,
  locationGate,
  openCreateSession,
  openLogin,
  openSessionChat,
  openSessionDetail,
  profilePrompt,
  publish,
  refreshLocationViewport,
  reloadParticipation,
  showCreatedSession,
  store,
  surfaceRegistry,
  toast,
}: IntentControllerDependencies): IntentController {
  const read = store.getState;
  let intentVersion = 0;
  let suppressReconcileSessionId: ControllerIdentifier = null;
  const resumeInFlight = new Map<string, Promise<boolean>>();

  function readIntent(): ControllerPendingIntent | null {
    try {
      return intentStore.read?.() ?? null;
    } catch {
      return null;
    }
  }

  function saveIntent(intent: ControllerPendingIntent): ControllerPendingIntent {
    try {
      const savedIntent = intentStore.save?.(intent) ?? intent;
      intentVersion += 1;
      return savedIntent;
    } catch {
      intentVersion += 1;
      return intent;
    }
  }

  function clearIntent(expectedIntent: ControllerPendingIntent | null = null): boolean {
    const currentIntent = readIntent();
    if (expectedIntent && !samePendingIntent(currentIntent, expectedIntent)) return false;
    try {
      intentStore.clear?.();
      intentVersion += 1;
      return true;
    } catch {
      return false;
    }
  }

  function closeForStaleIntent(message: string): void {
    surfaceRegistry.close("detail", { reason: "stale-intent", restoreFocus: false });
    store.setState({ drawerState: "open" });
    publish();
    toast(message);
  }

  function enterJoinConfirming(session: SessionSummary, detail: ControllerSurfaceHandle | null = null): void {
    if (lifecycleActionIsInFlight(session.sessionId)) {
      toast("這個球局的操作正在處理中。");
      return;
    }
    const expectedAccepted = Boolean(actionFor(session).expectedAccepted);
    surfaceRegistry.update("detail", { confirmingAuth: captureAuthSnapshot() });
    if (detail && surfaceRegistry.is("detail", detail)) {
      detail.enterConfirming?.({ expectedAccepted });
      return;
    }
    openSessionDetail(session, { initialStage: "confirming" });
  }

  function openProfileForIntent(
    intent: ControllerPendingIntent,
    { returnSession = null }: { returnSession?: SessionSummary | null } = {}
  ): unknown {
    if (surfaceRegistry.get("profilePrompt")) return surfaceRegistry.get("profilePrompt");
    let sheet: ControllerSurfaceHandle | null | undefined = null;
    sheet = profilePrompt({
      courts: read().courts,
      courtsReady: read().courtsReady,
      intent,
      onClose: ({ reason = "dismiss", saved = false } = {}) => {
        surfaceRegistry.release("profilePrompt", sheet);
        if (!saved && reason === "dismiss") clearIntent(intent);
      },
      returnSession,
    });
    return surfaceRegistry.set("profilePrompt", sheet?.close ? sheet : null, {
      intent: sheet?.close ? intent : null,
    });
  }

  function requireReadyProfile(
    level: "directory" | "nickname" | "ntrp" | null = null,
    { silentLoading = false } = {}
  ): boolean {
    const readiness = profileReadiness(read().profileEligibility, level);
    if (readiness.state === "ready") return true;
    if (!(silentLoading && readiness.state === "loading")) toast(profileUnavailableMessage(readiness));
    return false;
  }

  function requireSessionAction(
    intent: ControllerPendingIntent,
    { detail = null, session = null }: { detail?: ControllerSurfaceHandle | null; session?: SessionSummary | null } = {}
  ): unknown {
    const savedIntent = saveIntent(intent);
    if (!read().authSession) {
      openLogin({
        action: intent.action ?? "",
        onClose: ({ reason = "dismiss" } = {}) => {
          if (reason === "dismiss") clearIntent(savedIntent);
        },
      });
      return;
    }
    const requiredGate = profileGateForIntent(savedIntent);
    if (!requireReadyProfile(requiredGate)) return;
    if (requiredGate && !profileMeetsGate(read().profileEligibility, requiredGate)) {
      openProfileForIntent(savedIntent, { returnSession: savedIntent.action === "join" ? session : null });
      return;
    }
    if (savedIntent.action === "players") {
      clearIntent(savedIntent);
      store.setState({ playerLayerOn: true });
      return loadPlayers();
    }
    if (savedIntent.action === "directory") {
      clearIntent(savedIntent);
      return loadPlayerDirectoryList();
    }
    if (savedIntent.action === "create") {
      openCreateSessionForIntent(savedIntent);
      return;
    }
    if (session) enterJoinConfirming(session, detail);
  }

  function startPrimaryAction(session: SessionSummary, detail: ControllerSurfaceHandle | null | undefined): unknown {
    const action = actionFor(session);
    if (action.disabled) return;
    const participation = currentParticipation(session.sessionId);
    if (participation?.viewerParticipantStatus === "accepted") return openSessionChat(session.sessionId);
    return requireSessionAction({ action: "join", sessionId: session.sessionId as number }, { detail, session });
  }

  async function refreshAuthoritativeState(authSnapshot: ControllerAuthSnapshot): Promise<boolean> {
    const [participationReady, discoveryReady] = await Promise.all([
      reloadParticipation(authSnapshot.epoch, authSnapshot.identity),
      loadDiscovery(),
    ]);
    if (!isCurrentAuthSnapshot(authSnapshot)) return false;
    publish();
    return Boolean(participationReady && discoveryReady);
  }

  async function requestJoin(
    session: SessionSummary,
    detail: ControllerSurfaceHandle | null | undefined,
    confirmingAuth: ControllerAuthSnapshot | null
  ): Promise<Record<string, unknown>> {
    if (!isCurrentAuthSnapshot(confirmingAuth)) {
      surfaceRegistry.close("detail", undefined, detail);
      toast("登入狀態已變更，請重新開啟球局。");
      return { joinError: "登入狀態已變更，請重新開啟球局。" };
    }
    const authSnapshot = confirmingAuth as ControllerAuthSnapshot;
    if (!profileMeetsGate(read().profileEligibility, "nickname")) {
      surfaceRegistry.close("detail", undefined, detail);
      requireSessionAction({ action: "join", sessionId: session.sessionId as number }, { session });
      return { joinError: "請先填寫公開暱稱。" };
    }
    const mutation = beginLifecycleAction("join", session.sessionId, authSnapshot);
    if (!mutation) {
      toast("這個球局的操作正在處理中。");
      return { joinError: "這個球局的操作正在處理中。" };
    }
    try {
      if (typeof api.requestToJoinSession !== "function") throw new Error("申請失敗，請稍後再試。");
      const result = await api.requestToJoinSession(session.sessionId);
      if (!isCurrentAuthSnapshot(confirmingAuth)) return { joinError: "登入狀態已變更，請重新開啟球局。" };
      clearIntent({ action: "join", sessionId: session.sessionId as number });
      const outcome = mutationResult(result);
      if (outcome.reloadRequired || outcome.outcome === "SESSION_EXPIRED") {
        surfaceRegistry.close("detail", undefined, detail);
        await refreshAuthoritativeState(authSnapshot);
        toast("球局狀態已更新，請重新載入。");
        return { joinError: "球局狀態已更新，請重新載入。" };
      }
      suppressReconcileSessionId = session.sessionId;
      try {
        if (!(await refreshAuthoritativeState(authSnapshot))) {
          return { joinError: "球局狀態暫時無法重新載入，請重新整理後再試。" };
        }
      } finally {
        if (suppressReconcileSessionId === session.sessionId) suppressReconcileSessionId = null;
      }
      if (surfaceRegistry.is("detail", detail)) {
        const freshSession =
          read().sessions.find((entry) => String(entry.sessionId) === String(session.sessionId)) ?? session;
        surfaceRegistry.update("detail", {
          actionKey: actionKey(actionFor(freshSession)),
          session: freshSession,
        });
      }
      return { ...outcome, joinSubmitted: true };
    } catch (error) {
      if (!isCurrentAuthSnapshot(confirmingAuth)) return { joinError: "登入狀態已變更，請重新開啟球局。" };
      await refreshAuthoritativeState(authSnapshot);
      const message = sessionActionMessage(error, "申請失敗，請稍後再試。");
      if (!surfaceRegistry.is("detail", detail)) toast(message);
      return { joinError: message };
    } finally {
      finishLifecycleAction(mutation);
    }
  }

  async function submitCreateSession(input: unknown, openedAuthSnapshot = captureAuthSnapshot()): Promise<unknown> {
    const authSnapshot = openedAuthSnapshot;
    if (!isCurrentAuthSnapshot(authSnapshot) || !profileMeetsGate(read().profileEligibility, "ntrp")) {
      throw new Error("登入或個人檔案狀態已變更，請重新開啟表單。");
    }
    try {
      if (typeof api.createSession !== "function") throw new Error("目前無法建立球局。");
      const result = await api.createSession(input);
      if (!isCurrentAuthSnapshot(authSnapshot)) throw new Error("登入狀態已變更，請重新開啟表單。");
      clearIntent({ action: "create" });
      await Promise.all([loadDiscovery(), reloadParticipation(authSnapshot.epoch, authSnapshot.identity)]);
      if (!isCurrentAuthSnapshot(authSnapshot)) throw new Error("登入狀態已變更，請重新整理後再試。");
      toast("球局已發布！");
      return result;
    } catch (error) {
      if (error instanceof DataApiUnavailableError) {
        throw new Error("本機示範資料僅供瀏覽；登入、儲存個人檔案與建立球局需在已設定服務的環境使用。");
      }
      throw error;
    }
  }

  function openCreateSessionForIntent(intent: ControllerPendingIntent = { action: "create" }): unknown {
    if (surfaceRegistry.get("createSession")) return surfaceRegistry.get("createSession");
    const openedAuthSnapshot = captureAuthSnapshot();
    let sheet: ControllerSurfaceHandle | null | undefined = null;
    sheet = openCreateSession({
      courts: read().courts,
      courtsReady: read().courtsReady,
      onClose: ({ reason = "dismiss" } = {}) => {
        surfaceRegistry.release("createSession", sheet);
        if (reason === "dismiss") clearIntent(intent);
      },
      onSubmit: (input) => submitCreateSession(input, openedAuthSnapshot),
      onViewMySessions: (sessionId) => showCreatedSession(sessionId),
    });
    return surfaceRegistry.set("createSession", sheet?.close ? sheet : null);
  }

  function resumePendingIntent(): Promise<boolean> {
    const authSnapshot = captureAuthSnapshot();
    if (!isCurrentAuthSnapshot(authSnapshot)) return Promise.resolve(false);
    const intent = readIntent();
    if (!intent) return Promise.resolve(false);
    const resumeKey = JSON.stringify([
      authSnapshot.epoch,
      authSnapshot.identity,
      intent.action,
      intent.action === "join" ? intent.sessionId : null,
    ]);
    const existing = resumeInFlight.get(resumeKey);
    if (existing) return existing;
    const operation = (async (): Promise<boolean> => {
      if (!isCurrentAuthSnapshot(authSnapshot) || !samePendingIntent(readIntent(), intent)) return false;
      if (intent.action === "create") {
        if (!requireReadyProfile("ntrp", { silentLoading: true })) return false;
        if (!profileMeetsGate(read().profileEligibility, "ntrp")) {
          openProfileForIntent(intent);
          return true;
        }
        openCreateSessionForIntent(intent);
        return true;
      }
      if (intent.action === "players") {
        if (!requireReadyProfile("ntrp")) return false;
        if (!profileMeetsGate(read().profileEligibility, "ntrp")) {
          openProfileForIntent(intent);
          return true;
        }
        clearIntent(intent);
        store.setState({ playerLayerOn: true });
        return loadPlayers();
      }
      if (intent.action === "directory") {
        if (!requireReadyProfile("directory")) return false;
        if (!profileMeetsGate(read().profileEligibility, "directory")) {
          openProfileForIntent(intent);
          return true;
        }
        clearIntent(intent);
        return loadPlayerDirectoryList();
      }
      if (intent.action === "visibility") {
        if (!requireReadyProfile("directory")) return false;
        if (!profileMeetsGate(read().profileEligibility, "directory")) {
          openProfileForIntent(intent);
          return true;
        }
        clearIntent(intent);
        await commitPlayerVisibility();
        return true;
      }
      if (intent.action !== "join" || typeof api.loadSessionSummary !== "function") return false;
      let target: unknown = null;
      try {
        target = await api.loadSessionSummary(intent.sessionId);
      } catch {
        if (isCurrentAuthSnapshot(authSnapshot) && samePendingIntent(readIntent(), intent)) {
          toast("暫時無法確認這個球局，請稍後再試。");
        }
        return false;
      }
      if (!isCurrentAuthSnapshot(authSnapshot) || !samePendingIntent(readIntent(), intent)) return false;
      const targetSession = target as SessionSummary | null;
      const staleMessage = staleIntentMessage(targetSession);
      if (staleMessage) {
        clearIntent(intent);
        closeForStaleIntent(staleMessage);
        return false;
      }
      if (!targetSession || !requireReadyProfile("nickname", { silentLoading: true })) return false;
      if (!profileMeetsGate(read().profileEligibility, "nickname")) {
        openProfileForIntent(intent, { returnSession: targetSession });
        return true;
      }
      const activeDetail = surfaceRegistry.get("detail") as ControllerSurfaceHandle | null;
      const activeDetailSession = surfaceRegistry.meta("detail", "session") as SessionSummary | null;
      const existingDetail =
        activeDetail && activeDetailSession && String(activeDetailSession.sessionId) === String(targetSession.sessionId)
          ? activeDetail
          : null;
      enterJoinConfirming(targetSession, existingDetail);
      return true;
    })();
    resumeInFlight.set(resumeKey, operation);
    return operation.finally(() => {
      if (resumeInFlight.get(resumeKey) === operation) resumeInFlight.delete(resumeKey);
    });
  }

  function requestCurrentLocation(): void {
    if (read().locationBlocked) {
      store.setState({ locationMessage: LOCATION_UNAVAILABLE_MESSAGE });
      publish();
      return;
    }
    const request = locationGate.issue();
    const geolocation = globalThis.navigator?.geolocation;
    if (!geolocation?.getCurrentPosition) {
      store.setState({ locationBlocked: true, locationMessage: LOCATION_UNAVAILABLE_MESSAGE });
      publish();
      return;
    }
    try {
      geolocation.getCurrentPosition(
        ({ coords }) => {
          if (request.isStale()) return;
          const lat = Number(coords?.latitude);
          const lng = Number(coords?.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            store.setState({ locationBlocked: true, locationMessage: LOCATION_UNAVAILABLE_MESSAGE });
            publish();
            return;
          }
          store.setState({ userLocation: { lat, lng }, locationBlocked: false, locationMessage: "" });
          void refreshLocationViewport({ lat, lng });
        },
        () => {
          if (request.isStale()) return;
          store.setState({ locationBlocked: true, locationMessage: LOCATION_UNAVAILABLE_MESSAGE });
          publish();
        },
        { enableHighAccuracy: false, maximumAge: 0, timeout: 10_000 }
      );
    } catch {
      if (request.isStale()) return;
      store.setState({ locationBlocked: true, locationMessage: LOCATION_UNAVAILABLE_MESSAGE });
      publish();
    }
  }

  function openCreateIntent(): void {
    requireSessionAction({ action: "create" });
  }

  function togglePlayerLayer(): Promise<boolean> | void {
    if (!read().playerLayerOn) {
      if (
        !read().authSession ||
        !profileIsReady(read().profileEligibility, "ntrp") ||
        !profileMeetsGate(read().profileEligibility, "ntrp")
      ) {
        return requireSessionAction({ action: "players" }) as Promise<boolean> | void;
      }
      store.setState({ playerLayerOn: true });
      return loadPlayers();
    }
    clearPlayerLayer({ closeReason: "player-layer-off" });
    publish();
    return Promise.resolve(true);
  }

  return {
    capturePendingIntentVersion: () => intentVersion,
    clearIntent,
    clearPendingIntentIfUnchanged: (version) => (version === intentVersion ? clearIntent() : false),
    isReconcileSuppressed: (session) =>
      suppressReconcileSessionId != null &&
      Boolean(session) &&
      String(session?.sessionId) === String(suppressReconcileSessionId),
    openCreateIntent,
    refreshAuthoritativeState,
    requestCurrentLocation,
    requestJoin,
    requireSessionAction,
    resumePendingIntent,
    startPrimaryAction,
    togglePlayerLayer,
  };
}
