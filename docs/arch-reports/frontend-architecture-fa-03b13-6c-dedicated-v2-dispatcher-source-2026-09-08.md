# FA-03B13.6c dedicated v2 dispatcher source

日期：2026-09-08

狀態：**完成並提交；repo 已有獨立、預設關閉的 format-2 worker。Hosted 沒有部署、Secret、cron、request 或 DB 變更。**

程式 commit：`25cd2ea`

## 白話結論

已新增 `notification-outbox-dispatch-v2`。它不會取代或中斷目前的 legacy worker，也沒有排程；production 沒設定 exact mode
時只會回 503，完全不會建立 sender 或連 DB。

這支新 Function 重用既有 D1 DB transaction 與 D3A Web Push sender，只負責安全接線，不另抄一份 claim、send 或 outcome
規則。local 真實 Edge 測試已證明它只處理 format 2，legacy format 1 row 保持原狀。

## 實作內容

新增：

- `supabase/functions/notification-outbox-dispatch-v2/index.ts`
- `supabase/functions/notification-outbox-dispatch-v2/entrypoint.js`
- `supabase/functions/notification-outbox-dispatch-v2/runtime.js`
- `tests/notification-outbox-dispatch-v2-scheduled.test.js`

調整：

- `supabase/config.toml` 宣告新 Function 的 `verify_jwt = false`；授權仍由 application-level cron secret 負責。
- CI 的 ESLint／Prettier scope 與 unit aggregate 納入新 Function／測試。
- 既有 local Edge composition test 改由 dedicated v2 Function 驗真實 DB transaction 與 mock provider；獨立 Deno-native
  canary 測試保留。

## 固定安全邊界

### 預設關閉

- 非 Hosted 只接受 exact `local-test-v1`。
- Hosted marker 存在時只接受 exact `hosted-v1`。
- mode 缺少、大小寫不同、前後空白或跨環境使用都不成立。
- mode 或基本設定不完整時回固定 `503 DISPATCH_V2_UNAVAILABLE`，不透露缺哪一項。

### 沒有猜測的設定值

以下全部必填，沒有 fallback：

- `NOTIFICATION_DISPATCH_V2_DATABASE_URL`
- `NOTIFICATION_DISPATCH_V2_EXPECTED_GENERATION`
- `NOTIFICATION_DISPATCH_V2_BATCH_SIZE`
- `NOTIFICATION_CRON_SECRET`

generation 必須是 PostgreSQL bigint 範圍內的 canonical 正整數；batch 必須是 1～100 的 canonical 整數。這裡的 100 只是既有
core 可接受的結構上限，不是 production 採用值；production batch 仍未設定。

cron secret 必須原樣非空、32～256 bytes。Hosted 現有 Secret 只確認名稱存在，從未讀 value 或長度，因此目前**不能宣稱**既有
Secret 符合新 entry 要求；這必須在未來設定／部署停點另外驗證或輪替。

### legacy 與 v2 隔離

- v2 DB URL、generation、batch、provider origins、transport 都使用 `NOTIFICATION_DISPATCH_V2_*` 名稱。
- 只共用既有三個 VAPID 名稱；上線前仍須比對 public-key fingerprint。
- local-only mock URL 也使用 v2 名稱，Hosted path 永遠不能選 local mock sender。
- request method 與 cron secret 驗證通過前，不會建 sender、不會開 DB connection。
- response 不 cache、沒有 logging；runtime error 只回既有固定安全碼。

## 驗證結果

### 新增／針對性測試

- dedicated entry／runtime unit：8／8。
- real local Edge composition：2／2。
  - dedicated v2 → 專用 DB role → held transaction → local mock provider 成功。
  - send transaction 期間的衝突寫入被 DB lock 阻擋。
  - format-2 delivery／outbox 正確完成，format-1 outbox 保持 `attempts = 0`、`sent_at = null`。
  - Deno-native encrypted sender canary 回歸通過。

### 完整前端驗證

- Node：738 tests；733 passed、5 skipped、0 failed。
- mock Chromium：386 tests；382 passed、4 skipped、0 failed。
- TypeScript、ESLint、Prettier、courts seed、design-system、build、bundle structure、`git diff --check` 全部通過。
- build：535 modules。
- production bundle 與 B13.5d／B13.6a 完全相同：
  - main raw／gzip／Brotli：653,283／192,738／160,678 bytes。
  - total raw／gzip／Brotli：857,779／263,789／222,464 bytes。
  - 既有超額仍依 D8 在開發期 report-only；本批沒有改 browser runtime，因此沒有新增 bundle bytes。

## 明確未做

- 沒有新增 migration 或 cron。
- 沒有部署或呼叫 Hosted Function。
- 沒有新增、讀取或修改 Hosted Secret／credential。
- 沒有 production request、DB write、runtime mode／generation 或 Vercel 變更。
- 沒有填 production batch、lease、deadline、attempt 或 TTL policy。

## 下一步

`FA-03B13.6d` 修正已查證的 disabled 邊界：DB mode 是 disabled 時，begin command 必須直接回明確 no-op，不能先建立 failed
worker；runtime 必須接受該結果並零 sender／claim／finish。先以 additive migration 與 local DB／Edge 測試完成，不建立或啟用
Hosted cron。
