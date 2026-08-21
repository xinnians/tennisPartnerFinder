import type { CourtSummary, MySessionSummary, SessionSummary } from "../domainTypes.ts";
import { isUndecidedCandidate } from "../sessionCriteria.js";
import { messagesFromGroups } from "../sessionPresentation.ts";
import { taipeiClock, taipeiDateKey, taipeiParts } from "../taipeiTime.js";

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

interface VenuePresentation {
  candidateNames?: string[];
  court: string;
  undecidedCandidates: boolean;
}

const TAIPEI_WEEKDAY_WORD = ["日", "一", "二", "三", "四", "五", "六"];

function taipeiDayKey(value: string | Date): string {
  return taipeiDateKey(value) ?? "";
}

function taipeiDayWord(value: string, now = new Date()): string {
  const key = taipeiDayKey(value);
  if (!key) return "";
  if (key === taipeiDayKey(now)) return "今天";
  if (key === taipeiDayKey(new Date(now.getTime() + 86_400_000))) return "明天";
  const parts = taipeiParts(value);
  if (!parts) return "";
  return `週${TAIPEI_WEEKDAY_WORD[parts.weekday]}`;
}

function sessionScheduleLabel(session: MessagesSession): string {
  const dayWord = taipeiDayWord(session.startAt) || "時間待確認";
  const startClock = taipeiClock(session.startAt);
  const undecided = isUndecidedCandidate(session);
  const timeLabel = undecided && session.rangeEnd ? `${startClock}–${taipeiClock(session.rangeEnd)}` : startClock;
  const hostLabel = String(session.viewerRole ?? "").toLowerCase() === "host" ? "我" : session.hostNickname || "主揪";
  return `${dayWord} ${timeLabel} · 主揪 ${hostLabel}`;
}

function sessionHostInitial(session: MessagesSession): string {
  if (String(session.viewerRole ?? "").toLowerCase() === "host") return "我";
  const nickname = String(session.hostNickname ?? "").trim();
  return nickname ? nickname.slice(0, 1) : "主";
}

function sessionVenuePresentation(session: MessagesSession, courts: CourtSummary[] | null): VenuePresentation {
  const undecided = isUndecidedCandidate(session);
  if (!undecided) {
    return {
      court: [session.court, session.courtDistrict].filter(Boolean).join(" · "),
      undecidedCandidates: false,
    };
  }

  const catalogue = new Map((Array.isArray(courts) ? courts : []).map((court) => [String(court.id), court]));
  const names = (Array.isArray(session.candidateCourtIds) ? session.candidateCourtIds : [])
    .map((courtId, index) => catalogue.get(String(courtId))?.name ?? (index === 0 ? session.court : null))
    .filter((name): name is string => Boolean(name));
  return {
    candidateNames: names,
    court: names.join("、") || session.court || "候選球場待確認",
    undecidedCandidates: true,
  };
}

function sessionCourtLabel(session: MessagesSession, venue: VenuePresentation): string {
  const candidateNames = venue.candidateNames ?? [];
  return venue.undecidedCandidates
    ? `${candidateNames[0] ?? "候選球場待確認"}${candidateNames.length > 1 ? ` 等 ${candidateNames.length} 館候選` : ""}`
    : session.court || venue.court;
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
