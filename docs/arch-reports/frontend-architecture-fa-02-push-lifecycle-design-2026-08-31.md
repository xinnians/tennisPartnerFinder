# FA-02 Push lifecycle 詳細設計

最後更新：2026-08-31
狀態：**技術設計已核可；尚未修改 runtime 或資料庫**
查證基準：`e2f93321c5d66d53191c2163b8c2ae174deadba8`
核可日期：2026-08-31
核可結果：`1A、2A、3A、4A、5A、6A、7A、8A、9A、10B`

這份文件只處理 Web Push。內容分成「已查到的現況」、「已核可方案」與「實作邊界」，不把
尚未實作的方案寫成既有能力，也不把本機資料庫當成 hosted production。

## 先說結論

目前 Push 不是完整的「帳號＋裝置同意」：瀏覽器權限、畫面狀態、資料庫 endpoint 各自存在，
彼此沒有可靠對帳。一般登出會撤銷所有裝置的 refresh sessions，卻不會停止任何 Push；送信程式
也可能重疊送出，並把一台裝置成功誤當成所有裝置都成功。

建議改成：

1. 每個帳號在每個 logical device 都有獨立 consent。
2. 登出時先在 server 隔離，再處理 browser unsubscribe，最後只登出目前裝置。
3. 隔離後刪掉可送信的 endpoint／keys，只留不能寄信、只防止別的帳號接手的 fingerprint。
4. 一筆事件依核可政策固定可接收的裝置；每個裝置各自 claim、重試與結案。
5. 每筆已排隊通知都有明確 DB 截止時間；未知 endpoint 不靠猜測天數解除，Push service 也不再
   沿用套件預設四週的保存時間。

## 已確認的 10 項決策

下列選項原本是實作前的決策題，已於 2026-08-31 全部確認。實作只能採核可欄，不得自行改選。

| 題目 | 核可 | 實作結果 |
| --- | --- | --- |
| Q1 | A | owner-linked quarantine 不設日曆期限；只有 server 觀察到可信 provider 證據才解除 |
| Q2 | A | 同帳號、同 logical device 重新登入也不自動恢復；由使用者明確操作 |
| Q3 | A | 一般通知在事件建立時固定 recipient 與 logical device |
| Q4 | A | hosted canonical preflight 零例外時，legacy subscription 全部隔離並擦除 raw send material；任何例外都停止 contract |
| Q5 | A | UTC cutoff 前尚未送出的 legacy outbox 全部取消並保留稽核狀態 |
| Q6 | A | 採 current-stack 條件式 D4 邊界，接受文件明列的極小未觀察斷線空檔 |
| Q7 | A | 刪帳後保留不能寄信的 ownerless deny fingerprint，直到 server 有可信 provider 證據 |
| Q8 | A | TTL＝DB 剩餘時間減已查實 safety budget；budget 未查實時一律為 0 |
| Q9 | A | 每次 app boot 強制向 Auth server refresh；拒絕時 quarantine，離線／timeout 時本機 fail-closed |
| Q10 | B | 採第 8.4 節完整 10-event expiry matrix 與第 8.5 節 domain invalidation |

Q4-A 與 Q5-A 是已核可的 migration 政策，不等於已授權在未知 hosted 影響筆數下直接執行不可逆
contract。FA-03 必須先完成 hosted 唯讀 preflight；實際擦除或批次取消前，仍須回報精確影響筆數並
再次確認。

### Q1：隔離資料何時自動到期？

- **A（建議）**：不設天數；只有 server 自己觀察到可信的 provider stale／expired 證據才解除。
  Browser 回報 `unsubscribe()` 結果只記稽核，不解除全域 owner lock。隔離已刪 raw endpoint，server
  通常無法再探測，所以 fingerprint 實務上可能永久保留；它不能寄信。
- B：固定天數後釋放。Web Push 標準沒有安全天數；回覆必須寫 `1B＝N 天`，並接受舊 endpoint 仍有效
  的風險。

Q1 只管理帳號仍存在、仍有 owner 的 `quarantined` row；帳號刪除後的 ownerless `deny` 由 Q7 決定。

### Q2：同帳號、同 logical device 重新登入時，Push 是否自動恢復？

- **A（建議）**：不自動恢復；顯示「此裝置推播已暫停」，使用者按一次恢復。
- B：同帳號＋同 logical device 可自動恢復；換帳號仍必須重新 opt-in。

選 B 時，app 只會在同 owner、同 device、Browser subscription／VAPID 都重新對帳成功後建立新 epoch；
它走受限的 `resume_push_device`，不是偽裝成使用者按過 enable。換帳號與偵測到遠端撤銷／session
無效都不自動恢復。遠端撤銷多久能被偵測是 Q9，不藏在本題。

### Q3：一般通知何時固定接收裝置？

- **A（建議）**：事件建立時固定。之後才開啟／恢復 Push 的裝置不會收到舊通知。
- B：第一次 dispatcher fan-out 時固定；重新開啟 Push 後，可能收到尚未 fan-out 的舊通知。第一次
  fan-out 完成後就不再補裝置。

### Q4：既有 legacy subscription 怎麼處理？

- **A（建議）**：全部隔離，轉成只有 fingerprint 的 owner lock，刪除 raw endpoint／keys；使用者日後
  自行重新開啟 Push。
- B：不核可刪除舊 send material，FA-03 暫停，不執行這次 migration。保留 legacy active 不是安全選項。

Q4-A 使用下文已固定、與可否送信分離的 versioned fingerprint 演算法，不把不可重算的算法留到
刪除後再決定。但 contract 仍以 hosted canonical preflight 零例外為前提；任何 non-canonical／parse-fail
legacy row 都會停止擦除並回報，不會只留一個可能被 URL alias 繞過的 lock。

### Q5：cutover 前已排隊、尚未送出的通知怎麼處理？

- **A（建議）**：以記錄的 UTC cutoff 為界，全部標成 cancelled，保留稽核狀態但不再送。
- B：把它當成**一次性的 legacy migration 特例**，覆寫 Q3 的一般 fan-out 時點；只有尚未到 DB
  `expires_at`、且使用者在到期前重新 opt-in 的 row 才能建立 deliveries。選 B 後須先補一份特例
  migration 設計與測試，再進 FA-03，不能直接實作。

選 Q5-B 時：Q10-A 只允許兩種 reminder 依已知 deadline 回填，其餘 8 種 legacy row 全部取消；Q10-B
才依第 8.4 節 matrix 回填，已過期就取消。找不到 session、event 已退役或無法可靠計算 deadline 的 row
一律取消，不會等待。即使 deadline 可算，只要不能從現有 row 唯一重建第 8.5 節的
`source_id/source_version` 與有效狀態，也一律取消；不能猜 participant／message。

### Q6：重新確認 D4 的技術邊界

- **A（建議，但比原 D4 弱）**：接受目前 stack 能做到的最強條件式邊界。正常 DB transaction 持續
  有效時，隔離先完成就不呼叫 send adapter；send path 先持鎖時，隔離會等待。DB 斷線與遠端接受
  時間仍不能形成共同 transaction，必須列為殘餘風險。
- B：維持原本「只有 Push service 已確認接受才算 handoff」的嚴格定義。現有 Supabase Edge＋Web Push
  無法完整保證；需先停用 Push，或另建可序列化 send／cancel 的專用基礎設施。

Q6-A 是重新定義，不是把「程式開始 request」假裝成「Push service 已收到」。
若 driver 在 adapter invocation **之前**已回報 transaction／connection error，worker 必須丟棄 send
material，adapter call 為 0；若 adapter 已開始後才觀察到 DB error，結果只能記為 `unknown/in-flight`，
不可再啟動第二次 request。Q6-A 只接受 worker 尚未觀察到、但 DB lock 其實已失效的極小空檔為殘餘風險。

