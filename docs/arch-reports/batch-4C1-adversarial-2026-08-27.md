# 批 4C-1 對立審查報告（2026-08-27）

- 審查對象：working tree 未 commit 的批 4C-1 實作（基準 commit `7a3f4d3`）與
  `docs/arch-dispatch-2026-08-26-batch4C1-shell-report-codex.md`。
- 派工單：`docs/arch-dispatch-2026-08-26-batch4C1-shell.md`。
- 紀律：開始前已存底 `git diff 7a3f4d3 -- src tests .claude`（19,256 bytes）；
  每次 canary 後以 SHA-256 驗證 byte-identical 還原；結束時 `cmp` 存底輸出
  `CMP_BYTE_IDENTICAL`（見 §9）。未 commit、未 push。
- 總判定：**九項全 PASS，無退件項**。被修正的聲稱一件（React 19「runtime error」
  實為 dev-only console.error 警告，見 §3 與總評）；邊角 6(b) 建議立一條 4C-2
  加固項（非退件）。

## 1. Canary 三拍複跑 ×2 — PASS

`src/sheets.js` 兩次 canary 前後 SHA-256 均為
`ca3faa956360df39c92cf37ca3fc651432af09a2b41a5ee6be6d67f7c64e256c`（與 Codex
回報 §6 的雜湊一致）。改動用 Edit 工具，非 patch 檔。

### 1a. `shell.unmount();` 移到 `unmountContent?.()` 之前

紅（逐字，`node --test tests/sheets-dom.test.js`）：

```text
    # Subtest: 關閉 sheet 時先卸載內容再清空殼
    not ok 1 - 關閉 sheet 時先卸載內容再清空殼
      failureType: 'testCodeFailure'
      error: |-
        Expected values to be strictly equal:
# tests 8
# pass 6
# fail 2
EXIT_CODE_VIA_PIPESTATUS=1
```

（fail 2 = 卸載序 subtest ＋其父 test「sheets DOM 殼契約」，與 Codex §6.1 的
`# pass 6／# fail 2` 一致。）還原後：

```text
ca3faa956360df39c92cf37ca3fc651432af09a2b41a5ee6be6d67f7c64e256c  src/sheets.js
# tests 8
# pass 8
# fail 0
EXIT_CODE_VIA_PIPESTATUS=0
```

### 1b. 移除 close 路徑 `releaseIsolation();` 一行

紅（`node --test --test-name-pattern='surface isolation' tests/sheets-dom.test.js`）：

```text
not ok 1 - surface isolation 在關閉與替換後 acquire/release 平衡
    Expected values to be strictly deep-equal:
          'page-content',
    +     ''
    -     null
# tests 1
# pass 0
# fail 1
EXIT_CODE_VIA_PIPESTATUS=1
```

（`''` = inert 屬性殘留，`null` = 應回復；與 Codex §6.2 的差異形狀一致。）
還原後雜湊相同、`ok 1 - surface isolation …`、`# pass 1／fail 0`、exit 0。

## 2. DOM parity 測試載重性 — PASS（含基線真實性與 parity canary）

- 期望值是**硬編字面基線**（`tests/sheets-dom.test.js:196`、`:210` 的完整
  innerHTML 字串），不是 render 新殼兩次自比對。非空斷言。
- **基線真實性以實跑證明**：把 `git show 7a3f4d3:src/sheets.js`（真正的舊實作，
  含 `esc()` 模板）落成臨時 probe 模組，在 happy-dom 以 parity 測試同一組
  options 實際 mount，輸出逐字：

```text
BASELINE_SHEET="\n    <div class=\"surface-backdrop\" data-surface-dismiss=\"\"></div>\n    <section id=\"sheet<&amp;&quot;\" data-testid=\"sheet<&amp;&quot;\" class=\"surface surface--sheet extra\" role=\"dialog\" aria-modal=\"true\" aria-label=\"標籤<&amp;&quot;\" tabindex=\"-1\">\n      <button type=\"button\" data-surface-close=\"\">關閉 &amp; 繼續</button>\n    </section>"
BASELINE_DIALOG="\n    <div class=\"surface-backdrop\" data-surface-dismiss=\"\"></div>\n    <section id=\"empty-dialog\" data-testid=\"empty-dialog\" class=\"surface surface--dialog auth-dialog\" role=\"dialog\" aria-modal=\"true\" aria-label=\"空白對話框\" tabindex=\"-1\">\n      \n    </section>"
SHEET_MATCHES_TEST_LITERAL=true
DIALOG_MATCHES_TEST_LITERAL=true
```

  即測試裡的硬編期望＝舊實作真實輸出（含屬性順序
  `id→data-testid→class→role→aria-modal→aria-label→tabindex`、backdrop
  `data-surface-dismiss=""` 序列化、空模板的 `\n      \n    ` 空白節點）。
