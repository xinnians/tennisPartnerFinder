import { BANDS, DEFAULT_FILTER_STATE, isDefaultFilters, joinableSessionCount } from "./filters.js";
import { TAIPEI_DISTRICTS } from "./districts.ts";
import { formatNtrp, validProfileNtrp } from "./profile.js";
import { isUndecidedCandidate } from "./sessionCriteria.js";
import { mountDialog, mountSheet } from "./sheets.js";
import { canReceiveFocus } from "./meFocus.js";
import {
  taipeiClock,
  taipeiDateKey,
  taipeiDateTime,
  taipeiDateTimeLocalValue,
  taipeiLocalDateTimeToIso,
  taipeiParts,
} from "./taipeiTime.js";
import { esc } from "./util.js";

// Vite 將單檔 eager glob 轉為 browser 的同步 import；Node 22 unit tests 沒有
// document，會短路而不解析其不支援的 .tsx 副檔名。
const messagesPageModules =
  typeof document === "undefined" ? {} : import.meta.glob("./pages/MessagesPage.tsx", { eager: true });
const mountMessagesPage = messagesPageModules["./pages/MessagesPage.tsx"]?.mountMessagesPage;
const mePageModules = typeof document === "undefined" ? {} : import.meta.glob("./pages/MePage.tsx", { eager: true });
const mountMePage = mePageModules["./pages/MePage.tsx"]?.mountMePage;
const mySessionsPageModules =
  typeof document === "undefined" ? {} : import.meta.glob("./pages/MySessionsPage.tsx", { eager: true });
const mountMySessionsPage = mySessionsPageModules["./pages/MySessionsPage.tsx"]?.mountMySessionsPage;
const sessionDetailSheetModules =
  typeof document === "undefined" ? {} : import.meta.glob("./sheets/SessionDetailSheet.tsx", { eager: true });
const mountSessionDetailSheetContent =
  sessionDetailSheetModules["./sheets/SessionDetailSheet.tsx"]?.mountSessionDetailSheetContent;
const createSessionSheetModules =
  typeof document === "undefined" ? {} : import.meta.glob("./sheets/CreateSessionSheet.tsx", { eager: true });
const mountCreateSessionSheetContent =
  createSessionSheetModules["./sheets/CreateSessionSheet.tsx"]?.mountCreateSessionSheetContent;
const editSessionSheetModules =
  typeof document === "undefined" ? {} : import.meta.glob("./sheets/EditSessionSheet.tsx", { eager: true });
const mountEditSessionSheetContent =
  editSessionSheetModules["./sheets/EditSessionSheet.tsx"]?.mountEditSessionSheetContent;

export { taipeiLocalDateTimeToIso } from "./taipeiTime.js";

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
    image.addEventListener("error", () => showAvatarFallback(image));
  });
}

function showAvatarFallback(image) {
  image.hidden = true;
  const fallback = image.closest("[data-player-avatar]")?.querySelector("[data-avatar-fallback]");
  if (fallback) fallback.hidden = false;
}

/**
 * 中性聚合數:只陳述事實,不做比率、星等或排名;N 為 0 時整行不顯示。
 *
 * 三個呼叫點(加入前名單主揪列、球友名單列、球友卡)的容器都是 grid,所以這個 span
 * 會自成一列,不需要各自加 display。
 */
function trustCountText(count, label) {
  const value = Number(count ?? 0);
  if (!Number.isFinite(value) || value <= 0) return null;
  return label.replace("{n}", String(value));
}

