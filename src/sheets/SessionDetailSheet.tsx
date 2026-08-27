import {
  Fragment,
  forwardRef,
  memo,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";

import { AppErrorBoundary } from "../components/AppErrorBoundary.tsx";
import { Avatar } from "../components/Avatar.tsx";
import type { CourtSummary, SessionJoinPreviewState, SessionSummary } from "../domainTypes.ts";
import { FOCUSABLE_SELECTOR } from "../focusableSelector.js";
import { formatNtrp } from "../profile.ts";
import { runAsyncAction } from "../sessionActions.ts";
import { notificationPushHint, sessionDetailSheetRuntime } from "../sessionPresentation.ts";
import { mountSurfaceContent, type SurfaceContentLifecycle } from "../app/SurfaceHost.tsx";

type JoinStage = "idle" | "confirming" | "submitting" | "success" | "error";

type SessionDetailSession = Partial<SessionSummary>;

interface SessionDetailCourt extends CourtSummary {
  district?: string;
}

interface SessionDetailAction {
  disabled?: boolean;
  expectedAccepted?: boolean;
  kind?: string;
  label?: string;
  note?: string;
  secondaryLabel?: string;
}

interface NotificationSettingsInput {
  courtIds?: Array<number | string>;
  errorMessage?: string;
  prefs?: Record<string, boolean>;
  pushStatus?: string;
  webPushConfigured?: boolean;
}

interface SessionDetailContentOptions {
  action?: SessionDetailAction | null;
  canChat: boolean;
  canDecide: boolean;
  canEdit: boolean;
  canReport: boolean;
  courts: SessionDetailCourt[];
  isMine: boolean;
  notificationSettings: NotificationSettingsInput;
  session: SessionDetailSession;
  showJoinPreview: boolean;
  venue: SessionDetailVenue;
}

interface SessionDetailVenue {
  badge?: string;
  candidateNames?: string[];
  court?: string;
  decided?: boolean;
  time?: string;
  undecidedCandidates?: boolean;
}

interface SessionDetailSnapshot {
  actionGeneration?: number;
  expectedAccepted: boolean;
  joinPreview: SessionJoinPreviewState;
  message: string;
  stage: JoinStage;
}

interface SessionDetailSheetProps {
  detail: SessionDetailContentOptions;
  handlers: SessionDetailHandlers;
  snapshot: SessionDetailSnapshot;
}

interface JoinResult {
  accepted?: boolean;
  joinError?: string;
  joinSubmitted?: boolean;
  outcome?: string;
}

interface SessionDetailHandlers {
  onChat: () => unknown;
  onCloseSurface: () => void;
  onConfirmJoin: () => JoinResult | PromiseLike<JoinResult>;
  onCopyLink: () => unknown;
  onDecide: () => unknown;
  onEdit: () => unknown;
  onEnablePush: () => unknown;
  onPrimary: () => unknown;
  onReport: () => unknown;
  onViewMySessions: (sessionId?: number | string | null) => unknown;
  onWithdraw: () => unknown;
  rootElement: HTMLElement;
}

interface SessionDetailCommands {
  enterConfirming(expectedAccepted?: boolean): void;
  handleEscape(): boolean;
  setJoinPreview(state: SessionJoinPreviewState): void;
}

export interface SessionDetailContentContract extends SurfaceContentLifecycle {
  enterConfirming(expectedAccepted?: boolean): void;
  handleEscape(): boolean;
  setJoinPreview(state: SessionJoinPreviewState): void;
}

function ClockIcon() {
  return (
    <svg
      className="cta-status__icon"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-text-secondary)"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="cta-status__icon"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-success)"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function CopyLinkButton({ handlers }: { handlers: SessionDetailHandlers }) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget;
    void runAsyncAction({
      root: handlers.rootElement,
      callback: handlers.onCopyLink,
      controls: [button],
      error: handlers.rootElement.querySelector("[data-session-report-error]"),
      clearError: false,
      errorMessage: "目前無法複製連結，請手動複製網址。",
    });
  };
  return (
    <button
      type="button"
      className="session-secondary cta-copy-link"
      data-session-action="copy-link"
      onClick={handleClick}
    >
      複製連結
    </button>
  );
}

function EditButton({ canEdit, onEdit }: { canEdit: boolean; onEdit: () => unknown }) {
  return canEdit ? (
    <button type="button" className="session-secondary" data-session-action="edit" onClick={onEdit}>
      編輯球局
    </button>
  ) : null;
}

