# FA-03 push-cleanup canonical source probe preflight

日期：2026-09-08

狀態：**本機 data-free probe 已完成；Hosted 單次驗證尚未執行。**

## 白話結論

上一輪只證明亂填的 IP 會被 Cloudflare 擋掉，還不知道格式正確的假 IP 會怎麼處理。

本批新增一個短期診斷：request 同時帶 `cf-connecting-ip` 與另一個 probe header。Function 不保存也不回傳 IP，
只回答兩個值「相同」或「不同」。這條路徑必須先通過既有 exact mode、POST 與 32-byte random token，並且會在 limiter、
body、key、解密與 quarantine 之前停止。

## 本機實作

- 新增 request header：`x-qiuka-cleanup-source-probe`。
- 兩個值都必須先通過既有 canonical IPv4／IPv6 parser。
- response 只允許三個固定 stage：
  - `SOURCE_CF_CLIENT_VALUE`：Function 收到的 `cf-connecting-ip` 等於 client probe。
  - `SOURCE_CF_NOT_CLIENT_VALUE`：兩者不同。
  - `SOURCE_PROBE_INVALID`：任一值缺少或不是 canonical IP。
- 沒有 probe header 時，既有 limiter canary 流程完全不變。
- 沒有 exact token、不是 POST 或 mode 未開啟時，仍只回原本的固定 `RETRY`。

## 已完成驗證

```text
node --test tests/push-cleanup-edge.test.js
35 passed, 0 failed

npx eslint supabase/functions/push-cleanup/handler.js \
  supabase/functions/push-cleanup/rate-limit.js \
  tests/push-cleanup-edge.test.js
passed

npx prettier --check ...
passed

git diff --check
passed
```

新增測試已直接證明 probe 分支的 body read、key load、limiter call 與 quarantine call 全是 0；IPv4 相同／不同、IPv6
canonical alias、無效 probe 與未授權 request 都有覆蓋。

## Hosted 精確範圍

使用者在得知本批會做 temporary Hosted probe 與完整回滾後，於 2026-09-08 回覆繼續。執行範圍固定如下：

1. 先唯讀確認 Function／Secret／DB aggregate 與既有 bundle hash 基線。
2. 建立 random 32-byte canary token 與 exact `hosted-limiter-canary-v1` mode，共 2 個臨時 Secret。
3. temporary deploy `push-cleanup`，不改兩支既有 Function、cron 或 runtime generation。
4. 只送 1 個已授權空 body POST；以 `1.1.1.1` 作為 header 比較用的 canonical 公開 sentinel，不會連線到該位址。
5. 不設定 HMAC／policy／cleanup key；不允許 limiter、quarantine 或其他 DB write。
6. client 只輸出 HTTP status、content type、固定 outcome／stage header 與耗時；不輸出 raw HTML、hostname、token 或 IP。
7. 無論成功或失敗，都依 mode → Function → token 順序完整移除，再唯讀重驗基線。

## 結果判讀

- `SOURCE_CF_NOT_CLIENT_VALUE`：本次 direct path 的格式正確假值被平台改寫；再結合官方平台文件，才能提出保守的來源規則修正。
- `SOURCE_CF_CLIENT_VALUE`：client value 穿透，不放寬來源規則。
- Cloudflare 403 且 Function log 0：格式正確的自訂 `cf-connecting-ip` 也在 Function 前被阻擋；只對本次 direct path 下結論。
- 其他狀態、stage 或 DB 變動：立即停損、復原，不猜測原因。

本批不啟用 production cleanup、不建立 production limiter policy、不送真實 Push、不清除資料，也不修改 legacy cutoff。
