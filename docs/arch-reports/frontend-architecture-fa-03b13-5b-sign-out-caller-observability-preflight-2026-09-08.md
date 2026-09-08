# FA-03B13.5b 正式登出 caller／可觀測性唯讀複核

日期：2026-09-08

狀態：**唯讀複核完成；正式 caller、timer、timeout 與 telemetry 都沒有新增。**

## 白話結論

現在已經能讓 Push cleanup 接受 abort，但還不能直接接到正式登出，因為缺兩個條件：

1. 現行登出沒有防重複執行，也沒有一個專門保證「Push 不管結果如何，Auth 都會繼續」的協調層。
2. 專案沒有 Push cleanup 的真實延遲統計，也沒有使用者可接受的最長登出等待時間，所以仍不能填 timeout 數字。

可以先安全完成的下一步，是建立一個 dormant、零 timer 的 Auth continuation coordinator：只接受 caller 傳進來的 signal，
把 Push cleanup 當 best effort，並保證最後仍呼叫現有 Auth sign-out。正式 timer 與 UI 接線要等 deadline 有證據後再做。

## 已確認的現行呼叫鏈

```text
MePage 的登出按鈕
  → AppServicesProvider 的 onSignOut: () => unknown
  → main.js 直接注入 handleSignOut
  → profileOrchestrationFeature.handleSignOut()
  → data/authApi.signOut()
  → Supabase auth.signOut({ scope: "local" })
```

精確現況：

- `MePage` 的按鈕只有 `onClick={onSignOut}`，沒有 pending state、disabled state 或 click guard。
- `handleSignOut()` 只有一個 `try/catch`：等待 Auth sign-out，成功顯示「已登出」，失敗顯示「登出失敗」。
- `main.js` 已把 Auth authority 與 Auth failure notice 交給 Push shell，但沒有呼叫新的
  `processCurrentDeviceSignOut()`。
- Push shell 仍是 `createNotificationPushProductionShell({ mode: "disabled" })`。
- source 內 `handleSignOut` 只有這一個定義、正式 UI 只有這一個注入點；目前沒有對它做 Push cleanup 的 unit test。
- 既有真實登入 E2E 只驗證 local Auth sign-out 後私人 UI 清空及成功 toast，不能當成 Push cleanup 接線證據。

## 正式控制流必須怎麼排

順序必須固定為：

```text
同一次登出 single-flight
  1. 用仍有效的 Auth proof 執行 current-device Push cleanup（best effort）
  2. cleanup completed／pending／ignored／throw／abort 都離開 Push 階段
  3. 一定呼叫既有 Auth signOut({ scope: "local" })
  4. toast 只由 Auth 成功或失敗決定，不把 Push pending 說成登出失敗
```

Push 不能放在 Auth sign-out 後面，因為 shell 需要 current verified proof 才能確認 binding owner。反過來，Push 也不能決定
Auth 是否執行；否則任何 IndexedDB、RPC 或 browser 異常都會擋住登出。

現行按鈕可重複點擊，所以 orchestration 邊界要保存同一個 in-flight Promise。第二次點擊只能共用第一次工作，不能再建一筆
cleanup attempt 或再送一次 Auth sign-out。UI 是否另顯示 busy 狀態可以之後做，但 single-flight 是正式接線前的必要安全條件。

## AbortController 應放在哪裡

AbortController 應由「登出 orchestration／caller」持有，不放在 Push shell：

- caller 才知道使用者最多應等待多久，也負責 cleanup 後一定繼續 Auth。
- shell 只負責在 signal 後停止等待並回 `pending`，不應自行決定產品等待時間。
- timer 觸發時，caller 要同時 abort signal 並停止等待 cleanup；不能只期待底層 port 自己遵守 signal。
- timer 必須在 cleanup 提前完成時 clear，不能留下一個稍後才觸發的 abort。

WHATWG DOM 規格確認：Promise 本身沒有內建取消；AbortController 只是通知對應的 AbortSignal，接收 API 仍可選擇如何反應。
因此 B13.5a 的「caller 停止等待」與「底層工作已取消」必須繼續分開描述。

WHATWG HTML timer 規格也明確說 timer 不保證準時執行；CPU load 或其他 task 會造成延遲。因此未來設定的數字是
best-effort deadline，不是可以數學保證的硬性 wall-clock 上限。

## 為什麼現在不能決定秒數

repo 與目前本機設定都沒有 production sign-out deadline：

