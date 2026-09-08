# FA-03B13.4 default-off 登出 Push cleanup coordinator 實作報告

日期：2026-09-08

狀態：**完成；程式與測試已落地，但正式登出仍未接線，Push v2 仍固定關閉。**

程式 commit：`bff84e7`

## 白話結論

這一批把「使用者從目前裝置登出時，Push 要怎麼安全收尾」整理成一個獨立協調器。

它會先在瀏覽器本機留下可重試的清理紀錄，再嘗試用 owner RPC 要求 server 停用這台裝置。未來 caller 必須在 Auth
session 尚有效時呼叫，coordinator 本身不冒充 Auth 驗證層。server 若無法確認完成，才使用 cleanup token 作後備清理；
最後才停用瀏覽器目前的 Push subscription。這樣即使中途有可判斷的錯誤，也不會把尚未完成的工作當成成功或直接遺失。

目前這套流程只存在於 lazy runtime，正式 App 的 shell 仍明確寫死為 `disabled`，真實 `handleSignOut()` 也沒有呼叫它。
原因是現有 browser／network promise 沒有有證據的 timeout；若現在直接等待它，極端情況可能讓 Auth 登出一直卡住。
本批沒有自行猜 timeout 數字，也沒有把半完成流程接進正式使用者操作。

## 實際流程

有效的目前裝置 binding 會依序執行：

```text
本機 suspend 並保存 immutable pending attempt
  → 有 server consent：先呼叫 owner quarantine RPC
      → exact completed：完成本機 pending attempt
      → stale／pending／錯誤：交給 cleanup-token fallback 一次
  → 沒有 server consent：直接交給 cleanup-token fallback 一次
  → 最後才讀取並停用目前 browser subscription
```

結果只會回 `{ kind: "completed" }` 或 `{ kind: "pending" }`，不回傳 endpoint、cleanup token、binding 或 server
response 內容。

## 程式變更

### 新增 sign-out coordinator

新增 `src/notificationPushSignOutCoordinator.ts`：

- 只接受注入的 storage、owner quarantine、token cleanup 與 browser deactivation 四個 port。
- factory 建立時沒有 storage、network、Service Worker、timer 或 logging 副作用。
- input 與 storage 回傳值使用 exact own-key、UUID、bigint、cleanup token、revision、owner、reason 與 consent snapshot
  驗證；資料不符時 fail closed。
- server 有 exact owner consent 時一定先走 owner RPC；只有 owner 未完成且已有精確 durable attempt 時，才把 raw token
  交給既有 B8 cleanup coordinator。
- owner 已完成時不送 token cleanup request，只完成同一筆本機 attempt。
- browser deactivation 固定在有限流程的最後；它的 throw 不會改寫已完成的 server／local 結果。
- 不掃描 queue、不開 timer、不自行重試，也不設定未經量測的 timeout。

### 補齊 browser read port

`src/notificationPushBrowserSubscription.ts` 新增 `readCurrentSubscription()`：

- 等待既有 `serviceWorker.ready` 後只讀 `pushManager.getSubscription()`。
- 不呼叫 `register()`、不要求通知權限、也不建立新 subscription。

local composition 現在把同一個 browser port 提供給既有 subscription coordinator 與 deactivation seam，沒有建立第二套
browser owner。

### 接入 lazy runtime，但不啟用正式 App

`src/notificationPushRuntimeComposition.ts` 現在組合：

- B5 storage
- B6／B8 cleanup transport 與 coordinator
- B7 owner quarantine adapter
- B10.2 browser deactivation
- 新的 sign-out cleanup coordinator

production shell 只把 `signOutCleanup` 納入 lazy runtime shape 驗證。它沒有新增公開的 sign-out method；`src/main.js`
仍是 `createNotificationPushProductionShell({ mode: "disabled" })`，正式 `handleSignOut()` 仍只做 current-device Auth sign-out。

## 驗證結果

```text
focused Node：58／58 passed
真實 IndexedDB targeted Playwright：desktop Chromium 1／1 passed

npm run test:ci:frontend：
- Node 697 tests：692 passed／5 skipped／0 failed
- Playwright 384 tests：380 passed／4 skipped／0 failed
- TypeScript、ESLint、Prettier、design-system、git diff --check：通過
- build：533 modules

production bundle：
- main 651,502／192,166／160,314 raw/gzip/Brotli
- total JS 855,998／263,196／222,038 raw/gzip/Brotli
- main 仍在既有門檻內；total 依 D8 為 report-only
- PUSH_SIGN_OUT_COORDINATOR、quarantine_push_device、
  notificationPushSignOutCoordinator、/functions/v1/push-cleanup：輸出檔命中 0
- legacy save_push_subscription：輸出檔命中 1

Hosted deploy／Secret／request／DB write／migration／runtime control：未執行
```

真實 browser 測試不是只用 mock storage：它先用 WebCrypto 與 IndexedDB 建立 enabled binding，再執行新 coordinator，
驗證順序為 `suspend → owner → local-complete → browser`，最後狀態為 `disabled`、pending attempt 為 0，logical device
仍保留，結果不含 cleanup token。

## 已知邊界

- 這批處理的是 coordinator 的正確順序，不代表 production cleanup 已上線。
- 有限的 throw、stale、pending 與 shape drift 都已 fail closed；但底層 promise 若永久不結束，coordinator 仍會等待。
- 因此尚未達成「任何狀況都不能阻擋 Auth sign-out」的 production 要求。真正接線前要先決定可驗證的 timeout／中止邊界，
  或改成不等待遠端完成但仍保留 durable attempt 的流程。
- browser read 使用 `serviceWorker.ready`；沒有 active registration 時也可能長時間等待。正式接線前必須把此情境納入
  timeout 與測試，不能只看正常路徑。
- production cleanup endpoint、public key、limiter policy、provider policy 與 runtime mode 都沒有設定。
- 同日稍早的 production wiring audit 最後確認 Hosted `push-cleanup` Function 不存在、DB v2 runtime 為 disabled；本批
  沒有重新查詢 Hosted，因此只把它當最近一次已記錄的基線，不宣稱這是新的 Hosted 驗證。

## 下一步

下一批先做 **Auth sign-out 接線與 timeout／可觀測性 preflight**，只回答以下問題：

1. `handleSignOut()` 在哪個時點仍能取得可信 owner proof 與 current binding。
2. 哪些本機步驟必須在 Auth sign-out 前完成，哪些遠端／browser 步驟可以中止或延後。
3. 現有 fetch、RPC 與 Service Worker API 能提供哪些實際 abort／timeout 證據。
4. 如何保證 timeout 後 Auth 一定繼續登出，同時不遺失 durable pending attempt。
5. 需要記錄哪些不含 token、endpoint、IP 或帳號識別的 aggregate，才足以在小比例 rollout 後決定正式 timeout。

在上述證據完成前，不直接修改 production `handleSignOut()`，也不填猜測的 timeout、policy 或 endpoint。
