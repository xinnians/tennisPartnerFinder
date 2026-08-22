import type { CourtSummary, MySessionSummary, SessionSummary } from "../domainTypes.ts";
import {
  messagesFromGroups,
  sessionHostInitial,
  sessionScheduleLabel,
  sessionVenuePresentation,
} from "../sessionPresentation.ts";

type MessagesSession = MySessionSummary & Partial<Pick<SessionSummary, "candidateCourtIds">>;

interface MessagesGroups {
  history?: MessagesSession[];
  needsAction?: unknown[];
  needsActionCount?: number;
  upcoming?: MessagesSession[];
}

export interface MessagesPageOptions {
  courts?: CourtSummary[] | null;
  groups?: MessagesGroups | null;
  onOpenChat?: (sessionId: string) => void;
}

export interface MessagesPageProps {
  courts: CourtSummary[] | null;
  groups: MessagesGroups | null;
  onOpenChat: (sessionId: string) => void;
}

function sessionCourtLabel(session: MessagesSession, venue: ReturnType<typeof sessionVenuePresentation>): string {
  const candidateNames = venue.candidateNames ?? [];
  return venue.undecidedCandidates
    ? `${candidateNames[0] ?? "候選球場待確認"}${candidateNames.length > 1 ? ` 等 ${candidateNames.length} 館候選` : ""}`
    : session.court || venue.court || "";
}

function MessagesEmptyState() {
  return (
    <div className="messages-page__empty">
      <p className="messages-page__empty-text">
        加入或開一場球局，
        <br />
        成局後群組聊天會出現在這裡。
      </p>
    </div>
  );
}

function MessageRow({
  courts,
  onOpenChat,
  session,
}: {
  courts: CourtSummary[] | null;
  onOpenChat: (sessionId: string) => void;
  session: MessagesSession;
}) {
  const venue = sessionVenuePresentation(session, courts);
  const courtLabel = sessionCourtLabel(session, venue);
  const scheduleLabel = sessionScheduleLabel(session);
  const unreadCount = Math.max(0, Number(session.unreadMessageCount) || 0);
  const unread = unreadCount > 0;
  const sessionId = String(session.sessionId);

  return (
    <button
      type="button"
      className="messages-row"
      data-message-row=""
      data-session-id={sessionId}
      data-testid={`messages-row-${sessionId}`}
      aria-label={unread ? `${courtLabel}，${scheduleLabel}，${unreadCount} 則未讀訊息` : undefined}
      onClick={() => onOpenChat(sessionId)}
    >
      <span className="messages-row__avatar" aria-hidden="true">
        {sessionHostInitial(session)}
      </span>
      <span className="messages-row__body">
        <span className="messages-row__court">{courtLabel}</span>
        <span className="messages-row__sub">{scheduleLabel}</span>
      </span>
      {unread ? <span className="messages-row__unread" aria-hidden="true" /> : null}
    </button>
  );
}

export function MessagesPage({ courts, groups, onOpenChat }: MessagesPageProps) {
  const rows = messagesFromGroups(groups ?? {}) as MessagesSession[];
  return (
    <>
      <div className="messages-page__head">
        <p className="messages-page__eyebrow">CHATS</p>
        <h1 tabIndex={-1} data-messages-heading="" className="messages-page__title">
          訊息
        </h1>
      </div>
      <div className="messages-page__list">
        {rows.length ? (
          rows.map((session) => (
            <MessageRow key={String(session.sessionId)} session={session} courts={courts} onOpenChat={onOpenChat} />
          ))
        ) : (
          <MessagesEmptyState />
        )}
      </div>
    </>
  );
}
