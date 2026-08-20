# 批 26：隔離 Google avatar 外網並校正 WebKit 訊號

日期：2026-08-21　基準：`763eaf8`
對應退件單：`docs/codex-rework-order-2026-08-20.md` §4

## 1. 問題

`tests/smoke.spec.js` 的兩個 avatar fixture 使用真實
`lh3.googleusercontent.com`／`lh5.googleusercontent.com` URL，但 `installFakeMaps()` 只攔
Maps 與 Fonts。WebKit 因此真的向 Google 請求、收到 400，並把
`Failed to load resource` 收進 zero-console-error 契約。

批 23 報告另有誠實度問題：初版寫 `125 passed / 7 failed / 3 skipped` 與「7/7 均分類」，
但驗收方完整重跑是 `123 passed / 9 failed / 3 skipped`，漏列
`performance.spec.js:175` 與 `smoke.spec.js:1640`。

## 2. 改動

- `tests/fixtures/fakeMaps.js`
  - 新增 `https://lh*.googleusercontent.com/**` route，回傳記憶體內 1×1 合法 PNG。
  - 保留 Google-shaped URL，仍會走 production URL allowlist。
  - 既有測試仍自行 `dispatchEvent("error")`，fallback 語意未被 stub 掩蓋。
- `tests/ci-config.test.js`
  - 新增靜態 gate，鎖住 wildcard avatar route、PNG response 與既有 explicit error dispatch。
- `docs/migration-reports/batch-23.md`
  - 以後註方式更正歷史跑分與假 `7/7`，補齊九條歷史分類。
  - 將 `performance.spec.js:175` 單列為「負載相依、非穩定」。
- `.claude/rules/testing.md`
  - 基準更新為本批三次一致的 `126 passed / 6 failed / 3 skipped`，並連回完整分類。

## 3. canary 四拍

1. 改動後、無 canary：

   ```bash
   node --test tests/ci-config.test.js
   ```

   ```text
   # tests 10
   # pass 10
   # fail 0
   exit=0
   ```

2. 用精確 patch 移除 avatar route 區塊，再執行同一指令：

   ```text
   not ok 4 - browser fixtures intercept every Google-hosted avatar without bypassing fallback assertions
   The input did not match the regular expression
   /page\.route\("https:\/\/lh\*\.googleusercontent\.com\/\*\*"/
   # pass 9
   # fail 1
   exit=1
   ```

3. 用精確 patch 加回原區塊，確認 route 字面與重跑：

   ```bash
   rg -n 'lh\*\.googleusercontent' tests/fixtures/fakeMaps.js
   node --test tests/ci-config.test.js
   ```

   ```text
   214:  await page.route("https://lh*.googleusercontent.com/**", (route) =>
   # pass 10
   # fail 0
   exit=0
   ```

4. 對照組使用改動前 `763eaf8`（當時沒有此 route，也沒有 gate）：

   ```bash
   control_dir=$(mktemp -d /tmp/tennis-batch26-control.XXXXXX)
   git archive 763eaf8 | tar -x -C "$control_dir"
   ln -s /Users/ian/tennisPartnerFinder/node_modules "$control_dir/node_modules"
   (cd "$control_dir" && node --test tests/ci-config.test.js)
   ```

   ```text
   # tests 9
   # pass 9
   # fail 0
   exit=0
   ```

## 4. 完整 gate 與 WebKit 三次跑分

先隔離驗證兩條 avatar 測試，保留 explicit fallback event：

```bash
TENNIS_TEST_HARNESS_MODE=mock npx playwright test --project=mobile-webkit \
  tests/smoke.spec.js -g "authenticated pre-join roster|profile completion previews" \
  --repeat-each=3 --reporter=line
```

```text
6 passed (5.0s)
exit=0
```

再依工單連續完整執行三次：

```bash
for run_index in 1 2 3; do
  npm run test:mock:webkit -- --reporter=line
done
```

| 次數 | passed | failed | skipped | 結果 |
| --- | ---: | ---: | ---: | --- |
| 1 | 126 | 6 | 3 | 非阻擋 exit 1 |
| 2 | 126 | 6 | 3 | 非阻擋 exit 1 |
| 3 | 126 | 6 | 3 | 非阻擋 exit 1 |

三次完全一致；兩條 avatar 400 與 `Importing a module script failed` 都是 0。
剩餘六條均為批 23 已列的 focus/input-model 訊號：`performance:59`、
`smoke:160`、`:826`、`:2346`、`:2521`、`:3203`。
`performance.spec.js:175` 三次完整跑均綠；結合驗收方 isolated 0/3，故分類為
「負載相依、非穩定」，不混稱 Safari focus 穩定差異。

完整 frontend gate：

| Gate | 結果 |
| --- | --- |
| courts seed `--check` | 通過 |
| `npm run typecheck` / `lint` | exit 0 |
| `npm run prettier:check` | `All matched files use Prettier code style!` |
| `npm run test:session-unit` | `273 passed / 0 failed` |
| Chromium mock e2e | `266 passed / 4 skipped` |
| `npm run build` | JS `714.34 / 200.64 kB`；CSS `65.39 / 10.76 kB` |
| production bundle gate | 12 files；12 demo identifiers absent |
| `git diff --check` | exit 0 |

依新版豁免判準，本批只改 test fixture、test 與文件，零 `src/` runtime、零 migration，
故 `npm run test:db`、`npm run test:local` 合法豁免。

## 5. 驗收條件對照

| 條件 | 結果 |
| --- | --- |
| 所有 `lh*.googleusercontent.com` avatar 請求由 fixture 攔截 | ✅ wildcard route |
| fallback 測試語意保留 | ✅ 兩處 `dispatchEvent("error")`；focused 6/6 |
| 完整 WebKit 至少跑三次且逐次記數 | ✅ 三次均 126/6/3 |
| 三次若有差異不得挑數字 | ✅ 無差異 |
| batch-23 假數字與假 `7/7` 更正 | ✅ 歷史 9/9、現行 6/6 |
| `performance:175` 單列非穩定 | ✅ 未混入 Safari 穩定差異 |
| 不修改既有 e2e 斷言、不把 WebKit 納入 blocking mock script | ✅ 零該類 diff |

## 6. 變更清單與偏離

```text
.claude/rules/testing.md           |  5 +++--
docs/migration-reports/batch-23.md | 24 +++++++++++++-----------
tests/ci-config.test.js            |  7 +++++++
tests/fixtures/fakeMaps.js         | 11 +++++++++++
docs/migration-reports/batch-26.md | new
```

- 工單偏離：無。
- 本批另加一條靜態 gate，避免未來刪除 avatar route 後又回到真外網而無人知情。
- 零 production source、DOM、文案、aria、class、testid 或既有 e2e 斷言改動。
