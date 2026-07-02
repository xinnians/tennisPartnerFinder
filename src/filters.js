// ============================================================
//  篩選邏輯(純函式,不碰 DOM / 地圖,方便測試與重用)
//  規則沿用設計檔:程度用 band 區間、類型 chips 未選 = 不限
// ============================================================

// NTRP 程度區間(與設計檔的 bandOptions 一致)
export const BANDS = [
  { key: "all", label: "全部" },
  { key: "lo", label: "≤ 3.0" },
  { key: "mid", label: "3.0 – 4.0" },
  { key: "hi", label: "4.0 – 5.0" },
  { key: "pro", label: "5.0 +" },
];

// 想打類型 chips(與設計檔 TYPES 的 short 標籤一致)
export const TYPES = ["單打", "對拉", "雙打", "練球"];

export const DEFAULT_FILTER_STATE = {
  band: "all", // 程度區間
  types: new Set(), // 已選類型;空集合 = 不限(設計行為)
};

/**
 * NTRP 是否落在指定 band。
 * ntrp 為 null(程度未提供)一律通過 —— 與設計檔 _bandMatch 相同,
 * 讓「約略程度」的需求釘不會因為沒數字就被誤濾掉。
 */
export function bandMatch(ntrp, band) {
  if (band === "all" || ntrp == null) return true;
  if (band === "lo") return ntrp <= 3.0;
  if (band === "mid") return ntrp > 3.0 && ntrp <= 4.0;
  if (band === "hi") return ntrp > 4.0 && ntrp <= 5.0;
  if (band === "pro") return ntrp > 5.0;
  return true;
}

/** goals 與已選類型有交集才通過;未選任何類型 = 不限 */
export function typeMatch(goals, types) {
  if (types.size === 0) return true;
  return goals.some((g) => types.has(g));
}

/**
 * 依篩選狀態過濾球友與需求資料。
 * - 球友釘:程度 band + 想打類型 都要通過。
 * - 需求釘:只看程度 band —— DemandPin 沒有結構化的類型欄位
 *   (原句在 demandText 裡),所以想打類型篩選不作用於需求釘。
 */
export function filterData({ players, demands }, state) {
  return {
    players: players.filter(
      (p) => bandMatch(p.ntrp, state.band) && typeMatch(p.goals, state.types)
    ),
    demands: demands.filter((d) => bandMatch(d.ntrp, state.band)),
  };
}
