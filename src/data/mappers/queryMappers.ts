import { DISCOVERY_WINDOW_DAYS, TAIPEI_CITY_BOUNDS } from "../../config.js";
import type { SessionSummary } from "../../domainTypes.ts";
import { asDate, asNumber } from "./valueMappers.ts";

const NOW_START_DISCOVERY_WINDOW_MS = 2 * 60 * 60 * 1000;

export interface MapBounds {
  east: number;
  north: number;
  south: number;
  west: number;
}

export interface DiscoveryQueryInput {
  bounds?: Partial<MapBounds> | null;
  startAfter?: unknown;
  startBefore?: unknown;
}

export interface DiscoveryQuery {
  bounds: MapBounds;
  startAfter: string;
  startBefore: string;
}

interface BoundedEntry {
  courtLat?: unknown;
  courtLng?: unknown;
}

function isoForQuery(value: unknown, fallback: Date): string {
  if (typeof value === "string" && asDate(value)) return value;
  if (value instanceof Date && asDate(value)) return value.toISOString();
  return fallback.toISOString();
}

function normalizedBounds(bounds: Partial<MapBounds> | null | undefined): MapBounds {
  const candidate = bounds ?? TAIPEI_CITY_BOUNDS;
  const south = asNumber(candidate.south);
  const west = asNumber(candidate.west);
  const north = asNumber(candidate.north);
  const east = asNumber(candidate.east);

  if (south == null || west == null || north == null || east == null || south > north || west > east) {
    return TAIPEI_CITY_BOUNDS;
  }

  return { south, west, north, east };
}

export function discoveryQuery(input: DiscoveryQueryInput = {}, now: unknown = new Date()): DiscoveryQuery {
  const currentTime = asDate(now) ?? new Date();
  const defaultStart = new Date(currentTime.getTime() - NOW_START_DISCOVERY_WINDOW_MS);
  const defaultEnd = new Date(currentTime.getTime() + DISCOVERY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return {
    bounds: normalizedBounds(input.bounds),
    startAfter: isoForQuery(input.startAfter, defaultStart),
    startBefore: isoForQuery(input.startBefore, defaultEnd),
  };
}

export function withinDiscoveryQuery(session: Partial<SessionSummary>, query: DiscoveryQuery): boolean | null {
  const lat = asNumber(session.courtLat);
  const lng = asNumber(session.courtLng);
  const startAt = asDate(session.startAt);
  const startAfter = asDate(query.startAfter);
  const startBefore = asDate(query.startBefore);
  return (
    lat != null &&
    lng != null &&
    startAt &&
    startAfter &&
    startBefore &&
    lat >= query.bounds.south &&
    lat <= query.bounds.north &&
    lng >= query.bounds.west &&
    lng <= query.bounds.east &&
    startAt > startAfter &&
    startAt < startBefore
  );
}

export function withinBounds(entry: BoundedEntry, bounds: MapBounds | null | undefined): boolean {
  if (!bounds) return true;
  const lat = asNumber(entry.courtLat);
  const lng = asNumber(entry.courtLng);
  return (
    lat != null && lng != null && lat >= bounds.south && lat <= bounds.north && lng >= bounds.west && lng <= bounds.east
  );
}
