import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { SessionCard } from "../components/SessionCard.tsx";
import type { CourtSummary, SessionSummary } from "../domainTypes.ts";

interface CourtSessionCourt extends CourtSummary {
  city?: string;
  district?: string;
}

interface CourtSessionSheetProps {
  court: CourtSessionCourt;
  courts: CourtSessionCourt[] | null;
  onClose: () => void;
  sessions: Array<Partial<SessionSummary>>;
}

function CourtSessionSheet({ court, courts, onClose, sessions }: CourtSessionSheetProps) {
  return (
    <>
      <div className="surface__head">
        <div>
          <p className="surface__eyebrow">{String(court.district || court.city || "台北市")}</p>
          <h2>{String(court.name)}</h2>
        </div>
        <button
          type="button"
          className="surface__close"
          data-surface-close=""
          aria-label="關閉球場球局"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="nearby-sessions__cards">
        {sessions.length ? (
          sessions.map((session, index) => (
            <SessionCard
              compact
              courts={courts}
              session={session}
              key={session.sessionId == null ? `${session.startAt}:${index}` : String(session.sessionId)}
            />
          ))
        ) : (
          <p className="surface__copy">這座球場目前沒有可加入的球局。</p>
        )}
      </div>
    </>
  );
}

/** Mount React content inside mountSheet's existing surface element. */
export function mountCourtSessionSheetContent(rootElement: HTMLElement, props: CourtSessionSheetProps): void {
  const reactRoot = createRoot(rootElement);
  flushSync(() => reactRoot.render(<CourtSessionSheet {...props} />));
}
