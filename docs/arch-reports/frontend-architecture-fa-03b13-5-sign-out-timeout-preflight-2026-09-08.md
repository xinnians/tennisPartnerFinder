# FA-03B13.5 Auth 登出 timeout／可取消性唯讀複核

日期：2026-09-08

狀態：**唯讀複核完成；尚未把 Push cleanup 接進正式登出，也尚未設定 timeout 數字。**

## 白話結論

現在不能直接讓正式登出等待 Push cleanup。

原因不是已知程式寫錯，而是目前有幾段工作沒有時間上限：IndexedDB、owner RPC、Service Worker、browser
unsubscribe，連既有 Supabase Auth 登出本身也沒有 AbortSignal。只要其中一個底層 Promise 永久不結束，使用者就可能一直停在
「尚未登出」。

這次查到一個可直接修掉的結構問題：登出只想找「已存在的」Service Worker，卻使用
`navigator.serviceWorker.ready`。規格明確寫它不會 reject，沒有 active worker 時會繼續等；改用
`getRegistration()` 可以在沒有 registration 時得到 `undefined`，不需要等 worker 進入 active。

下一個安全批次會先做 source-only、default-off 的可取消接縫，不猜秒數、不啟用 Push v2、不改正式 `handleSignOut()`。
真正啟用前，仍要用實際 canary／rollout 資料決定時間上限。

## 已確認的正式流程

目前使用者按登出後的呼叫鏈只有：

```text
Me UI
  → profileOrchestrationFeature.handleSignOut()
  → data/authApi.signOut()
  → Supabase auth.signOut({ scope: "local" })
```

- `src/features/profile/profileOrchestrationFeature.ts` 的 `handleSignOut()` 直接等待 `signOut()`，成功或失敗後顯示 toast。
- `src/data/authApi.ts` 明確使用 `{ scope: "local" }`，只登出目前 session。
- `src/main.js` 的 Push v2 shell 明確寫死 `mode: "disabled"`；只接了 Auth authority 與 Auth failure notice。
- shell 沒有公開 sign-out method；B13.4 coordinator 只存在 lazy runtime 內。
- production build 尚無 v2 cleanup caller。這次沒有修改上述任何正式行為。

Supabase 官方文件也確認 `local` scope 是只登出目前 session。專案目前安裝的 `@supabase/auth-js 2.110.0`
原始碼則顯示，`signOut()` 會先等初始化、再取得專案設定的 Auth lock，接著送出 `/logout?scope=local`，最後才移除本機
session。這條 API 沒有提供 sign-out AbortSignal；本專案 Auth lock 又明確設成 `-1`。因此本報告不宣稱「目前 Auth
登出本身已有完整時間上限」。

## 每一段能不能中止

| 工作                            | 現況                                                         | 已確認能力                                                                      | 結論                                                                          |
| ------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 讀取／suspend IndexedDB         | B5 API 沒有 `signal`；open request 與 transaction 靠事件完成 | transaction 本身可 `abort()`，但現行 wrapper 未接 signal                        | source 可再補；必須先確保 durable attempt 已 commit，才能開始可延後的遠端工作 |
| owner quarantine RPC            | B7 port 沒有 `signal`                                        | 目前 Supabase/PostgREST builder 有 `.abortSignal(signal)`，RPC 也回傳該 builder | 可用窄 adapter 接上；不能把整個 Supabase client 暴露給 coordinator            |
| cleanup-token fallback          | B6 transport 已把 `signal` 傳給 `fetch`                      | 已可中止 caller 等待與 HTTP request                                             | 保留                                                                          |
| 找目前 subscription             | 現行用 `serviceWorker.ready`                                 | `ready` 不 reject，可能長時間等待；`getRegistration()` 無匹配時回 `undefined`   | 改用 `getRegistration()`，不要在登出路徑 register 或等 ready                  |
| `unsubscribe()`                 | Web Push API 無 AbortSignal 參數                             | 規格只提供 `Promise<boolean>`；呼叫後 UA 開始 deactivation                      | 只能讓 caller 在 signal 後停止等待，不能聲稱已取消 UA 的底層動作              |
| Auth `signOut({scope:"local"})` | 無 signal；Auth lock 為 `-1`                                 | 401／403／404 可繼續清本機 session，但永久 pending 並未被 SDK 自動界定          | Push cleanup 不可再增加一個無期限前置阻塞；Auth 自身 timeout 是另一個獨立議題 |

Web Push 規格另確認：`unsubscribe()` 回 `false` 代表已停用；尚未停用時會開始 deactivation，UA 之後不得再投遞該
subscription 的訊息。若 UA 無法通知 push service，規格允許 UA 自行重試。因為 API 沒有 signal，未來若 caller 先結束等待、
底層 unsubscribe 稍後才完成，這只能標示為「caller 已停止等待，deactivation 可能仍在繼續」，不能誤報為已取消或已完成。

## Auth proof 與 binding 在哪裡取得

已確認可用且不必讓 UI 傳入帳號 ID 的路徑如下：

