# 批 4A 回報：三份重複計數收斂單一 manifest

- 日期：2026-08-26
- 派工單：`docs/arch-dispatch-2026-08-26-batch4A-manifest.md`
- 開工狀態：working tree 乾淨；實際 HEAD `81d42e5aa6d1b45cd1e34039395021cb9787777d`，
  `git merge-base --is-ancestor 79bc1f5 HEAD` exit 0。
- 結果：完成，無 BLOCKED；未 commit、未 push；零 `src/`／spec／凍結斷言變更。

## 1. 收斂前後對照

### 1.1 `app-errors.test.js`：sheet adapter 與 imperative adapter

Before：

```js
assert.equal(sheetFiles.length, 14, "all sheet contents must register with SurfaceHost");
// ...
assert.equal(refAdapters.length, 8);
```

After（改後原文）：

```js
assert.deepStrictEqual(
  sheetFiles.map((path) => relative(new URL("../", import.meta.url).pathname, path).replaceAll("\\", "/")).sort(),
  [...SURFACE_MANIFEST.sheetAdapters].sort(),
  "all sheet contents must register with SurfaceHost"
);
// ...
assert.deepStrictEqual(
  refAdapters.map((path) => relative(new URL("../", import.meta.url).pathname, path).replaceAll("\\", "/")).sort(),
  [...SURFACE_MANIFEST.imperativeAdapters].sort()
);
```

掃描證據仍來自 `src/sheets/` 實際檔案與原本的 `mountSurfaceContent(`／
`"content did not mount"` 條件；只把期望值改接 manifest。路徑從 repo root 做 `relative()`，
再把反斜線轉 `/`，因此與 manifest 的 repo-relative POSIX 名稱一致。

### 1.2 `react-surface-lifecycle.test.js`：lazy pages 與 navigation destinations

Before：

```js
assert.equal((APP.match(/Request \?\?= import\("\.\.\/pages\//g) ?? []).length, 3);
// ...
assert.equal(
  (APP.match(/aria-current=\{activePage === ".+?" \? "page" : undefined\}/g) ?? []).length,
  4,
  "all four destination tabs must derive aria-current from React navigation state"
);
```

After（改後原文）：

```js
const lazyPages = [...APP.matchAll(/\w+Request \?\?= import\("\.\.\/pages\/([^"/]+)\.tsx"\)/g)].map(
  (match) => `src/pages/${match[1]}.tsx`
);
assertExactNamedScan(lazyPages, SURFACE_MANIFEST.lazyPages, "lazy page module");
// ...
const navDestinations = [...APP.matchAll(/activePage === "([^"]+)"/g)].map((match) => match[1]);
assertExactNamedScan(navDestinations, SURFACE_MANIFEST.navDestinations, "React navigation destination");
```

`lazyPages` 採雙向正規化中的「掃描結果補成 manifest 完整路徑」：regex 抽 basename，
再補成 `src/pages/<Name>.tsx`。第一輪若只掃裸 `import("../pages/...")`，會連
`typeof import(...)` 三筆型別查詢一起命中，`assertExactNamedScan` 立即以
`lazy page module scan contains duplicate names / 3 !== 6` 紅燈；因此最終限定 ground truth
指定的 `*Request ??=` 動態請求，而不是弱化成去重或計數。

### 1.3 `react-surface-lifecycle.test.js`：Session Detail imperative methods

Before：

```js
assert.equal((contractBody.match(/surfaceContent\.commit\(/g) ?? []).length, 3);
```

After（改後原文）：

```js
assert.equal((contractBody.match(/surfaceContent\.commit\(/g) ?? []).length, imperativeMethodBodies.length);
```

### 1.4 manifest 新欄位（改後原文）

```js
lazyPages: namedList(["src/pages/MePage.tsx", "src/pages/MessagesPage.tsx", "src/pages/MySessionsPage.tsx"]),
navDestinations: namedList(["map", "my-sessions", "messages", "me"]),
```

兩欄都走既有 `namedList` frozen 樣板；原六欄逐字未改。

## 2. Canary 三拍逐字證據

前三組是派工單標題所稱的三組 manifest canary；另依 D 節括號條文執行第 4 組
`:179` canary。每次紅燈後都以 patch 補回原行，先比 SHA-256，再跑綠。

### 2.1 `sheetAdapters` 移除 `CourtPlayersSheet.tsx`

紅（exit 1）：

```text
$ node --test tests/app-errors.test.js
not ok 4 - the single App root retains all 19 isolated error surfaces
  error: |-
    all sheet contents must register with SurfaceHost
    + actual - expected

      [
    +   'src/sheets/CourtPlayersSheet.tsx',
        'src/sheets/CourtSessionSheet.tsx',
        'src/sheets/CreateSessionSheet.tsx',
        'src/sheets/DecideSessionSheet.tsx',
        'src/sheets/EditSessionSheet.tsx',
        'src/sheets/FilterSheet.tsx',
  code: 'ERR_ASSERTION'
  operator: 'deepStrictEqual'
1..4
# tests 4
# suites 0
# pass 3
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 71.258792
```

