# 批 21：先以 Report-Only 部署安全 response headers

日期：2026-08-20　基準：`9cc25a8`
對應工單：`docs/frontend-fix-plan-2026-08-20.md` 的 **P1-E**

## 1. 問題

`curl -sSI https://qiuka.tw` 在本批開工時只找到：

```text
access-control-allow-origin: *
strict-transport-security: max-age=63072000
```

正式站缺少 CSP、`X-Content-Type-Options`、`Referrer-Policy` 與
`Permissions-Policy` 的明確設定，專案內也沒有 `vercel.json`。舊 gate 只驗 production bundle
不含 demo 資料，完全不會因 response header 缺漏而失敗。

URL fragment 本來就不會進入 `Referer`，所以這裡加入 `Referrer-Policy` 的理由不是保護
`#/session/:id`，而是把瀏覽器目前偏保守的跨站 referrer 行為寫成專案契約，避免未來預設改變。

## 2. 改動

- 新增 `vercel.json`，對所有路徑立即設定 `nosniff`、禁止被 iframe 包住、明確 referrer
  policy，以及只保留本站 geolocation 的 permissions policy。
- CSP 先用 `Content-Security-Policy-Report-Only`，包含目前 React build 使用的 Google Maps、
  Google Fonts、Google 頭像、Supabase HTTPS/WSS、`data:` 與 `blob:` 來源；尚未設定未經核准的
  report endpoint。
- Google Maps 官方相容清單仍需要 `unsafe-inline` / `unsafe-eval`；本批只觀察、不強制。
  後續要改成嚴格 nonce CSP，必須先替 Vite 靜態入口建立 nonce 管線，再跑完整人工流程。
- 對 `/push-sw.js` 設 `public, max-age=0, must-revalidate`，避免瀏覽器長時間留住舊 service
  worker；沒有加入離線 `fetch` handler。
- 新增 3 條單元 gate，並明確註冊到寫死檔名的 `test:session-unit`。

設定格式參考 Vercel 官方 `vercel.json` 文件：
<https://vercel.com/docs/project-configuration/vercel-json>；Google 來源清單參考 Maps JavaScript
API 官方 CSP 文件：<https://developers.google.com/maps/documentation/javascript/content-security-policy>。

## 3. canary 四拍

canary 精確移除全域規則中的這個 header：

```json
{
  "key": "X-Content-Type-Options",
  "value": "nosniff"
}
```

1. 改動後、無 canary：`node --test tests/security-headers.test.js` 為 `3 passed`、exit 0。
2. 加入 canary 後，同一指令 exit 1，逐字關鍵輸出：

   ```text
   Expected values to be strictly equal:
   + actual - expected
   + undefined
   - 'nosniff'
   1..3
   # pass 2
   # fail 1
   ```

3. 用精確 patch 加回原物件後，重跑 5 次為 `15 passed`、exit 0。
4. 用 `git archive 9cc25a8` 建立 `/private/tmp` 乾淨對照組；舊版
   `npm run test:session-unit` 為 `262 passed`、exit 0。舊版沒有
   `tests/security-headers.test.js` 與 `vercel.json`，因此缺少所有上述 header 仍完全靜默。

## 4. 完整 gates

`npm run test:ci:frontend` 在最終樹執行：

| Gate                        | 結果                                               |
| --------------------------- | -------------------------------------------------- |
| courts seed `--check`       | 通過                                               |
| `npm run typecheck`         | exit 0                                             |
| `npm run lint`              | exit 0                                             |
| `npm run prettier:check`    | `All matched files use Prettier code style!`       |
| `npm run test:session-unit` | `265 passed / 0 failed`                            |
| Chromium mock e2e           | `266 passed / 4 skipped`（270）                    |
| Batch 21 穩定性取樣         | `15 passed`（3 格 × 5 次）                         |
| `npm run build`             | 主 JS `714.57 / 201.45 kB`；CSS `65.39 / 10.76 kB` |
| production bundle gate      | 12 output files；12 demo identifiers absent        |
| `git diff --check`          | exit 0                                             |

最終 build 尺寸與批 20 完全相同，因 `vercel.json` 不會進入 browser bundle。第一次把對照組解到
`/tmp` 時，既有 reset DB 測試因 macOS 將該路徑解析成 `/private/tmp` 而出現字串比對失敗；改用
實際 canonical path `/private/tmp` 重跑即為 `262/262`，沒有修改產品碼或測試來掩蓋它。

`npm run test:db`、`npm run test:local` 豁免：本批零 migration、零 `dataApi.js`、零 RPC
簽名，也沒有改 Supabase 契約。瀏覽器人工 CSP 驗證亦未執行，因 Vite 本機 server 不會套用
Vercel response headers，且派工單明確禁止 push、REL 與任何 deployment。

## 5. 驗收條件

| 條件                                                      | 結果                 |
| --------------------------------------------------------- | -------------------- |
| 全站有 `nosniff`、frame、referrer 與 permissions 明確契約 | ✅ 本機設定與 gate   |
| CSP 使用目前 React build 的外部來源清單                   | ✅ 本機設定與 gate   |
| 尚未做人工違規盤點前，不啟用 enforcing CSP                | ✅ 僅 Report-Only    |
| `/push-sw.js` 每次使用前會 revalidate                     | ✅ 本機設定與 gate   |
| preview Report-Only console 全流程盤點                    | ⏸ 維護者部署後執行   |
| preview enforcing CSP 全流程驗證                          | ⏸ 前一階段通過後執行 |
| production Report-Only，再切 production enforcing         | ⏸ 維護者分階段部署   |

## 6. 變更清單與偏離

- `vercel.json`
- `tests/security-headers.test.js`
- `package.json`
- `docs/migration-reports/batch-21.md`

原工單把本批排在 REL 後，並要求跨 3–4 次部署；但派工單同時硬性禁止 REL、push 與 deploy，且
目前 production 仍是 pre-React build。這兩個條件無法同時完成。因此本 commit 只交付可獨立
審查、可先上 preview 的安全第一階段：非 CSP 標頭立即生效，CSP 僅 Report-Only；沒有宣稱
完成線上驗證或 enforcing CSP。後續維護者應依「preview Report-Only → preview enforce →
production Report-Only → production enforce」逐段推進，每段都確認使用的是同一份 React
build。這是刻意、已落檔的範圍偏離，不是假裝完成原本的跨部署工作。
