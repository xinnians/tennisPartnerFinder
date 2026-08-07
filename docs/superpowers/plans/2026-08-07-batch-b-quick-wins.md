# 批 B：UX Quick Wins＋批 A 殘值清理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依已核可 spec（`docs/superpowers/specs/2026-08-07-batch-b-quick-wins-design.md`）落地 B1-B8：七項 UX quick wins＋批 A 殘值清理。

**Architecture:** 先補一條共用資料線（filters／authenticated／mapStatusKind 進 `renderNearbySessionsDrawer`），B2／B5／B6 都踩在它上面；行為任務各自帶測試更新；B8 收尾擴充 legacy 封條。

**Tech Stack:** Vanilla JS＋CSS、node:test 單元測試、Playwright（mock 5174／local Supabase 5175）。無框架、無 linter。

## Global Constraints

- 不動三級 gate 語意、不動任何 RPC／view 契約、不新增資料面（spec 原則節）。
- 允許小幅 DOM 變更，但欄位 name、驗證、submit payload 不變。
- modal/drawer 的 role/label、Tab trap、Escape、focus 還原斷言必須維持綠（.claude/rules/testing.md）。
- 44px 觸控目標不退；AA 對比不退；mono 禁套中文開頭節點。
- 文案不得引入 LINE／私訊／別城市。
- 每任務結尾：`npm run test:session-unit` 綠 → `npm run test:mock` 綠 →（Task 7 另加 local 路徑）→ 精確路徑 `git add`（禁 `-A`）→ commit（訊息 `feat(ux): 批 B-<n> …` 或 `style:`／`test:` 依內容，結尾加 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`）。
- Ground truth（實讀磁碟的錨點節錄，行號基於 commit 389a8bb）：
  `/private/tmp/claude-501/-Users-ian-tennisPartnerFinder/a7906f09-9383-4fe2-98ce-34655852d662/scratchpad/batch-b-ground-truth.md`——每個任務開工先讀它對應節。

---

### Task 1: 共用資料線（B2/B5/B6 前置）

**Files:**
- Modify: `src/filters.js`（新增 `isDefaultFilters`）
- Modify: `src/sessionViews.js:1569-1583`（`renderNearbySessionsDrawer` 簽名）
- Modify: `src/main.js:461-473`（呼叫端傳線）
- Test: `tests/session-controller.test.js`（或新增 `tests/filters.test.js`）

**Interfaces:**
- Produces: `isDefaultFilters(filters): boolean`（filters.js export；逐欄比對 DEFAULT_FILTER_STATE，含 `types`／`venueTypes` 兩個 Set 的 size＋內容比對）；`renderNearbySessionsDrawer` 新增三個具名參數 `filters`、`authenticated`、`mapStatusKind`（皆有安全預設值：`filters=null`、`authenticated=false`、`mapStatusKind="idle"`），本任務只穿線不改渲染行為。

- [ ] **Step 1: 寫先紅的 `isDefaultFilters` 單元測試**——三案：預設 state 回 true；改 `district` 回 false；`types` Set 多一項回 false。跑紅（函式不存在）。
- [ ] **Step 2: 實作 `isDefaultFilters`**（filters.js，緊鄰 DEFAULT_FILTER_STATE），跑綠。
- [ ] **Step 3: 穿線**——`renderNearbySessionsDrawer` 加三參數（不使用）；`main.js` 呼叫端從 `view` 取 `filters`、`view.mapStatus?.kind`、全域 `authSession` 布林化傳入。渲染輸出不變。
- [ ] **Step 4: 全套測試**——`npm run test:session-unit && npm run test:mock` 全綠（行為零變化）。
- [ ] **Step 5: Commit**（`git add src/filters.js src/sessionViews.js src/main.js tests/<測試檔>`）。

### Task 2: B2 空狀態情境渲染

**Files:**
- Modify: `src/sessionViews.js:1646-1658`（`renderDiscoveryEmpty`）、`:1611`（呼叫點傳參）、`:610-621`（`drawerRecoveryTarget` fallback 順序）
- Test: `tests/smoke.spec.js:1998-2003`（改寫）、`tests/performance.spec.js:250-263`（改寫）、smoke 新增兩情境斷言

**Interfaces:**
- Consumes: Task 1 的 `isDefaultFilters`、`filters`／`mapStatusKind` 參數。
- Produces: `renderDiscoveryEmpty({ filtersActive, isError, ... })` 渲染契約——「清除篩選」僅 `filtersActive`；「重新載入」僅 `isError`；「擴大地圖範圍」「開第一局」恆在。Task 4（B6）將在同函式再加一顆按鈕。

- [ ] **Step 1: 先改既有矛盾斷言為新行為（紅）**——smoke:1998-2003 改為：filter 空狀態下 `#discovery-retry` **不**可見、`#discovery-reset` 可見；performance:250-263 焦點目標 `discovery-retry`→`discovery-expand`。跑 `npx playwright test --project=desktop-chromium -g "<兩測試名>"` 確認紅。
- [ ] **Step 2: 實作**——`renderDiscoveryEmpty` 依 `filtersActive`（呼叫點傳 `filters && !isDefaultFilters(filters)`）與 `isError`（`mapStatusKind === "error"`）條件渲染兩顆按鈕；`drawerRecoveryTarget` 順序改為 `#discovery-retry → #drawer-map-retry → card → #discovery-expand → #discovery-reset → #discovery-first`（讓恆在的 expand 先於條件性的 reset）。
- [ ] **Step 3: 新增兩情境斷言（smoke）**——(a) 預設篩選＋0 場：僅 expand＋first 兩顆；(b) 套日期篩選＋0 場：reset 出現、retry 仍無。
- [ ] **Step 4: 全套測試綠。**
- [ ] **Step 5: Commit**。

