# 批 4：我頁遷移 React 回報

日期：2026-08-18（Asia/Taipei）

## 1. 結論

我頁已由 React 19 接管。`renderMePage(root, options = {})` 的公開名稱、兩參數呼叫方式、預設值語意與同步 commit 契約均保留；`src/main.js` import／呼叫點與既有 e2e 直呼點零修改。DOM 的 testid、id、class、aria、文案與元素層級沿用原輸出，`src/session.css`、`index.html`、`tests/**` 均為零 diff。

本批未 commit、未 push，亦未執行本機 DB reset。驗收方要求的 390px 登出態／可及態視覺比對不在本批執行範圍。

## 2. 元件與 adapter 設計

### 公開 adapter 與同步語意

`src/sessionViews.js` 仍是 caller 唯一入口：

```js
export function renderMePage(root, options = {}) {
  if (!mountMePage) throw new Error("MePage browser mount is unavailable.");
  const authSession = options.authSession ?? null;
  setMySessionActionScope(root, authSession?.user?.id ?? null);
  mountMePage(root, options);
  syncPendingMySessionActions(root);
}
```

- browser 以明寫 `.tsx` 的 eager glob 同步取得 `mountMePage`；Node 22 直接 import `sessionViews.js` 時，`document` 不存在，因而不會嘗試解析 `.tsx`。既有 Node unit consumer 不需改 runner 或 fixture。
- `src/pages/MePage.tsx` 以 `WeakMap<HTMLElement, { generation, reactRoot }>` 保存 mount；同一個 `#me-root` 只執行一次 `createRoot`。
- 每次公開 adapter 呼叫都使用最新 options，generation 加一後以新的 page key render。這會重建 root 內的完整 React subtree，對齊舊 `root.innerHTML = ...` 的「用新 options 全面重繪」與舊焦點節點 detach 契約；不是只吃第一次 props。
- `flushSync` 保證 adapter return 前 React 已 commit；之後才執行 `syncPendingMySessionActions(root)`，維持舊 action helper 跨重繪解鎖／保焦點時序。
- checkbox 使用 `defaultChecked` 加每次完整 subtree remount，讓同步使用者操作、失敗回滾與下一次 authoritative options 重繪三者都維持舊行為。

React best-practices skill 影響本批的具體做法是：直接 import `react-dom`／`react-dom/client`、所有子元件都定義在 module scope、不新增 effect 或 document listener、每個 mount element 只初始化一個 React root。

### 元件拆分

頁面仍集中在 `src/pages/MePage.tsx`，依 DOM 責任拆為：

- `PlayerAvatar`、`NtrpBrick`、`AuthenticatedIdentity`、`SignInCard`
- `PlayerVisibility`、`PresenceSettings`
- `NotificationPreferencesFieldset`、`CourtSubscriptions`、`NotificationSettings`
- `BlockedPlayerSettings`、`LoginMethods`、`ServiceLinks`
- `MePage` 與 per-root `mountMePage`

這延續批 3 的 `src/pages/<PageName>.tsx` 慣例：頁面 JSX、頁面私有型別與 mount 放同檔；legacy 公開函式留在原模組作 adapter；`.ts`／`.tsx` importer 明寫真實副檔名，domain shape 以 `import type` 接 `src/domainTypes.ts`。沒有搬 CSS Module。

## 3. helper 單一來源

沒有把 presentation／action helper 複製一份進 TSX。`sessionViews.js` 保留唯一實作並 export frozen `mePageRuntime`，React 頁只呼叫它：

```text
avatarInitial, canReceiveFocus, normalizedNotificationSettings,
normalizedPresenceSettings, notificationPushHint, ntrpBrickValue,
playerSlotLabels, presenceLocationHint, profileCourtNames,
runMySessionAction, runNotificationSettingAction,
runPresenceSettingAction, safeGoogleAvatarUrl, showAvatarFallback
```

其中 avatar error fallback 抽成 `showAvatarFallback`，legacy `wireAvatarFallbacks` 與 React avatar 共用同一實作。原本只服務 Me innerHTML 的 `loginMethodRowsMarkup` 已隨舊 renderer 刪除，登入方式 JSX 成為唯一現行 presentation，不存在兩份來源。

`MePage.tsx -> sessionViews.js` 的 helper import 與 `sessionViews.js -> MePage.tsx` 的 browser mount 組裝形成 ESM cycle，但兩邊都只在函式執行時讀取對方 binding，沒有 top-level 呼叫；Vite、Node direct-import unit、完整 mock/local e2e 均已實際驗證。

## 4. 焦點契約與 main.js 相容性

