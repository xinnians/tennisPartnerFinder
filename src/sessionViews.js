import { TAIPEI_TIME_ZONE } from "./config.js";
import { BANDS, DEFAULT_FILTER_STATE, isDefaultFilters } from "./filters.js";
import { TAIPEI_DISTRICTS } from "./districts.js";
import { formatNtrp, validProfileNtrp } from "./profile.js";
import { mountDialog, mountSheet } from "./sheets.js";
import { canReceiveFocus } from "./meFocus.js";
import { esc } from "./util.js";

const GOOGLE_AVATAR_URL = /^https:\/\/lh[0-9]+[.]googleusercontent[.]com\//;

function safeGoogleAvatarUrl(value) {
  const candidate = String(value ?? "");
  return GOOGLE_AVATAR_URL.test(candidate) ? candidate : "";
}

function avatarInitial(nickname) {
  return [...String(nickname ?? "").trim()][0] || "球";
}

// 批 D8:size modifier(""=既有 40px、"md"=44px 名單列、"lg"=52px 我頁/球友卡)——
// 球友（非本人）在資料庫層從不帶 avatarUrl(player_directory/player_presence_directory
// allowlist 皆無 avatar 欄位,見 .claude/rules/supabase.md),所以 md/lg 呼叫點永遠只會
// 落回字首 fallback,不會意外冒出 <img>。
function avatarMarkup({ avatarUrl = "", nickname = "", size = "" } = {}) {
  const safeUrl = safeGoogleAvatarUrl(avatarUrl);
  const sizeClass = size ? ` player-avatar--${size}` : "";
  return `<span class="player-avatar${sizeClass}" data-player-avatar>
    ${safeUrl ? `<img src="${esc(safeUrl)}" alt="" referrerpolicy="no-referrer" />` : ""}
    <span class="player-avatar__fallback" data-avatar-fallback aria-hidden="true"${safeUrl ? " hidden" : ""}>${esc(avatarInitial(nickname))}</span>
  </span>`;
}

// 批 D8:NTRP 磚(dc §1/§3 大版、§2 小版)——null/未填一律顯示「—」,不落回
// Number(null)=0 的舊陷阱(hosted QA 已記過一次教訓,見 memory hosted-qa-minor-copy-bugs)。
function ntrpBrickValue(ntrp) {
  return validProfileNtrp(ntrp) ? Number(ntrp).toFixed(1) : "—";
}

function ntrpBrickMarkup(ntrp) {
  return `<div class="ntrp-brick"><p class="ntrp-brick__eyebrow">NTRP</p><p class="ntrp-brick__value">${esc(
    ntrpBrickValue(ntrp)
  )}</p></div>`;
}

function ntrpBrickSmMarkup(ntrp) {
  return `<span class="ntrp-brick--sm">${esc(ntrpBrickValue(ntrp))}</span>`;
}

function wireAvatarFallbacks(root) {
  root?.querySelectorAll?.("[data-player-avatar] img").forEach((image) => {
    image.addEventListener("error", () => {
      image.hidden = true;
      const fallback = image.closest("[data-player-avatar]")?.querySelector("[data-avatar-fallback]");
      if (fallback) fallback.hidden = false;
    });
  });
}

/**
 * 中性聚合數:只陳述事實,不做比率、星等或排名;N 為 0 時整行不顯示。
 *
 * 三個呼叫點(加入前名單主揪列、球友名單列、球友卡)的容器都是 grid,所以這個 span
 * 會自成一列,不需要各自加 display。
 */
function trustCountMarkup(count, label) {
  const value = Number(count ?? 0);
  if (!Number.isFinite(value) || value <= 0) return "";
  return `<span class="trust-count">${esc(label.replace("{n}", String(value)))}</span>`;
}

// 批 D8:我頁 profile 卡副行「常打 X」——profile.courts 可能存 court.id 或(舊資料)
// court.name,雙重比對沿用 updateCourtCheckboxes(既有個人檔案表單邏輯)同一寫法,
// 不是新發明的判準。
function profileCourtNames(profile, courts) {
  const selected = profile?.courts instanceof Set ? profile.courts : new Set(profile?.courts ?? []);
  if (!selected.size) return [];
  return (Array.isArray(courts) ? courts : [])
    .filter((court) => selected.has(String(court?.id)) || selected.has(court?.name))
    .map((court) => court.name);
}

function joinPreviewMarkup({ participants = [], status = "loading" } = {}) {
  if (status === "loading") return '<p class="form-hint" role="status">正在載入已確認參加者…</p>';
  if (status === "error") return '<p class="form-hint" role="status">參加者名單暫時無法載入。</p>';
  const ordered = [...participants].sort((left, right) => Number(right?.role === "host") - Number(left?.role === "host"));
  if (!ordered.length) return '<p class="form-hint" role="status">目前沒有可顯示的已確認參加者。</p>';
  return `<div class="join-preview__people">${ordered
    .map(
      (participant) => `<article class="join-preview__person" data-join-preview-person>
        ${avatarMarkup(participant)}
        <div><strong>${esc(participant.nickname)}</strong><span>${participant.role === "host" ? "主揪" : "已確認"} · ${esc(
          formatNtrp(participant.ntrp)
        )}</span>${participant.role === "host" ? trustCountMarkup(participant.hostedPlayedCount, "已成局 {n} 次") : ""}</div>
      </article>`
    )
    .join("")}</div>`;
}

function joinPreviewSection(show) {
  return show
    ? `<section class="join-preview" data-session-join-preview><h3>已確認參加者</h3><div data-session-join-preview-content>${joinPreviewMarkup()}</div></section>`
    : "";
}

function createJoinPreviewSetter(root) {
  return (state) => {
    const content = root.querySelector("[data-session-join-preview-content]");
    if (!content) return;
    content.innerHTML = joinPreviewMarkup(state);
    wireAvatarFallbacks(content);
  };
}

const dialogFocusable =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const drawerBindings = new WeakMap();
const drawerFocusIntents = new WeakMap();
const drawerLoadingFocusFallbacks = new WeakSet();
const mySessionActionStates = new WeakMap();
// 批 D6:segmented tab(我報名的／我主揪的)狀態掛在 root 上,同一顆 DOM 節點在
// show/hide 之間沿用(main.js 只切 hidden,不拆 innerHTML),語意與
// mySessionActionStates 相同——view-only 狀態,不進 sessionController。
const mySessionsSegmentStates = new WeakMap();
const MY_SESSION_LIFECYCLE_ACTIONS = new Set([
  "accept",
  "accept-invite",
  "attendance",
  "cancel",
  "decline",
  "decline-invite",
  "played",
  "refresh",
  "toggle-visibility",
  "withdraw",
]);
const DRAWER_TOGGLE_FOCUS = "__drawer-toggle__";
const DRAWER_CLOSE_FOCUS = "__drawer-close__";
const DRAWER_ACTION_FOCUS_PREFIX = "__drawer-action__:";
const DRAWER_ACTION_IDS = new Set([
  "discovery-reset",
  "drawer-map-retry",
  "discovery-expand",
  "discovery-subscribe",
  "discovery-first",
]);

export const PROFILE_PUBLIC_DISCLOSURE =
  "開球局後，這個暱稱與你的 NTRP 會顯示給瀏覽該球局的人；加入球局後，主揪與已接受球友可使用球局群組聊天。";

/** 全站唯一一份 NTRP 說明,個人檔案與建局表單共用;兩處不可各寫一份。 */
export const NTRP_SCALE_EXPLANATION =
  "NTRP 是網球程度自評分級：1.0 初學、2.5 能來回對打、3.5 能穩定控球、4.5 以上具比賽水準。";

/** Render the account and service skeleton for the Me destination. */
// 「登入方式」列:Google 恆列;LINE 只在部署端設定 custom provider 識別符後出現。
// 每列只顯示「已連結」布林狀態或連結按鈕,不顯示任何 provider 端個資。
function loginMethodRowsMarkup({ linkedProviders, lineProviderId }) {
  const methods = [{ label: "Google", provider: "google" }];
  if (lineProviderId) methods.push({ label: "LINE", provider: lineProviderId });
  return methods
    .map(({ label, provider }) => {
      const linked = linkedProviders.includes(provider);
      return `<div class="me-login-method" data-login-method="${esc(provider)}">
        <span class="me-login-method__label">${esc(label)}</span>
        ${
          linked
            ? '<span class="me-login-method__status">已連結</span>'
            : `<button type="button" class="session-secondary" data-link-provider="${esc(provider)}">連結</button>`
        }
      </div>`;
    })
    .join("");
}

export function renderMePage(
  root,
  {
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
    onEditProfile = () => {},
    onEnablePush = () => {},
    onLinkProvider = () => {},
    onSaveCourtSubscriptions = () => {},
    onSaveNotificationPreferences = () => {},
    onSetOpenToGreeting = () => {},
    onSetPresenceSharing = () => {},
    onSignIn = () => {},
    onSignOut = () => {},
    onTogglePlayerVisibility = () => {},
    onUnblockPlayer = () => {},
    playerVisibility = false,
    presence = {},
    supportHref = "",
  } = {}
) {
  const authenticated = Boolean(authSession);
  const nickname = String(profile?.nick ?? "").trim() || "球友";
  // 批 D8:profile 卡副行——沿用球友名單／球友卡同款「常打 X · 時段 Y」fallback 文案
  // (playerDirectoryRowsMarkup 既有慣例),不是新造詞。
  const profileCourtsText = profileCourtNames(profile, courts).join("、") || "未填球場";
  const profileSlotsText =
    playerSlotLabels([...(profile?.slots instanceof Set ? profile.slots : (profile?.slots ?? []))]).join("、") || "未填時段";
  const presenceSettings = normalizedPresenceSettings(presence);
  const notification = normalizedNotificationSettings(notificationSettings);
  const safeBlockedPlayers = Array.isArray(blockedPlayers) ? blockedPlayers : [];
  const notificationCourts = (Array.isArray(courts) ? courts : []).filter(
    (court) => court?.city === "台北市" && Number.isSafeInteger(Number(court?.id)) && Number(court.id) > 0
  );
  const subscribedCourtCount = notificationCourts.filter((court) => notification.courtIds.has(Number(court.id))).length;
  // 訂閱數等於當下全部台北市 active 球場時視為「全選」：主控勾起、細選清單收合。
  const subscribedToEveryCourt = notificationCourts.length > 0 && subscribedCourtCount === notificationCourts.length;
  // 只有「訂了一部分」才預設展開。全選不必再看清單；零訂閱是每個新使用者的狀態，
  // 展開會把 53 座球場推到頁面上，把封鎖清單與站務連結擠到捲不到的地方。
  const courtPickerExpanded = subscribedCourtCount > 0 && !subscribedToEveryCourt;
  // 球場目錄還沒載入時交集必然是 0，這時報「已訂閱 0 座」是假的，不要輸出。
  const courtSubscriptionSummary = notificationCourts.length ? `已訂閱 ${subscribedCourtCount} 座` : "";
  setMySessionActionScope(root, authSession?.user?.id ?? null);
  root.innerHTML = `<div class="me-shell">
    <div class="me-page-v2__head"><p class="me-page-v2__eyebrow">MY PROFILE</p><h1 tabindex="-1" data-me-heading class="me-page-v2__title">我</h1></div>
    ${
      authenticated
        ? `<section class="me-identity-card" data-testid="me-identity-card" aria-label="目前登入身分">
          <button type="button" class="profile-brick-row" data-testid="me-profile-edit-trigger" aria-label="${esc(
            `編輯個人檔案：${nickname}`
          )}">
            ${avatarMarkup({ avatarUrl, nickname, size: "lg" })}
            <span class="profile-brick-row__copy"><strong>${esc(nickname)}</strong><span>常打 ${esc(profileCourtsText)} · ${esc(
              profileSlotsText
            )}</span></span>
            ${ntrpBrickMarkup(profile?.ntrp)}
          </button>
        </section>
        <section class="me-edit-profile" aria-label="個人檔案">
          <div>
            <h2>個人檔案</h2>
            <p class="form-hint">暱稱、NTRP 與常打球場；暱稱與 NTRP 會出現在你建立或加入的球局。</p>
          </div>
          <button type="button" class="session-secondary" data-testid="edit-profile">編輯</button>
        </section>`
        : `<section class="me-sign-in-card" aria-label="登入">
          <h2>登入後查看你的身分</h2>
          <p class="surface__copy">登入後可管理球局與個人資料。</p>
          <button type="button" class="session-primary" data-testid="me-sign-in">登入</button>
        </section>`
    }
    ${
      authenticated
        ? `<section class="player-visibility" aria-label="球友卡">
      <div>
        <h2>球友卡</h2>
        <p class="form-hint" id="player-visibility-hint">開啟後，你會出現在球友名單，主揪可以邀你加入球局；關閉後立即從名單移除。個人聯絡資訊不會顯示。</p>
      </div>
      <button type="button" class="session-secondary" data-my-action="toggle-visibility"
        role="switch" aria-checked="${playerVisibility ? "true" : "false"}"
        aria-label="球友卡：${playerVisibility ? "已開啟" : "已關閉"}" aria-describedby="player-visibility-hint"
        data-testid="player-visibility-toggle">${playerVisibility ? "已開啟" : "已關閉"}</button>
    </section>
    <section class="presence-settings" aria-labelledby="presence-settings-title">
      <div>
        <h2 id="presence-settings-title">在線狀態</h2>
        <p class="form-hint" id="presence-sharing-hint">開啟期間你的所在球場只對其他也有開啟在線分享、且已填暱稱與 NTRP 的球友可見。只會記錄球場，不會儲存 GPS 座標。</p>
      </div>
      <button type="button" class="session-secondary" data-set-presence-sharing data-presence-control
        role="switch" aria-checked="${presenceSettings.sharePresence ? "true" : "false"}"
        aria-label="在線分享：${presenceSettings.sharePresence ? "已開啟" : "已關閉"}" aria-describedby="presence-sharing-hint"
        data-testid="presence-sharing-toggle">${presenceSettings.sharePresence ? "已開啟" : "已關閉"}</button>
      <p class="form-hint" data-testid="presence-location-status">${esc(presenceLocationHint(presenceSettings))}</p>
      <label class="presence-settings__greeting"><input type="checkbox" data-open-to-greeting data-presence-control data-testid="open-to-greeting-toggle"${
        presenceSettings.openToGreeting ? " checked" : ""
      }> 接受現場問候</label>
      <p class="form-error" data-presence-error role="alert" tabindex="-1" hidden></p>
    </section>
    <p class="form-error" data-my-sessions-error role="alert" tabindex="-1" hidden></p>
    <section class="notification-settings" aria-labelledby="notification-settings-title">
      <div class="notification-settings__head">
        <div>
          <h2 id="notification-settings-title" tabindex="-1" data-notification-settings-heading>通知設定</h2>
          <p class="form-hint">推播只包含球局摘要與連結，不包含聯絡方式或其他球友個資。</p>
        </div>
        <button type="button" class="session-secondary" data-enable-push data-notification-control
          data-testid="enable-push"${!notification.webPushConfigured || notification.pushStatus === "enabled" || notification.pushStatus === "unsupported" ? " disabled" : ""}>${
            notification.pushStatus === "enabled" ? "此裝置已開啟" : "開啟推播"
          }</button>
      </div>
      <p class="form-hint notification-settings__hint">${esc(notificationPushHint(notification))}</p>
      <p class="form-hint">推播開關只影響這台裝置；下方的事件偏好套用到你的帳號。</p>
      <p class="form-hint notification-settings__ios-hint">若使用 iPhone／iPad，請先在 Safari 的分享選單選擇「加入主畫面」，再從主畫面開啟本網站以使用推播通知。</p>
      <p class="form-error" data-notification-error role="alert" tabindex="-1"${notification.errorMessage ? "" : " hidden"}>${esc(
        notification.errorMessage
      )}</p>
      <fieldset class="notification-settings__fieldset">
        <legend>事件通知</legend>
        <label><input type="checkbox" data-notification-pref="hostNewRequestEnabled" data-notification-control data-testid="notification-host-new-request"${
          notification.prefs.hostNewRequestEnabled ? " checked" : ""
        }> 有人申請我的球局</label>
        <label><input type="checkbox" data-notification-pref="guestRequestReviewedEnabled" data-notification-control data-testid="notification-guest-request-reviewed"${
          notification.prefs.guestRequestReviewedEnabled ? " checked" : ""
        }> 加入申請被處理</label>
        <label><input type="checkbox" data-notification-pref="guestInvitedEnabled" data-notification-control data-testid="notification-guest-invited"${
          notification.prefs.guestInvitedEnabled ? " checked" : ""
        }> 收到球局邀請</label>
        <label><input type="checkbox" data-notification-pref="sessionUpdatedEnabled" data-notification-control data-testid="notification-session-updated"${
          notification.prefs.sessionUpdatedEnabled ? " checked" : ""
        }> 球局資訊變更</label>
        <label><input type="checkbox" data-notification-pref="chatMessageEnabled" data-notification-control data-testid="notification-chat-message"${
          notification.prefs.chatMessageEnabled ? " checked" : ""
        }> 群組有新訊息</label>
        <label><input type="checkbox" data-notification-pref="sessionReminderEnabled" data-notification-control data-testid="notification-session-reminder"${
          notification.prefs.sessionReminderEnabled ? " checked" : ""
        }> 開打前提醒</label>
        <p class="form-hint">場地時間定案與球局取消一定會通知，無法關閉。</p>
      </fieldset>
      <fieldset class="notification-settings__fieldset">
        <legend>訂閱球場的新球局</legend>
        <p class="form-hint">只有所選球場的新球局會通知你。</p>
        <label class="court-subscribe-all"><input type="checkbox" data-subscribe-all-courts data-notification-control
          data-testid="subscribe-all-courts"${subscribedToEveryCourt ? " checked" : ""}${
            notificationCourts.length ? "" : " disabled"
          }> <span>全台北市球場</span></label>
        <button type="button" class="session-secondary" data-court-picker-toggle data-notification-control
          data-testid="toggle-court-picker" aria-expanded="${courtPickerExpanded ? "true" : "false"}"
          aria-controls="notification-court-picker"${notificationCourts.length ? "" : " disabled"}>只訂閱特定球場</button>
        <div class="option-grid" id="notification-court-picker" data-notification-courts${
          courtPickerExpanded ? "" : " hidden"
        }>${notificationCourts
          .map(
            (court) =>
              `<label><input type="checkbox" data-notification-court data-notification-control value="${esc(court.id)}" data-testid="notification-court-${esc(
                court.id
              )}"${notification.courtIds.has(Number(court.id)) ? " checked" : ""}> <span>${esc(court.name)} · ${esc(
                court.district || "台北市"
              )}</span></label>`
          )
          .join("")}</div>
        ${courtSubscriptionSummary ? `<p class="form-hint" role="status" data-court-subscription-count>${esc(courtSubscriptionSummary)}</p>` : ""}
        ${notificationCourts.length ? "" : '<p class="form-hint" role="status">球場資料尚未就緒，請稍候。</p>'}
      </fieldset>
    </section>
    <section class="blocked-player-settings" aria-labelledby="blocked-player-settings-title">
      <div>
        <h2 id="blocked-player-settings-title">我的封鎖清單</h2>
        <p class="form-hint">解除封鎖後，系統會重新讀取目前的權威清單。</p>
      </div>
      <p class="my-sessions-message" data-blocked-players-status role="status" aria-live="polite"${
        blockedPlayersStatus === "loading" ? "" : " hidden"
      }>正在讀取封鎖清單…</p>
      <p class="form-error" data-blocked-players-error role="alert" tabindex="-1"${blockedPlayersError ? "" : " hidden"}>${esc(
        blockedPlayersError
      )}</p>
      <div class="blocked-player-list" data-testid="blocked-player-list">${
        safeBlockedPlayers.length
          ? safeBlockedPlayers
              .map(
                (player) => `<div class="blocked-player-row" data-testid="blocked-player-${esc(player.blockedProfileId)}">
          <span>${esc(player.blockedNickname || "已封鎖的使用者")}</span>
          <button type="button" class="session-secondary" data-my-action="unblock" data-profile-id="${esc(
            player.blockedProfileId
          )}" data-testid="unblock-player-${esc(player.blockedProfileId)}">解除封鎖</button>
        </div>`
              )
              .join("")
          : '<p class="surface__copy">目前沒有封鎖任何人。</p>'
      }</div>
    </section>`
        : ""
    }
    ${
      authenticated
        ? `<section class="me-login-methods" aria-labelledby="me-login-methods-title">
      <div>
        <h2 id="me-login-methods-title">登入方式</h2>
        <p class="form-hint">連結後,兩種方式登入的都是同一個帳號。</p>
      </div>
      <div class="me-login-methods__rows">${loginMethodRowsMarkup({ linkedProviders, lineProviderId })}</div>
    </section>`
        : ""
    }
    <section class="me-service-links" aria-labelledby="me-service-title">
      <h2 id="me-service-title">站務</h2>
      <div>${supportHref ? `<a href="${esc(supportHref)}">聯絡支援</a>` : ""}<a href="/privacy.html">隱私權政策</a></div>
    </section>
    ${
      authenticated
        ? `<button type="button" class="me-sign-out-action" data-testid="me-sign-out">登出</button>`
        : ""
    }
  </div>`;
  wireAvatarFallbacks(root);
  root.querySelector('[data-testid="me-sign-in"]')?.addEventListener("click", onSignIn);
  root.querySelector('[data-testid="me-sign-out"]')?.addEventListener("click", onSignOut);
  for (const linkButton of root.querySelectorAll("[data-link-provider]")) {
    linkButton.addEventListener("click", () => {
      // 成功路徑是整頁 redirect;disabled 只擋 redirect 前的重複點擊,啟動失敗時還原。
      linkButton.disabled = true;
      Promise.resolve(onLinkProvider(linkButton.dataset.linkProvider)).finally(() => {
        if (linkButton.isConnected) linkButton.disabled = false;
      });
    });
  }
  root.querySelector('[data-testid="edit-profile"]')?.addEventListener("click", onEditProfile);
  // 批 D8:profile 卡整卡也是編輯入口(映射決策 2),與下方 .me-edit-profile 區塊的
  // 「編輯」鈕是同一個 onEditProfile、兩個進場點。
  root.querySelector('[data-testid="me-profile-edit-trigger"]')?.addEventListener("click", onEditProfile);
  root.querySelector('[data-my-action="toggle-visibility"]')?.addEventListener("click", (event) => {
    runMySessionAction(event.currentTarget, onTogglePlayerVisibility, root);
  });
  root.querySelector("[data-set-presence-sharing]")?.addEventListener("click", () => {
    void runPresenceSettingAction(root, () => onSetPresenceSharing(!presenceSettings.sharePresence));
  });
  root.querySelector("[data-open-to-greeting]")?.addEventListener("change", (event) => {
    const input = event.currentTarget;
    const previousChecked = !input.checked;
    void runPresenceSettingAction(root, () => onSetOpenToGreeting(input.checked)).then((saved) => {
      if (!saved) input.checked = previousChecked;
    });
  });
  root.querySelector("[data-enable-push]")?.addEventListener("click", () => {
    void runNotificationSettingAction(root, onEnablePush);
  });
  root.querySelectorAll("[data-notification-pref]").forEach((input) => {
    input.addEventListener("change", () => {
      const previousChecked = !input.checked;
      const preferences = {
        chatMessageEnabled: root.querySelector('[data-notification-pref="chatMessageEnabled"]')?.checked === true,
        hostNewRequestEnabled: root.querySelector('[data-notification-pref="hostNewRequestEnabled"]')?.checked === true,
        guestRequestReviewedEnabled: root.querySelector('[data-notification-pref="guestRequestReviewedEnabled"]')?.checked === true,
        guestInvitedEnabled: root.querySelector('[data-notification-pref="guestInvitedEnabled"]')?.checked === true,
        sessionReminderEnabled: root.querySelector('[data-notification-pref="sessionReminderEnabled"]')?.checked === true,
        sessionUpdatedEnabled: root.querySelector('[data-notification-pref="sessionUpdatedEnabled"]')?.checked === true,
      };
      void runNotificationSettingAction(root, () => onSaveNotificationPreferences(preferences)).then((saved) => {
        if (!saved) input.checked = previousChecked;
      });
    });
  });
  const courtPicker = root.querySelector("[data-notification-courts]");
  const courtBoxes = () => [...root.querySelectorAll("[data-notification-court]")];
  const subscribeAll = root.querySelector("[data-subscribe-all-courts]");
  const courtPickerToggle = root.querySelector("[data-court-picker-toggle]");
  const courtCountLabel = root.querySelector("[data-court-subscription-count]");
  const selectedCourtIds = () => courtBoxes().filter((box) => box.checked).map((box) => Number(box.value));
  const paintCourtSelection = (ids) => {
    const chosen = new Set(ids.map(Number));
    courtBoxes().forEach((box) => {
      box.checked = chosen.has(Number(box.value));
    });
    if (subscribeAll) subscribeAll.checked = notificationCourts.length > 0 && chosen.size === notificationCourts.length;
    if (courtCountLabel) courtCountLabel.textContent = `已訂閱 ${chosen.size} 座`;
  };
  const restoreCourtSelection = () => paintCourtSelection([...notification.courtIds]);
  const saveCourtSelection = (courtIds) => {
    if (courtIds.length > notificationCourts.length) {
      restoreCourtSelection();
      const error = root.querySelector("[data-notification-error]");
      if (error) {
        error.textContent = "訂閱球場數量超過目前可選的台北市球場。";
        error.hidden = false;
        // 這條是不經 runNotificationSettingAction 的早退分支,焦點沒有任何人托管;
        // 勾選框已被 restoreCourtSelection 復原,所以退到錯誤訊息而不是留在 body。
        if (canReceiveFocus(error)) error.focus({ preventScroll: true });
      }
      return;
    }
    paintCourtSelection(courtIds);
    void runNotificationSettingAction(root, () => onSaveCourtSubscriptions(courtIds)).then((saved) => {
      if (!saved) restoreCourtSelection();
    });
  };
  subscribeAll?.addEventListener("change", () => {
    saveCourtSelection(subscribeAll.checked ? notificationCourts.map((court) => Number(court.id)) : []);
  });
  courtPickerToggle?.addEventListener("click", () => {
    if (!courtPicker) return;
    const expanded = courtPicker.hidden;
    courtPicker.hidden = !expanded;
    courtPickerToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
  });
  courtPicker?.addEventListener("change", (event) => {
    if (!(event.target instanceof HTMLElement) || !event.target.matches("[data-notification-court]")) return;
    saveCourtSelection(selectedCourtIds());
  });
  // 解除封鎖獨立綁定，不沿用 My Sessions 的 [data-my-action] 委派迴圈——那個迴圈同時處理
  // 球局卡片動作，整段複製過來會把不屬於本頁的動作一併帶進來。
  root.querySelectorAll('[data-my-action="unblock"]').forEach((button) => {
    button.addEventListener("click", () => {
      runMySessionAction(button, () => onUnblockPlayer(button.dataset.profileId), root);
    });
  });
  syncPendingMySessionActions(root);
}

// 新球局不再提供「對拉」（它的語意併入「練球」）。編輯仍須接受四值：DB 的 CHECK 沒變，
// 既有的對拉球局若在這裡被擋下，主揪連改時間都存不回去。
const CREATE_PLAY_TYPES = new Set(["單打", "雙打", "練球"]);
const EDIT_PLAY_TYPES = new Set(["單打", "雙打", "對拉", "練球"]);
const TAIPEI_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const NOW_START_CREATE_GRACE_MS = 5 * 60 * 1000;

/** Convert a datetime-local value by the product's fixed Taipei wall time. */
export function taipeiLocalDateTimeToIso(value) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = "0", millisecondText = "0"] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(millisecondText.padEnd(3, "0"));
  const localUtcMs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const local = new Date(localUtcMs);
  if (
    local.getUTCFullYear() !== year ||
    local.getUTCMonth() !== month - 1 ||
    local.getUTCDate() !== day ||
    local.getUTCHours() !== hour ||
    local.getUTCMinutes() !== minute ||
    local.getUTCSeconds() !== second ||
    local.getUTCMilliseconds() !== millisecond
  ) {
    return null;
  }
  return new Date(localUtcMs - TAIPEI_UTC_OFFSET_MS).toISOString();
}

function taipeiDateTimeLocalValue(value = new Date(), { includeMilliseconds = false, includeSeconds = false } = {}) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const taipei = new Date(date.getTime() + TAIPEI_UTC_OFFSET_MS);
  const padded = (value) => String(value).padStart(2, "0");
  const minuteValue = `${taipei.getUTCFullYear()}-${padded(taipei.getUTCMonth() + 1)}-${padded(taipei.getUTCDate())}T${padded(
    taipei.getUTCHours()
  )}:${padded(taipei.getUTCMinutes())}`;
  const secondValue = `${minuteValue}:${padded(taipei.getUTCSeconds())}`;
  return includeMilliseconds ? `${secondValue}.${String(taipei.getUTCMilliseconds()).padStart(3, "0")}` : includeSeconds ? secondValue : minuteValue;
}

