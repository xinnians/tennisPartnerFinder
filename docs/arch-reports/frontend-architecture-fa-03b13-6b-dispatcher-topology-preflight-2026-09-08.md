# FA-03B13.6b dispatcher topology 前置複核

日期：2026-09-08

狀態：**完成；決定 legacy 與 v2 使用兩支獨立 scheduled Function。只有 repo／Hosted 唯讀查證，沒有改 source 或 Hosted。**

## 白話結論

v2 dispatcher 不應直接塞進目前的 legacy Function 當成二選一分支；應保留現有 legacy worker，再新增一支獨立的
`notification-outbox-dispatch-v2`。

原因很直接：現在的 Function 每次 request 最後只回一個流程。若 Hosted mode 打開後直接 `return` v2，該分鐘的 legacy
outbox 就不會處理；若把兩套流程硬塞在同一個 request，legacy 的最多 100 筆 send、v2 的 transaction／總 deadline 與兩套
錯誤結果又會共用同一個 Function 時間與失敗邊界。repo 與 Hosted 都沒有證據能證明這種耦合安全。

兩支 Function 可以讓 legacy 繼續跑，v2 單獨停用、canary、回復或換 generation，不需要拿既有使用者的推播一起冒險。
這是根據已查證程式行為做的架構選擇，不是 production 流量推測。

## 已查證的現況

### active legacy Function

- Hosted `notification-outbox-dispatch` 目前 version 41，每分鐘由唯一的
  `dispatch-notification-outbox` cron 呼叫。
- Hosted source 仍是舊 entry；它沒有 `outbox_format_version = 1` filter。
- repo entry 已有該 filter，但 v2 route 仍只允許 local `local-test-v1`；Hosted marker 存在時一定走 legacy。
- repo legacy entry 看到通用 `WEB_PUSH_TRANSPORT` 有值會直接拒絕，這是避免 production 誤用 mock／未核可 v2 transport 的
  既有 fail-closed guard。

### v2 core 與 canary

- D1 DB commands 只 claim `outbox_format_version = 2`。
- DB mode `canary` 時只 claim `notification_runtime_canary_profiles` 內的 recipient；mode `enabled` 才 claim全部 v2。
- v2 sender 需要同一條 checked-out `notification_dispatcher` connection，並在 send transaction 中完成
  prepare → provider request → complete；它和 legacy 的 REST／snapshot／attempts 流程不是同一種工作模型。
- 獨立 `notification-outbox-dispatch-v2-canary` 已在 Hosted 成功做過 no-write DB probe，10 個 source dependency 目前仍與
  repo 逐 byte 相同。這已證明「v2 使用獨立 Function」在目前平台可運作。
- canary 的真實 `dispatch` 尚未執行；不能把 no-write probe 當成正式 sender latency 或成功率證據。

### Hosted cron 與資料

2026-09-08 本輪重新以 aggregate 查詢：

| job                               | schedule       | active | target            |
| --------------------------------- | -------------- | ------ | ----------------- |
| `expire-stale-tennis-sessions`    | `*/15 * * * *` | true   | DB 工作           |
| `dispatch-notification-outbox`    | `* * * * *`    | true   | legacy dispatcher |
| `purge-archived-session-messages` | `30 3 * * *`   | true   | DB 工作           |
| `enqueue-session-reminders`       | `*/5 * * * *`  | true   | DB 工作           |

目前沒有任何 cron 指向 `notification-outbox-dispatch-v2`。Supabase 官方文件確認 Hosted 可用 `pg_cron`＋`pg_net` 定期呼叫
Edge Function，並建議同時執行的 job 不超過 8；目前是 4 個 job，但這不等於已決定 v2 schedule 或允許新增正式流量。

資料仍是 legacy Push 4、v2 Push 0、pending outbox 0、worker／delivery 0、DB mode disabled；時間與 attempt policy 都是 null。

## 為什麼不採同一支 Function

### 直接二選一：不採

現行 entry 在授權後先判 runtime，再 `return runLocalV2Dispatch()` 或走 legacy。若把 Hosted v2 也接到這個早退分支，v2 mode
開啟後同一筆 cron request 不會再執行 legacy。這和「legacy coexistence」要求衝突。

### 同一 request 依序跑兩套：不採

- legacy batch 最多 100 筆，沒有完整總 deadline；v2 每筆要求 DB 提供 request deadline。
- 任一流程卡住或回 500，另一流程的可觀測結果會被混在同一個 response。
- rollback 不能只停 v2 Function；必須再次 deploy 或切同一入口內的分支。
- 目前沒有測試覆蓋兩套 sender 同 request 的資源、timeout、部分成功與重入行為。

### 兩支 scheduled Function：採用