function ExtraChatButton({ canChat, kind, onChat }: { canChat: boolean; kind?: string; onChat: () => unknown }) {
  return canChat && kind !== "chat" ? (
    <button type="button" className="session-primary" data-session-action="chat" onClick={onChat}>
      群組聊天
    </button>
  ) : null;
}

function ReportButton({ canReport, handlers }: { canReport: boolean; handlers: SessionDetailHandlers }) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget;
    void runAsyncAction({
      root: handlers.rootElement,
      callback: handlers.onReport,
      controls: [button],
      error: handlers.rootElement.querySelector("[data-session-report-error]"),
      errorMessage: "目前無法開啟檢舉。",
    });
  };
  return canReport ? (
    <button type="button" className="session-tertiary" data-session-action="report" onClick={handleClick}>
      檢舉此球局
    </button>
  ) : null;
}

function TextAction({ action, label, onClick }: { action: string; label: string; onClick: () => unknown }) {
  return (
    <button type="button" className="cta-text-action" data-session-action={action} onClick={onClick}>
      {label}
    </button>
  );
}

function IdleActions({ detail, handlers }: { detail: SessionDetailContentOptions; handlers: SessionDetailHandlers }) {
  const { action, canChat, canEdit, canReport, isMine } = detail;
  const currentAction = action ?? {};
  const kind = currentAction.kind;
  const commonButtons = (
    <Fragment>
      <CopyLinkButton handlers={handlers} />
      <EditButton canEdit={canEdit} onEdit={handlers.onEdit} />
    </Fragment>
  );

  if (kind === "join") {
    const instant = Boolean(currentAction.expectedAccepted);
    return (
      <Fragment>
        <div className="cta-row">
          {commonButtons}
          <ExtraChatButton canChat={canChat} kind={kind} onChat={handlers.onChat} />
          <button
            type="button"
            className={`session-primary${instant ? " session-primary--instant" : ""}`}
            data-session-action="primary"
            disabled={Boolean(currentAction.disabled)}
            onClick={handlers.onPrimary}
          >
            {currentAction.label ?? "申請加入"}
          </button>
        </div>
        {currentAction.secondaryLabel ? (
          <TextAction action="secondary" label={currentAction.secondaryLabel} onClick={handlers.onWithdraw} />
        ) : null}
        <ReportButton canReport={canReport} handlers={handlers} />
        <p className="cta-footnote">成局後可在球局群組聊天協調細節。</p>
      </Fragment>
    );
  }

  if (kind === "waiting") {
    return (
      <Fragment>
        <div className="cta-row">
          {commonButtons}
          <div className="cta-status cta-status--pending" data-session-action="primary" aria-disabled="true">
            <ClockIcon />
            已送出申請 · 等主揪確認
          </div>
        </div>
        <TextAction action="secondary" label="取消申請" onClick={handlers.onWithdraw} />
        <ReportButton canReport={canReport} handlers={handlers} />
      </Fragment>
    );
  }

  if (kind === "chat") {
    if (isMine) {
      return (
        <Fragment>
          <div className="cta-row">
            {commonButtons}
            <button
              type="button"
              className="session-primary"
              data-session-action="primary"
              onClick={handlers.onPrimary}
            >
              {currentAction.label ?? "群組聊天"}
            </button>
          </div>
          <ReportButton canReport={canReport} handlers={handlers} />
        </Fragment>
      );
    }
    return (
      <Fragment>
        <div className="cta-status cta-status--joined">
          <CheckIcon />
          已加入這場球局
        </div>
        <div className="cta-row">
          {commonButtons}
          <button type="button" className="session-primary" data-session-action="primary" onClick={handlers.onPrimary}>
            {currentAction.label ?? "群組聊天"}
          </button>
        </div>
        <TextAction action="secondary" label="取消報名" onClick={handlers.onWithdraw} />
        <ReportButton canReport={canReport} handlers={handlers} />
      </Fragment>
    );
  }

  if (kind === "full" || kind === "terminal") {
    return (
      <Fragment>
        <div className="cta-row">
          {commonButtons}
          <ExtraChatButton canChat={canChat} kind={kind} onChat={handlers.onChat} />
          <button type="button" className="cta-status cta-status--disabled" data-session-action="primary" disabled>
            {currentAction.label ?? ""}
          </button>
        </div>
        <ReportButton canReport={canReport} handlers={handlers} />
      </Fragment>
    );
  }

  return (
    <Fragment>
      <div className="cta-row">
        {commonButtons}
        <ExtraChatButton canChat={canChat} kind={kind} onChat={handlers.onChat} />
        <button
          type="button"
          className="session-primary"
          data-session-action="primary"
          disabled={Boolean(action?.disabled)}
          onClick={handlers.onPrimary}
        >
          {action?.label ?? "申請加入"}
        </button>
      </div>
      {action?.secondaryLabel ? (
        <TextAction action="secondary" label={action.secondaryLabel} onClick={handlers.onWithdraw} />
      ) : null}
      <ReportButton canReport={canReport} handlers={handlers} />
    </Fragment>
  );
}

