# FA-03B12.8 Push v2 Edge HTTP／Auth／DB 本機整合報告

日期：2026-09-07
狀態：完成（只限本機；正式環境保持關閉）

## 白話結論

這一批把 Push v2 的本機 Edge 入口接完整了。

本機測試現在可以真的走完這條路：

1. browser 送出加密的 Push subscription。
2. Edge 用 Supabase Auth 確認 bearer token 對應的使用者。
3. Edge 解密資料，再用 server-only provider allowlist 檢查 endpoint。
4. Edge 用 service role 呼叫既有的 enable／refresh DB RPC。
5. DB 成功提交後，Edge 才回傳精確的 committed 結果。

正式 App 還沒有接這條路；Hosted 執行時也會固定回 `503 unavailable`。因此這份結果不能解讀成
production Push v2 已啟用。

## 實際完成內容

### Edge handler

- 新增 `supabase/functions/push-subscription-v2/handler.js`。
- 只接受 exact allowlisted Origin、`POST`／`OPTIONS`、指定 JSON content type 與 identity content encoding。
- request body 依 v1.3 envelope 上限逐段讀取；超長、非 UTF-8、非 canonical JSON 都在 Auth／DB 前拒絕。
- bearer token 只交給 Auth `/auth/v1/user` 驗證，不把 Supabase API key 當成使用者身分。
- Auth rejection 回 `401 unavailable`；Auth 或其他依賴不可用回 `503 unavailable`。
- 解密時以已驗證的 `authUserId` 作 AAD；server-only provider policy 在解密後完整重驗 endpoint。
- foreign provider 在 DB 前回 `409 endpoint-unavailable`。
- enable／refresh 只接受 DB 回傳的 exact v1 command result；未知欄位、型別或 binding drift 都不穿過 Edge 邊界。
- handler 沒有 log、retry、timeout、backoff、timer 或 scheduler。

### Auth／DB adapters

- 新增 `supabase/functions/push-subscription-v2/adapters.js`。
- Auth 使用 `GET /auth/v1/user`；user bearer token 保留在 `Authorization`，anon key 只放 `apikey`。
- DB 只用 service role 呼叫既有的：
  - `enable_push_device_v2`
  - `refresh_push_transport_v2`
- service key 支援目前 Supabase 提供的 `SUPABASE_SECRET_KEYS.default`，並保留既有
  `SUPABASE_SERVICE_ROLE_KEY` 相容路徑。
- server-only 設定名稱固定為：
  - `PUSH_SUBSCRIPTION_V2_PRIVATE_JWKS_JSON`
  - `PUSH_PROVIDER_ORIGINS_V1`
  - `WEB_PUSH_VAPID_PUBLIC_KEY`
- HTTP Supabase URL 只在明確的 local-test composition 允許；一般 composition 仍要求 HTTPS。

### runtime gate

- 新增 `supabase/functions/push-subscription-v2/runtime.js` 與 `index.ts`。
- 只有非 Hosted 且 exact `PUSH_SUBSCRIPTION_V2_RUNTIME_MODE=local-test-v1` 才建立 handler。
- 偵測到 `DENO_DEPLOYMENT_ID` 或 `SB_REGION` 時，不論 mode 為何都不會啟用；固定回
  `503 {"kind":"unavailable","version":1}`。
- `supabase/config.toml` 對此 Function 設定 `verify_jwt = false` 是刻意的：OPTIONS 與 401／503 分類由 handler
  自己負責，且 handler 仍會向 Auth `/user` 做 authoritative verification。這不是略過使用者驗證。

### CI 與真實本機 Edge smoke

- 新增 handler 單元測試 9 項、adapter／runtime／governance 測試 7 項。
- 新增 `test:local:push-subscription-v2-edge`，並納入 `test:ci:supabase`。
- 真實本機 smoke 使用測試專用 provider `https://push-fixture.qiuka.tw`，不是 production 設定。
- smoke 實際驗證：
  - 真實使用者 JWT 經 Auth `/user`。
  - 加密 enable 經 server policy、Edge 與真實 A4 RPC 寫入本機 DB。
  - refresh 重送同一版本時得到相同 committed snapshot。
  - foreign provider 回 `409 endpoint-unavailable`，且不進 DB。
  - 無效 JWT 回 `401`。
  - 惡意 Origin suffix 回 `503`。
  - Edge output 不含 JWT、cleanup token hash、endpoint 或 private JWK material。
- fixture 完成後會移除自己的 canary profile、測試使用者與 Push 資料，並恢復 runtime control 原值。

## 實測時找到並修正的問題

### 本機 Supabase 內部 URL

Edge container 取得的是本機 Supabase 的 canonical HTTP 內部 URL，不一定是 loopback hostname。原本 adapter
一律拒絕此 URL，導致本機請求在 provider gate 前回 `503`。

現在只有通過非 Hosted exact local mode gate 後，adapter 才收到 `localTestEnabled: true` 並允許 HTTP。
Hosted 或一般 composition 仍不能因此接受 HTTP。

### fixture teardown 的 NULL 快照

原本 SQL 用字串串接 runtime control 快照，PostgreSQL 的 `NULL` 會讓欄位消失。已改用
`json_build_object`，明確保留每個 null 欄位；連跑兩次 Edge smoke 都成功還原狀態。

### 既有 court subscription E2E race

完整 CI 額外揭露一個與 Push v2 handler 無關的既有測試 race：測試連續點兩個會自動存檔的 checkbox，沒有等待
第一筆權威 DB save 完成。已只修正測試等待條件，production code 未改，獨立 commit 為 `dc6b947`。

## 驗證結果

```text
Push v2 handler／adapter targeted：16／16 passed
npm run test:ci:frontend：
- Node 578 passed／2 skipped（580 tests）
- Playwright 348 passed／4 skipped
- build 509 modules

npm run test:ci:supabase：
- DB 1,198／1,198
- local API 4／4
- desktop 45 passed／11 skipped
- mobile 6／6
- cleanup Edge 1／1
- Push v2 Edge 1／1

git diff --check：通過
Hosted deploy／migration／env／secret／request／DB write：未執行
```

production bundle 沒有變化：main `647,304／190,390`、最大 lazy `16,476／4,829`、total
`849,928／260,555` raw／gzip。total gzip 仍依 D8 只報告，超過目前參考值 1,493 bytes；這一批沒有把數字調高。

## 仍未完成的範圍

- 正式 App 尚未 import Push v2 local composition。
- browser transport／coordinator 還沒有對真實本機 Edge 做同一條完整 browser-to-DB 整合測試。
- production Origin、provider origins、VAPID key、RSA key ring 與 Function endpoint 都沒有填值。
- Hosted app-level gate 沒有開啟，也沒有部署此 Function。
- Service Worker、UI、dispatcher、send-time DNS public-IP gate、delivery lease 與 production timeout／TTL policy
  尚未完成。
- 本批沒有 migration，也沒有變更正式資料。

## 下一批建議

下一批做 `FA-03B12.9`：把既有 browser local composition 接到這個真實本機 Edge，完成
browser → encryption → Edge → Auth → A4 DB RPC → local CAS 的端到端驗證。

範圍仍只限本機，不填 production 值、不解除 Hosted gate，也不自行設定 timeout、retry 或排程數字。
