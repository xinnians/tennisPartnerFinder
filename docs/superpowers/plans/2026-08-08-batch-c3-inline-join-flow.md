# 批 C3：加入流程單層化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依已核可 spec（`docs/superpowers/specs/2026-08-08-batch-c3-inline-join-flow-design.md`）把 join 旅程收進詳情 sheet 動作區四態狀態機，`openJoinSessionConfirmation` dialog 退役；含 C2 帶走四項。

**Architecture:** C2 帶走小項先行清場；核心是一個原子任務（四態＋退役＋resume 重接＋測試掃改——resume 路徑現況直開確認 dialog（ground truth 意外 4），dialog 退役與重接必須同 commit）；成功 CTA 的聚焦骨架拆參與新行為測試殿後。

**Tech Stack:** Vanilla JS＋CSS、node:test、Playwright mock＋local。

## Global Constraints

- 不動 dataApi／RPC／gate 語意／封鎖文案；詳情資訊區塊不動，只動動作區。
- 四態切換禁全 sheet innerHTML 重灌（保焦點；就地替換動作區節點）。
- **label 字串耦合紅線**（memory＋ground truth §3）：`sessionViews.js:2033`「群組聊天」與 `sessionController.js:1477`「直接加入」是行為判斷點——動作區重構不得改這兩處字串語意；若重構讓判斷點失效，改用結構化屬性判斷並同 commit 修兩端。
- **牙證是硬要求**（C2 教訓）：每條新測試要嘛先紅、要嘛附突變 canary 三拍逐字輸出；審查會抽驗，缺牙證直接打回。
- 44px、AA、Escape 語意（confirming 退 idle／idle 關 sheet）；每任務 `npm run test:session-unit && npm run test:mock` 綠；動 session.spec 補跑 local；精確路徑 add；commit 結尾 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
- Ground truth（行號基於 f6b47dd）：`/private/tmp/claude-501/-Users-ian-tennisPartnerFinder/a7906f09-9383-4fe2-98ce-34655852d662/scratchpad/c3-ground-truth.md`。

---

### Task 1: C2 帶走四項清場

**Files:**
- Modify: `src/main.js:921,949`（兩個 `setDrawerExpanded(false)` caller 改 `setDrawerState("collapsed")`）＋`src/sessionController.js`（刪 wrapper）
- Modify: `src/sessionViews.js:1695`（half 計數 `<h2>` 加 `aria-live="polite"`——確認節點是計數摘要容器，若 h2 只有標題文字則掛到含計數的子節點）
- Modify: `src/main.js`／`src/sessionViews.js`（level popover Escape：popover 開著時 document Escape 先關 popover 並 stop，不收抽屜；half Escape guard 加排除）
- Test: `tests/smoke.spec.js`（drawer-collapse click 直測——點擊後 `data-drawer-state="collapsed"`；popover Escape 順序斷言）；`tests/session-controller.test.js`（wrapper 反掃連帶斷言修正）

- [ ] **Step 1: 先紅**——collapse click 與 popover Escape 兩條新斷言（popover Escape 現況必紅——結構性缺口）；wrapper 刪除前 grep 全 caller 僅 2 處。
- [ ] **Step 2: 實作四項**；`grep -rn "setDrawerExpanded" src/ tests/` 零殘留。
- [ ] **Step 3: aria-live 牙證**——突變 canary 一拍（拿掉屬性→若無斷言可紅則補一條 attribute 斷言）。
- [ ] **Step 4: 全套綠；Commit** `fix(ux): 批 C3-1 C2 帶走四項(wrapper 退場/aria-live/collapse 直測/popover Escape)`。

### Task 2: 四態狀態機＋dialog 退役＋resume 重接（原子）

