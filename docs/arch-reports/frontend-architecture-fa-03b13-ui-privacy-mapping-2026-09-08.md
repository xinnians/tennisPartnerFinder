# FA-03B13.3 Push UI mapping／隱私更新實作報告

日期：2026-09-08
狀態：本批完成；Push v2 仍固定關閉

## 白話結論

使用者已同意前置文件的四項方案。本批把 Push v2 的 8 種技術狀態整理成一份共用、可測試的畫面規則，
但沒有把新版推播接到正式 App。現行三個「開啟推播」入口仍使用原本的 legacy 功能，使用者看到與點擊後的
行為都不變。

隱私頁只補上兩項已查證內容：Supabase Edge 平台可能短期記錄來源 IP；未來 Push v2 正式啟用且使用者主動
開啟後，瀏覽器會以 IndexedDB 保存裝置與訂閱管理資料。沒有加入無法由本專案證明的廣泛平台或法律敘述。

## 使用者核可的四項決策

1. `cleanup-required` 與 `cleanup-pending` 在畫面上同組顯示，底層狀態仍分開；其他 v2 狀態各自顯示。
2. 先完成 dormant UI mapping 與隱私更新；legacy 正式功能保留，Push v2 維持 disabled。
3. `invalid` 只提供異常與聯絡支援資訊，不提供會刪除本機資料的重設按鈕。
4. 隱私頁只寫已查證的 Edge source-IP 與 IndexedDB 範圍。

## 實際變更

### 1. 單一狀態契約

- 新增 `src/notificationPushStateContract.ts`，只定義 8 個 state 名稱與最小 `{ kind }` view。
- `src/notificationPushStorage.ts` 的 `PushRuntimeState` 與 presentation 共用這份 type-only 契約。
- presentation 不直接 import IndexedDB storage owner，避免 dormant storage 被拉進 production runtime graph。

### 2. 共用 presentation mapping

`src/sessionPresentation.ts` 現在集中處理 legacy 與 v2 顯示規則：

| v2 技術狀態                         | 畫面分組          | 顯示／動作                                               |
| ----------------------------------- | ----------------- | -------------------------------------------------------- |
| `disabled`                          | `disabled`        | 尚未開啟；提供明確開啟動作                               |
| `enabled`                           | `enabled`         | delivery gate 未通過時只說本機設定完成，不宣稱推播已送達 |
| `auth-unverified`                   | `auth-unverified` | 已暫停；只能由使用者重新開啟                             |
| `cleanup-required`／`cleanup-pending` | `cleanup`         | 正在停止舊推播；不提供再次開啟或猜測的手動重試           |
| `provisioning`                      | `provisioning`    | 尚未完成；只有使用者再次操作才重試                       |
| `invalid`                           | `invalid`         | 顯示異常並聯絡支援；沒有刪除／重設動作                   |
| `unavailable`                       | `unavailable`     | 說明瀏覽器目前無法讀取設定，不說成伺服器故障             |

mapping 只輸出 state 名稱、畫面分組、文案與動作種類。device ID、binding、cleanup token 與 consent 不會輸出給 UI。

`enabled` 文案另有明確的 `deliveryReady` 輸入；只有它為 `true` 才能顯示「此裝置已開啟」。目前 production 沒有
v2 caller，因此也沒有任何地方能傳入這個值。

### 3. 三個 legacy 入口保持同一規則

- Me 通知設定改由共用 presentation 取得按鈕文字、disabled 狀態與說明。
- 建立球局成功與加入球局成功仍透過共用的 `successPushPromptPresentation()`。
- 三個入口最後仍呼叫同一個 legacy `enablePushNotifications()`；沒有改成 v2 storage、Edge 或 DB command。

### 4. 隱私頁

`public/privacy.html` 生效日期更新為 2026-09-08，並加入：

- 瀏覽器呼叫本服務的 Supabase Edge Function 時，Supabase 平台可能短期記錄來源 IP；依本專案目前 Free 方案，
  平台紀錄保留 1 天。
- 專案資料庫的限流識別只保存 HMAC 結果，不保存原始 IP；這不能移除 Supabase 平台本身的短期紀錄。
- Push v2 目前尚未正式啟用；未來正式啟用且使用者主動開啟後，IndexedDB 才會保存邏輯裝置識別、推播訂閱、
  清理憑證與推播同意狀態。

## 測試與證據

新增／擴充的持續測試：

- 8 個 v2 state 全數有 exact mapping 斷言。
- 兩個 cleanup state 必須同組，但輸出的技術 state 仍各自保留。
- `enabled` 在 `deliveryReady=false` 時不得顯示已開啟；`true` 才能顯示。
- presentation 輸出不得含 device／binding／cleanup／consent 測試 marker。
- `invalid` 不得出現 delete／reset／刪除／重設動作。
- legacy 顯示、三個入口點擊、隱私文案、手機寬度與 console error 都有回歸測試。
- storage production-graph gate 已擴充：新狀態契約只能是 data-free、type-only。

驗證結果：

```text
targeted Node：64／64（含修正前端 CI 找出的聚合清單與 type-only 邊界後）
targeted Playwright：9／9（三種 browser project；legacy 入口 6、隱私頁 3）
npm run test:ci:frontend：Node 679 passed／5 skipped；Chromium 378 passed／4 skipped
npm run test:ci:supabase：DB 1,290／1,290；local API 4／4；desktop 44 passed／11 skipped；mobile 6／6；preview 4／4；四組 local Edge 1／1、1／1、1／1、2／2
production bundle：main 651,502／192,166／160,314 raw／gzip／Brotli；total 855,998／263,196／222,038
bundle gate：main 仍在 658,867／192,420 預算內；total 依 D8 report-only，超過參考值 6,037／4,134 raw／gzip
```

另以 1440px 與 390px Chromium 實際開啟隱私頁並檢視截圖；新增內容可閱讀、沒有水平溢位。此環境沒有 Browser
plugin，因此使用專案 Playwright 與本機 Chromium／WebKit 做瀏覽器驗證。

完整前端 CI 第一次執行時抓到兩項本批問題：新增測試進聚合清單時漏列既有 `me-page-dom`，以及 presentation
直接 type-import storage owner。兩項都已修正，之後 targeted、完整 frontend 與完整 Supabase CI 全部通過。

## 本批明確沒有做的事

- `src/main.js` 仍是 `createNotificationPushProductionShell({ mode: "disabled" })`。
- 沒有啟用 v2 UI、IndexedDB 寫入、通知權限請求、Service Worker 或 network request。
- 沒有 migration、Hosted deploy、Hosted request、env／secret、runtime control、資料清除、legacy cutoff 或 push。
- 沒有宣稱 Hosted dispatcher、cleanup C1 或真實 Push 已完成。

## 下一步

本機 B13.3 已完成。Push v2 正式啟用前仍有兩類外部阻擋項：

1. cleanup C1 source substage 的 Hosted 最小重驗。
2. dispatcher 真實 encrypted send canary、generation／runtime barrier 與後續 legacy cutoff。

上述工作包含 deploy、secret、Hosted request 或 runtime control 時，仍須依既定邊界先列出 exact scope 並取得使用者
確認；所有 migration 已有持續授權，不再逐支詢問。