`src/main.js` 的 Me focus capture/restore 與 `suppressMeFocusRelease` **全部保留且零 diff**。理由：每次 render 使用新 generation key，React commit 會像舊 innerHTML 一樣 detach 舊控制項；main.js 在呼叫前擷取語意 selector，在 `flushSync` commit 後恢復新節點。`suppressMeFocusRelease` 仍可避免這次主動換血被 MutationObserver 誤判成頁面離場。

頁內 async helper 也仍跨 await 只保存 selector，重繪後重新 resolve 控制項；React 不新增 Escape handler，sheet/modal 的 Escape 與焦點 ownership 仍由既有 surface 機制負責。因此本批沒有合理退役條件，退役留待後續統一焦點架構。

原樣 focus contract 測試三輪：

```bash
TENNIS_TEST_HARNESS_MODE=local npx playwright test tests/session.spec.js \
  --project=supabase-chromium \
  --grep 'every Me control keeps focus through a background rerender' \
  --repeat-each=3
```

逐字結果（exit 0）：

```text
Running 3 tests using 1 worker

  ✓  1 [supabase-chromium] › tests/session.spec.js:1877:1 › every Me control keeps focus through a background rerender (12.9s)
  ✓  2 [supabase-chromium] › tests/session.spec.js:1877:1 › every Me control keeps focus through a background rerender (12.9s)
  ✓  3 [supabase-chromium] › tests/session.spec.js:1877:1 › every Me control keeps focus through a background rerender (12.9s)

  3 passed (45.2s)
```

最終 `npm run test:local` 又原樣通過一次同一測試（11.4s）。

## 5. Riders

### a. `MySessionSummary` 不再過度承諾 candidate courts

採用：

```ts
export interface MySessionSummary extends Omit<SessionSummary, "candidateCourtIds"> {
```

理由：`MY_SESSION_COLUMNS`／`MY_SESSIONS_SELECT` 沒選 `candidate_court_ids`，`mapMySession` 也沒有回傳它；補 select＋mapper 會無必要地擴大 authenticated data boundary 與 view allowlist。本批只修正型別承諾，沒有改 query、mapper、view 或資料庫。

訊息 presentation 仍需兼容 mock／歷史 caller 可能帶入候選球場，因此頁內使用局部型別：

```ts
type MessagesSession = MySessionSummary &
  Partial<Pick<SessionSummary, "candidateCourtIds">>;
```

這只描述 view 的容錯輸入，不再聲稱 `mapMySession` 保證該欄位。

### b. `messagesFromGroups` 死副本收斂

`src/sessionViews.js` export 版現在是唯一實作。`src/pages/MessagesPage.tsx` 直接：

```ts
import { messagesFromGroups } from "../sessionViews.js";
```

TSX 私有副本已刪除；既有 `tests/session-data-boundary.test.js` 仍測同一 export，零修改。Node targeted suite 68/68 與完整 gate 全綠。

## 6. 變更清單

- `src/pages/MePage.tsx`（新增）：strict TSX 元件樹、事件接線、per-root WeakMap mount 與 `flushSync`。
- `src/sessionViews.js`：Me innerHTML renderer 改為 React adapter；刪除舊 Me 專用 markup／delegated listener；保留並公開單一 helper runtime；messages export 維持唯一來源。
- `src/pages/MessagesPage.tsx`：改 import `messagesFromGroups`，刪除 private 副本；局部候選球場容錯型別。
- `src/domainTypes.ts`：`MySessionSummary` 改為 `Omit<SessionSummary, "candidateCourtIds">`。
- `docs/migration-reports/batch-4.md`：本回報。

刻意未改：`src/main.js`、`index.html`、`src/session.css`、`.claude/rules/react-migration.md`、`tests/**`、package／lint 設定。

## 7. React 有牙紅綠證據

最終程式完成後，先鎖定全 `src/` SHA，再把 `renderMePage` 暫時退為只含 `void root; void options;` 的空實作。執行既有 smoke：

```bash
TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/smoke.spec.js \
  --project=desktop-chromium \
  --grep 'four destinations expose an anonymous Me page'
```

紅燈逐字關鍵輸出（exit 1）：

```text
Running 1 test using 1 worker

  ✘  1 [desktop-chromium] › tests/smoke.spec.js:451:1 › four destinations expose an anonymous Me page while the map header stays minimal (5.3s)

  1) [desktop-chromium] › tests/smoke.spec.js:451:1 › four destinations expose an anonymous Me page while the map header stays minimal

    Error: expect(locator).toBeVisible() failed

    Locator: getByTestId('me-sign-in')
    Expected: visible
    Timeout: 5000ms
    Error: element(s) not found

      463 |   await expect(page.locator("#my-sessions-page")).toBeHidden();
      464 |   await expect(page.locator("#me-page")).toBeVisible();
    > 465 |   await expect(page.getByTestId("me-sign-in")).toBeVisible();
          |                                                ^

  1 failed
    [desktop-chromium] › tests/smoke.spec.js:451:1 › four destinations expose an anonymous Me page while the map header stays minimal
```

