# 長列表批定稿回報（後半）：F4-7 資料層上限與定序契約

- 日期：2026-08-25
- 開工 HEAD：`d019a29`（派工單 commit；實作基準位於 `b378c33` 之後）
- 實作 commit：`08e359f`（`perf(data): cap and order long-list queries`）
- 狀態：四查詢、mock 等價路徑、pgTAP、前端 fail-closed guard 與全部收尾矩陣完成
- 本檔依派工要求不列入實作 commit，保持 uncommitted；未 push

## 1. 四查詢契約

上限集中於 `src/data/repositories/listQueryLimits.ts`。採用派工單全部預設值，沒有異議。

| 查詢 | query-time order／tie-break | limit | mock 語意 | rows == limit |
| --- | --- | ---: | --- | --- |
| `session_discovery` | `start_at ASC, session_id ASC` | 200 | 同序排序後 `slice(0, 200)` | dev console 警示 |
| `player_directory` | `nickname ASC, profile_id ASC, court_id ASC` | 200 | 同序排序後 `slice(0, 200)` | 靜默 |
| `my_session_participations` | `updated_at DESC, session_id DESC` | 100 | mock 固定回空，天然不超限 | 靜默 |
| `session_message_feed` | `created_at DESC, message_id DESC` | 最新 200 | mock 固定回空，天然不超限 | 靜默 |

### `player_directory` 選序與實際 row key

UI 並未依賴 repository 到達序：`playerDirectoryRows()` 先按 profile 聚合，再明確以「在場優先、
暱稱」排序。repository 採 `nickname` 主序，可讓截斷集合與非在場時的既有可見排序方向一致；
再以 key 定序，不會改變正常量級的 UI 呈現語意。

實際 view 是每個 `(profile_id, court_id)` 一列，同一位有多個常打球場時 `profile_id` 會重複。
因此單用 `profile_id` 並非 row-level tie-break；本批使用既有 `(profile_id, court_id)` 複合唯一鍵，
並以 pgTAP 對非空掃描集證明。無需新增欄位或 migration。截斷點理論上可能落在同一 profile 的
多個球場列之間；這是 row safety valve 的既有限制，分頁／profile-level RPC 不在本批範圍。

### My Sessions tie-break

`my_session_participations` 對單一 viewer 每局只有一列；view 已曝露且實測唯一的 `session_id`
足以完成全序，所以不需要曝露 participation raw primary key，也不需要 migration。

## 2. Chat 最新 200 則與既有呈現

真實查詢改成 `created_at DESC, message_id DESC, limit(200)`，只取最新 200 則；成功後在 mapper
完成後 `.reverse()`，交給 UI 的陣列仍是逐字相同的舊→新順序。unit 使用兩筆由新→舊的假 DB
response，斷言輸出回到舊→新，並逐項斷言兩個 descending order 與 limit。

完整 mock 與 local browser chat journey 均通過，包含 quiet polling、置底相關既有流程、未讀
badge／nav dot 開啟後清除、雙向封鎖後 feed 與 unread 同步、封存唯讀；沒有修改 controller、
chat UI、讀取游標或 data API 簽名。

## 3. 截斷可觀測性決定

- discovery：真實與 mock 路徑在結果列數恰為 200 時，僅於 Vite dev 輸出固定警示
  `[data] session discovery reached its 200-row safety cap`。訊息只有面名與上限，不含 row、
  bounds、暱稱、球場或其他個資。`rows == limit` 只能保守表示「可能截斷」，不宣稱一定有第
  201 列。
- directory：靜默。UI 不提供分頁／載入更多，且後續仍做在場＋暱稱呈現排序；在正常量級遠低
  於 200 時不可感。加 UI 提示會暗示本批未提供的恢復操作。
- My Sessions：靜默。100 是個人生命週期安全閥，遠高於同時有效球局上限；本批不新增 history
  分頁或 UI。
- chat：靜默。產品明確提供最新 200 則作為近期上下文；沒有「載入更舊訊息」能力，本批不新增
  不可操作的提示。

## 4. pgTAP 契約

零 migration；只更新既有 `session_rls.sql`／`session_chat.sql` 計畫數與斷言：

1. `session_discovery`：掃描集 `count(*) > 0`，`session_id` 非 NULL 且唯一。
2. `player_directory`：掃描集非空，`profile_id`／`court_id` 非 NULL，
   `(profile_id, court_id)` 唯一。
