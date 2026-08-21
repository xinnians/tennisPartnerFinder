# 批 C6R：notifications 抽出（取代原 C6）

先讀 `00-overview.md`；共通紅線與回報合約適用。前置：C5 已 commit。
原 C6 因派工前提錯誤 BLOCKED（見 `docs/arch-reports/batch-C6.md`）：通知責任不在
`sessionController.js` 而在 `src/main.js`。本檔取代 `06-batch-C-controller-split.md` 的
C6 子批；該檔其餘內容不變。

## 目標與動機

`main.js`（1,580 行）持有六個通知 use case 與其 dataApi 接線；依 feature 拆分原則，
這些應集中到 `src/features/notifications/`，`main.js` 只留 UI composition 與薄轉發。
這也為 D3（main.js 狀態去重）預先減負。

## 工作項

1. 開工先重盤（2026-08-21 基準，由驗收方實測）：六個 use case 皆在 `main.js`——
   `defaultNotificationSettings`（main.js:335）、`refreshNotificationSettings`（:859）、
   `updateNotificationPreferences`（:886）、`updateCourtSubscriptions`（:904）、
   `seedAllTaipeiCourtSubscriptions`（:935）、`enablePushNotifications`（:953）；
   dataApi 接線 `loadNotificationPreferences`／`saveNotificationPreferences`／
   `loadCourtSubscriptions`／`saveCourtSubscriptions`／`savePushSubscription` 的呼叫也在
   `main.js`。行號漂移屬正常，函式集合不符才是 BLOCKED。
2. 建 `src/features/notifications/`（strict TS，沿用 C1–C5 的 feature 模組模式），
   **搬移不重寫**：六個 use case 與資料接線搬入並補型別。
3. `main.js` 對應位置改為薄轉發（import feature 模組），UI callback 接線與畫面
   composition 留在 `main.js`；`src/notificationPush.js` 禁動。
4. 通知行為凍結：六欄 `notification_prefs` 語意、`court_subscriptions` 上限規則、
   push subscription 流程、payload 紅線（LINE 永不進 payload／log）全部不變。

## 凍結白名單

- 可動：`src/main.js`（僅通知相關段落）、`src/features/notifications/**`（新）、
  字面綁 `main.js` 通知區塊的契約測試（等語意演進、非空保留；注意
  `tests/session-data-boundary.test.js` 第 403-469 行的 source scan 讀的是 `main.js`，
  若掃描區塊因搬移而空掉，演進掃描目標並附語意對照）。
- 禁動：`sessionController.js`、`sessionViews.js`、UI 檔、dataApi facade、
  `src/notificationPush.js`、`ControllerApi`（B4 契約不因本批擴充）。

## 驗收條件

- 完整 gate 全綠。
- `wc -l src/main.js` 下降（基準 1,580；前後數字指令輸出逐字進回報）。
- 「controller 行數單調下降」判準**不適用**本批（通知不在 controller，見 BLOCKED 報告）。
- 搬移對照表：`main.js` 原行號區間 → `features/notifications/` 位置。
- `git diff src/sessionController.js src/sessionViews.js` 為空。
- 通知相關 e2e 與單元測試綠；被演進的掃描測試附語意對照且非空斷言保留。

## commit 與回報

- commit：`refactor(arch-C6R): 抽出 notifications 到 features/`
- 回報檔：`docs/arch-reports/batch-C6R.md`。
- 完成後接續 `07-batch-D-single-react-app.md`（D 批開工前依該檔要求重盤前提數字，
  `main.js` 的行號與頂層 `let` 數會因本批漂移，以重盤結果為準）。
