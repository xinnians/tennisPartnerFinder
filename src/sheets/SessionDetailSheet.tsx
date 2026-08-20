import { Fragment, memo } from "react";
import { flushSync } from "react-dom";

import { AppErrorBoundary } from "../components/AppErrorBoundary.tsx";
import { Avatar } from "../components/Avatar.tsx";
import type { CourtSummary, SessionJoinPreviewState, SessionSummary } from "../domainTypes.ts";
import { formatNtrp } from "../profile.js";
import { sessionDetailSheetRuntime } from "../sessionViews.js";
import { createSurfaceRoot, type SurfaceContentLifecycle } from "./surfaceRoot.ts";

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
  snapshot: SessionDetailSnapshot;
}

export interface SessionDetailContentContract extends SurfaceContentLifecycle {
  renderStage(stage: JoinStage, message?: string, expectedAccepted?: boolean): void;
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

function CopyLinkButton() {
  return (
    <button type="button" className="session-secondary cta-copy-link" data-session-action="copy-link">
      複製連結
    </button>
  );
}

function EditButton({ canEdit }: { canEdit: boolean }) {
  return canEdit ? (
    <button type="button" className="session-secondary" data-session-action="edit">
      編輯球局
    </button>
  ) : null;
}

function ExtraChatButton({ canChat, kind }: { canChat: boolean; kind?: string }) {
  return canChat && kind !== "chat" ? (
    <button type="button" className="session-primary" data-session-action="chat">
      群組聊天
    </button>
  ) : null;
}

function ReportButton({ canReport }: { canReport: boolean }) {
  return canReport ? (
    <button type="button" className="session-tertiary" data-session-action="report">
      檢舉此球局
    </button>
  ) : null;
}

function TextAction({ action, label }: { action: string; label: string }) {
  return (
    <button type="button" className="cta-text-action" data-session-action={action}>
      {label}
    </button>
  );
}

function IdleActions({ detail }: { detail: SessionDetailContentOptions }) {
  const { action, canChat, canEdit, canReport, isMine } = detail;
  const currentAction = action ?? {};
  const kind = currentAction.kind;
  const commonButtons = (
    <Fragment>
      <CopyLinkButton />
      <EditButton canEdit={canEdit} />
    </Fragment>
  );

  if (kind === "join") {
    const instant = Boolean(currentAction.expectedAccepted);
    return (
      <Fragment>
        <div className="cta-row">
          {commonButtons}
          <ExtraChatButton canChat={canChat} kind={kind} />
          <button
            type="button"
            className={`session-primary${instant ? " session-primary--instant" : ""}`}
            data-session-action="primary"
            disabled={Boolean(currentAction.disabled)}
          >
            {currentAction.label ?? "申請加入"}
          </button>
        </div>
        {currentAction.secondaryLabel ? <TextAction action="secondary" label={currentAction.secondaryLabel} /> : null}
        <ReportButton canReport={canReport} />
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
        <TextAction action="secondary" label="取消申請" />
        <ReportButton canReport={canReport} />
      </Fragment>
    );
  }

  if (kind === "chat") {
    if (isMine) {
      return (
        <Fragment>
          <div className="cta-row">
            {commonButtons}
            <button type="button" className="session-primary" data-session-action="primary">
              {currentAction.label ?? "群組聊天"}
            </button>
          </div>
          <ReportButton canReport={canReport} />
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
          <button type="button" className="session-primary" data-session-action="primary">
            {currentAction.label ?? "群組聊天"}
          </button>
        </div>
        <TextAction action="secondary" label="取消報名" />
        <ReportButton canReport={canReport} />
      </Fragment>
    );
  }

  if (kind === "full" || kind === "terminal") {
    return (
      <Fragment>
        <div className="cta-row">
          {commonButtons}
          <ExtraChatButton canChat={canChat} kind={kind} />
          <button type="button" className="cta-status cta-status--disabled" data-session-action="primary" disabled>
            {currentAction.label ?? ""}
          </button>
        </div>
        <ReportButton canReport={canReport} />
      </Fragment>
    );
  }

  return (
    <Fragment>
      <div className="cta-row">
        {commonButtons}
        <ExtraChatButton canChat={canChat} kind={kind} />
        <button
          type="button"
          className="session-primary"
          data-session-action="primary"
          disabled={Boolean(action?.disabled)}
        >
          {action?.label ?? "申請加入"}
        </button>
      </div>
      {action?.secondaryLabel ? <TextAction action="secondary" label={action.secondaryLabel} /> : null}
      <ReportButton canReport={canReport} />
    </Fragment>
  );
}

function SuccessPushPrompt({ notificationSettings }: { notificationSettings: NotificationSettingsInput }) {
  const prompt = sessionDetailSheetRuntime.successPushPromptPresentation(notificationSettings, {
    message: "開啟推播，才不會錯過主揪的審核結果與球局變更。",
    testId: "join-success-enable-push",
  });
  if (!prompt) return null;
  return (
    <section className="success-push-prompt" data-success-push-prompt="">
      <p>{prompt.message}</p>
      <button type="button" className="session-secondary" data-success-enable-push="" data-testid={prompt.testId}>
        開啟推播
      </button>
      <p className="form-hint">{prompt.iosHint}</p>
      <p className="form-error" data-success-push-error="" role="alert" tabIndex={-1} hidden />
    </section>
  );
}

function Actions({ detail, snapshot }: SessionDetailSheetProps) {
  if (snapshot.stage === "idle") return <IdleActions detail={detail} />;
  if (snapshot.stage === "confirming" || snapshot.stage === "submitting") {
    const submitting = snapshot.stage === "submitting";
    return (
      <Fragment>
        <p className="form-hint" data-testid="join-confirm-hint">
          {sessionDetailSheetRuntime.joinConfirmHintText(snapshot.expectedAccepted)}
        </p>
        <button type="button" className="session-secondary" data-testid="join-cancel" disabled={submitting}>
          取消
        </button>
        <button type="button" className="session-primary" data-testid="join-confirm" disabled={submitting}>
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
        <SuccessPushPrompt notificationSettings={detail.notificationSettings} />
        <button type="button" className="session-primary" data-testid="join-open-my-sessions">
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
      <button type="button" className="session-primary" data-testid="join-retry">
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

const DetailMain = memo(function DetailMain({ detail }: { detail: SessionDetailContentOptions }) {
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
        <button type="button" className="session-detail__close" data-surface-close="" aria-label="關閉球局詳情">
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
              <button type="button" className="candidate-decide-panel__cta" data-session-action="decide">
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

function SessionDetailSheet({ detail, snapshot }: SessionDetailSheetProps) {
  return (
    <Fragment>
      <DetailMain detail={detail} />
      {detail.showJoinPreview ? <JoinPreview state={snapshot.joinPreview} /> : null}
      <DetailTail action={detail.action} />
      <div className="session-detail__actions" tabIndex={-1} data-join-stage={snapshot.stage}>
        <Fragment key={snapshot.actionGeneration}>
          <Actions detail={detail} snapshot={snapshot} />
        </Fragment>
      </div>
    </Fragment>
  );
}

/** Mount React into mountSheet's existing content slot and expose synchronous state pushes. */
export function mountSessionDetailSheetContent(
  rootElement: HTMLElement,
  detail: SessionDetailContentOptions,
  initialSnapshot: SessionDetailSnapshot
): SessionDetailContentContract {
  const reactRoot = createSurfaceRoot(rootElement);
  let snapshot = { ...initialSnapshot, actionGeneration: initialSnapshot.actionGeneration ?? 0 };

  const commit = () => {
    if (!reactRoot.isSurfaceRootLive()) return;
    flushSync(() =>
      reactRoot.render(
        <AppErrorBoundary resetKey={snapshot.actionGeneration} rootElement={rootElement} surface="session-detail-sheet">
          <SessionDetailSheet detail={detail} snapshot={snapshot} />
        </AppErrorBoundary>
      )
    );
  };

  commit();
  return {
    isSurfaceRootLive: reactRoot.isSurfaceRootLive,
    renderStage(stage, message = "", expectedAccepted = snapshot.expectedAccepted) {
      snapshot = {
        ...snapshot,
        actionGeneration: (snapshot.actionGeneration ?? 0) + 1,
        expectedAccepted,
        message,
        stage,
      };
      commit();
    },
    setJoinPreview(state) {
      snapshot = {
        ...snapshot,
        joinPreview: {
          participants: Array.isArray(state?.participants) ? state.participants : [],
          status: state?.status ?? "loading",
        },
      };
      commit();
    },
    unmount: reactRoot.unmount,
  };
}
