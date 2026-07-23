const MINIMUM_INTERVAL_MS = 60 * 1000;
const MINIMUM_DISTANCE_METERS = 50;

function coordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function distanceMeters(left, right) {
  const lat1 = coordinate(left?.lat);
  const lng1 = coordinate(left?.lng);
  const lat2 = coordinate(right?.lat);
  const lng2 = coordinate(right?.lng);
  if ([lat1, lng1, lat2, lng2].some((value) => value == null)) return Number.POSITIVE_INFINITY;
  const radians = Math.PI / 180;
  const latitudeDelta = (lat2 - lat1) * radians;
  const longitudeDelta = (lng2 - lng1) * radians;
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function locationErrorKind(error) {
  return Number(error?.code) === 1 ? "denied" : "unavailable";
}

/**
 * Browser-only foreground tracker. Coordinates are retained only long enough
 * to apply the client-side throttle and are handed to the RPC, which snaps
 * them to a court before any database write.
 */
export function createPresenceTracker({ geolocation = globalThis.navigator?.geolocation, now = () => Date.now(), onError = () => {}, onPosition = async () => {} } = {}) {
  let watchId = null;
  let lastSubmission = null;

  async function receivePosition(position) {
    const point = {
      lat: coordinate(position?.coords?.latitude),
      lng: coordinate(position?.coords?.longitude),
    };
    if (point.lat == null || point.lng == null) return false;
    const timestamp = Number(now());
    const elapsed = lastSubmission ? timestamp - lastSubmission.at : Number.POSITIVE_INFINITY;
    const moved = lastSubmission ? distanceMeters(lastSubmission.point, point) : Number.POSITIVE_INFINITY;
    if (elapsed < MINIMUM_INTERVAL_MS && moved <= MINIMUM_DISTANCE_METERS) return false;
    await onPosition(point);
    lastSubmission = { at: timestamp, point };
    return true;
  }

  function start() {
    if (watchId != null) return true;
    if (!geolocation?.watchPosition) {
      onError("unsupported");
      return false;
    }
    watchId = geolocation.watchPosition(
      (position) => {
        void receivePosition(position).catch(() => onError("update-failed"));
      },
      (error) => onError(locationErrorKind(error)),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 }
    );
    return true;
  }

  function stop() {
    if (watchId == null) return;
    geolocation?.clearWatch?.(watchId);
    watchId = null;
    lastSubmission = null;
  }

  return { start, stop };
}

export { MINIMUM_DISTANCE_METERS, MINIMUM_INTERVAL_MS };
