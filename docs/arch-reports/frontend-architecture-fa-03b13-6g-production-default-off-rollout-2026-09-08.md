# FA-03B13.6g production default-off rollout

日期：2026-09-08

## 白話結論

這批已把目前可安全上線的程式全部放到 production：Git `main`、Vercel 網站、Supabase migration 與五支 Edge
Function 都已更新。正式網站可正常開啟，舊推播排程持續成功，新版推播入口也已部署。

新版推播仍是**部署但關閉**。原因不是部署失敗，而是 production 的 lease、deadline、attempt、TTL、金鑰與排程值尚無
已確認依據；程式會在缺少這些條件時固定拒絕執行，不會碰使用者資料或送出推播。本批沒有自行猜值。

## 實際上線結果

### Git 與 Vercel

- application code 已 fast-forward 推到 `origin/main`，production application baseline 是
  `1a3a4cb6cda89ed18ac7518b69ef8391c8a32de6`；本報告的後續 docs-only commit 不算新的 application baseline。
- application rollout 是 Vercel production deployment `dpl_BbdDasmg61cgydN1wmwTi2ZgJoiw`，驗收時 `qiuka.tw` 已指向它。
- deployment URL：`tennis-partner-finder-d4i4iow74-xinnians-projects-c513dbd3.vercel.app`。
- 建立時間：2026-09-08 15:34:20（Asia/Taipei）；狀態 `READY`；Git SHA 是上述 `1a3a4cb`。
- aliases 包含 `qiuka.tw`、`www.qiuka.tw` 與 production／main aliases。
- 本報告推上 Git 後觸發的第一個 docs-only deployment 也已 READY；它與 application rollout 的 HTML、JS、CSS
  SHA-256 分別同為 `d42b1603f02ce8104b6289313a260bf714923ab0c26718c33eff3e0c93181a98`、
  `d0213c196031857e73bf2667d76377b6ae7169e78ca8f8a042d2c791eeff7e8c`、
  `45da655488cc4f89d36059550bf1293539acf1b31d32aa914e7e66b1273f60d0`。因此後續 alias 移動沒有改變實際前端產物。

正式站 HTTP 實測：

| 路徑 | 結果 | 說明 |
| --- | --- | --- |
| `/` | 200 | HTML 正常，安全 headers 存在 |
| `/assets/index-D2IFRf3c.css` | 200 | production CSS |
| `/assets/index-DgQpUp6V.js` | 200 | production JS |
| `/manifest.webmanifest` | 200 | PWA manifest |
| `/icon.svg`、`/apple-touch-icon.png` | 200 | 品牌資源 |
| `/push-sw.js` | 200 | `public, max-age=0, must-revalidate` |
| `/push-subscription-key-v1.json` | 404 | production key env 未設定；`no-store`，v2 fail closed |
| `/push-cleanup-key-v1.json` | 404 | production key env 未設定；`no-store`，v2 fail closed |

兩個 key asset 的 404 是目前停用狀態的直接結果，不是把已啟用功能部署壞掉。Vercel production env 名稱中沒有
`PUSH_SUBSCRIPTION_PUBLIC_JWK_JSON` 或 `PUSH_CLEANUP_PUBLIC_JWK_JSON`，而 build plugin 只有在值非空且通過 canonical
驗證時才產生檔案。

### 瀏覽器冒煙測試

- Playwright Chromium：desktop 1280×900、mobile 390×844。
- 兩個 viewport 都得到 title `球咖｜台北網球`、有實際地圖／導覽／空清單內容，framework overlay 0。
- 點「篩選」後，兩者都顯示完整篩選面板與「看 0 場球局」，證明主要互動有反應。
- HTTP >= 400 response 為 0；mobile request failure 0。desktop 只有 Google Maps 自行取消一張
  `transparent.png` request。
- headless Chromium 皆出現 Google Maps Vector Map fallback 與 WebGL GPU warning；畫面實際回退到 Raster Map 並正常
  顯示。這是 headless 圖形環境訊息，不是本專案 framework/runtime exception。

### Supabase migration 與 Functions

- migration：40 local／40 Hosted；`db push --linked --dry-run` 回 `upToDate: true`。
- linked project `ttjzxhihctrtoqdsqxdb` 狀態 `ACTIVE_HEALTHY`。