- **Parity canary**：把 `SurfaceHost.tsx` 殼元件的 `aria-modal="true"` 改為
  `"false"` → `not ok 6 - React shell 與舊版 sheet、dialog 序列化 DOM
  byte-identical`（tests 8／pass 6／fail 2、exit 1）→ 還原後 pass 8、exit 0，
  檔案 SHA-256 `ce59ce1f…`。parity 測試對殼字面變動載重。

## 3. Portal-target 15 條路徑枚舉 — PASS（Codex 聲稱成立；用語需修正）

逐條（loaded mount 的 `html` 值 → React content portal target）：

| # | 路徑 | html | portal target |
| --- | --- | --- | --- |
| 1 | `src/views/profileSurfaceView.js:131` profile-completion-sheet | `""`（:136） | `mounted.surface`＝section（:139） |
| 2 | `src/views/discoverySurfaceViews.js:45` court-session-sheet | `""`（:48） | section（:50） |
| 3 | `src/views/discoverySurfaceViews.js:72` court-players-sheet | `""`（:76） | section（:78） |
| 4 | `src/views/discoverySurfaceViews.js:106` player-directory-sheet | `""`（:111） | section（:113） |
| 5 | `src/views/discoverySurfaceViews.js:151` filters-sheet | `""`（:156） | section（:158） |
| 6 | `src/views/discoverySurfaceViews.js:204` player-card-sheet | `""`（:209） | section（:214） |
| 7 | `src/views/sessionFormViews.js:373` session-create-modal | `""`（:378） | section（:381） |
| 8 | `src/views/sessionFormViews.js:464` session-decision-sheet | `""`（:468） | section（:470） |
| 9 | `src/views/sessionFormViews.js:566` session-edit-sheet | `""`（:571） | section（:574） |
| 10 | `src/views/sessionSurfaceViews.js:68` session-chat-sheet | `""`（:73） | section（:75） |
| 11 | `src/views/sessionSurfaceViews.js:276` **session-sheet（詳情）** | **非空**（:286 grabber span＋`.session-detail` div） | `.session-detail` **descendant**（:291 `mounted.root.querySelector(".session-detail")`） |
| 12 | `src/views/sessionSurfaceViews.js:352` session-unavailable-sheet | `""`（:355） | section（:357） |
| 13 | `src/views/sessionSurfaceViews.js:374` withdraw-session-confirmation（dialog） | `""`（:378） | section（:383） |
| 14 | `src/views/sessionSurfaceViews.js:422` report-dialog | `""`（:426） | section（:430） |
| 15 | `src/sheets.js:180` openLoginModal | `""`（:186） | `mounted.surface`＝section（:189） |

- Codex 兩句聲稱均成立：「直接 portal 進 section 的都是 `html: ''`」（14 條）、
  「唯一非空 loaded template 是 SessionDetail 且 portal 進 `.session-detail`
  descendant」。零筆「非空 html＋portal 進 section」組合。
- 附帶：`deferSurfaceOpen`（`src/sessionViews.js:488`）的 loading 殼
  `html: lazySurfaceHtml(label)`（:499，非空、內含 `esc(label)`）**無任何 React
  content portal 進其 section**——只以 `querySelector("[data-lazy-surface-status]")`
  改文字（:538），載入完成後整面 replace。確認。
- **獨立反證（用語修正）**：以 React 19.2.8 純 probe 重演「dangerouslySetInnerHTML
  section 當 portal target」——**不會 throw**（`DANGEROUS_TARGET=NO_THROW`，
  portal 內容照常掛上），實際行為是 dev-only `console.error` 警告一次：

