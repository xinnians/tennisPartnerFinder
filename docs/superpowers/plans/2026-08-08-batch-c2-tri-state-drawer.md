# 批 C2：三段式球局抽屜 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依已核可 spec（`docs/superpowers/specs/2026-08-08-batch-c2-tri-state-drawer-design.md`）把抽屜改為 collapsed／half／full 三段：half 非 modal 且地圖可互動；full 維持現行 modal；含 C1 帶走項。

**Architecture:** 先做無行為變化的三值 enum 遷移（含兩處繞過 setter 的直接賦值——ground truth 意外 1）；再一個原子任務落三段 UI＋63 處測試掃改；新行為測試與帶走項分task收尾。

**Tech Stack:** Vanilla JS＋CSS、node:test、Playwright mock＋local。

## Global Constraints

- 不動 discovery 資料流、dataApi、RPC；不動球局卡內容與 join 流程（C3）。
- full 態的 modal 行為（aria-modal、backdrop、trap、Escape、還原）零變更；half 不 push `modalIsolation`。
- **spec 假設 3 修正**（ground truth 意外：深連結成功路徑不碰 drawerExpanded）：auto-expand→half 的映射只適用兩個真實寫入點——`setMapUnavailable` 與 stale-intent 回退；深連結維持現狀（sheet 蓋在 collapsed 抽屜上）。
- 半開高度過渡：新增單一 `transition: height/max-height`（全檔現況零 transition——刻意極簡風格），必須包 `@media (prefers-reduced-motion: reduce)` 關閉。
- 44px、AA、鍵盤三段可達；`npm run test:session-unit && npm run test:mock` 每任務綠；動到 session.spec.js 補跑 local；精確路徑 add；commit 結尾 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
- Ground truth（行號基於 4be1547）：`/private/tmp/claude-501/-Users-ian-tennisPartnerFinder/a7906f09-9383-4fe2-98ce-34655852d662/scratchpad/c2-ground-truth.md`。

---

### Task 1: 三值 enum 遷移（行為不變）

**Files:**
- Modify: `src/sessionController.js`（`state.drawerExpanded` boolean → `state.drawerState: "collapsed"|"half"|"full"`；`setDrawerExpanded(bool)` 保留為相容 wrapper（true→"full"、false→"collapsed"）＋新 `setDrawerState(value)`；**行 953、1453 兩處繞過 setter 的 `= true` 直接賦值一併改為 `"full"`**）
- Modify: `src/sessionViews.js`／`src/main.js`（view 傳遞點改讀 enum；渲染仍二段：half 值此時等同 full 渲染——暫不可達）
- Test: `tests/session-controller.test.js`（2 處既有斷言改 enum 值＋新增 enum 單元測試）

**Interfaces:**
- Produces: `state.drawerState` 三值 enum＋`setDrawerState`；`view.drawerState` 傳到渲染層。Task 2 前 UI 行為與現況完全一致（點擊仍到 full）。

- [ ] **Step 1: 先改 2 處既有斷言為 enum 語意（紅）**；新增 setDrawerState 單元測試（合法值/非法值忽略/wrapper 映射）。
- [ ] **Step 2: 實作遷移**（含兩處直接賦值；反向 grep `drawerExpanded` 僅剩相容 wrapper 內部）。跑綠。
- [ ] **Step 3: 全套綠（行為零變化——mock 全綠即證明）；Commit** `refactor: 批 C2-1 抽屜狀態三值 enum(行為不變)`。

### Task 2: 三段 UI 原子遷移＋測試掃改

**Files:**
- Modify: `src/sessionViews.js`（renderNearbySessionsDrawer 三分支：half＝`role="region"`＋`aria-label="附近球局"`、無 backdrop、清單頭右側「展開」鈕與「收合」鈕（44px）；full＝現行 dialog 分支原樣；點摘要條→`setDrawerState("half")`；full 的關閉鈕/Escape→collapsed；half 的 Escape→collapsed；`setDrawerModal`/`pushDrawerIsolation` 只在 full 呼叫；手勢：上滑 collapsed→half→full、下滑 full→half→collapsed，沿用既有 pointer 邏輯擴充）
- Modify: `src/session.css`（half 高度 45dvh（假設 1，390×667 實測 ≥1.5 卡）、transition＋reduced-motion、z-index 沿用 drawer 層）
- Modify: `src/main.js`（接線點同步 enum）
- Test: `tests/smoke.spec.js`（37 處）、`tests/performance.spec.js`（10 處）、`tests/session-mobile.spec.js`（2 處）、`tests/session.spec.js`（12＋openPublishedSession helper 5 處間接——helper 集中修）

