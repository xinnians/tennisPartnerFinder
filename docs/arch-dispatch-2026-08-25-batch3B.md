# 批 3B 派工單：F3-2 殼遷入 AppShell＋glob 橋接退役

- 日期：2026-08-25
- 路線圖：`docs/arch-roadmap-2026-08-25.md` 階段 3；母派工單 F3-2 條目
- 開工基準：以當前 origin HEAD 為準（`bb27d60` 之後）
- 依據 F3-0 解凍（`.claude/rules/react-migration.md` 批 3 節）：surface stack
  與本批接管區 DOM 凍結已解除；**testid、既有 e2e 斷言、文案、同步 commit
  邊界、dataApi 仍一票否決**。

## 開工前必讀（讀磁碟上的現行版本）

1. `.claude/rules/react-migration.md` 批 3 解凍節（本批授權範圍）
2. `tests/fixtures/surfaceManifest.js`（F0-7 落地的集合契約——本批改集合
   只改這份 manifest 並逐項說明變因）
3. `tests/react-surface-lifecycle.test.js`（eager／lazy 掃描以
   `sessionViews.js` 原始碼為基準——glob 退役會**連掃描基準一起失效**，
   調整屬凍結測試修改，依總則須在回報**單獨列節**）
4. 母派工單 F3-2 驗收原文＋2026-08-22 拍板（openLoginModal 翻案：
   殼機制不動、只換內容）

## Ground truth（2026-08-25 實測）

- **接管區**（index.html）：topbar（`player-directory-open`、`level-chip`、
  `instant-only-chip`、`filter-sheet-open`）、`level-popover`＋`band-options`、
  底部導覽（`map-tab`／`my-sessions-tab`／`create-session-tab`／…，
  `aria-controls`＋`aria-current`）、`toast-root`。
- **toast**：`main.js:219` `innerHTML` 模板＋timer。
- **popover Escape**：`filterToolbarFeature.js:109-112` 自營 bubble-phase
  listener（註解自載「popover 開著時 Escape 只該關 popover」）——即待刪的
  「第三套」；`sheets.js` capture listener 是第一套，不動。
- **login modal**：`sheets.js:193` `openLoginModal`（`main.js:108` import）。
- **glob 三橋**：`sessionViews.js:236`／`:246`／`:252`（App eager、
  SessionDetail eager、13 lazy sheets）；facade 的 `deferSurfaceOpen`、
  preload 語意（`pointerover`／`focusin` 暖身、`if (authSession)
  preloadAuthenticatedViews()`）建立其上。
- **凍結測試的掃描基準**：`react-surface-lifecycle.test.js:127-137` 以
  `SESSION_VIEWS` 原始碼 regex 抓 glob——退役後這些斷言的**機制對象消失**。
- flushSync 允許清單：恰三個核可 caller（`react-surface-lifecycle.test.js:92`），
  本批**不得新增第四個**；要新增必須回報單獨立節論證。

## 作法約束

1. **逐區遷移、每區至少一個 commit、每區完成即跑
   `npm run test:session-unit`**。建議切序：
   (a) toast → (b) topbar chips＋level popover（含刪第三套 Escape listener）
   → (c) 底部導覽（aria-current 同步入 React）→ (d) login modal 內容 React 化
   （殼 `mountDialog` 機制不動）→ (e) glob 三橋退役＋preload 機制重構。
2. **testid／id／aria 值逐字保留**：接管區 DOM 結構可改（F3-0 解凍），但
   `data-testid`、元素 `id`（被 `aria-controls`／既有 e2e 引用）、aria 屬性
   語意、文案、CSS class 視覺全部不變；既有 e2e 斷言零修改是一票否決。
3. **Escape 分層**：popover 遷 React 後由元件內 handler 處理，維持
   「popover 開著時 Escape 只關 popover、不往下收合抽屜」的既有語意
   （現有註解載明）；`sheets.js` capture listener 分層不動。
4. **preload 語意保留**：glob 退役改用顯式 dynamic import map（或等價）後，
   `pointerover`／`focusin` 暖身、登入後 `preloadAuthenticatedViews`、
   `deferSurfaceOpen` 的延遲開啟／載入失敗文案行為不變。
5. **同步 commit 邊界不得擴張**：`grep -rn "flushSync" src/` 仍只有
   `src/syncCommit.ts`；核可 caller 維持恰三個。
6. **manifest 變更逐項說明**：login modal React 化若新增 adapter／lazy 項、
   glob 退役改變 eager／lazy 掃描——只改 `surfaceManifest.js` 與對應掃描
   實作，每項附變因。
7. **凍結測試調整單獨列節**：`react-surface-lifecycle` 的 glob regex 掃描
   改為新機制的等價掃描（掃描集非空自證照舊）；不得刪弱斷言語意
   （eager 集合、lazy 邊界、暖身行為都要有新基準的等價守門）。
8. main.js 的 toast()／openLoginModal 呼叫端簽名不變（薄委派可留）。

## 驗收條件

1. **glob 退役**：`grep -rn "import.meta.glob" src/` 歸零（附輸出）；
   `sessionViews.js` 行數前後對照。
2. **第三套 Escape listener 刪除**：`filterToolbarFeature.js` 自營 keydown
   反向 grep；popover Escape 行為既有 e2e／新增測試綠。
3. **a11y 契約逐條對照**（回報列表）：`aria-current` 隨分頁切換、
   toast 的 live region 語意、`level-popover` 的 `aria-expanded`／
   `aria-controls`、Escape 分層——各指向對應測試。
4. **flushSync**：grep 仍僅 `syncCommit.ts`；allowlist 測試零修改綠。
5. 既有 e2e 斷言**零修改全綠**（含批 3A 新增的 8 條導覽測試）；
   `data-testid` 集合對 `0be31a2` 僅允許 manifest 對應的已說明變更
  （預期零變更——接管區 testid 全保留）。
6. 兩張 GOLDEN 逐字不變。
7. **canary**：至少兩支——(a) 凍結測試新掃描的載重證明（在新機制上造一個
   繞過 → 紅）；(b) Escape 分層（讓 popover Escape 冒泡 → 抽屜收合測試紅
   或等價證明）。紅→還原→綠附輸出。
8. **收尾標準矩陣**：`npm run test:ci:frontend`、`npm run test:db`、
   `npm run test:local`（did not run＝0）、`git diff --check`。
   Playwright 不並發；DB 重置只可用 guarded 指令。

## 不在範圍（不要順手做）

1. 頁面內容、sheet 內容、controller、dataApi、`syncCommit.ts` 本體。
2. `sheets.js` 的 focus trap／surface stack 本體——解凍允許遷入但**本批
   只遷 login modal 內容**；整套 stack 遷移若你評估可行，先提建議與影響面，
   不要靜默實作。
3. F4-3 bundle 拆分（階段 5）；不順手調 chunk 策略——glob 退役造成的
   chunk 變化如實回報 bundle gate 數字即可，gate 基線調整需說明。
4. CSS 視覺改版；`index.html` 中非接管區的任何節點。

## 回報要求

寫成 `docs/arch-dispatch-2026-08-25-batch3B-report-codex.md`，不列入實作
commit、不 push。逐區列出：搬了什麼、DOM 前後差異摘要、manifest 變因、
凍結測試調整單獨列節、a11y 對照表、canary 紅→還原→綠、
「已刪除／歸零」附反向 grep、未做明說。
