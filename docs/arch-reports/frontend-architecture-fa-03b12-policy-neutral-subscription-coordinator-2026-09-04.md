# FA-03B12.7.1 Push 訂閱協調器（policy-neutral）

日期：2026-09-04

## 白話結論

這一批完成的是「流程總管」，不是正式啟用 Push。

它負責在啟用或更新 Push 訂閱時，反覆確認登入身分與本機資料仍是同一份，最多送出一次請求，收到完全符合契約的成功結果後才更新本機狀態。任何資料變動、格式不符、未授權或例外，都只回傳不含內部細節的 `pending`。

先前查到的 provider policy 衝突仍然存在。本批沒有決定 A／B、沒有把 server-only origins 放進瀏覽器，也沒有自行填 provider 網域；瀏覽器準備訂閱、加密與實際 HTTP 傳輸仍由之後的 injected ports 提供。

## 已完成

- 新增無 import 的 `notificationPushSubscriptionCoordinator.ts`，建立 `enableProvisioning` 與 `refreshEnabledBinding` 兩條 local-only 流程。
- 所有 Auth、瀏覽器、storage 與 transport 行為都從 composition root 注入；建立 coordinator 時不會讀瀏覽器狀態、存取 IndexedDB 或送網路。
- enable 在送出前與送出後都重讀 exact provisioning，並反覆確認同一份 verified Auth proof。
- 只有瀏覽器 port 回傳 exact `cancelled-before-network` 時，才會呼叫 B12.5 刪除 provisioning；request 已開始或結果不明時不刪。
- enable 只接受 exact committed response，之後透過 B5 `commitPushProvisioning` 做本機 commit。
- refresh 在送出前與送出後都重讀 exact enabled binding，成功後透過 B12.6 `commitPushRefresh` 做本機 commit；refresh 不會呼叫 provisioning cancel。
- 每次方法呼叫最多只會進入一次 transport；沒有 retry、loop、timer 或背景排程。
- exact unauthorized 只通知 Auth owner／revision，不傳 bearer；若 proof 已被較新的 Auth 狀態取代，連通知也不送。
- malformed response、contract drift、stale state 或 injected port throw 一律保留現況並回 detail-free `pending`。
- governance test 確認 production runtime 對此 module 零 reference，也沒有直接 Auth、browser、network、storage、log 或 timer dependency。

## 精確邊界

- 本批測試使用 fake injected ports；沒有真實 PushManager、Service Worker、加密、HTTP 或 Edge request。
- `subscription` 在本層只檢查 exact `auth`／`endpoint`／`p256dh` 三欄與非空字串。canonical key、endpoint origin 與 provider allowlist 必須由之後的 browser／transport port 處理。
- B11 目前仍要求 browser serializer 取得 provider origins，而契約 v1.2 又把 origins 定為 server-only。未經使用者選擇 A（拆分 browser 結構驗證與 server allowlist，建議）或 B（公開 policy）前，不修改 B11，也不建立具體 transport。
- 本 module 可以直接作為 B12.4 `enableProvisioning` injected port 的實作，但目前沒有 production composition 或 caller。
- 沒有 UI、Service Worker、migration、Hosted deploy、secret、env、provider request 或 Hosted DB 寫入。
- production bundle 未改變；本批 CI 仍量到 main 647,304／190,390、最大 lazy 16,476／4,829、total 849,928／260,555 raw/gzip。total gzip 的既有 1,493 bytes 超額仍依 D8 保持 report-only。

## 驗證結果

```text
subscription coordinator targeted：8／8 passed
npm run test:session-unit：Node 536 passed／1 skipped（537 tests）
npm run test:ci:frontend：Node 536 passed／1 skipped；Playwright 344 passed／4 skipped；build 509 modules
npm run test:ci:supabase：DB 1,198／1,198；local API 4／4；desktop 45 passed／11 skipped；mobile 6／6；Edge 1／1
typecheck／ESLint／Prettier／bundle structural gate／git diff --check：通過
hosted deploy／migration apply／env／request／DB 寫入：未執行
```

## 後續唯一產品決策

請從已建立的
`frontend-architecture-fa-03b12-browser-provider-policy-decision-2026-09-04.md`
選 A 或 B。選定後才能安全修改契約／B11，並實作具體 browser subscription 與 transport ports。
