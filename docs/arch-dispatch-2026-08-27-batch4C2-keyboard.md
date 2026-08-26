# 批 4C-2 派工單：surface stack＋topmost Escape＋Tab trap 遷入 React surface system

- 日期：2026-08-27。母文件：`docs/arch-roadmap-2026-08-26-react-ownership.md`（4C
  三段之二）；前置：4C-1 ACCEPTED（`05635c9`，驗收紀錄
  `docs/arch-reports/batch-4C1-shell-acceptance-2026-08-27.md`——其「4C-2 加固項」
  三條是本批附帶必交付）。遷移順序採 4C-1 回報 §10.5 的原子順序。
- 開工基準：`05635c9` 之後的最新 main HEAD（working tree 應乾淨，否則停手回報）。
- **bundle 硬約束**：total gzip 現餘僅 **1,703 B**（全庫最緊 gate）。本批是碼量
  搬移（sheets.js→SurfaceHost.tsx，同在 main chunk），預期近中性；超 gate＝
  BLOCKED（不得放寬 gate；若逼近，回報並提出回收選項）。
- 你不 commit、不 push；working tree 交驗收方。

## 本批範圍與明確不搬的部分

**搬**（單一 keydown 責任面，一批處理避免兩批動同一 listener）：`surfaceStack`
資料結構與 push／splice、topmost 判定、document capture `keydown` listener 的
**單一 owner 化**（現況每 surface 各掛一個、以 topmost 檢查護持；改為 React
surface system 持有一個 listener 讀 top entry，首個 entry 安裝、末個移除，
安裝／移除保持同步 mount／close 契約）、Escape 分支、Tab trap 分支
（`focusableNodes` 的 hidden 過濾＋首尾循環＋零 focusable fallback）。

**不搬（4C-3）**：`captureRestoreTarget`／`resolveRestoreTarget` 三段 fallback
（批 C2-2 修法）、首幀 rAF 聚焦（`sheets.js:142-149`——注意它與 trap 共用
`focusableNodes`，helper 落點自行設計但 rAF 行為零變更）。

**附帶必交付（4C-1 驗收加固項）**：

1. close 路徑的 `shell.unmount()` 以 try/finally 加固——拋錯時 `surfaces.delete`
   ／`onClose`／restore 仍執行、錯誤與 unmountError 同規則重拋不吞。
2. `closeSurface` else 分支加註解：說明「root 有 React 殼但 surfaces 無 entry」
   已論證不可達，`innerHTML=""` 僅為無殼殘留的防禦清理。
3. `.claude/rules/react-migration.md`「Sheet 批固定模式」補一條：殼 section 是
   React leaf——非空 legacy `html` 走 `dangerouslySetInnerHTML` 且 React content
   只准 portal 進 descendant；直接以 section 為 portal target 的路徑必須
   `html: ""`（React 19 children 衝突為 dev-only `console.error`，但
   zero-console-error oracle 會判紅）。標註日期。

## 解凍清單（Q3 守則：未列即凍結）

- `src/sheets.js`（4C-1 後行號）：`:8` `surfaceStack`、`:15-19` `focusableNodes`
  （允許搬至新落點，`FOCUSABLE_SELECTOR` 模組不動）、close 內 `:80-82`
  （listener 移除＋stack splice——併入 stack 系統呼叫）、`:98-130` `onKeyDown`
  全部（含 `:99` topmost、Escape 註解兩段、Tab 分支）、`:132-133` entry 建立與
  push、`:136` listener 安裝;close 的 `shell.unmount()` 段（加固項 1）;
  `closeSurface` else 註解（加固項 2）。
- `src/app/SurfaceHost.tsx`：新增 stack／單一 listener 機制（entry shape 需含
  `close`／`onEscape`／`surface`／`restoreFocus`——最後者 4C-3 用,本批只承載）。
