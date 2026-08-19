import type { ChangeEvent, MouseEvent } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

import { Avatar } from "../components/Avatar.tsx";
import type { CourtSummary, NotificationPreferences, Profile } from "../domainTypes.ts";
import { mePageRuntime } from "../sessionViews.js";

interface AuthSession {
  user?: {
    id?: string | null;
  };
}

interface MeProfile extends Omit<Partial<Profile>, "courts" | "slots"> {
  courts?: Set<string> | string[];
  slots?: Set<string> | string[];
}

interface MeCourt extends CourtSummary {
  city?: string;
  district?: string;
  isActive?: boolean;
}

interface BlockedPlayer {
  blockedNickname?: string;
  blockedProfileId?: number | string | null;
  createdAt?: string;
}

interface NotificationSettingsInput {
  courtIds?: Array<number | string>;
  errorMessage?: string;
  prefs?: Partial<NotificationPreferences>;
  pushStatus?: string;
  webPushConfigured?: boolean;
}

interface PresenceSettingsInput {
  locationStatus?: string;
  openToGreeting?: boolean;
  sharePresence?: boolean;
}

type CallbackResult = unknown | Promise<unknown>;

export interface MePageOptions {
  authSession?: AuthSession | null;
  profile?: MeProfile | null;
  avatarUrl?: string;
  blockedPlayers?: BlockedPlayer[] | null;
  blockedPlayersError?: string;
  blockedPlayersStatus?: string;
  courts?: MeCourt[] | null;
  lineProviderId?: string;
  linkedProviders?: string[] | null;
  notificationSettings?: NotificationSettingsInput | null;
  onEditProfile?: () => CallbackResult;
  onEnablePush?: () => CallbackResult;
  onLinkProvider?: (provider: string) => CallbackResult;
  onSaveCourtSubscriptions?: (courtIds: number[]) => CallbackResult;
  onSaveNotificationPreferences?: (preferences: NotificationPreferences) => CallbackResult;
  onSetOpenToGreeting?: (enabled: boolean) => CallbackResult;
  onSetPresenceSharing?: (enabled: boolean) => CallbackResult;
  onSignIn?: () => CallbackResult;
  onSignOut?: () => CallbackResult;
  onTogglePlayerVisibility?: () => CallbackResult;
  onUnblockPlayer?: (profileId: string) => CallbackResult;
  playerVisibility?: boolean;
  presence?: PresenceSettingsInput | null;
  supportHref?: string;
}

interface MePageProps {
  rootElement: HTMLElement;
  authSession: AuthSession | null;
  profile: MeProfile | null;
  avatarUrl: string;
  blockedPlayers: BlockedPlayer[] | null;
  blockedPlayersError: string;
  blockedPlayersStatus: string;
  courts: MeCourt[] | null;
  lineProviderId: string;
  linkedProviders: string[] | null;
  notificationSettings: NotificationSettingsInput | null;
  onEditProfile: () => CallbackResult;
  onEnablePush: () => CallbackResult;
  onLinkProvider: (provider: string) => CallbackResult;
  onSaveCourtSubscriptions: (courtIds: number[]) => CallbackResult;
  onSaveNotificationPreferences: (preferences: NotificationPreferences) => CallbackResult;
  onSetOpenToGreeting: (enabled: boolean) => CallbackResult;
  onSetPresenceSharing: (enabled: boolean) => CallbackResult;
  onSignIn: () => CallbackResult;
  onSignOut: () => CallbackResult;
  onTogglePlayerVisibility: () => CallbackResult;
  onUnblockPlayer: (profileId: string) => CallbackResult;
  playerVisibility: boolean;
  presence: PresenceSettingsInput | null;
  supportHref: string;
}

type NormalizedNotification = ReturnType<typeof mePageRuntime.normalizedNotificationSettings>;
type NormalizedPresence = ReturnType<typeof mePageRuntime.normalizedPresenceSettings>;

