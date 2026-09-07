# FA-03 dispatcher D3 Hosted canary 前置確認

日期：2026-09-07
狀態：前置盤點保留；D1 migration 已於 2026-09-07 套用並驗證，結果見
`frontend-architecture-fa-03-dispatcher-d1-hosted-apply-2026-09-07.md`

## 白話結論

目前不是 production code 意外對不上，而是 repo 已經安全地往前完成 D2／D3A，Hosted 還刻意停在原本的 legacy
dispatcher。下一步不應一次部署、設 secret、改 runtime 再送通知；先只把已完成驗證的 D1 additive migration 套到
Hosted，確認資料與既有 dispatcher 都不變，再停下來做第二階段規劃。

這支 migration 只建立 dispatcher command schema、7 個固定 DB commands、專用 passwordless role、索引與三個既有
setter 的 send-precheck guard。它不改 runtime control 值、不建立 v2 delivery、不改 legacy row、不改 cron、不部署
Function，也不會自動送 request。

## 目前已查實的 Hosted 基線

| 項目 | 唯讀結果 |
| --- | --- |
| migration | 39 local／38 remote；只缺 `202609070001` |
| dry-run | 只會套 `202609070001_notification_dispatcher_commands.sql`；沒有 seed／roles file |
| Function | 只有 `notification-outbox-dispatch`，ACTIVE、version 14、`verify_jwt=false` |
| runtime | generation 1、enabled、mode disabled、legacy writes true、legacy handled false；policy 全 null |
| 新工作資料 | worker／canary／delivery／v2 outbox／v2 transport 全 0 |
| 既有資料 | legacy Push 4、outbox 7、pending outbox 0 |
| provider origin | 4 筆都是 exact `https://fcm.googleapis.com`；invalid scheme／host 0 |
| D3 secret names | DB URL／generation／mode／provider policy／transport／canary secret 全部不存在 |
| 現有 secret names | cron 與三個 VAPID 名稱存在；沒有讀取 value |
| cron | 現有 legacy dispatcher 每分鐘執行；當下 running 0、pg_net queue 0 |

running 0 與 queue 0 只代表查詢當下，不代表外部 request 絕對為零，因此本階段也不做切換。

## 建議拆成四個獨立核可

### A. 先只套 D1 migration（本次要確認的範圍）

允許的動作：

1. 執行 linked DB push，套用唯一 pending migration。
2. 立即確認 remote history 變成 39／39，且只多 `202609070001`。
3. 唯讀驗證 `notification_dispatcher_api`、7 commands、專用 role、empty search path、零 raw-table privilege 與
   password null。
4. 重查 runtime、4 筆 legacy Push、7 筆 outbox、0 pending 與所有 v2／worker／canary 表計數不變。
5. 重查 Function list／version 與 secret names；linked DB lint／schema evidence 若不符就停止。

不允許的動作：設定 role password、secret、deploy、發 request、改 runtime control、generation、canary profile、cron、
legacy cutoff 或任何使用者 Push row。

### B. 再建立 Hosted canary 執行環境（A 成功後另行核可）

預計需要：

- 替 `notification_dispatcher` 產生新的隨機密碼，並使用平台實際提供、經連線驗證的 direct connection string；
  不自行拼接 hostname 或假設 TLS 參數，也不把 transaction pooler 當成已驗證選項。
- 新增專用 DB URL、expected generation、manual-canary mode、canary secret、transport 與 provider policy secret。
- provider policy 第一版可依目前 4 筆實查結果只放 `https://fcm.googleapis.com`，但套用前仍要再次查 aggregate。
- 沿用目前已存在的 VAPID secret，不讀出或寫入文件。
- 只部署獨立 `notification-outbox-dispatch-v2-canary`，不部署 active dispatcher、不改現行 cron。

這些 secret 更新、role password 與 deploy 都不包含在 A。

### C. 建立真正可回收的 browser canary（B 後另行核可）

目前 Hosted 的 4 筆 legacy subscription 不是可直接拿來測的 v2 canary，因為它們沒有 v2 consent／registry／transport
鏈，也沒有確認 owner 願意收到測試通知。建議建立一個隔離的臨時 Auth/profile，以實際瀏覽器和目前 public VAPID key
取得一筆可回收 subscription，只送一則無敏感資料的測試通知；完成後 unsubscribe 並刪除該 fixture。

在 browser acquisition、fixture owner、通知文案與清理方式實際確認前，不使用既有 4 筆 subscription，也不猜哪一筆
屬於可測帳號。

### D. runtime policy 與真正切換（另外核可）

D3A local 使用的 20s worker、8s request、15s delivery、3 attempts、TTL budget 0 都是測試向量，不是 production
建議值。正式值要依 Hosted cold start、DB/TLS/provider latency 與至少一次隔離 canary 證據決定。

active dispatcher deploy、generation rotation、canary profile、正式 retry/backoff、legacy cutoff 與 cron 切換都留在 D。
開發期 bundle gate 的 bytes 決策與這些 Edge／DB policy 無關。

## A 階段失敗時怎麼處理

- migration 若未開始：不做任何後續動作。
- migration 若 CLI 回報失敗：先只讀查 migration history 與 catalog，確認實際停點；不靠猜測重跑。
- 因 PostgreSQL migration 是 transaction 內執行，失敗通常會 rollback；仍以 remote history、schema、role 與 row count
  實查為準，不能只看 CLI 文字。
- 若 migration 已成功但驗證不符：不設定 role password、不部署、不送 request；保留現行 dispatcher／cron，整理實際
  catalog diff 再請使用者決定。沒有先寫 destructive down migration。

## 後續 canary 的回復界線

若未來 B／C 經核可，回復順序應固定為：

1. 先關閉 manual-canary mode，確認 endpoint 回 `503`。
2. 刪除獨立 canary Function 與 D3 專用 secrets。
3. 把 `notification_dispatcher` password 恢復 null。
4. 只清除可精確識別的臨時 canary profile／subscription／consent／registry／delivery／outbox，不碰既有 4 筆 legacy
   subscription 或 7 筆 outbox。
5. 重查 runtime、cron、Function list、secret names 與資料計數。

先前 Hosted cleanup diagnostic 曾讓 dispatcher version metadata 增加但 source hash不變，因此未來回復判斷要比對下載
source hash與實際 Function list，不能只用版本號推斷程式內容。

## 本文件沒有授權的事

沒有 Hosted DB write、role credential、secret/env、Function deploy、request、canary profile、runtime control、generation、
cron 或 legacy cutoff 變更。本文件完成當時只等待 A 階段同意；A 現已完成。B～D 仍未被 migration 的持續授權涵蓋。