- `tests/sheets-dom.test.js`：harness 增測;**oracle 覆蓋盤點**——五語意
  （topmost Escape、`onEscape` 短路、Tab 首尾、hidden 排除、零 focusable
  fallback）逐一對照既有 oracle,缺的補（開單時實測:hidden 排除與零 focusable
  fallback 無專屬 oracle,首尾循環已有 `:123-133`）;新增「全關後 Escape 不再被
  surface consume」與「replace 不殘留 listener」平衡 oracle。
- `.claude/rules/react-migration.md`（加固項 3）。

**仍凍結（一票否決）**：**Escape 處理序字面語意**——topmost 檢查→
`event.preventDefault()`→`event.stopPropagation()`→同步 `if (onEscape?.()) return;`
→`close()`,兩段既有註解（opener 首幀焦點理由、批 C3-2 逃生口）隨碼搬遷不刪;
Tab trap 語意（`FOCUSABLE_SELECTOR`＋`!hasAttribute("hidden")`＋
`!closest("[hidden]")` 過濾、Shift+Tab 首→尾、Tab 尾→首、零 focusable 時
`preventDefault`＋`surface.focus()`）;stack 移除必須仍在 `releaseIsolation`／
content unmount **之前**（關閉中的 surface 不可再接 keydown）;`:137-138`
dismiss／close click 綁定;rAF 首幀聚焦;restore 鏈;`surfaces` WeakMap 對
`closeSurface` 的語意;E 群（4C-1 改寫版）／A 群／B 群／C 群／D 群（AppShell
popover Escape 斷言是 AppShell 自己的,與殼 stack 無關,不動）／F 群;
`mountSurfaceContent` 契約;`modalIsolation.js`;4 個 views;14 sheet;七份指定
e2e spec（`react-unmount`、`performance:199`、`session-lifecycle:177/:341/:384`、
`chat-settings:468/:505/:655`、`auth-forms`、`account-settings:619/:693`、
`discovery-interactions:313`）原檔零 diff;bundle gate。

## Ground truth（2026-08-27 開單時實測；動手前自行重驗）

- 現況每 surface 一個 document capture listener（`:136` 安裝、close `:80` 移除），
  topmost 以 `surfaceStack.at(-1) !== surfaceEntry` 早退（`:99`）。多 listener
  併存時 `stopPropagation` 不阻同節點同 phase 的其他 listener（僅 topmost 檢查
  護持）——單一 owner 化後外部可觀察語意等價：`stopPropagation` 阻擋的是傳播
  路徑的後續步驟（target 與 document bubble 段——drawer 的 handler 屬此，
  `NearbySessionsDrawer.tsx:226` 無 capture flag）；同節點同 phase 的 capture
  listener（AppShell popover，`App.tsx:251`）新舊實作都不受它影響，等價。
