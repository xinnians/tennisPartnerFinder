import { latestChatMessageId } from "./chatFeature.ts";
import { createForegroundPoller, createRequestGate } from "../../requestGate.ts";

import type {
  ControllerAuthSnapshot,
  ControllerChatFeedFacade,
  ControllerChatFeedSnapshot,
  ControllerIdentifier,
} from "../../controllerContracts.ts";
import type { ChatMessage, SessionRosterEntry, SurfaceLoadStatus } from "../../domainTypes.ts";

interface ChatFeedDataApi {
  loadSessionMessages?(sessionId: ControllerIdentifier): Promise<ChatMessage[]>;
  loadSessionRoster?(sessionId: ControllerIdentifier): Promise<unknown>;
  markSessionChatRead?(sessionId: ControllerIdentifier): Promise<unknown>;
}

interface ChatFeedViewState extends ControllerChatFeedSnapshot {
  errorMessage?: string;
  status: SurfaceLoadStatus;
}

interface ChatFeedFacadeDependencies {
  api: ChatFeedDataApi;
  authSnapshot: ControllerAuthSnapshot;
  clearUnread: (sessionId: ControllerIdentifier) => boolean;
  intervalMs: number;
  isActive: () => boolean;
  isCurrentAuthSnapshot: (snapshot: ControllerAuthSnapshot) => boolean;
  publish: (state: ChatFeedViewState) => void;
  sessionId: ControllerIdentifier;
  visibilityTarget?: Parameters<typeof createForegroundPoller>[0]["visibilityTarget"];
}

const EMPTY_SNAPSHOT: Readonly<ControllerChatFeedSnapshot> = Object.freeze({
  messages: Object.freeze([]) as unknown as ChatMessage[],
  roster: Object.freeze([]) as unknown as SessionRosterEntry[],
});

/** Owns one open chat's query state, read cursor, request generation, and foreground poller. */
export function createChatFeedFacade({
  api,
  authSnapshot,
  clearUnread,
  intervalMs,
  isActive,
  isCurrentAuthSnapshot,
  publish,
  sessionId,
  visibilityTarget,
}: ChatFeedFacadeDependencies): ControllerChatFeedFacade {
  const requestGate = createRequestGate();
  let lastMarkedMessageId: number | null = null;
  let poller: ReturnType<typeof createForegroundPoller> | null = null;
  let snapshot = EMPTY_SNAPSHOT;
  let started = false;

  function isCurrent(): boolean {
    return isActive() && isCurrentAuthSnapshot(authSnapshot);
  }

  function replaceSnapshot(messages: unknown, roster: unknown): void {
    const nextMessages = Array.isArray(messages) ? (messages as ChatMessage[]) : [];
    const nextRoster = Array.isArray(roster) ? (roster as SessionRosterEntry[]) : [];
    snapshot = Object.freeze({
      messages: Object.freeze([...nextMessages]) as unknown as ChatMessage[],
      roster: Object.freeze([...nextRoster]) as unknown as SessionRosterEntry[],
    });
  }

  async function markRead(): Promise<void> {
    if (!isCurrent() || typeof api.markSessionChatRead !== "function") return;
    const latestId = latestChatMessageId(snapshot.messages);
    if (latestId == null || lastMarkedMessageId === latestId) return;
    clearUnread(sessionId);
    try {
      await api.markSessionChatRead(sessionId);
      if (isCurrent()) {
        lastMarkedMessageId = lastMarkedMessageId == null ? latestId : Math.max(lastMarkedMessageId, latestId);
      }
    } catch {
      // Best effort. Keep the optimistic unread clear, but leave the cursor unchanged so a later refresh retries.
    }
  }

  async function refresh({ quiet = false } = {}): Promise<boolean> {
    if (!isCurrent()) return false;
    if (typeof api.loadSessionMessages !== "function" || typeof api.loadSessionRoster !== "function") return false;
    const request = requestGate.issue(isCurrent);
    if (!quiet) publish({ ...snapshot, status: "loading" });
    try {
      const [messages, roster] = await Promise.all([
        api.loadSessionMessages(sessionId),
        api.loadSessionRoster(sessionId),
      ]);
      if (request.isStale()) return false;
      replaceSnapshot(messages, roster);
      publish({ ...snapshot, status: "ready" });
      await markRead();
      return true;
    } catch {
      if (request.isStale()) return false;
      publish({
        ...snapshot,
        errorMessage: "群組訊息暫時無法載入。",
        status: "error",
      });
      return false;
    }
  }

  function start(): void {
    if (started) return;
    started = true;
    poller = createForegroundPoller({
      intervalMs,
      isActive,
      onInterval: () => void refresh({ quiet: true }),
      onVisible: () => void refresh(),
      visibilityTarget,
    });
    void refresh();
  }

  function stop(): void {
    requestGate.invalidate();
    poller?.stop();
    poller = null;
  }

  return {
    getSnapshot: () => snapshot,
    refresh,
    start,
    stop,
  };
}