function SuccessPushPrompt({
  handlers,
  notificationSettings,
}: {
  handlers: SessionDetailHandlers;
  notificationSettings: NotificationSettingsInput;
}) {
  const prompt = sessionDetailSheetRuntime.successPushPromptPresentation(notificationSettings, {
    message: "開啟推播，才不會錯過主揪的審核結果與球局變更。",
    testId: "join-success-enable-push",
  });
  if (!prompt) return null;
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget;
    const promptElement = button.closest<HTMLElement>("[data-success-push-prompt]");
    const error = promptElement?.querySelector<HTMLElement>("[data-success-push-error]") ?? null;
    let terminalStatus = false;
    void runAsyncAction({
      root: handlers.rootElement,
      callback: handlers.onEnablePush,
      controls: [button],
      watchNodes: [promptElement],
      error,
      errorMessage: "推播暫時無法開啟，請稍後再試。",
      errorFocus: true,
      onSuccess: (status) => {
        if (status === "enabled") {
          if (promptElement) promptElement.hidden = true;
          return;
        }
        if (status === "unsupported") {
          terminalStatus = true;
          button.textContent = "此瀏覽器不支援推播";
          if (error) {
            error.textContent = notificationPushHint({ pushStatus: status, webPushConfigured: true });
            error.hidden = false;
          }
          return;
        }
        if (status === "denied" && error) {
          error.textContent = notificationPushHint({ pushStatus: status, webPushConfigured: true });
          error.hidden = false;
          error.focus({ preventScroll: true });
        }
      },
      canRestoreControls: () => !promptElement?.hidden && !terminalStatus,
    });
  };
  return (
    <section className="success-push-prompt" data-success-push-prompt="">
      <p>{prompt.message}</p>
      <button
        type="button"
        className="session-secondary"
        data-success-enable-push=""
        data-testid={prompt.testId}
        onClick={handleClick}
      >
        開啟推播
      </button>
      <p className="form-hint">{prompt.iosHint}</p>
      <p className="form-error" data-success-push-error="" role="alert" tabIndex={-1} hidden />
    </section>
  );
}

function Actions({
  detail,
  handlers,
  setStage,
  snapshot,
  submitJoin,
}: SessionDetailSheetProps & {
  setStage: (stage: JoinStage, message?: string) => void;
  submitJoin: () => void;
}) {
  if (snapshot.stage === "idle") return <IdleActions detail={detail} handlers={handlers} />;
  if (snapshot.stage === "confirming" || snapshot.stage === "submitting") {
    const submitting = snapshot.stage === "submitting";
    return (
      <Fragment>
        <p className="form-hint" data-testid="join-confirm-hint">
          {sessionDetailSheetRuntime.joinConfirmHintText(snapshot.expectedAccepted)}
        </p>
        <button
          type="button"
          className="session-secondary"
          data-testid="join-cancel"
          disabled={submitting}
          onClick={() => setStage("idle")}
        >
          取消
        </button>
        <button
          type="button"
          className="session-primary"
          data-testid="join-confirm"
          disabled={submitting}
          onClick={submitJoin}
        >
          {submitting ? "送出中…" : "確認送出"}
        </button>
      </Fragment>
    );
  }
  if (snapshot.stage === "success") {
    return (
      <Fragment>
        <h3 className="surface__message" data-testid="join-success-title" tabIndex={-1}>
          {snapshot.message}
        </h3>
        <SuccessPushPrompt handlers={handlers} notificationSettings={detail.notificationSettings} />
        <button
          type="button"
          className="session-primary"
          data-testid="join-open-my-sessions"
          onClick={() => {
            handlers.onViewMySessions(detail.session.sessionId);
          }}
        >
          查看我的球局
        </button>
      </Fragment>
    );
  }
  return (
    <Fragment>
      <p className="form-error" data-testid="join-error" role="alert">
        {snapshot.message}
      </p>
      <button type="button" className="session-primary" data-testid="join-retry" onClick={() => setStage("confirming")}>
        重試
      </button>
    </Fragment>
  );
}