### Q7：帳號刪除時，未知 endpoint 的 fingerprint 怎麼辦？

- **A（建議）**：移除帳號連結後，保留 ownerless deny fingerprint；它不能寄信，但任何帳號都不能
  再註冊同一未知 endpoint。這是一筆無帳號連結的 pseudonymous identifier。
- B：跟帳號資料一起完整刪除；接受 server 失去最後 owner lock 的風險。
- C：server 未取得可信 provider deactivation 證據前不完成刪帳；安全最嚴，但可能永久阻塞使用者刪除帳號。

Q7-A 的 ownerless `deny` 沒有日曆到期日；只在 server 取得可信 provider deactivation 證據後解除。
它不受 Q1-B 的天數設定影響。

### Q8：Push service 在 DB 截止前可離線保存通知多久？

- **A**：用 DB 剩餘時間扣掉已查實的 request／clock safety budget 後算整數 TTL；budget 無法查實時
  自動退回 `TTL=0`。RFC 8030 不保證把 application server→Push service 或 Push service→UA 的 transit
  算進 TTL，因此仍接受通知可能在 DB deadline 後才到 UA。
- B：`TTL=0`，只嘗試立即送；離線裝置收不到，但 Push service 不會暫存。

現行套件預設 TTL 是四週；兩個選項都不沿用這個隱含值。無論選 A 或 B，DB row 到
`expires_at` 一律 cancelled，不會無限排隊。各 event 的 DB 截止依據見第 8.4 節與 Q10。

### Q9：遠端撤銷 session 後，Push 何時停止？

- **A（建議、符合目前 stack）**：每次 app boot 都先強制向 Auth server refresh，不沿用本機
  `getSession()` 結果。server 明確拒絕 refresh 時立即用 cleanup token 暫停；網路失敗時本機先
  fail-closed，server consent 要等下一次成功連線才能處理。單純收到背景 Push 不代表已檢查 session。
- B：不能等裝置再次連線；FA-03 先暫停，等 hosted Auth 能力查證完成，再設計 auth session 與
  logical device 的 server-side 綁定／撤銷訊號。

目前程式沒有 auth revoke hook，也沒有把 consent 綁到 auth session，所以不能把 Q9-B 假裝成現有能力。

### Q10：現有 Push event 要採哪一套到期／失效政策？

- **A（建議、fail-closed）**：先只開 `session_reminder`、`decide_reminder`；其餘 8 種仍保留站內資料，
  但暫停 Push，等逐類核可 deadline 再開。
- B：核可第 8.4 節完整 matrix，正式把 action／session 邊界定為 Push deadline，並採用第 8.5 節
  domain invalidation 規則。這是新增產品政策，不是目前程式已存在的通知政策。

目前只有兩種 reminder 能直接從通知文案與 query 確認語意截止點；其餘 event 雖有操作邊界，但不能
自行推論「過了該時間通知就沒有價值」，所以交由本題核可。

---

## 1. 本輪查證邊界

本輪已做：

- 逐檔核對 browser helper、auth、feature、RPC、migration、RLS、Service Worker、dispatcher、
  scheduler 與測試。
- 以本機 migration 後的 PostgreSQL catalog 核對欄位、constraint、grant 與 cron。
- 核對實際安裝的 `@supabase/auth-js`／`@supabase/supabase-js` `2.110.0`，以及 Edge import 的
  `web-push@3.6.7` 行為。
- 核對 W3C Push API、RFC 8030、Supabase、PostgreSQL 與 web-push upstream 文件／source。

本輪沒有做：

- 沒有修改 app、Service Worker、Edge Function、migration、generated types 或測試。
- 沒有查 hosted production 的 rows、env、provider endpoints 或 plan-specific function timeout。
- 沒有自行指定 quarantine 天數、request deadline 或新的 retry 次數。
- 沒有把理論方案寫成已在 Supabase hosted 環境驗證。

## 2. 已查到的現況

以下都是目前 source、本機 catalog 或實際測試可重現的事實。

| 範圍 | 已確認現況 | 證據 |
| --- | --- | --- |
| 建立訂閱 | 註冊 `/push-sw.js` 後直接取 subscription；既有 subscription 一律沿用 | `src/notificationPush.js:16-37` |
| Browser 邊界 | 沒等 `navigator.serviceWorker.ready`，也沒比對既有 `applicationServerKey` | `src/notificationPush.js:29-36` |
| UI | 只有開啟，沒有停用；enabled 只存在記憶體，reload 後不會從 browser／server 對帳 | `src/pages/MePage.tsx:452-483`、`notificationFeature.ts:58-90` |
| Consent | DB 只有 endpoint owner row；`notification_prefs` 是帳號事件開關，不是帳號＋裝置同意 | `202607230001_notifications_web_push.sql:9-23`、`202607270007_notification_rework.sql:13-16` |
| 登出 | auth-js `2.110.0` 預設 global；會撤 refresh token 並清本機 session，但既發 access JWT 到 expiry 前仍有效；Push 完全不清 | `src/data/authApi.ts:68-72`、installed `GoTrueClient.ts:3915-3949` |
| Browser cleanup | runtime 沒有 `PushSubscription.unsubscribe()`；remove RPC 雖存在，但 app 沒 caller | `src/` 全庫搜尋、`privateDataRepository.ts:345-348` |
| Subscription DB | `push_subscriptions` 恰 6 欄，沒有 state、consent、device、quarantine、version 或 expiry | `202607230001_notifications_web_push.sql:9-16`、本機 catalog |
| Ownership | endpoint 全表唯一；已存在且屬不同 owner 時會拋 `PUSH_ENDPOINT_OWNERSHIP` | 同 migration `:12,162-180` |
| Ownership 競態 | 兩個 owner 同時首次 insert 同一新 endpoint 時，loser 可能 0-row no-op，但 RPC 仍回 `OK` | 同 migration `:162-180` 的 `ON CONFLICT ... WHERE` 與無 row-count 檢查 |
| 直接權限 | authenticated 有 raw `SELECT/INSERT/DELETE` 與 sequence `USAGE/SELECT`，會繞過新狀態機 | 同 migration `:67-77,87-91`、本機 ACL |
| Dispatcher snapshot | 先載入整批 subscription，claim 後仍用舊 snapshot；送出前不重讀 | `notification-outbox-dispatch/index.ts:84-128` |
| Dispatcher claim | 只有 `attempts` CAS，沒有 lease／claim token；後一 worker 可在前一 worker 仍送信時再次 claim | 同檔 `:74-82,103-113` |
| 多裝置結果 | 任一裝置成功就把整筆 outbox 標 sent，其他暫時失敗的裝置不再重試 | 同檔 `:115-151` |
| DB 錯誤 | 404／410 delete 與 `sent_at` update 都沒檢查 error | 同檔 `:117-118,141-151` |
| Outbox | 只有 `sent_at`／`attempts`，沒有 claim、backoff、failed/dead-letter 狀態 | `202607230001_notifications_web_push.sql:33-46` |
| Payload | DB 只要求五個允許欄位至少一個存在；Edge 卻要求五個都存在，壞資料可中止整批 | `202607270003_session_chat.sql:66-78`、`dispatch.js:8-23` |
| TTL／timeout | `sendNotification()` 沒傳 options；web-push 預設 TTL 2,419,200 秒（四週），socket timeout 為 undefined | `notification-outbox-dispatch/index.ts:42-50`、web-push `3.6.7` upstream |
| Outbound target | save RPC 只驗非空／長度；web-push 向 endpoint 解析出的 hostname／port 發 HTTPS request | migration `:151-158`、web-push `3.6.7` source |
| Edge auth | gateway `verify_jwt=false`；handler 的 cron secret 是唯一 HTTP auth boundary，且現況未拒絕空 server secret | `supabase/config.toml:388-391`、`index.ts:63-67` |
| Service Worker | 只有 `push`／`notificationclick`；沒有 `pushsubscriptionchange`、owner 或 consent 檢查 | `public/push-sw.js:1-23` |
| Identity | 兩個 identity helper 在缺 `user.id` 時仍 fallback 到 access token | `profileOrchestrationFeature.ts:118-124`、`profileAuthFeature.ts:22-25` |

