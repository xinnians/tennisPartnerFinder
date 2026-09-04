# FA-03 push-cleanup Hosted C0 驗證紀錄

最後更新：2026-09-04

狀態：**C0 已完成；臨時 `push-cleanup` Function 已刪除。沒有設定 env／secret、沒有執行 limiter、沒有讀取
request body，也沒有改動 Push／limiter 資料。**

## 白話結論

- 使用者確認 Supabase 方案是 Free，並接受平台 raw-IP log 保留 1 天。
- 依核可範圍，只暫時部署 hard-gated `push-cleanup`，送出剛好 2 次空 body POST。
- 兩次都回 exact `503`＋`{"outcome":"RETRY"}`，代表 Hosted hard gate 按設計生效。
- Supabase `function_edge_logs` 正好找到這 2 筆：都是 POST／503，`cf-connecting-ip` 與 `x-real-ip` 兩個
  header 每筆都有，而且每筆都相同。兩筆來自同一個來源值。
- log 查詢只回傳計數、狀態與時間，沒有查出或寫入 raw IP 原值。
- 驗證後已立即刪除 `push-cleanup`。Hosted Function 清單目前只剩既有的
  `notification-outbox-dispatch` version 6。

這證明目前 Supabase gateway 會為這個 endpoint 同時提供兩個一致的來源 header，也證明平台會保存 raw IP。
C0 **沒有**經過 limiter，所以不能用來決定 production rate-limit 容量、補充速度或 timeout。

## 已核可邊界

使用者於 2026-09-04 確認：

1. Supabase 方案為 Free；官方價格頁列出的 log retention 是 1 天。
2. 接受 Supabase 平台在這 1 天內保存 raw `cf-connecting-ip`／`x-real-ip`。
3. 核可 C0：只部署 hard-gated `push-cleanup`、送 2 次空 body POST、唯讀查 logs／DB，驗證後立即刪除。

本次沒有核可 C1、任何 production policy、env／secret、hard gate 移除或正式 runtime 啟用。

## 執行前確認

| 項目                   | 查證結果                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| Git                    | worktree clean；分支為 `codex/frontend-architecture-execution`                                |
| Hosted Functions       | 只有 `notification-outbox-dispatch` version 6                                                 |
| Function config        | `[functions.push-cleanup] verify_jwt = false`                                                 |
| hard gate              | Hosted runtime 或 local-test 未啟用時，在 limiter／body／key／crypto／DB 前直接回 `503 RETRY` |
| Hosted runtime control | singleton 仍是 disabled                                                                       |
| limiter／Push 基線     | limiter 0；consent 0；registry 0；delivery 0；legacy Push 4；v2 Push 0；outbox 7／pending 0   |

## 實際執行與結果

### 1. 單獨部署

只執行：

```bash
npx supabase functions deploy push-cleanup
```

CLI 顯示部署成功，bundle 為 9.1 kB。部署時另有：

```text
WARN: Skipping import path outside source root: /push-cleanup-key-v1.json
```

這個絕對路徑是 shared protocol 中的公開 key URL 常數。不能只憑 warning 推定 bundler 行為正常，所以本紀錄
保留 warning；但兩次 Hosted response 都精確命中 handler 的 hard-gate body，足以證明本次 C0 使用到的 handler
路徑可以執行。正式啟用前仍應消除或由官方工具解釋這個 warning。

### 2. 剛好兩次空 body POST

兩次 request 都未帶 Authorization／API key，只有 JSON content type，body 為空。沒有送 token、Push endpoint、
cleanup envelope、digest、key 或其他 private material。

| 次數 | response body         | HTTP | client 觀察時間 |
| ---- | --------------------- | ---: | --------------: |
| 1    | `{"outcome":"RETRY"}` |  503 |     1.132511 秒 |
| 2    | `{"outcome":"RETRY"}` |  503 |     0.798056 秒 |

這兩個 client 時間只描述這次開發者測試，不是 production latency 樣本，也不拿來設定 timeout。

### 3. DB 唯讀確認

兩次 request 後於 `2026-09-04T10:23:21.161583+00:00` 查得：