const NOTIFICATION_PREFERENCES: Array<{
  key: keyof NotificationPreferences;
  label: string;
  testId: string;
}> = [
  { key: "hostNewRequestEnabled", label: "有人申請我的球局", testId: "notification-host-new-request" },
  {
    key: "guestRequestReviewedEnabled",
    label: "加入申請被處理",
    testId: "notification-guest-request-reviewed",
  },
  { key: "guestInvitedEnabled", label: "收到球局邀請", testId: "notification-guest-invited" },
  { key: "sessionUpdatedEnabled", label: "球局資訊變更", testId: "notification-session-updated" },
  { key: "chatMessageEnabled", label: "群組有新訊息", testId: "notification-chat-message" },
  { key: "sessionReminderEnabled", label: "開打前提醒", testId: "notification-session-reminder" },
];

const mountedRoots = new WeakMap<HTMLElement, { generation: number; reactRoot: Root }>();

function noop() {}

function NtrpBrick({ ntrp }: { ntrp: number | null | undefined }) {
  return (
    <div className="ntrp-brick">
      <p className="ntrp-brick__eyebrow">NTRP</p>
      <p className="ntrp-brick__value">{mePageRuntime.ntrpBrickValue(ntrp)}</p>
    </div>
  );
}

function AuthenticatedIdentity({
  avatarUrl,
  courts,
  nickname,
  onEditProfile,
  profile,
}: {
  avatarUrl: string;
  courts: MeCourt[] | null;
  nickname: string;
  onEditProfile: () => CallbackResult;
  profile: MeProfile | null;
}) {
  const profileCourtsText = mePageRuntime.profileCourtNames(profile, courts).join("、") || "未填球場";
  const slots = profile?.slots instanceof Set ? [...profile.slots] : [...(profile?.slots ?? [])];
  const profileSlotsText = mePageRuntime.playerSlotLabels(slots).join("、") || "未填時段";
  return (
    <>
      <section className="me-identity-card" data-testid="me-identity-card" aria-label="目前登入身分">
        <button
          type="button"
          className="profile-brick-row"
          data-testid="me-profile-edit-trigger"
          aria-label={`編輯個人檔案：${nickname}`}
          onClick={onEditProfile}
        >
          <Avatar avatarUrl={avatarUrl} nickname={nickname} size="lg" />
          <span className="profile-brick-row__copy">
            <strong>{nickname}</strong>
            <span>
              常打 {profileCourtsText} · {profileSlotsText}
            </span>
          </span>
          <NtrpBrick ntrp={profile?.ntrp} />
        </button>
      </section>
      <section className="me-edit-profile" aria-label="個人檔案">
        <div>
          <h2>個人檔案</h2>
          <p className="form-hint">暱稱、NTRP 與常打球場；暱稱與 NTRP 會出現在你建立或加入的球局。</p>
        </div>
        <button type="button" className="session-secondary" data-testid="edit-profile" onClick={onEditProfile}>
          編輯
        </button>
      </section>
    </>
  );
}

function SignInCard({ onSignIn }: { onSignIn: () => CallbackResult }) {
  return (
    <section className="me-sign-in-card" aria-label="登入">
      <h2>登入後查看你的身分</h2>
      <p className="surface__copy">登入後可管理球局與個人資料。</p>
      <button type="button" className="session-primary" data-testid="me-sign-in" onClick={onSignIn}>
        登入
      </button>
    </section>
  );
}

function PlayerVisibility({
  onTogglePlayerVisibility,
  playerVisibility,
  rootElement,
}: {
  onTogglePlayerVisibility: () => CallbackResult;
  playerVisibility: boolean;
  rootElement: HTMLElement;
}) {
  const stateLabel = playerVisibility ? "已開啟" : "已關閉";
  return (
    <section className="player-visibility" aria-label="球友卡">
      <div>
        <h2>球友卡</h2>
        <p className="form-hint" id="player-visibility-hint">
          開啟後，你會出現在球友名單，主揪可以邀你加入球局；關閉後立即從名單移除。個人聯絡資訊不會顯示。
        </p>
      </div>
      <button
        type="button"
        className="session-secondary"
        data-my-action="toggle-visibility"
        role="switch"
        aria-checked={playerVisibility ? "true" : "false"}
        aria-label={`球友卡：${stateLabel}`}
        aria-describedby="player-visibility-hint"
        data-testid="player-visibility-toggle"
        onClick={(event) =>
          mePageRuntime.runMySessionAction(event.currentTarget, onTogglePlayerVisibility, rootElement)
        }
      >
        {stateLabel}
      </button>
    </section>
  );
}

