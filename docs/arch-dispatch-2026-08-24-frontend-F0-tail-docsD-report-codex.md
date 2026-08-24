# F0-6＋F0-4＋文件批 D 執行回報

- 日期：2026-08-24
- 派工單：`docs/arch-dispatch-2026-08-24-frontend-F0-tail-docsD.md`
- production 開工基準：`04543bf`
- 派工單 HEAD：`870a016`
- 最終實作 HEAD：`ee49b74`
- 結論：三個子項完成，依規定各自獨立 commit；最終必要 gate 全綠，未 push。

## 一、commit 與變更

| 子項 | Commit | 變更 |
| --- | --- | --- |
| F0-6 | `4b3ece5` | `package.json`／lockfile 宣告 Node `>=22.18`，新增 `.nvmrc`，並在 `ci-config.test.js` 加語意一致性 gate。 |
| F0-4 | `84a7131` | 新增共用葉子 `src/focusableSelector.js`，`sheets.js` 與 `SessionDetailSheet.tsx` 共用唯一 selector。 |
| 文件 D | `ee49b74` | 新增 32 列架構決策索引，三份歷史文件只加終結／失效後註。 |

本回報檔依派工要求刻意不列入上述 commit。

## 二、F0-6：Node 版本前提工具化

### 2.1 實作

- `package.json` 與 root lock record 都加入 `"node": ">=22.18"`。
- `.nvmrc` 只有一行 `22`。
- `tests/ci-config.test.js` 解析 inclusive lower bound，比對最低版本不得低於 22.18、
  `.nvmrc` major 必須與 engines 下限 major 一致，並鎖住 lockfile 同步。
- 實作環境為 `v22.22.3`。

### 2.2 Canary：紅 → 還原 → 綠

暫時把 `package.json` engines 改成 `">=20"`：

```text
$ node --test --test-name-pattern="Node runtime" tests/ci-config.test.js
not ok 1 - Node runtime declarations require 22.18 or newer and stay semantically aligned
error: 'Node engine minimum must be at least 22.18'
# pass 0
# fail 1
exit_code=1
```

精確還原為 `">=22.18"` 後：

```text
ok 1 - Node runtime declarations require 22.18 or newer and stay semantically aligned
# pass 1
# fail 0
exit_code=0
```

本項完成後另跑一次完整 frontend gate：Node 304/304、mock Playwright
270 passed／4 skipped、production bundle guard 通過。

## 三、F0-4：focusable selector 收斂

### 3.1 邊界選擇

沒有讓 React TSX 回頭 import legacy `sheets.js`，而是建立無 React、無 DOM side effect 的共用
葉子 `src/focusableSelector.js`。這符合 React 遷移規則的單向依賴，也讓兩個 consumer 都是
direct import。React best-practices skill 影響的是這個葉子邊界選擇；沒有引入 barrel。

基準：

```text
$ grep -rn "button:not(\[disabled\])" src/
src/sheets/SessionDetailSheet.tsx:688:  'button:not([disabled]), ...'
src/sheets.js:13:      'button:not([disabled]), ...'
$ grep -rn "button:not(\[disabled\])" src/ | wc -l
2
```

完成後：

```text
$ grep -rn "button:not(\[disabled\])" src/
src/focusableSelector.js:2:  'button:not([disabled]), ...'
$ grep -rn "button:not(\[disabled\])" src/ | wc -l
1
$ node <selector byte comparison>
selector bytes unchanged: 136 bytes
```

selector 本文逐 byte 與改動前相同。focus 測試沒有修改，定向驗證如下：

```text
node --test tests/me-focus.test.js tests/sheets-dom.test.js
# tests 11
# pass 11
# fail 0

TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/react-page-focus.spec.js \
  --project=desktop-chromium --project=mobile-chromium
4 passed

TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/performance.spec.js tests/smoke.spec.js \
  --project=desktop-chromium --project=mobile-chromium \
  -g "keyboard dialogs trap focus|filter sheet traps Tab focus"
4 passed
```

完整 mock 與 local focus 案例另由收尾矩陣全數覆蓋。

## 四、文件批 D

### 4.1 決策索引

新增 `docs/architecture-decisions.md`。為保留每個歷史來源的可追溯性，跨來源重複的未盡事項
也各占一列；每列都有決策、三態之一、日期與來源連結。

機械計數輸出：

