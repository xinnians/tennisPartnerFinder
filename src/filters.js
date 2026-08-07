import { TAIPEI_TIME_ZONE } from "./config.js";

// Selected bands are ranges because a session advertises an acceptable NTRP
// interval, not one host rating. Endpoints intentionally overlap.
export const BANDS = [
  { key: "all", label: "全部" },
  { key: "lo", label: "≤ 3.0", min: Number.NEGATIVE_INFINITY, max: 3 },
  { key: "mid", label: "3.0 – 4.0", min: 3, max: 4 },
  { key: "hi", label: "4.0 – 5.0", min: 4, max: 5 },
  { key: "pro", label: "5.0 +", min: 5, max: Number.POSITIVE_INFINITY },
];

export const DEFAULT_FILTER_STATE = {
  district: "",
  courtId: null,
  date: null,
  band: "all",
  types: new Set(),
  venueTypes: new Set(),
};

/**
 * Count the number of active filters in a filters object.
 * Each of six filter dimensions (district, courtId, date, band, types, venueTypes)
 * contributes 1 to the count if it differs from DEFAULT_FILTER_STATE.
 * Non-object filters (null/undefined/other) return 0.
 *
 * This function is the source of truth for filter state comparison.
 * isDefaultFilters is implemented as countActiveFilters(filters) === 0
 * to avoid logic duplication between the two functions.
 */
export function countActiveFilters(filters) {
  if (filters == null || typeof filters !== "object") return 0;

  let count = 0;

  // district: active if non-empty string
  if (filters.district !== DEFAULT_FILTER_STATE.district) count++;

  // courtId: active if not null
  if (filters.courtId !== DEFAULT_FILTER_STATE.courtId) count++;

  // date: active if not null
  if (filters.date !== DEFAULT_FILTER_STATE.date) count++;

  // band: active if not "all"
  if (filters.band !== DEFAULT_FILTER_STATE.band) count++;

  // types: active if Set is non-empty
  if (selectedTypes(filters.types).size > 0) count++;

  // venueTypes: active if Set is non-empty
  if (selectedTypes(filters.venueTypes).size > 0) count++;

  return count;
}

/**
 * Compare a filters object field-by-field against DEFAULT_FILTER_STATE.
 * A non-object `filters` (null/undefined/other) is treated as "no filters applied"
 * and returns true, matching the meaning of an absent filters state everywhere
 * else in this module.
 *
 * Implementation: returns true iff countActiveFilters(filters) === 0,
 * ensuring both functions stay synchronized.
 */
export function isDefaultFilters(filters) {
  return countActiveFilters(filters) === 0;
}

const NOW_START_DISCOVERY_WINDOW_MS = 2 * 60 * 60 * 1000;

function asFiniteNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toDate(value) {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getTaipeiDateKey(value) {
  const date = toDate(value);
  if (!date) return null;

  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TAIPEI_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function selectedDateKey(value) {
  if (value == null || value === "") return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return getTaipeiDateKey(value);
}

function selectedTypes(types) {
  if (types instanceof Set) return types;
  return new Set(Array.isArray(types) ? types : []);
}

function matchesBand(session, bandKey) {
  if (!bandKey || bandKey === "all") return true;
  const band = BANDS.find((candidate) => candidate.key === bandKey);
  if (!band || band.min == null || band.max == null) return true;

  const sessionMin = asFiniteNumber(session.ntrpMin);
  const sessionMax = asFiniteNumber(session.ntrpMax);
  // A missing interval is deliberately inclusive: the server permits it and
  // the UI must not silently hide a session whose host did not constrain NTRP.
  if (sessionMin == null || sessionMax == null) return true;
  return sessionMax >= band.min && sessionMin <= band.max;
}

function matchesDistrict(session, district) {
  return !district || district === "all" || session.courtDistrict === district;
}

function matchesCourt(session, courtId) {
  return courtId == null || courtId === "" || String(session.courtId) === String(courtId);
}

function matchesDate(session, date) {
  const expected = selectedDateKey(date);
  return !expected || getTaipeiDateKey(session.startAt) === expected;
}

function matchesTypes(session, types) {
  const chosen = selectedTypes(types);
  return chosen.size === 0 || chosen.has(session.playType);
}

function matchesVenueTypes(session, venueTypes) {
  const chosen = selectedTypes(venueTypes);
  return chosen.size === 0 || chosen.has(String(session.venueType ?? "booked"));
}

function isDiscoverableSession(session, now) {
  const startAt = toDate(session.startAt);
  const current = toDate(now) ?? new Date();
  const undecidedCandidate = String(session?.venueType) === "candidates" && !Boolean(session?.decidedAt);
  return (
    Boolean(startAt) &&
    (undecidedCandidate
      ? startAt.getTime() > current.getTime()
      : startAt.getTime() > current.getTime() - NOW_START_DISCOVERY_WINDOW_MS) &&
    (session.status === "open" || session.status === "full")
  );
}

/**
 * Filter public SessionSummary rows without changing their source order.
 * Dates are compared in Asia/Taipei so a date picker does not flip a session
 * around midnight in the viewer's local browser timezone.
 */
export function filterSessions(sessions, filters = DEFAULT_FILTER_STATE, now = new Date()) {
  const source = Array.isArray(sessions) ? sessions : [];
  const state = filters ?? DEFAULT_FILTER_STATE;

  return source.filter(
    (session) =>
      isDiscoverableSession(session, now) &&
      matchesDistrict(session, state.district) &&
      matchesCourt(session, state.courtId) &&
      matchesDate(session, state.date) &&
      matchesBand(session, state.band) &&
      matchesTypes(session, state.types) &&
      matchesVenueTypes(session, state.venueTypes)
  );
}

function compareStartAt(left, right) {
  const leftTime = toDate(left.startAt)?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightTime = toDate(right.startAt)?.getTime() ?? Number.POSITIVE_INFINITY;
  return leftTime - rightTime;
}

function isOngoingSessionWithVacancy(session, now) {
  const startAt = toDate(session?.startAt);
  const current = toDate(now) ?? new Date();
  const slotsRemaining = asFiniteNumber(session?.slotsRemaining);
  return (
    Boolean(startAt) &&
    startAt <= current &&
    slotsRemaining != null &&
    slotsRemaining > 0 &&
    String(session?.status).toLowerCase() === "open"
  );
}

function distanceMeters(origin, destination) {
  const latitude = asFiniteNumber(destination.courtLat ?? destination.lat);
  const longitude = asFiniteNumber(destination.courtLng ?? destination.lng);
  if (latitude == null || longitude == null) return Number.POSITIVE_INFINITY;

  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;
  const deltaLatitude = toRadians(latitude - origin.lat);
  const deltaLongitude = toRadians(longitude - origin.lng);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(origin.lat)) * Math.cos(toRadians(latitude)) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sessionDistanceMeters(origin, session, courts) {
  if (session?.venueType !== "candidates" || Boolean(session?.decidedAt)) return distanceMeters(origin, session);
  const candidateIds = new Set((session?.candidateCourtIds ?? []).map(String));
  const candidateDistances = courts
    .filter((court) => candidateIds.has(String(court.id)))
    .map((court) => distanceMeters(origin, court))
    .filter(Number.isFinite);
  return candidateDistances.length ? Math.min(...candidateDistances) : distanceMeters(origin, session);
}

function validLocation(location) {
  const lat = asFiniteNumber(location?.lat);
  const lng = asFiniteNumber(location?.lng);
  return lat == null || lng == null ? null : { lat, lng };
}

/**
 * Return a new drawer list. Location is used only for this in-memory sort;
 * it is never persisted on a session or written to any browser storage.
 */
export function sortSessionsForDrawer(sessions, userLocation = null, now = new Date(), courts = []) {
  const source = Array.isArray(sessions) ? sessions : [];
  const location = validLocation(userLocation);
  const comparePriority = (left, right) =>
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
