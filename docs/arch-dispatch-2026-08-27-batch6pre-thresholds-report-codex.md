# 批 6 前置回報：兩處零餘裕測試下限改寫

- 日期：2026-08-27
- 派工單：`docs/arch-dispatch-2026-08-27-batch6pre-thresholds.md`
- 開工 HEAD：`81f476f`；前置批 5 ACCEPTED：`e9301bc`。
- 開工 working tree：乾淨。
- 結果：完成，無 BLOCKED；永久變更只有兩個獲准測試檔與本回報。
- Git：未 commit、未 push。

## 1. Ground truth 與計畫檢視

動手前重驗：

```text
$ find src -type f \( -name '*.css' -o -name '*.js' -o -name '*.ts' -o -name '*.tsx' \) | wc -l
113

$ find src -type f -name '*.css' | wc -l
13

$ node --test tests/content-visibility-contract.test.js tests/legacy-style-scan.test.js
# tests 2
# pass 2
# fail 0
EXIT_CODE=0
```

兩處 ground truth 均吻合：CSS 裸 floor `>=13` 恰好零餘裕；來源共 113 檔，另加
`index.html` 後 `FILES.length` 為 114，所以 `>=65` 仍有 49 檔餘裕。本批只改零餘裕
與錯誤語意不相符的兩條 guard，沒有理由動 `>=65` 或遞迴掃描本體。

計畫沒有阻擋實作的問題。需要明確認知的取捨是：CSS 錨點只證明三個載重根層檔案被掃到，
不是人工維護的全量 manifest；這是派工單已自認的刻意選擇。單錨點排除 canary 證明新 guard
確實有牙，且既有非空、containment selector 對帳與 source anchors 疊層都保留。

## 2. A：CSS 計數改為載重錨點對帳

### 2.1 改寫前後

改寫前：

```js
assert.ok(CSS_SOURCES.length >= 13, `CSS 掃描集過小（僅 ${CSS_SOURCES.length} 檔）`);
```

改寫後原文：

```js
const REQUIRED_CSS_SOURCE_ANCHORS = ["src/style.css", "src/vocabulary.css", "src/sheet-shells.css"];

assert.ok(CSS_SOURCES.length > 0, "CSS 掃描集不可為空");
const cssSourcePaths = new Set(CSS_SOURCES.map(([path]) => path));
for (const anchor of REQUIRED_CSS_SOURCE_ANCHORS) {
  assert.ok(cssSourcePaths.has(anchor), `CSS 掃描集缺少載重錨點 ${anchor}`);
}
```

沒有新的恰 N 全量清單；新增或整併非錨點 CSS 不會因檔案數變動而誤紅。

### 2.2 錨點選擇理由

三檔都由 `src/main.js` 直接載入，並非任意挑選：

- `src/style.css`：import 順序第 1，承擔全域 reset／base。
- `src/sheet-shells.css`：import 順序第 5，承擔跨 sheet 共用殼、拉把與註腳。
- `src/vocabulary.css`：import 順序第 11，承擔 time-tile／chip／toggle 等基礎語彙。

它們跨越全域、surface shell 與共用元件語彙三個載重層，且派工前均為穩定根層入口。
若未來真的要移除任一錨點，應明確更新治理契約，而不是讓掃描靜默縮小。

### 2.3 漏掃 canary 三拍

先驗 guard（改寫後真實 tree）：

```text
$ node --test tests/content-visibility-contract.test.js
ok 1 - 長列表 item selector 逐一綁定完整 content-visibility 契約
# tests 1
# pass 1
# fail 0
EXIT_CODE=0
```

暫時在 `CSS_SOURCES` discovery 後排除單一 `src/style.css`，其餘 CSS 與 containment
規則維持原樣：

```text
$ node --test tests/content-visibility-contract.test.js
not ok 1 - 長列表 item selector 逐一綁定完整 content-visibility 契約
error: 'CSS 掃描集缺少載重錨點 src/style.css'
expected: true
actual: false
# tests 1
# pass 0
# fail 1
EXIT_CODE=1
```

byte-for-byte 撤除 filter 變體後：

```text
$ node --test tests/content-visibility-contract.test.js
ok 1 - 長列表 item selector 逐一綁定完整 content-visibility 契約
# tests 1
# pass 1
# fail 0
EXIT_CODE=0
```

紅點是新錨點斷言且明確指名 `src/style.css`，未先撞 containment 或非空 guard。

