import { chatMemberSession, latestChatMessageId, visibleChatMessage } from "../features/chat/chatFeature.ts";
import { sessionActionMessage } from "../sessionActionMessages.ts";
import { createForegroundPoller, createRequestGate } from "../requestGate.js";

import type {
  ControllerAuthSnapshot,
  ControllerChatSurfaceContext,
  ControllerIdentifier,
  ControllerSurfaceHandle,
} from "../controllerContracts.ts";
import type { MySessionSummary, SessionRosterEntry } from "../domainTypes.ts";
import type { SurfaceRegistry } from "./surfaceRegistry.ts";

interface ChatDataApi {
  loadSessionMessages?(sessionId: ControllerIdentifier): Promise<unknown>;
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
  isCurrentAuthSnapshot(snapshot: ControllerAuthSnapshot): boolean;
  notifyMySessions(): void;
  openChat(
    session: MySessionSummary,
    handlers: {
      canWithdraw: boolean;
      courts: unknown[];
      onBlock(profileId: ControllerIdentifier): Promise<true>;
      onClose(): void;
      onPost(body: unknown): Promise<unknown>;
      onReport(messageId: ControllerIdentifier): unknown;
      onWithdraw(): unknown;
    }
  ): ControllerSurfaceHandle | null | undefined;
  openReportForTarget(target: ReportTarget): unknown;
  readCourts(): unknown[];
  refreshMyPlayerBlocks(snapshot: ControllerAuthSnapshot): Promise<boolean>;
  refreshMySessions(): Promise<boolean>;
  requireMySessionAction(
    sessionId: ControllerIdentifier,
    predicate: (session: MySessionSummary | null | undefined) => boolean
  ): { authSnapshot: ControllerAuthSnapshot; session: MySessionSummary };
  surfaceRegistry: SurfaceRegistry;
  toast(message: string): void;
  transitionSurfaces(name: string): void;
  visibilityTarget: Document | undefined;
  withdrawMySession(sessionId: ControllerIdentifier): unknown;
}

function actionCode(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
}

