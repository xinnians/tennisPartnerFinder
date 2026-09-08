# FA-03 push-cleanup source trust Hosted result

日期：2026-09-08

狀態：**通過並完整復原；source boundary 已在 Hosted 證明，正式 limiter policy 仍未設定。**

## 白話結論

只送 1 個沒有自填來源 header 的已授權空 request，結果精確停在 `POLICY`。這代表：

- Cloudflare 提供的 `cf-connecting-ip` 已通過新的來源規則。
- Hosted direct path 沒有 `x-real-ip` 不再被誤判成錯誤。
- 因為沒有設定正式 policy，程式在碰 HMAC、limiter RPC 或 cleanup 前安全停止。

mode、臨時 Function、token 都已移除；limiter 與所有 v2 可變資料保持 0。

## 執行前基線

- repo commit：`5e01f98`；工作區 clean。
- Hosted Function exact 2：legacy／v2 canary version 33／17，兩個既有 bundle hash exact。
- Secret：17；`PUSH_CLEANUP_*` 為 0。
- runtime：disabled／generation 1。
- worker／canary profile／delivery／consent／registry／limiter／v2 Push／v2 outbox：全部 0。
- legacy Push 4；outbox 7／0 pending，全部 format v1。

## 實際操作與結果

固定順序：

1. 設定 random canonical 32-byte canary token。
2. temporary deploy `push-cleanup`；ACTIVE、version 1、`verify_jwt=false`，bundle hash
   `d514e49c5194501896c63b50fd74a7a945b8c36473f50e1d7872dd5f20a9bfce`。
3. 最後設定 exact `PUSH_CLEANUP_RUNTIME_MODE=hosted-limiter-canary-v1`。
4. 只送 1 個已授權空 body POST；沒有自填 `cf-connecting-ip` 或 `x-real-ip`，沒有 retry。

request window：`2026-09-08T03:10:30.520Z`～`03:10:31.685Z`，client duration 1,165 ms。

| 項目           | 結果                              |
| -------------- | --------------------------------- |
| HTTP／body     | 503／exact `{"outcome":"RETRY"}`  |
| content type   | `application/json; charset=utf-8` |
| outcome header | absent                            |
| stage header   | exact `POLICY`                    |
| mutable DB     | 全部 0                            |

沒有設定 rate-limit HMAC、policy、cleanup private key 或 allowed origin；沒有讀 body、呼叫 limiter RPC 或 quarantine
command。

## Unified log

固定查詢窗：`2026-09-08T03:09:00Z`～`03:13:00Z`。

- `function_edge_logs`＋exact pathname `/functions/v1/push-cleanup`：1 matched／1 POST／1 HTTP 503。
- `edge_logs`＋exact path `/rest/v1/rpc/consume_push_cleanup_rate_limit`：0。

第一個 Function query 使用 API log 的 `request.path` 欄位名稱，因此回 0。依
[Supabase 官方 log 查詢指引](https://supabase.com/docs/guides/observability/advanced-log-filtering)先列該 source 實際
`mapKeys(log_attributes)`；結果確認 `function_edge_logs` 使用 `request.pathname`，而 `edge_logs` 使用 `request.path`。
改用已查到的欄位後才取得上面的 exact count。本文件不把錯欄位的 0 當證據。

查詢只回 source count、欄位名稱與 exact path count，沒有讀出 raw IP、host、token、payload 或 event message。

## 復原後權威狀態

- rollback return code：mode 0、Function 0、token 0。
- `push-cleanup` 不存在；`PUSH_CLEANUP_*` 為 0；Secret 總數 17。
- legacy／v2 canary version 37／21；兩個 bundle hash 與執行前 exact 相同。
- runtime disabled／generation 1；worker／canary profile／delivery／consent／registry／limiter／v2 Push／v2 outbox 全為 0。
- legacy Push 4；outbox 7／0 pending，全部 format v1。
- repo 前後都是 clean。

## 已證明與下一步

已證明：D45 的 source trust 規則在 Hosted 可用；沒有 policy 時會在 HMAC 與 limiter RPC 前 fail closed。

尚未證明：臨時 HMAC／測試 policy 下的 Hosted limiter `ALLOW`／`LIMIT`、原子 row 結果與復原；更沒有設定 production
policy、啟用正式 cleanup 或改 runtime。

下一批只能先固定 canary-only policy、request 數、預期 row 與 guarded cleanup 條件，再執行真正 limiter canary；測試值
不得被當成 production policy。
