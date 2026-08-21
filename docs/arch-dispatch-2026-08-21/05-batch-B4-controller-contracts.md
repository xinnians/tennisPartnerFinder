# 批 B4：Controller 契約型別

先讀 `00-overview.md`；共通紅線與回報合約適用。前置：B3b 已 commit。

## 目標與動機

`sessionController.js`（2,480 行）是 C 批拆分對象；先把它的 state 與公開 API 用型別
固定下來，C 批才有可證偽的「拆分後行為等價」判準。本批**只加型別，不改行為、不搬程式**。

## 工作項

1. 新增 `src/controllerContracts.ts`，定義：
   - `SessionControllerState`：以 `sessionController.js` 內 `createStore` 初始狀態實際欄位
     為準（先 grep 盤點，禁杜撰欄位）。
   - `ControllerApi`：controller 對 `main.js`／`sessionViews.js` 暴露的全部函式簽名
     （以實際匯出＋呼叫點盤點為準）。
   - surface context 與事件 payload 型別（store `emit` 的事件名集合同樣以 grep 為準）。
2. `src/sessionStore.ts`（54 行）接上泛型參數，預設綁 `SessionControllerState`。
3. `.ts`/`.tsx` 端既有的 controller 相關鬆散型別改引用新契約；存量 `.js` 不動
   （不開 `checkJs`，不加 `@ts-check`）。

## 凍結白名單

- 可動：`src/controllerContracts.ts`（新）、`src/sessionStore.ts` 型別、`.ts`/`.tsx` 型別註記、
  `src/domainTypes.ts`（若需要搬移共用型別，說明理由）。
- 禁動：`sessionController.js`、`main.js`、`sessionViews.js` 的任何內容；任何 runtime 行為。

## 驗收條件

- 完整 gate 全綠。
- 回報附兩張以指令產出的對照表：
  (a) `createStore` 初始欄位 ↔ `SessionControllerState` 欄位（必須一一對應，含型別依據）；
  (b) controller 公開函式 ↔ `ControllerApi` 方法（含 `main.js`/`sessionViews.js` 呼叫點行號）。
- 對稱性論證：契約型別對 controller 實際面的涵蓋與 controller 實際面對契約的涵蓋互為等價；
  不得「型別先寫理想版」——理想化重構留給 C 批。
- `git diff src/sessionController.js src/main.js src/sessionViews.js` 為空。

## commit 與回報

- commit：`refactor(arch-B4): 定義 controller state 與 API 契約型別`
- 回報檔：`docs/arch-reports/batch-B4.md`。
