import type {
  ChatMessage,
  CourtSummary,
  MySessionSummary,
  NotificationPreferences,
  SessionRosterEntry,
  SessionSummary,
} from "./domainTypes.ts";
import { canReceiveFocus } from "./meFocus.js";
import { formatNtrp, validProfileNtrp } from "./profile.js";
import { isUndecidedCandidate } from "./sessionCriteria.js";
import { runMySessionAction, runNotificationSettingAction, runPresenceSettingAction } from "./sessionActions.ts";
import { taipeiClock, taipeiDateKey, taipeiDateTime, taipeiParts } from "./taipeiTime.js";

// Typed, side-effect-free presentation rules shared by legacy adapters and React.
// DOM-backed async action ownership is isolated in sessionActions.ts so this file
// never imports the legacy view adapter and cannot recreate the old module cycle.

type Identifier = number | string | null | undefined;
type SessionInput = Partial<SessionSummary> & Partial<MySessionSummary>;
type DateInput = Date | number | string | null | undefined;

interface CourtInput extends CourtSummary {
  city?: string;
  district?: string;
}

export interface VenuePresentation {
  badge?: string;
  candidateNames?: string[];
  court?: string;
  decided?: boolean;
  time?: string;
  undecidedCandidates?: boolean;
}

interface ProfileInput {
  courts?: Set<string> | string[];
}

