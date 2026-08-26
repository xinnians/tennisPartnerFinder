# 批 4B 派工單：SessionDetailSheet 重 lazy 化

- 日期：2026-08-26。母文件：`docs/arch-roadmap-2026-08-26-react-ownership.md`（批 4 切
  三段之二）；前置：批 4A ACCEPTED（`66c2920`，manifest 已單源化——本批的
  `eagerModules`／`lazySheets` 變更都只改 manifest 一處）。設計輸入：批 4A 回報
  §4.5 的兩階段殼方案（`docs/arch-dispatch-2026-08-26-batch4A-manifest-report-codex.md`），
  本派工單採納其骨架。
- 開工基準：`66c2920` 之後的最新 main HEAD（working tree 應乾淨，否則停手回報）。
- 動機：eager import 的原始理由（`00d016e`：讓 `sessionViews.js` 保持 Node-importable
  的 import 拓撲）已隨 adapter 退役失效；lazy 化預期釋回 main gzip 約 4–5 KB
  （SessionDetailSheet 835 行，體量與 CreateSessionSheet 相當）。
- 你不 commit、不 push；working tree 交驗收方。

## 解凍清單（Q3 守則：未列即凍結）

- `src/main.js`：`:85-88` eager import 註解與
  `import { mountSessionDetailSheetContent } from "./sheets/SessionDetailSheet.tsx";`
  一行；`:163` `configureSessionViewModules({ appModule, mountSessionDetailSheetContent })`
  的 bag（縮為 `{ appModule }`）。
- `src/sessionViews.js`：`:239` `let mountSessionDetailSheetContent;` 與 `:244` 的
  configure 綁定（退役，改由 preloader 賦值）；`lazySurfaceLoaders`（`:267-281`，
  ＋1 筆 `"./sheets/SessionDetailSheet.tsx"`，維持 `"path": () => import("path")`
  字面樣板——C 群掃描綁此形狀）；新增 `preloadSessionDetailSheet`（走既有
  `createMountPreloader` 樣板）；`authenticatedViewPreloads`／`namedViewPreloads`／
  `preloadForIntent` 視設計需要各加一筆（見作法 C）；`:387-388`
  `get sessionDetail()` getter 本體不需改（回報中自證仍正確）。
- `src/views/sessionSurfaceViews.js`：`openSessionSheet` 的
  `:237` `if (!lazyMounts.sessionDetail) throw …` 一行——改為 `deferSurfaceOpen`
  分支（見作法 B）；函式其餘本體（含 `onEscape` closure、四態註解、`initialStage`）
  不動。
- `tests/fixtures/surfaceManifest.js`：`eagerModules` 移除
  `"src/sheets/SessionDetailSheet.tsx"`（2→1）；`lazySheets` 加入同路徑（13→14）。
  其餘欄位不動。
- `tests/react-surface-lifecycle.test.js`：`:129-131` eager 掃描 regex 的
  `(?:app\/App|sheets\/SessionDetailSheet)` 交替字面同步（移除 SessionDetail 分支）。
  其餘全部不動。
- 測試面：新增本批 race oracle（見作法 D）；smoke 既有斷言若因 loading 中繼態需要
  等待語意調整，逐條列出並說明（用會重試的斷言，不加 sleep）。

**仍凍結（一票否決）**：`src/sheets/SessionDetailSheet.tsx` 本體（**目標零 diff**，
lazy 化只動 import 面）；`registerDetailContent` 與 A 群其餘；E 群／F 群／B 群全部
（F 群 `:165-181` 以 `readFileSync` 直讀該檔，不受 import 面影響——回報自證仍過）;
`deferSurfaceOpen` 機制本體（`sessionViews.js:482-536`：`live`／`replacing`／
`pendingCalls` 語意是現成的，**不可為本批改機制**）;`sheets.js`（批 4C）;
`mountSheet` 語意;`session-sheet` id、`data-join-stage` 四態、全部 testid／文案;
深連結 `#/session/:id` 行為（開啟後最終呈現不變，允許 lazy 載入中繼態）;
剩餘 `syncCommit` caller（批 5）;MySessions／Messages／Nearby／Me。

## Ground truth（2026-08-26 開單時實測；動手前自行重驗）

- 現行同步鏈：`main.js:88` eager import → `:163` 入 configure bag →
  `sessionViews.js:244` 綁定 → `:387-388` getter → `sessionSurfaceViews.js` 的
  `lazyMounts.sessionDetail`；`:237` 在 mount 缺席時 throw（production 因 eager
  永不觸發）。
- `deferSurfaceOpen`（`sessionViews.js:482`）現成語意：loading 殼用
  `lazySurfaceHtml(label)`；`onClose` 有 `replacing` guard（replace 不觸發外部
  `onClose`——你的「onClose 不重複」oracle 靠它）；真關閉設 `live=false`，
  `load().then` 的 `if (!live) return` 擋 late-mount；`methods` 佇列在 `open()`
  完成後同一 microtask FIFO replay。13 個 lazy surface 全走
  「`if (!lazyMounts.X) return deferSurfaceOpen({ …, open: () => openX(同參) })`
  遞迴再入」樣板（例：`openSessionUnavailableSheet`，`sessionSurfaceViews.js:308-315`）。
- `openSessionSheet` 契約：`onEscape: () => content?.handleEscape() ?? false`
  必須在同一 keydown call stack 同步回傳（confirming 先退 idle、其餘關閉）；
  handle 對外露 `{ ...mounted, setJoinPreview, enterConfirming }`
  （`sessionSurfaceViews.js:304`）。
