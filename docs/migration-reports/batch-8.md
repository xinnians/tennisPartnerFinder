# 批 8：附近球局抽屜遷移 React 回報

日期：2026-08-19（Asia/Taipei）

## 1. 結論

`renderNearbySessionsDrawer(root, options = {})` 的 export、參數解構、預設值、callback 語意與同步 commit 全數保留；`src/main.js` 與既有 tests 零修改。抽屜內容已由 strict TSX 的 `NearbySessionsDrawer` 接管，legacy adapter 仍負責焦點意圖、native listener、AbortController、pointer gesture 與 document Escape。

本批採「一個 legacy root 對應一個 React root＋generation keyed remount＋`flushSync`」：React root 只建立一次，每次 discovery publish 都以新 generation 重掛整棵抽屜內容。這保留 HEAD 的 full-detach 可觀察契約，而不是把高頻重繪偷偷改成 DOM identity／scroll preservation。

最終只改：

- `src/pages/NearbySessionsDrawer.tsx`（新增）
- `src/sessionViews.js`
- `docs/migration-reports/batch-8.md`（本回報）

`src/main.js`、`src/map.js`、`src/pins.js`、`src/sheets.js`、`src/modalIsolation.js`、`index.html`、`src/session.css`、`src/domainTypes.ts`、`.claude/rules/react-migration.md`、`tests/**` 均零 diff。未 commit、未 push；local gate 不需 reset DB。

## 2. 檔案位置與 adapter／mount 設計

元件放在 `src/pages/NearbySessionsDrawer.tsx`。理由是它掛在 index 的持久 map-page 節點，沒有 `mountSheet` surface 殼或 imperative sheet handle；它屬於 page-bound static mount，而非 `src/sheets/**`。

`sessionViews.js` 以既有頁面批慣例做 browser-only eager glob，Node unit 環境不解析 TSX：

```js
const nearbySessionsDrawerModules =
  typeof document === "undefined" ? {} : import.meta.glob("./pages/NearbySessionsDrawer.tsx", { eager: true });
const mountNearbySessionsDrawer =
  nearbySessionsDrawerModules["./pages/NearbySessionsDrawer.tsx"]?.mountNearbySessionsDrawer;
```

adapter 的時序為：

```text
rememberFocusedSessionCard(root)
→ mountNearbySessionsDrawer(root, view props)
→ flushSync React commit（generation remount）
→ 綁 toggle/card/CTA native listeners
→ wireDrawerInteractions（abort 舊 controller、建立新 controller、綁 pointer/document Escape）
→ restoreFocusedSessionCard(root)（rAF）
```

mount 端是 `WeakMap<HTMLElement, { generation, reactRoot }>`；第一次 `createRoot(root)`，之後只增加 generation 並同步 render：

```tsx
flushSync(() => {
  mounted.reactRoot.render(<NearbySessionsDrawer {...options} key={mounted.generation} />);
});
```

因此 adapter 返回時 `#nearby-sessions-toggle`、`#nearby-sessions-list` 與本次 props 的 DOM 已存在，main/controller 與 e2e 仍可在呼叫後同步查詢／互動。

## 3. 重繪模型選型：generation remount

### 選擇

採 generation remount，不採 keyed reconciliation。

### 與 HEAD 的逐項取捨

| 契約 | HEAD `root.innerHTML` | 本批 generation remount | 若採 reconciliation 的差異 |
| --- | --- | --- | --- |
| 子節點 identity | 每次全部 detach | 每次全部 detach | 相同 key 的卡片／scroll 容器會留在 DOM |
| 焦點 | active node detach，交給 intent＋rAF | 相同 | active node 可能仍 connected，會走既有 guard 的另一條分支 |
| stale card | 舊 card 必定不在 root | 相同 | 同 id card 可能被原地更新 |
| native listener | 無 signal 的 card/CTA listener 隨 node 消失 | 相同 | 若重用 node，會堆疊 listener，必須改寫生命週期 |
| `.nearby-drawer__scroll` | 每次是新 element，`scrollTop` 回 0 | 相同 | 會保留 scrollTop，是可觀察行為變更 |
| document Escape | 每次 `drawerBindings.abort()`＋重綁 | 相同，原函式未改 | 可做得到，但不能彌補上述 identity 差異 |

高頻 publish 下 generation remount 的成本是較多 DOM churn；但抽屜子樹有限，而且本批要求使用者可見行為零改變。選 reconciliation 雖可減少 churn，卻會改變焦點 connected guard、舊 trigger identity 與捲動位置，風險高於收益。React best-practices 指引也影響了實作邊界：元件全在 module scope、無 Effect、無 React 版 document listener；高頻外部事件仍由原 adapter 管理，不建立重複訂閱。

