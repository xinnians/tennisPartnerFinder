import { chatMemberSession, visibleChatMessage } from "../features/chat/chatFeature.ts";
import { createChatFeedFacade } from "../features/chat/chatFeedFacade.ts";
import type {
  ControllerAuthSnapshot,
  ControllerChatSession,
  ControllerChatSurfaceContext,
  ControllerIdentifier,
} from "../controllerContracts.ts";
import type { ChatMessage, MySessionSummary, SurfaceCloseOptions } from "../domainTypes.ts";
import type { SurfaceRegistry } from "./surfaceRegistry.ts";

interface ChatDataApi {
  loadSessionMessages?(sessionId: ControllerIdentifier): Promise<ChatMessage[]>;
  loadSessionRoster?(sessionId: ControllerIdentifier): Promise<unknown>;
  markSessionChatRead?(sessionId: ControllerIdentifier): Promise<unknown>;
  postSessionMessage?(sessionId: ControllerIdentifier, body: unknown): Promise<unknown>;
  setPlayerBlock?(profileId: number, blocked: boolean): Promise<unknown>;
}

interface ReportTarget {
  messageId: ControllerIdentifier;
  reportedProfileId: ControllerIdentifier;
  sessionId: ControllerIdentifier;
  targetLabel: string;
}

interface ChatControllerDependencies {
  api: ChatDataApi;
  chatPollIntervalMs: number;
  clearMySessionUnread: (sessionId: ControllerIdentifier) => boolean;
  isCurrentAuthSnapshot: (snapshot: ControllerAuthSnapshot) => boolean;
  openReportForTarget: (target: ReportTarget) => unknown;
  readCourts: () => ControllerChatSession["courts"];
  refreshBlockedPlayers: (snapshot: ControllerAuthSnapshot) => Promise<boolean>;
  refreshMySessions: () => Promise<boolean>;
  requireMySessionAction: (
    sessionId: ControllerIdentifier,
    predicate: (session: MySessionSummary | null | undefined) => boolean
  ) => { authSnapshot: ControllerAuthSnapshot; session: MySessionSummary };
  surfaceRegistry: SurfaceRegistry;
  toast: (message: string) => void;
  transitionSurfaces: (name: string) => void;
  visibilityTarget: Document | undefined;
  withdrawMySession: (sessionId: ControllerIdentifier) => unknown;
}

function actionCode(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
}

