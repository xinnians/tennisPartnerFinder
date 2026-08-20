# 批 23：加入非阻擋的 Mobile WebKit CI 訊號

日期：2026-08-20　基準：`abdcbce`
對應工單：`docs/frontend-fix-plan-2026-08-20.md` 的 **P3-A**

## 1. 問題

批 15 已讓測試 harness 能在 WebKit 執行，但正式 `playwright.config.js` 仍只有 Chromium
project，CI 也只安裝 Chromium。因此 Safari 相容性即使退步，pull request 上也完全沒有訊號。
舊版 `tests/ci-config.test.js` 甚至把「workflow 不得出現 WebKit」當成既有結構的一部分。

同時不能直接把 WebKit 放進 `npm run test:mock`：目前仍有 Safari 焦點行為差異，硬設為必過會
讓環境／輸入模型差異擋住 Chromium 主線，也會把原本固定的 Chromium 測試總數改掉。

## 2. 改動

- `playwright.config.js` 新增 `mobile-webkit`：使用 `devices["iPhone 12"]`、390×844、port
  5174，並與 `mobile-chromium` 跑同一組 `smoke`、`performance`、`error-boundary`、
  `react-unmount` specs。
- 新增 `npm run test:mock:webkit`，與原本 `test:mock` 分開；原本必跑指令仍逐字指定
  `desktop-chromium` 與 `mobile-chromium`，所以 Chromium 總數保持 270。
- GitHub Actions 新增獨立 `Mobile WebKit (non-blocking)` job：安裝 WebKit、執行相容性測試、
  失敗時上傳 Playwright 證據，並以 `continue-on-error: true` 保證不擋合併。
- `tests/ci-config.test.js` 鎖住 WebKit 裝置、viewport、spec 覆蓋、獨立 script 與非阻擋設定；
  也反向鎖住既有 Chromium script 不可被 WebKit 混入。
- `CLAUDE.md` 與 `.claude/rules/testing.md` 補上指令、CI 性質與最新測試數字。

## 3. canary 四拍

canary 精確刪除 WebKit job 的：

```yaml
continue-on-error: true
```

1. 改動後、無 canary：`node --test tests/ci-config.test.js` 為 `8 passed`、exit 0。
2. 加入 canary 後，同一指令 exit 1，逐字關鍵輸出：

   ```text
   mobile WebKit mirrors mobile Chromium coverage but cannot block the workflow
   # pass 7
   # fail 1
   ```

3. 用精確 patch 還原後重跑 3 次，共 `24 passed`、exit 0。
4. 用 `git archive abdcbce` 建立乾淨對照組；舊版 CI config spec 為 `7 passed`、exit 0，
   當時沒有 WebKit project、job 或非阻擋 gate，所以 Safari 完全失去訊號仍會全綠。

## 4. 完整 gates

`npm run test:ci:frontend` 在最終樹執行：

| Gate                        | 結果                                               |
| --------------------------- | -------------------------------------------------- |
| courts seed `--check`       | 通過                                               |
| `npm run typecheck`         | exit 0                                             |
| `npm run lint`              | exit 0                                             |
| `npm run prettier:check`    | `All matched files use Prettier code style!`       |
| `npm run test:session-unit` | `270 passed / 0 failed`                            |
| Chromium mock e2e           | `266 passed / 4 skipped`（270，與批 22 相同）      |
| Batch 23 穩定性取樣         | `24 passed`（8 格 × 3 次）                         |
| `npm run build`             | 主 JS `714.35 / 200.57 kB`；CSS `65.39 / 10.76 kB` |
| production bundle gate      | 12 output files；12 demo identifiers absent        |
| `git diff --check`          | exit 0                                             |

獨立執行 `npm run test:mock:webkit -- --reporter=line` 的結果為：

```text
125 passed / 7 failed / 3 skipped（135）
```

七條失敗已逐條分類：

| 失敗位置 | 分類 | 判讀與處置 |
| --- | --- | --- |
| `performance.spec.js:59`，開 drawer 後 close 未成為 active element | Safari 程式化焦點差異 | 保留現有可及性斷言與非阻擋訊號；後續用實機鍵盤確認再決定產品修法 |
| `smoke.spec.js:160`，關 filter 後 trigger 未恢復焦點 | Safari 程式化焦點差異 | 同上；不為了綠燈放寬既有斷言 |
| `smoke.spec.js:826`，drawer close 未取得焦點 | Safari 程式化焦點差異 | 同上；持續由 WebKit job 追蹤 |
| `smoke.spec.js:1696`，Google 假頭像網址回 400 被記為 console error | 測試 fixture／網路差異 | avatar fallback 本身通過，沒有 page exception；後續可將假頭像改成同源 route fixture |
| `smoke.spec.js:2346`，presence 失敗重畫後未回控制項 | Safari 程式化焦點差異 | 保留失敗證據，等實機 VoiceOver／鍵盤確認 |
| `smoke.spec.js:2521`，`uncheck()` 後 checkbox 未聚焦 | 測試輸入模型差異 | iOS 點按不保證 focus；後續測試應分開驗證觸控與鍵盤，不修改產品來迎合模擬點按 |
| `smoke.spec.js:3203`，定位按鈕 click 後未聚焦 | 測試輸入模型差異 | 同上；保留 Chromium 鍵盤契約與 WebKit 訊號 |

本次 WebKit 的 `Importing a module script failed` 為 **0**；表示批 15 的 harness 問題沒有復發。
與批 15 相比，多出的唯一失敗是測試使用的 Google 假頭像網址在 WebKit 會記錄 400；新增的
`error-boundary`、`react-unmount` 也都通過。

`npm run test:db`、`npm run test:local` 豁免：本批只有 Playwright／CI／文件設定，零 migration、
零 `dataApi.js`、零 RPC 簽名與產品 runtime 行為。沒有 push、deploy 或 REL。

## 5. 驗收條件

| 條件 | 結果 |
| --- | --- |
| `mobile-webkit` 使用 iPhone 12 與 390×844 | ✅ |
| WebKit testMatch 與 mobile Chromium 相同 | ✅ |
| CI 安裝並執行 WebKit | ✅ |
| WebKit job 失敗不擋合併 | ✅ `continue-on-error: true` |
| Chromium 必跑 script 與通過／skip 數不變 | ✅ `266 / 4` |
| 所有 WebKit 失敗均分類並附處置 | ✅ 7/7 |
| WebKit module import harness 失敗維持 0 | ✅ |
| 現行測試文件與數字同步 | ✅ |

## 6. 變更清單與偏離

- `.github/workflows/quality-gate.yml`
- `.claude/rules/testing.md`
- `CLAUDE.md`
- `package.json`
- `playwright.config.js`
- `tests/ci-config.test.js`
- `docs/migration-reports/batch-23.md`

原工單提醒「新增 project 會改變 `npm run test:mock` 的測試總數」；本批刻意用獨立 script 與
獨立 job 避開該副作用，因此 Chromium 仍是 `266 passed / 4 skipped`。WebKit 目前不宣稱全綠，
也沒有修改既有 e2e 斷言來製造綠燈；七條差異已成為可見、可下載證據、但不阻擋合併的相容性
待辦。升級為 required job 前，應先完成表內的實機 Safari 驗證與 fixture 清理。
