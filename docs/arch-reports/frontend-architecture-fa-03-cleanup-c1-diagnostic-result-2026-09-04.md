# FA-03 push-cleanup Hosted C1 診斷重驗結果

最後更新：2026-09-04

狀態：**診斷重驗已完成；第 1 次授權 request 回 `SOURCE` 後停損。剩餘 19 次未送、沒有重試；Hosted 已完整復原。**

## 白話結論

- 未授權 request 正常：503、exact `{"outcome":"RETRY"}`，沒有 outcome／stage header，limiter 仍是 0 rows。
- 第 1 次授權 request 也是固定 503／RETRY，回傳 allowlisted stage `SOURCE`，沒有 outcome header。
- `SOURCE` 只證明 Function 內部沒有取得「兩個都有效且完全相同」的可信來源 header。它不能再區分是缺少、格式無效或兩值不同。
- 平台外層 log 同時顯示兩個來源 header 都存在而且相同。這與 Function 內部看到的結果不是同一個觀察層，不能互相取代。
- limiter RPC gateway log 是 0，資料庫 limiter 也是 0；因此剩餘 19 次依規則取消，沒有 latency distribution。
- mode、Function、4 個 secrets 都已移除；Push/runtime 資料完全維持基線。
- dispatcher artifact hash 沒變，Hosted version metadata 由 10 增至 14，符合事前已接受的副作用。

本文件不把 `SOURCE` 猜成特定 header 缺少，也不直接改成只信任其中一個 header。

## 核可範圍

使用者於 2026-09-04 明確同意：

1. 暫時只部署 `push-cleanup`。
2. 設定後移除 4 個 C1 secrets。
3. 最多送 1 次未授權＋20 次授權空 body POST，不重試；第 1 次授權不符就停止。
4. 唯讀查 logs／Push DB，必要時只條件式刪除 exact canary limiter rows。
5. 接受既有 dispatcher version metadata 增加；以 artifact hash 驗 source 沒變。

不包含 production policy、正式 cleanup、private key、browser wiring、privacy 文案或 hard gate 移除。

## 執行前基線

| 項目                        |                                                        結果 |
| --------------------------- | ----------------------------------------------------------: |
| Hosted Functions            | 只有既有 dispatcher；ACTIVE、`verify_jwt=false`、version 10 |
| dispatcher artifact hash    |                                            與上次復原值相同 |
| 4 個 C1 secret names        |                                                           0 |
| limiter                     |                                                      0 rows |
| consent／registry／delivery |                                                0／0／0 rows |
| legacy／v2 Push             |                                                   4／0 rows |
| outbox／pending             |                                                   7／0 rows |
| runtime control             |                                  disabled singleton exact 1 |

資料庫基線由 Management API read-only query 取得，只回傳 aggregate。

## Request 結果

只部署 `push-cleanup`，部署 bundle 9.7 kB；部署後再次確認 Function ACTIVE、`verify_jwt=false`，且 mode 尚未設定。
兩份 32-byte canonical random material 在單一程序記憶體產生並驗證格式與互不相同；材料 secrets 先設定，mode 最後設定。

| 類型     |  已送 | HTTP／body       | outcome | stage    | client 時間 | 結果       |
| -------- | ----: | ---------------- | ------- | -------- | ----------: | ---------- |
| 未授權   |     1 | 503／exact RETRY | absent  | absent   | 0.997412 秒 | 符合       |
| 授權     |     1 | 503／exact RETRY | absent  | `SOURCE` | 0.811419 秒 | 診斷停損   |
| 剩餘授權 | 0／19 | 未送             | 未送    | 未送     |        未送 | 依規則取消 |

總 request 為 2，沒有 retry。未授權後的獨立 DB query 是 limiter 0 rows。

## Platform log 唯讀證據

固定查詢窗：`2026-09-04T11:33:00Z`～`2026-09-04T11:37:00Z`。

### `function_edge_logs`

只篩 exact pathname `/functions/v1/push-cleanup`：

