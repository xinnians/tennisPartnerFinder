# 批 C：sessionController 依 feature 拆分（C1–C6，依序）

先讀 `00-overview.md`；共通紅線與回報合約適用。前置：B4 已 commit。

## 目標與動機

`sessionController.js` 2,480 行混雜六個 feature 的流程。目標：把純函式與 use case 抽到
`src/features/<name>/`（TypeScript，引用 B1/B4 型別），controller 只留 thin orchestration。
**不引入任何狀態管理套件**（Redux／Zustand／TanStack Query 都不要）；不改 store 介面。

## 子批順序（每子批一 commit，全都動同一大檔，禁平行）

```text
C1 features/discovery          探索、地圖 bounds、附近球局
C2 features/session-lifecycle  建立／編輯／定案／加入／審核／取消／出席
C3 features/chat               球局群聊
C4 features/profile-auth       登入、profile 門檻、auth epoch
C5 features/player-directory   球友目錄、邀請、在場
C6 features/notifications      通知偏好、push 訂閱、court subscriptions
```

> **C6 已由 `06b-batch-C6R-notifications.md` 取代**（2026-08-21）：原 C6 前提錯誤——
> 通知責任在 `main.js` 而非 controller，BLOCKED 紀錄見 `docs/arch-reports/batch-C6.md`。
> 本檔以下內容僅適用 C1–C5。

歸屬有模糊時以「該段程式主要服務哪個使用者流程」判斷，把裁量寫進回報；跨 feature 共用的
小工具放 `src/features/shared/`（保持最小，不得變成新雜物抽屜）。

## 每子批固定模式

1. 先 grep 盤點該 feature 在 controller 內的函式、store 欄位、事件與 `main.js`／
   `sessionViews.js` 呼叫點，清單進回報。
2. **搬移不重寫**：函式本體邏輯保持原樣搬到 feature 模組並補型別；發現必須改寫邏輯才能
   拆分時，BLOCKED 回報，不自行重構演算法。
3. controller 公開 API（B4 的 `ControllerApi`）完全凍結：`main.js`／`sessionViews.js`
   呼叫點零修改（import 路徑仍指向 controller）。
4. 輪詢、請求競速（request gate／auth epoch）、生命週期 refresh 的既有時序語意不變。

## 凍結白名單

- 可動：`src/sessionController.js`（縮減）、`src/features/**`（新）、`src/controllerContracts.ts`
  （契約如與現實不符需修正時，附理由）、綁 controller 內部結構的測試 import 路徑
  （等語意演進、非空保護）。
- 禁動：`main.js`、`sessionViews.js`、`dataApi` facade、任何 UI 檔、store 公開介面、
  `tests/session-controller.test.js` 與 `session-controller-sequence.test.js` 的斷言語意。

## 驗收條件（每子批）

- 完整 gate 全綠。
- `wc -l src/sessionController.js` 單調下降；回報附本子批前後行數（指令輸出逐字抄錄）。
- 搬移可追溯：回報附「controller 原行號區間 → feature 模組位置」對照表。
- `git diff src/main.js src/sessionViews.js` 為空。
- C6 完成後總驗：controller 剩餘內容只有 orchestration／store 接線／API 轉發，
  回報說明每段留下的理由。

## commit 與回報

- commit：`refactor(arch-C<n>): 抽出 <feature> 到 features/`
- 回報檔：`docs/arch-reports/batch-C<n>.md`。