### quiet refresh 的焦點／捲動對照

- 焦點：HEAD 與本批都先記 `drawerFocusIntents`，重繪使舊 node detach，rAF 再聚焦同 session id；列消失則走 `drawerRecoveryTarget`，loading 暫態走 close/handle fallback。三輪專項與完整 desktop/mobile e2e 均綠。
- 捲動：HEAD 的 `root.innerHTML` 與本批新 generation 都重建 `.nearby-drawer__scroll`，quiet refresh 後 nested `scrollTop` 都回到初始 0；沒有引入「React 悄悄保留捲動」的差異。
- root 本體是 index 的持久 `#nearby-sessions-drawer`，兩版都不重建；main 的 static-root 假設維持。

## 4. 焦點、Escape 與 AbortController 契約

`rememberFocusedSessionCard`、`drawerFocusIntents`、`drawerLoadingFocusFallbacks`、`drawerRecoveryTarget`、`restoreFocusedSessionCard` 全數留在 legacy adapter，沒有複製進 TSX。

Escape 仍只在 `drawerState === "open"` 時掛 document listener，且逐字保留磁碟版兩層讓位：

```js
if (event.key !== "Escape") return;
if (document.querySelector("#sheet-root .surface, #modal-root .surface")) return;
if (event.defaultPrevented) return;
event.preventDefault();
collapse();
```

每次重繪仍由 `wireDrawerInteractions` 執行：

```js
drawerBindings.get(root)?.abort();
const bindings = new AbortController();
drawerBindings.set(root, bindings);
```

之後用該 signal 重綁 root pointer listeners、open 態 close/handle 與 document Escape。React 不註冊 Escape/pointer/card callbacks，因此 surface 優先序、capture-phase popover 消費與 event.defaultPrevented 禮讓沒有雙重 owner。

詳情 sheet 的 opener／close 焦點回復仍由既有 `mountSheet` 管；抽屜 generation redraw 若使 opener detach，`drawerFocusIntents` 仍提供同 session id 的 logical target。`open drawer: ... restores ... originating card` 與 `drawer-card focus survives ... logical sheet restore target` 各連跑三輪全綠。

## 5. DOM 與 helper 單一來源

React 輸出保留原兩個 sibling：peek（結果／loading／error button 或零結果 exit card）與 `section#nearby-sessions-list.nearby-drawer`。既有 id、class、testid、data attribute、aria、hidden、SVG path、日期 group sibling 結構、session card 元素順序與文案均保留。

`src/sessionViews.js` 的 frozen `nearbySessionsDrawerRuntime` 是跨 legacy／TSX 的單一 helper 來源：

```text
discoveryEmptyActions
drawerSessionGroups
sessionCardPresentation
taipeiDayWord
```

`sessionCardPresentation` 同時供既有 legacy `sessionCard()`（court session drawer）與 React nearby drawer 使用；NTRP、host label、候選球場縮寫、ongoing、instant、fee、vacancy、booked 與 time tile 判準沒有複製。`renderDiscoveryEmpty` 與 React empty state 也共用同一 action descriptor 清單。

顯式 `mapStatus: null` 在舊碼因 optional chaining 可安全落回 idle；TSX 以 `mapStatus ?? { kind: "idle", message: "" }` 保留此邊界，而不只覆蓋 main 的正常物件輸入。

另以同一 `.env.local` 啟動 HEAD 與本批 Vite，對八態做不落檔 browser probe：collapsed、open、empty、filtered empty、loading、error、warning、explicit null status。序列化器逐 element 比較 tag、排序後完整 attributes、非空 direct text 與 child element 順序；動態文字包含 `<`、`&`，候選局包含兩座球場。逐字結果：

```json
{
  "cases": [
    "collapsed",
    "open",
    "empty",
    "empty-filtered",
    "loading",
    "error",
    "warning",
    "null-status"
  ],
  "matched": 8,
  "mismatches": []
}
```

此 probe 不取代驗收方 390px 視覺比對；它補強 DOM 逐屬性／文字／結構等價證據。

## 6. Rider：`updateCourtSelect`／`selectedCourtValues`

先做歷史確認：

