# 批 25：補齊 presentation boundary 與 CI 四個守門洞

日期：2026-08-21　基準：`ea504f0`
對應退件單：`docs/codex-rework-order-2026-08-20.md` §3

## 1. 問題

驗收方的四顆違規 canary 在 `5944731` 全部靜默：

1. 未列入 14 個字串清單的 `FilterSheet.tsx` 可反向 import `sessionViews.js`。
2. workflow 可刪除 `npm run test:ci:supabase`，測試只檢查 `package.json`。
3. `frontend` 或 `supabase` job 可設 job-level `continue-on-error: true`。
4. `script.includes("npm run test:local")` 會被 `npm run test:local:mobile` 前綴誤滿足。

本批在 `git archive 5944731` 同時加入四顆 canary 後重跑：

```bash
node --test tests/session-presentation-boundary.test.js tests/ci-config.test.js
```

結果仍為 `# pass 12 # fail 0`、exit 0，證明四洞都真實存在。

## 2. 改動

- `tests/session-presentation-boundary.test.js`
  - 遞迴發現 `src/**/*.tsx`，以 `>= 21` 非空下限防止掃描範圍退化。
  - 全部 TSX 一律禁止反向 import `sessionViews.js`。
  - 另保留 14 個真正 presentation consumers 清單，逐檔要求 import
    `sessionPresentation.ts`，避免把 `AppErrorBoundary` 等非消費者錯誤套用此條件。
- `tests/ci-config.test.js`
  - frontend 與 Supabase 聚合 script 都先以 `&&` 切成完整 command token，再用
    `deepEqual` 鎖住順序與全集；不再用 substring/indexOf 判斷。
  - 明確要求 workflow 呼叫 `npm run test:ci:supabase`。
  - 擷取 `frontend`、`supabase` job block，禁止四空格縮排的 job-level
    `continue-on-error`；Supabase stop step 的八空格 step-level 設定仍合法。

## 3. canary 四拍

### 3.1 存量綠

```bash
node --test tests/session-presentation-boundary.test.js tests/ci-config.test.js
```

```text
# tests 14
# pass 14
# fail 0
exit=0
```

### 3.2 四顆 canary 各自變紅

所有 canary 都以精確 patch 加入，執行後再以反向精確 patch 清除。

1. `src/sheets/FilterSheet.tsx` 加
   `import { avatarRuntime as __cycle } from "../sessionViews.js";`

   ```bash
   node --test tests/session-presentation-boundary.test.js
   ```

   ```text
   error: 'src/sheets/FilterSheet.tsx recreates the reverse edge'
   # pass 4
   # fail 1
   exit=1
   ```

2. 從 `.github/workflows/quality-gate.yml` 刪除
   `- run: npm run test:ci:supabase`

   ```bash
   node --test tests/ci-config.test.js
   ```

   ```text
   The input did not match the regular expression /run: npm run test:ci:supabase/
   # pass 8
   # fail 1
   exit=1
   ```

3. 在 `frontend` job 加四空格縮排的 `continue-on-error: true`

   ```bash
   node --test tests/ci-config.test.js
   ```

   ```text
   error: 'frontend job no longer blocks merging'
   # pass 8
   # fail 1
   exit=1
   ```

4. 將 `test:ci:supabase` 的 `npm run test:local &&` 精確刪除，只留 mobile

   ```bash
   node --test tests/ci-config.test.js
   ```

   ```text
   Expected values to be strictly deep-equal:
   -   'npm run test:local',
       'npm run test:local:mobile',
   # pass 8
   # fail 1
   exit=1
   ```

### 3.3 精確還原後再綠

```bash
node --test tests/session-presentation-boundary.test.js tests/ci-config.test.js
git diff --name-only
```

```text
# tests 14
# pass 14
# fail 0
tests/ci-config.test.js
tests/session-presentation-boundary.test.js
exit=0
```

輸出只剩本批兩個測試檔，四顆 canary 都未殘留。

### 3.4 `5944731` 對照組

```bash
control_dir=$(mktemp -d /tmp/tennis-batch25-control.XXXXXX)
git archive 5944731 | tar -x -C "$control_dir"
ln -s /Users/ian/tennisPartnerFinder/node_modules "$control_dir/node_modules"
# 以精確 patch 同時加入上述四顆 canary
(cd "$control_dir" && node --test \
  tests/session-presentation-boundary.test.js tests/ci-config.test.js)
```

```text
# tests 12
# pass 12
# fail 0
exit=0
```

## 4. 完整 gate

```bash
npm run test:ci:frontend
```

| Gate | 結果 |
| --- | --- |
| courts seed `--check` | 通過 |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run prettier:check` | `All matched files use Prettier code style!` |
| `npm run test:session-unit` | `272 passed / 0 failed` |
| Chromium mock e2e | `266 passed / 4 skipped`（270） |
| `npm run build` | JS `714.34 / 200.64 kB`；CSS `65.39 / 10.76 kB` |
| production bundle gate | 12 files；12 demo identifiers absent |
| `git diff --check` | exit 0 |

依批 24 落檔的新判準，本批只改 `tests/` 與報告，零 `src/` runtime、零 migration，
所以 `npm run test:db`、`npm run test:local` 合法豁免。兩者已在前一批相同 HEAD 的 runtime
上完整通過，本批沒有改動其執行面。

## 5. 驗收條件對照

| 條件 | 結果 |
| --- | --- |
| 全部 `src/**/*.tsx` 自動納入 reverse-import gate | ✅ 21 檔、下限 `>= 21` |
| 14 個 presentation consumers 仍逐檔要求正向 import | ✅ 清單數量另斷言為 14 |
| workflow 必須呼叫 Supabase 聚合入口 | ✅ canary #2 紅 |
| frontend/supabase job 不可靜默非阻擋 | ✅ canary #3 紅；合法 stop step 未誤殺 |
| desktop local command 不可被 mobile 前綴滿足 | ✅ canary #4 紅 |
| frontend script 同樣使用完整 token 比對 | ✅ `deepEqual` 鎖住八條命令全集與順序 |

## 6. 變更清單與偏離

```text
tests/ci-config.test.js                     | 38 ++++++++++++++++++++---------
tests/session-presentation-boundary.test.js | 27 +++++++++++++++++---
docs/migration-reports/batch-25.md          | new
```

- 工單偏離：無；另依工單提醒同步把 frontend script 從 substring/indexOf 判斷收斂成完整 token。
- 零 production/runtime 行為、DOM、文案、aria、class、testid 或既有 e2e 斷言改動。
- 使用者提供的兩份未追蹤 intake 文件仍未納入本批。
