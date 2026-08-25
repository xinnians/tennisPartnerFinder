import { GOOGLE_MAPS_MAP_ID, MAP_CENTER, MAP_ZOOM, TAIPEI_CITY_BOUNDS } from "./config.js";
import {
  advancedMarkerContent,
  candidateSessionPin,
  courtPin,
  playerPin,
  sessionClusterPin,
  sessionPin,
  userLocationPin,
} from "./pins.ts";
import { isSessionFull, isUndecidedCandidate } from "./sessionCriteria.js";
import { taipeiClock, taipeiHourRange } from "./taipeiTime.js";
import type { ControllerCoordinates, ControllerPlayerGroup } from "./controllerContracts.ts";
import type { MapCourtSummary, SessionSummary } from "./domainTypes.ts";
import type { MapPin, MapPoint, MapSize } from "./pins.ts";

interface LatLngLiteral {
  lat: number;
  lng: number;
}

interface MapBoundsLiteral {
  east: number;
  north: number;
  south: number;
  west: number;
}

interface MapsEventListener {
  remove?(): void;
}

interface MapsBounds {
  getNorthEast(): { lat(): number; lng(): number };
  getSouthWest(): { lat(): number; lng(): number };
}

interface MapsMap {
  addListener?(event: string, callback: () => void): MapsEventListener;
  fitBounds(bounds: MapsBounds): void;
  getBounds?(): MapsBounds | null;
  getZoom?(): number | null | undefined;
  setZoom?(zoom: number): void;
}

interface MapsMarker {
  addEventListener?(event: string, callback: () => void): void;
  addListener?(event: string, callback: () => void): MapsEventListener | void;
  anchorLeft?: string;
  anchorTop?: string;
  map?: MapsMap | null;
  position?: LatLngLiteral;
  setMap?(map: MapsMap | null): void;
  setPosition?(position: LatLngLiteral): void;
}

interface MarkerOptions {
  map: MapsMap;
  position: { lat: number | null; lng: number | null };
  title: string;
  zIndex: number;
}

interface LegacyMarkerOptions extends MarkerOptions {
  icon: MapPin["icon"];
  label: MapPin["label"];
  optimized: false;
}

interface AdvancedMarkerOptions extends MarkerOptions {
  content: HTMLElement | null;
  gmpClickable: boolean;
}

type AdvancedMarkerConstructor = new (options: AdvancedMarkerOptions) => MapsMarker;

interface GoogleMapsRuntime {
  maps: {
    importLibrary?(name: string): Promise<unknown>;
    LatLngBounds: new (southWest: LatLngLiteral, northEast: LatLngLiteral) => MapsBounds;
    Map: new (element: HTMLElement, options: Record<string, unknown>) => MapsMap;
    Marker: new (options: LegacyMarkerOptions) => MapsMarker;
    Point: new (x: number, y: number) => MapPoint;
    Size: new (width: number, height: number) => MapSize;
  };
}

interface SessionPinGroup {
  court: MapCourtSummary;
  sessions: SessionSummary[];
  undecidedCandidateSessionIds: Array<SessionSummary["sessionId"]>;
}

interface SessionPinHandlers {
  onCluster?(court: MapCourtSummary, sessions: SessionSummary[]): void;
  onSession?(sessionId: SessionSummary["sessionId"]): void;
}

declare global {
  interface Window {
    __onGoogleMapsReady?: () => void;
    gm_authFailure?: () => void;
    google?: GoogleMapsRuntime;
  }
}

let loadPromise: Promise<GoogleMapsRuntime | undefined> | null = null;
let runtimeGoogle: GoogleMapsRuntime | null = null;
let runtimeMap: MapsMap | null = null;
let AdvancedMarkerElement: AdvancedMarkerConstructor | null = null;
const advancedMarkerMaps = new WeakSet<MapsMap>();
const markerState: {
  court: MapsMarker[];
  player: MapsMarker[];
  session: MapsMarker[];
  user: MapsMarker | null;
} = { court: [], player: [], session: [], user: null };

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
export function loadGoogleMaps(
  apiKey: string,
  onAuthFailure: () => void = () => {}
): Promise<GoogleMapsRuntime | undefined> {
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
          AdvancedMarkerElement =
            typeof library === "object" && library !== null && "AdvancedMarkerElement" in library
              ? ((library as { AdvancedMarkerElement?: AdvancedMarkerConstructor }).AdvancedMarkerElement ?? null)
              : null;
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

export function createMap(google: GoogleMapsRuntime, element: HTMLElement): MapsMap {
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

function detachMarkers(markers: MapsMarker[]): void {
  markers.forEach((marker) => {
    if (typeof marker?.setMap === "function") marker.setMap(null);
    else if (marker) marker.map = null;
  });
}

function createMarker(
  google: GoogleMapsRuntime,
  map: MapsMap,
  {
    onClick,
    pin,
    position,
    title,
    zIndex,
  }: {
    onClick?: () => void;
    pin: MapPin;
    position: MarkerOptions["position"];
    title: string;
    zIndex: number;
  }
): MapsMarker {
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
    if (onClick) marker.addEventListener?.("gmp-click", onClick);
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
  if (onClick) marker.addListener?.("click", onClick);
  return marker;
}

function plainBounds(bounds: MapsBounds | null | undefined): MapBoundsLiteral | null {
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

export function getMapBounds(map: MapsMap | null = runtimeMap): MapBoundsLiteral | null {
  return plainBounds(map?.getBounds?.());
}

export function subscribeToMapIdle(map: MapsMap, callback: () => void): MapsEventListener | undefined {
  return map?.addListener?.("idle", callback);
}

/** Group public SessionSummary rows by court for single and aggregate session pins. */
export function groupSessionsByCourt(
  courts: MapCourtSummary[] = [],
  sessions: SessionSummary[] = []
): SessionPinGroup[] {
  const courtIds = new Set(courts.map((court) => String(court.id)));
  const byCourtId = new Map<string, SessionSummary[]>();
  const undecidedByCourtId = new Map<string, Array<SessionSummary["sessionId"]>>();
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
      sessions: byCourtId.get(String(court.id)) ?? [],
      undecidedCandidateSessionIds: undecidedByCourtId.get(String(court.id)) ?? [],
    }));
}

