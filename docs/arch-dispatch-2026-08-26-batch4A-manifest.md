# 批 4A 派工單：三份重複計數收斂單一 manifest（批 4 前置，test＋docs only）

- 日期：2026-08-26。母文件：`docs/arch-roadmap-2026-08-26-react-ownership.md`（批 4 切
  三段：4A 前置→4B SessionDetailSheet 重 lazy 化→4C 殼 React 化）。治理依據：
  `docs/arch-q3-whitebox-triage-2026-08-26.md` 拍板條文「三份互不引用的重複計數……
  批 4 開工前先收斂為引用單一 manifest」（行號勘誤後為 `app-errors.test.js:121,129`）。
- 開工基準：`79bc1f5` 之後的最新 main HEAD（working tree 應乾淨，否則停手回報）。
- 本批**零 production 變更**：`git diff` 只允許出現
  `tests/fixtures/surfaceManifest.js`、`tests/app-errors.test.js`、
  `tests/react-surface-lifecycle.test.js` 與你的回報文件；任何 `src/` 變更＝BLOCKED。
- 你不 commit、不 push；working tree 交驗收方。

## 解凍清單（Q3 守則：未列即凍結）

- `tests/fixtures/surfaceManifest.js`：**只准新增欄位**（`lazyPages`、`navDestinations`；
  都走既有 `namedList` frozen 樣板）。既有六組清單（`sheetAdapters`／
  `unmountRegistrations`／`eagerModules`／`lazySheets`／`imperativeAdapters`／
  `presentationConsumers`）一筆都不可增刪改。
- `tests/app-errors.test.js`：`:121` 與 `:129` 兩條 `assert.equal(..., 14/8)` 及其
  緊鄰接線（含新增 `SURFACE_MANIFEST` import 一行）。
- `tests/react-surface-lifecycle.test.js` 恰三處：
  - `:139` `assert.equal((APP.match(/Request \?\?= import\("\.\.\/pages\//g) ?? []).length, 3);`
  - `:144-149` 的 aria-current 計數斷言（裸數字 `4` 那一條）
  - `:179` `assert.equal((contractBody.match(/surfaceContent\.commit\(/g) ?? []).length, 3);`

**仍凍結（一票否決）**：全部 `src/`（含 `sheets.js` 死 export——批 4C 才刪）；
`react-surface-lifecycle.test.js` 其餘所有斷言（A 群 `:53-92`、B 群 `:94-126` 含 `:109`
白名單與 `:94` 標題既知髒點、C 群其餘、E 群 `:156-163`、F 群 `:165-181` 除 `:179` 一行）;
`app-errors.test.js` 其餘（含 `:122-127` 的 AppErrorBoundary 逐檔掃描、`:130-` 的
refAdapters 逐檔內容斷言——只改計數來源，不改掃描本體）;
`sheets-dom.test.js`／`session-presentation-boundary.test.js`（其 `:114` freeze 計數 13
非本批三份之一，不動）;`surfaceManifest.js` 既有六組;所有 spec 檔。

## Ground truth（2026-08-26 開單時實測；動手前自行重驗）

- `app-errors.test.js` 現況：全檔零 `SURFACE_MANIFEST` 引用；`sheetFiles` 是自掃
  `src/sheets/` 的絕對路徑清單；`refAdapters` 在 `:128` 以字串 `"content did not mount"`
  過濾、`:129` 斷言其計數。
- `react-surface-lifecycle.test.js`：已有 `assertExactNamedScan(actual, expected, label)`
  named-scan helper（`:137` 有用例可循）；`SURFACE_MANIFEST` 已 import。
- App.tsx 字面：三個 page Request 在 `:85`（MePage）／`:101`（MessagesPage）／`:117`
  （MySessionsPage）；四個 `aria-current={activePage === "…"` 字面在 `:504` `"map"`／
  `:517` `"my-sessions"`／`:562` `"messages"`／`:582` `"me"`。
- F 群 `:169-173` 已有三個方法的權威清單（`imperativeMethodBodies` 陣列，抽
  `enterConfirming`／`handleEscape`／`setJoinPreview`）；`:179` 的裸數字 `3` 就是它的
  長度重複。

## 作法要求

### A. `surfaceManifest.js` 新增兩欄

