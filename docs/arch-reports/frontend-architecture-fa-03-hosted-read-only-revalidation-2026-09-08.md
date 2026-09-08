# FA-03 Hosted 唯讀重驗

日期：2026-09-08

狀態：**通過；沒有改 Hosted。下一個外部步驟仍要另外核可。**

## 白話結論

Hosted 現況和交接文件一致，沒有查到不明的 production drift：

- 正式環境仍跑舊 dispatcher；repo 裡較新的 v2 route 尚未部署，這是已知且刻意保留的差異。
- 獨立 canary Function 和 repo 的 10 個 source file 逐 byte 相同。
- Push v2 runtime 仍是 disabled；沒有 v2 Push、worker、delivery、consent、endpoint registry 或 limiter 資料。
- 39 份 migration 全部一致；現有 4 筆 legacy Push 與 7 筆已處理 outbox 都未改變。

本輪只讀 Function／Secret 名稱、migration、資料庫 aggregate 與下載後的 source；沒有 deploy、Secret／credential 寫入、
Function request、runtime control、資料清除或 push。

## 實查結果

### Function

| Function                                 | Hosted 狀態                                                                                                            |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `notification-outbox-dispatch`           | ACTIVE、version 17、`verify_jwt=false`、bundle hash `649824d7e0985e832c72da15ac97493d44b89ec77cea52f86074c168c9aaa8bd` |
| `notification-outbox-dispatch-v2-canary` | ACTIVE、version 1、`verify_jwt=false`、bundle hash `07ba284436d66bddf2aa54fa59b7f6d6990d2ab7f6575e6f28d9fa3da54c2cc5`  |
| `push-cleanup`                           | 不存在                                                                                                                 |

canary 下載出的 10 個 source file 全部和目前 repo 逐 byte 相同。

舊 dispatcher 下載後的 `dispatch.js` 和 repo 相同；`index.ts` 和目前 repo 不同，但兩邊 hash 精確符合既有紀錄：

- Hosted：`0d618f63deaf3d6042bfdc6f5468088ba5b92ce0a3084b33343496e392b246b6`
- repo：`37fd11a72d6d717d7b46fee44003c0d268b2af3b8e068f530be2c90df2ea04cb`

差異就是 repo 已加入只允許 local exact mode 的 D2／D3A v2 route、v2 outbox filter 與 fail-closed guard；active Function
沒有部署這批程式。這不是新發現的 production code drift，也沒有把「尚未部署」誤寫成異常。

### Secret 名稱

- 6 個 `NOTIFICATION_DISPATCH_V2_CANARY_*` 名稱全部存在。
- 3 個既有 `WEB_PUSH_VAPID_*` 名稱全部存在。
- 4 個通用 dispatcher 名稱全部不存在：`NOTIFICATION_DISPATCH_DATABASE_URL`、
  `NOTIFICATION_DISPATCH_V2_EXPECTED_GENERATION`、`PUSH_PROVIDER_ORIGINS_V1`、`WEB_PUSH_TRANSPORT`。
- `PUSH_CLEANUP_*` 名稱為 0。

只核對名稱，沒有讀出或記錄 Secret value。

### Migration 與資料庫

- migration：39 local／39 remote，差異 0；最新皆為 `202609070001`。
- runtime control：exact 1 row、generation 1、dispatch enabled、mode disabled、legacy writes true、legacy handled false。
- 尚未決定的 worker lease、request deadline、delivery lease、max attempts、TTL safety budget 與 legacy cutoff 全為 null。
- worker 0、canary profile 0、delivery 0、consent 0、endpoint registry 0、limiter bucket 0。
- Push：total 4、legacy 4、v2 0。
- outbox：total 7、pending 0、format v1 7、format v2 0。
- 專用 DB role：exact 1、可登入、密碼仍配置；membership 0、`notification_dispatcher_api` USAGE true、
  `private` USAGE false、可執行 reviewed commands exact 7、public／private raw relation privilege 0。
- cron：4／4 active；其中 exact 1 個 legacy dispatcher job 維持每分鐘執行。

資料數字由 `supabase db query --linked` 的唯讀 aggregate SQL 取得；沒有讀出 endpoint、Push key、profile ID、payload 或
其他 row-level 敏感內容。

## 可以進行的下一步

目前最小且最容易復原的是 cleanup C1 source substage 重驗，範圍保持不變：

1. 暫時新增 exact 2 個 cleanup Secret。
2. 只部署 `push-cleanup`。
3. 最多送 1 筆未授權與 1 筆已授權空 body request，不 retry、零 DB write。
4. 依固定順序刪 Function、移除 2 個 Secret，再唯讀確認回到本文件基線。

已知副作用仍是 project-wide Secret mutation 可能增加舊 dispatcher 的 version metadata；驗收會看 bundle／source hash，
不把 version 數字當 code 內容。

這個範圍包含 deploy、Secret mutation 與 Hosted Function request，所以本輪沒有自行執行。dispatcher 真實 canary `dispatch`
還需要另外建立可回收 browser fixture，並真的送一則測試通知；不和 cleanup 重驗綁在同一批。
