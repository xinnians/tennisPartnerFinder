# 批 8.2：篩選 sheet 遷移 React＋players key rider 回報

日期：2026-08-19（Asia/Taipei）

## 1. 結論

`openFilterSheet(options)` 的公開簽名、預設值、同步建立語意與回傳 handle 已凍結，內容改由 strict TSX 的 `src/sheets/FilterSheet.tsx` 接管：

```text
return { ...mounted, setFilters, setResultCount }
```

`mountSheet` 仍唯一負責 `#sheet-root`、backdrop、`section.surface`、focus trap、capture-phase Escape、surface stack、關閉、isolation 與 opener 焦點回復。React 只掛進 `mounted.surface` 的 child list。

`setFilters(nextFilters)` 與 `setResultCount(count)` 都透過 content ref 推 React state，並由 mount adapter 用 `flushSync` 包住；方法返回時 DOM 已更新。既有 `syncControls()` 與 native delegated listener 已退役。

Rider 只改 `src/sheets/CourtPlayersSheet.tsx` 的 React key：有 id 與缺 id 分別使用 `id:`／`missing:` 命名空間，避免 fallback index 與真實 id 相撞；該檔其餘零改動。

`src/main.js`、`src/sessionController.js`、`src/sheets.js`、`src/modalIsolation.js`、CSS、HTML 與 `tests/**` 均零 diff。未 commit、未 push；本批未執行 DB reset。

## 2. 殼／內容／handle 責任分界

factory 仍先同步建立原殼：

```js
const mounted = mountSheet({
  id: "filters-sheet",
  label: "篩選球局",
  className: "filter-sheet",
  onClose,
  html: "",
});
```

接著同步掛內容：

```text
#sheet-root                              mountSheet 擁有
├─ .surface-backdrop                    mountSheet 擁有
└─ #filters-sheet.surface.filter-sheet  mountSheet 擁有
   ├─ .filter-sheet__grabber            React 內容
   ├─ .surface__head                    React 內容
   ├─ .filter-sheet__scroll             React 內容
   └─ .filter-sheet__footer             React 內容
```

`createRoot(mounted.surface)` 只發生一次；初次 render 用 `flushSync`，所以 factory 返回時六組 controls 與初始選中態都已存在。React close/apply handlers 只呼叫 `mounted.close()`；真正的 closed guard、stack remove、Escape listener remove、isolation release、root teardown、`onClose({ reason })` 與 focus restore 仍在 `mountSheet`。

content contract：

```ts
interface FilterSheetContentContract {
  setFilters(filters): void;
  setResultCount(count): void;
}
```

factory 沒有把 content contract 擴張到公開 handle，只逐一轉送原本就存在的兩個方法。

## 3. `syncControls()` → React state 對映表

| 舊 imperative 寫入 | React state／render | 凍結結果 |
| --- | --- | --- |
| `currentFilters = cloneSheetFilters(filters)` | lazy `useState(() => cloneSheetFilters(initialFilters))`＋latest ref | 初始 clone/default 語意不變 |
| date buttons `classList.toggle("is-selected")` | `(value || null) === filters.dateKey` | class 與 `aria-pressed` 同步 |
| band buttons `classList.toggle("is-active")` | `band.key === filters.band` | `is-active` 與 `aria-pressed` 同步 |
| types set `.has(value)` | `filters.types.has(type)` | multi-select 與 callback Set 不變 |
| districts set `.has(value)` | `filters.districts.has(name)` | 12 區 multi-select 不變 |
| reset clone default＋`onReset()` | commit cloned `DEFAULT_FILTER_STATE` 後呼叫 `onReset()` | 不關 sheet、全部 controls 回預設 |
| apply branch `mounted.close()` | React `onClick={onClose}`，adapter 傳 `mounted.close` | 只關 sheet，沒有另一次套用 |
| query count span＋`textContent` | 獨立 `resultCountLabel` state | 只更新 `[data-filter-count]` 文字 |

日期的「不限」仍以 `data-value=""` 對應 `dateKey=null`；band fallback 仍為 `"all"`；types／districts 仍每次產生新 Set。`instantOnly` 仍沒有 sheet control，也未被 sheet state 讀寫。

初始 footer 保留 `String(resultCount)`；imperative `setResultCount` 保留逐字正規化：

```ts
String(Math.max(0, Number(count) || 0))
```

## 4. 局部更新、焦點與 listener 生命週期

