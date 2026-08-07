# 批 C1：探索篩選收進 sheet — Design Spec

日期：2026-08-07
狀態：待 user 核可
前置：批 A（計分板換皮）、批 B（quick wins）已驗收。批 C 四項結構重排於拆批時核可，
每項獨立 spec；本篇為 C1。已拍板：地圖保留「日期＋程度」快捷控件；sheet 內**即時套用**。

## 1. 問題與目標

現況（基線審計 high 痛點）：`map-toolbar` 以 absolute 常駐地圖上，行政區、球場、
日期、程度、3 顆打法 chip、3 顆場地型 chip、清除共 10+ 控制項，390px 下 wrap 約
4 列，地圖可視面積被壓縮到不足一半。MVP 供給稀少期，多維篩選常把清單切到空。

目標：地圖上只留「篩選 ⋅N」主鈕＋日期＋程度三個控件（單列），其餘篩選收進
focus-trapped sheet；篩選語意、資料流、`isDefaultFilters` 契約完全不變。

## 2. 行為設計

### 地圖層（map-toolbar 精簡後）

- **「篩選」主鈕**：新增，含 active count 徽章「篩選 ⋅N」。N＝非預設欄位數
  （district、courtId、types、venueTypes 四組各計 1；date 與 band 已在地圖上，
  也計入 N——N 反映「總共套了幾組條件」，與地圖上可見與否無關）。N=0 顯示「篩選」。
  點擊開篩選 sheet。
- **日期**：現行 `input[type=date]` 原樣保留（含清空即取消）。
- **程度**：現行「程度：全部」按鈕＋level-popover 原樣保留。
- 「使用我的位置」（header）、「顯示在線」「球友名單」不屬篩選，位置不動。

### 篩選 sheet

- 以 `sheets.js` 的 `mountSheet` 掛載（既有 focus trap、Escape、關閉還原焦點到
  「篩選」主鈕）。標題「篩選球局」。
- 內容含**全部七組**篩選（行政區、球場、日期、程度、打法、場地型、清除）——
  日期與程度在 sheet 內是地圖控件的同步鏡像，雙向即時同步（同一 controller
  state，無暫存副本）。
- **即時套用**：任何變更立刻走現行 `setFilter` 路徑，背後地圖與抽屜同步刷新；
  關閉 sheet 即完成，無「套用」「取消」鈕。
- 「清除」重設全部篩選（沿用現行 reset 行為），sheet 保持開啟。
- 控件樣式沿用批 A 表單契約（checkbox／select／chip 既有樣式），全部 44px。

### 空狀態與 recovery

- `renderDiscoveryEmpty` 的「清除篩選」按鈕與 `filtersActive` 邏輯不變
  （`isDefaultFilters` 判定含地圖上的 date/band）。
- `drawerRecoveryTarget` 鏈不變；「篩選」主鈕不進 recovery 鏈。

## 3. 實作邊界

- **不動**：`filters.js` 語意與 `DEFAULT_FILTER_STATE`、`setFilter`／controller
  資料流、`dataApi.js`、任何 RPC／view、discovery 查詢語意。
- DOM 變更集中在 `index.html` 的 map-toolbar 區與 `sessionViews.js`／`main.js`
  的篩選渲染與接線；sheet 內控件重用現行 name／id 或明確改名並全庫掃 consumer
  （測試大量以 `#district-filter` 類 id 選取——改動點多，計畫階段列 consumer 清單）。
- 群聊／gate／通知一概不碰。
- a11y 底線：sheet role/label、Tab trap、Escape、trigger 還原（testing.md 既有
  斷言模式）；「篩選 ⋅N」徽章需 aria-label（如「篩選，已套用 2 組條件」）。

## 4. 測試計畫

- 改寫：smoke 現有直接操作 `#district-filter`／chips 的流程改為「開 sheet →
  操作 → 關閉」；performance.spec.js 的 bounds/debounce 斷言不動（資料流未變）。
- 新增：(a) sheet 開關與焦點還原；(b) 即時套用——sheet 內改行政區，背景抽屜
  計數同步變化；(c) count 徽章隨非預設欄位數增減；(d) 地圖／sheet 的日期程度
  雙向同步；(e) 390px 工具列單列（高度斷言）＋44px 掃描含新主鈕。
- `test:mock` 全綠；`test:local` 受影響 journey 修訂後綠。

## 5. 驗收條件

1. 390px 下 map-toolbar 單列（一顆主鈕＋日期＋程度），地圖可視高度較現況顯著
   增加（截圖對照）。
2. 全部篩選功能等價：任一組合在 sheet 路徑下得到與現行相同的探索結果。
3. §4 測試全綠；`git diff --check`／`build` 乾淨。
4. 鍵盤走查：Tab 進 sheet 循環、Escape 關閉、焦點回主鈕。

## 6. 非目標

C2 三段式抽屜、C3 join 單層化、C4 群聊未讀；篩選項目的增減或語意變更；
篩選記憶（跨 session 保存）；桌面版重新布局。

## 7. 假設（user 掃過勾錯）

1. count 徽章計「非預設欄位組數」且含日期／程度（見 §2）。
2. 日期與程度在地圖上維持現行控件外觀（date input＋popover 按鈕），不改為
   chip 造型——造型統一留待實作時視覺對照後微調。
3. sheet 內含全部七組（含地圖已有的日期程度鏡像）；若你偏好 sheet 只含
   「地圖上沒有的」五組，勾此條。
