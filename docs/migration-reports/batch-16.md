# 批 16：依目前主線重建 GitHub Actions 品質門

日期：2026-08-20　基準：`30201b8`
對應工單：`docs/frontend-fix-plan-2026-08-20.md` 的 **P0-D**

## 1. 問題

專案沒有已提交的 CI；`git push` 會觸發部署，但 TypeScript、lint、測試失敗都只能靠人
記得攔。舊 worktree 的 workflow 還停在 React/TS 遷移前，呼叫不存在的 script，不能直接搬。

`tests/performance.spec.js` 另有固定 1000ms 的 shell timing 預算，本機成立，但共享 runner
餘裕不足；直接把全域 timeout 放寬會掩蓋真正的慢測試。

## 2. 改動

- 新增 `.github/workflows/quality-gate.yml`，觸發 `main` 與目前開發分支的 push／PR，並保留
  `workflow_dispatch`。權限只讀、同 ref 舊 run 可取消、失敗上傳 Playwright 證據。
- frontend job：Node 22、`npm ci`、Chromium，執行 `npm run test:ci:frontend`。
- Supabase job：啟動 local stack、guarded reset、pgTAP、desktop local、mobile local，最後
  `always()` 停止 stack。
- `package.json` 新增 `test:local:mobile`、`test:ci:frontend`、`test:ci:supabase`；全部依目前
  249+ 測試清單重建，沒有複製舊分支的 stale scripts。
- 新增 `tests/ci-config.test.js` 五條非空／反假綠契約，並正式登記進 unit script。
- performance 預算改成 `TENNIS_DISCOVERY_SHELL_BUDGET_MS`：本機仍是 1000ms，CI 只對此一格
  設 2500ms，不動 Playwright 的其他 timeout。
- 同步 `CLAUDE.md` 與 `.claude/rules/testing.md`；`CLAUDE.md` 為 189/200 行。

批 23 才加入 WebKit，所以本批 workflow 明確只有 Chromium。

## 3. canary 四拍

canary 把 workflow 的：

```yaml
run: npm run test:ci:frontend
```

精確換成只跑 `npm run build`。

1. 改動後、無 canary：`node --test tests/ci-config.test.js` → 5/5 pass、exit 0。
2. 改動後 + canary：exit 1，逐字核心輸出：

   ```text
   The input did not match the regular expression /run: npm run test:ci:frontend/.
   # pass 4
   # fail 1
   ```

3. 精確還原該一行：5/5 pass、exit 0；`rg` 確認 workflow 第 33 行回到聚合 gate。
4. 改動前對照：以 `git archive 30201b8` 建乾淨副本，放入同樣只跑 build 的壞 workflow；
   舊 `npm run test:session-unit` 仍 `# pass 249 / # fail 0`，因為當時沒有 CI 設定測試且
   package script 沒登記它。這證明本批補上的 gate 能抓到以前會靜默通過的配置漂移。

canary 清除未使用 `git checkout`。

## 4. 完整 gates

### frontend 聚合 gate

`npm run test:ci:frontend` 實際順序與結果：

| Gate | 結果 |
|---|---|
| courts seed `--check` | 通過 |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run prettier:check` | `All matched files use Prettier code style!` |
| `npm run test:session-unit`（由 mock 入口執行） | `# tests 254 / # pass 254 / # fail 0` |
| Chromium mock e2e | `254 passed / 4 skipped`（258） |
| `npm run build` | 主 JS `713.77 kB / gzip 201.04 kB`；CSS `64.61 / 10.65 kB` |
| `git diff --check` | exit 0 |

### Supabase 聚合 gate

先明確執行 `CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test`，只重置 loopback 測試庫；再跑
`npm run test:ci:supabase`：

| Gate | 結果 |
|---|---|
| pgTAP `npm run test:db` | 7 files / 799 tests / PASS |
| local API | 2 passed |
| `supabase-chromium` | 42 passed / 11 skipped（53） |
| `supabase-mobile-chromium` | 6 passed |
| courts seed + `git diff --check` | exit 0 |

另以 `npx prettier --check .github/workflows/quality-gate.yml` 驗證 YAML 可解析且格式正確。
本批沒有 DB/local 豁免，因為新增的 CI 正是要負責這些路徑。

GitHub-hosted runner 未實跑：派工單明令不得 push，而 workflow 只有進入遠端 ref 才能啟動。
本批已完成所有可在本機證明的 script、配置與完整資料庫 gate；遠端 runner 的首次結果需由
維護者日後 push 此分支後觀察，不能在本報告假裝已通過。

## 5. 驗收條件

| 條件 | 結果 |
|---|---|
| workflow 對 main 與目前開發分支生效 | ✅ 靜態契約通過 |
| frontend / Supabase 兩個 job 對齊現行 12 道 gate | ✅ |
| local mobile script 已撿回並實跑 6/6 | ✅ |
| CI timing budget 可參數化、本機仍 1000ms | ✅ |
| local config 的 loopback 防護維持通過 | ✅ |
| WebKit 尚未加入本批必要 gate | ✅ |
| 凍結 DOM／文案／aria／class／testid 與 e2e 斷言零變更 | ✅ |

## 6. 變更清單與偏離

- `.github/workflows/quality-gate.yml`
- `package.json`
- `tests/ci-config.test.js`
- `tests/performance.spec.js`（只參數化同一個 timing 門檻）
- `CLAUDE.md`
- `.claude/rules/testing.md`
- `docs/migration-reports/batch-16.md`

偏離只有遠端 runner 未跑；原因不是略過驗證，而是上層明令禁止 push。沒有 REL、push、merge、
deploy，也沒有改 WebKit 納入時機。