filters 與 result count 是兩份獨立 state。`FilterControls` 是 module-scope `memo` component；它收到穩定的 `handleSelect` callback。`setResultCount` 不改 filters object，因此 controls component 不 re-render，React 只更新 footer count text node。

`setFilters` 會重算四類 selected props，但所有 buttons 使用穩定 key、相同 element type 與相同位置，React reconciliation 保留既有節點；聚焦 chip 不 detach。這符合 sheet 批規則的局部更新紀律。

同步 handle／identity probe 逐字：

```json
{
  "afterCount": {
    "count": "0",
    "chipIdentity": true,
    "controlsIdentity": true,
    "focusStayed": true
  },
  "afterFilters": {
    "date": "true",
    "band": "true",
    "type": "true",
    "district": "true",
    "oldDistrict": "false",
    "focusedNodeIdentity": true
  }
}
```

舊版每次 open 在 `mounted.surface` 綁一個 native click delegation。新版由當次 React root 的事件系統接線；沒有 document／`#sheet-root` global listener，也沒有 Effect。surface 關閉後整個 event root 隨 detached surface 失去可達性，下一次 open 建立新 surface/root；三次開關專測仍只收到一次 callback。

React best-practices skill 對本批的具體影響：互相獨立的 state 分離、controls 用 memo 隔離 count refresh、callbacks 用 `useCallback` 保持 primitive/stable dependency、components 全在 module scope、直接 import leaf modules，沒有 barrel、Effect 或額外 global listener。

## 5. DOM 逐屬性 probe

以 `HEAD=44a8fdcd9b56ff6eb3797f48e54ded2b539ed31b` 建獨立 worktree，HEAD/current 各啟一個 Vite。probe 對每個 element 比較 tag、排序後完整 attributes、直接文字（只正規化 whitespace）及 child element 順序。

案例涵蓋預設態、四類已有選中值＋result count、再經 `setFilters`／`setResultCount(-4)` 的 imperative 態：

```json
{
  "cases": [
    "defaults",
    "selected",
    "imperative"
  ],
  "matched": 3,
  "mismatches": []
}
```

因此 grabber、FILTERS head、四 fieldsets、六個 `data-filter` groups、classes、data attributes、aria、文案與 element tree 均和 HEAD 一致。

## 6. Rider：CourtPlayers key

唯一改動：

```tsx
key={player.profileId == null ? `missing:${index}` : `id:${presentation.id}`}
```

兩個 prefix 令 fallback 與 id key namespace 不相交；DOM attributes/testid 沒有變更。相關 Nearby／CourtPlayers 原測試逐字：

```text
  ✓  1 [desktop-chromium] › tests/smoke.spec.js:3131:1 › drawer-card focus survives discovery rerenders and remains a logical sheet restore target (939ms)
  ✓  2 [desktop-chromium] › tests/smoke.spec.js:3154:1 › player drawer and card escape every public value and render self and empty invitation states (1.2s)
  ✓  3 [desktop-chromium] › tests/smoke.spec.js:4618:1 › mock online layer uses presence pins while the full directory list opens cards and invitations (1.6s)

  3 passed (4.5s)
```

## 7. React 接管 canary：紅 → 綠

canary 前 SHA：

```text
41176d80b688a25c8eb8bca7e178f54a70f3309631153452b88d6514166a6680  src/sessionViews.js
3bd926151593bce63e98354cc924756540b5380120237cc58b98416fa97d9e6b  src/sheets/FilterSheet.tsx
6fb72e8d4dd2dfcc548408c5ff64eeffb8cdacfe90441cb2fe76f1a9f7414ddb  src/sheets/CourtPlayersSheet.tsx
```

暫時把 content mount 改成 `reactRoot.render(null)`，執行真正斷言 filter head／groups 的原測試：

```bash
TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/smoke.spec.js \
  --project=desktop-chromium \
  --grep "openFilterSheet mounts a dialog with six data-filter groups"
```

紅燈逐字：

```text
Error: expect(locator).toHaveText(expected) failed

Locator: locator('#filters-sheet').locator('h2')
Expected: "篩選球局"
Error: element(s) not found

  1 failed
```

逐字還原後同命令：

```text
  ✓  1 [desktop-chromium] › tests/smoke.spec.js:5183:1 › openFilterSheet mounts a dialog with six data-filter groups and closes on Escape (225ms)

  1 passed (1.1s)
```

還原 SHA check：

```text
src/sessionViews.js: OK
src/sheets/FilterSheet.tsx: OK
src/sheets/CourtPlayersSheet.tsx: OK
```

