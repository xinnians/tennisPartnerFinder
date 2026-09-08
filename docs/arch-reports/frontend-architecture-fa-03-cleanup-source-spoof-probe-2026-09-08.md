# FA-03 push-cleanup source spoof probe

日期：2026-09-08

狀態：**無效格式 probe 已完成並復原；Cloudflare 在 Function 前阻擋，結果不足以涵蓋格式正確的假 IP。**

## 白話結論

client 已確認自己送出了 `cf-connecting-ip: not-an-ip`，但 Cloudflare 在 request 進入 Supabase Function 前直接回 403／
Cloudflare error 1000。這代表無效格式的 client value 無法進入目前的 Function 路徑。

但這不能證明格式正確的假 IP 也一定被阻擋或改寫，所以本批不放寬來源信任規則，也不宣稱 spoof resistance 已完整證明。

## 執行範圍

- 執行前確認 `push-cleanup` 與 `PUSH_CLEANUP_*` 都不存在，兩支既有 Function bundle hash 符合紀錄。
- 使用和上一批相同的 temporary `push-cleanup` deploy、random 32-byte canary token 與 exact canary mode。
- 只送 1 個已授權空 body POST，client Request 物件先確認無效 `cf-connecting-ip` 確實存在。
- 不設定 HMAC／policy，不允許 limiter 或 quarantine DB write。
- 無論結果都依 mode → Function → token 順序復原。

## 實際結果

- HTTP：403。
- 回應來源：Cloudflare；error code 1000。
- Function 自訂 outcome／stage header：皆 absent。
- `function_edge_logs` 在 `2026-09-08T02:11:00Z`～`02:13:00Z` 對 exact
  `/functions/v1/push-cleanup` 的 matched count：0。

因此這筆 request 沒有進入 Supabase Function，不列入 Function invocation。原始 HTML、project hostname 與 raw IP 沒有寫入
repo 或本文件。

## 復原後狀態

- rollback：mode unset 0、Function delete 0、token unset 0。
- `push-cleanup` 不存在；`PUSH_CLEANUP_*` 為 0；Secret 總數 17。
- legacy dispatcher version 21→25；v2 canary version 5→9；兩者 bundle hash完全不變。
- runtime disabled；limiter／worker／delivery／consent／registry 0；Push 4 legacy／0 v2；outbox 7／0 pending。

## 下一個精確驗證

下一批在 hard-gated canary 中新增一個短期、data-free 比較：

1. client 另外送一個不會被 log allowlist 保存的 probe header，內容是格式正確的測試 IP。
2. Function 只比較該值是否等於實際收到的 `cf-connecting-ip`。
3. response 只回固定的 `CLIENT_VALUE` 或 `NOT_CLIENT_VALUE` stage，不回任何 IP。
4. 仍只送 1 個 request、零 DB write、完整 rollback。

這樣才能分辨格式正確的 client value 是穿透、被改寫，還是和本輪一樣在 Function 前被擋。
