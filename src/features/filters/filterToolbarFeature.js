import { DEFAULT_FILTER_STATE } from "../../filters.js";

let getAppState;
let getController;
let openFilterSheet;
let configureMapFilterToolbar;
let renderMapFilterToolbar;

/** Configure entry-owned state and the public sessionViews filter adapter. */
export function configureFilterToolbarFeature(dependencies) {
  ({ configureMapFilterToolbar, getAppState, getController, openFilterSheet, renderMapFilterToolbar } = dependencies);
}

// openFilters() 開啟篩選 sheet 時的資料來源,亦是 renderFilters 判斷 badge N 的依據。
let latestFilters = DEFAULT_FILTER_STATE;

// 批 C1 Task 3:目前開著的篩選 sheet(未開時為 null)。renderFilters 靠它把地圖控件
// 的每次變動鏡像進 sheet;sheet 自己的變動已在 openFilterSheet 內部同步。
let activeFilterSheet = null;

// 篩選 chip「永遠白底無選中態」(dc L106):badge 只在 count>0 時出現,不切換
// is-active——這點與舊版(反相底)刻意不同,見批 D4a 規格。badge 與文字之間留一個
// 字面空白字元,讓 Playwright toHaveText 的正規化文字仍是「篩選 ⋅N」。
// 同步樞紐:地圖 chips(日期／程度／直接加入)、主鈕徽章 N、以及 sheet 開著時的
// sheet 控件,四者都只從這裡的單一 filters 寫入,不論觸發來源是地圖還是 sheet 本身。
function renderFilters(filters) {
  renderMapFilterToolbar(filters);
  activeFilterSheet?.setFilters(filters);
}

// 批 C1 Task 3:openFilterSheet 的接線層包裝,接在 #filter-sheet-open 主鈕上。
// 回傳值存進 activeFilterSheet,讓 renderFilters 能在 sheet 開著時把地圖端變動鏡像進去。
function openFilters(handlers = {}) {
  return openFilterSheet({
    filters: latestFilters ?? undefined,
    courts: getAppState().courts,
    resultCount: getController()?.getVisibleSessions?.().length ?? 0,
    onSetFilter: (field, value) => getController().setFilter(field, value),
    onReset: () => getController().resetFilters(),
    onClose: (detail) => {
      activeFilterSheet = null;
      handlers.onClose?.(detail);
    },
  });
}

export function wireFilters() {
  configureMapFilterToolbar({
    onOpenFilter() {
      activeFilterSheet = openFilters();
    },
    onSetFilter(field, value) {
      getController().setFilter(field, value);
    },
  });
}

/** Synchronize the toolbar, open sheet, and result count from one controller snapshot. */
export function syncFilterToolbar(filters, resultCount) {
  latestFilters = filters;
  renderFilters(filters);
  activeFilterSheet?.setResultCount(resultCount);
}
