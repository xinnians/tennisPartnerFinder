# 批 C1：篩選收進 sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依已核可 spec（`docs/superpowers/specs/2026-08-07-batch-c1-filter-sheet-design.md`）把探索篩選收進 focus-trapped sheet，地圖只留「篩選 ⋅N」主鈕＋日期＋程度單列；篩選語意與資料流零變更。

**Architecture:** 先建 `countActiveFilters`；再新增 `openFilterSheet`（先無入口、直測保綠）；最後一個原子任務完成工具列精簡＋主鈕接線＋消費端測試掃改。sheet 內控件一律 `data-filter` 屬性選取（不複製既有 id），接線用 sheet 容器 delegation（`wireFilters` 是一次性綁定，動態內容接不到——ground truth 意外 6）。

**Tech Stack:** Vanilla JS＋CSS、sheets.js `mountSheet`、node:test、Playwright mock。

## Global Constraints

- 不動 `filters.js` 語意、`DEFAULT_FILTER_STATE`、`setFilter`／controller 資料流、`dataApi.js`、任何 RPC。
- 地圖上的 `#date-filter` input 與程度按鈕（含 `#level-popover` 機制）**id 與行為原樣保留**——performance.spec.js 6 處 `#date-filter` 斷言因此零改動（ground truth §5）。level-popover 本無外點關閉，不新增（意外 2）。
- sheet 內控件**禁用**既有 id（`#district-filter`／`#court-filter` 等由 `getElementById` 抓取會撞名——意外 4）；一律 `data-filter="district|court|date|band|type|venue"` 屬性＋`name` 無 id。
- `modalIsolation.js:74-89` 的 `.map-toolbar`／`#level-popover` inert 白名單是隱藏 consumer（意外 5）：工具列保留 `.map-toolbar` class；篩選 sheet 走 `mountSurface` 既有隔離，不動白名單語意，改動後跑抽屜展開相關斷言驗證。
- 44px、AA、focus trap／Escape／還原、無 LINE 文案；`npm run test:session-unit && npm run test:mock` 每任務綠；禁 `git add -A`；commit 結尾 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
- Ground truth（行號基於 7cb08df）：`/private/tmp/claude-501/-Users-ian-tennisPartnerFinder/a7906f09-9383-4fe2-98ce-34655852d662/scratchpad/c1-ground-truth.md`——每任務開工先讀對應節。

---

### Task 1: `countActiveFilters`

**Files:**
- Modify: `src/filters.js`（`isDefaultFilters` 旁新增）
- Test: `tests/filters.test.js`（批 B 已建）

**Interfaces:**
- Produces: `countActiveFilters(filters): number`——六組各計 1（district、courtId、date、band、types、venueTypes），非物件回 0；與 `isDefaultFilters` 共用逐欄判斷（抽出 per-field helper 避免兩函式漂移：`isDefaultFilters` 改為 `countActiveFilters(filters) === 0` 或共用內部 helper，實作者擇一記錄）。

- [ ] **Step 1: 先紅測試**——四案：預設回 0；district+date 各設回 2；六組全設回 6；null 回 0。跑 `node --test tests/filters.test.js` 紅。
- [ ] **Step 2: 實作**（含與 `isDefaultFilters` 的共用結構），跑綠；既有 `isDefaultFilters` 四案不退。
- [ ] **Step 3: 全套**——`npm run test:session-unit && npm run test:mock` 綠。
- [ ] **Step 4: Commit**——`feat(ux): 批 C1-1 countActiveFilters`。

### Task 2: `openFilterSheet`（先無入口）

**Files:**
- Modify: `src/sessionViews.js`（新增 `openFilterSheet`，比照 `openPlayerDirectoryList`（2969-3007）的 `mountSheet` 用法）
- Modify: `src/main.js`（暴露開啟函式給後續接線；本任務僅 export／傳 callback，不加 UI 入口）
- Modify: `src/session.css`（sheet 內篩選版面：沿用批 A 表單契約與既有 `.band-option`／chips 樣式，44px）
- Test: `tests/smoke.spec.js`（page.evaluate 直測開啟——批 B Task 3 審查提過的既有直測手法）

**Interfaces:**
- Consumes: controller 的 `getFilters()`／`setFilter`（main.js 傳入 callbacks，維持 main.js 為接線層——renderFilters 系列本就在 main.js，意外 3）。
- Produces: `openFilterSheet({ filters, courts, onSetFilter, onReset, onClose })`——標題「篩選球局」；內容七組（行政區 select、球場 select、日期 date、程度 band chips、打法 chips、場地型 chips、清除鈕），控件全用 `data-filter` 屬性；**sheet 容器 delegation 接線**（change/click 一次綁在 sheet root）；即時套用：每次變更呼叫 `onSetFilter(field, value)` 後以最新 filters 重繪 sheet 內選中態（保留焦點——重繪用值同步而非整段 innerHTML 重建，或重建後還原焦點到同 `data-filter` 節點，實作者擇一並以鍵盤測試證明）。