| 資料                       | rows／狀態 |
| -------------------------- | ---------: |
| Push consent               |          0 |
| deny/quarantine registry   |          0 |
| delivery                   |          0 |
| rate-limit buckets         |          0 |
| legacy Push subscriptions  |          4 |
| v2 Push subscriptions      |          0 |
| outbox                     |          7 |
| pending outbox             |          0 |
| runtime disabled singleton |          1 |

因此這兩次 request 沒有走 limiter 或 Push DB mutation。

### 4. Supabase platform log 聚合確認

使用官方 Management API 的 project logs endpoint，查詢
`2026-09-04T10:15:00Z`～`2026-09-04T10:28:00Z` 內的 `function_edge_logs`，只篩選 exact pathname
`/functions/v1/push-cleanup`。最終聚合結果：

| 聚合欄位                          |                          結果 |
| --------------------------------- | ----------------------------: |
| matched rows                      |                             2 |
| POST rows                         |                             2 |
| HTTP 503 rows                     |                             2 |
| `cf-connecting-ip` present        |                             2 |
| `x-real-ip` present               |                             2 |
| 兩個 header exact equal           |                             2 |
| distinct `cf-connecting-ip` count |                             1 |
| first log timestamp               | `2026-09-04T10:23:08.906000Z` |
| last log timestamp                | `2026-09-04T10:23:09.716000Z` |
| `response.origin_time` present    |                             0 |

第一次依文件範例查 `request.path` 得到 0；進一步只用計數確認，這個 log source 實際欄位是
`request.pathname`，並以該欄位完成上表查證。因 `response.origin_time` 沒有值，本次不能從平台 log 宣稱
gateway／function duration。

Management API token 只從 macOS 鑰匙圈讀入單一 shell process，沒有寫入 repo、檔案或 command output。SQL 只做
aggregate，沒有 select 任何 IP 原值。

### 5. 立即刪除並確認

執行：

```bash
npx supabase functions delete push-cleanup --yes
npx supabase functions list --output json
```

刪除成功；清單只剩：

```text
notification-outbox-dispatch  ACTIVE  version 6  verify_jwt=false
```

本機 source code 保留；刪除的是 Hosted 上的臨時部署。

## C0 能證明與不能證明的事

已證明：

- Hosted hard gate 會固定回 `503 RETRY`。
- 這次 gateway 的兩筆 request 都同時帶一致的 `cf-connecting-ip` 與 `x-real-ip`。
- Supabase platform log 會保存兩個 raw-IP header；應用層 HMAC 無法消除這份平台紀錄。
- hard gate 停在 limiter 與 DB 前，實際 DB 計數保持不變。

尚未證明：

- limiter RPC 的 Hosted latency、失敗分布與併發表現。
- production capacity、refill、idle TTL 或 network timeout 應設多少。
- C1 canary mode、正式 cleanup runtime、browser wiring 或 privacy 文案已可上線。
- 9.1 kB deploy warning 對非 C0 路徑沒有影響。

## 下一步

C1 若要進行，必須先形成 exact diff，至少包含：

- 只允許 canary 的 Hosted mode 與停用方式。
- 臨時 limiter policy、request 數量、驗證 SQL 與清理方式。
- 需要新增的 env／secret 清單；不得沿用未查證預設。
- 不讀 body、不解密、不 quarantine 的可驗證程式邊界。
- 完成後回復 hard-disabled 並刪除臨時設定的方式。

C1、production threshold、timeout、privacy 文案與 hard gate 移除都仍要分開確認。

## 官方來源

- [Supabase Logging／allowed headers](https://supabase.com/docs/guides/monitoring-and-debugging/logs)
- [Supabase Advanced Log Filtering](https://supabase.com/docs/guides/observability/advanced-log-filtering)
- [Supabase Project Logs API](https://supabase.com/docs/reference/api/v1-get-project-logs)
- [Supabase Function deployment](https://supabase.com/docs/guides/functions/deploy)
- [Supabase Function configuration](https://supabase.com/docs/guides/functions/function-configuration)
- [Supabase pricing／log retention](https://supabase.com/pricing)
