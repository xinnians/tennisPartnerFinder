// ============================================================
//  Google Maps 載入、圖釘繪製與 InfoWindow 內容
// ============================================================
import { MAP_CENTER, MAP_ZOOM } from "./config.js";
import { districtOf } from "./mockData.js";
import { playerIcon, demandIcon } from "./pins.js";

// 進行中的載入 Promise:同時(或 HMR 後)再呼叫 loadGoogleMaps 時
// 直接重用,避免重複注入 maps script
let loadPromise = null;

/**
 * 動態載入 Google Maps JavaScript API。
 * 用 callback 方式注入 <script>,回傳 Promise 以便 await。
 * @param {string} apiKey
 * @param {() => void} [onAuthFailure] key 無效/受限時的回呼(Google 驗證是
 *   非同步的,可能發生在地圖已建立之後,所以用回呼而不是 reject)
 */
export function loadGoogleMaps(apiKey, onAuthFailure) {
  // key 驗證失敗(無效、referer 受限、未開通帳單)時 Google 會呼叫這個全域 hook
  if (onAuthFailure) window.gm_authFailure = onAuthFailure;

  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    // 已載入過就直接用(例如 Vite HMR 重新執行 main.js 時)
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

/** 建立地圖:台北市中心、市區 zoom,關掉原型用不到的控制項與 POI 雜訊 */
export function createMap(google, el) {
  return new google.maps.Map(el, {
    center: MAP_CENTER,
    zoom: MAP_ZOOM,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    clickableIcons: false,
    styles: [
      // 隱藏一般 POI 標籤讓球場圖釘更突出,保留公園綠地當視覺定位
      { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
      { featureType: "transit", stylers: [{ visibility: "off" }] },
    ],
  });
}

// ------------------------------------------------------------
// InfoWindow 內容(信任的假資料仍一律 escape,養成好習慣)
// ------------------------------------------------------------
function esc(value) {
  return String(value).replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]
  );
}

/** 球友釘:暱稱、NTRP、想打類型、固定時段、Line、送出邀請按鈕 */
function playerInfoHtml(p) {
  return `
    <div class="iw iw--player">
      <div class="iw__badge iw__badge--player">球友</div>
      <h3 class="iw__title">${esc(p.displayName)}</h3>
      <p class="iw__court">🏟 ${esc(p.homeCourt)}(${esc(districtOf(p.homeCourt))})</p>
      <dl class="iw__rows">
        <div><dt>NTRP</dt><dd>${esc(p.ntrp.toFixed(1))}</dd></div>
        <div><dt>想打</dt><dd>${p.goals.map((g) => `<span class="iw__tag">${esc(g)}</span>`).join("")}</dd></div>
        <div><dt>時段</dt><dd>${p.availability.map(esc).join("<br>")}</dd></div>
        <div><dt>LINE</dt><dd><code>${esc(p.lineId)}</code></dd></div>
      </dl>
      <button type="button" class="iw__invite" data-invite="${esc(p.displayName)}">送出邀請</button>
    </div>`;
}

/** 需求釘:區域、程度、需求原句、原貼文連結(不顯示姓名/聯絡方式) */
function demandInfoHtml(d) {
  const skill = d.rawSkill ?? "程度未提供";
  return `
    <div class="iw iw--demand">
      <div class="iw__badge iw__badge--demand">徵球伴</div>
      <h3 class="iw__title">${esc(d.court)}</h3>
      <p class="iw__court">📍 ${esc(districtOf(d.court))}</p>
      <dl class="iw__rows">
        <div><dt>程度</dt><dd>${esc(skill)}</dd></div>
        <div><dt>需求</dt><dd>「${esc(d.demandText)}」</dd></div>
      </dl>
      <a class="iw__source" href="${esc(d.sourceUrl)}" target="_blank" rel="noopener noreferrer">查看原貼文 ↗</a>
    </div>`;
}

// ------------------------------------------------------------
// 圖釘繪製
// ------------------------------------------------------------

/**
 * 多支釘落在同一座球場(同座標)時會完全重疊,
 * 依序給每支釘一個小半徑的環狀偏移,讓它們在市區 zoom 下攤開可點。
 */
function spreadOverlaps(items) {
  const byCoord = new Map();
  return items.map((item) => {
    const key = `${item.lat},${item.lng}`;
    const n = byCoord.get(key) ?? 0;
    byCoord.set(key, n + 1);
    if (n === 0) return item; // 第一支釘留在球場原點
    const angle = (n - 1) * (Math.PI / 3); // 之後的釘以 60° 間隔繞一圈
    const r = 0.0012; // 約 100 多公尺,市區 zoom 下剛好分得開
    return { ...item, lat: item.lat + r * Math.sin(angle), lng: item.lng + r * Math.cos(angle) };
  });
}

/**
 * 把篩選後的資料畫成圖釘。每次呼叫先清掉舊釘再重畫,
 * 原型資料量小(十來支釘),不需要做 diff 更新。
 *
 * @returns {google.maps.Marker[]} 目前地圖上的 marker,供下次清除
 */
export function renderPins(google, map, infoWindow, { players, demands }, oldMarkers = []) {
  oldMarkers.forEach((m) => m.setMap(null));

  const pins = spreadOverlaps([
    // 需求釘先畫、球友釘後畫,讓主要釘蓋在次要釘上面
    ...demands.map((d) => ({
      lat: d.courtLat,
      lng: d.courtLng,
      icon: demandIcon(google),
      html: demandInfoHtml(d),
      title: `徵球伴:${d.court}`,
      zIndex: 1,
    })),
    ...players.map((p) => ({
      lat: p.courtLat,
      lng: p.courtLng,
      icon: playerIcon(google),
      html: playerInfoHtml(p),
      title: `球友:${p.displayName}@${p.homeCourt}`,
      zIndex: 2,
    })),
  ]);

  return pins.map((pin) => {
    const marker = new google.maps.Marker({
      map,
      position: { lat: pin.lat, lng: pin.lng },
      icon: pin.icon,
      title: pin.title,
      zIndex: pin.zIndex,
    });
    marker.addListener("click", () => {
      infoWindow.setContent(pin.html);
      infoWindow.open({ map, anchor: marker });
    });
    return marker;
  });
}
