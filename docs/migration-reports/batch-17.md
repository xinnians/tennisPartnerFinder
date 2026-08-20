# 批 17：把 mockData 排除出 production bundle

日期：2026-08-20　基準：`e0dcd1d`
對應工單：`docs/frontend-fix-plan-2026-08-20.md` 的 **P1-A**

## 1. 問題

`src/dataApi.js` 靜態 import `src/mockData.js`，所以 8 場 mock 球局、3 位 mock 球友、
9 座 fixture 球場與 12 個「示範○○」暱稱會完整進 production bundle。真實模式不使用它們，
但不該把 demo 資料出貨給每位使用者。

只比對 `./mockData.js` 的 alias 太窄；未來子目錄寫 `../mockData.js` 就會繞過排除。

## 2. 改動

- `vite.config.ts` 在 `command=build + mode=production` 時，以能匹配裸路徑、`./`、`../`、
  多層相對路徑與絕對 source path 的正則，把 `mockData.js` 導向空殼。
- 新增 457 bytes 的 `src/mockData.empty.js`，保留五個 export 名稱但值全是 frozen 空陣列；
  大於批 13 掃描器的 100 字元門檻。
- serve/development 不設 alias，因此 mock Playwright 與本機 demo 繼續使用完整 fixture。
- `tests/ci-config.test.js` 新增五種 import 形狀、空殼不自我匹配、dev 不 alias 的契約。
- 新增 `scripts/check-production-bundle.mjs`，build 後掃描非空 `dist`，阻止 12 個示範暱稱。
  `test:ci:frontend` 已把這道檢查接在 build 後。
- 同步 `CLAUDE.md` 與 `.claude/rules/testing.md`。

未修改 `src/mockData.js` 本身；既有真實 fixture 數仍是 8 sessions / 3 players / 9 courts。

## 3. canary 四拍

canary 把 robust alias 正則精確縮成只匹配 `./mockData.js`：

```text
/^(?:.*\/)?mockData\.js$/  →  /^\.\/mockData\.js$/
```

1. 改動後、無 canary：`node --test tests/ci-config.test.js` → 6/6 pass、exit 0；production
   build 後 bundle 檢查回 `12 demo identifiers absent`。
2. 改動後 + canary：exit 1，逐字輸出：

   ```text
   error: 'production mock alias misses mockData.js'
   # pass 5
   # fail 1
   ```

3. 精確還原正則：6/6 pass、exit 0；`rg` 確認 robust 正則回到 `vite.config.ts`。
4. 改動前對照：以 `git archive e0dcd1d` 建乾淨副本，加入同樣只認 `./` 的窄 alias；
   舊 unit suite 仍 `# pass 254 / # fail 0`，因當時沒有 import 形狀契約。

另有 production 對照：改動前主 JS `713.77 kB / gzip 201.04 kB` 且可 grep 到示範暱稱；
改動後是 `707.59 kB / gzip 199.22 kB`，12 個示範暱稱全數不存在。canary 清除未用
`git checkout`。

## 4. 完整 gates

`npm run test:ci:frontend` 在最終樹執行：

| Gate | 結果 |
|---|---|
| courts seed `--check` | 通過 |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run prettier:check` | `All matched files use Prettier code style!` |
| `npm run test:session-unit`（由 mock 入口執行） | `# tests 255 / # pass 255 / # fail 0` |
| Chromium mock e2e | `254 passed / 4 skipped`（258），與改動前逐字相同 |
| `npm run build` | 主 JS `707.59 / 199.22 kB`；CSS `64.61 / 10.65 kB` |
| `npm run check:production-bundle` | 12 output files；12 demo identifiers absent |
| `git diff --check` | exit 0 |

`npm run test:db`、`npm run test:local` 與 local browser project 豁免：改動只在 production
build alias、空 fixture、bundle gate 與文件，零 migration、`dataApi.js`、RPC 或 Supabase
契約變更。mock e2e 完整跑過，證明開發／測試仍取得完整 demo fixture；本批沒有重置資料庫。

## 5. 驗收條件

| 條件 | 結果 |
|---|---|
| production dist 不含 12 個示範暱稱 | ✅ |
| mock e2e 維持 254 passed / 4 skipped | ✅ |
| fixture 維持 8 sessions / 3 players / 9 courts | ✅ |
| alias 涵蓋所有相對路徑形狀 | ✅ |
| 空殼超過 100 字元且五個 export 齊全 | ✅ |
| production check 已接進 CI | ✅ |
| DOM／文案／aria／class／testid 與既有 e2e 斷言零變更 | ✅ |

## 6. 變更清單與偏離

- `vite.config.ts`
- `src/mockData.empty.js`
- `scripts/check-production-bundle.mjs`
- `tests/ci-config.test.js`
- `package.json`
- `CLAUDE.md`
- `.claude/rules/testing.md`
- `docs/migration-reports/batch-17.md`

沒有偏離工單。驗收不依賴 exact bundle bytes；上面數字只記錄本次實測結果，正式判準是
示範識別字不存在且 mock suite 數量不變。