| 聚合欄位                          |                             結果 |
| --------------------------------- | -------------------------------: |
| matched／POST／503                |                          2／2／2 |
| `cf-connecting-ip` present        |                                2 |
| `x-real-ip` present               |                                2 |
| 兩個 source header exact equal    |                                2 |
| distinct source count             |                                1 |
| 自訂 canary request header logged |                                0 |
| 自訂 stage response header logged |                                0 |
| first／last timestamp             | `11:34:45.575Z`／`11:34:46.598Z` |
| distinct Function／execution      |                             1／2 |
| execution time min／max           |                      732／937 ms |

平台 allowlist 沒保存自訂 request／response header；`SOURCE` 的權威證據是受控 client 當下的 exact response header。

### limiter 與 Function runtime

- exact path `/rest/v1/rpc/consume_push_cleanup_rate_limit` 的 `edge_logs`：0 rows。
- `function_logs` 以本次 Function ID 關聯：2 Boot、2 Shutdown、0 application Log，共 2 executions。
- 復原後 read-only DB：limiter 0 rows。

這些結果與 `SOURCE` 發生在 RPC 前一致，但沒有提供 Function 內部各來源 header 的獨立 presence／validity，不能再細分。

## 復原結果

固定順序執行：

1. unset runtime mode：成功。
2. 刪除 `push-cleanup`：成功。
3. guarded DB cleanup 指令：runner 的 SQL 組字錯誤，curl return code 22；沒有執行刪除。
4. unset token／HMAC／policy：成功。
5. 立即使用獨立 read-only query 重查所有基線：成功且 limiter 本來就是 0 rows，所以不需要補做刪除。

guarded SQL 問題已在本機重現：Bash 字串把 PostgreSQL dollar quote 組成 literal `\$\$`，不是 `$$`。這是 runner 組字錯誤，
不是資料庫 schema 或 limiter 錯誤。因遠端沒有 row，沒有再送 Hosted write query。

最終權威狀態：

| 項目                        |                                                    結果 |
| --------------------------- | ------------------------------------------------------: |
| `push-cleanup`              |                                                  不存在 |
| C1 四個 secret names        |                                                       0 |
| limiter                     |                                                  0 rows |
| consent／registry／delivery |                                            0／0／0 rows |
| legacy／v2 Push             |                                               4／0 rows |
| outbox／pending             |                                               7／0 rows |
| runtime control             |                              disabled singleton exact 1 |
| Hosted Function             | 只剩 dispatcher；ACTIVE、`verify_jwt=false`、version 14 |
| dispatcher artifact hash    |                                        與執行前完全相同 |

## 已證明與尚未證明

已證明：

- exact canary token 已通過，失敗位於 source-address validation。
- Function 內部沒有取得兩個都有效且相同的既有可信來源 header。
- 外層 platform log 的兩個來源 header 都存在且相同，但不能代表相同欄位一定傳進 Function Request。
- limiter RPC 未留下 gateway／DB 效果。
- stage 停損、request 上限與 Hosted 復原有效。

尚未證明：

- Function 內部究竟是 `cf-connecting-ip` 缺少／無效、`x-real-ip` 缺少／無效，或兩者不同。
- Hosted limiter RPC 可成功。
- Hosted limiter latency／failure distribution。
- 任一單一來源 header 可直接成為 production 信任邊界。
- production policy、timeout、正式 cleanup 或 browser wiring 可啟用。

## 下一個安全步驟

先在 repo／local 把 `SOURCE` 再細分成固定且不含值的 allowlisted stage，例如各 header 缺少／無效與兩值不同；
完整測試確保仍不回 raw IP。完成後若仍需 Hosted 重驗，重新提出 deploy／secrets／最多 2 次 request 的精確範圍。

新的核可前，不部署、不設定 secrets、不送 Hosted request。

## 官方來源

- [Supabase query and filter logs](https://supabase.com/docs/guides/observability/advanced-log-filtering)
- [Supabase logs field reference](https://supabase.com/docs/guides/observability/log-field-reference)
- [Supabase Management API read-only query](https://supabase.com/docs/reference/api/v1-read-only-query)