```text
REACT_VERSION=19.2.8
DANGEROUS_TARGET=NO_THROW
LEAF_TARGET=NO_THROW content="<span>content</span>"
CONFLICT_WARNINGS=1
CONFLICT: Cannot use a ref on a React element as a container to `createRoot` or `createPortal` if that element also sets "dangerouslySetInnerHTML" using React. It should be a leaf with no children. …
```

  出處：`node_modules/react-dom/cjs/react-dom-client.development.js:22195`
  `warnForReactChildrenConflict`（`console.error`，每 container 只警告一次；
  production build 不存在此檢查）。Codex §1.1 稱之「runtime error」**不精確**；
  但在本 repo 的 gate 語境下結論不變——mock e2e 的 zero-console-error oracle
  （`.claude/rules/testing.md`）會把這個警告判紅，空殼 leaf 例外設計仍是必要的。
  判定：設計正確、聲稱的機制描述需修正，不構成退件。

## 4. 凍結面 — PASS

- (a) `git diff 7a3f4d3 --stat`＝恰 5 檔（`.claude/rules/react-migration.md`、
  `src/app/SurfaceHost.tsx`、`src/sheets.js`、`tests/react-surface-lifecycle.test.js`、
  `tests/sheets-dom.test.js`）＋untracked 回報檔。
- (b) `git diff -U0 7a3f4d3 -- src/sheets.js` 全部 hunk 落點（舊檔行號）：
  `-1`（esc import 刪除）、`+9,5`（bridge 新增）、`-58,9`（innerHTML 模板→
  renderer 呼叫）、`-93`（`root.innerHTML=""`→`shell.unmount()`）、`-174,8`
  （`closeSheet`／`closeModal` 刪除）。frozen 函式全部落在 hunk 之外：
  `captureRestoreTarget`（現 :21）、`resolveRestoreTarget`（:28，含批 C2-2 註解）、
  `onKeyDown`（:98）、rAF 聚焦（:142）、`closeSurface`（:153，else 分支
  `root.innerHTML = ""` 原樣）、`openLoginModal`（:180）——逐字零變更。
- (c) 七份指定 e2e spec＋`src/modalIsolation.js`＋`src/views`＋`src/sheets`（14
  個 .tsx）＋`src/sessionViews.js`＋`src/app/App.tsx`：
  `git diff 7a3f4d3 --exit-code -- …` exit 0，零 diff。
- (d) `mountSurfaceContent` 函式本體零變更（diff 無 hunk 落入；新增碼全在其前後）；
  `commitSynchronously(update)`（`SurfaceHost.tsx:110` 經 `syncCommit(update)`
  包裝函式本體）與 `commitSynchronously(commitSurfaceSlots)`（:127、:138、:150、
  :170、:178）兩字面存在。
- (e) `rg -n "syncCommit\(" src`＝定義（`syncCommit.ts:8`）＋2 caller
  （`SurfaceHost.tsx:110`、`sessionStore.ts:102`），與基準完全相同，白名單未增。
- (f) `rg -n "line_id|session_contacts" src` 12 筆，與
  `git grep 7a3f4d3` 基準逐行相同（`databaseTypes.ts` 9 筆＋
  `privateDataRepository.ts:322-324` 凍結註解與 `p_line_id: null`）。

## 5. sheets-dom oracle 非弱化審查 — PASS

逐條對照 `git show 7a3f4d3:tests/sheets-dom.test.js` 與現版：

1. 卸載序：`rootStillContainsSurface===true`＋close 後 `innerHTML===""` —— 斷言
   body 逐字相同，僅 harness 接線（`loadSheets(t, vite)`）改變。
2. 拋錯清殼：`assert.throws(/React 卸載失敗/)`＋`innerHTML===""` —— 逐字相同。
3. Escape topmost：兩段 dispatch＋上層清空／底層仍在 —— 逐字相同。
4. Tab trap：首尾雙向循環兩斷言 —— 逐字相同。
5. 還原三段：新卡→collapse→toggle 三段 fallback 斷言 —— 逐字相同。

harness 變更評估：happy-dom＋`react-dom/client` createRoot＋vite middleware SSR
載入 TSX（比照 player-card 模式，非 `renderToStaticMarkup`）；每 case
`?dom-test=N` 雙模組隔離＋顯式注入 renderer＋fresh DOM/root。新 harness 把
sheet-root/modal-root 移入 `#app` 並加 page-content／pre-isolated／toast-root
siblings——這是**趨近 production DOM 的強化**（isolation 可驗），非弱化。注意：
`SurfaceHost.tsx:189` 的模組底部自動 bridge 在 unit harness 中是 inert 的
（SSR instance 的 sheets.js 與測試的 query instance 不同）；自動 bridge 的
production 接線由 e2e 矩陣覆蓋（見 §7）。

