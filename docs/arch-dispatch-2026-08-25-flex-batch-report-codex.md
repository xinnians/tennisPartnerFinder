# 彈性批 F0-8／F4-10 實作回報（Codex）

- 日期：2026-08-25
- 開工基準：`f9f8a2c`（其前一實作基準 `aad6d75`）
- F0-8 commit：`d6fc10a test(ci): guard development branch filters`
- F4-10 commit：`3c066f5 test(playwright): split and parallelize mock smoke suite`
- 本回報依派工單要求不列入實作 commit，亦未 push。

## F0-8：ci-config 分支名解耦

### 最終改動與換分支位置

`DEVELOPMENT_BRANCH` 在 JS 側只保留一個常數來源：`tests/ci-config.test.js`。守門會擷取 workflow 內全部 `branches: [...]` 過濾器，要求：

1. 掃描結果非空且恰為兩處（`pull_request`、`push`）；
2. 每處逐字等於 `[main, DEVELOPMENT_BRANCH]`；
3. development branch 在 workflow 的總出現次數必須等於受守門的過濾器數，禁止游離的未受檢出現點。

開新工作分支仍需改 **3 個文字位置／2 個檔案**：

1. `.github/workflows/quality-gate.yml`：`pull_request.branches`；
2. `.github/workflows/quality-gate.yml`：`push.branches`；
3. `tests/ci-config.test.js`：`DEVELOPMENT_BRANCH` 常數。

workflow 的 push／PR 過濾器本身無法引用外部 JS 常數；本批沒有改 job 結構、觸發語意或 gate 內容，故兩處 YAML 重複保留，並由推導式守門鎖一致性。

### Fail-closed canary

實際暫改 workflow 的 `pull_request` 一處為 `canary/branch-filter-drift` 後執行：

```text
node --test tests/ci-config.test.js
exit 1
Expected: claude/tennis-partner-finder-proto-xfrr6g
Actual:   canary/branch-filter-drift
```

還原該行再執行同一指令：`17 passed, 0 failed`。測試內另有 in-memory drift canary，會證明一處漂移必須拋錯、原 workflow 必須通過。

## F4-10：smoke 拆檔與 mock 平行化

### 拆檔對照

原檔 helper／hook（原 `tests/smoke.spec.js` 第 1–95 行）移至 `tests/fixtures/smoke.js`；原測試依連續行段機械搬移如下：

| 原行段 | 新檔 | test 數 |
| --- | --- | ---: |
| 97–529 | `tests/map-and-bootstrap-smoke.spec.js` | 9 |
| 530–936 | `tests/navigation-shell-smoke.spec.js` | 14 |
| 937–2547 | `tests/session-lifecycle-smoke.spec.js` | 31 |
| 2548–3318 | `tests/account-settings-smoke.spec.js` | 13 |
| 3319–4200 | `tests/discovery-interactions-smoke.spec.js` | 19 |
| 4201–5374 | `tests/auth-forms-smoke.spec.js` | 26 |
| 5375–6034 | `tests/chat-settings-filters-smoke.spec.js` | 14 |
| 合計 | 7 個非空 smoke 檔 | 126 |

檔名皆保留 `smoke.spec.js` 後綴；五個 project 的 `testMatch` regex 逐字未改。`test:mock`、`test:local`、`test:ci:*` scripts 逐字未改，測試集合不變。

### 搬移保真自證

保留拆檔前原檔 SHA-256 `045a4e75b7e37c6d75bbf210131f5cc45a2c95f05dce4da20b037958d501431d` 作比對來源，使用 TypeScript parser 掃描 top-level `test(...)` expression statement：

```text
titles identical: 126 -> 126
per-test source identical: 126 -> 126
split files scanned: 7
```

per-test 比對使用 parser 的完整 statement source（不含 import／helper 引用），逐 title 加完整 test statement 排序後逐字比較；因此 title、test body、斷言、testid 均未改寫。掃描集有 126 筆且七檔皆非空。

