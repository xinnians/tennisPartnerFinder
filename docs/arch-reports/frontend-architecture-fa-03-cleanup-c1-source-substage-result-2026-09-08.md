# FA-03 push-cleanup Hosted C1 source substage 重驗結果

日期：2026-09-08

狀態：**完成；授權 request 精確停在 `SOURCE_REAL_MISSING`，Hosted 已完整復原。**

## 白話結論

這次已把原本模糊的 `SOURCE` 縮到單一原因：

- `cf-connecting-ip` 有進入 Function，而且是 canonical IP。
- `x-real-ip` 沒有進入 Function，所以回 `SOURCE_REAL_MISSING`。
- Supabase 外層 log 仍同時顯示兩個來源欄位存在且相同；那是平台 log enrichment，不代表兩個欄位都傳入 Function。
- limiter RPC 完全沒有執行，資料庫 limiter 維持 0。

本輪只送 1 筆未授權與 1 筆已授權空 body request，沒有 retry、沒有 DB write。臨時 Function 與 2 個 Secret 已移除，
runtime、Push、outbox、cron 與兩支既有 Function 的程式內容都維持原狀。

## 執行前基線

- Hosted Function exact 2：legacy dispatcher 與獨立 v2 canary；兩者 ACTIVE、`verify_jwt=false`，bundle hash 符合紀錄。
- `push-cleanup` 不存在；`PUSH_CLEANUP_*` Secret 為 0。
- migration 39 local／39 remote。
- runtime disabled singleton exact 1；所有 production policy／cutoff 仍為 null。
- worker／canary profile／delivery／consent／endpoint registry／limiter 全 0。
- Push 4／4 legacy／0 v2；outbox 7／0 pending、7 v1／0 v2。
- cron 4／4 active；legacy dispatcher exact 1 個每分鐘 job。

## 執行範圍

使用者於 2026-09-08 核可前置文件列出的 exact 範圍：

1. 產生一個不保存的 random canonical 32-byte token。
2. 只部署 `push-cleanup`，`verify_jwt=false`；mode 未設定時仍 hard-gated。
3. 暫時設定 `PUSH_CLEANUP_LIMITER_CANARY_TOKEN` 與
   `PUSH_CLEANUP_RUNTIME_MODE=hosted-limiter-canary-v1`。
4. 最多 2 個空 body POST：1 個未授權、1 個已授權；各自最多 10 秒，沒有 retry。
5. 固定順序 unset mode、刪除 Function、unset token，再做完整唯讀驗證。

本輪沒有設定 HMAC／policy／private key／allowed origin，沒有呼叫 quarantine command，也沒有改 runtime control。

## 實際結果

### 本機前置停點

第一個受控程序在 deploy 前發現 `.env.local` 是本機 Supabase URL，不是 linked Hosted URL，因此立即停止。三個 rollback
return code 皆為 0；當時沒有 deploy、Secret、request 或 DB 變更。

正式程序改由已驗證格式的 linked project ref 組成 Supabase 官方 project Function URL；沒有把本機 URL 冒充 Hosted。

### Function 與 request

- 臨時 `push-cleanup`：ACTIVE、version 1、`verify_jwt=false`、bundle hash
  `a278a9a985814dd372cdbf13452406cb915989addd7ca938d691493b53a63aca`。
- 整個受控程序：`2026-09-08T02:01:57.153Z`～`2026-09-08T02:02:17.759Z`；mode 實際啟用窗必然更短。

| 類型   | 已送 | HTTP／body                       | outcome header | stage header          | client 時間 | 結果         |
| ------ | ---: | -------------------------------- | -------------- | --------------------- | ----------: | ------------ |
| 未授權 |    1 | 503／exact `{"outcome":"RETRY"}` | absent         | absent                |    1,038 ms | 符合         |
| 已授權 |    1 | 503／exact `{"outcome":"RETRY"}` | absent         | `SOURCE_REAL_MISSING` |      179 ms | 精確診斷完成 |

未授權 request 後立即用 Management API 唯讀 SQL 確認 limiter 仍為 0，才送第 2 筆 request。

### Platform log 聚合

固定查詢窗：`2026-09-08T02:01:00Z`～`2026-09-08T02:03:00Z`。

`function_edge_logs` 只篩 exact pathname `/functions/v1/push-cleanup`：

- matched／POST／503：2／2／2。
- `cf-connecting-ip` present：2；`x-real-ip` present：2；兩者 outer-log value 相同：2。
- distinct source 1、Function 1、execution 2。
- first／last：`02:02:14.843Z`／`02:02:17.715Z`。
- execution time min／max：123／949 ms。

同一時間窗的 `edge_logs` 只篩 exact path `/rest/v1/rpc/consume_push_cleanup_rate_limit`，結果 0。

查詢只回 count／timestamp／duration aggregate，沒有回傳或記錄 raw IP、token、endpoint、key、profile ID 或 payload。

## 復原後權威狀態

rollback return code：mode unset 0、Function delete 0、token unset 0。後續獨立重查：

- `push-cleanup` 不存在，`PUSH_CLEANUP_*` Secret 為 0；Secret 總數回到 17。
- legacy dispatcher：ACTIVE、version 21、bundle hash
  `649824d7e0985e832c72da15ac97493d44b89ec77cea52f86074c168c9aaa8bd`。
- v2 canary：ACTIVE、version 5、bundle hash
  `07ba284436d66bddf2aa54fa59b7f6d6990d2ab7f6575e6f28d9fa3da54c2cc5`。
- 兩支既有 Function 的 version metadata 各由 17／1 增至 21／5；bundle hash 完全沒變，符合已知 Secret mutation 副作用。
- runtime、所有 null policy、worker／delivery／consent／registry／limiter、Push／outbox 與 cron 全部回到執行前 exact 值。

## 已證明與仍未證明

已證明：

- Hosted Function Request 中的 `cf-connecting-ip` 存在且 canonical；`x-real-ip` 缺少。
- 平台外層 log 中的 `x-real-ip` 不能當成 Function Request 內存在的證據。
- 此失敗發生在 policy、HMAC、bucket hash、service config 與 limiter RPC 之前。
- request 上限、停損與完整 rollback 有效。

仍未證明：

- client 自行帶入的 `cf-connecting-ip` 是否一定會被平台覆寫。
- 單獨信任 `cf-connecting-ip` 是否可作 production source-rate-limit 邊界。
- Hosted limiter RPC、production policy、timeout 或正式 cleanup 可啟用。

下一個安全步驟是只做一個 spoof-resistance diagnostic：client 刻意送 non-IP `cf-connecting-ip`，Function 仍用現有程式回固定
stage。若平台覆寫，結果應仍是 `SOURCE_REAL_MISSING`；若 client value 穿透，結果會是 `SOURCE_CF_INVALID`。在取得這個證據前，
不放寬 source validation。
