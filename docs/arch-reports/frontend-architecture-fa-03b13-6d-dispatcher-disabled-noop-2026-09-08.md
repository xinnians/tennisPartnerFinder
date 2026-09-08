# FA-03B13.6d dispatcher disabled no-op

日期：2026-09-08

狀態：**本機實作、migration、真實 Edge／DB 與完整 CI 已完成。程式已提交；Hosted 尚未套 migration，也沒有部署、Secret、cron、request 或 runtime control 變更。**

程式 commit：`da44bab`

## 白話結論

先前如果 v2 Function 設定錯誤而被打開，但資料庫仍是停用狀態，系統可能先建立一筆 worker，之後才發現不能執行，留下假的失敗紀錄。

現在資料庫會在最前面擋下來，直接回「停用」。v2 runtime 收到後也會直接正常結束：不建立 worker、不讀待送資料、不初始化推播 sender、不送通知，也不做 finish。這個行為已用真實本機 Edge Function 與 PostgreSQL 驗證，不是推測。

## 實作內容

- 新增 additive migration `202609080001_notification_dispatcher_disabled_noop.sql`，只替換既有
  `begin_notification_dispatch_worker(bigint)` 的 function body。
- `dispatch_enabled = false` 時回固定 `dispatch_disabled`。
- `new_runtime_mode = 'disabled'` 時回固定 `runtime_mode_disabled`。
- 兩種回應都發生在 generation／policy 檢查與 worker insert 之前。
- 其他 ready、stale、policy validation 與 worker insert／response 路徑維持原有內容。
- v2 runtime 只接受完整且格式正確的 disabled DB contract；缺欄位或未知 code 仍 fail closed。
- dedicated v2 entrypoint 改成第一次真正要送資料時才建立 sender；停用批次不讀 VAPID／provider policy，也不建立 transport。

## 資料庫與權限邊界

- function signature、`security definer`、空 `search_path`、owner 與專用 role execute grant 都保留。
- `public`、`anon`、`authenticated`、`service_role` 仍沒有 execute 權限。
- migration 沒有改 runtime control 值、沒有新增 cron，也沒有碰既有 outbox／delivery／Push 資料。
- 2026-09-08 實際執行 linked migration list：local 40、Hosted 39；Hosted 最新仍為 `202609070001`。
- linked dry-run 精確只列出一支待套 migration：`202609080001_notification_dispatcher_disabled_noop.sql`。

## 驗證結果

### DB／migration

- local DB 從零重播 40 份 migration：通過。
- targeted pgTAP：56／56。
  - runtime mode disabled：回 `runtime_mode_disabled`，worker 0。
  - dispatch disabled：回 `dispatch_disabled`，worker 0。
  - active mode 但 lease 關係不安全：仍回 `runtime_policy_incomplete`。
  - owner、security、ACL 與既有正常派送命令回歸通過。
- 完整 DB：18 files、1,294／1,294 tests 通過。
- local DB lint：`public`／`private`／`notification_dispatcher_api` 0 error。

### runtime／Edge

- targeted Node：20／20。
- 真實 local Edge：2／2。
  - disabled request 回 exact 200 `{"kind":"disabled","version":1}`。
  - worker 數量保持 0，mock provider 在 sentinel 時窗內沒有收到 request。
  - 切回 local canary fixture 後，既有 transaction、send 與 completion path 正常通過。
  - legacy format-1 row 仍保持 `attempts = 0`、`sent_at = null`。

### 完整前端 CI

- Node：741 tests；736 passed、5 skipped、0 failed。
- mock Chromium：386 tests；382 passed、4 skipped、0 failed。
- courts seed、design-system、TypeScript、ESLint、Prettier、build 與 bundle structure 全部通過。
- build：535 modules。
- production bundle 沒有 browser runtime 變更，數值仍為：
  - main raw／gzip／Brotli：653,283／192,738／160,678 bytes。
  - total raw／gzip／Brotli：857,779／263,789／222,464 bytes。
  - 既有 byte 超額依已核可 D8 維持開發期 report-only；結構 gate 通過。

## 明確未做

- 沒有把第 40 支 migration 套到 Hosted。
- 沒有部署 legacy 或 v2 Function。
- 沒有新增、讀取或修改 Hosted Secret value。
- 沒有建立或啟用 v2 cron。
- 沒有發 Hosted Function／production request，也沒有寫 Hosted DB。
- 沒有改 runtime mode、generation、lease、deadline、attempt、TTL、batch 或 legacy cutoff。

## 下一步與停點

repo／local 的 `FA-03B13.6d` 已完成。依 B13.6b 固定順序，下一步進入外部操作前置檢查：

1. 先只讀重驗 Hosted migration、legacy Function source hash、cron 與資料 aggregate。
2. 第 40 支 migration 與 Function deploy 都是 Hosted 外部變更；執行前要把精確目標、驗收與 rollback 再列出。
3. legacy compatible Function 與 disabled v2 Function 必須分開部署、分開驗證，不能一次全推。
4. v2 policy、Secret、cron 與 runtime 啟用仍是後續獨立停點；本批沒有提供可直接採用的 production 數字。
