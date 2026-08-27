interface SessionCriteriaInput {
  courtLat?: unknown;
  courtLng?: unknown;
  decidedAt?: unknown;
  lat?: unknown;
  lng?: unknown;
  slotsRemaining?: unknown;
  status?: unknown;
  venueType?: unknown;
}

type OptionalSessionCriteriaInput = SessionCriteriaInput | null | undefined;

function finiteCoordinate(value: unknown) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function latitude(point: unknown) {
  return finiteCoordinate(
    (point as OptionalSessionCriteriaInput)?.courtLat ?? (point as OptionalSessionCriteriaInput)?.lat
  );
}

function longitude(point: unknown) {
  return finiteCoordinate(
    (point as OptionalSessionCriteriaInput)?.courtLng ?? (point as OptionalSessionCriteriaInput)?.lng
  );
}

export function isUndecidedCandidate(session: unknown) {
  return (
    String((session as OptionalSessionCriteriaInput)?.venueType) === "candidates" &&
    !Boolean((session as OptionalSessionCriteriaInput)?.decidedAt)
  );
}

export function isSessionFull(session: unknown) {
  if (String((session as OptionalSessionCriteriaInput)?.status).toLowerCase() === "full") return true;
  return (
    (session as OptionalSessionCriteriaInput)?.slotsRemaining != null &&
    Number((session as OptionalSessionCriteriaInput)!.slotsRemaining) <= 0
  );
}

export function isJoinableSession(session: unknown) {
  return String((session as OptionalSessionCriteriaInput)?.status).toLowerCase() === "open" && !isSessionFull(session);
}

export function distanceMeters(left: unknown, right: unknown) {
  const lat1 = latitude(left);
  const lng1 = longitude(left);
  const lat2 = latitude(right);
  const lng2 = longitude(right);
  if ([lat1, lng1, lat2, lng2].some((value) => value == null)) return Number.POSITIVE_INFINITY;
  const radians = Math.PI / 180;
  const latitudeDelta = (lat2! - lat1!) * radians;
  const longitudeDelta = (lng2! - lng1!) * radians;
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(lat1! * radians) * Math.cos(lat2! * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
