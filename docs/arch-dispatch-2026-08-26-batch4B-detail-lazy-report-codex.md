# 批 4B 回報：SessionDetailSheet 重 lazy 化

- 日期：2026-08-26
- 派工單：`docs/arch-dispatch-2026-08-26-batch4B-detail-lazy.md`
- 開工狀態：working tree 乾淨；實際 HEAD `fa6a1a26992601a149a0046e5af318ccb0b6a0e7`，
  直接 parent 是 4A accepted `66c2920`。
- 結果：完成，無 BLOCKED；未 commit、未 push；新 chunk 與全部 gate 通過。

## 1. import 面遷移

### Before

```text
main.js eager import SessionDetailSheet.tsx
  → configureSessionViewModules({ appModule, mountSessionDetailSheetContent })
  → sessionViews.js module-scoped mount binding
  → sessionSurfaceViews lazyMounts.sessionDetail getter
  → openSessionSheet synchronous mount
```

### After

```text
sessionViews.js lazySurfaceLoaders["./sheets/SessionDetailSheet.tsx"]
  → preloadSessionDetailSheet (createMountPreloader)
  → mountSessionDetailSheetContent assignment
  → unchanged lazyMounts.sessionDetail getter
  → openSessionSheet loaded branch synchronous mount
```

- `main.js` eager 清單只剩 `import * as appModule from "./app/App.tsx"`；configure bag 縮為
  `{ appModule }`。
- `lazySurfaceLoaders` 使用 C 群指定的逐字樣板：
  `"./sheets/SessionDetailSheet.tsx": () => import("./sheets/SessionDetailSheet.tsx")`。
- `preloadSessionDetailSheet` 走既有 `createMountPreloader`，不建立第二套 loader/cache。
- manifest 單點更新：`eagerModules` 2→1，`lazySheets` 13→14；其餘欄位不動。
- lifecycle eager scan 只移除 `sheets/SessionDetailSheet` regex 分支；其餘斷言不動。

## 2. defer 分支與同步 Escape 設計

未載入時新增：

```js
return deferSurfaceOpen({
  id: "session-sheet",
  label: "球局詳情",
  className: "session-detail-sheet",
  load: preloadSessionDetailSheet,
  methods: ["setJoinPreview", "enterConfirming"],
  onClose,
  open: () => openSessionSheet(session, {/* 解構後的全部原 options */}),
});
```

- `handleEscape` 不進 methods：loading shell 沒有 confirming content，Escape 由現有
  `mountSheet` 同步關閉；loaded branch 的原 `onEscape: () => content?.handleEscape() ?? false`
  closure 完全未改，仍在同一 keydown call stack 回傳。
- `initialStage` 與 replay 保留兩條管道：呼叫起點的 `initialStage` 原樣帶入 recursive
  `openSessionSheet`，所以 content 首次 render 就是指定 stage；loading 期間對 handle 呼叫的
  `setJoinPreview`／`enterConfirming` 才走既有 FIFO `pendingCalls`，在 `open()` 完成後 replay。
- recursive bag 明列簽名解構後的 21 個 option 值，沒有 rest、沒有漏掉 callbacks/defaults。
- `deferSurfaceOpen` 的 `live`、`replacing`、`pendingCalls` 本體零 diff。

## 3. 預熱設計

採 intent preload，不採 map-idle 或 authenticated-wide warm：

```js
if (target.closest('[data-testid="session-card"], [data-open-my-session], [title^="球局 · "]'))
  warmView(preloadSessionDetailSheet);
```

- 公開 Nearby 卡片 selector 來自 `SessionCard.tsx:42-43`：`data-testid="session-card"`＋
  `data-session-id`。
- My Sessions 的查看按鈕來自 `MySessionsPage.tsx:216-218`：`data-open-my-session`。
- 單一／候選／cluster map pin title 來自 `map.ts:507-509`：都以 `球局 · ` 開頭；
  Fake Maps 也把 title 放到可 focus button，行為 oracle 可真觸發 delegation。
- 既有 document-level `pointerover`／`focusin` listener 在 auth gate 外；匿名卡片與 pin 因此同樣
  預熱。`authenticatedViewPreloads` 未加入 detail，避免登入後無意圖下載 4.85 kB gzip chunk。
- 這符合 React best-practices 的 conditional dynamic import 與 hover/focus intent preload；
  不把 chunk 塞回 main。

## 4. Race oracle 與 canary

### 4.1 新 oracle

`tests/react-unmount.spec.js` 以 Playwright route 暫停真實
`/src/sheets/SessionDetailSheet.tsx` Vite module request，沒有 sleep 或 production test hook：