逐字還原 adapter 後，同一條測試綠燈（exit 0）：

```text
Running 1 test using 1 worker

  ✓  1 [desktop-chromium] › tests/smoke.spec.js:451:1 › four destinations expose an anonymous Me page while the map header stays minimal (338ms)

  1 passed (1.2s)
```

因此既有 e2e 的成功確實依賴 React mount，不是 legacy DOM 或假綠。

## 8. Canary SHA-256 還原證據

canary 前後皆把 `find src -type f` 排序，對 28 檔逐檔做 SHA-256，再對 manifest 文字取 SHA-256：

```text
before  9efe807b7d57af94da46e42fc68b15d2a1b0abd61be041bd1520c96e193bc674
after   9efe807b7d57af94da46e42fc68b15d2a1b0abd61be041bd1520c96e193bc674
SRC_FILE_COUNT=28
SRC_MANIFEST_DIFF_EXIT=0
```

直接檔案在還原後的值：

```text
1416f9044a60b063336f3fafa24e848361529ea0cf4fa1dd6360456c399c805b  src/sessionViews.js
16fdc2ba5122acbec8d6a76bd81c526c9d7a5b8153686715c9a03386db362ee0  src/pages/MePage.tsx
392c7becc805edcb2a9fb7747269d6de6ff9be9c805679744249a69f9229e691  src/pages/MessagesPage.tsx
11991054f3b869cea18155458cb389bee1bbdba81a4c5d4270364eb11a465d61  src/domainTypes.ts
24839cc13adcb4ce59c90c77326576c6fed4c07d338fbf6d834b0d60c7934b9e  src/main.js
```

`src/main.js` 的批前與批後值同為 `24839c…34b9e`，亦證明沒有留下臨時焦點或接線改動。

## 9. Bundle 前後對照

批前基準在改碼前執行，批後以同一依賴與 `npm run build` 量測；精確 gzip 由 `gzip -c | wc -c` 取得：

| 狀態 | modules | 主 JS raw | 主 JS gzip | CSS raw/gzip | 小 JS raw/gzip |
| --- | ---: | ---: | ---: | ---: | ---: |
| 批前（批 3 工作樹） | 96 | 686,114 B | 193,891 B | 67,426 / 10,678 B | 1,932 / 971 B |
| 批後 | 97 | 689,039 B | 194,927 B | 67,426 / 10,678 B | 1,932 / 971 B |
| 差額 | +1 | **+2,925 B** | **+1,036 B** | 0 / 0 | 0 / 0 |

React／ReactDOM 已在批 3 首次進 bundle；本批只是增添 Me 元件，故 gzip 邊際增加約 1.0 KiB，而不是再付一次 runtime 成本。CSS 與小 chunk byte size 完全不變，沒有樣式搬移或非預期依賴膨脹。主 chunk 的既有 500 kB warning 仍在，沒有新增第二種 warning。

批前 Vite 摘要：

```text
vite v6.4.3 building for production...
transforming...
✓ 96 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-DXPQC_eP.js   686.11 kB │ gzip: 194.59 kB
✓ built in 827ms
```

批後摘要見第 11 節。

## 10. 全 repo consumer sweep

掃描 active repo 的 `src/`、`tests/`、`scripts/`、`supabase/functions/`；純文件提及不算 runtime consumer。

### `renderMePage` 全部 active 引用

```text
src/sessionViews.js:176            export renderMePage
src/main.js:87                     production import（未改）
src/main.js:1029,1031,1041         focus/suppress 契約註解（未改）
src/main.js:1052                   production call（未改）
tests/smoke.spec.js:2167,2170      import / call
tests/smoke.spec.js:2199,2212      import / call
tests/smoke.spec.js:2308,2312      import / call
tests/smoke.spec.js:2342,2346      import / call
tests/smoke.spec.js:2431,2441      import / call
tests/smoke.spec.js:2508,2516      import / call
tests/smoke.spec.js:3091,3095,3097 comment / import / call
tests/smoke.spec.js:3225,3230      import / call
tests/smoke.spec.js:3249,3251      import / call
tests/smoke.spec.js:3684,3688      import / call
tests/smoke.spec.js:4874,4894      import / call
tests/smoke.spec.js:5120,5129      import / call
tests/smoke.spec.js:5165,5170      import / call
```