1. production shell 已保存目前的 `AuthVerificationAuthority`。
2. authority 有 `readCurrentVerifiedAuthProof()`，可取得目前已驗證的 Auth proof。
3. lazy runtime 的 storage 有 `readPushRuntimeState()`，可讀到不含 cleanup token 的目前 binding view。
4. shell 在各次 await 後可重查 authority generation、`isVerifiedAuthProofCurrent(proof)`，並比對
   `binding.authUserId === proof.authUserId`。
5. 全部仍為同一個目前 owner 時，才把 proof 的 user id 與 binding 傳進 B13.4 coordinator。

這是下一批要實作的 shell 邊界；目前 shell 尚無此 method，所以本報告只記錄已存在的證據與固定做法，不把建議寫成已完成。

## 可觀測性盤點

目前 repo 沒有可直接拿來決定 Push 登出 timeout 的 aggregate counter：

- Vercel Analytics 只有 production `inject({ mode: "production" })`，source 沒有 custom `track()` 呼叫。
- Sentry transport 只允許 `errorName`、`kind`、`surface` 三個固定錯誤欄位；停用 breadcrumbs、PII、logs、session
  tracking 與 client reports。
- source 內沒有 Push cleanup latency、completed／pending、abort stage 或 Auth-sign-out continuation 的 metric sink。

因此不能從現有 production telemetry 推算 timeout。若要用真實 rollout 決定上限，需先另做 data-free aggregate 契約；最少只收：

- 固定 stage 名稱；
- 固定結果 `completed | pending | aborted`；
- 粗分桶 latency，不收精確時間戳序列；
- 不收 user id、device id、endpoint、cleanup token、IP、URL、錯誤文字或 stack。

新增外部 metric sink、部署或資料保留政策都不是本次唯讀範圍，之後仍須獨立確認。

## 固定的下一個 source-only 批次

下一批 `FA-03B13.5a` 只做下列可逆變更：

1. 登出讀取改用 `serviceWorker.getRegistration()`；沒有 registration 就視為 subscription absent，不呼叫
   `register()`、不要求通知權限。
2. owner quarantine port 接受 `AbortSignal`，並提供只會呼叫
   `supabase.rpc("quarantine_push_device", args).abortSignal(signal)` 的窄 adapter。
3. browser deactivation 接受 `AbortSignal`；signal 後立即回 unknown／pending，不把底層不可取消的 unsubscribe 冒充為完成。
4. B13.4 coordinator 把同一個 signal 傳給 owner、token cleanup 與 browser。
5. production shell 新增 default-off sign-out method：自行讀 current proof 與 current binding、逐次重驗 owner，再呼叫
   coordinator；disabled mode 必須立即回 `ignored`，不得載入 runtime 或觸碰 IndexedDB／Service Worker／network。
6. 加入 never-resolving Promise＋abort 測試，證明 caller 能停止等待；不建立 timer，不填 timeout 數字。

這一批仍不會修改 `profileOrchestrationFeature.handleSignOut()`。原因是 active caller 還缺一個有證據的 deadline 與 metric
方案；接線不是單純把 method 呼叫加上去而已。

## 啟用前的硬性條件

- Hosted cleanup endpoint、public key、limiter／provider policy 與 runtime mode 已有明確設定及驗證。
- 專用 canary 或小比例 rollout 能產出上述 data-free aggregate。
- timeout 以實際完成分布、失敗分布與使用者可接受的登出等待時間決定，不拿既有單次 limiter canary 的 `p95 450 ms`
  當 production timeout；那次量測的是不同工作、不同負載。
- caller 測試必須證明：Push completed、pending、throw、shape drift、永久 pending 後 abort，最後都會繼續執行 Auth sign-out。
- durable attempt 若未成功 commit，不得宣稱 cleanup 可重試；server closure 若無 exact evidence，不得宣稱 completed。

## 查證來源

- repo source：`src/main.js`、`src/features/profile/profileOrchestrationFeature.ts`、`src/data/authApi.ts`、
  `src/notificationPushProductionShell.ts`、`src/notificationPushRuntimeComposition.ts`、
  `src/notificationPushSignOutCoordinator.ts`、`src/notificationPushStorage.ts`、
  `src/notificationPushBrowserSubscription.ts`、`src/notificationPushDeactivation.ts`、
  `src/notificationPushOwnerQuarantine.ts`、`src/sentryErrorTransport.ts`
- installed source：`@supabase/auth-js 2.110.0`、`@supabase/supabase-js 2.110.0`、
  `@supabase/postgrest-js 2.110.0`
- [Supabase JavaScript signOut 官方文件](https://supabase.com/docs/reference/javascript/auth-signout)
- [Supabase JavaScript abortSignal 官方文件](https://supabase.com/docs/reference/javascript/using-modifiers-abortsignal)
- [W3C Service Workers 規格](https://www.w3.org/TR/service-workers/)
- [W3C Push API 規格](https://www.w3.org/TR/push-api/)

## 本批未做事項

- 沒有程式、測試、dependency、migration、DB、Hosted、Secret、request、deploy 或 runtime control 變更。
- 沒有修改正式登出、UI、Push subscription 或使用者資料。
- 沒有設定 timeout、endpoint、key、policy 或 telemetry retention。