現況可形成這條風險鏈：A 開啟 Push → A 登出 → B 用同一 storage context 登入。A 的 DB row
與 browser subscription 都沒停止；A 的事件仍可能送到該瀏覽器。B 按開啟時會重用 A endpoint；
server 通常會拒絕既有 owner，但現行首次併發寫入另有錯回 `OK` 的缺口。是否真的顯示通知仍取決於
事件、Push service 與瀏覽器，不能寫成每次必然發生。

endpoint 由 authenticated 使用者寫入，Edge 又會對其 hostname／port 發 request，這是已確認的
outbound／SSRF 邊界。FA-03 必須限制 public HTTPS egress、private／loopback／link-local／metadata
位址、DNS rebinding、redirect、port 與 rate；provider allowlist 要依官方文件與實際 browser endpoint
查證，不能猜 hostname，也不能只驗字串長度。

### 2.1 本輪測試現況

- 實跑 `node --test tests/notification-data-api.test.js tests/notification-dispatch.test.js
  tests/notification-push.test.js`：13/13 通過；其中 8 個直接屬 Push／dispatcher，另 5 個是 prefs、
  court subscription、presence/data mapper。
- 現有測試沒有覆蓋真正 Edge handler、worker 重疊、logout cleanup、A→B、VAPID rotation、
  `pushsubscriptionchange`、TTL、endpoint egress 或 quarantine。
- 實跑 `npm run test:db`：804 個測試，802 通過、2 失敗。`notification_rework.sql` 以全表 reminder
  數量斷言，但 function 會掃本機其他 eligible session，現有 candidate row 因而多產生一筆；不是
  本輪變更造成，但 FA-03 前必須修成資料隔離測試。

## 3. 已確認且不能退讓的行為

1. Push 是「帳號＋裝置」明確 opt-in，不等於 origin 的通知權限。
2. 換帳號不能繼承前一帳號的 consent。
3. 一般登出只登出目前裝置，也只停止目前裝置的 Push。
4. cleanup 不確定時，server 必須 durable quarantine：立即 no-send、保留原 owner、不可轉讓。
5. 只被送信程式讀進記憶體不算外部 handoff。
6. cleanup 失敗不能卡住登出。
7. session 缺 `user.id` 時 fail-closed，不可用 access token 當 owner identity。

原 D4 要求「只有 quarantine 前已由 Push service 接受的通知可視為無法追回」。查證確認 PostgreSQL
與外部 Push service 沒有共同 transaction，現有 stack 無法證明這個精確邊界；已核可的 Q6-A 因此
取代原 D4，改採第 8.2 節的 current-stack 條件式邊界。仍不能把 request invoked、service accepted、
device displayed 混成同一件事。

## 4. 建議的資料模型

### 4.1 「裝置」的意思

logical device 是本網站同一個 origin storage partition／installation context 的隨機 ID，不是實體手機
序號。ID 放 IndexedDB，讓頁面與 Service Worker 共用；清除對應站台資料後會成為新 logical device。

一般頁面與 installed PWA 是否共享 storage、不同平台是否隔離，不能一概而論；FA-03 用 Chrome、
Safari、Firefox 與實際 PWA matrix 查證，不在文件假設每個 browser profile／PWA 一定獨立。

### 4.2 三層分工

| 資料 | 狀態 | 白話用途 |
| --- | --- | --- |
| `push_device_consents` | `enabled/paused/revoked` | 此帳號是否同意此 logical device 接收 Push |
| `push_endpoint_registry` | `active/quarantined/deny` | 全域 endpoint fingerprint owner lock；永遠不含可寄信資料 |
| `push_subscriptions` | row 存在／不存在 | 只有 active transport 才有 row，保存 endpoint／keys；隔離就刪除 |

獨立 registry 可處理 legacy row：它有舊 owner，卻沒有可信 device／consent，不能偽造 device ID
塞進新模型。依 Q7-A，帳號刪除時 registry 把 owner 清成 `NULL` 並轉 `deny`，不是假裝仍有 owner。

### 4.3 欄位、constraint 與 index

`push_device_consents` 至少包含：

- `id`、`profile_id`、`device_id`，且 `(profile_id, device_id)` 唯一。
- `state`、每次 enable／resume 都旋轉的 opaque `consent_epoch`、狀態時間與 `updated_at`。
- Web Crypto 產生的高熵 cleanup token；browser 保存原值，server 只存 hash，並支援 rotate／revoke。

cleanup token 只能 quarantine 同一 logical device。它不能讀 endpoint、啟用、刪除或轉讓；用途是
A session 已消失但 browser 偵測到換帳號時，仍能停止 A 的 server Push。

`push_endpoint_registry` 至少包含：

- `fingerprint_algorithm + endpoint_fingerprint` composite primary key、nullable `owner_profile_id`、`state`、
  `version`、固定 reason 與時間。
- `active/quarantined` 必須有 owner；`deny` 必須沒有 owner。
- 唯一算法固定為 `sha256-endpoint-utf8-v1`：對 endpoint **原字串**做 UTF-8 編碼後 SHA-256，保存
  32-byte binary digest。原字串不 trim、不做 Unicode normalization、不改大小寫、不 parse 或 serialize。
  這個定義不依賴會更新的 URL parser；legacy 與新值都能用同一算法重算。
- fingerprint 只代表 exact endpoint string 的相等性，不能拿來送 Push，也不是匿名資料。新資料永遠
  寫 algorithm tag；未來若升版，必須繼續用 v1 查舊 row，或先取得 deactivation 證據；不能在 raw
  endpoint 已擦除後靜默改 hash。

server-side helper 與 legacy conversion 必須共用固定 test vectors，逐 byte 比對 Web Crypto
`SHA-256` 結果。另在 FA-03 contract 前，把 URL canonicalization 實作 vendored／versioned 成不可隨
Node、Deno 或 Living Standard 自動改變的 `canonical-endpoint-policy-v1`；新 active input 必須等於該
policy 的輸出，再通過 public HTTPS、credential／fragment、provider origin、port、DNS 與 redirect policy。
canonicalization 只做 alias 防護與 egress validation，不改 fingerprint 的 exact bytes 定義。

hosted preflight 必須逐筆用同一 frozen policy 證明 legacy `endpoint === canonicalize_v1(endpoint)`。
任何 parse-fail／non-canonical row、同一 canonical value 不同 owner，或同一 exact fingerprint 不同 owner，
都會停止整個 destructive contract 並回報精確筆數；在另行核可處理前保留 raw endpoint／keys 且 Push
維持 disabled。只有零例外時，Q4-A 才能保存 exact fingerprint 後擦除 raw send material。這避免
`EXAMPLE.com:443/a/../b` 的 tombstone 被另一帳號用 canonical alias 繞過。

`push_subscriptions` 只保存 active transport：

- `consent_id` 唯一，`(fingerprint_algorithm, endpoint_fingerprint)` 也是 unique FK，所以一個 consent
  最多一個 active subscription，且 transport 明確指向同版本 registry row。
- raw endpoint、`p256dh`、`auth`、VAPID fingerprint、transport version 與時間。
- consent owner 必須等於 registry owner；只可透過固定 `search_path` 的 server command 維持。
- 所有 FK、dispatcher filter、registry state 與 pending delivery 查詢都有對應 index。

Browser 不再直接讀寫 raw tables。撤 authenticated 的 raw `SELECT/INSERT/DELETE` 與 sequence
`USAGE/SELECT`；每個 function 先 revoke `PUBLIC/anon/authenticated`，再只 grant 必要 role。前端只從
安全 command 讀狀態，看不到 endpoint／keys；private helper 也明確 revoke `PUBLIC EXECUTE`。