function TimeTile({ session, venue }: { session: SessionDetailSession; venue: SessionDetailVenue }) {
  const presentation = sessionDetailSheetRuntime.sessionTimeTilePresentation(session, venue, { detail: true });
  return (
    <span className={presentation.className}>
      <span className="time-tile__start">{presentation.start}</span>
      <span className="time-tile__date">{presentation.date}</span>
    </span>
  );
}

const DetailMain = memo(function DetailMain({
  detail,
  handlers,
}: {
  detail: SessionDetailContentOptions;
  handlers: SessionDetailHandlers;
}) {
  const { canDecide, courts, isMine, session, venue } = detail;
  const ongoingMinutes = venue.undecidedCandidates ? null : sessionDetailSheetRuntime.ongoingSessionMinutes(session);
  const candidateNames = venue.candidateNames ?? [];
  const candidateRows = canDecide ? sessionDetailSheetRuntime.candidateCourtRows(session, courts) : [];
  const districtPrefix = !venue.undecidedCandidates && session.courtDistrict ? `${session.courtDistrict} · ` : "";
  return (
    <Fragment>
      <div className="session-detail__head">
        <TimeTile session={session} venue={venue} />
        <div className="session-detail__headcopy">
          <div className="session-detail__badges">
            <span className="session-badge" data-session-field="venue">
              {venue.badge}
            </span>
            {session.joinMode === "instant" ? (
              <span className="session-badge session-badge--instant">直接加入</span>
            ) : null}
            {ongoingMinutes !== null ? (
              <Fragment>
                <span className="session-badge session-badge--ongoing">進行中</span>
                <span className="session-ongoing-time">已開打 {ongoingMinutes} 分鐘</span>
              </Fragment>
            ) : null}
            {venue.undecidedCandidates ? <span className="session-badge session-badge--candidate">候選中</span> : null}
            {isMine ? <span className="session-badge session-badge--host">我主揪的</span> : null}
          </div>
          <p className="session-detail__court" data-session-field="court">
            {sessionDetailSheetRuntime.sessionDetailCourtName(session, venue)}
          </p>
          <p className="session-detail__meta" data-session-field="time">
            {districtPrefix}
            <span className="session-detail__mono">{venue.time}</span>
          </p>
        </div>
        <button
          type="button"
          className="session-detail__close"
          data-surface-close=""
          aria-label="關閉球局詳情"
          onClick={handlers.onCloseSurface}
        >
          ×
        </button>
      </div>
      <div className="scoreboard-strip session-detail__scoreboard" data-session-field="details">
        <div className="scoreboard-strip__cell">
          <p className="scoreboard-strip__eyebrow">TYPE</p>
          <p className="scoreboard-strip__value">{session.playType}</p>
        </div>
        <div className="scoreboard-strip__cell">
          <p className="scoreboard-strip__eyebrow">{`NTRP `}</p>
          <p className="scoreboard-strip__value scoreboard-strip__value--mono">
            {sessionDetailSheetRuntime.scoreboardNtrpValue(session)}
          </p>
        </div>
        <div className="scoreboard-strip__cell scoreboard-strip__cell--inverse">
          <p className="scoreboard-strip__eyebrow">缺額</p>
          <p className="scoreboard-strip__value scoreboard-strip__value--mono">
            {sessionDetailSheetRuntime.scoreboardVacancyText(session)}
          </p>
        </div>
      </div>
      {venue.undecidedCandidates && !isMine ? (
        <p className="candidate-info-panel" data-session-candidate-explanation="">
          候選球場:<strong>{candidateNames.join("、")}</strong> · 主揪定案後群組通知
        </p>
      ) : null}
      <div className="host-row" data-session-field="host">
        <span className="host-row__avatar" aria-hidden="true">
          {sessionDetailSheetRuntime.avatarInitial(session.hostNickname)}
        </span>
        <div className="host-row__copy">
          <p className="host-row__nameline">
            <strong>{session.hostNickname}</strong>
            <span className="host-row__chip">主揪</span>
          </p>
          <p className="host-row__ntrp">
            <span className="session-detail__mono">{formatNtrp(session.hostNtrp)}</span> ·{" "}
            {sessionDetailSheetRuntime.completionLabel(session)}
          </p>
        </div>
        <p className="host-row__status">{sessionDetailSheetRuntime.hostRowBookedStatus(session, venue)}</p>
      </div>
      <p className="session-detail__notes" data-session-field="notes">
        {session.notes ? `「${session.notes}」` : "沒有補充說明。"}
      </p>
      {session.feeNote ? (
        <p className="form-hint" data-session-field="fee-note">
          {`費用：${session.feeNote}`}
        </p>
      ) : null}
      {canDecide ? (
        <div className="candidate-decide-panel">
          <p className="candidate-decide-panel__title">候選球場 · 點定案</p>
          {candidateRows.map((court: SessionDetailCourt, index: number) => (
            <div className="candidate-decide-panel__row" key={`${String(court.id)}-${index}`}>
              <div className="candidate-decide-panel__copy">
                <p className="candidate-decide-panel__name">{court.name}</p>
                <p className="candidate-decide-panel__district">{court.district ?? ""}</p>
              </div>
              <button
                type="button"
                className="candidate-decide-panel__cta"
                data-session-action="decide"
                onClick={handlers.onDecide}
              >
                定案
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </Fragment>
  );
});

const JoinPreview = memo(function JoinPreview({ state }: { state: SessionJoinPreviewState }) {
  let content;
  if (state.status === "loading") {
    content = (
      <p className="form-hint" role="status">
        正在載入已確認參加者…
      </p>
    );
  } else if (state.status === "error") {
    content = (
      <p className="form-hint" role="status">
        參加者名單暫時無法載入。
      </p>
    );
  } else {
    const participants = [...state.participants].sort(
      (left, right) => Number(right.role === "host") - Number(left.role === "host")
    );
    content = participants.length ? (
      <div className="join-preview__people">
        {participants.map((participant, index) => {
          const trustText =
            participant.role === "host"
              ? sessionDetailSheetRuntime.trustCountText(participant.hostedPlayedCount, "已成局 {n} 次")
              : null;
          return (
            <article
              className="join-preview__person"
              data-join-preview-person=""
              key={`${participant.sessionId}-${participant.nickname}-${index}`}
            >
              <Avatar avatarUrl={participant.avatarUrl} nickname={participant.nickname} />
              <div>
                <strong>{participant.nickname}</strong>
                <span>
                  {participant.role === "host" ? "主揪" : "已確認"} · {formatNtrp(participant.ntrp)}
                </span>
                {trustText ? <span className="trust-count">{trustText}</span> : null}
              </div>
            </article>
          );
        })}
      </div>
    ) : (
      <p className="form-hint" role="status">
        目前沒有可顯示的已確認參加者。
      </p>
    );
  }
  return (
    <section className="join-preview" data-session-join-preview="">
      <h3>已確認參加者</h3>
      <div data-session-join-preview-content="">{content}</div>
    </section>
  );
});

const DetailTail = memo(function DetailTail({ action }: { action?: SessionDetailAction | null }) {
  return (
    <Fragment>
      {action?.note ? (
        <p className="form-hint" data-session-action-note="">
          {action.note}
        </p>
      ) : null}
      <p className="form-error" data-session-report-error="" role="alert" hidden />
    </Fragment>
  );
});

function joinSuccessMessage(result: JoinResult) {
  if (result.accepted) return "已加入球局！前往我的球局開啟群組聊天。";
  if (result.outcome === "OK_NTRP_MISSING") return "已送出申請；你尚未填寫 NTRP，等待主揪回覆。";
  if (result.outcome === "OK_NTRP_OUT_OF_RANGE") {
    return "已送出申請；你的 NTRP 不在球局設定範圍內，等待主揪回覆。";
  }
  return "已送出申請，等待主揪回覆。";
}

const SessionDetailSheet = forwardRef<SessionDetailCommands, SessionDetailSheetProps>(function SessionDetailSheet(
  { detail, handlers, snapshot: initialSnapshot },
  commandsRef
) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const actionsRef = useRef<HTMLDivElement>(null);
  const firstStageCommit = useRef(true);
  const stageRef = useRef(snapshot.stage);
  const submittingRef = useRef(false);

  const setStage = (stage: JoinStage, message = "", expectedAccepted?: boolean) => {
    stageRef.current = stage;
    setSnapshot((current) => ({
      ...current,
      actionGeneration: (current.actionGeneration ?? 0) + 1,
      expectedAccepted: expectedAccepted ?? current.expectedAccepted,
      message,
      stage,
    }));
  };

  const submitJoin = () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setStage("submitting");
    void Promise.resolve(handlers.onConfirmJoin())
      .then((result) => {
        if (result.joinSubmitted) setStage("success", joinSuccessMessage(result));
        else setStage("error", result.joinError || "申請失敗，請稍後再試。");
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "";
        setStage("error", message || "申請失敗，請稍後再試。");
      })
      .finally(() => {
        submittingRef.current = false;
      });
  };

  useImperativeHandle(commandsRef, () => ({
    enterConfirming(expectedAccepted) {
      setStage("confirming", "", expectedAccepted);
    },
    handleEscape() {
      if (stageRef.current !== "confirming") return false;
      setStage("idle");
      return true;
    },
    setJoinPreview(state) {
      setSnapshot((current) => ({
        ...current,
        joinPreview: {
          participants: Array.isArray(state?.participants) ? state.participants : [],
          status: state?.status ?? "loading",
        },
      }));
    },
  }));

  useLayoutEffect(() => {
    const container = actionsRef.current;
    if (!container) return;
    if (firstStageCommit.current) {
      firstStageCommit.current = false;
      if (snapshot.stage === "idle") return;
    }
    const preferred =
      snapshot.stage === "success" ? container.querySelector<HTMLElement>('[data-testid="join-success-title"]') : null;
    const primaryCta = container.querySelector<HTMLElement>(
      '[data-session-action="primary"]:not([disabled]):not([aria-disabled="true"])'
    );
    const target = preferred ?? primaryCta ?? container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? container;
    target.focus({ preventScroll: true });
  }, [snapshot.actionGeneration, snapshot.stage]);

  return (
    <Fragment>
      <DetailMain detail={detail} handlers={handlers} />
      {detail.showJoinPreview ? <JoinPreview state={snapshot.joinPreview} /> : null}
      <DetailTail action={detail.action} />
      <div ref={actionsRef} className="session-detail__actions" tabIndex={-1} data-join-stage={snapshot.stage}>
        <Fragment key={snapshot.actionGeneration}>
          <Actions
            detail={detail}
            handlers={handlers}
            setStage={setStage}
            snapshot={snapshot}
            submitJoin={submitJoin}
          />
        </Fragment>
      </div>
    </Fragment>
  );
});

/** Mount React into mountSheet's existing content slot and expose synchronous state pushes. */
export function mountSessionDetailSheetContent(
  rootElement: HTMLElement,
  detail: SessionDetailContentOptions,
  initialSnapshot: SessionDetailSnapshot,
  handlers: Omit<SessionDetailHandlers, "rootElement">
): SessionDetailContentContract {
  const surfaceContent = mountSurfaceContent(rootElement);
  const commands = { current: null as SessionDetailCommands | null };
  const snapshot = { ...initialSnapshot, actionGeneration: initialSnapshot.actionGeneration ?? 0 };

  const commit = () => {
    if (!surfaceContent.isSurfaceRootLive()) return;
    surfaceContent.render(
      <AppErrorBoundary resetKey={snapshot.actionGeneration} rootElement={rootElement} surface="session-detail-sheet">
        <SessionDetailSheet
          ref={commands}
          detail={detail}
          handlers={{ ...handlers, rootElement }}
          snapshot={snapshot}
        />
      </AppErrorBoundary>
    );
  };

  commit();
  return {
    enterConfirming(expectedAccepted) {
      surfaceContent.commit(() => commands.current?.enterConfirming(expectedAccepted));
    },
    handleEscape() {
      let handled = false;
      surfaceContent.commit(() => {
        handled = commands.current?.handleEscape() ?? false;
      });
      return handled;
    },
    isSurfaceRootLive: surfaceContent.isSurfaceRootLive,
    setJoinPreview(state) {
      surfaceContent.commit(() => commands.current?.setJoinPreview(state));
    },
    unmount: surfaceContent.unmount,
  };
}
