import { Fragment } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

import { AppErrorBoundary } from "../components/AppErrorBoundary.tsx";
import type { CourtSummary, MySessionSummary, SessionSummary } from "../domainTypes.ts";
import { formatNtrp } from "../profile.js";
import { isUndecidedCandidate } from "../sessionCriteria.js";
import { mySessionsPageRuntime } from "../sessionViews.js";

type Identifier = number | string | null | undefined;
type CallbackResult = unknown | Promise<unknown>;
type MySessionsSegment = "hosted" | "joined";

interface MySessionsSession extends Partial<MySessionSummary>, Partial<Pick<SessionSummary, "candidateCourtIds">> {}

interface MySessionsParticipant {
  homeCourts?: string[];
  nickname?: string;
  ntrp?: number | null;
  participantId?: Identifier;
  playTypes?: string[];
  profileId?: Identifier;
}

interface MySessionsActionEntry {
  kind?: string;
  participant?: MySessionsParticipant;
  session: MySessionsSession;
}

interface MySessionsGroups {
  history?: MySessionsSession[] | null;
  needsAction?: MySessionsActionEntry[] | null;
  needsActionCount?: number;
  upcoming?: MySessionsSession[] | null;
}

interface NotificationSettingsInput {
  courtIds?: Array<number | string>;
  errorMessage?: string;
  prefs?: Record<string, boolean>;
  pushStatus?: string;
  webPushConfigured?: boolean;
}

export interface MySessionsPageOptions {
  actionScopeKey?: unknown;
  authenticated?: boolean;
  courts?: CourtSummary[] | null;
  createdSessionId?: Identifier;
  errorMessage?: string;
  groups?: MySessionsGroups | null;
  highlightSessionId?: Identifier;
  notificationSettings?: NotificationSettingsInput | null;
  onAccept?: (sessionId?: string, participantId?: string) => CallbackResult;
  onAcceptInvite?: (sessionId?: string) => CallbackResult;
  onBack?: () => CallbackResult;
  onCancel?: (sessionId?: string) => CallbackResult;
  onConfirmAttendance?: (sessionId?: string) => CallbackResult;
  onCreatedSessionFocus?: () => boolean;
  onCreateSession?: () => CallbackResult;
  onDecline?: (sessionId?: string, participantId?: string) => CallbackResult;
  onDeclineInvite?: (sessionId?: string) => CallbackResult;
  onDecide?: (sessionId?: string) => CallbackResult;
  onEdit?: (sessionId?: string) => CallbackResult;
  onEnablePush?: () => CallbackResult;
  onMarkPlayed?: (sessionId?: string) => CallbackResult;
  onOpenChat?: (sessionId?: string) => CallbackResult;
  onOpenSession?: (sessionId?: string) => CallbackResult;
  onRefresh?: () => CallbackResult;
  onReportParticipant?: (sessionId?: string, profileId?: string) => CallbackResult;
  onReportSession?: (sessionId?: string) => CallbackResult;
  onSignIn?: () => CallbackResult;
  onWithdraw?: (sessionId?: string) => CallbackResult;
  status?: string;
}

interface MySessionsPageProps extends MySessionsPageOptions {
  rootElement: HTMLElement;
}

interface ActionButtonProps {
  action: string;
  children: string;
  className?: string;
  participantId?: Identifier;
  profileId?: Identifier;
  sessionId: Identifier;
  testId?: string;
}

const EMPTY_GROUPS: MySessionsGroups = { history: [], needsAction: [], needsActionCount: 0, upcoming: [] };
const mountedRoots = new WeakMap<HTMLElement, { generation: number; reactRoot: Root }>();

function dataValue(value: Identifier): string {
  return String(value);
}

