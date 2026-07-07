// 雙北行政區對照：資料檔驗證與 profile 選單分組共用（避免雙 SoT）。
// 純常數、零 import；雙北行政區名無重複，district→city 唯一推導。

export const TAIPEI_DISTRICTS = [
  "中正區",
  "大同區",
  "中山區",
  "松山區",
  "大安區",
  "萬華區",
  "信義區",
  "士林區",
  "北投區",
  "內湖區",
  "南港區",
  "文山區",
];

export const NEW_TAIPEI_DISTRICTS = [
  "板橋區",
  "三重區",
  "中和區",
  "永和區",
  "新莊區",
  "新店區",
  "土城區",
  "蘆洲區",
  "樹林區",
  "汐止區",
  "鶯歌區",
  "三峽區",
  "淡水區",
  "瑞芳區",
  "五股區",
  "泰山區",
  "林口區",
  "深坑區",
  "石碇區",
  "坪林區",
  "三芝區",
  "石門區",
  "八里區",
  "平溪區",
  "雙溪區",
  "貢寮區",
  "金山區",
  "萬里區",
  "烏來區",
];

/**
 * 根據行政區名稱推導城市。
 * @param {string} district - 行政區名稱
 * @returns {"台北市"|"新北市"|null} 城市名稱或 null
 */
export function cityOf(district) {
  if (TAIPEI_DISTRICTS.includes(district)) return "台北市";
  if (NEW_TAIPEI_DISTRICTS.includes(district)) return "新北市";
  return null;
}
