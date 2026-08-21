# Error transport 接線契約

目前 production 不會把錯誤送到外部：`src/appErrors.ts` 的 transport 預設是 NOOP，且 `src/` 沒有呼叫 `configureAppErrorTransport`。這份文件只定義未來選定 Sentry 或其他廠商後，接線時必須遵守的邊界。

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

## 未來接線步驟

1. 由使用者先決定廠商、資料保存區域、保留期限與取樣政策；SDK、CSP 或 hosted 設定要另開批次審查。
2. 建立一個薄的 vendor adapter。它的輸入型別必須是 `AppErrorTransport`，只把三個既有欄位映射成低基數分類資料；不得接觸原始 `Error`。
3. 關閉廠商 SDK 的自動 exception、request、user、IP、URL、breadcrumb、DOM、session replay 與其他自動 context。若 SDK 無法保證只送三欄，就不能接入。
4. 在應用啟動時、安裝 global handlers 前，僅呼叫一次 `configureAppErrorTransport(adapter)`。測試或 HMR 要保存並呼叫它回傳的 restore 函式。
5. Transport 失敗必須吞掉並保持 NOOP 等價行為，不得影響畫面、重試使用者動作或形成錯誤迴圈。
6. 以測試攔截實際送出 payload，驗證 key 集合精確等於 `APP_ERROR_TRANSPORT_FIELDS`，再跑完整 production bundle 與瀏覽器 gate。

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

- 目前不新增或修改任何 `.env*`；production 也不讀 error transport env。
- 未來若廠商需要 browser DSN／public project key，使用一個明確的 Vite public env 名稱，並先在文件、CI 與 hosted 平台同步定義。
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

接線前，本專案的 `rg` 應只顯示 `src/appErrors.ts` 內的函式定義；出現 production 呼叫點代表廠商接線已開始，必須由獨立、經使用者授權的批次審查。
