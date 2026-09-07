# FA-04 phase 0a 結構 gates

日期：2026-09-07
狀態：完成；只新增測試與 manifest，沒有 runtime／UI／Hosted 變更

## 白話結論

這批把原本只寫在審查文件裡的四條架構規則，變成 CI 會真的執行的測試。以後若有人新增未審查的 HTML 注入、讓 controller
直接操作 DOM、增加第三個 `syncCommit` caller，或改亂 CSS 載入順序，測試會立即失敗。

這不是只看「目前是綠色」。每一類 gate 都有故意製造錯誤的 in-memory canary，已實測錯誤加入時會紅，還原後會重新變綠。

## 實際完成內容

### 1. HTML renderer gate

- 用 TypeScript AST 遞迴掃描 `src/**/*.{js,ts,tsx}`，本次實際輸入為 116 個 source files，並確認 AST node 非空。
- 用檔案、function symbol、API、target 與 value kind 鎖定目前 6 個 reviewed renderer，不使用行號或檔案總數：
  - `SurfaceShell` 的 `dangerouslySetInnerHTML`。
  - `renderMapDataStatus` 的兩個 `innerHTML` assignment。
  - `closeSurface` 的 defensive empty `innerHTML`。
  - `deferSurfaceOpen` 與 `openSessionSheet` 的兩個 non-empty surface `html`。
- `mountSurfaceShell` 只把 `options.html` canonicalize 後傳給 React shell，不是新增 renderer；以獨立 pass-through 清單鎖定，沒有
  混進六個 renderer。
- 禁止／凍結範圍包含：`innerHTML`、`insertAdjacentHTML`、`outerHTML`、`dangerouslySetInnerHTML`、non-empty
  surface `html`、`DOMParser`、`createContextualFragment`、`document.write`、`setHTMLUnsafe`。
- 除一般 dot access 外，也實測 bracket／computed access 與 `globalThis` 寫法無法繞過 gate。

### 2. Controller DOM gate

- scope 明確固定為 `src/controller/**` 與 `src/sessionController.ts`；目前共 10 個 source files，AST input 非空。
- 依已確認契約掃描 7 類 API：`querySelector`、`innerHTML`、`classList`、`textContent`、`createElement`、
  `getElementById`、`addEventListener`。
- 現行違規為 0。
- `globalThis.document` 的 platform adapter default 不在這 7 類 DOM 操作內，因此不會被錯誤判成 controller 寫 DOM；browser
  port manifest 留在 phase 0b 獨立處理。
- 7 類 API 每一類都有 add-red／restore-green canary；bracket access 也在掃描範圍。

### 3. `syncCommit` gate

- 沿用既有 `react-surface-lifecycle.test.js` gate，不另建第二套重複規則。
- approved callers 由同一份 manifest 管理，仍只有 `src/app/SurfaceHost.tsx` 與 `src/sessionStore.ts`。
- 已實測目前綠 → 加入第三 caller 變紅 → 還原目前 source 再次變綠。

### 4. CSS import order gate

- AST 讀取 `src/main.js` 的 CSS imports，固定現行 13 個完整順序。
- 已實測目前綠 → 交換前兩個 imports 變紅 → 還原後再次變綠。
- 沒有導入 `@layer`，也沒有調整任何 CSS 或畫面。

## 驗證結果

- targeted architecture／React lifecycle／CI config：37／37 通過。
- 完整 frontend CI：通過；Node 634 tests／629 passed／5 skipped，Playwright 348 passed／4 skipped，production build
  通過。
- production bundle：實際重建為 total 852,758 raw／261,346 gzip；main 650,134 raw／191,175 gzip。開發期既定規則只
  report total raw 超出 2,797、total gzip 超出 2,284，main 與全部結構 gate 通過；數值與本批前基線完全相同。
- typecheck、ESLint、Prettier、`git diff --check`：通過。
- migration、DB、Edge Function、Secret、credential、Hosted request：全都沒有變更。

## 下一步

進入 `FA-04 phase 0b`：先重建正式 mutation symbol ledger，再把 browser port 分成 controller 禁止直讀、可注入 platform
adapter、UI 合法 global、type-only reference 四類 manifest，最後補 4 個 React 外持久 live root 的 DOM identity 測試。若某個
symbol 的 owner 無法由實際 caller／mutation 路徑唯一判定，才停下來請維護者確認，不自行猜 owner。
