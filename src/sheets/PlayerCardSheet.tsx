import { createRef, forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { Avatar } from "../components/Avatar.tsx";
import type { CourtSummary, SessionSummary } from "../domainTypes.ts";
import { playerCardSheetRuntime } from "../sessionViews.js";

interface PlayerCardCourt extends CourtSummary {
  district?: string;
}

type InvitableSession = Partial<SessionSummary>;

export interface CardPlayer {
  courtDistrict?: string;
  courtName?: string;
  courtNames?: string[] | null;
  isPresent?: boolean;
  isSelf?: boolean;
  minutesAgo?: number | null;
  nickname?: string;
  ntrp?: number | string | null;
  openToGreeting?: boolean;
  playTypes?: string[] | null;
  playedCount?: number | null;
  profileId?: number | string | null;
  slotCodes?: string[] | null;
}

interface PlayerCardPresentation {
  courtNameText: string;
  courtsText: string;
  districtLabel: string;
  greetingLabel: string;
  nickname: string;
  ntrpValue: string;
  playTypesText: string;
  presenceLabel: string;
  profileId: string;
  showGreeting: boolean;
  showPresence: boolean;
  slotsText: string;
  trustText: string | null;
}

interface InviteOptionPresentation {
  badge: string;
  court: string;
  notes: string;
  ntrpRange: string;
  playType: string;
  sessionId: string;
  time: string;
}

interface PlayerCardRuntime {
  playerCardPresentation(player: CardPlayer): PlayerCardPresentation;
  playerInviteOptionPresentation(session: InvitableSession, courts: PlayerCardCourt[]): InviteOptionPresentation;
}

export interface PlayerCardSheetContentContract {
  setInvitableSessions(sessions?: InvitableSession[] | null): void;
}

interface PlayerCardSheetContentOptions {
  courts: PlayerCardCourt[];
  myInvitableSessions: InvitableSession[];
  onClose(): void;
  onCreate(): void;
  onInvite(sessionId: string): Promise<unknown>;
  onSeeDirectory(): void;
  player: CardPlayer;
  /** mountSheet's `#sheet-root`; the pending guard checks containment there. */
  sheetRoot: HTMLElement;
}

interface PlayerCardSheetProps extends PlayerCardSheetContentOptions {
  contentRef: React.Ref<PlayerCardSheetContentContract>;
}

type InviteBranch = "self" | "form" | "empty";

function runtime(): PlayerCardRuntime {
  return playerCardSheetRuntime;
}

function InviteEmpty({ onCreate }: { onCreate(): void }) {
  return (
    <>
      <p className="surface__copy">你目前沒有可邀請的球局</p>
      <button
        type="button"
        className="session-primary"
        data-player-create=""
        data-testid="player-create-session"
        onClick={() => onCreate()}
      >
        去開球局
      </button>
    </>
  );
}

function InviteOptions({
  courts,
  generation,
  onCreate,
  sessions,
}: {
  courts: PlayerCardCourt[];
  generation: number;
  onCreate(): void;
  sessions: InvitableSession[];
}) {
  if (!sessions.length) {
    return (
      <div className="player-invite-empty">
        <InviteEmpty onCreate={onCreate} />
      </div>
    );
  }
  return (
    <>
      {sessions.map((session, index) => {
        const option = runtime().playerInviteOptionPresentation(session, courts);
        const identity = session.sessionId == null ? `missing:${index}` : `id:${option.sessionId}`;
        return (
          // The legacy setInvitableSessions replaced the option markup wholesale,
          // so every refresh dropped any checked radio. Folding the refresh
          // generation into the key reproduces that remount exactly.
          <label className="player-invite-option" key={`${generation}:${identity}`}>
            <input
              type="radio"
              name="player-invite-session"
              defaultValue={option.sessionId}
              data-testid="player-invite-session"
            />
            <strong>{option.time}</strong>
            {/* 每段複合文字都以單一 template string 產出,讓 React 的 text node
                切分與舊字串模板逐字相同(DOM probe 以 text node 數對照)。 */}
            <span>{`${option.badge} · ${option.court}`}</span>
            <span>{`${option.playType} · ${option.ntrpRange}`}</span>
            {option.notes ? <span>{option.notes}</span> : null}
          </label>
        );
      })}
    </>
  );
}

function PlayerCardSheet({
  contentRef,
  courts,
  myInvitableSessions,
  onClose,
  onCreate,
  onInvite,
  onSeeDirectory,
  player,
  sheetRoot,
}: PlayerCardSheetProps) {
  // The legacy factory chose the invite branch once, from the sessions it was
  // opened with; setInvitableSessions never switched a form into the standalone
  // empty block (it only refilled the options and hid the submit button).
  const [branch] = useState<InviteBranch>(() =>
    player.isSelf ? "self" : myInvitableSessions.length ? "form" : "empty"
  );
  const [invite, setInvite] = useState(() => ({ generation: 0, sessions: myInvitableSessions }));
  const [pending, setPending] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [successText, setSuccessText] = useState("");
  const submitRef = useRef<HTMLButtonElement>(null);

  useImperativeHandle(
    contentRef,
    () => ({
      setInvitableSessions(sessions) {
        // Legacy no-op when the form branch was never rendered: it bailed out as
        // soon as either the options container or the submit button was missing.
        if (branch !== "form") return;
        const nextSessions = Array.isArray(sessions) ? sessions : [];
        setInvite((previous) => ({ generation: previous.generation + 1, sessions: nextSessions }));
      },
    }),
    [branch]
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = submitRef.current;
      const selected = form.querySelector<HTMLInputElement>("input[name='player-invite-session']:checked");
      setErrorText("");
      setSuccessText("");
      if (!selected) {
        setErrorText("請選擇一個球局。");
        return;
      }
      // runAsyncAction only ever watched the controls it actually locked, and it
      // compared them against mountSheet's shared root: a surface replaced while
      // the invite is in flight detaches them, and neither the result nor the
      // control restore may land on the stale card.
      const watched = submit && !submit.disabled ? [submit] : [];
      const superseded = () => watched.some((node) => !sheetRoot.contains(node));
      if (watched.length) setPending(true);
      try {
        await onInvite(selected.value);
        if (!superseded()) setSuccessText("邀請已送出");
      } catch (inviteError) {
        if (!superseded()) setErrorText((inviteError as Error | null)?.message || "邀請失敗，請稍後再試。");
      } finally {
        if (watched.length && !superseded()) setPending(false);
      }
    },
    [onInvite, sheetRoot]
  );

  const presentation = runtime().playerCardPresentation(player);

  return (
    <>
      <span className="player-card-sheet__grabber" aria-hidden="true" />
      <div className="surface__head">
        <p className="surface__eyebrow">{presentation.districtLabel}</p>
        <button
          type="button"
          className="surface__close"
          data-surface-close=""
          aria-label="關閉球友卡"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="profile-brick-row profile-brick-row--player">
        <Avatar nickname={player.nickname} size="lg" />
        <span className="profile-brick-row__copy">
          <strong>{presentation.nickname}</strong>
          <span>{`常打 ${presentation.courtsText} · ${presentation.slotsText}`}</span>
        </span>
        <div className="ntrp-brick">
          <p className="ntrp-brick__eyebrow">NTRP</p>
          <p className="ntrp-brick__value">{presentation.ntrpValue}</p>
        </div>
      </div>
      <div className="player-profile" data-player-profile-id={presentation.profileId}>
        {presentation.trustText ? <span className="trust-count">{presentation.trustText}</span> : null}
        {presentation.showPresence ? <p>{`在線狀態：${presentation.presenceLabel}`}</p> : null}
        {presentation.showGreeting ? <p className="player-greeting">{presentation.greetingLabel}</p> : null}
        <p>{`打法：${presentation.playTypesText}`}</p>
        <p>{`時段：${presentation.slotsText}`}</p>
        <p>{`常打球場：${presentation.courtNameText}`}</p>
      </div>
      {branch === "form" ? (
        <form className="player-invite-form" data-player-invite="" onSubmit={handleSubmit}>
          <fieldset className="form-fieldset">
            <legend>邀請加入我的球局</legend>
            <div className="player-invite-options" data-player-invite-options="">
              <InviteOptions
                courts={courts}
                generation={invite.generation}
                onCreate={onCreate}
                sessions={invite.sessions}
              />
            </div>
          </fieldset>
          <p className="form-error" role="alert" data-player-invite-error="" hidden={!errorText}>
            {errorText}
          </p>
          <p className="player-invite-success" role="status" data-player-invite-success="" hidden={!successText}>
            {successText}
          </p>
          <button
            type="submit"
            className="session-primary"
            data-testid="player-invite-submit"
            disabled={pending}
            hidden={invite.sessions.length === 0}
            ref={submitRef}
          >
            送出邀請
          </button>
        </form>
      ) : null}
      {branch === "empty" ? (
        <div className="player-invite-empty" data-player-invite="">
          <InviteEmpty onCreate={onCreate} />
        </div>
      ) : null}
      <div className="player-card-sheet__actions">
        <button
          type="button"
          className="session-secondary"
          data-player-see-directory=""
          onClick={() => onSeeDirectory()}
        >
          看球友名單
        </button>
        <button type="button" className="session-primary" data-surface-close="" onClick={onClose}>
          關閉
        </button>
      </div>
      <p className="player-card-sheet__footnote">在線球友為開放名單者;邀約請透過球局。</p>
    </>
  );
}

const PlayerCardSheetWithRef = forwardRef<PlayerCardSheetContentContract, PlayerCardSheetContentOptions>(
  function PlayerCardSheetWithRef(props, ref) {
    return <PlayerCardSheet {...props} contentRef={ref} />;
  }
);

/** Mount React into mountSheet's surface contents and expose synchronous state pushes. */
export function mountPlayerCardSheetContent(
  rootElement: HTMLElement,
  options: PlayerCardSheetContentOptions
): PlayerCardSheetContentContract {
  const reactRoot = createRoot(rootElement);
  const contentRef = createRef<PlayerCardSheetContentContract>();
  flushSync(() => reactRoot.render(<PlayerCardSheetWithRef {...options} ref={contentRef} />));
  if (!contentRef.current) throw new Error("PlayerCardSheet content did not mount.");

  return {
    setInvitableSessions(sessions) {
      flushSync(() => contentRef.current?.setInvitableSessions(sessions));
    },
  };
}
