# FA-03 push-cleanup independent public source probe result

日期：2026-09-08

狀態：**已完成並完整復原；不同服務商的 canonical client value 也被 Cloudflare 擋在 Function 前。**

## 白話結論

client 把 Google 官方公開 DNS IP 同時放進 `cf-connecting-ip` 與 probe header，Request 物件已確認兩者都存在。
Cloudflare 回 403；response 有 Cloudflare server marker 與 `cf-ray`，但沒有 Function 自訂 header。Supabase 的
Function exact-path log 仍是 0，所以 request 沒有進入 Function。

加上前兩次 probe，目前已有三種 client 嘗試都停在 Function 前：無效字串、第一個 canonical 公開 sentinel、Google
canonical 公開 sentinel。這不是靠猜測單一 response；結果另由 Function log、limiter log、DB aggregate 與官方 header
規則交叉確認。

## 執行證據

- 執行前 Function：legacy／v2 canary version 29／13，兩個 bundle hash exact。
- 執行前 Secret：17，`PUSH_CLEANUP_*` 為 0。
- 執行前 DB：runtime disabled／generation 1；所有 v2／limiter 可變資料 0；legacy Push 4、outbox 7／0 pending。
- 設定順序：random 32-byte token → temporary deploy → exact canary mode。
- request window：`2026-09-08T02:47:38.768Z`～`02:47:38.849Z`。
- request：1 個已授權空 body POST，沒有 retry。
- client Request headers：token、reserved header 與 probe header exact。
- response：HTTP 403、`text/html; charset=UTF-8`、body 非 Function fixed RETRY。
- Function outcome／stage：absent／absent。
- provider marker：server 為 Cloudflare；`cf-ray` present。原值與 raw HTML 均未輸出或保存。
- DB write check：limiter／worker／delivery／consent／registry／canary／v2 全 0；outbox 7／0 pending。

## Unified log

固定查詢窗：`2026-09-08T02:47:00Z`～`02:49:00Z`。

- `source = 'function_edge_logs'`＋exact pathname `/functions/v1/push-cleanup`：0。
- `source = 'edge_logs'`＋exact pathname `/rest/v1/rpc/consume_push_cleanup_rate_limit`：0。

查詢使用 Supabase 目前的 unified ClickHouse `logs` 格式，只回 count，不讀 raw IP、hostname、token、payload 或 event
message。

## 復原後狀態

- rollback return code：mode 0、Function 0、token 0。
- `push-cleanup` 與 `PUSH_CLEANUP_*` 都不存在；Secret 總數 17。
- legacy／v2 canary version 33／17；bundle hash仍與執行前 exact 相同。
- runtime disabled／generation 1；所有 v2／limiter 可變資料仍為 0；legacy Push 4、outbox 7／0 pending。
- repo 在外部操作前後都是 clean。

## 來源規則依據

[Cloudflare 官方 HTTP header 文件](https://developers.cloudflare.com/fundamentals/reference/http-headers/)明確說明：

- `CF-Connecting-IP` 只存在於 Cloudflare edge 到 origin 的流量，代表連到 Cloudflare 的 client IP。
- 沒有 Worker subrequest 時，`cf-connecting-ip` 反映 client IP，`x-real-ip` 會被移除。
- cross-zone Worker subrequest 的 `CF-Connecting-IP` 會被設為 Cloudflare 固定 Worker client IP，不沿用任意 client value。

這與 Hosted source substage 實測完全一致：Function 內有 canonical `cf-connecting-ip`、沒有 `x-real-ip`。因此下一批採保守規則：

1. `cf-connecting-ip` 必須存在且 canonical，否則拒絕。
2. `x-real-ip` 缺少時接受；這是官方 direct path 行為。
3. `x-real-ip` 若存在，仍必須 canonical 且與 `cf-connecting-ip` 相同，保留 defense-in-depth。
4. 移除 temporary probe header／result code，避免診斷能力留在 production source。
5. source trust 改完先跑完整本機 CI；Hosted 只做 no-policy canary，預期精確停在 `POLICY`，不進 limiter DB。

這項規則只解決 source boundary；不等於 production limiter policy、正式 cleanup 或 runtime 已啟用。
