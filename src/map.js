// ============================================================
//  Google Maps 載入、鼠尾草色系地圖樣式、圖釘/聚合釘繪製
// ============================================================
import { MAP_CENTER, MAP_ZOOM } from "./config.js";
import { playerPin, demandPin, clusterPin } from "./pins.js";

// 進行中的載入 Promise:同時(或 HMR 後)再呼叫 loadGoogleMaps 時
// 直接重用,避免重複注入 maps script
let loadPromise = null;

/**
 * 動態載入 Google Maps JavaScript API。
 * @param {string} apiKey
 * @param {() => void} [onAuthFailure] key 無效/受限時的回呼(Google 驗證是
 *   非同步的,可能發生在地圖已建立之後,所以用回呼而不是 reject)
 */
export function loadGoogleMaps(apiKey, onAuthFailure) {
  // key 驗證失敗(無效、referer 受限、未開通帳單)時 Google 會呼叫這個全域 hook
  if (onAuthFailure) window.gm_authFailure = onAuthFailure;

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
    const params = new URLSearchParams({
      key: apiKey,
      v: "weekly",
      loading: "async",
      language: "zh-TW",
      region: "TW",
      callback: "__onGoogleMapsReady",
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => {
      loadPromise = null; // 失敗後允許重試
      reject(new Error("Google Maps API 載入失敗,請檢查網路與 API key"));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}

// 重現設計檔底圖的鼠尾草配色:
// 陸地 #ECEDE7、水域 #C4D8E2、公園 #D8E6C4、道路白、標籤 #AEB6AC
const SAGE_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#ECEDE7" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9AA69C" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#FFFFFF" }, { weight: 2 }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#C4D8E2" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#93AEBC" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ visibility: "on" }, { color: "#D8E6C4" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#DEE0D8" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#F6F1E3" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "off" }] },
];

/** 建立地圖:台北市中心、市區 zoom、關掉預設 UI(控制鈕自己畫,沿用設計) */
export function createMap(google, el) {
  return new google.maps.Map(el, {
    center: MAP_CENTER,
    zoom: MAP_ZOOM,
    disableDefaultUI: true,
    clickableIcons: false,
    styles: SAGE_STYLES,
  });
}

/**
 * 依球場把篩選後的資料分組(設計檔 computeMarkers 的邏輯):
 * 同一座球場只有一筆 → 個別釘;多筆 → 聚合釘(點開球場抽屜)。
 * 回傳 [{ court, lat, lng, items }],items = [{kind:'player'|'demand', data}]
 */
export function groupPinsByCourt(courts, { players, demands }) {
  const byCourt = new Map();
  const push = (courtName, entry) => {
    if (!byCourt.has(courtName)) byCourt.set(courtName, []);
    byCourt.get(courtName).push(entry);
  };
  players.forEach((p) => push(p.homeCourt, { kind: "player", data: p }));
  demands.forEach((d) => push(d.court, { kind: "demand", data: d }));

  return courts
    .filter((c) => byCourt.has(c.name))
    .map((c) => ({ court: c, lat: c.lat, lng: c.lng, items: byCourt.get(c.name) }));
}

/**
 * 把分組結果畫成圖釘。每次呼叫先清掉舊釘再重畫
 * (原型資料量小,不需要 diff 更新)。
 *
 * @param {{onPlayer, onDemand, onCluster}} handlers 點釘時的回呼
 * @returns {google.maps.Marker[]} 目前地圖上的 marker,供下次清除
 */
export function renderPins(google, map, groups, handlers, oldMarkers = []) {
  oldMarkers.forEach((m) => m.setMap(null));

  return groups.map((g) => {
    let pin;
    let onTap;
    if (g.items.length > 1) {
      pin = clusterPin(google, g.items.length);
      onTap = () => handlers.onCluster(g.court, g.items);
    } else if (g.items[0].kind === "player") {
      pin = playerPin(google, g.items[0].data.displayName);
      onTap = () => handlers.onPlayer(g.items[0].data);
    } else {
      pin = demandPin(google);
      onTap = () => handlers.onDemand(g.items[0].data);
    }

    const marker = new google.maps.Marker({
      map,
      position: { lat: g.lat, lng: g.lng },
      icon: pin.icon,
      label: pin.label,
      title: g.court.name,
      // 聚合 > 球友 > 需求(設計檔的 z 順序)
      zIndex: g.items.length > 1 ? 40 : g.items[0].kind === "player" ? 30 : 20,
    });
    marker.addListener("click", onTap);
    return marker;
  });
}
