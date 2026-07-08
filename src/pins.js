// ============================================================
//  三種圖釘的 SVG 圖示(視覺完全取自設計檔):
//  - 球友釘:44px 萊姆圓 + 深綠框 + 深綠小三角,圓心放暱稱字首
//  - 需求釘:31px 白圓 + 灰虛線框 + 淺灰小三角,圓心放「徵」
//  - 聚合釘:46px 深綠圓 + 萊姆框,圓心放數量(同球場多筆時)
//  字首/「徵」/數量用 marker 的 label 畫(label 走 DOM,吃得到
//  頁面載入的 Baloo 2 字體;SVG data URI 內的 <text> 吃不到)。
// ============================================================

const DEEP = "#16351F";
const LIME = "#C9E23B";
const DEMAND_BORDER = "#9DACA0";
const DEMAND_TAIL = "#C4D0C6";

function svgToDataUri(svg) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.trim())}`;
}

// 球友釘:viewBox 50×58,圓心 (25,25) 半徑 22,釘尖在 (25,57)
const PLAYER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 58" width="50" height="58">
  <circle cx="25" cy="25" r="22" fill="${LIME}" stroke="${DEEP}" stroke-width="2.5"/>
  <path d="M19 46.4 L31 46.4 L25 56 Z" fill="${DEEP}"/>
</svg>`;

// 需求釘:viewBox 36×42,圓心 (18,16.5) 半徑 15,釘尖在 (18,41)
const DEMAND_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 42" width="36" height="42">
  <circle cx="18" cy="16.5" r="15" fill="#FFFFFF" stroke="${DEMAND_BORDER}" stroke-width="2" stroke-dasharray="4 3"/>
  <path d="M13 32.6 L23 32.6 L18 40.5 Z" fill="${DEMAND_TAIL}"/>
</svg>`;

// 聚合釘:viewBox 54×62,圓心 (27,26) 半徑 23,釘尖在 (27,61)
const CLUSTER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 54 62" width="54" height="62">
  <circle cx="27" cy="26" r="23" fill="${DEEP}" stroke="${LIME}" stroke-width="2.5"/>
  <path d="M21 49.8 L33 49.8 L27 60 Z" fill="${DEEP}"/>
</svg>`;

export const PLAYER_PIN_URL = svgToDataUri(PLAYER_SVG);
export const DEMAND_PIN_URL = svgToDataUri(DEMAND_SVG);
export const CLUSTER_PIN_URL = svgToDataUri(CLUSTER_SVG);

const NUM_FONT = "'Baloo 2', 'Noto Sans TC', sans-serif";

/** 球友釘 icon + 字首 label */
export function playerPin(google, displayName) {
  return {
    icon: {
      url: PLAYER_PIN_URL,
      scaledSize: new google.maps.Size(50, 58),
      anchor: new google.maps.Point(25, 57),
      labelOrigin: new google.maps.Point(25, 25),
    },
    label: {
      text: displayName.slice(0, 1),
      color: DEEP,
      fontFamily: NUM_FONT,
      fontSize: "18px",
      fontWeight: "800",
    },
  };
}

/** 需求釘 icon + 「徵」label */
export function demandPin(google) {
  return {
    icon: {
      url: DEMAND_PIN_URL,
      scaledSize: new google.maps.Size(36, 42),
      anchor: new google.maps.Point(18, 41),
      labelOrigin: new google.maps.Point(18, 16.5),
    },
    label: {
      text: "徵",
      color: "#7A8A7E",
      fontFamily: "'Noto Sans TC', sans-serif",
      fontSize: "13px",
      fontWeight: "700",
    },
  };
}

/** 聚合釘 icon + 數量 label */
export function clusterPin(google, count) {
  return {
    icon: {
      url: CLUSTER_PIN_URL,
      scaledSize: new google.maps.Size(54, 62),
      anchor: new google.maps.Point(27, 61),
      labelOrigin: new google.maps.Point(27, 26),
    },
    label: {
      text: String(count),
      color: "#FFFFFF",
      fontFamily: NUM_FONT,
      fontSize: "17px",
      fontWeight: "700",
    },
  };
}

// 球場底圖釘:弱化樣式的同心圓,墊在球友/需求釘下層。
const COURT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="11" fill="#F4F6F0" stroke="#9DACA0" stroke-width="1.6"/><circle cx="13" cy="13" r="3.5" fill="#9DACA0"/></svg>`;
export const COURT_PIN_URL = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(COURT_SVG)}`;

/** 球場底圖釘 icon(無 label——110+ 顆 label 會糊掉地圖) */
export function courtPin(google) {
  return {
    icon: {
      url: COURT_PIN_URL,
      scaledSize: new google.maps.Size(26, 26),
      anchor: new google.maps.Point(13, 13),
    },
  };
}