### Task 3: B5 首訪文案

**Files:**
- Modify: `src/sessionViews.js:1590-1595`
- Test: `tests/smoke.spec.js` 新增斷言

**Interfaces:**
- Consumes: Task 1 的 `authenticated` 參數。
- Produces: 文案契約——`!authenticated && count === 0` 時 summary-detail 為「找台北市的公開網球球局，看到合適的直接申請加入。」；其餘維持現行兩分支。

- [ ] **Step 1: 先紅斷言**——smoke：未登入 mock 進站、把地圖移到 0 場範圍（或 route 改寫 mockData 為空），斷言 `.nearby-sessions__summary-detail` 含「公開網球球局」。
- [ ] **Step 2: 實作**——`nearest` 三元改巢狀：`sessions[0] ? 現行 : (authenticated ? 現行引導句 : 產品說明句)`。
- [ ] **Step 3: 全套測試綠；Commit。**

### Task 4: B6 空狀態球場訂閱捷徑

**Files:**
- Modify: `src/sessionViews.js`（`renderDiscoveryEmpty` 加按鈕；`notification-settings` h2 加 `tabindex="-1" data-notification-settings-heading`）
- Modify: `src/main.js`（按鈕 wiring：`showMePage` 加 `focusNotificationSettings` 選項，rAF 聚焦新掛點；未登入先走既有登入 intent）
- Test: `tests/smoke.spec.js` 新增斷言

**Interfaces:**
- Consumes: Task 2 的 `renderDiscoveryEmpty` 新結構。
- Produces: 按鈕 `#discovery-subscribe`（文案「有新球局時通知我」，class `session-secondary`，恆在——供給稀少期空狀態正是要它）；`showMePage({ focusNotificationSettings: true })` 聚焦 `[data-notification-settings-heading]`。

- [ ] **Step 1: 先紅斷言**——smoke：空狀態點 `#discovery-subscribe` 後 me 頁可見且 `document.activeElement` 為通知設定標題（比照 performance.spec.js 的 focus 斷言寫法）。
- [ ] **Step 2: 實作**——按鈕＋掛點＋`showMePage` 選項（聚焦機制比照 `sessionViews.js:1452-1458` rAF＋防過期骨架，me 頁較簡單可省世代校驗）；`renderDiscoveryEmpty` 的 onSubscribe 回呼由 main.js 接 `showMePage({focusNotificationSettings:true})`；未登入時按鈕仍導向 me 頁（me 頁本身有登入卡,不另設 gate）。
- [ ] **Step 3: 全套測試綠；Commit。**

### Task 5: B1 徽章計 needsAction 全量

**Files:**
- Modify: `src/sessionController.js:229`（`pendingHostRequestCount` → `needsActionCount: needsAction.length`）
- Modify: `src/main.js:491-502`（取值＋aria-label／badgeStatus 文案改「${count} 項待處理」）
- Modify: `src/sessionViews.js:1308`（groups 預設參數 fallback 改名）
- Test: `tests/session-controller.test.js:559,672,707,929,938,962`、`tests/smoke.spec.js` 全部 `pendingHostRequestCount` 出現點（~14 處）、新增邀請亮徽章斷言

