# FA-03 dispatcher D3A Deno-native Web Push sender

日期：2026-09-07
狀態：repo 與 local 驗證完成；Hosted migration、secret、deploy、request 與 runtime control 都未變更

## 白話結論

新版 dispatcher 的正式 Web Push 傳送程式已完成，但目前只存在 repo，尚未部署到正式環境。

本機測試已實際走完「Edge Function → 專用 Postgres role → 送出前資料庫重查與鎖定 → Web Push 加密 → DNS A／AAAA
檢查 → 固定核可 IP → 原 hostname TLS → HTTP response → DB 完成 delivery」整條路徑，收到 HTTP `204`，資料庫也精確
記成 accepted。測試使用隨機假資料與 Google `generate_204` 測試端點，不是實際使用者 subscription，也不能被解讀為
正式 FCM 推播已驗收。

為了避免 canary 影響目前每分鐘執行的 legacy dispatcher，repo 另外新增一支
`notification-outbox-dispatch-v2-canary`。它預設回 `503`，只有 exact Hosted manual-canary mode、獨立 secret、專用 DB
連線與 generation 都齊全時才可執行，而且一次最多 claim 1 筆。它不是「只能用一次」的 token；未來 Hosted 操作仍要由
操作流程限制只送一個 request，完成後立刻關閉。

## 實際完成的程式

- `v2-web-push-core.js`
  - 只接受 canonical HTTPS endpoint、固定六個 Web Push header 與 `aes128gcm`。
  - TTL 只使用 DB 回傳的 deadline／expiry／safety budget 計算結果。
  - response header 最多讀 `16,384` bytes；拒絕 header folding、重複 `Retry-After`、無效 status line 與控制字元。
- `v2-deno-web-push.ts`
  - pin `npm:web-push@3.6.7`，只用 `generateRequestDetails` 產生加密 body、VAPID header；沒有呼叫
    `sendNotification`。
  - 每次 request 都傳入 VAPID，不使用 process-global `setVapidDetails`。
  - 重新驗證 subscription、endpoint fingerprint 與 VAPID fingerprint；任一不符就不送。
  - DNS A 與 AAAA 全部必須是 public address；TCP 直接連其中一個核可 IP，再用原 hostname 做 TLS 與憑證驗證。
  - 自己寫出固定 HTTP/1.1 request、`Connection: close`，不使用 `fetch`、不跟 redirect、不共用 socket。
  - DB 提供的總 deadline 包住加密、DNS、TCP、TLS、寫入與 response；只有第一次寫入前才標記 request 已被呼叫。
- active `notification-outbox-dispatch/index.ts`
  - local-only v2 route 可選 `mock` 或 `deno-native-web-push-v1`。
  - Hosted 仍不能走這條 route；Hosted 若出現任何 `WEB_PUSH_TRANSPORT` 值，active dispatcher 會直接 fail-closed。
  - legacy route 仍只讀 `outbox_format_version = 1`。
- `notification-outbox-dispatch-v2-canary`
  - 是獨立 Function，不使用現行 cron secret，也不會被現行 cron 呼叫。
  - Hosted 必須是 exact `hosted-manual-canary-v1`；local test 使用不同的 `local-test-v1`，兩者不能互相代用。
  - application secret 必須是 32～256 UTF-8 bytes，DB URL 與 generation 沒有預設值；輸入前後空白不會被偷偷修剪。
  - `verify_jwt=false` 是因為這是 sessionless operator endpoint；真正授權是獨立高熵 header secret。即使檔案被誤部署，
    mode 缺失時仍只會回 `503`。

