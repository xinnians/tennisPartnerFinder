import { MAP_CENTER, MAP_ZOOM, TAIPEI_CITY_BOUNDS } from "./config.js";
import { courtPin, sessionClusterPin, sessionPin, userLocationPin } from "./pins.js";

let loadPromise = null;
let runtimeGoogle = null;
let runtimeMap = null;
let userMarker = null;

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
    if (window.google?.maps) {
      resolve(window.google);
      return;
    }
    window.__onGoogleMapsReady = () => {
      delete window.__onGoogleMapsReady;
      resolve(window.google);
    };
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({
      key: apiKey,
      v: "weekly",
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
    styles: SAGE_STYLES,
  });
  return runtimeMap;
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
  const byCourtId = new Map();
  for (const session of sessions) {
    const key = String(session.courtId);
    const current = byCourtId.get(key) ?? [];
    current.push(session);
    byCourtId.set(key, current);
  }
  return courts
    .filter((court) => byCourtId.has(String(court.id)))
    .map((court) => ({ court, sessions: byCourtId.get(String(court.id)) }));
}

/** Replace visible session markers while preserving the lower-priority court base layer. */
export function renderSessionPins(google, map, groups, { onSession = () => {}, onCluster = () => {} } = {}, oldMarkers = []) {
  oldMarkers.forEach((marker) => marker.setMap(null));
  return groups.map(({ court, sessions }) => {
    const multiple = sessions.length >= 2;
    const pin = multiple ? sessionClusterPin(google, sessions.length) : sessionPin(google, sessions[0]);
    const marker = new google.maps.Marker({
      map,
      position: { lat: court.lat, lng: court.lng },
      icon: pin.icon,
      label: pin.label,
      title: multiple ? `球局 · ${court.name} · ${sessions.length} 場` : `球局 · ${court.name}`,
      zIndex: multiple ? 40 : 30,
      // Legacy Marker needs a DOM-backed marker for reliable keyboard access.
      optimized: false,
    });
    marker.addListener("click", () => (multiple ? onCluster(court, sessions) : onSession(sessions[0].sessionId)));
    return marker;
  });
}

/** Render stable base-court pins beneath session pins. */
export function renderCourtBasePins(google, map, courts = [], onCourt = () => {}, oldMarkers = []) {
  oldMarkers.forEach((marker) => marker.setMap(null));
  return courts.map((court) => {
    const pin = courtPin(google);
    const marker = new google.maps.Marker({
      map,
      position: { lat: court.lat, lng: court.lng },
      icon: pin.icon,
      title: `球場 ${court.name}`,
      zIndex: 10,
      optimized: false,
    });
    marker.addListener("click", () => onCourt(court));
    return marker;
  });
}

function boundsAround({ lat, lng }, radiusMeters) {
  const latitudeDelta = radiusMeters / 111_320;
  const longitudeDelta = radiusMeters / (111_320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return { south: lat - latitudeDelta, west: lng - longitudeDelta, north: lat + latitudeDelta, east: lng + longitudeDelta };
}

/**
 * Keep location only in the Maps runtime: center an approximate radius and
 * update an intentionally coordinate-free marker title.
 */
export function setUserLocation({ lat, lng }, radiusMeters) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  const radius = Number(radiusMeters);
  if (!runtimeGoogle?.maps || !runtimeMap || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(radius)) {
    return null;
  }
  const bounds = boundsAround({ lat: latitude, lng: longitude }, radius);
  const sw = { lat: bounds.south, lng: bounds.west };
  const ne = { lat: bounds.north, lng: bounds.east };
  runtimeMap.fitBounds(new runtimeGoogle.maps.LatLngBounds(sw, ne));
  if (!userMarker) {
    const pin = userLocationPin(runtimeGoogle);
    userMarker = new runtimeGoogle.maps.Marker({
      map: runtimeMap,
      position: { lat: latitude, lng: longitude },
      icon: pin.icon,
      title: "你",
      zIndex: 50,
      optimized: false,
    });
  } else {
    userMarker.setPosition?.({ lat: latitude, lng: longitude });
    userMarker.setMap?.(runtimeMap);
  }
  return bounds;
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