1. pending load 時 Escape 關 loading shell；release 後 `#session-sheet` 與
   `[data-join-stage]` 仍為 0，證明無 late-mount。
2. load 前呼叫 `setJoinPreview`、`enterConfirming`；release 後 stage 為 confirming、preview
   出現「排隊球友」，再以兩次 Escape 驗 confirming→idle→close。
3. loading shell replacement 前後 `onClose` 都是 0；真正 Escape close 後恰為 1。
4. 匿名 Nearby session card hover 會發出 detail module request，但不會開 sheet。
5. 匿名 map session pin focus 也會發出 detail module request，但不會開 sheet。

完整 mock 在 desktop/mobile 各跑一次，新測共 +10 passed。

### 4.2 loaded confirming 既有 oracle

`tests/session.spec.js:218-261` 的
`anonymous Join resumes the same live target as a confirmation, never an automatic request` 未改；
本批 `test:local` 實跑通過。它驗 `initialStage="confirming"`，第一次 Escape 只回 idle，
第二次才關閉並清 intent。

### 4.3 destructive canary 三拍逐字輸出

破壞：暫時把 methods 改成 `methods: ["setJoinPreview"]`。

紅（exit 1）：

```text
$ TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/react-unmount.spec.js --project=desktop-chromium --grep "detail commands queued during loading"
Running 1 test using 1 worker

✘  1 [desktop-chromium] › tests/react-unmount.spec.js:143:1 › detail commands queued during loading replay into the replacement once (316ms)

1) [desktop-chromium] › tests/react-unmount.spec.js:143:1 › detail commands queued during loading replay into the replacement once

  Error: page.evaluate: TypeError: detail.enterConfirming is not a function
      at eval (eval at evaluate (:303:30), <anonymous>:22:12)
      at async <anonymous>:329:30
      at /Users/ian/tennisPartnerFinder/tests/react-unmount.spec.js:148:14

1 failed
  [desktop-chromium] › tests/react-unmount.spec.js:143:1 › detail commands queued during loading replay into the replacement once
exit 1
```

byte-identical 還原：

```text
$ shasum -a 256 src/views/sessionSurfaceViews.js
f346c1e2c7276df5097c34ac58bdf75232a7a7187d453e7787f1b075520a9943  src/views/sessionSurfaceViews.js
```

綠（exit 0）：

```text
$ TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/react-unmount.spec.js --project=desktop-chromium --grep "detail commands queued during loading"
Running 1 test using 1 worker

✓  1 [desktop-chromium] › tests/react-unmount.spec.js:143:1 › detail commands queued during loading replay into the replacement once (285ms)

1 passed (1.0s)
exit 0
```

## 5. 深連結自證

冷載入既有 spec 原檔零 diff，單跑結果：

```text
$ TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/navigation-shell-smoke.spec.js --project=desktop-chromium --grep "a hash session link opens its detail"
Running 1 test using 1 worker

✓  1 [desktop-chromium] › tests/navigation-shell-smoke.spec.js:3:1 › a hash session link opens its detail, copies a stable share link, and gives an empty state when unavailable (1.2s)

1 passed (2.0s)
exit 0
```

`#/session/9001` 最終顯示球場、copy-link 與 unavailable fallback 均保留；loading 中繼態不弱化
最終呈現斷言。

## 6. Bundle 三組對照

| 指標                    | 4A accepted baseline |      4B |      淨值 | gate／結果     |
| ----------------------- | -------------------: | ------: | --------: | -------------- |
| main raw                |              652,480 | 637,109 | −15,371 B | ≤658,867，通過 |
| main gzip               |              190,514 | 186,862 |  −3,652 B | ≤192,420，通過 |
| total JS raw            |              838,388 | 839,733 |  +1,345 B | ≤849,961，通過 |
| total JS gzip           |              255,413 | 257,010 |  +1,597 B | ≤259,062，通過 |
| SessionDetail lazy raw  |  eager／無獨立 chunk |  16,054 |  新 chunk | ≤18,000，通過  |
| SessionDetail lazy gzip |  eager／無獨立 chunk |   4,850 |  新 chunk | ≤5,500，通過   |

如實說明：main 成功釋回 3,652 B gzip，但 total 增加 1,597 B gzip；拆分後新增
SessionDetail chunk、共用 Avatar chunk（531／344）與各 chunk 壓縮邊界成本，所以不能宣稱總量下降。
總量仍有 2,052 B gzip gate 餘裕。largest app lazy 仍是 MySessionsPage
16,476／4,829，SessionDetail 沒有取代它且未超 gate。

