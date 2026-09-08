# 探索完整性、推播啟用與效能驗收

日期：2026-09-08。狀態：探索已上線；Android 推播收件、deep link、登出清理均通過，v2 已正式啟用；效能驗收完成，慢速手機 LCP 未達標。

## 已確認的範圍

使用者核可先套篩選再判斷探索上限，保留完整結果的距離／時間排序、地圖與清單一致，超量時要求縮小範圍。不加入分頁、不修改 NTRP 開區間語意。推播採獨立 v2 worker 與指定帳號灰度，實際收件及登出清理確認後再全面啟用。

## 探索

- `session_discovery` 既有公開欄位不變。伺服器先套日期、程度、打法、行政區、直接加入與時間／地圖範圍，再穩定排序並讀取 201 筆。
- 最多 200 筆才算完整；第 201 筆只用來偵測超量，不發布部分資料或部分數量。
- 超量與載入、失敗、空結果分開呈現；快速切換篩選會使舊查詢失效。
- 回歸測試重現 201 筆中只有最後一筆符合，確認縮小篩選後能找到它。桌面與手機測試涵蓋可見訊息、44px 按鈕、收合焦點與正確數量；實際本機 PostgREST 驗證中文字串、巢狀條件及台北日期。

## 推播

新增 migration `202609080002_notification_event_producers.sql`，不在 migration 中開啟 runtime。

- 既有真實開局／加入／審核／聊天／提醒事件寫入 format 2，攜帶來源版本並在同一交易完成裝置派送快照與封存。
- 來源仍由 session RPC 的鎖序保護；dispatch 在送出前再次查證來源、收件资格、偏好與 consent epoch。
- 舊提醒去重索引限 format 1，format 2 可依新的 schedule version 再產生提醒。
- 過渡期舊、新 dispatcher 各自只讀自己的 transport。正式切換前保留 4 筆既有舊訂閱；是否退場仍須根據實機驗收與最終資料狀態決定。
- 瀏覽器以公開 build flag 加上本人 runtime status RPC 決定灰度路徑。敏感裝置狀態留在 lazy runtime，畫面只收到八種狀態名稱。
- 清理端新增明確 `hosted-v1` 模式，保留 limiter canary 與 default-off 行為。兩組獨立 RSA 金鑰用於訂閱和 sessionless cleanup，私鑰不進前端。
- service worker 以穩定 notification ID 合併重送通知，點擊只開啟本站並復用既有視窗。
- 明確登出有 15 秒等待上限。Auth 暫時不可查證時仍以本機 cleanup capability 清理；較新登入身分出現會使舊的操作失效。
- Android 實機發現 React 登出按鈕原本直接傳入 SyntheticEvent，使 continuation 判為不合法輸入而略過推播清理。已改成無參數呼叫，新增真正 DOM 點擊連接 continuation 的回歸測試，驗證 cleanup 先於 Auth sign-out。

### Hosted 證據

- migration 與 legacy dispatcher、push-cleanup、push-subscription-v2、notification-outbox-dispatch-v2 均已部署。網站由 Git push 部署；登出修正版本 `aca29f5`，Vercel `dpl_BEACPoDaVbY86PAkAeDzPfDjnsxu` 為 READY。
- Vercel production 已設公開 v2 flag 與兩組獨立 RSA 公鑰資產；Edge 私鑰、限流 HMAC 與專用 dispatcher DB 憑證只存服務端。cleanup policy 的 canonical JSON 順序已修正，真實加密未知 capability 請求回覆 200／OK。
- Ian 指定帳號經 runtime status 開放灰度，Android Chrome 訂閱成功；使用專用 QA 主揪經真實 `invite_to_session` RPC 產生事件，frozen fanout 派送 1 台装置。
- Hosted worker 回覆 accepted 1／failed 0，delivery ledger 為 accepted、attempts 1、error_code null；claim 至 finalize 約 650ms，整次 Edge 請求約 2.8 秒。這是一筆實測，不能推導延遲 p95。
- 使用者確認 Android 收到邀請且點擊開啟正確球局。首次登出暴露上述按鈕問題，修正後再次由 Android 完成登入與登出；後端確認 `state=paused`、`reason_code=user_logout`、對應 transport 數為 0，登出清理複驗通過。
- 舊 transport 由 4 筆降至 3 筆，原因是 Android 原 endpoint 轉為 v2。剩下舊訂閱繼續使用 legacy dispatcher；pending legacy 與重試耗盡均為 0。
- 正式 runtime 已切至 `enabled`，generation 1；v2 與 legacy 排程均 active。2026-09-08 17:45（台北）v2 cron 實際觸發，HTTP 200、timed_out=false，worker `completed / normal_exit`。空佇列的 claimed／failed 均 0；真實通知派送則由前述 Android 邀請驗收涵蓋。
- 已移除唯一驗收球局與兩個專用 QA Auth 帳號、檔案及其連帶資料，保留 Ian 與其他既有帳號。正式開局流程在測試建立球局的同一交易內移除該測試球局的初始通知，避免向其他球場訂閱者發出驗收訊息。

登出複驗後已執行 `npx supabase db query --linked --file scripts/enable-notification-dispatch-v2.sql`。此操作檢查既有灰度參數和 Vault 設定，建立每分鐘 v2 排程，再改 runtime 為 enabled；保留 legacy writes 與原排程。pg_net deadline 明確設為 90 秒，容納每批至多 50 秒的 provider 等待，避免使用預設 5 秒而誤報逾時；已確認排程實際啟動 worker 及 HTTP 200。

