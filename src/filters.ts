import type { SessionSummary } from "./domainTypes.ts";
import { distanceMeters, isJoinableSession, isUndecidedCandidate } from "./sessionCriteria.ts";
import { isTaipeiWeekend, taipeiDateKey, validDate } from "./taipeiTime.ts";

export { isJoinableSession } from "./sessionCriteria.ts";

interface Band {
  key: string;
  label: string;
  min: number;
  max: number;
}

interface FilterState {
  dateKey: string | null;
  band: string;
  instantOnly: boolean;
  types: Set<string>;
  districts: Set<string>;
}

interface FilterStateInput {
  dateKey?: unknown;
  band?: unknown;
  instantOnly?: unknown;
  types?: unknown;
  districts?: unknown;
}

interface CourtInput {
  id?: unknown;
}

interface LocationInput {
  lat?: unknown;
  lng?: unknown;
}

type SessionInput = Partial<SessionSummary>;
type FilterDateInput = Parameters<typeof validDate>[0];

const DAY_MS = 24 * 60 * 60 * 1000;

// 批 D4a(v2 篩選改版):band 定義改抄 dc.html data.js 逐字值(min/max 含 all/pro 的
// 有限哨兵 0/9,取代舊的 ±Infinity)。標籤空白/dash 亦照 dc 抄——"3.0–4.0"／
// "4.0–5.0" 不留前後空格,與舊版 "3.0 – 4.0" 不同,依批次決策 3(語意不等價)全面改字。
export const BANDS = [
  { key: "all", label: "全部", min: 0, max: 9 },
  { key: "lo", label: "≤ 3.0", min: 0, max: 3 },
  { key: "mid", label: "3.0–4.0", min: 3, max: 4 },
  { key: "hi", label: "4.0–5.0", min: 4, max: 5 },
  { key: "pro", label: "5.0 +", min: 5, max: 9 },
] satisfies Band[];

// 批 D4a:v2 五欄篩選模型。「場地型 venueTypes」「指定球場 courtId」「日期 date
// input」三組退場,district 單選改 districts 多選,新增 dateKey 列舉與 instantOnly
// 布林。DEFAULT_FILTER_STATE 仍是全站唯一預設來源(sessionController/sessionViews
// 都從這裡衍生自己的 clone)。
export const DEFAULT_FILTER_STATE = {
  dateKey: null,
  band: "all",
  instantOnly: false,
  types: new Set<string>(),
  districts: new Set<string>(),
} satisfies FilterState;

function selectedTypes(types: unknown): Set<unknown> {
  if (types instanceof Set) return types;
  return new Set(Array.isArray(types) ? types : []);
}

/**
 * Filter badge count. Product decision (batch D4a): the badge only reflects
 * the two multi-select dimensions (打法 types、行政區 districts), summed as
 * "how many individual chips are selected" — not a per-dimension "is this
 * field active" flag. Picking a dateKey, a non-"all" band, or instantOnly
 * does NOT move this number even though it changes the visible results; see
 * isDefaultFilters below for the "is any filter active at all" question.
 */
export function countActiveFilters(filters: unknown) {
  if (filters == null || typeof filters !== "object") return 0;
  return (
    selectedTypes((filters as FilterStateInput).types).size +
    selectedTypes((filters as FilterStateInput).districts).size
  );
}

/**
 * Whether filters differ from DEFAULT_FILTER_STATE along ANY dimension,
 * including dateKey/band/instantOnly. This intentionally does NOT reduce to
 * countActiveFilters(filters) === 0 (unlike the pre-D4a implementation):
 * choosing "週末" or "5.0 +" alone must still surface a "reset filters"
 * affordance in the empty-state UI even though it never moves the badge.
 */
export function isDefaultFilters(filters: unknown) {
  if (filters == null || typeof filters !== "object") return true;
  return (
    ((filters as FilterStateInput).dateKey ?? null) === DEFAULT_FILTER_STATE.dateKey &&
    ((filters as FilterStateInput).band || "all") === DEFAULT_FILTER_STATE.band &&
    Boolean((filters as FilterStateInput).instantOnly) === DEFAULT_FILTER_STATE.instantOnly &&
    countActiveFilters(filters) === 0
  );
}

function asFiniteNumber(value: unknown) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function selectedTypesSet(types: unknown) {
  return selectedTypes(types);
}

function matchesBand(session: SessionInput, bandKey: unknown) {
  if (!bandKey || bandKey === "all") return true;
  const band = BANDS.find((candidate) => candidate.key === bandKey);
  if (!band) return true;

  const sessionMin = asFiniteNumber(session.ntrpMin);
  const sessionMax = asFiniteNumber(session.ntrpMax);
  // A missing interval is deliberately inclusive: the server permits it and
  // the UI must not silently hide a session whose host did not constrain NTRP.
  if (sessionMin == null || sessionMax == null) return true;
  // dc.html 的重疊判斷是開區間(s.nMax>b.min && s.nMin<b.max),與舊版的閉區間
  // (>=/<=)不等價:一場 NTRP 剛好落在兩個相鄰 band 邊界上的球局，舊版兩個 band
  // 都會命中，新版兩個都不命中。已改採 dc 逐字公式；邊界行為差異見批次回報。
  return sessionMax > band.min && sessionMin < band.max;
}