function PresenceSettings({
  onSetOpenToGreeting,
  onSetPresenceSharing,
  presence,
  rootElement,
}: {
  onSetOpenToGreeting: (enabled: boolean) => CallbackResult;
  onSetPresenceSharing: (enabled: boolean) => CallbackResult;
  presence: NormalizedPresence;
  rootElement: HTMLElement;
}) {
  const sharingLabel = presence.sharePresence ? "已開啟" : "已關閉";
  const handleGreetingChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const previousChecked = !input.checked;
    void mePageRuntime
      .runPresenceSettingAction(rootElement, () => onSetOpenToGreeting(input.checked))
      .then((saved) => {
        if (!saved) input.checked = previousChecked;
      });
  };
  return (
    <section className="presence-settings" aria-labelledby="presence-settings-title">
      <div>
        <h2 id="presence-settings-title">在線狀態</h2>
        <p className="form-hint" id="presence-sharing-hint">
          開啟期間你的所在球場只對其他也有開啟在線分享、且已填暱稱與 NTRP 的球友可見。只會記錄球場，不會儲存 GPS 座標。
        </p>
      </div>
      <button
        type="button"
        className="session-secondary"
        data-set-presence-sharing=""
        data-presence-control=""
        role="switch"
        aria-checked={presence.sharePresence ? "true" : "false"}
        aria-label={`在線分享：${sharingLabel}`}
        aria-describedby="presence-sharing-hint"
        data-testid="presence-sharing-toggle"
        onClick={() => {
          void mePageRuntime.runPresenceSettingAction(rootElement, () => onSetPresenceSharing(!presence.sharePresence));
        }}
      >
        {sharingLabel}
      </button>
      <p className="form-hint" data-testid="presence-location-status">
        {mePageRuntime.presenceLocationHint(presence)}
      </p>
      <label className="presence-settings__greeting">
        <input
          type="checkbox"
          data-open-to-greeting=""
          data-presence-control=""
          data-testid="open-to-greeting-toggle"
          defaultChecked={presence.openToGreeting}
          onChange={handleGreetingChange}
        />{" "}
        接受現場問候
      </label>
      <p className="form-error" data-presence-error="" role="alert" tabIndex={-1} hidden />
    </section>
  );
}

function notificationPreferencesFrom(rootElement: HTMLElement): NotificationPreferences {
  const checked = (preference: keyof NotificationPreferences) =>
    rootElement.querySelector<HTMLInputElement>(`[data-notification-pref="${preference}"]`)?.checked === true;
  return {
    chatMessageEnabled: checked("chatMessageEnabled"),
    hostNewRequestEnabled: checked("hostNewRequestEnabled"),
    guestRequestReviewedEnabled: checked("guestRequestReviewedEnabled"),
    guestInvitedEnabled: checked("guestInvitedEnabled"),
    sessionReminderEnabled: checked("sessionReminderEnabled"),
    sessionUpdatedEnabled: checked("sessionUpdatedEnabled"),
  };
}

function NotificationPreferencesFieldset({
  notification,
  onSaveNotificationPreferences,
  rootElement,
}: {
  notification: NormalizedNotification;
  onSaveNotificationPreferences: (preferences: NotificationPreferences) => CallbackResult;
  rootElement: HTMLElement;
}) {
  const handlePreferenceChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const previousChecked = !input.checked;
    const preferences = notificationPreferencesFrom(rootElement);
    void mePageRuntime
      .runNotificationSettingAction(rootElement, () => onSaveNotificationPreferences(preferences))
      .then((saved) => {
        if (!saved) input.checked = previousChecked;
      });
  };
  return (
    <fieldset className="notification-settings__fieldset">
      <legend>事件通知</legend>
      {NOTIFICATION_PREFERENCES.map(({ key, label, testId }) => (
        <label key={key}>
          <input
            type="checkbox"
            data-notification-pref={key}
            data-notification-control=""
            data-testid={testId}
            defaultChecked={notification.prefs[key]}
            onChange={handlePreferenceChange}
          />{" "}
          {label}
        </label>
      ))}
      <p className="form-hint">場地時間定案與球局取消一定會通知，無法關閉。</p>
    </fieldset>
  );
}