**Interfaces:**
- Produces: `groups.needsActionCount`＝invite＋guest-request＋host-request 總量；舊 key 全庫零殘留（反向 grep 驗證）。

- [ ] **Step 1: 先改單元斷言為新語意（紅）**——session-controller.test.js 六處：斷言值改為該 fixture 的 needsAction 全量（逐 fixture 數 invite/guest-request/host-request，用指令或測試內計算,不手數）；key 改 `needsActionCount`。跑紅。
- [ ] **Step 2: 實作改名與計數**——controller/main.js/sessionViews.js 三處；aria-label：`我的球局，${count} 項待處理`；badgeStatus 同語意。跑綠。
- [ ] **Step 3: smoke fixture 掃改**——`grep -n pendingHostRequestCount tests/smoke.spec.js` 逐處改名（fixture key 與 3 處斷言）；新增斷言：mock groups 含一筆 `canRespondInvite` 邀請、零 host-request 時徽章可見且數字 1。
- [ ] **Step 4: 反向 grep**——`grep -rn pendingHostRequestCount src/ tests/` 0 筆。全套測試綠。
- [ ] **Step 5: Commit。**

### Task 6: B4 建局表單選填摺疊

**Files:**
- Modify: `src/sessionViews.js:2497-2499`（三欄包 `<details class="form-optional"><summary>進階設定（選填）</summary>…</details>`）
- Modify: `src/session.css`（`.form-optional`／summary 樣式：計分板 token、summary 44px 觸控、focus-visible outline）
- Test: `tests/smoke.spec.js:3059-3081`（fill 前先點 summary）、新增摺疊送出斷言

**Interfaces:**
- Consumes: 批 A 表單控件契約（Task 6）。
- Produces: `<details class="form-optional">` 包住 NTRP fieldset＋feeNote＋notes；欄位 name／驗證／`FormData` 讀值不變（ground truth 已證 details 收合不影響 FormData）。

- [ ] **Step 1: 先修既有測試（紅）**——smoke:3059-3081 在 `.fill()` 前加 `await form.locator(".form-optional summary").click();`，先跑確認現在（未實作）紅在「summary 不存在」。
- [ ] **Step 2: 實作 DOM 包裹＋樣式**——summary 為可聚焦原生元素，補 `min-height: 44px`、`font-weight: 700`、展開箭頭沿用瀏覽器預設。
- [ ] **Step 3: 新增斷言**——摺疊不展開直接送出合法必填組合，斷言 submit payload 的 `ntrpMin/ntrpMax/feeNote/notes` 為 null/空預設（走 mock createSession 攔截或既有 session-create-form 純邏輯延伸）。
- [ ] **Step 4: 全套測試綠（Tab trap 測試 performance.spec.js:230-248 特別確認）；Commit。**

### Task 7: B3 常打球場 checkbox 化（含 local e2e）

**Files:**
- Modify: `src/sessionViews.js:2394-2397`（select → checkbox 清單，模板比照 `:255-266`，`data-testid="profile-court-${id}"`）、`:2284-2288`（`profileFormValue` 讀 `input[name='profile-courts']:checked`）
- Modify: `src/session.css`（profile court picker 借 `.option-grid` 樣式＋44px：用 `--stacked` 變體或補 `min-height: 44px`）
- Test: `tests/smoke.spec.js:3007-3048`（select API 整段改寫為 checkbox 互動）、`tests/session.spec.js:290,416`（`selectOption` → checkbox check）、新增等價 payload 斷言

**Interfaces:**
- Produces: checkbox 群 `name="profile-courts"` value=court id；`profileFormValue` 回傳 Set 語意不變；`data-profile-courts-status` hint 與 disabled 骨架（courts 未載入時）行為保留（checkbox 未渲染前顯示載入中）。