function ntrpEndpoint(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 && number <= 7 && Number.isInteger(number * 2) ? number : null;
}

/** Validate the form before it crosses the data API boundary. */
export function validateCreateSessionInput(input = {}, { now = new Date() } = {}) {
  const errors = {};
  const venueType = String(input.venueType ?? "booked");
  const courtIdValue = Number(input.courtId);
  const courtId = Number.isSafeInteger(courtIdValue) && courtIdValue > 0 ? courtIdValue : null;
  const candidateInputs =
    input.candidateCourtIds instanceof Set
      ? [...input.candidateCourtIds]
      : Array.isArray(input.candidateCourtIds)
        ? input.candidateCourtIds
        : input.candidateCourtIds == null || input.candidateCourtIds === ""
          ? []
          : [input.candidateCourtIds];
  const candidateCourtIds = candidateInputs.map(Number);
  const joinMode = String(input.joinMode ?? "instant");
  const playType = String(input.playType ?? "");
  const slotsTotal = Number(input.slotsTotal);
  const notes = String(input.notes ?? "");
  const feeNote = String(input.feeNote ?? "");
  const startAt = taipeiLocalDateTimeToIso(input.startAtLocal);
  const rangeEndInput = String(input.rangeEndLocal ?? "");
  const rangeEnd = rangeEndInput ? taipeiLocalDateTimeToIso(rangeEndInput) : null;
  const minText = String(input.ntrpMin ?? "").trim();
  const maxText = String(input.ntrpMax ?? "").trim();
  const hasRange = Boolean(minText || maxText);
  const ntrpMin = minText ? ntrpEndpoint(minText) : null;
  const ntrpMax = maxText ? ntrpEndpoint(maxText) : null;

  if (venueType !== "candidates" && courtId == null) errors.courtId = "請選擇台北市球場。";
  if (!["booked", "walk_on", "candidates"].includes(venueType)) errors.venueType = "請選擇場地類型。";
  if (venueType === "candidates") {
    const candidateIdsAreValid = candidateCourtIds.every((id) => Number.isSafeInteger(id) && id > 0);
    if (!candidateIdsAreValid || candidateCourtIds.length < 2 || candidateCourtIds.length > 3) {
      errors.candidateCourtIds = "候選局請選擇 2 到 3 座台北市球場。";
    } else if (new Set(candidateCourtIds).size !== candidateCourtIds.length) {
      errors.candidateCourtIds = "候選球場不可重複。";
    }
    if (!rangeEnd || !startAt || new Date(rangeEnd).getTime() <= new Date(startAt).getTime()) {
      errors.rangeEndLocal = "範圍結束時間必須晚於範圍起點。";
    }
  } else {
    if (candidateCourtIds.length) errors.candidateCourtIds = "候選球場只有候選局可以填寫。";
    if (rangeEndInput) errors.rangeEndLocal = "範圍結束時間只有候選局可以填寫。";
  }
  if (!["approval", "instant"].includes(joinMode)) errors.joinMode = "請選擇加入方式。";
  if (!CREATE_PLAY_TYPES.has(playType)) errors.playType = "請選擇一種打法。";
  if (!Number.isInteger(slotsTotal) || slotsTotal < 1 || slotsTotal > 3) errors.slotsTotal = "缺額請填 1 到 3 位。";
  if (!startAt || new Date(startAt).getTime() < new Date(now).getTime() - NOW_START_CREATE_GRACE_MS) {
    errors.startAtLocal = "開始時間不可早於現在 5 分鐘。";
  }
  if (notes.length > 500) errors.notes = "備註最多 500 字。";
  if (feeNote.length > 500) errors.feeNote = "費用說明最多 500 字。";
  if (hasRange && (!ntrpMin || !ntrpMax)) {
    if (!ntrpMin) errors.ntrpMin = "NTRP 請填 1.0 到 7.0，並以 0.5 為間距。";
    if (!ntrpMax) errors.ntrpMax = "NTRP 請填 1.0 到 7.0，並以 0.5 為間距。";
  }
  if (ntrpMin != null && ntrpMax != null && ntrpMin > ntrpMax) {
    errors.ntrpMax = "最高程度不可小於最低程度。";
  }

  return {
    errors,
    valid: Object.keys(errors).length === 0,
    value: {
      candidateCourtIds: venueType === "candidates" ? candidateCourtIds : null,
      courtId: venueType === "candidates" ? null : courtId,
      feeNote: feeNote.trim() || null,
      joinMode,
      ntrpMax: hasRange ? ntrpMax : null,
      ntrpMin: hasRange ? ntrpMin : null,
      notes: notes.trim() || null,
      playType,
      rangeEnd: venueType === "candidates" ? rangeEnd : null,
      slotsTotal,
      startAt,
      venueType,
    },
  };
}

/** Validate only the fields accepted by update_session. */
export function validateUpdateSessionInput(input = {}, { now = new Date() } = {}) {
  const errors = {};
  const courtIdValue = Number(input.courtId);
  const courtId = Number.isSafeInteger(courtIdValue) && courtIdValue > 0 ? courtIdValue : null;
  const feeNote = String(input.feeNote ?? "");
  const notes = String(input.notes ?? "");
  const minText = String(input.ntrpMin ?? "").trim();
  const maxText = String(input.ntrpMax ?? "").trim();
  const hasRange = Boolean(minText || maxText);
  const ntrpMin = minText ? ntrpEndpoint(minText) : null;
  const ntrpMax = maxText ? ntrpEndpoint(maxText) : null;
  const playType = String(input.playType ?? "");
  const slotsMissing = Number(input.slotsMissing);
  const startAt = taipeiLocalDateTimeToIso(input.startAtLocal);

  if (courtId == null) errors.courtId = "請選擇台北市球場。";
  if (!EDIT_PLAY_TYPES.has(playType)) errors.playType = "請選擇一種打法。";
  if (!Number.isInteger(slotsMissing) || slotsMissing < 1 || slotsMissing > 3) errors.slotsMissing = "缺額請填 1 到 3 位。";
  if (!startAt || new Date(startAt).getTime() < new Date(now).getTime() - NOW_START_CREATE_GRACE_MS) {
    errors.startAtLocal = "開始時間不可早於現在 5 分鐘。";
  }
  if (notes.length > 500) errors.notes = "備註最多 500 字。";
  if (feeNote.length > 500) errors.feeNote = "費用說明最多 500 字。";
  if (hasRange && (!ntrpMin || !ntrpMax)) {
    if (!ntrpMin) errors.ntrpMin = "NTRP 請填 1.0 到 7.0，並以 0.5 為間距。";
    if (!ntrpMax) errors.ntrpMax = "NTRP 請填 1.0 到 7.0，並以 0.5 為間距。";
  }
  if (ntrpMin != null && ntrpMax != null && ntrpMin > ntrpMax) errors.ntrpMax = "最高程度不可小於最低程度。";

  return {
    errors,
    valid: Object.keys(errors).length === 0,
    value: {
      courtId,
      feeNote: feeNote.trim() || null,
      notes: notes.trim() || null,
      ntrpMax: hasRange ? ntrpMax : null,
      ntrpMin: hasRange ? ntrpMin : null,
      playType,
      slotsMissing,
      startAt,
    },
  };
}

// 「目前開著的抽屜面板」查詢:collapsed 時 section 帶 hidden,回傳 null;
// v2 兩態下 open 就是唯一的開啟狀態,判準是 hidden 屬性。
function activeDrawerPanel(root) {
  const panel = root.querySelector("#nearby-sessions-list");
  return panel && !panel.hidden ? panel : null;
}

function rememberFocusedSessionCard(root) {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return;
  if (active.matches("#nearby-sessions-toggle")) {
    setDrawerFocusIntent(root, DRAWER_TOGGLE_FOCUS);
    return;
  }
  if (active.matches("[data-nearby-close], [data-testid='drawer-collapse']")) {
    // The loading fallback is only a temporary reachable target. Preserve the
    // original card/action intent through the next authoritative rerender.
    // ✕ 與把手都收斂回同一個 DRAWER_CLOSE_FOCUS 意圖。
    if (!drawerLoadingFocusFallbacks.has(root)) setDrawerFocusIntent(root, DRAWER_CLOSE_FOCUS);
    return;
  }
  if (DRAWER_ACTION_IDS.has(active.id)) {
    setDrawerFocusIntent(root, `${DRAWER_ACTION_FOCUS_PREFIX}${active.id}`);
    return;
  }
  const card = active.closest("[data-session-id]");
  if (card?.dataset.sessionId) setDrawerFocusIntent(root, card.dataset.sessionId);
}

function setDrawerFocusIntent(root, intent) {
  drawerLoadingFocusFallbacks.delete(root);
  drawerFocusIntents.set(root, intent);
}

function clearDrawerFocusIntent(root) {
  drawerLoadingFocusFallbacks.delete(root);
  drawerFocusIntents.delete(root);
}

function drawerRecoveryTarget(root) {
  const panel = activeDrawerPanel(root);
  if (!panel) return null;
  return (
    panel.querySelector("#drawer-map-retry") ??
    panel.querySelector("[data-session-id]") ??
    panel.querySelector("#discovery-expand") ??
    panel.querySelector("#discovery-subscribe") ??
    panel.querySelector("#discovery-reset") ??
    panel.querySelector("#discovery-first")
  );
}

function focusDrawerLoadingFallback(root) {
  const panel = activeDrawerPanel(root);
  // full 有「×」關閉鈕;half 沒有,退而求其次用「收合」鈕;兩者都沒有(理論上不會發生,
  // 面板都開著卻連 toggle 都找不到)才退到抽屜自己的摘要條。
  const target =
    panel?.querySelector("[data-nearby-close]") ??
    panel?.querySelector("[data-testid='drawer-collapse']") ??
    root.querySelector("#nearby-sessions-toggle");
  if (!target) return;
  drawerLoadingFocusFallbacks.add(root);
  target.focus({ preventScroll: true });
}

function restoreFocusedSessionCard(root) {
  if (!drawerFocusIntents.get(root)) return;
  requestAnimationFrame(() => {
    const focusIntent = drawerFocusIntents.get(root);
    if (!focusIntent) return;
    const active = document.activeElement;
    const hasNewSurface = Boolean(document.querySelector("#sheet-root .surface, #modal-root .surface"));
    if (hasNewSurface || (active?.isConnected && active !== document.body && active !== document.documentElement)) return;
    const toggle = root.querySelector("#nearby-sessions-toggle");
    if (focusIntent === DRAWER_TOGGLE_FOCUS) {
      if (toggle?.getAttribute("aria-expanded") === "false") {
        clearDrawerFocusIntent(root);
        toggle.focus({ preventScroll: true });
      } else if (toggle?.getAttribute("aria-expanded") === "true") {
        // v2:peek 在開啟後隱藏,開啟者的焦點交棒給抽屜的「✕」。非 modal 不設
        // trap,但鍵盤動線必須跟著進到新揭示的面板,不能落在 body。
        clearDrawerFocusIntent(root);
        activeDrawerPanel(root)?.querySelector("[data-nearby-close]")?.focus({ preventScroll: true });
      }
      return;
    }
    const panel = activeDrawerPanel(root);
    if (!panel) {
      clearDrawerFocusIntent(root);
      return;
    }
    if (focusIntent === DRAWER_CLOSE_FOCUS) {
      clearDrawerFocusIntent(root);
      (panel.querySelector("[data-nearby-close]") ?? panel.querySelector("[data-testid='drawer-collapse']"))?.focus({
        preventScroll: true,
      });
      return;
    }
    const actionId = focusIntent.startsWith(DRAWER_ACTION_FOCUS_PREFIX)
      ? focusIntent.slice(DRAWER_ACTION_FOCUS_PREFIX.length)
      : null;
    if (actionId) {
      const sameAction = DRAWER_ACTION_IDS.has(actionId) ? panel.querySelector(`#${actionId}`) : null;
      const nextAction = sameAction ?? drawerRecoveryTarget(root);
      if (!nextAction) {
        // Loading deliberately contains no stale card or recovery CTA. Keep
        // the intent for the authoritative result, but never leave keyboard
        // focus on document.body during that wait.
        focusDrawerLoadingFallback(root);
        return;
      }
      clearDrawerFocusIntent(root);
      nextAction.focus({ preventScroll: true });
      return;
    }
    const card = [...root.querySelectorAll("[data-session-id]")].find(
      (node) => String(node.dataset.sessionId) === String(focusIntent)
    );
    if (!card) {
      // During the loading render there is deliberately no stale card and no
      // retry action yet. Keep the intent through that transient state, then
      // hand focus to the first meaningful action in the final drawer state.
      const fallback = drawerRecoveryTarget(root);
      if (!fallback) {
        focusDrawerLoadingFallback(root);
        return;
      }
      clearDrawerFocusIntent(root);
      fallback.focus({ preventScroll: true });
      return;
    }
    clearDrawerFocusIntent(root);
    card.focus({ preventScroll: true });
  });
}

function taipeiDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "時間待確認";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: TAIPEI_TIME_ZONE,
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function ntrpRange(session) {
  // Number(null) is 0 and passes isFinite, so the empty range must be rejected first.
  if (session?.ntrpMin == null || session?.ntrpMax == null) return "NTRP 不限";
  const min = Number(session.ntrpMin);
  const max = Number(session.ntrpMax);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "NTRP 不限";
  if (min === max) return `NTRP ${min.toFixed(1)}`;
  return `NTRP ${min.toFixed(1)}–${max.toFixed(1)}`;
}

// 批 D9 backlog #1:記分板格眉已經是「NTRP」,格值若沿用 ntrpRange() 原輸出會
// 重複前綴、390px 折兩行;只在這個格值呼叫點剝掉前綴,ntrpRange() 本體與其他
// 呼叫點(session-card meta、聊天球局資訊列等)維持原字串不動。
function scoreboardNtrpValue(session) {
  return ntrpRange(session).replace(/^NTRP /, "");
}

function vacancyLabel(session) {
  const remaining = Number(session.slotsRemaining);
  if (!Number.isFinite(remaining) || remaining <= 0) return "已額滿";
  return `缺 ${remaining} 位`;
}

// ==== 批 D2:v2 時間磚與日期分組 helper(格式對照 dc.html L825/L845-846/L915-916) ====
const TAIPEI_WEEKDAY_WORD = ["日", "一", "二", "三", "四", "五", "六"];
const padTwo = (value) => String(value).padStart(2, "0");

function taipeiParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const taipei = new Date(date.getTime() + TAIPEI_UTC_OFFSET_MS);
  return {
    year: taipei.getUTCFullYear(),
    month: taipei.getUTCMonth() + 1,
    day: taipei.getUTCDate(),
    hour: taipei.getUTCHours(),
    minute: taipei.getUTCMinutes(),
    weekday: taipei.getUTCDay(),
  };
}

function taipeiClock(value) {
  const parts = taipeiParts(value);
  return parts ? `${padTwo(parts.hour)}:${padTwo(parts.minute)}` : "";
}

// 時間磚下行「08/10 一」(dc L825:DAY_OF 去括號版)
function taipeiTileDate(value) {
  const parts = taipeiParts(value);
  return parts ? `${padTwo(parts.month)}/${padTwo(parts.day)} ${TAIPEI_WEEKDAY_WORD[parts.weekday]}` : "";
}

function taipeiDayKey(value) {
  const parts = taipeiParts(value);
  return parts ? `${parts.year}-${padTwo(parts.month)}-${padTwo(parts.day)}` : "";
}

// 「今天」「明天」或「週X」——組標與 peek「最近」共用(dc DAY_WORD 的動態日期版)
function taipeiDayWord(value, now = new Date()) {
  const key = taipeiDayKey(value);
  if (!key) return "";
  if (key === taipeiDayKey(now)) return "今天";
  if (key === taipeiDayKey(new Date(now.getTime() + 86_400_000))) return "明天";
  const parts = taipeiParts(value);
  return `週${TAIPEI_WEEKDAY_WORD[parts.weekday]}`;
}

// 抽屜組標「今天 08/10(一)」(dc L915-916:`${DAY_WORD} ${DAY_OF}`)
function drawerGroupLabel(value, now = new Date()) {
  const parts = taipeiParts(value);
  if (!parts) return "時間待確認";
  return `${taipeiDayWord(value, now)} ${padTwo(parts.month)}/${padTwo(parts.day)}(${TAIPEI_WEEKDAY_WORD[parts.weekday]})`;
}

// 批 D7:訊息列表列與聊天室 header 副行共用(抽取規格 §3 r.sub / §4 chatSub 同一
// 語意,但只有 §4 給出完整算式:`${DAY_WORD} ${range} · 主揪 ${host}`)。dc 假設
// 每局都有明確的 start/end,本站資料模型只有候選局才有時段範圍(rangeEnd)、一般
// 已定案局只有單一 startAt——比照既有 sessionTimeTileMarkup 的 undecided 分支
// 判準,不虛構不存在的結束時間;日期詞前綴改用 D2 taipeiDayWord(今天/明天/週X)
// 而非時間磚上的月/日。
function sessionScheduleLabel(session) {
  const dayWord = taipeiDayWord(session?.startAt) || "時間待確認";
  const startClock = taipeiClock(session?.startAt);
  const undecided = String(session?.venueType) === "candidates" && !session?.decidedAt;
  const timeLabel = undecided && session?.rangeEnd ? `${startClock}–${taipeiClock(session.rangeEnd)}` : startClock;
  const hostLabel = String(session?.viewerRole ?? "").toLowerCase() === "host" ? "我" : session?.hostNickname || "主揪";
  return `${dayWord} ${timeLabel} · 主揪 ${hostLabel}`;
}

// 訊息列表 44px 頭像字——host 視角看自己主揪顯示「我」,否則主揪暱稱首字
// (dc §3:`hostInitial:s.mine?'我':s.host.slice(0,1)`)。
function sessionHostInitial(session) {
  if (String(session?.viewerRole ?? "").toLowerCase() === "host") return "我";
  const nickname = String(session?.hostNickname ?? "").trim();
  return nickname ? nickname.slice(0, 1) : "主";
}

function isOngoingSession(session) {
  const startAt = new Date(session?.startAt ?? "").getTime();
  return Number.isFinite(startAt) && startAt <= Date.now();
}

// 時間磚:一般=HH:MM;未定案候選=小時範圍「18–22」(dc L845-846)
function sessionTimeTileMarkup(session, venue, { detail = false, compact = false } = {}) {
  const parts = taipeiParts(session?.startAt);
  const undecided = venue?.undecidedCandidates === true;
  const endParts = undecided && session?.rangeEnd ? taipeiParts(session.rangeEnd) : null;
  const start = undecided && endParts && parts ? `${parts.hour}–${endParts.hour}` : taipeiClock(session?.startAt);
  const ongoing = !undecided && isOngoingSession(session);
  const modifiers = `${detail ? " time-tile--detail" : ""}${compact ? " time-tile--compact" : ""}${ongoing ? " time-tile--ongoing" : ""}`;
  return `<span class="time-tile${modifiers}"><span class="time-tile__start">${esc(start || "--:--")}</span><span class="time-tile__date">${esc(
    taipeiTileDate(session?.startAt) || "待確認"
  )}</span></span>`;
}

const VENUE_TYPE_LABELS = {
  booked: "已訂場",
  candidates: "候選局",
  walk_on: "現場等場",
};

function sessionVenuePresentation(session, courts = []) {
  const venueType = String(session?.venueType ?? "booked");
  const decided = venueType === "candidates" && Boolean(session?.decidedAt);
  if (venueType !== "candidates" || decided) {
    return {
      badge: decided ? "候選局 · 已定案" : (VENUE_TYPE_LABELS[venueType] ?? VENUE_TYPE_LABELS.booked),
      court: [session?.court, session?.courtDistrict].filter(Boolean).join(" · "),
      decided,
      time: taipeiDateTime(session?.startAt),
      undecidedCandidates: false,
    };
  }

  const catalogue = new Map((Array.isArray(courts) ? courts : []).map((court) => [String(court?.id), court]));
  const names = (Array.isArray(session?.candidateCourtIds) ? session.candidateCourtIds : [])
    .map((courtId, index) => catalogue.get(String(courtId))?.name ?? (index === 0 ? session?.court : null))
    .filter(Boolean);
  return {
    badge: VENUE_TYPE_LABELS.candidates,
    candidateNames: names,
    court: names.join("、") || session?.court || "候選球場待確認",
    decided: false,
    time: session?.rangeEnd
      ? `${taipeiDateTime(session.startAt)} 至 ${taipeiDateTime(session.rangeEnd)}`
      : taipeiDateTime(session?.startAt),
    undecidedCandidates: true,
  };
}

function completionLabel(session) {
  return session.hostProfileComplete ? "資料完整" : "資料未完成";
}

function nowStartSessionMarkup(session) {
  const startAt = new Date(session?.startAt ?? "").getTime();
  if (!Number.isFinite(startAt) || startAt > Date.now()) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - startAt) / 60_000));
  return `<span class="session-badge session-badge--ongoing">進行中</span><span class="session-ongoing-time">${esc(
    `已開打 ${minutes} 分鐘`
  )}</span>`;
}

// 批 D2:v2 球局卡(dc L153-171)——左時間磚+右欄(標題列/meta/底列)。
// 候選場次以標題後綴「等 N 館候選」+時段範圍表達(dc L845-846),不另掛 badge。
// courtLabel/hostLabel 兩個 helper 批 D6 抽出——My Sessions 薄卡列
// (mySessionBriefMarkup)沿用同一套候選局縮寫與主揪標籤慣例,避免兩處各自定義
// 同一格式。
function sessionCourtLabel(session, venue) {
  const candidateNames = venue.candidateNames ?? [];
  return venue.undecidedCandidates
    ? `${candidateNames[0] ?? "候選球場待確認"}${candidateNames.length > 1 ? ` 等 ${candidateNames.length} 館候選` : ""}`
    : session?.court || venue.court;
}

function sessionHostLabel(session) {
  const hostNtrpValue = Number(session?.hostNtrp);
  return `主揪 ${session.hostNickname}${Number.isFinite(hostNtrpValue) ? ` ${hostNtrpValue.toFixed(1)}` : ""}`;
}

function sessionCard(session, { compact = false, courts = [] } = {}) {
  const venue = sessionVenuePresentation(session, courts);
  const courtLabel = sessionCourtLabel(session, venue);
  const hostLabel = sessionHostLabel(session);
  const ongoing = !venue.undecidedCandidates && isOngoingSession(session);
  return `<button type="button" class="session-card${compact ? " session-card--compact" : ""}" data-testid="session-card" data-session-id="${esc(
    session.sessionId
  )}">
    ${sessionTimeTileMarkup(session, venue, { compact })}
    <span class="session-card__body">
      <span class="session-card__title">
        <span class="session-card__court">${esc(courtLabel)}</span>
        ${session.joinMode === "instant" ? '<span class="session-badge session-badge--instant">直接加入</span>' : ""}
        ${ongoing ? '<span class="session-badge session-badge--ongoing">進行中</span>' : ""}
      </span>
      <span class="session-card__meta">${esc(session.playType)} · ${esc(ntrpRange(session))} · ${esc(hostLabel)}</span>
      ${session.feeNote ? `<span class="session-card__meta">${esc(`費用：${session.feeNote}`)}</span>` : ""}
      <span class="session-card__foot">
        <span class="slots-brick">${esc(vacancyLabel(session))}</span>
        ${String(session?.venueType ?? "booked") === "booked" ? '<span class="booked-note">✓ 已訂場</span>' : ""}
        <span class="session-card__chevron" aria-hidden="true">›</span>
      </span>
    </span>
  </button>`;
}

function mySessionReason(session) {
  const status = String(session?.status ?? "").toLowerCase();
  const participantStatus = String(session?.viewerParticipantStatus ?? "").toLowerCase();
  // 用被動句、不點名主揪:與 202608060001 已上線的推播 body「你的加入申請已被婉拒。」
  // 逐字一致(定詞表的目的),同時保住 smoke.spec.js 那條「歷史不得出現『主揪婉拒』」的既有守衛。
  if (participantStatus === "declined") return "你的加入申請已被婉拒";
  if (participantStatus === "withdrawn") return "你已退出這一局";
  if (status === "played") return "本局已回報打成";
  if (status === "cancelled") return "主揪已取消這一局";
  if (status === "expired") return "這一局已逾期結束";
  return "這一局已無可進行的動作";
}

function mySessionActionButton(session, { action, label, testId }) {
  return `<button type="button" class="session-secondary" data-my-action="${esc(action)}" data-session-id="${esc(
    session.sessionId
  )}"${testId ? ` data-testid="${esc(testId)}"` : ""}>${esc(label)}</button>`;
}

// 批 C4-2:未讀數只改按鈕文案／aria-label,不動 canChat 這個既有結構化判斷點。
// 0（或缺欄位）維持原本純文字「群組聊天」,不額外掛 aria-label——accessible name
// 沿用文字內容,跟改動前完全一致。
function mySessionChatButtonMarkup(session) {
  const unreadCount = Math.max(0, Number(session.unreadMessageCount) || 0);
  const label = unreadCount > 0 ? `群組聊天（${unreadCount}）` : "群組聊天";
  const ariaLabel = unreadCount > 0 ? ` aria-label="${esc(`群組聊天，${unreadCount} 則未讀訊息`)}"` : "";
  return `<button type="button" class="session-primary" data-open-chat data-session-id="${esc(
    session.sessionId
  )}" data-testid="open-chat-${esc(session.sessionId)}"${ariaLabel}>${esc(label)}</button>`;
}

// 批 D6:狀態章四型(dc §4 逐字)+本站延伸「受邀中」(dc 沒有邀請概念)。segment
// 先判——「我主揪的」分頁全部卡片恆為「主揪」章(dc:「hosted tab 全部卡片恆為此
// 章」),不論 kind。history 卡若不是 declined、也不是仍開放中的 accepted(即
// cancelled/expired/played/withdrawn 落史),回傳空字串,不強套四型,交給既有
// .my-history-reason 說明——見抽取規格 §5/§6 決策。
function mySessionsCardChip(session, { segment, kind } = {}) {
  if (segment === "hosted") return `<span class="my-status-chip my-status-chip--host">主揪</span>`;
  if (kind === "invite") return `<span class="my-status-chip my-status-chip--info">受邀中</span>`;
  if (kind === "guest-request") return `<span class="my-status-chip my-status-chip--info">待確認</span>`;
  const participantStatus = String(session?.viewerParticipantStatus ?? "").toLowerCase();
  if (participantStatus === "declined") return `<span class="my-status-chip my-status-chip--danger">已婉拒</span>`;
  if (participantStatus === "accepted" && ["open", "full"].includes(String(session?.status ?? "").toLowerCase())) {
    return `<span class="my-status-chip my-status-chip--success">已確認</span>`;
  }
  return "";
}

// 薄卡列(dc §3 逐字):58px 時間磚+球場名(ellipsis)+meta「打法 · NTRP x–y ·
// 主揪 nick n.n」+右側狀態章。四種卡片(host-request/invite/guest-request/
// mySessionCard)共用此列當卡首,管理列各自保留在其下——對 dc「點卡開詳情」的
// 刻意架構偏離(D6 派工單決策 4)。
function mySessionBriefMarkup(session, { courts = [], segment = "joined", kind = null } = {}) {
  const venue = sessionVenuePresentation(session, courts);
  const courtLabel = sessionCourtLabel(session, venue);
  const meta = `${session.playType} · ${ntrpRange(session)} · ${sessionHostLabel(session)}`;
  return `<div class="my-session-brief">
    ${sessionTimeTileMarkup(session, venue, { compact: true })}
    <div class="my-session-brief__body">
      <p class="my-session-brief__court">${esc(courtLabel)}</p>
      <p class="my-session-brief__meta">${esc(meta)}</p>
    </div>
    ${mySessionsCardChip(session, { segment, kind })}
  </div>`;
}