function trustCountMarkup(count, label) {
  const text = trustCountText(count, label);
  return text ? `<span class="trust-count">${esc(text)}</span>` : "";
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

const dialogFocusable =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const drawerBindings = new WeakMap();
const drawerFocusIntents = new WeakMap();
const drawerLoadingFocusFallbacks = new WeakSet();
const mySessionActionStates = new WeakMap();
const mySessionsRenderOptions = new WeakMap();
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

/** Mount or update the React account and service skeleton for the Me destination. */
export function renderMePage(root, options = {}) {
  if (!mountMePage) throw new Error("MePage browser mount is unavailable.");
  const authSession = options.authSession ?? null;
  setMySessionActionScope(root, authSession?.user?.id ?? null);
  mountMePage(root, options);
  syncPendingMySessionActions(root);
}

// 新球局不再提供「對拉」（它的語意併入「練球」）。編輯仍須接受四值：DB 的 CHECK 沒變，
// 既有的對拉球局若在這裡被擋下，主揪連改時間都存不回去。
const CREATE_PLAY_TYPES = new Set(["單打", "雙打", "練球"]);
const EDIT_PLAY_TYPES = new Set(["單打", "雙打", "對拉", "練球"]);
const NOW_START_CREATE_GRACE_MS = 5 * 60 * 1000;

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

// 時間磚下行「08/10 一」(dc L825:DAY_OF 去括號版)
function taipeiTileDate(value) {
  const parts = taipeiParts(value);
  return parts ? `${padTwo(parts.month)}/${padTwo(parts.day)} ${TAIPEI_WEEKDAY_WORD[parts.weekday]}` : "";
}

function taipeiDayKey(value) {
  return taipeiDateKey(value) ?? "";
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
  const undecided = isUndecidedCandidate(session);
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
function sessionTimeTilePresentation(session, venue, { detail = false, compact = false } = {}) {
  const parts = taipeiParts(session?.startAt);
  const undecided = venue?.undecidedCandidates === true;
  const endParts = undecided && session?.rangeEnd ? taipeiParts(session.rangeEnd) : null;
  const start = undecided && endParts && parts ? `${parts.hour}–${endParts.hour}` : taipeiClock(session?.startAt);
  const ongoing = !undecided && isOngoingSession(session);
  const modifiers = `${detail ? " time-tile--detail" : ""}${compact ? " time-tile--compact" : ""}${ongoing ? " time-tile--ongoing" : ""}`;
  return {
    className: `time-tile${modifiers}`,
    date: taipeiTileDate(session?.startAt) || "待確認",
    start: start || "--:--",
  };
}

function sessionTimeTileMarkup(session, venue, options = {}) {
  const presentation = sessionTimeTilePresentation(session, venue, options);
  return `<span class="${presentation.className}"><span class="time-tile__start">${esc(
    presentation.start
  )}</span><span class="time-tile__date">${esc(presentation.date)}</span></span>`;
}

const VENUE_TYPE_LABELS = {
  booked: "已訂場",
  candidates: "候選局",
  walk_on: "現場等場",
};

function sessionVenuePresentation(session, courts = []) {
  const venueType = String(session?.venueType ?? "booked");
  const undecided = isUndecidedCandidate(session);
  const decided = venueType === "candidates" && !undecided;
  if (!undecided) {
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

function ongoingSessionMinutes(session) {
  const startAt = new Date(session?.startAt ?? "").getTime();
  if (!Number.isFinite(startAt) || startAt > Date.now()) return null;
  return Math.max(0, Math.floor((Date.now() - startAt) / 60_000));
}

// 批 D2:v2 球局卡(dc L153-171)——左時間磚+右欄(標題列/meta/底列)。
// 候選場次以標題後綴「等 N 館候選」+時段範圍表達(dc L845-846),不另掛 badge。
// courtLabel/hostLabel 兩個 helper 批 D6 抽出——My Sessions React 薄卡列
// 沿用同一套候選局縮寫與主揪標籤慣例,避免兩處各自定義
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

/**
 * Run one DOM-backed async action without letting a stale pre-render control
 * overwrite the authoritative disabled state produced by a callback render.
 * Callers keep only their action-specific success, error, and focus policy.
 */
async function runAsyncAction({
  root,
  callback,
  controls = [],
  watchNodes = [],
  error = null,
  clearError = true,
  clearErrorText = false,
  errorMessage = "操作暫時無法完成，請稍後再試。",
  errorFocus = false,
  errorResult,
  current = () => true,
  onSuccess,
  onSuccessAfterRerender = false,
  onError,
  onErrorAfterRerender = false,
  onFinally,
  onFinallyAfterRerender = false,
  canRestoreControls = () => true,
  resolveControls,
  restoreAfterRerender = false,
  focus,
}) {
  const unlockedControls = controls.filter((control) => control && !control.disabled);
  const watchedNodes = [...new Set([...unlockedControls, ...watchNodes.filter(Boolean)])];
  const active = document.activeElement;
  const belongsToRoot = (node) => root.contains(node);
  const focusIntent =
    focus?.capture && active instanceof HTMLElement && belongsToRoot(active) ? focus.capture(active) : null;
  const rerendered = () => watchedNodes.some((node) => !belongsToRoot(node));

  unlockedControls.forEach((control) => {
    control.disabled = true;
  });
  if (clearError && error) {
    error.hidden = true;
    if (clearErrorText) error.textContent = "";
  }

  let result;
  let cause;
  let completed = false;
  try {
    result = await callback();
    const context = { cause, completed, error, result, rerendered: rerendered(), controlsRestored: false };
    if (current() && (!context.rerendered || onSuccessAfterRerender)) await onSuccess?.(result, context);
    completed = true;
    return result;
  } catch (actionError) {
    cause = actionError;
    const context = { cause, completed, error, result, rerendered: rerendered(), controlsRestored: false };
    if (current() && (!context.rerendered || onErrorAfterRerender)) {
      if (onError) {
        await onError(actionError, context);
      } else if (error) {
        error.textContent = actionError?.message || errorMessage;
        error.hidden = false;
        if (errorFocus) error.focus({ preventScroll: true });
      }
    }
    return typeof errorResult === "function" ? errorResult(actionError) : errorResult;
  } finally {
    const isCurrent = current();
    const context = { cause, completed, error, result, rerendered: rerendered(), controlsRestored: false };
    if (isCurrent && (!context.rerendered || restoreAfterRerender) && canRestoreControls(context)) {
      const controlsToRestore = resolveControls?.(context) ?? unlockedControls;
      controlsToRestore.filter(Boolean).forEach((control) => {
        control.disabled = false;
      });
      context.controlsRestored = true;
    }
    if (isCurrent && (!context.rerendered || onFinallyAfterRerender)) await onFinally?.(context);
    if (isCurrent && focusIntent != null && (focus.shouldRestore?.(context) ?? true)) {
      focus.restore?.(focusIntent, context);
    }
  }
}

function runMySessionAction(button, callback, root) {
  if (!callback || button.disabled) return;
  const descriptor = actionDescriptor(button);
  const descriptorKey = actionDescriptorKey(descriptor);
  const pending = pendingMySessionActions(root);
  const opensConfirmation = descriptor.action === "withdraw";
  if (!opensConfirmation) pending.set(descriptorKey, descriptor);
  let restoreActionFocus = false;
  void runAsyncAction({
    root,
    callback,
    controls: opensConfirmation ? [] : [button],
    error: root.querySelector("[data-my-sessions-error]"),
    clearError: !opensConfirmation,
    current: () => pendingMySessionActions(root) === pending,
    onError: (actionError) => {
      showMySessionActionError(root, actionError?.message || "操作暫時無法完成，請稍後再試。");
      // reloadParticipation can replace the original button before an error
      // arrives. Resolve the semantic action again in the current DOM so the
      // keyboard user stays in the same operational context.
      restoreActionFocus = !opensConfirmation;
    },
    onErrorAfterRerender: true,
    resolveControls: () => (opensConfirmation ? [] : [currentMySessionActionButton(root, descriptor)]),
    restoreAfterRerender: true,
    onFinally: () => {
      if (!opensConfirmation) pending.delete(descriptorKey);
      if (!opensConfirmation && MY_SESSION_LIFECYCLE_ACTIONS.has(descriptor.action)) {
        focusMySessionActionResult(root, descriptor, { failed: restoreActionFocus });
      }
    },
    onFinallyAfterRerender: true,
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

function successPushPromptPresentation(settings, { message, testId }) {
  const notification = normalizedNotificationSettings(settings);
  if (!notification.webPushConfigured || ["enabled", "unsupported"].includes(notification.pushStatus)) return null;
  return { iosHint: IOS_PUSH_INSTALL_HINT, message, testId };
}

function successPushPromptMarkup(settings, options) {
  const presentation = successPushPromptPresentation(settings, options);
  if (!presentation) return "";
  return `<section class="success-push-prompt" data-success-push-prompt>
    <p>${esc(presentation.message)}</p>
    <button type="button" class="session-secondary" data-success-enable-push data-testid="${esc(
      presentation.testId
    )}">開啟推播</button>
    <p class="form-hint">${esc(presentation.iosHint)}</p>
    <p class="form-error" data-success-push-error role="alert" tabindex="-1" hidden></p>
  </section>`;
}

function wireSuccessPushPrompt(root, onEnablePush) {
  const prompt = root.querySelector("[data-success-push-prompt]");
  const button = prompt?.querySelector("[data-success-enable-push]");
  const error = prompt?.querySelector("[data-success-push-error]");
  button?.addEventListener("click", () => {
    let terminalStatus = false;
    void runAsyncAction({
      root,
      callback: onEnablePush,
      controls: [button],
      watchNodes: [prompt],
      error,
      errorMessage: "推播暫時無法開啟，請稍後再試。",
      errorFocus: true,
      onSuccess: (status) => {
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
      },
      canRestoreControls: () => !prompt.hidden && !terminalStatus,
    });
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
  const unlockedDescriptors = controls.filter((control) => !control.disabled).map(notificationControlDescriptor);
  const error = root.querySelector("[data-notification-error]");
  return runAsyncAction({
    root,
    callback: async () => {
      await callback();
      return true;
    },
    controls,
    error,
    clearErrorText: true,
    errorMessage: "通知設定暫時無法更新，請稍後再試。",
    errorFocus: true,
    errorResult: false,
    resolveControls: () => unlockedDescriptors.map((descriptor) => findNotificationControl(root, descriptor)),
    focus: {
      capture: notificationControlDescriptor,
      shouldRestore: ({ completed }) => completed,
      restore: (focusedDescriptor) => {
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
      },
    },
  });
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
  const unlockedSelectors = controls.filter((control) => !control.disabled).map(presenceControlSelector);
  const error = root.querySelector("[data-presence-error]");
  return runAsyncAction({
    root,
    callback: async () => (await callback()) !== false,
    controls,
    error,
    clearErrorText: true,
    errorMessage: "在線設定暫時無法更新，請稍後再試。",
    errorResult: false,
    resolveControls: () => unlockedSelectors.map((selector) => root.querySelector(selector)),
    focus: {
      capture: presenceControlSelector,
      // 回呼回 false 代表被 gate 攔截並開了補件 sheet，焦點歸該 sheet 管；
      // 失敗則留在原控制項，接不住時才退到 role=alert。
      shouldRestore: ({ completed, result }) => !completed || result,
      restore: (focusedSelector) => {
        const current = document.activeElement;
        // 只接手被 disable 踢成無主的焦點；使用者自己移走的焦點不搶回來。
        const focusIsLoose = !(current instanceof HTMLElement) || current === document.body;
        const target = focusIsLoose ? root.querySelector(focusedSelector) : null;
        if (canReceiveFocus(target)) target.focus({ preventScroll: true });
        else if (focusIsLoose && error && !error.hidden && canReceiveFocus(error)) {
          // 控制項接不住(被收合、被移除)時才退到錯誤訊息,不讓焦點留在 body。
          error.focus({ preventScroll: true });
        }
      },
    },
  });
}

/** Single-source presentation and DOM action helpers consumed by the React Me page. */
export const mePageRuntime = Object.freeze({
  avatarInitial,
  canReceiveFocus,
  normalizedNotificationSettings,
  normalizedPresenceSettings,
  notificationPushHint,
  ntrpBrickValue,
  playerSlotLabels,
  presenceLocationHint,
  profileCourtNames,
  runMySessionAction,
  runNotificationSettingAction,
  runPresenceSettingAction,
  safeGoogleAvatarUrl,
  showAvatarFallback,
});

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

/** Single-source presentation/state helpers consumed by the React My Sessions page. */
export const mySessionsPageRuntime = Object.freeze({
  mySessionReason,
  mySessionsSplitBySegment,
  normalizedNotificationSettings,
  ntrpRange,
  resolveMySessionsSegment,
  runMySessionAction,
  sessionCourtLabel,
  sessionHostLabel,
  sessionTimeTilePresentation,
  sessionVenuePresentation,
  successPushPromptPresentation,
  vacancyLabel,
});

function wireMySessionsPage(root, options = {}) {
  const {
    onAccept = () => {},
    onAcceptInvite = () => {},
    onBack = () => {},
    onCancel = () => {},
    onConfirmAttendance = () => {},
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
  } = options;

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
      renderMySessionsPage(root, mySessionsRenderOptions.get(root));
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
      runMySessionAction(button, callbacks[button.dataset.myAction], root);
    });
  });
}

function scheduleMySessionsCreatedFocus(root, options = {}) {
  const {
    createdSessionId = null,
    groups = { history: [], needsAction: [], needsActionCount: 0, upcoming: [] },
    highlightSessionId = null,
    onCreatedSessionFocus = () => true,
  } = options;
  const needsAction = Array.isArray(groups.needsAction) ? groups.needsAction : [];
  const upcoming = Array.isArray(groups.upcoming) ? groups.upcoming : [];
  const focusSessionId = highlightSessionId ?? createdSessionId;
  // 批 C3-3:聚焦目標可能落在兩個互斥的清單之一——accepted(instant 加入／host
  // 自己)在 upcoming,走 SessionCard 的「查看球局」鈕;仍在等主揪審核的三種
  // outcome(approval／NTRP 缺／範圍外)在 needsAction 的 guest-request,走
  // GuestRequestCard 的「撤回申請」鈕(卡片內唯一可聚焦元素)。同一個 sessionId
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

/** Mount or update the private, action-first My Sessions destination. */
export function renderMySessionsPage(root, options = {}) {
  if (!mountMySessionsPage) throw new Error("MySessionsPage browser mount is unavailable.");
  mySessionsRenderOptions.set(root, options);
  setMySessionActionScope(root, options.actionScopeKey ?? null);
  mountMySessionsPage(root, options);
  wireMySessionsPage(root, options);
  syncPendingMySessionActions(root);
  scheduleMySessionsCreatedFocus(root, options);
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
  // 「N 場可加入」只計真可加入的局;滿員局仍列在清單(沉底+已額滿磚),不進計數。
  const count = joinableSessionCount(sessions);
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
    // 背景輪詢會週期重繪 feed:只有在使用者本來就貼近底部時才跟捲到底,回看歷史時
    // 保留原捲動位置(innerHTML 重繪會歸零 scrollTop,必須先量後還原)。
    const nearBottom = !feedInitialized || feed.scrollHeight - feed.scrollTop - feed.clientHeight < 48;
    const previousScrollTop = feed.scrollTop;
    roster.innerHTML = chatRosterMarkup(participants);
    feed.innerHTML = chatMessagesMarkup(safeMessages);
    if (nearBottom) scrollFeedToLatest();
    else feed.scrollTop = previousScrollTop;
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
    await runAsyncAction({
      root: mounted.root,
      callback: () => onPost(body),
      controls: [send, input],
      error,
      clearError: false,
      errorMessage: "訊息暫時無法傳送，請稍後再試。",
      errorFocus: true,
      onSuccess: () => {
        input.value = "";
      },
      canRestoreControls: () => !archived,
    });
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

/** Mount or update the React CHATS destination without changing its public adapter. */
export function renderMessagesPage(root, options = {}) {
  if (!mountMessagesPage) throw new Error("MessagesPage browser mount is unavailable.");
  mountMessagesPage(root, options);
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

/** 球場名(19px)那一行:未定案候選改用 sessionCourtLabel() 同一套 D2 卡片
 * 「X 等 N 館候選」縮寫公式(批 D9 backlog #2)——完整候選清單只留在下方
 * React candidate info 的完整候選資訊列,不再頭部/資訊列各重複一份;
 * 其餘沿用 session.court 原始球場名——不再像舊版把行政區併進同一行。 */
function sessionDetailCourtName(session, venue) {
  return venue.undecidedCandidates ? sessionCourtLabel(session, venue) : session?.court || venue.court;
}

/** 行政區・時間那一行:只有時間片段套 mono(dc L349 inline span)。 */
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

/** React detail content imports the existing presentation rules from one source. */
export const sessionDetailSheetRuntime = Object.freeze({
  avatarInitial,
  candidateCourtRows,
  completionLabel,
  hostRowBookedStatus,
  joinConfirmHintText,
  ongoingSessionMinutes,
  safeGoogleAvatarUrl,
  scoreboardNtrpValue,
  scoreboardVacancyText,
  sessionCourtLabel,
  sessionDetailCourtName,
  sessionTimeTilePresentation,
  sessionVenuePresentation,
  showAvatarFallback,
  successPushPromptPresentation,
  trustCountText,
});

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
  if (!mountSessionDetailSheetContent) throw new Error("SessionDetailSheet browser mount is unavailable.");
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
      <div class="session-detail"></div>`,
  });

  const contentRoot = mounted.root.querySelector(".session-detail");
  const content = mountSessionDetailSheetContent(
    contentRoot,
    {
      action,
      canChat,
      canDecide,
      canEdit,
      canReport,
      courts,
      isMine,
      notificationSettings,
      session,
      showJoinPreview,
      venue,
    },
    {
      expectedAccepted: confirmingExpectedAccepted,
      joinPreview: { participants: [], status: "loading" },
      message: "",
      stage: initialStage,
    }
  );
  const container = mounted.root.querySelector(".session-detail__actions");
  const setJoinPreview = (state) => content.setJoinPreview(state);
  // mountSheet 掛 listener 時 React close button 尚未存在；補線只委派回既有 close，
  // surface teardown、focus restore 與 onClose 仍完全由 mountSheet 負責。
  mounted.root.querySelector("[data-surface-close]")?.addEventListener("click", mounted.close);
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
      await runAsyncAction({
        root: mounted.root,
        callback: onCopyLink,
        controls: [copyLinkButton],
        error: mounted.root.querySelector("[data-session-report-error]"),
        clearError: false,
        errorMessage: "目前無法複製連結，請手動複製網址。",
      });
    });
    const reportButton = mounted.root.querySelector('[data-session-action="report"]');
    reportButton?.addEventListener("click", async () => {
      const error = mounted.root.querySelector("[data-session-report-error]");
      await runAsyncAction({
        root: mounted.root,
        callback: onReport,
        controls: [reportButton],
        error,
        errorMessage: "目前無法開啟檢舉。",
      });
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
    content.renderStage(nextStage, message, confirmingExpectedAccepted);
    stage = nextStage;
  }

  // React state 只改變 `.session-detail__actions` 子樹；memo 化的其餘內容維持同一批
  // DOM nodes。每次切換後明確把焦點移到新態的第一個可操作元素(或成功卡標題)。
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

  // Initial React commit never goes through setStage(): a freshly mounted idle
  // sheet must NOT steal focus here — mountSurface's own generic fallback
  // (requestAnimationFrame, only if nothing already has focus) puts it on
  // the × close button, matching every other sheet in this app. Any other
  // initial stage (only "confirming", from a resumed Join intent) has no
  // such fallback to lean on and must claim its own focus synchronously,
  // before that fallback's requestAnimationFrame runs.
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
    await runAsyncAction({
      root: mounted.root,
      callback: async () => {
        await onConfirm();
        mounted.close({ reason: "complete" });
      },
      controls: [confirmButton],
      error,
      errorMessage: "退出球局暫時無法完成，請稍後再試。",
      onFinally: ({ controlsRestored }) => {
        if (controlsRestored) submitting = false;
      },
    });
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
    await runAsyncAction({
      root: mounted.root,
      callback: () => onSubmit(reason),
      controls: [submit],
      error,
      errorMessage: "檢舉暫時無法送出，請稍後再試。",
      onSuccess: () => {
        form.hidden = true;
        success.hidden = false;
        success.focus({ preventScroll: true });
      },
      canRestoreControls: () => !form.hidden,
      onFinally: ({ controlsRestored }) => {
        if (controlsRestored) submitting = false;
      },
    });
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
    await runAsyncAction({
      root: mounted.root,
      callback: async () => {
        const savedProfile = await onSave(nextProfile);
        saved = true;
        mounted.close({ reason: "complete" });
        await onSaved(savedProfile ?? nextProfile);
      },
      controls: [submit],
      error,
      errorMessage: "個人檔案暫時無法儲存。",
      onFinally: ({ controlsRestored }) => {
        if (controlsRestored) saving = false;
      },
    });
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

function createSessionDonePresentation(value, result, courts) {
  const isCandidate = value.venueType === "candidates";
  const courtId = isCandidate ? value.candidateCourtIds?.[0] : value.courtId;
  const court = courts.find((candidate) => String(candidate.id) === String(courtId));
  return {
    court: court?.name ?? "球場待確認",
    date: taipeiTileDate(value.startAt),
    meta: isCandidate
      ? `候選 ${value.candidateCourtIds?.length ?? 0} 座球場・${court?.district ?? "台北市"}`
      : `${value.playType}・${court?.district ?? "台北市"}`,
    need: `缺 ${value.slotsTotal}`,
    sessionId: result?.sessionId ?? null,
    time: taipeiClock(value.startAt),
  };
}

/** Shared pure/runtime dependencies injected into the strict React form sheets. */
export const sessionFormSheetRuntime = Object.freeze({
  bumpCreateTimeMinutes,
  createCandidateWindowLocal,
  createFixedStartAtLocal,
  createSessionDonePresentation,
  createSessionFormCanPublish,
  taipeiClock,
  taipeiCourts,
  taipeiDateTimeLocalValue,
  taipeiDateValue,
});

/** 開球局全螢幕流程(批 D5):計分板視覺,含成功頁;大量複用 D1/D4 語彙。 */
export function openCreateSessionSheet({
  courts = [],
  courtsReady = true,
  onClose = () => {},
  onSubmit = async () => {},
  onViewMySessions = () => {},
  toast = () => {},
} = {}) {
  if (!mountCreateSessionSheetContent) throw new Error("CreateSessionSheet browser mount is unavailable.");
  const now = () => new Date();
  let submitting = false;
  let content;
  const mounted = mountSheet({
    id: "session-create-modal",
    label: "開球局",
    className: "create-v2",
    onClose,
    html: "",
  });

  content = mountCreateSessionSheetContent(mounted.surface, {
    bumpTime: sessionFormSheetRuntime.bumpCreateTimeMinutes,
    canPublish: sessionFormSheetRuntime.createSessionFormCanPublish,
    candidateWindow: sessionFormSheetRuntime.createCandidateWindowLocal,
    clock: sessionFormSheetRuntime.taipeiClock,
    config: {
      bands: CREATE_NTRP_BANDS,
      dateChips: CREATE_DATE_CHIP_KEYS.map((key) => ({ key, label: createDateChipLabel(key, now()) })),
      ntrpExplanation: NTRP_SCALE_EXPLANATION,
      playTypeHint: PLAY_TYPE_HINT,
      playTypes: CREATE_SESSION_PLAY_TYPES,
      profileDisclosure: PROFILE_PUBLIC_DISCLOSURE,
      slotOptions: CREATE_SLOT_OPTIONS,
      timeCustomDefault: CREATE_TIME_CUSTOM_DEFAULT,
      timePresets: CREATE_TIME_PRESETS,
    },
    courts: sessionFormSheetRuntime.taipeiCourts(courts),
    courtsReady: Boolean(courtsReady),
    dateValueNow: (value) => sessionFormSheetRuntime.taipeiDateValue(value, value),
    donePresentation: sessionFormSheetRuntime.createSessionDonePresentation,
    fixedStartAt: sessionFormSheetRuntime.createFixedStartAtLocal,
    initialForm: freshCreateSessionForm(),
    now,
    onBackToMap: () => mounted.close(),
    onClose: () => mounted.close(),
    onSubmit: async (form, { error, submit }) => {
      if (submitting) return;
      if (!sessionFormSheetRuntime.createSessionFormCanPublish(form)) {
        toast(form.mode === "cand" ? "先選 2–3 個候選球場與時段" : "先選好球場與開始時間");
        return;
      }
      const validation = validateCreateSessionInput(createSessionFormRawInput(form, now()));
      if (!validation.valid) {
        error.hidden = false;
        error.textContent = Object.values(validation.errors)[0];
        return;
      }
      submitting = true;
      await runAsyncAction({
        root: mounted.root,
        callback: () => onSubmit(validation.value),
        controls: [submit],
        error,
        clearErrorText: true,
        errorMessage: "建立球局失敗，請稍後再試。",
        onSuccess: (result) => content.showDone(validation.value, result),
        onFinally: () => {
          submitting = false;
        },
      });
    },
    onViewMySessions: (sessionId) => {
      mounted.close({ reason: "view-my-sessions", restoreFocus: false });
      onViewMySessions(sessionId);
    },
    toast,
  });

  const setCourts = (nextCourts, { ready = true } = {}) => {
    content.setCourts(sessionFormSheetRuntime.taipeiCourts(nextCourts), { ready: Boolean(ready) });
  };

  return { ...mounted, setCourts };
}

/** Open the one-tap candidate decision sheet backed by a fresh SessionSummary. */
export function openDecideSessionSheet(
  session,
  { courts = [], courtsReady = true, onClose = () => {}, onDecide = async () => {} } = {}
) {
  const candidateIds = new Set((session?.candidateCourtIds ?? []).map(String));
  const unavailable = !isUndecidedCandidate(session);
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
    await runAsyncAction({
      root: mounted.root,
      callback: () => onDecide(Number(button.dataset.decideCourt), startAt),
      controls: buttons(),
      error,
      onError: (decisionError) => {
        if (terminalState) return;
        error.textContent = decisionError?.message || "定案失敗，請稍後再試。";
        error.hidden = false;
      },
      canRestoreControls: () => !terminalState,
      resolveControls: buttons,
      onFinally: ({ controlsRestored }) => {
        if (controlsRestored) deciding = false;
      },
    });
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
  if (!mountEditSessionSheetContent) throw new Error("EditSessionSheet browser mount is unavailable.");
  // 漸進式揭露反模式防呆:已填的選填欄位不可被預設收合藏起來,四欄任一有值就預設展開。
  const hasOptionalValues = [session.ntrpMin, session.ntrpMax, session.feeNote, session.notes].some(
    (value) => value != null && String(value).trim() !== ""
  );
  let saving = false;
  let content;
  const mounted = mountSheet({
    id: "session-edit-sheet",
    label: "編輯球局",
    className: "create-session-sheet",
    onClose,
    html: "",
  });

  content = mountEditSessionSheetContent(mounted.surface, {
    courts: sessionFormSheetRuntime.taipeiCourts(courts),
    courtsReady: Boolean(courtsReady),
    hasOptionalValues,
    ntrpExplanation: NTRP_SCALE_EXPLANATION,
    onClose: () => mounted.close(),
    onSubmit: async ({ error, form, submit }) => {
      if (saving) return;
      const validation = validateUpdateSessionInput(Object.fromEntries(new FormData(form).entries()));
      if (!validation.valid) {
        error.textContent = Object.values(validation.errors)[0];
        error.hidden = false;
        return;
      }
      saving = true;
      await runAsyncAction({
        root: mounted.root,
        callback: () => onSubmit(validation.value),
        controls: [submit],
        error,
        errorMessage: "更新球局失敗，請稍後再試。",
        onFinally: ({ controlsRestored }) => {
          if (controlsRestored) saving = false;
        },
      });
    },
    playTypeHint: PLAY_TYPE_HINT,
    playTypes:
      session.playType === "對拉" ? [...CREATE_SESSION_PLAY_TYPES, "對拉"] : CREATE_SESSION_PLAY_TYPES,
    session,
    startAtLocal: sessionFormSheetRuntime.taipeiDateTimeLocalValue(session.startAt, {
      includeMilliseconds: true,
    }),
  });

  const setCourts = (nextCourts, { ready = true } = {}) => {
    content.setCourts(sessionFormSheetRuntime.taipeiCourts(nextCourts), { ready: Boolean(ready) });
  };

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
    await runAsyncAction({
      root: mounted.root,
      callback: () => onInvite(selected.value),
      controls: [submit],
      error,
      clearError: false,
      errorMessage: "邀請失敗，請稍後再試。",
      onSuccess: () => {
        success.textContent = "邀請已送出";
        success.hidden = false;
      },
    });
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
