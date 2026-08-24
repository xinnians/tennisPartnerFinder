import { BANDS, countActiveFilters } from "../../filters.js";
import { esc } from "../../util.js";

let getAppState;
let getController;
let openFilterSheet;

/** Configure entry-owned state and the public sessionViews filter adapter. */
export function configureFilterToolbarFeature(dependencies) {
  ({ getAppState, getController, openFilterSheet } = dependencies);
}

// openFilters() 開啟篩選 sheet 時的資料來源,亦是 renderFilters 判斷 badge N 的依據。
let latestFilters = null;

// 批 C1 Task 3:目前開著的篩選 sheet(未開時為 null)。renderFilters 靠它把地圖控件
// 的每次變動鏡像進 sheet;sheet 自己的變動已在 openFilterSheet 內部同步。
let activeFilterSheet = null;

// 篩選 chip「永遠白底無選中態」(dc L106):badge 只在 count>0 時出現,不切換
// is-active——這點與舊版(反相底)刻意不同,見批 D4a 規格。badge 與文字之間留一個
// 字面空白字元,讓 Playwright toHaveText 的正規化文字仍是「篩選 ⋅N」。
function renderFilterSheetButton(filters) {
  const button = document.getElementById("filter-sheet-open");
  if (!button) return;
  const count = countActiveFilters(filters);
  button.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg><span>篩選</span>${
    count > 0 ? ` <span class="filter-chip__badge">⋅${count}</span>` : ""
  }`;
  button.setAttribute("aria-label", count > 0 ? `篩選，已套用 ${count} 組條件` : "篩選");
}

// 同步樞紐:地圖 chips(日期／程度／直接加入)、主鈕徽章 N、以及 sheet 開著時的
// sheet 控件,四者都只從這裡的單一 filters 寫入,不論觸發來源是地圖還是 sheet 本身。
function renderFilters(filters) {
  document.querySelectorAll("[data-date-chip]").forEach((button) => {
    const selected = button.dataset.dateChip === filters.dateKey;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  const levelChip = document.getElementById("level-chip");
  const bandActive = filters.band !== "all";
  levelChip?.classList.toggle("is-selected", bandActive);
  document.getElementById("band-label").textContent = BANDS.find((band) => band.key === filters.band)?.label ?? "全部";
  document.querySelectorAll("[data-band]").forEach((button) => {
    const selected = button.dataset.band === filters.band;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  const instantChip = document.getElementById("instant-only-chip");
  const instantOn = filters.instantOnly === true;
  instantChip?.classList.toggle("is-selected", instantOn);
  instantChip?.setAttribute("aria-pressed", String(instantOn));
  renderFilterSheetButton(filters);
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
  // 日期 chips(dc L102):單選,再點同顆已選中的 chip 會取消(dateKey 回 null)。
  document.querySelectorAll("[data-date-chip]").forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset.dateChip;
      getController().setFilter("dateKey", latestFilters?.dateKey === value ? null : value);
    });
  });

  // 直接加入 toggle chip(dc L105):純布林開關,前置方點恆為 signal 黃(CSS 負責)。
  document.getElementById("instant-only-chip").addEventListener("click", () => {
    getController().setFilter("instantOnly", !(latestFilters?.instantOnly === true));
  });

  const chip = document.getElementById("level-chip");
  const popover = document.getElementById("level-popover");
  document.getElementById("band-options").innerHTML = BANDS.map(
    (band) =>
      `<button type="button" class="band-option${band.key === "all" ? " is-active" : ""}" data-band="${esc(
        band.key
      )}" aria-pressed="${band.key === "all"}"><span>${esc(
        band.label
      )}</span><svg class="band-option__check" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-signal)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg></button>`
  ).join("");
  chip.addEventListener("click", () => {
    popover.hidden = !popover.hidden;
    chip.setAttribute("aria-expanded", String(!popover.hidden));
  });
  document.querySelectorAll("[data-band]").forEach((button) => {
    button.addEventListener("click", () => {
      getController().setFilter("band", button.dataset.band);
      popover.hidden = true;
      chip.setAttribute("aria-expanded", "false");
    });
  });
  // popover 不是 sheet/dialog,不掛 sheets.js 的 focus-trap 機制,得自己攔 Escape。
  // 用 capture(跟 sheets.js onKeyDown 同一招)保證比 sessionViews.js half 抽屜掛在
  // document 的 bubble-phase Escape 監聽器先跑,關掉 popover 後 stopPropagation,
  // 讓那次按鍵不會再往下收合抽屜——popover 開著時 Escape 只該關 popover。
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") return;
      if (popover.hidden) return;
      event.preventDefault();
      event.stopPropagation();
      popover.hidden = true;
      chip.setAttribute("aria-expanded", "false");
    },
    true
  );

  document.getElementById("filter-sheet-open").addEventListener("click", () => {
    activeFilterSheet = openFilters();
  });
}

/** Synchronize the toolbar, open sheet, and result count from one controller snapshot. */
export function syncFilterToolbar(filters, resultCount) {
  latestFilters = filters;
  renderFilters(filters);
  activeFilterSheet?.setResultCount(resultCount);
}
