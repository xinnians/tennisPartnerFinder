# FA-03 dispatcher D2 compatible source（repo／local only）

日期：2026-09-07
狀態：D2 已完成並通過 repo／local 驗證；沒有部署或修改 Hosted／Prod

## 白話結論

這一批把 D1 已完成的資料庫安全邊界，接到 repository 內的 dispatcher handler。實際送出前會再向資料庫確認
同意、裝置、endpoint 與事件仍有效，接著在同一筆資料庫 transaction 尚未結束時等待 provider 回應，再把結果寫回。

目前這條新路徑只允許明確的本機測試模式。Supabase Hosted 的 runtime marker 一出現就不能開啟它；本批也沒有部署
Function、套用 Hosted migration、建立正式密鑰、送正式 provider request 或填入任何 production policy。正式環境的
dispatcher 因此沒有被這批修改。

## 已完成內容

- `v2-runtime.js` 實作 begin worker、claim delivery、send transaction、finalize outbox 與 finish worker 的完整順序。
- 每一個 DB command response 都重新檢查 version、generation、worker／claim identity、delivery／outbox／notification ID、
  timestamp、event type、payload shape、endpoint／VAPID fingerprint 與固定 outcome code。Postgres `bigint` 一律只收
  canonical decimal string，不先轉成 JavaScript number。
- provider 結果只有已證明可以保存的 accepted、rate-limited、stale endpoint 或 permanent failure 才能寫回；timeout、
  transport 不明結果或契約漂移一律 fail-closed，不猜可重試狀態。
- `v2-database.ts` 使用一條 checked-out `PoolClient`，先確認 `current_user` 必須是
  `notification_dispatcher`，而且只能呼叫 D1 的七個 fully-qualified commands。
- prepare、外部 request、complete 都包在同一筆 `read committed` transaction；發生錯誤就 rollback。
- `v2-local-mock.js` 只接受 `http://host.docker.internal:<port>` 的測試 server；真正 subscription endpoint 仍須通過
  server-only provider origin policy。request 不跟 redirect，deadline 與 TTL 都由 DB 回傳資料計算。
- active `index.ts` 只有在非 Hosted 且 exact
  `NOTIFICATION_DISPATCH_V2_RUNTIME_MODE=local-test-v1` 時動態載入上述 adapters。其他路徑若看到
  `WEB_PUSH_TRANSPORT=mock` 會直接回 `WEB_PUSH_MOCK_FORBIDDEN`。
- 尚未切換的 legacy 路徑現在明確只讀 `outbox_format_version = 1`，不會誤拿 D1 的 v2 outbox。
- 失敗 log 只輸出固定 `{code,count,statusCode}`，本機測試另掃描 role password、cron secret 與 endpoint，全部未命中。

## 為什麼選這個 DB client

