# 批 5：我的球局頁遷移 React 回報

日期：2026-08-18（Asia/Taipei）

## 1. 結論

「我的球局」頁已由 React 19 接管。`renderMySessionsPage(root, options = {})` 的公開名稱、呼叫方式、預設 options、callback payload 與同步 commit 語意維持不變；`src/main.js` import／呼叫點與 `tests/smoke.spec.js` 45 個直接文字引用全部零修改。

既有 testid、id、class、aria、文案、三區結構、highlight、withdraw confirmation、聊天、空狀態與全域 CSS 均保留。`src/main.js`、`index.html`、`src/session.css`、`tests/**` 最終零 diff。未 commit、未 push，也未執行本機 DB reset。

## 2. Mount、generation remount 與同步 adapter

公開 adapter 最終為：

```js
export function renderMySessionsPage(root, options = {}) {
  if (!mountMySessionsPage) throw new Error("MySessionsPage browser mount is unavailable.");
  mySessionsRenderOptions.set(root, options);
  setMySessionActionScope(root, options.actionScopeKey ?? null);
  mountMySessionsPage(root, options);
  wireMySessionsPage(root, options);
  syncPendingMySessionActions(root);
  scheduleMySessionsCreatedFocus(root, options);
}
```

- browser 以明寫 `.tsx` 的 eager glob 同步取得 `mountMySessionsPage`；Node 22 direct import 時因沒有 `document` 而不解析 TSX，既有 unit runner／fixture 不必改。
- `src/pages/MySessionsPage.tsx` 以 `WeakMap<HTMLElement, { generation, reactRoot }>` 保存 mount；同一個 `#my-sessions-root` 只執行一次 `createRoot`。
- 每次呼叫 generation 加一並用新的 page key render，完整 detach 舊 subtree，對齊 legacy `root.innerHTML`、pending watch node 與 default DOM state 契約。
- `flushSync` 保證 adapter return 前已 commit；native wiring、pending sync 與 highlight rAF 都在 commit 後依原時序執行。
- page root 內已無 My Sessions innerHTML renderer；React 產生全部頁面、卡片與區塊 DOM。sheet/dialog 仍只操作自己的 legacy root。

React best-practices skill 具體影響：直接 import ReactDOM、無 barrel、元件全部在 module scope、沒有新增 effect/global listener、每個 mount element 只初始化一個 root。

## 3. Segment 與 pending 狀態存活

### 批 B stale snapshot 契約

`mySessionsRenderOptions` 與 `mySessionsSegmentStates` 仍留在 `sessionViews.js` 的 module-level WeakMap，以實體 root 為 key，不放進會 remount 的 React state：

- `renderMySessionsPage` 每次先把最新原始 options 寫入 `mySessionsRenderOptions`。
- `resolveMySessionsSegment` 仍讀寫 `mySessionsSegmentStates`，所以頁面 hidden/show 或 generation remount 都不會重設使用者分頁。
- segmented 按鈕刻意由 adapter 在 commit 後掛 **native node listener**，不是 React delegated `onClick`。因此既有測試保存第一代、已 detach 的舊按鈕後呼叫 `.click()`，listener 仍會以 root 查 `mySessionsRenderOptions.get(root)`，使用第二次 render 的最新 options。
- segment click 的遞迴 adapter 呼叫仍是同步 `flushSync`；完成後聚焦新 generation 的同 segment 按鈕。

這是 React generation remount 下保留批 B 契約的必要兼容層。

### Pending 三段式

action 的單一實作仍為 `runMySessionAction`／`runAsyncAction` 與 `mySessionActionStates`：

1. mount 前 `setMySessionActionScope(root, actionScopeKey)`；跨帳號／view epoch 立即丟棄舊 pending map。
2. React 同步 commit，再把當次 callback 接到新 DOM；action payload 仍從 button dataset 讀成字串。
3. `syncPendingMySessionActions(root)` 對新 generation 重新 resolve semantic descriptor 並 disabled；promise finally/error/focus 仍查當前 DOM，而不是握住 detached node。

withdraw 因會開 confirmation，仍不先列入 pending map；其他 action、refresh、invite response、錯誤 alert 與 lifecycle focus fallback 均沿用原 helper。

## 4. 元件拆分

`src/pages/MySessionsPage.tsx` 依既有 DOM 責任拆為：