## 3. B：每檔大小門檻改為真正非空

### 3.1 改寫前後

改寫前：

```js
assert.ok(content.length > 100, `${path} 讀取異常,掃描集會漏檔`);
```

改寫後原文：

```js
assert.ok(content.length > 0, `${path} 讀取異常（空檔）,掃描集會漏檔`);
```

同時只勘誤 stale 註解：

```js
// 目前基線是 113 個 src 檔 + index.html；>=65 floor 約有 49 檔餘裕，
// 逐目錄非空斷言另防止整個既有子目錄被遞迴器跳過。
```

`FILES.length >= 65` 與逐目錄非空斷言本體完全未改。

### 3.2 0-byte 空檔 canary 三拍

以 `apply_patch` 建立未 import 的 `src/batch6pre-empty-canary.css`：

```text
$ wc -c src/batch6pre-empty-canary.css
0 src/batch6pre-empty-canary.css

$ node --test tests/legacy-style-scan.test.js
not ok 1 - 舊視覺常數不再出現於任何樣式來源
error: 'src/batch6pre-empty-canary.css 讀取異常（空檔）,掃描集會漏檔'
expected: true
actual: false
# tests 1
# pass 0
# fail 1
EXIT_CODE=1
```

用 `apply_patch` 刪除探針後：

```text
$ node --test tests/legacy-style-scan.test.js
ok 1 - 舊視覺常數不再出現於任何樣式來源
# tests 1
# pass 1
# fail 0
EXIT_CODE=0
```

### 3.3 58-byte 小檔放行三拍

同一個未 import、沒有 BANNED 字串與 containment 宣告的合法探針內容：

```css
/* legitimate tiny source used by the preflight canary */
```

在舊 `>100` guard 下：

```text
$ wc -c src/batch6pre-small-canary.css
58 src/batch6pre-small-canary.css

$ node --test tests/legacy-style-scan.test.js
not ok 1 - 舊視覺常數不再出現於任何樣式來源
error: 'src/batch6pre-small-canary.css 讀取異常,掃描集會漏檔'
expected: true
actual: false
# tests 1
# pass 0
# fail 1
EXIT_CODE=1
```

只把 guard 換回本批最終 `>0`，保留完全相同探針：

```text
$ wc -c src/batch6pre-small-canary.css
58 src/batch6pre-small-canary.css

$ node --test tests/legacy-style-scan.test.js
ok 1 - 舊視覺常數不再出現於任何樣式來源
# tests 1
# pass 1
# fail 0
EXIT_CODE=0
```

刪除探針後最終真實 tree：

```text
$ node --test tests/content-visibility-contract.test.js tests/legacy-style-scan.test.js
# tests 2
# pass 2
# fail 0
# duration_ms 61.111416
EXIT_CODE=0
```

這證明舊門檻確實誤擋合法小檔，而新門檻仍拒絕真正空檔。

## 4. 探針清除、凍結面與 build／bundle 豁免自證

```text
$ find src -maxdepth 1 -name 'batch6pre-*-canary.css' -print
(no output)

$ git diff --exit-code -- src
(no output)
EXIT_CODE=0

$ git status --short
 M tests/content-visibility-contract.test.js
 M tests/legacy-style-scan.test.js
?? docs/arch-dispatch-2026-08-27-batch6pre-thresholds-report-codex.md
```

- canary 名稱沒有出現在任何 import；探針只被遞迴掃描測試讀取。
- 最終 `src/` 零 diff、無未追蹤探針，production code、CSS、bundle gate 全部零變更。
- 因此符合派工單的 build／bundle 豁免前提；未執行 build 或 bundle gate。
- 兩個測試檔除解凍行、新錨點常數／斷言與 stale 註解外，其餘契約、掃描器、
  `BANNED`、`>=65`、逐目錄非空均零 diff。

## 5. Codex 五問

### 1. 新 CSS guard 是否比裸 `>=13` 更能容許合法整併，同時仍 fail closed？

是。它不再依賴總檔數，新增或整併非錨點 CSS 不會誤紅；排除單一錨點時則以
`CSS 掃描集缺少載重錨點 src/style.css` 指名打紅。既有掃描非空、containment
`deepEqual`、規則完整性與 markup source anchors 仍疊加生效。

### 2. `>0` 是否把「最小檔案政策」降級成無意義 guard？

