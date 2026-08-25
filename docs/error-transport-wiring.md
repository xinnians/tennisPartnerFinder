# Error transport 接線契約

`src/appErrors.ts` 的 transport 預設是 NOOP；production 只有在公開的 `VITE_SENTRY_DSN` 有值時才可動態載入 Sentry。這份文件定義 app 到 vendor，以及 vendor 實際 on-wire event 的兩層邊界。

## 唯一可外送資料

Transport 只能收到 `AppErrorReport`，固定三個欄位：

```text
errorName
kind
surface
```

- `errorName`：只接受程式內列出的標準 Error 名稱；未知名稱降為 `Error`。
- `kind`：只表示 React render、window error 或 unhandled rejection 類別。
- `surface`：只接受 `APP_ERROR_SURFACES` 的固定名稱；未知值降為 `global`。

不得增加、轉送或由原始 error 補出下列資料：

- raw message、stack、cause、原始 exception 物件。
- 網址、query、hash、referrer、操作 breadcrumb、輸入內容。
- 使用者 ID、暱稱、姓名、email、電話、LINE 或其他聯絡資料。
- 聊天內容、球局備註、名單／roster、封鎖或檢舉內容。
- GPS、座標、球場位置、IP 或可推回個人行蹤的資料。

也不要直接呼叫廠商的 `captureException(error)`；那通常會自動帶入 message、stack 或環境內容，超出本專案 allowlist。

## On-wire 容忍欄位（2026-08-25 使用者拍板）

2026-08-25 使用者核准只在 vendor wire protocol 層容忍必要技術欄位；app 可交給 transport 的資料仍精確限於上述 `AppErrorReport`／`APP_ERROR_TRANSPORT_FIELDS` 三欄，沒有放寬。

- 送出的 event top-level key 集合必須是下列枚舉清單的子集：`tags`、`event_id`、`timestamp`、`platform`、`environment`、`sdk`、`contexts`、`breadcrumbs`。實際 SDK 若新增清單外 key，必須先回報，不得自行擴充。
- `tags` 必須精確等於 `errorName`、`kind`、`surface` 三鍵；不得多、不得少。
- `breadcrumbs` 必須存在且為空陣列。
- 除 `tags` 外，任何欄位都不得含 app 衍生值。驗收必須序列化完整 envelope，反向斷言其中沒有假 email、GPS、暱稱或 LINE canary。
- `environment` 只能是固定字面 `production` 或 `preview`；`sdk.settings` 必須含 `infer_ip: "never"`。
- raw message、stack、URL、breadcrumb 內容與一切 PII 的禁令維持不變。

## 未來接線步驟

1. 由使用者建立 Sentry 專案，決定資料保存區域與保留政策，取得 browser DSN，並把 `VITE_SENTRY_DSN` 設在 hosted 環境；source map、取樣率與 alert 規則不屬本批。
2. 建立一個薄的 vendor adapter。它的輸入型別必須是 `AppErrorTransport`，只把三個既有欄位映射成低基數 `tags`；不得接觸原始 `Error`。
3. 關閉廠商 SDK 的自動 exception、request、user、IP、URL、breadcrumb、DOM、session、tracing、replay 與其他自動 context，並以本文件的 on-wire 枚舉驗證最終 event。
4. 在應用啟動時、安裝 global handlers 前，僅呼叫一次 `configureAppErrorTransport(adapter)`。測試或 HMR 要保存並呼叫它回傳的 restore 函式。
5. Transport 失敗必須吞掉並保持 NOOP 等價行為，不得影響畫面、重試使用者動作或形成錯誤迴圈。
6. 以測試攔截實際送出的完整 envelope，驗證 on-wire key、精確 tags、空 breadcrumbs、`infer_ip` 與 PII canary，再跑完整 production bundle 與瀏覽器 gate。

示意介面（不是目前 production 呼叫點）：

```ts
import { APP_ERROR_TRANSPORT_FIELDS, configureAppErrorTransport, type AppErrorTransport } from "../src/appErrors.ts";

const adapter: AppErrorTransport = (report) => {
  vendorSend({
    [APP_ERROR_TRANSPORT_FIELDS[0]]: report.errorName,
    [APP_ERROR_TRANSPORT_FIELDS[1]]: report.kind,
    [APP_ERROR_TRANSPORT_FIELDS[2]]: report.surface,
  });
};

const restoreTransport = configureAppErrorTransport(adapter);
```

## 環境變數要求

- repo 不新增或修改任何 `.env*`；production 只讀公開的 `VITE_SENTRY_DSN`，空值時必須完全不載入 SDK、零請求、零 console，維持 NOOP。
- hosted 平台的 `VITE_SENTRY_DSN` 由使用者建立 Sentry 專案並取得 DSN 後設定。
- browser bundle 只能放廠商明確認定可公開的 DSN／project key。管理 token、寫入密鑰、service role key 或任何真正 secret 都不得用 `VITE_*`，也不得進前端 bundle。
- env 缺失或格式錯誤時維持 NOOP，不阻擋應用啟動。

## 接線後驗收

```bash
rg -n 'configureAppErrorTransport' src
npm run typecheck
npm run lint
npm run prettier:check
npm run test:session-unit
npm run test:mock
npm run test:local
npm run build
npm run check:production-bundle
git diff --check
```

接線後，`src/main.js` 應在 global handlers 前恰有一個 production 註冊路徑；其 restore 必須由測試或 HMR 保存並呼叫。