function mySessionCard(session, { courts = [], highlightSessionId = null, segment = "joined" } = {}) {
  const hostCanManage = String(session.viewerRole) === "host" && Boolean(session.canCancel);
  const canChat = String(session.viewerParticipantStatus).toLowerCase() === "accepted";
  const actions = [
    `<button type="button" class="session-secondary" data-open-my-session data-session-id="${esc(session.sessionId)}">查看球局</button>`,
    canChat ? mySessionChatButtonMarkup(session) : "",
    hostCanManage && session.venueType === "candidates" && !Boolean(session.decidedAt)
      ? mySessionActionButton(session, { action: "decide", label: "定案場地與時間" })
      : "",
    hostCanManage && ["booked", "walk_on"].includes(session.venueType)
      ? mySessionActionButton(session, { action: "edit", label: "編輯球局" })
      : "",
    session.canCancel ? mySessionActionButton(session, { action: "cancel", label: "取消球局" }) : "",
    session.canWithdraw ? mySessionActionButton(session, { action: "withdraw", label: "取消參加" }) : "",
    session.canConfirmPlayed ? mySessionActionButton(session, { action: "played", label: "回報打成" }) : "",
    session.canConfirmAttendance && !session.viewerPlayedConfirmed
      ? mySessionActionButton(session, { action: "attendance", label: "確認到場" })
      : "",
    `<button type="button" class="session-tertiary" data-my-action="report-session" data-session-id="${esc(
      session.sessionId
    )}" data-testid="report-session-${esc(session.sessionId)}">檢舉此球局</button>`,
  ]
    .filter(Boolean)
    .join("");
  return `<article class="my-session-card"${String(session.sessionId) === String(highlightSessionId) ? ' data-created-session="true"' : ""}>
    ${mySessionBriefMarkup(session, { courts, segment })}
    <div class="my-session-card__actions">${actions}</div>
  </article>`;
}

function hostRequestCard({ participant, session }, courts = []) {
  return `<article class="my-action-card" data-testid="participant-row" data-participant-id="${esc(participant.participantId)}">
    <p class="my-action-card__eyebrow">新申請</p>
    ${mySessionBriefMarkup(session, { courts, kind: "host-request", segment: "hosted" })}
    <h3>${esc(participant.nickname)} · ${esc(formatNtrp(participant.ntrp))}</h3>
    <p>${esc((participant.playTypes ?? []).join("、") || "尚未填寫打法")} · ${esc((participant.homeCourts ?? []).join("、") || "尚未填寫常打球場")}</p>
    <div class="my-session-card__actions">
      <button type="button" class="session-primary" data-my-action="accept" data-session-id="${esc(session.sessionId)}" data-participant-id="${esc(
        participant.participantId
      )}" data-testid="accept-participant-${esc(participant.participantId)}">接受</button>
      <button type="button" class="session-secondary" data-my-action="decline" data-session-id="${esc(session.sessionId)}" data-participant-id="${esc(
        participant.participantId
      )}" data-testid="decline-participant-${esc(participant.participantId)}">婉拒</button>
      <button type="button" class="session-tertiary" data-my-action="report-participant" data-session-id="${esc(session.sessionId)}" data-profile-id="${esc(
        participant.profileId
      )}" data-testid="report-participant-${esc(participant.profileId)}">檢舉這位申請者</button>
    </div>
  </article>`;
}

function inviteCard({ session }, courts = []) {
  return `<article class="my-action-card" data-testid="invite-row" data-session-id="${esc(session.sessionId)}">
    <p class="my-action-card__eyebrow">邀請你加入</p>
    ${mySessionBriefMarkup(session, { courts, kind: "invite", segment: "joined" })}
    <p>缺 ${esc(session.slotsRemaining)} 位${session.notes ? ` · ${esc(session.notes)}` : ""}</p>
    <div class="my-session-card__actions">
      <button type="button" class="session-primary" data-my-action="accept-invite" data-session-id="${esc(session.sessionId)}" data-testid="accept-invite-${esc(session.sessionId)}">接受邀請</button>
      <button type="button" class="session-secondary" data-my-action="decline-invite" data-session-id="${esc(session.sessionId)}" data-testid="decline-invite-${esc(session.sessionId)}">婉拒</button>
      <button type="button" class="session-tertiary" data-my-action="report-session" data-session-id="${esc(session.sessionId)}">檢舉此球局</button>
    </div>
  </article>`;
}

function guestRequestCard({ session }, courts = [], { highlightSessionId = null } = {}) {
  // 批 C3-3:一個剛加入的 session 若還在等主揪審核(approval/NTRP 缺/範圍外三種
  // outcome),不會落在 upcoming,而是落在這裡——聚焦骨架必須也覆蓋這張卡,否則
  // CTA「查看我的球局」對這三種 outcome 會讓焦點掉回 body(mySessionCard 的
  // 聚焦骨架只查 upcoming,見 renderMySessionsPage 尾端)。
  return `<article class="my-action-card" data-guest-request-session="${esc(session.sessionId)}"${String(session.sessionId) === String(highlightSessionId) ? ' data-created-session="true"' : ""}>
    <p class="my-action-card__eyebrow">等待主揪回覆</p>
    ${mySessionBriefMarkup(session, { courts, kind: "guest-request", segment: "joined" })}
    <p>你的申請已送出，主揪回覆前可自行撤回。</p>
    <div class="my-session-card__actions">${mySessionActionButton(session, { action: "withdraw", label: "撤回申請" })}</div>
  </article>`;
}

function actionDescriptor(button) {
  return {
    action:
      button.dataset.myAction ?? (button.id === "my-sessions-refresh" ? "refresh" : ""),
    participantId: button.dataset.participantId ?? "",
    profileId: button.dataset.profileId ?? "",
    sessionId: button.dataset.sessionId ?? "",
  };
}

function actionDescriptorKey(descriptor) {
  return JSON.stringify([descriptor.action, descriptor.sessionId, descriptor.participantId, descriptor.profileId]);
}

function pendingMySessionActionState(root) {
  let state = mySessionActionStates.get(root);
  if (!state) {
    state = { pending: new Map(), scopeKey: null };
    mySessionActionStates.set(root, state);
  }
  return state;
}

function pendingMySessionActions(root) {
  return pendingMySessionActionState(root).pending;
}

function setMySessionActionScope(root, scopeKey) {
  const state = pendingMySessionActionState(root);
  if (state.scopeKey === scopeKey) return;
  // A render for another account/profile epoch must not inherit a stale
  // promise's disabled button or error surface from the previous account.
  mySessionActionStates.set(root, { pending: new Map(), scopeKey });
}

function sameActionDescriptor(left, right) {
  return (
    left?.action === right?.action &&
    left?.sessionId === right?.sessionId &&
    left?.participantId === right?.participantId &&
    left?.profileId === right?.profileId
  );
}

function currentMySessionActionButton(root, descriptor) {
  if (descriptor.action === "refresh") return root.querySelector("#my-sessions-refresh");
  return [...root.querySelectorAll("[data-my-action]")].find((button) => sameActionDescriptor(actionDescriptor(button), descriptor));
}

function syncPendingMySessionActions(root) {
  for (const descriptor of pendingMySessionActions(root).values()) {
    const button = currentMySessionActionButton(root, descriptor);
    if (button) button.disabled = true;
  }
}

function showMySessionActionError(root, message) {
  const error = root.querySelector("[data-my-sessions-error]");
  if (!error) return;
  error.textContent = message;
  error.hidden = false;
}

function focusMySessionActionResult(root, descriptor, { failed = false } = {}) {
  if (failed && ["accept-invite", "decline-invite"].includes(descriptor.action)) {
    const error = root.querySelector("[data-my-sessions-error]");
    if (error && !error.hidden) {
      error.focus({ preventScroll: true });
      return;
    }
  }
  const currentButton = currentMySessionActionButton(root, descriptor);
  if (currentButton && !currentButton.disabled) {
    currentButton.focus({ preventScroll: true });
    return;
  }
  if (failed) {
    const error = root.querySelector("[data-my-sessions-error]");
    if (error && !error.hidden) {
      error.focus({ preventScroll: true });
      return;
    }
  }
  const nextAction = root.querySelector("#my-needs-action [data-my-action]:not([disabled])");
  if (nextAction) {
    nextAction.focus({ preventScroll: true });
    return;
  }
  const sessionCard = [...root.querySelectorAll("[data-open-my-session]")].find(
    (button) => String(button.dataset.sessionId) === String(descriptor.sessionId)
  );
  if (sessionCard) {
    sessionCard.focus({ preventScroll: true });
    return;
  }
  root.querySelector("#my-sessions-refresh")?.focus({ preventScroll: true });
}

function runMySessionAction(button, callback, root) {
  if (!callback || button.disabled) return;
  const descriptor = actionDescriptor(button);
  const descriptorKey = actionDescriptorKey(descriptor);
  const pending = pendingMySessionActions(root);
  pending.set(descriptorKey, descriptor);
  button.disabled = true;
  root.querySelector("[data-my-sessions-error]")?.setAttribute("hidden", "");
  let restoreActionFocus = false;
  Promise.resolve()
    .then(callback)
    .catch((actionError) => {
      if (pendingMySessionActions(root) !== pending) return;
      showMySessionActionError(root, actionError?.message || "操作暫時無法完成，請稍後再試。");
      // reloadParticipation can replace the original button before an error
      // arrives. Resolve the semantic action again in the current DOM so the
      // keyboard user stays in the same operational context.
      restoreActionFocus = true;
    })
    .finally(() => {
      if (pendingMySessionActions(root) !== pending) return;
      pending.delete(descriptorKey);
      const currentButton = currentMySessionActionButton(root, descriptor);
      if (currentButton) currentButton.disabled = false;
      if (MY_SESSION_LIFECYCLE_ACTIONS.has(descriptor.action)) {
        focusMySessionActionResult(root, descriptor, { failed: restoreActionFocus });
      }
    });
}

function normalizedNotificationSettings(settings = {}) {
  const preferences = settings?.prefs ?? {};
  return {
    courtIds: new Set(
      (Array.isArray(settings?.courtIds) ? settings.courtIds : [])
        .map(Number)
        .filter((courtId) => Number.isSafeInteger(courtId) && courtId > 0)
    ),
    errorMessage: typeof settings?.errorMessage === "string" ? settings.errorMessage : "",
    prefs: {
      chatMessageEnabled: preferences.chatMessageEnabled !== false,
      guestInvitedEnabled: preferences.guestInvitedEnabled !== false,
      guestRequestReviewedEnabled: preferences.guestRequestReviewedEnabled !== false,
      hostNewRequestEnabled: preferences.hostNewRequestEnabled !== false,
      sessionReminderEnabled: preferences.sessionReminderEnabled !== false,
      sessionUpdatedEnabled: preferences.sessionUpdatedEnabled !== false,
    },
    pushStatus: typeof settings?.pushStatus === "string" ? settings.pushStatus : "idle",
    webPushConfigured: settings?.webPushConfigured === true,
  };
}

function notificationPushHint({ pushStatus, webPushConfigured }) {
  if (!webPushConfigured) return "這個環境尚未設定 Web Push 公鑰，暫時無法開啟推播。";
  if (pushStatus === "unsupported") return "此瀏覽器不支援 Web Push，暫時無法在這個裝置開啟推播。";
  if (pushStatus === "enabled") return "此裝置已開啟推播通知。";
  if (pushStatus === "denied") return "你已拒絕通知權限。請到瀏覽器或系統設定重新開啟通知後，再回來按「開啟推播」。";
  return "開啟後，只有這個裝置會收到你選擇的通知。";
}

const IOS_PUSH_INSTALL_HINT = "若使用 iPhone／iPad，請先在 Safari 的分享選單選擇「加入主畫面」，再從主畫面開啟本網站以使用推播通知。";

function successPushPromptMarkup(settings, { message, testId }) {
  const notification = normalizedNotificationSettings(settings);
  if (!notification.webPushConfigured || ["enabled", "unsupported"].includes(notification.pushStatus)) return "";
  return `<section class="success-push-prompt" data-success-push-prompt>
    <p>${esc(message)}</p>
    <button type="button" class="session-secondary" data-success-enable-push data-testid="${esc(testId)}">開啟推播</button>
    <p class="form-hint">${esc(IOS_PUSH_INSTALL_HINT)}</p>
    <p class="form-error" data-success-push-error role="alert" tabindex="-1" hidden></p>
  </section>`;
}

function wireSuccessPushPrompt(root, onEnablePush) {
  const prompt = root.querySelector("[data-success-push-prompt]");
  const button = prompt?.querySelector("[data-success-enable-push]");
  const error = prompt?.querySelector("[data-success-push-error]");
  button?.addEventListener("click", async () => {
    let terminalStatus = false;
    button.disabled = true;
    error.hidden = true;
    try {
      const status = await onEnablePush();
      if (!root.contains(prompt)) return;
      if (status === "enabled") {
        prompt.hidden = true;
        return;
      }
      if (status === "unsupported") {
        terminalStatus = true;
        button.textContent = "此瀏覽器不支援推播";
        error.textContent = notificationPushHint({ pushStatus: status, webPushConfigured: true });
        error.hidden = false;
        return;
      }
      if (status === "denied") {
        error.textContent = notificationPushHint({ pushStatus: status, webPushConfigured: true });
        error.hidden = false;
        error.focus({ preventScroll: true });
      }
    } catch (pushError) {
      if (!root.contains(prompt)) return;
      error.textContent = pushError?.message || "推播暫時無法開啟，請稍後再試。";
      error.hidden = false;
      error.focus({ preventScroll: true });
    } finally {
      if (root.contains(button) && !prompt.hidden && !terminalStatus) button.disabled = false;
    }
  });
}

function normalizedPresenceSettings(settings = {}) {
  return {
    locationStatus: typeof settings?.locationStatus === "string" ? settings.locationStatus : "idle",
    openToGreeting: settings?.openToGreeting === true,
    sharePresence: settings?.sharePresence === true,
  };
}

function presenceLocationHint({ locationStatus, sharePresence }) {
  if (!sharePresence) return "關閉後會立即移除你目前的在線狀態。";
  if (locationStatus === "denied") return "你已拒絕定位權限；請到瀏覽器或系統設定開啟定位後，再重新開啟分享。";
  if (locationStatus === "unsupported") return "此瀏覽器不支援定位，暫時無法更新在線狀態。";
  if (locationStatus === "unavailable") return "目前無法取得定位；恢復後會自動嘗試更新。";
  if (locationStatus === "update-failed") return "在線狀態暫時無法更新，請稍後再試。";
  if (locationStatus === "active") return "定位已開啟；只有在球場 100 公尺內才會顯示在線狀態。";
  return "開啟後會請求定位權限；只有在球場 100 公尺內才會顯示在線狀態。";
}

/**
 * 以語意描述通知控制項。六個事件偏好共用同一個 selector，靠 preference 區分，
 * 所以描述用物件而不是組出來的 selector 字串。
 */
function notificationControlDescriptor(control) {
  if (!(control instanceof HTMLElement)) return null;
  if (control.matches("[data-enable-push]")) return { selector: "[data-enable-push]" };
  if (control.matches("[data-subscribe-all-courts]")) return { selector: "[data-subscribe-all-courts]" };
  if (control.matches("[data-court-picker-toggle]")) return { selector: "[data-court-picker-toggle]" };
  if (control.matches("[data-notification-court]")) {
    return { courtId: control.value, selector: "[data-notification-court]" };
  }
  if (control.matches("[data-notification-pref]")) {
    return { preference: control.dataset.notificationPref, selector: "[data-notification-pref]" };
  }
  return null;
}

function findNotificationControl(root, descriptor) {
  if (!descriptor) return null;
  if (descriptor.courtId != null) {
    return (
      [...root.querySelectorAll(descriptor.selector)].find(
        (control) => String(control.value) === String(descriptor.courtId)
      ) ?? null
    );
  }
  if (descriptor.preference == null) return root.querySelector(descriptor.selector);
  return (
    [...root.querySelectorAll(descriptor.selector)].find(
      (control) => control.dataset.notificationPref === descriptor.preference
    ) ?? null
  );
}

async function runNotificationSettingAction(root, callback) {
  const controls = [...root.querySelectorAll("[data-notification-control]")];
  const unlockedControls = controls.filter((control) => !control.disabled);
  // 動作前記下焦點所在控制項的語意，動作後主動還原；與在線設定同一套托管方式，
  // 免得同一頁相鄰兩個區塊一個留得住焦點、一個留不住。
  const active = document.activeElement;
  const focusedDescriptor = root.contains(active) ? notificationControlDescriptor(active) : null;
  const error = root.querySelector("[data-notification-error]");
  unlockedControls.forEach((control) => {
    control.disabled = true;
  });
  if (error) {
    error.hidden = true;
    error.textContent = "";
  }
  let restoreFocus = false;
  try {
    await callback();
    restoreFocus = true;
    return true;
  } catch (cause) {
    if (error) {
      error.textContent = cause?.message || "通知設定暫時無法更新，請稍後再試。";
      error.hidden = false;
      error.focus({ preventScroll: true });
    }
    return false;
  } finally {
    // 回呼期間可能已重繪（enablePushNotifications 就會在自己的 await 之內同步重繪）。
    // 重繪後的 markup 才是 disabled 的權威——它依目前狀態重新算出，把它判定為停用的
    // 控制項強制解鎖，會讓「此裝置已開啟」的推播按鈕變回可以再按。
    const rerendered = unlockedControls.some((control) => !root.contains(control));
    if (!rerendered) {
      unlockedControls.forEach((control) => {
        control.disabled = false;
      });
    }
    if (restoreFocus && focusedDescriptor) {
      const current = document.activeElement;
      // 只接手被 disable 踢成無主的焦點；使用者自己移走的焦點不搶回來。
      const focusIsLoose = !(current instanceof HTMLElement) || current === document.body;
      const target = focusIsLoose ? findNotificationControl(root, focusedDescriptor) : null;
      if (canReceiveFocus(target)) target.focus({ preventScroll: true });
      else if (focusIsLoose) {
        // 勾到最後一座球場會讓清單自動收合，原目標隨即隱形；退回展開鈕才不會掉到 body。
        const toggle = root.querySelector("[data-court-picker-toggle]");
        if (canReceiveFocus(toggle)) toggle.focus({ preventScroll: true });
      }
    }
  }
}

/**
 * 以語意 selector 描述在線設定控制項。跨 await 只保留 selector、不保留節點，
 * 因為回呼期間整段 markup 可能被重繪抽換，舊節點會 detach。
 */
function presenceControlSelector(control) {
  if (!(control instanceof HTMLElement)) return null;
  if (control.matches("[data-set-presence-sharing]")) return "[data-set-presence-sharing]";
  if (control.matches("[data-open-to-greeting]")) return "[data-open-to-greeting]";
  return null;
}

async function runPresenceSettingAction(root, callback) {
  const controls = [...root.querySelectorAll("[data-presence-control]")];
  const unlockedControls = controls.filter((control) => !control.disabled);
  // 動作前記下焦點所在控制項的語意，動作後主動還原，不再依賴重繪路徑撿回焦點。
  const active = document.activeElement;
  const focusedSelector = root.contains(active) ? presenceControlSelector(active) : null;
  const error = root.querySelector("[data-presence-error]");
  unlockedControls.forEach((control) => {
    control.disabled = true;
  });
  if (error) {
    error.hidden = true;
    error.textContent = "";
  }
  let restoreFocus = false;
  try {
    const outcome = await callback();
    // 回呼回 false 代表被 gate 攔截並開了補件 sheet，焦點歸該 sheet 管，這裡不接手。
    restoreFocus = outcome !== false;
    return outcome !== false;
  } catch (cause) {
    if (error) {
      error.textContent = cause?.message || "在線設定暫時無法更新，請稍後再試。";
      error.hidden = false;
    }
    // 失敗後的落點與「我」頁其他設定一致:留在剛操作的控制項。role="alert" 本來就會
    // 自動朗讀,再把焦點搬過去會讓使用者得先走回來才能重試;控制項接不住時才退到
    // 錯誤訊息(見 finally)。原本這裡直接 error.focus(),同一頁兩種落點。
    restoreFocus = true;
    return false;
  } finally {
    // 同 runNotificationSettingAction：重繪後的 markup 是 disabled 的權威。在線設定的
    // 兩個控制項目前沒有條件 disabled，但 updatePresenceSharing 一樣會在 await 之內同步
    // 重繪，規則統一才不會在往後加上條件 disabled 時無聲踩雷。
    const rerendered = unlockedControls.some((control) => !root.contains(control));
    if (!rerendered) {
      unlockedControls.forEach((control) => {
        control.disabled = false;
      });
    }
    if (restoreFocus && focusedSelector) {
      const current = document.activeElement;
      // 只接手被 disable 踢成無主的焦點；使用者自己移走的焦點不搶回來。
      const focusIsLoose = !(current instanceof HTMLElement) || current === document.body;
      const target = focusIsLoose ? root.querySelector(focusedSelector) : null;
      if (canReceiveFocus(target)) target.focus({ preventScroll: true });
      else if (focusIsLoose && error && !error.hidden && canReceiveFocus(error)) {
        // 控制項接不住(被收合、被移除)時才退到錯誤訊息,不讓焦點留在 body。
        error.focus({ preventScroll: true });
      }
    }
  }
}

// 批 D6:kind 就決定我主揪的/我報名的(host-request 恆為 hosted,其餘 needsAction
// 都是 joined,理由見抽取規格 §6:hostedItems 只來自 st.hosted,joinedItems 只來自
// st.applied);upcoming/history 兩個扁平陣列改看 session.viewerRole,因為同一顆
// session 物件本身就標了 viewerRole,不需要另外查表。
function mySessionsSplitBySegment(groups) {
  const needsAction = Array.isArray(groups?.needsAction) ? groups.needsAction : [];
  const upcoming = Array.isArray(groups?.upcoming) ? groups.upcoming : [];
  const history = Array.isArray(groups?.history) ? groups.history : [];
  const isHostRole = (session) => String(session?.viewerRole).toLowerCase() === "host";
  return {
    hosted: {
      history: history.filter(isHostRole),
      needsAction: needsAction.filter((entry) => entry.kind === "host-request"),
      upcoming: upcoming.filter(isHostRole),
    },
    joined: {
      history: history.filter((session) => !isHostRole(session)),
      needsAction: needsAction.filter((entry) => entry.kind !== "host-request"),
      upcoming: upcoming.filter((session) => !isHostRole(session)),
    },
  };
}

// 聚焦目標(剛建立／剛加入的球局)決定初始分頁該切去哪——created 場合對齊 dc
// gotoMine(host→我主揪的),join 場合維持 dc 初值(guest→我報名的,見抽取規格
// §6)。同一個 sessionId 只會落在 needsAction 或 upcoming/history 其中一組,故找
// 到第一個相符就回傳其角色。
function mySessionsFocusRole(groups, sessionId) {
  if (sessionId == null) return null;
  const id = String(sessionId);
  const needsAction = Array.isArray(groups?.needsAction) ? groups.needsAction : [];
  const needsActionHit = needsAction.find((entry) => String(entry?.session?.sessionId) === id);
  if (needsActionHit) return needsActionHit.kind === "host-request" ? "host" : "guest";
  const upcoming = Array.isArray(groups?.upcoming) ? groups.upcoming : [];
  const history = Array.isArray(groups?.history) ? groups.history : [];
  const flatHit = [...upcoming, ...history].find((session) => String(session?.sessionId) === id);
  if (!flatHit) return null;
  return String(flatHit.viewerRole).toLowerCase() === "host" ? "host" : "guest";
}

// segmented 分頁態掛在 root(WeakMap),同一顆 my-sessions-root 節點在 show/hide
// 之間沿用(main.js 只切 hidden,不拆 innerHTML)。lastFocusSessionId 只在「這次
// focusSessionId 跟上次不同」時觸發自動切頁,避免使用者手動切走之後,同一個
// focus 目標的後續重繪(例如 refreshMySessions 完成後再 render 一次)把分頁搶回去。
function mySessionsSegmentState(root) {
  let state = mySessionsSegmentStates.get(root);
  if (!state) {
    state = { lastFocusSessionId: undefined, segment: "joined" };
    mySessionsSegmentStates.set(root, state);
  }
  return state;
}

function resolveMySessionsSegment(root, groups, focusSessionId) {
  const state = mySessionsSegmentState(root);
  if (focusSessionId != null && String(focusSessionId) !== String(state.lastFocusSessionId)) {
    state.segment = mySessionsFocusRole(groups, focusSessionId) === "host" ? "hosted" : "joined";
  }
  state.lastFocusSessionId = focusSessionId ?? null;
  return state.segment;
}

// segmented 控件(dc §2 逐字):我報名的／我主揪的+mono 計數。計數只算該分頁
// 非歷史卡(needsAction+upcoming)——dc 原型沒有歷史概念,這是抽取規格 §2 的映射
// 延伸。
function mySessionsSegmentedMarkup({ activeSegment, hostedCount, joinedCount }) {
  const joinedActive = activeSegment !== "hosted";
  return `<div class="my-sessions-v2__segmented" role="group" aria-label="我的球局分頁">
    <button type="button" class="my-sessions-v2__seg-btn${joinedActive ? " is-active" : ""}" data-my-sessions-seg="joined" data-testid="my-sessions-seg-joined" aria-pressed="${joinedActive}">我報名的 <span class="my-sessions-v2__seg-count">${esc(joinedCount)}</span></button>
    <button type="button" class="my-sessions-v2__seg-btn${joinedActive ? "" : " is-active"}" data-my-sessions-seg="hosted" data-testid="my-sessions-seg-hosted" aria-pressed="${!joinedActive}">我主揪的 <span class="my-sessions-v2__seg-count">${esc(hostedCount)}</span></button>
  </div>`;
}

// 空狀態(dc §5 逐字):只在呼叫端判定該分頁非歷史卡為 0 時插入,不取代既有
// #my-needs-action/#my-upcoming-sessions 各自的「目前沒有…」提示——那兩個容器
// id 是既有測試依賴的錨點,任何分頁都必須存在,見 D6 派工單決策 3。
function mySessionsEmptyStateMarkup(segment) {
  const hosted = segment === "hosted";
  const text = hosted ? "還沒主揪過球局。開一場，讓球友來找你。" : "還沒報名任何球局。到地圖上找一場程度相近的吧。";
  const actionLabel = hosted ? "開球局" : "去逛地圖";
  const actionAttr = hosted ? "data-my-sessions-empty-create" : "data-my-sessions-empty-map";
  return `<div class="my-sessions-v2__empty" data-my-sessions-empty>
    <p class="my-sessions-v2__empty-text">${esc(text)}</p>
    <button type="button" class="session-primary my-sessions-v2__empty-btn" ${actionAttr}>${esc(actionLabel)}</button>
  </div>`;
}

// fix round 1(驗收退回):showChrome=false 時(該分頁非歷史卡=0、v2 空狀態框
// 即將顯示)不渲染標題列與「目前沒有…」佔位段落,只留空的 #my-needs-action 容器
// ——否則空狀態框上方會疊出「目前沒有需要立即處理的事項。」等三段舊佔位文字,
// 跟 dc 空分頁只見一個 dashed 框的意圖衝突。容器 id 保留是既有測試與 focus 邏輯
// 的錨點,不可省略。showChrome=true(分頁至少有一張非歷史卡,即「部分空」)時
// 語意完全不變。
function mySessionsNeedsActionSection(entries, { courts, focusSessionId, showChrome = true }) {
  if (!showChrome) return `<div id="my-needs-action" class="my-sessions-list"></div>`;
  return `<section class="my-sessions-section" aria-labelledby="my-needs-action-title">
      <div class="my-sessions-section__head"><h2 id="my-needs-action-title">需要你處理</h2><span>${esc(entries.length)} 項</span></div>
      <div id="my-needs-action" class="my-sessions-list">${
        entries.length
          ? entries
              .map((entry) =>
                entry.kind === "host-request"
                  ? hostRequestCard(entry, courts)
                  : entry.kind === "invite"
                    ? inviteCard(entry, courts)
                    : guestRequestCard(entry, courts, { highlightSessionId: focusSessionId })
              )
              .join("")
          : '<p class="surface__copy">目前沒有需要立即處理的事項。</p>'
      }</div>
    </section>`;
}

function mySessionsUpcomingSection(sessions, { courts, focusSessionId, segment, showChrome = true }) {
  if (!showChrome) return `<div id="my-upcoming-sessions" class="my-sessions-list"></div>`;
  return `<section class="my-sessions-section" aria-labelledby="my-upcoming-sessions-title">
      <div class="my-sessions-section__head"><h2 id="my-upcoming-sessions-title">即將打球</h2><span>${esc(sessions.length)} 場</span></div>
      <div id="my-upcoming-sessions" class="my-sessions-list">${
        sessions.length
          ? sessions.map((session) => mySessionCard(session, { courts, highlightSessionId: focusSessionId, segment })).join("")
          : '<p class="surface__copy">目前沒有即將打球的球局。</p>'
      }</div>
    </section>`;
}

// 歷史區塊獨立判斷:該分頁 history 一有卡就「照常顯示」(即使 needsAction/
// upcoming 都空、上方正掛著空狀態框),只有 history 本身也是空的且 showChrome
// 為 false 時才收成空容器——這是跟另外兩段刻意不同的地方,不能套同一條件。
function mySessionsHistorySection(sessions, { courts, focusSessionId, segment, showChrome = true }) {
  if (!sessions.length && !showChrome) return `<div id="my-history" class="my-sessions-list"></div>`;
  return `<section class="my-sessions-section" aria-labelledby="my-history-title">
      <div class="my-sessions-section__head"><h2 id="my-history-title">過去紀錄</h2><span>${esc(sessions.length)} 場</span></div>
      <div id="my-history" class="my-sessions-list">${
        sessions.length
          ? sessions
              .map(
                (session) =>
                  `${mySessionCard(session, { courts, highlightSessionId: focusSessionId, segment })}<p class="my-history-reason">${esc(
                    mySessionReason(session)
                  )}</p>`
              )
              .join("")
          : '<p class="surface__copy">尚無過去紀錄。</p>'
      }</div>
    </section>`;
}

