# FA-03 push-cleanup Hosted source trust

日期：2026-09-08

狀態：**本機實作與完整 CI 已完成；no-policy Hosted canary 尚未執行。**

## 白話結論

Hosted 實測已確認：Function 收得到 Cloudflare 提供的 `cf-connecting-ip`，但 direct path 沒有 `x-real-ip`。因此來源規則改成：

1. `cf-connecting-ip` 必須存在，而且只能是格式正確的單一 IP。
2. `x-real-ip` 缺少時可接受。
3. `x-real-ip` 若存在，也必須是格式正確的單一 IP，並且與 `cf-connecting-ip` 完全相同。

這不是直接信任 client 自己帶入的值。三次 Hosted spoof probe 都被 Cloudflare 擋在 Function 前；規則也符合 Cloudflare
官方對 direct edge-to-origin header 的說明。

## 本批程式變更

- `rate-limit.js`：保留 `cf-connecting-ip` 必填；`x-real-ip` 改為 optional defense-in-depth。
- `rate-limit-client.js`、`handler.js`：移除已完成任務的 `SOURCE_REAL_MISSING` stage。
- `handler.js`、測試：完整移除 temporary source probe header、固定結果與 bypass 分支。
- 測試新增／調整：明確驗證只有 canonical `cf-connecting-ip` 可以進到 limiter；`x-real-ip` 存在時仍會驗格式與一致性。

## 本機驗證

- `node --test tests/push-cleanup-edge.test.js`：34／34 passed。
- `npm run test:ci:frontend`：Node 679 passed／5 skipped；Chromium 378 passed／4 skipped；typecheck、lint、format、build、
  design-system 與 bundle structure 全部通過。
- development bundle report 仍回報既有超額：total raw +6,037 bytes、gzip +4,134 bytes。依 D8 這是開發期報告，
  不是這批 source-only 變更造成的 release 判斷；本批沒有修改前端 bundle。
- `npm run test:ci:supabase`：pgTAP 1,290／1,290、local API 4／4、local browser 44 passed／11 skipped、mobile
  6／6、production preview 4／4；push-cleanup、push-subscription v2、dispatcher transport、outbox dispatcher Edge
  測試全部通過。
- temporary probe 與 `SOURCE_REAL_MISSING` identifier 在 `supabase/functions`、`tests` 都是 0。

## 下一步：no-policy Hosted canary

本次只驗「source 已通過，但 policy 尚未設定時仍 fail closed」，固定範圍如下：

1. 唯讀確認兩支既有 Function version 33／17、exact bundle hash、17 Secrets／0 cleanup 與 DB aggregate 基線。
2. 設定 random canonical 32-byte canary token。
3. temporary deploy `push-cleanup`；mode 尚未設定時仍 hard-disabled。
4. 最後設定 exact `hosted-limiter-canary-v1` mode。
5. 只送 1 個已授權空 body POST；client 不自行設定 `cf-connecting-ip` 或 `x-real-ip`。
6. 不設定 HMAC、policy 或 cleanup key。預期 HTTP 503、fixed `RETRY`、canary stage exact `POLICY`。
7. 不論結果為何都不送第二次 request；limiter／worker／delivery／v2 mutable DB 必須保持 0。
8. 固定依 mode → Function → token 順序復原，再重查 Function／Secret／DB 與 unified log count。

本 canary 不包含 production policy、正式 cleanup、runtime 啟用、資料清除、真實 Push 或 legacy cutoff。
