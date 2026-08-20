# 批 14：讓對比 gate 涵蓋全部 13 個 CSS 檔

日期：2026-08-20　基準：`f35a8b4`
對應工單：`docs/frontend-fix-plan-2026-08-20.md` 的 **P0-C**

## 1. 問題

`tests/contrast-tokens.test.js` 只讀 `src/session.css`。批 10 已拆成 13 個 CSS 檔，
其餘 12 檔的 token 或規則變更都不會進對比 gate；`src/main.js` 與兩份歷史文件仍把
這個過期限制寫成目前契約。

另外，`--color-court #1c5c3c` 疊在 `--color-ink #12291c` 的 focus 外框只有
1.9457:1，但維護者已在 D4 決定維持現色，不能新增一條必然失敗的 focus 斷言。

## 2. 改動

- 測試以 `readdirSync` 自動讀取 `src/` 頂層全部 `.css`，排序後合併再剝除註解。
- 新增至少 13 檔、每檔大於 100 字元、剝註解後大於 70,000 字元的非空防呆。
- 實測為 13 檔、原始 98,729 字元、剝註解後 73,271 字元；保留既有 11 組文字配對。
- 在測試檔頭與 `.claude/rules/testing.md` 記錄 D4 例外：實算值、兩個位置、理由與日期。
- 修正 `src/main.js`、批 10 報告與遷移計劃的過期單檔契約；批 10 報告以後註保留歷史。

依 D4 **沒有**新增 focus 對比斷言，也沒有改任何顏色。

## 3. canary 四拍

canary 是在排序最前的 `src/create-session.css` 暫時加入：

```css
:root {
  --color-text-secondary: #ffffff;
}
```

1. 改動後、無 canary：`node --test tests/contrast-tokens.test.js` → 5/5 pass、exit 0。
2. 改動後 + canary：exit 1，兩條核心輸出為：

   ```text
   次要文字 on 頁底:#ffffff on #faf9f3 只有 1.0548:1
   他人的聊天泡泡 .chat-message(#eef1e7):--color-text-secondary #ffffff 只有 1.1431:1
   # pass 3
   # fail 2
   ```

3. 以精確 patch 移除同一個四行區塊：5/5 pass、exit 0；檔頭逐字回到批 10 註解。
4. 改動前對照：以 `git archive f35a8b4` 建乾淨副本並注入同一 canary；舊測試只讀
   `session.css`，因此 4/4 pass、exit 0。這證明新紅燈來自本批的跨檔涵蓋。

canary 清除未使用 `git checkout`。

## 4. 完整 gates

| Gate | 結果 |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run prettier:check` | `All matched files use Prettier code style!`，exit 0 |
| `node scripts/generate-courts-seed.mjs --check` | `--check 通過`，exit 0 |
| `npm run test:session-unit` | `# tests 249`、`# pass 249`、`# fail 0`，exit 0 |
| `npm run test:mock` | `254 passed / 4 skipped`（258），exit 0 |
| `npm run build` | 主 JS `713.77 kB / gzip 201.04 kB`，CSS `64.61 kB / gzip 10.65 kB`，exit 0 |
| `git diff --check` | exit 0 |

`npm run test:db`、`npm run test:local` 與 local browser project 豁免：改動只涉及 CSS
掃描測試、註解與文件，沒有 runtime CSS 值、DOM、migration、`dataApi.js`、RPC 或 Supabase
契約變更。完整 mock 測試證明畫面與既有 Chromium 行為未變；未重置資料庫。

## 5. 驗收條件

| 條件 | 結果 |
|---|---|
| 自動讀取 13 個 CSS，具檔數與內容下限 | ✅ |
| 既有 11 組文字對比維持通過 | ✅ |
| 其他 CSS 的不合格 token canary 會指名配對並變紅 | ✅ |
| 三處過期單檔契約已更正 | ✅ |
| focus 例外含 1.9457:1、兩處位置、理由、日期 | ✅ |
| 沒有 focus 斷言、沒有改色 | ✅ |
| DOM／文案／aria／class／testid 與既有 e2e 斷言零變更 | ✅ |

## 6. 變更清單與偏離

- `tests/contrast-tokens.test.js`
- `.claude/rules/testing.md`
- `src/main.js`（僅檔頭註解）
- `docs/migration-reports/batch-10.md`（歷史後註）
- `docs/frontend-migration-plan-2026-08-18.md`
- `docs/migration-reports/batch-14.md`

沒有偏離工單。特別遵守 D4：只記錄 focus 缺口，不修色、不加失敗 gate。
