# 批 28：收尾掃描、CI 完整性與工具鏈釘版

日期：2026-08-21　基準：`482e7bd`
對應退件單：`docs/codex-rework-order-2026-08-20.md` §6

## 1. 問題

退件單列出九個不阻擋 REL、但會讓後續維護出現靜默漏掃或錯誤認知的尾項。開工實測為：

- `contrast-tokens.test.js` 只讀 `src/` 頂層，未來的 `src/pages/*.css` 不在掃描集。
- legacy scan 實際是 64 個 `src` 來源檔加 `index.html`，但下限只有 50，漏 15 檔仍可綠。
- `git ls-tree -r main --name-only | grep -c '^\.github/'` 為 `0`；CLAUDE.md 卻寫成 workflow
  已在 main 執行。
- CLAUDE.md 本機清單少了已存在 CI 聚合 script 的 production bundle gate。
- `sessionActions.js` 是 338 行 JavaScript；`checkJs: false` 且 lint 只掃 `.ts/.tsx`。
- presentation boundary 只擋 `: any`，不擋 `as any`、`any[]`、`<any>`。
- `test:session-unit` 寫死 21 個檔名，頂層 unit 差集沒有自動檢查；唯一合法排除是由
  `test:local` 執行的 `session-data-local-api.test.js`。
- `npx supabase` 未釘版；開工時本機解析版本為 `2.115.0`。
- 批 13–23 的七個既有單行字面 `\n` commit 不值得冒險改寫歷史。

## 2. 改動

1. `tests/contrast-tokens.test.js:13-29` 改成遞迴讀取 `src/**/*.css`，保留 13 檔與每檔
   大於 100 bytes 的非空防線。
2. `tests/legacy-style-scan.test.js:21,35-42` 把基線拉到實數 65，並要求 `src`、
   `components`、`pages`、`sheets` 四個既有來源目錄各有直接來源檔。
3. `CLAUDE.md:138-140` 改成 workflow 已設定但尚未 push；`main` 要等 REL 追上才生效。
4. `CLAUDE.md:133-135` 在 build 後補 `npm run check:production-bundle`。
5. `src/sessionActions.js:3-5` 明寫目前沒有 TypeScript／ESLint 靜態保護；
   `docs/frontend-fix-plan-2026-08-20.md:732-734` 加入後續轉 TS、受控 checkJs 或 JS lint 待辦。
6. `tests/session-presentation-boundary.test.js:7,73` 擴大 explicit-any 規則，涵蓋 `: any`、
   `as any`、`any[]`、`<any>`。
7. `tests/ci-config.test.js:50-60` 遞迴外的頂層全集與 package script 做精確集合比較，並
   另證 local-only suite 確實由 `test:local` 執行。
8. `package.json` 與 `package-lock.json` 將 Supabase CLI 精確釘在 `2.115.0`；
   `tests/ci-config.test.js:115-120` 同時鎖 package、lockfile 與 workflow 的本機 `npx` 使用面。
9. 沒有 rebase、amend、reset 或重寫批 13–23；批 24–28 繼續使用真正多段 commit message。

## 3. canary 四拍

canary 是新增一支合法但未登記的 `tests/batch-28-canary.test.js`：

```js
import test from "node:test";

test("batch 28 registration canary", () => {});
```

1. 改動後、無 canary：

   ```text
   $ node --test tests/ci-config.test.js
   1..12
   # pass 12
   # fail 0
   # exit 0
   ```

2. 用精確 patch 加入 canary 後：

   ```text
   not ok 3 - the session unit aggregate registers every top-level unit test except the local API suite
   Expected values to be strictly deep-equal:
   + actual - expected
     [
       'tests/app-errors.test.js',
   -   'tests/batch-28-canary.test.js',
       'tests/ci-config.test.js',
   1..12
   # pass 11
   # fail 1
   # exit 1
   ```

3. 用精確 delete patch 移除 canary，確認 `test ! -e tests/batch-28-canary.test.js` 後重跑：

   ```text
   1..12
   # pass 12
   # fail 0
   # exit 0
   ```

