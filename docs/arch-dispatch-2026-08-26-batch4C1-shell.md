# 批 4C-1 派工單：React 殼骨架＋close／replacement／unmount 時序＋isolation

- 日期：2026-08-26。母文件：`docs/arch-roadmap-2026-08-26-react-ownership.md`。
  批 4C 切三段（一次一責任，全 14 surface 共用碼徑同步移轉；不採雙殼並存——殼是
  單一 `mountSurface` 函式＋單一 stack，雙殼會製造暫態雙 keydown／雙 isolation
  協調問題）：**4C-1**＝殼 DOM 進 React＋生命週期時序＋isolation；4C-2＝stack／
  topmost Escape＋focus trap；4C-3＝restore focus＋收尾。遷移順序採批 4B 回報
  §9.5（close/unmount 時序是其餘責任的地基）。
- 授權依據：`.claude/rules/react-migration.md`「React ownership 分批解凍」第 4 條
  （批 4 解凍 `mountSheet` 專有 surface 殼）。同檔「Sheet 批固定模式」第 2 條是
  批 4 前的舊條文，本批**同步修正其措辭**（見作法 E）。
- 前置：批 4B ACCEPTED（`aaab2c5`）。開工基準：`aaab2c5` 之後的最新 main HEAD
  （working tree 應乾淨，否則停手回報）。
- 你不 commit、不 push；working tree 交驗收方。

## 本批範圍與明確不搬的部分

**搬**：殼 DOM 產生（backdrop＋`section.surface` 全屬性＋`html` 模板）改由 React
（`SurfaceHost` 系統）渲染；close／replacement／unmount 時序；`pushSurfaceIsolation`
的 acquire／release；`closeSheet`／`closeModal` 死 export 刪除（全庫零 caller，
批 4 盤點已證）。

**不搬（4C-1 內僅換 DOM 來源、逐字保留語意，4C-2／4C-3 才遷）**：`onKeyDown`
capture listener 全部（stack topmost 判定、Escape `preventDefault`＋
`stopPropagation`＋`onEscape?.()` 短路、Tab trap 首尾循環＋零 focusable fallback）；
`captureRestoreTarget`／`resolveRestoreTarget` 三段 fallback（含批 C2-2 修法註解）；
首幀 rAF 聚焦（`:144-151`）。這些程式碼在 4C-1 繼續以 imperative 形式操作
React 已 commit 的 DOM，行為零變更。

## 解凍清單（Q3 守則：未列即凍結）

- `src/sheets.js`：`mountSurface`（`:52-153`）的 DOM 產生（`:58-64` innerHTML 模板）、
  `close`（`:79-98`）、replace（`:56-57`）、isolation（`:67`、`:85`）、
  `closeSurface`（`:155-162`）、`registerUnmount`（`:71-78`）、
  `[data-surface-dismiss]`／`[data-surface-close]` 綁定（`:139-140`）、
  `onMount` 呼叫（`:143`）、`mountSheet`／`mountDialog`／`openLoginModal` 內部實作
  （公開簽名與回傳 shape 凍結）；`closeSheet`（`:174-176`）／`closeModal`
  （`:178-180`）刪除。
- `src/app/SurfaceHost.tsx`：允許新增殼渲染機制（registry 條目＋殼元件），但
  `:43` 分界註解需同步改寫、`commitSynchronously(update)` 與
  `commitSynchronously(commitSurfaceSlots)` 兩字面**必須保留**（A 群 `:80-81`
  凍結斷言）、`mountSurfaceContent` 對 14 adapter 的契約（`render`／`unmount`／
  `commit`／`isSurfaceRootLive`）零變更、`:89` 依賴的 `.surface` class 與 `id`
  屬性繼續成立。
- `tests/react-surface-lifecycle.test.js` **E 群整個 test**（`:156-163`）：改寫為
  對新實作等價的「unmount 先於 DOM 清除」「closed 冪等」「回傳 shape」封條；若
  主張 sheets-dom＋react-unmount 行為 oracle 已完整覆蓋而退役某條，附論證。
  其餘各群（含 A 群 `:53-92`、B 群、C 群、D 群、F 群）**不動**——A 群兩個
  `commitSynchronously` 字面是設計約束不是可改項。
