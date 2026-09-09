# 全台網球資料待審區

此資料不對外提供、不進網站 bundle、不是正式球場 seed。開局仍依原台北服務範圍。

- `source-22849.json`：來源 CSV 中名稱或設施含「網球／軟網」的必要欄位快照，含原檔 SHA-256、擷取日、Last-Modified、原始列序（CSV record number，非跨行文字行號）。管理人姓名／電話、照片與全文介紹排除；只從補充說明提取施工／廢除「曾被提及」訊號，未宣稱目前仍施工。
- `administrative-areas.json`：內政部國土測繪中心 22 縣市、368 鄉鎮市區的公開代碼快照。保留各 API URL、hash、日期，僅做代碼／名稱對照，沒有逐點行政界驗證。
- `inventory.json`：562 筆待審候選，每筆含分類、原始列索引、獨立開放／租借狀態、疑似問題、既有目錄候選匹配。所有 `guidePublished`／`sessionsEnabled` 均 false，無資料自動升格為可公開。
- `quality-report.json`：縣市分布、非一般網球類型、問題統計、同址／鄰近候選配對及既有目錄覆蓋。配對不等於同一場館，不自動合併。
- [可讀品質報告](../../docs/growth/national-courts-quality-2026-09-09.md)。

## 重現與更新

離線驗證（不連 API、不寫檔）：

```sh
npm run check:national-courts
```

從官方 [資料集 22849](https://data.gov.tw/dataset/22849) 頁面取得最新 CSV 連結，使用正常 TLS 下載至 repo 外，保留 response Last-Modified。原檔含非必要個人欄位，不提交。擷取新版時：

```sh
python3 scripts/national_courts.py --capture-csv /absolute/path/source.csv --fetched-at YYYY-MM-DD --last-modified 'HTTP Last-Modified value' --write
```

先核對官方下載連結仍等於腳本 `SOURCE_URL`，若官方換檔要同步更新來源設定。擷取日不可當每筆資料最後修改日。初次檔案 Last-Modified 為 2026-08-08，擷取為 2026-09-09。

行政區來源：[縣市 API](https://api.nlsc.gov.tw/other/ListCounty)、[戶政鄉鎮市區 API 說明](https://data.gov.tw/dataset/102011)。以縣市 API 回傳的 countycode 呼叫各 ListTown1，保存 code、name、districts 與原回應 hash。不要從球場地址猜測行政代碼；CSV 的 9007／9020 只補前導 0 後比對，不依地址靜默改縣市。兩類來源授權為政府資料開放授權條款第 1 版，發布衍生資料時繼續保留來源聲明。

捕捉來源後，`--write` 重建 inventory／quality report；人工審核前後差異，不直接覆蓋 `data/courts.json`。正式 seed 會停用未列球場，因此本區不得拿來直接產生 migration。

## 查核限制

本地 candidate ID 是必要欄位的衍生摘要，名稱／地址改動時可能改變；CSV 未提供官方場館 ID，`sourceRecordId` 保持 null。sourceRow 只在此快照內定位。後續要建立正式穩定 ID 與人工維護的別名／來源對應，不能用此 ID 取代球局已有的 court_id。

網址目前僅做語法檢查。名稱含學校的旗標是輔助，不完整；所有場館都需查公眾使用資格。附近 80m／同址是疑似同地點，不保證同一設施。與既有目錄同名或 120m 內也只是對照候選。澎湖來源候選為 0 不代表當地沒有網球場。
