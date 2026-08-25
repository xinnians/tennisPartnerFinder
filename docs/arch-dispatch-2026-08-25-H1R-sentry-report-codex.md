# H-1R error transport 契約放寬＋Sentry 接線回報（Codex）

- 日期：2026-08-25
- 派工：`docs/arch-dispatch-2026-08-25-H1R-sentry.md`
- 開工基準：`0f79e07`
- 結論：**H-1R 完成：程式接線、精確 CSP origin、envelope／PII／bundle／NOOP 與完整矩陣全數通過。**
- 實作 commit：`bf89206 feat(error): wire privacy-safe Sentry transport`
- push：未做。
- 本回報：依派工要求不列入實作 commit。

## 1. 契約先行

[已完成] 先修訂 `docs/error-transport-wiring.md`，再開始程式變更：

- 新增「On-wire 容忍欄位（2026-08-25 使用者拍板）」；event top-level 只容忍
  `tags`／`event_id`／`timestamp`／`platform`／`environment`／`sdk`／`contexts`／
  `breadcrumbs`。
- `tags` 仍精確三鍵；`breadcrumbs` 必須空；除 tags 外禁止 app 衍生值；
  `environment` 只許 `production`／`preview`；`sdk.settings.infer_ip` 必須為 `never`。
- `AppErrorReport`／`APP_ERROR_TRANSPORT_FIELDS` 完全未改：

```text
$ git diff -- src/appErrors.ts
（空輸出）
```

## 2. 接線實作

[已完成]

- pin `@sentry/browser` `10.71.0`；`npm audit --omit=dev`：`found 0 vulnerabilities`。
- `src/sentryErrorTransport.ts` 是唯一薄 adapter：輸入仍是 `AppErrorTransport`，只把
  `errorName`／`kind`／`surface` 映入 tags；沒有 `captureException`。
- `defaultIntegrations:false`、`integrations:[]`、`sendDefaultPii:false`、完整
  `dataCollection` false、`autoSessionTracking:false`、breadcrumb／Replay／profiling／logs／
  client reports 全關；tracing options 維持 undefined（未啟用）。
- `src/sentryBrowserSdk.ts` 只 re-export `init`／`captureEvent`，避免 Replay、Feedback、
  profiling 等未使用 export 進 lazy chunk。
- DSN 空白或格式錯誤在 dynamic import 前 short-circuit；不載 SDK。
- `src/main.js` 在 `installGlobalErrorHandlers` 前恰一次設定 transport，HMR 同時保存並呼叫
  global handler cleanup 與 transport restore。
- `VERCEL_ENV=production` 才固定送 `production`；其餘固定送 `preview`。
- adapter capture、SDK init/import、client close 的錯誤均吞掉，不影響 UI。

```text
$ rg -n 'configureAppErrorTransport\(adapter\)|configureSentryErrorTransport\(\{|installGlobalErrorHandlers\(' src
src/main.js                 configureSentryErrorTransport({ ...
src/main.js                 installGlobalErrorHandlers(...
src/sentryErrorTransport.ts configureAppErrorTransport(adapter)

$ rg -n 'captureException' src/sentryErrorTransport.ts
（空輸出）
```

## 3. 真實 envelope 攔截與隱私

`tests/sentry-error-transport.test.js` 使用真 `@sentry/browser@10.71.0` 與自訂 transport
攔截 SDK 實際產生的 envelope。綠燈 event 為：

```json
{
  "tags": {
    "errorName": "Error",
    "kind": "react-render",
    "surface": "session-detail-sheet"
  },
  "breadcrumbs": [],
  "platform": "javascript",
  "event_id": "<protocol id>",
  "timestamp": "<protocol timestamp>",
  "environment": "preview",
  "contexts": { "trace": "<protocol trace ids only>" },
  "sdk": {
    "name": "sentry.javascript.browser",
    "version": "10.71.0",
    "integrations": [],
    "settings": { "infer_ip": "never" }
  }
}
```

完整 envelope（含 header）序列化後反向斷言不含：
`private@example.test`、`25.1,121.5`、`私密暱稱`、`LINE=private-line-id`。

```text
$ node --test tests/sentry-error-transport.test.js
ok 1 - the real Sentry envelope keeps only approved protocol fields and no app PII
ok 2 - an empty Sentry DSN loads no SDK, sends no request, and writes no console output
ok 3 - Sentry capture and teardown failures remain NOOP-equivalent
# tests 3
# pass 3
# fail 0
```

### 四個 canary（逐一紅 → 還原 → 綠）

每輪只暫改一處，執行同一條 focused command；所有暫改均已還原。

