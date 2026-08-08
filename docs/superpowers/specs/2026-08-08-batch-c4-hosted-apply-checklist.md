# 批 C4 Hosted 套用清單：group-chat 未讀（session_chat_read_cursors + unread_message_count）

日期：2026-08-08
狀態：**hosted 專屬步驟（§1 preflight 備份與 dump、§2 migration list 對齊、§4 套用、
§5 套用後 hosted 驗證）全數未執行，由 user 人工進行；本頁本身只是清單，C4-3 沒有代跑。
local 端驗證（§3 本機 release gate，含 `test:db` 799 綠、`test:local`／`supabase-mobile-chromium`／
`test:mock`／`build`／`git diff --check`）已在 C4-3 批內完成；`test:db` 數字見 §3 footnote，
mock／local／build 驗證數字見批內 commit 訊息與 task 報告。**
前置：C4-1（DB 契約，commit `73891fc`）、C4-2（前端接線，commit `7cd74db`）、
C4-3（local journey + 本清單）皆已 local 全綠。

## 範圍

- 唯一待套用 migration：`supabase/migrations/202608080001_chat_read_cursors.sql`。
- 內容：新表 `session_chat_read_cursors`（browser 不可讀寫，複合 PK `(session_id, profile_id)`，
  無 identity 欄故無需額外 revoke sequence）、新索引 `session_messages_session_id_idx`
  （`session_messages (session_id, id)`）、新 RPC `mark_session_chat_read(bigint)`、
  `my_session_participations` 重建加一欄 `unread_message_count`（**34 欄**，`[已驗證：
  supabase/migrations/202608080001_chat_read_cursors.sql:97-208` 逐欄計數]`；有序 allowlist
  尾端 11 欄含新欄，鎖在 `supabase/tests/session_rls.sql:379-388`）。
- 通知面、outbox、payload allowlist、`session_message_feed`、`post_session_message`、
  `set_player_block` 定義本批零變更。

## 1. Preflight：備份與 count 記錄

```bash
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p ~/tennisPartnerFinder-backups/$STAMP
supabase db dump --db-url "$HOSTED_DB_URL" -f ~/tennisPartnerFinder-backups/$STAMP/schema.sql
supabase db dump --db-url "$HOSTED_DB_URL" --data-only -f ~/tennisPartnerFinder-backups/$STAMP/data.sql
```

套用前記錄下列表 row counts（比照 `docs/mvp-plan.md`「Hosted migration 執行紀錄
（2026-08-07）」既有格式，寫進 `~/tennisPartnerFinder-backups/$STAMP/preflight.md`）：
`profiles`、`sessions`、`session_participants`、`session_messages`、`notification_outbox`、
`push_subscriptions`、`court_subscriptions`、`courts`、`reports`、`player_blocks`、
`player_presence`。

**本批專屬錨點**：`session_messages` 套用前後總筆數必須完全相同——這個 migration 不寫入、
不刪除任何既有資料列，只新增表、索引、欄與 RPC；`session_chat_read_cursors` 套用瞬間必為
0 筆（新表尚無任何 `mark_session_chat_read` 呼叫寫入過）。

`[參考基準，非本次必須相符]`：2026-08-07 記錄的上一批 preflight（`docs/mvp-plan.md:273-277`）
為 profiles 3、sessions 13、session_participants 22、session_messages 12、
notification_outbox 26、push_subscriptions 3、court_subscriptions 54、courts 85、reports 0、
player_blocks 0、player_presence 0；本次數字會因期間的真實／QA 使用而變動，僅供交叉核對
「有沒有抓錯環境」，不是期望值。

## 2. `npx supabase migration list` 對齊確認

```bash
npx supabase migration list
```

套用前應顯示 local 與 remote 在 `202608060001` 及之前全數對齊，`202608080001` 是**唯一**
pending 項。若出現其他 drift，先回報、不套用。

`[已驗證：本次 agent sandbox 環境執行此指令逾 120 秒無回應，已中止]`——推測需要
`supabase link` 過的專案連結態與 hosted 網路存取，在無 hosted 授權的 sandbox 裡本來就跑
不動；這不是指令本身有問題，執行者在有 hosted 存取權的機器上跑才有意義。

## 3. 套用前置：本機 release gate 全綠

```bash
npx supabase start
CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test
npm run test:db
npm run test:mock
npm run test:local
TENNIS_TEST_HARNESS_MODE=local npx playwright test --project=supabase-mobile-chromium
node scripts/generate-courts-seed.mjs --check
npm run build
git diff --check
```

`[已驗證：2026-08-08，未重置的既有 local DB 上執行 `npm run test:db`]`目前輸出
`Files=7, Tests=799, ... Result: PASS`（含 `session_chat.sql`、`session_rls.sql` 兩檔的
C4-1 新斷言）；套用 hosted 前建議走一次帶 `CONFIRM_LOCAL_DB_RESET=1` 的完整 reset 版本，
數字若不同以當下實際輸出為準，不要套用這裡記錄的數字當期望值。

## 4. 套用

```bash
npx supabase db push
```

只會套用 `202608080001` 一個 migration（其餘皆已在 hosted）。

## 5. 套用後驗證

### 5a. Raw table revoke 抽查（cursor 表）

```bash
curl -sI -H "apikey: $ANON_KEY" \
  "$SUPABASE_URL/rest/v1/session_chat_read_cursors?select=session_id" | head -1