初始灰度參數是待實測校準的操作上限，不能視為 production latency 測量結果：每批 5 筆、provider deadline 10 秒、delivery lease 30 秒、worker lease 120 秒、最多 3 次嘗試、TTL 安全量 1 秒。單批 provider 最壞等待 50 秒，保留 DB／排程餘裕並低於平台 150 秒 free wall-clock 上限。cleanup 限流初值 global burst 30／每秒回補 1，來源 burst 3／20 秒回補 1，閒置 600 秒。事件有效期：聊天至多 1 小時，其他事件至多 24 小時，均受球局開始後 2 小時限制；提醒到開始時間為止。

## 效能

- 初始正式站 lab：桌面殼可操作約 0.4–0.8 秒；手機 4 倍 CPU／150ms RTT／200 KB/s 模擬約 3.5–3.7 秒，篩選開啟約 0.1 秒。**該早期腳本隨即點開篩選，會結束 LCP 觀察，不能以其 3.5 秒前後的讀值代表完整首頁 LCP。**
- 保留完整官方 Supabase client 與既有 Auth/storage lock 架構；使用 Terser 兩輪壓縮，沒有自製 credential bridge。
- Noto Sans TC 使用 400–700 可變字重，保留字體與字重。相同 Chrome UA 取得的字型 CSS：367,106 → 127,158 raw，100,835 → 33,857 gzip。相同早期腳本的部署前後，手機殼可操作中位數約 3.53 → 3.31 秒；這是可操作時間的改善，不是完整 LCP 達標。
- 保留原 main 658,867 raw／192,420 gzip、一般 lazy 18,000／5,500 門檻。正式接入的 Push v2 有獨立 75,000／17,000 budget，且強制為 dynamic entry、storage 不得混入 initial JS。總預算在原門檻上增加 80,000／18,000，涵蓋這項新功能與 facade；並非放寬一般頁面或 initial JS。
- 使用真正 production 環境與 v2 公鑰資產的 build 通過嚴格 bytes gate，0 項超標：main 652,048 raw／189,216 gzip，Push lazy 約 69,415／15,373，全部 JS 927,753／275,661。保留原 main 門檻。

### 最終完整觀察

新增可重跑腳本，先等地圖容器與字型就緒，再觀察 2 秒，才進行第一次篩選點擊。冷瀏覽器 context、停用快取，每種模式 3 次；手機為 390×844、CPU 4 倍、RTT 150ms、下載 200,000 bytes/s。地圖容器就緒不代表所有圖磚已載完。

| 指標 | 桌面 | 手機模擬 | 判定 |
| --- | ---: | ---: | --- |
| LCP 中位數 | 600 ms | 8,176 ms | 手機未達 2,500 ms |
| 篩選控制出現中位數 | 172 ms | 2,996 ms | 僅殼就緒，不代表資料載完 |
| 地圖容器就緒中位數 | 255 ms | 6,806 ms | 瓶頸訊號 |
| 篩選開啟中位數 | 109 ms | 97 ms | 單次操作觀察 |
| CLS 最大值 | 0.00035 以下 | 0.00119 以下 | 達 0.1 目標 |
| pageerror | 0 | 0 | 通過 |

最後 LCP 元素為影像；配合 Maps 在主程式啟動後才請求及地圖就緒時間，瓶頸指向地圖 SDK／圖磚載入。Terser 和字型 CSS 改善了殼載入，但不足以達成慢速手機完整地圖 LCP 目標。後續需針對 Maps 載入順序、網路 waterfall 與地圖呈現策略處理；本次不以提早互動或隱藏地圖來讓指標表面通過。

原始數據：`discovery-push-performance-lab-2026-09-08.json`。重跑：

```sh
node scripts/measure-production-performance.mjs --enforce-lab-targets
```

本次命令正確以 exit 1 表示手機 LCP 未達標。此脚本的 Event Timing 只是少數操作樣本，**不宣稱 INP 或真實使用者 field p75 通過**；目前缺乏足量 field 數據。

## 檢查證據

- `test:ci:frontend`：typecheck、lint、format、單元 751 pass／5 skip、Chromium 384 pass／4 skip、build 與結構／byte 檢查通過。
- `test:ci:supabase`：SQL 1,305 項、本機 API／桌面 44 項、手機 6 項、production preview 4 項，以及四組 local Edge 套件全部通過。
- 最後補入 unverified sign-out 後，相關 37 項測試與型別檢查通過；重新執行本機整合及 production bytes gate。
- 實機發現的登出按鈕修正：26 項相關測試、完整 lint／format、typecheck、本機 API 4 項、桌面整合 44 pass／12 skip 及正式 bytes gate 再次通過。
- local DB lint：public／private／notification_dispatcher_api 無錯誤。
- Hosted 前置快照：v2 disabled、generation 1、活躍 v2 worker 0、legacy devices 4、pending legacy 0、v2 deliveries 0。

參考：[Supabase Edge limits](https://supabase.com/docs/guides/functions/limits)、[Google Fonts CSS2](https://developers.google.com/fonts/docs/css2)、[Web Vitals](https://web.dev/articles/vitals)。