function CourtSubscriptions({
  notification,
  notificationCourts,
  onSaveCourtSubscriptions,
  rootElement,
}: {
  notification: NormalizedNotification;
  notificationCourts: MeCourt[];
  onSaveCourtSubscriptions: (courtIds: number[]) => CallbackResult;
  rootElement: HTMLElement;
}) {
  const subscribedCourtCount = notificationCourts.filter((court) => notification.courtIds.has(Number(court.id))).length;
  const subscribedToEveryCourt = notificationCourts.length > 0 && subscribedCourtCount === notificationCourts.length;
  const courtPickerExpanded = subscribedCourtCount > 0 && !subscribedToEveryCourt;
  const courtSubscriptionSummary = notificationCourts.length ? `已訂閱 ${subscribedCourtCount} 座` : "";
  const courtBoxes = () => [...rootElement.querySelectorAll<HTMLInputElement>("[data-notification-court]")];
  const selectedCourtIds = () =>
    courtBoxes()
      .filter((box) => box.checked)
      .map((box) => Number(box.value));
  const paintCourtSelection = (ids: number[]) => {
    const chosen = new Set(ids.map(Number));
    courtBoxes().forEach((box) => {
      box.checked = chosen.has(Number(box.value));
    });
    const subscribeAll = rootElement.querySelector<HTMLInputElement>("[data-subscribe-all-courts]");
    if (subscribeAll) {
      subscribeAll.checked = notificationCourts.length > 0 && chosen.size === notificationCourts.length;
    }
    const countLabel = rootElement.querySelector<HTMLElement>("[data-court-subscription-count]");
    if (countLabel) countLabel.textContent = `已訂閱 ${chosen.size} 座`;
  };
  const restoreCourtSelection = () => paintCourtSelection([...notification.courtIds]);
  const saveCourtSelection = (courtIds: number[]) => {
    if (courtIds.length > notificationCourts.length) {
      restoreCourtSelection();
      const error = rootElement.querySelector<HTMLElement>("[data-notification-error]");
      if (error) {
        error.textContent = "訂閱球場數量超過目前可選的台北市球場。";
        error.hidden = false;
        if (mePageRuntime.canReceiveFocus(error)) error.focus({ preventScroll: true });
      }
      return;
    }
    paintCourtSelection(courtIds);
    void mePageRuntime
      .runNotificationSettingAction(rootElement, () => onSaveCourtSubscriptions(courtIds))
      .then((saved) => {
        if (!saved) restoreCourtSelection();
      });
  };
  const handlePickerToggle = (event: MouseEvent<HTMLButtonElement>) => {
    const picker = rootElement.querySelector<HTMLElement>("[data-notification-courts]");
    if (!picker) return;
    const expanded = picker.hidden;
    picker.hidden = !expanded;
    event.currentTarget.setAttribute("aria-expanded", expanded ? "true" : "false");
  };
  return (
    <fieldset className="notification-settings__fieldset">
      <legend>訂閱球場的新球局</legend>
      <p className="form-hint">只有所選球場的新球局會通知你。</p>
      <label className="court-subscribe-all">
        <input
          type="checkbox"
          data-subscribe-all-courts=""
          data-notification-control=""
          data-testid="subscribe-all-courts"
          defaultChecked={subscribedToEveryCourt}
          disabled={!notificationCourts.length}
          onChange={(event) => {
            saveCourtSelection(event.currentTarget.checked ? notificationCourts.map((court) => Number(court.id)) : []);
          }}
        />{" "}
        <span>全台北市球場</span>
      </label>
      <button
        type="button"
        className="session-secondary"
        data-court-picker-toggle=""
        data-notification-control=""
        data-testid="toggle-court-picker"
        aria-expanded={courtPickerExpanded ? "true" : "false"}
        aria-controls="notification-court-picker"
        disabled={!notificationCourts.length}
        onClick={handlePickerToggle}
      >
        只訂閱特定球場
      </button>
      <div
        className="option-grid"
        id="notification-court-picker"
        data-notification-courts=""
        hidden={!courtPickerExpanded}
      >
        {notificationCourts.map((court) => {
          const courtId = String(court.id);
          return (
            <label key={courtId}>
              <input
                type="checkbox"
                data-notification-court=""
                data-notification-control=""
                value={courtId}
                data-testid={`notification-court-${courtId}`}
                defaultChecked={notification.courtIds.has(Number(court.id))}
                onChange={() => saveCourtSelection(selectedCourtIds())}
              />{" "}
              <span>
                {court.name} · {court.district || "台北市"}
              </span>
            </label>
          );
        })}
      </div>
      {courtSubscriptionSummary ? (
        <p className="form-hint" role="status" data-court-subscription-count="">
          {courtSubscriptionSummary}
        </p>
      ) : null}
      {notificationCourts.length ? null : (
        <p className="form-hint" role="status">
          球場資料尚未就緒，請稍候。
        </p>
      )}
    </fieldset>
  );
}

