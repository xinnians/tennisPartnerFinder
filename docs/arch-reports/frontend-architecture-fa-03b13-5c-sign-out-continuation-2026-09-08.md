# FA-03B13.5c dormant Auth 登出 continuation core

日期：2026-09-08

狀態：**source-only dormant core 完成；尚未接進 `main.js` 或正式 `handleSignOut()`。**

程式 commit：`2033507`

## 白話結論

這批建立一個很小的登出協調核心，固定一件事：Push cleanup 只是 best effort，真正的 Auth 登出一定要接著執行。

它也處理重複點擊。同一時間呼叫兩次只會共用同一個 Promise，Push 與 Auth 都只執行一次；工作結束後才允許重新嘗試。

這個核心沒有 timer、timeout、telemetry、網路或 storage，也沒有 production importer，所以目前使用者行為完全不變。

## 已完成內容

- 新增 `notificationPushSignOutContinuation.ts`，只接受兩個注入 port：
  - `processPushSignOut()`
  - `signOutCurrentDevice()`
- 固定先執行 Push，再執行 Auth；Push 回 completed／pending／ignored／malformed，或同步／非同步 throw，都不阻止 Auth。
- 已 abort 的 signal 會跳過 Push並立即進 Auth。
- Push Promise 永久不結束時，caller abort 可停止等待並進 Auth。
- input／signal 格式不合法時，不冒險呼叫可能無限等待的 Push，直接繼續 Auth。
- 同時間的重複呼叫共用第一個 caller 的 signal 與同一個 in-flight Promise；第二個 caller 不能另開 Push／Auth。
- Auth error 不被吞掉，仍由既有 UI 邊界決定「登出失敗」；single-flight 在成功或失敗後都會釋放，允許重試。
- source gate 固定此 core 只能 import abort helper，且不可直接 import Auth、Supabase、Push runtime、storage、network、logger
  或 timer。

## 實際驗證

```text
continuation＋architecture／Push targeted：53／53 passed
完整 Node：727 tests，722 passed／5 skipped／0 failed
完整 desktop＋mobile Chromium：386 tests，382 passed／4 skipped／0 failed

TypeScript、ESLint、Prettier、design-system、courts seed、git diff --check：通過
build：534 modules

production bundle：
- main 651,562／192,196／160,485 raw/gzip/Brotli
- total JS 856,058／263,254／222,252 raw/gzip/Brotli
- 與 B13.5a 完全相同；main 仍在預算內，total 依 D8 report-only
- notificationPushSignOutContinuation：輸出檔命中 0
- PUSH_SIGN_OUT_CONTINUATION：輸出檔命中 0
- createNotificationPushSignOutContinuation：輸出檔命中 0
- notificationPushRuntimeComposition：輸出檔命中 0
- quarantine_push_device：輸出檔命中 0
- /functions/v1/push-cleanup：輸出檔命中 0

Hosted deploy／Secret／request／DB write／migration／runtime control：未執行
```

## 仍未完成

- `main.js` 仍直接把 `handleSignOut` 傳給 Me UI；新 core 沒有 production caller。
- Push shell 仍 hard-coded disabled；沒有 endpoint、key、policy 或 active runtime。
- 沒有 timer／deadline，所以不宣稱「不帶 signal 的永久 pending Push」會自行結束。
- 沒有 external metric sink、sampling 或 retention。
- Supabase Auth sign-out 自身的無 signal／Auth lock `-1` 邊界沒有改。

## 下一步

下一批 `FA-03B13.5d` 可做 default-off production outer wiring：

1. `main.js` 建立一個 continuation instance，把 disabled shell method 與現有 `handleSignOut` 注入。
2. Me UI 的 `onSignOut` 改指向 continuation；disabled shell 必須立即 ignored，所以現行 Auth／toast 順序與結果不變。
3. 驗證重複點擊只執行一次 Auth、零 runtime load／IndexedDB／Service Worker／network。
4. 以 source gate 保證 shell 仍 hard-coded disabled；不加入 signal owner、timer 或 timeout。

這一步只會讓目前登出先取得 single-flight，不會開啟 Push。未來若要把 shell mode 改成 enabled，仍必須先新增有證據的
deadline、caller-owned abort 與 active runtime config，不能只改一個字串。
