# 批 B-fix 回報

## 1. 結論與變更檔案

結論：已完整刪除 production 零呼叫的 `pushDrawerIsolation` 死碼與兩個專用測試／helper，並保留批 B bug (a) 的 WeakMap 修正及回歸測試不動。

- `src/modalIsolation.js:73–89`（刪除前行號）：刪除 `pushDrawerIsolation` 整個函式及 JSDoc。
- `tests/smoke.spec.js:81–101、191–213`（刪除前行號）：刪除 selector 掃描 helper 與兩個死碼測試。
- `docs/migration-reports/batch-B-fix.md:1–67`：新增本批驗收回報。

## 2. 反向 grep

`grep -rn "DrawerIsolation" src/ tests/`

```text
```

（完整輸出為空；exit code 1 表示零命中。）

`grep -rn "pushSurfaceIsolation" src/`

```text
src/modalIsolation.js:62:export function pushSurfaceIsolation(root) {
src/sheets.js:2:import { pushSurfaceIsolation } from "./modalIsolation.js";
src/sheets.js:66:  const releaseIsolation = pushSurfaceIsolation(root);
```

## 3. 四個 gate

`npm run test:mock`

```text
  4 skipped
  250 passed (2.2m)
```

`npm run test:local`

```text
  11 skipped
  42 passed (1.4m)
```

`npm run build`

```text
dist/assets/index-NbuHY2a7.js   485.23 kB │ gzip: 130.41 kB
✓ built in 602ms
```

`git diff --check`

```text
```

（完整輸出為空；exit code 0。）

## 4. git diff --stat

```text
 src/modalIsolation.js | 18 ------------------
 src/sessionViews.js   |  4 +++-
 tests/smoke.spec.js   | 46 ++++++++++++++++++++++++++++++++++++++++++++++
 3 files changed, 49 insertions(+), 19 deletions(-)
```

註：以上是相對 HEAD 的完整既有 working-tree diff；`src/sessionViews.js` 是派工單要求保留的批 B bug (a) 未提交修正，本批未編輯。新增回報檔仍為未追蹤檔，因此 unstaged `git diff --stat` 不列出未追蹤檔。
