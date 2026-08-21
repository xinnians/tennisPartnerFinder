# 批 D：單一 React App（D1–D4，依序）

先讀 `00-overview.md`；共通紅線與回報合約適用。前置：C6 已 commit。
**本批風險最高。每子批開工前先核對本檔前提與 B/C 落地現況；有衝突即 BLOCKED 回報，
不自行改設計。**

## 目標與動機

現況：18 個分散 React root（4 頁面＋14 sheet 經 `createSurfaceRoot`）、30 個 `flushSync()`、
`main.js` 33 個頂層 `let` 與 controller store 形成單向推送的雙份複本。目標：唯一
`<App />` root、狀態單一 owner、逐步削減 imperative 協調。Google Maps 維持 imperative
adapter，**不 React 化**。

## 全批不變量

- 換頁與 sheet 開啟的同步語意（`.claude/rules/react-migration.md`：呼叫返回前 DOM 已更新）
  在 adapter 邊界上維持，直到該邊界被本批明文移除。
- 焦點契約：capture／restore、overlay 不搶焦、Escape 由最上層 surface 優先，行為不變。
- 深連結 `#/session/:id`、bottom navigation、離線／錯誤 UI 行為不變。
- 既有 e2e 斷言不得配合實作修改；只有綁內部結構的契約測試可等語意演進。

## 子批

**D1：唯一 App root＋頁面收斂**
`src/app/App.tsx` 建立唯一 root；4 個頁面（Me／Messages／MySessions／NearbyDrawer）併入
App 子樹，頁面級 `createRoot` 移除。sheet 殼（`createSurfaceRoot`）本子批暫留。

**D2：SurfaceHost 收斂 sheet root**
`src/app/SurfaceHost.tsx` 把 14 個 sheet 的 React 內容收進 App 子樹（以 `createPortal`
掛進既有殼的內容槽），移除 per-sheet `createSurfaceRoot`。**殼不搬進 React**：
`src/sheets.js` 的 backdrop、focus trap、Escape、surface stack、關閉與焦點回復維持
imperative 所有權（遵守 `.claude/rules/react-migration.md` 的 mountSheet 殼條款）。
若實作中發現保留殼無法達成 root 收斂、或造成焦點契約回歸，BLOCKED 回報交使用者拍板
（拍板選項含廢止該規則條款並同批修訂規則檔）；不得自行把殼搬進 React。
`tests/react-surface-lifecycle.test.js` 等語意演進（14 個 surface 的 unmount／焦點契約
覆蓋不得縮水，掃描集非空）。

**D3：main.js 狀態去重**
`courts`／`courtsReady`／`authSession`／`profile` 改以 controller store 為單一 owner
（2026-08-21 盤點：`main.js:127,142` 與 `sessionController.js:437,448` 各存一份，
main 單向推送）。33 個頂層 `let` 逐一分類：遷移進 store／保留（附理由）；回報附全表。

**D4：imperative 協調削減＋adapter 退場**
逐一檢視 30 個 `flushSync()` 與 generation key：App 子樹內部更新改走正常 React 資料流；
仍需同步 DOM 契約的（adapter 邊界殘留）保留並註記。每移除一段 legacy adapter，
對應舊碼同批刪除——**不留第二套永久架構**。

## 凍結白名單

- 可動：`src/app/**`（新）、`src/main.js`（D3 起）、`src/sessionViews.js`（D2/D4 縮減）、
  `src/sheets.js`（D2）、pages／sheets 的 mount 接線、綁內部結構的契約測試。
- 禁動：`src/map.js`／`src/pins.js` 的 imperative 介面方向、dataApi／features 層、
  所有對外可觀察行為。

## 驗收條件（每子批）

- 完整 gate 全綠；`npm run test:mock:webkit` 附數字且不劣化（基準 126/6/3）。
- 量化收斂（指令輸出逐字進回報）：
  - D1 後 `rg -c 'createRoot\(' src` 頁面級歸零；
  - D2 後 root 收斂為 1；
  - D3 後 `rg -n '^let ' src/main.js | wc -l` 明顯下降＋全表分類；
  - D4 後 `rg -n 'flushSync\(' src --glob '*.tsx' | wc -l` 下降，殘留逐一附理由。
- 焦點／Escape／深連結相關 e2e 全綠（這是本批最可能回歸的面）。

## commit 與回報

- commit：`refactor(arch-D<n>): <子批意圖>`
- 回報檔：`docs/arch-reports/batch-D<n>.md`。