```text
$ git log --all --oneline -S'updateCourtSelect' -- src/sessionViews.js
3aa694b feat(react): 批 7——建局/編輯表單遷移 React,sync() 手寫 reconciliation 退役
0da7166 feat(design): 批 D5 v2 開球局全螢幕流程+成功頁
3768679 feat: add host decision and session editing flows
ce169b3 feat: add three-way session creation form
c3a2c8f feat: add session creation and recoverable auth intent

$ git log --all --oneline -S'selectedCourtValues' -- src/sessionViews.js
3aa694b feat(react): 批 7——建局/編輯表單遷移 React,sync() 手寫 reconciliation 退役
0da7166 feat(design): 批 D5 v2 開球局全螢幕流程+成功頁
3768679 feat: add host decision and session editing flows
ce169b3 feat: add three-way session creation form
c3a2c8f feat: add session creation and recoverable auth intent
```

批 7 是最近一次相關變動，表單 React 化後目前只剩兩個 function definition，無 caller。刪除後 executable reverse grep：

```text
$ rg -n "updateCourtSelect|selectedCourtValues" src scripts supabase tests
[no output] (exit 1: no matches)
```

全 repo 只剩 migration plan 的歷史 rider 文字，不是依賴／caller：

```text
docs/frontend-migration-plan-2026-08-18.md:151:  rider（併批 8）：updateCourtSelect/selectedCourtValues 已零 caller 的 dead code 清除。
```

## 7. 變更清單

- `src/pages/NearbySessionsDrawer.tsx`：strict TSX；peek/open、status、日期 groups、cards、empty exits；per-root generation mount＋`flushSync`。
- `src/sessionViews.js`：browser mount adapter、frozen nearby runtime、native wiring 保留；移除 drawer innerHTML presentation 與 rider 死碼。
- `docs/migration-reports/batch-8.md`：本回報。

刻意未改：main 的呼叫點／靜態 live region、map adapter、pins、sheet/modal isolation、CSS、HTML、tests、domain types 與 migration rule。

## 8. React 接管 canary 紅綠證據

canary 前先記：

```text
12918ba2a01959bb7eef3c9d1e5620f36651eab49fe224db72a665687cdb0d34  src/sessionViews.js
a1467312e71cbd49542df7f022023f24f159ee056e427ae4a7aeedba41ba1edd  src/pages/NearbySessionsDrawer.tsx
```

暫時把 mount 內：

```tsx
mounted.reactRoot.render(<NearbySessionsDrawer {...options} key={mounted.generation} />);
```

改為：

```tsx
mounted.reactRoot.render(null);
```

執行：

```bash
TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/smoke.spec.js \
  --project=desktop-chromium \
  --grep "anonymous map discovery renders only safe SessionSummary fields"
```

紅燈關鍵輸出逐字：

```text
Error: expect(locator).toBeVisible() failed
Locator: locator('#nearby-sessions-toggle')
Expected: visible
Error: element(s) not found
  1 failed
```

`grep 'failed|passed'` 逐字：

```text
    Error: expect(locator).toBeVisible() failed
  1 failed
```

還原同一行後，同命令綠燈：

```text
  ✓  1 [desktop-chromium] › tests/smoke.spec.js:160:1 › anonymous map discovery renders only safe SessionSummary fields (871ms)

  1 passed (1.7s)
```

`grep 'failed|passed'` 逐字：

```text
  1 passed (1.7s)
```

立即以原 SHA 檔執行 `shasum -a 256 -c`：

```text
src/sessionViews.js: OK
src/pages/NearbySessionsDrawer.tsx: OK
```

canary 後另補顯式 null 相容性，故最終 TSX SHA 與上述 canary 時點不同；這是正式變更，不是 canary 殘留。

## 9. 焦點／Escape `--repeat-each=3`

命令：

```bash
TENNIS_TEST_HARNESS_MODE=mock npx playwright test \
  tests/performance.spec.js tests/smoke.spec.js \
  --project=desktop-chromium --repeat-each=3 \
  --grep "a stale drawer card|a delayed discovery refresh|drawer redraws preserve|open drawer: opening a session detail|a top sheet consumes Escape|Escape closes an open level popover|a discovery rerender cannot let an underlying drawer|drawer-card focus survives"
```

每輪八項：stale card fallback、loading durable target、toggle/empty action redraw、detail close restore、sheet Escape、popover Escape、background rerender yield、logical sheet target。結尾逐字：

