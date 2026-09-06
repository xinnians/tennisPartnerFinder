# FA-03 dispatcher generation／canary barrier 前置確認

日期：2026-09-07
狀態：repo、local DB 與 Hosted Function 唯讀盤點完成；尚未修改 dispatcher／migration

## 白話結論

目前 production dispatcher 的程式碼**沒有和 repo 對不上**。2026-09-07 實際重新下載 Hosted version 14，
`index.ts` 與 `dispatch.js` 都和 repo 逐 byte 相同。

真正的問題是：Hosted 與 repo 現在都還在跑同一套 legacy dispatcher。它不知道 Push v2 的 generation、canary、
consent、quarantine 或 delivery lease，所以不能直接打開 Push v2。

這不是只改 Edge Function 就能安全完成。v2 要在送出前鎖住資料庫狀態，直到這一次外部 Push request 得到結果；
目前 dispatcher 使用的 `supabase-js` REST 呼叫無法跨外部 request 保持同一個 DB transaction。因此 barrier 需要一份
additive migration，建立最小權限的 DB transaction 邊界，再由新版 dispatcher 使用直接 Postgres transaction 連線。

## Hosted Function 現況已重新查證

2026-09-07 執行唯讀 `functions list` 與 `functions download`：

- `notification-outbox-dispatch`：`ACTIVE`、version `14`、`verify_jwt=false`。
- Hosted `index.ts` 與 repo SHA-256 都是
  `0d618f63deaf3d6042bfdc6f5468088ba5b92ce0a3084b33343496e392b246b6`。
- Hosted `dispatch.js` 與 repo SHA-256 都是
  `69fb037953e84e78ef87e2c4c74015e25ba2ea88478f222533d36d03c84ca717`。
- 兩個檔案都經 `cmp` 確認 byte-identical。

本次沒有 deploy、secret／env 變更、request 或 Hosted DB write。version 14 是先前 cleanup diagnostic 暫時部署造成的
版本號增加；目前下載內容已證明 dispatcher source 沒被改掉。

## 現行 legacy dispatcher 的精確缺口

`supabase/functions/notification-outbox-dispatch/index.ts` 目前會：

1. 一次抓最多 100 筆尚未 `sent_at` 的 outbox，再一次抓所有 recipient 的 subscriptions。
2. 只用 outbox `attempts` 的 compare-and-update 當 claim，沒有 worker generation、worker lease 或 delivery lease。
3. 不讀 `notification_runtime_control`、canary profile、consent、epoch、endpoint registry 或
   `notification_deliveries`。
4. 查詢沒有明確限制 `outbox_format_version = 1`；若 v2 row 被建立，舊 worker 不具備安全處理能力。
5. 呼叫 `web-push@3.6.7` 時沒有傳 TTL、timeout 或自訂 `https.Agent`，所以 TTL 仍是套件預設四週，socket timeout
   仍未設定。
6. 404／410 直接依 endpoint 刪除 subscription，沒有 provider-stale quarantine；delete 失敗也沒有寫進 delivery
   outcome。
7. 任一裝置成功就可能把整筆 outbox 標為 sent；其他裝置的暫時失敗不再有自己的重試狀態。
8. log 仍會寫入第三方 error 的 name、status 與最多 160 字 message，尚未改成固定 code，也沒有 redaction canary。
9. 現有自動測試只直接測 `dispatch.js` 的 5 個純函式案例；沒有 local Edge→DB→mock provider 的 dispatcher
   integration test。

這些是目前 source 的直接結果，不是對 production traffic 的推測。

## 已經存在、可以沿用的 foundation

repo 與已套用的 migration 已有：

- singleton runtime control：generation、disabled／canary／enabled、legacy cutoff 與所有 duration 欄位。
- worker ledger：worker token、generation、lease 與 completed／failed／expired 結果。
- canary profile allowlist。
- per-device delivery ledger：pending／processing／unknown／accepted／cancelled／failed、claim token、lease、attempt。
- consent、epoch、endpoint registry、active transport 與 quarantine command。
- outbox v1／v2 格式、source version、deadline、fan-out 與 outcome 欄位。
- Edge／dispatcher 可共用的 canonical endpoint 與 server-only provider policy parser。

local DB 於本次唯讀查詢仍是：generation `1`、mode `disabled`、legacy writes `true`，所有 duration／attempt policy
都是 null；worker、canary profile、delivery、v2 outbox 與 v2 subscription 都是 0。這符合 dormant foundation，不能被
解讀成 barrier 已完成。

## 為什麼一定需要 migration

目前 `service_role` 對 runtime control、worker、canary 與 delivery raw tables 都沒有權限，而且 repo 沒有 dispatcher
可呼叫的 claim／fresh-check／complete／finalize DB commands。這是刻意的 fail-closed 設計。