- `lazyPages: namedList(["src/pages/MePage.tsx", "src/pages/MessagesPage.tsx",
  "src/pages/MySessionsPage.tsx"])`。
- `navDestinations: namedList(["map", "my-sessions", "messages", "me"])`
  （依 App.tsx 出現順序）。

### B. `app-errors.test.js` 收斂（長度→名冊集合比對）

- import `SURFACE_MANIFEST`；`:121` 改為：掃描到的 `sheetFiles` 轉 repo-relative
  POSIX 路徑後排序，與 `[...SURFACE_MANIFEST.sheetAdapters].sort()` 做
  `assert.deepStrictEqual`（保留原錯誤訊息語意）。
- `:129` 同法對 `SURFACE_MANIFEST.imperativeAdapters`。
- 掃描本體與後續逐檔內容斷言不動——收斂的是「期望值來源」，不是「證據來源」。

### C. `react-surface-lifecycle.test.js` 三處收斂

- `:139`：升級為 named scan——用 regex 抽出 APP 內全部
  `import("../pages/<Name>.tsx")` 的 `<Name>`，以 `assertExactNamedScan` 對
  `SURFACE_MANIFEST.lazyPages`（比對時取 basename 或雙向正規化，二擇一並說明）。
- aria-current 裸數字 `4`：改抽出全部 `activePage === "…"` 字面，以
  `assertExactNamedScan` 對 `SURFACE_MANIFEST.navDestinations`。
- `:179`：裸數字 `3` 改為 `imperativeMethodBodies.length`（引用檔內既有權威清單）。
  **設計說明**：此處不新增 manifest 欄位——manifest 再放一份方法名清單會製造新鏡像，
  且 F 群整體歸批 5 還會再動；本批只消滅裸數字重複。回報中如實記載此偏離
  （Q3 條文字面是「引用單一 manifest」，此處是「引用單一 in-file 來源」）。

### D. 收斂有牙 canary（三組各一次三拍，必附逐字輸出）

每組：暫時從對應來源移除一筆 → 對應測試必須紅且錯誤訊息指向該筆 → byte-identical
還原 → 綠。

1. `surfaceManifest.sheetAdapters` 移除任一筆 → `app-errors.test.js` 紅。
2. `surfaceManifest.lazyPages` 移除任一筆 → `react-surface-lifecycle.test.js` 紅。
3. `surfaceManifest.navDestinations` 移除任一筆 → 同檔紅。

（`:179` 的 canary：暫時從 `:169-172` 陣列移除一個抽取項 → `:179` 或方法斷言紅 →
還原綠。）

## 不在範圍

- 任何 `src/` 變更（含 `sheets.js` 死 export、SessionDetailSheet——4B/4C）;
- `session-presentation-boundary.test.js:114` 的 freeze 計數;
- `react-surface-lifecycle.test.js:94` 標題髒點（批 5）;
- 新依賴、UX、文案。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

| 檢查 | 指令 | 通過標準 |
| --- | --- | --- |
| 型別 | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| 格式 | `npm run prettier:check` | exit 0 |
| Mock（含 unit） | `npm run test:mock` | unit 全綠＋288 passed／4 skipped（存量 flake 已立案不算紅，撞到重跑註明） |
| 空白 | `git diff --check` | 無輸出 |
| 範圍自證 | `git diff --stat` | 只含解凍三檔＋回報文件 |

`test:local` 豁免依 `.claude/rules/testing.md`「只有純測試檔、CI 設定或文件批次可豁免」；
`build`／`check:production-bundle` 豁免另依「零 `src/` 變更＝bundle 產物不變」推論。
若 `git diff` 出現任何 `src/` 檔案，兩類豁免同時失效＝BLOCKED。

## 回報合約

寫 `docs/arch-dispatch-2026-08-26-batch4A-manifest-report-codex.md`（不 commit、不 push），
必含：三處收斂前後對照（引用改後原文）、三組 canary 三拍逐字輸出、`:179` 偏離設計
說明、範圍自證（`git diff --stat` 逐字）、收尾矩陣逐字輸出、Codex 五問（第 5 問答
「對 4B SessionDetailSheet 重 lazy 化的建議——特別是 `openSessionSheet` 同步
`handleEscape` 契約如何過渡到 `deferSurfaceOpen` 樣板」）、未做／疑義／BLOCKED。