```text
  ✓  19 [desktop-chromium] › tests/performance.spec.js:333:1 › drawer redraws preserve a focused collapsed toggle and empty-state action (762ms)
  ✓  20 [desktop-chromium] › tests/smoke.spec.js:879:1 › open drawer: opening a session detail sheet and closing it restores the drawer and focus to the originating card (269ms)
  ✓  21 [desktop-chromium] › tests/smoke.spec.js:931:1 › a top sheet consumes Escape before the underlying nearby drawer (224ms)
  ✓  22 [desktop-chromium] › tests/smoke.spec.js:974:1 › Escape closes an open level popover before it reaches the open drawer beneath it (256ms)
  ✓  23 [desktop-chromium] › tests/smoke.spec.js:3109:1 › a discovery rerender cannot let an underlying drawer overtake a sheet modal (589ms)
  ✓  24 [desktop-chromium] › tests/smoke.spec.js:3131:1 › drawer-card focus survives discovery rerenders and remains a logical sheet restore target (902ms)

  24 passed (19.3s)
```

另一次完整 drawer 關鍵字矩陣為 `23 passed (18.5s)`，涵蓋 390×667 open geometry、swipe、close handle、map hit-testing、retry 與 empty exits。

## 10. Full-repo consumer sweep

### Production consumer chain

```text
src/main.js:91                                  import renderNearbySessionsDrawer
src/main.js:589                                 唯一 app 呼叫；#nearby-sessions-drawer
src/sessionViews.js:1438                        public adapter export
src/sessionViews.js:1459                        adapter → mountNearbySessionsDrawer
src/pages/NearbySessionsDrawer.tsx:321          mount export
src/pages/NearbySessionsDrawer.tsx:329          React render
```

### 被動到的 mount/runtime symbols

```text
src/sessionViews.js:28-30                       eager glob＋mount symbol
src/sessionViews.js:640                         sessionCardPresentation definition
src/sessionViews.js:1414                        drawerSessionGroups definition
src/sessionViews.js:1430-1435                   nearbySessionsDrawerRuntime export
src/sessionViews.js:1504                        discoveryEmptyActions definition
src/pages/NearbySessionsDrawer.tsx:7            runtime import
src/pages/NearbySessionsDrawer.tsx:79           lazy runtime resolve（避開 circular-init TDZ）
src/pages/NearbySessionsDrawer.tsx:102,137,157   presentation/group/empty consumers
```

### Existing direct test consumers（零修改）

```text
tests/smoke.spec.js:1708-1709                    import＋direct render
tests/smoke.spec.js:5228,5241                    import＋direct render
```

### 其他範圍

- `scripts/**`：無 consumer。
- `supabase/**`：無 consumer。
- `tests/performance.spec.js` 與大量 smoke/session 流程透過 main 間接覆蓋，沒有額外 symbol import。
- `docs/superpowers/plans/**` 有三份歷史規格文字；不是 executable consumer。

## 11. Bundle 前後對照

比較方式：從 `HEAD=fde89ff60153007442d0036eb09b60230f104088` 建獨立 temp tree，複製相同 `.env.local`，共用同一份 `node_modules` 後各跑 `npm run build`。React/react-dom 已自批 3 進 bundle，本批只增加 nearby drawer TSX，不應再出現首次引入 React 的 +40 kB gzip。

| | HEAD before | Batch 8 after | delta |
| --- | ---: | ---: | ---: |
| Vite main JS | 697.25 kB | 700.41 kB | +3.16 kB |
| Vite gzip | 197.83 kB | 198.58 kB | +0.75 kB |
| exact raw bytes | 697,247 | 700,411 | +3,164 |
| local `gzip -c` bytes | 197,112 | 197,892 | +780 |
| transformed modules | 102 | 103 | +1 |

CSS、HTML 與小 analytics chunk 不變。增幅約 raw 0.45%／gzip 0.40%，符合一個新 TSX module 與 presentation bridge，無異常膨脹。

before build 結尾：

```text
✓ 102 modules transformed.
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-Pqh9gnEG.js   697.25 kB │ gzip: 197.83 kB
✓ built in 810ms
```

after build 結尾：

```text
✓ 103 modules transformed.
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-8SSLlVBC.js   700.41 kB │ gzip: 198.58 kB
✓ built in 806ms
```

## 12. SHA-256 對照

Batch 開始：

```text
5270f2ef7ae45a314184cef9dda85c26c26b6c82582d38e645c4a51e3deaf8a7  src/sessionViews.js
b07659e94e6e8bbff95344a53fa0006cbd938258c96079ac11fec4d5d0e8cbf3  src/domainTypes.ts
3bef9149f70f295e28a01be40b8b1207e88b2913d58b53fb4690b1b1ddfa90a4  .claude/rules/react-migration.md
```

最終：

