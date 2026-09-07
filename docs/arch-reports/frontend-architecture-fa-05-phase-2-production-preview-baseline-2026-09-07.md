# FA-05 Phase 2：production preview 與效能基線

日期：2026-09-07  
分支：`codex/frontend-architecture-execution`  
比較基準：`b3b5a05`（FA-05 phase 1 完成點）

## 結論

這批把「開發伺服器測得過」提升成「真正 production bundle 在本機 preview 跑得過」。

- 未登入、已登入、OAuth PKCE callback、390px Chromium 慢網路、390px WebKit 延遲共 5 個情境通過。
- 未登入首進沒有下載 private repository chunk；已登入用**同一個 production marker probe**證明一定抓得到，
  排除舊測試因只看 `/src/...ts` 開發路徑而永遠得到空陣列的假綠。
- `check-production-bundle.mjs` 現在同時報 raw／gzip／Brotli；Brotli 只記錄，不新增或調高門檻。
- 相同 production-equivalent 環境重建前後版本，main 與 total 三種大小完全相同；本批沒有改 app runtime。
- 沒有使用 production Secret、production OAuth provider、Hosted request、migration 或 deploy。

## 實作內容

### 1. 獨立 production preview

- `scripts/build-production-preview.mjs` 以 `mode: production` 建置，連線只用本機 Supabase。
- script 明確覆寫所有 browser-facing integration 值：Maps 用測試 key、Sentry／Push key／VAPID／LINE provider
  留空、部署環境固定 `preview`，不繼承 `.env.local` 裡可能存在的外部整合值。
- `playwright.preview.config.js` 使用固定 `127.0.0.1:4174`、單 worker、不可沿用既有 server。
- 三個 project：desktop Chromium、390px mobile Chromium、390px mobile WebKit。
- 必要 Chromium preview 進 Supabase required job；WebKit preview 留在既有 `continue-on-error` job，沒有暗中把
  Safari 訊號升級成 merge blocker。

### 2. 真實 chunk 邊界

舊的 `performance.spec.js` 只監看
`/src/data/repositories/privateDataRepository.ts`。production preview 永遠不會請求這個開發路徑，因此空陣列
無法證明 lazy boundary 正常。

新 probe 直接讀 production JavaScript response，找既有 checker 也使用的
`tennis_private_data_repository_v1` marker：

- anonymous：0 個符合 response；
- authenticated：符合 response 非空，而且只有 1 個唯一 production chunk；
- OAuth callback：符合 response 非空，而且只有 1 個唯一 production chunk。

probe 只讀 response body，不攔截或重送 JavaScript，所以不改變原本的壓縮與傳輸數字。

### 3. Auth／OAuth 邊界

- authenticated 首進使用本機 GoTrue 建立的真實 session，browser boot 仍走 app 既有的 authoritative refresh。
- OAuth 情境只代替外部 provider 的「authorization code 換 session」response；request body 必須精確包含測試
  code 與 PKCE verifier。
- callback 後確認 URL code 與 local PKCE verifier 都被清除、至少發生 1 次真實本機 refresh、登入 UI 可用、
  private chunk 已載入。
- 這證明 app 的 production callback／restore 路徑，不代表真實 Google／LINE provider 設定已驗證。

### 4. 外部服務處理

- Google Maps 與字型沿用既有 Playwright fake，避免測試打公開 CDN。
- production build 會啟動 Vercel Analytics loader，但 `vite preview` 沒有
  `/_vercel/insights/script.js`；Chromium 實測因此出現精確 404。測試只替這個 localhost 平台端點回空白 script，
  其他 console error／page error 仍會失敗。
- Browser plugin 在此環境不可用，因此依 frontend testing skill 使用 repository 既有 Playwright 做實際瀏覽器驗證。

## 可重現環境

```text
Node v22.22.3
npm 10.9.8
Vite 6.4.3
Playwright 1.61.1
Chromium 149.0.7827.55
WebKit 26.5
Supabase CLI 2.115.0
local API http://127.0.0.1:54321
preview http://127.0.0.1:4174
timezone Asia/Taipei
```

## 三次樣本

以下是同一台本機、headless browser、每情境 3 次的中位數；括號為最小～最大。數字只當基線，沒有時間
hard gate。`可用完成`是該情境所有可用性條件與 `networkidle` 完成，不同情境的條件不同，不能拿來互相比快慢。

