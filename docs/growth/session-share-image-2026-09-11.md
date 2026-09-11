# 逐局連結預覽圖片

日期：2026-09-11。使用者選擇A連結預覽、確認精修視覺並核可「先做一版看看」。本批完成本機版本，不含commit／push／部署或代發訊息。

## 正式實測修正 v4（2026-09-11，本機）

正式球局「延平河濱公園網球場」為9字，v3在80px字級下超過700px預算而分行，但兩行基線只差54px，造成重疊。已將80px門檻限為8字，9字改走58px單行，並新增完整9字名稱不拆行測試；卡片revision升card-v4。實際同名PNG已目視確認，相關分享／聊天／通知unit33通過、變更檔lint／format通過。使用者已要求提交與推送；實際提交／部署結果以progress最新段落為準，不以push代表LINE快取已刷新。

## 視覺微調 v3（2026-09-11）

使用者要求移除圖片上的年份／台北時間與已訂場，已移除這两項顯示；額滿及未定案／等場等狀態仍保留，時間仍採台北時區，HTML摘要不變。背景依原稿樣本調整底色與既有固定seed紋理透明度，無新增依賴或外部素材，revision升card-v3。五張PNG及對照截圖已更新；一般卡目視確認，18項分享測試及變更檔lint／format通過。本輪未重跑完整local／打包，未提交或部署；既有驗證限制保留。

## 視覺修正版 v2（2026-09-11）

使用者指出第一版實際PNG與已核可示意圖有明顯落差，核可按原稿重做；第一版不能視為視覺驗收完成。已新增原廠Noto Serif CJK TC Bold，日期／時間／球場使用真正700字重；日期164px、一般時間86px、短球場名80px，長名沿用分級縮小及兩行省略。重新對齊42px左邊界、底部分隔線、四條球場線位置與小球；背景加入固定seed SVG微紋理，無外部圖片請求。年份移至右上角，場地狀態保留底部。模板revision已升為card-v2。

[原稿與實作並排](share-card-preview/comparison.html)及[對照截圖](share-card-preview/comparison.png)以原始參考圖與真實產圖比較，含360px縮圖情境；參考圖檔保留原樣，HTML以容器顯示卡片區域。已逐張目視檢查一般、長名、候選、額滿、不可查看五張PNG。這是視覺修正完成、等待使用者回饋，並非已獲使用者驗收。

本輪18項分享測試、變更檔lint／format、Vercel本機build及隔離HTML／圖片bundle驗證通過，兩種字重皆檢查隨函式存在；PNG約1MiB，背景紋理增加PNG體積。沒有改src／資料契約或migration，不重跑上一輪已受探索資料量阻礙的local整合；阻礙與未驗證實機LINE限制保留。未commit／push／部署，無真實成效。日誌：`/tmp/qiuka-share-v2-tests.log`、`/tmp/qiuka-share-v2-build.log`。

## 使用者流程與介面

原本「分享球局」繼續傳文字＋`/s/:id`，不新增產圖按鈕、圖片附件或手機下載。接收平台讀取HTML的`og:image`，再請求`/api/share-image?id=:id&v=:revision`取得1200×630 PNG。圖片取得不代表平台必定展示預覽；實機LINE仍待部署後驗證。

`server/sharePage.js`與`server/shareImage.js`共用匿名讀取`loadPublicShareRow`，只使用既有`SHARE_SELECT`和session_discovery。不轉送訪客cookie／Authorization，不使用service role，不讀主揪、名單、備註或聊天。圖片API只接受GET／HEAD及單一正整數id，不接受使用者自訂文案、遠端圖片或字型URL。

卡片為深森林綠、暖白、Noto Serif CJK TC襯線字、球場線條及少量網球黃；以固定SVG模板在server透過`@resvg/resvg-js` 2.6.2轉PNG，不呼叫AI。SVG只在內部使用，所有文字escape／移除XML控制字元。字型固定隨函式打包、附OFL授權與來源，不加入public或browser bundle；缺少字型明確失敗，避免回傳無字卡片。

顯示台北日期時間及年份、球場、玩法、程度、場地狀態。長球場名最多兩行，極端長度省略；完整名稱仍在球局頁。候選局顯示未定案及時間範圍；候選定案不冒稱已訂場。額滿標示「已額滿」，不顯示剩餘人數。正常圖片樣式與狀態示例見[預覽](share-card-preview/README.md)。

