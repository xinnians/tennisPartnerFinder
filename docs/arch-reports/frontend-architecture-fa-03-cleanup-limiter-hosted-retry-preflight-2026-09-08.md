# FA-03 push-cleanup Hosted limiter canary retry preflight

日期：2026-09-08

狀態：**範圍已重新核對；Hosted 尚未執行。**

## 白話結論

來源規則已由 Hosted 的 `POLICY` 結果證明可用。下一步才是真正讓 request 走進 Postgres limiter，驗證 1 次 `ALLOW`、
19 次 `LIMIT`、exact 2 個 bucket row 與完整復原。

本批沿用 2026-09-04 已核可的測試向量。它只是讓結果可預測的 canary 設定，不是 production 限流上限，也不會留在
Hosted。

## 已核對的程式與資料庫行為

- Edge 只有在 Hosted exact mode、POST 與 32-byte canary token 全部成立時才會呼叫 limiter。
- 通過 canary 後只執行 limiter；不讀 body、不載入 cleanup key、不解密、不 quarantine。
- Postgres 固定先鎖 global bucket，再鎖 source bucket；新 request 先建立兩列，只有兩邊都有 token 才一起扣 1。
- source 沒 token 時回 `LIMIT`，不再扣 global token。
- `service_role` 只有 limiter RPC execute，沒有 private limiter table 直接權限。
- 本機 pgTAP、parallel PostgREST、local Edge 與完整 CI 已在 source trust 批次通過。

## 固定 canary policy

```json
{
  "global": { "capacity": 2, "refillMilliseconds": 2147483647 },
  "idleTtlSeconds": 600,
  "source": { "capacity": 1, "refillMilliseconds": 2147483647 },
  "version": 1
}
```

- global capacity 2：第一筆 `ALLOW` 後仍可進 source 判斷，不會先被 global 擋住。
- source capacity 1：同一來源第一筆 `ALLOW`，後面為 `LIMIT`。
- refill 2,147,483,647 ms：Postgres integer 上限；五分鐘內補量小於 0.00014，不會重新補滿 1 token。
- idle TTL 600 秒：是五分鐘最長 canary window 的兩倍；驗證後仍立即 guarded delete。

## 執行前必要基線

任一不符就不開始：

- repo clean，commit 為 no-policy result 之後的已知狀態。
- Hosted Function exact 2，預期 legacy／v2 canary version 37／21，兩個既有 bundle hash exact。
- `push-cleanup` 不存在；Secret 總數 17；`PUSH_CLEANUP_*` 為 0。
- runtime disabled／generation 1。
- Hosted limiter 0；worker／canary profile／delivery／consent／registry／v2 Push／v2 outbox 也都是 0。
- legacy Push 4；outbox 7／0 pending，全部 format v1。
- 執行前另由 DB 取得 server timestamp，guard 不能用 client 時鐘猜 row 歸屬。

## 外部操作上限

### 四個臨時 Secret

1. random canonical 32-byte `PUSH_CLEANUP_LIMITER_CANARY_TOKEN`。
2. 另一份獨立 random canonical 32-byte `PUSH_CLEANUP_RATE_LIMIT_HMAC_KEY`。
3. 上方 exact `PUSH_CLEANUP_RATE_LIMIT_POLICY_JSON`。
4. 最後才設定 `PUSH_CLEANUP_RUNTIME_MODE=hosted-limiter-canary-v1`。

前三個用單一 bulk set；mode 最後獨立設定。值不寫入文件、repo、log 或 command output。

### Function 與 request

1. 前三個 Secret 設定後，temporary deploy `push-cleanup`；mode 未設定時仍 hard-disabled。
2. 設定 mode。
3. 只送 1 個未授權空 body POST；必須為 503／exact `RETRY`、無 outcome／stage，且 limiter 仍為 0。
4. 從同一個 client 程序依序送 20 個已授權空 body POST；每個最多 10 秒，不 retry。
5. 全部必須為 503／exact `RETRY`；第 1 個 outcome `ALLOW`，第 2～20 個 outcome `LIMIT`，stage 全 absent。
6. 任一 response 不符就停止剩餘 request；mode 啟用總窗不超過五分鐘。

總上限 21 requests。20 個授權樣本只報 min／nearest-rank p50／p95／max 與 failure count，不冒充 production p99
或 production timeout。

## DB 與 log 驗收

- 未授權 request 後 limiter exact 0。
- 20 個授權 request 後 limiter exact 2：global 1、source 1；global token `[1,2)`、source token `[0,1)`；兩列
  `expires_at = refilled_at + 600 seconds`，且 `refilled_at` 不早於執行前 DB server timestamp。
- 其他 mutable DB 與 Push／outbox／runtime 基線完全不變。
- `function_edge_logs` exact pathname：21 POST／503。
- `edge_logs` limiter RPC exact path：20 requests。
- log 只讀 count、method、status、時間與來源 header presence／equality aggregate；不讀 raw IP、host、token、digest、
  endpoint、profile 或 payload。

## 固定復原與 guard

不論成功或失敗：

1. 先 unset mode，立即回 hard gate。
2. 刪除 temporary Function。
3. 只有 Hosted limiter 執行前是 0，且現有 row 全部同時符合以下條件，才在單一 `DO` transaction delete：
   - global exact 1、source 介於 1～20，總數等於兩者相加；
   - hash 32 bytes；`refilled_at` 不早於事前 DB timestamp，且不晚於 cleanup transaction；
   - expiry 固定比 refill 晚 600 秒；global token `[0,2)`、source token `[0,1)`。
4. `GET DIAGNOSTICS ROW_COUNT` 必須等於事前驗到的 row 數；否則整個 `DO` 失敗，不會 partial delete。
5. 最後 bulk unset token／HMAC／policy，再獨立重查 Function／Secret／DB／log。

正常成功路徑仍要求 exact 2 rows；較寬的 1～20 source guard 只供異常中途復原，不能拿來把 canary 判成通過。

同一 guard 已在 local transaction 的 temporary table 以 1 global＋1 source 通過，delete 2、remaining 0、最後
rollback。本機既有 limiter 測試資料完全未動。

本次不設定 production policy、不部署正式 cleanup、不讀或清除 Push 資料、不啟用 v2 runtime，也不碰 dispatcher、cron
或 legacy cutoff。
