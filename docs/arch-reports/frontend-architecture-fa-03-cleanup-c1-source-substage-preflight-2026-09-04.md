# FA-03 push-cleanup Hosted source substage 前置確認

最後更新：2026-09-04

狀態：**本機 source substage 與完整 CI 已通過；Hosted 診斷尚未核可、尚未執行。**

## 白話結論

上一輪已把問題縮到 `SOURCE`，但還不知道 Function 內部究竟缺哪個 header，或是否格式無效／兩值不同。

本機已把 `SOURCE` 細分成固定代碼，不回傳任何 header 值或 IP：

| stage                 | 只代表                                          |
| --------------------- | ----------------------------------------------- |
| `SOURCE_HEADERS`      | 收到的 headers 物件不符合標準介面               |
| `SOURCE_CF_MISSING`   | `cf-connecting-ip` 缺少或為空                   |
| `SOURCE_CF_INVALID`   | `cf-connecting-ip` 不是 canonical IPv4／IPv6    |
| `SOURCE_REAL_MISSING` | `x-real-ip` 缺少或為空                          |
| `SOURCE_REAL_INVALID` | `x-real-ip` 不是 canonical IPv4／IPv6           |
| `SOURCE_MISMATCH`     | 兩個 header 都有效，但 canonical 值不同         |
| `SOURCE`              | inspector 回傳未知契約時的 fail-closed fallback |

成功條件沒有放寬：仍必須兩個 header 都存在、都是 canonical IP，且兩值完全相同，才會繼續 limiter。

## 本機變更與驗證

- `inspectTrustedHostedClientAddress` 只在成功時回 canonical address；失敗只回固定 failure code。
- limiter client 將固定 failure code 映射到 allowlisted response stage；未知值仍 fail-closed 為 `SOURCE`。
- production／local cleanup 的既有 `trustedHostedClientAddress` 仍只回成功 address 或空字串。
- 所有 substage、成功 IPv6 canonicalization、未知 fallback 與防偽 handler allowlist 均有測試。

```text
push-cleanup targeted Node tests：34／34
TypeScript：通過
ESLint：通過
Prettier：通過
npm run test:ci:frontend：通過；Node 509 passed／1 skipped；Playwright 330 passed／4 skipped；build／bundle report 通過
npm run test:ci:supabase：通過；DB 15 files、1,198／1,198；local API 4／4；desktop 45 passed／11 skipped；mobile 6／6；Edge 1／1
git diff --check：通過
Hosted deploy／secret／request／DB write：未執行
```

## 建議核可的最小 Hosted 範圍

### 1. 事前唯讀基線

以下任一不符就不開始：

- `push-cleanup` 不存在。
- dispatcher 名稱、ACTIVE、`verify_jwt=false` 與 artifact hash 符合上次復原值；version 數字只記錄，不作等值條件。
- `PUSH_CLEANUP_LIMITER_CANARY_TOKEN` 與 `PUSH_CLEANUP_RUNTIME_MODE` 不存在。
- 前兩輪使用的 HMAC／policy secret names 也不存在。
- limiter 0 rows；consent／registry／delivery 0；legacy／v2 Push 4／0；outbox／pending 7／0。
- runtime control 是 disabled singleton exact 1。

### 2. 只新增兩個臨時 secrets

1. `PUSH_CLEANUP_LIMITER_CANARY_TOKEN`：執行時產生的 random 32-byte canonical token。
2. `PUSH_CLEANUP_RUNTIME_MODE=hosted-limiter-canary-v1`：最後才設定。

本輪不設定 HMAC key 或 limiter policy。因 source 檢查發生在它們之前，這樣可避免不必要的材料與任何 limiter DB 寫入。
若 source 這次意外通過，下一個固定結果只會是 `POLICY`，runner 仍立即停損。

### 3. Deploy 與 request

1. 只部署目前 commit 的 `push-cleanup`；mode 未設定時仍 hard-gated。
2. 設定 token，再獨立設定 mode。
3. 送 1 次沒有 token 的空 body POST：必須 503／exact RETRY，outcome／stage 都 absent，limiter 0。
4. 送 1 次有正確 token 的空 body POST：
   - 預期 503／exact RETRY、outcome absent，stage 是上述 source substage 之一。
   - 若回 `POLICY`，只代表 source 本次通過並停在故意缺少的 policy；仍立即停止。
   - 其他任何結果也立即停止。
5. 每筆最多等 10 秒，mode 最多啟用五分鐘；這些只是 runner 停損，不是 production timeout。

總上限是 **2 requests**，沒有 retry，不執行 latency distribution。

### 4. 唯讀驗證與固定復原

- 只查固定時間窗、exact pathname 的 platform aggregate，不讀 raw IP。
- limiter 必須始終是 0；本輪不執行 Hosted DB cleanup 或其他 DB write。
- 成功或失敗都先 unset mode，再刪 `push-cleanup`，最後 unset token。
- 最終唯讀確認 Function、兩個 secret names、limiter 與 Push/runtime tables 回到基線。
- 自訂 stage response header 不在平台 log allowlist；權威 stage 由受控 client 當下 exact 比對。

## 已知副作用

project-wide secrets mutation 會再次增加既有 dispatcher 的 Hosted version metadata，即使 source 與 artifact hash 沒變。
平台沒有安全還原舊 version 數字的流程；驗收仍以名稱、ACTIVE、`verify_jwt=false` 與 artifact hash 為準。

## 尚未核可

在使用者明確同意上方精確範圍與 dispatcher version metadata 副作用前，不部署、不設定 secrets、不送 Hosted request。