另以 Playwright `--list` 比較 desktop＋mobile Chromium 的 project/title 多重集合：

```text
Playwright project/title multiset identical: 290 -> 290
before: Total: 290 tests in 5 files
after:  Total: 290 tests in 11 files
```

### Worker 選擇與隔離

- 機器依據：`sysctl -n hw.logicalcpu` = **12**。
- mock：`workers: 4`，在 12 logical CPU 上保留 Vite server／瀏覽器／Node 單測餘裕。
- local：`workers: 1`；`createPlaywrightConfig({ mode: "local" })` 的單測守門與實際 `test:local` 輸出 `Running 56 tests using 1 worker` 雙重證明。
- 無 harness env 的 bare config import 保留既有 `workers: 1` 相容契約；公開 `test:mock`／WebKit scripts 既有的 `TENNIS_TEST_HARNESS_MODE=mock` 會明確選到 4 workers。
- mock 無案例留在單 worker；WebKit 平行度沿用 mock 設定，未另造 per-project workers 機制。

### 三輪前後 wall-clock

量測指令皆為完整的 `npm run test:mock`，使用 `/usr/bin/time -p`，每輪均包含 `test:session-unit` 與 desktop＋mobile Chromium。

| 輪次 | 改前 workers=1 | 改後 workers=4 |
| ---: | ---: | ---: |
| 1 | 162.77s | 59.04s |
| 2 | 165.00s | 58.39s |
| 3 | 163.75s | 58.24s |
| 平均 | **163.84s** | **58.56s** |

平均下降 **105.28s／64.3%**。改後三輪皆為 `286 passed, 4 skipped`，無剩餘 flake。

完成 bare-import 相容性收尾並 amend 最終 commit 後，另跑一次同一個 `npm run test:mock`：`286 passed, 4 skipped, real 59.35s`；此輪不納入上表三輪平均。

### 平行化揭露的互依／處置

1. **第一版設定撞到既有 bare-import 相容契約。** 首次改後三次嘗試均在 Playwright 前固定紅：既有 `local Supabase Playwright projects are serialized` 守門要求無 harness env 的 default export 為 1 worker。最終保留 bare import = 1，並只讓既有公開 mock scripts 的顯式 `TENNIS_TEST_HARNESS_MODE=mock` 選到 4；既有 unit test 檔與斷言完全未改。
2. **共享模組中的 `test.beforeEach` 受 Node module cache 影響。** 多檔進入同 worker 時，hook 只掛到先載入的 file suite；後載入檔的 `window.__importAppModule` 未安裝，三輪重現 6–7 個相同類型失敗。已把 importer 改成 `base.extend({ page })` 的 per-test fixture；每個 test 都會安裝 importer，test body／斷言零改寫。修後三輪全綠。

沒有其他互依或需靜默序列化的案例。

## 收尾矩陣

| Gate | 結果 |
| --- | --- |
| `npm run test:ci:frontend` | PASS；unit、mock Chromium（286 pass／4 skip）、build、bundle budget、diff check 全綠 |
| `npm run test:db` | PASS；7 files、804 tests |
| `npm run test:local` | PASS；local API 2/2；browser 45 pass／11 skip；did not run = 0；1 worker |
| `git diff --check` | PASS |
| `data-testid`／GOLDEN | 零變動；per-test statement 126/126 逐字相同，`src/`／`public/` 無 diff，GOLDEN 所在 unit 檔未改 |

Playwright mock 與 local 未並發；local 沒有 fixture 污染訊號，因此未重置 DB。

## 未做

- 未跑非阻擋 `npm run test:mock:webkit`。
- 未跑 `npm run test:local:mobile`，因此也未跑其 aggregate `npm run test:ci:supabase`；派工單收尾矩陣指定的 `test:db` 與 `test:local` 均已獨立通過。
- 未改產品碼、產品功能 unit 測試檔、local DB fixture 策略、Vercel／hosted；除派工指定的 `ci-config` 守門外未動 unit 測試；未 push。