## 8. 五條 filter 專測 `--repeat-each=3`

命令：

```bash
TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/smoke.spec.js \
  --project=desktop-chromium \
  --grep "openFilterSheet mounts|the filter sheet applies|closing and reopening the filter sheet|the filter sheet button stays enabled|the filter sheet traps Tab focus" \
  --repeat-each=3
```

逐字結尾：

```text
  ✓  11 [desktop-chromium] › tests/smoke.spec.js:5183:1 › openFilterSheet mounts a dialog with six data-filter groups and closes on Escape (207ms)
  ✓  12 [desktop-chromium] › tests/smoke.spec.js:5220:1 › the filter sheet applies a district change immediately to the background drawer summary and keeps keyboard focus off body (182ms)
  ✓  13 [desktop-chromium] › tests/smoke.spec.js:5286:1 › closing and reopening the filter sheet three times does not stack delegated listeners on the shared sheet root (533ms)
  ✓  14 [desktop-chromium] › tests/smoke.spec.js:5327:1 › the filter sheet button stays enabled and its content is complete even while the Taipei court catalogue is still loading (1.4s)
  ✓  15 [desktop-chromium] › tests/smoke.spec.js:5359:1 › the filter sheet traps Tab focus between its own first and last controls (242ms)

  15 passed (10.2s)
```

## 9. Consumer sweep

### Public factory／production

```text
src/sessionViews.js:2994  openFilterSheet export
src/main.js:77            import
src/main.js:111           activeFilterSheet handle slot
src/main.js:542           唯一 production factory caller
src/main.js:536           active handle setFilters consumer
src/main.js:549           onClose 清空 active handle
src/main.js:588           active handle setResultCount consumer
src/main.js:1277          openFilters() 回傳 handle 的 assignment
```

`src/main.js:1276` 是 `#filter-sheet-open` click listener 起點；factory options/callback wiring 留在 `openFilters()`。

### Existing direct e2e consumers（零修改）

```text
tests/smoke.spec.js:5188,5192  import＋direct open（內容/Escape）
tests/smoke.spec.js:5228,5249  import＋direct open（背景 summary/focus）
tests/smoke.spec.js:5293,5298  import＋direct repeated open（listener）
tests/smoke.spec.js:5327       catalogue loading，經 main 入口
tests/smoke.spec.js:5359       Tab trap，經 main 入口
```

### New internal mount

```text
src/sessionViews.js:54-56       browser-only eager glob＋mount symbol
src/sessionViews.js:3010       adapter mount call
src/sheets/FilterSheet.tsx:269 mountFilterSheetContent export
```

`scripts/**`、`supabase/**` 無 consumer。歷史 migration plan／superpowers plan 只有說明文字，不是 executable caller。

## 10. 變更清單

- `src/sheets/FilterSheet.tsx`（新增，286 lines）：完整 filter content、兩份 React state、imperative content contract、memo controls。
- `src/sessionViews.js`：保留公開 factory，改為 mount adapter；移除 string template、`currentFilters`、`syncControls()`、native delegation 與已搬移的 private options/helpers。
- `src/sheets/CourtPlayersSheet.tsx`：僅 key expression rider。
- `docs/migration-reports/batch-8.2.md`：本回報。

刻意未改：main、controller、sheet primitives、modal isolation、map/pins、HTML、CSS、domain types、migration rules、tests。

## 11. Bundle 前後對照

同一工作樹依序在批 8.2 前後執行 `npm run build`，所有數字本批重算：

| | Batch 8.1 HEAD | Batch 8.2 | delta |
| --- | ---: | ---: | ---: |
| transformed modules | 107 | 108 | +1 |
| Vite main JS | 701.84 kB | 702.51 kB | +0.67 kB |
| Vite gzip | 198.91 kB | 199.08 kB | +0.17 kB |
| exact raw bytes | 701,836 | 702,513 | +677 |
| local `gzip -c` bytes | 198,230 | 198,395 | +165 |

before：

```text
✓ 107 modules transformed.
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-BMY2vjV3.js   701.84 kB │ gzip: 198.91 kB
✓ built in 970ms
```

after：

```text
✓ 108 modules transformed.
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-C6rdIkeQ.js   702.51 kB │ gzip: 199.08 kB
✓ built in 879ms
```

新增一個 FilterSheet module；移除 legacy markup/sync code 抵銷大部分 TSX，無異常膨脹。既有 500 kB warning 類型與 before 相同。

## 12. SHA-256 對照

Batch 開始：

