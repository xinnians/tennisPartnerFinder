import { GOOGLE_MAPS_MAP_ID, MAP_CENTER, MAP_ZOOM, TAIPEI_CITY_BOUNDS } from "./config.ts";
import {
  advancedMarkerContent,
  candidateSessionPin,
  courtPin,
  playerPin,
  sessionClusterPin,
  sessionPin,
  userLocationPin,
} from "./pins.ts";
import { isSessionFull, isUndecidedCandidate } from "./sessionCriteria.ts";
import { taipeiClock, taipeiHourRange } from "./taipeiTime.ts";
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
  content?: HTMLElement | null;
  icon?: MapPin["icon"];
  label?: MapPin["label"];
  map?: MapsMap | null;
  options?: Partial<LegacyMarkerOptions>;
  position?: LatLngLiteral;
  setIcon?(icon: MapPin["icon"]): void;
  setLabel?(label: MapPin["label"]): void;
  setMap?(map: MapsMap | null): void;
  setPosition?(position: LatLngLiteral): void;
  setTitle?(title: string): void;
  setZIndex?(zIndex: number): void;
  title?: string;
  zIndex?: number;
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

interface MarkerSpec {
  fingerprint: string;
  key: string;
  map: MapsMap;
  onClick?: () => void;
  pin: MapPin;
  position: MarkerOptions["position"];
  title: string;
  zIndex: number;
}

interface MarkerView {
  map: MapsMap;
  pinFingerprint: string;
  position: MarkerOptions["position"];
  title: string;
  zIndex: number;
}

interface MarkerEntry {
  activate?: () => void;
  fingerprint: string;
  kind: "advanced" | "legacy";
  marker: MapsMarker;
  view: MarkerView;
}

