# 第一批正式發布紀錄

日期：2026-09-09。使用者已明確授權直接部署。

狀態：必要 CI 通過、已合併至 main、Vercel READY，qiuka.tw 桌面／手機正式站 smoke 通過。原正式站基線為 `770efcf`。

## 範圍與交付

- G02 加入說明、G03 重開草稿、G04 公開分享摘要，以及研究／計畫／進度文件。
- PR：[Improve joining, repeat-session drafts, and public sharing](https://github.com/xinnians/tennisPartnerFinder/pull/1)。送審程式版本 `2c61a48181b9e300a19eb3074ae2abb68b54a439`。
- 正式環境是 `https://qiuka.tw/`；Vercel project `tennis-partner-finder`，production branch `main`。只使用 Git push／合併觸發 Git integration，沒有執行 `vercel deploy`。
- 零 migration，沒有改 Hosted DB／Edge Function／cron／環境變數。此次沒有新增 DB 備份；沿用純前端發布範圍，另做 count、migration、匿名權限與 cron 唯讀 preflight。

## 發布前證據

| 項目 | 結果 |
| --- | --- |
| Migration | 41／41 local↔remote 一致，最新 `202609080002` |
| 匿名探索 | 目前程式明列的 24 個公開 select 欄位回 200；未以舊文件的 25 欄數字冒充本次結果 |
| 私有資料阻擋 | line_id 查詢 400；12 個私有／authenticated-only 面均 401，包括 profiles、sessions、participants、messages、outbox、reports、join preview |
| Count 快照 | profiles 3、sessions 3、participants 3、messages 2、reports 0、outbox 13；僅彙總，沒有輸出資料內容 |
| Cron | legacy／v2 dispatch 每分鐘、reminder 每 5 分鐘、expire 每 15 分鐘、purge 每日 03:30；5 個 job 皆 active |
| 最後程式調整後本機 | typecheck 通過；`test:local` API 4 passed、browser 46 passed／12 skipped；`test:preview:chromium` 4 passed，含 production bundle、PKCE callback 與 390px 慢網路 |
| 正式設定 build | 使用 Vercel Production env 經 Vite `loadEnv` 解析；嚴格 bytes 與結構 gate 通過，沒有調高上限 |
| 遠端 CI | [Quality Gate](https://github.com/xinnians/tennisPartnerFinder/actions/runs/34308521505)：Frontend／Supabase job 成功；SQL 1,305、API 4、local browser 46、mobile 6、preview 4 及四組 Edge 整合皆通過 |
| Safari 非阻擋訊號 | Mock 190 passed／1 failed／3 skipped；唯一失敗為 slow-discovery shell elapsed 2,569ms 超過 CI 門檻 2,500ms。production-preview WebKit 1 passed；沒有改斷言或掩蓋此失敗 |

純前端工作沒有重做 hosted 兩帳號建局／聊天或真實 Google／LINE OAuth；既有歷史驗收保持原日期，不標成此次新驗收。新重開的真實建立 RPC、帳號切換與原局不變已在 local 驗證；正式站 smoke 採匿名唯讀，不建立測試球局或發送通知。

## 效能預算決策

使用者詢問「上限是否自己設定、是否合理」。上限定義在 `scripts/productionBundlePolicy.mjs`，屬工程預算，並非 Vercel 容量上限。既有數字來自先前版本加維護餘裕，後來為 Push v2 增加獨立 lazy 與總量預算。

本次初版正式設定 raw JS 930,244 bytes，比 929,961 上限多 283 bytes，約 0.03%。共用新建／重開初值、候選狀態、場地名稱與日期解析後：

| JS | Raw | Gzip | Raw／gzip 上限 |
| --- | ---: | ---: | --- |
| Main | 653,830 | 190,017 | 658,867／192,420 |
| Total | 929,943 | 276,629 | 929,961／277,062 |

目前 raw total 只餘 18 bytes，不足以作為長期開發餘裕。下一批應重新建立首屏下載量、壓縮量、lazy 分布與手機體驗的聯合預算，記錄基準和調整理由；不能為微小差額犧牲功能或可讀性，也不應無證據地直接提高數字。這與 [web.dev 的效能預算原則](https://web.dev/articles/performance-budgets-101)一致：容量指標需搭配使用者感受到的載入指標，資源順序也會影響體驗。

發布前對舊正式站各做一次桌面／慢速手機 lab：LCP 804／8,176 ms，pageerror 0。新版單次 LCP 1,688／8,160 ms，pageerror 0；新版量測與 smoke 同時執行，桌面資源競爭未控制。這些數字只用作煙霧檢查，不能作效能改善／回歸結論；慢速手機 Maps 載入仍是既有未達標項，不把少量 byte 的打包差異解讀成手機效能達標。

## 部署結果與回復

PR #1 已合併，正式 runtime commit `9c54f7e53ad3538a06abed1125d6798ef61cf201`，與通過 CI 的 PR head 程式樹相同。首個正式 Vercel deployment `dpl_7ctFBj2NXGzuKzdmP9BKJ5CLWEPQ` 為 READY；確認 qiuka.tw、www.qiuka.tw 與 git-main alias 都指向此部署。後續只補文件的 commit 不改本批 runtime，可能由 Git integration 再產生相同程式的部署。

正式站 `https://qiuka.tw/` 於 1280×844 與 390×844 以 Playwright 驗證：

- 標題「球咖｜台北網球」、真實公開球局詳情與地圖可见；桌面／手機截圖無空白或 framework overlay。
- 「複製球局摘要」實際寫入瀏覽器剪貼簿，包含台北時間、資訊以連結為準的提示及正確深連結；toast 正確。
- 匿名按加入，顯示「登入後確認加入方式」及程度／審核說明；Escape 可關閉。
- 「我」頁隱私連結可開啟、HTTP 200；支援 mailto 存在。沒有寄信或發送任何外部訊息。
- Application console.error／pageerror 0。無頭 Chromium 的 Google Maps 各有一次 vector map→raster fallback 訊息；明確分類為 headless WebGL 限制，並非宣稱所有 console 訊息為零。

截圖位於本機暫存 `/tmp/qiuka-growth-production-{1280,390}-{detail,login}.png`，JSON 結果 `/tmp/qiuka-growth-production-smoke.json`；這些不是永久版本化檔案。後續可依上述匿名操作步驟重驗，避免在正式站建立驗收球局或觸發訂閱通知。

回復原則：若本批產生回歸，對 main 以新 commit 撤回本批 runtime 變更，再 Git push 觸發建置；不 force-push、不動 DB，保留事件與進度歷史。