3. `my_session_participations`：viewer 掃描集非空，`session_id` 非 NULL 且唯一。
4. `session_message_feed`：per-session 掃描集非空，`message_id` 非 NULL 且唯一。
5. chat 另證明 `created_at` 非 NULL 且 `(created_at, message_id)` 在非空掃描集形成全序。

最終 `npm run test:db`：7 files、804 tests，PASS。

## 5. 前端守門與 canary

新增 `tests/list-query-contract.test.js` 並納入 `test:session-unit`：

- 遞迴來源不是本批需求；query boundary 已集中在兩個 repository，測試直接掃描兩檔並自證
  query-site 掃描集非空。
- 全部 13 個現存 `.from(...)` query site 與固定集合雙向比對。新增任何未分類 query（包括新
  的無 limit 清單）都會因集合漂移而 fail closed；singleton／本批外既有小型 reads 也必須先
  明確分類，不能靜默落地。
- 固定四-view capped set，逐查詢要求精確 `.order(...)` 與 `.limit(CONSTANT)`；另鎖四個常數
  200／200／100／200。
- unit 內含 source-in-memory 雙向 canary，確保 validator 自身對「拔 limit」與「新增未知
  query」皆會 throw。

另依派工要求對真實工作檔做紅→還原→綠：

1. 暫時拔除 discovery `.limit(SESSION_DISCOVERY_LIMIT)`：targeted test exit 1，錯誤
   `loadSessionDiscovery is missing its safety limit`。
2. 還原 limit，暫時新增 `canaryUncappedList()` 讀 `new_uncapped_list` 且無 limit：targeted
   test exit 1，actual 集多出
   `dataRepository.ts:canaryUncappedList:new_uncapped_list`。
3. 移除 canary：`node --test tests/list-query-contract.test.js` 2/2 PASS、exit 0；
   `git diff --check` 同步回綠。

## 6. Mock、凍結面與不在範圍

- discovery／directory 的非 configured 分支已補同序與 `slice`，各以 205 列 unit 證明只回
  200 且 tie-break 穩定。My Sessions／chat 的既有 mock contract 固定回空，天然符合 100／200
  上限，沒有杜撰私人 lifecycle 或 message fixture。
- `src/mockData.js` 與 `tests/*.spec.js` 零修改；完整 mock e2e 全綠。
- 本批相對開工 HEAD 沒有修改 TSX、CSS、`data-testid`、GOLDEN／ME_GOLDEN 或既有 e2e
  assertion。以相同命令比對 `0be31a2..d019a29` 與 `0be31a2..08e359f` 的
  `src tests` 中 `data-testid|GOLDEN|ME_GOLDEN` 變動行，SHA-256 都是
  `9f34bdf4cdf77662ff7849bd9425b3d3a1e4796bdffb6fb44aab3ba77ade1f66`；核可 hunk 未漂移。
- 未改前半 content-visibility containment、UI、controller、殼、`src/dataApi.js` 公開簽名、
  RLS、view 欄位、notification／presence／court subscription 查詢。
- 未做分頁、無限捲動、載入更多、hosted migration／部署或 push。

## 7. 最終驗收矩陣

Playwright 全程單 worker、兩套 Playwright 未並發。沒有執行 DB reset；零 migration，因此沒有
hosted 套用事項。`did not run = 0`。

| 指令／檢查 | 結果 |
| --- | --- |
| `npm run test:ci:frontend` | PASS；unit 319/319；mock Chromium 286 passed／4 conditional skipped；build、production bundle、diff check PASS |
| `npm run test:db` | PASS；7 files／804 tests |
| `npm run test:local` | PASS；local API 2/2；Supabase Chromium 45 passed／11 conditional skipped（56/56 accounted for） |
| canary：拔一個 limit | 預期 RED；exit 1；還原 |
| canary：新增未知無 limit query | 預期 RED；exit 1；還原 |
| 最終 targeted guard | PASS；2/2；exit 0 |
| `git diff --check` | PASS；空輸出 |

## 8. 未做／交付狀態

- 未做 UI pagination、infinite scroll、load-more 或 chat history recovery。
- 未加 directory／My Sessions／chat 截斷 UI；理由見 §3。
- 未新增或修改 migration；未重置資料庫、未碰 hosted。
- 未跑非阻擋 WebKit（不在派工收尾矩陣；`did not run = 0` 指指定的三套標準矩陣）。
- 實作已 commit 為 `08e359f`；本回報檔保持 uncommitted；未 push。