- [ ] **Step 1: 先寫 mock 斷言（紅）**——smoke 新增：開 profile sheet 勾兩座球場送出，斷言 save payload courts 陣列等價原 select 行為（沿用該檔既有 save 攔截寫法）。
- [ ] **Step 2: 實作 DOM＋讀值＋樣式**——載入前 placeholder（`disabled` checkbox 或 hint 文案）對齊現行 `disabled` select 的可及性語意；`aria-label="常打球場"` 保留在 group（fieldset legend 已有）。
- [ ] **Step 3: 改寫 smoke:3007-3048**——`selectOption`→`check`、`option:checked`→`:checked` locator、`toBeDisabled` 改斷 hydrate 前後狀態。
- [ ] **Step 4: 改寫 session.spec.js:290,416**——`getByLabel("常打球場").selectOption(...)` → `getByTestId('profile-court-'+courtId).check()`。
- [ ] **Step 5: 驗證雙路徑**——`npm run test:session-unit && npm run test:mock` 綠；Docker up 後 `npm run test:local` 與 `TENNIS_TEST_HARNESS_MODE=local npx playwright test --project=supabase-mobile-chromium` 綠。
- [ ] **Step 6: Commit。**

### Task 8: B8 批 A 殘值清理＋封條擴充

**Files:**
- Modify: `src/session.css:101-108`（漸層 #dfeefa→token 系）、`:119`（`.player-layer-status`）、backdrop `rgba(11,28,50)` 出現點、`#map-data-status--loading/--warning` no-op 刪除、eyebrow 節點套 `var(--font-display)`（逐選擇器列清單入報告）
- Modify: `src/style.css`（`body` 引 `var(--font-body)`）或刪 token（二選一記錄）
- Modify: `index.html`（Plex Mono 補 700）或 mono 節點降 600（二選一記錄）
- Test: `tests/legacy-style-scan.test.js`（BANNED 加 `"20, 44, 75"`、`"11, 28, 50"`；canary 三拍重驗）

**Interfaces:**
- Consumes: 批 A token 層。
- Produces: BANNED 擴充後的封條；rgba 舊 navy 家族全站歸零。

- [ ] **Step 1: 清殘值**——漸層改 `linear-gradient(140deg, var(--color-surface-page), var(--color-info-bg) 58%, var(--color-success-bg))` 級的 token 組合（實作者可微調並記錄）；`.player-layer-status` 底/字/字重全 token 化；backdrop 改 `rgba(18,41,28,…)`（ink 基底）或 token 陰影。
- [ ] **Step 2: BANNED 擴充（先紅→清完→綠）**——加兩條 rgba 字串後跑掃描，若紅代表 Step 1 有漏，清到綠。
- [ ] **Step 3: canary 三拍**——塞 `rgba(20, 44, 75, 0.5)` → 紅 → 移除 → 綠，輸出逐字入報告與 commit 訊息。
- [ ] **Step 4: eyebrow／font-body／Plex 700 三決策落地並記錄。**
- [ ] **Step 5: 全套測試綠（含 contrast-tokens）；Commit。**

### Task 9: 批次驗收（orchestrator／user checkpoint）

- [ ] **Step 1:** mock 模式截圖：空狀態（預設／有篩選兩態）、建局表單摺疊、profile checkbox 清單、徽章亮邀請、我頁聚焦效果。
- [ ] **Step 2:** 390px 走查空狀態→訂閱捷徑→me 頁動線；667px 高視窗確認無整頁捲動（B7 已在 Task 1 前獨立？——B7 在本計畫併入此步驗證，修改本身見下）。
- [ ] **Step 3:** 向 user 回報，批 B 驗收由 user 拍板。

**B7 註記**：`session.css:594` 的 `min-height: 620px` → `min-height: min(620px, calc(100dvh - 60px))` 是單行改動，併入 **Task 8 Step 1** 一起做（同檔同性質），其 Playwright 視窗斷言（667px 高、`document.documentElement.scrollHeight <= window.innerHeight` 級）加進 Task 8 測試步。

## Self-Review 紀錄

- Spec 覆蓋：B1→T5、B2→T2、B3→T7、B4→T6、B5→T3、B6→T4、B7→T8（註記）、B8→T8；共用資料線→T1。三條 user 假設（徽章全量含 guest-request、三句文案、兩個二選一）皆已核可並落入對應任務。
- Placeholder 掃描：無 TBD；每任務有先紅步驟與具體錨點（行號基於 389a8bb，實作時以 grep 重定位）。
- 一致性：`renderDiscoveryEmpty` 的參數契約 T2 定義、T4 擴充（onSubscribe），順序 T2→T4 已排；`needsActionCount` 命名 T5 全庫一致；B7 併 T8 已註記避免孤兒。
- 已知風險：B2 改 `drawerRecoveryTarget` 順序影響焦點回復語意——T2 Step 1 先鎖新行為斷言；B3 是唯一動 local e2e 的任務，T7 Step 5 雙路徑驗證，Docker 現況 up。
