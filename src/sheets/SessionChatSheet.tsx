import { createRef, forwardRef, useImperativeHandle, useState } from "react";

import { AppErrorBoundary } from "../components/AppErrorBoundary.tsx";
import type { ChatMessage, SessionRosterEntry } from "../domainTypes.ts";
import { sessionChatSheetRuntime } from "../sessionPresentation.ts";
import { mountSurfaceContent, type SurfaceContentLifecycle } from "../app/SurfaceHost.tsx";

interface ChatRosterRow {
  text: string;
}

interface ChatMessageRow {
  body: string;
  canGovern: boolean;
  createdAt: string;
  createdAtLabel: string;
  isSelf: boolean;
  kind: string;
  messageId: string;
  senderInitial: string;
  senderNickname: string;
  senderProfileId: string;
  showAuthor: boolean;
}

export interface SessionChatContentContract {
  setArchived(): void;
  setContent(roster: readonly SessionRosterEntry[], messages: readonly ChatMessage[]): void;
}

interface SessionChatContentOptions {
  archived: boolean;
  canWithdraw: boolean;
  headerSub: string;
  onClose(): void;
  onFeedClick(event: React.MouseEvent<HTMLElement>): void;
  playType: string;
  venueBadge: string;
  venueCourt: string;
  venueTime: string;
}

interface SessionChatSheetProps extends SessionChatContentOptions {
  contentRef: React.Ref<SessionChatContentContract>;
}

interface SessionChatRows {
  messages: ChatMessageRow[] | null;
  roster: ChatRosterRow[] | null;
}

function SessionChatSheet({
  archived: initiallyArchived,
  canWithdraw,
  contentRef,
  headerSub,
  onClose,
  onFeedClick,
  playType,
  venueBadge,
  venueCourt,
  venueTime,
}: SessionChatSheetProps) {
  const [archived, setArchived] = useState(initiallyArchived);
  // Legacy parity: mountSheet produced a roster container holding the "reading
  // participants" line and a completely empty feed section, and only the first
  // `setState()` replaced either of them. `null` reproduces that pre-setState
  // shape, which is what a chat sheet shows until refreshActiveChat resolves.
  const [rows, setRows] = useState<SessionChatRows>({ messages: null, roster: null });
  // The imperative sheet replaced both containers with innerHTML, so every
  // refresh (including the 10s quiet poll) detached the previous roster chips and
  // message nodes. Folding the refresh generation into the key recreates them the
  // same way, keeping focus/selection loss and any future runAsyncAction
  // `rerendered()` verdict identical to the string version. The two containers,
  // the composer and every imperatively owned node stay outside the generation.
  const [generation, setGeneration] = useState(0);

  useImperativeHandle(
    contentRef,
    () => ({
      setArchived() {
        setArchived(true);
      },
      setContent(roster, messages) {
        setRows({
          messages: sessionChatSheetRuntime.chatMessagesPresentation(messages),
          roster: sessionChatSheetRuntime.chatRosterPresentation(roster),
        });
        setGeneration((value) => value + 1);
      },
    }),
    []
  );

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
            {rows.roster === null ? (
              <p key={`${generation}:roster-pending`} className="surface__copy">
                正在讀取參加者…
              </p>
            ) : rows.roster.length === 0 ? (
              <p key={`${generation}:roster-empty`} className="surface__copy">
                參加者名單暫時沒有可顯示的資料。
              </p>
            ) : (
              rows.roster.map((row, index) => (
                <span key={`${generation}:${index}`} className="chat-roster__member">
                  {row.text}
                </span>
              ))
            )}
          </div>
        </section>
        {/* `hidden`/`textContent` on the next two nodes stay imperative: setState,
            the composer validation branch and runAsyncAction keep
            owning them, and React never declares a changing prop for either. */}
        <p className="my-sessions-message" data-chat-loading="" role="status" aria-live="polite">
          正在讀取群組訊息…
        </p>
        <p className="form-error" data-chat-error="" role="alert" tabIndex={-1} hidden />
      </div>
      <section className="chat-feed qm-scroll" data-chat-feed="" aria-label="群組訊息" onClick={onFeedClick}>
        {rows.messages === null ? null : rows.messages.length === 0 ? (
          <p key={`${generation}:feed-empty`} className="surface__copy chat-feed__empty">
            目前還沒有訊息，從一句招呼開始吧。
          </p>
        ) : (
          rows.messages.map((row, index) => (
            <article
              key={`${generation}:${index}`}
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
                      <button type="button" className="session-tertiary" data-chat-report={row.messageId}>
                        檢舉
                      </button>
                      <button
                        type="button"
                        className="session-tertiary"
                        data-chat-block={row.senderProfileId}
                        data-testid={`block-message-sender-${row.senderProfileId}`}
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
      {/* Announcement text is written by setState's new-message diff only. */}
      <p className="visually-hidden" data-chat-announcement="" role="status" aria-live="polite" aria-atomic="true" />
      <p className="chat-archived-note" data-chat-archived-note="" hidden={!archived}>
        球局已封存；你仍可查看先前訊息，但不能再傳送。
      </p>
      {/* The composer keeps stable DOM identity across every refresh: runAsyncAction
          watches these two controls, so recreating them mid-post would flip
          `rerendered()` and reverse the disabled-restore semantics. React owns the
          archived transition; runAsyncAction may temporarily write disabled while
          an active post is pending. */}
      <form className="chat-composer" data-chat-composer="">
        <label htmlFor="chat-message-input" className="visually-hidden">
          傳送純文字訊息
        </label>
        <input
          id="chat-message-input"
          data-testid="chat-message-input"
          type="text"
          autoComplete="off"
          maxLength={1000}
          placeholder="傳訊息給球局成員…"
          disabled={archived}
        />
        <button type="submit" className="chat-v2__send" data-testid="chat-send" disabled={archived} aria-label="傳送">
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
        <button type="button" className="session-tertiary chat-v2__withdraw" data-chat-withdraw="">
          取消參加
        </button>
      ) : null}
    </>
  );
}

const SessionChatSheetWithRef = forwardRef<SessionChatContentContract, SessionChatContentOptions>(
  function SessionChatSheetWithRef(props, ref) {
    return <SessionChatSheet {...props} contentRef={ref} />;
  }
);

/** Mount React into mountSheet's surface contents and expose synchronous feed updates. */
export function mountSessionChatSheetContent(
  rootElement: HTMLElement,
  options: SessionChatContentOptions
): SessionChatContentContract & SurfaceContentLifecycle {
  const surfaceContent = mountSurfaceContent(rootElement);
  const contentRef = createRef<SessionChatContentContract>();
  let boundaryFailed = false;
  surfaceContent.render(
    <AppErrorBoundary
      rootElement={rootElement}
      surface="session-chat-sheet"
      onError={() => {
        boundaryFailed = true;
      }}
    >
      <SessionChatSheetWithRef {...options} ref={contentRef} />
    </AppErrorBoundary>
  );
  if (!contentRef.current && !boundaryFailed) throw new Error("SessionChatSheet content did not mount.");

  return {
    isSurfaceRootLive: surfaceContent.isSurfaceRootLive,
    setArchived() {
      surfaceContent.commit(() => contentRef.current?.setArchived());
    },
    setContent(roster, messages) {
      surfaceContent.commit(() => contentRef.current?.setContent(roster, messages));
    },
    unmount: surfaceContent.unmount,
  };
}