### 4.4 每個裝置各自有 delivery

新增 `notification_deliveries`：

- event 建立時，依 Q3 固定 logical `consent_id + consent_epoch`，不綁易輪替的 endpoint row。
- `(outbox_id, consent_id, consent_epoch)` 唯一，並有固定一次的 opaque `notification_id`。
- persisted state 固定為 `pending/processing/unknown/accepted/cancelled/failed`；`accepted` 只代表 Push
  service 接受，不代表 device 已顯示。
- 保存 `attempts`、`claim_token`、`lease_until`、`next_attempt_at`、固定 error code 與時間。
- 不複製 endpoint、keys 或 payload；送出時才解析目前 active transport。
- pause／revoke／quarantine 時，原子取消該 epoch 的非 terminal deliveries；重新 opt-in 旋轉 epoch，
  絕不復活舊通知。
- subscription／registry 清理不能 cascade 靜默刪除 delivery audit row。

`accepted/cancelled/failed` 是 terminal；`pending/processing/unknown` 是 non-terminal。暫時性失敗不是
`retry` state，而是寫回 `pending + next_attempt_at`；timeout／connection loss 寫 `unknown`，到期後才可
再次 claim。lease 到期可用新 token reclaim `processing`；超過核可 attempts 或已過 `expires_at` 分別轉
`failed`／`cancelled`。provider stale 也轉 `cancelled`，原因寫固定 code，不另造未定義的 `stale` state。

`notification_outbox` 增加非空 `expires_at`、fan-out 完成邊界與 `no_targets/cancelled/completed` outcome。
依已核可的 Q3-A，event transaction 立即建立 deliveries，並把 fan-out 標成 `frozen`；沒有目標時標成
`no_targets`。新 outbox 不會留下等待 dispatcher 補裝置的 `open` 狀態，之後開啟／恢復 Push 的裝置也
不會收到舊通知。這同時修正目前「一台成功就把其他台一起當成功」的問題。

outbox 同時保存可鎖定的 `source_kind/source_id/source_version`，讓 dispatcher 依第 8.5 節重驗 domain
狀態並從 current row 重建核可 payload；不能只看 event 建立時的 JSON snapshot。

reminder 另使用 DB 維護、單調遞增的 `sessions.notification_schedule_version`，欄位為
`bigint NOT NULL DEFAULT 1 CHECK (notification_schedule_version > 0)`；既有 session 回填 `1`，`0` 永遠只供 legacy outbox sentinel，
不會成為 current session version。`start_at`、`court_id`、`venue_type`、`range_end`、`decided_at` 改變，
或 `status` 跨出／回到 `open/full` 集合時才加一。現有
`notification_outbox_reminder_once_idx(session_id, recipient_profile_id, event_type)` 必須由相容 migration
改成包含 `source_schedule_version` 的唯一鍵。同版本 scheduler 重跑仍 `ON CONFLICT DO NOTHING`；改期
會先取消舊版本，再讓新版本各建立一次，不被已 cancelled 的舊 row 永久擋住。legacy row 先標 version
`0`；migration control 尚未宣告 legacy outbox handled 前，新 enqueue helper 對相同
session／recipient／event 看見 version 0 就保守不新增。contract 完成 Q5 後才切 control，之後 version 0
不再阻擋 current version。這避免 compatible window 同時出現 legacy＋新版 reminder。

現有 scheduler 每分鐘、最多三次先維持，因為這是已存在行為；retry 次數、lease 與 deadline 的
新數值由 hosted canary 決定。必須滿足：DB lock timeout < transaction deadline < Edge invocation
剩餘時間，而且接近平台 deadline 時不再 claim 新 delivery。

## 5. 狀態轉移

| 事件 | 前置條件 | 原子 server 轉移 | Browser／最後狀態 |
| --- | --- | --- | --- |
| 明確開啟 | 有 `user.id`、使用者按按鈕 | consent `enabled`＋新 epoch；registry 同 owner `active`；建立 active subscription | UI `enabled` |
| 同 owner refresh | consent `enabled`、epoch 相同 | 鎖舊／新 fingerprint，更新 active transport version | endpoint／VAPID 對帳完成 |
| 一般登出 | owner session 尚有效 | consent `paused`；registry `quarantined`；刪 transport；取消同 epoch deliveries | unsubscribe 後 local sign-out |
| 明確停用 | owner session 尚有效 | consent `revoked`；其餘同 quarantine | 必須再次按開啟 |
| A→B／client 偵測到 session 失效 | cleanup token 有效 | 只能把 A active 轉 quarantined 並取消 epoch | B 不繼承 consent |
| permission revoke／subscription change | SW 不假設有 session | 先記 local pending，嘗試 token quarantine | 前景 owner 再 reconcile |
| Push service stale | endpoint 已通過 provider policy，response 語意已確認 | 移除 transport；registry quarantine 或依證據刪除 | 不再重試該 transport |
| browser 回報已啟動 deactivation | captured endpoint 與 owner/version 相符 | 只記 audit；不單憑 client assertion 刪 registry | owner lock 繼續保留 |
| server 觀察到 provider expired/stale | endpoint 已通過 provider policy、response 語意已查證 | 依 Q1 解除 registry row | owner lock 解除 |
| 同 owner 再 opt-in | 明確 action、fingerprint owner 相同 | 新 epoch；registry active；重建 transport | 舊 deliveries 不復活 |

所有路徑共用一份 lock protocol，不在各段各寫一套：

1. 依序鎖 `session → participant/message`，同類 row 依 PK 遞增。
2. 再依固定 namespace 順序取得 guard advisory locks：`notification_pref(profile) →
   player_block(min_profile,max_profile) → court_subscription(profile)`，接著鎖已存在的對應 row。advisory
   guard 讓「目前沒有 prefs／block／subscription row」也能和並行 insert/delete 序列化。
3. 最後鎖 `consent → endpoint registry → active subscription → delivery`；fingerprint 依 binary bytes、
   數字 PK 依數值遞增，refresh 的 old/new fingerprint 也同序。

fan-out、send 與 domain invalidation 只取需要的 prefix／guard，但順序不能改。`set_notification_prefs`、
`set_player_block`、`set_court_subscriptions` 先取自己的同一 guard，再改 row 並取消 affected delivery；
它們不回頭取 session/outbox/consent。quarantine 只走第 3 步，不取 domain/outbox。claim 的短 transaction
只鎖 delivery，finalizer 只鎖 outbox，因此都不形成反向循環。

guard 一律在同一條 checked-out connection、同一 transaction 使用
`pg_advisory_xact_lock(namespace_id, key_hash)`；禁止 session-level `pg_advisory_lock`，避免 transaction
pooler 把 lock 留在下一個 borrower。三個 namespace 使用互不相同的固定 `int4 namespace_id`；profile
或 canonical `(min_profile,max_profile)` tuple 以同一個 versioned encoder 算 `int4 key_hash`。hash collision
只會多序列化，不會放行。一次要取多個 guard 時，先完整收集，再依
`(namespace_id, unsigned_key_hash, canonical_tuple_bytes)` 排序後逐一取得；對應實體 row 也用同 tuple
順序鎖，不能在 recipient loop 中邊走邊鎖。

domain RPC／上述 setter **永遠不鎖或更新既有 outbox**：event-creating transaction 可在取得上述 lock
後插入本 transaction 才建立、尚未對外可見的 outbox 與 deliveries；對舊事件只更新 domain row 並取消
已存在的 delivery。finalizer 只鎖 outbox，依 terminal deliveries 聚合，不再回頭取得 domain／consent
locks。這條限制避免 `outbox→session` 與 `session→outbox` 形成反向鎖。