function NotificationSettings({
  courts,
  notification,
  onEnablePush,
  onSaveCourtSubscriptions,
  onSaveNotificationPreferences,
  rootElement,
}: {
  courts: MeCourt[] | null;
  notification: NormalizedNotification;
  onEnablePush: () => CallbackResult;
  onSaveCourtSubscriptions: (courtIds: number[]) => CallbackResult;
  onSaveNotificationPreferences: (preferences: NotificationPreferences) => CallbackResult;
  rootElement: HTMLElement;
}) {
  const notificationCourts = (Array.isArray(courts) ? courts : []).filter(
    (court) => court?.city === "台北市" && Number.isSafeInteger(Number(court?.id)) && Number(court.id) > 0
  );
  const enablePushDisabled =
    !notification.webPushConfigured ||
    notification.pushStatus === "enabled" ||
    notification.pushStatus === "unsupported";
  return (
    <section className="notification-settings" aria-labelledby="notification-settings-title">
      <div className="notification-settings__head">
        <div>
          <h2 id="notification-settings-title" tabIndex={-1} data-notification-settings-heading="">
            通知設定
          </h2>
          <p className="form-hint">推播只包含球局摘要與連結，不包含聯絡方式或其他球友個資。</p>
        </div>
        <button
          type="button"
          className="session-secondary"
          data-enable-push=""
          data-notification-control=""
          data-testid="enable-push"
          disabled={enablePushDisabled}
          onClick={() => {
            void mePageRuntime.runNotificationSettingAction(rootElement, onEnablePush);
          }}
        >
          {notification.pushStatus === "enabled" ? "此裝置已開啟" : "開啟推播"}
        </button>
      </div>
      <p className="form-hint notification-settings__hint">{mePageRuntime.notificationPushHint(notification)}</p>
      <p className="form-hint">推播開關只影響這台裝置；下方的事件偏好套用到你的帳號。</p>
      <p className="form-hint notification-settings__ios-hint">
        若使用 iPhone／iPad，請先在 Safari 的分享選單選擇「加入主畫面」，再從主畫面開啟本網站以使用推播通知。
      </p>
      <p
        className="form-error"
        data-notification-error=""
        role="alert"
        tabIndex={-1}
        hidden={!notification.errorMessage}
      >
        {notification.errorMessage}
      </p>
      <NotificationPreferencesFieldset
        notification={notification}
        onSaveNotificationPreferences={onSaveNotificationPreferences}
        rootElement={rootElement}
      />
      <CourtSubscriptions
        notification={notification}
        notificationCourts={notificationCourts}
        onSaveCourtSubscriptions={onSaveCourtSubscriptions}
        rootElement={rootElement}
      />
    </section>
  );
}