byte-identical 還原：

```text
$ shasum -a 256 tests/fixtures/surfaceManifest.js
957c06045acbd6731392058140f82346d39494d93c6e5f5faa4fdd61a1d5f37c  tests/fixtures/surfaceManifest.js
```

綠（exit 0）：

```text
$ node --test tests/app-errors.test.js
1..4
# tests 4
# suites 0
# pass 4
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 76.19175
```

### 2.2 `lazyPages` 移除 `MePage.tsx`

紅（exit 1）：

```text
$ node --test tests/react-surface-lifecycle.test.js
not ok 3 - non-home pages and sheets stay behind explicit preloadable module boundaries
  error: |-
    lazy page module differs from the surface manifest
    + actual - expected

      [
    +   'src/pages/MePage.tsx',
        'src/pages/MessagesPage.tsx',
        'src/pages/MySessionsPage.tsx'
      ]
  code: 'ERR_ASSERTION'
  operator: 'deepStrictEqual'
1..6
# tests 6
# suites 0
# pass 5
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 57.5425
```

byte-identical 還原：

```text
$ shasum -a 256 tests/fixtures/surfaceManifest.js
957c06045acbd6731392058140f82346d39494d93c6e5f5faa4fdd61a1d5f37c  tests/fixtures/surfaceManifest.js
```

綠（exit 0）：

```text
$ node --test tests/react-surface-lifecycle.test.js
1..6
# tests 6
# suites 0
# pass 6
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 61.167709
```

### 2.3 `navDestinations` 移除 `map`

紅（exit 1）：

```text
$ node --test tests/react-surface-lifecycle.test.js
not ok 4 - AppShell preserves navigation, toast, popover, and Escape accessibility contracts
  error: |-
    React navigation destination differs from the surface manifest
    + actual - expected

      [
    +   'map',
        'me',
        'messages',
        'my-sessions'
      ]
  code: 'ERR_ASSERTION'
  operator: 'deepStrictEqual'
1..6
# tests 6
# suites 0
# pass 5
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 59.564083
```

byte-identical 還原：

```text
$ shasum -a 256 tests/fixtures/surfaceManifest.js
957c06045acbd6731392058140f82346d39494d93c6e5f5faa4fdd61a1d5f37c  tests/fixtures/surfaceManifest.js
```

綠（exit 0）：

```text
$ node --test tests/react-surface-lifecycle.test.js
1..6
# tests 6
# suites 0
# pass 6
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 60.687375
```

### 2.4 額外：`imperativeMethodBodies` 移除 `enterConfirming`

紅（exit 1）：

```text
$ node --test tests/react-surface-lifecycle.test.js
not ok 6 - Session Detail blocks both direct and async commits after its surface dies
  error: |-
    Expected values to be strictly equal:

    3 !== 2

  code: 'ERR_ASSERTION'
  expected: 2
  actual: 3
  operator: 'strictEqual'
1..6
# tests 6
# suites 0
# pass 5
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 61.642292
```

byte-identical 還原：

```text
$ shasum -a 256 tests/react-surface-lifecycle.test.js
ee6e72c23ad5ba1c8e7d5ff6538ac5b4a75072ea225d6a8f5058a37fee1ba786  tests/react-surface-lifecycle.test.js
```

綠（exit 0）：

```text
$ node --test tests/react-surface-lifecycle.test.js
1..6
# tests 6
# suites 0
# pass 6
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 59.802625
```

## 3. `:179` 偏離設計說明

Q3 條文字面要求「引用單一 manifest」，但這一處依派工單採單一 in-file 來源：
`imperativeMethodBodies.length`。若 manifest 再收 `enterConfirming`／`handleEscape`／
`setJoinPreview`，會把同一方法名名冊鏡像到 fixture，且 F 群批 5 還會再動。本批只消滅裸數字
`3`，不新增一份即將漂移的 manifest 欄位；額外 canary 證明少列抽取方法會使 commit 總數
`3 !== 2` 紅燈。

## 4. Codex 五問

### 1. 重複計數是否真的收斂？

是。`14`／`8`／lazy page `3`／nav `4` 都不再是獨立期望值；前兩者接 manifest 既有名冊，
後兩者接本批新增 frozen 名冊。Session Detail 的最後一個 `3` 接檔內唯一方法抽取陣列。

### 2. 期望來源是否污染了掃描證據？

沒有。production scan、regex、`content did not mount` 過濾與逐檔內容斷言仍獨立執行；
manifest 只提供 expected names。所有名冊比較同時拒絕缺項、多項與重複名稱。

### 3. Canary 是否有牙？

有。三個 manifest canary 都直接點名多出的 production 名稱；`:179` canary 顯示
production commit 三筆與方法清單兩筆不等。四次還原都以原 SHA-256 加綠測確認無殘留。

