# FA-03 production cleanup 接線與流量依據盤點

日期：2026-09-08

狀態：**完成；只讀 repo、production build 與 Hosted aggregate，沒有啟用 cleanup。**

## 白話結論

目前不是「正式環境的 code 對不上」，而是 Push v2 cleanup 還刻意維持關閉：

- repo 的 production shell 被寫死為 `disabled`。
- 真正登出只做本裝置 Auth sign-out，沒有呼叫 Push v2 cleanup。
- Auth failure、手動重新啟用與 Service Worker 也沒有 production cleanup 入口。
- production build 沒有輸出 v2 cleanup runtime。
- Hosted 沒有 `push-cleanup` Function、沒有 cleanup Secret，也沒有任何 v2 consent／subscription／limiter row。

所以現有 app 版本的 **v2 cleanup client 觸發點是 0**。這只能證明目前 repo build 不會發 request，以及 Hosted cleanup
尚未存在；沒有 live web deployment provenance 或真實使用者流量資料，不能把它外推成未來正式流量。

## Repo 實查

### 現有 production 路徑

| 情境                               | 現況                                                | cleanup POST |
| ---------------------------------- | --------------------------------------------------- | -----------: |
| 使用者登出                         | `handleSignOut()` 直接呼叫 local-scope `signOut()`  |            0 |
| Auth 被拒絕                        | notice 進入 hard-coded disabled shell，回 `ignored` |            0 |
| Auth 暫時不可用                    | 同上                                                |            0 |
| 使用者開啟 Push                    | 三個 UI 入口都走 legacy `save_push_subscription`    |            0 |
| 手動重新啟用 v2                    | coordinator 只存在 lazy runtime；UI 沒有 caller     |            0 |
| Service Worker subscription change | `push-sw.js` 沒有 `pushsubscriptionchange` handler  |            0 |
| app boot／背景排程                 | 沒有 cleanup loop、timer 或 scheduler               |            0 |

production build 的 JavaScript 中找得到 legacy `save_push_subscription` 與 `/push-sw.js`，但找不到
`quarantine_push_device`、`push-subscription-v2`、`/functions/v1/push-cleanup`、`cleanup-required` 或
`notificationPushRuntimeComposition`。

### 已完成但仍 dormant 的零件

- `notificationPushDeactivation.ts`：最多讀 subscription 兩次、呼叫 `unsubscribe()` 一次，再分類
  `absent／deactivated／replaced／unknown`；production graph reference 為 0。
- `notificationPushOwnerQuarantine.ts`：有效輸入只呼叫一次 authenticated `quarantine_push_device` RPC；production
  graph reference 為 0。
- `notificationPushCleanupTransport.ts`：一次 cleanup action 最多 2 個 POST；只有第一個 response 是 exact
  `503 + {"outcome":"RETRY"}` 才送第二個，沒有自動背景重試。
- `notificationPushCleanupCoordinator.ts`：一次處理一筆既有 pending attempt；不掃 queue、不排 timer。
- `notificationPushRuntimeComposition.ts`：目前只組合 subscription、Auth-failure cleanup 與 manual re-enable，沒有
  browser deactivation、owner quarantine 或 sign-out coordinator。

### Server 指令的真實語意

兩條 cleanup command 最後都呼叫同一個 quarantine helper：

- 登入中的 owner 用 `quarantine_push_device(deviceId, consentEpoch, expectedVersion)`；資料不符會回
  `STALE_PUSH_DEVICE`。
- 登出後的 token holder 經 Edge 使用 `quarantine_push_by_token(tokenHash)`；格式錯、未知 token 與成功都固定回
  `OK`，避免洩漏 token 是否存在。

成功 quarantine 會把 consent 改成 `paused`、registry 改成 `quarantined`、刪除 active transport，並取消同 epoch
尚未完成的 delivery。它會保留 owner lock；這正是已核可的 durable quarantine，不是把整份 consent 紀錄直接刪掉。

## Hosted 唯讀實查

本輪重新查詢，不沿用舊文件數字：

- Function exact 2：既有 legacy dispatcher 與獨立 v2 canary；`push-cleanup` exact 0。
- Secret exact 17；名稱以 `PUSH_CLEANUP_` 開頭者 exact 0。只讀名稱，沒有讀 value。
- runtime mode：`disabled`。
- cleanup limiter、v2 consent、endpoint registry、v2 Push subscription：全部 exact 0 row。

本輪沒有 deploy、Secret mutation、Function request、資料寫入或 log raw value 查詢。

## 現在能確定的流量上界

目前只能確定兩件事：

1. 現有 production build 每個使用者行為觸發 v2 cleanup 的次數是 0，因為沒有 caller。
2. 日後接線後，一次明確交給 cleanup transport 的 action 最多 2 個 POST。

不能由此推算「每秒幾個 request」：目前沒有 v2 active device、登出事件統計、Auth rejection 統計、同一 NAT 下的使用者
分布、離線恢復尖峰或正式 rollout 比例。Hosted canary 的 1 ALLOW／19 LIMIT 只證明 limiter 會正確執行，也只量到
受控 sequential request 的 p95 450 ms；不能拿 canary policy 或 latency 當 production policy。

## 下一批建議

先完成一個仍保持 default-off 的 **sign-out cleanup coordinator**，固定下列責任與順序：

1. session 尚有效時讀取 exact local v2 binding。
2. 先把 server consent quarantine，讓 app 送信來源停用。
3. 再執行 browser capture／unsubscribe／reread。
4. owner RPC 未完成時保留 token cleanup attempt；完成時安全移除對應 pending attempt。
5. 所有結果都不能阻止 Auth local sign-out。

這一批應只做可注入、可單測的 coordinator 與 ordering contract，繼續維持 shell `disabled`，不配置 endpoint、key、policy
或 timeout。真正接上 production 前，仍要先取得以下證據：

- 可辨識目前 web deployment 對應哪一個 commit。
- 小比例 rollout 的 cleanup action count、ALLOW／LIMIT aggregate 與失敗率。
- 共享來源尖峰與 outage recovery burst。
- Edge／RPC latency 分布，才可決定 request timeout。

沒有這些資料前，production global／source capacity、refill 與 timeout 都保持未決定，不能猜數字。

## 驗證

- targeted Node：79／79 passed。
- production build：530 modules，完成。
- production assets 搜尋：v2 cleanup/runtime 字串 0 個檔；legacy Push 字串仍存在。
- Hosted read-only：Function／Secret／DB aggregate 與上述結果一致。
- 工作區在本文件修改前為 clean。
