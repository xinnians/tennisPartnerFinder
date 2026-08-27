---
paths:
  - "src/pages/**"
  - "src/sheets/**"
  - "src/main.js"
  - "src/sessionViews.js"
  - "src/sheets.ts"
  - "tests/fixtures/appRuntime.js"
---

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

## 批 3 解凍（2026-08-25）

1. surface stack、focus trap、Escape 與關閉焦點回復允許遷入 React，但只限批 3B 實施；批 3A 不得變更 `sheets.js` 殼。
2. DOM 結構凍結只對批 3B 實際由 AppShell 接管的 topbar、底部導覽、toast、login modal 解除；其餘頁面與 surface 的 DOM 結構仍凍結。
3. MIG-06 正式翻案：四主分頁狀態納入 URL／history，理由是支援深連結、重整保位與返回鍵語意。`#/session/:id` 命名空間逐字保留且優先於分頁 route；四主分頁使用與既有首頁 anchor 相容的 `#tab-map`、`#tab-my-sessions`、`#tab-messages`、`#tab-me`，由應用程式明確接管。
4. 本次不解凍 `data-testid`、既有 e2e 斷言、文案、同步 commit 邊界與 `dataApi` 邊界；這些契約仍是一票否決。

## React ownership 分批解凍（2026-08-26）

1. adapter 簽名與 e2e 直呼點的凍結改為依批解凍：僅當某批派工單明列該 adapter 於解凍清單時，該 adapter 的簽名、直呼點與對應白箱斷言才解凍；未到指定批次前仍視為凍結。
2. 批 1（Messages）先行解凍 `mountMessagesDestination` options bag、`pageViews.js` 的 `renderMessagesPage` bridge、`App.tsx` 的 `renderMessagesPageInApp` 與 MessagesPage props fallback 雙源；其餘頁面與 sheet 的 adapter 仍凍結。
3. 允許把「以 adapter 為 harness」的既有 e2e 測試改寫為 UI 驅動，但行為 oracle（焦點還原、Escape、可見性等斷言語意）不得弱化或刪除。
4. 批 4 才解凍 `mountSheet` 專有 surface 殼：backdrop、focus trap、Escape、surface stack、關閉與焦點回復允許遷入 React surface system；批 4 之前仍凍結。
5. 批 5 才解凍 imperative handle 的 `flushSync`／同步 commit 契約並允許逐 caller 退役；每移除一個須以原始 race／focus 測試驗證，留存者需書面理由。
6. 本次不解凍 `data-testid`、id、class、aria、文案與既有 e2e 斷言 oracle 語意、`dataApi` 邊界與隱私 allowlist；production bundle gate 不得任意放寬。這些契約仍是一票否決，任何批不得變更。

## Sheet 批固定模式

1. factory 的公開簽名、預設值與 imperative handle 方法集合／payload／同步語意凍結；handle 推 React state 時以 `flushSync` commit，呼叫返回前 DOM 必須已更新。
2. （2026-08-27，批 4 起）殼依「React ownership 分批解凍」第 4 條遷入 React surface system；React content 不得跨界改寫 sheet root 的原則保留。
3. sheet 元件放在 `src/sheets/<SheetName>.tsx`。adapter 留在原 factory 模組，負責把 legacy callbacks 接到 React 內容與既有 surface handle；格式化／presentation helper 保持單一來源。
4. 局部狀態切換只更新有關子樹；其餘內容以穩定 props、memo 或等價方式維持 DOM identity，避免抹掉非目標區域的焦點與選字。DOM、全域 class、文案及 aria 契約仍依頁面批規則凍結。
5. （2026-08-27）殼的 `section.surface` 必須是 React leaf：非空 legacy `html` 走 `dangerouslySetInnerHTML`，React content 只可 portal 進該模板建立的 descendant；直接以 section 為 portal target 的路徑必須使用 `html: ""`，不可同時宣告 React children 或 dangerous HTML。
