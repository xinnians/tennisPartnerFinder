import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import type { CourtSummary } from "../domainTypes.ts";
import { courtPlayersSheetRuntime } from "../sessionViews.js";

interface CourtPlayersCourt extends CourtSummary {
  city?: string;
  district?: string;
}

interface CourtPlayer {
  isPresent?: boolean;
  nickname?: string;
  ntrp?: number | string | null;
  openToGreeting?: boolean;
  playTypes?: string[] | null;
  profileId?: number | string | null;
}

interface CourtPlayerPresentation {
  greetingLabel: string;
  id: string;
  nickname: string;
  ntrpLabel: string;
  playTypesLabel: string;
  presenceLabel: string;
  showGreeting: boolean;
  showPresence: boolean;
}

interface CourtPlayersRuntime {
  courtPlayerCardPresentation(player: CourtPlayer): CourtPlayerPresentation;
}

interface CourtPlayersSheetProps {
  court: CourtPlayersCourt;
  onClose: () => void;
  players: CourtPlayer[];
}

function runtime(): CourtPlayersRuntime {
  return courtPlayersSheetRuntime;
}

function CourtPlayersSheet({ court, onClose, players }: CourtPlayersSheetProps) {
  return (
    <>
      <div className="surface__head">
        <div>
          <p className="surface__eyebrow">{String(court.district || court.city || "台北市")}</p>
          <h2>{String(court.name)}・球友</h2>
        </div>
        <button
          type="button"
          className="surface__close"
          data-surface-close=""
          aria-label="關閉球場球友"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="nearby-sessions__cards">
        {players.length ? (
          players.map((player, index) => {
            const presentation = runtime().courtPlayerCardPresentation(player);
            return (
              <button
                type="button"
                className="player-card"
                data-testid={`court-player-card-${presentation.id}`}
                data-player-id={presentation.id}
                key={player.profileId == null ? `missing:${index}` : `id:${presentation.id}`}
              >
                <strong>{presentation.nickname}</strong> · {presentation.ntrpLabel}
                {presentation.showPresence ? (
                  <span className="player-presence">
                    {presentation.presenceLabel}
                    {presentation.showGreeting ? ` · ${presentation.greetingLabel}` : null}
                  </span>
                ) : null}
                <span>{presentation.playTypesLabel}</span>
              </button>
            );
          })
        ) : (
          <p className="surface__copy">這座球場目前沒有在線球友。</p>
        )}
      </div>
    </>
  );
}

/** Mount React content inside mountSheet's existing surface element. */
export function mountCourtPlayersSheetContent(rootElement: HTMLElement, props: CourtPlayersSheetProps): void {
  const reactRoot = createRoot(rootElement);
  flushSync(() => reactRoot.render(<CourtPlayersSheet {...props} />));
}
