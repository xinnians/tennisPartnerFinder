import { useEffect, useLayoutEffect, useState, type ChangeEvent, type MouseEvent } from "react";

import { Avatar } from "../components/Avatar.tsx";
import type {
  ControllerCallbackResult as CallbackResult,
  ControllerEventName,
  SessionControllerState,
} from "../controllerContracts.ts";
import type { CourtSummary, NotificationPreferences, Profile } from "../domainTypes.ts";
import type { PageViewStore } from "../pageViewStore.ts";
import { mePageRuntime } from "../sessionPresentation.ts";
import { selectControllerMySessionsView } from "../sessionSelectors.ts";
import { useStoreSelector, type Store } from "../sessionStore.ts";

interface AuthSession {
  user?: {
    id?: string | null;
    identities?: Array<{ provider?: string }>;
    user_metadata?: { avatar_url?: string; picture?: string };
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
  sessionStore?: Store<SessionControllerState, ControllerEventName>;
  pageViewStore?: PageViewStore;
  onStoreCommit?: () => void;
}

export interface MePageProps {
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
  sessionStore?: Store<SessionControllerState, ControllerEventName>;
  pageViewStore?: PageViewStore;
  onStoreCommit?: () => void;
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
  const [openToGreeting, setOpenToGreeting] = useState(presence.openToGreeting);
  const [sharePresence, setSharePresence] = useState(presence.sharePresence);
  useEffect(() => setOpenToGreeting(presence.openToGreeting), [presence.openToGreeting]);
  useEffect(() => setSharePresence(presence.sharePresence), [presence.sharePresence]);
  const sharingLabel = sharePresence ? "已開啟" : "已關閉";
  const handleGreetingChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextOpenToGreeting = event.currentTarget.checked;
    setOpenToGreeting(nextOpenToGreeting);
    void mePageRuntime
      .runPresenceSettingAction(rootElement, () => onSetOpenToGreeting(nextOpenToGreeting))
      .then((saved) => {
        if (!saved) setOpenToGreeting(presence.openToGreeting);
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
        aria-checked={sharePresence ? "true" : "false"}
        aria-label={`在線分享：${sharingLabel}`}
        aria-describedby="presence-sharing-hint"
        data-testid="presence-sharing-toggle"
        onClick={() => {
          const nextSharePresence = !sharePresence;
          setSharePresence(nextSharePresence);
          void mePageRuntime
            .runPresenceSettingAction(rootElement, () => onSetPresenceSharing(nextSharePresence))
            .then((saved) => {
              if (!saved) setSharePresence(presence.sharePresence);
            });
        }}
      >
        {sharingLabel}
      </button>
      <p className="form-hint" data-testid="presence-location-status">
        {mePageRuntime.presenceLocationHint({ ...presence, sharePresence })}
      </p>
      <label className="presence-settings__greeting">
        <input
          type="checkbox"
          data-open-to-greeting=""
          data-presence-control=""
          data-testid="open-to-greeting-toggle"
          checked={openToGreeting}
          onChange={handleGreetingChange}
        />{" "}
        接受現場問候
      </label>
      <p className="form-error" data-presence-error="" role="alert" tabIndex={-1} hidden />
    </section>
  );
}

function copyNotificationPreferences(preferences: NotificationPreferences): NotificationPreferences {
  return {
    chatMessageEnabled: preferences.chatMessageEnabled,
    hostNewRequestEnabled: preferences.hostNewRequestEnabled,
    guestRequestReviewedEnabled: preferences.guestRequestReviewedEnabled,
    guestInvitedEnabled: preferences.guestInvitedEnabled,
    sessionReminderEnabled: preferences.sessionReminderEnabled,
    sessionUpdatedEnabled: preferences.sessionUpdatedEnabled,
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
  const authoritativePreferences = JSON.stringify(notification.prefs);
  const [preferences, setPreferences] = useState(() => copyNotificationPreferences(notification.prefs));
  useEffect(() => {
    setPreferences(JSON.parse(authoritativePreferences) as NotificationPreferences);
  }, [authoritativePreferences]);
  const handlePreferenceChange = (key: keyof NotificationPreferences, checked: boolean) => {
    const nextPreferences = { ...preferences, [key]: checked };
    setPreferences(nextPreferences);
    void mePageRuntime
      .runNotificationSettingAction(rootElement, () => onSaveNotificationPreferences(nextPreferences))
      .then((saved) => {
        if (!saved) setPreferences(copyNotificationPreferences(notification.prefs));
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
            checked={preferences[key]}
            onChange={(event) => handlePreferenceChange(key, event.currentTarget.checked)}
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
  const authoritativeCourtIds = notificationCourts
    .map((court) => Number(court.id))
    .filter((courtId) => notification.courtIds.has(courtId));
  const authoritativeCourtSignature = authoritativeCourtIds.join(",");
  const [selectedCourtIds, setSelectedCourtIds] = useState(() => new Set(authoritativeCourtIds));
  const [courtPickerExpanded, setCourtPickerExpanded] = useState(
    () => authoritativeCourtIds.length > 0 && authoritativeCourtIds.length < notificationCourts.length
  );
  useEffect(() => {
    const restoredCourtIds = authoritativeCourtSignature ? authoritativeCourtSignature.split(",").map(Number) : [];
    setSelectedCourtIds(new Set(restoredCourtIds));
    setCourtPickerExpanded(restoredCourtIds.length > 0 && restoredCourtIds.length < notificationCourts.length);
  }, [authoritativeCourtSignature, notificationCourts.length]);
  const subscribedCourtCount = notificationCourts.filter((court) => selectedCourtIds.has(Number(court.id))).length;
  const subscribedToEveryCourt = notificationCourts.length > 0 && subscribedCourtCount === notificationCourts.length;
  const courtSubscriptionSummary = notificationCourts.length ? `已訂閱 ${subscribedCourtCount} 座` : "";
  const saveCourtSelection = (courtIds: number[]) => {
    const nextCourtIds = new Set(courtIds);
    setSelectedCourtIds(nextCourtIds);
    if (notificationCourts.length > 0 && nextCourtIds.size === notificationCourts.length) {
      setCourtPickerExpanded(false);
    }
    void mePageRuntime
      .runNotificationSettingAction(rootElement, () => onSaveCourtSubscriptions(courtIds))
      .then((saved) => {
        if (!saved) {
          setSelectedCourtIds(new Set(authoritativeCourtIds));
          setCourtPickerExpanded(
            authoritativeCourtIds.length > 0 && authoritativeCourtIds.length < notificationCourts.length
          );
        }
      });
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
          data-notification-authoritative-disabled={notificationCourts.length ? "false" : "true"}
          data-testid="subscribe-all-courts"
          checked={subscribedToEveryCourt}
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
        data-notification-authoritative-disabled={notificationCourts.length ? "false" : "true"}
        data-testid="toggle-court-picker"
        aria-expanded={courtPickerExpanded ? "true" : "false"}
        aria-controls="notification-court-picker"
        disabled={!notificationCourts.length}
        onClick={() => setCourtPickerExpanded((expanded) => !expanded)}
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
                checked={selectedCourtIds.has(Number(court.id))}
                onChange={(event) => {
                  const nextCourtIds = new Set(selectedCourtIds);
                  const numericCourtId = Number(court.id);
                  if (event.currentTarget.checked) nextCourtIds.add(numericCourtId);
                  else nextCourtIds.delete(numericCourtId);
                  saveCourtSelection(
                    notificationCourts
                      .map((listedCourt) => Number(listedCourt.id))
                      .filter((listedCourtId) => nextCourtIds.has(listedCourtId))
                  );
                }}
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
          data-notification-authoritative-disabled={enablePushDisabled ? "true" : "false"}
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
    void Promise.resolve(onLinkProvider(provider)).finally(() => {
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
  const controllerState = useStoreSelector(props.sessionStore, "me", (state) => state, null);
  const controllerView = controllerState ? selectControllerMySessionsView(controllerState) : null;
  const pageView = useStoreSelector(props.pageViewStore, "me", (state) => state, null);
  const authSession = (controllerState?.authSession as AuthSession | null | undefined) ?? props.authSession;
  const profile = (controllerState?.profile as MeProfile | null | undefined) ?? props.profile;
  const metadata = authSession?.user?.user_metadata ?? {};
  const avatarUrl = controllerState ? (metadata.avatar_url ?? metadata.picture ?? "") : props.avatarUrl;
  const linkedProviders = controllerState
    ? (authSession?.user?.identities ?? []).flatMap((identity) => (identity.provider ? [identity.provider] : []))
    : props.linkedProviders;
  const authenticated = Boolean(authSession);
  const nickname = String(profile?.nick ?? "").trim() || "球友";
  const presence = mePageRuntime.normalizedPresenceSettings(
    controllerState
      ? {
          locationStatus: pageView?.presenceLocationStatus ?? props.presence?.locationStatus,
          openToGreeting: profile?.openToGreeting === true,
          sharePresence: profile?.sharePresence === true,
        }
      : (props.presence ?? {})
  );
  const notification = mePageRuntime.normalizedNotificationSettings(
    pageView?.notificationSettings ?? props.notificationSettings ?? {}
  );
  useLayoutEffect(() => {
    props.onStoreCommit?.();
  });
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
          avatarUrl={avatarUrl}
          courts={controllerState?.courts ?? props.courts}
          nickname={nickname}
          onEditProfile={props.onEditProfile}
          profile={profile}
        />
      ) : (
        <SignInCard onSignIn={props.onSignIn} />
      )}
      {authenticated ? (
        <>
          <PlayerVisibility
            onTogglePlayerVisibility={props.onTogglePlayerVisibility}
            playerVisibility={controllerView?.isPublic ?? props.playerVisibility}
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
            courts={controllerState?.courts ?? props.courts}
            notification={notification}
            onEnablePush={props.onEnablePush}
            onSaveCourtSubscriptions={props.onSaveCourtSubscriptions}
            onSaveNotificationPreferences={props.onSaveNotificationPreferences}
            rootElement={props.rootElement}
          />
          <BlockedPlayerSettings
            blockedPlayers={controllerView?.blockedPlayers ?? props.blockedPlayers}
            blockedPlayersError={controllerView?.blockedPlayersError ?? props.blockedPlayersError}
            blockedPlayersStatus={controllerView?.blockedPlayersStatus ?? props.blockedPlayersStatus}
            onUnblockPlayer={props.onUnblockPlayer}
            rootElement={props.rootElement}
          />
          <LoginMethods
            lineProviderId={props.lineProviderId}
            linkedProviders={linkedProviders}
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