- `TimeTile`、`StatusChip`、`SessionBrief`
- `ActionButton`、`ChatButton`、`SessionCard`
- `HostRequestCard`、`InviteCard`、`GuestRequestCard`
- `SegmentedControl`、`EmptyState`
- `NeedsActionSection`、`UpcomingSection`、`HistorySection`
- `SuccessPushPrompt`、`MySessionsPage`、`mountMySessionsPage`

三區 showChrome／空容器規則原樣保留：全空分頁仍保留空的 `#my-needs-action`、`#my-upcoming-sessions`、`#my-history`；history 有資料時可與 v2 empty box 同時存在。歷史 reason 仍緊接卡片、沒有增加 wrapper。

## 5. Helper 單一來源

`sessionViews.js` export frozen `mySessionsPageRuntime`，React 頁只消費既有／抽出的唯一實作：

```text
mySessionReason
mySessionsSplitBySegment
normalizedNotificationSettings
ntrpRange
resolveMySessionsSegment
runMySessionAction
sessionCourtLabel
sessionHostLabel
sessionTimeTilePresentation
sessionVenuePresentation
successPushPromptPresentation
vacancyLabel
```

另直接從原模組 import `formatNtrp`（`profile.js`）與 `isUndecidedCandidate`（`sessionCriteria.js`）。沒有把同名 presentation helper 複製進 TSX。

為讓 legacy 其他 surface 與 React 共用，原 `sessionTimeTileMarkup` 改呼叫唯一 `sessionTimeTilePresentation`；`successPushPromptMarkup` 改呼叫唯一 `successPushPromptPresentation`。My Sessions 專用的 markup-only helpers 已刪除，其 JSX 元件是唯一現行 DOM presentation。

`MySessionsPage.tsx -> sessionViews.js` runtime 與 `sessionViews.js -> MySessionsPage.tsx` browser mount 是安全的 ESM live-binding cycle：兩邊都只在函式執行時讀對方 binding，沒有 top-level mount。Node 68/68、Vite build、mock/local gates 均實際載入驗證。

## 6. Domain type 補齊

`MySessionSummary` 增加 `mapMySession` 已保證且本頁實際使用的欄位：

```text
canCancel, canConfirmAttendance, canConfirmPlayed, canRespondInvite,
canWithdraw, updatedAt, viewerPlayedConfirmed
```

沒有新增 select、mapper、view 或資料庫欄位。頁面輸入型別以 `Partial<MySessionSummary>` 兼容既有 JS e2e 的最小 fixture，候選球場仍只在頁面局部使用 optional `candidateCourtIds`，沒有回復批 4 移除的 mapper 過度承諾。

## 7. 變更清單

- `src/pages/MySessionsPage.tsx`（新增）：strict TSX 元件樹、per-root WeakMap、generation remount 與 `flushSync`。
- `src/sessionViews.js`：My Sessions innerHTML renderer 改為 React adapter；保留 WeakMap segment/pending 與 native wiring；新增單一 runtime；共用 time tile／success push presentation model。
- `src/domainTypes.ts`：補上 `mapMySession` 已保證的 My Sessions 欄位。
- `docs/migration-reports/batch-5.md`：本回報。

刻意未改：`src/main.js`、`index.html`、`src/session.css`、`tests/**`、`.claude/rules/react-migration.md`、package／lint 設定。

## 8. React 接管有牙紅綠證據

完成最終程式後，先鎖定全 `src/` SHA；再把公開 adapter 暫退為只含 `void root; void options;` 的空實作。依派工要求，不用 tail 判定，直接 grep `failed|passed`：

```bash
set -o pipefail
TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/smoke.spec.js \
  --project=desktop-chromium \
  --grep 'My Sessions empty state shows one dc box instead of stacking three placeholder messages' \
  2>&1 | grep -E 'failed|passed'
```

空 adapter 紅燈逐字輸出（pipeline exit 1）：

```text
    Error: expect(locator).toBeVisible() failed
  1 failed
```

逐字還原 adapter 後，同一命令綠燈（exit 0）：

```text
  1 passed (1.1s)
```

因此既有 My Sessions e2e 的成功確實依賴 React mount。

## 9. Repeat-each=3 證據