`16,384` bytes 不是憑感覺選的。本專案目前 Node runtime 的 `require("node:http").maxHeaderSize` 實查為 `16384`；
[Node 官方文件](https://nodejs.org/api/http.html#httpmaxheadersize)也記錄預設值是 16 KiB。這裡採相同上限，並另外拒絕
模糊或重複的安全敏感 header。

## 真實 local composition 證據

第二個整合案例使用：

- 隨機產生的 P-256 subscription key、16-byte auth 與另一組 P-256 VAPID key；
- 測試專用 profile／outbox／delivery；
- 測試專用 runtime：worker 20 秒、request 8 秒、delivery 15 秒、attempt 3、TTL safety budget 0、batch 1；
- endpoint `https://www.google.com/generate_204`，provider allowlist 也只含這個 origin。

實際結果：

1. Edge 使用 `notification_dispatcher` 直接連本機 Postgres，role identity 檢查通過。
2. prepare 在同一筆 transaction 內完成 fresh-check，產生 Web Push encrypted body 與 VAPID authorization。
3. Deno 解析 A／AAAA、驗證所有結果皆為 public、固定實際 TCP IP，TLS 仍以 `www.google.com` 驗證。
4. provider 回 HTTP `204`；delivery 成為 `accepted`，v2 outbox 成為
   `completed|deliveries_terminal_with_acceptance`。
5. 另外建立的 legacy row 保持 `attempts=0`、`sent_at=null`、format `1`。
6. runtime output 掃描 role password、canary secret、endpoint、subscription auth、VAPID private/public key，全部未命中。
7. finally 清除 fixture、還原 runtime，並把專用 role password 恢復為 null；測試內與測試後查詢都再次確認。

上述時間與 attempt 數字只是假資料測試向量，不是 production policy。

## 2026-09-07 Hosted 唯讀複查

- migration：39 local／38 remote；唯一 pending 是 `202609070001_notification_dispatcher_commands.sql`。
- `db push --linked --dry-run`：只列出上述 migration，`seeds=[]`、`roles=[]`。
- Function：仍只有 `notification-outbox-dispatch`，`ACTIVE`、version `14`、`verify_jwt=false`；新 canary Function 未部署。
- 本輪較早下載的 Hosted `index.ts` SHA-256 是
  `0d618f63deaf3d6042bfdc6f5468088ba5b92ce0a3084b33343496e392b246b6`，和 commit `9473871` 的 active source
  byte-identical；目前 repo 因 D2／D3A source 已前進，active `index.ts` hash 是
  `37fd11a72d6d717d7b46fee44003c0d268b2af3b8e068f530be2c90df2ea04cb`。這是已知的「尚未部署」，不是不明 drift。
- Hosted `dispatch.js` 與 repo hash 都是
  `69fb037953e84e78ef87e2c4c74015e25ba2ea88478f222533d36d03c84ca717`。
- runtime read-only snapshot：generation `1`、dispatch enabled、mode `disabled`、legacy writes enabled、legacy handled
  false，所有 lease／deadline／attempt／TTL／cutoff 仍為 null；worker、canary、delivery、v2 outbox、v2 transport 都是 0。
- 資料仍是 4 筆 legacy Push、7 筆 outbox、0 pending；provider-origin aggregate 是 4 筆都精確為
  `https://fcm.googleapis.com`，invalid scheme／host 為 0。
- 既有 VAPID／cron secret 名稱仍在；D3 的 DB URL、generation、mode、provider policy、transport secret 名稱都不存在。

本文件沒有保存 project ref、secret value、endpoint、Push key、profile ID 或 payload。

## 完整驗證

- targeted lint／Node：55／55。
- local dispatcher Edge／DB integration：mock transaction-lock 1／1；Deno-native encrypted sender 1／1。
- 完整 frontend CI：Node 627 total，622 passed／5 skipped；Playwright 348 passed／4 skipped；build 通過。
- bundle report：total JS 852,758 raw／261,346 gzip，開發期參考值超出 2,797／2,284 bytes；main
  650,134／191,175，仍在 658,867／192,420 內。Edge source 不會進 frontend bundle；依 D8 仍只報告、不阻擋。
- 完整 Supabase CI：DB 18 files、1,290／1,290；local API 4／4；desktop 45 passed／11 skipped；mobile 6／6；
  cleanup Edge 1／1；Push subscription v2 Edge 1／1；dispatcher network canary 1／1；本批 dispatcher 2／2。
- `supabase db lint --local --level warning`：0 schema error。
- `git diff --check`：通過。

最後一次 local post-state：

```text
runtime: 1|true|disabled|true|false|null|null|null|null|null|null
worker|canary|delivery|v2 outbox|v2 transport: 0|0|0|0|0
role: login true；inherit/superuser/createdb/createrole/replication/bypassrls false；password null
role search_path: empty
```

## 還不能宣稱完成的部分

- D1 migration 尚未套到 Hosted，所以 Hosted 還沒有 command schema 與專用 role。
- 沒有 Hosted 專用 role credential、direct connection string、D3 secret、provider policy 或 production runtime policy。
- 沒有 disposable browser canary subscription；Google `generate_204` 只證明傳輸結構，不證明真實 Push service 收件。
- 沒有部署 active dispatcher 或獨立 canary Function，沒有送 Hosted request，也沒有 generation rotation。
- 現行 production cron 與 legacy dispatcher 完全沒改。

下一個最小、可獨立回復的步驟只有套用 D1 additive migration；詳細界線見
`frontend-architecture-fa-03-dispatcher-d3-hosted-canary-preflight-2026-09-07.md`。