| Function | version | Hosted bundle SHA-256 | 狀態 |
| --- | ---: | --- | --- |
| `notification-outbox-dispatch` | 42 | `e22cf3c9bbe8e9531d19562fe93cc9e6c9571fd3379bd5d319ea9f7b3aa912a1` | ACTIVE |
| `notification-outbox-dispatch-v2-canary` | 26 | `879fddc856049ffc092477ce87627e50bd1d893052fa701efaa442b8e1c340e3` | ACTIVE |
| `notification-outbox-dispatch-v2` | 1 | `a3e123d98e8570758ccbe1d4f0ff02d9678c6731155ea102bbd95220b7faa668` | ACTIVE、default-off |
| `push-cleanup` | 1 | `d514e49c5194501896c63b50fd74a7a945b8c36473f50e1d7872dd5f20a9bfce` | ACTIVE、default-off |
| `push-subscription-v2` | 1 | `d78bf601e743e217e92792612a0cbea4bec88a02507617d566509ae2a9a3de56` | ACTIVE、default-off |

部署後重新下載五個 Function directory，和 repo `diff -qr` 全部零差異。legacy `index.ts` SHA-256 是
`37fd11a72d6d717d7b46fee44003c0d268b2af3b8e068f530be2c90df2ea04cb`，`dispatch.js` 是
`69fb037953e84e78ef87e2c4c74015e25ba2ea88478f222533d36d03c84ca717`。

未帶任何正式授權或使用者資料的 production POST probe：

| Function | HTTP | exact body |
| --- | ---: | --- |
| `notification-outbox-dispatch-v2` | 503 | `{"error":"DISPATCH_V2_UNAVAILABLE"}` |
| `push-subscription-v2` | 503 | `{"kind":"unavailable","version":1}` |
| `push-cleanup` | 503 | `{"outcome":"RETRY"}` |

三者都在 hard gate 停止，符合預設關閉設計。

### 舊排程與 DB 資料

部署開始時間 2026-09-08 07:30:55 UTC 之後，Hosted DB 直接查到：

- active `net.http_post` cron 只有 1 個，且就是 legacy `notification-outbox-dispatch`；v2 cron 0。
- `net._http_response` 共 16 筆，16 筆都是 HTTP 200、無 timeout、無 error；非 200／錯誤為 0。
- 最新五筆 response body 全是 `{"claimed":0,"sent":0,"staleSubscriptions":0}`。
- Supabase Dashboard 瀏覽器當時是登出狀態，因此沒有把 Dashboard exact-path log 當成已查證；上列證據來自 Hosted DB
  的唯一 active HTTP cron 與它的實際 HTTP response，不以 `cron.job_run_details=succeeded` 冒充 HTTP 200。

部署與 probe 後的 Hosted aggregate：

- runtime：generation 1、`dispatch_enabled=true`、mode `disabled`、legacy writes true、legacy handled false。
- worker lease／request deadline／delivery lease／max attempts／TTL safety budget 全是 null。
- workers 0、deliveries 0、consents 0、endpoint registry 0、cleanup limiter 0。
- Push：4 total／4 legacy／0 v2。
- outbox：7 total／7 format 1／0 format 2；legacy／v2 pending 都是 0。
- v2 cron：0。

## 本批沒有做的事

- 沒有設定或讀出 production Secret value。
- 沒有建立 v2 cron、沒有切 runtime mode、沒有啟用 active v2 UI／sign-out cleanup。
- 沒有建立 browser v2 subscription、沒有送真實 provider Push、沒有清除既有四筆 legacy subscription。
- 沒有自行填入 lease、deadline、attempt、TTL 或 production limiter policy。

## 下一步

production 已具備 default-off 程式能力。真正啟用 v2 前，仍要用可追溯的 production 量測或明確產品決策補齊：

1. lease／deadline／attempt／TTL 與 limiter policy；
2. active encryption／provider keys 與專用 v2 cron secret；
3. 同源 public-key assets；
4. browser fixture／provider canary；
5. 最後才依既定順序切 runtime、UI 與 legacy cutoff。

在這些值有證據前，正確狀態是「已部署、未啟用」，不是繼續猜數字強開。