### 4. 範圍與驗證是否守住？

是。diff 只有兩個測試、一個 fixture 與本回報；無 `src/`、spec、凍結欄位或相鄰白箱斷言
變更。typecheck、lint、Prettier、unit、mock 與 whitespace gate 最終全綠。

### 5. 對 4B SessionDetailSheet 重 lazy 化的建議——特別是 `openSessionSheet` 同步 `handleEscape` 契約如何過渡到 `deferSurfaceOpen` 樣板？

不要把 `handleEscape` 放進 `deferSurfaceOpen.methods` 佇列：Escape 必須在同一 keydown call stack
同步回傳 boolean，排隊後才執行會破壞「confirming 先退 idle、其餘狀態才關 sheet」契約。
建議維持兩階段殼：

1. lazy module 未完成時，loading shell 沒有 confirming content，Escape 走殼預設同步關閉；關閉後
   `live=false`，promise resolve 不得 late-mount。
2. load 完成後，`open()` 同步建立真正 `mountSheet`、同步 mount content，並讓其 `onEscape`
   closure 直接讀已賦值的 `content.handleEscape()`；`open()` 回傳後才交換 active handle。
3. 外部可呼叫的 `setJoinPreview`、`enterConfirming` 才列入 `methods` 佇列。promise `.then()`
   同一 microtask 內完成 open、active/readyHandle 交換及 FIFO replay，下一個使用者事件到來前
   content 已 ready；`initialStage="confirming"` 則直接傳進 recursive `open()`，不靠 Escape proxy。
4. 4B 補三個 race oracle：pending load 時 Escape 關閉且 resolve 後不復活；loaded confirming
   第一次 Escape 只回 idle、第二次關閉；load 前呼叫 `enterConfirming`／`setJoinPreview` 在替換後
   只 replay 一次。另驗 `onClose` 不因 loading shell replacement 被重複觸發。

實作接線上需新增 `preloadSessionDetailSheet` 並注入 `configureSessionSurfaceViews`；未載入分支使用
`deferSurfaceOpen({ methods: ["setJoinPreview", "enterConfirming"], ... })`，已載入分支保留目前同步
`content` closure。這樣可以重 lazy 化而不把同步事件決策偽裝成可延遲 command。

## 5. 收尾標準矩陣逐字輸出

所有 gate 實跑，未接 pipe。`test:local` 依純 tests＋docs 批豁免；build 與
`check:production-bundle` 依零 `src/` 變更豁免。

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

### Mock（含 unit）

第一次完整跑撞到 roadmap 已立案的 `chat-settings-filters-smoke.spec.js:468` filter sheet
一次性 flake（同輪 mobile 通過）：

```text
1) [desktop-chromium] › tests/chat-settings-filters-smoke.spec.js:468:1 › openFilterSheet mounts a dialog with six data-filter groups and closes on Escape

Error: expect(received).toEqual(expected) // deep equality

- Expected  - 8
+ Received  + 1

- Set {
-   "apply",
-   "band",
-   "dateKey",
-   "districts",
-   "reset",
-   "types",
- }
+ Set {}

1 failed
  [desktop-chromium] › tests/chat-settings-filters-smoke.spec.js:468:1 › openFilterSheet mounts a dialog with six data-filter groups and closes on Escape
4 skipped
287 passed (55.1s)
exit 1
```

依派工單重跑完整 `npm run test:mock`，最終 exit 0；unit 與 Playwright 原始摘要：

```text
$ npm run test:mock
# tests 336
# suites 0
# pass 336
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 3570.208833

  4 skipped
  288 passed (51.5s)
exit 0
```

### 空白

```text
$ git diff --check
(no output)
exit 0
```

### 範圍自證

```text
$ git diff --stat
 ...tch-2026-08-26-batch4A-manifest-report-codex.md | 472 +++++++++++++++++++++
 tests/app-errors.test.js                           |  12 +-
 tests/fixtures/surfaceManifest.js                  |   2 +
 tests/react-surface-lifecycle.test.js              |  14 +-
 4 files changed, 491 insertions(+), 9 deletions(-)
```

## 6. 未做／疑義／BLOCKED

- 未做：任何 `src/`、spec、`session-presentation-boundary.test.js:114`、
  `react-surface-lifecycle.test.js:94/:109`、`sheets.js` dead exports、4B／4C production 工作；
  未新增依賴；未跑本批明文豁免的 local/build/bundle。
- 疑義 1：D 標題與回報合約寫「三組 canary」，但 D 末段又明列 `:179` canary；採較嚴格
  解讀，共跑四組。
- 疑義 2：裸 `import("../pages/...")` 也會命中三個 `typeof import`；最終限定
  `*Request ??=`，符合 ground truth 的三個實際 lazy request，且保留 duplicate fail-closed。
- BLOCKED：無。