新增兩測強度：parity＝對已驗真基線的 byte-identical 斷言（§2 canary 證載重）；
isolation＝5 節點 inert 屬性精確回復（含 pre-inert sibling 原狀保留、toast 恆不
inert、replace 路徑 surface identity 斷言），§1b canary 證載重。

+2 對帳：本檔 6 tests（5 subtest＋1 parent）→ 8 tests（6 subtest＋1 parent＋1
頂層 isolation test），淨 +2；`react-surface-lifecycle.test.js` 僅改名一測不改數；
diff stat 無其他測試檔。實跑 `npm run test:session-unit`：`1..332`、
`# tests 338／pass 338／fail 0`、exit 0（336→338 = +2 吻合）。

E 群改寫核對：`root.innerHTML = "";` indexOf → `shell.unmount();` indexOf（仍要求
在 `unmountContent?.();` 之後），closed 冪等與回傳 shape 斷言保留；對「順序交換」
mutation 同樣載重（交換後 `unmountContent` 之後不再出現 `shell.unmount();`，
indexOf 回 -1 必紅）。A/B/C/D/F 群零 diff。

## 6. 邊角情境探測 — 兩項已判定（6b 建議立 4C-2 加固項）

### 6a. `closeSurface` else 分支（`root.innerHTML=""`）與 React 殼共存 — 論證不可達

到達條件＝root 有 shellRegistry entry 但 `surfaces` 無 entry。逐路檢視：

- mount 路徑：`mountReactSurfaceShell` 成功（sheets.js:63）到 `surfaces.set`
  （:139）之間只有 `pushSurfaceIsolation`（陣列操作＋`setAttribute`/`inert`，
  `modalIsolation.js:36-58`，支援環境下不拋）、`addEventListener`、
  `querySelector(All)`——皆不拋。`mountSurfaceShell` 自身兩條失敗路徑
  （commit throw／`.surface` 缺失，`SurfaceHost.tsx:128-140`）都先清
  registry＋slots 再 throw，不留殼。
- close 路徑：`shell.unmount()` 成功才會走到 `surfaces.delete`，而成功即代表
  registry/slots 已清、DOM 已由 React 移除；`shell.unmount()` 拋錯時
  `surfaces.delete` 不執行（entry 殘留），走的是 active 分支不是 else 分支
  （probe 實證，見 6b）。
- 結論：**模組自身碼徑上不可達**；else 分支只會清「無 live React 殼」的 root。
  無須加固，最多在 4C-2 順手加防禦性 assert（optional）。

### 6b. `shell.unmount()` 拋錯 → `surfaces.delete` 不執行 — probe 實證，後果有界

以 harness probe 讓 renderer 在 close 的 shell 卸載 commit 時拋錯，逐字：

```text
CLOSE_THREW=commit boom
CONTENT_UNMOUNTED=true
ROOT_STILL_HAS_STALE_SHELL_DOM=true
PAGE_CONTENT_INERT_AFTER_THROW=false
REMOUNT_OK sections=1 handle.surface.id=probe-sheet-2
STALE_FIRST_SHELL_GONE=true
QUERY_FIRST_SURFACE_ID=probe-sheet-2
SECOND_CLOSE_OK root_empty=true
```

- **「下次 mount throw already mounted 卡死」不成立**：`mountSurfaceShell` 的
  unmount 先刪 shellRegistry 再 commit（`SurfaceHost.tsx:147-151`），commit 拋錯
  時 registry 已淨空；下次 mount 成功，且新 commit 把 stale 殼 DOM 一併 reconcile
  掉（sections=1、handle 綁到正確新 section）、再關閉可回空。**自癒**。
- 實際後果（皆已 probe 或碼徑確認）：(1) `onClose({reason})` 不執行——caller
  bookkeeping（含 `deferSurfaceOpen` 的 `live=false`）失同步；(2) 若 content
  unmount 也拋過錯，`unmountError` 被 shell 錯誤蓋掉不重拋；(3) `surfaces` 留
  一個 closed=true 死 entry 直到下次 mount 覆寫（期間 `closeSurface` 為 no-op，
  無害）；(4) stale 殼 DOM 殘留到下次該 root mount。isolation 與 keydown 已在
  拋錯前釋放，無洩漏。