- `src/config.ts` 沒有 Push sign-out timeout／deadline 欄位。
- `.env.local` 的 key 名稱只有 Maps 與 Supabase 三項；沒有 Push deadline。
- `.env.example` 與 production preview build 也沒有 Push sign-out deadline。
- 現行 Vercel Analytics 只有 production `inject()`，沒有 custom event 呼叫。
- Sentry transport 只送 `errorName／kind／surface` 的 error event，沒有 Push outcome 或 latency aggregate。

先前 Hosted limiter 的 `p95 450 ms` 測的是 limiter request，不是 browser IndexedDB＋owner RPC＋unsubscribe 的登出工作，
不能拿來代替。測試裡的 1,000／2,000／3,000 ms 也都是 test harness timeout，不是產品資料。

正式數字至少要同時有：

1. 產品可接受的登出等待時間。
2. 小比例 rollout 或 canary 的 Push cleanup latency／pending 分布。

目前兩者都不存在，所以本報告不提供建議秒數。

## telemetry 的安全邊界

若之後建立外部 aggregate，只能送 allowlist 後的固定欄位，例如固定 stage、固定 outcome 與粗分桶 latency；不得送 user id、
device id、binding id、endpoint、cleanup token、access token、IP、URL、錯誤文字、stack 或精確事件時間序列。

但 repo 目前沒有可承接這份資料的 sink，也沒有 retention／sample policy。新增 Sentry custom event、Vercel custom event、
Supabase table 或其他服務都會是新的外部資料處理，必須獨立確認；不能偷偷借用現有 error transport。

## 固定的下一個 source-only 批次

下一批 `FA-03B13.5c` 可先做以下可逆工作：

1. 新增 dormant current-device sign-out flow，只注入 Push cleanup 與既有 Auth sign-out port。
2. 不建立 timer、不填 deadline；只接受 caller 已提供的 optional signal。
3. 對同一時間的重複呼叫做 single-flight。
4. Push 的 completed、pending、ignored、throw、malformed、永久 pending 後 abort 都必須繼續 Auth。
5. Auth error 保留既有 throw 行為，讓現行 UI 仍只依 Auth 顯示成功／失敗。
6. 結果與測試不得包含 token、owner、endpoint 或 raw error。

這一批仍不修改 `main.js`、`handleSignOut()`、UI、config、telemetry、Hosted 或 runtime control。完成後，只代表可測試的 Auth
continuation 核心已準備好，不代表 production 已接線。

## 正式接線前的驗收矩陣

| 情境                        | Push 階段結果 | Auth sign-out | UI 結果              |
| --------------------------- | ------------- | ------------- | -------------------- |
| disabled shell              | ignored       | 必須執行      | 只看 Auth            |
| 沒有 proof／binding         | pending       | 必須執行      | 只看 Auth            |
| cleanup exact completed     | completed     | 必須執行      | 只看 Auth            |
| cleanup throw／malformed    | pending       | 必須執行      | 只看 Auth            |
| cleanup 永久 pending＋abort | aborted       | 必須執行      | 只看 Auth            |
| 重複點擊                    | 共用同一工作  | 只能執行一次  | 不重複 toast         |
| Push 成功、Auth 失敗        | completed     | 執行但失敗    | 保留現有「登出失敗」 |
| Push pending、Auth 成功     | pending       | 執行且成功    | 保留現有「已登出」   |

## 查證來源

- repo source：`src/main.js`、`src/pages/MePage.tsx`、`src/app/AppServicesProvider.tsx`、
  `src/features/profile/profileOrchestrationFeature.ts`、`src/data/authApi.ts`、
  `src/notificationPushProductionShell.ts`、`src/abortableOperation.ts`、`src/config.ts`、
  `src/sentryErrorTransport.ts`、`.env.example`、`scripts/build-production-preview.mjs`
- repo tests：`tests/profile-orchestration-auth.test.js`、`tests/session.spec.js`、
  `tests/notification-push-production-shell.test.js`
- [WHATWG DOM Standard：AbortController／AbortSignal](https://dom.spec.whatwg.org/#aborting-ongoing-activities)
- [WHATWG HTML Standard：Timers](https://html.spec.whatwg.org/multipage/timers.html)

## 本批未做事項

- 沒有修改 source、test、dependency、UI、env、migration、DB、Hosted Function、Secret、request、deploy 或 runtime control。
- 沒有設定 timeout、timer、metric schema、sampling、retention、endpoint、key 或 policy。
- 沒有讀出 `.env.local` 的值；只列出 key 名稱確認沒有 deadline 設定。
