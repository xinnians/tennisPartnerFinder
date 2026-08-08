# 批 C4：群聊未讀 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依已核可 spec（`docs/superpowers/specs/2026-08-08-batch-c4-chat-unread-design.md`，含 2026-08-08 ground truth 修正）落地群聊未讀：read-cursor 資料契約（local migration＋pgTAP）＋前端顯示（卡片數字＋nav 圓點）。hosted 套用不在本批。

**Architecture:** T1 一次交付完整 DB 契約（表＋RPC＋view 加欄＋pgTAP），中途有 orchestrator reset checkpoint；T2 前端接線＋mock 測試；T3 local 兩帳號 journey＋hosted 套用清單文件。

**Tech Stack:** Postgres migration＋pgTAP、Vanilla JS、Playwright mock＋local。

## Global Constraints

- **DB 執行紀律（C3 事故成文）**：implementer 全程禁跑 `db:reset`／`supabase db reset`／`supabase stop|start`；migration 檔寫完回報 `READY_FOR_RESET`，由 orchestrator 執行 guarded reset 後喚回繼續驗證；遇 DB 異常回報 `BLOCKED_DB`＋觀察證據。
- 已套用 migration 不可修改；新 migration stamp `202608080001_chat_read_cursors.sql`（現最新 202608060001）。
- raw-table 紀律：新表對 anon/authenticated revoke all（模式照 `202607270003_session_chat.sql:25-31`；複合 PK 無 identity，無 sequence 可 revoke）。
- 未讀計數 predicate 與 `session_message_feed` **同語意逐字對齊**：成員資格（accepted exists 子查詢）、封鎖過濾（`kind='system'` 放行、`kind='user'` 雙向檢查）——ground truth §2 有原文。
- `mark_session_chat_read` 資格檢查複用 `post_session_message` 模式（`202607270004:495-511`、`NOT_SESSION_MEMBER`、`private.viewer_profile_id()`），但 **`SESSION_ARCHIVED` 分支不照抄**（封存局可標已讀）。
- `my_session_participations` 是 GROUP BY＋aggregate 結構（`202607270002:303-308`）——加欄要在該結構內以子查詢／lateral 計算，不能當簡單 select 改。
- 通知面（outbox/payload/push 事件）零變更；訊息本文不進任何新面；LINE 紅線照舊。
- 牙證硬要求（先紅或突變 canary 三拍）；label 字串紅線；44px/AA；精確路徑 add；commit 結尾 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
- Ground truth（行號基於 3c94965）：`/private/tmp/claude-501/-Users-ian-tennisPartnerFinder/a7906f09-9383-4fe2-98ce-34655852d662/scratchpad/c4-ground-truth.md`。

---

### Task 1: DB 契約（migration＋pgTAP）

**Files:**
- Create: `supabase/migrations/202608080001_chat_read_cursors.sql`
- Modify: `supabase/tests/session_chat.sql`（擴充；先例 `plan(168)` 與 `has_table_privilege` 風格）
- Modify: `supabase/tests/session_rls.sql`（`my_session_participations` 斷言由無序 count(*)=10 升級為有序 11 欄 allowlist 字串）

**Interfaces:**
- Produces: `public.session_chat_read_cursors`（bigint 複合 PK、revoke all、`(session_id, id)` 補在 `session_messages` 的複合索引——現況只有 `(session_id, created_at, id)`，unread 計數用 `id >` 需新索引或實測證明現索引足夠（EXPLAIN 證據入報告，二選一記錄））；`mark_session_chat_read(p_session_id bigint)` definer RPC；`my_session_participations` 新欄 `unread_message_count`。

- [ ] **Step 1: 寫 migration**（表＋revoke＋索引決策＋RPC＋view 重建加欄；view 重建沿用既有 create or replace 全文重寫模式）。
- [ ] **Step 2: 寫 pgTAP**——session_chat.sql 擴充：cursor 表四權限全拒×2 角色；RPC 匿名拒／非成員 `NOT_SESSION_MEMBER`／成員 OK／冪等／封存局可標；未讀正確性六案（他人+1／自己不計／標後歸零／被封鎖不計／system 計入／多局隔離）；plan(N) 數字用指令算。session_rls.sql：allowlist 升級（先確認現行 10 欄順序再加新欄）。
- [ ] **Step 3: 回報 `READY_FOR_RESET`**（列出檔案清單與 plan(N) 新值），等 orchestrator reset。
- [ ] **Step 4（reset 後喚回）: 驗證**——`npm run test:db` 全綠；`npm run test:local` 綠（既有 journey 不退）；牙證：暫時把 view 的封鎖過濾拿掉→pgTAP 紅→還原綠（canary 三拍逐字）。
- [ ] **Step 5: Commit** `feat(db): 批 C4-1 群聊 read-cursor 契約(表+RPC+view 欄+pgTAP)`。

