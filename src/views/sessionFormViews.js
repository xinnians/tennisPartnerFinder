import { isUndecidedCandidate } from "../sessionCriteria.js";
import { mountSheet } from "../sheets.js";
import { sessionActionMessage } from "../sessionActionMessages.ts";
import { runAsyncAction } from "../sessionActions.ts";
import { taipeiClock, taipeiDateTimeLocalValue, taipeiLocalDateTimeToIso, taipeiParts } from "../taipeiTime.js";
import { padTwo, taipeiTileDate } from "../sessionPresentation.ts";

let deferSurfaceOpen;
let lazyMounts;
let preloadCreateSessionSheet;
let preloadDecideSessionSheet;
let preloadEditSessionSheet;
let registerCreateContent;
let registerDecideContent;
let registerEditContent;
let sessionFormSheetRuntime;
let ntrpScaleExplanation;
let profilePublicDisclosure;

/** Configure the facade-owned lazy mounts and synchronous surface registration boundary. */
export function configureSessionFormViews(dependencies) {
  ({
    deferSurfaceOpen,
    lazyMounts,
    ntrpScaleExplanation,
    preloadCreateSessionSheet,
    preloadDecideSessionSheet,
    preloadEditSessionSheet,
    profilePublicDisclosure,
    registerCreateContent,
    registerDecideContent,
    registerEditContent,
    sessionFormSheetRuntime,
  } = dependencies);
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
  if (!Number.isInteger(slotsMissing) || slotsMissing < 1 || slotsMissing > 3)
    errors.slotsMissing = "缺額請填 1 到 3 位。";
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

// 建局表單只提供三種；「對拉」的語意由「練球」涵蓋。
const CREATE_SESSION_PLAY_TYPES = ["單打", "雙打", "練球"];

const PLAY_TYPE_HINT = "單打｜一對一。雙打｜二對二。練球｜餵球、對拉、發球等不計分的練習。";

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

const CREATE_TIME_MIN_MINUTES = 360;

// 06:00(dc bumpTime 邊界)
const CREATE_TIME_MAX_MINUTES = 1320;

// 22:00 — 抽取規格明白指出不是 21:45
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

export function taipeiDateValue(value, now = new Date()) {
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
    candidateCourtIds: isCandidate ? Object.keys(form.candCourts).filter((id) => form.candCourts[id]) : [],
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

export function createSessionDonePresentation(value, result, courts) {
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

/** 開球局全螢幕流程(批 D5):計分板視覺,含成功頁;大量複用 D1/D4 語彙。 */
export function openCreateSessionSheet({
  courts = [],
  courtsReady = true,
  onClose = () => {},
  onSubmit = async () => {},
  onViewMySessions = () => {},
  toast = () => {},
} = {}) {
  if (!lazyMounts.createSession) {
    return deferSurfaceOpen({
      id: "session-create-modal",
      label: "開球局",
      className: "create-v2",
      load: preloadCreateSessionSheet,
      methods: ["setCourts"],
      onClose,
      open: () => openCreateSessionSheet({ courts, courtsReady, onClose, onSubmit, onViewMySessions, toast }),
    });
  }
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

  content = lazyMounts.createSession(mounted.surface, {
    bumpTime: sessionFormSheetRuntime.bumpCreateTimeMinutes,
    canPublish: sessionFormSheetRuntime.createSessionFormCanPublish,
    candidateWindow: sessionFormSheetRuntime.createCandidateWindowLocal,
    clock: sessionFormSheetRuntime.taipeiClock,
    config: {
      bands: CREATE_NTRP_BANDS,
      dateChips: CREATE_DATE_CHIP_KEYS.map((key) => ({ key, label: createDateChipLabel(key, now()) })),
      ntrpExplanation: ntrpScaleExplanation,
      playTypeHint: PLAY_TYPE_HINT,
      playTypes: CREATE_SESSION_PLAY_TYPES,
      profileDisclosure: profilePublicDisclosure,
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
  registerCreateContent(mounted, content);

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
  if (!lazyMounts.decideSession) {
    return deferSurfaceOpen({
      id: "session-decision-sheet",
      label: "定案場地與時間",
      load: preloadDecideSessionSheet,
      methods: ["setCourts", "setTerminal"],
      onClose,
      open: () => openDecideSessionSheet(session, { courts, courtsReady, onClose, onDecide }),
    });
  }
  const candidateIds = new Set((session?.candidateCourtIds ?? []).map(String));
  const unavailable = !isUndecidedCandidate(session);
  const mounted = mountSheet({
    id: "session-decision-sheet",
    label: "定案場地與時間",
    onClose,
    html: "",
  });
  const content = lazyMounts.decideSession(mounted.surface, {
    candidateIds,
    onClose: () => mounted.close(),
    onDecide: (event) => decide(event),
    rangeEndLocal: taipeiDateTimeLocalValue(session?.rangeEnd, { includeMilliseconds: true }),
    startAtLocal: taipeiDateTimeLocalValue(session?.startAt, { includeMilliseconds: true }),
    unavailable,
  });
  registerDecideContent(mounted, content);
  const controls = mounted.root.querySelector("[data-decision-controls]");
  const terminal = mounted.root.querySelector("[data-decision-terminal]");
  const error = mounted.root.querySelector("[data-decision-error]");
  const timeInput = mounted.root.querySelector("[data-testid='session-decision-time']");
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
        error.textContent = sessionActionMessage(decisionError, "定案失敗，請稍後再試。");
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
    // React owns the button/status markup now; `disabled` stays imperative so a
    // refresh during an in-flight decide reproduces the legacy authoritative
    // state, and runAsyncAction keeps being the only other writer.
    content.setCourts(availableCourts, { ready: courtOptionsReady });
    buttons().forEach((button) => {
      button.disabled = deciding;
    });
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
  if (!lazyMounts.editSession) {
    return deferSurfaceOpen({
      id: "session-edit-sheet",
      label: "編輯球局",
      className: "create-session-sheet",
      load: preloadEditSessionSheet,
      methods: ["setCourts"],
      onClose,
      open: () => openEditSessionSheet(session, { courts, courtsReady, onClose, onSubmit }),
    });
  }
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

  content = lazyMounts.editSession(mounted.surface, {
    courts: sessionFormSheetRuntime.taipeiCourts(courts),
    courtsReady: Boolean(courtsReady),
    hasOptionalValues,
    ntrpExplanation: ntrpScaleExplanation,
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
    playTypes: session.playType === "對拉" ? [...CREATE_SESSION_PLAY_TYPES, "對拉"] : CREATE_SESSION_PLAY_TYPES,
    session,
    startAtLocal: sessionFormSheetRuntime.taipeiDateTimeLocalValue(session.startAt, {
      includeMilliseconds: true,
    }),
  });
  registerEditContent(mounted, content);

  const setCourts = (nextCourts, { ready = true } = {}) => {
    content.setCourts(sessionFormSheetRuntime.taipeiCourts(nextCourts), { ready: Boolean(ready) });
  };

  return { ...mounted, setCourts };
}