# 預期：HTTP/2 401（body 帶 42501 permission denied）
```

### 5b. RPC 匿名拒

```bash
curl -s -X POST -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"p_session_id": 1}' \
  "$SUPABASE_URL/rest/v1/rpc/mark_session_chat_read"
# 預期：401（42501）。若回 404/42883（函式不存在）代表 migration 沒套用成功，不要繼續。
```

### 5c. `my_session_participations` 34 欄與 `unread_message_count`

此 view 對 `anon` 全 revoke，只 grant `authenticated`，curl 匿名探測不到——併入 5d 的
兩帳號登入流程，從瀏覽器 devtools Network tab 檢查 `my_session_participations` 的實際
REST 回應：確認單筆物件欄位數為 34、且含 `unread_message_count` 鍵。有序 allowlist已由
本機 pgTAP（`supabase/tests/session_rls.sql:379-388`）鎖定新增的 11 欄尾段（含新欄）；
hosted 只需目視核對回應形狀與這份清單一致，不需要重新推導欄位順序。

### 5d. 兩帳號未讀閉環快測

沿用既有兩帳號 hosted QA 帳號（A／B）：

1. A 建一個球局，B 申請加入，A 接受。
2. B 打開一次群組聊天（清空「XX 加入了球局」系統訊息造成的未讀基準線），關閉聊天。
   確認 My Sessions 卡片鈕文案是「群組聊天」（無數字），bottom nav「我的球局」旁無未讀
   圓點（元素 `#my-sessions-unread-dot` 應為 `hidden`）。
3. A 在聊天送一則訊息。
4. B 重新整理 My Sessions（`重新整理` 按鈕或整頁重新整理）：卡片鈕變成
   「群組聊天（1）」，`aria-label` 帶出「1 則未讀訊息」，nav 出現未讀圓點。
5. B 點開聊天：訊息可見；卡片鈕與圓點**不需要**手動整理，就自動回到「群組聊天」／
   無圓點。
6. B 整頁重新整理（真正重打 network，不是沿用記憶體狀態）：未讀仍是 0——這一步是證明
   `mark_session_chat_read` 真的把游標寫進 hosted DB，不是只有前端樂觀清零。

全程檢查瀏覽器 console 無 `console.error`／`pageerror`。

## 6. 回滾原則

- **已套用的 migration 不可修改**（`.claude/rules/supabase.md`、專案既有慣例一致）。
- 若 5a–5d 任何一項失敗：**不要**手動改 `202608080001_chat_read_cursors.sql`，也不要直接
  在 hosted DB 手動下 DDL 修補；改為開一個新 stamp（`202608080002_...` 起算）的修正
  migration，走同一套「preflight → migration list 對齊 → 套用 → 驗證」流程處理。
- 本 migration 不刪除、不覆寫任何既有資料列，資料層面沒有需要還原的破壞性變更；唯一可能
  要處理的異常是權限套錯（例如 5a／5b 意外回 200），屬於權限修正 migration，同樣不可改
  本檔，開新檔修正。

## 7. 明確排除於本批（未做）

- Edge Function `notification-outbox-dispatch` 未重新部署（本 migration 不動 outbox／payload
  allowlist）。
- cron job（`expire-stale-tennis-sessions`）未重新確認，不在本 migration 範圍。
- 十種通知事件、`session_message_feed`、`post_session_message`、`set_player_block` 的既有
  hosted 行為本批不重驗，定義皆未變動。

---

執行後應把結果（preflight counts、migration list 前後對照、5a–5d 逐項結果）比照
`docs/mvp-plan.md`「Hosted migration 執行紀錄」既有段落格式（例：2026-08-07 訂閱上限＋
信任數字段落）記錄回 `docs/mvp-plan.md`，不要只留在本檔。