FA-03 要有 absent-row insert/delete race、endpoint swap、event-creation fan-out/quarantine、deadlock、
lock timeout 與 pool exhaustion 測試。

## 6. Browser 與 auth 流程

### 6.1 明確開啟

1. 只接受含 `user.id` 的 session；缺少就清私人狀態並要求重登。
2. 取得／建立本 origin 的 logical device ID 與 cleanup token。
3. 檢查 `Notification.permission`；`PushManager.permissionState()` 只是技術檢查，兩者都不等於 consent。
4. 註冊 SW，等待 `navigator.serviceWorker.ready`，再用 protocol/version handshake 確認安全版 SW active。
5. 比對現有 `subscription.options.applicationServerKey` 與目前 VAPID public key。
6. 舊 owner 或 VAPID 不同時，先 quarantine、unsubscribe，再對帳；未確認舊 transport 安全前不轉讓。
7. 只有這次明確按下開啟，才呼叫 enable command。
8. ownership、client version 或 cleanup error 顯示專用訊息，不再只回泛用錯誤。

### 6.2 登出：server-first

final-v3 原草案先 browser unsubscribe。本輪建議改成 server-first，因 unsubscribe 與重讀期間仍可能
送信；先 server quarantine 才能先關閉 app 的送信來源。

1. A session 尚有效時捕捉 `user.id`、device、subscription 與 fingerprint。
2. 先把 IndexedDB 狀態改 paused；SW 從此不能顯示 owner／epoch 不符的私人內容。
3. 呼叫 owner quarantine command；同一 transaction 暫停 consent、移除 send material、取消舊 delivery。
4. 呼叫 `PushSubscription.unsubscribe()`，不論回 `true/false` 都再次 `getSubscription()` 做本機對帳。
5. 依 W3C 演算法，`true` 只表示 UA 已啟動 deactivation 且從此不得再把該 subscription 的 message
   交給 webapp；Push service request 失敗時 UA 應重試。`false` 表示當下已不是 active。兩者都是
   client 看見的結果，server 無法自行驗證，因此只寫 audit，不解除 registry owner lock；throw／timeout、
   重讀為 `null`／不同 endpoint 更不能當成 server-verifiable deactivation 證據。
6. 無論前面成功與否，都執行 `signOut({ scope:'local' })`，不能影響其他裝置。
7. server cleanup 失敗時，以 quarantine-only token 在背景與下次開 app 重試；UI 說明已登出、清理待重試。

若 DB 與 browser 同時離線失敗，不能聲稱 server 已隔離。這時 SW 只能 fail-closed，不顯示私人內容
（必要時顯示中性通知），並持續重試；網路失聯不是已完成 server quarantine。

### 6.3 換帳號、refresh 與 VAPID rotation

- A→B 先用 cleanup token quarantine A；B 仍須明確 opt-in。
- `pushsubscriptionchange` 把 old/new 寫入 IndexedDB 並嘗試 quarantine-only 同步；SW 不自行綁帳號。
- 前景頁面有有效 owner session 才 refresh；Background Sync 只提高可靠度，不是唯一恢復路徑。
- 每次 app boot／Me page 都對帳；VAPID key 不同就安全停舊 transport，再建立新 transport。
- local consent 缺失、owner／epoch 不符、server 狀態失敗，一律不顯示私人內容。
- 遠端 revoke／global sign-out 不會主動通知本設計的 Push state；現況 app boot 只呼叫 `getSession()`，
  讀的是 local session，不能偵測 server 已撤 refresh token。Q9-A 要改成 boot 時強制
  `refreshSession()`／等價 server check；只有 Auth 明確拒絕才用 cleanup token quarantine。網路
  timeout／離線時先把 local SW 標 paused、不顯示私人內容，但 server consent 仍可能 enabled，待下次
  online check。背景 SW 單純收到 Push 也不能證明 revoke。

依已核可的 Q2-A，任何 pause reason 都不會在登入或 reconcile 時自動恢復。UI 顯示暫停原因，只有
使用者明確按「恢復」後才走 `enable_push_device` 建立新 epoch；舊 delivery 永遠不復活。

## 7. Server command 與權限

現有 save／remove RPC 退役，改成：

| Command | 允許者 | 作用 |
| --- | --- | --- |
| `get_push_device_state` | 登入 owner | 只回 consent／transport 安全狀態、epoch、version |
| `enable_push_device` | 登入 owner、明確 UI action | 建立／恢復 consent、registry 與 active transport |
| `refresh_push_subscription` | 登入 owner、enabled epoch | 同 device 換 endpoint／keys，不建立新帳號 consent |
| `quarantine_push_device` | 登入 owner | 暫停／撤銷、刪 transport、registry quarantine、取消 epoch deliveries |
| `quarantine_push_by_token` | cleanup token holder | 只能 quarantine，不能讀、啟用、刪除或轉讓 |
| `record_push_deactivation_attestation` | 登入 owner | 記錄 captured fingerprint/version 與 UA 結果；不能解除 owner lock |
| `release_push_endpoint_lock` | dispatcher 專用 role | 只接受 server 觀察且符合核可 provider policy 的 stale／expired 證據 |
| `disable_push_device` | 登入 owner、明確 UI action | consent revoked，走同一 quarantine 流程 |

Q2-B 未採用，因此 FA-03 不建立也不 grant `resume_push_device`；登入、boot 與 reconcile 都不能用 cleanup
token 把 Push 改回 enabled。初次開啟與手動恢復都必須來自明確 UI action，並走
`enable_push_device`。

所有 command 用 epoch／version／fingerprint 做條件式更新。不同 owner 命中同 fingerprint 只能拒絕；
不能根據 client 宣稱轉移。endpoint 另通過 egress policy，並以 DB advisory／registry lock 解決
「兩個 owner 同時首次 insert」沒有既有 row 可鎖的競態。

`enable/resume/refresh` 會接觸 raw endpoint／keys，不能直接 grant 給 authenticated DB role；browser
帶 JWT 呼叫 authenticated Edge command service，Edge 驗出 `user.id`、執行 frozen canonical＋egress
policy，再用專用最小權限 role execute private DB function。browser 即使直接呼叫 PostgREST 也碰不到
private mutation。`quarantine_push_by_token` 走另一個只准 no-send 的 endpoint，不能共用 enable 權限。

Edge 不使用 postgres 管理員 DSN。建立專用 `notification_dispatcher` DB role，只能 execute 固定
`search_path` 的 private `SECURITY DEFINER` functions；撤 service role 對 raw endpoint/key table 的
直接權限。

## 8. 送信程式與 D4

### 8.1 Fan-out、claim 與 lease

依已核可的 Q3-A，outbox insert 同一 DB transaction 立即建立 deliveries 並凍結 epoch；沒有目標就標
`no_targets`。fan-out 依第 5 節取得 relevant domain row、prefs/block/court guard 與 consent lock，持有到
delivery insert／fan-out frozen commit；preference、block、subscription 或 quarantine 都不能在 fan-out
讀完後插隊，留下仍可送的舊 delivery。這不是等 dispatcher 執行才重新找裝置。

claim 使用 service-only function 與 `FOR UPDATE SKIP LOCKED`：

1. 依實際剩餘處理能力 claim，不先抓 100 筆再逐筆慢慢送。
2. 短 transaction 寫 `processing`、唯一 token、lease 與一次 attempt reservation 後 commit。
3. send transaction 依第 5 節完整順序鎖 domain row、absence guards、consent、registry、subscription、
   delivery，最後重驗 source validity、preference/block/court subscription、token、lease、epoch 與非
   terminal 狀態；任一已變更或 token 已換掉就不得呼叫 adapter。
4. send transaction 持有 delivery lock 時，reclaimer 的 `SKIP LOCKED` 不能偷走；lock 釋放後若 token
   已旋轉，舊 worker 也不能送。
