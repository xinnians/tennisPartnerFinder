# 批 C4：群聊未讀提示 — Design Spec（資料契約＋前端）

日期：2026-08-08
狀態：待 user 核可
前置：批 A／B／C1／C2／C3 已驗收。已拍板：顯示層＝**My Sessions 卡片未讀數字
＋bottom nav 圓點**（徽章數字維持「N 項待處理」語意純度）。
本批是重設計管線唯一動資料庫的批次；資料規則以 `.claude/rules/supabase.md` 為準。

## 1. 問題與目標

現況（基線審計 medium 痛點）：群訊沒有任何站內未讀提示——入口埋在 My Sessions
卡片，訊息更新只靠 visibilitychange 重讀與可關閉的推播；LINE 退役後群聊是唯一
協調面，漏看成本高。`session_message_feed` 無 read cursor，需要新資料契約。

目標：成員知道「哪一局有幾則沒看過的訊息」；開過聊天即歸零。

## 2. 資料契約

### 2.1 新表 `public.session_chat_read_cursors`（browser 不可讀寫）

```text
session_id  bigint  not null  references sessions
profile_id  uuid    not null  references profiles
last_read_message_id  bigint  not null default 0
updated_at  timestamptz not null default now()
primary key (session_id, profile_id)
```

- 對 `anon`／`authenticated` revoke all（比照 `session_messages`／`player_blocks`
  的 raw-table 紀律）；只有 definer RPC 與 view 內部可觸。
- 未讀計數所需索引：確認 `session_messages` 具 `(session_id, id)` 可用索引
  （PK 為 id；如無複合索引，migration 一併補）。

### 2.2 RPC `mark_session_chat_read(p_session_id bigint)`

- security definer；需登入；viewer 必須是該局 host 或 accepted guest
  （與 `session_message_feed` 同一資格檢查）；否則回 `NOT_SESSION_MEMBER`。
- 行為：upsert cursor 至該局當下最大 `session_messages.id`（無訊息則 0）；冪等；
  封存局也可呼叫（清點歷史）。回傳 `OK`。
- 前端呼叫時機：群聊 sheet 的 feed 載入成功後（不是開 sheet 失敗也標）。

### 2.3 未讀曝露：擴充 `public.my_session_participations`

- 加一欄 `unread_message_count`（int）：該局中 `id > last_read_message_id`、
  **排除 viewer 自己發的**、且依既有雙向封鎖可見性過濾（與 feed 同語意——
  數字永不大於 viewer 實際看得到的訊息數）；system 訊息計入（feed 可見即計）。
- 此 view 為 owner-only，加欄無隱私面擴大；訊息本文不進 view，只有數字。
- `session_rls.sql` 的有序欄位 allowlist 字串同步更新（改欄必紅的既有 gate）。

### 2.4 pgTAP（`supabase/tests/session_rls.sql` 或新檔）

- cursor 表對 anon／authenticated 的 select/insert/update/delete 全拒。
- `mark_session_chat_read`：匿名拒；非成員 `NOT_SESSION_MEMBER`；成員 OK 且冪等。
- 未讀正確性：他人發訊 +1；自己發訊不計；標已讀歸零；被封鎖者的訊息不計；
  system 訊息計入；封存局可標。
- allowlist 有序字串更新；掃描集非空；canary 三拍紀律沿用。

## 3. 前端

- `dataApi.js`：`my_session_participations` mapper 加 `unreadMessageCount`；
  新 RPC wrapper `markSessionChatRead(sessionId)`（失敗 best-effort，不阻斷聊天）。
- My Sessions 卡片：「群組聊天」鈕顯示未讀數（如「群組聊天（3）」，
  aria-label 同步；0 則維持原文案）。**注意 label 字串耦合紅線**：
  `sessionViews.js` 對「群組聊天」的判斷點已於 C3 改為結構化屬性
  （`action.kind !== "chat"`），加數字前再驗證零字串比對殘留。
- bottom nav「我的球局」：未讀總數 >0 時顯示小圓點（獨立於數字徽章；
  `aria-label` 併入描述如「我的球局，2 項待處理，有未讀訊息」）；圓點樣式
  計分板 token（signal 底細點）。
- 已讀觸發：群聊 sheet feed 載入成功→呼 RPC→本地樂觀清零該局計數
  （下次 refresh 以權威資料為準——失敗後重讀權威資料的既有紀律）。
- 更新節奏：沿用既有 lifecycle refresh／visibilitychange，無輪詢、無 Realtime。

## 4. 交付邊界（重要）

- **本批交付＝local migration 檔＋pgTAP＋前端＋local 全綠**。
- **hosted 套用不在本批**：屬人工、授權後操作（備份／count preflight、
  migration list 對齊、驗證 allowlist——`docs/mvp-plan.md` release checklist），
  由你執行；文件不得把未跑的 hosted 步驟寫成完成。
- 通知面零變更：`chat_message` push 事件、outbox、payload allowlist 都不動。
- 已套用 migration 不可修改；新 migration 用新 stamp。
- DB 驗證序列（local-first）：`npx supabase start` → guarded reset →
  `npm run test:db` → `npm run test:local`。**執行紀律：整批只有 orchestrator
  可跑 guarded reset，implementer 遇 DB 異常一律回報 BLOCKED_DB**（C3 事故教訓）。

## 5. 測試計畫（前端側）

- mock：卡片未讀數渲染、nav 圓點出現／消失、開聊天後樂觀清零（mock api 層）。
- local：真兩帳號 journey——A 發訊→B 的 participations 未讀 +1→B 開聊天→
  歸零→nav 圓點消失；封鎖情境數字與 feed 一致。
- 牙證硬要求沿用。

## 6. 驗收條件

1. `npm run test:db` 全綠（含新 pgTAP）；`test:mock`／`test:local` 全綠；
   `build`／`git diff --check` 乾淨。
2. 手動走查（local 兩帳號）：發訊→未讀→已讀閉環。
3. hosted 套用清單一頁（migration stamp、驗證步驟）交付給你，不代跑。

## 7. 非目標

已讀回條（對方知道你讀了）、逐訊息已讀、Realtime、推播行為變更、
聊天列表頁、未讀保留策略（封存局未讀凍結顯示即可）。

## 8. 假設（user 掃過勾錯）

1. 「開聊天＝該局全部已讀」（無逐訊息判定）。
2. 未讀計數含 system 訊息、不含自己發的、封鎖過濾與 feed 同語意。
3. 封存局：不再累積新訊息（本就唯讀），已有未讀維持顯示，開聊天同樣歸零。
4. nav 圓點只反映「任一局未讀 >0」，不顯示總數。
