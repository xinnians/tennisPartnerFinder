// ============================================================
//  篩選邏輯(純函式,不碰 DOM / 地圖,方便測試與重用)
// ============================================================

// 篩選列的預設狀態
export const DEFAULT_FILTER_STATE = {
  ntrpMin: 1.0, // NTRP 下限(「不限」以極值表示)
  ntrpMax: 7.0, // NTRP 上限
  types: new Set(["單打", "雙打", "對拉"]), // 想打類型(作用於球友釘)
  includeUnknown: true, // 是否顯示程度未提供(ntrp 為 null)的需求釘
  showPlayers: true, // 顯示球友釘
  showDemands: true, // 顯示需求釘
};

/**
 * 依篩選狀態過濾球友與需求資料。
 *
 * 規則:
 * - 球友釘:NTRP 需落在 [ntrpMin, ntrpMax],且 goals 與勾選的想打類型有交集。
 * - 需求釘:NTRP 落在範圍內;ntrp 為 null(程度未提供)時由 includeUnknown 決定。
 *   需求釘沒有結構化的「想打類型」欄位(原句放在 demandText),
 *   所以想打類型篩選不作用於需求釘。
 *
 * @param {{players: Array, demands: Array}} data
 * @param {typeof DEFAULT_FILTER_STATE} state
 * @returns {{players: Array, demands: Array}}
 */
export function filterData({ players, demands }, state) {
  const inRange = (n) => n >= state.ntrpMin && n <= state.ntrpMax;

  const filteredPlayers = !state.showPlayers
    ? []
    : players.filter(
        (p) => inRange(p.ntrp) && p.goals.some((g) => state.types.has(g))
      );

  const filteredDemands = !state.showDemands
    ? []
    : demands.filter((d) =>
        d.ntrp === null ? state.includeUnknown : inRange(d.ntrp)
      );

  return { players: filteredPlayers, demands: filteredDemands };
}