```text
12918ba2a01959bb7eef3c9d1e5620f36651eab49fe224db72a665687cdb0d34  src/sessionViews.js
0be9699dd6cd6ce168194cabc698b4c10c290167be5a6f29e2d7c329795a9d07  src/pages/NearbySessionsDrawer.tsx
b07659e94e6e8bbff95344a53fa0006cbd938258c96079ac11fec4d5d0e8cbf3  src/domainTypes.ts
3bef9149f70f295e28a01be40b8b1207e88b2913d58b53fb4690b1b1ddfa90a4  .claude/rules/react-migration.md
```

完整 `src/**` manifest 於開工與完工各以 sorted `find ... | shasum -a 256` 留存；差異只有預期的 `sessionViews.js` 與新增 `NearbySessionsDrawer.tsx`。domain types/rule hash 完全一致；凍結檔與 tests 的 `git diff --name-only HEAD -- ...` 無輸出。

## 13. 全部 gate 結尾輸出（逐字）

### `npm test`（含 pretest）

pretest：

```text
> tennis-partner-finder@0.1.0 pretest
> node scripts/generate-courts-seed.mjs --check

--check 通過:產出檔案與 data/courts.json 重生結果一致。
```

unit 結尾：

```text
1..246
# tests 246
# suites 0
# pass 246
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1852.283916
```

Playwright desktop＋mobile 結尾：

```text
  ✓  250 [mobile-chromium] › tests/smoke.spec.js:5183:1 › openFilterSheet mounts a dialog with six data-filter groups and closes on Escape (167ms)
  ✓  251 [mobile-chromium] › tests/smoke.spec.js:5220:1 › the filter sheet applies a district change immediately to the background drawer summary and keeps keyboard focus off body (176ms)
  ✓  252 [mobile-chromium] › tests/smoke.spec.js:5286:1 › closing and reopening the filter sheet three times does not stack delegated listeners on the shared sheet root (1.0s)
  ✓  253 [mobile-chromium] › tests/smoke.spec.js:5327:1 › the filter sheet button stays enabled and its content is complete even while the Taipei court catalogue is still loading (1.4s)
  ✓  254 [mobile-chromium] › tests/smoke.spec.js:5359:1 › the filter sheet traps Tab focus between its own first and last controls (243ms)

  4 skipped
  250 passed (2.4m)
```

### `npm run test:local`

API 結尾：

```text
1..2
# tests 2
# suites 0
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4303.714958
```

Supabase Chromium 結尾：

```text
  ✓  49 [supabase-chromium] › tests/session.spec.js:2036:1 › neutral counts stay hidden at zero and appear on all three surfaces once a session is played (2.9s)
  ✓  50 [supabase-chromium] › tests/session.spec.js:2156:1 › a brand-new account is subscribed to every active Taipei court when it first saves a profile (764ms)
  ✓  51 [supabase-chromium] › tests/session.spec.js:2180:1 › N1 an existing zero-subscription account is never seeded by a later profile save (743ms)
  ✓  52 [supabase-chromium] › tests/session.spec.js:2199:1 › N2 an account that explicitly cleared every court stays at zero across later profile saves (1.1s)
  ✓  53 [supabase-chromium] › tests/session.spec.js:2226:1 › N3 a failing subscription seed never fails the profile save (726ms)

  11 skipped
  42 passed (1.5m)
```

### `npm run typecheck`

```text
> tennis-partner-finder@0.1.0 typecheck
> tsc --noEmit
```

### `npm run lint`

```text
> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{ts,tsx}" vite.config.ts
```

### `npm run prettier:check`

```text
> tennis-partner-finder@0.1.0 prettier:check
> prettier --check "src/**/*.{ts,tsx}" vite.config.ts

Checking formatting...
All matched files use Prettier code style!
```

### `npm run build`

```text
vite v6.4.3 building for production...
transforming...
✓ 103 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-8SSLlVBC.js   700.41 kB │ gzip: 198.58 kB
✓ built in 806ms
```

500 kB chunk warning與 before 相同，未新增 warning 類型。

### `git diff --check`

```text
[no output] (exit 0)
```

## 14. `git diff --stat`／工作樹

報告落檔前，tracked diff 逐字：

```text
$ git diff --stat
 src/sessionViews.js | 184 ++++++++++++++++++----------------------------------
 1 file changed, 62 insertions(+), 122 deletions(-)
```

Git 不把 untracked 檔納入 `git diff --stat`；本批另有：

```text
?? src/pages/NearbySessionsDrawer.tsx              332 lines
?? docs/migration-reports/batch-8.md               本回報
```

最終 `git status --short`、stat、SHA 與 `git diff --check` 會在報告完成後再核對；不 stage、不 commit、不 push。