/** Render the private, action-first My Sessions destination. */
export function renderMySessionsPage(root, options = {}) {
  const {
    courts = [],
    createdSessionId = null,
    // 批 C3-3:createdSessionId 泛化拆參。createdSessionId 只驅動 create 專屬的
    // 「球局已建立」文案與推播 prompt(reason==="created" 時才傳);highlightSessionId
    // 純做卡片聚焦比對,create/join 兩種 reason 都可以傳,語意中性。未傳
    // highlightSessionId 時 fallback 回 createdSessionId,向後相容既有呼叫端。
    highlightSessionId = null,
    groups = { history: [], needsAction: [], needsActionCount: 0, upcoming: [] },
    onAccept = () => {},
    onAcceptInvite = () => {},
    onBack = () => {},
    onCancel = () => {},
    onConfirmAttendance = () => {},
    onCreatedSessionFocus = () => true,
    onCreateSession = () => {},
    onDecline = () => {},
    onDeclineInvite = () => {},
    onDecide = () => {},
    onEdit = () => {},
    onEnablePush = () => {},
    onMarkPlayed = () => {},
    onOpenChat = () => {},
    onOpenSession = () => {},
    onRefresh = () => {},
    onReportParticipant = () => {},
    onReportSession = () => {},
    onSignIn = () => {},
    onWithdraw = () => {},
    authenticated = false,
    actionScopeKey = null,
    status = "idle",
    errorMessage = "",
    notificationSettings = {},
  } = options;
  const needsAction = Array.isArray(groups.needsAction) ? groups.needsAction : [];
  const upcoming = Array.isArray(groups.upcoming) ? groups.upcoming : [];
  const notification = normalizedNotificationSettings(notificationSettings);
  const focusSessionId = highlightSessionId ?? createdSessionId;
  const activeSegment = resolveMySessionsSegment(root, groups, focusSessionId);
  const split = mySessionsSplitBySegment(groups);
  const joinedCount = split.joined.needsAction.length + split.joined.upcoming.length;
  const hostedCount = split.hosted.needsAction.length + split.hosted.upcoming.length;
  const active = activeSegment === "hosted" ? split.hosted : split.joined;
  const activeNonHistoryCount = active.needsAction.length + active.upcoming.length;
  // fix round 1(驗收退回):v2 空狀態框跟三段舊佔位文字疊在一起——showEmptyState
  // 同時控制「要不要畫空狀態框」與「要不要抑制 needsAction/upcoming/history 的
  // 標題列+佔位段落」,兩者是同一個判斷,不能分開算。
  const showEmptyState = authenticated && activeNonHistoryCount === 0;
  setMySessionActionScope(root, actionScopeKey);
  root.innerHTML = `
    <div class="my-sessions-v2__head">
      <p class="my-sessions-v2__eyebrow">MY MATCHES</p>
      <div class="my-sessions-v2__head-row">
        <h1 tabindex="-1" data-my-sessions-heading class="my-sessions-v2__title">我的球局</h1>
        <div class="my-sessions-v2__tools"><button type="button" id="my-sessions-refresh" class="session-secondary my-sessions-v2__tool-btn">重新整理</button><button type="button" class="session-secondary my-sessions-v2__tool-btn" data-my-sessions-back>回到地圖</button></div>
      </div>
      ${mySessionsSegmentedMarkup({ activeSegment, hostedCount, joinedCount })}
    </div>
    <p class="surface__copy">${
      createdSessionId ? "球局已建立；主揪身分已加入這一局。" : "依目前需要處理的事項與球局時間排序。"
    }</p>
    ${
      createdSessionId
        ? successPushPromptMarkup(notification, {
            message: "開啟推播，才不會錯過球友的新申請與球局變更。",
            testId: "created-session-enable-push",
          })
        : ""
    }
    <p class="my-sessions-message" data-my-sessions-status role="status" aria-live="polite"${status === "loading" ? "" : " hidden"}>正在更新我的球局…</p>
    <p class="form-error" data-my-sessions-error role="alert" tabindex="-1"${errorMessage ? "" : " hidden"}>${esc(errorMessage)}</p>
    ${
      authenticated
        ? ""
        : '<section class="my-sessions-empty" aria-label="登入後查看我的球局"><h2>登入後查看與管理你的球局</h2><p class="surface__copy">你可以在這裡處理申請、進入球局群組聊天，以及保留過去紀錄。</p><button type="button" class="session-primary" data-my-sessions-sign-in>登入</button></section>'
    }
    ${mySessionsNeedsActionSection(active.needsAction, { courts, focusSessionId, showChrome: !showEmptyState })}
    ${mySessionsUpcomingSection(active.upcoming, { courts, focusSessionId, segment: activeSegment, showChrome: !showEmptyState })}
    ${showEmptyState ? mySessionsEmptyStateMarkup(activeSegment) : ""}
    ${mySessionsHistorySection(active.history, { courts, focusSessionId, segment: activeSegment, showChrome: !showEmptyState })}`;

  root.querySelector("[data-my-sessions-back]")?.addEventListener("click", onBack);
  root.querySelector("[data-my-sessions-sign-in]")?.addEventListener("click", onSignIn);
  wireSuccessPushPrompt(root, onEnablePush);
  root.querySelector("#my-sessions-refresh")?.addEventListener("click", () => runMySessionAction(root.querySelector("#my-sessions-refresh"), onRefresh, root));
  root.querySelector("[data-my-sessions-empty-map]")?.addEventListener("click", onBack);
  root.querySelector("[data-my-sessions-empty-create]")?.addEventListener("click", onCreateSession);
  root.querySelectorAll("[data-my-sessions-seg]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextSegment = button.dataset.mySessionsSeg;
      const state = mySessionsSegmentState(root);
      if (state.segment === nextSegment) return;
      state.segment = nextSegment;
      renderMySessionsPage(root, options);
      root.querySelector(`[data-my-sessions-seg="${nextSegment}"]`)?.focus({ preventScroll: true });
    });
  });
  root.querySelectorAll("[data-open-my-session]").forEach((button) => {
    button.addEventListener("click", () => onOpenSession(button.dataset.sessionId));
  });
  root.querySelectorAll("[data-open-chat]").forEach((button) => {
    button.addEventListener("click", () => onOpenChat(button.dataset.sessionId));
  });
  root.querySelectorAll("[data-my-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const sessionId = button.dataset.sessionId;
      const participantId = button.dataset.participantId;
      const profileId = button.dataset.profileId;
      const callbacks = {
        accept: () => onAccept(sessionId, participantId),
        "accept-invite": () => onAcceptInvite(sessionId),
        attendance: () => onConfirmAttendance(sessionId),
        cancel: () => onCancel(sessionId),
        decline: () => onDecline(sessionId, participantId),
        "decline-invite": () => onDeclineInvite(sessionId),
        decide: () => onDecide(sessionId),
        edit: () => onEdit(sessionId),
        played: () => onMarkPlayed(sessionId),
        "report-participant": () => onReportParticipant(sessionId, profileId),
        "report-session": () => onReportSession(sessionId),
        withdraw: () => onWithdraw(sessionId),
      };
      if (button.dataset.myAction === "withdraw") {
        const actionScope = pendingMySessionActions(root);
        try {
          const confirmation = callbacks.withdraw();
          Promise.resolve(confirmation).catch((actionError) => {
            if (pendingMySessionActions(root) !== actionScope) return;
            showMySessionActionError(root, actionError?.message || "操作暫時無法完成，請稍後再試。");
          });
        } catch (actionError) {
          showMySessionActionError(root, actionError?.message || "操作暫時無法完成，請稍後再試。");
        }
        return;
      }
      runMySessionAction(button, callbacks[button.dataset.myAction], root);
    });
  });
  syncPendingMySessionActions(root);
  // 批 C3-3:聚焦目標可能落在兩個互斥的清單之一——accepted(instant 加入／host
  // 自己)在 upcoming,走 mySessionCard 的「查看球局」鈕;仍在等主揪審核的三種
  // outcome(approval／NTRP 缺／範圍外)在 needsAction 的 guest-request,走
  // guestRequestCard 的「撤回申請」鈕(卡片內唯一可聚焦元素)。同一個 sessionId
  // 只會出現在其中一個群組,兩個 selector 用逗號並列,只有比對得上的那張卡會真的
  // 帶有 data-created-session。批 D6:這裡查的 needsAction/upcoming 是未過濾的
  // 完整 groups(不是 active.*)——resolveMySessionsSegment 已保證聚焦目標所在的
  // segment 就是 activeSegment,DOM 裡一定找得到,不需要重新過濾一次。
  const focusInUpcoming = upcoming.some((session) => String(session.sessionId) === String(focusSessionId));
  const focusInNeedsAction = needsAction.some(
    (entry) => entry.kind === "guest-request" && String(entry.session.sessionId) === String(focusSessionId)
  );
  if (focusSessionId && (focusInUpcoming || focusInNeedsAction)) {
    requestAnimationFrame(() => {
      const target = root.querySelector(
        "[data-created-session] [data-open-my-session], [data-created-session] [data-my-action='withdraw']"
      );
      if (!target || !onCreatedSessionFocus()) return;
      target.focus({ preventScroll: true });
    });
  }
}

function wireSessionCards(root, onOpenSession) {
  root.querySelectorAll("[data-session-id]").forEach((card) => {
    card.addEventListener("click", () => onOpenSession(card.dataset.sessionId));
  });
}

// full 才是 modal:push isolation、顯示 backdrop。half 完全不呼叫這裡的 isModal=true
// 分支——地圖、header、bottom nav 在半開時維持可互動。
// 批 D2:v2 抽屜是兩態(peek↔open)非 modal(dc L135-176 無 scrim、地圖可互動),
// full/dialog/isolation 機制隨 v2 退場;collapse 的焦點還原邏輯沿用 C2。
function wireDrawerInteractions(root, { drawerState = "collapsed", onToggle }) {
  drawerBindings.get(root)?.abort();
  const bindings = new AbortController();
  drawerBindings.set(root, bindings);
  const { signal } = bindings;
  // 收合的共用出口:✕/把手/Escape/下滑都收斂到同一個 collapse(),回 collapsed 後
  // 把焦點還給 peek 列——沿用 C2 的讓位規則(新 surface 或使用者已移動焦點時不搶)。
  const collapse = () => {
    onToggle("collapsed");
    requestAnimationFrame(() => {
      const toggle = root.querySelector("#nearby-sessions-toggle");
      const active = document.activeElement;
      const hasNewSurface = Boolean(document.querySelector("#sheet-root .surface, #modal-root .surface"));
      // A user can move straight to a map pin before this deferred focus
      // restoration runs. Never steal that newer target (or a newly opened
      // sheet) just to restore the drawer's default opener.
      if (!toggle || toggle.getAttribute("aria-expanded") !== "false" || hasNewSurface) return;
      if (active?.isConnected && active !== document.body && active !== document.documentElement) return;
      toggle.focus({ preventScroll: true });
    });
  };

  if (drawerState === "open") {
    root.querySelector("[data-nearby-close]")?.addEventListener("click", collapse, { signal });
    root.querySelector('[data-testid="drawer-collapse"]')?.addEventListener("click", collapse, { signal });
    // half 不是 dialog,沒有 focus trap 可以攔 Escape;監聽要掛在 document 上才能不管
    // 焦點在哪都收得到。掛在 document 上就必須自己防兩件事:(1) 上層還有 sheet/dialog
    // 開著時不能搶著收合——sheets.js 的 Escape handler 用 capture+stopPropagation,
    // 正常情況這裡根本收不到事件,但仍加一層明確檢查,不依賴事件相位這種隱性順序；
    // (2) 只在目前確實是 half 時動作,避免殘留 binding 誤觸發(靠每次重繪都
    // abort()+重綁,天然滿足)。
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Escape") return;
        if (document.querySelector("#sheet-root .surface, #modal-root .surface")) return;
        // level popover 的 capture-phase Escape 攔截(main.js wireFilters)關閉它自己時
        // 一定會呼叫 preventDefault(),不管 stopPropagation 那步有沒有真的擋下這次事件
        // 往下傳。改看 event.defaultPrevented(「這顆 Escape 已被上層消費」)而不是
        // popover.hidden 目前的值——popover 那層 handler 在呼叫 stopPropagation 之前
        // 就已經把 hidden 設成 true,若只查 hidden 狀態,一旦上層的 stopPropagation 失效
        // 或被移除,這裡讀到的 hidden 早就是 true,guard 反而會誤判「popover 本來就關著」
        // 而放行收合,防線形同虛設。defaultPrevented 是這次事件物件自帶的旗標,不受
        // popover 當下狀態或呼叫順序影響,才是真正獨立於第一層的第二道防線。
        if (event.defaultPrevented) return;
        event.preventDefault();
        collapse();
      },
      { signal }
    );
  }

  let pointerStart = null;
  root.addEventListener(
    "pointerdown",
    (event) => {
      pointerStart = event.clientY;
    },
    { signal }
  );
  root.addEventListener(
    "pointerup",
    (event) => {
      if (pointerStart == null) return;
      const delta = pointerStart - event.clientY;
      pointerStart = null;
      // v2 兩態:上滑開、下滑收(dc 原型無手勢,工程保留 C2 的手勢入口),
      // 閾值沿用既有 44px。狀態取自這次 render 綁定當下的 drawerState closure。
      if (delta > 44) {
        if (drawerState === "collapsed") onToggle("open");
      } else if (delta < -44) {
        if (drawerState === "open") collapse();
      }
    },
    { signal }
  );
}

// 抽屜摘要文字的單一來源。main.js 的 renderDiscovery 也要用同一句文案更新一顆
// drawer 重建範圍之外的持久 live region(見 index.html #nearby-sessions-count-status),
// 兩處若各自組字串,文案改一邊漏另一邊不會有任何測試或型別錯誤能抓到。
export function nearbySessionsSummaryText(count, hasUserLocation) {
  return `${hasUserLocation ? "附近" : "這個地圖範圍內"} ${count} 場可加入`;
}

// 批 D2:抽屜清單按日期分組(dc L915-916):組標=詞+日期、延伸線、右側 mono 數量;
// 空組直接不出現。組間依日期升冪、組內依開始時間升冪。
function drawerGroupsMarkup(sessions, courts) {
  const groups = new Map();
  for (const session of sessions) {
    const key = taipeiDayKey(session.startAt) || "unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(session);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, items]) => {
      const sorted = [...items].sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)));
      return `<div class="session-group">
        <span class="session-group__label">${esc(drawerGroupLabel(sorted[0].startAt))}</span>
        <span class="session-group__line" aria-hidden="true"></span>
        <span class="session-group__count">${sorted.length} 場</span>
      </div>
      ${sorted.map((session) => sessionCard(session, { courts })).join("")}`;
    })
    .join("");
}

/** Render the map-bound peek strip and its two-state (collapsed/open) drawer. */
export function renderNearbySessionsDrawer(
  root,
  {
    sessions = [],
    courts = [],
    drawerState = "collapsed",
    hasUserLocation = false,
    mapStatus = { kind: "idle", message: "" },
    filters = null,
    authenticated = false,
    onToggle = () => {},
    onOpenSession = () => {},
    onReset = () => {},
    onExpandBounds = () => {},
    onOpenCreate = () => {},
    onRetry = () => {},
    onSubscribe = () => {},
  } = {}
) {
  rememberFocusedSessionCard(root);
  const isOpen = drawerState === "open";
  const count = sessions.length;
  const summary = nearbySessionsSummaryText(count, hasUserLocation);
  const filtersActive = !isDefaultFilters(filters);
  const loading = mapStatus?.kind === "loading";
  const error = mapStatus?.kind === "error";
  const first = sessions[0];
  const nextLabel = first ? `最近 ${taipeiDayWord(first.startAt)} ${taipeiClock(first.startAt)}` : "";
  const activeDrawerStatus =
    isOpen && mapStatus?.kind === "warning" && mapStatus?.message
      ? `<div class="nearby-sessions__status" role="status" aria-live="polite" aria-atomic="true"><p>${esc(mapStatus.message)}</p></div>`
      : "";
  const drawerContent = loading
    ? `<div class="nearby-sessions__status" role="status" aria-live="polite" aria-atomic="true"><p>${esc(
        mapStatus.message || "正在載入球局資料…"
      )}</p></div>`
    : error
      ? `<div class="nearby-sessions__status" role="alert"><p>${esc(
          mapStatus.message || "球局資料暫時無法載入。"
        )}</p><button type="button" id="drawer-map-retry" class="session-secondary">重新載入</button></div>`
      : count
        ? drawerGroupsMarkup(sessions, courts)
        : renderDiscoveryEmpty({ onReset, onExpandBounds, onOpenCreate, onSubscribe, filtersActive });

  // peek 列(dc L118-131):有結果=ink 底 count 條;0 結果=白底出路卡。兩者都保留
  // #nearby-sessions-toggle 開抽屜入口(0 結果時文字本身是入口,dc 原型無此入口,
  // 工程補上以保住抽屜內既有的「擴大範圍/訂閱通知」出路與鍵盤動線)。
  const arrow =
    '<svg class="nearby-peek__arrow" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-signal)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 15l-6-6-6 6"/></svg>';
  const peek =
    count || loading || error
      ? `<button type="button" id="nearby-sessions-toggle" class="nearby-peek"${isOpen ? " hidden" : ""} aria-expanded="${isOpen}" aria-controls="nearby-sessions-list">
          <span id="nearby-sessions-summary" class="visually-hidden">${esc(summary)}</span>
          <span class="nearby-peek__count" aria-hidden="true">${loading || error ? "…" : count}</span>
          <span class="nearby-peek__label" aria-hidden="true">${loading ? "載入中" : error ? "載入失敗" : "場可加入"}</span>
          ${!loading && !error && nextLabel ? `<span class="nearby-peek__next">${esc(nextLabel)}</span>` : ""}
          ${arrow}
        </button>`
      : `<div class="nearby-peek nearby-peek--empty"${isOpen ? " hidden" : ""}>
          <button type="button" id="nearby-sessions-toggle" class="nearby-peek__empty-toggle" aria-expanded="${isOpen}" aria-controls="nearby-sessions-list">
            <span id="nearby-sessions-summary" class="visually-hidden">${esc(summary)}</span>
            <span aria-hidden="true">沒有符合的球局</span>
          </button>
          ${filtersActive ? '<button type="button" id="peek-reset" class="nearby-peek__reset">重設篩選</button>' : ""}
          <button type="button" id="peek-create" class="nearby-peek__create">開一場</button>
        </div>`;

  root.innerHTML = `
    ${peek}
    <section id="nearby-sessions-list" class="nearby-drawer"${isOpen ? "" : " hidden"} data-drawer-state="${drawerState}" role="region" aria-label="附近球局">
      <button type="button" class="nearby-drawer__handle" data-testid="drawer-collapse" aria-label="收合附近球局"><span class="nearby-drawer__bar" aria-hidden="true"></span></button>
      <div class="nearby-drawer__head">
        <div>
          <p class="nearby-drawer__eyebrow">NEARBY MATCHES</p>
          <div class="nearby-drawer__countrow"><span class="nearby-drawer__count">${loading || error ? "…" : count}</span><span class="nearby-drawer__unit">場可加入</span></div>
        </div>
        <button type="button" class="nearby-drawer__close" data-nearby-close aria-label="關閉附近球局">✕</button>
      </div>
      ${activeDrawerStatus}
      <div class="nearby-drawer__scroll">
        <div class="nearby-sessions__cards">
          ${drawerContent}
        </div>
      </div>
    </section>`;

  root.querySelector("#nearby-sessions-toggle")?.addEventListener("click", () => onToggle(isOpen ? "collapsed" : "open"));
  wireSessionCards(root, onOpenSession);
  root.querySelector("#peek-reset")?.addEventListener("click", onReset);
  root.querySelector("#peek-create")?.addEventListener("click", onOpenCreate);
  root.querySelector("#discovery-reset")?.addEventListener("click", onReset);
  root.querySelector("#discovery-expand")?.addEventListener("click", onExpandBounds);
  root.querySelector("#discovery-subscribe")?.addEventListener("click", onSubscribe);
  root.querySelector("#discovery-first")?.addEventListener("click", onOpenCreate);
  root.querySelector("#drawer-map-retry")?.addEventListener("click", onRetry);
  wireDrawerInteractions(root, { drawerState, onToggle });
  restoreFocusedSessionCard(root);
}

/**
 * Render the standard session-only empty state in the active drawer.
 * Buttons render by situation: "清除篩選" only when filters differ from the
 * default state; "擴大地圖範圍"、"有新球局時通知我" 與主要的「開第一局」CTA
 * 恆在。There is no situational "重新載入" here — the mapStatus==="error"
 * case never reaches this function (renderNearbySessionsDrawer's outer
 * ternary short-circuits to the #drawer-map-retry status branch first), so
 * that button and its isError flag were removed as unreachable. Built as an
 * array so future situational buttons can slot in without restructuring
 * this function.
 */
export function renderDiscoveryEmpty({
  onReset = () => {},
  onExpandBounds = () => {},
  onOpenCreate = () => {},
  onSubscribe = () => {},
  filtersActive = false,
} = {}) {
  const buttons = [];
  if (filtersActive) buttons.push('<button type="button" id="discovery-reset" class="session-secondary">清除篩選</button>');
  buttons.push('<button type="button" id="discovery-expand" class="session-secondary">擴大地圖範圍</button>');
  buttons.push('<button type="button" id="discovery-subscribe" class="session-secondary">有新球局時通知我</button>');
  buttons.push('<button type="button" id="discovery-first" class="session-primary">開第一局</button>');
  return `<div id="discovery-empty" class="discovery-empty">
    <p>這個範圍暫時沒有可加入的球局</p>
    <div class="discovery-empty__actions">
      ${buttons.join("\n      ")}
    </div>
  </div>`;
}

function acceptedChatRoster(roster) {
  return (Array.isArray(roster) ? roster : []).filter((participant) => String(participant?.status).toLowerCase() === "accepted");
}

function chatRosterMarkup(roster) {
  const accepted = acceptedChatRoster(roster);
  if (!accepted.length) return '<p class="surface__copy">參加者名單暫時沒有可顯示的資料。</p>';
  return accepted
    .map((participant) => {
      const role = String(participant.role).toLowerCase() === "host" ? "主揪" : "球友";
      const ntrp = participant.ntrp == null ? "" : ` · ${formatNtrp(participant.ntrp)}`;
      return `<span class="chat-roster__member">${esc(participant.nickname || "球友")} · ${esc(role)}${esc(ntrp)}</span>`;
    })
    .join("");
}