5. quarantine 同一 transaction 取消該 epoch 的非 terminal deliveries。

delivery job／attempt 可重複執行；外部 Push acceptance 是 best-effort，可能 0 次或多次。max attempts、
expiry、cancel 或 worker 在 adapter 前 crash 都可能造成 0 次；Push service 接受後、DB commit 前 crash
則可能再次呼叫。固定 `notification_id` 與 SW tag 只能降低重複顯示，不能宣稱 at-least-once 或
exactly-once delivery。

### 8.2 DB 與外部 request 的條件式排序

只在 `sendPush()` 前多 SELECT 一次不夠，SELECT 後仍有 race。候選做法是 Edge 用 Postgres client
經 Supabase transaction pooler（`prepare:false`、每 isolate 小 pool），整個 transaction 固定使用同一條
checked-out connection。private function 取得上述 locks 並回傳當下 send material，Edge 在 transaction
仍有效時呼叫受控 send adapter，再以同 token 完成 `accepted`、寫回 `pending`，或保存 `unknown`。

在「DB transaction 持續有效，且所有 sender 都只走此路徑」的前提下：

- quarantine 先 commit：sender 重驗後不呼叫 adapter。
- sender 先持有 locks：quarantine 等這次 attempt 結束。

但這不是 PostgreSQL 與 Push service 的共同 transaction：

- lock 成功到 HTTP 呼叫之間仍有程式空檔。
- driver 若在 adapter invocation 前已觀察到 transaction／connection abort，worker 必須立即清掉
  send material，adapter call 為 0；若 request 已開始後才收到 DB error，就保存 `unknown/in-flight`，
  不能假裝撤回已發生的 call，也不能在同一 attempt 再送一次。
- DB 其實已斷、但 client 尚未觀察到的 lock→adapter 空檔列入 Q6-A 殘餘風險。
- request timeout 時，無法知道 Push service 是否已接受。
- Push service accepted 不等於 device received／displayed。

因此文件不宣稱「quarantine commit 後絕對零 request」。已核可的 Q6-A 是有前提與殘餘風險的
current-stack 邊界；未採用的 Q6-B 才維持原本嚴格要求，代價是先停用或新增專用基礎設施。

一般規則仍是不在 DB transaction 等網路。依 Q6-A，這是狹窄的隱私例外：一次一個 delivery、
固定 lock 順序、專用 role、小 pool、lock／transaction／總 request deadline、`try/finally` rollback／release。
web-push 的 `timeout` 只是 socket idle timeout，不是總 deadline；FA-03 必須包自己的整體 deadline，
數值由 hosted canary 與平台上限決定。

### 8.3 結果語意與 hardening

- `accepted`：Push service 回成功；不寫 `delivered`。
- `unknown`：adapter request timeout／connection loss；持久化為 non-terminal，設定 `next_attempt_at`，
  之後可再次 claim。其他暫時錯誤直接回 `pending`；`retry` 只是轉移結果，不是 schema state。
- 404 只有在 endpoint 已通過 provider policy 時，才依 RFC 8030 當 expired；410 要有 provider 證據。
- 429 尊重 `Retry-After`；其他 retry 不自行猜 backoff。
- malformed payload 只 fail 該 event，不中止整批；DB write error 全部檢查。
- `verify_jwt=false` 下，cron secret 非空是 deployment blocker；production mock transport 也直接拒絕。
- log 只留固定 code、status、計數；不記 endpoint、keys、payload、第三方原始 error。
- outbound envelope 帶固定 `notification_id` 與 opaque consent epoch；SW 先比對再顯示。
- SW URL 只允許 same-origin 核可 route；壞 JSON／URL fail-closed。
- DB payload constraint 要求五欄全存在且型別正確；清查舊資料後 validate event constraint。
- outbox 結案由 idempotent finalizer 鎖 outbox、fresh-check 全部 delivery terminal 後聚合；reconciler 補回
  worker crash 或多裝置同時結案留下的未完成 outcome。

### 8.4 DB deadline 與 Push service TTL

每筆實際建立的 outbox 都要有非空 `expires_at`；dispatcher 在 claim 前、取 send material 前與 adapter
前都檢查，過期就轉 `cancelled`。Q8 只決定 Push service 在這個 DB deadline 前能否暫存，不能讓 DB
row 無限等待。

目前資料庫沒有任何 notification expiry policy。逐一核對 10 種 event 後，只有兩種 reminder 的文案與
query 本身能直接證明語意截止點；其餘時間都是**現有操作窗口**，不等於既有通知政策。已核可的
Q10-B 正式把下表提案變成新產品規則：

| event | Q10-B 的 DB `expires_at` | 性質 |
| --- | --- | --- |
| `session_reminder` | `session.start_at` | 開打提醒到開打即失效 |
| `decide_reminder` | `session.start_at` | 未定案提醒到候選起點即失效 |
| `chat_message` | 候選且未定案：`start_at`；其餘：`start_at + 24 hours` | 新產品規則，借用現有 chat archived 邊界 |
| `host_new_request` | 候選且未定案：`start_at`；其餘：`start_at + 2 hours` | 新產品規則，借用現有加入窗口 |
| `guest_invited` | 候選且未定案：`start_at`；其餘：`start_at + 2 hours` | 新產品規則，借用現有邀請回覆窗口 |
| `court_new_session` | 候選且未定案：`start_at`；其餘：`start_at + 2 hours` | 新產品規則，借用現有探索／加入窗口 |
| `guest_request_reviewed` | `start_at + 24 hours` | 新產品規則；目前沒有 notification deadline |
| `session_updated` | `start_at + 24 hours` | 新產品規則；候選逾期通知可在 start 後才建立 |
| `session_decided` | `start_at + 24 hours` | 新產品規則；目前沒有 notification deadline |
| `session_cancelled` | `start_at + 24 hours` | 新產品規則；目前沒有 notification deadline |

FA-03 依 Q10-B 啟用完整表。`expires_at` 在 event transaction 依當時 session 值凍結；之後若 session
或來源狀態改變，依第 8.5 節取消／取代，不能偷偷重算舊 row。未來新增 event type 而沒有已核可
deadline 時，一律不建立 Push outbox。

上述邊界直接對照 `202607270007_notification_rework.sql:105-156`、
`202607270002_session_flow_rpcs.sql:120-159`、`202607270004_chat_block_hardening.sql:48-56,320-356,481-510`
與 `202607270005_discovery_decided_at.sql:1-8`；它們證明的是 reminder 語意或操作窗口。其他 emitter
另見 `202607270002_session_flow_rpcs.sql:257,274,288` 與 `202608060001_trust_counts.sql:219-224`。除了兩種
reminder，source 沒有通知 expiry 欄位或政策；因此表中其餘 8 種明列為 Q10-B 新規則。

舊 migration 曾允許、但目前 10 種 event constraint 已移除的 `district_new_session` 仍可能存在於
hosted legacy row（constraint 目前是 `NOT VALID`，本機資料不能代替 hosted 結果）。Q5-A 的 preflight
必須分 event type 回報所有 pending legacy row；contract 時一律依 UTC cutoff 取消，不能硬套
`court_new_session` 後繼續送。

現行 web-push 預設可在 Push service 保留四週，這不是本專案明確決策。依 Q8-A，FA-03 必須顯式傳
TTL：先用 DB clock 算剩餘毫秒，再扣除已由 hosted canary／平台文件查實的 request deadline 與
clock-skew safety budget，向下取整為非負整數秒；budget 尚未查實或剩餘不足就用 `TTL=0`。

RFC 8030 的 TTL 從 Push service 收到 request 才開始，service 也無義務把兩段網路 transit 算進去；
所以 Q8-A 只能降低、不能保證「UA 一定在 DB deadline 前收到」。實作仍要求 DB 過期後零新 adapter
call，payload 帶 `expires_at` 供 SW 再次 fail-closed，並測「quarantine 前 accepted、quarantine 後才到
UA」的晚到情境。