interface NotificationSettingsInput {
  courtIds?: Identifier[];
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

interface MySessionsActionEntry {
  kind?: string;
  session: SessionInput;
}

interface MySessionsGroups {
  history?: SessionInput[] | null;
  needsAction?: MySessionsActionEntry[] | null;
  upcoming?: SessionInput[] | null;
}

interface PlayerInput {
  courtDistrict?: string;
  courtName?: string;
  courtNames?: string[] | null;
  isPresent?: boolean;
  isSelf?: boolean;
  minutesAgo?: number | null;
  nickname?: string;
  ntrp?: number | string | null;
  openToGreeting?: boolean;
  playedCount?: number | null;
  playTypes?: string[] | null;
  profileId?: Identifier;
  slotCodes?: string[] | null;
}

export const GOOGLE_AVATAR_URL = /^https:\/\/lh[0-9]+[.]googleusercontent[.]com\//;

export function safeGoogleAvatarUrl(value: unknown): string {
  const candidate = String(value ?? "");
  return GOOGLE_AVATAR_URL.test(candidate) ? candidate : "";
}

export function avatarInitial(nickname: unknown): string {
  return [...String(nickname ?? "").trim()][0] || "球";
}

// NTRP 磚的 null／未填值必須顯示「—」；不要改成 Number(ntrp) 判斷，
// 否則 Number(null) 會落回 0.0（既有 hosted QA 曾捕捉這個回歸）。
export function ntrpBrickValue(ntrp: unknown): string {
  return validProfileNtrp(ntrp) ? Number(ntrp).toFixed(1) : "—";
}

export function showAvatarFallback(image: HTMLImageElement): void {
  image.hidden = true;
  const fallback = image.closest("[data-player-avatar]")?.querySelector("[data-avatar-fallback]");
  if (fallback instanceof HTMLElement) fallback.hidden = false;
}

/**
 * 中性聚合數：只陳述事實，不做比率、星等或排名；N 為 0 時整行不顯示。
 * 加入前名單主揪列、球友名單列與球友卡共用這個規則，不可讓三處文案漂移。
 */
export function trustCountText(count: unknown, label: string): string | null {
  const value = Number(count ?? 0);
  if (!Number.isFinite(value) || value <= 0) return null;
  return label.replace("{n}", String(value));
}

export const avatarRuntime = Object.freeze({ avatarInitial, safeGoogleAvatarUrl, showAvatarFallback });

// 個人檔案可能存 court.id 或舊資料的 court.name；雙重比對沿用既有 profile picker
// 的相容規則，不可只留其中一種，否則舊檔案會遺失「常打」球場。
export function profileCourtNames(
  profile: ProfileInput | null | undefined,
  courts: readonly CourtInput[] | null
): string[] {
  const selected = profile?.courts instanceof Set ? profile.courts : new Set(profile?.courts ?? []);
  if (!selected.size) return [];
  return (Array.isArray(courts) ? courts : [])
    .filter((court) => selected.has(String(court?.id)) || selected.has(court?.name))
    .map((court) => court.name);
}

// 分頁狀態掛在持久的 root DOM 節點上，跨 show/hide 沿用；這是 view-only 狀態，
// 不可搬進 sessionController 的資料契約。
export const mySessionsSegmentStates = new WeakMap<
  HTMLElement,
  { lastFocusSessionId: Identifier; segment: "hosted" | "joined" }
>();

export function ntrpRange(session: SessionInput): string {
  // Number(null) is 0 and passes isFinite, so the empty range must be rejected first.
  if (session?.ntrpMin == null || session?.ntrpMax == null) return "NTRP 不限";
  const min = Number(session.ntrpMin);
  const max = Number(session.ntrpMax);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "NTRP 不限";
  if (min === max) return `NTRP ${min.toFixed(1)}`;
  return `NTRP ${min.toFixed(1)}–${max.toFixed(1)}`;
}

// 計分板已有獨立的「NTRP」標籤，只有這個 surface 去掉共同 formatter 的前綴；
// 不可直接改 ntrpRange，否則其他卡片與篩選文案也會一起改變。
export function scoreboardNtrpValue(session: SessionInput): string {
  return ntrpRange(session).replace(/^NTRP /, "");
}

export function vacancyLabel(session: SessionInput): string {
  const remaining = Number(session.slotsRemaining);
  if (!Number.isFinite(remaining) || remaining <= 0) return "已額滿";
  return `缺 ${remaining} 位`;
}

export const TAIPEI_WEEKDAY_WORD = ["日", "一", "二", "三", "四", "五", "六"];

export const padTwo = (value: unknown): string => String(value).padStart(2, "0");

export function taipeiTileDate(value: DateInput): string {
  const parts = taipeiParts(value);
  return parts ? `${padTwo(parts.month)}/${padTwo(parts.day)} ${TAIPEI_WEEKDAY_WORD[parts.weekday]}` : "";
}

export function taipeiDayKey(value: DateInput): string {
  return taipeiDateKey(value) ?? "";
}

export function taipeiDayWord(value: DateInput, now = new Date()): string {
  const key = taipeiDayKey(value);
  if (!key) return "";
  if (key === taipeiDayKey(now)) return "今天";
  if (key === taipeiDayKey(new Date(now.getTime() + 86_400_000))) return "明天";
  const parts = taipeiParts(value);
  return parts ? `週${TAIPEI_WEEKDAY_WORD[parts.weekday]}` : "";
}

export function drawerGroupLabel(value: DateInput, now = new Date()): string {
  const parts = taipeiParts(value);
  if (!parts) return "時間待確認";
  return `${taipeiDayWord(value, now)} ${padTwo(parts.month)}/${padTwo(parts.day)}(${TAIPEI_WEEKDAY_WORD[parts.weekday]})`;
}

export function isOngoingSession(session: SessionInput): boolean {
  const startAt = new Date(session?.startAt ?? "").getTime();
  return Number.isFinite(startAt) && startAt <= Date.now();
}

export function sessionTimeTilePresentation(
  session: SessionInput,
  venue: VenuePresentation,
  { detail = false, compact = false }: { detail?: boolean; compact?: boolean } = {}
) {
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

export const VENUE_TYPE_LABELS: Record<string, string> = {
  booked: "已訂場",
  candidates: "候選局",
  walk_on: "現場等場",
};

export function sessionVenuePresentation(
  session: SessionInput,
  courts: readonly CourtInput[] | null = []
): VenuePresentation {
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

export function completionLabel(session: SessionInput): string {
  return session.hostProfileComplete ? "資料完整" : "資料未完成";
}

export function ongoingSessionMinutes(session: SessionInput): number | null {
  const startAt = new Date(session?.startAt ?? "").getTime();
  if (!Number.isFinite(startAt) || startAt > Date.now()) return null;
  return Math.max(0, Math.floor((Date.now() - startAt) / 60_000));
}

export function sessionCourtLabel(session: SessionInput, venue: VenuePresentation): string {
  const candidateNames = venue.candidateNames ?? [];
  return venue.undecidedCandidates
    ? `${candidateNames[0] ?? "候選球場待確認"}${candidateNames.length > 1 ? ` 等 ${candidateNames.length} 館候選` : ""}`
    : session?.court || venue.court || "";
}

export function sessionHostLabel(session: SessionInput): string {
  const hostNtrpValue = Number(session?.hostNtrp);
  return `主揪 ${session.hostNickname}${Number.isFinite(hostNtrpValue) ? ` ${hostNtrpValue.toFixed(1)}` : ""}`;
}

export function sessionCardPresentation(
  session: SessionInput,
  { compact = false, courts = [] }: { compact?: boolean; courts?: readonly CourtInput[] | null } = {}
) {
  const venue = sessionVenuePresentation(session, courts);
  const courtLabel = sessionCourtLabel(session, venue);
  const hostLabel = sessionHostLabel(session);
  return {
    booked: String(session?.venueType ?? "booked") === "booked",
    className: `session-card${compact ? " session-card--compact" : ""}`,
    courtLabel,
    feeLabel: session.feeNote ? `費用：${session.feeNote}` : null,
    instant: session.joinMode === "instant",
    metaLabel: `${session.playType} · ${ntrpRange(session)} · ${hostLabel}`,
    ongoing: !venue.undecidedCandidates && isOngoingSession(session),
    timeTile: sessionTimeTilePresentation(session, venue, { compact }),
    vacancy: vacancyLabel(session),
  };
}

export function mySessionReason(session: SessionInput): string {
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

export function normalizedNotificationSettings(settings: NotificationSettingsInput = {}) {
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

export function notificationPushHint({
  pushStatus,
  webPushConfigured,
}: Pick<ReturnType<typeof normalizedNotificationSettings>, "pushStatus" | "webPushConfigured">): string {
  if (!webPushConfigured) return "這個環境尚未設定 Web Push 公鑰，暫時無法開啟推播。";
  if (pushStatus === "unsupported") return "此瀏覽器不支援 Web Push，暫時無法在這個裝置開啟推播。";
  if (pushStatus === "enabled") return "此裝置已開啟推播通知。";
  if (pushStatus === "denied") return "你已拒絕通知權限。請到瀏覽器或系統設定重新開啟通知後，再回來按「開啟推播」。";
  return "開啟後，只有這個裝置會收到你選擇的通知。";
}

export const IOS_PUSH_INSTALL_HINT =
  "若使用 iPhone／iPad，請先在 Safari 的分享選單選擇「加入主畫面」，再從主畫面開啟本網站以使用推播通知。";

export function successPushPromptPresentation(
  settings: NotificationSettingsInput,
  { message, testId }: { message: string; testId: string }
) {
  const notification = normalizedNotificationSettings(settings);
  if (!notification.webPushConfigured || ["enabled", "unsupported"].includes(notification.pushStatus)) return null;
  return { iosHint: IOS_PUSH_INSTALL_HINT, message, testId };
}

export function normalizedPresenceSettings(settings: PresenceSettingsInput = {}) {
  return {
    locationStatus: typeof settings?.locationStatus === "string" ? settings.locationStatus : "idle",
    openToGreeting: settings?.openToGreeting === true,
    sharePresence: settings?.sharePresence === true,
  };
}

export function presenceLocationHint({
  locationStatus,
  sharePresence,
}: ReturnType<typeof normalizedPresenceSettings>): string {
  if (!sharePresence) return "關閉後會立即移除你目前的在線狀態。";
  if (locationStatus === "denied") return "你已拒絕定位權限；請到瀏覽器或系統設定開啟定位後，再重新開啟分享。";
  if (locationStatus === "unsupported") return "此瀏覽器不支援定位，暫時無法更新在線狀態。";
  if (locationStatus === "unavailable") return "目前無法取得定位；恢復後會自動嘗試更新。";
  if (locationStatus === "update-failed") return "在線狀態暫時無法更新，請稍後再試。";
  if (locationStatus === "active") return "定位已開啟；只有在球場 100 公尺內才會顯示在線狀態。";
  return "開啟後會請求定位權限；只有在球場 100 公尺內才會顯示在線狀態。";
}

export const mePageRuntime = Object.freeze({
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
});

export function mySessionsSplitBySegment(groups: MySessionsGroups) {
  const needsAction = Array.isArray(groups?.needsAction) ? groups.needsAction : [];
  const upcoming = Array.isArray(groups?.upcoming) ? groups.upcoming : [];
  const history = Array.isArray(groups?.history) ? groups.history : [];
  const isHostRole = (session: SessionInput) => String(session?.viewerRole).toLowerCase() === "host";
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

export function mySessionsFocusRole(groups: MySessionsGroups, sessionId: Identifier): "host" | "guest" | null {
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

export function mySessionsSegmentState(root: HTMLElement) {
  let state = mySessionsSegmentStates.get(root);
  if (!state) {
    state = { lastFocusSessionId: undefined, segment: "joined" };
    mySessionsSegmentStates.set(root, state);
  }
  return state;
}

export function resolveMySessionsSegment(
  root: HTMLElement,
  groups: MySessionsGroups,
  focusSessionId: Identifier
): "hosted" | "joined" {
  const state = mySessionsSegmentState(root);
  if (focusSessionId != null && String(focusSessionId) !== String(state.lastFocusSessionId)) {
    state.segment = mySessionsFocusRole(groups, focusSessionId) === "host" ? "hosted" : "joined";
  }
  state.lastFocusSessionId = focusSessionId ?? null;
  return state.segment;
}

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

// 地圖主畫面與 drawer live region 共用這一份摘要，避免可見文字與讀屏播報漂移。
export function nearbySessionsSummaryText(count: number, hasUserLocation: boolean): string {
  return `${hasUserLocation ? "附近" : "這個地圖範圍內"} ${count} 場可加入`;
}

export function drawerSessionGroups(sessions: SessionInput[]) {
  const groups = new Map<string, SessionInput[]>();
  for (const session of sessions) {
    const key = taipeiDayKey(session.startAt) || "unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(session);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => {
      const sorted = [...items].sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)));
      return { key, label: drawerGroupLabel(sorted[0].startAt), sessions: sorted };
    });
}

export const sessionCardRuntime = Object.freeze({ sessionCardPresentation });

export const nearbySessionsDrawerRuntime = Object.freeze({
  discoveryEmptyActions,
  drawerSessionGroups,
  taipeiDayWord,
});

export function discoveryEmptyActions(filtersActive: boolean) {
  const buttons = [];
  if (filtersActive) buttons.push({ className: "session-secondary", id: "discovery-reset", label: "清除篩選" });
  buttons.push({ className: "session-secondary", id: "discovery-expand", label: "擴大地圖範圍" });
  buttons.push({ className: "session-secondary", id: "discovery-subscribe", label: "有新球局時通知我" });
  buttons.push({ className: "session-primary", id: "discovery-first", label: "開第一局" });
  return buttons;
}

export function acceptedChatRoster(roster: readonly SessionRosterEntry[]): SessionRosterEntry[] {
  return (Array.isArray(roster) ? roster : []).filter(
    (participant) => String(participant?.status).toLowerCase() === "accepted"
  );
}

export function chatRosterPresentation(roster: readonly SessionRosterEntry[]) {
  return acceptedChatRoster(roster).map((participant) => {
    const role = String(participant.role).toLowerCase() === "host" ? "主揪" : "球友";
    const ntrp = participant.ntrp == null ? "" : ` · ${formatNtrp(participant.ntrp)}`;
    return { text: `${participant.nickname || "球友"} · ${role}${ntrp}` };
  });
}

export function chatMessagesPresentation(messages: readonly ChatMessage[]) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  return safeMessages.map((message) => {
    const kind = message.kind === "system" ? "system" : "user";
    const isSelf = kind === "user" && message.isSelf === true;
    const senderProfileId = Number(message.senderProfileId);
    const canGovern = kind === "user" && !isSelf && Number.isSafeInteger(senderProfileId) && senderProfileId > 0;
    const senderNickname = message.senderNickname || "球友";
    const senderInitial = String(senderNickname).trim().slice(0, 1) || "球";
    return {
      body: String(message.body),
      canGovern,
      createdAt: String(message.createdAt),
      createdAtLabel: String(taipeiDateTime(message.createdAt)),
      isSelf,
      kind,
      messageId: String(message.messageId),
      senderInitial,
      senderNickname: String(senderNickname),
      senderProfileId: String(senderProfileId),
      showAuthor: kind === "user" && !isSelf,
    };
  });
}

export const sessionChatSheetRuntime = Object.freeze({
  chatMessagesPresentation,
  chatRosterPresentation,
});

export function messagesFromGroups(groups: Pick<MySessionsGroups, "history" | "upcoming"> = {}): SessionInput[] {
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

export function joinConfirmHintText(expectedAccepted: boolean): string {
  return expectedAccepted
    ? "確認後將直接加入這場球局，加入後即可在球局群組聊天協調細節。"
    : "確認後將送出申請，主揪會在球局流程中處理申請。";
}

export function sessionDetailCourtName(session: SessionInput, venue: VenuePresentation): string {
  return venue.undecidedCandidates ? sessionCourtLabel(session, venue) : session?.court || venue.court || "";
}

export function hostRowBookedStatus(session: SessionInput, venue: VenuePresentation): string {
  if (venue.undecidedCandidates) return "定案後補訂場";
  if (venue.decided) return "✓ 已訂場";
  // sessionVenuePresentation() defaults a missing venueType to "booked"(見該
  // function 的 `String(session?.venueType ?? "booked")`);這裡比照同一預設,
  // 否則沒帶 venueType 的呼叫端會出現頭部 badge 說「已訂場」、這一行卻說
  // 「尚未訂場」的矛盾(D4b 視覺驗收時肉眼抓到)。
  return String(session?.venueType ?? "booked") === "walk_on" ? "尚未訂場" : "✓ 已訂場";
}

export function scoreboardVacancyText(session: SessionInput): string {
  const remaining = Number(session?.slotsRemaining);
  return `${Number.isFinite(remaining) ? Math.max(0, remaining) : 0} 位`;
}

export function candidateCourtRows(session: SessionInput, courts: readonly CourtInput[] = []): CourtInput[] {
  const catalogue = new Map((Array.isArray(courts) ? courts : []).map((court) => [String(court?.id), court]));
  return (Array.isArray(session?.candidateCourtIds) ? session.candidateCourtIds : [])
    .map((courtId) => catalogue.get(String(courtId)))
    .filter(Boolean);
}

export const sessionDetailSheetRuntime = Object.freeze({
  avatarInitial,
  candidateCourtRows,
  completionLabel,
  hostRowBookedStatus,
  joinConfirmHintText,
  ongoingSessionMinutes,
  scoreboardNtrpValue,
  scoreboardVacancyText,
  sessionCourtLabel,
  sessionDetailCourtName,
  sessionTimeTilePresentation,
  sessionVenuePresentation,
  successPushPromptPresentation,
  trustCountText,
});

export const REPORT_REASONS = ["與實際球局不符", "不當行為", "疑似詐騙", "其他"];

export const reportDialogRuntime = Object.freeze({ REPORT_REASONS });

export const PROFILE_SLOTS: Array<readonly [string, string]> = [
  ["wd-m", "平日早上"],
  ["wd-a", "平日下午"],
  ["wd-e", "平日晚上"],
  ["we-m", "週末早上"],
  ["we-a", "週末下午"],
  ["we-e", "週末晚上"],
];

export const PROFILE_SLOT_LABELS = new Map(PROFILE_SLOTS);

export function playerSlotLabels(slotCodes: readonly string[] | null | undefined): string[] {
  return (Array.isArray(slotCodes) ? slotCodes : []).map((code) => {
    const safeCode = String(code ?? "");
    return PROFILE_SLOT_LABELS.get(safeCode) ?? safeCode;
  });
}

export function playerPresenceLabel(player: PlayerInput = {}): string {
  if (player?.isPresent !== true) return "";
  const minutes = Number(player?.minutesAgo);
  const safeMinutes = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0;
  return `在線・${safeMinutes} 分鐘前`;
}

export function playerGreetingLabel(player: PlayerInput = {}): string {
  return player?.openToGreeting === true ? "接受現場問候" : "";
}

export function taipeiCourts(courts: readonly CourtInput[] | null | undefined): CourtInput[] {
  return (Array.isArray(courts) ? courts : []).filter((court) => court?.city === "台北市");
}

export function selectedCourtCheckboxValues(
  container: Element | null | undefined,
  fallback: Set<string> = new Set()
): Set<string> {
  const selected = new Set(
    [...(container?.querySelectorAll<HTMLInputElement>("input[name='profile-courts']:checked") ?? [])].map(
      (input) => input.value
    )
  );
  return selected.size ? selected : new Set(fallback);
}

export function profileCourtOptionsPresentation(
  courts: readonly CourtInput[],
  { ready = true, selected = new Set() }: { ready?: boolean; selected?: Set<string> } = {}
) {
  const nextCourts = taipeiCourts(courts);
  const selectedValues = selected instanceof Set ? selected : new Set(selected ?? []);
  return {
    options:
      ready && nextCourts.length
        ? nextCourts.map((court) => ({
            checked: selectedValues.has(String(court.id)) || selectedValues.has(court.name),
            id: String(court.id),
            label: `${court.name} · ${court.district || "台北市"}`,
          }))
        : [],
    statusHidden: Boolean(ready && nextCourts.length > 0),
    statusText: !ready ? "正在載入台北市球場…" : nextCourts.length ? "" : "目前沒有可選的台北市球場。",
  };
}

export const profileCompletionSheetRuntime = Object.freeze({
  profileCourtOptionsPresentation,
  selectedCourtCheckboxValues,
});

export function decideCourtOptionsPresentation(
  courts: readonly CourtInput[],
  candidateIds: Set<string> | readonly string[],
  { ready = true }: { ready?: boolean } = {}
) {
  const available = Array.isArray(courts) ? courts : [];
  const ids = candidateIds instanceof Set ? candidateIds : new Set([...(candidateIds ?? [])].map(String));
  const candidateCourts = available.filter((court) => ids.has(String(court.id)));
  return {
    // Raw strings on purpose: the imperative version needed esc() because it built
    // an HTML string, whereas React escapes on render — esc() here would produce a
    // visible double-escape of the exact same court names.
    options: candidateCourts.map((court) => ({ id: String(court.id), name: String(court.name) })),
    statusText: !ready
      ? "正在載入候選球場…"
      : candidateCourts.length === 0
        ? "候選球場資料暫時無法載入，請稍後再試。"
        : "",
  };
}

export const decideSessionSheetRuntime = Object.freeze({
  decideCourtOptionsPresentation,
});

export function courtPlayerCardPresentation(player: PlayerInput) {
  return {
    greetingLabel: playerGreetingLabel(player),
    id: String(player.profileId),
    nickname: String(player.nickname),
    ntrpLabel: formatNtrp(player.ntrp),
    playTypesLabel: (player.playTypes ?? []).join("、") || "未填打法",
    presenceLabel: playerPresenceLabel(player),
    showGreeting: Boolean(player.openToGreeting),
    showPresence: Boolean(player.isPresent),
  };
}

export const courtPlayersSheetRuntime = Object.freeze({ courtPlayerCardPresentation });

// 「在線」「這是你」與 trust count 是設計稿以外的既有功能；session.spec.js 的
// player-directory hosted assertions 鎖住這些欄位，不可因對齊視覺稿而移除。
export function playerDirectoryRowPresentation(player: PlayerInput) {
  return {
    courtsText: String((player.courtNames ?? []).join("、") || player.courtName || "未填球場"),
    id: String(player.profileId),
    nickname: String(player.nickname || "未命名球友"),
    ntrpValue: ntrpBrickValue(player.ntrp),
    showOnline: Boolean(player.isPresent),
    showSelf: Boolean(player.isSelf),
    slotsText: playerSlotLabels(player.slotCodes).join("、") || "未填時段",
    trustText: trustCountText(player.playedCount, "已打 {n} 場"),
  };
}

export const playerDirectorySheetRuntime = Object.freeze({ playerDirectoryRowPresentation });

export function playerInviteOptionPresentation(session: SessionInput, courts: readonly CourtInput[] = []) {
  const venue = sessionVenuePresentation(session, courts);
  return {
    badge: String(venue.badge),
    court: String(venue.court),
    notes: session.notes ? String(session.notes) : "",
    ntrpRange: ntrpRange(session),
    playType: String(session.playType),
    sessionId: String(session.sessionId),
    time: String(venue.time),
  };
}

// 常打／時段同時餵頭部副行與既有 player-profile 段落；smoke.spec.js 的
// "player drawer and card escape every public value" 鎖住逐字值與 escaping，不可改計算方式。
export function playerCardPresentation(player: PlayerInput) {
  return {
    courtNameText: String(player.courtName || "未填球場"),
    courtsText: String((player.courtNames ?? []).join("、") || player.courtName || "未填球場"),
    districtLabel: String(player.courtDistrict || "台北市"),
    greetingLabel: playerGreetingLabel(player),
    nickname: String(player.nickname),
    ntrpValue: ntrpBrickValue(player.ntrp),
    playTypesText: String((player.playTypes ?? []).join("、") || "未填打法"),
    presenceLabel: playerPresenceLabel(player),
    profileId: String(player.profileId),
    showGreeting: Boolean(player.openToGreeting),
    showPresence: Boolean(player.isPresent),
    slotsText: playerSlotLabels(player.slotCodes).join("、") || "未填時段",
    trustText: trustCountText(player.playedCount, "已打 {n} 場"),
  };
}

export const playerCardSheetRuntime = Object.freeze({ playerCardPresentation, playerInviteOptionPresentation });
