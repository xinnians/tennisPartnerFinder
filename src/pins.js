const NAVY = "#12291c";   // 計分板 --color-ink;pins.js 無法讀 CSS 變數,值與 session.css 同步
const BLUE = "#1c5c3c";   // --color-court
const LIME = "#ddf53c";   // --color-signal
const SOFT_BLUE = "#e8f2e3"; // --color-success-bg(聚合底)

function svgToDataUri(svg) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.trim())}`;
}

/* 批 D3:v2 地圖釘=時間磚縮小版(dc L36-71)。磚體/框/notch 燒在 SVG icon,
   時間文字走 Maps label(真 DOM 文字才吃得到 IBM Plex Mono;SVG-in-IMG 載不了 webfont)。
   notch 一律 ink 實色;候選型 notch 半透明(dc L69)。 */
const SESSION_PIN_URL = svgToDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="40" viewBox="0 0 64 40">
    <rect x="1.5" y="5.5" width="61" height="25" rx="8" fill="#fff" stroke="${NAVY}" stroke-width="1.5"/>
    <path d="M26 30.5h12l-6 8z" fill="${NAVY}"/>
  </svg>`);
const INSTANT_SESSION_PIN_URL = svgToDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="40" viewBox="0 0 64 40">
    <rect x="1.5" y="5.5" width="61" height="25" rx="8" fill="#fff" stroke="${NAVY}" stroke-width="1.5"/>
    <path d="M26 30.5h12l-6 8z" fill="${NAVY}"/>
    <rect x="50.5" y="0.75" width="11" height="11" rx="3" fill="${LIME}" stroke="${NAVY}" stroke-width="1.5"/>
  </svg>`);
const ONGOING_SESSION_PIN_URL = svgToDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="40" viewBox="0 0 64 40">
    <rect x="1.5" y="5.5" width="61" height="25" rx="8" fill="${NAVY}" stroke="${LIME}" stroke-width="1.5"/>
    <path d="M26 30.5h12l-6 8z" fill="${NAVY}"/>
    <circle cx="11" cy="18" r="3.5" fill="${LIME}"/>
  </svg>`);
const CANDIDATE_SESSION_PIN_URL = svgToDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="78" height="40" viewBox="0 0 78 40">
    <rect x="1.5" y="5.5" width="75" height="25" rx="8" fill="#fff" stroke="${NAVY}" stroke-width="1.5" stroke-dasharray="4 3"/>
    <path d="M33 30.5h12l-6 8z" fill="${NAVY}" opacity="0.55"/>
    <text x="62" y="22" text-anchor="middle" fill="#46554b" font-family="sans-serif" font-size="10">候選</text>
  </svg>`);
const CLUSTER_PIN_URL = svgToDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="56" height="42" viewBox="0 0 56 42">
    <rect x="1.5" y="1.5" width="53" height="29" rx="10" fill="${NAVY}" stroke="${LIME}" stroke-width="1.5"/>
    <text x="41" y="21" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-family="sans-serif" font-size="11">場</text>
    <path d="M22 31h12l-6 9z" fill="${NAVY}"/>
  </svg>`);
const COURT_PIN_URL = svgToDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 25 25">
    <circle cx="12.5" cy="12.5" r="10.5" fill="#fff" stroke="#46554b" stroke-width="1.8"/>
    <circle cx="12.5" cy="12.5" r="3.4" fill="#46554b"/>
  </svg>`);
const USER_PIN_URL = svgToDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
    <circle cx="14" cy="14" r="10" fill="${LIME}" stroke="${NAVY}" stroke-width="3"/>
  </svg>`);
