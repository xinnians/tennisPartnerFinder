# FA-03 push-cleanup Hosted C1 執行結果

最後更新：2026-09-04

狀態：**C1 未通過；在第 1 次授權 request 缺少 limiter outcome marker 時停止。其餘 19 次未送、沒有重試；
Hosted mode、臨時 Function、4 個 secret 與 limiter row 均已清除。**

## 白話結論

- 使用者核可的完整 C1 範圍已開始執行，但沒有硬把失敗結果算成通過。
- 未授權 request 符合預期：`503`、exact `{"outcome":"RETRY"}`、沒有 outcome header，而且 limiter 仍是 0 rows。
- 第 1 次授權 request 仍為 `503`＋exact RETRY，但沒有預期的 `ALLOW` header。依事前規則立刻停止，
  所以授權 request 只送 1 次，剩餘 19 次取消，沒有重試。
- 平台在同一時間窗找到 2 筆 `push-cleanup` request，但找不到
  `/rest/v1/rpc/consume_push_cleanup_rate_limit` 的 gateway log；資料庫也始終是 0 limiter rows。
- 現有固定回應刻意不區分 token、設定、crypto 或 RPC 前置錯誤，因此這些證據不足以判定唯一根因。本文件不猜。
- 自動復原完成：先移除 mode，再刪 Function，guarded cleanup 確認 limiter 0 rows，最後移除其餘 3 個 secret。
- Supabase Function 清單最終只剩既有 dispatcher。它的 artifact hash 沒變，但 version 從 6 變成 10；時間順序與
  4 次 secret mutation 相符，因此後續不能再把「version 必須維持 6」當作可成立的 rollback 條件。

## 核可範圍

使用者於 2026-09-04 選擇 A，核可：

1. 新增 4 個臨時 Hosted secrets。
2. 只部署 `push-cleanup`。
3. 最多 21 次空 body POST：1 次未授權、最多 20 次授權，不重試。
4. 唯讀查 platform logs／Push DB；limiter 預期只產生 global＋source 共 2 rows。
5. 成功或失敗都先關 mode、刪 Function、條件式清 limiter rows、移除 4 個 secrets。

本次核可不包含 production threshold、正式 cleanup、private key、browser wiring、privacy 文案或 hard gate 移除。

## 執行前基線

所有 fail-closed 條件均符合：

| 項目                        |                                          結果 |
| --------------------------- | --------------------------------------------: |
| Hosted Function             | 只有 `notification-outbox-dispatch` version 6 |
| 4 個 C1 secret names        |                                             0 |
| limiter                     |                                        0 rows |
| consent／registry／delivery |                                  0／0／0 rows |
| legacy／v2 Push             |                                     4／0 rows |
| outbox／pending             |                                     7／0 rows |
| runtime control             |                    disabled singleton exact 1 |

DB 基線查詢在 `REPEATABLE READ READ ONLY` transaction 中執行，只回傳 aggregate。

## 執行紀錄

### 1. CLI stdin 相容性停點

第一次只完成單一 Function deploy；接著 CLI 拒絕把 `/dev/stdin` 當作 `--env-file`，回
`LegacySecretsNoArgumentsError`。當時：

- 0 個 C1 secret 寫入。
- mode 未設定。
- 0 個 request。
- limiter 仍 0 rows。
- trap 仍刪除臨時 Function並重查基線。

第二次先完整重查 Function、secret names 與 DB 基線，全部回到事前值後才重新部署。secret value 改由同一個
非互動 shell process 的變數展開傳入 CLI；值沒有寫入檔案、repo、文件或 command output。

### 2. 實際 C1 啟用

- 只部署 `push-cleanup`，deployment bundle 9.6 kB，沒有再出現 C0 的 absolute public-key path warning。
- 先在同一個 secrets set 呼叫設定 token、HMAC key、固定 policy，再獨立設定 runtime mode。
- mode 設定完成前沒有送 request。
- 啟用起點：`2026-09-04T11:05:04.053Z`。
- 包含設定、request、DB check 與完整 rollback 的整個 shell command 為 20.055 秒；啟用窗必然小於這個值，
  因此沒有接近 300 秒上限。

### 3. Request 停損結果

| 類型     |  已送 | HTTP／body       | outcome header     |            client 時間 | 結果       |
| -------- | ----: | ---------------- | ------------------ | ---------------------: | ---------- |
| 未授權   |     1 | 503／exact RETRY | absent             |            1.041660 秒 | 符合       |
| 授權     |     1 | 503／exact RETRY | absent；預期 ALLOW | 未保存單筆失敗 latency | **不符合** |
| 剩餘授權 | 0／19 | 未送             | 未送               |                   未送 | 依規則取消 |