## 7. `__importAppModule` 對帳

```text
66c2920 baseline: 107
working tree:      110
delta:              +3
```

增加三筆是三個 race oracle 在獨立 page context 直接開 detail；第四、第五個匿名 intent oracle
分別走真 UI card hover／pin focus，不使用 importer。production importer/export 沒有增加或換拼法。

## 8. 凍結面自證

- `git diff 66c2920 -- src/sheets/SessionDetailSheet.tsx` 無輸出；本體 SHA-256 為
  `86b9a293c0728b04e56e716d7785bde43124fc78350335994e7efe34409adaa3`。
- `src/sheets.js`、`deferSurfaceOpen` 本體、`registerDetailContent` callback 均零 diff。
- `sessionSurfaceViews.js` 在新增 defer early-return 後，原 venue/content/mountSheet/onEscape/
  `initialStage`/handle return 本體零 diff。
- lifecycle F 群仍以 `readFileSync` 掃凍結 TSX，targeted unit `6/6` 全綠；A/B/E 群無改。
- `session-sheet`、`data-join-stage`、testid、文案、route、syncCommit caller 均未改。
- MySessions／Messages／Nearby／Me 與其他 sheet production 本體零 diff。

## 9. Codex 五問

### 1. SessionDetail 是否真的退出 main？

是。main eager import 與 configure mount bag 都刪除；manifest eager 只剩 App；production build
產生獨立 `SessionDetailSheet-*.js` 16,054／4,850，main gzip 實降 3,652 B。

### 2. 同步 Escape 與 initialStage 是否保真？

是。Escape 沒有被排隊；loaded closure 零 diff。`initialStage` 原樣走 recursive options，
外部 commands 才 FIFO replay。mock race 與 local confirming 兩段 Escape 都實跑通過。

### 3. 匿名常見路徑是否會預熱？

會。intent delegation 在 auth gate 外，涵蓋 Nearby session card、My Sessions detail button 與
title 以「球局 · 」開頭的 map pin；匿名卡片 hover 與 pin focus oracle 均證明 request 發生且不開 sheet。

### 4. 效能與測試代價是否透明？

是。main 顯著下降但 total 增加 1,597 B gzip，已完整列出；所有 bundle gate 仍通過。
測試新增 5 條、mock 288→298 passed，`__importAppModule` 因三個 race context 107→110。

### 5. 對批 4C 殼 React 化的建議——特別是 mountSurface 五責任的遷移順序與每類 canary

建議先建 typed surface registry／close reason contract，但只做 read-only shadow 對帳；每一階段再把
一項責任原子切給 React，舊 owner 同批停用，避免雙 keydown listener 或雙 focus restore。順序：

1. **close／replacement／unmount 時序**：先搬 `closed` idempotence、registerUnmount、
   unmount-before-DOM-clear、replace 不 restore。這是其餘責任的生命週期地基。Canary：故意交換
   unmount/clear 順序或移除 closed guard，`react-unmount` 必須抓到重複／漏 unmount；pending async
   result 關閉後不得復活。
2. **DOM shell／backdrop／isolation**：React 接手相同 root、id、class、role、aria-modal、aria-label、
   dismiss/close controls；同階段搬 `pushSurfaceIsolation` acquire/release。Canary：逐字 DOM/aria
   snapshot＋backdrop/close button 各關一次；開啟時背景 inert，replace/close 後 isolation 恰 release。
3. **surface stack 與 topmost Escape**：registry 穩定後再搬 document capture listener與 top-of-stack
   判定，保留 `preventDefault`＋`stopPropagation` 與 content `onEscape()` 同步 consume。Canary：疊兩層
   只關頂層；confirming 第一次只回 idle；破壞 top check 時底層被同一 Escape 關掉而紅。
4. **Tab focus trap**：依賴已完成的 topmost ownership，搬可 focus 篩選、首尾循環、零 control 時
   focus surface。Canary：Tab/Shift+Tab 首尾雙向、hidden control 排除、零 control fallback；疊層時
   底層不可搶 focus。
5. **restore focus**：最後搬 capture/resolve，因它同時依賴 close reason、replacement、stack 與 drawer
   DOM 已穩定。Canary 分四類：原 node仍連線；卡片 replacement 以 sessionId 找回；抽屜卡消失走
   collapse/toggle fallback；非抽屜 trigger 消失不得誤送到 drawer，`restoreFocus:false` 必須不移焦。