function BlockedPlayerSettings({
  blockedPlayers,
  blockedPlayersError,
  blockedPlayersStatus,
  onUnblockPlayer,
  rootElement,
}: {
  blockedPlayers: BlockedPlayer[] | null;
  blockedPlayersError: string;
  blockedPlayersStatus: string;
  onUnblockPlayer: (profileId: string) => CallbackResult;
  rootElement: HTMLElement;
}) {
  const safeBlockedPlayers = Array.isArray(blockedPlayers) ? blockedPlayers : [];
  return (
    <section className="blocked-player-settings" aria-labelledby="blocked-player-settings-title">
      <div>
        <h2 id="blocked-player-settings-title">我的封鎖清單</h2>
        <p className="form-hint">解除封鎖後，系統會重新讀取目前的權威清單。</p>
      </div>
      <p
        className="my-sessions-message"
        data-blocked-players-status=""
        role="status"
        aria-live="polite"
        hidden={blockedPlayersStatus !== "loading"}
      >
        正在讀取封鎖清單…
      </p>
      <p className="form-error" data-blocked-players-error="" role="alert" tabIndex={-1} hidden={!blockedPlayersError}>
        {blockedPlayersError}
      </p>
      <div className="blocked-player-list" data-testid="blocked-player-list">
        {safeBlockedPlayers.length ? (
          safeBlockedPlayers.map((player) => {
            const profileId = String(player.blockedProfileId);
            return (
              <div className="blocked-player-row" data-testid={`blocked-player-${profileId}`} key={profileId}>
                <span>{player.blockedNickname || "已封鎖的使用者"}</span>
                <button
                  type="button"
                  className="session-secondary"
                  data-my-action="unblock"
                  data-profile-id={profileId}
                  data-testid={`unblock-player-${profileId}`}
                  onClick={(event) =>
                    mePageRuntime.runMySessionAction(event.currentTarget, () => onUnblockPlayer(profileId), rootElement)
                  }
                >
                  解除封鎖
                </button>
              </div>
            );
          })
        ) : (
          <p className="surface__copy">目前沒有封鎖任何人。</p>
        )}
      </div>
    </section>
  );
}

