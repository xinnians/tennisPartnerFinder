# FA-03 dispatcher D3 Hosted canary 執行環境結果

日期：2026-09-07
狀態：B 階段完成；獨立 canary 已部署，只有 no-write DB probe 實際執行

## 白話結論

Hosted 現在多了一支獨立、手動觸發的 v2 canary Function。它已用最小權限的 `notification_dispatcher` role 成功直連
Hosted Postgres；實際呼叫的是 `database-probe`，只確認連線身分，沒有建立 worker、沒有寫 DB、沒有送 Push。

現行 `notification-outbox-dispatch`、每分鐘 cron、runtime control、4 筆 legacy Push 與 7 筆 outbox 都沒有改變。真正的
`dispatch` action、browser fixture、runtime policy、generation rotation 與 legacy cutoff 均未執行。

## 實際設定範圍

- `notification_dispatcher`：設定新產生的 64-hex 隨機密碼；密碼沒有輸出、沒有寫入 repo 或文件。
- DB connection：使用 direct `db.<project-ref>.supabase.co:5432/postgres?sslmode=require`，沒有再使用先前出現密碼快取問題的
  Supavisor pooler。
- 新增六個 canary-only Secret：
  1. `NOTIFICATION_DISPATCH_V2_CANARY_DATABASE_URL`
  2. `NOTIFICATION_DISPATCH_V2_CANARY_EXPECTED_GENERATION`
  3. `NOTIFICATION_DISPATCH_V2_CANARY_MODE`
  4. `NOTIFICATION_DISPATCH_V2_CANARY_SECRET`
  5. `NOTIFICATION_DISPATCH_V2_CANARY_PROVIDER_ORIGINS_V1`
  6. `NOTIFICATION_DISPATCH_V2_CANARY_TRANSPORT`
- provider origin 不是猜測：設定前重新彙總 Hosted 既有 4 筆 subscription，唯一 exact origin 仍是
  `https://fcm.googleapis.com`。
- 沿用既有三個 VAPID Secret；沒有讀出或改寫 value。
- 只部署 `notification-outbox-dispatch-v2-canary`，`verify_jwt=false`；入口仍先受 exact mode 與 64-hex canary secret
  保護，驗證 secret 前不連 DB。

## Probe 結果

只送出一次以下動作：

```text
x-notification-v2-canary-action: database-probe
```

HTTP status 為 200，body exact 等於：

```json
{ "kind": "ready", "version": 1 }
```

該路徑連線後先確認 `current_user = notification_dispatcher`，再直接回固定結果；沒有呼叫
`begin_notification_dispatch_worker`，也沒有建立 sender。`dispatch` action 沒有被呼叫。

## 事後實查

| 項目                   | 結果                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| migration              | 39 local／39 remote，完全對齊                                                                                         |
| role flags             | LOGIN true；INHERIT／SUPERUSER／CREATEDB／CREATEROLE／REPLICATION／BYPASSRLS 全 false；password 非 null               |
| role membership        | 0                                                                                                                     |
| schema／raw data 權限  | `notification_dispatcher_api` USAGE true；`private` USAGE false；public／private raw relation privilege 0             |
| DB commands            | exact 7 個 reviewed functions 可執行                                                                                  |
| canary Secret          | 上述六個名稱全部存在                                                                                                  |
| 通用 dispatcher Secret | DB URL／generation／provider origins／transport 四個通用名稱全部不存在                                                |
| 既有 VAPID Secret      | 三個名稱的 CLI hash 與執行前完全相同                                                                                  |
| canary Function        | ACTIVE、version 1、`verify_jwt=false`、bundle hash `07ba284436d66bddf2aa54fa59b7f6d6990d2ab7f6575e6f28d9fa3da54c2cc5` |
| source parity          | 從 Hosted 下載的 10 個 Function source file 全部與 repo byte-identical                                                |
| runtime                | generation 1、dispatch enabled、mode disabled、legacy writes true、legacy handled false；所有 v2 policy 仍 null       |
| v2 資料                | worker 0、delivery 0、canary profile 0、v2 Push 0                                                                     |
| legacy 資料            | Push 4、outbox 7、pending outbox 0                                                                                    |
| cron                   | 4 個既有 job 的 ID、schedule、active 與 command prefix 不變；legacy dispatcher 仍每分鐘執行                           |
| linked lint            | extensions／dispatcher API／private／public 無 schema error                                                           |

現行 legacy Function 的 bundle hash 始終是
`649824d7e0985e832c72da15ac97493d44b89ec77cea52f86074c168c9aaa8bd`，因此沒有 production code drift。

## 操作中斷與復原紀錄

第一次設定已完成 Secret 與 Function deploy，但本機 zsh 把 `status` 視為唯讀變數，腳本在送 probe 前中斷。因為該次隨機
canary secret 不再可取得，沒有猜測或重用；隨即刪除 canary Function、移除 exact 六個 Secret、把 role password 恢復
null，並實查 worker／delivery／v2 row 仍為 0、legacy Push 4、outbox 7。

操作期間實際觀察到既有 Function 的版本 metadata 更新：第一次復原後 legacy version 14→16，第二次成功設定後
16→17；三個時間點的 legacy bundle hash 皆相同。因此只能確認 metadata 有變、source 沒變，不把版本號變化猜成 code
deploy。

第二次改用明確 Bash 執行，完成設定、單一 Function deploy 與 exact no-write probe。秘密值使用權限 0600 的臨時檔，完成後
已刪除；repo 沒有 credential 殘留。

## 目前保留與回復方式

目前保留專用 role 密碼、六個 canary Secret 與獨立 canary Function，供下一階段使用。若要回復 B：

1. 刪除 `notification-outbox-dispatch-v2-canary`。
2. 移除 exact 六個 canary Secret。
3. 執行 `alter role notification_dispatcher password null`。
4. 重查 role、Function／Secret 清單、runtime、cron 與資料計數。

## 下一步仍需產品確認

C 階段會建立可回收的真實 browser Push fixture，並可能讓指定測試帳號／裝置收到一則測試通知。這已超出 no-write probe；
在確認 fixture owner、使用哪個瀏覽器／裝置、通知文案與清理方式前，不使用現有 4 筆 legacy subscription，也不呼叫
`dispatch`。

## 外部規格確認來源

- Supabase direct／pooler connection 選擇：<https://supabase.com/docs/guides/database/connecting-to-postgres>
- Edge Function 直連 Postgres：<https://supabase.com/docs/guides/functions/connect-to-postgres>
- Edge Function Secret 管理：<https://supabase.com/docs/guides/functions/secrets>
- Supabase Postgres role：<https://supabase.com/docs/guides/database/postgres/roles>
- Supavisor 密碼輪替後的暫時驗證問題：
  <https://supabase.com/docs/guides/troubleshooting/supavisor-error-circuit-breaker-open-after-password-rotation-0fdb72>
