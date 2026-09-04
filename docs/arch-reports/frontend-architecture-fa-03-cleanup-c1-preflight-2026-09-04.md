# FA-03 push-cleanup Hosted C1 limiter-only canary 前置確認

最後更新：2026-09-04

狀態：**repo／local dormant canary path 已完成；尚未部署、設定 Hosted secret、送 C1 request 或寫 Hosted
limiter table。等待使用者核可下方 exact C1 範圍。**

## 白話結論

C0 已證明 Supabase gateway 會提供兩個一致的來源 IP header，也證明平台會保存 raw IP。C1 的目的只剩一件事：
讓受控 request 實際走一次 Hosted Postgres limiter，確認 Edge→RPC 可用並取得最小 latency 樣本。

這次新增的 dormant mode 只有在以下條件全部成立時才會呼叫 limiter：

1. 確實位於 Supabase Hosted runtime。
2. `PUSH_CLEANUP_RUNTIME_MODE` 精確等於 `hosted-limiter-canary-v1`。
3. method 是 POST。
4. 自訂 header 帶有與 Hosted secret 相同的 canonical 32-byte random token。

其他 request 都維持固定 `503`＋`{"outcome":"RETRY"}`，不會呼叫 limiter。通過授權的 request 也只走 limiter，
不讀 body、不載入 cleanup key、不解密、不 quarantine。回應 body／status 仍相同，只額外帶
`x-qiuka-cleanup-limiter-outcome: ALLOW|LIMIT`，讓受控 runner 能確認 limiter 結果。

## 已完成的 repo／local exact diff

### Runtime gate

- `runtime.js` 新增 exact `hosted-limiter-canary-v1`；本機不能用這個值冒充 Hosted。
- Hosted mode 未設定、拼字不同或 token 不符時，仍停在原 hard gate。
- 正常 `local-test-v1` 與 production-disabled 行為不變。

### Canary authentication

- 新增 request header：`x-qiuka-cleanup-limiter-canary`。
- 設定值與傳入值都必須是 canonical base64url、解碼後精確 32 bytes。
- 比對會走完整 32 bytes，最後清零兩份 decoded buffer。
- Supabase 官方 Function Edge log field reference 的 request-header 欄位沒有列出這個自訂 header。C1 仍會用
  aggregate 查詢確認對應 log field 為空；不會查詢 token 原值。

### Limiter-only response

- 授權成功後只呼叫既有 `consume_push_cleanup_rate_limit`。
- exact `ALLOW`／`LIMIT` 才加入 canary outcome header；RPC error 或非契約值仍是無 marker 的固定 503。
- response 不回傳 IP、HMAC digest、token、policy、DB error 或其他 private material。
- source code 仍禁止 `console.*`，所以 Function application log 不會寫入 canary token 或 limiter digest。

### C0 bundler warning 修正

- `/push-cleanup-key-v1.json` 是瀏覽器公開資產路徑，不是 Edge crypto dependency。
- 已把它從 Edge 會載入的 crypto protocol 拆到獨立 `push-cleanup-public-key-path.js`；browser transport 與 Vite
  generator 改從新檔案 import，URL 與 UI 行為不變。
- 真實 local Edge compile／smoke 會直接檢查不得再出現 `Skipping import path outside source root`。

### 測試等待修正

- 完整 CI 首次執行時，既有 mobile filter-sheet 測試在 React 內容掛載完成前直接讀 DOM，得到空集合；同一畫面的
  failure snapshot 已顯示六組控制項稍後完整出現。
- 測試改用 Playwright locator＋`expect.poll` 等待同一組 `data-filter` 契約，不改 production UI。單案例與完整
  Chromium 回歸重跑都通過。

## 建議的 C1 精確測試向量

只在 canary mode 使用以下 canonical JSON：

```text
{"global":{"capacity":2,"refillMilliseconds":2147483647},"idleTtlSeconds":600,"source":{"capacity":1,"refillMilliseconds":2147483647},"version":1}
```

這些值的用途可以直接由 state machine 推導，不是 production threshold：

- `global.capacity=2`：第一筆成功後仍至少有 1 個 global token，後續 request 能進入 source bucket 判斷。
- `source.capacity=1`：第一筆為 `ALLOW`，後續同來源 request 為 `LIMIT`。
- `refillMilliseconds=2147483647`：這是目前 parser 接受的 PostgreSQL positive integer 上限；在五分鐘最長
  啟用窗內最多只補 `300000 / 2147483647 < 0.00014` token，不可能補滿 1 token。
- `idleTtlSeconds=600`：是五分鐘最長啟用窗的兩倍；即使清理步驟延遲，測試 row 也會很快成為 reaper 可回收
  的 expired row。正常路徑仍會在驗證後立即刪除。

這組值只驗 source limiter。global exhaustion、並行鎖序與 reaper 已由本機 pgTAP／parallel PostgREST 測試覆蓋；
C1 不用額外 Hosted 流量重做壓測。

## 建議的 Hosted 執行範圍

### 事前 fail-closed 條件

以下任一不符就不開始：

- `push-cleanup` 尚未部署。
- limiter table 是 0 rows。
- consent、registry、delivery 仍為 0；legacy Push 4；v2 Push 0；outbox 7／pending 0。
- runtime control 仍是 disabled。
- 下列四個自訂 secret name 目前都不存在。

### 會新增的四個臨時 secret