## 可見性與快取

沿用現行匿名分享契約：只有discovery中open/full且仍在可見窗口的球局可產生具體卡片。取消、結束、過期、不存在／下架一律404與中性不可查看圖片，不揭露被移除球局原資訊；讀取失敗回503與中性暫時不可載入圖片。HTML失敗／不可查看仍使用品牌圖。這優先於早期討論中「顯示已取消／已結束」的概念說明，不能為取得這些狀態去查raw sessions。

HTML與圖片均no-store；revision由圖片相關公開欄位及模板版本的SHA-256摘要產生，欄位改變時新HTML取得不同圖片URL。舊revision不存取舊快照，仍重新檢查當下公開性。無伺服器永久圖片儲存、無不受限記憶體快取。外部平台可能保留自己的舊預覽，無法強制撤回；最新狀態仍以球局頁為準。

Vite dev／preview middleware支援相同圖片API，圖片絕對網址取本機實際port；production仍固定qiuka.tw，不信任訪客Host。

## 驗證

- 18項分享HTML／圖片測試通過：匿名欄位、台北跨日、候選／額滿、失效窗口、HTML／SVG跳脫、長名稱、PNG尺寸與二進位adapter、GET／HEAD／method／id、revision及真實Vite HTTP HTML→PNG流程。HTTP資料源為loopback fixture，不是正式DB。
- 完整session-unit第一次789 passed／5 skipped；之後補入HTTP整合測試，以18項focused測試驗證最終分享程式，未宣稱重跑完整unit。
- 桌面Chromium／手機Chromium／WebKit選定分享相關既有回歸12 passed；native分享使用stub，未傳送到外部App。
- typecheck、lint、Prettier、Vite build及strict production bundle通過；入口665870／194917、全部JS948125／284509 raw／gzip bytes（本次工作區建置），0 exceeded。新字型與renderer不在前端bundle。
- `vercel build`為本機建置，非部署。`check-vercel-share-bundle.mjs`及新增`check-vercel-share-image-bundle.mjs`將函式與filePathMap資產重建到隔離目錄，分別驗證HTML／字型與native renderer／1200×630 PNG。僅驗證本機OS產物，不冒稱已驗證Vercel Linux hosted runtime。
- 五張PNG皆目視檢查；標題移到圖案左側以免球場線條穿過文字。
- `npm run test:local`：3 API pass、1 fail；失敗為既有探索API fixture的`DISCOVERY_TOO_BROAD`，browser未啟動。未改該資料查詢／測試，未清庫或弱化斷言；本批不宣稱local整合全綠。本批零migration，不需schema測試。

日誌：`/tmp/qiuka-share-focused.log`、`/tmp/qiuka-share-unit.log`、`/tmp/qiuka-share-browser.log`、`/tmp/qiuka-share-local.log`、`/tmp/qiuka-share-vercel-build.log`、`/tmp/qiuka-share-format.log`。

## 尚未完成

尚未提交、推送、部署、實機LINE分享驗收或取得真實成效。下一步檢視實際PNG；發布前解決或獨立確認本機探索資料量阻礙、依release checklist完成必要檢查，部署後測LINE預覽與快取行為。回復只需恢復分享頁品牌og:image並移除圖片API及專用依賴，不涉及資料遷移。

## Samsung 預覽相容性修正（2026-09-11）

實機 WhatsApp 同聊天室 Apple／新聞有圖，球咖原網址沒有卡；加新 query 後有標題摘要但無圖片。PNG 1,176,542 bytes，取圖約 2.6–3.7 秒。先以更小 JPEG 驗證取圖相容性，不把大小門檻當作已確定根因。

OG 改用 `format=jpeg`、`image/jpeg`，card-v5-jpeg 更新圖片 revision；1200×630 設計不變，Sharp quality 82、4:4:4，實際卡 118,259 bytes。舊無 format URL 保留 PNG，公開性重新查詢與 no-store 不變。19 項 focused 分享測試、ESLint、strict production bundle 通過；本批無 src runtime／DB 變更。待部署後 Samsung 驗收；不宣稱 LINE 已通過。
