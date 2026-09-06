# FA-03B11.1 browser structure／server provider-policy 拆分

日期：2026-09-06  
狀態：已完成並通過 targeted 驗證；dormant，未接 production／Hosted

## 白話結論

使用者選擇方案 A 後，browser 不再需要知道哪些推播供應商在白名單內：

- browser 只確認 endpoint 是安全、完整、沒有被改寫的 HTTPS 網址，並確認 `auth`、`p256dh` 格式正確。
- Edge 解密後，才用 server-only 白名單確認 endpoint 的 origin 是否允許。
- dispatcher 未來送出前仍要用同一份 server policy 重驗。

因此 provider 清單沒有被公開，也沒有在 repo 猜任何 FCM、Mozilla 或 Apple hostname。

## 實作內容

- `validateCanonicalEndpointStructure(...)`：只驗 4,096 UTF-8 bytes、canonical HTTPS、public hostname、預設 443、
  無帳密與 fragment。
- `validateCanonicalPushSubscriptionStructure(...)`：在上述 endpoint 規則外，再驗 exact keys、16-byte `auth` 與合法
  65-byte P-256 `p256dh`。
- `validateCanonicalEndpoint(...)` 與 `validateCanonicalPushSubscription(...)`：保留給 server，額外要求 exact origin
  命中 `PUSH_PROVIDER_ORIGINS_V1`。
- `canonicalPushSubscriptionInnerJson(...)` 與 `encryptPushSubscriptionEnvelope(...)`：移除 origins 參數，讓 browser
  能在不知道 server policy 的情況下建立 canonical encrypted envelope。
- Edge decrypt：先驗 inner canonical structure，再驗 server provider policy。provider 未命中回
  `endpoint-unavailable`，不進 DB；壞結構仍回 `invalid`。

## 驗證結果

```text
Node protocol／browser port／governance targeted：43／43 passed
desktop Chromium protocol：1／1 passed
mobile WebKit protocol：1／1 passed
npm run test:ci:frontend：Node 547 passed／1 skipped；Playwright 344 passed／4 skipped；build 509 modules
npm run test:ci:supabase：DB 1,198／1,198；local API 4／4；desktop 45 passed／11 skipped；mobile 6／6；Edge 1／1
typecheck／ESLint／Prettier／bundle structural gate／git diff --check：通過
Hosted deploy／migration／env／request／DB write：未執行
```

共用 endpoint corpus 現在明確有兩個預期欄位：

- `structureValid`：browser 結構層結果。
- `providerValid`：server policy 層結果。

測試已證明 `https://push.other.qiuka.tw/...` 這種合法 canonical 但未列入 fixture allowlist 的 endpoint，在 browser
結構層通過、server policy 層拒絕。

## 沒有改動的範圍

- 沒有新增或修改 migration。
- 沒有部署或呼叫 Hosted。
- 沒有設定 production provider origins、VAPID key 或 private key。
- 沒有把任何 dormant module 接入 production graph。
- 沒有實作 HTTP transport、UI、Service Worker push handler 或 dispatcher send-time DNS。

下一步是依 v1.3 實作 dormant browser encrypted HTTP transport，完成後再做 local-only composition；production 與
Hosted 仍維持關閉。