const PLAYER_PIN_URL = svgToDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="86" height="55" viewBox="0 0 86 55">
    <path d="M2 52c16 0 23-10 36-20" fill="none" stroke="${BLUE}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="56" cy="23" r="20" fill="${SOFT_BLUE}" stroke="${BLUE}" stroke-width="3"/>
    <path d="M49 40h14l-7 12z" fill="${BLUE}"/>
  </svg>`);

const font = "'Noto Sans TC', sans-serif";
const monoFont = "'IBM Plex Mono', 'Noto Sans TC', monospace";

function markerIcon(google, url, width, height, anchorX, anchorY, labelX, labelY) {
  return {
    url,
    scaledSize: new google.maps.Size(width, height),
    anchor: new google.maps.Point(anchorX, anchorY),
    labelOrigin: new google.maps.Point(labelX, labelY),
  };
}

function playerPresencePinUrl(presenceCount) {
  const safePresenceCount = Number.isFinite(Number(presenceCount))
    ? Math.max(0, Math.trunc(Number(presenceCount)))
    : 0;
  return svgToDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" width="86" height="55" viewBox="0 0 86 55">
      <path d="M2 52c16 0 23-10 36-20" fill="none" stroke="${BLUE}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="56" cy="23" r="20" fill="${SOFT_BLUE}" stroke="${BLUE}" stroke-width="3"/>
      <path d="M49 40h14l-7 12z" fill="${BLUE}"/>
      <circle cx="72" cy="10" r="12" fill="${LIME}" stroke="${NAVY}" stroke-width="2"/>
      <text x="72" y="13" text-anchor="middle" fill="${NAVY}" font-family="Arial,sans-serif" font-size="10" font-weight="800">線${safePresenceCount}</text>
    </svg>`);
}

/** A public session pin never derives a label from a person or profile.
 *  批 D3:label 改為開始時間(dc L39 mono 14px);進行中=ink 底 signal 字(L47-49)、
 *  直接加入=右上 signal 方點(L40)。時間值由呼叫端提供,pins.js 不碰 session 物件。 */
export function sessionPin(google, { time = "", instant = false, ongoing = false } = {}) {
  if (ongoing) {
    return {
      icon: markerIcon(google, ONGOING_SESSION_PIN_URL, 64, 40, 32, 39, 35, 18),
      label: { text: time || "進行中", color: LIME, fontFamily: monoFont, fontSize: "13px", fontWeight: "600" },
    };
  }
  return {
    icon: markerIcon(google, instant ? INSTANT_SESSION_PIN_URL : SESSION_PIN_URL, 64, 40, 32, 39, 32, 18),
    label: { text: time || "球局", color: NAVY, fontFamily: monoFont, fontSize: "14px", fontWeight: "600" },
  };
}

/** An undecided candidate placement is distinct from a confirmed session pin.
 *  批 D3:dashed 磚+時段範圍 label+「候選」小字燒在 icon(dc L63-69)。 */
export function candidateSessionPin(google, { range = "" } = {}) {
  return {
    icon: markerIcon(google, CANDIDATE_SESSION_PIN_URL, 78, 40, 39, 39, 27, 18),
    label: { text: range || "未定", color: NAVY, fontFamily: monoFont, fontSize: "13px", fontWeight: "600" },
  };
}

/** A count pin is used only where two or more public sessions share one court.
 *  批 D3:ink 磚 signal 框+mono 數字,「場」字燒在 icon(dc L54-60)。 */
export function sessionClusterPin(google, count) {
  return {
    icon: markerIcon(google, CLUSTER_PIN_URL, 56, 42, 28, 41, 26, 16),
    label: { text: String(count), color: LIME, fontFamily: monoFont, fontSize: "17px", fontWeight: "600" },
  };
}

export function courtPin(google) {
  return { icon: markerIcon(google, COURT_PIN_URL, 25, 25, 12.5, 12.5, 12.5, 12.5) };
}

/** An online pin exposes only the reciprocal on-court count without location detail. */
export function playerPin(google, count, presenceCount = 0) {
  const hasPresence = Number(presenceCount) > 0;
  return {
    // The connector begins at the court coordinate while the full-size player
    // control sits to the right of any session pin at that same court.
    icon: markerIcon(google, hasPresence ? playerPresencePinUrl(presenceCount) : PLAYER_PIN_URL, 86, 55, 2, 54, 56, 23),
    label: { text: String(count), color: NAVY, fontFamily: font, fontSize: "15px", fontWeight: "800" },
  };
}

export function userLocationPin(google) {
  return { icon: markerIcon(google, USER_PIN_URL, 28, 28, 14, 14, 14, 14) };
}

export { CANDIDATE_SESSION_PIN_URL, CLUSTER_PIN_URL, COURT_PIN_URL, PLAYER_PIN_URL, SESSION_PIN_URL, SOFT_BLUE, USER_PIN_URL };
