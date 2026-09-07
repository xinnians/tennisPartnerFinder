# FA-03 dispatcher D1 Hosted migration 套用結果

日期：2026-09-07
狀態：`202609070001_notification_dispatcher_commands.sql` 已套用並完成唯讀驗證；39 local／39 remote

## 白話結論

D1 資料庫安全邊界已成功放進 Hosted，但仍是休眠狀態。

Hosted 現在有專用 `notification_dispatcher_api` schema、7 個固定命令、passwordless 最小權限
`notification_dispatcher` role、delivery lease partial index 與 outbox immutability trigger。runtime 仍是 disabled，
沒有 worker、canary、delivery 或 v2 Push 資料；現行 legacy dispatcher、每分鐘 cron、既有 4 筆 legacy subscription 與
7 筆 outbox 都沒有改。

這次只有 migration。沒有建立 role password、沒有設定 secret、沒有部署 Function、沒有送 request，也沒有改
runtime control、generation、cron、legacy cutoff 或使用者資料。

## 實際執行範圍

套用前最後一次 dry-run：

```text
migrations: [202609070001_notification_dispatcher_commands.sql]
seeds: []
roles: []
```

實際 `db push --linked` 也只回報套用同一支 migration。套用後 migration history 為 39 local／39 remote，最新兩邊
都是 `202609070001`，沒有停在中間版本。

## Hosted 唯讀快照

Snapshot：`2026-09-07T08:48:43.468176+00:00`（台北時間 16:48:43）

查詢在同一個 `REPEATABLE READ READ ONLY` transaction 內執行，最後 rollback。

| 項目 | 實查結果 |
| --- | --- |
| runtime | generation 1、dispatch enabled、mode disabled、legacy writes enabled、legacy handled false |
| runtime policy | cutoff、worker lease、request deadline、delivery lease、max attempts、TTL budget 全部 null |
| legacy Push | 4 |
| v2 Push／consent／registry | 0／0／0 |
| outbox | 7 total／0 pending／0 v2 |
| delivery／worker／active worker／canary profile | 0／0／0／0 |
| cleanup limiter | 0 |
| application data | sessions 2、participants 2、messages 2（16:52:39 的第二個 read-only snapshot） |
| pg_net queue | 0（同一個第二快照） |

`pg_net queue=0` 只代表查詢當下，不是對外部 provider in-flight 的保證；本批沒有做 runtime 切換。

## Role 與 command 驗證

- `notification_dispatcher_api` schema 與 `notification_dispatcher` role 都存在。
- role：LOGIN true；INHERIT／SUPERUSER／CREATEDB／CREATEROLE／REPLICATION／BYPASSRLS 全 false；password null；
  role config 只有 empty `search_path`。
- 可在 project schemas 實際 resolve＋execute 的 function 正好 7 個。
- 7 個 command 全部由 `postgres` 擁有、`SECURITY DEFINER`、empty `search_path`。
- `public`／`anon`／`authenticated`／`service_role` 對這 7 個 command 的 effective execute count 是 0。
- role 對 `public`／`private`／`notification_dispatcher_api` raw relations 的 effective privilege count 是 0，role
  membership 也是 0。
- role 有 command schema usage、沒有 private schema usage。
- `notification_deliveries_processing_lease_idx` 正好 1 個，valid／ready 都是 true，欄位為
  `(lease_until, created_at, id)`，predicate 是 `(state = 'processing'::text)`。
- `notification_outbox_maintain_v2` trigger 存在、enabled、不是 internal trigger。

第一次綜合 catalog 查詢把 dollar-quoted expected predicate 內的單引號又重複 escape，導致比較式錯誤回 false。隨即只讀
取出實際 index definition，確認 index 正常；修正驗證 SQL 後 `processingLeaseIndexValid=true`、definition count 1。
這是驗證查詢錯誤，不是 migration 或 Hosted index 失敗，也沒有因此執行任何修復寫入。

## Schema diff 與 lint

`db diff --linked --schema public,private,notification_dispatcher_api --strict-coverage` 的去敏摘要：

```text
engine: pg-delta
diff bytes: 12,326
structural statements: 0
default privilege statements: 15
revoke statements: 51
grant statements: 51
drop statements: 0
```

diff 沒有提到 `notification_dispatcher_api`、dispatcher role、processing lease index、outbox trigger 或本批替換的三個
guarded setter。剩餘內容只有 Hosted 平台既有的 public/default privilege 差異；同類差異已在 2026-08-31 preflight
與 2026-09-04 migration apply 文件保存，不是 D1 新增的結構 drift。

`db lint --linked --schema public,private,notification_dispatcher_api --level warning`：No schema errors found。

## Function、secret 與 cron 沒有被帶動

- Hosted Function 仍只有 `notification-outbox-dispatch`：ACTIVE、version 14、`verify_jwt=false`。
- D3A 新增的 `notification-outbox-dispatch-v2-canary` 沒有部署。
- 仍只有既有 cron／三個 VAPID secret 名稱；D3 的 DB URL、generation、mode、canary secret、provider policy 與
  transport secret 名稱都不存在。本文件沒有讀取或保存任何 secret value。
- cron job `dispatch-notification-outbox` 仍是 active、schedule `* * * * *`；另外三個既有 job 的名稱、schedule 與
  active 狀態也仍存在。查詢沒有讀出 cron command，避免保存 URL 或授權材料。
- Function version 仍是 14，證明 migration 沒有觸發 Function deploy。

## 下一步邊界

使用者已明確授權本專案後續所有 migration，不必逐支再詢問；仍須每次先 dry-run、限制 exact scope 並在套用後驗證。
這項持續授權不包含 role credential、secret、Function deploy、Hosted request、runtime control、使用者資料清除或
legacy cutoff。

下一步若要進 D3 Hosted manual canary，仍要另外確認：

1. 產生 dedicated role password 與經實際連線驗證的 direct DB URL；
2. 設定 D3 secrets；
3. 只部署獨立 canary Function；
4. 建立可回收的 browser canary subscription，最多送一個明確核可的測試 request；
5. 關閉 mode、刪除 Function／D3 secrets、恢復 role password null 並清除 exact fixture。

現行 active dispatcher 與 cron 在上述另行核可前保持不變。