/** Replace visible session markers while preserving the lower-priority court base layer. */
export function renderSessionPins(
  google: GoogleMapsRuntime,
  map: MapsMap,
  groups: SessionPinGroup[],
  { onSession = () => {}, onCluster = () => {} }: SessionPinHandlers = {}
): MapsMarker[] {
  detachMarkers(markerState.session);
  markerState.session = groups.map(({ court, sessions, undecidedCandidateSessionIds = [] }) => {
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
  return markerState.session;
}

/** Render stable base-court pins beneath session pins. */
export function renderCourtBasePins(
  google: GoogleMapsRuntime,
  map: MapsMap,
  courts: MapCourtSummary[] = [],
  onCourt: (court: MapCourtSummary) => void = () => {}
): MapsMarker[] {
  detachMarkers(markerState.court);
  markerState.court = courts.map((court) => {
    const pin = courtPin(google);
    return createMarker(google, map, {
      onClick: () => onCourt(court),
      pin,
      position: { lat: court.lat, lng: court.lng },
      title: `球場 ${court.name}`,
      zIndex: 10,
    });
  });
  return markerState.court;
}

/** Replace only reciprocal online markers, leaving session and base-court layers untouched. */
export function renderPlayerPins(
  google: GoogleMapsRuntime,
  map: MapsMap,
  groups: ControllerPlayerGroup[] = [],
  onCourtPlayers: (court: ControllerPlayerGroup["court"], players: ControllerPlayerGroup["players"]) => void = () => {}
): MapsMarker[] {
  detachMarkers(markerState.player);
  markerState.player = groups.map(({ court, players, presenceCount = 0 }) => {
    const pin = playerPin(google, players.length, presenceCount);
    return createMarker(google, map, {
      onClick: () => onCourtPlayers(court, players),
      pin,
      position: { lat: court.lat, lng: court.lng },
      title: `在線 · ${court.name} · ${players.length} 人`,
      zIndex: 20,
    });
  });
  return markerState.player;
}

function boundsAround({ lat, lng }: LatLngLiteral, radiusMeters: number): MapBoundsLiteral {
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
export function setUserLocation({ lat, lng }: ControllerCoordinates, radiusMeters: number): MapBoundsLiteral | null {
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
  if (!markerState.user) {
    const pin = userLocationPin(runtimeGoogle);
    markerState.user = createMarker(runtimeGoogle, runtimeMap, {
      pin,
      position: { lat: latitude, lng: longitude },
      title: "你",
      zIndex: 50,
    });
  } else {
    const position = { lat: latitude, lng: longitude };
    if (typeof markerState.user.setPosition === "function") markerState.user.setPosition(position);
    else markerState.user.position = position;
    if (typeof markerState.user.setMap === "function") markerState.user.setMap(runtimeMap);
    else markerState.user.map = runtimeMap;
  }
  return bounds;
}

/** 批 D3:右下控制直欄的 ±1 級縮放(dc L82-83 的 +/− 對應)。 */
export function zoomMapBy(delta: number): number | null {
  if (!runtimeMap?.getZoom || !runtimeMap?.setZoom) return null;
  const current = Number(runtimeMap.getZoom());
  if (!Number.isFinite(current)) return null;
  const next = Math.min(20, Math.max(8, current + delta));
  runtimeMap.setZoom(next);
  return next;
}

/** Fit the public Taipei City discovery bounds without exposing a location. */
export function fitTaipeiBounds(): MapBoundsLiteral | null {
  if (!runtimeGoogle?.maps || !runtimeMap) return null;
  runtimeMap.fitBounds(
    new runtimeGoogle.maps.LatLngBounds(
      { lat: TAIPEI_CITY_BOUNDS.south, lng: TAIPEI_CITY_BOUNDS.west },
      { lat: TAIPEI_CITY_BOUNDS.north, lng: TAIPEI_CITY_BOUNDS.east }
    )
  );
  return { ...TAIPEI_CITY_BOUNDS };
}