### 8.5 Domain invalidation

時間到期不夠：排隊期間若申請已審完、邀請已回覆或球局已取消，舊 Push 也必須失效。outbox 因此
另存 `source_kind/source_id/source_version`；dispatcher 不直接相信舊 payload，而是在持鎖 transaction
依目前 domain row 重建核可欄位。domain RPC 能在同一 transaction 主動取消時先取消，send path 仍做
最後一次 fresh check：

| event | adapter 前仍有效的必要條件；不符就 `cancelled` |
| --- | --- |
| `session_reminder` | session 仍 `open/full`、時間／場地版本相同、非未定案候選、尚未開始 |
| `decide_reminder` | session 仍 `open/full+candidates+undecided`、版本相同、尚未到候選起點 |
| `chat_message` | source message 仍存在；recipient 仍是 accepted member；雙方沒有 block；依 current session 重建安全 payload |
| `host_new_request` | source participant 仍維持 event 建立時的 `requested` 或 instant-`accepted` 狀態；session 未取消／expired |
| `guest_invited` | source participant 仍是 `invited`；session 仍可回覆邀請 |
| `court_new_session` | session 仍符合目前 discovery／join predicate 且尚有名額；recipient 仍訂閱目前 court／candidate courts 至少一個；依 current session 重建 payload |
| `guest_request_reviewed` | source participant 仍是該次 captured decision；recipient 仍擁有該 participant row |
| `session_updated` | 它是該 recipient/session 最新 update version，且 current session version 仍相同 |
| `session_decided` | current `decided_at`／session version 仍等於 captured value，且 session 未取消／expired |
| `session_cancelled` | current session 仍是 `cancelled`，且 event 對應該次 cancel version |

共同規則：notification preference 關閉、consent/epoch 失效、recipient 不再有存取權、source row 不存在，
都取消未送 delivery。cancel session 會原子取消同 session 其他已建立的 non-terminal delivery，再插入
新的 `session_cancelled` outbox；review/respond/withdraw 會取消對應 request/invite delivery；新 session update 會 supersede
較舊 `session_updated`，並取消已不符合 source version 的 reminder/decision event；
`set_court_subscriptions` 會取消 recipient 已不再訂閱任何對應球場的 `court_new_session` delivery。
所有 invalidation function 都用和第 5、8.1 節一致的 row order；找不到可證明仍有效的狀態就
fail-closed。

## 9. Quarantine 保存與解除

目前 W3C Push API Working Draft 明定 `expirationTime` 可為 `null`；deactivated subscription 不再收
訊息，且 deactivated endpoint 不得被新 subscription 重用。但 timeout／未知不是 deactivation 證據。

依已核可的 Q1-A：

- quarantine 刪 active transport，只留 registry fingerprint owner lock。
- Browser 的 `unsubscribe()` resolve `true/false` 只是 client attestation，server 無法證明 UA 或 Push
  service 的實際狀態，因此不解除 owner lock。
- 只有 server 自己從已通過 provider policy 的 endpoint 觀察到 RFC 8030 expired 404，或已有該 provider
  官方文件與 production canary 證實的 stale response，才可解除；410 不憑印象套用。
- 單獨看到 `getSubscription()` 為 `null`／不同 endpoint 不夠；refresh 後 old subscription 依 W3C
  可能短暫繼續接受訊息。
- 同 owner 明確 re-opt-in 可把自己的 registry row 重新 active，但不能藉此刪另一個舊 fingerprint。
- 不因 30／90 天經過就轉給另一帳號。

因 quarantine 已刪除 send material，server 後續通常也無法再主動探測該 endpoint，所以 row 可能長期
保留；這是 Q1-A 的明確代價，不是假設 client 回報可驗證。依 Q7-A，帳號刪除時轉成 ownerless deny；
FK 不得自行 cascade 掉 owner lock，也不得以 restrict 永久阻塞刪帳。這類 deny 沒有日曆期限，只能依
server 取得的可信 provider 證據解除。

## 10. Migration 與發布順序

FA-03 先對 hosted 專案做只讀 preflight，確認 rows、pending outbox、constraint、grant、cron、Edge env、
provider origins、platform timeout 與 in-flight 狀態，輸出精確影響筆數。

採 expand → compatible deploy → maintenance barrier → destructive contract：

1. **Expand**：只加 dispatch control、worker generation／lease、registry／consent／delivery 與新 command；
   outbox 的 `expires_at/source_*` 先允許 `NULL`，不假裝 legacy row 已有新語意，也不擦資料。接著把
   既有 session 的 schedule version 回填為 `1`，legacy reminder row 則固定回填 sentinel `0`；再新增
   `NOT NULL DEFAULT 1 CHECK (>0)` 與會尊重 migration
   control 的新版 enqueue function，再用含 `source_schedule_version` 的唯一 index 取代舊
   reminder-once index；切換須在同一 transaction，不能留下無 dedup 或新舊雙寫窗口。並把舊
   `save_push_subscription`／`remove_push_subscription` signature 換成
   compatibility shim：它先鎖 migration control row；`legacy_writes_enabled=true` 時維持相容行為，改成
   `false` 後一律回 `PUSH_CLIENT_UPGRADE_REQUIRED`，不能再寫 legacy row。
2. **Compatible deploy**：先部署會讀 maintenance control、記錄 worker、設定總 deadline 的相容 dispatcher；
   等超過已查實的舊 invocation 最長生命週期，不猜等待秒數。
3. **Barrier**：同一控制 transaction 記錄 UTC cutoff、把 `legacy_writes_enabled=false`、關 dispatch control、
   unschedule cron，確認零舊 generation／零 in-flight worker。已開始的舊 RPC 必須和 control row lock
   序列化，不能跨過 cutoff 成功寫入。
4. **Deploy disabled**：部署新 Edge、web、SW，但 Push 保持 disabled；新 app 要完成 active SW protocol
   handshake，舊 app／舊 SW／waiting SW 只能收到 `PUSH_CLIENT_UPGRADE_REQUIRED`，不能寫舊 RPC。
5. **Canary**：用測試帳號驗證新 schema、egress、locks、A→B、兩裝置、TTL 與 failure injection。
6. **Contract**：依 Q4-A 將 legacy row 轉 registry tombstone 並擦 raw send material；依 Q5-A 取消 cutoff
   前全部 pending outbox，Q10-B 只適用於新版 event。已 sent row 以 `sent_at` 回填 expiry；legacy attempts
   已耗盡但未 sent 的 row 先明確
   轉 `failed`，以 cutoff 作 terminal expiry；其餘無法分類的 row fail-closed `cancelled`。確認零 NULL 後
   validate CHECK、再 `SET NOT NULL`，最後才把 `legacy_outbox_handled=true` 並撤 legacy grants／RPC。
7. **Enable**：只允許新明確 opt-in，通過 production canary 後再 schedule cron。

每一步可重跑並有 migration progress marker。必測 shim 開／關與並行舊 RPC、cutoff 前已開始的 transaction、
中途失敗、部分完成、舊 tab、waiting SW、重跑與恢復 cron。destructive contract 前可正常 rollback；
Q4-A 執行後只能 **Push 保持停用並 roll forward**，不得從 log 或臨時檔還原 endpoint／keys。使用者
重新開啟 Push 是恢復途徑，不是資料 rollback。

## 11. 驗收矩陣

### DB／RPC／安全

- registry fingerprint 全域唯一；一 consent 最多一 active subscription；owner 永遠一致。
- `sha256-endpoint-utf8-v1` 以 exact string、無 normalization、32-byte digest 固定測試向量；canonical
  legacy 與新 command 逐 byte 一致，algorithm 不能在 raw endpoint 擦除後被靜默更換。
