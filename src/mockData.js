// ============================================================
//  假資料(原型階段寫死,不接任何後端/爬蟲)
//  定位單位是「球場」:每支釘都釘在球場座標上,不是住家。
//  座標取自 data/courts.json 核准目錄,逐值對齊(非大約位置)。
//
//  資料分佈刻意讓地圖上同時看得到三種釘:
//  - 個別球友釘:大佳河濱公園(Amber)、百齡河濱(老張)
//  - 個別需求釘:古亭河濱公園(d3)
//  - 聚合釘:台北網球中心 3 筆、彩虹河濱 2 筆、青年公園 4 筆
// ============================================================

// 台北市真實球場(名稱、行政區、經緯度取自 data/courts.json 核准清單,逐值對齊)。
// 球友/需求資料中的 courtLat/courtLng/courtDistrict 皆取自這份清單。
export const COURTS = [
  { name: "台北網球中心",       district: "內湖區", lat: 25.067446, lng: 121.596648 },
  { name: "大佳河濱公園網球場", district: "中山區", lat: 25.074849, lng: 121.531508 },
  { name: "古亭河濱公園網球場", district: "中正區", lat: 25.019024, lng: 121.522689 },
  { name: "彩虹河濱公園網球場", district: "內湖區", lat: 25.062687, lng: 121.571815 },
  { name: "百齡河濱公園網球場", district: "士林區", lat: 25.08896,  lng: 121.512494 },
  { name: "青年公園網球場",     district: "萬華區", lat: 25.02306,  lng: 121.506928 },
];

// ------------------------------------------------------------
// RegisteredPlayer:公開位置的註冊球友(球友釘/主要圖釘)
// 形狀:id, displayName, ntrp(number), goals(string[]), homeCourt(string),
//       courtDistrict(string), courtLat, courtLng, availability(string[]), lineId
// goals 用設計檔的四種類型:單打/對拉/雙打/練球
// ------------------------------------------------------------
export const REGISTERED_PLAYERS = [
  {
    id: "p1",
    displayName: "小徐",
    ntrp: 4.0,
    goals: ["單打", "對拉"],
    homeCourt: "台北網球中心",
    courtDistrict: "內湖區",
    courtLat: 25.067446,
    courtLng: 121.596648,
    availability: ["平日晚上", "週六早上"],
    lineId: "hsu_tennis40",
  },
  {
    id: "p2",
    displayName: "Leo",
    ntrp: 5.0,
    goals: ["單打"],
    homeCourt: "台北網球中心",
    courtDistrict: "內湖區",
    courtLat: 25.067446,
    courtLng: 121.596648,
    availability: ["週日早上"],
    lineId: "leo_ace",
  },
  {
    id: "p3",
    displayName: "Amber",
    ntrp: 3.0,
    goals: ["雙打"],
    homeCourt: "大佳河濱公園網球場",
    courtDistrict: "中山區",
    courtLat: 25.074849,
    courtLng: 121.531508,
    availability: ["週三晚上", "週日下午"],
    lineId: "amber.tw",
  },
  {
    id: "p4",
    displayName: "Vivian",
    ntrp: 2.5,
    goals: ["對拉", "練球"],
    homeCourt: "彩虹河濱公園網球場",
    courtDistrict: "內湖區",
    courtLat: 25.062687,
    courtLng: 121.571815,
    availability: ["週末早上"],
    lineId: "viv_court",
  },
  {
    id: "p5",
    displayName: "老張",
    ntrp: 4.5,
    goals: ["單打"],
    homeCourt: "百齡河濱公園網球場",
    courtDistrict: "士林區",
    courtLat: 25.08896,
    courtLng: 121.512494,
    availability: ["週二/週四晚上", "週六下午"],
    lineId: "chang4half",
  },
  {
    id: "p6",
    displayName: "Momo",
    ntrp: 3.5,
    goals: ["雙打", "對拉"],
    homeCourt: "青年公園網球場",
    courtDistrict: "萬華區",
    courtLat: 25.02306,
    courtLng: 121.506928,
    availability: ["平日午休", "週五晚上"],
    lineId: "momo_tennis",
  },
];

// ------------------------------------------------------------
// DemandPin:球場附近的徵球伴需求(需求釘/次要圖釘)
// 形狀:id, court(string), courtDistrict(string), courtLat, courtLng, ntrp(number|null),
//       rawSkill(string|null), demandText(string), sourceUrl
// ntrp 為 null 代表原貼文沒有可換算的數字程度;
// sheet 的「大概程度」顯示 rawSkill,rawSkill 也是 null 才顯示「程度未提供」。
// ------------------------------------------------------------
export const DEMAND_PINS = [
  {
    id: "d1",
    court: "台北網球中心",
    courtDistrict: "內湖區",
    courtLat: 25.067446,
    courtLng: 121.596648,
    ntrp: 3.5,
    rawSkill: "約 3.5",
    demandText: "平日晚上・徵固定對打",
    sourceUrl: "https://www.facebook.com/groups/taipeitennis/posts/1001",
  },
  {
    id: "d2",
    court: "青年公園網球場",
    courtDistrict: "萬華區",
    courtLat: 25.02306,
    courtLng: 121.506928,
    ntrp: null,
    rawSkill: null,
    demandText: "週末早上想找人對拉練球,新手友善",
    sourceUrl: "https://www.ptt.cc/bbs/Tennis/M.1735600000.A.001.html",
  },
  {
    id: "d3",
    court: "古亭河濱公園網球場",
    courtDistrict: "中正區",
    courtLat: 25.019024,
    courtLng: 121.522689,
    ntrp: 4.0,
    rawSkill: "4.0 上下",
    demandText: "週六下午・雙打固定咖缺 2",
    sourceUrl: "https://www.facebook.com/groups/taipeitennis/posts/1027",
  },
  {
    id: "d4",
    court: "彩虹河濱公園網球場",
    courtDistrict: "內湖區",
    courtLat: 25.062687,
    courtLng: 121.571815,
    ntrp: null,
    rawSkill: "中上",
    demandText: "球場有夜間照明・徵平日夜打",
    sourceUrl: "https://www.ptt.cc/bbs/Tennis/M.1735700000.A.0F3.html",
  },
  {
    id: "d5",
    court: "青年公園網球場",
    courtDistrict: "萬華區",
    courtLat: 25.02306,
    courtLng: 121.506928,
    ntrp: 3.0,
    rawSkill: "約 3.0",
    demandText: "週日早上雙打・歡迎女雙",
    sourceUrl: "https://www.facebook.com/groups/taipeitennis/posts/1043",
  },
  {
    id: "d6",
    court: "青年公園網球場",
    courtDistrict: "萬華區",
    courtLat: 25.02306,
    courtLng: 121.506928,
    ntrp: 2.5,
    rawSkill: "2.5 – 3.0",
    demandText: "新手找球友互相餵球練基本功",
    sourceUrl: "https://www.ptt.cc/bbs/Tennis/M.1735800000.A.2B7.html",
  },
];
