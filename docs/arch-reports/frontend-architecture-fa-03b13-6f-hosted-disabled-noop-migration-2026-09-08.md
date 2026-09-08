# FA-03B13.6f Hosted disabled no-op migration

日期：2026-09-08

執行完成時間：2026-09-08 15:19 CST

狀態：**停點 M 完成；第 40 支 migration 已套 Hosted 並驗證。沒有部署 Function、改 Secret／cron／runtime、發 Function request 或改使用者資料。**

對應程式 commit：`da44bab`

## 白話結論

Hosted 資料庫現在也具備和本機相同的安全停用行為：v2 dispatcher 若在資料庫仍停用時被誤開，DB 會在建立 worker 前直接回 no-op。

本次只替換一支既有 DB function 的內容。套用後 migration 已是 40／40，runtime 仍 disabled，worker／delivery／v2 資料仍是 0；legacy Function、cron、Secret 與既有 4 筆 legacy Push／7 筆 outbox 都沒有改變。

## 套用前證據

- Git 工作區 clean，HEAD `afa9edc1d09b4c0414744648c0c578a71eff2ee9`。
- linked dry-run 精確只有：
  `202609080001_notification_dispatcher_disabled_noop.sql`。
- dry-run 沒有 seed 或 role 變更。
- runtime：generation 1、dispatch enabled、mode disabled、legacy writes true、legacy handled false；所有 policy 值 null。
- workers 0、deliveries 0。
- Push：4 legacy／0 v2；outbox：7 format 1／0 format 2，pending 全 0。

## 實際外部變更

執行 `supabase db push --linked --yes`，輸出只套用：

```text
202609080001_notification_dispatcher_disabled_noop.sql
```

這支 migration：

- 只 `create or replace` `notification_dispatcher_api.begin_notification_dispatch_worker(bigint)`。
- `dispatch_enabled=false` 回 `dispatch_disabled`。
- `new_runtime_mode='disabled'` 回 `runtime_mode_disabled`。
- 兩個 guard 都在 worker insert 前。
- 重申既有 revoke／專用 dispatcher role grant。

## 套用後驗證

### Migration／function identity

- linked migration list：40 local／40 Hosted，最新都為 `202609080001`。
- 再跑 linked dry-run：up to date，migrations／seeds／roles 都是空陣列。
- `pg_get_functiondef` MD5：
  - Hosted：`69490509d40c9f8dc3bde24a70217f7f`
  - local：`69490509d40c9f8dc3bde24a70217f7f`
- 因此本次替換的 function 定義在 local／Hosted 完全相同。

### Catalog／ACL

- owner：`postgres`。
- `security definer=true`。
- function config：`search_path=""`。
- `dispatch_disabled` 與 `runtime_mode_disabled` 各出現一次，兩個 guard 的位置都在 worker insert 前。
- execute ACL 只有：
  - `postgres`
  - `notification_dispatcher`
- `anon`、`authenticated`、`service_role` 的 execute 都是 false；PUBLIC 沒有 ACL entry。

### 真實 no-op

在 transaction 內呼叫 begin，最後 rollback；回應為：

```json
{
  "code": "runtime_mode_disabled",
  "generation": "1",
  "kind": "disabled",
  "version": 1
}
```

同一 transaction 內 worker count 是 0；rollback 後 Hosted aggregate 的 workers 仍是 0。

這裡使用一般 transaction 再 rollback，而不是 preflight 原先寫的 read-only transaction；原因是既有 function 會用
`SELECT ... FOR SHARE`，PostgreSQL read-only transaction 不適合執行該 row lock。實際驗證沒有留下資料寫入。

### Schema／lint

- linked DB lint：`public`／`private`／`notification_dispatcher_api` 無 schema error。
- strict linked pg-delta：
  - diff bytes 12,326。
  - default privileges 15。
  - revoke 51、grant 51。
  - drop 0、其他 statement 0。
- 這和 D1 Hosted apply 保存的基線數字完全相同；內容仍只有 Hosted 平台既有 public ACL／default privilege 差異，沒有本批 function、table、index、trigger 或 schema 結構 drift。

### Runtime／資料／平台資源

套用後再次實查：

- runtime control 全欄位和套用前相同，mode 仍 disabled。
- workers 0、deliveries 0。
- Push 4 total／4 legacy／0 v2。
- outbox 7 total／7 format 1／0 format 2，pending format 1／2 都是 0。
- cron 仍是 4 個；只有 legacy dispatcher cron，正式 v2 cron 0。
- migration 後最近 5 筆 legacy cron job run 都是 succeeded；仍不把 pg_cron enqueue 結果冒充 Function HTTP response。
- Hosted Function 仍只有 legacy version 41 與 canary version 25；版本沒有增加。
- Secret 名稱仍是原本 17 個；正式 v2 名稱與 `WEB_PUSH_TRANSPORT` 仍不存在。

## 執行異常紀錄

套用後一度並行執行兩個 Management API 只讀查詢，兩者都停在 `Initialising login role` 超過 60 秒。已中止這兩個查詢並改成逐一執行；migration list、dry-run、catalog、ACL、aggregate、lint 與 diff 隨後全部成功。

這個異常發生在 migration 已成功套用後的只讀驗證階段，沒有重送 migration，也沒有造成額外 Hosted 變更。

## 明確未做

- 沒有 deploy／delete 任何 Edge Function。
- 沒有發 Hosted Function 或 production HTTP request。
- 沒有讀 Secret value，也沒有新增、修改或刪除 Secret。
- 沒有改 runtime mode、generation、policy、cron 或 legacy cutoff。
- 沒有建立 fixture、真實 v2 Push、worker 或 delivery。
- 沒有 push remote、merge 或 Vercel deploy。

## 下一步停點

停點 M 已完成。下一步是 B13.6e 定義的停點 A：只更新 active legacy dispatcher，使它明確只查 format 1。

這會改動每分鐘被 cron 呼叫的 production Function，因此仍需獨立確認；不會和 disabled v2 Function 部署合併，也不會在 A 設定 v2 Secret、cron 或 runtime。