type MarkerLayerName = "court" | "player" | "session";

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
  court: Map<string, MarkerEntry>;
  layerMaps: Record<MarkerLayerName, MapsMap | null>;
  player: Map<string, MarkerEntry>;
  session: Map<string, MarkerEntry>;
  user: MapsMarker | null;
} = {
  court: new Map(),
  layerMaps: { court: null, player: null, session: null },
  player: new Map(),
  session: new Map(),
  user: null,
};

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
  onAuthFailure: () => void = () => {},
  mapId: string = GOOGLE_MAPS_MAP_ID
): Promise<GoogleMapsRuntime | undefined> {
  window.gm_authFailure = onAuthFailure;
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const resolveWithMarkerLibrary = () => {
      const google = window.google;
      if (!mapId) {
        resolve(google);
        return;
      }
      if (typeof google?.maps?.importLibrary !== "function") {
        loadPromise = null;
        reject(new Error("Google Maps Advanced Marker library 不可用"));
        return;
      }
      Promise.resolve(google.maps.importLibrary("marker"))
        .then((library) => {
          const markerConstructor =
            typeof library === "object" && library !== null && "AdvancedMarkerElement" in library
              ? ((library as { AdvancedMarkerElement?: AdvancedMarkerConstructor }).AdvancedMarkerElement ?? null)
              : null;
          if (!markerConstructor) throw new Error("AdvancedMarkerElement 未提供");
          AdvancedMarkerElement = markerConstructor;
          resolve(google);
        })
        .catch((error: unknown) => {
          AdvancedMarkerElement = null;
          loadPromise = null;
          reject(new Error("Google Maps Advanced Marker library 載入失敗", { cause: error }));
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

function detachMarkers(markers: Iterable<MapsMarker>): void {
  for (const marker of markers) {
    if (typeof marker?.setMap === "function") marker.setMap(null);
    else if (marker) marker.map = null;
  }
}

function samePosition(left: MarkerOptions["position"], right: MarkerOptions["position"]): boolean {
  return left.lat === right.lat && left.lng === right.lng;
}

function pinFingerprint(pin: MapPin): string {
  return JSON.stringify({
    anchor: pin.icon.anchor,
    label: pin.label ?? null,
    labelOrigin: pin.icon.labelOrigin,
    scaledSize: pin.icon.scaledSize,
    url: pin.icon.url,
  });
}

function markerView(spec: MarkerSpec): MarkerView {
  return {
    map: spec.map,
    pinFingerprint: pinFingerprint(spec.pin),
    position: spec.position,
    title: spec.title,
    zIndex: spec.zIndex,
  };
}

function buildMarkerSpec(spec: Omit<MarkerSpec, "fingerprint">, dataFingerprint: unknown): MarkerSpec {
  return {
    ...spec,
    fingerprint: JSON.stringify({
      data: dataFingerprint,
      pin: pinFingerprint(spec.pin),
      position: spec.position,
      title: spec.title,
      zIndex: spec.zIndex,
    }),
  };
}

function createMarkerEntry(google: GoogleMapsRuntime, spec: MarkerSpec): MarkerEntry {
  const { map, onClick, pin, position, title, zIndex } = spec;
  let entry: MarkerEntry;
  if (AdvancedMarkerElement && advancedMarkerMaps.has(spec.map)) {
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
    entry = {
      activate: onClick,
      fingerprint: spec.fingerprint,
      kind: "advanced",
      marker,
      view: markerView(spec),
    };
    if (onClick) marker.addEventListener?.("gmp-click", () => entry.activate?.());
    return entry;
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
  entry = {
    activate: onClick,
    fingerprint: spec.fingerprint,
    kind: "legacy",
    marker,
    view: markerView(spec),
  };
  if (onClick) marker.addListener?.("click", () => entry.activate?.());
  return entry;
}

function updateMarkerEntry(entry: MarkerEntry, spec: MarkerSpec): void {
  const { marker, view } = entry;
  if (view.map !== spec.map) {
    if (typeof marker.setMap === "function") marker.setMap(spec.map);
    else marker.map = spec.map;
  }
  if (!samePosition(view.position, spec.position)) {
    if (typeof marker.setPosition === "function") marker.setPosition(spec.position as LatLngLiteral);
    else marker.position = spec.position as LatLngLiteral;
    if (marker.options) marker.options.position = spec.position;
  }
  const nextPinFingerprint = pinFingerprint(spec.pin);
  if (view.pinFingerprint !== nextPinFingerprint) {
    if (entry.kind === "advanced") marker.content = advancedMarkerContent(spec.pin);
    else {
      if (typeof marker.setIcon === "function") marker.setIcon(spec.pin.icon);
      else marker.icon = spec.pin.icon;
      if (typeof marker.setLabel === "function") marker.setLabel(spec.pin.label);
      else marker.label = spec.pin.label;
      if (marker.options) {
        marker.options.icon = spec.pin.icon;
        marker.options.label = spec.pin.label;
      }
    }
  }
  if (view.title !== spec.title) {
    if (entry.kind === "legacy" && typeof marker.setTitle === "function") marker.setTitle(spec.title);
    else marker.title = spec.title;
    if (marker.options) marker.options.title = spec.title;
  }
  if (view.zIndex !== spec.zIndex) {
    if (entry.kind === "legacy" && typeof marker.setZIndex === "function") marker.setZIndex(spec.zIndex);
    else marker.zIndex = spec.zIndex;
    if (marker.options) marker.options.zIndex = spec.zIndex;
  }
  entry.activate = spec.onClick;
  entry.fingerprint = spec.fingerprint;
  entry.view = { ...markerView(spec), pinFingerprint: nextPinFingerprint };
}

function reconcileMarkerLayer(
  google: GoogleMapsRuntime,
  map: MapsMap,
  layer: MarkerLayerName,
  specs: MarkerSpec[]
): MapsMarker[] {
  let current = markerState[layer];
  if (markerState.layerMaps[layer] && markerState.layerMaps[layer] !== map) {
    detachMarkers([...current.values()].map((entry) => entry.marker));
    current = new Map();
  }
  const next = new Map<string, MarkerEntry>();
  for (const spec of specs) {
    if (next.has(spec.key)) throw new Error(`Duplicate ${layer} marker key: ${spec.key}`);
    const existing = current.get(spec.key);
    if (!existing) {
      next.set(spec.key, createMarkerEntry(google, spec));
      continue;
    }
    if (existing.fingerprint !== spec.fingerprint) updateMarkerEntry(existing, spec);
    next.set(spec.key, existing);
  }
  for (const [key, entry] of current) {
    if (!next.has(key)) detachMarkers([entry.marker]);
  }
  markerState[layer] = next;
  markerState.layerMaps[layer] = map;
  return [...next.values()].map((entry) => entry.marker);
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
  const specs = groups.map(({ court, sessions, undecidedCandidateSessionIds = [] }) => {
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
    const sessionId = single?.sessionId;
    const key = multiple
      ? `cluster:${String(court.id)}`
      : undecided
        ? `session:${String(sessionId)}:court:${String(court.id)}`
        : `session:${String(sessionId)}`;
    const memberFingerprint = sessions
      .map((session) => String(session.sessionId))
      .sort()
      .join(",");
    return buildMarkerSpec(
      {
        key,
        map,
        onClick: () => (multiple ? onCluster(court, sessions) : onSession(sessions[0].sessionId)),
        pin,
        position: { lat: court.lat, lng: court.lng },
        title: multiple
          ? `球局 · ${court.name} · ${sessions.length} 場`
          : `球局 · ${court.name}${undecided ? " · 未定" : ""}`,
        zIndex: multiple ? 40 : 30,
      },
      {
        memberFingerprint,
        sessions,
      }
    );
  });
  return reconcileMarkerLayer(google, map, "session", specs);
}

/** Render stable base-court pins beneath session pins. */
export function renderCourtBasePins(
  google: GoogleMapsRuntime,
  map: MapsMap,
  courts: MapCourtSummary[] = [],
  onCourt: (court: MapCourtSummary) => void = () => {}
): MapsMarker[] {
  const specs = courts.map((court) => {
    const pin = courtPin(google);
    return buildMarkerSpec(
      {
        key: `court:${String(court.id)}`,
        map,
        onClick: () => onCourt(court),
        pin,
        position: { lat: court.lat, lng: court.lng },
        title: `球場 ${court.name}`,
        zIndex: 10,
      },
      court
    );
  });
  return reconcileMarkerLayer(google, map, "court", specs);
}

/** Replace only reciprocal online markers, leaving session and base-court layers untouched. */
export function renderPlayerPins(
  google: GoogleMapsRuntime,
  map: MapsMap,
  groups: ControllerPlayerGroup[] = [],
  onCourtPlayers: (court: ControllerPlayerGroup["court"], players: ControllerPlayerGroup["players"]) => void = () => {}
): MapsMarker[] {
  const specs = groups.map(({ court, players, presenceCount = 0 }) => {
    const pin = playerPin(google, players.length, presenceCount);
    return buildMarkerSpec(
      {
        key: `player:${String(court.id)}`,
        map,
        onClick: () => onCourtPlayers(court, players),
        pin,
        position: { lat: court.lat, lng: court.lng },
        title: `在線 · ${court.name} · ${players.length} 人`,
        zIndex: 20,
      },
      { players, presenceCount }
    );
  });
  return reconcileMarkerLayer(google, map, "player", specs);
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
    markerState.user = createMarkerEntry(
      runtimeGoogle,
      buildMarkerSpec(
        {
          key: "user",
          map: runtimeMap,
          pin,
          position: { lat: latitude, lng: longitude },
          title: "你",
          zIndex: 50,
        },
        "user"
      )
    ).marker;
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
