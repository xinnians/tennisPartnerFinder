# 批次 E3 回報：error transport 接點與文件

## 變更與檔案意圖

- `src/appErrors.ts`：匯出並 runtime freeze 唯一外送欄位 `APP_ERROR_TRANSPORT_FIELDS`；把 `configureAppErrorTransport` 明定為唯一 vendor adapter 註冊點。預設仍是 `NOOP_TRANSPORT`。
- `tests/app-errors.test.js`：以公開常數驗證 report 的精確 key 集合與凍結狀態；遞迴掃描 `src/`，保證 production 沒有註冊呼叫點。
- `docs/error-transport-wiring.md`：記錄未來 Sentry／其他廠商的接線步驟、環境變數界線、禁送欄位、SDK 自動 context 風險與驗收方式。
- 本回報 `docs/arch-reports/batch-E3.md`。

## 固定隱私契約

未來 transport 只能收到：

```text
errorName
kind
surface
```

raw message、stack、cause、URL、query/hash、使用者資料、暱稱、聯絡方式、聊天、roster、備註、座標、球場位置、IP 與原始 exception 都不在契約內。文件也明確禁止直接用一般 `captureException(error)` 路徑，避免 SDK 自動補入敏感 context。

## Production 仍為 NOOP 的證據

```text
$ rg -n 'configureAppErrorTransport' src
src/appErrors.ts:86:export function configureAppErrorTransport(nextTransport: AppErrorTransport = NOOP_TRANSPORT): () => void {
```

只有函式定義，沒有 import 或呼叫點。另有 unit test 遞迴掃描所有 `src/**/*.{js,ts,tsx}`，精確要求 reference 清單只有 `appErrors.ts`，並驗證初始 transport 是 `NOOP_TRANSPORT`。

沒有新增 SDK、dependencies、env 或網路端點；廠商選擇、CSP 與 hosted 設定仍是非派工項。

## Gate

精準 `node --test tests/app-errors.test.js`：

```text
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

`npm run typecheck`、`npm run lint`、`npm run prettier:check`：exit 0；Prettier 末尾：

```text
Checking formatting...
All matched files use Prettier code style!
```

`npm run test:session-unit`：

```text
1..281
# tests 281
# suites 0
# pass 281
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

`npm run test:mock`：

```text
4 skipped
266 passed (2.5m)
```

`npm run test:local`：

```text
ℹ tests 2
ℹ pass 2
ℹ fail 0

11 skipped
42 passed (1.6m)
```

沒有 fixture 資源耗盡，未執行 local DB reset。

`npm run build`：

```text
✓ 148 modules transformed.
dist/assets/index-DdBPRNH2.js   639.90 kB │ gzip: 184.71 kB
✓ built in 868ms
```

`npm run check:production-bundle`：

```text
production bundle check passed: 28 files, 12 demo identifiers absent; main chunk 639896/184705 bytes within 703886/203176
```

`git diff --check`：exit 0，無輸出。

## 非阻擋 WebKit

依規格只跑一次：

```text
7 failed
3 skipped
125 passed (2.0m)
```

比固定 126／6／3 多一項歷史 D1、D3、C3、C4 與 E1 都出現過的 `keyboard dialogs trap focus and return it to the trigger` focus timeout；其餘六項是固定 performance／focus 清單。E3 沒有改 UI、focus 或 sheet runtime，正式 Chromium 全綠；依非阻擋規則保留原始結果，不重跑修飾數字。

## 白名單與未動範圍

- 只使用 E3 白名單：`src/appErrors.ts`、對應 unit test、新接線文件與本回報。
- `git diff --name-only -- .env supabase/migrations supabase/tests data/courts.json vercel.json package.json package-lock.json src/main.js src/components` 輸出空。
- 沒有新增依賴、SDK、production 呼叫點、網路端點、env、CSP、DB 或 hosted 變更。
- 沒有 push、deploy、改 migration、Supabase tests 或球場資料。

## BLOCKED／偏差

- BLOCKED：無。
- 偏差：單次非阻擋 WebKit 比固定參考多一項歷史已知 focus 波動；必要 gate 全綠。
