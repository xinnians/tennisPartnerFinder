# 批 27：回填 presentation 護欄註解並更正歷史驗收宣稱

日期：2026-08-21　基準：`91e400d`
對應退件單：`docs/codex-rework-order-2026-08-20.md` §5

## 1. 問題

批 22 抽出 `sessionPresentation.ts` 時保住了實作，卻刪掉一批說明「哪條測試鎖住計算」或
「為什麼不能改」的護欄。依退件單的同一條統計命令，舊 `bdf0b86:sessionViews.js` 有 349 行
註解；本批回填後三個拆分檔合計 236 行。行數差本身不是驗收條件，但反向檢查確認兩條被點名的
e2e 鎖定說明在本批前確實不存在。

另有四份歷史報告把「授權的斷言參數化」、「人工 CSP 盤點」、「寫死 14 檔的 boundary」及
WebKit 首次基線寫成過度肯定的 ✅。批 23 的 WebKit 數字已由批 26 更正；本批處理剩餘三份，
不重複改寫同一份報告。

## 2. 改動

- `src/sessionPresentation.ts:93-149` 回填五組仍成立的限制理由：null NTRP 不得落成 0.0、
  trust count 是三處共用的中性聚合、舊 profile court name 必須相容、segmented state 是
  view-only root 狀態，以及 scoreboard 只能局部去掉 NTRP 前綴。
- `src/sessionPresentation.ts:453` 回填地圖摘要與 drawer live region 必須共用文案的無障礙理由。
- `src/sessionPresentation.ts:709-710` 回填 player directory 的既有功能由 hosted assertions
  鎖住、不可為了視覺稿移除。
- `src/sessionPresentation.ts:739-740` 回填 player card 公開值逐字與 escaping 由 smoke e2e
  鎖住、不可改計算方式。
- 沒有搬回只描述當時批次、舊 DOM 結構或已失效行號的註解；測試引用改用穩定 test title／
  assertion 名稱，避免未來插行後變成假證據。
- `docs/migration-reports/batch-16.md:103` 誠實標明一處 e2e 斷言曾依工單參數化。
- `docs/migration-reports/batch-21.md:98` 改為人工盤點，並限定 gate 不能證明 CSP 清單完備。
- `docs/migration-reports/batch-22.md:33` 改為批 25 已落地的遞迴 `src/**/*.tsx` 全集契約。
- `tests/session-presentation-boundary.test.js:75` 新增靜態合約，鎖住上述兩條 e2e 理由與三份
  更正文案。這是為滿足共通 canary 四拍而加入的 test-only 防線，不改 production runtime。

## 3. canary 四拍

canary 是把 `batch-21.md:98` 精確換回舊的「CSP 清單由本機設定與 gate 證明」假 ✅。

1. 改動後、無 canary：

   ```text
   $ node --test tests/session-presentation-boundary.test.js
   1..6
   # pass 6
   # fail 0
   # exit 0
   ```

2. 精確換回舊列後，同一指令變紅：

   ```text
   not ok 4 - batch 27 guard rationale and corrected acceptance claims stay explicit
   The input did not match the regular expression
   /gate 只保證整條 policy.*不證明清單完備/
   1..6
   # pass 5
   # fail 1
   # exit 1
   ```

3. 用精確 patch 恢復更正列後重跑，並逐字確認：

   ```text
   $ node --test tests/session-presentation-boundary.test.js
   1..6
   # pass 6
   # fail 0
   $ rg -n "CSP 來源由本批人工盤點" docs/migration-reports/batch-21.md
   98:| CSP 來源由本批人工盤點；gate 只保證整條 policy 與已列來源未被整段移除，不證明清單完備 | ✅ 人工盤點＋有限 gate |
   # exit 0
   ```

4. 以 `git archive 91e400d` 建立 `/private/tmp` 乾淨對照組；該樹本身就含同一顆舊宣稱，
   但尚無本批靜態合約，因而完全靜默：

   ```text
   $ rg -n "CSP 使用目前 React build 的外部來源清單" "$BATCH27_CONTROL_DIR/docs/migration-reports/batch-21.md"
   98:| CSP 使用目前 React build 的外部來源清單                   | ✅ 本機設定與 gate   |
   $ node --test "$BATCH27_CONTROL_DIR/tests/session-presentation-boundary.test.js"
   1..5
   # pass 5
   # fail 0
   # exit 0
   ```

## 4. 完整 gates

`npm run test:ci:frontend` 在精確移除 canary 後執行，exit 0：

| Gate | 逐字結果 |
| --- | --- |
| courts seed `--check` | `--check 通過:產出檔案與 data/courts.json 重生結果一致。` |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run prettier:check` | `All matched files use Prettier code style!` |
| `npm run test:session-unit` | `274 passed / 0 failed` |
| Chromium mock e2e | `266 passed / 4 skipped` |
| `npm run build` | JS `714.34 / 200.64 kB`；CSS `65.39 / 10.76 kB` |
| production bundle | `12 files, 12 demo identifiers absent` |
| `git diff --check` | exit 0 |

`npm run test:local` 依退件單 §5.3 豁免。證明命令：

```bash
git diff -U0 HEAD -- src/sessionPresentation.ts \
  | grep -E '^[+-]' \
  | grep -Ev '^(\+\+\+|---|[+-][[:space:]]*(//|/\*|\*|$))'
```

輸出為空，exit 1（沒有任何非註解增刪行）；本批其餘變更只有 tests／docs，因此符合 §1
「純測試檔／CI 設定／文件」豁免層級。`npm run test:db` 亦豁免：本批零 migration、零
`dataApi.js`、零 RPC 簽名或資料契約變更。WebKit 已在批 26 完成三輪重現基線，本批不改
browser fixture 或 runtime，故不重跑非阻擋訊號。

## 5. 驗收條件對照

| 條件 | 結果 |
| --- | --- |
| 仍成立、能解釋測試鎖定或不可修改原因的護欄已回填 | ✅ 8 組理由，含退件單指名的兩條 |
| 不搬回失效行號與純歷史實作描述 | ✅ 使用穩定 test title／行為名稱 |
| 批 16 假「e2e 零變更」已更正 | ✅ `batch-16.md:103` |
| 批 21 未再超譯 CSP gate 能力 | ✅ `batch-21.md:98` |
| 批 22 描述與批 25 遞迴全集 gate 一致 | ✅ `batch-22.md:33` |
| 批 23 WebKit 假數字已更正 | ✅ 批 26 已完成，未重複改檔 |
| production 行為零變更 | ✅ source diff 只有註解行；frontend 全綠 |

## 6. 變更清單與偏離

提交前預期 diff：

```text
docs/migration-reports/batch-16.md          |  2 +-
docs/migration-reports/batch-21.md          |  2 +-
docs/migration-reports/batch-22.md          |  2 +-
docs/migration-reports/batch-27.md          | new
src/sessionPresentation.ts                  | 17 +
tests/session-presentation-boundary.test.js | 15 +
```

唯一範圍補強是加入一條 test-only 靜態合約；原因是共通規格仍要求本批提供可在舊版靜默、在新版
變紅的四拍 canary。它不會進 production bundle。沒有改 frozen DOM／文案／aria／class／testid
或既有 e2e 斷言，也沒有 push、deploy、REL、merge、migration 或歷史改寫。
