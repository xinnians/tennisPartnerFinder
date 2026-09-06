# FA-03B12.7.4 local Push v2 subscription composition

日期：2026-09-06
狀態：已完成並通過完整 CI；local-only，未接 production／Hosted

## 白話結論

前幾批完成的零件現在已在一個 dormant factory 裡接好：

```text
B5 IndexedDB storage
  + browser PushSubscription／VAPID
  + browser structure validator
  + encrypted HTTP transport
  + Auth proof port
  -> B12.7.1 coordinator
```

真實 Chromium 與 WebKit 測試已走完整 enable 流程：建立 durable provisioning、取得 browser subscription、讀公鑰、
加密、送一次 POST、收到 exact committed response，再以 CAS 把 IndexedDB 狀態改為 enabled。

## 已完成

- 新增 `notificationPushSubscriptionLocalComposition.ts`，只把已驗證的 B5、B11.1、B12.7.1～B12.7.3 組起來。
- validator wrapper 只接受 shared structure validator 通過且原三欄完全相同的 subscription；沒有 provider origins。
- storage、browser 與 transport 共用同一個 injected WebCrypto；Auth 仍是明確 port，不自行讀 Supabase session。
- factory 建構時不開 IndexedDB、不碰 Service Worker、不 fetch；只有 caller 呼叫 coordinator／storage 方法才動作。
- governance 明確排除 production importer，並禁止直接 app data API、Supabase client、log、timer 與 policy 設定。

## 驗證

```text
composition Node targeted：2／2 passed
desktop Chromium＋mobile WebKit full local enable composition：2／2 passed
npm run test:ci:frontend：Node 562 passed／1 skipped；Playwright 348 passed／4 skipped；build 509 modules
npm run test:ci:supabase：DB 1,198／1,198；local API 4／4；desktop 45 passed／11 skipped；mobile 6／6；Edge 1／1
typecheck／ESLint／Prettier／bundle structural gate／git diff --check：通過
Hosted deploy／migration／env／request／DB write：未執行
```

production bundle 完全不變：main 647,304／190,390 raw/gzip，最大 lazy 16,476／4,829，total 849,928／260,555；
total gzip 的 1,493-byte 超額仍依 D8 只報告。

## 尚未完成

- 正式 App 沒有 import factory，現行 UI／legacy Push 行為完全不變。
- production Auth adapter、VAPID／key／Function endpoint config 尚未接線。
- Edge HTTP handler、authoritative JWT verification、CORS 與 DB command mapping 尚未實作。
- provider origins、dispatcher DNS／socket barrier、SW、UI、privacy 與 Hosted runtime 仍未完成。

下一步先對 Edge HTTP/Auth/DB handler 做 contract 對照與 local-only 實作；任何 Hosted 或 production 設定仍需另行核可。