4C 每一類先在一種 sheet＋一種 dialog 做 parity，再擴到全部 14 surface；不要同批移除批 5 的
`SurfaceHost.commitSynchronously`。loading shell replacement 的 `onClose` guard 與本批 race oracle應
保留成殼遷移的固定回歸。

## 10. 收尾標準矩陣逐字輸出

### Typecheck

```text
$ npm run typecheck

> tennis-partner-finder@0.1.0 typecheck
> tsc --noEmit

exit 0
```

### Lint

```text
$ npm run lint

> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts

exit 0
```

### Prettier

```text
$ npm run prettier:check

> tennis-partner-finder@0.1.0 prettier:check
> prettier --check "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts package.json package-lock.json tsconfig.json vercel.json

Checking formatting...
All matched files use Prettier code style!
exit 0
```

### Build

```text
$ npm run build
vite v6.4.3 building for production...
✓ 508 modules transformed.
dist/assets/Avatar-BYsCHBca.js                               0.53 kB │ gzip:  0.34 kB
dist/assets/CreateSessionSheet-BVCj3PWg.js                  15.23 kB │ gzip:  4.54 kB
dist/assets/MePage-D0aceAcD.js                              15.47 kB │ gzip:  4.95 kB
dist/assets/SessionDetailSheet-BPUmzumi.js                  16.05 kB │ gzip:  4.85 kB
dist/assets/MySessionsPage-Ik85aNDZ.js                      16.48 kB │ gzip:  4.83 kB
dist/assets/sentryBrowserSdk-Czz5dmkg.js                    87.98 kB │ gzip: 29.72 kB
dist/assets/index-Bv0kd40q.js                              637.11 kB │ gzip: 186.86 kB
✓ built in 1.22s
exit 0
```

### Production bundle

```text
$ npm run check:production-bundle

> tennis-partner-finder@0.1.0 check:production-bundle
> node scripts/check-production-bundle.mjs

production bundle check passed: development E2E hook present, production E2E hook absent; 32 files, 12 demo identifiers absent; main 637109/186862 within 658867/192420; largest app lazy MySessionsPage-Ik85aNDZ.js 16476/4829 within 18000/5500; total JS 839733/257010 within 849961/259062; private repository: privateDataRepository-C2yVuhUx.js; Sentry: sentryBrowserSdk-Czz5dmkg.js
exit 0
```

### Mock（含 unit）

第一次 final run 撞到 roadmap 已立案的 `chat-settings-filters-smoke.spec.js:468` 一次性
filter-sheet flake；desktop `[data-filter]` 暫時是空集合，同輪 mobile 與其餘 297 條通過：

```text
1 failed
  [desktop-chromium] › tests/chat-settings-filters-smoke.spec.js:468:1 › openFilterSheet mounts a dialog with six data-filter groups and closes on Escape
4 skipped
297 passed (52.8s)
exit 1
```

依派工單完整重跑，最終：

```text
$ npm run test:mock
# tests 336
# suites 0
# pass 336
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 3465.198833

  4 skipped
  298 passed (51.4s)
exit 0
```

### Local

未撞資料污染，未 reset。

```text
$ npm run test:local
# tests 2
# suites 0
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 6964.733292

  11 skipped
  45 passed (1.3m)
exit 0
```

### Whitespace

```text
$ git diff --check
(no output)
exit 0
```

### 範圍自證

```text
$ git diff --stat
 ...-2026-08-26-batch4B-detail-lazy-report-codex.md | 399 +++++++++++++++++++++
 src/main.js                                        |   6 +-
 src/sessionViews.js                                |  12 +-
 src/views/sessionSurfaceViews.js                   |  37 +-
 tests/fixtures/surfaceManifest.js                  |   3 +-
 tests/react-surface-lifecycle.test.js              |   6 +-
 tests/react-unmount.spec.js                        | 149 ++++++++
 7 files changed, 601 insertions(+), 11 deletions(-)
```

## 11. 未做／疑義／BLOCKED

- 未做：`SessionDetailSheet.tsx` 本體、`deferSurfaceOpen` 機制、`sheets.js`／4C、其他 sheet、
  syncCommit／批 5、UX／文案／CSS、依賴或 bundle gate 調整。
- 疑義：派工預估 main gzip 釋回約 4–5 KB，實測為 3,652 B；原因是 Rollup 把 Avatar
  抽成共享 chunk且壓縮邊界改變。這不是 gate failure，但 total gzip +1,597 B 必須帶入 4C
  的 bundle 餘裕判斷。
- BLOCKED：無。