### Task 2: 前端接線＋mock 測試

**Files:**
- Modify: `src/dataApi.js`（`mapMySession` 加 `unreadMessageCount`（`dataApi.js:300-336`）；新 wrapper `markSessionChatRead`；mock 分支給 mock 值）
- Modify: `src/main.js`（api 轉送清單加 wrapper（ground truth 意外：要手動加）；`syncBottomNavigation`（520-542）nav 圓點——`needsActionCount` 數字徽章不動，另加 `unreadDot`；aria-label 併述）
- Modify: `src/sessionViews.js:873` 附近（卡片「群組聊天」鈕加未讀數＋aria；字串模板現況純字串——確認 C3 後判斷點已結構化，加數字不碰判斷）
- Modify: `src/sessionController.js`（`refreshActiveChat`（1141-1166）feed 載入成功後呼 mark＋樂觀清零；**注意該函式重跑頻率高**（visibilitychange 等）——mark 呼叫要冪等節流（同 session 已標過最新 id 不重呼，或依 requestId guard 併入））
- Modify: `src/session.css`（nav 圓點：signal 底細點 token 樣式）
- Test: `tests/session-data-boundary.test.js:189-260`（mapper exact-allowlist deepEqual 更新）＋`:316-337`（api 轉送清單）；smoke：卡片數字渲染／圓點出現消失／開聊天樂觀清零（mock api 攔截）

- [ ] **Step 1: 先紅**——boundary test 的 allowlist deepEqual 加新欄（紅）；smoke 三條新斷言（紅）。
- [ ] **Step 2: 實作**；**Step 3: 牙證**（突變 canary：拿掉樂觀清零→紅）；**Step 4: `test:session-unit`＋`test:mock` 全綠；Commit** `feat(ux): 批 C4-2 未讀顯示與已讀接線`。

### Task 3: local journey＋hosted 交付文件

**Files:**
- Test: `tests/session.spec.js`（新 journey：A 發訊→B participations 未讀 +1→B 開聊天→歸零→圓點消失；封鎖情境數字與 feed 一致）
- Create: `docs/superpowers/specs/2026-08-08-batch-c4-hosted-apply-checklist.md`（一頁：migration stamp、preflight 備份/counts、`migration list` 對齊、套用後驗證（allowlist/raw denial/RPC 授權）——**交付給 user 人工執行，不代跑**）

- [ ] **Step 1: 先紅 journey**（禁 reset；DB 異常回報 BLOCKED_DB）；**Step 2: 實作至綠**（`npm run test:local`＋`supabase-mobile-chromium`）；**Step 3: hosted 清單文件落檔**；**Step 4: `build`＋`git diff --check`；Commit** `test+docs: 批 C4-3 未讀 journey 與 hosted 套用清單`。

### Task 4: 批次驗收（orchestrator／user checkpoint）

- [ ] local 兩帳號手動走查（發訊→未讀→已讀閉環）截圖或斷言證據。
- [ ] 向 user 回報＋交付 hosted 清單；批 C4 驗收由 user 拍板；**驗收即重設計管線收官**。

## Self-Review 紀錄

- Spec 覆蓋：§2 契約→T1（含 ground truth 兩修正落地）；§3 前端→T2；§5 測試→T1/T2/T3；§4 交付邊界→Global＋T3 文件；§6 驗收→T4。四假設落 T1（已讀=全部/計數語意/封存）與 T2（圓點無數字）。
- Placeholder：無；predicate 對齊有 ground truth 原文錨點；plan(N) 禁手數。
- 一致性：reset checkpoint 流程寫進 T1 Step 3-4 與 Global（C3 教訓成文）；索引決策留二選一但要求 EXPLAIN 證據。
- 風險：view GROUP BY 加欄是本批最容易錯的點（Global 已點名）；refreshActiveChat 高頻重跑的 mark 節流在 T2 明列。