- `tests/sheets-dom.test.js`：harness 改寫（現為純 happy-dom 直載 `sheets.js`、無
  React——殼 React 化後必須補 React 渲染路徑，**比照 `player-card-sheet-dom` 的
  happy-dom＋`react-dom/client` createRoot 模式**；不可用 `me-page-dom` 的
  `renderToStaticMarkup` 路線——它無 live DOM，承載不了 Escape／Tab／focus
  行為斷言）；**五條行為 oracle 的斷言語意零弱化**（卸載序、拋錯清殼、
  Escape 最上層、Tab trap、還原三段 fallback）。
- 新增 isolation 平衡 oracle（見作法 D）。
- `.claude/rules/react-migration.md`「Sheet 批固定模式」第 2 條措辭修正（作法 E）。

**仍凍結（一票否決）**：`mountSheet`／`mountDialog` 公開簽名、options（`id`／
`label`／`className`／`html`／`onClose`／`onMount`／`onEscape`）與回傳
`{ root, surface, close, registerUnmount }` shape；`openLoginModal` 公開簽名
（`{ action, onProvider, onClose, lineProviderId }`，**無回傳值**）——其特殊性：
自組殼＋content（`mountDialog` 空 `html` → `mountLoginModalContent(mounted.surface,
…)` 把 React content 直接 portal 進殼的 section 節點 → `registerUnmount`），殼
React 化後這是「React content portal 進 React 殼（`dangerouslySetInnerHTML`
section）」的新互動點，殼元件 props per-mount 不可變是前提，回報中自證此路徑
（auth-forms-smoke 覆蓋）；殼 DOM 的最終序列化結果
（backdrop div＋section 的 id／testid／class／role／aria-modal／aria-label／
tabindex 與 `html` 內容——**byte-identical parity 是驗收條件**）;
`deferSurfaceOpen`；`modalIsolation.js` 本體;4 個 `src/views/*.js` 與 14 個
sheet 元件;`onKeyDown`／restore／rAF 聚焦語意（見「不搬」節）;B 群 `syncCommit`
白名單（殼同步 commit 只准走 `SurfaceHost` 既有 `commitSynchronously`，不得新增
caller）;全部 e2e spec（`react-unmount`、`performance:199`、
`session-lifecycle:177/:341/:384`、`chat-settings:468/:505/:655`、
`auth-forms`、`account-settings:619/:693`、`discovery-interactions:313`——這些是
本批的行為驗收網，原檔零 diff）;bundle gate。

## Ground truth（2026-08-26 開單時實測；動手前自行重驗）

- 殼同步契約：`mountSurface` 回傳時 DOM 已存在——4 個 views 在 `mountSheet` 返回後
  立即 `mounted.root.querySelector(...)`（例 `sessionSurfaceViews.js` 詳情的
  `.session-detail`）。React 殼必須經 `SurfaceHost` 的 `commitSynchronously` 同步
  commit 後才返回，回傳的 `root`／`surface` 是 live DOM。
- close 時序（E 群現封條）：`closed` 冪等 → 移除 keydown → 出 stack →
  `releaseIsolation()` → `unmountContent?.()`（catch 暫存）→
  `root.innerHTML = ""` → `surfaces.delete` → `onClose({reason})` → restore →
  rethrow unmountError。新實作等價時序必須保留：**unmount 先於殼 DOM 銷毀、
  onClose 在銷毀後、unmountError 不吞**。
- `registerUnmount` 在已 closed 時立即執行 unmount（`:73-76`）。
- replace（`:56-57`）：同 root 再 mount 時繼承 `active.restoreFocus`、以
  `reason:"replace"`＋`restoreFocus:false` 關舊；isolation 舊 release 新 acquire。
- **`[data-surface-close]` 綁定範圍**：現況只綁 mount 當下模板節點
  （`:139-140` querySelectorAll 一次性）；React content 後掛的同名節點從未被殼
  綁過（content 自管關閉 callback）。若你改事件 delegation，觸發面會擴大到
  content 節點＝語意變更——**先全庫列舉 React content 內的 `data-surface-close`
  出現處證明等價，否則維持 mount-time 綁定範圍**。
- `pushSurfaceIsolation(root)`（`modalIsolation.js:61-70`）：isolate `#app` 除
  root／toast-root 外的 children，priority 2；回傳 release。
- `sheets-dom.test.js` harness：`:19` rAF 同步 shim、`:23` body innerHTML 三 root、
  `:34-38` 帶 query 參數重載模組（每 test 隔離 module state）——React 化後模組級
  registry 的隔離策略需說明（重載或提供 reset）。既有 React harness 範本：
  `player-card-sheet-dom.test.js`（happy-dom＋`react-dom/client`）。