Supabase 目前的 Edge Function 說明使用 Deno `Pool`，並要求 checked-out connection；serverless 情境建議 transaction
pooler，而 transaction pooler 不支援 prepared statements。這一批因此使用 exact
`jsr:@db/postgres@0.19.5`，每次 invocation 只建立 pool size 1、checkout 一條 `PoolClient`，SQL 使用 `$1` 參數，沒有
prepared statement。[Supabase Edge 直連 Postgres](https://supabase.com/docs/guides/functions/connect-to-postgres)、
[Supabase connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres)、
[JSR @db/postgres API](https://jsr.io/@db/postgres/doc)

這裡沒有採用另一個常見方案 Postgres.js 作為 v2 transaction client。原因不是宣稱 Postgres.js
普遍不安全，而是截至本次查證，它有一個仍開啟的 transaction／pipeline connection reservation 問題；D2 的核心要求
正是不能讓 transaction 跨 connection 或跨 request 混用，因此不承擔這個已知風險。
[Postgres.js issue #1189](https://github.com/porsager/postgres/issues/1189)

## 真實本機整合證據

整合測試不是 mock DB，而是啟動真實 local Supabase Edge runtime、Postgres 與一個只在 host 上監聽的 mock provider：

1. 測試暫時替 dedicated role 設定隨機密碼，寫入權限 `0600` 的臨時 env file；結束後把 role password 恢復為 null，
   並刪除臨時檔。
2. 沒有 cron secret 的 request 回 exact 401，而且 worker count 不變。
3. 合法 request 以 `notification_dispatcher` 角色連線，claim 一筆 v2 delivery。
4. mock provider 收到 request 後故意暫停 response。此時另一條 authenticated connection 呼叫
   `set_notification_prefs(...session_updates=false...)`，在 `lock_timeout = 500ms` 下真的因 lock timeout 失敗。
5. provider 放行 201 後，dispatcher 回 `accepted=1`、`claimed=1`、`finalized=1`；delivery 為 accepted，v2 outbox 為
   completed，worker 為 `completed|normal_exit`。
6. v2 outbox 的 legacy `attempts`／`sent_at` 欄位維持 `0|null`；另外建立的 format 1 legacy row 也維持
   `0|null|1`，證明兩條資料路徑沒有混用。
7. transaction 完成後，同一個 preference setter 可以成功；已 terminal 的 accepted delivery 不會被事後改寫。

整合 fixture 的 generation、batch、worker lease、request deadline、delivery lease、attempt 與 TTL budget 都只存在測試
setup，並在 finally restore；它們不是 production 建議值。

## 完整驗證結果

- D2 runtime targeted tests：9／9。
- D2 local Edge／DB／mock integration：1／1。
- 完整 frontend CI：Node 613 passed／4 skipped；Playwright 348 passed／4 skipped；build 通過。
- bundle report：total JS 852,758 raw／261,346 gzip；開發期參考值超出 2,797／2,284 bytes；main chunk
  650,134／191,175，仍在 658,867／192,420 參考值內。這批沒有改前端 bundle，數字與 D1 相同；依既有決策，開發期
  只報告、不阻擋。
- 完整 Supabase CI：DB 18 files、1,290／1,290；local API 4／4；desktop 45 passed／11 skipped；mobile 6／6；
  cleanup Edge 1／1；Push subscription v2 Edge 1／1；dispatcher network canary 1／1；本批 dispatcher
  Edge／DB／mock 1／1。
- `supabase db lint --local --level warning`：0 schema error。
- `git diff --check`：通過。

## 驗證後本機狀態

- runtime control：generation 1、dispatch enabled、mode disabled、legacy writes enabled、legacy outbox handled false；
  cutoff、worker lease、request deadline、delivery lease、max attempts、TTL budget 全部是 null。
- D2 worker、canary、delivery、v2 outbox、v2 transport 全部 0 rows。
- `notification_dispatcher` password 已恢復 null；LOGIN 保留，INHERIT／SUPERUSER／CREATEDB／CREATEROLE／
  REPLICATION／BYPASSRLS 都是 false，`search_path` 仍為空。
- D2 fixture profiles 與 auth users 全部 0 rows。

## 尚未完成、不可誤認的部分

- D1 migration 尚未套到 Hosted；最近一次留下的 Hosted 證據是 38 migrations、最新 `202609040001`，但 D2 沒有重新
  查詢遠端，因此不能把它寫成目前遠端即時狀態。
- 正式 Deno-native encrypted Web Push sender 尚未接入 D2；本批只有受 hard gate 保護的 local mock sender。
- Hosted dedicated credential、secret、provider origin、request deadline、lease、attempt、TTL、generation、canary
  profile 與 rollback 條件都尚未設定。
- 沒有部署 repository 內更新過的 dispatcher，因此不能宣稱正式環境已使用 v2。

下一階段 D3 必須先做 Hosted 唯讀重查與 production sender 的 repo／local 驗證，再另外取得明確核可，才能執行 Hosted
migration、credential／secret、deploy、control write 或 canary request。
