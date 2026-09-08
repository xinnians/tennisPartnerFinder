# FA-03B13.5a 可取消的登出清理接縫

日期：2026-09-08

狀態：**source-only、default-off 實作完成；正式登出與 production Push 仍未啟用。**

程式 commit：`d633441`

## 白話結論

這批把「未來登出時要做的 Push 清理」改成可以接受同一個 `AbortSignal`。呼叫者發出 abort 後，不必再無限等待
IndexedDB、RPC 或瀏覽器 API。

這不等於已設定 timeout，也不代表底層工作一定被取消。例如 browser 的 `unsubscribe()` 本身沒有取消參數；我們只能保證
呼叫者停止等待，不能把還在背景進行的工作誤報為已完成。

正式 `handleSignOut()`、`src/main.js` 的 hard-coded disabled mode、Hosted Function、DB runtime control 與使用者資料都沒有改。

## 已完成內容

1. 新增共用的 abortable operation helper：
   - 不建立 timer，也沒有任何秒數。
   - operation 完成、失敗或 caller abort 都回固定、無資料的結果。
   - abort 只代表 caller 不再等；不宣稱不可取消的底層 Promise 已停止。
2. 登出時讀目前 Push subscription 改用 `serviceWorker.getRegistration()`：
   - 沒有現有 registration 時立即回 subscription absent。
   - 不 register Service Worker、不詢問通知權限，也不再等待 `serviceWorker.ready`。
   - 一般 enable／refresh 流程仍保留原本的 register＋ready，沒有改變啟用行為。
3. 新增窄版 owner quarantine RPC adapter：
   - 只允許 `quarantine_push_device`。
   - 有 signal 時，精確呼叫 PostgREST builder 的 `.abortSignal(signal)`。
   - 不把完整 Supabase client 暴露給 coordinator。
4. browser deactivation、owner quarantine 與 sign-out coordinator 共用同一個 signal：
   - storage、owner、token fallback、local completion、subscription read／unsubscribe／reread 都可讓 caller 在 abort 後離開。
   - durable cleanup attempt 仍是後續重試依據；無精確證據時只回 `pending／unknown`。
5. default-off production shell 新增 sign-out method：
   - UI 不傳 user id；shell 自己從已安裝的 Auth authority 讀 current verified proof。
   - lazy runtime 載入、storage read 等 await 後都重驗 authority、generation、proof 與 binding owner。
   - disabled mode 立即回 `ignored`，不載入 runtime、不碰 IndexedDB／Service Worker／network。
   - 對外結果只有 `completed／pending／ignored`，不含 token、endpoint、device id 或錯誤內容。

## 實際驗證

```text
focused Node：95／95 passed；最後一輪相關測試 50／50 passed
完整 Node：716 tests，711 passed／5 skipped／0 failed
真實 desktop Chromium targeted：2／2 passed
完整 desktop＋mobile Chromium：386 tests，382 passed／4 skipped／0 failed

TypeScript、ESLint、Prettier、design-system、courts seed、git diff --check：通過
build：534 modules

production bundle：
- main 651,562／192,196／160,485 raw/gzip/Brotli
- total JS 856,058／263,254／222,252 raw/gzip/Brotli
- total 相對既有 report-only 值增加 60 raw／58 gzip／214 Brotli bytes
- main 仍在現行預算內；total 依 D8 開發期政策只報告、不阻擋
- notificationPushRuntimeComposition：輸出檔命中 0
- quarantine_push_device：輸出檔命中 0
- /functions/v1/push-cleanup：輸出檔命中 0
- PUSH_SIGN_OUT_COORDINATOR：輸出檔命中 0
- processCurrentDeviceSignOut：輸出檔命中 1（default-off shell method）
- legacy save_push_subscription：輸出檔命中 1（既有正式流程）

Hosted deploy／Secret／request／DB write／migration／runtime control：未執行
```

真實 browser 測試另確認：頁面沒有 Service Worker registration 時，登出 subscription read 會回 `null`，執行前後都沒有
建立 registration；另一個測試仍驗證 IndexedDB durable cleanup 的完整順序。

## 尚未完成

- 沒有把 Push cleanup 接進 `profileOrchestrationFeature.handleSignOut()`。
- 沒有 production timeout 數字、timer 或 AbortController owner。
- 沒有 data-free aggregate metric sink，因此仍沒有實際 cleanup latency 分布可用來訂 deadline。
- production cleanup endpoint、public key、limiter／provider policy 與 active runtime config 仍未設定。
- Supabase Auth `signOut()` 自身沒有 AbortSignal、專案 Auth lock 為 `-1` 的獨立風險沒有在本批處理。

## 下一步

下一批先做 `FA-03B13.5b` 唯讀接線複核，固定兩件事後才寫正式 caller：

1. 誰建立及中止 AbortController，並證明 Push 的 completed、pending、throw、shape drift、永久 pending 都會繼續執行 Auth sign-out。
2. 在沒有現成 Push aggregate telemetry 的前提下，正式 deadline 要依哪一份可驗證資料決定；若資料仍不存在，就維持
   default-off，不自行填秒數。

新增外部 metric sink、deploy、Secret、runtime control 或正式 request 都不屬於本批，也不會因這份 source 完成而自動取得授權。