否。原錯誤訊息宣告的契約是讀取異常／漏檔，不是程式碼最小尺寸。0-byte canary
證明新 guard 仍抓真正異常；58-byte canary 證明它不再把合法小型 contract leaf
誤分類為掃描失效。掃描集縮小另由 `>=65` 與逐目錄非空守門。

### 3. 為何沒有改成全量 CSS manifest？

全量 manifest 會重新引入每次合法新增／整併都要人工同步的維護負擔，與本批目的衝突。
目前所有 CSS 都在根層；三個穩定載重入口搭配 canary，已證明根層 discovery 的關鍵
路徑。未來若新增 CSS 子目錄，應另為遞迴 discovery 補專屬 canary，而不是以裸數字代理。

### 4. 為何 build／bundle 可以豁免？

最終沒有任何 `src/` 或 dependency 變更；兩個短暫 CSS probe 從未被 import，只由 Node
掃描測試讀檔，且都已刪除。`git diff --exit-code -- src` 與探針搜尋均為空。完整 mock／local
仍實跑，用來自證 working tree 與 runtime 沒有殘留污染。

### 5. 對批 6 主體切批與其餘 `.js` TS 化的建議

維持既定三段：contract leaf → `sheets.ts` 機械轉換 → 逐 dependency edge 拆檔；每段
獨立驗收，不在 TS 化時一起重設 async／ownership 契約。

其餘 `.js` 建議優先序：

1. `config.js`、`profile.js`、`sessionCriteria.js`、`taipeiTime.js`：小而穩定的 value／predicate
   leaf，已被多個 TS／TSX consumer 引用，先轉可消除最多隱含 `any` 邊界。
2. `filters.js`、`requestGate.js`、`sessionIntent.js`：狀態與參數 shape 明確，適合在 leaf
   完成後沿單一 edge 轉換；保留 runtime exports 與測試語意。
3. `dataApi.js`、`sessionController.js`：型別收益高，但 public surface 大；應先凍結 factory、
   error code、repository port contract，再各自立批，不和 `sheets.ts` 同批。
4. `features/profile/profileOrchestrationFeature.js`、`features/presence/presenceFeature.js`：等
   data/controller ports 型別穩定後再轉，否則只會把上游 `any` 搬進 feature。

暫不值得優先：

- `main.js` 是 722 行 side-effect orchestration root，應在其 imports 大多型別化、責任拆小後
  最後轉；現在改副檔名的風險遠高於新增型別資訊。
- `sessionViews.js` 與 `src/views/*.js` 是 frozen facade／native binding 相容層，仍受 React
  ownership 遷移約束；在 bridge 收斂前機械 TS 化會把舊契約永久化。
- `mockData.js`／`mockData.empty.js` 是 fixture topology；可由 repository contract 提供
  `satisfies` 目標後再轉，不應為了減少 `.js` 數字先做。
- `focusableSelector.js`、`sessionRoute.js`、`util.js`、`meFocus.js` 等極小 helper 可在相鄰
  consumer 批順手轉，但單獨立批的型別收益低。

## 6. 收尾標準矩陣

### Static

```text
$ npm run typecheck
> tsc --noEmit
EXIT_CODE=0

$ npm run lint
> eslint ...
EXIT_CODE=0

$ npm run prettier:check
Checking formatting...
All matched files use Prettier code style!
EXIT_CODE=0

$ git diff --check
(no output)
EXIT_CODE=0
```

### Unit／mock

```text
$ npm run test:session-unit
# tests 346
# pass 346
# fail 0
# skipped 0
# duration_ms 3534.377875
EXIT_CODE=0

$ npm run test:mock
# unit phase includes both target tests: green
4 skipped
298 passed (54.1s)
EXIT_CODE=0
```

沒有失敗、重跑、flake 或豁免。

### Local

```text
$ npm run test:local
# local API
# tests 2
# pass 2
# fail 0
# duration_ms 4456.877417

# Supabase Chromium
11 skipped
45 passed (1.4m)
EXIT_CODE=0
```

沒有 reset、污染紅、已知 presence timeout 或重跑。

## 7. 未做、疑義與 BLOCKED

- 未做：批 6 主體、`>=65` floor、掃描本體、production／CSS、其他測試、bundle gate。
- 疑義：無。錨點對帳的範圍取捨已由派工單明示，canary 證明其在現行根層 topology
  下具判別力。
- BLOCKED：無。
- Git：未 commit、未 push；working tree 留給驗收方。