- frozen `canonical-endpoint-policy-v1` 不使用 ambient parser；legacy parse-fail／non-canonical／alias owner
  conflict 都使 destructive contract 停止，raw send material 不擦除且 Push 維持 disabled。
- fingerprint identity 與 egress allow/deny 分開測；不合 egress policy 的 legacy row 仍可 quarantine，
  但若不符合 frozen canonical policy，就不能進 destructive contract。
- 同 endpoint 兩 owner 首次併發，只有一方成功，另一方收到穩定 ownership error。
- quarantine 原子移除 send material、取消 epoch deliveries；不同 owner 不能接管。
- browser raw writes 全拒；cleanup token replay／rotation／遺失／猜測／跨 owner 全覆蓋。
- `resume_push_device` 不存在且無任何 role 可 execute；登入／boot／reconcile 不會自動恢復。只有明確
  UI action 能呼叫 `enable_push_device` 建立新 epoch。
- raw `SELECT/INSERT/DELETE`、sequence、private helper ACL、RLS、FK indexes、CHECK 精確驗證。
- 任意 host、private／loopback／link-local／metadata IP、DNS rebinding、redirect、非核可 port 被拒絕。
- 同 schedule version 的 reminder 只建立一次；改期先取消舊 row，新 version 可各建立一次，不被舊
  terminal／cancelled row 阻擋。
- session schedule version 對既有／新 row 都從 `1` 起且只能 `>0`；legacy outbox sentinel `0` 永遠不能
  成為 current version，Q5 後不會和新版唯一鍵碰撞。
- compatible window 看見 legacy version 0 時不新增新版 reminder；Q5 完成並切
  `legacy_outbox_handled=true` 後，version 0 不再阻擋 current version。

### Concurrency／dispatcher

- 兩 worker 不同時送同 delivery；reclaim 不偷已鎖 row；stale token 零 adapter calls。
- prefs／block／court-subscription row 原本不存在時的並行 insert/delete 也受共用 advisory guard 保護；
  mutation 先 commit 時零 adapter call，sender 先持 guard 時 mutation 等待。
- 多 recipient／多 block-pair guard 先全量排序；只呼叫 `pg_advisory_xact_lock`。namespace 隔離、hash
  collision 的保守序列化、commit/rollback 自動釋放與 transaction-pool connection reuse 全覆蓋。
- 在 transaction 持續有效的前提下，quarantine 先 commit 時 adapter call 為 0；sender 先持鎖時
  quarantine 等待。
- adapter invocation 前已觀察到 DB abort／connection error 時 send material 被丟棄且 call 為 0；
  invocation 後才觀察 DB error 時記 `unknown/in-flight` 且同 attempt 不重送。DB 已斷但 driver 尚未觀察到，
  以及 request timeout 後遠端仍 accepted，都有 failure-injection test 並記入 Q6-A residual-risk 指標。
- consent pause → re-enable 不復活舊 delivery；多裝置各自 retry。
- 第 8.5 節每種 domain transition 都有「主動 cancel」與「adapter 前 fresh-check」競態測試；不再有效的
  source 零 adapter call。依 Q10-B，10 種 event 都驗證第 8.4 節的 `expires_at` 與對應 invalidation。
- `court_new_session` 排隊後取消所有對應球場訂閱，主動 cancel 與 send-time recheck 都得到零 adapter call。
- Push service accepted、DB commit 前 crash 以同 notification ID 重試，SW 去重。
- 多裝置同時 terminal／finalizer crash 後，idempotent reconciler 可把 outbox 收斂到正確 outcome。
- `pending/processing/unknown/accepted/cancelled/failed` transition、lease reclaim、404／410 policy、429、
  DB error、malformed payload、attempt exhausted、expiry、pool saturation 全覆蓋。
- lock 順序 deadlock canary；監控 transaction duration、lock wait、quarantine latency、unknown、pool usage。
- event-creation fan-out 與 domain mutation 依同一 lock order 序列化；既有 delivery 由 domain
  transaction cancel，outbox-only finalizer 聚合，沒有 `outbox↔session` 反向鎖。
- log／HTTP response 不含 endpoint、keys、payload 或原始第三方 error。

### Browser／Service Worker

- `serviceWorker.ready`、active/waiting/old SW handshake、VAPID same/different、permission denied/revoked。
- unsubscribe `true/false/throw/timeout`，且 client attestation 永遠不能直接解除 registry owner lock。
- A enable → A local logout → B login；B 未 opt-in 不顯示或綁定 A Push。
- 同帳號兩 devices、兩 tabs、清站台資料、cleanup token 遺失、遠端 session revoke；Q9-A 要驗證
  app boot／auth refresh 前的窗口與偵測後 quarantine，不能寫成 server 或背景 SW 即時收到 revoke。
- `pushsubscriptionchange` 有／無網路；前景 reconciliation 可補回。
- consent 缺失、paused、epoch 不符、壞 JSON、外部 URL 時不顯示私人內容。
- `signOut({ scope:'local' })` 精確呼叫；缺 `user.id` 零私人 RPC。
- Q9-A boot 強制 auth refresh：server-rejected 走 token quarantine；offline/timeout 只 local fail-closed、
  不誤稱 server 已暫停；背景 Push 不假裝完成 session check。
- Q2-A 下所有 pause reason 都不會自動 resume；只有明確 UI action 能建立新 epoch，舊 delivery 不復活。

### Migration／gate

- old app/new DB、new app/old active SW、waiting SW、舊 worker、migration 重跑與部分失敗。
- legacy compatibility shim 開啟時相容、barrier 關閉後穩定拒絕；並行舊 RPC 不能跨 cutoff 寫入。
- outbox nullable expand、sent／failed／pending backfill、CHECK validate、`SET NOT NULL` 每一步可重跑；
  任一無法分類 row 阻止 destructive contract。
- maintenance barrier 能證明零舊 worker；destructive 後 rollback 明確保持 Push disabled。
- 實際 Chrome／Safari／Firefox 與 Supabase hosted canary，不以 mock 取代。

```text
node --test tests/notification-*.test.js
npm run test:db
npm run test:ci:frontend
git diff --check
```

## 12. 官方與 upstream 依據

- W3C Push API（目前 Working Draft）：<https://www.w3.org/TR/push-api/>
  - refresh／deactivation：§3.4.2–3.4.3
  - deactivated endpoint 不得重用：§4
  - `expirationTime`、`unsubscribe()`：§8
  - `pushsubscriptionchange`：§10.4
- RFC 8030 HTTP Web Push：<https://www.rfc-editor.org/rfc/rfc8030>
  - Push service accepted 與 TTL／transit 限制：§5、§5.2
  - expired subscription 的 404：§7.3
- Supabase sign-out scope：<https://supabase.com/docs/reference/javascript/auth-signout>
- Supabase Edge 連 Postgres：<https://supabase.com/docs/guides/functions/connect-to-postgres>
- Supabase transaction pooler：<https://supabase.com/docs/guides/database/connecting-to-postgres>
- PostgreSQL row lock：<https://www.postgresql.org/docs/17/explicit-locking.html>
- PostgreSQL `SKIP LOCKED`：<https://www.postgresql.org/docs/17/sql-select.html>
- Web Cryptography API `SHA-256`：<https://www.w3.org/TR/WebCryptoAPI/>
- WHATWG Encoding `TextEncoder`／UTF-8：<https://encoding.spec.whatwg.org/#interface-textencoder>
- WHATWG URL parser（只用於 egress validation，不參與 fingerprint）：<https://url.spec.whatwg.org/>
- web-push `3.6.7` options／TTL／timeout：
  <https://github.com/web-push-libs/web-push/blob/v3.6.7/README.md>
- web-push `3.6.7` request construction：
  <https://github.com/web-push-libs/web-push/blob/v3.6.7/src/web-push-lib.js>