**Interfaces:**
- Consumes: Task 1 enum。
- Produces: 三段 DOM 契約——half `[data-drawer-state="half"]` 屬性標記（測試錨點）；「展開」鈕 `data-testid="drawer-expand"`、「收合」鈕 `data-testid="drawer-collapse"`。

- [ ] **Step 1: 先改測試（紅）**——凡「點摘要條→斷言 dialog/aria-modal」的流程：改為點擊後斷 half（region、非 inert），需要 full 的再點 `drawer-expand`；`openPublishedSession` helper 一處修正覆蓋 session.spec 5 個呼叫點。帶 --project 抽跑確認紅。
- [ ] **Step 2: 實作三段渲染＋手勢＋isolation 分支＋CSS。**
- [ ] **Step 3: 掃改收斂**——63 處逐處過（ground truth §7 清單），保留原測試意圖；全套 mock 綠。
- [ ] **Step 4: local 雙路徑**——`npm run test:local`＋`supabase-mobile-chromium` 綠。
- [ ] **Step 5: Commit** `feat(ux): 批 C2-2 三段式抽屜(半開非 modal)`。

### Task 3: 新行為測試補齊

**Files:**
- Test: `tests/smoke.spec.js`／`tests/performance.spec.js`（純新增）

**Interfaces:** Consumes Task 2 DOM 契約。

- [ ] **Step 1: 新增（先紅逐條）**——(a) half 地圖可互動：`elementFromPoint` 命中地圖層／pin 可點；(b) half 點 pin→詳情 sheet→關閉→回 half 且焦點還原原卡（沿用 captureRestoreTarget 機制,ground truth §6 說可直接沿用——驗證之）；(c) 上滑兩段/下滑兩段手勢（pointer 模擬,全庫首次覆蓋）；(d) 390×667 half 高度露出 ≥1.5 卡斷言；(e) B2 情境按鈕＋B6 訂閱捷徑在 half 可見可點；(f) auto-expand 兩點（setMapUnavailable、stale-intent）落在 half 的斷言。
- [ ] **Step 2: 全套綠；Commit** `test: 批 C2-3 三段抽屜行為覆蓋`。

### Task 4: C1 帶走項收納

**Files:**
- Modify: `src/main.js`（courts 載入完成前 `#filter-sheet-open` `disabled`＋`aria-disabled`，`loadCourtsImmediately` 完成後啟用）
- Test: `tests/smoke.spec.js`（courts 未載入時主鈕 disabled 斷言——用既有 delayed-hydrate 測試模式；篩選 sheet 專屬 Tab 循環斷言：Tab 從第一控件循環到最後回第一、Shift+Tab 反向）

- [ ] **Step 1: 先紅兩條**；**Step 2: 實作 disabled 閘**；**Step 3: 全套綠；Commit** `fix(ux): 批 C2-4 篩選主鈕 courts 競態閘與 Tab 斷言`。

### Task 5: 批次驗收（orchestrator／user checkpoint）

- [ ] mock 截圖：half 態（地圖＋兩卡同視）、full 態、手勢示意；390×667 半開。
- [ ] 鍵盤走查三段；向 user 回報拍板。

## Self-Review 紀錄

- Spec 覆蓋：§2 狀態機→T1/T2；§3 映射（含修正）→T1/T3(f)；C1 帶走→T4；§5 測試→T2/T3/T4；§6 驗收→T5。假設 1/2/4 落 T2，假設 3 依 ground truth 修正並記於 Global Constraints（深連結不碰抽屜，維持現狀——此為對 spec 的偏離修正，checkpoint 時向 user 揭露）。
- Placeholder：無；63 處測試掃改有 ground truth §7 逐處清單。
- 一致性：`data-drawer-state`／`drawer-expand`／`drawer-collapse` 契約 T2 定義、T3/T4 消費；enum 遷移先行使 T2 diff 聚焦 UI。
- 風險：T2 是最大原子任務（63 測試點）；手勢與高度零既有覆蓋（T3 純新增）；transition 新引入需 reduced-motion 防退化。