要完成 barrier，至少需要 additive migration 提供：

1. worker generation 的 begin／finish／expire command；舊 generation 不得繼續 claim。
2. 依剩餘處理能力 fan-out／claim delivery 的 command，使用 `FOR UPDATE SKIP LOCKED`。
3. send 前在同一 transaction 重讀並鎖住 outbox source、consent、epoch、registry、transport 與 delivery lease。
4. accepted／retry-pending／unknown／cancelled／failed 的 exact completion command。
5. 鎖住 outbox、重讀全部 delivery 後才寫 outcome 的 idempotent finalizer。
6. 專用 `notification_dispatcher` login role，只能執行固定 command；browser roles 與一般 `service_role` 不取得 raw
   table 權限。

依已核可的 Q6-A，dispatcher 還要用一條 checked-out Postgres connection 保持 transaction，外部 request 完成後才
commit／rollback。Supabase 官方的 Edge→Postgres 方式使用 `SUPABASE_DB_URL`；transaction pool mode 要關閉 prepared
statements（`prepare:false`）。這會新增一個 Hosted DB connection secret，但本批尚未建立或設定。

## `web-push@3.6.7` 查證結果

已直接核對 upstream tag `v3.6.7` 的 source：

- `sendNotification(subscription, payload, options)` 接受 `TTL`、`timeout` 與 `agent`。
- `agent` 必須是 `https.Agent`，套件會把它傳入 `https.request()`。
- `timeout` 是 socket idle timeout，不是整個 worker 的總 deadline。
- 預設 TTL 明寫為 2,419,200 秒（四週）。

因此契約要求的自訂 DNS `lookup` 在 library API 上可行；但 Deno Edge runtime 中的 Node compatibility、DNS A／AAAA
全部為 public address、實際 socket 確實使用核可結果，以及 3xx 不跟隨，仍必須用 local canary 實測，不能只靠
upstream source 宣稱完成。

來源：

- [web-push v3.6.7 source](https://github.com/web-push-libs/web-push/blob/v3.6.7/src/web-push-lib.js)
- [Supabase：Connect to Postgres from Edge Functions](https://supabase.com/docs/guides/functions/connect-to-postgres)

## 建議分批，避免一次切壞 production

### D0：source-only dormant core

- 建立固定錯誤分類、policy／DNS／TTL／deadline 純函式與測試。
- 補 local `https.Agent.lookup`、private-IP／mixed A+AAAA、redirect、timeout 與 log-redaction canary。
- 不匯入現行 Hosted 入口、不 deploy、不改 DB。

### D1：additive DB command migration

- 新增上述 worker／delivery／finalizer commands 與最小權限 role。
- 加入真正雙連線的 `dblink` 測試，覆蓋 deadlock，以及 A4 留下的 consent 被搶插、registry 被搶插、cleanup hash
  撞唯一索引三種真併發分支。
- runtime mode、generation、duration、legacy rows 與 cron 全部不改；migration 套用後仍 dormant。

### D2：compatible dispatcher source

- 新 worker 能讀 generation 並記錄 lease，但 production 仍只處理 legacy format 1。
- 所有 DB 結果必檢查、log 固定 code、mock transport 在 production fail-closed。
- 先跑 local Edge／DB／mock provider integration；repo commit 不等於 deploy。

### D3：Hosted canary 與 generation rotation

- 依 local／Hosted canary 證據決定 worker lease、總 deadline、delivery lease、attempt、TTL safety budget；目前不填數字。
- 需要另行核可 DB control write、DB secret、Function deploy、測試 request 數與 rollback。
- 新 generation ready、舊 generation 零 in-flight 後，才允許 canary profile 的 v2 flow。

### D4：legacy cutoff／正式 cutover

- 先重查 pending legacy outbox、legacy subscription 與影響筆數。
- unschedule／cutoff／取消 legacy row 與 enabled rollout 都是另一次不可逆核可，不含在 D0／D1。

## 本批需要的下一個核可

建議下一步先做 D0，接著做 **D1 additive migration**。D1 只新增 dormant command、role 與測試：

- 不改 runtime control 值。
- 不啟用 v2、不中止 legacy dispatcher、不改 cron。
- 不清除／轉換任何 Hosted row。
- 不 deploy Function、不新增 Hosted secret、不發 request。

D0 不需 migration；D1 需要使用者明確允許新增 migration。migration 完成並通過 local CI 後，是否套到 Hosted 還會
再次列出 exact diff 與影響範圍，另行確認。

## 本批邊界

- 只有唯讀 repo／local DB／Hosted Function 查核與文件。
- 沒有修改 runtime、dispatcher、migration、tests、cron 或設定。
- 沒有 Hosted deploy、env／secret、request 或 DB write。