```text
572158e67047e2f6375006c315127ca21fa9a213165d44793e1dfdbb2bee2b2e  src/sessionViews.js
3ebca317312b6a9fec192262bca93f8ad5644fb77d40c4e84b2b559c506066ca  src/sheets/CourtPlayersSheet.tsx
b07659e94e6e8bbff95344a53fa0006cbd938258c96079ac11fec4d5d0e8cbf3  src/domainTypes.ts
3bef9149f70f295e28a01be40b8b1207e88b2913d58b53fb4690b1b1ddfa90a4  .claude/rules/react-migration.md
```

最終：

```text
41176d80b688a25c8eb8bca7e178f54a70f3309631153452b88d6514166a6680  src/sessionViews.js
3bd926151593bce63e98354cc924756540b5380120237cc58b98416fa97d9e6b  src/sheets/FilterSheet.tsx
6fb72e8d4dd2dfcc548408c5ff64eeffb8cdacfe90441cb2fe76f1a9f7414ddb  src/sheets/CourtPlayersSheet.tsx
b07659e94e6e8bbff95344a53fa0006cbd938258c96079ac11fec4d5d0e8cbf3  src/domainTypes.ts
3bef9149f70f295e28a01be40b8b1207e88b2913d58b53fb4690b1b1ddfa90a4  .claude/rules/react-migration.md
```

完整 sorted `src/**` path-keyed manifest diff 只有：

```text
src/sessionViews.js               modified
src/sheets/CourtPlayersSheet.tsx  modified
src/sheets/FilterSheet.tsx        added
```

凍結檔 `git diff --name-only HEAD -- ...` 無輸出。

## 13. 完整 gate 結尾輸出（逐字）

### `npm test`（含 pretest）

```text
> tennis-partner-finder@0.1.0 pretest
> node scripts/generate-courts-seed.mjs --check

--check 通過:產出檔案與 data/courts.json 重生結果一致。
```

unit：

```text
1..246
# tests 246
# suites 0
# pass 246
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1823.5495
```

desktop＋mobile：

```text
  ✓  250 [mobile-chromium] › tests/smoke.spec.js:5183:1 › openFilterSheet mounts a dialog with six data-filter groups and closes on Escape (190ms)
  ✓  251 [mobile-chromium] › tests/smoke.spec.js:5220:1 › the filter sheet applies a district change immediately to the background drawer summary and keeps keyboard focus off body (200ms)
  ✓  252 [mobile-chromium] › tests/smoke.spec.js:5286:1 › closing and reopening the filter sheet three times does not stack delegated listeners on the shared sheet root (540ms)
  ✓  253 [mobile-chromium] › tests/smoke.spec.js:5327:1 › the filter sheet button stays enabled and its content is complete even while the Taipei court catalogue is still loading (1.4s)
  ✓  254 [mobile-chromium] › tests/smoke.spec.js:5359:1 › the filter sheet traps Tab focus between its own first and last controls (236ms)

  4 skipped
  250 passed (2.2m)
```

### `npm run test:local`

API：

```text
1..2
# tests 2
# suites 0
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4464.065625
```

Supabase Chromium：

```text
  ✓  50 [supabase-chromium] › tests/session.spec.js:2156:1 › a brand-new account is subscribed to every active Taipei court when it first saves a profile (878ms)
  ✓  51 [supabase-chromium] › tests/session.spec.js:2180:1 › N1 an existing zero-subscription account is never seeded by a later profile save (850ms)
  ✓  52 [supabase-chromium] › tests/session.spec.js:2199:1 › N2 an account that explicitly cleared every court stays at zero across later profile saves (1.2s)
  ✓  53 [supabase-chromium] › tests/session.spec.js:2226:1 › N3 a failing subscription seed never fails the profile save (810ms)

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
✓ 108 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-C6rdIkeQ.js   702.51 kB │ gzip: 199.08 kB
✓ built in 879ms
```

### `git diff --check`

```text
[no output] (exit 0)
```

## 14. `git diff --stat`／工作樹

tracked stat（報告落檔前）：

```text
 src/sessionViews.js              | 182 +++------------------------------------
 src/sheets/CourtPlayersSheet.tsx |   2 +-
 2 files changed, 15 insertions(+), 169 deletions(-)
```

Git 不把 untracked 納入 `git diff --stat`；另有：

```text
?? src/sheets/FilterSheet.tsx  286 lines
?? docs/migration-reports/batch-8.2.md  本回報
```

最終不 stage、不 commit、不 push。