4. 用 `git archive 482e7bd` 建立 `/private/tmp` 對照組並加入同一支 canary；舊版沒有全集
   差集 assertion，因此靜默：

   ```text
   $ node --test tests/ci-config.test.js
   1..10
   # pass 10
   # fail 0
   # exit 0
   ```

## 4. 完整 gates

| 指令／gate | 逐字結果 |
| --- | --- |
| `npm ci` | exit 0；exact lock 可重建，177 packages installed |
| `npx supabase --version` | `2.115.0` |
| `npm run test:db` | `Files=7, Tests=799`、`Result: PASS` |
| courts seed `--check` | `--check 通過:產出檔案與 data/courts.json 重生結果一致。` |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run prettier:check` | `All matched files use Prettier code style!` |
| `npm run test:session-unit` | `276 passed / 0 failed` |
| Chromium mock e2e | `266 passed / 4 skipped` |
| `npm run build` | JS `714.34 / 200.64 kB`；CSS `65.39 / 10.76 kB` |
| `npm run check:production-bundle` | `12 files, 12 demo identifiers absent` |
| `git diff --check` | exit 0 |
| `npm audit --omit=dev --audit-level=high` | `found 0 vulnerabilities` |

`npm run test:local` 依退件單 §1 豁免：本批只有 tests／CI 文件／dependency pin，唯一 `src/`
diff 是 `sessionActions.js` 的三行註解。以下命令輸出為空，證明沒有 runtime 行變更：

```bash
git diff -U0 HEAD -- src/sessionActions.js \
  | grep -E '^[+-]' \
  | grep -Ev '^(\+\+\+|---|[+-][[:space:]]*(//|/\*|\*|$))'
```

資料庫 gate 原本可因零 migration 豁免，但本批改了 Supabase CLI 工具鏈，因此保守實跑並通過
799 條 pgTAP。WebKit 已在批 26 建立三輪一致的非阻擋基線，本批不改 browser runtime 或 fixture，
故不重跑。

## 5. 驗收條件對照

| 條件 | 結果 |
| --- | --- |
| contrast CSS 掃描遞迴涵蓋未來子目錄 | ✅ `readCssTree()` |
| legacy scan 不再容許目前單檔漏掃，且四個來源目錄不可整段消失 | ✅ 65 基線＋逐目錄 assertion |
| CLAUDE.md 不再假稱未 push workflow 已在 main 執行 | ✅ 本機 remote refs 無包含 `5944731` 的分支 |
| 本機 gate 清單包含 production bundle | ✅ build 下一行明列 |
| `sessionActions.js` 靜態保護缺口已註明並留下待辦 | ✅ source header＋plan item 10 |
| explicit-any 四種寫法都有 static guard | ✅ 單一 `EXPLICIT_ANY` 規則 |
| 新頂層 unit 漏登記會紅，local-only suite 仍有 owner | ✅ canary 11/12；control 10/10 |
| Supabase CLI 不再跟隨 registry latest | ✅ package 與 lockfile 都是 exact `2.115.0` |
| 不重寫歷史，且本輪 commit 使用真換行 | ✅ 批 13–23 hashes 未動；批 24–28 多段訊息 |

## 6. 變更清單與偏離

提交前預期變更：

```text
CLAUDE.md
docs/frontend-fix-plan-2026-08-20.md
docs/migration-reports/batch-28.md
package.json
package-lock.json
src/sessionActions.js
tests/ci-config.test.js
tests/contrast-tokens.test.js
tests/legacy-style-scan.test.js
tests/session-presentation-boundary.test.js
```

沒有 production 行為改動。Supabase CLI 以 devDependency 而非 `supabase/setup-cli` action 釘版，
理由是本機、CI 與所有 package scripts 都能經同一份 lockfile 使用相同版本。`npm ci` 的完整 audit
仍報兩個既有 dev-only transitive advisory（`nanoid`、`postcss`）；production-only audit 為 0，且
本批不以未授權的 `npm audit fix` 擴大 dependency 變更。沒有 push、deploy、REL、merge、migration
或歷史改寫。