總 request 是 2，不是 21；沒有任何 retry。因樣本不足，沒有計算或宣稱 p50／p95／p99。

未授權 request 後的獨立 DB check 為 limiter 0 rows。授權 request 失敗後的 guarded cleanup 也先看到 limiter 0，
所以沒有刪除未知 row。

## Platform log 唯讀證據

固定查詢窗：`2026-09-04T11:04:00Z`～`2026-09-04T11:07:00Z`。

### `function_edge_logs`

只篩 exact pathname `/functions/v1/push-cleanup`：

| 聚合欄位                             |                             結果 |
| ------------------------------------ | -------------------------------: |
| matched／POST／503                   |                          2／2／2 |
| `cf-connecting-ip` present           |                                2 |
| `x-real-ip` present                  |                                2 |
| 兩個 source header exact equal       |                                2 |
| distinct source count                |                                1 |
| 自訂 canary header log field present |                                0 |
| first／last timestamp                | `11:05:07.827Z`／`11:05:10.663Z` |
| distinct deployment／execution       |                             1／2 |
| Function log version                 |                                3 |
| `sb_error_code`                      |   2 筆皆為 `EDGE_FUNCTION_ERROR` |
| execution time min／max              |                      106／963 ms |

`503` 本身會落在 error 類別；本文件不把 `EDGE_FUNCTION_ERROR` 外推為未捕捉 exception。

### 內部 RPC 可觀察性

同一時間窗以 exact path `/rest/v1/rpc/consume_push_cleanup_rate_limit` 查 `edge_logs`，結果 0 rows。
資料庫 limiter 也為 0。這證明本輪沒有留下可觀察的 RPC gateway／DB 效果，但不能單靠 log 空集合證明
`fetch` 絕對沒有被呼叫。

### `function_logs`

以本次 Function ID 聚合，只看到：

- Boot：2 rows。
- Shutdown／EarlyDrop：2 rows。
- application log／其他 runtime event：0 rows。

Source code 禁止 `console.*`，本次查詢沒有讀取 `event_message`、raw IP、token、HMAC digest、API key 或 request body。

## 復原後權威狀態

| 項目                        |                                                    結果 |
| --------------------------- | ------------------------------------------------------: |
| `push-cleanup`              |                                                  不存在 |
| C1 四個 secret names        |                                                       0 |
| limiter                     |                                                  0 rows |
| consent／registry／delivery |                                            0／0／0 rows |
| legacy／v2 Push             |                                               4／0 rows |
| outbox／pending             |                                               7／0 rows |
| runtime control             |                              disabled singleton exact 1 |
| Hosted Function             | 只剩 dispatcher；ACTIVE、`verify_jwt=false`、version 10 |

dispatcher 的 `ezbr_sha256` 在前後都是
`649824d7e0985e832c72da15ac97493d44b89ec77cea52f86074c168c9aaa8bd`。沒有部署或修改 dispatcher source；
只有 Hosted version metadata 由 6 單調增加到 10。

## 已證明與尚未證明

已證明：

- 未授權 request 停在 limiter 前。
- 失敗停損、request 上限與 rollback trap 有效。
- 自訂 canary header 沒有被平台 log 保存；兩個 raw source-IP header 仍會保存且一致。
- 本次授權 request 沒有形成 limiter row，也沒有留下可觀察的 REST RPC gateway row。
- Hosted secret mutation 會改變既有 Function 的 version metadata；以固定 version 6 驗 rollback 不合理。

尚未證明：

- 第 1 次授權 request 缺 marker 的唯一原因。
- Hosted limiter RPC 已成功。
- Hosted limiter latency／failure distribution。
- production policy、timeout、正式 cleanup 或 browser wiring 可啟用。

## 下一個安全步驟

repo／local 的 allowlisted stage diagnostic 已完成並通過完整 CI。它只在「exact Hosted canary mode＋exact token」
後回固定 stage code，不回 error text、secret、IP、digest、policy、URL、status body 或 DB detail；一般 request
仍完全相同。新的 Hosted deploy／secret／request 精確範圍與已知 version metadata 副作用見
`frontend-architecture-fa-03-cleanup-c1-diagnostic-preflight-2026-09-04.md`，仍待使用者另行核可。

在新的核可前，不再部署、不設 secret、不送 Hosted request。

## 官方來源

- [Supabase Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)
- [Supabase logs query syntax](https://supabase.com/docs/guides/observability/advanced-log-filtering)
- [Supabase logs field reference](https://supabase.com/docs/guides/observability/log-field-reference)
- [Supabase project logs API](https://supabase.com/docs/reference/api/v1-get-project-logs)
