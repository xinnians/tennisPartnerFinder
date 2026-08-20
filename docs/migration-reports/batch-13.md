# 批 13：讓舊視覺封條遞迴涵蓋 React 子目錄

日期：2026-08-20　基準：`9d08f01`
對應工單：`docs/frontend-fix-plan-2026-08-20.md` 的 **P0-A**

## 1. 問題

`tests/legacy-style-scan.test.js` 原本只讀 `src/` 頂層，批 10 搬到
`src/pages/`、`src/sheets/`、`src/components/` 的 20 個 React 檔完全漏掃。
原下限只有 23，退化成頂層掃描時仍有 39 檔，所以會假綠。

## 2. 改動

- 依 `tests/session-create-form.test.js` 的既有模式加入 `readSourceTree()` 遞迴走訪。
- 掃描副檔名維持 `.css/.js/.ts/.tsx`，路徑仍使用 `src/...`，錯誤訊息格式不變。
- 最小掃描集提高到 50，高於非遞迴退化值 39。
- 更新過期註解，不再宣稱只靠頂層 `readdir` 就能自動涵蓋新檔。

實際掃描集是 59 檔（58 個 `src/` 來源 + `index.html`），其中巢狀檔 20 個；逐字包含
`src/sheets/SessionChatSheet.tsx`、`src/pages/MePage.tsx`、
`src/components/Avatar.tsx`。

## 3. canary 四拍

canary 是在 `src/sheets/SessionChatSheet.tsx` 注入註解色碼 `#142c4b`；移除時以
`apply_patch` 精確刪除該兩行，未使用 `git checkout`。

1. 改動後、無 canary：`node --test tests/legacy-style-scan.test.js` → `# pass 1`、`# fail 0`、exit 0。
2. 改動後 + canary：exit 1，逐字核心輸出：

   ```text
   error: 'src/sheets/SessionChatSheet.tsx 仍含舊視覺常數 #142c4b'
   # pass 0
   # fail 1
   ```

3. 精確移除 canary：同一指令回到 `# pass 1`、`# fail 0`、exit 0；
   `rg "Batch 13 canary|#142c4b" src/sheets/SessionChatSheet.tsx` 零命中。
4. 改動前對照：以 `git archive 9d08f01` 建乾淨副本，注入同一顆巢狀 canary；
   舊測試回 `# pass 1`、`# fail 0`、exit 0，證明本批才補上這道牙。

另做退化 canary：把 `readSourceTree()` 呼叫精確換回完整的非遞迴 `readdirSync` 流程，
測試 exit 1，逐字核心輸出為：

```text
error: '掃描集過小(僅 39 檔),readdir 可能漏掃 src/ 或路徑錯誤;...'
# pass 0
# fail 1
```

精確還原遞迴呼叫後再次綠燈。

## 4. 完整 gates

| Gate | 結果 |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run prettier:check` | `All matched files use Prettier code style!`，exit 0 |
| `node scripts/generate-courts-seed.mjs --check` | `--check 通過`，exit 0 |
| `npm run test:session-unit` | `# tests 248`、`# pass 248`、`# fail 0`，exit 0 |
| `npm run test:mock` | `254 passed / 4 skipped`（258），exit 0 |
| `npm run build` | 主 JS `713.77 kB / gzip 201.04 kB`，CSS `64.61 kB / gzip 10.65 kB`，exit 0 |
| `git diff --check` | exit 0 |

`npm run test:db`、`npm run test:local` 與 local browser project 豁免：本批只改 Node
掃描測試與報告，零 `src/`、migration、`dataApi.js`、RPC 或 Supabase 契約變更；完整 mock
測試已覆蓋這支單元測試。未啟動或重置任何資料庫。

## 5. 驗收條件

| 條件 | 結果 |
|---|---|
| 掃描集為 59 檔、巢狀檔 20 個 | ✅ |
| 三個指定 React 路徑都在掃描集 | ✅ |
| 巢狀舊色碼會指名路徑並變紅 | ✅ |
| 移除遞迴會以「掃描集過小」變紅 | ✅ |
| 舊數字與舊下限字面零命中 | ✅ |
| `src/` 零變更，凍結 DOM／文案／aria／class／testid 零變更 | ✅ |

## 6. 變更清單與偏離

變更只有：

- `tests/legacy-style-scan.test.js`
- `docs/migration-reports/batch-13.md`

沒有偏離工單。工單所稱「單檔改動」是產品／測試實作檔；依派工協定另附本批報告。