| 名稱                                  | 值                                          |
| ------------------------------------- | ------------------------------------------- |
| `PUSH_CLEANUP_LIMITER_CANARY_TOKEN`   | 執行時產生的 random 32-byte canonical token |
| `PUSH_CLEANUP_RATE_LIMIT_HMAC_KEY`    | 另一份獨立 random 32-byte canonical key     |
| `PUSH_CLEANUP_RATE_LIMIT_POLICY_JSON` | 上方固定 JSON                               |
| `PUSH_CLEANUP_RUNTIME_MODE`           | `hosted-limiter-canary-v1`                  |

前 3 個先設定，runtime mode 最後才設定，避免設定未完整時進入 canary。值不寫入 repo／文件／shell history；
secret 只存在單一執行程序記憶體與 Supabase Hosted secret store。

既有 `SUPABASE_URL`／`SUPABASE_SECRET_KEYS` 是 Supabase 自動提供的 built-in secrets，不改值。現有 Push／cron
secrets 也不變。

### Deploy 與 request 數量

1. 只部署 `push-cleanup`；mode 尚未設定，所以部署後仍 hard-gated。
2. 設定 token／HMAC／policy，再把 runtime mode 最後設上。
3. 先送 **1 次**沒有 canary token 的空 body POST：必須是 503／RETRY、沒有 outcome header，且 limiter 仍 0 rows。
4. 再從同一來源依序送 **20 次**有正確 canary token 的空 body POST：
   - 20 次都必須是 503／RETRY。
   - 第 1 次 outcome header 必須是 `ALLOW`。
   - 第 2～20 次必須都是 `LIMIT`。
   - 任何 response 最多等 10 秒；這只是 canary runner 的中止界線。C0 兩筆實測為 1.132511／0.798056 秒，
     10 秒不是 production timeout。
5. 從 runtime mode 啟用到停用最多五分鐘；任一步不符就立刻走復原，不再送 request。

20 筆是 nearest-rank p95 至少需要的樣本數；只報 client-observed min／p50／p95／max 與 failure count。
不會把 20 筆樣本稱為 production p99，也不會據此直接設定 production policy／timeout。

總 request 上限是 **21 次**，不會重試。若任一步失敗，剩餘次數直接取消。

### 驗證項目

1. response：未授權 1 次無 marker；授權 20 次為 1 ALLOW／19 LIMIT；全部固定 503／RETRY。
2. limiter DB：exact 2 rows（global 1、source 1）；global tokens 應為 `[1,2)`，source tokens 應為 `[0,1)`。
3. Push DB：consent／registry／delivery、legacy/v2 Push、outbox 與 runtime control 完全維持事前值。
4. platform log：固定時間窗／exact pathname 的 method、status、兩個 raw-IP header presence／equality、request count；
   自訂 canary request header log field 必須為空。SQL 只回傳 aggregate，不 select raw IP 或 token。
5. client latency：只保存 min／p50／p95／max，不保存逐筆 header、IP 或 token。
6. secrets：最終四個自訂 name 全部不存在。
7. Functions：最終只剩 `notification-outbox-dispatch` version 6。

### 固定復原順序

成功或失敗都採相同順序：

1. 先 unset `PUSH_CLEANUP_RUNTIME_MODE`，立即回到 Hosted hard gate。
2. 刪除 Hosted `push-cleanup` Function。
3. limiter table 只有 exact global＋source 兩列且其他基線仍相符時，才在單一 transaction 刪除這兩列；若數量或
   scope 不符，不猜資料來源、不直接刪，停止並回報。
4. unset token／HMAC／policy 三個 secret。
5. 唯讀確認 Function、secret、limiter 與 Push tables 回到事前狀態。

## 本機驗證

目前已通過：

```text
push-cleanup targeted Node tests：33／33
cleanup／Vite asset 相關 Node tests：70／70
TypeScript：通過
targeted ESLint：通過
mobile filter-sheet targeted rerun：1／1
local Edge → limiter → cleanup RPC smoke：1／1，多次重跑皆通過
local Edge compile output：未出現 absolute public-key path warning
npm run test:ci:frontend：通過；Node 508 passed／1 skipped；Playwright 330 passed／4 skipped；build／bundle report 通過
npm run test:ci:supabase：通過；DB 15 files、1,198／1,198；local API 4／4；desktop 45 passed／11 skipped；mobile 6／6；Edge 1／1
git diff --check：通過
```

這些本機結果不等於 Hosted C1 已完成。

## 需要使用者確認

是否核可上方完整 C1：

- 新增 4 個臨時 Hosted secrets。
- 只部署 `push-cleanup`。
- 最多送 21 次空 body POST（1 次未授權＋最多 20 次授權，不重試）。
- 只讀查 platform logs／Push DB；limiter 只產生預期 2 rows。
- 完成或失敗都立即停 mode、刪 Function、條件式刪除 canary limiter rows、移除 4 個 secrets。

本核可不包含 production threshold、正式 cleanup、private key、browser wiring、privacy 文案或 hard gate 移除。

## 官方來源

- [Supabase Logs field reference](https://supabase.com/docs/guides/observability/log-field-reference)
- [Supabase Project Logs API](https://supabase.com/docs/reference/api/v1-get-project-logs)
- [Supabase Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)
- [Supabase Edge Function limits](https://supabase.com/docs/guides/functions/limits)
