# FA-03B13.6e Hosted 分段部署前置檢查

日期：2026-09-08

查證時間：2026-09-08 15:03 CST

狀態：**只讀前置檢查完成；尚未套 Hosted migration、部署 Function、改 Secret／cron／runtime，也沒有發 Function request。**

後續狀態：停點 M 已於 B13.6f 完成。實際驗證因 begin function 內含既有 `SELECT ... FOR SHARE`，改用一般 transaction
呼叫後 rollback，而非本文件原定的 read-only transaction；完整結果見
`frontend-architecture-fa-03b13-6f-hosted-disabled-noop-migration-2026-09-08.md`。本文件其餘 40 local／39 Hosted 數字保留為
執行前基線。

## 白話結論

現在不應把所有變更一次推到 production。

本機已具備安全的 disabled v2 dispatcher，但 Hosted 還停在舊 legacy 入口，且少第 40 支 migration。建議把 production 外部動作拆成三個停點：先只套 migration，再只更新 legacy Function，最後才部署預設關閉的 v2 Function。每一步驗收完成後才進下一步。

目前沒有 production v2 資料或待送通知，所以可以清楚驗證「部署沒有誤送、沒有碰 v2」。這是本輪 Hosted aggregate 的實際結果，不是假設。

## 目前 Hosted 實況

### Migration

- linked migration list：40 local／39 Hosted。
- local 最新：`202609080001`；Hosted 最新：`202609070001`。
- `supabase db push --linked --dry-run` 精確只列：
  `202609080001_notification_dispatcher_disabled_noop.sql`。
- dry-run 沒有 seed 或 role 變更。

### Function

- `notification-outbox-dispatch`：ACTIVE，version 41，`verify_jwt=false`。
- `notification-outbox-dispatch-v2-canary`：ACTIVE，version 25，`verify_jwt=false`。
- 正式 `notification-outbox-dispatch-v2`：不存在。
- `push-subscription-v2` 與 `push-cleanup`：不存在。

### Secret 名稱

本輪只讀名稱，沒有讀 value：

- 既有 `NOTIFICATION_CRON_SECRET` 與三個 `WEB_PUSH_VAPID_*` 名稱存在。
- 六個 `NOTIFICATION_DISPATCH_V2_CANARY_*` 名稱存在。
- 正式 `NOTIFICATION_DISPATCH_V2_*` 名稱不存在。
- `WEB_PUSH_TRANSPORT` 不存在。
- 因為 value 沒有被讀取，仍不能宣稱既有 cron secret 符合新 v2 entrypoint 的 32～256 bytes 要求。

### DB／cron aggregate

- runtime：generation 1、dispatch enabled、mode disabled、legacy writes true、legacy handled false。
- worker／request／delivery policy、max attempts、TTL safety budget：全部 null。
- workers 0、deliveries 0。
- Push：4 total／4 legacy／0 v2。
- outbox：7 total／7 format 1／0 format 2；pending format 1／2 都是 0。
- cron 共 4 個；只有 `dispatch-notification-outbox` 指向 legacy Function，schedule `* * * * *`、active。
- 指向正式 v2 Function 的 cron：0。
- 最近 5 筆 legacy cron job run status 都是 `succeeded`；這只證明 DB cron 工作成功排入 HTTP 呼叫，不能單獨冒充 Function HTTP 200。

## Hosted source 與 repo 的精確差異

本輪重新下載 version 41 source 後逐檔比較：

- Hosted legacy `dispatch.js` 與 repo byte-identical；SHA-256 都是
  `69fb037953e84e78ef87e2c4c74015e25ba2ea88478f222533d36d03c84ca717`。
- Hosted legacy `index.ts` SHA-256：
  `0d618f63deaf3d6042bfdc6f5468088ba5b92ce0a3084b33343496e392b246b6`。
- repo legacy `index.ts` SHA-256：
  `37fd11a72d6d717d7b46fee44003c0d268b2af3b8e068f530be2c90df2ea04cb`。
- repo 差異只有已知內容：
  - legacy query 加 `outbox_format_version = 1`。
  - 移除 Hosted legacy 使用 mock transport 的可能性。
  - 加入只允許 local test 的 v2 path；Hosted marker 下不能進入。
  - 排版差異。
- Hosted bundle 內的舊 `v2-runtime.js` 與 repo 相差 B13.6d disabled no-op；Hosted legacy path 會載入 access helper，但不會呼叫
  `runDispatcherV2Batch`。
- repo 多一支 `v2-local-mock.js`，但 Hosted runtime marker 與缺少 `WEB_PUSH_TRANSPORT` 共同阻止它被選用。

針對 legacy／format 隔離的 Node 測試重新執行：16／16 通過。B13.6d 的完整 CI、DB 與 Edge 結果另見上一份報告。

## 建議的三個外部停點

### M：只套第 40 支 migration

範圍：

- 先再跑 linked list 與 dry-run，必須仍只有 `202609080001`。
- 套用該 migration，不部署任何 Function。
- 不改 runtime control、Secret、cron 或資料。

驗收：

- migration 40 local／40 Hosted。
- `pg_get_functiondef` 確認兩個 disabled code 與判斷位置在 worker insert 前。
- 在 read-only transaction 呼叫 begin：預期 `runtime_mode_disabled`；若程式意外嘗試 insert，read-only transaction 必須阻擋。
- workers、deliveries、Push、outbox、runtime control 與 cron aggregate 對照前後；任何非預期差異都停下，不進 A。

### A：只更新 legacy dispatcher

範圍：

- 動作前重新下載 version 41 或當時最新 source，保存 hash 與可回復副本。
- 只 deploy `notification-outbox-dispatch`；不部署 v2、不改 Secret、不改 cron。
- 現有每分鐘 cron 會自動呼叫新版本，因此這一步本身就是 production runtime 變更。

驗收：

- 重新下載 deployed source；`index.ts` 與 `dispatch.js` 必須和核可 repo commit byte-identical。
- 固定時間窗查 exact Function pathname，至少確認兩次 cron HTTP 結果；不能只看 `cron.job_run_details`。
- format-2 query／send 必須為 0；worker／delivery 仍為 0，runtime 仍 disabled。
- legacy pending 若仍為 0，Push／outbox aggregate 應保持基線；若有真實併發資料變化，先停下辨識，不猜成部署錯誤或成功。

回復：

- HTTP 非 2xx、source hash 不符或出現 format-2 路徑時，立即 redeploy 動作前保存的 legacy source。
- 回復後重新下載比 hash，並重查 Function exact-path log 與 DB aggregate。
- Function version metadata 增加是平台部署紀錄，不能回復成舊數字；驗收以 source hash 與 runtime 結果為準。

### B：只部署 disabled v2 Function

這是 A 完成後的另一個停點，不和 A 同批：

- 部署 `notification-outbox-dispatch-v2`，但不設定 mode、DB URL、generation、batch 或 transport。
- 不建立 cron。
- 另經確認後才送一個 data-free request，預期固定 503 且 DB aggregate 完全不變。
- cron secret value／長度、VAPID fingerprint 與 production policy 仍未驗證，不能在 B 直接啟用。

## 本輪沒有做

- 沒有 push Git remote、merge 或 Vercel deploy。
- 沒有 Hosted migration apply。
- 沒有 Function deploy／delete／request。
- 沒有 Secret value read 或任何 Secret mutation。
- 沒有 DB write、fixture、真實 Push、runtime／generation／policy 或 cron 變更。

## 需要確認的下一個動作

建議下一次只執行停點 M，不同時部署 Function。M 通過並留下前後證據後，再單獨回報停點 A 的 production 影響與執行結果。