`tests/session.spec.js:1123–2226` 經 production main 間接消費 adapter；其中 `:1877` 是本批指定焦點契約。不存在其他 production 直呼點。

### 新 mount/helper 與 riders 引用

- `mountMePage`：定義 `src/pages/MePage.tsx:765`；唯一取得／呼叫點 `src/sessionViews.js:21–23,177,180`。
- `mePageRuntime`：唯一 export `src/sessionViews.js:1217`；唯一 module consumer `src/pages/MePage.tsx:6`，同檔各元件使用其列出的單一來源 helpers。
- `messagesFromGroups`：唯一實作/export `src/sessionViews.js:2025`；consumer 為 `src/pages/MessagesPage.tsx:6,153` 與既有 unit `tests/session-data-boundary.test.js:34,427–456`。
- `MySessionSummary`：定義 `src/domainTypes.ts:31`；唯一 consumer `src/pages/MessagesPage.tsx:4,9`。
- `MePage.tsx` 的 production 組裝只來自 `sessionViews.js` eager glob；沒有 caller 直接繞過公開 adapter。

### 被動到的 `sessionViews.js` 模組 consumer

- production：`src/main.js:93`。
- TSX：`src/pages/MePage.tsx:6`、`src/pages/MessagesPage.tsx:6`。
- Node direct import：`tests/session-create-form.test.js:11`、`tests/session-data-boundary.test.js:34`、`tests/session-controller.test.js:2395–2450`。
- browser dynamic import：`tests/smoke.spec.js`、`tests/performance.spec.js:218,259`、`tests/session.spec.js:350`。完整 gates 實際載入了這些路徑。
- `tests/fixtures/appRuntime.js` 仍只需把 `sessionViews` 解到 `.js`；TSX 是 Vite browser graph 的內部節點，不需改副檔名表。
- `scripts/`：零 `renderMePage`、`mountMePage`、`mePageRuntime`、`messagesFromGroups`、`MySessionSummary` consumer。
- `supabase/functions/`：上述符號全部零 consumer。

## 11. 全部 gate 結尾輸出（逐字）

### `npm test`（含 pretest）

exit 0；結尾：

```text
  ✓  252 [mobile-chromium] › tests/smoke.spec.js:5286:1 › closing and reopening the filter sheet three times does not stack delegated listeners on the shared sheet root (504ms)
  ✓  253 [mobile-chromium] › tests/smoke.spec.js:5327:1 › the filter sheet button stays enabled and its content is complete even while the Taipei court catalogue is still loading (1.4s)
  ✓  254 [mobile-chromium] › tests/smoke.spec.js:5359:1 › the filter sheet traps Tab focus between its own first and last controls (232ms)

  4 skipped
  250 passed (2.3m)
```

### `npm run test:local`

exit 0；結尾：

```text
  ✓  51 [supabase-chromium] › tests/session.spec.js:2180:1 › N1 an existing zero-subscription account is never seeded by a later profile save (708ms)
  ✓  52 [supabase-chromium] › tests/session.spec.js:2199:1 › N2 an account that explicitly cleared every court stays at zero across later profile saves (1.1s)
  ✓  53 [supabase-chromium] › tests/session.spec.js:2226:1 › N3 a failing subscription seed never fails the profile save (716ms)

  11 skipped
  42 passed (1.4m)
```

未遇資料衝突，因此未執行獲授權的 `CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test`。

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
✓ 97 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-DNKhMJ1p.js   689.04 kB │ gzip: 195.61 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 1.04s
```

### `git diff --check`

```text
(no stdout)
EXIT_CODE=0
```

## 12. `git diff --stat` 與工作樹

`git diff --stat` 逐字輸出；Git 不列 untracked 新檔：

```text
 src/domainTypes.ts         |   2 +-
 src/pages/MessagesPage.tsx |  33 ++--
 src/sessionViews.js        | 379 ++++-----------------------------------------
 3 files changed, 45 insertions(+), 369 deletions(-)
```

新檔的 no-index stat：

```text
 /dev/null => src/pages/MePage.tsx | 832 ++++++++++++++++++++++++++++++++++++++
 1 file changed, 832 insertions(+)
```

另有本 untracked report。最終工作樹預期狀態：

```text
 M src/domainTypes.ts
 M src/pages/MessagesPage.tsx
 M src/sessionViews.js
?? docs/migration-reports/batch-4.md
?? src/pages/MePage.tsx
```

`src/main.js`、`index.html`、`src/session.css` 與 `tests/**` 最終皆零 diff。
