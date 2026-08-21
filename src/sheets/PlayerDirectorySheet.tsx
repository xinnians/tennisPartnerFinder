import { createRef, forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";

import { AppErrorBoundary } from "../components/AppErrorBoundary.tsx";
import { Avatar } from "../components/Avatar.tsx";
import type { SurfaceLoadStatus } from "../domainTypes.ts";
import { playerDirectorySheetRuntime } from "../sessionPresentation.ts";
import { mountSurfaceContent, type SurfaceContentLifecycle } from "../app/SurfaceHost.tsx";

export interface DirectoryPlayer {
  courtName?: string;
  courtNames?: string[] | null;
  isPresent?: boolean;
  isSelf?: boolean;
  nickname?: string;
  ntrp?: number | string | null;
  playedCount?: number | null;
  profileId?: number | string | null;
  slotCodes?: string[] | null;
}

/** `null` models the shell mountSheet used to render before its first setDirectory. */
interface PlayerDirectoryState {
  players: DirectoryPlayer[];
  status: SurfaceLoadStatus;
}

export interface PlayerDirectorySheetInput {
  players?: DirectoryPlayer[] | null;
  status?: SurfaceLoadStatus;
}

export interface PlayerDirectorySheetContentContract {
  setDirectory(next?: PlayerDirectorySheetInput | null): void;
}

interface PlayerDirectorySheetContentOptions {
  onClose(): void;
  onOpenPlayer(player: DirectoryPlayer): void;
  onRetry(): void;
}

interface PlayerDirectorySheetProps extends PlayerDirectorySheetContentOptions {
  contentRef: React.Ref<PlayerDirectorySheetContentContract>;
}

function DirectoryRow({ onOpenPlayer, player }: { onOpenPlayer(id: string): void; player: DirectoryPlayer }) {
  const presentation = playerDirectorySheetRuntime.playerDirectoryRowPresentation(player);
  return (
    <button
      type="button"
      className="player-directory-row"
      data-player-directory-row=""
      data-testid={`player-directory-row-${presentation.id}`}
      data-player-id={presentation.id}
      onClick={() => onOpenPlayer(presentation.id)}
    >
      <Avatar nickname={player.nickname} size="md" />
      <span className="player-directory-row__body">
        <span className="player-directory-row__head">
          <strong>{presentation.nickname}</strong>
          <span className="ntrp-brick--sm">{presentation.ntrpValue}</span>
          {presentation.showOnline ? <span className="player-directory-row__online">在線</span> : null}
          {presentation.showSelf ? <span className="player-directory-row__self">這是你</span> : null}
        </span>
        {/* 複合文字以單一 template string 產出,讓 React 的 text node 切分與舊
            字串模板逐字相同(DOM probe 以 text node 數對照)。 */}
        <span className="player-directory-row__sub">{`常打 ${presentation.courtsText} · ${presentation.slotsText}`}</span>
        {presentation.trustText ? <span className="trust-count">{presentation.trustText}</span> : null}
      </span>
      <span className="player-directory-row__chevron" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

function DirectoryBody({
  onOpenPlayer,
  onRetry,
  state,
}: {
  onOpenPlayer(id: string): void;
  onRetry(): void;
  state: PlayerDirectoryState | null;
}) {
  if (state === null) return null;
  if (state.status === "loading") {
    return (
      <p className="surface__copy" role="status">
        正在載入球友名單…
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <div className="form-error" role="alert">
        球友名單暫時無法載入。
        <button type="button" className="session-secondary" data-player-directory-retry="" onClick={() => onRetry()}>
          重新載入
        </button>
      </div>
    );
  }
  if (!state.players.length) return <p className="surface__copy">目前沒有公開的球友卡。</p>;
  return (
    <>
      {state.players.map((player, index) => (
        <DirectoryRow
          key={player.profileId == null ? `missing:${index}` : `id:${String(player.profileId)}`}
          onOpenPlayer={onOpenPlayer}
          player={player}
        />
      ))}
    </>
  );
}

function PlayerDirectorySheet({ contentRef, onClose, onOpenPlayer, onRetry }: PlayerDirectorySheetProps) {
  const [state, setState] = useState<PlayerDirectoryState | null>(null);
  const [countLabel, setCountLabel] = useState("0");
  // The legacy row wiring resolved the clicked id against the array most
  // recently handed to setDirectory, so the object passed to onOpenPlayer keeps
  // caller identity. A ref preserves that even between renders.
  const playersRef = useRef<DirectoryPlayer[]>([]);

  useImperativeHandle(
    contentRef,
    () => ({
      setDirectory(next) {
        const source = next && typeof next === "object" ? next : {};
        const players = Array.isArray(source.players) ? source.players : [];
        const status = source.status === undefined ? "ready" : source.status;
        playersRef.current = players;
        // The subtitle count only states a confirmed number: loading and error
        // keep whatever the last ready load reported (0 before the first one).
        if (status === "ready") setCountLabel(String(players.length));
        setState({ players, status });
      },
    }),
    []
  );

  const handleOpenPlayer = useCallback(
    (id: string) => {
      const player = playersRef.current.find((candidate) => String(candidate.profileId) === id);
      if (player) onOpenPlayer(player);
    },
    [onOpenPlayer]
  );

  return (
    <>
      <span className="player-directory-sheet__grabber" aria-hidden="true" />
      <div className="surface__head player-directory-sheet__head">
        <div>
          <p className="surface__eyebrow">PLAYERS</p>
          <h2>球友名單</h2>
          <p className="player-directory-sheet__sub">
            {"開放名單的球友 · "}
            <span className="player-directory-sheet__count" data-player-directory-count="">
              {countLabel}
            </span>
            {" 位"}
          </p>
        </div>
        <button
          type="button"
          className="surface__close"
          data-surface-close=""
          aria-label="關閉球友名單"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="player-directory-sheet__scroll qm-scroll">
        <p className="surface__copy">在線球友排在前面；點選球友卡可查看邀請入口。</p>
        <div className="player-directory-list" data-player-directory-list="" role="list">
          <DirectoryBody onOpenPlayer={handleOpenPlayer} onRetry={onRetry} state={state} />
        </div>
      </div>
    </>
  );
}

const PlayerDirectorySheetWithRef = forwardRef<PlayerDirectorySheetContentContract, PlayerDirectorySheetContentOptions>(
  function PlayerDirectorySheetWithRef(props, ref) {
    return <PlayerDirectorySheet {...props} contentRef={ref} />;
  }
);

/** Mount React into mountSheet's surface contents and expose synchronous state pushes. */
export function mountPlayerDirectorySheetContent(
  rootElement: HTMLElement,
  options: PlayerDirectorySheetContentOptions
): PlayerDirectorySheetContentContract & SurfaceContentLifecycle {
  const surfaceContent = mountSurfaceContent(rootElement);
  const contentRef = createRef<PlayerDirectorySheetContentContract>();
  let boundaryFailed = false;
  surfaceContent.render(
    <AppErrorBoundary
      rootElement={rootElement}
      surface="player-directory-sheet"
      onError={() => {
        boundaryFailed = true;
      }}
    >
      <PlayerDirectorySheetWithRef {...options} ref={contentRef} />
    </AppErrorBoundary>
  );
  if (!contentRef.current && !boundaryFailed) throw new Error("PlayerDirectorySheet content did not mount.");

  return {
    isSurfaceRootLive: surfaceContent.isSurfaceRootLive,
    setDirectory(next) {
      surfaceContent.commit(() => contentRef.current?.setDirectory(next));
    },
    unmount: surfaceContent.unmount,
  };
}
