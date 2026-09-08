# FA-03 push-cleanup canonical source probe result

日期：2026-09-08

狀態：**已執行並完整復原；request 停在 Function 前，但單一 sentinel 不足以完成一般化判斷。**

## 白話結論

client 確認送出了格式正確的 `cf-connecting-ip` 與相同 probe header。平台回 HTML 403，沒有任何 Function 自訂
outcome／stage；同一時間窗的 Function exact-path log 也是 0。

所以這個假值沒有進入 Function，但本輪只測一個 sentinel。為避免把單一結果猜成所有格式正確 IP 都一樣，本批不修改來源
信任規則；下一輪改用另一個已由官方文件確認、且屬於不同服務商的公開 IP 作獨立驗證。

## 執行結果

- 執行前：兩支既有 Function 為 ACTIVE，version 25／9，bundle hash 符合前次紀錄。
- Secret：17 個，`PUSH_CLEANUP_*` 為 0。
- DB：runtime disabled／generation 1；limiter、worker、delivery、consent、registry、canary profile、v2 Push 都是 0。
- 臨時設定：random canonical 32-byte token、temporary `push-cleanup` deploy、最後才設定 exact canary mode。
- request window：`2026-09-08T02:36:58.480Z`～`02:36:58.560Z`。
- client Request 物件中的 token、`cf-connecting-ip` 與 probe header 都精確存在。
- HTTP：403；content type `text/html; charset=UTF-8`。
- body：不是 Function 固定 `RETRY`，也沒有被腳本分類成前次 Cloudflare error 1000；raw HTML 沒有輸出或保存。
- outcome／stage header：皆 absent。
- 唯讀 DB write check：limiter／worker／delivery／consent／registry／canary／v2 全為 0；outbox 7／0 pending。

## Platform log

固定查詢窗：`2026-09-08T02:36:00Z`～`02:38:00Z`。

Supabase 目前的 Management API 已改用 unified ClickHouse `logs` table。第一次沿用舊 table 名查詢，API 精確回
`Table "function_edge_logs" does not exist.`；這是唯讀查詢失敗，沒有副作用。改用官方目前格式後：

- `source = 'function_edge_logs'`＋exact pathname `/functions/v1/push-cleanup`：0。
- `source = 'edge_logs'`＋exact pathname `/rest/v1/rpc/consume_push_cleanup_rate_limit`：0。

查詢只回 count，不讀 raw IP、hostname、token、payload 或 event message。新格式依據
[Supabase Query and filter logs](https://supabase.com/docs/guides/observability/advanced-log-filtering)。

## 復原後狀態

- rollback return code：mode 0、Function 0、token 0。
- `push-cleanup` 不存在；`PUSH_CLEANUP_*` 為 0；Secret 回到 17。
- legacy dispatcher／v2 canary version：29／13；bundle hash與執行前完全相同。
- runtime disabled／generation 1；所有 v2 可變資料仍為 0；legacy Push 4、outbox 7／0 pending。
- repo 在外部操作前後皆無未提交變更。

版本編號各增加 4 是四次 Secret mutation 的平台 metadata 副作用；沒有重新部署或修改兩支既有 Function 的 source。

## 已證明與未證明

已證明：

- 這一筆格式正確的 client-supplied `cf-connecting-ip` 沒有進入目前的 direct Hosted Function path。
- data-free probe、單 request 上限、零 DB write、停損與回滾有效。
- 現行 Supabase logs 查詢要使用 unified `logs`＋`source`，不能再把 source 名當 table。

未證明：

- 其他格式正確、公開且非同一服務商的 client value 是否也會在 Function 前被阻擋。
- Function 內只要求 canonical `cf-connecting-ip` 是否已具備足夠的 production 證據。
- limiter RPC、production policy 或正式 cleanup 可以啟用。

因此本批只保存結果，不修改 source trust。
