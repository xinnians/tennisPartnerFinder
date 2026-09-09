# C04指南補強與校園候選（2026-09-09）

分支codex/court-guide-completion-c04-followup，base f606768（C04正式24篇）。目前本機26篇，正式24，尚未發布。新增三民國中／北醫，補九河濱夜照原則、大佳集合提示及兩營運球場預約／取消資訊。球場catalog/DB未變；生成指南slug map新增2筆，故完整test:local不豁免。

## 內容證據

- 三民：沿[C04規章全文](court-guide-completion-c04-2026-09-09.md)，2025-12-18要點與附表核對240元面時、夜照50元面時、保證金10000；公眾7天前紙本申請、核准繳費後使用。操場免申請不套網球；指定入口／開燈操作pending。
- 北醫：現行下載專區連結至[2026-07-21費率](https://pe.tmu.edu.tw/wp-content/uploads/2026/08/臺北醫學大學運動設施清潔維護費收費標準.pdf)，PDF3頁全文已讀，人工草皮欄實際閱圖：校外700元/座時、夜照另150/時。大型活動網球2500/2小時不是一般硬地時租，硬地一般費率pending。取得[2025-01-15會員規定](https://pe.tmu.edu.tw/wp-content/uploads/2025/01/臺北醫學大學網球場清潔維護費收費標準.pdf)全文與表格阅圖；校外年10000、單月1500，週一三五07–09、週末07–13，假日連假不開放。舊2021版週一至五不可覆蓋新版。
- [北醫信義校區單位位置](https://chsseng.tmu.edu.tw/index.php?action=qa&id=9)2026-08-27更新列網球，不能把頁尾人社院雙和地址當網球位置。2019網球細則仍由現行頁連結，校外個人可申請成立；時段與場館頁08–21不同明示pending。會員及單次租借分開；夜照費已知，操作與入校入口未知。
- C01十一篇補強見[覆核原始證據](court-guide-completion-c01-followup-2026-09-09.md)。河濱FAQ18–22只對所轄有燈設施為原則，不證明每面燈正常；九篇保持pending。大佳10號停車場僅集合參考，7／10來源差異不刪除。台北網球場交通頁已重讀確認小巨蛋2號出口約3分鐘。

## 實作與驗證

JSON新增2篇，生成catalog26；既有unit4通過。索引count斷言24→26，河濱數13不變。完整frontend與原始test:local已啟動，log/tmp/qiuka-c04-followup/frontend.log與local.log，句柄82934／64111；尚未宣稱通過。後續mobile、preview Chromium/WebKit、Production strict、hosted preflight、Git preview與CI、正式QA依既有規則完成。必要测试不重置DB，不放寬容量。

來源PDF文字／閱圖檔保存在/tmp/qiuka-c04-followup/tmu-fees*、tmu-members*。遇web screenshot逾時，以公開原檔下載pdftoppm閱圖確認，未以讀取失敗代替來源核對。Browser plugin not available，延用Playwright驗收。

## 接續

本批26篇候選尚未發布；現行formal24。完成本批驗證及發布後繼續6筆未開始校園（銘傳、北教大、台科大、政大、景美女中、木柵），另第二組5筆查核處置已保存於校園紀錄；另已查核待來源者依逐場清冊。長期目標active，不宣稱全部61筆完成。


### 本機驗收接續

- 完整frontend初次因生成檔把tmu識別加引號而不符合Prettier；修正generator輸出合法小寫英數識別時不加引號，重跑完整入口通過（775 unit、384 Chromium，既有skip保留），未改門檻。
- 原始test:local首次新帳號訂閱UI checkbox超時：DB訂閱已符合，UI未於5秒內勾選，保留local.log與subscription-error-context.md。相同單項1 pass，完整原始入口重跑API4與browser46 pass／12 skipped。沒有重置DB或改測試；根因尚未確認，不能宣稱修復。
- mobile6通過。log於/tmp/qiuka-c04-followup/frontend-recheck.log、local-recheck.log、subscription-recheck.log、mobile.log。預覽Chromium執行中，其餘發布驗收仍待完成。


### 發布候選驗收

Chromium預覽初跑18 pass／2 fail，原因是「臺北」搜尋已正確多出北醫而舊斷言未更新；補上第三筆明確結果後，完整20 pass。WebKit預覽9 pass，格式重驗通過。Production設定strict：main385456/119304、root661765/193661、guide277728/75190、全部943323/283099、索引1036/543 raw/gzip bytes，0 exceeded，未提高上限。

Hosted只讀preflight：profiles3／sessions3／participants3／messages2／reports0／outbox15，5cron active，discovery25欄與匿名allowlist；REST公開200、禁欄400、私有10面401。Management API schema_migrations41版與本機檔名逐一相等。零migration，不重做DB備份／不修改DB；OAuth與兩帳號寫入僅沿用本機／既有證據，未列為本批hosted通過。

本機候選26篇，25篇39欄pending，正式24篇。桌面／390px長文、Git預覽／必要CI與正式驗收尚未完成。


本機長文QA完成：26篇HTTP200／每項文案與來源一致、sitemap28；兩新篇×桌面／390px共4組無溢出、標題／CTA／載入檢查通過，pageerror及console0。北醫手機長文圖已實際閱圖。QA存於`/Users/ian/tennisPartnerFinder-qa/court-guide-c04-followup-2026-09-09/local`；5181本機預覽已停止。尚待Git預覽、必要CI及正式發布。

Git候選10004ec已推送並建立PR。分支建立前Preview環境設定首次exit1，唯讀查詢確認無設定；分支推送後兩個公開Supabase變數設定成功，Production未變。本文件提交再次Git觸發建置，確保使用完整Preview設定；尚未標記正式發布。


### Git預覽與CI接續

PR #10：https://github.com/xinnians/tennisPartnerFinder/pull/10，驗證head `02a8349c7a55274cf5978309cdebc6a7d5f84918`。Vercel Git preview `dpl_8L69P3A3zdakgE21xVa755VUY1ve` READY，穩定別名`https://tennis-partner-finder-git-cod-da792c-xinnians-projects-c513dbd3.vercel.app`。26篇內容／來源、sitemap0（Preview禁止索引）、未知指南與全台底稿404、名稱／行政區／鍵盤／no-JS、兩篇4組長文全部通過。

開局入口首跑仍遇Maps65/14a getRootNode偶發TypeError；同樣斷言重跑兩輪各4組通過、無寫入、取消清intent；失敗stack保存preview-entry.log，不宣稱根因修復。PR初版10004ec的run34350921866取消後Safari always步驟仍未退出，新head PRrun34350963525被相同concurrency group排隊；已對旧run請求force-cancel，並以同一head啟動完整workflow_dispatch34351291388，未修改門檻／測試。必要CI及正式发布尚待完成。


## 已正式發布

PR #10已合併，merge `471d70b5b236d21cc893f6ca1e9bbe8138fde63a`；Production `dpl_88EvseZfdvb4uSJ6TuZa7UDDMhwp` READY且qiuka.tw指向此部署。正式26篇（台北35筆未發布），25篇39欄pending。

完整CI34351291388成功：Frontend775 unit／384 Chromium；Supabase1305 SQL、4 API、46 browser、6 mobile、20 preview Chromium及4組Edge檢查通過。Safari非阻擋189 pass／2 fail／3 skip，包含shell3744ms>2500及nearby drawer開啟後session-card焦點失敗（tests/session-lifecycle-smoke.spec.js:75）；正式建置preview Safari9通過。保留失敗，沒有宣稱Safari全綠或焦點問題已修復。

正式QA：全26篇HTTP內容來源一致、sitemap28、未知指南／全台底稿404；桌面／390px搜尋、鍵盤清除回焦、44px、no-JS、索引只有1036raw／541encoded bytes、2篇4組長文／開局取消皆通過。正式pageerror及console0，開局無寫入；分享GET／HEAD200、不存在404、POST405及no-store通過。QA於`/Users/ian/tennisPartnerFinder-qa/court-guide-c04-followup-2026-09-09/production`。首訪三次容量量測及環境清理接續。

逐場清冊61筆與台北JSON slug集合逐一相等、無漏列，全部已有首輪查核處置。台科／木柵候選仍未發布，草稿`/tmp/qiuka-c04-schools-final/guides-draft.json`及[最後六筆證據](court-guide-completion-c04-schools-final-2026-09-09.md)可接續；尚未宣告長期目標完成，也未取得真實留存成效。


發布收尾：正式站各裝置3次獨立效能量測exit0，最大本站JS788723raw／242817encoded bytes，上限820000／260000未調整。桌面LCP中位692ms、手機8168ms，pageerror0；慢速手機LCP缺口保留。三民手機長文已人工閱圖。兩個本分支Preview公開Supabase變數移除成功，Production env臨時匯出檔已刪除；Production環境設定不變。後續仍有台科／木柵候選待完成，長期目標不標完成。