- 量化基準（批 4A 驗收後）：main 652,480／gzip 190,514（gate 658,867／192,420）；
  total 838,388／255,413（gate 849,961／259,062）；per-lazy gate 18,000／5,500，
  現最大 app lazy chunk＝MySessionsPage 16,476／4,830。SessionDetailSheet 835 行，
  新 chunk 預估 ≈16 K／≈5 K——**必須落在 per-lazy gate 內，超 gate＝BLOCKED**（若其
  獨占依賴使 chunk 超標，回報拆分選項，不得自行放寬 gate）。
- mock 基準 288 passed／4 skipped、unit 336；`__importAppModule`＝107。

## 作法要求

### A. import 面遷移

`lazySurfaceLoaders` ＋1、`createMountPreloader` 造 `preloadSessionDetailSheet`、
main.js eager import 與 configure bag 退役、`:85-86` 註解同步改寫（eager 清單只剩
`App.tsx`；`:87` 是保留的 App eager import 本體，不動）。

### B. `openSessionSheet` 的 defer 分支（本批核心）

`:237` throw 改為：

- `deferSurfaceOpen({ id: "session-sheet", label: "球局詳情",
  className: "session-detail-sheet", load: preloadSessionDetailSheet,
  open: () => openSessionSheet(session, 原 options 全數), methods:
  ["setJoinPreview", "enterConfirming"], onClose })`。
- **Escape 不進 methods 佇列**（4A 回報 §4.5 拍板理由：Escape 必須同步回傳
  boolean；loading 殼期間走 mount 預設關閉語意）。
- 遞迴 `open()` 必須帶齊原 options。注意兩個情境不可混淆：呼叫端一開始就傳
  `initialStage`＝直接進遞迴 `open()` 的原 options；loading 期間外部呼叫
  `enterConfirming`＝走 methods 佇列 FIFO replay。本單傾向兩者並存、各走各的
  管道（4A 回報 §4.5 第 3 點）；若你改採其他設計，說明理由。
- 簽名以解構接 options（無 rest 參數），遞迴 `open` 用解構後變數名重組 bag
  （default 已套用、語意等價），不得動凍結的函式簽名。

### C. 預熱設計

`deferSurfaceOpen` 是保底；另擇一實作並說明：(1) `preloadForIntent`（`:596-610`）
加 session card／pin 的 hover/focus 分支（自行查證卡片選擇器並引用行號；
lifecycle `:143` 的 `pointerover…focusin` 字面不受加分支影響）；(2) map idle 後
warm。**關鍵**：「地圖→卡片→詳情」是匿名也走的公開路徑，
`preloadAuthenticatedViewsForAuth`（`:592-594`）被 `if (authSession)` gate 住——
只掛 `authenticatedViewPreloads` 蓋不到匿名者，你的設計必須明說匿名態如何預熱。
目標：常見路徑幾乎不見 loading 殼；不得為此把 chunk 塞回 main。

### D. Race oracle（新增必交付，至少一條 canary 三拍咬新接線）

1. pending load 時 Escape 關閉→load resolve 後不得 late-mount（斷言殼已空且無
   `data-join-stage` 節點）。
2. load 前呼叫 `setJoinPreview`／`enterConfirming`→替換後恰 replay 一次
   （斷言最終 stage 與 preview 內容正確）。
3. loading 殼被替換時外部 `onClose` 不得觸發；真關閉恰一次。
4. loaded 後 confirming Escape 兩段語意（既有 spec 若已覆蓋，引用檔案:行號並
   自證仍綠，不重複新增）。

canary：破壞 defer 分支的一行新接線（如 methods 佇列名單或 `open` 遞迴參數）→
上述至少一條 oracle 紅→byte-identical 還原→綠;逐字抄錄。

### E. 深連結與 smoke 自證

`#/session/:id` 冷載入路徑實跑一條既有 spec 並引用（loading 中繼態允許，最終
呈現與焦點語意不變）。

## 不在範圍

- SessionDetailSheet.tsx 本體任何修改;殼機制（4C）;`deferSurfaceOpen` 機制本體;
  其他 sheet;UX／文案／CSS;新依賴。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

typecheck／lint／prettier:check／build／check:production-bundle（main／total／新
SessionDetailSheet chunk 三組對照＋淨值;「largest app lazy」行逐字抄錄;超 gate＝
BLOCKED）／test:mock（≥288＋新 oracle;已立案 flake 撞到重跑註明）／test:local
（production import 面變更，不豁免;污染紅依標準 guarded reset 三拍）／
`git diff --check`。

## 回報合約

寫 `docs/arch-dispatch-2026-08-26-batch4B-detail-lazy-report-codex.md`（不 commit、
不 push），必含：import 面遷移對照、defer 分支設計（含 initialStage vs replay 的
選擇說明）、預熱設計與理由、race oracle 清單＋canary 三拍逐字、SessionDetailSheet.tsx
零 diff 自證（`git diff --stat` 該檔不出現）、bundle 三組淨值＋新 chunk 尺寸、
`__importAppModule` 對帳、凍結面自證（F 群仍過、`registerDetailContent` 零 diff）、
收尾矩陣逐字輸出、Codex 五問（第 5 問答「對批 4C 殼 React 化的建議——特別是
mountSurface 五責任的遷移順序與每類 canary」）、未做／疑義／BLOCKED。
