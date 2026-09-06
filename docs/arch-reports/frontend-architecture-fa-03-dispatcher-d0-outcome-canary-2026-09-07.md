# FA-03 dispatcher D0.2 outcome 與 Edge canary

日期：2026-09-07

## 結論

D0.2 已完成，而且仍是 dormant／local-only：

- 新 outcome core 已固定 provider HTTP、transport 不確定、總 deadline 與去敏 log 的行為。
- 新 canary 已在實際 local Supabase Edge Runtime 走完 DNS、IP 檢查、TCP、TLS 與 HTTPS 204。
- 現役 dispatcher 沒有 import 新模組，兩個原始檔 hash 未變。
- 沒有 migration、Hosted deploy、Hosted request、secret/env mutation 或 Hosted DB write。

因此本批沒有啟用 production Push；下一步 D1 才會新增 dormant DB commands 與最小權限 role，而且開始前仍需
migration 核可。

## 實際完成內容

### 1. 固定 outcome，不猜 retry

新增 `supabase/functions/notification-outbox-dispatch/v2-outcome.js`：

- `2xx`：`accepted`，可提交。
- 所有 `3xx`：拒絕 redirect，固定 permanent failure，避免跳到未重驗的位址。
- `404`／`410`：只有 provider policy 已驗證時，才是 endpoint inactive 並要求 provider quarantine。
- `429`：只有合法 `Retry-After` 才能排下一次；缺少或格式錯誤時保持不可提交。
- `500`／`502`／`503`／`504`：只標成需要 retry policy，不自行填 backoff。
- `408`，或 request 已送出後 transport 中斷：結果未知，不寫成成功或失敗。
- request 尚未送出就失敗：`not-invoked`，仍不自行排程。

目前 DB schema 的 `unknown`／`pending` transition 需要合法 `next_attempt_at`。因為 production retry 數值尚無證據，
本批把這些結果標成 `persistable: false`，避免寫入不合法或臆測的 DB 狀態。

`Retry-After` 依 RFC 9110 接受 delta-seconds 與三種 HTTP-date；日期由程式嚴格拆解與驗證，不使用寬鬆的
`Date.parse`。錯誤星期、無效日期／時間會拒絕；RFC 850 兩位數年份依「若看起來超過未來 50 年，回推 100 年」
處理。規格依據：[RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html)、
[RFC 6585](https://www.rfc-editor.org/rfc/rfc6585.html)。

### 2. 總 deadline 與去敏 log

- deadline 是 caller 必須明確注入的正整數毫秒，沒有 production 預設值。
- deadline 到時會 abort；只保留 request 是否已被呼叫，不讓 raw error、endpoint 或 token 穿過 outcome boundary。
- log record 只接受固定 code、count、HTTP status 三欄，多欄、未知 code 或原始 error 一律拒絕。

### 3. Edge transport 實測與修正

先在 local Supabase Edge Runtime 1.74.3 實測 Node `https.Agent.lookup`。HTTPS request 可以成功，但自訂
`lookup` 的呼叫次數是 0，socket 也沒有可用的 remote address 證據；因此 D0.1 的 Node Agent 只能保留為 Node
core 測試，不能當 production Edge DNS pinning 機制。

最終 local-only canary 改走 Deno 原生路徑：

1. 用 `Deno.resolveDns` 取得 A／AAAA。
2. 逐一套用 D0.1 public-address policy。
3. 直接 `Deno.connect` 到已驗證 IP，並核對實際 remote address 等於選定 IP。
4. 在同一條 TCP connection 上用 `Deno.startTls`，hostname 仍是原始 provider hostname，保留 SNI 與憑證驗證。
5. 送出單一、bounded、禁止重用 socket 的 `HEAD` request；不跟 redirect。

本機 fixture 是：

- endpoint：`https://www.google.com/generate_204`
- provider origins：只允許 `https://www.google.com`
- DNS resolver：`8.8.8.8`
- total deadline：8,000 ms

這四個值只用於這次可重現 canary，不是 production policy。實測回傳 HTTPS 204、address matched、socket 未重用。
Deno API 依據：[Deno network APIs](https://docs.deno.com/api/deno/network/)。Supabase local Edge 執行與 dependency
能力依據：[Local development](https://supabase.com/docs/guides/functions/development-environment)、
[Dependencies](https://supabase.com/docs/guides/functions/dependencies)。

### 4. Hosted 保護

canary 只有在以下條件同時成立才可執行：

- 沒有 `DENO_DEPLOYMENT_ID`。
- 沒有 `SB_REGION`。
- runtime mode 精確等於 `local-test-v1`。

任一 Hosted marker 存在都固定回 unavailable。這支 function 沒有 production 設定，也沒有部署到 Hosted。

## 驗證結果

```text
targeted D0 tests：17 passed／1 skipped（local Edge 未帶環境時跳過）
local dispatcher Edge canary：1 passed
npm run test:ci:frontend：
  Node 604 passed／3 skipped（607 tests）
  Playwright 348 passed／4 skipped（352 tests）
  typecheck／ESLint／Prettier／build／bundle structural checks／git diff --check 全部通過
npm run test:ci:supabase：
  pgTAP 1,198／1,198
  local API 4／4
  desktop 45 passed／11 skipped
  mobile 6／6
  cleanup Edge 1／1
  Push v2 Edge 1／1
  dispatcher v2 Edge canary 1／1
production bundle：852,758 raw／261,346 gzip（D8 development report-only，數值未變）
```

現役 dispatcher SHA-256：

```text
index.ts    0d618f63deaf3d6042bfdc6f5468088ba5b92ce0a3084b33343496e392b246b6
dispatch.js 69fb037953e84e78ef87e2c4c74015e25ba2ea88478f222533d36d03c84ca717
```

## 尚未做，也不能當成已完成

- production provider origins、DNS resolver、deadline、TTL safety budget 都尚未設定。
- 非 `429` transient 與 unknown 的 retry schedule 尚無 production 證據，因此沒有寫死數值。
- D1 的 worker／delivery／finalizer commands、直接 Postgres transaction 與最小權限 role 尚未新增。
- D2 production adapter 尚未把 Web Push request details 接到 Deno native pinned TCP/TLS。
- 沒有 generation rotation、Hosted canary、active dispatcher 切換或 legacy cutoff。
- Push service 的 404／410 表示 expired subscription 的規格依據是
  [RFC 8030](https://www.rfc-editor.org/rfc/rfc8030.html)；實際 provider policy 仍須在 D2／D3 以目標 provider
  與 Hosted canary 再確認，不能只靠通用規格直接啟用。

## D1 migration 待核可範圍

D1 預計只新增 dormant DB 能力：

- worker claim／lease command。
- delivery claim／result command。
- finalizer command。
- 支援 Q6-A transaction boundary 的最小權限 database role／grants。
- pgTAP、真實並行測試與 generated types。

D1 不會：

- 改 runtime control 值。
- 啟用 scheduler／cron。
- deploy Edge Function。
- 修改 legacy row 或 v2 資料。
- 執行 Hosted migration；Hosted apply 仍需另外列 exact diff 與影響筆數後再確認。