```text
{"migration":7,"overview":6,"verdict":6,"fix":7,"mother":6}
source total: 32
index rows: 32
linked index rows: 32
```

三個抽查定位例：

1. `D-06` 可直接回到 fix-plan D6，並連到批 18 完成紀錄。
2. `OV-05` 可直接回到 00-overview 的 WebKit 實機 Safari 非派工原文。
3. `NP-06` 可直接回到母派工單「Next.js／SSR／一次重寫」原文。

狀態判讀：D6 抽屜捲動保存已由批 18 完成、D7 自動 WebKit 訊號已由批 15／23 完成，
故兩列標「已終結」；實機 Safari 分類仍在 OV／FV 列保持「生效」。其餘未找到後續拍板
推翻，維持「生效」。

### 4.2 歷史後註

- `frontend-migration-plan-2026-08-18.md`：檔頭標示批 B–11 於 2026-08-19 終結，後續轉
  fix-plan 與決策索引。
- `frontend-fix-plan-2026-08-20.md`：檔頭標示批 12–28 於 2026-08-21 終結，連到獨立驗收、
  final verdict 與決策索引。
- `frontend-architecture-analysis-after-react-migration-2026-08-20.md`：測試資料污染段加批 16／17
  失效後註；`as unknown as` 段加批 12 失效後註。

範圍與原文保護：

```text
D-batch paths:
 M docs/frontend-architecture-analysis-after-react-migration-2026-08-20.md
 M docs/frontend-fix-plan-2026-08-20.md
 M docs/frontend-migration-plan-2026-08-18.md
?? docs/architecture-decisions.md
historical body deletions: 0
```

文件批 commit 僅含上述四檔，沒有改寫歷史本文。

## 五、凍結資產

### 5.1 GOLDEN 兩張表

以 `0be31a2 → 04543bf` 的已核可 sequence-test diff 與 `0be31a2 → HEAD` diff 做 byte compare：

```text
GOLDEN approved hunk: identical
```

因此既有 `GOLDEN` 與 `ME_GOLDEN` 沒有新增 hunk。

### 5.2 `data-testid`

沿用既有驗收方法，從兩版 `git ls-tree -r src` 讀每個 JS／TS／TSX，分開收集靜態
quoted／config `testId` 與 template 動態 pattern：

```text
static  baseline 77 HEAD 77 added 0 removed 0
dynamic baseline 18 HEAD 18 added 0 removed 0
```

集合非空，兩類都零增刪。

## 六、最終驗證矩陣

Playwright 全程串行；沒有執行 DB reset。

```text
npm run test:ci:frontend   exit 0
  typecheck/lint/prettier  pass
  Node tests               304/304
  Playwright mock          270 passed / 4 skipped
  build                    171 modules transformed
  production bundle       648016 / 188600 bytes
                            within 703886 / 203176

npm run test:db            exit 0
  pgTAP                    Files=7, Tests=799, Result: PASS

npm run test:local         exit 0（完整重跑終態）
  local API                2/2
  Supabase Playwright      42 passed / 11 skipped
  did not run              0

git diff --check           empty, exit 0
```

### 6.1 Local 首輪 timeout 的處置

首輪完整 local 在 `session.spec.js:1210` 等待 `notification-court-5` 時單次 90 秒 timeout，
結果為 21 passed／11 skipped／20 did not run。該檔與斷言沒有修改；隔離同案：

```text
TENNIS_TEST_HARNESS_MODE=local npx playwright test --project=supabase-chromium \
  tests/session.spec.js -g "authenticated players persist the authoritative court subscription set" \
  --repeat-each=3
3 passed (13.7s)
```

三次各約 2.4–2.5 秒，推翻 runtime 回歸假說。隨後完整 `npm run test:local` 重跑全綠，
同案該輪 763ms 完成，最終 `did not run` 為 0。沒有為此改測試、改 production 或重置 DB。

## 七、未做與紅線自證

- 沒有修改 `sessionController.js`、`src/controller/`、`src/views/`、`syncCommit.ts`、
  dataApi 邊界、`databaseTypes.ts` 或 `.claude/rules/`。
- 沒有修改 testid、DOM 結構、文案或任何既有測試斷言。
- 沒有執行批 3、F0-7、F0-8、REL、deploy、push 或實機 Safari QA。
- Canary 均以精確 patch 還原，未用 `git checkout`；工作樹只保留本回報檔。
