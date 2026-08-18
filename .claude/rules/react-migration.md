# React 頁面遷移規則

## Importer 慣例

- source importer 必須明寫工作樹的實際副檔名：`.ts`、`.tsx`、存量 `.js` 都不可省略。
- 型別只使用 `import type`；React/ReactDOM 採直接模組 import，不新增 barrel。
- 測試若透過 `__importAppModule(name)` 直載已轉換的模組，只在 `tests/fixtures/appRuntime.js` 的副檔名表補映射，不改既有呼叫點。

## 頁面批固定模式

1. 公開 legacy adapter 的函式名稱、參數、預設值、同步語意與 callback payload 全部凍結；importer 與 e2e 直呼點不因內部改 React 而改。
2. adapter 對每個 mount element 只 `createRoot` 一次，後續呼叫以新 options 更新 props；需要維持同步換頁／焦點契約時以同步 commit 包住 `root.render`。
3. 頁面元件放在 `src/pages/<PageName>.tsx`，用 strict TypeScript 並從 `src/domainTypes.ts` 引用 domain/surface 型別。adapter 留在既有公開模組，作為混用期唯一 mount 邊界。
4. 每批凍結 testid、id、class、aria、文案、DOM 結構與全域 CSS；CSS Module 統一留到批 10。既有 e2e 斷言不得配合遷移修改。

## React 與 innerHTML surface 混用期

- 頁面 root 由 React 獨占；sheet/dialog 等既有 innerHTML surface 只寫自己的 root，不可跨邊界改 React 子樹。
- 重繪前若既有流程已 capture 焦點，React commit 後仍依 generation、active page 與 overlay 狀態還原；同 key reconciliation 不能取代「列已消失時的 fallback」或「overlay 開啟時不搶焦」規則。
- Escape 由當下最上層 sheet/dialog 的 capture listener 優先處理；頁面級 handler 看到已開 surface 或已取消事件時不得再執行。關閉 surface 的焦點回復仍回到開啟它的 React 控制項。