1. event 加 `extra: { canary: true }`：exit 1，`actual: ['extra']`、`expected: []`。
2. tags 加 `canary: 'forbidden'`：exit 1，exact-tags deep-equal 顯示第四鍵。
3. beforeSend 塞 `breadcrumbs: [{ category: 'canary' }]`：exit 1，空陣列斷言抓到內容。
4. adapter 暫送 message
   `private@example.test GPS=25.1,121.5 nickname=私密暱稱 LINE=private-line-id`：exit 1，
   `doesNotMatch` 直接列出完整 envelope 中的 message 與四個 PII canary。

還原後：3/3 pass、exit 0。這也證明 envelope key／tags／breadcrumb／PII 四條 gate
不是無效常綠。

## 4. 空 DSN：SDK／網路／console 都為零

[已完成]

- unit test 替換 `loadSdk`／`fetch`／五個 console method：load 0、fetch 0、console `[]`。
- in-app Browser 實測 `http://127.0.0.1:5173/`（DSN 未設）：
  - title `球咖｜台北網球`，DOM 有完整 map shell／附近球局／主要導覽，無 framework overlay。
  - `error`／`warn` logs：`[]`。
  - page asset inventory：可見本地 `sentryErrorTransport.ts` 設定模組，但
    `sentryBrowserSdk.ts` 與 `node_modules/@sentry/*` 資產皆為 0。
  - 點「我的球局」後標題可見、console 仍 `[]`、SDK assets 仍 `[]`。

## 5. Production bundle

用相同 `.env.local` 在 detached worktree 重建 `0f79e07`，避免 env 字串差異造成假比較：

```text
baseline 0f79e07 main: assets/index-BanPRqK7.js 649474/189151 raw/gzip bytes
current main:           assets/index-B3EtAqdI.js 651015/189880 raw/gzip bytes
delta:                  +1541/+729 bytes（本地 DSN gate／adapter wiring）
lazy SDK:               sentryBrowserSdk-Czz5dmkg.js 87980/29720 raw/gzip bytes
```

`scripts/check-production-bundle.mjs` 新增雙向 gate：主 chunk 不得含 Sentry SDK marker；
production build 必須另有含 marker 的 lazy chunk。

```text
production bundle check passed: development E2E hook present, production E2E hook absent;
29 files, 12 demo identifiers absent; main chunk 651015/189880 bytes within
703886/203176; Sentry lazy chunk: sentryBrowserSdk-Czz5dmkg.js
```

## 6. CSP：精確 origin 完成

使用者於 2026-08-25 提供 production browser DSN；repo 只保存從 DSN 取出的精確 origin，
沒有保存完整 DSN、public key 或 project path：

```text
https://o4511969009074176.ingest.us.sentry.io
```

`vercel.json` 只在 Report-Only CSP 的 `connect-src` 增加上述一個 origin；其他 directive
與 enforcing 狀態未動。

```text
$ git diff 0f79e07 -- vercel.json
- ... wss://*.supabase.co data: blob: ...
+ ... wss://*.supabase.co https://o4511969009074176.ingest.us.sentry.io data: blob: ...
```

`tests/security-headers.test.js` 斷言 origin 存在且只出現一次，並明確拒絕
`https://*.ingest…sentry.io` wildcard。focused CSP＋Sentry 測試 6/6 pass；加入 CSP 後完整
frontend／DB／local 矩陣亦再次全綠。

## 7. 標準矩陣

### `npm run test:ci:frontend` — exit 0

```text
unit:       tests 308 / pass 308 / fail 0
Playwright: 270 passed / 4 skipped
bundle:     651015/189880 main；Sentry lazy chunk 已辨識
```

### `npm run test:db` — exit 0

```text
All tests successful.
Files=7, Tests=799
Result: PASS
```

### `npm run test:local` — exit 0

```text
local API: 2 passed / 0 failed
Playwright: 42 passed / 11 skipped
did not run: 0
```

### diff／凍結面

```text
$ git diff --check
（空輸出）
$ git diff --unified=0 68466e3 -- tests | rg '^[-+].*(data-testid|GOLDEN|ME_GOLDEN)'
（空輸出）
$ git diff --unified=0 0be31a2 -- tests \
    | rg '^[-+].*(data-testid|GOLDEN|ME_GOLDEN)' | shasum -a 256
5f4e88a2423f06297ea0e68f61566eec48ea9bb8679e9f18b68a86bb54cf9868  -
```

## 8. 使用者側／未做

依派工不代做：

- Sentry 專案建立（使用者已自行完成並提供 browser DSN）。
- Vercel `VITE_SENTRY_DSN` 設定。
- deploy／push。

不在範圍且未做：sampling、alert 規則、enforcing CSP、source map（D-03 維持關閉）。

實作已 commit 為 `bf89206`；本回報依派工保持 uncommitted，未 push。
