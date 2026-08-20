import type { CourtSummary, SessionSummary } from "../domainTypes.ts";
import { sessionCardRuntime } from "../sessionViews.js";

type SessionCardSession = Partial<SessionSummary>;

interface SessionCardCourt extends CourtSummary {
  district?: string;
}

interface SessionCardPresentation {
  booked: boolean;
  className: string;
  courtLabel: string;
  feeLabel: string | null;
  instant: boolean;
  metaLabel: string;
  ongoing: boolean;
  timeTile: {
    className: string;
    date: string;
    start: string;
  };
  vacancy: string;
}

interface SessionCardRuntime {
  sessionCardPresentation(
    session: SessionCardSession,
    options: { compact: boolean; courts: SessionCardCourt[] | null }
  ): SessionCardPresentation;
}

export interface SessionCardProps {
  compact?: boolean;
  courts?: SessionCardCourt[] | null;
  session: SessionCardSession;
}

// sessionViews owns the eager glob that reaches every current consumer of
// this component. Resolve the runtime only while rendering so the circular
// module edge never reads its const export during initialization.
function runtime(): SessionCardRuntime {
  return sessionCardRuntime;
}

export function SessionCard({ compact = false, courts = [], session }: SessionCardProps) {
  const presentation = runtime().sessionCardPresentation(session, { compact, courts });
  return (
    <button
      type="button"
      className={presentation.className}
      data-testid="session-card"
      data-session-id={String(session.sessionId)}
    >
      <span className={presentation.timeTile.className}>
        <span className="time-tile__start">{presentation.timeTile.start}</span>
        <span className="time-tile__date">{presentation.timeTile.date}</span>
      </span>
      <span className="session-card__body">
        <span className="session-card__title">
          <span className="session-card__court">{presentation.courtLabel}</span>
          {presentation.instant ? <span className="session-badge session-badge--instant">直接加入</span> : null}
          {presentation.ongoing ? <span className="session-badge session-badge--ongoing">進行中</span> : null}
        </span>
        <span className="session-card__meta">{presentation.metaLabel}</span>
        {presentation.feeLabel ? <span className="session-card__meta">{presentation.feeLabel}</span> : null}
        <span className="session-card__foot">
          <span className="slots-brick">{presentation.vacancy}</span>
          {presentation.booked ? <span className="booked-note">✓ 已訂場</span> : null}
          <span className="session-card__chevron" aria-hidden="true">
            ›
          </span>
        </span>
      </span>
    </button>
  );
}