function matchesDateKey(session: SessionInput, dateKey: unknown, now: FilterDateInput) {
  if (!dateKey) return true;
  if (dateKey === "weekend") return isTaipeiWeekend(session.startAt);
  const reference = validDate(now) ?? new Date();
  const referenceDate = dateKey === "tomorrow" ? new Date(reference.getTime() + DAY_MS) : reference;
  const expectedKey = taipeiDateKey(referenceDate);
  return expectedKey != null && taipeiDateKey(session.startAt) === expectedKey;
}

function matchesInstantOnly(session: SessionInput, instantOnly: unknown) {
  return !instantOnly || String(session.joinMode) === "instant";
}

function matchesTypes(session: SessionInput, types: unknown) {
  const chosen = selectedTypesSet(types);
  return chosen.size === 0 || chosen.has(session.playType);
}

function matchesDistricts(session: SessionInput, districts: unknown) {
  const chosen = selectedTypesSet(districts);
  return chosen.size === 0 || chosen.has(session.courtDistrict);
}

const NOW_START_DISCOVERY_WINDOW_MS = 2 * 60 * 60 * 1000;

function isDiscoverableSession(session: SessionInput, now: FilterDateInput) {
  const startAt = validDate(session.startAt);
  const current = validDate(now) ?? new Date();
  const undecidedCandidate = isUndecidedCandidate(session);
  return (
    Boolean(startAt) &&
    (undecidedCandidate
      ? startAt!.getTime() > current.getTime()
      : startAt!.getTime() > current.getTime() - NOW_START_DISCOVERY_WINDOW_MS) &&
    (session.status === "open" || session.status === "full")
  );
}

/**
 * Filter public SessionSummary rows without changing their source order.
 * Dates are compared in Asia/Taipei so date-based chips do not flip a
 * session around midnight in the viewer's local browser timezone.
 */
export function filterSessions(
  sessions: unknown,
  filters: FilterStateInput | null | undefined = DEFAULT_FILTER_STATE,
  now: FilterDateInput = new Date()
) {
  const source: SessionInput[] = Array.isArray(sessions) ? sessions : [];
  const state = filters ?? DEFAULT_FILTER_STATE;

  return source.filter(
    (session) =>
      isDiscoverableSession(session, now) &&
      matchesDateKey(session, state.dateKey, now) &&
      matchesBand(session, state.band) &&
      matchesInstantOnly(session, state.instantOnly) &&
      matchesTypes(session, state.types) &&
      matchesDistricts(session, state.districts)
  );
}

function compareStartAt(left: SessionInput, right: SessionInput) {
  const leftTime = validDate(left.startAt)?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightTime = validDate(right.startAt)?.getTime() ?? Number.POSITIVE_INFINITY;
  return leftTime - rightTime;
}

export function joinableSessionCount(sessions: unknown) {
  return (Array.isArray(sessions) ? sessions : []).filter((session) => isJoinableSession(session)).length;
}

function isOngoingSessionWithVacancy(session: SessionInput | null | undefined, now: FilterDateInput) {
  const startAt = validDate(session?.startAt);
  const current = validDate(now) ?? new Date();
  const slotsRemaining = asFiniteNumber(session?.slotsRemaining);
  return (
    Boolean(startAt) &&
    startAt! <= current &&
    slotsRemaining != null &&
    slotsRemaining > 0 &&
    String(session?.status).toLowerCase() === "open"
  );
}

function sessionDistanceMeters(origin: LocationInput, session: SessionInput, courts: CourtInput[]) {
  if (!isUndecidedCandidate(session)) return distanceMeters(origin, session);
  const candidateIds = new Set((session?.candidateCourtIds ?? []).map(String));
  const candidateDistances = courts
    .filter((court) => candidateIds.has(String(court.id)))
    .map((court) => distanceMeters(origin, court))
    .filter(Number.isFinite);
  return candidateDistances.length ? Math.min(...candidateDistances) : distanceMeters(origin, session);
}

function validLocation(location: unknown) {
  const lat = asFiniteNumber((location as LocationInput | null | undefined)?.lat);
  const lng = asFiniteNumber((location as LocationInput | null | undefined)?.lng);
  return lat == null || lng == null ? null : { lat, lng };
}

/**
 * Return a new drawer list. Location is used only for this in-memory sort;
 * it is never persisted on a session or written to any browser storage.
 */
export function sortSessionsForDrawer(
  sessions: unknown,
  userLocation: unknown = null,
  now: FilterDateInput = new Date(),
  courts: CourtInput[] = []
) {
  const source: SessionInput[] = Array.isArray(sessions) ? sessions : [];
  const location = validLocation(userLocation);
  // 滿員局沉底(2026-08-17 拍板「降級顯示」),可加入的局中「進行中且有缺額」優先。
  const comparePriority = (left: SessionInput, right: SessionInput) =>
    Number(isJoinableSession(right)) - Number(isJoinableSession(left)) ||
    Number(isOngoingSessionWithVacancy(right, now)) - Number(isOngoingSessionWithVacancy(left, now));

  if (!location) return [...source].sort((left, right) => comparePriority(left, right) || compareStartAt(left, right));

  return source
    .map((session, index) => ({ session, index, distance: sessionDistanceMeters(location, session, courts) }))
    .sort((left, right) => {
      const priorityDifference = comparePriority(left.session, right.session);
      if (priorityDifference) return priorityDifference;
      const distanceDifference = left.distance - right.distance;
      if (distanceDifference) return distanceDifference;
      const startDifference = compareStartAt(left.session, right.session);
      return startDifference || left.index - right.index;
    })
    .map(({ session }) => session);
}
