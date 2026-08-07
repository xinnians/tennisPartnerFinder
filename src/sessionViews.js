import { TAIPEI_TIME_ZONE } from "./config.js";
import { pushDrawerIsolation } from "./modalIsolation.js";
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

function avatarMarkup({ avatarUrl = "", nickname = "" } = {}) {
  const safeUrl = safeGoogleAvatarUrl(avatarUrl);
  return `<span class="player-avatar" data-player-avatar>
    ${safeUrl ? `<img src="${esc(safeUrl)}" alt="" referrerpolicy="no-referrer" />` : ""}
    <span class="player-avatar__fallback" data-avatar-fallback aria-hidden="true"${safeUrl ? " hidden" : ""}>${esc(avatarInitial(nickname))}</span>
  </span>`;
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
const drawerIsolations = new WeakMap();
const drawerFocusIntents = new WeakMap();
const drawerLoadingFocusFallbacks = new WeakSet();
const mySessionActionStates = new WeakMap();
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
const DRAWER_ACTION_IDS = new Set(["discovery-reset", "discovery-retry", "drawer-map-retry", "discovery-expand", "discovery-first"]);

export const PROFILE_PUBLIC_DISCLOSURE =
  "開球局後，這個暱稱與你的 NTRP 會顯示給瀏覽該球局的人；加入球局後，主揪與已接受球友可使用球局群組聊天。";

/** 全站唯一一份 NTRP 說明,個人檔案與建局表單共用;兩處不可各寫一份。 */
export const NTRP_SCALE_EXPLANATION =
  "NTRP 是網球程度自評分級：1.0 初學、2.5 能來回對打、3.5 能穩定控球、4.5 以上具比賽水準。";

/** Render the account and service skeleton for the Me destination. */
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
    notificationSettings = {},
    onEditProfile = () => {},
    onEnablePush = () => {},
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
    <div class="me-shell__head"><p class="surface__eyebrow">我</p><h1 tabindex="-1" data-me-heading>帳號與站務</h1></div>
    ${
      authenticated
        ? `<section class="me-identity-card" data-testid="me-identity-card" aria-label="目前登入身分">
          ${avatarMarkup({ avatarUrl, nickname })}
          <div class="me-identity-card__copy"><strong>${esc(nickname)}</strong><span>${esc(formatNtrp(profile?.ntrp))}</span></div>
          <button type="button" class="session-secondary" data-testid="me-sign-out">登出</button>
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
          <h2 id="notification-settings-title">通知設定</h2>
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
    <section class="me-service-links" aria-labelledby="me-service-title">
      <h2 id="me-service-title">站務</h2>
      <div>${supportHref ? `<a href="${esc(supportHref)}">聯絡支援</a>` : ""}<a href="/privacy.html">隱私權政策</a></div>
    </section>
  </div>`;
  wireAvatarFallbacks(root);
  root.querySelector('[data-testid="me-sign-in"]')?.addEventListener("click", onSignIn);
  root.querySelector('[data-testid="me-sign-out"]')?.addEventListener("click", onSignOut);
  root.querySelector('[data-testid="edit-profile"]')?.addEventListener("click", onEditProfile);
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

function taipeiNowStartValue(now = new Date()) {
  return taipeiDateTimeLocalValue(now);
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

function rememberFocusedSessionCard(root) {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return;
  if (active.matches("#nearby-sessions-toggle")) {
    setDrawerFocusIntent(root, DRAWER_TOGGLE_FOCUS);
    return;
  }
  if (active.matches("[data-nearby-close]")) {
    // The loading fallback is only a temporary reachable target. Preserve the
    // original card/action intent through the next authoritative rerender.
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
  const panel = root.querySelector("[data-nearby-dialog]");
  if (!panel) return null;
  return (
    panel.querySelector("#discovery-retry") ??
    panel.querySelector("#drawer-map-retry") ??
    panel.querySelector("[data-session-id]") ??
    panel.querySelector("#discovery-reset") ??
    panel.querySelector("#discovery-expand") ??
    panel.querySelector("#discovery-first")
  );
}

function focusDrawerLoadingFallback(root) {
  const close = root.querySelector("[data-nearby-dialog] [data-nearby-close]");
  if (!close) return;
  drawerLoadingFocusFallbacks.add(root);
  close.focus({ preventScroll: true });
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
        // Opening the drawer has its own deliberate first target: its close
        // control. Do not let a replaced opener compete with that hand-off.
        clearDrawerFocusIntent(root);
      }
      return;
    }
    const panel = root.querySelector("[data-nearby-dialog]");
    if (!panel) {
      clearDrawerFocusIntent(root);
      return;
    }
    if (focusIntent === DRAWER_CLOSE_FOCUS) {
      clearDrawerFocusIntent(root);
      panel.querySelector("[data-nearby-close]")?.focus({ preventScroll: true });
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

function vacancyLabel(session) {
  const remaining = Number(session.slotsRemaining);
  if (!Number.isFinite(remaining) || remaining <= 0) return "已額滿";
  return `缺 ${remaining} 位`;
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
    court: names.join("、") || session?.court || "候選球場待確認",
    decided: false,
    time: session?.rangeEnd
      ? `${taipeiDateTime(session.startAt)} 至 ${taipeiDateTime(session.rangeEnd)}`
      : taipeiDateTime(session?.startAt),
    undecidedCandidates: true,
  };
}

function candidateDecisionExplanation(session) {
  return `主揪將在 ${taipeiDateTime(session?.startAt)} 前從候選球場中定案場地與確切時間，定案後會通知你。`;
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

function sessionCard(session, { compact = false, courts = [] } = {}) {
  const venue = sessionVenuePresentation(session, courts);
  return `<button type="button" class="session-card${compact ? " session-card--compact" : ""}" data-testid="session-card" data-session-id="${esc(
    session.sessionId
  )}">
    <span class="session-card__time">${esc(venue.time)}</span>
    ${venue.undecidedCandidates ? "" : nowStartSessionMarkup(session)}
    <span class="session-badge">${esc(venue.badge)}</span>
    <span class="session-card__court">${esc(venue.court)}</span>
    <span class="session-card__meta">${esc(session.playType)} · ${esc(ntrpRange(session))} · ${esc(vacancyLabel(session))}</span>
    ${session.feeNote ? `<span class="session-card__meta">${esc(`費用：${session.feeNote}`)}</span>` : ""}
    ${session.joinMode === "instant" ? '<span class="session-badge session-badge--instant">直接加入</span>' : ""}
    <span class="session-card__host">主揪 ${esc(session.hostNickname)} · ${esc(formatNtrp(session.hostNtrp))}</span>
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

function mySessionRole(session) {
  if (String(session?.viewerRole) === "host") return "我是主揪";
  const participantStatus = String(session?.viewerParticipantStatus ?? "").toLowerCase();
  if (participantStatus === "requested") return "申請中";
  if (participantStatus === "declined") return "已婉拒";
  if (participantStatus === "withdrawn") return "已退出";
  return participantStatus === "accepted" ? "已核准加入" : "參與者";
}

function mySessionStatus(session) {
  const status = String(session?.status ?? "").toLowerCase();
  const startTime = new Date(session?.startAt ?? "").getTime();
  if (["open", "full"].includes(status) && Number.isFinite(startTime) && startTime <= Date.now()) return "進行中";
  return (
    {
      cancelled: "已取消",
      expired: "已結束",
      full: "已額滿",
      open: "開放加入",
      played: "已打成",
      started: "已開始",
    }[status] ?? "狀態待確認"
  );
}

function mySessionActionButton(session, { action, label, testId }) {
  return `<button type="button" class="session-secondary" data-my-action="${esc(action)}" data-session-id="${esc(
    session.sessionId
  )}"${testId ? ` data-testid="${esc(testId)}"` : ""}>${esc(label)}</button>`;
}

function mySessionCard(session, { courts = [], createdSessionId = null } = {}) {
  const venue = sessionVenuePresentation(session, courts);
  const hostCanManage = String(session.viewerRole) === "host" && Boolean(session.canCancel);
  const canChat = String(session.viewerParticipantStatus).toLowerCase() === "accepted";
  const actions = [
    `<button type="button" class="session-secondary" data-open-my-session data-session-id="${esc(session.sessionId)}">查看球局</button>`,
    canChat
      ? `<button type="button" class="session-primary" data-open-chat data-session-id="${esc(
          session.sessionId
        )}" data-testid="open-chat-${esc(session.sessionId)}">群組聊天</button>`
      : "",
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
  return `<article class="my-session-card"${String(session.sessionId) === String(createdSessionId) ? ' data-created-session="true"' : ""}>
    <div class="my-session-card__head"><span class="my-session-card__role">${esc(mySessionRole(session))}</span><span class="my-session-card__status">${esc(
      mySessionStatus(session)
    )}</span></div>
    <p class="my-session-card__time">${esc(venue.time)}</p>
    <h3><span class="session-badge">${esc(venue.badge)}</span> ${esc(venue.court)}</h3>
    <p>${esc(session.playType)} · ${esc(ntrpRange(session))} · ${esc(vacancyLabel(session))}</p>
    <div class="my-session-card__actions">${actions}</div>
  </article>`;
}

function hostRequestCard({ participant, session }, courts = []) {
  const venue = sessionVenuePresentation(session, courts);
  return `<article class="my-action-card" data-testid="participant-row" data-participant-id="${esc(participant.participantId)}">
    <p class="my-action-card__eyebrow">需要你處理 · ${esc(venue.badge)} · ${esc(venue.court)} · ${esc(venue.time)}</p>
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
  const venue = sessionVenuePresentation(session, courts);
  return `<article class="my-action-card" data-testid="invite-row" data-session-id="${esc(session.sessionId)}">
    <p class="my-action-card__eyebrow">邀請你加入 · ${esc(venue.badge)} · ${esc(venue.court)} · ${esc(venue.time)}</p>
    <h3>${esc(session.hostNickname)} · ${esc(formatNtrp(session.hostNtrp))}</h3>
    <p>${esc(session.playType)} · 缺 ${esc(session.slotsRemaining)} 位${session.notes ? ` · ${esc(session.notes)}` : ""}</p>
    <div class="my-session-card__actions">
      <button type="button" class="session-primary" data-my-action="accept-invite" data-session-id="${esc(session.sessionId)}" data-testid="accept-invite-${esc(session.sessionId)}">接受邀請</button>
      <button type="button" class="session-secondary" data-my-action="decline-invite" data-session-id="${esc(session.sessionId)}" data-testid="decline-invite-${esc(session.sessionId)}">婉拒</button>
      <button type="button" class="session-tertiary" data-my-action="report-session" data-session-id="${esc(session.sessionId)}">檢舉此球局</button>
    </div>
  </article>`;
}

function guestRequestCard({ session }, courts = []) {
  const venue = sessionVenuePresentation(session, courts);
  return `<article class="my-action-card" data-guest-request-session="${esc(session.sessionId)}">
    <p class="my-action-card__eyebrow">等待主揪回覆</p>
    <h3><span class="session-badge">${esc(venue.badge)}</span> ${esc(venue.court)} · ${esc(venue.time)}</h3>
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

/** Render the private, action-first My Sessions destination. */
export function renderMySessionsPage(
  root,
  {
    courts = [],
    createdSessionId = null,
    groups = { history: [], needsAction: [], pendingHostRequestCount: 0, upcoming: [] },
    onAccept = () => {},
    onAcceptInvite = () => {},
    onBack = () => {},
    onCancel = () => {},
    onConfirmAttendance = () => {},
    onCreatedSessionFocus = () => true,
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
  } = {}
) {
  const needsAction = Array.isArray(groups.needsAction) ? groups.needsAction : [];
  const upcoming = Array.isArray(groups.upcoming) ? groups.upcoming : [];
  const history = Array.isArray(groups.history) ? groups.history : [];
  const notification = normalizedNotificationSettings(notificationSettings);
  const needsActionSection = `<section class="my-sessions-section" aria-labelledby="my-needs-action-title">
      <div class="my-sessions-section__head"><h2 id="my-needs-action-title">需要你處理</h2><span>${esc(needsAction.length)} 項</span></div>
      <div id="my-needs-action" class="my-sessions-list">${
        needsAction.length
          ? needsAction
              .map((entry) =>
                entry.kind === "host-request"
                  ? hostRequestCard(entry, courts)
                  : entry.kind === "invite"
                    ? inviteCard(entry, courts)
                    : guestRequestCard(entry, courts)
              )
              .join("")
          : '<p class="surface__copy">目前沒有需要立即處理的事項。</p>'
      }</div>
    </section>`;
  setMySessionActionScope(root, actionScopeKey);
  root.innerHTML = `
    <div class="my-sessions-shell__head">
      <div><p class="surface__eyebrow">我的球局</p><h1 tabindex="-1" data-my-sessions-heading>下一步行動</h1></div>
      <div class="my-sessions-shell__tools"><button type="button" id="my-sessions-refresh" class="session-secondary">重新整理</button><button type="button" class="session-secondary" data-my-sessions-back>回到地圖</button></div>
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
    ${needsActionSection}
    <section class="my-sessions-section" aria-labelledby="my-upcoming-sessions-title">
      <div class="my-sessions-section__head"><h2 id="my-upcoming-sessions-title">即將打球</h2><span>${esc(upcoming.length)} 場</span></div>
      <div id="my-upcoming-sessions" class="my-sessions-list">${
        upcoming.length
          ? upcoming
              .map((session) => mySessionCard(session, { courts, createdSessionId }))
              .join("")
          : '<p class="surface__copy">目前沒有即將打球的球局。</p>'
      }</div>
    </section>
    <section class="my-sessions-section" aria-labelledby="my-history-title">
      <div class="my-sessions-section__head"><h2 id="my-history-title">過去紀錄</h2><span>${esc(history.length)} 場</span></div>
      <div id="my-history" class="my-sessions-list">${
        history.length
          ? history
              .map(
                (session) =>
                  `${mySessionCard(session, { courts, createdSessionId })}<p class="my-history-reason">${esc(
                    mySessionReason(session)
                  )}</p>`
              )
              .join("")
          : '<p class="surface__copy">尚無過去紀錄。</p>'
      }</div>
    </section>`;

  root.querySelector("[data-my-sessions-back]")?.addEventListener("click", onBack);
  root.querySelector("[data-my-sessions-sign-in]")?.addEventListener("click", onSignIn);
  wireSuccessPushPrompt(root, onEnablePush);
  root.querySelector("#my-sessions-refresh")?.addEventListener("click", () => runMySessionAction(root.querySelector("#my-sessions-refresh"), onRefresh, root));
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
  if (createdSessionId && upcoming.some((session) => String(session.sessionId) === String(createdSessionId))) {
    requestAnimationFrame(() => {
      const target = root.querySelector("[data-created-session] [data-open-my-session]");
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

function setDrawerModal(root, expanded) {
  const backdrop = document.getElementById("nearby-sessions-backdrop");
  const release = drawerIsolations.get(root);
  const toggle = root.querySelector("#nearby-sessions-toggle");
  if (expanded && !release) drawerIsolations.set(root, pushDrawerIsolation(toggle));
  if (!expanded && release) {
    release();
    drawerIsolations.delete(root);
  }
  if (backdrop) backdrop.hidden = !expanded;
}

function wireDrawerInteractions(root, { expanded, focusOnOpen = false, onToggle }) {
  drawerBindings.get(root)?.abort();
  const bindings = new AbortController();
  drawerBindings.set(root, bindings);
  const { signal } = bindings;
  const panel = root.querySelector("[data-nearby-dialog]");
  const close = () => {
    onToggle(false);
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

  if (expanded && panel) {
    panel.querySelector("[data-nearby-close]")?.addEventListener("click", close, { signal });
    document.getElementById("nearby-sessions-backdrop")?.addEventListener("click", close, { signal });
    panel.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close();
          return;
        }
        if (event.key !== "Tab") return;
        const nodes = [...panel.querySelectorAll(dialogFocusable)].filter((node) => !node.hasAttribute("hidden") && !node.closest("[hidden]"));
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      },
      { signal }
    );
    if (focusOnOpen) {
      const focusDrawerClose = () => {
        // This callback can survive a synchronous drawer redraw that replaced
        // the opening controls. A later render owns focus restoration, so an
        // aborted binding must never reclaim focus from it.
        if (signal.aborted) return;
        const active = document.activeElement;
        const opener = root.querySelector("#nearby-sessions-toggle");
        const livePanel = root.querySelector("[data-nearby-dialog]");
        const hasNewSurface = Boolean(document.querySelector("#sheet-root .surface, #modal-root .surface"));
        // The drawer needs an initial keyboard target, but that deferred move
        // must yield if the user already reached a card in the same frame.
        if (hasNewSurface || (active?.isConnected && active !== document.body && active !== document.documentElement && active !== opener)) return;
        livePanel?.querySelector("[data-nearby-close]")?.focus({ preventScroll: true });
      };
      // A render can replace the opener during the click event. Claim focus in
      // the next microtask, then once more after the frame so a concurrent
      // court/discovery rerender targets the live drawer rather than its
      // detached predecessor.
      queueMicrotask(focusDrawerClose);
      requestAnimationFrame(focusDrawerClose);
    }
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
      if (pointerStart != null && pointerStart - event.clientY > 44) onToggle(true);
      pointerStart = null;
    },
    { signal }
  );
}

/** Render the map-bound session summary and its expandable, keyboard-safe drawer. */
export function renderNearbySessionsDrawer(
  root,
  {
    sessions = [],
    courts = [],
    expanded = false,
    hasUserLocation = false,
    mapStatus = { kind: "idle", message: "" },
    filters = null,
    authenticated = false,
    mapStatusKind = "idle",
    onToggle = () => {},
    onOpenSession = () => {},
    onReset = () => {},
    onExpandBounds = () => {},
    onOpenCreate = () => {},
    onRetry = () => {},
  } = {}
) {
  // A render replaces the toggle node. Release its old inert state first, then
  // apply a fresh layer to the newly rendered node below.
  const wasExpanded = root.querySelector("#nearby-sessions-toggle")?.getAttribute("aria-expanded") === "true";
  rememberFocusedSessionCard(root);
  setDrawerModal(root, false);
  const count = sessions.length;
  const summary = `${hasUserLocation ? "附近" : "這個地圖範圍內"} ${count} 場可加入`;
  const nearestVenue = sessions[0] ? sessionVenuePresentation(sessions[0], courts) : null;
  const nearest = sessions[0]
    ? `${nearestVenue.time} · ${nearestVenue.court} · ${sessions[0].playType} · ${vacancyLabel(sessions[0])}`
    : "移動地圖或調整篩選條件，查看可加入的球局。";
  const activeDrawerStatus =
    expanded && mapStatus?.kind === "warning" && mapStatus?.message
      ? `<div class="nearby-sessions__status" role="status" aria-live="polite" aria-atomic="true"><p>${esc(mapStatus.message)}</p></div>`
      : "";
  const drawerContent =
    mapStatus?.kind === "loading"
      ? `<div class="nearby-sessions__status" role="status" aria-live="polite" aria-atomic="true"><p>${esc(
          mapStatus.message || "正在載入球局資料…"
        )}</p></div>`
      : mapStatus?.kind === "error"
        ? `<div class="nearby-sessions__status" role="alert"><p>${esc(
            mapStatus.message || "球局資料暫時無法載入。"
          )}</p><button type="button" id="drawer-map-retry" class="session-secondary">重新載入</button></div>`
        : count
          ? sessions.map((session) => sessionCard(session, { courts })).join("")
          : renderDiscoveryEmpty({ onReset, onExpandBounds, onOpenCreate, onRetry, asMarkup: true });

  root.innerHTML = `
    <button type="button" id="nearby-sessions-toggle" class="nearby-sessions__toggle" aria-expanded="${expanded}" aria-controls="nearby-sessions-list">
      <span id="nearby-sessions-summary">${esc(summary)}</span>
      <span class="nearby-sessions__summary-detail">${esc(nearest)}</span>
      <span aria-hidden="true">${expanded ? "⌄" : "⌃"}</span>
    </button>
    <section id="nearby-sessions-list" class="nearby-sessions__list"${expanded ? "" : " hidden"} ${
      expanded ? 'role="dialog" aria-modal="true" aria-label="附近球局" tabindex="-1" data-nearby-dialog' : ""
    }>
      <div class="nearby-sessions__list-head">
        <div><p>附近球局</p><h2>${esc(summary)}</h2></div>
        <button type="button" class="surface__close" data-nearby-close aria-label="關閉附近球局">×</button>
      </div>
      ${activeDrawerStatus}
      <div class="nearby-sessions__cards">
        ${drawerContent}
      </div>
    </section>`;

  const toggle = root.querySelector("#nearby-sessions-toggle");
  toggle.addEventListener("click", () => onToggle(!expanded));
  wireSessionCards(root, onOpenSession);
  root.querySelector("#discovery-reset")?.addEventListener("click", onReset);
  root.querySelector("#discovery-expand")?.addEventListener("click", onExpandBounds);
  root.querySelector("#discovery-first")?.addEventListener("click", onOpenCreate);
  root.querySelector("#discovery-retry")?.addEventListener("click", onRetry);
  root.querySelector("#drawer-map-retry")?.addEventListener("click", onRetry);
  setDrawerModal(root, expanded);
  wireDrawerInteractions(root, { expanded, focusOnOpen: expanded && !wasExpanded, onToggle });
  restoreFocusedSessionCard(root);
}

/** Render the standard session-only empty state in the active drawer. */
export function renderDiscoveryEmpty({ onReset = () => {}, onExpandBounds = () => {}, onOpenCreate = () => {}, onRetry = () => {}, asMarkup = false } = {}) {
  const html = `<div id="discovery-empty" class="discovery-empty">
    <p>這個範圍暫時沒有可加入的球局</p>
    <div class="discovery-empty__actions">
      <button type="button" id="discovery-reset" class="session-secondary">清除篩選</button>
      <button type="button" id="discovery-retry" class="session-secondary">重新載入</button>
      <button type="button" id="discovery-expand" class="session-secondary">擴大地圖範圍</button>
      <button type="button" id="discovery-first" class="session-primary">開第一局</button>
    </div>
  </div>`;
  if (asMarkup) return html;
  return html;
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
      return `<article class="chat-message chat-message--${esc(kind)}${isSelf ? " chat-message--self" : ""}"
        data-chat-message data-chat-message-id="${esc(message.messageId)}" data-chat-message-kind="${esc(kind)}" data-chat-message-self="${
          isSelf ? "true" : "false"
        }">
        ${kind === "user" ? `<p class="chat-message__sender">${esc(isSelf ? "我" : message.senderNickname || "球友")}</p>` : ""}
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
  const mounted = mountSheet({
    id: "session-chat-sheet",
    label: "球局群組聊天",
    className: "session-chat-sheet",
    onClose,
    html: `
      <div class="surface__head">
        <div><p class="surface__eyebrow">球局群組</p><h2>群組聊天</h2></div>
        <button type="button" class="surface__close" data-surface-close aria-label="關閉群組聊天">×</button>
      </div>
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
      <section class="chat-feed" data-chat-feed aria-label="群組訊息"></section>
      <p class="visually-hidden" data-chat-announcement role="status" aria-live="polite" aria-atomic="true"></p>
      <p class="chat-archived-note" data-chat-archived-note${archived ? "" : " hidden"}>球局已封存；你仍可查看先前訊息，但不能再傳送。</p>
      <form class="chat-composer" data-chat-composer>
        <label for="chat-message-input">傳送純文字訊息</label>
        <textarea id="chat-message-input" data-testid="chat-message-input" maxlength="1000" rows="3"${archived ? " disabled" : ""}></textarea>
        <div class="chat-composer__actions">
          <span class="form-hint">最多 1000 字</span>
          <button type="submit" class="session-primary" data-testid="chat-send"${archived ? " disabled" : ""}>傳送</button>
        </div>
      </form>
      ${
        canWithdraw && !archived
          ? '<button type="button" class="session-tertiary" data-chat-withdraw>取消參加</button>'
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

/** Open a public session detail sheet with the privacy-reviewed field order. */
export function openSessionSheet(
  session,
  {
    action,
    canDecide = false,
    canEdit = false,
    canChat = false,
    canReport = false,
    showJoinPreview = false,
    courts = [],
    onCopyLink = () => {},
    onDecide = () => {},
    onEdit = () => {},
    onChat = () => {},
    onPrimary = () => {},
    onReport = () => {},
    onWithdraw = () => {},
  } = {}
) {
  const primaryDisabled = action?.disabled ? " disabled" : "";
  const venue = sessionVenuePresentation(session, courts);
  const mounted = mountSheet({
    id: "session-sheet",
    label: "球局詳情",
    html: `
      <div class="surface__head">
        <div><p class="surface__eyebrow">球局詳情</p><h2>可加入的網球球局</h2></div>
        <button type="button" class="surface__close" data-surface-close aria-label="關閉球局詳情">×</button>
      </div>
      <div class="session-detail">
        <span class="session-badge" data-session-field="venue">${esc(venue.badge)}</span>
        <p data-session-field="court"><strong>${esc(venue.court)}</strong></p>
        <p data-session-field="time">${esc(venue.time)}</p>
        ${
          venue.undecidedCandidates
            ? `<p class="form-hint" data-session-candidate-explanation>${esc(candidateDecisionExplanation(session))}</p>`
            : ""
        }
        ${venue.undecidedCandidates ? "" : nowStartSessionMarkup(session)}
        <p data-session-field="details">${esc(session.playType)} · ${esc(ntrpRange(session))} · ${esc(vacancyLabel(session))}</p>
        ${session.joinMode === "instant" ? '<span class="session-badge session-badge--instant">直接加入</span>' : ""}
        <p data-session-field="host">主揪 ${esc(session.hostNickname)} · ${esc(formatNtrp(session.hostNtrp))} · ${esc(
          completionLabel(session)
        )}</p>
        ${joinPreviewSection(showJoinPreview)}
        ${session.feeNote ? `<p data-session-field="fee-note">${esc(`費用：${session.feeNote}`)}</p>` : ""}
        <p data-session-field="notes">${esc(session.notes || "沒有補充說明。")}</p>
        ${action?.note ? `<p class="form-hint" data-session-action-note>${esc(action.note)}</p>` : ""}
        <p class="form-error" data-session-report-error role="alert" hidden></p>
        <div class="session-detail__actions">
          <button type="button" class="session-secondary" data-session-action="copy-link">複製連結</button>
          ${canDecide ? '<button type="button" class="session-primary" data-session-action="decide">定案場地與時間</button>' : ""}
          ${canEdit ? '<button type="button" class="session-secondary" data-session-action="edit">編輯球局</button>' : ""}
          ${canChat && action?.label !== "群組聊天" ? '<button type="button" class="session-primary" data-session-action="chat">群組聊天</button>' : ""}
          <button type="button" class="session-primary" data-session-action="primary"${primaryDisabled}>${esc(
            action?.label ?? "申請加入"
          )}</button>
          ${
            action?.secondaryLabel
              ? `<button type="button" class="session-secondary" data-session-action="secondary">${esc(action.secondaryLabel)}</button>`
              : ""
          }
          ${
            canReport
              ? '<button type="button" class="session-tertiary" data-session-action="report">檢舉此球局</button>'
              : ""
          }
        </div>
      </div>`,
  });
  mounted.root.querySelector('[data-session-action="primary"]')?.addEventListener("click", onPrimary);
  mounted.root.querySelector('[data-session-action="decide"]')?.addEventListener("click", onDecide);
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
  const setJoinPreview = createJoinPreviewSetter(mounted.root);
  secondaryButton?.addEventListener("click", () => {
    // The modal confirmation owns submission locking and inline withdrawal errors.
    onWithdraw();
  });
  return { ...mounted, setJoinPreview };
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

/** Ask for an intentional confirmation before the join lifecycle RPC. */
export function openJoinSessionConfirmation(
  session,
  {
    courts = [],
    expectedAccepted = false,
    notificationSettings = {},
    onClose = () => {},
    onConfirm = () => {},
    onEnablePush = () => {},
    onViewMySessions = () => {},
    showJoinPreview = false,
  } = {}
) {
  const title = expectedAccepted ? "直接加入這場球局？" : "申請加入這一局？";
  const venue = sessionVenuePresentation(session, courts);
  let joined = false;
  const mounted = mountDialog({
    id: "join-session-confirmation",
    label: expectedAccepted ? title : "確認申請加入",
    onClose: (detail) => {
      onClose(detail);
      // Joining closes the public detail beneath this dialog. When the user
      // dismisses the success state, that original trigger no longer exists,
      // so hand focus to a durable navigation target instead of document.body.
      if (joined) requestAnimationFrame(() => document.getElementById("my-sessions-tab")?.focus({ preventScroll: true }));
    },
    html: `
      <div class="surface__head">
        <div><p class="surface__eyebrow">${expectedAccepted ? "確認加入" : "確認申請"}</p><h2>${title}</h2></div>
        <button type="button" class="surface__close" data-surface-close aria-label="關閉確認">×</button>
      </div>
      <form data-testid="session-join-form" class="join-session-form" novalidate>
        <div class="session-detail join-session-summary">
          <span class="session-badge" data-join-field="venue">${esc(venue.badge)}</span>
          <p data-join-field="court"><strong>${esc(venue.court)}</strong></p>
          <p data-join-field="time">${esc(venue.time)}</p>
          ${
            venue.undecidedCandidates
              ? `<p class="form-hint" data-join-candidate-explanation>${esc(candidateDecisionExplanation(session))}</p>`
              : ""
          }
          <p data-join-field="details">${esc(session.playType)} · ${esc(ntrpRange(session))} · ${esc(vacancyLabel(session))}</p>
          <p data-join-field="host">主揪 ${esc(session.hostNickname)} · ${esc(formatNtrp(session.hostNtrp))} · ${esc(
            completionLabel(session)
          )}</p>
          ${joinPreviewSection(showJoinPreview)}
          ${session.feeNote ? `<p data-join-field="fee-note">${esc(`費用：${session.feeNote}`)}</p>` : ""}
          <p data-join-field="notes">${esc(session.notes || "沒有補充說明。")}</p>
        </div>
        <p class="surface__copy">${expectedAccepted ? "加入後即可在球局群組聊天協調細節。" : "送出後，主揪會在球局流程中處理申請。"}</p>
        <p class="form-error" data-join-error role="alert" hidden></p>
        <button type="submit" class="session-primary" data-confirm-join data-testid="join-session">${expectedAccepted ? "直接加入" : "確認申請加入"}</button>
      </form>
      <p class="surface__message" data-join-success role="status" aria-live="polite" tabindex="-1" hidden>已送出申請，等待主揪回覆。</p>
      <div class="session-detail__actions" data-join-success-actions hidden>
        <button type="button" class="session-primary" data-join-view-my-sessions>前往我的球局</button>
        ${successPushPromptMarkup(notificationSettings, {
          message: "開啟推播，才不會錯過主揪的審核結果與球局變更。",
          testId: "join-success-enable-push",
        })}
      </div>`,
  });
  const form = mounted.root.querySelector("[data-testid='session-join-form']");
  const confirmButton = mounted.root.querySelector("[data-confirm-join]");
  const error = mounted.root.querySelector("[data-join-error]");
  const success = mounted.root.querySelector("[data-join-success]");
  const successActions = mounted.root.querySelector("[data-join-success-actions]");
  const viewMySessions = mounted.root.querySelector("[data-join-view-my-sessions]");
  const setJoinPreview = createJoinPreviewSetter(mounted.root);
  wireSuccessPushPrompt(mounted.root, onEnablePush);
  let submitting = false;
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;
    submitting = true;
    confirmButton.disabled = true;
    error.hidden = true;
    try {
      const result = await onConfirm(mounted.close);
      if (result?.joinSubmitted && mounted.root.contains(form)) {
        joined = true;
        form.hidden = true;
        success.textContent =
          result.accepted
            ? "已加入球局！前往我的球局開啟群組聊天。"
            : result.outcome === "OK_NTRP_MISSING"
              ? "已送出申請；你尚未填寫 NTRP，等待主揪回覆。"
              : result.outcome === "OK_NTRP_OUT_OF_RANGE"
                ? "已送出申請；你的 NTRP 不在球局設定範圍內，等待主揪回覆。"
                : "已送出申請，等待主揪回覆。";
        success.hidden = false;
        successActions.hidden = false;
        viewMySessions.focus({ preventScroll: true });
      } else if (result?.joinError && mounted.root.contains(error)) {
        error.textContent = result.joinError;
        error.hidden = false;
      }
    } catch (submitError) {
      if (mounted.root.contains(error)) {
        error.textContent = submitError?.message || "申請失敗，請稍後再試。";
        error.hidden = false;
      }
    } finally {
      // requestJoin keeps this dialog available after a recoverable failure;
      // restore one deliberate retry only if this is still the mounted dialog.
      if (mounted.root.contains(confirmButton) && !form.hidden) {
        submitting = false;
        confirmButton.disabled = false;
      }
    }
  });
  viewMySessions?.addEventListener("click", () => {
    mounted.close({ reason: "view-my-sessions", restoreFocus: false });
    onViewMySessions();
  });
  return { ...mounted, setJoinPreview };
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
  const courtSelect = form.querySelector("[name='profile-courts']");
  const courts = courtSelect?.options.length
    ? new Set([...courtSelect.querySelectorAll("option:checked")].map((option) => option.value))
    : new Set(fallbackCourts);
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
            : `<fieldset class="form-fieldset"><legend>常打球場</legend><select name="profile-courts" multiple size="4" aria-label="常打球場" disabled></select><p class="form-hint" data-profile-courts-status role="status" aria-live="polite"></p></fieldset>
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
  const courtSelect = mounted.root.querySelector("[name='profile-courts']");
  const courtsStatus = mounted.root.querySelector("[data-profile-courts-status]");
  const setCourts = (nextCourts, { ready = true } = {}) => {
    updateCourtSelect(courtSelect, courtsStatus, nextCourts, {
      multiple: true,
      ready,
      selected: selectedCourtValues(courtSelect, selectedCourts),
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

/** A single, scrollable Taipei create-session sheet with all required fields first. */
export function openCreateSessionSheet({ courts = [], courtsReady = true, onClose = () => {}, onSubmit = async () => {} } = {}) {
  const mounted = mountSheet({
    id: "session-create-modal",
    label: "開球局",
    className: "create-session-sheet",
    onClose,
    html: `
      <div class="surface__head">
        <div><p class="surface__eyebrow">開球局</p><h2>建立你的下一場球局</h2></div>
        <button type="button" class="surface__close" data-surface-close aria-label="關閉開球局">×</button>
      </div>
      <form class="create-session-form" data-testid="session-form" novalidate>
        <fieldset class="form-fieldset"><legend>場地確定了嗎？</legend><div class="option-grid option-grid--stacked">
          <label><input type="radio" name="venueType" value="booked" data-testid="session-venue-booked" checked /> <span>已訂好場地<small>時間與球場都確定了。</small></span></label>
          <label><input type="radio" name="venueType" value="walk_on" data-testid="session-venue-walk-on" /> <span>球場確定，但要現場排隊<small>公共球場現場輪流，人到齊不保證馬上有場地。</small></span></label>
          <label><input type="radio" name="venueType" value="candidates" data-testid="session-venue-candidates" /> <span>還沒確定，先列候選<small>先列 2–3 座候選球場與時間範圍，之後再定案通知大家。</small></span></label>
        </div></fieldset>
        <div class="form-field" data-single-court-fields><label for="session-court">台北市球場</label><select id="session-court" name="courtId" data-testid="session-court" required disabled></select><p class="form-hint" data-create-courts-status role="status" aria-live="polite"></p></div>
        <div class="form-field" data-candidate-court-fields hidden><label for="session-candidate-courts">候選球場（選擇 2–3 座）</label><select id="session-candidate-courts" name="candidateCourtIds" data-testid="session-candidate-courts" multiple size="4" disabled></select><p class="form-hint" data-create-candidate-courts-status role="status" aria-live="polite"></p><p class="form-hint" data-candidate-selection-hint>請選擇 2 到 3 座球場，之後再定案場地與時間。</p></div>
        <div class="form-field"><div class="form-field__label-row"><label for="session-start-at">台北時間</label><button type="button" class="session-secondary" data-now-start data-testid="session-now-start">現在開打</button></div><input id="session-start-at" name="startAtLocal" data-testid="session-start-at" type="datetime-local" required /></div>
        <label class="form-field" for="session-range-end" data-candidate-range-field hidden><span>時間範圍結束</span><input id="session-range-end" name="rangeEndLocal" data-testid="session-range-end" type="datetime-local" disabled /></label>
        <div class="form-field"><label for="session-play-type">打法</label><select id="session-play-type" name="playType" data-testid="session-play-type" required aria-describedby="session-play-type-hint"><option value="">請選擇打法</option>${CREATE_SESSION_PLAY_TYPES.map(
          (type) => `<option value="${esc(type)}">${esc(type)}</option>`
        ).join("")}</select><p class="form-hint" id="session-play-type-hint">${esc(PLAY_TYPE_HINT)}</p></div>
        <fieldset class="form-fieldset"><legend>還缺幾位</legend><div class="slots-options">${[1, 2, 3]
          .map(
            (value) =>
              `<label><input type="radio" name="slotsTotal" value="${value}" data-testid="session-slots-${value}" /><span>${value} 位</span></label>`
          )
          .join("")}</div><p class="form-hint">不含你自己。</p></fieldset>
        <fieldset class="form-fieldset"><legend>加入方式</legend>
          <label><input type="radio" name="joinMode" value="approval" /> 需審核（你逐一核准申請者）</label>
          <label><input type="radio" name="joinMode" value="instant" checked /> 直接加入（先到先得，立即成局）</label>
          <p class="form-hint">選擇直接加入後，已填暱稱且 NTRP 符合球局範圍的球友會直接加入；未填 NTRP 或超出範圍者會改為申請，由你審核。加入後可在球局群組聊天協調。</p>
        </fieldset>
        <fieldset class="form-fieldset"><legend>適合程度（選填）</legend><div class="form-row"><label class="form-field" for="session-ntrp-min"><span>最低 NTRP</span><input id="session-ntrp-min" name="ntrpMin" type="number" min="1" max="7" step="0.5" inputmode="decimal" /></label><label class="form-field" for="session-ntrp-max"><span>最高 NTRP</span><input id="session-ntrp-max" name="ntrpMax" type="number" min="1" max="7" step="0.5" inputmode="decimal" /></label></div><p class="form-hint" data-ntrp-explanation>${esc(NTRP_SCALE_EXPLANATION)}</p></fieldset>
        <label class="form-field" for="session-fee-note"><span>費用說明（選填，最多 500 字）</span><textarea id="session-fee-note" name="feeNote" maxlength="500" rows="2"></textarea></label>
        <label class="form-field" for="session-notes"><span>備註（選填，最多 500 字）</span><textarea id="session-notes" name="notes" maxlength="500" rows="4"></textarea></label>
        <p class="form-disclosure">${esc(PROFILE_PUBLIC_DISCLOSURE)}</p>
        <p class="form-error" data-create-error role="alert" hidden></p>
        <button type="submit" class="session-primary" data-testid="session-submit">建立球局</button>
      </form>`,
  });
  const form = mounted.root.querySelector("[data-testid='session-form']");
  const error = mounted.root.querySelector("[data-create-error]");
  const submit = mounted.root.querySelector("[data-testid='session-submit']");
  const startAtInput = mounted.root.querySelector("[data-testid='session-start-at']");
  const nowStartButton = mounted.root.querySelector("[data-now-start]");
  const courtSelect = mounted.root.querySelector("[data-testid='session-court']");
  const candidateCourtSelect = mounted.root.querySelector("[data-testid='session-candidate-courts']");
  const courtsStatus = mounted.root.querySelector("[data-create-courts-status]");
  const candidateCourtsStatus = mounted.root.querySelector("[data-create-candidate-courts-status]");
  const candidateSelectionHint = mounted.root.querySelector("[data-candidate-selection-hint]");
  const singleCourtFields = mounted.root.querySelector("[data-single-court-fields]");
  const candidateCourtFields = mounted.root.querySelector("[data-candidate-court-fields]");
  const candidateRangeField = mounted.root.querySelector("[data-candidate-range-field]");
  const rangeEndInput = mounted.root.querySelector("[data-testid='session-range-end']");
  const playTypeSelect = mounted.root.querySelector("[data-testid='session-play-type']");
  const setSlotsTotal = (value) => {
    mounted.root.querySelectorAll("[name='slotsTotal']").forEach((radio) => {
      radio.checked = radio.value === String(value);
    });
  };
  let availableCourts = courts;
  let courtOptionsReady = courtsReady;
  const selectedCandidateIds = () =>
    new Set([...(candidateCourtSelect?.selectedOptions ?? [])].map((option) => option.value));
  const updateCandidateHint = () => {
    if (!candidateSelectionHint) return;
    const count = selectedCandidateIds().size;
    candidateSelectionHint.textContent =
      count === 1
        ? "只選一座球場時，請改用「已訂場」或「現場等場」。"
        : count >= 2
          ? `已選 ${count} 座球場。`
          : "請選擇 2 到 3 座球場，之後再定案場地與時間。";
  };
  const syncVenueFields = () => {
    const venueType = form?.querySelector("[name='venueType']:checked")?.value ?? "booked";
    const candidates = venueType === "candidates";
    if (singleCourtFields) singleCourtFields.hidden = candidates;
    if (candidateCourtFields) candidateCourtFields.hidden = !candidates;
    if (candidateRangeField) candidateRangeField.hidden = !candidates;
    if (courtSelect) {
      courtSelect.required = !candidates;
      courtSelect.disabled = candidates || !courtOptionsReady || courtSelect.options.length <= 1;
    }
    if (candidateCourtSelect) {
      candidateCourtSelect.required = candidates;
      candidateCourtSelect.disabled = !candidates || !courtOptionsReady || candidateCourtSelect.options.length === 0;
    }
    if (rangeEndInput) {
      rangeEndInput.required = candidates;
      rangeEndInput.disabled = !candidates;
    }
    updateCandidateHint();
  };
  const setCourts = (nextCourts, { ready = true } = {}) => {
    availableCourts = nextCourts;
    courtOptionsReady = ready;
    updateCourtSelect(courtSelect, courtsStatus, nextCourts, {
      ready,
      selected: selectedCourtValues(courtSelect),
    });
    updateCourtSelect(candidateCourtSelect, candidateCourtsStatus, nextCourts, {
      multiple: true,
      ready,
      selected: selectedCourtValues(candidateCourtSelect),
    });
    syncVenueFields();
  };
  setCourts(availableCourts, { ready: courtOptionsReady });
  form?.querySelectorAll("[name='venueType']").forEach((input) => input.addEventListener("change", syncVenueFields));
  candidateCourtSelect?.addEventListener("change", updateCandidateHint);
  playTypeSelect?.addEventListener("change", () => {
    if (playTypeSelect.value === "單打") setSlotsTotal(1);
    if (playTypeSelect.value === "雙打") setSlotsTotal(3);
  });
  nowStartButton?.addEventListener("click", () => {
    if (!(startAtInput instanceof HTMLInputElement)) return;
    startAtInput.value = taipeiNowStartValue();
    startAtInput.focus();
  });
  let submitting = false;
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;
    const formData = new FormData(form);
    const validation = validateCreateSessionInput({
      ...Object.fromEntries(formData.entries()),
      candidateCourtIds: formData.getAll("candidateCourtIds"),
    });
    if (!validation.valid) {
      error.hidden = false;
      error.textContent = Object.values(validation.errors)[0];
      return;
    }
    submitting = true;
    submit.disabled = true;
    error.hidden = true;
    try {
      await onSubmit(validation.value, () => mounted.close({ reason: "complete" }));
    } catch (submitError) {
      error.hidden = false;
      error.textContent = submitError?.message || "建立球局失敗，請稍後再試。";
    } finally {
      if (mounted.root.contains(submit)) {
        submitting = false;
        submit.disabled = false;
      }
    }
  });
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
        <fieldset class="form-fieldset"><legend>適合程度（選填）</legend><div class="form-row"><label class="form-field" for="session-edit-ntrp-min"><span>最低 NTRP</span><input id="session-edit-ntrp-min" name="ntrpMin" type="number" min="1" max="7" step="0.5" inputmode="decimal" value="${esc(
          session.ntrpMin ?? ""
        )}" /></label><label class="form-field" for="session-edit-ntrp-max"><span>最高 NTRP</span><input id="session-edit-ntrp-max" name="ntrpMax" type="number" min="1" max="7" step="0.5" inputmode="decimal" value="${esc(
          session.ntrpMax ?? ""
        )}" /></label></div></fieldset>
        <label class="form-field" for="session-edit-fee-note"><span>費用說明（選填，最多 500 字）</span><textarea id="session-edit-fee-note" name="feeNote" maxlength="500" rows="2">${esc(
          session.feeNote ?? ""
        )}</textarea></label>
        <label class="form-field" for="session-edit-notes"><span>備註（選填，最多 500 字）</span><textarea id="session-edit-notes" name="notes" maxlength="500" rows="4">${esc(
          session.notes ?? ""
        )}</textarea></label>
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

function playerDirectoryRowsMarkup(players) {
  return players.length
    ? players
        .map(
          (player) => `<button type="button" class="player-directory-row" data-player-directory-row
            data-testid="player-directory-row-${esc(player.profileId)}" data-player-id="${esc(player.profileId)}">
            <span class="player-directory-row__head"><strong>${esc(player.nickname || "未命名球友")}</strong>${
              player.isPresent ? '<span class="player-directory-row__online">在線</span>' : ""
            }${player.isSelf ? '<span class="player-directory-row__self">這是你</span>' : ""}</span>
            <span>${esc(formatNtrp(player.ntrp))} · ${esc((player.playTypes ?? []).join("、") || "未填打法")}</span>${trustCountMarkup(player.playedCount, "已打 {n} 場")}
            <span>時段：${esc(playerSlotLabels(player.slotCodes).join("、") || "未填時段")}</span>
            <span>常打球場：${esc((player.courtNames ?? []).join("、") || player.courtName || "未填球場")}</span>
          </button>`
        )
        .join("")
    : '<p class="surface__copy">目前沒有公開的球友卡。</p>';
}

/** Open the all-Taipei opt-in directory without coupling it to map bounds. */
export function openPlayerDirectoryList({ onClose = () => {}, onOpenPlayer = () => {}, onRetry = () => {} } = {}) {
  let currentPlayers = [];
  const mounted = mountSheet({
    id: "player-directory-sheet",
    label: "球友名單",
    onClose,
    html: `
      <div class="surface__head">
        <div><p class="surface__eyebrow">台北市</p><h2>球友名單</h2></div>
        <button type="button" class="surface__close" data-surface-close aria-label="關閉球友名單">×</button>
      </div>
      <p class="surface__copy">在線球友排在前面；點選球友卡可查看邀請入口。</p>
      <div class="player-directory-list" data-player-directory-list role="list"></div>`,
  });
  const list = mounted.root.querySelector("[data-player-directory-list]");
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
  { courts = [], myInvitableSessions = [], onClose = () => {}, onCreate = () => {}, onInvite = async () => {} } = {}
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
  const mounted = mountSheet({
    id: "player-card-sheet",
    label: "球友卡",
    onClose,
    html: `
      <div class="surface__head">
        <div><p class="surface__eyebrow">${esc(player.courtDistrict || "台北市")}</p><h2>${esc(player.nickname)}</h2></div>
        <button type="button" class="surface__close" data-surface-close aria-label="關閉球友卡">×</button>
      </div>
      <div class="player-profile" data-player-profile-id="${esc(player.profileId)}">
        <p><strong>${esc(formatNtrp(player.ntrp))}</strong></p>
        ${trustCountMarkup(player.playedCount, "已打 {n} 場")}
        ${player.isPresent ? `<p>在線狀態：${esc(playerPresenceLabel(player))}</p>` : ""}
        ${player.openToGreeting ? `<p class="player-greeting">${esc(playerGreetingLabel(player))}</p>` : ""}
        <p>打法：${esc((player.playTypes ?? []).join("、") || "未填打法")}</p>
        <p>時段：${esc(playerSlotLabels(player.slotCodes).join("、") || "未填時段")}</p>
        <p>常打球場：${esc(player.courtName || "未填球場")}</p>
      </div>
      ${inviteSection}`,
  });
  const wirePlayerCreate = () => mounted.root.querySelector("[data-player-create]")?.addEventListener("click", onCreate);
  wirePlayerCreate();
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
  button.textContent = on ? "隱藏在線" : "顯示在線";
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