- legacy Function 只讀 format 1；v2 Function 只經 D1 commands 處理 format 2。
- 兩邊可有獨立 mode、batch、DB credential mapping 與固定 log code。
- v2 可先 deploy disabled，再加獨立 cron；停用或回復不會改 legacy route。
- 現有 manual canary 就是同類拓撲，已有 Hosted source 與 DB connection probe 證據。

## Secret 與設定邊界

正式 v2 Function 應使用自己的前綴，再映射給既有 sender，不直接設定 legacy entry 會檢查的通用
`WEB_PUSH_TRANSPORT`：

- `NOTIFICATION_DISPATCH_V2_RUNTIME_MODE`
- `NOTIFICATION_DISPATCH_V2_DATABASE_URL`
- `NOTIFICATION_DISPATCH_V2_EXPECTED_GENERATION`
- `NOTIFICATION_DISPATCH_V2_BATCH_SIZE`
- `NOTIFICATION_DISPATCH_V2_PROVIDER_ORIGINS_V1`
- `NOTIFICATION_DISPATCH_V2_TRANSPORT`

VAPID 三個既有 Secret 可共用，但只在實際上線前比對 public-key fingerprint，不讀出或寫進文件。cron request 可沿用既有
`x-notification-cron-secret` 契約；新 entry 必須額外拒絕空 Secret，不能沿用 legacy 的空字串相等漏洞。

Supabase 官方文件將 remote secrets 管理在 project 層，repo 先前的 canary 實作也已證明前綴隔離可避免 active legacy entry
讀到 v2 transport 名稱。因此正式 v2 沿用同一隔離方式，不把 canary-only 名稱直接升格成 production 名稱。

## 固定批次順序

### 啟用前必須先補的 DB disabled 邊界

目前 `begin_notification_dispatch_worker` 會先建立 worker，再由 claim command 判斷 DB mode。當 DB mode 是 `disabled`、但
Function mode 被誤開時，begin 仍可能成功建 row，後續 claim 才回 disabled；現行 runtime 又會把這個結果判成 contract error，
最後留下 failed worker。這不是資料派送，但會製造不必要的 worker 寫入與錯誤訊號。

因此 dedicated v2 Function 可以先做成 default-off source，但**不能排程或啟用**，直到 additive migration 把 disabled 判斷移到
begin 前端，並讓 runtime 把 disabled 視為明確 no-op。這項缺口來自現行 SQL 與 runtime 的逐行查證，不是 production 推測。

1. `B13.6c`：source-only 建立獨立 `notification-outbox-dispatch-v2`，預設 unavailable；沒有 cron、Secret、request 或 DB write。
2. `B13.6d`：additive migration／runtime 修正上述 disabled no-op；先在 local 驗證，不建立 Hosted cron。
3. 外部停點 A：只部署目前 repo 的 format-1 compatible legacy dispatcher，重驗 legacy 4 rows／pending 0／source hash；
   不配置任何 v2 Secret。
4. 外部停點 B：部署 disabled v2 Function，確認無 mode 時只回 503；不建立 schedule。
5. policy evidence 完成後，才配置 v2 namespaced Secret；mode 仍先 disabled。
6. 另做 additive migration 建立獨立 v2 cron，初始 inactive；migration 雖已取得持續授權，Hosted 套用與 cron 啟用仍要依
   實際 diff／影響重新回報。
7. DB mode 進 canary、設定 exact generation，再啟用 v2 Function／cron；legacy cron 保持不變。
8. rollback 固定先停 v2 cron／Function mode，等 v2 worker 收斂，再改 DB mode；不得先停 legacy。

外部停點 A 與 B 必須拆開，才可分別證明「legacy 不再碰 format 2」及「v2 disabled 不碰任何資料」。不能用一次大 deploy 省略
中間證據。

## 下一批 source 契約

`FA-03B13.6c` 只建立獨立 v2 Function source：

- local 只接受 exact `local-test-v1`，Hosted 只接受 exact `hosted-v1`。
- 缺 mode、空 cron secret、config 不完整、generation／batch 非 canonical 都先 fail closed。
- sender 只讀 namespaced v2 policy／transport，再明確映射到現有 adapter。
- 使用既有 D1 database port、D3A sender 與固定錯誤碼，不複製 DB／egress／outcome 邏輯。
- 不新增 cron migration、不填 batch、lease、deadline、attempt 或 TTL 數字。

## 本輪邊界與依據

本輪只有 repo source、已下載 Hosted source、Function／Secret 名稱與 cron／DB aggregate 唯讀檢查；沒有 source change、deploy、
Secret mutation、Function request、DB write、migration 或 production request。

官方依據：

- [Supabase Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)
- [Supabase Cron](https://supabase.com/docs/guides/cron)
- [Supabase Edge Function environment variables](https://supabase.com/docs/guides/functions/secrets)
