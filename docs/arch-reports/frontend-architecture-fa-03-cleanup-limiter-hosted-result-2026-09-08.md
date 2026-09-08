# FA-03 push-cleanup Hosted limiter canary result

日期：2026-09-08

狀態：**通過並完整復原；Hosted Edge → Postgres 原子 limiter 已由 20 次受控 request 證明可用。**

## 白話結論

這次真正走進 Hosted Postgres limiter：

- 第 1 個授權 request 得到 `ALLOW`。
- 後面 19 個同來源 request 全部得到 `LIMIT`。
- 資料庫只出現預期的 1 個 global＋1 個 source bucket。
- 所有 response 仍是固定 503／`RETRY`，沒有讀 cleanup body 或執行 quarantine。
- 測試結束後兩個 bucket、四個臨時 Secret 與臨時 Function 全部移除。

因此 limiter 的 Hosted 技術路徑已通過。這不代表 production rate limit 數值已決定，也不代表正式 cleanup 已啟用。

## 執行前基線

- repo commit：`c5a1a8b`；工作區 clean。
- Hosted Function exact 2：legacy／v2 canary version 37／21，兩個既有 bundle hash exact。
- `push-cleanup` 不存在；Secret 17；`PUSH_CLEANUP_*` 為 0。
- runtime disabled／generation 1。
- limiter、worker、canary profile、delivery、consent、registry、v2 Push、v2 outbox 全 0。
- legacy Push 4；outbox 7／0 pending，全部 format v1。
- 執行程序在任何寫入前另取 DB server timestamp，作為 limiter row guard 的時間下界。

## 臨時設定

前三個 Secret 以單一 bulk set 設定，mode 最後獨立設定：

1. random canonical 32-byte canary token。
2. 另一份獨立 random canonical 32-byte HMAC key。
3. 已核可的 canary-only policy：global capacity 2、source capacity 1、refill 2,147,483,647 ms、idle TTL
   600 秒、version 1。
4. exact `PUSH_CLEANUP_RUNTIME_MODE=hosted-limiter-canary-v1`。

temporary `push-cleanup` 在 mode 前確認為 ACTIVE、version 1、`verify_jwt=false`，bundle hash
`d514e49c5194501896c63b50fd74a7a945b8c36473f50e1d7872dd5f20a9bfce`；當時只有前三個 cleanup Secret，mode 不存在。

臨時 material 沒有輸出或寫入 repo／文件。

## Request 結果

mode 實際啟用 12,401 ms，未超過五分鐘上限；沒有 retry。

### 未授權

- window：`2026-09-08T03:30:09.710Z`～`03:30:10.756Z`。
- 1 個空 body POST；duration 1,046 ms。
- HTTP 503、exact `{"outcome":"RETRY"}`；outcome／stage 都 absent。
- request 後 limiter exact 0。

### 已授權

- window：`2026-09-08T03:30:11.195Z`～`03:30:18.412Z`。
- 20 個 sequential 空 body POST；全部 HTTP 503、exact `RETRY`、stage absent。
- outcome：1 `ALLOW`／19 `LIMIT`；failure 0。
- client latency：min 239 ms、nearest-rank p50 291 ms、p95 450 ms、max 1,097 ms。

20 筆只證明這次 canary 的 client-observed latency，不是 production p99 或正式 timeout。

## Limiter DB 證據

第 20 個授權 request 後、復原前的 read-only aggregate：

- row total 2；global 1、source 1。
- hash 全部 32 bytes。
- `refilled_at` 全部位於事前 DB server timestamp 與查詢當下之間。
- `expires_at = refilled_at + 600 seconds` 全部成立。
- global token `[1,2)`、source token `[0,1)` 全部成立。
- worker／canary profile／delivery／consent／registry／v2 Push／v2 outbox 仍全 0。
- legacy Push 4；outbox 7／0 pending、全部 format v1；runtime disabled／generation 1。

查詢沒有讀出 bucket hash、來源 IP、endpoint、profile、Push key 或 payload。

## Unified log

固定查詢窗：`2026-09-08T03:29:00Z`～`03:32:00Z`。

### Function exact pathname

- 21 matched／21 POST／21 HTTP 503。
- `cf-connecting-ip` present 21；outer-log `x-real-ip` present 21；兩值相同 21。
- 自訂 canary header logged 0。
- first／last：`03:30:10.802Z`／`03:30:18.465Z`。

### Limiter RPC exact path

- 20 matched／20 POST／20 HTTP 200。
- first／last：`03:30:11.428Z`／`03:30:18.202Z`。

Function query 使用已實查的 `request.pathname`，API query 使用 `request.path`。所有 log 查詢只回 aggregate，不讀 raw
header value、host、token、digest 或 body。

## 復原與最終狀態

固定順序與結果：

1. unset mode：return code 0。
2. delete temporary Function：return code 0。
3. DB-server-time transaction guard 驗證 exact row shape 後 delete 2：return code 0。
4. bulk unset token／HMAC／policy：return code 0。

最後再用獨立 API 重查：

- Hosted 只剩兩支既有 Function；legacy／v2 canary version 41／25，bundle hash 與執行前 exact 相同。
- Secret 總數 17；`PUSH_CLEANUP_*` 為 0。
- limiter 與其他 v2 mutable DB 全 0；legacy Push／outbox／runtime 全部回到執行前 exact 值。
- repo 前後都是 clean。

## 已完成與仍未完成

已完成：Hosted source trust、policy/HMAC parsing、Edge service config、limiter RPC、Postgres 原子 global＋source bucket、
`ALLOW`／`LIMIT` contract、log aggregate 與 guarded cleanup 都有實際證據。

仍未完成：production rate-limit policy、正式 timeout、長時間觀測、正式 cleanup key／origin、browser production wiring、
v2 runtime 啟用與 legacy cutoff。下一批應先做 production cleanup wiring／流量依據唯讀盤點，不能直接把 canary policy
升成 production policy。