function chatMessagesMarkup(messages) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  if (!safeMessages.length) return '<p class="surface__copy chat-feed__empty">目前還沒有訊息，從一句招呼開始吧。</p>';
  return safeMessages
    .map((message) => {
      const kind = message.kind === "system" ? "system" : "user";
      const isSelf = kind === "user" && message.isSelf === true;
      const senderProfileId = Number(message.senderProfileId);
      const canGovern = kind === "user" && !isSelf && Number.isSafeInteger(senderProfileId) && senderProfileId > 0;
      const senderNickname = message.senderNickname || "球友";
      const senderInitial = String(senderNickname).trim().slice(0, 1) || "球";
      // 批 D7:他人泡泡改配 28px avatar(dc §4「他人」型),自己/系統維持無 avatar；
      // 既有 data-chat-* 錨點、report/block 覆寫與 sender/body/meta 內容一律不動,
      // 只是多包一層 .chat-message__bubble,讓 avatar 能當 bubble 的 flex 手足。
      return `<article class="chat-message chat-message--${esc(kind)}${isSelf ? " chat-message--self" : ""}"
        data-chat-message data-chat-message-id="${esc(message.messageId)}" data-chat-message-kind="${esc(kind)}" data-chat-message-self="${
          isSelf ? "true" : "false"
        }">
        ${kind === "user" && !isSelf ? `<span class="chat-message__avatar" aria-hidden="true">${esc(senderInitial)}</span>` : ""}
        <div class="chat-message__bubble">
          ${kind === "user" && !isSelf ? `<p class="chat-message__sender">${esc(senderNickname)}</p>` : ""}
          <p class="chat-message__body">${esc(message.body)}</p>
          <div class="chat-message__meta">
            <time datetime="${esc(message.createdAt)}">${esc(taipeiDateTime(message.createdAt))}</time>
            ${
              canGovern
                ? `<button type="button" class="session-tertiary" data-chat-report="${esc(message.messageId)}">檢舉</button>
                   <button type="button" class="session-tertiary" data-chat-block="${esc(
                     senderProfileId
                   )}" data-testid="block-message-sender-${esc(senderProfileId)}">封鎖</button>`
                : ""
            }
          </div>
        </div>
      </article>`;
    })
    .join("");
}

/** Open the accepted-member chat with an event-driven, authority-refreshed feed. */
export function openSessionChatSheet(
  session,
  {
    canWithdraw = false,
    courts = [],
    onBlock = () => {},
    onClose = () => {},
    onPost = () => {},
    onReport = () => {},
    onWithdraw = () => {},
  } = {}
) {
  let archived = ["cancelled", "expired", "played"].includes(String(session?.status).toLowerCase());
  const venue = sessionVenuePresentation(session, courts);
  // 批 D7:header 副行沿用抽取規格 §4 chatSub 語意(今天/明天/週X + 時刻 + 主揪
  // X/我),與既有 .chat-session-summary(下方保留,aria-label="球局資訊",供
  // 候選局/已定案文案等既有測試斷言)分工——前者是新視覺標題,後者是既有資訊卡。
  const headerSub = sessionScheduleLabel(session);
  const mounted = mountSheet({
    id: "session-chat-sheet",
    label: "球局群組聊天",
    className: "session-chat-sheet",
    onClose,
    html: `
      <div class="chat-v2__head" data-screen-label="群組聊天">
        <button type="button" class="chat-v2__back" data-surface-close aria-label="關閉群組聊天">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div class="chat-v2__head-copy">
          <p class="chat-v2__court">${esc(venue.court)}</p>
          <p class="chat-v2__sub">${esc(headerSub)}</p>
        </div>
      </div>
      <div class="chat-v2__info">
        <section class="chat-session-summary" aria-label="球局資訊">
          <strong><span class="session-badge">${esc(venue.badge)}</span> ${esc(venue.court)}</strong>
          <span>${esc(venue.time)} · ${esc(session.playType)}</span>
        </section>
        <section class="chat-roster" aria-labelledby="chat-roster-title">
          <h3 id="chat-roster-title">參加者</h3>
          <div data-chat-roster><p class="surface__copy">正在讀取參加者…</p></div>
        </section>
        <p class="my-sessions-message" data-chat-loading role="status" aria-live="polite">正在讀取群組訊息…</p>
        <p class="form-error" data-chat-error role="alert" tabindex="-1" hidden></p>
      </div>
      <section class="chat-feed qm-scroll" data-chat-feed aria-label="群組訊息"></section>
      <p class="visually-hidden" data-chat-announcement role="status" aria-live="polite" aria-atomic="true"></p>
      <p class="chat-archived-note" data-chat-archived-note${archived ? "" : " hidden"}>球局已封存；你仍可查看先前訊息，但不能再傳送。</p>
      <form class="chat-composer" data-chat-composer>
        <label for="chat-message-input" class="visually-hidden">傳送純文字訊息</label>
        <input id="chat-message-input" data-testid="chat-message-input" type="text" autocomplete="off" maxlength="1000" placeholder="傳訊息給球局成員…"${
          archived ? " disabled" : ""
        } />
        <button type="submit" class="chat-v2__send" data-testid="chat-send"${archived ? " disabled" : ""} aria-label="傳送">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
        </button>
      </form>
      ${
        canWithdraw && !archived
          ? '<button type="button" class="session-tertiary chat-v2__withdraw" data-chat-withdraw>取消參加</button>'
          : ""
      }`,
  });
  const feed = mounted.root.querySelector("[data-chat-feed]");
  const roster = mounted.root.querySelector("[data-chat-roster]");
  const loading = mounted.root.querySelector("[data-chat-loading]");
  const error = mounted.root.querySelector("[data-chat-error]");
  const input = mounted.root.querySelector("[data-testid='chat-message-input']");
  const send = mounted.root.querySelector("[data-testid='chat-send']");
  const archivedNote = mounted.root.querySelector("[data-chat-archived-note]");
  const announcement = mounted.root.querySelector("[data-chat-announcement]");
  let feedInitialized = false;
  let knownMessageIds = new Set();
  let scrollRequestId = 0;

  function scrollFeedToLatest() {
    const requestId = ++scrollRequestId;
    const scroll = () => {
      if (requestId !== scrollRequestId || !mounted.root.contains(feed)) return;
      feed.scrollTop = feed.scrollHeight;
    };
    scroll();
    requestAnimationFrame(() => {
      scroll();
      requestAnimationFrame(scroll);
    });
  }

  function setArchived(message = "") {
    archived = true;
    input.disabled = true;
    send.disabled = true;
    archivedNote.hidden = false;
    mounted.root.querySelector("[data-chat-withdraw]")?.remove();
    if (message) {
      error.textContent = message;
      error.hidden = false;
      error.focus({ preventScroll: true });
    }
    scrollFeedToLatest();
  }

  function setState({ errorMessage = "", messages = [], roster: participants = [], status = "ready" } = {}) {
    const safeMessages = Array.isArray(messages) ? messages : [];
    loading.hidden = status !== "loading";
    if (status === "loading") loading.textContent = "正在讀取群組訊息…";
    error.textContent = errorMessage;
    error.hidden = !errorMessage;
    roster.innerHTML = chatRosterMarkup(participants);
    feed.innerHTML = chatMessagesMarkup(safeMessages);
    scrollFeedToLatest();
    if (status === "ready") {
      const nextMessageIds = new Set(
        safeMessages.map((message) => String(message?.messageId ?? "")).filter(Boolean)
      );
      const newMessageCount = feedInitialized
        ? [...nextMessageIds].filter((messageId) => !knownMessageIds.has(messageId)).length
        : 0;
      announcement.textContent = newMessageCount ? `新增 ${newMessageCount} 則訊息` : "";
      knownMessageIds = nextMessageIds;
      feedInitialized = true;
    }
  }

  mounted.root.querySelector("[data-chat-composer]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (archived || send.disabled) return;
    const body = String(input.value ?? "").trim();
    error.hidden = true;
    if (!body || body.length > 1000) {
      error.textContent = "請輸入 1 至 1000 字的純文字訊息。";
      error.hidden = false;
      return;
    }
    send.disabled = true;
    input.disabled = true;
    try {
      await onPost(body);
      input.value = "";
    } catch (postError) {
      error.textContent = postError?.message || "訊息暫時無法傳送，請稍後再試。";
      error.hidden = false;
      error.focus({ preventScroll: true });
    } finally {
      if (mounted.root.contains(send) && !archived) {
        send.disabled = false;
        input.disabled = false;
      }
    }
  });
  feed?.addEventListener("click", (event) => {
    const reportButton = event.target.closest("[data-chat-report]");
    const blockButton = event.target.closest("[data-chat-block]");
    if (reportButton) void Promise.resolve().then(() => onReport(reportButton.dataset.chatReport)).catch((reportError) => {
      error.textContent = reportError?.message || "目前無法開啟檢舉。";
      error.hidden = false;
    });
    if (blockButton) void Promise.resolve(onBlock(blockButton.dataset.chatBlock)).catch((blockError) => {
      error.textContent = blockError?.message || "封鎖設定暫時無法更新，請稍後再試。";
      error.hidden = false;
    });
  });
  mounted.root.querySelector("[data-chat-withdraw]")?.addEventListener("click", () => {
    onWithdraw();
  });

  return { ...mounted, setArchived, setState };
}

// ============================================================
// 批 D7:訊息頁(dc §3)——群聊列表+未讀點。資料源是既有 getMySessionState()
// 的 groups(upcoming+history 攤平),不新增 dataApi 呼叫;過濾規則見
// messagesFromGroups。點列沿用既有 controller.openSessionChat(既有清未讀流程)。
// ============================================================

/**
 * Chat-eligible rows for the messages page: accepted participants (host or
 * guest) whose session is not cancelled/expired. Played/archived sessions
 * stay listed (read-only chat history remains reachable); needsAction-only
 * entries (not-yet-accepted requests/invites) are intentionally excluded —
 * their underlying session, once accepted, already surfaces via upcoming.
 */
export function messagesFromGroups(groups = {}) {
  const upcoming = Array.isArray(groups?.upcoming) ? groups.upcoming : [];
  const history = Array.isArray(groups?.history) ? groups.history : [];
  return [...upcoming, ...history]
    .filter((session) => {
      const participantStatus = String(session?.viewerParticipantStatus ?? "").toLowerCase();
      const status = String(session?.status ?? "").toLowerCase();
      return participantStatus === "accepted" && status !== "cancelled" && status !== "expired";
    })
    .sort((left, right) => String(left?.startAt ?? "").localeCompare(String(right?.startAt ?? "")));
}

function messagesEmptyStateMarkup() {
  return `<div class="messages-page__empty">
    <p class="messages-page__empty-text">加入或開一場球局，<br />成局後群組聊天會出現在這裡。</p>
  </div>`;
}

function messageRowMarkup(session, { courts = [] } = {}) {
  const venue = sessionVenuePresentation(session, courts);
  const courtLabel = sessionCourtLabel(session, venue);
  const scheduleLabel = sessionScheduleLabel(session);
  const unreadCount = Math.max(0, Number(session?.unreadMessageCount) || 0);
  const unread = unreadCount > 0;
  const ariaLabel = unread
    ? ` aria-label="${esc(`${courtLabel}，${scheduleLabel}，${unreadCount} 則未讀訊息`)}"`
    : "";
  return `<button type="button" class="messages-row" data-message-row data-session-id="${esc(
    session.sessionId
  )}" data-testid="messages-row-${esc(session.sessionId)}"${ariaLabel}>
    <span class="messages-row__avatar" aria-hidden="true">${esc(sessionHostInitial(session))}</span>
    <span class="messages-row__body">
      <span class="messages-row__court">${esc(courtLabel)}</span>
      <span class="messages-row__sub">${esc(scheduleLabel)}</span>
    </span>
    ${unread ? '<span class="messages-row__unread" aria-hidden="true"></span>' : ""}
  </button>`;
}

/** Render the CHATS list destination (bottom-nav "訊息" tab). */
export function renderMessagesPage(root, options = {}) {
  const { courts = [], groups = { history: [], needsAction: [], needsActionCount: 0, upcoming: [] }, onOpenChat = () => {} } = options;
  const rows = messagesFromGroups(groups);
  root.innerHTML = `
    <div class="messages-page__head">
      <p class="messages-page__eyebrow">CHATS</p>
      <h1 tabindex="-1" data-messages-heading class="messages-page__title">訊息</h1>
    </div>
    <div class="messages-page__list">
      ${rows.length ? rows.map((session) => messageRowMarkup(session, { courts })).join("") : messagesEmptyStateMarkup()}
    </div>`;
  root.querySelectorAll("[data-message-row]").forEach((button) => {
    button.addEventListener("click", () => onOpenChat(button.dataset.sessionId));
  });
}

const JOIN_STAGE_FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function joinConfirmHintText(expectedAccepted) {
  return expectedAccepted
    ? "確認後將直接加入這場球局，加入後即可在球局群組聊天協調細節。"
    : "確認後將送出申請，主揪會在球局流程中處理申請。";
}

/** The three OK outcomes plus the accepted branch, unchanged from the retired dialog. */
function joinSuccessMessage(result) {
  if (result?.accepted) return "已加入球局！前往我的球局開啟群組聊天。";
  if (result?.outcome === "OK_NTRP_MISSING") return "已送出申請；你尚未填寫 NTRP，等待主揪回覆。";
  if (result?.outcome === "OK_NTRP_OUT_OF_RANGE") return "已送出申請；你的 NTRP 不在球局設定範圍內，等待主揪回覆。";
  return "已送出申請，等待主揪回覆。";
}

// ==== 批 D4b:v2 動作列(dc L414-426)。canDecide 的「定案」動作已搬到獨立的
// candidateDecidePanelMarkup(見下方,渲染在 actions 容器之外、不隨五態切換重繪),
// 這裡不再處理 canDecide——保留簽名不收 canDecide 是刻意的。 ====
const CTA_CLOCK_ICON =
  '<svg class="cta-status__icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2" stroke-linecap="round"></path></svg>';
const CTA_CHECK_ICON =
  '<svg class="cta-status__icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"></path></svg>';

function ctaCopyLinkButton() {
  return '<button type="button" class="session-secondary cta-copy-link" data-session-action="copy-link">複製連結</button>';
}

function ctaEditButton(canEdit) {
  return canEdit ? '<button type="button" class="session-secondary" data-session-action="edit">編輯球局</button>' : "";
}

// 批 D9 backlog #5 稽核:grep sessionController.js 的 actionFor()/openSessionDetail()
// 證實 canChat 與 kind==="chat" 並非恆同源,故保留此分支——action.kind 由
// terminalAction(session)(cancelled/expired/started)優先決定,canChat 只看
// participation.viewerParticipantStatus==="accepted",兩者計算路徑互不相依。
// 一場已被主揪取消／過期／開打後成為 terminal 的球局,先前被接受的參加者
// canChat 仍是 true 但 action.kind 會是 "terminal"(非 "chat"),此時就需要這顆
// 額外的「群組聊天」CTA(封存局群聊唯讀但仍可讀)。My Sessions 的「查看球局」
// (data-open-my-session,見 main.js)可對 history 分頁的舊局重新開出這張 detail
// sheet,是這個分支的真實可達路徑,非防禦性死碼。
function ctaExtraChatButton(canChat, kind) {
  return canChat && kind !== "chat"
    ? '<button type="button" class="session-primary" data-session-action="chat">群組聊天</button>'
    : "";
}

function ctaReportButton(canReport) {
  return canReport ? '<button type="button" class="session-tertiary" data-session-action="report">檢舉此球局</button>' : "";
}

function ctaTextAction(action, label) {
  return `<button type="button" class="cta-text-action" data-session-action="${esc(action)}">${esc(label)}</button>`;
}

function idleActionsMarkup({ action, canEdit, canChat, canReport, isMine }) {
  const kind = action?.kind;
  const editButton = ctaEditButton(canEdit);
  const extraChatButton = ctaExtraChatButton(canChat, kind);
  const reportButton = ctaReportButton(canReport);

  if (kind === "join") {
    const instant = Boolean(action?.expectedAccepted);
    const primaryDisabled = action?.disabled ? " disabled" : "";
    return `
      <div class="cta-row">
        ${ctaCopyLinkButton()}
        ${editButton}
        ${extraChatButton}
        <button type="button" class="session-primary${
          instant ? " session-primary--instant" : ""
        }" data-session-action="primary"${primaryDisabled}>${esc(action?.label ?? "申請加入")}</button>
      </div>
      ${action?.secondaryLabel ? ctaTextAction("secondary", action.secondaryLabel) : ""}
      ${reportButton}
      <p class="cta-footnote">成局後可在球局群組聊天協調細節。</p>
    `;
  }

  if (kind === "waiting") {
    return `
      <div class="cta-row">
        ${ctaCopyLinkButton()}
        ${editButton}
        <div class="cta-status cta-status--pending" data-session-action="primary" aria-disabled="true">${CTA_CLOCK_ICON}已送出申請 · 等主揪確認</div>
      </div>
      ${ctaTextAction("secondary", "取消申請")}
      ${reportButton}
    `;
  }

  if (kind === "chat") {
    // fix round 1(驗收回歸):主揪的 viewerParticipantStatus 也是 accepted,一樣落在
    // kind:"chat"——但 can_withdraw 是 guest-only(202607210002_session_join_mode.sql),
    // 主揪按「取消報名」會被 withdraw_from_session RPC 拒絕。改版前主揪在這裡本來就
    // 沒有 withdraw 入口(舊版 chat kind 無 secondaryLabel),isMine 時不渲染綠面板與
    // 「取消報名」,只留 cta-row(複製連結/編輯/群組聊天)+檢舉,避免新引入這個
    // 對主揪無效的 affordance。dc 的「取消這場球局」紅鈕歸 D6,本批不做。
    if (isMine) {
      return `
        <div class="cta-row">
          ${ctaCopyLinkButton()}
          ${editButton}
          <button type="button" class="session-primary" data-session-action="primary">${esc(action?.label ?? "群組聊天")}</button>
        </div>
        ${reportButton}
      `;
    }
    return `
      <div class="cta-status cta-status--joined">${CTA_CHECK_ICON}已加入這場球局</div>
      <div class="cta-row">
        ${ctaCopyLinkButton()}
        ${editButton}
        <button type="button" class="session-primary" data-session-action="primary">${esc(action?.label ?? "群組聊天")}</button>
      </div>
      ${ctaTextAction("secondary", "取消報名")}
      ${reportButton}
    `;
  }

  if (kind === "full" || kind === "terminal") {
    return `
      <div class="cta-row">
        ${ctaCopyLinkButton()}
        ${editButton}
        ${extraChatButton}
        <button type="button" class="cta-status cta-status--disabled" data-session-action="primary" disabled>${esc(
          action?.label ?? ""
        )}</button>
      </div>
      ${reportButton}
    `;
  }

  // Fallback:action 沒有可辨識的 kind(例如既有測試手寫的 action 物件,先於
  // D4b 這批 CTA 改版)——保留改版前的通用渲染(按鈕集合不變),只補上 .cta-row
  // 包裝維持與其他分支一致的水平排列。
  const primaryDisabled = action?.disabled ? " disabled" : "";
  return `
    <div class="cta-row">
      ${ctaCopyLinkButton()}
      ${editButton}
      ${extraChatButton}
      <button type="button" class="session-primary" data-session-action="primary"${primaryDisabled}>${esc(
        action?.label ?? "申請加入"
      )}</button>
    </div>
    ${action?.secondaryLabel ? ctaTextAction("secondary", action.secondaryLabel) : ""}
    ${reportButton}
  `;
}

function confirmingActionsMarkup(expectedAccepted) {
  return `
    <p class="form-hint" data-testid="join-confirm-hint">${esc(joinConfirmHintText(expectedAccepted))}</p>
    <button type="button" class="session-secondary" data-testid="join-cancel">取消</button>
    <button type="button" class="session-primary" data-testid="join-confirm">確認送出</button>
  `;
}

function submittingActionsMarkup(expectedAccepted) {
  return `
    <p class="form-hint" data-testid="join-confirm-hint">${esc(joinConfirmHintText(expectedAccepted))}</p>
    <button type="button" class="session-secondary" data-testid="join-cancel" disabled>取消</button>
    <button type="button" class="session-primary" data-testid="join-confirm" disabled>送出中…</button>
  `;
}

function successActionsMarkup(message, notificationSettings) {
  return `
    <h3 class="surface__message" data-testid="join-success-title" tabindex="-1">${esc(
      message
    )}</h3>
    ${successPushPromptMarkup(notificationSettings, {
      message: "開啟推播，才不會錯過主揪的審核結果與球局變更。",
      testId: "join-success-enable-push",
    })}
    <button type="button" class="session-primary" data-testid="join-open-my-sessions">查看我的球局</button>
  `;
}

function errorActionsMarkup(message) {
  return `
    <p class="form-error" data-testid="join-error" role="alert">${esc(message)}</p>
    <button type="button" class="session-primary" data-testid="join-retry">重試</button>
  `;
}

// ==== 批 D4b:詳情 sheet 頭部/記分板/主揪列/候選面板 helper(dc L333-410)。
// 這些都是純函式,不含 wiring,只組 markup 字串。 ====

/** 球場名(19px)那一行:未定案候選改用 sessionCourtLabel() 同一套 D2 卡片
 * 「X 等 N 館候選」縮寫公式(批 D9 backlog #2)——完整候選清單只留在下方
 * candidateInfoRowMarkup() 的候選資訊列,不再頭部/資訊列各重複一份;
 * 其餘沿用 session.court 原始球場名——不再像舊版把行政區併進同一行。 */
function sessionDetailCourtName(session, venue) {
  return venue.undecidedCandidates ? sessionCourtLabel(session, venue) : session?.court || venue.court;
}

/** 行政區・時間那一行:只有時間片段套 mono(dc L349 inline span)。 */
function sessionDetailTimeLineMarkup(session, venue) {
  const districtPrefix = !venue.undecidedCandidates && session?.courtDistrict ? `${esc(session.courtDistrict)} · ` : "";
  return `${districtPrefix}<span class="session-detail__mono">${esc(venue.time)}</span>`;
}

/** 頭部 badge 列(dc L342-347):venue 欄位 badge 是既有 My Sessions 共用值
 * (已訂場/候選局/現場等場),與 dc 的「候選中」「我主揪的」是兩套並存的 badge——
 * 刻意都保留,不用後者取代前者(取代會牽動 My Sessions/roster 等本批範圍外的呼叫點)。 */
function sessionDetailBadgesMarkup(session, venue, { isMine = false } = {}) {
  return [
    `<span class="session-badge" data-session-field="venue">${esc(venue.badge)}</span>`,
    session.joinMode === "instant" ? '<span class="session-badge session-badge--instant">直接加入</span>' : "",
    venue.undecidedCandidates ? "" : nowStartSessionMarkup(session),
    venue.undecidedCandidates ? '<span class="session-badge session-badge--candidate">候選中</span>' : "",
    isMine ? '<span class="session-badge session-badge--host">我主揪的</span>' : "",
  ]
    .filter(Boolean)
    .join("");
}

/** 候選資訊列(guest 視角,dc L367-368):取代退役的 candidateDecisionExplanation()。 */
function candidateInfoRowMarkup(venue) {
  const names = (venue.candidateNames ?? []).join("、");
  return `<p class="candidate-info-panel" data-session-candidate-explanation>候選球場:<strong>${esc(
    names
  )}</strong> · 主揪定案後群組通知</p>`;
}

/** 訂場狀態三態(dc L983):候選未定案一律顯示「定案後補訂場」,壓過 booked 值;
 * 已定案的候選局(venue.decided)視同已訂場——dc 的簡化資料模型沒有 walk_on
 * 對應態,這裡另外把「尚未訂場」留給 walk_on(現場等場),屬本批推論延伸。 */
function hostRowBookedStatus(session, venue) {
  if (venue.undecidedCandidates) return "定案後補訂場";
  if (venue.decided) return "✓ 已訂場";
  // sessionVenuePresentation() defaults a missing venueType to "booked"(見該
  // function 的 `String(session?.venueType ?? "booked")`);這裡比照同一預設,
  // 否則沒帶 venueType 的呼叫端會出現頭部 badge 說「已訂場」、這一行卻說
  // 「尚未訂場」的矛盾(D4b 視覺驗收時肉眼抓到)。
  return String(session?.venueType ?? "booked") === "walk_on" ? "尚未訂場" : "✓ 已訂場";
}

/** 主揪列(dc L370-376):avatar 用既有 avatarInitial() helper;NTRP 沿用
 * formatNtrp() 保留「尚未填寫 NTRP」的空值語意,並在同一行後綴既有的
 * completionLabel()(資料完整/資料未完成)——dc 原型沒有這個欄位,但它是
 * CLAUDE.md 明列的匿名公開欄位之一,拿掉等於砍資訊,故意保留,回報標注。 */
function hostRowMarkup(session, venue) {
  return `<div class="host-row" data-session-field="host">
    <span class="host-row__avatar" aria-hidden="true">${esc(avatarInitial(session.hostNickname))}</span>
    <div class="host-row__copy">
      <p class="host-row__nameline"><strong>${esc(session.hostNickname)}</strong><span class="host-row__chip">主揪</span></p>
      <p class="host-row__ntrp"><span class="session-detail__mono">${esc(
        formatNtrp(session.hostNtrp)
      )}</span> · ${esc(completionLabel(session))}</p>
    </div>
    <p class="host-row__status">${esc(hostRowBookedStatus(session, venue))}</p>
  </div>`;
}

/** 記分板缺額格(dc L980 dSpots:ds.need+' 位')——刻意不用既有 vacancyLabel()
 * 的「缺 N 位/已額滿」格式,因為那個格式是為 CTA 主鈕文案設計的,dc 這一格只要
 * 裸數字+「位」,額滿時就是「0 位」。 */
function scoreboardVacancyText(session) {
  const remaining = Number(session?.slotsRemaining);
  return `${Number.isFinite(remaining) ? Math.max(0, remaining) : 0} 位`;
}

/** 候選定案面板要用的球場列(id 對照 courts 目錄取名稱+行政區)。 */
function candidateCourtRows(session, courts = []) {
  const catalogue = new Map((Array.isArray(courts) ? courts : []).map((court) => [String(court?.id), court]));
  return (Array.isArray(session?.candidateCourtIds) ? session.candidateCourtIds : [])
    .map((courtId) => catalogue.get(String(courtId)))
    .filter(Boolean);
}

/**
 * 候選定案面板(host 視角,dc L381-393):每顆「定案」鈕都呼叫既有 onDecide()
 * 開完整定案表單,不做逐球場一鍵定案——decide_session_court 還需要使用者在表單
 * 內收斂場地與時間,原型的單鍵 finalizeCourt 不滿足這個 RPC 契約,此為有意偏離。
 * 這個面板渲染在 `.session-detail__actions` 之外、不隨五態切換重繪,故其
 * data-session-action="decide" 鈕在掛載時只需要 wire 一次。
 */
function candidateDecidePanelMarkup(session, courts) {
  const rows = candidateCourtRows(session, courts)
    .map(
      (court) => `<div class="candidate-decide-panel__row">
        <div class="candidate-decide-panel__copy">
          <p class="candidate-decide-panel__name">${esc(court.name)}</p>
          <p class="candidate-decide-panel__district">${esc(court.district ?? "")}</p>
        </div>
        <button type="button" class="candidate-decide-panel__cta" data-session-action="decide">定案</button>
      </div>`
    )
    .join("");
  return `<div class="candidate-decide-panel">
    <p class="candidate-decide-panel__title">候選球場 · 點定案</p>
    ${rows}
  </div>`;
}

/**
 * Open a public session detail sheet with the privacy-reviewed field order.
 *
 * 批 C3-2:join 旅程單層化。動作區是就地切換的四態狀態機
 * (idle/confirming/submitting/success/error,容器帶 `data-join-stage`),不再開
 * 第二層 join confirmation dialog——舊的獨立確認 dialog 函式已整支退役。
 *
 * 批 D4b:視覺改 v2 計分板殼(dc L333-426),join 五態狀態機、資料契約與全部
 * data-testid 不動;canDecide 的「定案」動作搬進候選定案面板(渲染在
 * `.session-detail__actions` 之外,不隨五態重繪)。新增 isMine 參數(頭部
 * 「我主揪的」badge 與候選資訊列的 guest-only 條件用)。
 */
export function openSessionSheet(
  session,
  {
    action,
    canDecide = false,
    canEdit = false,
    canChat = false,
    canReport = false,
    isMine = false,
    showJoinPreview = false,
    courts = [],
    notificationSettings = {},
    initialStage = "idle",
    onCopyLink = () => {},
    onDecide = () => {},
    onEdit = () => {},
    onChat = () => {},
    onPrimary = () => {},
    onConfirmJoin = async () => ({}),
    onEnablePush = () => {},
    onViewMySessions = () => {},
    onReport = () => {},
    onWithdraw = () => {},
    onClose = () => {},
  } = {}
) {
  const venue = sessionVenuePresentation(session, courts);
  let stage = initialStage;
  let confirmingExpectedAccepted = Boolean(action?.expectedAccepted);
  let submitting = false;

  const mounted = mountSheet({
    id: "session-sheet",
    label: "球局詳情",
    className: "session-detail-sheet",
    onClose,
    onEscape: () => {
      // 假設 1(design spec):confirming 態 Escape 先退一步回 idle,sheet 不關;
      // 其餘四態(idle/submitting/success/error)交回 mountSheet 現行關閉語意。
      if (stage !== "confirming") return false;
      setStage("idle");
      return true;
    },
    html: `
      <span class="session-detail-sheet__grabber"></span>
      <div class="session-detail">
        <div class="session-detail__head">
          ${sessionTimeTileMarkup(session, venue, { detail: true })}
          <div class="session-detail__headcopy">
            <div class="session-detail__badges">${sessionDetailBadgesMarkup(session, venue, { isMine })}</div>
            <p class="session-detail__court" data-session-field="court">${esc(sessionDetailCourtName(session, venue))}</p>
            <p class="session-detail__meta" data-session-field="time">${sessionDetailTimeLineMarkup(session, venue)}</p>
          </div>
          <button type="button" class="session-detail__close" data-surface-close aria-label="關閉球局詳情">×</button>
        </div>
        <div class="scoreboard-strip session-detail__scoreboard" data-session-field="details">
          <div class="scoreboard-strip__cell">
            <p class="scoreboard-strip__eyebrow">TYPE</p>
            <p class="scoreboard-strip__value">${esc(session.playType)}</p>
          </div>
          <div class="scoreboard-strip__cell">
            <p class="scoreboard-strip__eyebrow">NTRP</p>
            <p class="scoreboard-strip__value scoreboard-strip__value--mono">${esc(scoreboardNtrpValue(session))}</p>
          </div>
          <div class="scoreboard-strip__cell scoreboard-strip__cell--inverse">
            <p class="scoreboard-strip__eyebrow">缺額</p>
            <p class="scoreboard-strip__value scoreboard-strip__value--mono">${esc(scoreboardVacancyText(session))}</p>
          </div>
        </div>
        ${venue.undecidedCandidates && !isMine ? candidateInfoRowMarkup(venue) : ""}
        ${hostRowMarkup(session, venue)}
        <p class="session-detail__notes" data-session-field="notes">${esc(
          session.notes ? `「${session.notes}」` : "沒有補充說明。"
        )}</p>
        ${
          session.feeNote
            ? `<p class="form-hint" data-session-field="fee-note">${esc(`費用：${session.feeNote}`)}</p>`
            : ""
        }
        ${canDecide ? candidateDecidePanelMarkup(session, courts) : ""}
        ${joinPreviewSection(showJoinPreview)}
        ${action?.note ? `<p class="form-hint" data-session-action-note>${esc(action.note)}</p>` : ""}
        <p class="form-error" data-session-report-error role="alert" hidden></p>
        <div class="session-detail__actions" tabindex="-1"></div>
      </div>`,
  });

  const container = mounted.root.querySelector(".session-detail__actions");
  const setJoinPreview = createJoinPreviewSetter(mounted.root);
  // 候選定案面板不在 actions 容器內,不隨五態切換重繪,掛載時 wire 一次即可。
  mounted.root.querySelectorAll('[data-session-action="decide"]').forEach((button) => {
    button.addEventListener("click", onDecide);
  });

  function focusInStage(preferredSelector = null) {
    const preferred = preferredSelector ? container.querySelector(preferredSelector) : null;
    // 批 D4b:「等待」「已額滿」「終局」三態的 primary 位不是可聚焦的互動元素
    // (非按鈕 div,或原生 disabled 按鈕),排除後 fallback 交給下一個真正可聚焦
    // 的元素(通常是複製連結鈕),而不是對它們呼叫 focus() 變成無效果的 no-op。
    const primaryCta = container.querySelector(
      '[data-session-action="primary"]:not([disabled]):not([aria-disabled="true"])'
    );
    const target = preferred ?? primaryCta ?? container.querySelector(JOIN_STAGE_FOCUSABLE_SELECTOR) ?? container;
    target.focus({ preventScroll: true });
  }

  function wireIdle() {
    // 批 D4b:「已送出申請」等待狀態的 primary 位是非按鈕 div(aria-disabled,
    // 沒有原生 disabled 屬性擋掉點擊),wire 前先排除,避免點擊誤觸 onPrimary。
    // 候選定案面板的 data-session-action="decide" 鈕已在掛載時 wire 一次
    // (面板不在這個容器內、不隨五態重繪),這裡不用再處理。
    const primaryButton = mounted.root.querySelector('[data-session-action="primary"]');
    if (primaryButton && primaryButton.getAttribute("aria-disabled") !== "true") {
      primaryButton.addEventListener("click", onPrimary);
    }
    mounted.root.querySelector('[data-session-action="edit"]')?.addEventListener("click", onEdit);
    mounted.root.querySelector('[data-session-action="chat"]')?.addEventListener("click", onChat);
    const copyLinkButton = mounted.root.querySelector('[data-session-action="copy-link"]');
    copyLinkButton?.addEventListener("click", async () => {
      copyLinkButton.disabled = true;
      try {
        await onCopyLink();
      } catch (copyError) {
        const error = mounted.root.querySelector("[data-session-report-error]");
        error.textContent = copyError?.message || "目前無法複製連結，請手動複製網址。";
        error.hidden = false;
      } finally {
        if (mounted.root.contains(copyLinkButton)) copyLinkButton.disabled = false;
      }
    });
    const reportButton = mounted.root.querySelector('[data-session-action="report"]');
    reportButton?.addEventListener("click", async () => {
      const error = mounted.root.querySelector("[data-session-report-error]");
      reportButton.disabled = true;
      error.hidden = true;
      try {
        await onReport();
      } catch (reportError) {
        error.textContent = reportError?.message || "目前無法開啟檢舉。";
        error.hidden = false;
      } finally {
        if (mounted.root.contains(reportButton)) reportButton.disabled = false;
      }
    });
    const secondaryButton = mounted.root.querySelector('[data-session-action="secondary"]');
    secondaryButton?.addEventListener("click", () => {
      onWithdraw();
    });
  }

  function wireConfirming() {
    container.querySelector('[data-testid="join-cancel"]')?.addEventListener("click", () => {
      setStage("idle");
    });
    container.querySelector('[data-testid="join-confirm"]')?.addEventListener("click", () => {
      void submitJoin();
    });
  }

  function wireSuccess() {
    wireSuccessPushPrompt(mounted.root, onEnablePush);
    container.querySelector('[data-testid="join-open-my-sessions"]')?.addEventListener("click", () => {
      mounted.close({ reason: "view-my-sessions", restoreFocus: false });
      // 批 C3-3:CTA 現在把剛加入的 sessionId 交回呼叫端,讓 My Sessions 可以聚焦
      // 這一張新參與卡(而不是只聚焦頁面標題)——見 main.js 的 onViewMySessions 接線。
      onViewMySessions(session.sessionId);
    });
  }

  function wireError() {
    container.querySelector('[data-testid="join-retry"]')?.addEventListener("click", () => {
      setStage("confirming");
    });
  }

  function renderStage(nextStage, message = "") {
    if (nextStage === "idle") container.innerHTML = idleActionsMarkup({ action, canEdit, canChat, canReport, isMine });
    else if (nextStage === "confirming") container.innerHTML = confirmingActionsMarkup(confirmingExpectedAccepted);
    else if (nextStage === "submitting") container.innerHTML = submittingActionsMarkup(confirmingExpectedAccepted);
    else if (nextStage === "success") container.innerHTML = successActionsMarkup(message, notificationSettings);
    else if (nextStage === "error") container.innerHTML = errorActionsMarkup(message);
    container.dataset.joinStage = nextStage;
    stage = nextStage;
  }

  // 四態切換一律只替換 `.session-detail__actions` 這顆容器的內容,不重灌整張
  // sheet(批 B Task 4 教訓);每次切換後明確把焦點移到新態的第一個可操作元素
  // (或成功卡標題),絕不放任它落回 body。
  function setStage(nextStage, message = "") {
    renderStage(nextStage, message);
    if (nextStage === "idle") wireIdle();
    else if (nextStage === "confirming") wireConfirming();
    else if (nextStage === "success") wireSuccess();
    else if (nextStage === "error") wireError();
    focusInStage(nextStage === "success" ? '[data-testid="join-success-title"]' : null);
  }

  async function submitJoin() {
    if (submitting) return;
    submitting = true;
    setStage("submitting");
    try {
      const result = await onConfirmJoin();
      if (result?.joinSubmitted) {
        setStage("success", joinSuccessMessage(result));
      } else {
        setStage("error", result?.joinError || "申請失敗，請稍後再試。");
      }
    } catch (submitError) {
      setStage("error", submitError?.message || "申請失敗，請稍後再試。");
    } finally {
      submitting = false;
    }
  }

  function enterConfirming({ expectedAccepted } = {}) {
    if (expectedAccepted !== undefined) confirmingExpectedAccepted = Boolean(expectedAccepted);
    setStage("confirming");
  }

  // Initial render never goes through setStage(): a freshly mounted idle
  // sheet must NOT steal focus here — mountSurface's own generic fallback
  // (requestAnimationFrame, only if nothing already has focus) puts it on
  // the × close button, matching every other sheet in this app. Any other
  // initial stage (only "confirming", from a resumed Join intent) has no
  // such fallback to lean on and must claim its own focus synchronously,
  // before that fallback's requestAnimationFrame runs.
  renderStage(initialStage);
  if (initialStage === "idle") {
    wireIdle();
  } else {
    if (initialStage === "confirming") wireConfirming();
    else if (initialStage === "success") wireSuccess();
    else if (initialStage === "error") wireError();
    focusInStage(initialStage === "success" ? '[data-testid="join-success-title"]' : null);
  }

  return { ...mounted, setJoinPreview, enterConfirming };
}

/** Explain a public deep link that no longer resolves to an available session. */
export function openSessionUnavailableSheet() {
  return mountSheet({
    id: "session-unavailable-sheet",
    label: "找不到球局",
    html: `
      <div class="surface__head">
        <div><p class="surface__eyebrow">球局連結</p><h2>找不到這個球局</h2></div>
        <button type="button" class="surface__close" data-surface-close aria-label="關閉找不到球局訊息">×</button>
      </div>
      <p class="surface__message">這個球局可能已下架、不再開放，或連結有誤。</p>`,
  });
}

/** Require an explicit in-project warning before a member exits a session. */
export function openWithdrawSessionConfirmation({ onClose = () => {}, onConfirm = async () => {} } = {}) {
  const mounted = mountDialog({
    id: "withdraw-session-confirmation",
    label: "確認退出這一局？",
    onClose,
    html: `
      <div class="surface__head">
        <div><p class="surface__eyebrow">確認退出</p><h2>確認退出這一局？</h2></div>
        <button type="button" class="surface__close" data-surface-close aria-label="關閉確認">×</button>
      </div>
      <p class="surface__message">退出後將無法再次申請這一局。</p>
      <p class="form-error" data-withdraw-error role="alert" hidden></p>
      <div class="session-detail__actions">
        <button type="button" class="session-secondary" data-surface-close>先不要</button>
        <button type="button" class="session-primary" data-confirm-withdraw>確認退出</button>
      </div>`,
  });
  const confirmButton = mounted.root.querySelector("[data-confirm-withdraw]");
  const error = mounted.root.querySelector("[data-withdraw-error]");
  let submitting = false;
  confirmButton?.addEventListener("click", async () => {
    if (submitting) return;
    submitting = true;
    confirmButton.disabled = true;
    error.hidden = true;
    try {
      await onConfirm();
      mounted.close({ reason: "complete" });
    } catch (withdrawError) {
      if (mounted.root.contains(error)) {
        error.textContent = withdrawError?.message || "退出球局暫時無法完成，請稍後再試。";
        error.hidden = false;
      }
    } finally {
      if (mounted.root.contains(confirmButton)) {
        submitting = false;
        confirmButton.disabled = false;
      }
    }
  });
  return mounted;
}

const REPORT_REASONS = ["與實際球局不符", "不當行為", "疑似詐騙", "其他"];

/** Collect a minimal, reviewable report without exposing any new profile data. */
export function openReportDialog({ targetLabel = "這個項目", onClose = () => {}, onSubmit = () => {} } = {}) {
  const mounted = mountDialog({
    id: "report-dialog",
    label: "檢舉",
    onClose,
    html: `
      <div class="surface__head">
        <div><p class="surface__eyebrow">檢舉</p><h2>回報問題</h2></div>
        <button type="button" class="surface__close" data-surface-close aria-label="關閉檢舉">×</button>
      </div>
      <p class="surface__copy">${esc(targetLabel)}</p>
      <form data-testid="report-form" class="report-form" novalidate>
        <fieldset class="form-fieldset"><legend>檢舉原因</legend>
          ${REPORT_REASONS.map(
            (reason) =>
              `<label><input type="radio" name="report-reason" value="${esc(reason)}" />${esc(reason)}</label>`
          ).join("")}
        </fieldset>
        <p class="form-error" data-report-error role="alert" hidden></p>
        <button type="submit" class="session-primary" data-testid="report-submit">送出檢舉</button>
      </form>
      <p class="surface__message" data-report-success role="status" aria-live="polite" tabindex="-1" hidden>已送出檢舉，謝謝你的回報。</p>`,
  });
  const form = mounted.root.querySelector("[data-testid='report-form']");
  const submit = mounted.root.querySelector("[data-testid='report-submit']");
  const error = mounted.root.querySelector("[data-report-error]");
  const success = mounted.root.querySelector("[data-report-success]");
  let submitting = false;
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;
    const reason = form.querySelector("[name='report-reason']:checked")?.value;
    if (!reason) {
      error.textContent = "請選擇檢舉原因。";
      error.hidden = false;
      return;
    }
    submitting = true;
    submit.disabled = true;
    error.hidden = true;
    try {
      await onSubmit(reason);
      if (mounted.root.contains(form)) {
        form.hidden = true;
        success.hidden = false;
        success.focus({ preventScroll: true });
      }
    } catch (submitError) {
      if (mounted.root.contains(error)) {
        error.textContent = submitError?.message || "檢舉暫時無法送出，請稍後再試。";
        error.hidden = false;
      }
    } finally {
      if (mounted.root.contains(submit) && !form.hidden) {
        submitting = false;
        submit.disabled = false;
      }
    }
  });
  return mounted;
}

// 個人檔案的「常打類型」維持四值：既有使用者已勾選的「對拉」不該因為建局表單收斂而消失。
const PROFILE_PLAY_TYPES = ["單打", "雙打", "對拉", "練球"];
// 建局表單只提供三種；「對拉」的語意由「練球」涵蓋。
const CREATE_SESSION_PLAY_TYPES = ["單打", "雙打", "練球"];
const PLAY_TYPE_HINT = "單打｜一對一。雙打｜二對二。練球｜餵球、對拉、發球等不計分的練習。";
const PROFILE_SLOTS = [
  ["wd-m", "平日早上"],
  ["wd-a", "平日下午"],
  ["wd-e", "平日晚上"],
  ["we-m", "週末早上"],
  ["we-a", "週末下午"],
  ["we-e", "週末晚上"],
];
const PROFILE_SLOT_LABELS = new Map(PROFILE_SLOTS);

function playerSlotLabels(slotCodes) {
  return (Array.isArray(slotCodes) ? slotCodes : []).map((code) => {
    const safeCode = String(code ?? "");
    return PROFILE_SLOT_LABELS.get(safeCode) ?? safeCode;
  });
}

function playerPresenceLabel(player = {}) {
  if (player?.isPresent !== true) return "";
  const minutes = Number(player?.minutesAgo);
  const safeMinutes = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0;
  return `在線・${safeMinutes} 分鐘前`;
}

function playerGreetingLabel(player = {}) {
  return player?.openToGreeting === true ? "接受現場問候" : "";
}

function taipeiCourts(courts) {
  return (Array.isArray(courts) ? courts : []).filter((court) => court?.city === "台北市");
}

function selectedCourtValues(select, fallback = new Set()) {
  const selected = new Set([...(select?.selectedOptions ?? [])].map((option) => option.value));
  return selected.size ? selected : new Set(fallback);
}

/** Checkbox counterpart of selectedCourtValues: reads any live user selection before a re-render replaces it. */
function selectedCourtCheckboxValues(container, fallback = new Set()) {
  const selected = new Set(
    [...(container?.querySelectorAll("input[name='profile-courts']:checked") ?? [])].map((input) => input.value)
  );
  return selected.size ? selected : new Set(fallback);
}

/** Checkbox counterpart of updateCourtSelect for the profile「常打球場」picker (cf. #notification-court-picker template). */
function updateCourtCheckboxes(container, status, courts, { ready = true, selected = new Set() } = {}) {
  if (!container) return;
  const nextCourts = taipeiCourts(courts);
  const selectedValues = selected instanceof Set ? selected : new Set(selected ?? []);
  container.innerHTML =
    ready && nextCourts.length
      ? nextCourts
          .map((court) => {
            const isChecked = selectedValues.has(String(court.id)) || selectedValues.has(court.name);
            return `<label><input type="checkbox" name="profile-courts" value="${esc(court.id)}" data-testid="profile-court-${esc(
              court.id
            )}"${isChecked ? " checked" : ""}> <span>${esc(court.name)} · ${esc(court.district || "台北市")}</span></label>`;
          })
          .join("")
      : "";
  if (!status) return;
  status.hidden = ready && nextCourts.length > 0;
  status.textContent = !ready ? "正在載入台北市球場…" : nextCourts.length ? "" : "目前沒有可選的台北市球場。";
}