抽樣同時包含批 B stale segment、跨 replacement pending、invite failure focus、Me 移出設定後 pending、account scope 與 pending withdrawal：

```bash
TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/smoke.spec.js \
  --project=desktop-chromium \
  --grep 'My Sessions segment switching redraws from the latest rendered snapshot|My Sessions preserves the initiating action and its error across a private-page rerender|invite response buttons dispatch, stay pending across replacement, and focus the alert on failure|Me owns player visibility while My Sessions omits both moved settings and preserves pending and error state|My Sessions moves focus to an updated card and scopes pending actions to the current account render|a pending withdrawal accepts only one intentional submission' \
  --repeat-each=3
```

逐字結果（exit 0）：

```text
Running 18 tests using 1 worker

  ✓   1 [desktop-chromium] › tests/smoke.spec.js:114:1 › My Sessions segment switching redraws from the latest rendered snapshot (239ms)
  ✓   2 [desktop-chromium] › tests/smoke.spec.js:1955:1 › My Sessions preserves the initiating action and its error across a private-page rerender (253ms)
  ✓   3 [desktop-chromium] › tests/smoke.spec.js:2059:1 › invite response buttons dispatch, stay pending across replacement, and focus the alert on failure (282ms)
  ✓   4 [desktop-chromium] › tests/smoke.spec.js:2194:1 › Me owns player visibility while My Sessions omits both moved settings and preserves pending and error state (264ms)
  ✓   5 [desktop-chromium] › tests/smoke.spec.js:2538:1 › My Sessions moves focus to an updated card and scopes pending actions to the current account render (353ms)
  ✓   6 [desktop-chromium] › tests/smoke.spec.js:2778:1 › a pending withdrawal accepts only one intentional submission (1.1s)
  ✓   7 [desktop-chromium] › tests/smoke.spec.js:114:1 › My Sessions segment switching redraws from the latest rendered snapshot (214ms)
  ✓   8 [desktop-chromium] › tests/smoke.spec.js:1955:1 › My Sessions preserves the initiating action and its error across a private-page rerender (273ms)
  ✓   9 [desktop-chromium] › tests/smoke.spec.js:2059:1 › invite response buttons dispatch, stay pending across replacement, and focus the alert on failure (242ms)
  ✓  10 [desktop-chromium] › tests/smoke.spec.js:2194:1 › Me owns player visibility while My Sessions omits both moved settings and preserves pending and error state (278ms)
  ✓  11 [desktop-chromium] › tests/smoke.spec.js:2538:1 › My Sessions moves focus to an updated card and scopes pending actions to the current account render (320ms)
  ✓  12 [desktop-chromium] › tests/smoke.spec.js:2778:1 › a pending withdrawal accepts only one intentional submission (1.1s)
  ✓  13 [desktop-chromium] › tests/smoke.spec.js:114:1 › My Sessions segment switching redraws from the latest rendered snapshot (211ms)
  ✓  14 [desktop-chromium] › tests/smoke.spec.js:1955:1 › My Sessions preserves the initiating action and its error across a private-page rerender (239ms)
  ✓  15 [desktop-chromium] › tests/smoke.spec.js:2059:1 › invite response buttons dispatch, stay pending across replacement, and focus the alert on failure (232ms)
  ✓  16 [desktop-chromium] › tests/smoke.spec.js:2194:1 › Me owns player visibility while My Sessions omits both moved settings and preserves pending and error state (256ms)
  ✓  17 [desktop-chromium] › tests/smoke.spec.js:2538:1 › My Sessions moves focus to an updated card and scopes pending actions to the current account render (342ms)
  ✓  18 [desktop-chromium] › tests/smoke.spec.js:2778:1 › a pending withdrawal accepts only one intentional submission (1.1s)

  18 passed (9.0s)
```

另一次 desktop targeted sweep 涵蓋 20 條 My Sessions／focus／chat／empty／notification 測試，20/20 通過。

## 10. SHA-256 對照與 canary 還原

### 批前基準

```text
9efe807b7d57af94da46e42fc68b15d2a1b0abd61be041bd1520c96e193bc674  src manifest（28 檔）
1416f9044a60b063336f3fafa24e848361529ea0cf4fa1dd6360456c399c805b  src/sessionViews.js
11991054f3b869cea18155458cb389bee1bbdba81a4c5d4270364eb11a465d61  src/domainTypes.ts
24839cc13adcb4ce59c90c77326576c6fed4c07d338fbf6d834b0d60c7934b9e  src/main.js
```

