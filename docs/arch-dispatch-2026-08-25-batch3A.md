# 批 3A 派工單：F3-0 規則修訂＋F3-1 導覽狀態機／深連結＋F3-3 啟動編排

- 日期：2026-08-25
- 路線圖：`docs/arch-roadmap-2026-08-25.md` 階段 2；母派工單批 3 條目
- 開工基準：以當前 origin HEAD 為準（`bb0a810` 之後）
- 順序**必須** F3-0 → F3-1 → F3-3；F3-0 未落地前不得動程式。
- 本批打開的是 2026-08-22 拍板的規則解凍（含 2026-08-25 追加的 MIG-06 翻案）；
  **testid 凍結不在解凍範圍**，仍是一票否決。

## 開工前必讀（讀磁碟上的現行版本）

1. `.claude/rules/react-migration.md`（要修訂的對象）
2. `docs/architecture-decisions.md` MIG-06 列（已標「已翻案 2026-08-25」，
   本批落實翻案儀式）
3. 母派工單 F3-0／F3-1／F3-3 條目＋總則
4. `docs/arch-reports/batch-F1R-acceptance-2026-08-24.md`（焦點交接語意，
   導覽改動不得破壞）

## Ground truth（2026-08-25 實測）

- **hidden 矩陣**：`src/main.js:556`／`:569`／`:591`／`:617` 四個 `showXPage`，
  每個手動 hide 其他三頁（O(N²)）。
- **hash 現況**：`hashchange` 監聽只服務 `#/session/:id`（`main.js:794`）；
  `sessionRoute.js` 7 行純函式。**`index.html` 既有 `#tab-map` anchor
 （首頁 logo `href="#tab-map"`）**——分頁 hash 命名空間設計必須把它納入或
  相容處理，不能讓點 logo 產生壞路由。
- **啟動序**：`init()` 尾端五路互不 await（`main.js:799-804`：
  `loadCourtsImmediately`／`controller.loadDiscovery`／`restoreAuth`／
  `startMap`／`openSessionHashRoute`），註解自載「None of these awaits the
  others」。一次性旗標 `bootDeepLinkReopenPending` 在
  `src/features/profile/profileOrchestrationFeature.js:30`／`:203-205`。
- 分頁切換目前不進 URL／history；返回鍵無作用；重整回地圖。

## F3-0 規則修訂（第一個 commit，純文件）

修訂 `.claude/rules/react-migration.md`，新增「批 3 解凍」節，逐條載明：

1. **(a) surface stack 歸屬**：允許遷入 React——**僅限批 3B 實施**，本批（3A）
   不得動 `sheets.js` 殼。
2. **(b) AppShell 接管區 DOM 凍結解除**：僅限 3B 實際接管的區域
  （topbar、底部導覽、toast、login modal）；其餘頁面 DOM 凍結照舊。
3. **(c) MIG-06 翻案落實**（2026-08-25 使用者拍板）：分頁狀態進 URL／history
   納入 F3-1。翻案理由（深連結、重整保位、返回鍵語意）與 **hash 命名空間設計**
   寫進本節：`#/session/:id` 逐字保留；四主分頁的 hash 形式自選（建議與既有
   `#tab-map` anchor 相容或明確接管它），設計披露於回報。
4. **不解凍**：testid、既有 e2e 斷言、文案、`syncCommit` 同步邊界、
   dataApi 邊界。

驗收：規則檔 diff 範圍恰為上述；受影響守門測試清單與處置（預期零，因 3A
不動 DOM 結構）。

## F3-1 導覽狀態機＋hash 深連結

### 作法約束

1. 單一 `setActivePage` 狀態機收斂四個 `showXPage` 的 hidden 矩陣
  （頁面 DOM 結構、testid、焦點交接語意全部不變——變的只有「誰負責算
   hidden」）。
2. **自製 hash router ≤10 行、不引 React Router**；接 `history`：
   四主分頁可深連結、重整保位、返回鍵在分頁間有語意。
3. `#/session/:id` 行為零變化：`sessionRoute.js` 純函式保留、既有深連結
   e2e 零修改全綠；分頁 hash 與 session hash 的優先序明文化。
4. 各 `showXPage` 的呼叫端簽名可保留（薄包裝呼叫狀態機），避免大面積改
   caller；focus 參數語意不變。

### 驗收條件

1. hidden 矩陣收斂：`show*Page` 函式內的 `document.getElementById(...).hidden = `
   直接賦值歸零或集中到狀態機單點（附前後 grep 計數）。
2. **新增 e2e**（每條列明）：四分頁深連結直開、重整保位、返回鍵回上一分頁、
   `#tab-map` anchor 點擊行為正確。
3. 既有 e2e（含 `react-page-focus.spec.js` 焦點、`#/session/:id` 深連結）
   **零修改全綠**。
4. 兩張 GOLDEN、testid 集合對 `0be31a2` 維持已核可 hunk。

## F3-3 啟動編排顯式化

### 作法約束

1. `boot()`（或等價入口）顯式描述五路啟動的依賴與匯合點：哪些真並行、
   哪些必須等 auth 定案，用 await／Promise 組合明文化，不靠時序巧合。
2. 深連結改**結構性等待**：session hash 的開啟等 auth 候選定案後執行一次，
   `bootDeepLinkReopenPending` 一次性旗標與相關世代計數退役（附反向 grep）。
3. 與 F3-1 同批鎖交界：冷啟動＋深連結（未登入、已登入、分頁 hash、
   session hash 四象限）各一條 e2e。

### 驗收條件

1. `bootDeepLinkReopenPending` 反向 grep 0；啟動序有註解說明每路的依賴。
2. 冷啟動深連結 e2e 新增並綠；既有啟動相關測試零修改。
3. 行為零變化面：court pins 與 discovery 仍不等 auth（既有註解載明的
   產品行為保留）。

---

## 不在範圍（不要順手做）

1. F3-2 殼遷移／glob 退役（3B）；`sheets.js` 完全不動。
2. F0-7 計數斷言清單化（階段 2.5，3A 之後）。
3. 不動 controller 模組、dataApi、`syncCommit.ts`、通知／presence 功能面。
4. 分頁 hash 進 analytics 或分享文案——只做導覽，不擴散。

## 回報要求

寫成 `docs/arch-dispatch-2026-08-25-batch3A-report-codex.md`，不列入實作
commit、不 push。F3-0 單獨 commit；F3-1／F3-3 每項至少一個 commit。
hash 命名空間設計、狀態機形狀、boot 依賴圖用文字說明；新增 e2e 逐條列出；
「已刪除／歸零」附反向 grep；canary：新導覽 e2e 至少一條做紅→還原→綠
（證明斷言真的在看 URL／history，不是恆綠）。

**收尾必跑標準矩陣**：`npm run test:ci:frontend`、`npm run test:db`、
`npm run test:local`（did not run＝0）、`git diff --check`；
GOLDEN／testid 對 `0be31a2` 維持已核可 hunk。Playwright 不並發；
DB 重置只可用 guarded 指令。