/** Replace only court options so delayed data never discards the user's draft. */
function updateCourtSelect(select, status, courts, { ready = true, selected = new Set(), multiple = false } = {}) {
  if (!select) return;
  const nextCourts = taipeiCourts(courts);
  const selectedValues = selected instanceof Set ? selected : new Set(selected ?? []);
  const options = nextCourts
    .map((court) => {
      const isSelected = selectedValues.has(String(court.id)) || selectedValues.has(court.name);
      return `<option value="${esc(court.id)}"${isSelected ? " selected" : ""}>${esc(court.name)}${
        multiple ? "" : ` · ${esc(court.district ?? "台北市")}`
      }</option>`;
    })
    .join("");
  select.innerHTML = multiple ? options : `<option value="">請選擇球場</option>${options}`;
  select.disabled = !ready || nextCourts.length === 0;
  if (!status) return;
  status.hidden = ready && nextCourts.length > 0;
  status.textContent = !ready ? "正在載入台北市球場…" : nextCourts.length ? "" : "目前沒有可選的台北市球場。";
}

function selectedValues(form, name) {
  return new Set([...form.querySelectorAll(`[name="${name}"]:checked`)].map((input) => input.value));
}

function profileFormValue(form, fallbackProfile = {}, fallbackCourts = new Set()) {
  const courtInputs = form.querySelectorAll("[name='profile-courts']");
  const courts = courtInputs.length ? selectedValues(form, "profile-courts") : new Set(fallbackCourts);
  const nicknameInput = form.querySelector("[name='profile-nickname']");
  const ntrpInput = form.querySelector("[name='profile-ntrp']");
  const ntrpValue = ntrpInput?.value.trim();
  const typeInputs = form.querySelectorAll("[name='profile-types']");
  const slotInputs = form.querySelectorAll("[name='profile-slots']");
  return {
    courts,
    nick: nicknameInput ? nicknameInput.value.trim() : String(fallbackProfile.nick ?? "").trim(),
    ntrp: ntrpInput ? (ntrpValue === "" ? null : Number(ntrpValue)) : (fallbackProfile.ntrp ?? null),
    slots: slotInputs.length ? selectedValues(form, "profile-slots") : new Set(fallbackProfile.slots ?? []),
    types: typeInputs.length ? selectedValues(form, "profile-types") : new Set(fallbackProfile.types ?? []),
  };
}

function profileGateForIntent(intent) {
  if (["create", "players", "presence"].includes(intent?.action)) return "ntrp";
  if (["directory", "visibility"].includes(intent?.action)) return "directory";
  return "nickname";
}

function profileGateHint(gate, intent = null) {
  if (gate === "ntrp" && intent?.action === "presence") {
    return "要調整在線設定，請填寫公開暱稱與 NTRP（1.0–7.0）。";
  }
  if (gate === "ntrp" && intent?.action === "players") {
    return "要查看在線球友，請填寫公開暱稱與 NTRP（1.0–7.0）。";
  }
  if (gate === "ntrp") return "要開球局，請填寫公開暱稱與 NTRP（1.0–7.0）。";
  if (gate === "directory") return "要使用球友目錄或公開球友卡，請填寫公開暱稱、NTRP（1.0–7.0），並選擇至少一座台北市常打球場。";
  return "要加入球局，請填寫公開暱稱。";
}

function validateProfileForm(profile, requiredGate, intent = null) {
  if (!profile.nick) return "請填寫公開暱稱。";
  if (profile.ntrp != null && !validProfileNtrp(profile.ntrp)) {
    return "NTRP 請填寫 1.0 到 7.0，或留白。";
  }
  if (profile.ntrp != null && !Number.isInteger(Number(profile.ntrp) * 10)) {
    return "NTRP 最多一位小數，或留白。";
  }
  if (requiredGate === "ntrp" && !validProfileNtrp(profile.ntrp)) return profileGateHint("ntrp", intent);
  if (requiredGate === "directory" && (!validProfileNtrp(profile.ntrp) || !profile.courts.size)) return profileGateHint("directory");
  return "";
}