### 最終與 canary 前後

對排序後 29 個 src 檔逐檔做 SHA-256，再對 manifest 文字取 SHA-256：

```text
canary before  407ae7e2eb992b4e9681d81c5c474e25e492be3d70fc014e4fed83fc2f6432a2
canary after   407ae7e2eb992b4e9681d81c5c474e25e492be3d70fc014e4fed83fc2f6432a2
SRC_FILE_COUNT=29
SRC_MANIFEST_DIFF_EXIT=0
```

最終直接檔案：

```text
f9df0c437cb00295597bc6a17df0c420b8ad8eb79319c0de3b579fed6a04199c  src/sessionViews.js
8cbe9abaa08019bbb636ddb685558e41de333d766f704e45e53559f9ca34e57a  src/pages/MySessionsPage.tsx
b07659e94e6e8bbff95344a53fa0006cbd938258c96079ac11fec4d5d0e8cbf3  src/domainTypes.ts
24839cc13adcb4ce59c90c77326576c6fed4c07d338fbf6d834b0d60c7934b9e  src/main.js
```

`src/main.js` 批前後完全同 SHA。

## 11. Bundle 前後對照

批前與批後使用同一依賴執行 `npm run build`；精確 gzip 以 `gzip -c | wc -c` 量測：

| 狀態 | modules | 主 JS raw | 主 JS gzip | CSS raw/gzip | 小 JS raw/gzip |
| --- | ---: | ---: | ---: | ---: | ---: |
| 批前（批 4 工作樹） | 97 | 689,039 B | 194,927 B | 67,426 / 10,678 B | 1,932 / 971 B |
| 批後 | 99 | 692,694 B | 195,737 B | 67,426 / 10,678 B | 1,932 / 971 B |
| 差額 | +2 | **+3,655 B** | **+810 B** | 0 / 0 | 0 / 0 |

React runtime 已由批 3 進 bundle；本批僅增加頁面元件與 shared presentation model。gzip 邊際增加 810 B，CSS／小 chunk byte size 不變，沒有新 library 或樣式膨脹。既有 500 kB 主 chunk warning 維持原樣。

批前 Vite 摘要：

```text
vite v6.4.3 building for production...
transforming...
✓ 97 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-DNKhMJ1p.js   689.04 kB │ gzip: 195.61 kB
✓ built in 903ms
```

批後摘要見第 13 節。

## 12. 全 repo consumer sweep

掃描 `src/`、`tests/`、`scripts/`、`supabase/functions/`。active repo 共 51 個 `renderMySessionsPage` 文字引用，其中 smoke 正好 45 個。

### Production／internal

```text
src/sessionViews.js:1238          stale segment listener 以最新 WeakMap options 遞迴呼叫
src/sessionViews.js:1306          export definition
src/main.js:90                    production import（未改）
src/main.js:144,965               highlight/created ground-truth 註解（未改）
src/main.js:973                   production call（未改）
```

### `tests/smoke.spec.js` 全 45 處

```text
118,143,148
624,628
1126,1131
1274,1277
1315,1318
1364,1378
1789,1793
1913,1917
1960,1986
2019,2038
2064,2088
2126,2130
2199,2203
2543,2568
2587,2611
2628,2647
2717,2720
2759,2760
3893,3912
3931,3949
3980,3984
4874,4900
```

### 被動到的符號

- `mountMySessionsPage`：定義 `src/pages/MySessionsPage.tsx:648`；唯一取得／呼叫點 `src/sessionViews.js:24–26,1307,1310`。
- `mySessionsPageRuntime`：唯一 export `src/sessionViews.js:1188`；唯一 module consumer `src/pages/MySessionsPage.tsx:8`。
- `mySessionsRenderOptions`：`src/sessionViews.js:143,1238,1308`；沒有跨模組 consumer。
- `mySessionsSegmentStates`／`mySessionsSegmentState`／`resolveMySessionsSegment`：只在 `sessionViews.js:147,1169–1184` 與 runtime consumer的 TSX 使用。
- `runMySessionAction`：My Sessions adapter wiring `src/sessionViews.js:1229,1267`；同一 helper 亦由 `mePageRuntime` 供 `src/pages/MePage.tsx:243,618` 使用，沒有複本。
- `setMySessionActionScope`／`syncPendingMySessionActions`：Me adapter `src/sessionViews.js:182,184` 與 My Sessions adapter `:1309,1312`。
- `MySessionSummary`：定義 `src/domainTypes.ts:31`；consumer 為 `src/pages/MySessionsPage.tsx:5,14` 與 `src/pages/MessagesPage.tsx:4,9`。
- `sessionTimeTilePresentation` 與 `successPushPromptPresentation`：各有一個 definition；legacy markup 與 `mySessionsPageRuntime` 共用。