function LoginMethods({
  lineProviderId,
  linkedProviders,
  onLinkProvider,
}: {
  lineProviderId: string;
  linkedProviders: string[] | null;
  onLinkProvider: (provider: string) => CallbackResult;
}) {
  const methods = [{ label: "Google", provider: "google" }];
  if (lineProviderId) methods.push({ label: "LINE", provider: lineProviderId });
  const linked = Array.isArray(linkedProviders) ? linkedProviders : [];
  const handleLink = (event: MouseEvent<HTMLButtonElement>, provider: string) => {
    const button = event.currentTarget;
    button.disabled = true;
    Promise.resolve(onLinkProvider(provider)).finally(() => {
      if (button.isConnected) button.disabled = false;
    });
  };
  return (
    <section className="me-login-methods" aria-labelledby="me-login-methods-title">
      <div>
        <h2 id="me-login-methods-title">登入方式</h2>
        <p className="form-hint">連結後,兩種方式登入的都是同一個帳號。</p>
      </div>
      <div className="me-login-methods__rows">
        {methods.map(({ label, provider }) => (
          <div className="me-login-method" data-login-method={provider} key={`${label}:${provider}`}>
            <span className="me-login-method__label">{label}</span>
            {linked.includes(provider) ? (
              <span className="me-login-method__status">已連結</span>
            ) : (
              <button
                type="button"
                className="session-secondary"
                data-link-provider={provider}
                onClick={(event) => handleLink(event, provider)}
              >
                連結
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function ServiceLinks({ supportHref }: { supportHref: string }) {
  return (
    <section className="me-service-links" aria-labelledby="me-service-title">
      <h2 id="me-service-title">站務</h2>
      <div>
        {supportHref ? <a href={supportHref}>聯絡支援</a> : null}
        <a href="/privacy.html">隱私權政策</a>
      </div>
    </section>
  );
}

export function MePage(props: MePageProps) {
  const authenticated = Boolean(props.authSession);
  const nickname = String(props.profile?.nick ?? "").trim() || "球友";
  const presence = mePageRuntime.normalizedPresenceSettings(props.presence ?? {});
  const notification = mePageRuntime.normalizedNotificationSettings(props.notificationSettings ?? {});
  return (
    <div className="me-shell">
      <div className="me-page-v2__head">
        <p className="me-page-v2__eyebrow">MY PROFILE</p>
        <h1 tabIndex={-1} data-me-heading="" className="me-page-v2__title">
          我
        </h1>
      </div>
      {authenticated ? (
        <AuthenticatedIdentity
          avatarUrl={props.avatarUrl}
          courts={props.courts}
          nickname={nickname}
          onEditProfile={props.onEditProfile}
          profile={props.profile}
        />
      ) : (
        <SignInCard onSignIn={props.onSignIn} />
      )}
      {authenticated ? (
        <>
          <PlayerVisibility
            onTogglePlayerVisibility={props.onTogglePlayerVisibility}
            playerVisibility={props.playerVisibility}
            rootElement={props.rootElement}
          />
          <PresenceSettings
            onSetOpenToGreeting={props.onSetOpenToGreeting}
            onSetPresenceSharing={props.onSetPresenceSharing}
            presence={presence}
            rootElement={props.rootElement}
          />
          <p className="form-error" data-my-sessions-error="" role="alert" tabIndex={-1} hidden />
          <NotificationSettings
            courts={props.courts}
            notification={notification}
            onEnablePush={props.onEnablePush}
            onSaveCourtSubscriptions={props.onSaveCourtSubscriptions}
            onSaveNotificationPreferences={props.onSaveNotificationPreferences}
            rootElement={props.rootElement}
          />
          <BlockedPlayerSettings
            blockedPlayers={props.blockedPlayers}
            blockedPlayersError={props.blockedPlayersError}
            blockedPlayersStatus={props.blockedPlayersStatus}
            onUnblockPlayer={props.onUnblockPlayer}
            rootElement={props.rootElement}
          />
          <LoginMethods
            lineProviderId={props.lineProviderId}
            linkedProviders={props.linkedProviders}
            onLinkProvider={props.onLinkProvider}
          />
        </>
      ) : null}
      <ServiceLinks supportHref={props.supportHref} />
      {authenticated ? (
        <button type="button" className="me-sign-out-action" data-testid="me-sign-out" onClick={props.onSignOut}>
          登出
        </button>
      ) : null}
    </div>
  );
}

/** One React root per legacy mount; a new key preserves the legacy full-subtree replacement contract. */
export function mountMePage(rootElement: HTMLElement, options: MePageOptions = {}): void {
  const {
    authSession = null,
    profile = {},
    avatarUrl = "",
    blockedPlayers = [],
    blockedPlayersError = "",
    blockedPlayersStatus = "idle",
    courts = [],
    lineProviderId = "",
    linkedProviders = [],
    notificationSettings = {},
    onEditProfile = noop,
    onEnablePush = noop,
    onLinkProvider = noop,
    onSaveCourtSubscriptions = noop,
    onSaveNotificationPreferences = noop,
    onSetOpenToGreeting = noop,
    onSetPresenceSharing = noop,
    onSignIn = noop,
    onSignOut = noop,
    onTogglePlayerVisibility = noop,
    onUnblockPlayer = noop,
    playerVisibility = false,
    presence = {},
    supportHref = "",
  } = options;

  let mounted = mountedRoots.get(rootElement);
  if (!mounted) {
    mounted = { generation: 0, reactRoot: createRoot(rootElement) };
    mountedRoots.set(rootElement, mounted);
  }
  mounted.generation += 1;
  const generation = mounted.generation;
  flushSync(() => {
    mounted.reactRoot.render(
      <MePage
        key={generation}
        rootElement={rootElement}
        authSession={authSession}
        profile={profile}
        avatarUrl={avatarUrl}
        blockedPlayers={blockedPlayers}
        blockedPlayersError={blockedPlayersError}
        blockedPlayersStatus={blockedPlayersStatus}
        courts={courts}
        lineProviderId={lineProviderId}
        linkedProviders={linkedProviders}
        notificationSettings={notificationSettings}
        onEditProfile={onEditProfile}
        onEnablePush={onEnablePush}
        onLinkProvider={onLinkProvider}
        onSaveCourtSubscriptions={onSaveCourtSubscriptions}
        onSaveNotificationPreferences={onSaveNotificationPreferences}
        onSetOpenToGreeting={onSetOpenToGreeting}
        onSetPresenceSharing={onSetPresenceSharing}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
        onTogglePlayerVisibility={onTogglePlayerVisibility}
        onUnblockPlayer={onUnblockPlayer}
        playerVisibility={playerVisibility}
        presence={presence}
        supportHref={supportHref}
      />
    );
  });
}