- drawer 的 Escape guard（`NearbySessionsDrawer.tsx:222`）同時檢查
  「有開啟 surface」與 `event.defaultPrevented`——所以**單獨移除
  `stopPropagation` 不會讓 `session-lifecycle:341` 變紅**（`preventDefault`
  仍在），穿透語意的 e2e 只咬「整段 consume 消失」。canary 設計據此拆兩層
  （見 canary (b)／(b')）。
- stack 最多兩層（sheet-root＋modal-root 各一;同 root replace 先關舊）。
- entry 現 shape `{ close, restoreFocus }`（`:132`）;onEscape 與 surface 現由
  per-surface closure 捕捉——單一 listener 需把兩者入 entry。
- 穿透語意的載重 e2e：`session-lifecycle-smoke.spec.js:341`（top sheet 先 consume）
  ／`:384`（popover 先於 drawer）;confirming 兩段 Escape：`react-unmount.spec.js`
  4B oracle＋`session.spec.js:218-261`（local）。
- 量化基準（4C-1 後）：main gzip 187,214（餘 5,206 B）;total 257,359
  （**餘 1,703 B**）;unit 338;mock 298 passed／4 skipped;
  `__importAppModule`（window 口徑）110;`sheets.js` SHA-256 起點
  `ca3faa95…`（4C-1 驗收）。

## 作法要求（依 4C-1 回報 §10.5 原子順序）

1. **先搬 stack**：push／splice／top lookup 入 React surface system（與
   `shellRegistry` 同模組）;imperative listener 暫留原位讀新 stack——此中間態
   跑一次 sheets-dom 全綠作 parity 錨點（回報記錄）。**接線約束**：`sheets.js`
   不可靜態 import TSX（4C-1 回報 §1.2 確立的 Node 直載路徑），stack 存取沿
   `configureSurfaceShellRenderer` 的 bridge 注入模式（或等價 configure 注入）。
2. **再單一 listener owner**：一個 document capture keydown listener 入
   SurfaceHost module;首 entry 安裝、末 entry 移除（同步）;Escape 字面序與
   註解逐字搬遷。
3. **最後 Tab trap**：讀 top entry 的 committed `surface`＋既有
   `FOCUSABLE_SELECTOR`;hidden 過濾、首尾循環、零 focusable fallback 逐字保留。
4. 加固項 1–3。

## Oracle 與 canary（三拍必附、逐字輸出）

1. sheets-dom 既有五 oracle 全綠（斷言語意零弱化自證）;補 hidden 排除＋
   零 focusable fallback 兩條新 oracle;補對稱探針對：「surface 開啟時
   document bubble 探針 listener **收不到** Escape」（咬 `stopPropagation`）
   與「全關後探針收到未被 defaultPrevented 的 Escape」（咬 listener 平衡）;
   補「replace 後無殘留 listener」。
2. Canary ×4：(a) 破壞 topmost 判定一行（如 `at(-1)` 改 `[0]`）→sheets-dom
   「Escape 只關最上層」紅→還原綠;(b) **同時**移除 `preventDefault`＋
   `stopPropagation`（整段 consume 消失）→`session-lifecycle-smoke.spec.js:341`
   穿透 e2e 紅→還原綠（drawer guard 檢查 `event.defaultPrevented`，單獨移除
   `stopPropagation` 打不紅——見 ground truth）;(b') 單獨移除 `stopPropagation`
   →新 bubble 探針 oracle 紅→還原綠;(c) 破壞 trap 邊界（首尾對調）→
   sheets-dom trap 紅→還原綠。
3. 全 e2e matrix＋local（confirming 兩段 Escape 在 `session.spec.js` 實跑）。

## 不在範圍

- restore focus／rAF 遷移（4C-3）;`SurfaceHost.commitSynchronously` 退役（批 5）;
  14 sheet content、views、UX／文案／CSS、新依賴、bundle gate 調整。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

typecheck／lint／prettier:check／build／check:production-bundle（main／total 對照
＋淨值,total 餘裕逐字抄錄,超 gate＝BLOCKED）／test:mock（≥298＋新 oracle;已立案
flake 撞到重跑註明）／test:local（不豁免;污染紅依 guarded reset 三拍）／
`git diff --check`。

## 回報合約

寫 `docs/arch-dispatch-2026-08-27-batch4C2-keyboard-report-codex.md`（不 commit、
不 push），必含：三步原子遷移各自的 parity 錨點紀錄、entry shape 與 listener
安裝／移除時序設計、Escape 字面序搬遷自證（註解含）、oracle 覆蓋盤點表（五語意
×既有／新增）、canary ×4 三拍逐字、加固項 1–3 交付證據、bundle 淨值（total 餘裕
逐字）、`__importAppModule` 對帳、凍結面自證（rAF／restore 鏈零 diff、七 e2e
spec 零 diff、D 群不動）、收尾矩陣逐字輸出、Codex 五問（第 5 問答「對 4C-3
restore focus 遷移的建議——特別是 C2-2 修法的保真與 previousFocus 在 entry 中的
承載」）、未做／疑義／BLOCKED。