- `esc()` 現用於殼屬性插值；React 屬性自帶跳脫，`html` 模板走
  `dangerouslySetInnerHTML` 時內部插值（如 `lazySurfaceHtml` 的 `esc(label)`）
  保持不變——CLAUDE.md 紅線：動態內容經 `esc()`。
- 量化基準（4B 驗收後）：main gzip 186,862（餘 5,558 B）；total 257,010
  （**餘僅 2,052 B**——殼搬 React 淨增碼量須盯 total gate，超 gate＝BLOCKED，
  回報淨值）；mock 298 passed／4 skipped、unit 336；`__importAppModule`
  （`window.` 口徑）＝110。

## 作法要求

### A. React 殼渲染

`mountSheet`／`mountDialog` 改為：寫入 surface-shell registry 條目 →
`SurfaceHost` 渲染殼元件（backdrop＋section 全屬性＋`html` 經
`dangerouslySetInnerHTML`）portal 進 `#sheet-root`／`#modal-root` → 經既有
`commitSynchronously` 同步 commit → 回傳讀 live DOM 的 handle。殼元件 props
per-mount 不可變（無更新路徑）。

### B. 生命週期時序遷移

close／replace／unmount 依 ground truth 等價時序在新機制中重建；`onMount`／
首幀 rAF 聚焦呼叫點保留。

### C. DOM parity 證明（必交付）

同一組 options 下，舊殼（基準 commit 的 `mountSurface`）與新殼序列化 DOM
byte-identical（含屬性順序處理方式說明）；以 parity 測試或一次性比對腳本執行，
逐字輸出附回報。至少覆蓋：sheet＋dialog 各一、含 `className`／`onEscape`／
空 `html` 與帶互動節點 `html` 的組合。

### D. Oracle 與 canary（三拍必附、逐字輸出）

1. `sheets-dom` 五 oracle 於改寫後 harness 全綠（斷言語意零弱化自證）。
2. **新增 isolation 平衡 oracle**：開→關與開→replace→關兩路徑，`#app` 兄弟
   節點的 isolation 屬性恰好回復（acquire/release 平衡）。
3. Canary ×2：(a) 交換新實作的 unmount／DOM 銷毀順序→指名哪條 oracle 紅
   （預期 `sheets-dom` 卸載序或 `react-unmount` unmount-once）→還原綠；
   (b) 破壞 close 或 replace 路徑的 isolation release 一行→新 isolation oracle
   紅→還原綠。
4. 全 e2e matrix：`react-unmount`（含 4B 五條 race oracle）、上列凍結 spec 清單
   全綠、原檔零 diff。

### E. 條文與死碼

- `.claude/rules/react-migration.md`「Sheet 批固定模式」第 2 條改寫為：批 4 起殼
  依分批解凍第 4 條遷入 React surface system，React content 不得跨界改寫 sheet
  root 的原則保留；標註日期。
- `closeSheet`／`closeModal` 刪除＋反掃歸零。

## 不在範圍

- stack／Escape／Tab trap 遷 React（4C-2）;restore focus 遷 React（4C-3）;
  `SurfaceHost.commitSynchronously` 退役（批 5）;14 sheet 元件與 views;UX／文案／
  CSS;新依賴。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

typecheck／lint／prettier:check／build／check:production-bundle（main／total 對照
＋淨值,超 gate＝BLOCKED）／test:mock（≥298＋新 isolation oracle;已立案 flake 撞到
重跑註明）／test:local（production 變更不豁免;污染紅依 guarded reset 三拍）／
`git diff --check`。

## 回報合約

寫 `docs/arch-dispatch-2026-08-26-batch4C1-shell-report-codex.md`（不 commit、
不 push），必含：殼渲染設計（registry shape／同步 commit 路徑／`[data-surface-close]`
綁定範圍決策與列舉證據）、生命週期時序對照表（舊→新逐步）、DOM parity 逐字輸出、
canary ×2 三拍逐字、E 群改寫前後對照（或退役論證）、harness 隔離策略說明、
bundle 淨值（main／total）、`__importAppModule` 對帳（`window.` 口徑）、凍結面
自證（A 群兩字面／keydown-restore-rAF 零語意變更／e2e spec 零 diff）、收尾矩陣
逐字輸出、Codex 五問（第 5 問答「對 4C-2 stack／Escape／trap 遷移的建議」）、
未做／疑義／BLOCKED。
