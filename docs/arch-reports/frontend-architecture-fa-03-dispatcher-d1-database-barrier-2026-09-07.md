# FA-03 dispatcher D1 dormant database barrier

日期：2026-09-07
狀態：repo 與 local DB 完成；本批未套用 Hosted／Prod

## 白話結論

D1 已完成新版 dispatcher 需要的資料庫安全邊界，但目前仍是**休眠狀態**。

簡單說，新 dispatcher 之後只能透過 7 個固定命令工作，不能直接讀寫 Push raw tables；每次送 Push 前也能在同一個
Postgres transaction 內重新確認使用者同意、裝置版本、來源事件與 delivery lease。這一批沒有接上 active
dispatcher，也沒有啟用 Push v2。

## 這一批實際新增的內容

- 新增 migration：`202609070001_notification_dispatcher_commands.sql`。
- 新增專用 schema：`notification_dispatcher_api`。
- 新增專用 login role：`notification_dispatcher`。它沒有密碼、沒有 elevated attribute、沒有繼承其他 role、沒有
  raw table grant，也不能使用 `private` schema。
- 該 role 在 project schemas 中只能呼叫以下 7 個已審查命令：

  1. `begin_notification_dispatch_worker`
  2. `finish_notification_dispatch_worker`
  3. `expire_notification_dispatch_workers`
  4. `claim_notification_delivery`
  5. `prepare_notification_delivery_send`
  6. `complete_notification_delivery`
  7. `finalize_notification_outbox`
- command JSON 中的 generation、delivery／outbox／profile ID 與 transport version 都先 cast 成 canonical decimal
  string，符合 v1.3 的 bigint boundary，不經 JavaScript number。
- delivery claim 使用 `FOR UPDATE SKIP LOCKED`；過期的 processing lease 有對應 partial index。
- v2 outbox 的事件身分不可改；既有 fan-out 仍可做一次 `open → frozen`，frozen 後只能寫入已驗證的最終 outcome。
- notification preference、player block、court subscription 都加入同一組 transaction advisory guard。這讓
  「送出前查不到 row」和「同時新增／刪除 row」不會繞過 fresh-check。
- 上述三個既有 setter 會一併取消受影響、仍未完成的 v2 delivery；legacy 行為不變。

## 一次送出的資料庫順序

1. worker 以目前 generation 建立 lease；舊 generation 或過期 worker 不能再 claim。
2. claim 一筆 ready delivery；同一筆不會被兩個 worker 同時取得。
3. dispatcher 必須用同一條 checked-out Postgres connection 開 transaction，再呼叫
   `prepare_notification_delivery_send`。
4. prepare 重新確認 runtime、worker、canary、來源事件、recipient eligibility、preference／block／court guard、
   consent、epoch、registry、transport 與 delivery lease，並從目前資料重建 payload。
5. transaction 保持開啟時，只允許做一次外部 Push request，再用同一條 connection 呼叫 complete。
6. complete 只接受固定 outcome shape；最後由 idempotent finalizer 依所有 delivery 結果完成 outbox。

這是已核可 Q6-A 的條件式邊界：只承諾 DB transaction 仍有效期間的排序；外部 Push 與 PostgreSQL 本身仍不是同一個
原子 transaction，這個物理限制沒有被隱藏。

## 已驗證的事件與結果

event matrix 使用真實 local DB fixture，逐一完成 prepare 與 accepted completion，共 10 種既有事件：

- `session_reminder`
- `decide_reminder`
- `chat_message`
- `host_new_request`
- `guest_invited`
- `guest_request_reviewed`
- `session_updated`
- `court_new_session`
- `session_decided`
- `session_cancelled`

completion command 已驗證固定分類：accepted、retry-pending、unknown、cancelled、failed 與
provider-endpoint-inactive。retry 時間由 caller 提供；DB 不自行猜 production backoff。provider endpoint 被確認失效時，
只清除可證明對應的 transport／registry owner，並取消同 consent epoch 的非終態 delivery。

## 真併發測試

`notification_dispatcher_concurrency.sql` 使用兩條真實 `dblink` connection，已驗證：

- 同一 consent insert：只會一個成功，另一個得到 unavailable，最後只有一筆。
- 同一 endpoint registry：只會一個 owner 成功，失敗方不留下殘值。
- cleanup hash unique collision：只會一個成功，另一個得到 unavailable。
- 交叉 endpoint refresh：兩邊都安全失敗、原資料保留，而且沒有 deadlock。
- 兩個 worker 同時 claim 同一 delivery：一個取得、另一個得到 empty，attempt 只增加一次。

## clean reset 後的精確狀態

- local migration：`39` 份，最新 `202609070001`。
- runtime：generation `1`、dispatch enabled `true`、new runtime mode `disabled`、legacy writes `true`、legacy outbox
  handled `false`。
- worker lease、request deadline、delivery lease、max attempts、TTL safety budget：全部仍為 `null`。
- worker、canary profile、delivery、v2 outbox、v2 transport：全部 `0`。
- dispatcher role：password null；login `true`；inherit／superuser／create DB／create role／replication／bypass RLS
  全為 `false`；role config 只有 empty search path。
- 可呼叫 project function：`7`；effective raw relation privilege：`0`；role membership：`0`；有 API schema
  usage、無 private schema usage。

## 驗證結果

- `git diff --check`：通過。
- `npx supabase db reset --local`：39 份 migration 從零完成。
- `npx supabase db lint --local --level warning`：0 schema error。
- dispatcher command tests：52／52。
- dispatcher event matrix：14／14。
- dispatcher true-concurrency tests：26／26。
- 完整 DB：18 files、1,290／1,290。
- 完整 Supabase CI：local API 4／4、desktop 45 passed／11 skipped、mobile 6／6、Push cleanup Edge 1／1、
  Push subscription v2 Edge 1／1、dispatcher Edge canary 1／1。
- 完整 frontend CI：Node 604 passed／3 skipped、Playwright 348 passed／4 skipped、build 通過。
- generated DB types：重生後無差異。
- local schema diff：`public`、`private`、`notification_dispatcher_api` 無未記錄差異。

frontend bundle 的 development report 為 total 852,758 raw／261,346 gzip，比目前參考值多 2,797／2,284 bytes；
main 650,134／191,175 仍在該門檻內。依已確認 D8，開發期只報告、不擋 CI；D1 只新增 SQL、DB tests 與文件，沒有
修改 frontend bundle。

## 明確沒有做的事

- 沒有把 7 個命令接到 active dispatcher；D2 source 尚未開始。
- 沒有為 `notification_dispatcher` 建立 Hosted 密碼或 connection secret。
- 沒有把 migration 套到 Hosted；遠端仍不能被寫成已完成 D1。
- 沒有填 worker lease、deadline、delivery lease、attempt、TTL、backoff、provider origin 等 production 值。
- 沒有 rotate generation、加入 canary profile、建立 v2 outbox／transport、改 cron、停止 legacy writes 或清除
  legacy row。
- 沒有 deploy Function、送 Hosted request 或修改 Prod。

## 下一步

下一批是 D2 compatible dispatcher source：先在 repo／local 讓新 worker 使用上述命令與同一條 Postgres transaction，
但仍保持 production default-off，也不自行填任何 production policy。Hosted migration、DB credential、deploy、runtime
control write 與 canary request 都必須另外確認。
