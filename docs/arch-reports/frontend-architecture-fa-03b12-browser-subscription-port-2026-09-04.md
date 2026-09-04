# FA-03B12.7.2 Browser Push subscription port（provider-neutral）

日期：2026-09-04

## 白話結論

這一批把瀏覽器原生 Push API 包成一個可測試的 port，但還沒有接進正式網站。

它只負責：確認 VAPID 公鑰、處理通知權限、等待 Service Worker 真正 ready、取得或建立 Push subscription，再把瀏覽器原樣提供的三個欄位交給外部 validator。它不含 provider 網域清單，也不送本專案的 Edge HTTP request，因此沒有替使用者選擇 A／B。

## 已完成

- 新增 `notificationPushBrowserSubscription.ts`，提供 `preparePushSubscription({ kind, signal })`。
- 建立 port 不執行 permission、Service Worker、PushManager 或 subscription 動作；只有方法被明確呼叫時才動作。
- VAPID 公鑰必須是 canonical base64url、解碼後正好 65 bytes、第一 byte 為 `0x04`，並能匯入為 P-256 public key。
- enable 在 permission 為 `default` 時才呼叫 prompt；refresh 絕不開 prompt。
- 只有 enable 的 permission 明確為 `denied` 或 prompt 後仍為 `default`，而且 Service Worker 尚未開始時，才回 exact `cancelled-before-network`。
- permission 通過後先 `register('/push-sw.js')`，再明確等待 `navigator.serviceWorker.ready`；不沿用 register 的立即回傳值。
- 現有 subscription 只有在 `options.applicationServerKey` 與目前 VAPID key 完全相同時才重用。
- VAPID key 不同時，依契約先 unsubscribe、再重讀；確定沒有舊 subscription 後才建立新 subscription。若另一個狀態仍存在且 key 不符，就 fail-closed。
- 新建 subscription 固定帶 `userVisibleOnly: true` 與目前 VAPID public key；完成後再次驗證實際 subscription 的 key。
- 只擷取瀏覽器原樣的 `endpoint`、`auth`、`p256dh`，不 trim、不改寫；injected validator 必須回傳完全相同的 exact 三欄才算 ready。
- abort、browser error、malformed native object 或 validator error 一律回 detail-free `pending`。只要已開始 Service Worker／PushManager 動作，就不會誤回可刪 provisioning 的 cancellation。

## 精確邊界

- provider allowlist 仍未決定放置方式；本 module 不含 `providerOrigins`、`PUSH_PROVIDER_ORIGINS_V1` 或任何 provider hostname。
- injected validator 尚無 production 實作。它必須等 A／B 決策後，才能接上對應的 canonical subscription policy。
- 為保持 B11 與 production graph 的既有隔離，本 module 沒有 import B11 protocol；只在本地驗證公開 VAPID key 的 canonical base64url／P-256 shape。
- Node 測試使用假的 Notification／Service Worker／PushManager，沒有真的註冊 Service Worker，也沒有連線到瀏覽器 Push provider。
- production graph 對本 module 為零 reference；現行 legacy Push UI 與 `notificationPush.js` 沒有改動。
- 沒有 app HTTP、Auth、IndexedDB、UI、migration、Hosted deploy、secret、env、provider request 或 Hosted DB 寫入。
- production bundle 未改變；main 647,304／190,390、最大 lazy 16,476／4,829、total 849,928／260,555 raw/gzip。total gzip 的既有 1,493 bytes 超額仍依 D8 保持 report-only。

## 驗證結果

```text
browser subscription port targeted：8／8 passed
related Push targeted：39／39 passed
npm run test:session-unit：Node 546 passed／1 skipped（547 tests）
npm run test:ci:frontend：Node 546 passed／1 skipped；Playwright 344 passed／4 skipped；build 509 modules
npm run test:ci:supabase：DB 1,198／1,198；local API 4／4；desktop 45 passed／11 skipped；mobile 6／6；Edge 1／1
typecheck／ESLint／Prettier／bundle structural gate／git diff --check：通過
hosted deploy／migration apply／env／request／DB 寫入：未執行
```

## 下一步

使用者仍需從
`frontend-architecture-fa-03b12-browser-provider-policy-decision-2026-09-04.md`
選 A 或 B。選定後才修改契約／B11，提供本 port 所需的 production validator，並實作加密 HTTP transport。