### 被動到的 `sessionViews.js` 模組 consumer

- production：`src/main.js:93`。
- TSX：`src/pages/MySessionsPage.tsx:8`、`src/pages/MePage.tsx:6`、`src/pages/MessagesPage.tsx:6`。
- Node direct import：`tests/session-create-form.test.js:11`、`tests/session-data-boundary.test.js:34`、`tests/session-controller.test.js:2395–2450`。
- browser dynamic import：`tests/smoke.spec.js`、`tests/performance.spec.js:218,259`、`tests/session.spec.js:350`；完整 gates 已實際載入。
- `scripts/`：零 `renderMySessionsPage`、mount、runtime、WeakMap 與新增型別 consumer。
- `supabase/functions/`：上述符號全部零 consumer。

## 13. 全部 gate 結尾輸出（逐字）

### `npm test`（含 pretest）

exit 0；結尾：

```text
  ✓  252 [mobile-chromium] › tests/smoke.spec.js:5286:1 › closing and reopening the filter sheet three times does not stack delegated listeners on the shared sheet root (521ms)
  ✓  253 [mobile-chromium] › tests/smoke.spec.js:5327:1 › the filter sheet button stays enabled and its content is complete even while the Taipei court catalogue is still loading (1.4s)
  ✓  254 [mobile-chromium] › tests/smoke.spec.js:5359:1 › the filter sheet traps Tab focus between its own first and last controls (239ms)

  4 skipped
  250 passed (2.3m)
```

### `npm run test:local`

exit 0；結尾：

```text
  ✓  51 [supabase-chromium] › tests/session.spec.js:2180:1 › N1 an existing zero-subscription account is never seeded by a later profile save (746ms)
  ✓  52 [supabase-chromium] › tests/session.spec.js:2199:1 › N2 an account that explicitly cleared every court stays at zero across later profile saves (1.2s)
  ✓  53 [supabase-chromium] › tests/session.spec.js:2226:1 › N3 a failing subscription seed never fails the profile save (721ms)

  11 skipped
  42 passed (1.4m)
```

未遇資料衝突，故未執行 `CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test`。

### Typecheck

```text
> tennis-partner-finder@0.1.0 typecheck
> tsc --noEmit
```

### ESLint

```text
> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{ts,tsx}" vite.config.ts
```

### Prettier

```text
> tennis-partner-finder@0.1.0 prettier:check
> prettier --check "src/**/*.{ts,tsx}" vite.config.ts

Checking formatting...
All matched files use Prettier code style!
```

### Build

```text
> tennis-partner-finder@0.1.0 build
> vite build

vite v6.4.3 building for production...
transforming...
✓ 99 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-DA7HTyMH.js   692.69 kB │ gzip: 196.43 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 1.02s
```

### `git diff --check`

```text
(no stdout)
EXIT_CODE=0
```

## 14. `git diff --stat` 與工作樹

`git diff --stat` 逐字輸出；Git 不列 untracked 新檔：

```text
 src/domainTypes.ts  |   7 +
 src/sessionViews.js | 362 +++++++++++-----------------------------------------
 2 files changed, 79 insertions(+), 290 deletions(-)
```

新 TSX 的 no-index stat：

```text
 /dev/null => src/pages/MySessionsPage.tsx | 659 ++++++++++++++++++++++++++++++
 1 file changed, 659 insertions(+)
```

另有本 untracked report。最終預期工作樹：

```text
 M src/domainTypes.ts
 M src/sessionViews.js
?? docs/migration-reports/batch-5.md
?? src/pages/MySessionsPage.tsx
```

`src/main.js`、`index.html`、`src/session.css`、`tests/**` 皆零 diff。