/** Open the private profile-completion sheet without leaking profile fields to public renderers. */
export function openProfileCompletionSheet({
  avatarUrl = "",
  courts = [],
  courtsReady = true,
  onClose = () => {},
  onSave = async () => {},
  onSaved = async () => {},
  intent = null,
  mode = "gate",
  profile = {},
  returnSession = null,
} = {}) {
  // standalone 是「我」頁的常駐編輯入口：同一份表單與驗證，只是不帶 gate 的催促語氣。
  const standalone = mode === "standalone";
  const selectedCourts = profile.courts instanceof Set ? profile.courts : new Set(profile.courts ?? []);
  const selectedTypes = profile.types instanceof Set ? profile.types : new Set(profile.types ?? []);
  const selectedSlots = profile.slots instanceof Set ? profile.slots : new Set(profile.slots ?? []);
  const requiredGate = profileGateForIntent(intent);
  const gateHint = intent ? profileGateHint(requiredGate, intent) : "";
  const compactCreateGate = intent?.action === "create";
  const needsNickname = !String(profile.nick ?? "").trim();
  const needsNtrp = !validProfileNtrp(profile.ntrp);
  let saved = false;
  const mounted = mountSheet({
    id: "profile-completion-sheet",
    label: standalone ? "編輯個人檔案" : "完成個人檔案",
    className: "profile-sheet",
    onClose: (detail = {}) => onClose({ ...detail, saved }),
    html: `
      <div class="surface__head">
        <div><p class="surface__eyebrow">${standalone ? "個人檔案" : "完成後即可繼續"}</p><h2>${
          standalone ? "編輯個人檔案" : "完成個人檔案"
        }</h2></div>
        <button type="button" class="surface__close" data-surface-close aria-label="關閉個人檔案">×</button>
      </div>
      ${
        returnSession && !standalone
          ? `<p class="profile-return-context">完成後將回到：${esc(returnSession.court)}・${esc(taipeiDateTime(returnSession.startAt))}</p>`
          : ""
      }
      ${gateHint && !standalone ? `<p class="form-hint">${esc(gateHint)}</p>` : ""}
      <div class="profile-avatar-preview" data-profile-avatar>${avatarMarkup({ avatarUrl, nickname: profile.nick })}<p>使用 Google 頭像，無法自訂</p></div>
      <form class="profile-form" data-testid="profile-form" novalidate>
        ${
          !compactCreateGate || needsNickname
            ? `<label class="form-field" for="profile-nickname"><span>公開暱稱</span><input id="profile-nickname" name="profile-nickname" required value="${esc(
                profile.nick ?? ""
              )}" autocomplete="nickname" /></label>`
            : ""
        }
        <p class="form-disclosure">${esc(PROFILE_PUBLIC_DISCLOSURE)}</p>
        ${
          !compactCreateGate || needsNtrp
            ? `<label class="form-field" for="profile-ntrp"><span>${compactCreateGate ? "NTRP 程度" : "NTRP 程度（選填）"}</span><input id="profile-ntrp" name="profile-ntrp" type="number" min="1" max="7" step="0.1" value="${esc(
                profile.ntrp ?? ""
              )}" inputmode="decimal" placeholder="尚未填寫" /></label>
              <p class="form-hint" data-ntrp-explanation>${esc(NTRP_SCALE_EXPLANATION)}</p>`
            : ""
        }
        ${
          compactCreateGate
            ? ""
            : `<fieldset class="form-fieldset"><legend>常打球場</legend><div class="option-grid option-grid--stacked" data-profile-courts data-testid="profile-courts-picker"></div><p class="form-hint" data-profile-courts-status role="status" aria-live="polite"></p></fieldset>
        <fieldset class="form-fieldset"><legend>常打類型</legend><div class="option-grid">${PROFILE_PLAY_TYPES.map(
          (type) =>
            `<label><input type="checkbox" name="profile-types" value="${esc(type)}"${selectedTypes.has(type) ? " checked" : ""} /> ${esc(
              type
            )}</label>`
        ).join("")}</div></fieldset>
        <fieldset class="form-fieldset"><legend>可打時段</legend><div class="option-grid">${PROFILE_SLOTS.map(
          ([value, label]) =>
            `<label><input type="checkbox" name="profile-slots" value="${esc(value)}"${selectedSlots.has(value) ? " checked" : ""} /> ${esc(
              label
            )}</label>`
        ).join("")}</div></fieldset>`
        }
        <p class="form-error" data-profile-error role="alert" hidden></p>
        <button type="submit" class="session-primary" data-testid="profile-save">${standalone ? "儲存" : "儲存並繼續"}</button>
      </form>`,
  });
  const form = mounted.root.querySelector("[data-testid='profile-form']");
  wireAvatarFallbacks(mounted.root);
  const error = mounted.root.querySelector("[data-profile-error]");
  const submit = mounted.root.querySelector("[data-testid='profile-save']");
  const courtsContainer = mounted.root.querySelector("[data-profile-courts]");
  const courtsStatus = mounted.root.querySelector("[data-profile-courts-status]");
  const setCourts = (nextCourts, { ready = true } = {}) => {
    updateCourtCheckboxes(courtsContainer, courtsStatus, nextCourts, {
      ready,
      selected: selectedCourtCheckboxValues(courtsContainer, selectedCourts),
    });
  };
  setCourts(courts, { ready: courtsReady });
  let saving = false;
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving) return;
    const nextProfile = profileFormValue(form, profile, selectedCourts);
    const message = validateProfileForm(nextProfile, requiredGate, intent);
    if (message) {
      error.hidden = false;
      error.textContent = message;
      return;
    }
    saving = true;
    submit.disabled = true;
    error.hidden = true;
    try {
      const savedProfile = await onSave(nextProfile);
      saved = true;
      mounted.close({ reason: "complete" });
      await onSaved(savedProfile ?? nextProfile);
    } catch (saveError) {
      error.hidden = false;
      error.textContent = saveError?.message || "個人檔案暫時無法儲存。";
    } finally {
      if (mounted.root.contains(submit)) {
        saving = false;
        submit.disabled = false;
      }
    }
  });
  return { ...mounted, setCourts };
}

// ============================================================
// 批 D5(v2 改版):開球局改全螢幕計分板流程。dc 抽取規格(§0-8)逐字值見批次
// 派工單;此區塊只放 create 表單專用的純函式(可單元測試),DOM 組裝在
// openCreateSessionSheet 內。CREATE_NTRP_BANDS 與 D4a 篩選 BANDS(filters.js)
// 的 0/9 哨兵無關,兩者刻意不共用——建局表單的「不限」要落地成 ntrpMin/Max
// 皆 null(既有 validateCreateSessionInput 的「選填」語意),不是字面 1..7,
// 否則詳情頁與篩選會把「不限」誤顯示成「NTRP 1.0–7.0」。
const CREATE_DATE_CHIP_KEYS = ["today", "tomorrow", "sat", "sun"];
const CREATE_DATE_CHIP_WORDS = { today: "今天", tomorrow: "明天", sat: "週六", sun: "週日" };
const CREATE_TIME_PRESETS = ["06:30", "08:00", "09:00", "14:00", "17:00", "18:00", "19:00", "20:00", "21:00"];
const CREATE_TIME_MIN_MINUTES = 360; // 06:00(dc bumpTime 邊界)
const CREATE_TIME_MAX_MINUTES = 1320; // 22:00 — 抽取規格明白指出不是 21:45
const CREATE_TIME_CUSTOM_DEFAULT = "19:30";
export const CREATE_SLOT_OPTIONS = [
  { endHour: 10, key: "morning", label: "早上 06–10", startHour: 6 },
  { endHour: 17, key: "afternoon", label: "下午 14–17", startHour: 14 },
  { endHour: 22, key: "evening", label: "晚上 18–22", startHour: 18 },
];
export const CREATE_NTRP_BANDS = [
  { key: "any", label: "不限", max: null, min: null },
  { key: "lo", label: "≤ 3.0", max: 3, min: 1 },
  { key: "mid", label: "3.0–4.0", max: 4, min: 3 },
  { key: "hi", label: "4.0–5.0", max: 5, min: 4 },
  { key: "pro", label: "5.0 +", max: 7, min: 5 },
];

function freshCreateSessionForm() {
  return {
    band: "any", // dc 預設 mid 是原型假資料;「不限」才符合現行選填語意,回報標注
    booked: false,
    candCourts: {},
    court: null,
    customDate: "",
    dateKey: "today",
    feeNote: "",
    instant: true,
    mode: "fixed",
    need: 2,
    note: "",
    nowStart: false,
    slot: null,
    time: null,
    timeCustom: false,
    type: "雙打",
  };
}

/** venueType 由「已定球場／先列候選」segmented + 「已訂場」toggle 推導,單元測試覆蓋。 */
export function deriveCreateVenueType(mode, booked) {
  if (mode === "cand") return "candidates";
  return booked ? "booked" : "walk_on";
}

/** 建局專用 NTRP 區間映射;'any' 回傳 null/null(=不限,對映 validateCreateSessionInput 的選填語意)。 */
export function createNtrpRangeForBand(bandKey) {
  const band = CREATE_NTRP_BANDS.find((candidate) => candidate.key === bandKey) ?? CREATE_NTRP_BANDS[0];
  return { ntrpMax: band.max, ntrpMin: band.min };
}

/** 日期 chip 推導出的實際日期(週六/週日=下一個該星期日,今天即週六則同今天)。 */
export function createDateChipDate(key, now = new Date()) {
  const parts = taipeiParts(now);
  if (!parts) return now;
  const daysAhead = { sat: (6 - parts.weekday + 7) % 7, sun: (0 - parts.weekday + 7) % 7, today: 0, tomorrow: 1 }[key];
  return daysAhead == null ? now : new Date(now.getTime() + daysAhead * 86_400_000);
}

function createDateChipLabel(key, now = new Date()) {
  const word = CREATE_DATE_CHIP_WORDS[key];
  if (!word) return "自訂";
  const parts = taipeiParts(createDateChipDate(key, now));
  return parts ? `${word} ${padTwo(parts.month)}/${padTwo(parts.day)}` : word;
}

function taipeiDateValue(value, now = new Date()) {
  const parts = taipeiParts(value ?? now);
  return parts ? `${parts.year}-${padTwo(parts.month)}-${padTwo(parts.day)}` : "";
}

/** 表單目前選中的日期(YYYY-MM-DD,Taipei);'custom' 用使用者填的 customDate。 */
export function resolveCreateDateValue(form, now = new Date()) {
  if (form.dateKey === "custom") return form.customDate || "";
  return taipeiDateValue(createDateChipDate(form.dateKey, now), now);
}

/** ±15 分鐘 stepper,邊界 06:00–22:00(見抽取規格「找不到/需注意」)。 */
export function bumpCreateTimeMinutes(time, deltaMinutes) {
  const [hourText, minuteText] = String(time || CREATE_TIME_CUSTOM_DEFAULT).split(":");
  let minutes = Number(hourText) * 60 + Number(minuteText) + deltaMinutes;
  minutes = Math.max(CREATE_TIME_MIN_MINUTES, Math.min(CREATE_TIME_MAX_MINUTES, minutes));
  return `${padTwo(Math.floor(minutes / 60))}:${padTwo(minutes % 60)}`;
}

/** 已定模式:日期＋時間組成 datetime-local 字串,交給既有 validateCreateSessionInput。 */
export function createFixedStartAtLocal(form, now = new Date()) {
  const dateValue = resolveCreateDateValue(form, now);
  if (!dateValue || !form.time) return "";
  return `${dateValue}T${form.time}`;
}

/** 候選模式:日期＋時段起訖組成 startAtLocal/rangeEndLocal。 */
export function createCandidateWindowLocal(form, now = new Date()) {
  const dateValue = resolveCreateDateValue(form, now);
  const slot = CREATE_SLOT_OPTIONS.find((option) => option.key === form.slot);
  if (!dateValue || !slot) return { rangeEndLocal: "", startAtLocal: "" };
  return {
    rangeEndLocal: `${dateValue}T${padTwo(slot.endHour)}:00`,
    startAtLocal: `${dateValue}T${padTwo(slot.startHour)}:00`,
  };
}

/** 底鈕守門(dc canPublish,§7):候選=候選≥2＋時段已選;已定=球場＋時間已選。 */
export function createSessionFormCanPublish(form) {
  if (form.mode === "cand") {
    const count = Object.values(form.candCourts).filter(Boolean).length;
    return count >= 2 && Boolean(form.slot);
  }
  return Boolean(form.court) && Boolean(form.time);
}

/** 把表單狀態轉成 validateCreateSessionInput 吃的原始欄位(字串/陣列),不改動該函式本身的契約。 */
export function createSessionFormRawInput(form, now = new Date()) {
  const isCandidate = form.mode === "cand";
  const venueType = deriveCreateVenueType(form.mode, form.booked);
  const { ntrpMax, ntrpMin } = createNtrpRangeForBand(form.band);
  const candidateWindow = isCandidate ? createCandidateWindowLocal(form, now) : null;
  return {
    candidateCourtIds: isCandidate
      ? Object.keys(form.candCourts).filter((id) => form.candCourts[id])
      : [],
    courtId: isCandidate ? "" : (form.court ?? ""),
    feeNote: form.feeNote,
    joinMode: form.instant ? "instant" : "approval",
    notes: form.note,
    ntrpMax: ntrpMax == null ? "" : String(ntrpMax),
    ntrpMin: ntrpMin == null ? "" : String(ntrpMin),
    playType: form.type,
    rangeEndLocal: isCandidate ? candidateWindow.rangeEndLocal : "",
    slotsTotal: String(form.need),
    startAtLocal: isCandidate ? candidateWindow.startAtLocal : createFixedStartAtLocal(form, now),
    venueType,
  };
}

function createCourtCellMarkup(court, { role, selected }) {
  const testPrefix = role === "court" ? "create-court" : "create-candidate-court";
  return `<button type="button" class="create-v2__court-cell${selected ? " is-selected" : ""}" data-role="${esc(
    role
  )}" data-value="${esc(court.id)}" data-testid="${testPrefix}-${esc(court.id)}">
    <span class="create-v2__court-name">${esc(court.name)}</span>
    <span class="create-v2__court-sub">${esc(court.district || "台北市")}</span>
  </button>`;
}

/** 開球局全螢幕流程(批 D5):計分板視覺,含成功頁;大量複用 D1/D4 語彙。 */
export function openCreateSessionSheet({
  courts = [],
  courtsReady = true,
  onClose = () => {},
  onSubmit = async () => {},
  onViewMySessions = () => {},
  toast = () => {},
} = {}) {
  const now = () => new Date();
  const form = freshCreateSessionForm();
  const mounted = mountSheet({
    id: "session-create-modal",
    label: "開球局",
    className: "create-v2",
    onClose,
    html: `
      <div class="create-v2__head" data-screen-label="開球局">
        <button type="button" class="create-v2__back" data-surface-close aria-label="關閉開球局">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div><p class="surface__eyebrow">HOST A MATCH</p><h2>開球局</h2></div>
      </div>
      <div class="create-v2__scroll qm-scroll">
        <form class="create-v2__form" data-testid="session-form" novalidate>
          <section class="create-v2__card">
            <p class="create-v2__label">球場</p>
            <div class="create-v2__segmented" role="group" aria-label="場地確定了嗎？">
              <button type="button" class="create-v2__seg-btn" data-role="mode" data-value="fixed" data-testid="create-mode-fixed" aria-pressed="true">已定球場</button>
              <button type="button" class="create-v2__seg-btn" data-role="mode" data-value="cand" data-testid="session-venue-candidates" aria-pressed="false">先列候選</button>
            </div>
            <div data-single-court-fields>
              <div class="create-v2__court-grid qm-scroll" data-testid="session-court" role="group" aria-label="選擇球場"></div>
              <p class="form-hint" data-create-courts-status role="status" aria-live="polite"></p>
            </div>
            <div data-candidate-court-fields hidden>
              <p class="create-v2__hint" data-candidate-selection-hint></p>
              <div class="create-v2__court-grid qm-scroll" data-testid="session-candidate-courts" role="group" aria-label="候選球場（最多 3 座）"></div>
              <p class="form-hint" data-create-candidate-courts-status role="status" aria-live="polite"></p>
            </div>
          </section>

          <section class="create-v2__card">
            <p class="create-v2__label">日期</p>
            <div class="create-v2__chip-row" role="group" aria-label="日期">
              ${CREATE_DATE_CHIP_KEYS.map(
                (key) =>
                  `<button type="button" class="chip chip--form" data-role="date" data-value="${esc(
                    key
                  )}" data-testid="create-date-${esc(key)}">${esc(createDateChipLabel(key, now()))}</button>`
              ).join("")}
              <button type="button" class="chip chip--form" data-role="date" data-value="custom" data-testid="create-date-custom">自訂</button>
            </div>
            <p class="create-v2__custom-date" data-custom-date-field hidden>
              <input type="date" data-testid="create-date-custom-input" aria-label="自訂日期" />
            </p>

            <div data-candidate-slot-fields hidden>
              <p class="create-v2__label create-v2__label--mt">時段範圍</p>
              <div class="create-v2__chip-row" role="group" aria-label="時段範圍">
                ${CREATE_SLOT_OPTIONS.map(
                  (option) =>
                    `<button type="button" class="chip chip--time" data-role="slot" data-value="${esc(
                      option.key
                    )}" data-testid="create-slot-${esc(option.key)}">${esc(option.label)}</button>`
                ).join("")}
              </div>
            </div>

            <div data-fixed-time-fields>
              <p class="create-v2__label create-v2__label--mt">開始時間</p>
              <div class="create-v2__chip-row create-v2__chip-row--scroll qm-scroll" role="group" aria-label="開始時間">
                <button type="button" class="chip chip--time" data-role="time-now" data-testid="session-now-start">現在開打</button>
                ${CREATE_TIME_PRESETS.map(
                  (time) =>
                    `<button type="button" class="chip chip--time" data-role="time" data-value="${esc(
                      time
                    )}" data-testid="create-time-${esc(time)}">${esc(time)}</button>`
                ).join("")}
                <button type="button" class="chip chip--time" data-role="time-custom" data-testid="create-time-custom">自訂</button>
              </div>
              <div class="create-v2__stepper" data-time-stepper hidden>
                <p class="create-v2__stepper-label">自訂開始（每 15 分）</p>
                <button type="button" class="create-v2__stepper-btn" data-role="time-step" data-value="-15" data-testid="create-time-minus" aria-label="開始時間往前 15 分">−</button>
                <output class="create-v2__stepper-value" data-testid="create-time-value">${esc(CREATE_TIME_CUSTOM_DEFAULT)}</output>
                <button type="button" class="create-v2__stepper-btn" data-role="time-step" data-value="15" data-testid="create-time-plus" aria-label="開始時間往後 15 分">＋</button>
              </div>
            </div>
            <input type="hidden" name="startAtLocal" data-testid="session-start-at" />
          </section>

          <section class="create-v2__card">
            <p class="create-v2__label">打法</p>
            <div class="create-v2__chip-row" role="group" aria-label="打法">
              ${CREATE_SESSION_PLAY_TYPES.map(
                (type) =>
                  `<button type="button" class="chip chip--form" data-role="play-type" data-value="${esc(
                    type
                  )}" data-testid="create-play-type-${esc(type)}">${esc(type)}</button>`
              ).join("")}
            </div>
            <p class="form-hint">${esc(PLAY_TYPE_HINT)}</p>
            <p class="create-v2__label create-v2__label--mt">找的程度</p>
            <div class="create-v2__chip-row" role="group" aria-label="找的程度">
              ${CREATE_NTRP_BANDS.map(
                (band) =>
                  `<button type="button" class="chip chip--time" data-role="band" data-value="${esc(
                    band.key
                  )}" data-testid="create-band-${esc(band.key)}">${esc(band.label)}</button>`
              ).join("")}
            </div>
            <p class="form-hint" data-ntrp-explanation>${esc(NTRP_SCALE_EXPLANATION)}</p>
          </section>

          <section class="create-v2__card">
            <div class="create-v2__stepper-row">
              <p class="create-v2__stepper-title">缺幾位</p>
              <button type="button" class="create-v2__stepper-btn" data-role="need-step" data-value="-1" data-testid="create-need-minus" aria-label="缺額減少一位">−</button>
              <output class="create-v2__stepper-value create-v2__stepper-value--lg" data-testid="create-need-value">2</output>
              <button type="button" class="create-v2__stepper-btn" data-role="need-step" data-value="1" data-testid="create-need-plus" aria-label="缺額增加一位">＋</button>
            </div>
            <p class="form-hint">不含你自己。</p>
            <input type="hidden" name="slotsTotal" data-testid="session-slots-value" />

            <div class="create-v2__toggle-row">
              <div class="create-v2__toggle-copy">
                <p class="create-v2__toggle-title">直接加入</p>
                <p class="create-v2__toggle-sub">選擇直接加入後，已填暱稱且 NTRP 符合球局範圍的球友會直接加入；未填 NTRP 或超出範圍者會改為申請，由你審核。加入後可在球局群組聊天協調。</p>
              </div>
              <button type="button" class="toggle-switch" role="switch" data-role="instant-toggle" data-testid="create-instant-toggle" aria-checked="true" aria-label="直接加入：已開啟"></button>
            </div>

            <div class="create-v2__toggle-row" data-booked-toggle-field>
              <div class="create-v2__toggle-copy">
                <p class="create-v2__toggle-title">已訂場</p>
                <p class="create-v2__toggle-sub">已預訂場地，費用到場均分。</p>
              </div>
              <button type="button" class="toggle-switch" role="switch" data-role="booked-toggle" data-testid="session-venue-booked" aria-checked="false" aria-label="已訂場：已關閉"></button>
            </div>
            <p class="create-v2__hint" data-candidate-booked-alt hidden>候選模式先不填訂場 — 定案球場後再補訂場資訊，成員會收到通知。</p>
          </section>

          <section class="create-v2__card">
            <label class="create-v2__label" for="session-fee-note">費用說明（選填，最多 500 字）</label>
            <textarea id="session-fee-note" class="create-v2__textarea" data-testid="session-fee-note" maxlength="500" rows="2"></textarea>
            <label class="create-v2__label create-v2__label--mt" for="session-notes">備註（選填，最多 500 字）</label>
            <textarea id="session-notes" class="create-v2__textarea" data-testid="session-notes" maxlength="500" rows="4" placeholder="球風、注意事項、集合方式…"></textarea>
          </section>

          <div class="create-v2__footer" data-create-footer>
            <p class="form-disclosure">${esc(PROFILE_PUBLIC_DISCLOSURE)}</p>
            <p class="form-error" data-create-error role="alert" hidden></p>
            <button type="submit" class="create-v2__publish" data-testid="session-submit">發布球局</button>
          </div>
        </form>

        <div class="create-v2__done" data-create-done hidden>
          <div class="create-v2__done-badge" aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
          </div>
          <h3 class="create-v2__done-title" tabindex="-1" data-testid="create-done-title">球局已發布！</h3>
          <p class="create-v2__done-copy">已出現在地圖上，<br />有人報名時會通知你。</p>
          <div class="create-v2__done-card" data-testid="create-done-card">
            <div class="time-tile time-tile--done"><span class="time-tile__start" data-done-time></span><span class="time-tile__date" data-done-date></span></div>
            <div class="create-v2__done-card-copy">
              <p class="create-v2__done-court" data-done-court></p>
              <p class="create-v2__done-meta" data-done-meta></p>
            </div>
            <span class="slots-brick" data-done-need></span>
          </div>
          <button type="button" class="session-primary create-v2__done-primary" data-testid="create-done-view-my-sessions">查看我的球局</button>
          <button type="button" class="create-v2__done-secondary" data-testid="create-done-back-to-map">回到地圖</button>
        </div>
      </div>`,
  });

  const surface = mounted.surface;
  const formElement = surface.querySelector("[data-testid='session-form']");
  const doneSection = surface.querySelector("[data-create-done]");
  const footer = surface.querySelector("[data-create-footer]");
  const errorNode = surface.querySelector("[data-create-error]");
  const publishButton = surface.querySelector("[data-testid='session-submit']");
  const fixedCourtFields = surface.querySelector("[data-single-court-fields]");
  const candidateCourtFields = surface.querySelector("[data-candidate-court-fields]");
  const fixedCourtGrid = surface.querySelector("[data-testid='session-court']");
  const candidateCourtGrid = surface.querySelector("[data-testid='session-candidate-courts']");
  const courtsStatus = surface.querySelector("[data-create-courts-status]");
  const candidateCourtsStatus = surface.querySelector("[data-create-candidate-courts-status]");
  const candidateSelectionHint = surface.querySelector("[data-candidate-selection-hint]");
  const customDateField = surface.querySelector("[data-custom-date-field]");
  const customDateInput = surface.querySelector("[data-testid='create-date-custom-input']");
  const fixedTimeFields = surface.querySelector("[data-fixed-time-fields]");
  const candidateSlotFields = surface.querySelector("[data-candidate-slot-fields]");
  const timeStepper = surface.querySelector("[data-time-stepper]");
  const timeStepperValue = surface.querySelector("[data-testid='create-time-value']");
  const needValue = surface.querySelector("[data-testid='create-need-value']");
  const instantToggle = surface.querySelector("[data-testid='create-instant-toggle']");
  const bookedToggle = surface.querySelector("[data-testid='session-venue-booked']");
  const bookedToggleField = surface.querySelector("[data-booked-toggle-field]");
  const candidateBookedAlt = surface.querySelector("[data-candidate-booked-alt]");
  const startAtHiddenInput = surface.querySelector("[data-testid='session-start-at']");
  const slotsHiddenInput = surface.querySelector("[data-testid='session-slots-value']");
  const doneTitle = surface.querySelector("[data-testid='create-done-title']");
  const doneTime = surface.querySelector("[data-done-time]");
  const doneDate = surface.querySelector("[data-done-date]");
  const doneCourt = surface.querySelector("[data-done-court]");
  const doneMeta = surface.querySelector("[data-done-meta]");
  const doneNeed = surface.querySelector("[data-done-need]");
  const feeNoteInput = surface.querySelector("[data-testid='session-fee-note']");
  const notesInput = surface.querySelector("[data-testid='session-notes']");

  let availableCourts = taipeiCourts(courts);
  let courtsReadyFlag = Boolean(courtsReady);
  let stage = "form";
  let submitting = false;
  let doneSessionId = null;

  function renderCourtGrids() {
    const ready = courtsReadyFlag && availableCourts.length > 0;
    if (fixedCourtGrid) {
      fixedCourtGrid.innerHTML = ready
        ? availableCourts
            .map((court) => createCourtCellMarkup(court, { role: "court", selected: Number(court.id) === form.court }))
            .join("")
        : "";
    }
    if (candidateCourtGrid) {
      candidateCourtGrid.innerHTML = ready
        ? availableCourts
            .map((court) => createCourtCellMarkup(court, { role: "cand-court", selected: Boolean(form.candCourts[court.id]) }))
            .join("")
        : "";
    }
    const statusText = !courtsReadyFlag ? "正在載入台北市球場…" : availableCourts.length ? "" : "目前沒有可選的台北市球場。";
    if (courtsStatus) {
      courtsStatus.hidden = ready;
      courtsStatus.textContent = statusText;
    }
    if (candidateCourtsStatus) {
      candidateCourtsStatus.hidden = ready;
      candidateCourtsStatus.textContent = statusText;
    }
  }

  function sync() {
    const isCand = form.mode === "cand";
    surface.querySelectorAll('[data-role="mode"]').forEach((button) => {
      const active = button.dataset.value === form.mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (fixedCourtFields) fixedCourtFields.hidden = isCand;
    if (candidateCourtFields) candidateCourtFields.hidden = !isCand;
    if (fixedTimeFields) fixedTimeFields.hidden = isCand;
    if (candidateSlotFields) candidateSlotFields.hidden = !isCand;
    if (bookedToggleField) bookedToggleField.hidden = isCand;
    if (candidateBookedAlt) candidateBookedAlt.hidden = !isCand;

    surface.querySelectorAll('[data-role="court"]').forEach((button) => {
      button.classList.toggle("is-selected", Number(button.dataset.value) === form.court);
    });
    surface.querySelectorAll('[data-role="cand-court"]').forEach((button) => {
      button.classList.toggle("is-selected", Boolean(form.candCourts[button.dataset.value]));
    });
    const candCount = Object.values(form.candCourts).filter(Boolean).length;
    if (candidateSelectionHint) {
      candidateSelectionHint.innerHTML = `還沒訂到場？先列 2–3 個候選，之後再定案（已選 <span class="create-v2__mono">${candCount}</span>/3）`;
    }

    surface.querySelectorAll('[data-role="date"]').forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.value === form.dateKey);
    });
    if (customDateField) customDateField.hidden = form.dateKey !== "custom";
    if (customDateInput && customDateInput.value !== form.customDate) customDateInput.value = form.customDate || "";

    surface.querySelectorAll('[data-role="slot"]').forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.value === form.slot);
    });

    surface.querySelectorAll('[data-role="time"]').forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.value === form.time && !form.timeCustom && !form.nowStart);
    });
    surface.querySelector('[data-role="time-now"]')?.classList.toggle("is-selected", form.nowStart);
    surface.querySelector('[data-role="time-custom"]')?.classList.toggle("is-selected", form.timeCustom);
    if (timeStepper) timeStepper.hidden = !form.timeCustom;
    if (timeStepperValue) timeStepperValue.textContent = form.time || CREATE_TIME_CUSTOM_DEFAULT;

    surface.querySelectorAll('[data-role="play-type"]').forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.value === form.type);
    });
    surface.querySelectorAll('[data-role="band"]').forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.value === form.band);
    });

    if (needValue) needValue.textContent = String(form.need);
    if (slotsHiddenInput) slotsHiddenInput.value = String(form.need);
    if (startAtHiddenInput) {
      startAtHiddenInput.value = isCand
        ? createCandidateWindowLocal(form, now()).startAtLocal
        : createFixedStartAtLocal(form, now());
    }

    if (instantToggle) {
      instantToggle.setAttribute("aria-checked", String(form.instant));
      instantToggle.setAttribute("aria-label", `直接加入：${form.instant ? "已開啟" : "已關閉"}`);
    }
    if (bookedToggle) {
      bookedToggle.setAttribute("aria-checked", String(form.booked));
      bookedToggle.setAttribute("aria-label", `已訂場：${form.booked ? "已開啟" : "已關閉"}`);
    }

    const ready = createSessionFormCanPublish(form);
    if (publishButton) {
      publishButton.classList.toggle("is-ready", ready);
      publishButton.textContent = ready ? "發布球局" : isCand ? "選 2–3 個候選與時段" : "選好球場與開始時間";
    }
  }

  renderCourtGrids();
  sync();

  function showError(message) {
    if (!errorNode) return;
    errorNode.hidden = false;
    errorNode.textContent = message;
  }

  function hideError() {
    if (!errorNode) return;
    errorNode.hidden = true;
    errorNode.textContent = "";
  }

  function showDone(value, result) {
    stage = "done";
    doneSessionId = result?.sessionId ?? null;
    if (doneTime) doneTime.textContent = taipeiClock(value.startAt);
    if (doneDate) doneDate.textContent = taipeiTileDate(value.startAt);
    const isCand = value.venueType === "candidates";
    const courtId = isCand ? value.candidateCourtIds?.[0] : value.courtId;
    const court = availableCourts.find((candidate) => String(candidate.id) === String(courtId));
    if (doneCourt) doneCourt.textContent = court?.name ?? "球場待確認";
    if (doneMeta) {
      doneMeta.textContent = isCand
        ? `候選 ${value.candidateCourtIds?.length ?? 0} 座球場・${court?.district ?? "台北市"}`
        : `${value.playType}・${court?.district ?? "台北市"}`;
    }
    if (doneNeed) doneNeed.textContent = `缺 ${value.slotsTotal}`;
    if (formElement) formElement.hidden = true;
    if (footer) footer.hidden = true;
    if (doneSection) doneSection.hidden = false;
    requestAnimationFrame(() => doneTitle?.focus({ preventScroll: true }));
  }

  surface.addEventListener("click", (event) => {
    const target = event.target.closest("[data-role]");
    if (!target || target.disabled) return;
    const role = target.dataset.role;
    if (role === "mode") {
      form.mode = target.dataset.value;
      sync();
    } else if (role === "court") {
      form.court = Number(target.dataset.value);
      sync();
    } else if (role === "cand-court") {
      const id = target.dataset.value;
      const isOn = Boolean(form.candCourts[id]);
      const selectedCount = Object.values(form.candCourts).filter(Boolean).length;
      if (!isOn && selectedCount >= 3) {
        toast("候選最多 3 個");
        return;
      }
      const nextCandCourts = { ...form.candCourts, [id]: !isOn };
      if (!nextCandCourts[id]) delete nextCandCourts[id];
      form.candCourts = nextCandCourts;
      sync();
    } else if (role === "date") {
      form.dateKey = target.dataset.value;
      if (form.dateKey === "custom" && !form.customDate) form.customDate = taipeiDateValue(now(), now());
      form.nowStart = false;
      sync();
      // 展開的輸入框可能落在 sticky footer 遮蔽區,捲出來(.create-v2__scroll 的
      // scroll-padding-bottom 已把 footer 覆蓋範圍算進去);guard 對 DOM stub 環境讓步。
      if (form.dateKey === "custom" && typeof customDateField?.scrollIntoView === "function") {
        customDateField.scrollIntoView({ block: "nearest" });
      }
    } else if (role === "slot") {
      form.slot = target.dataset.value;
      sync();
    } else if (role === "time") {
      form.time = target.dataset.value;
      form.timeCustom = false;
      form.nowStart = false;
      sync();
    } else if (role === "time-custom") {
      form.time = form.timeCustom ? form.time || CREATE_TIME_CUSTOM_DEFAULT : CREATE_TIME_CUSTOM_DEFAULT;
      form.timeCustom = true;
      form.nowStart = false;
      sync();
    } else if (role === "time-now") {
      const current = now();
      form.dateKey = "today";
      form.customDate = "";
      form.time = taipeiClock(current);
      form.timeCustom = false;
      form.nowStart = true;
      sync();
    } else if (role === "time-step") {
      form.time = bumpCreateTimeMinutes(form.time, Number(target.dataset.value));
      form.nowStart = false;
      sync();
    } else if (role === "play-type") {
      // 既有連動保留:單打→1、雙打→3(練球不動,沿用改版前 playTypeSelect change
      // 行為)。原生 select 的 change 只在值真的變動時觸發,這裡改用 click 委派要
      // 自行擋掉「重點已選中的 chip」,否則手動調過的缺額會被無謂地推翻覆寫。
      const changed = target.dataset.value !== form.type;
      form.type = target.dataset.value;
      if (changed) {
        if (form.type === "單打") form.need = 1;
        else if (form.type === "雙打") form.need = 3;
      }
      sync();
    } else if (role === "band") {
      form.band = target.dataset.value;
      sync();
    } else if (role === "need-step") {
      form.need = Math.max(1, Math.min(3, form.need + Number(target.dataset.value)));
      sync();
    } else if (role === "instant-toggle") {
      form.instant = !form.instant;
      sync();
    } else if (role === "booked-toggle") {
      form.booked = !form.booked;
      sync();
    }
  });

  customDateInput?.addEventListener("change", () => {
    form.dateKey = "custom";
    form.customDate = customDateInput.value;
    form.nowStart = false;
    sync();
  });

  // 費用說明／備註是自由輸入,不影響任何其他控件的視覺狀態,只更新 state,
  // 不呼叫 sync()(避免每個按鍵都重掃全表單,也不需要——這兩個欄位沒有衍生視覺)。
  feeNoteInput?.addEventListener("input", () => {
    form.feeNote = feeNoteInput.value;
  });
  notesInput?.addEventListener("input", () => {
    form.note = notesInput.value;
  });

  surface.querySelector('[data-testid="create-done-view-my-sessions"]')?.addEventListener("click", () => {
    mounted.close({ reason: "view-my-sessions", restoreFocus: false });
    onViewMySessions(doneSessionId);
  });
  surface.querySelector('[data-testid="create-done-back-to-map"]')?.addEventListener("click", () => {
    mounted.close();
  });

  formElement?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting || stage !== "form") return;
    if (!createSessionFormCanPublish(form)) {
      toast(form.mode === "cand" ? "先選 2–3 個候選球場與時段" : "先選好球場與開始時間");
      return;
    }
    const validation = validateCreateSessionInput(createSessionFormRawInput(form, now()));
    if (!validation.valid) {
      showError(Object.values(validation.errors)[0]);
      return;
    }
    submitting = true;
    if (publishButton) publishButton.disabled = true;
    hideError();
    try {
      const result = await onSubmit(validation.value);
      showDone(validation.value, result);
    } catch (submitError) {
      showError(submitError?.message || "建立球局失敗，請稍後再試。");
    } finally {
      submitting = false;
      if (mounted.root.contains(publishButton)) publishButton.disabled = false;
    }
  });

  const setCourts = (nextCourts, { ready = true } = {}) => {
    availableCourts = taipeiCourts(nextCourts);
    courtsReadyFlag = Boolean(ready);
    renderCourtGrids();
    sync();
  };

  return { ...mounted, setCourts };
}

/** Open the one-tap candidate decision sheet backed by a fresh SessionSummary. */
export function openDecideSessionSheet(
  session,
  { courts = [], courtsReady = true, onClose = () => {}, onDecide = async () => {} } = {}
) {
  const candidateIds = new Set((session?.candidateCourtIds ?? []).map(String));
  const unavailable = !session || session.venueType !== "candidates" || Boolean(session.decidedAt);
  const mounted = mountSheet({
    id: "session-decision-sheet",
    label: "定案場地與時間",
    onClose,
    html: `
      <div class="surface__head">
        <div><p class="surface__eyebrow">候選局定案</p><h2>選一座球場完成定案</h2></div>
        <button type="button" class="surface__close" data-surface-close aria-label="關閉定案">×</button>
      </div>
      <p class="surface__copy">時間預設為範圍起點；調整後，點選球場即可完成。</p>
      <div data-decision-controls${unavailable ? " hidden" : ""}>
        <label class="form-field" for="session-decision-time"><span>台北時間</span><input id="session-decision-time" data-testid="session-decision-time" type="datetime-local" value="${esc(
          taipeiDateTimeLocalValue(session?.startAt, { includeMilliseconds: true })
        )}" min="${esc(taipeiDateTimeLocalValue(session?.startAt, { includeMilliseconds: true }))}" max="${esc(
          taipeiDateTimeLocalValue(session?.rangeEnd, { includeMilliseconds: true })
        )}" step="0.001" /></label>
        <div class="candidate-decision-buttons" aria-label="候選球場" data-decision-courts></div>
        <p class="form-hint" data-decision-courts-status role="status" aria-live="polite"></p>
        <p class="form-error" data-decision-error role="alert" hidden></p>
      </div>
      <p class="surface__message" data-decision-terminal role="status" tabindex="-1"${unavailable ? "" : " hidden"}>候選球局已逾期或下架，無法再定案。</p>`,
  });
  const controls = mounted.root.querySelector("[data-decision-controls]");
  const terminal = mounted.root.querySelector("[data-decision-terminal]");
  const error = mounted.root.querySelector("[data-decision-error]");
  const timeInput = mounted.root.querySelector("[data-testid='session-decision-time']");
  const courtButtons = mounted.root.querySelector("[data-decision-courts]");
  const courtsStatus = mounted.root.querySelector("[data-decision-courts-status]");
  let availableCourts = Array.isArray(courts) ? courts : [];
  let courtOptionsReady = Boolean(courtsReady);
  let terminalState = unavailable;
  let deciding = false;
  const buttons = () => [...mounted.root.querySelectorAll("[data-decide-court]")];
  const setTerminal = (message = "候選球局已逾期或下架，無法再定案。") => {
    terminalState = true;
    controls.hidden = true;
    terminal.textContent = message;
    terminal.hidden = false;
    terminal.focus({ preventScroll: true });
  };
  const decide = async (event) => {
    const button = event.currentTarget;
    if (deciding || terminalState) return;
    const startAt = taipeiLocalDateTimeToIso(timeInput?.value);
    const startMs = new Date(startAt ?? "").getTime();
    const rangeStartMs = new Date(session.startAt).getTime();
    const rangeEndMs = new Date(session.rangeEnd).getTime();
    if (!startAt || startMs < rangeStartMs || startMs > rangeEndMs) {
      error.textContent = "定案時間必須落在原本的時間範圍內。";
      error.hidden = false;
      return;
    }
    deciding = true;
    buttons().forEach((candidate) => {
      candidate.disabled = true;
    });
    error.hidden = true;
    try {
      await onDecide(Number(button.dataset.decideCourt), startAt);
    } catch (decisionError) {
      if (!terminalState) {
        error.textContent = decisionError?.message || "定案失敗，請稍後再試。";
        error.hidden = false;
      }
    } finally {
      if (!terminalState && mounted.root.contains(button)) {
        deciding = false;
        buttons().forEach((candidate) => {
          candidate.disabled = false;
        });
      }
    }
  };
  const renderCourtButtons = () => {
    if (terminalState) return;
    const candidateCourts = availableCourts.filter((court) => candidateIds.has(String(court.id)));
    courtButtons.innerHTML = candidateCourts
      .map(
        (court) =>
          `<button type="button" class="session-primary" data-decide-court="${esc(court.id)}" data-testid="decide-court-${esc(court.id)}">${esc(
            court.name
          )}</button>`
      )
      .join("");
    buttons().forEach((button) => {
      button.disabled = deciding;
      button.addEventListener("click", decide);
    });
    courtsStatus.textContent = !courtOptionsReady
      ? "正在載入候選球場…"
      : candidateCourts.length === 0
        ? "候選球場資料暫時無法載入，請稍後再試。"
        : "";
  };
  const setCourts = (nextCourts, { ready = true } = {}) => {
    availableCourts = Array.isArray(nextCourts) ? nextCourts : [];
    courtOptionsReady = Boolean(ready);
    renderCourtButtons();
  };
  setCourts(availableCourts, { ready: courtOptionsReady });
  return { ...mounted, setCourts, setTerminal };
}

/** Edit only the mutable single-court fields accepted by update_session. */
export function openEditSessionSheet(
  session,
  { courts = [], courtsReady = true, onClose = () => {}, onSubmit = async () => {} } = {}
) {
  // 漸進式揭露反模式防呆:已填的選填欄位不可被預設收合藏起來,四欄任一有值就預設展開。
  const hasOptionalValues = [session.ntrpMin, session.ntrpMax, session.feeNote, session.notes].some(
    (value) => value != null && String(value).trim() !== ""
  );
  const mounted = mountSheet({
    id: "session-edit-sheet",
    label: "編輯球局",
    className: "create-session-sheet",
    onClose,
    html: `
      <div class="surface__head">
        <div><p class="surface__eyebrow">編輯球局</p><h2>更新已建立的球局</h2></div>
        <button type="button" class="surface__close" data-surface-close aria-label="關閉編輯球局">×</button>
      </div>
      <form class="create-session-form" data-testid="session-edit-form" novalidate>
        <p><span class="session-badge">${esc(session.venueType === "walk_on" ? "現場等場" : "已訂場")}</span></p>
        <label class="form-field" for="session-edit-start-at"><span>台北時間</span><input id="session-edit-start-at" name="startAtLocal" data-testid="session-edit-start-at" type="datetime-local" value="${esc(
          taipeiDateTimeLocalValue(session.startAt, { includeMilliseconds: true })
        )}" step="0.001" required /></label>
        <div class="form-field"><label for="session-edit-court">台北市球場</label><select id="session-edit-court" name="courtId" data-testid="session-edit-court" required disabled></select><p class="form-hint" data-edit-courts-status role="status" aria-live="polite"></p></div>
        <div class="form-field"><label for="session-edit-play-type">打法</label><select id="session-edit-play-type" name="playType" data-testid="session-edit-play-type" required aria-describedby="session-edit-play-type-hint">${(session.playType === "對拉"
          ? [...CREATE_SESSION_PLAY_TYPES, "對拉"]
          : CREATE_SESSION_PLAY_TYPES
        )
          .map((type) => `<option value="${esc(type)}"${type === session.playType ? " selected" : ""}>${esc(type)}</option>`)
          .join("")}</select><p class="form-hint" id="session-edit-play-type-hint">${esc(PLAY_TYPE_HINT)}</p></div>
        <fieldset class="form-fieldset"><legend>還缺幾位</legend><div class="slots-options">${[1, 2, 3]
          .map(
            (value) =>
              `<label><input type="radio" name="slotsMissing" value="${value}" data-testid="session-edit-slots-${value}"${
                Number(session.slotsTotal) === value ? " checked" : ""
              } /><span>${value} 位</span></label>`
          )
          .join("")}</div><p class="form-hint">不含你自己。</p></fieldset>
        <details class="form-optional"${hasOptionalValues ? " open" : ""}><summary>進階設定（選填）</summary>
        <fieldset class="form-fieldset"><legend>適合程度（選填）</legend><div class="form-row"><label class="form-field" for="session-edit-ntrp-min"><span>最低 NTRP</span><input id="session-edit-ntrp-min" name="ntrpMin" type="number" min="1" max="7" step="0.5" inputmode="decimal" value="${esc(
          session.ntrpMin ?? ""
        )}" /></label><label class="form-field" for="session-edit-ntrp-max"><span>最高 NTRP</span><input id="session-edit-ntrp-max" name="ntrpMax" type="number" min="1" max="7" step="0.5" inputmode="decimal" value="${esc(
          session.ntrpMax ?? ""
        )}" /></label></div><p class="form-hint" data-ntrp-explanation>${esc(NTRP_SCALE_EXPLANATION)}</p></fieldset>
        <label class="form-field" for="session-edit-fee-note"><span>費用說明（選填，最多 500 字）</span><textarea id="session-edit-fee-note" name="feeNote" maxlength="500" rows="2">${esc(
          session.feeNote ?? ""
        )}</textarea></label>
        <label class="form-field" for="session-edit-notes"><span>備註（選填，最多 500 字）</span><textarea id="session-edit-notes" name="notes" maxlength="500" rows="4">${esc(
          session.notes ?? ""
        )}</textarea></label>
        </details>
        <p class="form-error" data-edit-error role="alert" hidden></p>
        <button type="submit" class="session-primary" data-testid="session-edit-submit">儲存變更</button>
      </form>`,
  });
  const form = mounted.root.querySelector("[data-testid='session-edit-form']");
  const courtSelect = mounted.root.querySelector("[data-testid='session-edit-court']");
  const courtsStatus = mounted.root.querySelector("[data-edit-courts-status]");
  const playTypeSelect = mounted.root.querySelector("[data-testid='session-edit-play-type']");
  const setSlotsMissing = (value) => {
    mounted.root.querySelectorAll("[name='slotsMissing']").forEach((radio) => {
      radio.checked = radio.value === String(value);
    });
  };
  const submit = mounted.root.querySelector("[data-testid='session-edit-submit']");
  const error = mounted.root.querySelector("[data-edit-error]");
  let availableCourts = courts;
  let optionsReady = courtsReady;
  const setCourts = (nextCourts, { ready = true } = {}) => {
    availableCourts = nextCourts;
    optionsReady = ready;
    updateCourtSelect(courtSelect, courtsStatus, availableCourts, {
      ready: optionsReady,
      selected: selectedCourtValues(courtSelect, [String(session.courtId)]),
    });
  };
  setCourts(availableCourts, { ready: optionsReady });
  playTypeSelect?.addEventListener("change", () => {
    if (playTypeSelect.value === "單打") setSlotsMissing(1);
    if (playTypeSelect.value === "雙打") setSlotsMissing(3);
  });
  let saving = false;
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving) return;
    const validation = validateUpdateSessionInput(Object.fromEntries(new FormData(form).entries()));
    if (!validation.valid) {
      error.textContent = Object.values(validation.errors)[0];
      error.hidden = false;
      return;
    }
    saving = true;
    submit.disabled = true;
    error.hidden = true;
    try {
      await onSubmit(validation.value);
    } catch (submitError) {
      error.textContent = submitError?.message || "更新球局失敗，請稍後再試。";
      error.hidden = false;
    } finally {
      if (mounted.root.contains(submit)) {
        saving = false;
        submit.disabled = false;
      }
    }
  });
  return { ...mounted, setCourts };
}

/** Open a session-only list for the selected base court or aggregate marker. */
export function openCourtSessionDrawer(court, sessions, { courts = [], onOpenSession = () => {} } = {}) {
  const mounted = mountSheet({
    id: "court-session-sheet",
    label: "球場球局",
    html: `
      <div class="surface__head">
        <div><p class="surface__eyebrow">${esc(court.district || court.city || "台北市")}</p><h2>${esc(court.name)}</h2></div>
        <button type="button" class="surface__close" data-surface-close aria-label="關閉球場球局">×</button>
      </div>
      <div class="nearby-sessions__cards">
        ${
          sessions.length
            ? sessions.map((session) => sessionCard(session, { compact: true, courts })).join("")
            : '<p class="surface__copy">這座球場目前沒有可加入的球局。</p>'
        }
      </div>`,
  });
  wireSessionCards(mounted.root, onOpenSession);
  return mounted;
}

/** Open the public player-directory rows for one court. */
export function openCourtPlayersDrawer(court, players, { onClose = () => {}, onOpenPlayer = () => {} } = {}) {
  const mounted = mountSheet({
    id: "court-players-sheet",
    label: "球場球友",
    onClose,
    html: `
      <div class="surface__head">
        <div><p class="surface__eyebrow">${esc(court.district || court.city || "台北市")}</p><h2>${esc(court.name)}・球友</h2></div>
        <button type="button" class="surface__close" data-surface-close aria-label="關閉球場球友">×</button>
      </div>
      <div class="nearby-sessions__cards">
        ${players.length ? players.map((player) => `
          <button type="button" class="player-card" data-testid="court-player-card-${esc(player.profileId)}" data-player-id="${esc(player.profileId)}">
            <strong>${esc(player.nickname)}</strong> · ${esc(formatNtrp(player.ntrp))}
            ${player.isPresent ? `<span class="player-presence">${esc(playerPresenceLabel(player))}${player.openToGreeting ? ` · ${esc(playerGreetingLabel(player))}` : ""}</span>` : ""}
            <span>${esc((player.playTypes ?? []).join("、") || "未填打法")}</span>
          </button>`).join("") : '<p class="surface__copy">這座球場目前沒有在線球友。</p>'}
      </div>`,
  });
  mounted.root.querySelectorAll("[data-player-id]").forEach((node) => {
    node.addEventListener("click", () => {
      const target = players.find((player) => String(player.profileId) === node.dataset.playerId);
      if (target) onOpenPlayer(target);
    });
  });
  return mounted;
}

// 批 D8:列改 dc §2 逐字結構(44px avatar+名+.ntrp-brick--sm+副行「常打 X · 時段」+
// chevron);「在線」「這是你」與 .trust-count 是既有功能,dc 玩具資料沒有這些概念,
// 刻意保留融入新版列(不是照抄 dc,是既有功能優先——.trust-count 由
// session.spec.js:1865/1890/1893 的 hosted 測試鎖定,不可移除)。打法整行 dc 沒有,
// 這裡收斂進副行,不獨立佔一行(dc §2 沒有對應欄位,且沒有測試依賴這行文字)。
function playerDirectoryRowsMarkup(players) {
  return players.length
    ? players
        .map((player) => {
          const courtsText = (player.courtNames ?? []).join("、") || player.courtName || "未填球場";
          const slotsText = playerSlotLabels(player.slotCodes).join("、") || "未填時段";
          return `<button type="button" class="player-directory-row" data-player-directory-row
            data-testid="player-directory-row-${esc(player.profileId)}" data-player-id="${esc(player.profileId)}">
            ${avatarMarkup({ nickname: player.nickname, size: "md" })}
            <span class="player-directory-row__body">
              <span class="player-directory-row__head">
                <strong>${esc(player.nickname || "未命名球友")}</strong>
                ${ntrpBrickSmMarkup(player.ntrp)}
                ${player.isPresent ? '<span class="player-directory-row__online">在線</span>' : ""}
                ${player.isSelf ? '<span class="player-directory-row__self">這是你</span>' : ""}
              </span>
              <span class="player-directory-row__sub">常打 ${esc(courtsText)} · ${esc(slotsText)}</span>
              ${trustCountMarkup(player.playedCount, "已打 {n} 場")}
            </span>
            <span class="player-directory-row__chevron" aria-hidden="true">›</span>
          </button>`;
        })
        .join("")
    : '<p class="surface__copy">目前沒有公開的球友卡。</p>';
}

/** Open the all-Taipei opt-in directory without coupling it to map bounds. */
export function openPlayerDirectoryList({ onClose = () => {}, onOpenPlayer = () => {}, onRetry = () => {} } = {}) {
  let currentPlayers = [];
  const mounted = mountSheet({
    id: "player-directory-sheet",
    label: "球友名單",
    className: "player-directory-sheet",
    onClose,
    html: `
      <span class="player-directory-sheet__grabber" aria-hidden="true"></span>
      <div class="surface__head player-directory-sheet__head">
        <div>
          <p class="surface__eyebrow">PLAYERS</p>
          <h2>球友名單</h2>
          <p class="player-directory-sheet__sub">開放名單的球友 · <span class="player-directory-sheet__count" data-player-directory-count>0</span> 位</p>
        </div>
        <button type="button" class="surface__close" data-surface-close aria-label="關閉球友名單">×</button>
      </div>
      <div class="player-directory-sheet__scroll qm-scroll">
        <p class="surface__copy">在線球友排在前面；點選球友卡可查看邀請入口。</p>
        <div class="player-directory-list" data-player-directory-list role="list"></div>
      </div>`,
  });
  const list = mounted.root.querySelector("[data-player-directory-list]");
  const countLabel = mounted.root.querySelector("[data-player-directory-count]");
  const wireRows = () => {
    list?.querySelectorAll("[data-player-directory-row]").forEach((row) => {
      row.addEventListener("click", () => {
        const player = currentPlayers.find((candidate) => String(candidate.profileId) === row.dataset.playerId);
        if (player) onOpenPlayer(player);
      });
    });
    list?.querySelector("[data-player-directory-retry]")?.addEventListener("click", onRetry);
  };
  const setDirectory = ({ players = [], status = "ready" } = {}) => {
    currentPlayers = Array.isArray(players) ? players : [];
    // dc §2 副行「開放名單的球友 · N 位」只在成功載入後才是真數字;loading/error
    // 態沿用原有殼但不亂報一個假的 0(容器初值 0 是 mountSheet 首次同步渲染前的
    // 佔位,並非「已確認 0 位」的宣稱)。
    if (countLabel && status === "ready") countLabel.textContent = String(currentPlayers.length);
    if (!list) return;
    if (status === "loading") {
      list.innerHTML = '<p class="surface__copy" role="status">正在載入球友名單…</p>';
    } else if (status === "error") {
      list.innerHTML = '<div class="form-error" role="alert">球友名單暫時無法載入。<button type="button" class="session-secondary" data-player-directory-retry>重新載入</button></div>';
    } else {
      list.innerHTML = playerDirectoryRowsMarkup(currentPlayers);
    }
    wireRows();
  };
  setDirectory({ status: "loading" });
  return { ...mounted, setDirectory };
}

const FILTER_SHEET_PLAY_TYPES = ["單打", "雙打", "練球"];
// 批 D4a:日期區塊的「不限」是 dateKey=null 的顯式選項(data-value=""),與地圖 chips
// 列(今天/明天/週末,無「不限」但再點同顆會取消)是同一個 dateKey 狀態的兩種操作介面。
const FILTER_SHEET_DATE_OPTIONS = [
  ["", "不限"],
  ["today", "今天"],
  ["tomorrow", "明天"],
  ["weekend", "週末"],
];

function cloneSheetFilters(filters) {
  const source = filters && typeof filters === "object" ? filters : DEFAULT_FILTER_STATE;
  return {
    dateKey: source.dateKey || null,
    band: source.band || "all",
    types: new Set(source.types instanceof Set ? source.types : (source.types ?? [])),
    districts: new Set(source.districts instanceof Set ? source.districts : (source.districts ?? [])),
  };
}

function toggledFilterSet(existing, value) {
  const next = new Set(existing);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/**
 * Open a standalone filter sheet mirroring the map-topbar chips, isolated in
 * #sheet-root with its own single click delegation. Controls identify
 * themselves via `data-filter` (never the topbar's ids, e.g. #level-chip) so
 * this can be mounted alongside the chips row without id/selector collisions
 * (see batch C1 task-2 ground truth §意外 4/6). `instantOnly` has no control
 * here by product decision (batch D4a): it only lives on the map topbar chip,
 * so this sheet's four sections never read or write it.
 */
export function openFilterSheet({
  filters = DEFAULT_FILTER_STATE,
  courts = [],
  resultCount = 0,
  onSetFilter = () => {},
  onReset = () => {},
  onClose = () => {},
} = {}) {
  let currentFilters = cloneSheetFilters(filters);

  const mounted = mountSheet({
    id: "filters-sheet",
    label: "篩選球局",
    className: "filter-sheet",
    onClose,
    html: `
      <span class="filter-sheet__grabber" aria-hidden="true"></span>
      <div class="surface__head filter-sheet__head">
        <div>
          <p class="surface__eyebrow">FILTERS</p>
          <h2>篩選球局</h2>
        </div>
        <button type="button" class="surface__close" data-surface-close aria-label="關閉篩選">×</button>
      </div>
      <div class="filter-sheet__scroll">
        <div class="filter-sheet-form">
          <fieldset class="form-fieldset filter-sheet-section">
            <legend>日期</legend>
            <div class="filter-sheet-chips" role="group" aria-label="日期">
              ${FILTER_SHEET_DATE_OPTIONS.map(
                ([value, label]) =>
                  `<button type="button" class="chip chip--form" data-filter="dateKey" data-value="${esc(
                    value
                  )}" aria-pressed="false">${esc(label)}</button>`
              ).join("")}
            </div>
          </fieldset>
          <fieldset class="form-fieldset filter-sheet-section">
            <legend>NTRP 程度</legend>
            <div class="filter-sheet-band-grid" role="group" aria-label="NTRP 程度">
              ${BANDS.map(
                (band) =>
                  `<button type="button" class="band-option" data-filter="band" data-value="${esc(
                    band.key
                  )}" aria-pressed="false">${esc(band.label)}</button>`
              ).join("")}
            </div>
          </fieldset>
          <fieldset class="form-fieldset filter-sheet-section">
            <legend>打法</legend>
            <div class="filter-sheet-chips" role="group" aria-label="打法">
              ${FILTER_SHEET_PLAY_TYPES.map(
                (type) =>
                  `<button type="button" class="chip chip--form" data-filter="types" data-value="${esc(
                    type
                  )}" aria-pressed="false">${esc(type)}</button>`
              ).join("")}
            </div>
          </fieldset>
          <fieldset class="form-fieldset filter-sheet-section">
            <legend>行政區</legend>
            <div class="filter-sheet-chips filter-sheet-chips--district" role="group" aria-label="行政區">
              ${TAIPEI_DISTRICTS.map(
                (name) =>
                  `<button type="button" class="chip chip--district" data-filter="districts" data-value="${esc(
                    name
                  )}" aria-pressed="false">${esc(name)}</button>`
              ).join("")}
            </div>
          </fieldset>
        </div>
      </div>
      <div class="filter-sheet__footer">
        <button type="button" class="filters-reset" data-filter="reset">重設</button>
        <button type="button" class="session-primary filter-sheet__apply" data-filter="apply">看 <span data-filter-count>${esc(
          String(resultCount)
        )}</span> 場球局</button>
      </div>`,
  });

  // fix round 1:委派綁在 mounted.surface(每次 mountSheet 都是全新節點,隨 close() 的
  // root.innerHTML = "" 一起被拆掉、不再收到冒泡事件),而不是 mounted.root(#sheet-root
  // 全 app 共用、跨 sheet 生命週期存活)。綁在 root 上的 listener 不會被 close() 移除,
  // 重複開關會讓每次 openFilterSheet 的委派永久疊加、onSetFilter 被多次呼叫——全庫其他
  // mountSheet consumer 都是綁在 surface 內的子節點上隨銷毀回收,這裡比照辦理。
  const surface = mounted.surface;

  function syncControls() {
    surface.querySelectorAll('[data-filter="dateKey"]').forEach((button) => {
      const selected = (button.dataset.value || null) === currentFilters.dateKey;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    surface.querySelectorAll('[data-filter="band"]').forEach((button) => {
      const selected = button.dataset.value === currentFilters.band;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    surface.querySelectorAll('[data-filter="types"]').forEach((button) => {
      const selected = currentFilters.types.has(button.dataset.value);
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    surface.querySelectorAll('[data-filter="districts"]').forEach((button) => {
      const selected = currentFilters.districts.has(button.dataset.value);
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  // 單一 click 委派:日期／程度／打法／行政區 chips、重設鈕與「看 N 場球局」主鈕共用。
  surface.addEventListener("click", (event) => {
    const target = event.target.closest("[data-filter]");
    if (!target) return;
    const field = target.dataset.filter;
    if (field === "apply") {
      // dc L469:主鈕只關閉 sheet,篩選本身在每次點擊 chip 時已即時套用,沒有「套用」步驟。
      mounted.close();
      return;
    }
    if (field === "reset") {
      // dc L468:重設是文字鈕,不關閉 sheet——讓使用者留在原地繼續調整。
      currentFilters = cloneSheetFilters(DEFAULT_FILTER_STATE);
      onReset();
      syncControls();
      return;
    }
    if (field === "dateKey") {
      currentFilters.dateKey = target.dataset.value || null;
      onSetFilter("dateKey", currentFilters.dateKey);
    } else if (field === "band") {
      currentFilters.band = target.dataset.value;
      onSetFilter("band", target.dataset.value);
    } else if (field === "types") {
      currentFilters.types = toggledFilterSet(currentFilters.types, target.dataset.value);
      onSetFilter("types", currentFilters.types);
    } else if (field === "districts") {
      currentFilters.districts = toggledFilterSet(currentFilters.districts, target.dataset.value);
      onSetFilter("districts", currentFilters.districts);
    } else {
      return;
    }
    syncControls();
  });

  syncControls();
  return {
    ...mounted,
    setFilters: (nextFilters) => {
      currentFilters = cloneSheetFilters(nextFilters);
      syncControls();
    },
    setResultCount: (count) => {
      const label = surface.querySelector("[data-filter-count]");
      if (label) label.textContent = String(Math.max(0, Number(count) || 0));
    },
  };
}

function playerInviteOption(session, courts = []) {
  const venue = sessionVenuePresentation(session, courts);
  return `<label class="player-invite-option">
    <input type="radio" name="player-invite-session" value="${esc(session.sessionId)}" data-testid="player-invite-session" />
    <strong>${esc(venue.time)}</strong>
    <span>${esc(venue.badge)} · ${esc(venue.court)}</span>
    <span>${esc(session.playType)} · ${esc(ntrpRange(session))}</span>
    ${session.notes ? `<span>${esc(session.notes)}</span>` : ""}
  </label>`;
}

function playerInviteChoices(sessions, courts = []) {
  return sessions.length
    ? sessions.map((session) => playerInviteOption(session, courts)).join("")
    : `<div class="player-invite-empty">
        <p class="surface__copy">你目前沒有可邀請的球局</p>
        <button type="button" class="session-primary" data-player-create data-testid="player-create-session">去開球局</button>
      </div>`;
}

/** Open one public player card and, for non-self rows, its host invitation entry point. */
export function openPlayerCardSheet(
  player,
  {
    courts = [],
    myInvitableSessions = [],
    onClose = () => {},
    onCreate = () => {},
    onInvite = async () => {},
    onSeeDirectory = () => {},
  } = {}
) {
  const inviteSection = player.isSelf
    ? ""
    : myInvitableSessions.length
      ? `<form class="player-invite-form" data-player-invite>
          <fieldset class="form-fieldset">
            <legend>邀請加入我的球局</legend>
            <div class="player-invite-options" data-player-invite-options>${playerInviteChoices(myInvitableSessions, courts)}</div>
          </fieldset>
          <p class="form-error" role="alert" data-player-invite-error hidden></p>
          <p class="player-invite-success" role="status" data-player-invite-success hidden></p>
          <button type="submit" class="session-primary" data-testid="player-invite-submit">送出邀請</button>
        </form>`
      : `<div class="player-invite-empty" data-player-invite>
          <p class="surface__copy">你目前沒有可邀請的球局</p>
          <button type="button" class="session-primary" data-player-create data-testid="player-create-session">去開球局</button>
        </div>`;
  // 批 D8:常打／時段抽成變數,同時餵新版頭部副行與既有 .player-profile 段落——
  // 後者逐字文案是 smoke.spec.js「player drawer and card escape every public
  // value」測試鎖定的字串(時段：週末下午、mystery<img...>),不可改動計算方式。
  const courtsText = (player.courtNames ?? []).join("、") || player.courtName || "未填球場";
  const slotsText = playerSlotLabels(player.slotCodes).join("、") || "未填時段";
  const mounted = mountSheet({
    id: "player-card-sheet",
    label: "球友卡",
    className: "player-card-sheet",
    onClose,
    html: `
      <span class="player-card-sheet__grabber" aria-hidden="true"></span>
      <div class="surface__head">
        <p class="surface__eyebrow">${esc(player.courtDistrict || "台北市")}</p>
        <button type="button" class="surface__close" data-surface-close aria-label="關閉球友卡">×</button>
      </div>
      <div class="profile-brick-row profile-brick-row--player">
        ${avatarMarkup({ nickname: player.nickname, size: "lg" })}
        <span class="profile-brick-row__copy"><strong>${esc(player.nickname)}</strong><span>常打 ${esc(
          courtsText
        )} · ${esc(slotsText)}</span></span>
        ${ntrpBrickMarkup(player.ntrp)}
      </div>
      <div class="player-profile" data-player-profile-id="${esc(player.profileId)}">
        ${trustCountMarkup(player.playedCount, "已打 {n} 場")}
        ${player.isPresent ? `<p>在線狀態：${esc(playerPresenceLabel(player))}</p>` : ""}
        ${player.openToGreeting ? `<p class="player-greeting">${esc(playerGreetingLabel(player))}</p>` : ""}
        <p>打法：${esc((player.playTypes ?? []).join("、") || "未填打法")}</p>
        <p>時段：${esc(slotsText)}</p>
        <p>常打球場：${esc(player.courtName || "未填球場")}</p>
      </div>
      ${inviteSection}
      <div class="player-card-sheet__actions">
        <button type="button" class="session-secondary" data-player-see-directory>看球友名單</button>
        <button type="button" class="session-primary" data-surface-close>關閉</button>
      </div>
      <p class="player-card-sheet__footnote">在線球友為開放名單者;邀約請透過球局。</p>`,
  });
  const wirePlayerCreate = () => mounted.root.querySelector("[data-player-create]")?.addEventListener("click", onCreate);
  wirePlayerCreate();
  // 映射決策 6:「看球友名單」不直呼 controller,只透過 onSeeDirectory 這條既有
  // callback 慣例;controller 端接的是既有 openPlayerDirectory 入口(sessionController.js
  // openPlayer() 已接線),它本身就會關掉這張卡再開名單,這裡不重複 close()。
  mounted.root.querySelector("[data-player-see-directory]")?.addEventListener("click", onSeeDirectory);
  const form = mounted.root.querySelector(".player-invite-form");
  const setInvitableSessions = (sessions = []) => {
    const options = form?.querySelector("[data-player-invite-options]");
    const submit = form?.querySelector("[type='submit']");
    if (!options || !submit) return;
    const nextSessions = Array.isArray(sessions) ? sessions : [];
    options.innerHTML = playerInviteChoices(nextSessions, courts);
    submit.hidden = nextSessions.length === 0;
    wirePlayerCreate();
  };
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector("[type='submit']");
    const error = form.querySelector("[data-player-invite-error]");
    const success = form.querySelector("[data-player-invite-success]");
    const selected = form.querySelector("input[name='player-invite-session']:checked");
    error.hidden = true;
    error.textContent = "";
    success.hidden = true;
    success.textContent = "";
    if (!selected) {
      error.textContent = "請選擇一個球局。";
      error.hidden = false;
      return;
    }
    submit.disabled = true;
    try {
      await onInvite(selected.value);
      if (!mounted.root.contains(submit)) return;
      success.textContent = "邀請已送出";
      success.hidden = false;
    } catch (inviteError) {
      if (!mounted.root.contains(submit)) return;
      error.textContent = inviteError?.message || "邀請失敗，請稍後再試。";
      error.hidden = false;
    } finally {
      if (mounted.root.contains(submit)) submit.disabled = false;
    }
  });
  return { ...mounted, setInvitableSessions };
}

/** Keep the persistent map chip synchronized with controller-owned layer state. */
export function renderPlayerLayerToggle(button, { message = "", on = false, status = "idle" } = {}) {
  if (!button) return;
  button.setAttribute("aria-pressed", String(Boolean(on)));
  button.classList.toggle("is-active", Boolean(on));
  // 批 D3:toggle 改為控制直欄的 icon 鈕,可讀文字住在 visually-hidden span
  //(佈局不吃字寬,測試與 SR 讀到的字不變);找不到 span 時退回整鈕文字。
  const layerText = on ? "隱藏在線" : "顯示在線";
  const layerTextNode = button.querySelector("[data-player-layer-text]");
  if (layerTextNode) layerTextNode.textContent = layerText;
  else button.textContent = layerText;
  const statusRoot = document.getElementById("player-layer-status");
  if (!statusRoot) return;
  statusRoot.hidden = !message;
  statusRoot.textContent = message;
  statusRoot.setAttribute("role", status === "error" ? "alert" : "status");
}

/** Render only user-facing, non-sensitive loading/error/location messages. */
export function renderMapDataStatus(root, { kind = "idle", message = "", onRetry = () => {}, locationMessage = "" } = {}) {
  const visible = kind !== "idle" || Boolean(locationMessage);
  root.hidden = !visible;
  if (!visible) {
    root.innerHTML = "";
    return;
  }
  root.className = `map-data-status map-data-status--${esc(kind)}`;
  root.innerHTML = `
    ${message ? `<p>${esc(message)}</p>` : ""}
    ${kind === "error" ? '<button type="button" id="map-retry" class="session-secondary">重新載入</button>' : ""}
    ${locationMessage ? `<p id="location-feedback" class="location-feedback">${esc(locationMessage)}</p>` : ""}`;
  root.querySelector("#map-retry")?.addEventListener("click", onRetry);
}
