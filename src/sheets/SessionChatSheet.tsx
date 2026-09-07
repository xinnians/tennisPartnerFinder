import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";

import { AppErrorBoundary } from "../components/AppErrorBoundary.tsx";
import type { ControllerChatFeedFacade, ControllerIdentifier } from "../controllerContracts.ts";
import { sessionActionMessage } from "../sessionActionMessages.ts";
import { sessionChatSheetRuntime } from "../sessionPresentation.ts";
import { mountSurfaceContent, type SurfaceContentLifecycle } from "../app/SurfaceHost.tsx";

interface SessionChatContentOptions {
  canWithdraw: boolean;
  feed: ControllerChatFeedFacade;
  headerSub: string;
  onBlock: (profileId: ControllerIdentifier) => unknown;
  onClose: () => void;
  onPost: (body: string) => unknown;
  onReport: (messageId: ControllerIdentifier) => unknown;
  onWithdraw: () => unknown;
  playType: string;
  venueBadge: string;
  venueCourt: string;
  venueTime: string;
}

function SessionChatSheet({
  canWithdraw,
  feed,
  headerSub,
  onBlock,
  onClose,
  onPost,
  onReport,
  onWithdraw,
  playType,
  venueBadge,
  venueCourt,
  venueTime,
}: SessionChatContentOptions) {
  const subscribe = useCallback((listener: () => void) => feed.subscribe(listener), [feed]);
  const getSnapshot = useCallback(() => feed.getSnapshot(), [feed]);
  const feedState = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const messages = useMemo(
    () => sessionChatSheetRuntime.chatMessagesPresentation(feedState.messages),
    [feedState.messages]
  );
  const roster = useMemo(() => sessionChatSheetRuntime.chatRosterPresentation(feedState.roster), [feedState.roster]);
  const [actionError, setActionError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [errorFocusRequest, setErrorFocusRequest] = useState(0);
  const [posting, setPosting] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const feedRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const liveRef = useRef(true);
  const knownMessageIdsRef = useRef<Set<string> | null>(null);
  const nearBottomRef = useRef(true);
  const postingRef = useRef(false);
  const scrollRequestIdRef = useRef(0);
  const previousArchivedRef = useRef(feedState.archived);

  useEffect(
    () => () => {
      liveRef.current = false;
      scrollRequestIdRef.current += 1;
    },
    []
  );

  // Every authoritative feed publication used to clear a previous surface
  // action error. Keep that rule while React remains the only owner of the node.
  useEffect(() => {
    setActionError("");
  }, [feedState.revision]);

  useLayoutEffect(() => {
    if (errorFocusRequest > 0) errorRef.current?.focus({ preventScroll: true });
  }, [errorFocusRequest]);

  const scrollFeedToLatest = useCallback(() => {
    const target = feedRef.current;
    if (!target) return;
    const requestId = ++scrollRequestIdRef.current;
    const scroll = () => {
      if (requestId !== scrollRequestIdRef.current || feedRef.current !== target) return;
      target.scrollTop = target.scrollHeight;
      nearBottomRef.current = true;
    };
    scroll();
    requestAnimationFrame(() => {
      scroll();
      requestAnimationFrame(scroll);
    });
  }, []);

  useLayoutEffect(() => {
    const becameArchived = !previousArchivedRef.current && feedState.archived;
    previousArchivedRef.current = feedState.archived;
    if (nearBottomRef.current || becameArchived) scrollFeedToLatest();
  }, [feedState.archived, feedState.messages, scrollFeedToLatest]);

  useEffect(() => {
    if (feedState.status !== "ready") return;
    const nextMessageIds = new Set(
      feedState.messages.map((message) => String(message?.messageId ?? "")).filter(Boolean)
    );
    const knownMessageIds = knownMessageIdsRef.current;
    const newMessageCount = knownMessageIds
      ? [...nextMessageIds].filter((messageId) => !knownMessageIds.has(messageId)).length
      : 0;
    setAnnouncement(newMessageCount ? `新增 ${newMessageCount} 則訊息` : "");
    knownMessageIdsRef.current = nextMessageIds;
  }, [feedState.messages, feedState.status]);

  function showActionError(message: string, { focus = false } = {}): void {
    if (!liveRef.current) return;
    setActionError(message);
    if (focus) setErrorFocusRequest((value) => value + 1);
  }

  async function runGovernanceAction(action: () => unknown, fallback: string): Promise<void> {
    setActionError("");
    try {
      await action();
    } catch (error) {
      showActionError(sessionActionMessage(error, fallback));
    }
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (feedState.archived || postingRef.current) return;
    const input = inputRef.current;
    const body = String(input?.value ?? "").trim();
    setActionError("");
    if (!body || body.length > 1000) {
      showActionError("請輸入 1 至 1000 字的純文字訊息。");
      return;
    }
    postingRef.current = true;
    setPosting(true);
    try {
      await onPost(body);
      if (liveRef.current && input && inputRef.current === input) input.value = "";
    } catch (error) {
      showActionError(sessionActionMessage(error, "訊息暫時無法傳送，請稍後再試。"), { focus: true });
    } finally {
      postingRef.current = false;
      if (liveRef.current) setPosting(false);
    }
  }

  const errorMessage = actionError || feedState.errorMessage;
  const archived = feedState.archived;

  return (
    <>
      <div className="chat-v2__head" data-screen-label="群組聊天">
        <button
          type="button"
          className="chat-v2__back"
          data-surface-close=""
          aria-label="關閉群組聊天"
          onClick={onClose}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="chat-v2__head-copy">
          <p className="chat-v2__court">{venueCourt}</p>
          <p className="chat-v2__sub">{headerSub}</p>
        </div>
      </div>
      <div className="chat-v2__info">
        <section className="chat-session-summary" aria-label="球局資訊">
          <strong>
            <span className="session-badge">{venueBadge}</span>
            {` ${venueCourt}`}
          </strong>
          <span>{`${venueTime} · ${playType}`}</span>
        </section>
        <section className="chat-roster" aria-labelledby="chat-roster-title">
          <h3 id="chat-roster-title">參加者</h3>
          <div data-chat-roster="">
            {roster.length === 0 ? (
              <p className="surface__copy">參加者名單暫時沒有可顯示的資料。</p>
            ) : (
              roster.map((row, index) => (
                <span key={`${row.text}:${index}`} className="chat-roster__member">
                  {row.text}
                </span>
              ))
            )}
          </div>
        </section>
        <p
          className="my-sessions-message"
          data-chat-loading=""
          role="status"
          aria-live="polite"
          hidden={feedState.status !== "loading"}
        >
          正在讀取群組訊息…
        </p>
        <p ref={errorRef} className="form-error" data-chat-error="" role="alert" tabIndex={-1} hidden={!errorMessage}>
          {errorMessage}
        </p>
      </div>
      <section
        ref={feedRef}
        className="chat-feed qm-scroll"
        data-chat-feed=""
        aria-label="群組訊息"
        onScroll={(event) => {
          const target = event.currentTarget;
          nearBottomRef.current = target.scrollHeight - target.scrollTop - target.clientHeight < 48;
        }}
      >
        {messages.length === 0 ? (
          <p className="surface__copy chat-feed__empty">目前還沒有訊息，從一句招呼開始吧。</p>
        ) : (
          messages.map((row, index) => (
            <article
              key={`${row.messageId}:${index}`}
              className={`chat-message chat-message--${row.kind}${row.isSelf ? " chat-message--self" : ""}`}
              data-chat-message=""
              data-chat-message-id={row.messageId}
              data-chat-message-kind={row.kind}
              data-chat-message-self={row.isSelf ? "true" : "false"}
            >
              {row.showAuthor ? (
                <span className="chat-message__avatar" aria-hidden="true">
                  {row.senderInitial}
                </span>
              ) : null}
              <div className="chat-message__bubble">
                {row.showAuthor ? <p className="chat-message__sender">{row.senderNickname}</p> : null}
                <p className="chat-message__body">{row.body}</p>
                <div className="chat-message__meta">
                  <time dateTime={row.createdAt}>{row.createdAtLabel}</time>
                  {row.canGovern ? (
                    <>
                      <button
                        type="button"
                        className="session-tertiary"
                        data-chat-report={row.messageId}
                        onClick={() => void runGovernanceAction(() => onReport(row.messageId), "目前無法開啟檢舉。")}
                      >
                        檢舉
                      </button>
                      <button
                        type="button"
                        className="session-tertiary"
                        data-chat-block={row.senderProfileId}
                        data-testid={`block-message-sender-${row.senderProfileId}`}
                        onClick={() =>
                          void runGovernanceAction(
                            () => onBlock(row.senderProfileId),
                            "封鎖設定暫時無法更新，請稍後再試。"
                          )
                        }
                      >
                        封鎖
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </article>
          ))
        )}
      </section>
      <p className="visually-hidden" data-chat-announcement="" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      <p className="chat-archived-note" data-chat-archived-note="" hidden={!archived}>
        球局已封存；你仍可查看先前訊息，但不能再傳送。
      </p>
      <form className="chat-composer" data-chat-composer="" onSubmit={(event) => void submitMessage(event)}>
        <label htmlFor="chat-message-input" className="visually-hidden">
          傳送純文字訊息
        </label>
        <input
          ref={inputRef}
          id="chat-message-input"
          data-testid="chat-message-input"
          type="text"
          autoComplete="off"
          maxLength={1000}
          placeholder="傳訊息給球局成員…"
          disabled={archived || posting}
        />
        <button
          type="submit"
          className="chat-v2__send"
          data-testid="chat-send"
          disabled={archived || posting}
          aria-label="傳送"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </form>
      {canWithdraw && !archived ? (
        <button type="button" className="session-tertiary chat-v2__withdraw" data-chat-withdraw="" onClick={onWithdraw}>
          取消參加
        </button>
      ) : null}
    </>
  );
}

/** Mount the React-owned chat surface into the shared SurfaceHost portal. */
export function mountSessionChatSheetContent(
  rootElement: HTMLElement,
  options: SessionChatContentOptions
): SurfaceContentLifecycle {
  const surfaceContent = mountSurfaceContent(rootElement);
  surfaceContent.render(
    <AppErrorBoundary rootElement={rootElement} surface="session-chat-sheet">
      <SessionChatSheet {...options} />
    </AppErrorBoundary>
  );
  return surfaceContent;
}
