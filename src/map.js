import { GOOGLE_MAPS_MAP_ID, MAP_CENTER, MAP_ZOOM, TAIPEI_CITY_BOUNDS } from "./config.js";
import {
  advancedMarkerContent,
  candidateSessionPin,
  courtPin,
  playerPin,
  sessionClusterPin,
  sessionPin,
  userLocationPin,
} from "./pins.js";
import { isSessionFull, isUndecidedCandidate } from "./sessionCriteria.js";
import { taipeiClock, taipeiHourRange } from "./taipeiTime.js";

let loadPromise = null;
let runtimeGoogle = null;
let runtimeMap = null;
let userMarker = null;
let AdvancedMarkerElement = null;
const advancedMarkerMaps = new WeakSet();

const SAGE_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#edf1ec" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#52667a" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#c8dced" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ visibility: "on" }, { color: "#dceccf" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
];

/** Load Maps once. Authentication failures intentionally leave discovery usable. */
export function loadGoogleMaps(apiKey, onAuthFailure = () => {}) {
  window.gm_authFailure = onAuthFailure;
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const resolveWithMarkerLibrary = () => {
      const google = window.google;
      if (!GOOGLE_MAPS_MAP_ID || typeof google?.maps?.importLibrary !== "function") {
        resolve(google);
        return;
      }
      Promise.resolve(google.maps.importLibrary("marker"))
        .then((library) => {
          AdvancedMarkerElement = library?.AdvancedMarkerElement ?? null;
          resolve(google);
        })
        .catch(() => {
          AdvancedMarkerElement = null;
          resolve(google);
        });
    };
    if (window.google?.maps) {
      resolveWithMarkerLibrary();
      return;
    }
    window.__onGoogleMapsReady = () => {
      delete window.__onGoogleMapsReady;
      resolveWithMarkerLibrary();
    };
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({
      key: apiKey,
      v: "quarterly",
      loading: "async",
      language: "zh-TW",
      region: "TW",
      callback: "__onGoogleMapsReady",
    })}`;
    script.async = true;
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("Google Maps 載入失敗"));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}

export function createMap(google, element) {
  runtimeGoogle = google;
  runtimeMap = new google.maps.Map(element, {
    center: MAP_CENTER,
    zoom: MAP_ZOOM,
    disableDefaultUI: true,
    clickableIcons: false,
    ...(GOOGLE_MAPS_MAP_ID ? { mapId: GOOGLE_MAPS_MAP_ID } : { styles: SAGE_STYLES }),
  });
  if (GOOGLE_MAPS_MAP_ID && AdvancedMarkerElement) advancedMarkerMaps.add(runtimeMap);
  return runtimeMap;
}

function detachMarkers(markers) {
  markers.forEach((marker) => {
    if (typeof marker?.setMap === "function") marker.setMap(null);
    else if (marker) marker.map = null;
  });
}

function createMarker(google, map, { onClick, pin, position, title, zIndex }) {
  if (AdvancedMarkerElement && advancedMarkerMaps.has(map)) {
    const marker = new AdvancedMarkerElement({
      content: advancedMarkerContent(pin),
      gmpClickable: Boolean(onClick),
      map,
      position,
      title,
      zIndex,
    });
    marker.anchorLeft = `${-pin.icon.anchor.x}px`;
    marker.anchorTop = `${-pin.icon.anchor.y}px`;
    if (onClick) marker.addEventListener("gmp-click", onClick);
    return marker;
  }

  const marker = new google.maps.Marker({
    map,
    position,
    icon: pin.icon,
    label: pin.label,
    title,
    zIndex,
    optimized: false,
  });
  if (onClick) marker.addListener("click", onClick);
  return marker;
}

function plainBounds(bounds) {
  if (!bounds?.getSouthWest || !bounds?.getNorthEast) return null;
  const southWest = bounds.getSouthWest();
  const northEast = bounds.getNorthEast();
  const south = Number(southWest?.lat?.());
  const west = Number(southWest?.lng?.());
  const north = Number(northEast?.lat?.());
  const east = Number(northEast?.lng?.());
  if (![south, west, north, east].every(Number.isFinite)) return null;
  return { south, west, north, east };
}

export function getMapBounds(map = runtimeMap) {
  return plainBounds(map?.getBounds?.());
}

export function subscribeToMapIdle(map, callback) {
  return map?.addListener?.("idle", callback);
}

/** Group public SessionSummary rows by court for single and aggregate session pins. */
export function groupSessionsByCourt(courts = [], sessions = []) {
  const courtIds = new Set(courts.map((court) => String(court.id)));
  const byCourtId = new Map();
  const undecidedByCourtId = new Map();
  for (const session of sessions) {
    const undecidedCandidate = isUndecidedCandidate(session);
    const placementIds = undecidedCandidate
      ? [...new Set((session?.candidateCourtIds ?? []).map(String))]
      : [session?.courtId];
    for (const courtId of placementIds) {
      const key = String(courtId);
      if (!courtIds.has(key)) continue;
      const current = byCourtId.get(key) ?? [];
      current.push(session);
      byCourtId.set(key, current);
      if (undecidedCandidate) {
        const undecided = undecidedByCourtId.get(key) ?? [];
        undecided.push(session.sessionId);
        undecidedByCourtId.set(key, undecided);
      }
    }
  }
  return courts
    .filter((court) => byCourtId.has(String(court.id)))
    .map((court) => ({
      court,
      sessions: byCourtId.get(String(court.id)),
      undecidedCandidateSessionIds: undecidedByCourtId.get(String(court.id)) ?? [],
    }));
}

/** Replace visible session markers while preserving the lower-priority court base layer. */
export function renderSessionPins(
  google,
  map,
  groups,
  { onSession = () => {}, onCluster = () => {} } = {},
  oldMarkers = []
) {
  detachMarkers(oldMarkers);
  return groups.map(({ court, sessions, undecidedCandidateSessionIds = [] }) => {
    const multiple = sessions.length >= 2;
    const undecided =
      !multiple && undecidedCandidateSessionIds.some((id) => String(id) === String(sessions[0]?.sessionId));
    const single = sessions[0];
    const startTime = new Date(single?.startAt ?? "").getTime();
    const ongoing = !undecided && Number.isFinite(startTime) && startTime <= Date.now();
    const full = isSessionFull(single);
    const pin = multiple
      ? sessionClusterPin(google, sessions.length)
      : undecided
        ? candidateSessionPin(google, { range: taipeiHourRange(single?.startAt, single?.rangeEnd) })
        : sessionPin(google, {
            time: taipeiClock(single?.startAt),
            instant: single?.joinMode === "instant",
            ongoing,
            full,
          });
    return createMarker(google, map, {
      onClick: () => (multiple ? onCluster(court, sessions) : onSession(sessions[0].sessionId)),
      pin,
      position: { lat: court.lat, lng: court.lng },
      title: multiple
        ? `球局 · ${court.name} · ${sessions.length} 場`
        : `球局 · ${court.name}${undecided ? " · 未定" : ""}`,
      zIndex: multiple ? 40 : 30,
    });
  });
}

/** Render stable base-court pins beneath session pins. */
export function renderCourtBasePins(google, map, courts = [], onCourt = () => {}, oldMarkers = []) {
  detachMarkers(oldMarkers);
  return courts.map((court) => {
    const pin = courtPin(google);
    return createMarker(google, map, {
      onClick: () => onCourt(court),
      pin,
      position: { lat: court.lat, lng: court.lng },
      title: `球場 ${court.name}`,
      zIndex: 10,
    });
  });
}

/** Replace only reciprocal online markers, leaving session and base-court layers untouched. */
export function renderPlayerPins(google, map, groups = [], onCourtPlayers = () => {}, oldMarkers = []) {
  detachMarkers(oldMarkers);
  return groups.map(({ court, players, presenceCount = 0 }) => {
    const pin = playerPin(google, players.length, presenceCount);
    return createMarker(google, map, {
      onClick: () => onCourtPlayers(court, players),
      pin,
      position: { lat: court.lat, lng: court.lng },
      title: `在線 · ${court.name} · ${players.length} 人`,
      zIndex: 20,
    });
  });
}

function boundsAround({ lat, lng }, radiusMeters) {
  const latitudeDelta = radiusMeters / 111_320;
  const longitudeDelta = radiusMeters / (111_320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return {
    south: lat - latitudeDelta,
    west: lng - longitudeDelta,
    north: lat + latitudeDelta,
    east: lng + longitudeDelta,
  };
}

/**
 * Keep location only in the Maps runtime: center an approximate radius and
 * update an intentionally coordinate-free marker title.
 */
export function setUserLocation({ lat, lng }, radiusMeters) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  const radius = Number(radiusMeters);
  if (
    !runtimeGoogle?.maps ||
    !runtimeMap ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(radius)
  ) {
    return null;
  }
  const bounds = boundsAround({ lat: latitude, lng: longitude }, radius);
  const sw = { lat: bounds.south, lng: bounds.west };
  const ne = { lat: bounds.north, lng: bounds.east };
  runtimeMap.fitBounds(new runtimeGoogle.maps.LatLngBounds(sw, ne));
  if (!userMarker) {
    const pin = userLocationPin(runtimeGoogle);
    userMarker = createMarker(runtimeGoogle, runtimeMap, {
      pin,
      position: { lat: latitude, lng: longitude },
      title: "你",
      zIndex: 50,
    });
  } else {
    const position = { lat: latitude, lng: longitude };
    if (typeof userMarker.setPosition === "function") userMarker.setPosition(position);
    else userMarker.position = position;
    if (typeof userMarker.setMap === "function") userMarker.setMap(runtimeMap);
    else userMarker.map = runtimeMap;
  }
  return bounds;
}

/** 批 D3:右下控制直欄的 ±1 級縮放(dc L82-83 的 +/− 對應)。 */
export function zoomMapBy(delta) {
  if (!runtimeMap?.getZoom || !runtimeMap?.setZoom) return null;
  const current = Number(runtimeMap.getZoom());
  if (!Number.isFinite(current)) return null;
  const next = Math.min(20, Math.max(8, current + delta));
  runtimeMap.setZoom(next);
  return next;
}

/** Fit the public Taipei City discovery bounds without exposing a location. */
export function fitTaipeiBounds() {
  if (!runtimeGoogle?.maps || !runtimeMap) return null;
  runtimeMap.fitBounds(
    new runtimeGoogle.maps.LatLngBounds(
      { lat: TAIPEI_CITY_BOUNDS.south, lng: TAIPEI_CITY_BOUNDS.west },
      { lat: TAIPEI_CITY_BOUNDS.north, lng: TAIPEI_CITY_BOUNDS.east }
    )
  );
  return { ...TAIPEI_CITY_BOUNDS };
}