/** Owns the active chat surface, polling, read cursor, and chat mutations. */
export function createChatController(dependencies: ChatControllerDependencies): {
  openSessionChat(sessionId: ControllerIdentifier): ControllerSurfaceHandle | null | undefined;
} {
  const {
    api,
    chatPollIntervalMs,
    isCurrentAuthSnapshot,
    notifyMySessions,
    openChat,
    openReportForTarget,
    readCourts,
    refreshMyPlayerBlocks,
    refreshMySessions,
    requireMySessionAction,
    surfaceRegistry,
    toast,
    transitionSurfaces,
    visibilityTarget,
    withdrawMySession,
  } = dependencies;

  const activeChat = (): ControllerChatSurfaceContext | null =>
    (surfaceRegistry.get("chat") as ControllerChatSurfaceContext | null) ?? null;

  // 批 C4-2:已讀游標只掛在這次開聊天期間存活的 context 上,不是跨 session 的全域
  // Map——每次 openSessionChat 重開都是新 context,重新標記一次也符合 RPC 冪等語意;
  // 節流只為壓掉同一次開啟期間 visibilitychange 等高頻重跑造成的重複呼叫。
  async function markActiveChatRead(context: ControllerChatSurfaceContext): Promise<void> {
    if (typeof api.markSessionChatRead !== "function") return;
    const latestId = latestChatMessageId(context.messages);
    if (latestId == null || context.lastMarkedMessageId === latestId) return;
    if (Number(context.session.unreadMessageCount) !== 0) {
      context.session.unreadMessageCount = 0;
      notifyMySessions();
    }
    try {
      await api.markSessionChatRead(context.session.sessionId);
      context.lastMarkedMessageId = latestId;
    } catch {
      // Best-effort:失敗不可中斷已顯示的聊天內容,也不重丟例外。故意不還原上面的
      // 樂觀清零(短暫顯示 0 屬可接受),也不設定 lastMarkedMessageId,讓下一次
      // refreshActiveChat(例如下一次 visibilitychange)重試同一個 message id 的
      // mark_session_chat_read;真正的權威數字則交由下一次 reloadParticipation 訂正。
    }
  }

  async function refreshActiveChat(context = activeChat(), { quiet = false } = {}): Promise<boolean> {
    if (!context || !surfaceRegistry.is("chat", context) || !isCurrentAuthSnapshot(context.authSnapshot)) return false;
    if (typeof api.loadSessionMessages !== "function" || typeof api.loadSessionRoster !== "function") return false;
    const request = context.requestGate.issue(
      () => surfaceRegistry.is("chat", context) && isCurrentAuthSnapshot(context.authSnapshot)
    );
    if (!quiet) context.sheet?.setState?.({ messages: context.messages, roster: context.roster, status: "loading" });
    try {
      const [messages, roster] = await Promise.all([
        api.loadSessionMessages(context.session.sessionId),
        api.loadSessionRoster(context.session.sessionId),
      ]);
      if (request.isStale()) return false;
      context.messages = Array.isArray(messages) ? messages : [];
      context.roster = Array.isArray(roster) ? (roster as SessionRosterEntry[]) : [];
      context.sheet?.setState?.({ messages: context.messages, roster: context.roster, status: "ready" });
      await markActiveChatRead(context);
      return true;
    } catch {
      if (request.isStale()) return false;
      context.sheet?.setState?.({
        errorMessage: "群組訊息暫時無法載入。",
        messages: context.messages,
        roster: context.roster,
        status: "error",
      });
      return false;
    }
  }

  function openChatMessageReport(context: ControllerChatSurfaceContext, messageId: ControllerIdentifier): unknown {
    if (!context || !surfaceRegistry.is("chat", context) || !isCurrentAuthSnapshot(context.authSnapshot)) {
      throw new Error("群組狀態已更新，請重新開啟後再試。");
    }
    const message = visibleChatMessage(context, messageId);
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
    if (
      !context ||
      !surfaceRegistry.is("chat", context) ||
      !isCurrentAuthSnapshot(context.authSnapshot) ||
      !context.messages.some(
        (message) =>
          Number(message.senderProfileId) === normalizedProfileId && visibleChatMessage(context, message.messageId)
      )
    ) {
      throw new Error("群組狀態已更新，請重新開啟後再試。");
    }
    if (typeof api.setPlayerBlock !== "function") throw new Error("目前無法更新封鎖設定。");
    await api.setPlayerBlock(normalizedProfileId, true);
    if (!surfaceRegistry.is("chat", context) || !isCurrentAuthSnapshot(context.authSnapshot)) {
      throw new Error("登入狀態已變更，請重新整理後再試。");
    }
    const [blocksReady] = await Promise.all([refreshMyPlayerBlocks(context.authSnapshot), refreshActiveChat(context)]);
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
      await refreshActiveChat(context);
      return result;
    } catch (error) {
      if (
        surfaceRegistry.is("chat", context) &&
        isCurrentAuthSnapshot(context.authSnapshot) &&
        actionCode(error) === "SESSION_ARCHIVED"
      ) {
        context.sheet?.setArchived?.(sessionActionMessage(error, ""));
        await refreshMySessions();
      }
      throw error;
    }
  }

  function openSessionChat(sessionId: ControllerIdentifier): ControllerSurfaceHandle | null | undefined {
    const { authSnapshot, session } = requireMySessionAction(sessionId, chatMemberSession);
    if (typeof api.loadSessionMessages !== "function" || typeof api.loadSessionRoster !== "function") {
      throw new Error("目前無法開啟群組聊天。");
    }
    transitionSurfaces("openChat");
    let context: ControllerChatSurfaceContext | null = null;
    const sheet = openChat(session, {
      canWithdraw: Boolean(session.canWithdraw),
      courts: readCourts(),
      onBlock: (profileId) => blockChatSender(context as ControllerChatSurfaceContext, profileId),
      onClose: () => surfaceRegistry.release("chat", context),
      onPost: (body) => postActiveChatMessage(context as ControllerChatSurfaceContext, body),
      onReport: (messageId) => openChatMessageReport(context as ControllerChatSurfaceContext, messageId),
      onWithdraw: () => withdrawMySession(session.sessionId),
    });
    context = {
      authSnapshot,
      lastMarkedMessageId: null,
      messages: [],
      poller: null,
      requestGate: createRequestGate(),
      roster: [],
      session,
      sheet,
    };
    surfaceRegistry.set("chat", context);
    context.poller = createForegroundPoller({
      intervalMs: chatPollIntervalMs,
      isActive: () => surfaceRegistry.is("chat", context),
      onInterval: () => void refreshActiveChat(context, { quiet: true }),
      onVisible: () => void refreshActiveChat(context),
      visibilityTarget,
    });
    void refreshActiveChat(context);
    return sheet;
  }

  return { openSessionChat };
}
