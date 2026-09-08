# FA-03B13.5d default-off 正式登出外層接線

日期：2026-09-08

狀態：**default-off outer wiring 完成；正式 Auth 登出已取得 single-flight，Push v2 仍未啟用。**

程式 commit：`7d1280c`

補強 browser 證據 commit：`d147f22`

## 白話結論

現在使用者按登出時，會先經過新的 single-flight 外層。同一瞬間連按兩次，Push shell 與 Auth 登出都只執行一次。

Push shell 仍在 `main.js` 寫死 `mode: "disabled"`，所以它會立即回 `ignored`，不載入 Push runtime、不開 IndexedDB、
不碰 Service Worker，也不送 cleanup request。接著仍執行原本的 current-device Auth sign-out，成功／失敗 toast 沒有改。

這不是 Push production 上線。沒有 timer、timeout、endpoint、key、policy 或 telemetry。

## 已完成內容

- `main.js` 靜態 import 小型 sign-out continuation core。
- continuation 注入：
  - Push port：`notificationPushV2Shell.processCurrentDeviceSignOut`
  - Auth port：既有 `handleSignOut`
- Me UI 的 `onSignOut` 由直接呼叫 `handleSignOut` 改成呼叫 continuation。
- source gate 固定 continuation 只能由 production main 引用，且 main 仍必須有 exact
  `createNotificationPushProductionShell({ mode: "disabled" })`。
- integration unit 證明兩次同時呼叫共用同一個 Promise、Auth 只呼叫一次、runtime loader 為 0。
- 真實本機 Supabase＋Chromium 測試在同一個 DOM task 連點兩次，確認：
  - `/auth/v1/logout` POST 正好 1 次；
  - `/functions/v1/push-cleanup` request 為 0；
  - 執行前後 `tennis-partner-finder-push` IndexedDB 都不存在；
  - 執行前後 Service Worker registration 都是 0；
  - 登出後私人 UI 清空並顯示既有「已登出」toast。

## 實際驗證

```text
sign-out continuation／shell／source targeted：54／54 passed
真實 local Supabase desktop Chromium sign-out：1／1 passed
完整 Node：729 tests，724 passed／5 skipped／0 failed
完整 desktop＋mobile mock Chromium：386 tests，382 passed／4 skipped／0 failed

TypeScript、ESLint、Prettier、design-system、courts seed、git diff --check：通過
build：535 modules

production bundle：
- main 653,283／192,738／160,678 raw/gzip/Brotli
- total JS 857,779／263,789／222,464 raw/gzip/Brotli
- 相對 B13.5c：main +1,721 raw／+542 gzip／+193 Brotli
- 相對 B13.5c：total +1,721 raw／+535 gzip／+212 Brotli
- main raw 仍在現行預算內；main gzip 超出既有觀察值 318 bytes
- total raw／gzip 超出既有觀察值 7,818／4,727 bytes
- 以上依 D8 開發期政策只報告、不阻擋；結構、demo／E2E hook 與拆包 hard gate 仍通過
- PUSH_SIGN_OUT_CONTINUATION：輸出檔命中 1（小型 default-off outer core）
- processCurrentDeviceSignOut：輸出檔命中 1（disabled shell method）
- notificationPushRuntimeComposition：輸出檔命中 0
- quarantine_push_device：輸出檔命中 0
- /functions/v1/push-cleanup：輸出檔命中 0
- legacy save_push_subscription：輸出檔命中 1

Hosted deploy／Secret／request／DB migration／runtime control：未執行
```

## 行為邊界

- single-flight 只覆蓋同一個 in-flight 登出；完成或失敗後可重新嘗試。
- production 注入的 Auth port 是既有 `handleSignOut()`，所以它仍自行顯示 toast 並吸收 Auth error；使用者看到的行為沒變。
- disabled shell 是目前不需要 timer 的理由。未來若改成 enabled，必須同批加入 caller-owned abort deadline；不能只把
  `disabled` 改成 `enabled`。
- 這批只避免 Push 額外造成無期限等待；Supabase Auth sign-out 自身沒有 signal、Auth lock `-1` 的邊界仍是獨立待辦。

## 尚未完成

- production Push v2 cleanup、enable／refresh UI 與 Hosted dispatcher 都未啟用。
- cleanup／subscription endpoint、兩套 public key、VAPID 對應、limiter／provider policy 與 active runtime config 未設定。
- production sign-out deadline、AbortController owner、data-free aggregate metric sink、sampling／retention 未完成。
- 沒有真實 production rollout latency，所以仍不能決定 timeout 數字。

## 下一步

下一批先做 `FA-03B13.6` production activation gap audit，把目前所有仍缺的 config、Hosted source、server gate、browser
caller、deadline 與 rollout evidence 整成唯一的啟用順序；只讀確認哪些可以繼續 source-only，哪些已經會觸及 deploy／Secret／
runtime control／request，需要在執行前停下。

在 deadline 與 active config 有可驗證值之前，登出 Push cleanup 維持 disabled，不再用測試或 limiter 數字代填。
