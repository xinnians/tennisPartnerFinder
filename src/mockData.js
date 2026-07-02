// ============================================================
//  假資料(原型階段寫死,不接任何後端/爬蟲)
//  定位單位是「球場」:每支釘都釘在球場座標上,不是住家。
//  座標為大約位置,足夠在市區 zoom 下辨識即可。
// ============================================================

// 台北市真實球場(名稱、行政區、大約經緯度)。
// 球友/需求資料中的 courtLat/courtLng 皆取自這份清單。
export const COURTS = [
  { name: "台北網球中心",          district: "內湖區", lat: 25.069, lng: 121.593 },
  { name: "大安森林公園網球場",    district: "大安區", lat: 25.03,  lng: 121.536 },
  { name: "中正網球中心",          district: "中正區", lat: 25.018, lng: 121.523 },
  { name: "迎風河濱公園網球場",    district: "松山區", lat: 25.068, lng: 121.557 },
  { name: "百齡河濱公園網球場",    district: "士林區", lat: 25.089, lng: 121.514 },
  { name: "青年公園網球場",        district: "萬華區", lat: 25.022, lng: 121.504 },
];

// 依球場名稱查行政區(InfoWindow 顯示「區域」用)
export function districtOf(courtName) {
  const court = COURTS.find((c) => c.name === courtName);
  return court ? court.district : "台北市";
}

// ------------------------------------------------------------
// RegisteredPlayer:公開位置的註冊球友(球友釘/主要圖釘)
// 形狀:id, displayName, ntrp(number), goals(string[]), homeCourt(string),
//       courtLat, courtLng, availability(string[]), lineId
// ------------------------------------------------------------
export const REGISTERED_PLAYERS = [
  {
    id: "p1",
    displayName: "小徐",
    ntrp: 4.0,
    goals: ["單打", "對拉"],
    homeCourt: "台北網球中心",
    courtLat: 25.069,
    courtLng: 121.593,
    availability: ["平日晚上 19:00–21:00", "週六早上"],
    lineId: "hsu_tennis40",
  },
  {
    id: "p2",
    displayName: "Leo",
    ntrp: 5.0,
    goals: ["單打"],
    homeCourt: "台北網球中心",
    courtLat: 25.069,
    courtLng: 121.593,
    availability: ["週日早上"],
    lineId: "leo_ace",
  },
  {
    id: "p3",
    displayName: "Amber",
    ntrp: 3.0,
    goals: ["雙打"],
    homeCourt: "大安森林公園網球場",
    courtLat: 25.03,
    courtLng: 121.536,
    availability: ["週三晚上", "週日下午"],
    lineId: "amber.tw",
  },
  {
    id: "p4",
    displayName: "阿凱",
    ntrp: 3.5,
    goals: ["單打", "雙打"],
    homeCourt: "中正網球中心",
    courtLat: 25.018,
    courtLng: 121.523,
    availability: ["平日早上 6:30–8:00"],
    lineId: "kai-tennis",
  },
  {
    id: "p5",
    displayName: "Vivian",
    ntrp: 2.5,
    goals: ["對拉", "雙打"],
    homeCourt: "迎風河濱公園網球場",
    courtLat: 25.068,
    courtLng: 121.557,
    availability: ["週末早上"],
    lineId: "viv_court",
  },
  {
    id: "p6",
    displayName: "老張",
    ntrp: 4.5,
    goals: ["單打"],
    homeCourt: "百齡河濱公園網球場",
    courtLat: 25.089,
    courtLng: 121.514,
    availability: ["週二/週四晚上", "週六下午"],
    lineId: "chang4half",
  },
  {
    id: "p7",
    displayName: "Momo",
    ntrp: 3.5,
    goals: ["雙打", "對拉"],
    homeCourt: "青年公園網球場",
    courtLat: 25.022,
    courtLng: 121.504,
    availability: ["平日午休", "週五晚上"],
    lineId: "momo_tennis",
  },
];

// ------------------------------------------------------------
// DemandPin:球場附近的徵球伴需求(需求釘/次要圖釘)
// 形狀:id, court(string), courtLat, courtLng, ntrp(number|null),
//       rawSkill(string|null), demandText(string), sourceUrl
// ntrp 為 null 代表原貼文沒有可換算的數字程度:
//   - 篩選:這類釘由「含程度未提供」勾選框控制,不吃 NTRP 範圍。
//   - 顯示:程度文字取 rawSkill(如「中上」),rawSkill 也是 null
//     才顯示「程度未提供」。
// ------------------------------------------------------------
export const DEMAND_PINS = [
  {
    id: "d1",
    court: "台北網球中心",
    courtLat: 25.069,
    courtLng: 121.593,
    ntrp: 3.5,
    rawSkill: "約3.5",
    demandText: "平日晚上・徵固定對打",
    sourceUrl: "https://www.facebook.com/groups/taipeitennis/posts/1001",
  },
  {
    id: "d2",
    court: "大安森林公園網球場",
    courtLat: 25.03,
    courtLng: 121.536,
    ntrp: null,
    rawSkill: null,
    demandText: "週末早上想找人對拉練球,新手友善",
    sourceUrl: "https://www.ptt.cc/bbs/Tennis/M.1735600000.A.001.html",
  },
  {
    id: "d3",
    court: "中正網球中心",
    courtLat: 25.018,
    courtLng: 121.523,
    ntrp: 4.0,
    rawSkill: "4.0 上下",
    demandText: "週六下午・雙打固定咖缺 2",
    sourceUrl: "https://www.facebook.com/groups/taipeitennis/posts/1027",
  },
  {
    id: "d4",
    court: "迎風河濱公園網球場",
    courtLat: 25.068,
    courtLng: 121.557,
    ntrp: null,
    rawSkill: "中上",
    demandText: "球場有夜間照明・徵平日夜打",
    sourceUrl: "https://www.ptt.cc/bbs/Tennis/M.1735700000.A.0F3.html",
  },
  {
    id: "d5",
    court: "青年公園網球場",
    courtLat: 25.022,
    courtLng: 121.504,
    ntrp: 3.0,
    rawSkill: "約3.0",
    demandText: "週日早上雙打・歡迎女雙",
    sourceUrl: "https://www.facebook.com/groups/taipeitennis/posts/1043",
  },
  {
    id: "d6",
    court: "百齡河濱公園網球場",
    courtLat: 25.089,
    courtLng: 121.514,
    ntrp: 2.5,
    rawSkill: "2.5–3.0",
    demandText: "新手找球友互相餵球練基本功",
    sourceUrl: "https://www.ptt.cc/bbs/Tennis/M.1735800000.A.2B7.html",
  },
];