| 情境                            | 網路方法                                       |         地圖殼可見 ms |           可用完成 ms |         DOMContentLoaded ms |                     load ms | script transfer bytes |
| ------------------------------- | ---------------------------------------------- | --------------------: | --------------------: | --------------------------: | --------------------------: | --------------------: |
| anonymous desktop Chromium      | 本機原生                                       |        126（81～131） |       601（597～604） |          45.3（44.3～45.8） |          79.9（75.8～81.0） |               205,432 |
| authenticated desktop Chromium  | 本機原生                                       |         82（79～147） |       817（799～824） |          47.2（44.8～51.2） |          79.3（75.3～83.6） |               229,068 |
| OAuth callback desktop Chromium | 本機原生                                       |        128（81～141） |       788（767～795） |          45.5（43.3～46.8） |          74.5（74.5～80.3） |               229,068 |
| anonymous 390px Chromium        | CDP 750 kbps down／250 kbps up／150 ms latency | 2,824（2,817～2,824） | 4,976（4,959～4,992） | 2,502.9（2,492.9～2,512.1） | 2,516.8（2,503.1～2,525.0） |               210,576 |
| anonymous 390px WebKit          | Playwright route 每 request 150 ms latency     |       611（600～613） | 1,413（1,402～1,414） |             385（378～387） |             696（688～700） |               199,262 |

Chromium CDP 有頻寬＋延遲限制；WebKit 只有跨引擎 request latency。兩列不是相同網路模型，不能用數字判定
哪個引擎較快。

## Bundle before／after

`b3b5a05` 與本批都用同一組 production-equivalent local 設定重新建置；total 包含 `push-sw.js`。

| 範圍                         |  before raw／gzip／Brotli |   after raw／gzip／Brotli |    差異 |
| ---------------------------- | ------------------------: | ------------------------: | ------: |
| main                         | 650,257／191,204／159,809 | 650,257／191,204／159,809 | 0／0／0 |
| 最大 app lazy（My Sessions） |      16,476／4,829／4,144 |      16,476／4,829／4,144 | 0／0／0 |
| private repository           |       9,403／2,962／2,619 |       9,403／2,962／2,619 | 0／0／0 |
| Sentry                       |    87,975／29,723／26,568 |    87,975／29,723／26,568 | 0／0／0 |
| total JS                     | 852,881／261,345／220,847 | 852,881／261,345／220,847 | 0／0／0 |

total raw／gzip 仍是開發期 report-only 超額 2,920／2,283 bytes；非 byte 的 demo、E2E hook、private chunk、
Sentry provenance 與輸出完整性仍 hard fail。Brotli 沒有門檻，符合「第一個 production release candidate
前再依正式基線設定」的決策。

## 驗證結果

```text
npm run test:preview：5／5 passed
production preview repeat-each=3：15／15 passed
OAuth PKCE targeted（新增真實 refresh 斷言後）：1／1 passed
node --test tests/ci-config.test.js：30／30 passed
npm run test:ci:frontend：Node 638 passed／5 skipped；Playwright Chromium 348 passed／4 skipped
npm run test:local：local API 4／4；Supabase Chromium 44 passed／11 skipped
npm run test:local:mobile：Supabase mobile Chromium 6／6 passed
npm run test:ci:supabase：DB 1,290／1,290；API 4／4；desktop 44 passed／11 skipped；mobile 6／6；preview Chromium 4／4；Edge 1＋1＋1＋2 全部通過
production bundle structural checker：通過；raw／gzip 只報告，Brotli 已列出
```

完整 Supabase CI 第一次串跑時，前一輪剛建立的本機球局讓長期累積資料超過 discovery 最早 200 筆上限，
造成新 fixture 排在查詢範圍外。確認 query 的排序、200 筆常數與剛才單獨測試通過的結果後，使用專案既有
安全 script；它先驗證 API 必須精確為 `127.0.0.1:54321`，才清空本機測試資料並從零重播 39 份 migration。
重置後完整 `test:ci:supabase` 通過。這項操作沒有連到或改動 Hosted 資料。

完整 mock WebKit 額外訊號為 165 passed／3 skipped／8 failed；失敗都落在既有 focus restoration 測試。
把其中可重現的 7 個案例以單 worker 放回比較基準 `b3b5a05`，結果同樣 7／7 failed，錯誤位置與
`Received: inactive` 型態一致。因此可確認不是本批 production preview 改動造成，但仍保留在非阻擋 WebKit job
持續觀察。這批新增的 production preview WebKit 測試本身在三次重跑中 3／3 通過。

一般 `npm run build` 的目前輸出也已另行驗證：main 650,113／191,175／159,810，total JS
852,737／261,314／220,788 raw／gzip／Brotli；development report-only 超額 2,776／2,252 raw／gzip bytes。
它使用一般本機環境，不和上方 production-equivalent before／after 表混算。

## 未宣稱

- 不是 production hosting、真實 Google／LINE OAuth、真實 Google Maps、Vercel Analytics 或 Web Vitals 測試。
- 不把本機毫秒數當 SLA，也不據此設定 bundle 或時間上限。
- 沒有修改 preload 清單；那會改下載時機，留到有這份基線後另批評估。
- 沒有 migration、DB schema、app runtime、UI 文案、production Secret、Hosted deploy 或 request 變更。