function ActionButton({
  action,
  children,
  className = "session-secondary",
  participantId,
  profileId,
  sessionId,
  testId,
}: ActionButtonProps) {
  return (
    <button
      type="button"
      className={className}
      data-my-action={action}
      data-session-id={dataValue(sessionId)}
      data-participant-id={participantId === undefined ? undefined : dataValue(participantId)}
      data-profile-id={profileId === undefined ? undefined : dataValue(profileId)}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

function TimeTile({ session, venue }: { session: MySessionsSession; venue: unknown }) {
  const presentation = mySessionsPageRuntime.sessionTimeTilePresentation(session, venue, { compact: true });
  return (
    <span className={presentation.className}>
      <span className="time-tile__start">{presentation.start}</span>
      <span className="time-tile__date">{presentation.date}</span>
    </span>
  );
}

function StatusChip({
  kind,
  segment,
  session,
}: {
  kind?: string | null;
  segment: MySessionsSegment;
  session: MySessionsSession;
}) {
  if (segment === "hosted") return <span className="my-status-chip my-status-chip--host">主揪</span>;
  if (kind === "invite") return <span className="my-status-chip my-status-chip--info">受邀中</span>;
  if (kind === "guest-request") return <span className="my-status-chip my-status-chip--info">待確認</span>;
  const participantStatus = String(session.viewerParticipantStatus ?? "").toLowerCase();
  if (participantStatus === "declined") {
    return <span className="my-status-chip my-status-chip--danger">已婉拒</span>;
  }
  if (participantStatus === "accepted" && ["open", "full"].includes(String(session.status ?? "").toLowerCase())) {
    return <span className="my-status-chip my-status-chip--success">已確認</span>;
  }
  return null;
}

function SessionBrief({
  courts,
  kind = null,
  segment,
  session,
}: {
  courts: CourtSummary[] | null;
  kind?: string | null;
  segment: MySessionsSegment;
  session: MySessionsSession;
}) {
  const venue = mySessionsPageRuntime.sessionVenuePresentation(session, courts ?? []);
  const courtLabel = mySessionsPageRuntime.sessionCourtLabel(session, venue);
  const meta = `${session.playType} · ${mySessionsPageRuntime.ntrpRange(session)} · ${mySessionsPageRuntime.sessionHostLabel(session)}`;
  return (
    <div className="my-session-brief">
      <TimeTile session={session} venue={venue} />
      <div className="my-session-brief__body">
        <p className="my-session-brief__court">{courtLabel}</p>
        <p className="my-session-brief__meta">{meta}</p>
      </div>
      <StatusChip kind={kind} segment={segment} session={session} />
    </div>
  );
}

function ChatButton({ session }: { session: MySessionsSession }) {
  const sessionId = dataValue(session.sessionId);
  const unreadCount = Math.max(0, Number(session.unreadMessageCount) || 0);
  const label = unreadCount > 0 ? `群組聊天（${unreadCount}）` : "群組聊天";
  return (
    <button
      type="button"
      className="session-primary"
      data-open-chat=""
      data-session-id={sessionId}
      data-testid={`open-chat-${sessionId}`}
      aria-label={unreadCount > 0 ? `群組聊天，${unreadCount} 則未讀訊息` : undefined}
    >
      {label}
    </button>
  );
}

function SessionCard({
  courts,
  highlightSessionId,
  segment,
  session,
}: {
  courts: CourtSummary[] | null;
  highlightSessionId: Identifier;
  segment: MySessionsSegment;
  session: MySessionsSession;
}) {
  const sessionId = dataValue(session.sessionId);
  const hostCanManage = String(session.viewerRole) === "host" && Boolean(session.canCancel);
  const canChat = String(session.viewerParticipantStatus).toLowerCase() === "accepted";
  const highlighted = String(session.sessionId) === String(highlightSessionId);
  return (
    <article className="my-session-card" data-created-session={highlighted ? "true" : undefined}>
      <SessionBrief courts={courts} segment={segment} session={session} />
      <div className="my-session-card__actions">
        <button type="button" className="session-secondary" data-open-my-session="" data-session-id={sessionId}>
          查看球局
        </button>
        {canChat ? <ChatButton session={session} /> : null}
        {hostCanManage && isUndecidedCandidate(session) ? (
          <ActionButton action="decide" sessionId={session.sessionId}>
            定案場地與時間
          </ActionButton>
        ) : null}
        {hostCanManage && ["booked", "walk_on"].includes(String(session.venueType)) ? (
          <ActionButton action="edit" sessionId={session.sessionId}>
            編輯球局
          </ActionButton>
        ) : null}
        {session.canCancel ? (
          <ActionButton action="cancel" sessionId={session.sessionId}>
            取消球局
          </ActionButton>
        ) : null}
        {session.canWithdraw ? (
          <ActionButton action="withdraw" sessionId={session.sessionId}>
            取消參加
          </ActionButton>
        ) : null}
        {session.canConfirmPlayed ? (
          <ActionButton action="played" sessionId={session.sessionId}>
            回報打成
          </ActionButton>
        ) : null}
        {session.canConfirmAttendance && !session.viewerPlayedConfirmed ? (
          <ActionButton action="attendance" sessionId={session.sessionId}>
            確認到場
          </ActionButton>
        ) : null}
        <ActionButton
          action="report-session"
          className="session-tertiary"
          sessionId={session.sessionId}
          testId={`report-session-${sessionId}`}
        >
          檢舉此球局
        </ActionButton>
      </div>
    </article>
  );
}

function HostRequestCard({ entry, courts }: { entry: MySessionsActionEntry; courts: CourtSummary[] | null }) {
  const participant = entry.participant ?? {};
  const participantId = dataValue(participant.participantId);
  const profileId = dataValue(participant.profileId);
  return (
    <article className="my-action-card" data-testid="participant-row" data-participant-id={participantId}>
      <p className="my-action-card__eyebrow">新申請</p>
      <SessionBrief courts={courts} kind="host-request" segment="hosted" session={entry.session} />
      <h3>
        {String(participant.nickname)} · {formatNtrp(participant.ntrp)}
      </h3>
      <p>
        {(participant.playTypes ?? []).join("、") || "尚未填寫打法"} ·{" "}
        {(participant.homeCourts ?? []).join("、") || "尚未填寫常打球場"}
      </p>
      <div className="my-session-card__actions">
        <ActionButton
          action="accept"
          className="session-primary"
          participantId={participant.participantId}
          sessionId={entry.session.sessionId}
          testId={`accept-participant-${participantId}`}
        >
          接受
        </ActionButton>
        <ActionButton
          action="decline"
          participantId={participant.participantId}
          sessionId={entry.session.sessionId}
          testId={`decline-participant-${participantId}`}
        >
          婉拒
        </ActionButton>
        <ActionButton
          action="report-participant"
          className="session-tertiary"
          profileId={participant.profileId}
          sessionId={entry.session.sessionId}
          testId={`report-participant-${profileId}`}
        >
          檢舉這位申請者
        </ActionButton>
      </div>
    </article>
  );
}

function InviteCard({ entry, courts }: { entry: MySessionsActionEntry; courts: CourtSummary[] | null }) {
  const session = entry.session;
  const sessionId = dataValue(session.sessionId);
  return (
    <article className="my-action-card" data-testid="invite-row" data-session-id={sessionId}>
      <p className="my-action-card__eyebrow">邀請你加入</p>
      <SessionBrief courts={courts} kind="invite" segment="joined" session={session} />
      <p>
        {mySessionsPageRuntime.vacancyLabel(session)}
        {session.notes ? ` · ${session.notes}` : null}
      </p>
      <div className="my-session-card__actions">
        <ActionButton
          action="accept-invite"
          className="session-primary"
          sessionId={session.sessionId}
          testId={`accept-invite-${sessionId}`}
        >
          接受邀請
        </ActionButton>
        <ActionButton action="decline-invite" sessionId={session.sessionId} testId={`decline-invite-${sessionId}`}>
          婉拒
        </ActionButton>
        <ActionButton action="report-session" className="session-tertiary" sessionId={session.sessionId}>
          檢舉此球局
        </ActionButton>
      </div>
    </article>
  );
}

function GuestRequestCard({
  courts,
  entry,
  highlightSessionId,
}: {
  courts: CourtSummary[] | null;
  entry: MySessionsActionEntry;
  highlightSessionId: Identifier;
}) {
  const session = entry.session;
  const highlighted = String(session.sessionId) === String(highlightSessionId);
  return (
    <article
      className="my-action-card"
      data-guest-request-session={dataValue(session.sessionId)}
      data-created-session={highlighted ? "true" : undefined}
    >
      <p className="my-action-card__eyebrow">等待主揪回覆</p>
      <SessionBrief courts={courts} kind="guest-request" segment="joined" session={session} />
      <p>你的申請已送出，主揪回覆前可自行撤回。</p>
      <div className="my-session-card__actions">
        <ActionButton action="withdraw" sessionId={session.sessionId}>
          撤回申請
        </ActionButton>
      </div>
    </article>
  );
}

function SegmentedControl({
  activeSegment,
  hostedCount,
  joinedCount,
}: {
  activeSegment: MySessionsSegment;
  hostedCount: number;
  joinedCount: number;
}) {
  const joinedActive = activeSegment !== "hosted";
  return (
    <div className="my-sessions-v2__segmented" role="group" aria-label="我的球局分頁">
      <button
        type="button"
        className={`my-sessions-v2__seg-btn${joinedActive ? " is-active" : ""}`}
        data-my-sessions-seg="joined"
        data-testid="my-sessions-seg-joined"
        aria-pressed={joinedActive ? "true" : "false"}
      >
        我報名的 <span className="my-sessions-v2__seg-count">{joinedCount}</span>
      </button>
      <button
        type="button"
        className={`my-sessions-v2__seg-btn${joinedActive ? "" : " is-active"}`}
        data-my-sessions-seg="hosted"
        data-testid="my-sessions-seg-hosted"
        aria-pressed={joinedActive ? "false" : "true"}
      >
        我主揪的 <span className="my-sessions-v2__seg-count">{hostedCount}</span>
      </button>
    </div>
  );
}

function EmptyState({ segment }: { segment: MySessionsSegment }) {
  const hosted = segment === "hosted";
  return (
    <div className="my-sessions-v2__empty" data-my-sessions-empty="">
      <p className="my-sessions-v2__empty-text">
        {hosted ? "還沒主揪過球局。開一場，讓球友來找你。" : "還沒報名任何球局。到地圖上找一場程度相近的吧。"}
      </p>
      {hosted ? (
        <button type="button" className="session-primary my-sessions-v2__empty-btn" data-my-sessions-empty-create="">
          開球局
        </button>
      ) : (
        <button type="button" className="session-primary my-sessions-v2__empty-btn" data-my-sessions-empty-map="">
          去逛地圖
        </button>
      )}
    </div>
  );
}

function NeedsActionSection({
  courts,
  entries,
  focusSessionId,
  showChrome,
}: {
  courts: CourtSummary[] | null;
  entries: MySessionsActionEntry[];
  focusSessionId: Identifier;
  showChrome: boolean;
}) {
  if (!showChrome) return <div id="my-needs-action" className="my-sessions-list" />;
  return (
    <section className="my-sessions-section" aria-labelledby="my-needs-action-title">
      <div className="my-sessions-section__head">
        <h2 id="my-needs-action-title">需要你處理</h2>
        <span>{entries.length} 項</span>
      </div>
      <div id="my-needs-action" className="my-sessions-list">
        {entries.length ? (
          entries.map((entry, index) => {
            const key = `${entry.kind}:${dataValue(entry.session.sessionId)}:${dataValue(entry.participant?.participantId)}:${index}`;
            if (entry.kind === "host-request") return <HostRequestCard courts={courts} entry={entry} key={key} />;
            if (entry.kind === "invite") return <InviteCard courts={courts} entry={entry} key={key} />;
            return <GuestRequestCard courts={courts} entry={entry} highlightSessionId={focusSessionId} key={key} />;
          })
        ) : (
          <p className="surface__copy">目前沒有需要立即處理的事項。</p>
        )}
      </div>
    </section>
  );
}

function UpcomingSection({
  courts,
  focusSessionId,
  segment,
  sessions,
  showChrome,
}: {
  courts: CourtSummary[] | null;
  focusSessionId: Identifier;
  segment: MySessionsSegment;
  sessions: MySessionsSession[];
  showChrome: boolean;
}) {
  if (!showChrome) return <div id="my-upcoming-sessions" className="my-sessions-list" />;
  return (
    <section className="my-sessions-section" aria-labelledby="my-upcoming-sessions-title">
      <div className="my-sessions-section__head">
        <h2 id="my-upcoming-sessions-title">即將打球</h2>
        <span>{sessions.length} 場</span>
      </div>
      <div id="my-upcoming-sessions" className="my-sessions-list">
        {sessions.length ? (
          sessions.map((session, index) => (
            <SessionCard
              courts={courts}
              highlightSessionId={focusSessionId}
              key={`${dataValue(session.sessionId)}:${index}`}
              segment={segment}
              session={session}
            />
          ))
        ) : (
          <p className="surface__copy">目前沒有即將打球的球局。</p>
        )}
      </div>
    </section>
  );
}

function HistorySection({
  courts,
  focusSessionId,
  segment,
  sessions,
  showChrome,
}: {
  courts: CourtSummary[] | null;
  focusSessionId: Identifier;
  segment: MySessionsSegment;
  sessions: MySessionsSession[];
  showChrome: boolean;
}) {
  if (!sessions.length && !showChrome) return <div id="my-history" className="my-sessions-list" />;
  return (
    <section className="my-sessions-section" aria-labelledby="my-history-title">
      <div className="my-sessions-section__head">
        <h2 id="my-history-title">過去紀錄</h2>
        <span>{sessions.length} 場</span>
      </div>
      <div id="my-history" className="my-sessions-list">
        {sessions.length ? (
          sessions.map((session, index) => (
            <Fragment key={`${dataValue(session.sessionId)}:${index}`}>
              <SessionCard courts={courts} highlightSessionId={focusSessionId} segment={segment} session={session} />
              <p className="my-history-reason">{mySessionsPageRuntime.mySessionReason(session)}</p>
            </Fragment>
          ))
        ) : (
          <p className="surface__copy">尚無過去紀錄。</p>
        )}
      </div>
    </section>
  );
}

function SuccessPushPrompt({ settings }: { settings: NotificationSettingsInput | null }) {
  const presentation = mySessionsPageRuntime.successPushPromptPresentation(settings ?? {}, {
    message: "開啟推播，才不會錯過球友的新申請與球局變更。",
    testId: "created-session-enable-push",
  });
  if (!presentation) return null;
  return (
    <section className="success-push-prompt" data-success-push-prompt="">
      <p>{presentation.message}</p>
      <button type="button" className="session-secondary" data-success-enable-push="" data-testid={presentation.testId}>
        開啟推播
      </button>
      <p className="form-hint">{presentation.iosHint}</p>
      <p className="form-error" data-success-push-error="" role="alert" tabIndex={-1} hidden />
    </section>
  );
}

export function MySessionsPage({
  authenticated = false,
  courts = [],
  createdSessionId = null,
  errorMessage = "",
  groups = EMPTY_GROUPS,
  highlightSessionId = null,
  notificationSettings = {},
  rootElement,
  status = "idle",
}: MySessionsPageProps) {
  const safeGroups = groups ?? EMPTY_GROUPS;
  const focusSessionId = highlightSessionId ?? createdSessionId;
  const activeSegment = mySessionsPageRuntime.resolveMySessionsSegment(
    rootElement,
    safeGroups,
    focusSessionId
  ) as MySessionsSegment;
  const split = mySessionsPageRuntime.mySessionsSplitBySegment(safeGroups);
  const joinedCount = split.joined.needsAction.length + split.joined.upcoming.length;
  const hostedCount = split.hosted.needsAction.length + split.hosted.upcoming.length;
  const active = activeSegment === "hosted" ? split.hosted : split.joined;
  const activeNonHistoryCount = active.needsAction.length + active.upcoming.length;
  const showEmptyState = authenticated && activeNonHistoryCount === 0;

  return (
    <>
      <div className="my-sessions-v2__head">
        <p className="my-sessions-v2__eyebrow">MY MATCHES</p>
        <div className="my-sessions-v2__head-row">
          <h1 tabIndex={-1} data-my-sessions-heading="" className="my-sessions-v2__title">
            我的球局
          </h1>
          <div className="my-sessions-v2__tools">
            <button type="button" id="my-sessions-refresh" className="session-secondary my-sessions-v2__tool-btn">
              重新整理
            </button>
            <button type="button" className="session-secondary my-sessions-v2__tool-btn" data-my-sessions-back="">
              回到地圖
            </button>
          </div>
        </div>
        <SegmentedControl activeSegment={activeSegment} hostedCount={hostedCount} joinedCount={joinedCount} />
      </div>
      <p className="surface__copy">
        {createdSessionId ? "球局已建立；主揪身分已加入這一局。" : "依目前需要處理的事項與球局時間排序。"}
      </p>
      {createdSessionId ? <SuccessPushPrompt settings={notificationSettings} /> : null}
      <p
        className="my-sessions-message"
        data-my-sessions-status=""
        role="status"
        aria-live="polite"
        hidden={status !== "loading"}
      >
        正在更新我的球局…
      </p>
      <p className="form-error" data-my-sessions-error="" role="alert" tabIndex={-1} hidden={!errorMessage}>
        {errorMessage}
      </p>
      {authenticated ? null : (
        <section className="my-sessions-empty" aria-label="登入後查看我的球局">
          <h2>登入後查看與管理你的球局</h2>
          <p className="surface__copy">你可以在這裡處理申請、進入球局群組聊天，以及保留過去紀錄。</p>
          <button type="button" className="session-primary" data-my-sessions-sign-in="">
            登入
          </button>
        </section>
      )}
      <NeedsActionSection
        courts={courts}
        entries={active.needsAction}
        focusSessionId={focusSessionId}
        showChrome={!showEmptyState}
      />
      <UpcomingSection
        courts={courts}
        focusSessionId={focusSessionId}
        segment={activeSegment}
        sessions={active.upcoming}
        showChrome={!showEmptyState}
      />
      {showEmptyState ? <EmptyState segment={activeSegment} /> : null}
      <HistorySection
        courts={courts}
        focusSessionId={focusSessionId}
        segment={activeSegment}
        sessions={active.history}
        showChrome={!showEmptyState}
      />
    </>
  );
}

/** One React root per legacy mount; each generation preserves the old full-subtree replacement contract. */
export function mountMySessionsPage(rootElement: HTMLElement, options: MySessionsPageOptions = {}): void {
  let mounted = mountedRoots.get(rootElement);
  if (!mounted) {
    mounted = { generation: 0, reactRoot: createRoot(rootElement) };
    mountedRoots.set(rootElement, mounted);
  }
  mounted.generation += 1;
  const generation = mounted.generation;
  flushSync(() => {
    mounted.reactRoot.render(
      <AppErrorBoundary resetKey={generation} surface="my-sessions-page">
        <MySessionsPage {...options} key={generation} rootElement={rootElement} />
      </AppErrorBoundary>
    );
  });
}
