import { TAIPEI_CITY_BOUNDS } from "../../config.ts";
import type { ControllerFilters, ControllerMapStatus, SessionControllerState } from "../../controllerContracts.ts";
import type { SessionSummary } from "../../domainTypes.ts";
import { DEFAULT_FILTER_STATE, filterSessions, sortSessionsForDrawer } from "../../filters.ts";
// eslint-disable-next-line no-restricted-imports -- 既有 discovery bounds 純型別尚無可由 JavaScript facade 匯出的 type barrel。
import type { MapBounds } from "../../data/mappers/queryMappers.ts";

type BoundsInput = Partial<Record<keyof MapBounds, unknown>> | null | undefined;
type DiscoveryState = Pick<
  SessionControllerState,
  "courts" | "discoveryStatus" | "filters" | "mapUnavailable" | "sessions" | "userLocation"
>;
const filterSessionRows = filterSessions as unknown as (
  sessions: SessionSummary[],
  filters: ControllerFilters,
  now?: Date
) => SessionSummary[];
const sortSessionRows = sortSessionsForDrawer as unknown as (
  sessions: SessionSummary[],
  userLocation: SessionControllerState["userLocation"],
  now?: Date,
  courts?: SessionControllerState["courts"]
) => SessionSummary[];

export function cloneFilters(): ControllerFilters {
  return {
    ...DEFAULT_FILTER_STATE,
    types: new Set(DEFAULT_FILTER_STATE.types),
    districts: new Set(DEFAULT_FILTER_STATE.districts),
  } as ControllerFilters;
}

export function cloneBounds(bounds: BoundsInput): MapBounds {
  const candidate = bounds ?? TAIPEI_CITY_BOUNDS;
  return {
    south: Number(candidate.south),
    west: Number(candidate.west),
    north: Number(candidate.north),
    east: Number(candidate.east),
  };
}

export function validBounds(bounds: BoundsInput): bounds is MapBounds {
  const values = [bounds?.south, bounds?.west, bounds?.north, bounds?.east].map(Number);
  return values.every(Number.isFinite) && values[0] <= values[2] && values[1] <= values[3];
}

function viewportCenter(bounds: BoundsInput) {
  if (!validBounds(bounds)) return null;
  return {
    lat: (Number(bounds.south) + Number(bounds.north)) / 2,
    lng: (Number(bounds.west) + Number(bounds.east)) / 2,
  };
}

function viewportSpan(bounds: BoundsInput) {
  if (!validBounds(bounds)) return null;
  return {
    lat: Number(bounds.north) - Number(bounds.south),
    lng: Number(bounds.east) - Number(bounds.west),
  };
}

/**
 * Google can report the post-fit viewport with padding, so expected idles
 * cannot use exact coordinate equality. Keep the center tight enough that a
 * real pan still wins, while accepting modest viewport expansion from fitBounds.
 */
export function representsExpectedViewport(actual: BoundsInput, expected: BoundsInput): boolean {
  const actualCenter = viewportCenter(actual);
  const expectedCenter = viewportCenter(expected);
  const actualSpan = viewportSpan(actual);
  const expectedSpan = viewportSpan(expected);
  if (!actualCenter || !expectedCenter || !actualSpan || !expectedSpan) return false;
  if (expectedSpan.lat <= 0 || expectedSpan.lng <= 0 || actualSpan.lat <= 0 || actualSpan.lng <= 0) return false;

  const latCenterTolerance = Math.max(0.001, Math.max(actualSpan.lat, expectedSpan.lat) * 0.05);
  const lngCenterTolerance = Math.max(0.001, Math.max(actualSpan.lng, expectedSpan.lng) * 0.05);
  const latScale = actualSpan.lat / expectedSpan.lat;
  const lngScale = actualSpan.lng / expectedSpan.lng;
  return (
    Math.abs(actualCenter.lat - expectedCenter.lat) <= latCenterTolerance &&
    Math.abs(actualCenter.lng - expectedCenter.lng) <= lngCenterTolerance &&
    latScale >= 0.5 &&
    latScale <= 2 &&
    lngScale >= 0.5 &&
    lngScale <= 2
  );
}

export function boundsContainSession(
  bounds: BoundsInput,
  session: Partial<SessionSummary> | null | undefined
): boolean {
  if (!validBounds(bounds)) return false;
  const lat = Number(session?.courtLat);
  const lng = Number(session?.courtLng);
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= Number(bounds.south) &&
    lat <= Number(bounds.north) &&
    lng >= Number(bounds.west) &&
    lng <= Number(bounds.east)
  );
}

export function selectVisibleSessions(state: DiscoveryState, now = new Date()): SessionSummary[] {
  return sortSessionRows(filterSessionRows(state.sessions, state.filters, now), state.userLocation, now, state.courts);
}

export function mapStatusForState(
  state: Pick<DiscoveryState, "discoveryStatus" | "mapUnavailable">
): ControllerMapStatus {
  if (state.mapUnavailable) return { kind: "warning", message: "地圖目前無法使用；你仍可瀏覽附近球局。" };
  if (state.discoveryStatus === "loading") return { kind: "loading", message: "正在載入球局資料…" };
  if (state.discoveryStatus === "error") return { kind: "error", message: "球局資料暫時無法載入。" };
  return { kind: "idle", message: "" };
}
