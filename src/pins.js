// ============================================================
//  兩種圖釘的 SVG 圖示(地圖 marker 與圖例共用同一組圖)
//  - 球友釘:實心球場綠 + 網球圖樣,視覺上是「主要」釘
//  - 需求釘:奶油底 + 土色虛線框 + 對話泡泡,視覺上是「次要」釘
// ============================================================

// 與 style.css 的 design token 對齊的顏色
const COLORS = {
  courtGreen: "#1f7a4d",
  courtGreenDark: "#14532d",
  ball: "#d9f24f",
  cream: "#fdf6ec",
  clay: "#c2703d",
  ink: "#1c2b24",
};

// 經典水滴形釘的外框路徑(viewBox 44x56)
const PIN_PATH =
  "M22 2C11.5 2 3 10.5 3 21c0 13.4 16.2 30.2 17.9 31.9a1.6 1.6 0 0 0 2.2 0C24.8 51.2 41 34.4 41 21 41 10.5 32.5 2 22 2z";

// 球友釘:綠底白框,中心是一顆網球(圓 + 兩道弧線)
const PLAYER_PIN_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 56" width="34" height="43">
  <path d="${PIN_PATH}" fill="${COLORS.courtGreen}" stroke="${COLORS.courtGreenDark}" stroke-width="2"/>
  <circle cx="22" cy="21" r="10" fill="${COLORS.ball}"/>
  <path d="M14.8 14.5a10 10 0 0 1 0 13" fill="none" stroke="${COLORS.courtGreenDark}" stroke-width="1.6"/>
  <path d="M29.2 14.5a10 10 0 0 0 0 13" fill="none" stroke="${COLORS.courtGreenDark}" stroke-width="1.6"/>
</svg>`;

// 需求釘:奶油底、土色虛線外框,中心是一個「徵」字對話泡泡
const DEMAND_PIN_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 56" width="28" height="36">
  <path d="${PIN_PATH}" fill="${COLORS.cream}" stroke="${COLORS.clay}" stroke-width="2.4" stroke-dasharray="4 3"/>
  <rect x="11" y="12" width="22" height="15" rx="4" fill="${COLORS.clay}"/>
  <path d="M18 27l-2 5 7-5z" fill="${COLORS.clay}"/>
  <text x="22" y="23.5" text-anchor="middle" font-family="sans-serif" font-size="10.5" font-weight="bold" fill="${COLORS.cream}">徵</text>
</svg>`;

function svgToDataUri(svg) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.trim())}`;
}

export const PLAYER_PIN_URL = svgToDataUri(PLAYER_PIN_SVG);
export const DEMAND_PIN_URL = svgToDataUri(DEMAND_PIN_SVG);

// 給 google.maps.Marker 用的 icon 設定(anchor 對齊釘尖)
export function playerIcon(google) {
  return {
    url: PLAYER_PIN_URL,
    scaledSize: new google.maps.Size(34, 43),
    anchor: new google.maps.Point(17, 43),
  };
}

export function demandIcon(google) {
  return {
    url: DEMAND_PIN_URL,
    scaledSize: new google.maps.Size(28, 36),
    anchor: new google.maps.Point(14, 36),
  };
}