- 對照基準：舊 `root.innerHTML = ""` 永不拋，此為**新失敗模式**，但觸發條件是
  React 同步 commit 本身拋錯（罕見）。
- **判定：建議在驗收紀錄立一條 4C-2 加固項**（非退件）：把 `shell.unmount()`
  納入 try/finally，保證 `surfaces.delete`＋`onClose`＋`unmountError` 語意完成；
  順手處理錯誤優先序（content error 不被殼 error 吞）。

## 7. Bridge 時序 — PASS

- `configureSurfaceShellRenderer(mountSurfaceShell)` 在 `SurfaceHost.tsx:189`
  模組底部呼叫；`App.tsx:11-16` 靜態 import SurfaceHost。
- production：`src/main.js:86` `import * as appModule from "./app/App.tsx";`
  （:85 註明 eager React app boundary；派工單寫 `:87`，實為 :86，行號漂移一行、
  語意相同）。ESM 靜態 import 於 main.js 本體執行前完成求值 → SurfaceHost 模組
  init（含 bridge）先於任何 `mountSheet`／`openLoginModal` 執行（後者皆為
  runtime handler，`main.js:112` 只是 import 綁定）。
- Node 路徑：`src/sheets.js` 只 import `modalIsolation.js`／`config.js`／
  `focusableSelector.js`，零 React／TSX；實跑 probe——plain Node import
  `sheets.js` 後直接 `mountSheet` →
  `FAIL_CLOSED_THROW=Surface shell React renderer is unavailable.`
  （fail-closed 於 `sheets.js:62`）。

## 8. 對帳與反掃 — PASS

- `grep -rn "window.__importAppModule(" tests src | wc -l` ＝ **110**（delta 0）。
- `rg -n "\b(closeSheet|closeModal)\b" --glob '!docs/**' .` → 零 match（exit 1）。
- `grep "^export" src/sheets.js`：`configureSurfaceShellRenderer`（:11，新增）、
  `mountSheet`（:163）、`mountDialog`（:168）、`configureLoginModalContent`
  （:174）、`openLoginModal`（:180）——恰為基準清單 +1 bridge、−2 死 export。

## 9. 收尾 — PASS

- 全部 canary／probe 後 `git diff 7a3f4d3 -- src tests .claude` 重新落檔與存底
  `cmp` → 逐字輸出 `CMP_BYTE_IDENTICAL`。
- 臨時 probe 檔（`.probe-parity.mjs`、`.probe-6b.mjs`、`.probe-react19.mjs`、
  `src/.probe-4c1-baseline-sheets.js`）已全數刪除；`git status --short` 僅餘
  原 5 檔 modified＋untracked Codex 回報檔，無殘留暫存檔。
- 本審查未重跑 build／bundle／test:mock／test:local 全矩陣（非本單驗收項；
  Codex 回報數字中可廉價複驗的 unit 338 已實跑吻合）。

## 總評

- **被推翻／修正的聲稱**：僅一件用語級——Codex §1.1 把 React 19 的
  `warnForReactChildrenConflict` dev 警告描述成「runtime error」。實測
  （React 19.2.8）該組合不拋錯、portal 照常工作，只發一次 `console.error`；
  production build 無此檢查。其餘所有聲稱（canary 雜湊與紅綠輸出、parity 字面、
  15 路徑枚舉、凍結面、計數）逐項複驗吻合，未發現造假或空殼引用。
- **React 19 例外設計獨立判定**：正確且必要。必要性的真正依據是本 repo 的
  zero-console-error e2e oracle（警告即紅），而非 React 硬性錯誤；「非空 legacy
  html 走 dangerous、portal target 保持 leaf、空殼以 ref commit 補空白節點」同時
  滿足零警告、零 wrapper、byte parity 三約束，`preserveEmptyTemplateWhitespace`
  的 `childNodes.length===0` guard 防重複追加，設計面無隱患。建議如 Codex 所提
  把此規則寫進 4C-2 派工單條文。
- **4C-2 加固建議**：(1) 6b——close 路徑把 `shell.unmount()` 納入 try/finally，
  保住 `surfaces.delete`／`onClose`／`unmountError` 重拋（觸發罕見、後果有界且
  自癒，非退件）；(2) 6a 不可達，無必要項，防禦性 assert optional。
