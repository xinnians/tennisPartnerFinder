# 探索完整性、推播啟用與效能驗收

日期：2026-09-08。狀態：程式與本機整合檢查完成；Hosted 灰度及 Android Chrome 實機驗收進行中。

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

初始灰度參數是待實測校準的操作上限，不能視為 production latency 測量結果：每批 5 筆、provider deadline 10 秒、delivery lease 30 秒、worker lease 120 秒、最多 3 次嘗試、TTL 安全量 1 秒。單批 provider 最壞等待 50 秒，保留 DB／排程餘裕並低於平台 150 秒 free wall-clock 上限。cleanup 限流初值 global burst 30／每秒回補 1，來源 burst 3／20 秒回補 1，閒置 600 秒。事件有效期：聊天至多 1 小時，其他事件至多 24 小時，均受球局開始後 2 小時限制；提醒到開始時間為止。

## 效能

- 初始正式站 lab：桌面殼可操作約 0.4–0.8 秒；手機 4 倍 CPU／150ms RTT／200 KB/s 模擬約 3.5–3.7 秒，篩選開啟约 0.1 秒，CLS 近零。這些是控制條件下的 lab 數據，並非真實裝置 INP 或 field p75。
- 保留完整官方 Supabase client 與既有 Auth/storage lock 架構；使用 Terser 兩輪壓縮，沒有自製 credential bridge。
- Noto Sans TC 使用 400–700 可變字重，保留字體與字重。相同 Chrome UA 取得的字型 CSS：367,106 → 127,158 raw，100,835 → 33,857 gzip。僅切換字型的正式站 A/B 手機 lab 可操作約 3.28–3.33 秒，仍未達 LCP 2.5 秒目標；須再以最後部署版本確認。
- 保留原 main 658,867 raw／192,420 gzip、一般 lazy 18,000／5,500 門檻。正式接入的 Push v2 有獨立 75,000／17,000 budget，且強制為 dynamic entry、storage 不得混入 initial JS。總預算在原門檻上增加 80,000／18,000，涵蓋這項新功能與 facade；並非放寬一般頁面或 initial JS。
- 使用真正 production 環境與 v2 公鑰資產的 build 通過嚴格 bytes gate；最終大小及 Hosted 數據會在完成部署後更新。

## 檢查證據

- `test:ci:frontend`：typecheck、lint、format、單元 751 pass／5 skip、Chromium 384 pass／4 skip、build 與結構／byte 檢查通過。
- `test:ci:supabase`：SQL 1,305 項、本機 API／桌面 44 項、手機 6 項、production preview 4 項，以及四組 local Edge 套件全部通過。
- 最後補入 unverified sign-out 後，相關 37 項測試與型別檢查通過；重新執行本機整合及 production bytes gate。
- local DB lint：public／private／notification_dispatcher_api 無錯誤。
- Hosted 前置快照：v2 disabled、generation 1、活躍 v2 worker 0、legacy devices 4、pending legacy 0、v2 deliveries 0。

參考：[Supabase Edge limits](https://supabase.com/docs/guides/functions/limits)、[Google Fonts CSS2](https://developers.google.com/fonts/docs/css2)、[Web Vitals](https://web.dev/articles/vitals)。