/** Creates an authorized Chat model; app wiring owns the concrete surface selection. */
export function createChatController(dependencies: ChatControllerDependencies): {
  createSessionChat: (sessionId: ControllerIdentifier) => ControllerChatSession | null | undefined;
} {
  const {
    api,
    chatPollIntervalMs,
    clearMySessionUnread,
    isCurrentAuthSnapshot,
    openReportForTarget,
    readCourts,
    refreshBlockedPlayers,
    refreshMySessions,
    requireMySessionAction,
    surfaceRegistry,
    toast,
    transitionSurfaces,
    visibilityTarget,
    withdrawMySession,
  } = dependencies;

  function openChatMessageReport(context: ControllerChatSurfaceContext, messageId: ControllerIdentifier): unknown {
    if (!context || !surfaceRegistry.is("chat", context) || !isCurrentAuthSnapshot(context.authSnapshot)) {
      throw new Error("群組狀態已更新，請重新開啟後再試。");
    }
    const message = visibleChatMessage(context.feed.getSnapshot().messages, messageId);
    if (!message) throw new Error("這則訊息已無法查看。");
    return openReportForTarget({
      messageId: message.messageId,
      reportedProfileId: message.senderProfileId,
      sessionId: context.session.sessionId,
      targetLabel: `${message.senderNickname || "這位球友"} · 群組訊息`,
    });
  }

  async function blockChatSender(
    context: ControllerChatSurfaceContext,
    profileId: ControllerIdentifier
  ): Promise<true> {
    const normalizedProfileId = Number(profileId);
    const messages = context?.feed.getSnapshot().messages ?? [];
    if (
      !context ||
      !surfaceRegistry.is("chat", context) ||
      !isCurrentAuthSnapshot(context.authSnapshot) ||
      !messages.some(
        (message) =>
          Number(message.senderProfileId) === normalizedProfileId && visibleChatMessage(messages, message.messageId)
      )
    ) {
      throw new Error("群組狀態已更新，請重新開啟後再試。");
    }
    if (typeof api.setPlayerBlock !== "function") throw new Error("目前無法更新封鎖設定。");
    await api.setPlayerBlock(normalizedProfileId, true);
    if (!surfaceRegistry.is("chat", context) || !isCurrentAuthSnapshot(context.authSnapshot)) {
      throw new Error("登入狀態已變更，請重新整理後再試。");
    }
    const [blocksReady] = await Promise.all([refreshBlockedPlayers(context.authSnapshot), context.feed.refresh()]);
    if (!blocksReady) throw new Error("封鎖已生效，但清單暫時無法重新載入。");
    toast("已封鎖這位球友。");
    return true;
  }

  async function postActiveChatMessage(context: ControllerChatSurfaceContext, body: unknown): Promise<unknown> {
    if (!context || !surfaceRegistry.is("chat", context) || !isCurrentAuthSnapshot(context.authSnapshot)) {
      throw new Error("群組狀態已更新，請重新開啟後再試。");
    }
    if (typeof api.postSessionMessage !== "function") throw new Error("目前無法傳送群組訊息。");
    try {
      const result = await api.postSessionMessage(context.session.sessionId, body);
      if (!surfaceRegistry.is("chat", context) || !isCurrentAuthSnapshot(context.authSnapshot)) {
        throw new Error("登入狀態已變更，請重新整理後再試。");
      }
      await context.feed.refresh();
      return result;
    } catch (error) {
      if (
        surfaceRegistry.is("chat", context) &&
        isCurrentAuthSnapshot(context.authSnapshot) &&
        actionCode(error) === "SESSION_ARCHIVED"
      ) {
        context.feed.archive();
        await refreshMySessions();
      }
      throw error;
    }
  }

  function createSessionChat(sessionId: ControllerIdentifier): ControllerChatSession | null | undefined {
    const { authSnapshot, session } = requireMySessionAction(sessionId, chatMemberSession);
    if (typeof api.loadSessionMessages !== "function" || typeof api.loadSessionRoster !== "function") {
      throw new Error("目前無法開啟群組聊天。");
    }
    transitionSurfaces("openChat");
    let context = null as ControllerChatSurfaceContext | null;
    const closeListeners = new Set<(options?: SurfaceCloseOptions) => void>();
    const feed = createChatFeedFacade({
      api,
      authSnapshot,
      clearUnread: clearMySessionUnread,
      initiallyArchived: ["cancelled", "expired", "played"].includes(String(session.status).toLowerCase()),
      intervalMs: chatPollIntervalMs,
      isActive: () => surfaceRegistry.is("chat", context),
      isCurrentAuthSnapshot,
      sessionId: session.sessionId,
      visibilityTarget,
    });
    context = {
      authSnapshot,
      block: (profileId) => blockChatSender(context as ControllerChatSurfaceContext, profileId),
      canWithdraw: Boolean(session.canWithdraw),
      courts: readCourts(),
      feed,
      post: (body) => postActiveChatMessage(context as ControllerChatSurfaceContext, body),
      release: () => {
        surfaceRegistry.release("chat", context);
      },
      report: (messageId) => openChatMessageReport(context as ControllerChatSurfaceContext, messageId),
      requestClose: (options) => {
        for (const listener of closeListeners) listener(options);
      },
      session,
      start: () => feed.start(),
      subscribeClose(listener) {
        closeListeners.add(listener);
        return () => closeListeners.delete(listener);
      },
      withdraw: () => withdrawMySession(session.sessionId),
    };
    surfaceRegistry.set("chat", context);
    return context;
  }

  return { createSessionChat };
}