- [ ] **Step 1: 先紅直測**——smoke 新增：page.evaluate 開 sheet，斷言 role=dialog、標題、七組控件存在（data-filter 選取）、Escape 關閉。跑紅（函式不存在）。
- [ ] **Step 2: 實作**（sheet 骨架＋delegation＋即時套用＋值同步）。跑綠。
- [ ] **Step 3: 直測補即時套用**——sheet 內改 `data-filter="district"`，斷言背景抽屜摘要計數變化（mock 資料有內湖/中山區可分）。
- [ ] **Step 4: 全套綠；Commit**——`feat(ux): 批 C1-2 篩選 sheet(未接入口)`。

### Task 3: 工具列精簡＋主鈕接線＋消費端掃改（原子遷移）

**Files:**
- Modify: `index.html:45-72`（map-toolbar：移除行政區/球場 select、打法/場地型 chips、清除；加 `<button id="filter-sheet-open" class="fbtn">`——實際 class 沿用工具列現行按鈕樣式；保留 `#date-filter`、程度按鈕、`#level-popover`）
- Modify: `src/main.js`（`renderFilters` 改同步「地圖控件＋徽章 N＋sheet 開著時的 sheet 控件」；`wireFilters` 刪除已移走控件的綁定；`#filter-sheet-open` 接 `openFilterSheet`；徽章 aria-label「篩選，已套用 N 組條件」）
- Modify: `src/session.css`（工具列單列布局；700/390 兩段 @media 內 filter 規則清理——僅兩段，460px 段無關（意外 1）；徽章樣式 ink 底 signal 字比照計分板）
- Test: `tests/smoke.spec.js`（22 處掃改，13 處集中在 L98 大測試——重寫為「開 sheet → 操作 → 關閉」流程，保留原測試意圖；badge N 斷言；日期程度雙向同步斷言）

**Interfaces:**
- Consumes: Task 1 `countActiveFilters`、Task 2 `openFilterSheet`。
- Produces: 最終 DOM 契約——map-toolbar 單列三控件；`#filter-sheet-open` 進 tab 序但不進 `drawerRecoveryTarget` 鏈（spec §2）。

- [ ] **Step 1: 先改 smoke L98 大測試為 sheet 流程**（跑紅——sheet 入口不存在）。
- [ ] **Step 2: 實作**（index.html＋main.js＋CSS）。
- [ ] **Step 3: 掃改其餘 smoke 命中**（ground truth §5 清單逐處），新增：badge N 隨欄位增減；地圖 date 改→sheet 開著時鏡像同步、反向亦然。
- [ ] **Step 4: modalIsolation 驗證**——跑抽屜展開＋工具列互動的既有斷言（performance.spec.js 相關案例）綠。
- [ ] **Step 5: 全套綠；Commit**——`feat(ux): 批 C1-3 工具列精簡與篩選主鈕`。

### Task 4: 收尾驗證（RWD＋44px＋單列斷言）

**Files:**
- Test: `tests/session-mobile.spec.js`（44px 掃描擴充含 `#filter-sheet-open` 與 sheet 內控件——順帶收批 B 帶走項：profile sheet 44px 專屬量測）
- Test: `tests/performance.spec.js` 或 smoke（390px 工具列單列：`.map-toolbar` 高度 ≤ 單列閾值斷言）
- Modify: 實測發現的樣式微調（記錄於報告）

- [ ] **Step 1: 先紅斷言**（單列高度＋44px 掃描含新元素）。
- [ ] **Step 2: 微調至綠**；`TENNIS_TEST_HARNESS_MODE=local npx playwright test --project=supabase-mobile-chromium` 綠（Docker up）。
- [ ] **Step 3: 全套綠；Commit**——`test: 批 C1-4 RWD 與 44px 收尾`。

### Task 5: 批次驗收（orchestrator／user checkpoint）

- [ ] mock 模式截圖：精簡後工具列（390px）、sheet 開啟態、badge N 顯示；與批 B 基線對照地圖可視面積。
- [ ] 鍵盤走查：主鈕 → sheet trap → Escape → 焦點還原。
- [ ] 向 user 回報，C1 驗收由 user 拍板。

## Self-Review 紀錄

- Spec 覆蓋：§2 地圖層→T3、sheet→T2、count→T1、§4 測試→T2-T4、§5 驗收→T5。三假設（badge 含 date/band、地圖控件外觀不變、sheet 七組鏡像）皆已核可並落入 T1/T3/T2。
- Placeholder：無 TBD；每任務先紅步驟與錨點齊。
- 一致性：`data-filter` 契約 T2 定義、T3 消費；`#date-filter` 保留使 performance 6 處零改動；delegation 決策對齊意外 6；id 撞名對齊意外 4。
- 風險：T3 是原子遷移（最大任務），先紅步驟鎖住 L98 大測試意圖；sheet 重繪保焦點是 T2 的隱藏難點（批 B Task 4 的 focus 教訓已寫進 Interfaces 要求證明）。