**Files:**
- Modify: `src/sessionViews.js`（`openSessionSheet` 動作區四態：idle／confirming（確認送出＋取消＋差異提示：join 型式與 NTRP 事前提示）／submitting／success（三文案＋push prompt 內嵌＋「查看我的球局」CTA——本任務 CTA 先做「關 sheet＋切 My Sessions」不聚焦，聚焦拆參留 Task 3）／error（重試回 confirming）；`openJoinSessionConfirmation`（2105-2221）整函式刪除）
- Modify: `src/main.js:1215`（接線改為 sheet 內狀態機 callbacks）
- Modify: `src/sessionController.js`（`preserveJoinConfirmation` 機制清理——1623 唯一真依賴點；13 處 `closeActiveDetail` 呼叫逐一核對；`resumePendingIntent` join 分支（2126）改為開詳情 sheet 並直接進 confirming——**新接線**，ground truth 意外 4）
- Test: `tests/smoke.spec.js`（53 處）、`tests/performance.spec.js`（3 處）、`tests/session-controller.test.js`（20+ join/resume 單元）、`tests/session.spec.js`（26 處／10 個 journey）、`tests/session-mobile.spec.js`（3 處）

**Interfaces:**
- Produces: 動作區狀態機 DOM 契約——容器 `[data-join-stage="idle|confirming|submitting|success|error"]`；「確認送出」`data-testid="join-confirm"`、「取消」`data-testid="join-cancel"`、成功卡標題 `data-testid="join-success-title"`（tabindex=-1）、CTA `data-testid="join-open-my-sessions"`。Task 3 消費。
- Escape 分層：confirming→idle（sheet 不關）；idle→關 sheet（沿用 mountSheet）。

- [ ] **Step 1: 先改核心 journey 測試為新流程（抽 5 條紅）**——「點申請加入→dialog」改「點申請加入→同 sheet `data-join-stage="confirming"`→join-confirm→success」。
- [ ] **Step 2: 實作**（狀態機＋退役＋resume 重接＋preserveJoinConfirmation 清理）。
- [ ] **Step 3: 全掃收斂**——五個測試檔逐處過；`grep -rn "openJoinSessionConfirmation\|preserveJoinConfirmation" src/ tests/` 零殘留。
- [ ] **Step 4: 雙路徑**——mock 全綠＋`npm run test:local`＋`supabase-mobile-chromium` 綠。
- [ ] **Step 5: Commit** `feat(ux): 批 C3-2 join 四態內嵌與確認 dialog 退役`。

### Task 3: 成功 CTA 聚焦拆參＋新行為測試

**Files:**
- Modify: `src/sessionViews.js`／`src/main.js`（created-session 聚焦骨架拆參：`createdSessionId` 泛化為 `{ sessionId, reason: "created"|"joined" }`，「球局已建立」文案只在 created；joined 聚焦新參與卡無 create 文案——ground truth 意外 6）
- Test: 新增（每條附牙證）：(a) 三種成功結果文案（instant／approval／NTRP 缺／範圍外）；(b) 成功態焦點落 `join-success-title`；(c) CTA 導向 My Sessions 並聚焦該卡（mock＋local 各一）；(d) gate resume 後直接進 confirming（mock 直測＋local 真 gate journey）；(e) confirming Escape 退 idle、idle Escape 關 sheet。

- [ ] **Step 1: 先紅逐條**；**Step 2: 拆參實作**；**Step 3: 雙路徑綠**；**Step 4: Commit** `feat(ux): 批 C3-3 成功導向聚焦與行為測試補齊`。

### Task 4: 批次驗收（orchestrator／user checkpoint）

- [ ] mock 截圖：confirming 差異提示、success 卡（三文案之一＋push prompt＋CTA）。
- [ ] 390px 手動走查：申請全程單 sheet；鍵盤 Escape 分層。
- [ ] 向 user 回報拍板。

## Self-Review 紀錄

- Spec 覆蓋：§2 狀態機→T2；§3 gate/resume→T2（resume 新接線明列）；§4 邊界＋C2 帶走→T1/Global；§5 測試→T2/T3（牙證硬要求入 Global）；§6→T4。四假設（Escape 分層、CTA 文案行為、push prompt 沿用、instant 同兩段）落 T2/T3。
- Placeholder：無；五個測試檔命中數與 journey 清單在 ground truth §7。
- 一致性：`data-join-stage` 契約 T2 定義 T3 消費；CTA 兩階段交付（T2 導向、T3 聚焦）明文標注避免 T2 審查誤判缺件。
- 風險：T2 是本批原子核心（dialog 退役×resume 重接×百餘測試命中）；label 字串紅線入 Global Constraints。
