# 開局後系統分享：實作規格與驗證

日期：2026-09-11。使用者核可「可以先做看看，等實際使用再調整」。最新驗證及部署狀態以 [progress.md](progress.md) 為準。

## 本批介面與行為

- 建立成功的 `CreateSessionSheet` 在摘要卡下提供主要「分享球局」，保留「查看我的球局」與「回到地圖」；只有成功取得 sessionId 且有接線才顯示。分享不自動開啟、不新增站內分享選單。
- `MySessionsPage` 主揪球局卡新增「分享球局」，讓完成成功畫面後仍可再分享；既有詳情的「複製球局摘要」保留。
- `openCreateSessionSheet` options 與 React content 新增可選 `onShareSession`；`MySessionsAppActions` 新增同名 callback。main 的共用 `shareHostedSession` 同步讀取目前登入者自己的主揪球局，沒有 await 資料讀取再呼叫分享，以保留 user activation。
- `shareFeature.shareSession` 使用 `navigator.share({ title, text, url })`；支援時直接開系統選單。沒有 share API 或 canShare 回 false 時複製摘要；AbortError 安靜結束，其餘錯誤顯示可重試／前往詳情複製的提示，不擅自複製。
- 原 `sessionShareSummary` 共用中性文字與 `/s/:id`。native 的 text 不再附重複網址，url 獨立傳入；複製仍是文字加網址。內容只列原公開 allowlist，排除備註、主揪 ID、名單與聊天。不以 share promise 完成宣稱已傳送。
- 使用既有 async action owner 防連點、回復按鈕；分享結束只在焦點落到 body 時回到有效的觸發按鈕，換頁／卸載／換帳號不重放舊 UI 錯誤。複製備援保存原焦點，成功 toast 受 auth epoch 保護。
- 成功狀態切換時以 React scroll ref 回到頂端，保留原標題聚焦，避免桌面沿用表單捲動位置截掉成功圖示。
- 無 DB migration、外部 SDK、分析事件、聯絡人讀取、自動訊息或私人球局；其他空站、獎勵及文章提案不連帶啟動。

## 驗證方法

核心旅程：填妥開局表單 → 真正成功回傳 → 點分享 → native payload／取消／失敗／複製備援 → 查看我的球局 → 再分享同一局。

- `session-lifecycle-smoke.spec.js`：桌面 Chromium、手機 Chromium、手機 WebKit；真實按鈕點擊的 user activation、未點不分享、等待中防重複、取消不複製、鍵盤焦點、權限錯誤、canShare 不支援及無 API 的複製、公開欄位、不重複 URL、console/pageerror。
- `session.spec.js`：在既有完整 profile 建局旅程使用真實 local Supabase RPC，核對成功頁及「我的球局」分享同一份場地／台北時間／sessionId。
- `growth-actions.test.js` 既有摘要測試繼續覆蓋候選未定案、額滿／取消／過期／已結束及私有欄位排除；分享路由／登入加入矩陣由既有全套測試守住。
- 完整 frontend gate、強制 local API/browser、release bundle 檢查；零 migration 不跑 DB schema gate。所有測試維持不重置 DB。
- Browser plugin not available；依 frontend testing skill 使用專案 Playwright。畫面證據放在 `/tmp/qiuka-native-share/`，不提交生成截圖。

系統分享選單由作業系統提供，Playwright 以 API stub 驗證傳入資料與回應；真手機的 LINE／複製選項和實際貼上格式仍待使用者試用。測試不等於真實分享轉換或成局成效。

## 結果

初輪 lint 發現新錯誤缺少 cause，已保留原錯誤原因；初輪 unit 的 browser API 清單偵測到新分享及焦點使用點，已明列更新 manifest，未放寬 controller 邊界或 canary。

- 最終 source 的 `npm run test:ci:frontend` 通過：777 unit（5 skip）、386 Chromium（4 skip）、typecheck、lint、Prettier、catalogue／design-system、build、結構 gate、diff。
- 最終定向分享旅程桌面 Chromium 1280×720、手機 Chromium／WebKit 390×844 共3 pass，API stub 未實際代發。修正捲動後確認成功圖示完整在視窗內；重拍截圖停用進場動畫，避免截到半透明過渡。
- 最終 build 執行 `node scripts/check-production-bundle.mjs --enforce-byte-limits`：initial static JS 664803／194509 raw／gzip，total JS 946987／284044，0 exceeded；未調高上限。
- `npm run test:local` 第一輪 4 API、46 browser（12 skip）通過；捲動修正後一輪在新帳號全部球場訂閱的UI勾選斷言失敗，資料庫訂閱斷言已過；40 pass／1 fail／5未執行，保留 `/tmp/qiuka-share-local-intermittent.log` 及 `/tmp/qiuka-share-subscription-error-context.md`。未改訂閱程式／斷言，再次完整重跑仍是同一失敗；在 `git archive HEAD` 的修改前基準 `d81b8fb5fa589d1fffdb08e3d99c04a0663e101b` 獨立執行該測試亦同樣失敗（`/tmp/qiuka-share-baseline.log`）。最後另跑被serial阻擋的5項全部通過（`/tmp/qiuka-share-local-remaining.log`）。因此最終source共驗證4 API通過、45 browser通過、1項既有失敗、12原skip，不能記為local gate全綠。尚未確認訂閱UI不同步的根因，未擴大本批修復。
- 無 migration、未清庫；未跑全套 mobile WebKit、local mobile、hosted OAuth／正式兩帳號或正式網路效能。本批依使用者要求提交本機commit，未push／部署，也沒有使用者成效數據。

| 視覺／互動檢查 | 結果 |
| --- | --- |
| 頁面識別 | localhost 5174 路徑 `/`、title「球咖｜台北網球」斷言通過；local整合5175 |
| 非空頁／無錯誤覆蓋 | 成功標題、分享按鈕可見；無 vite-error-overlay |
| Console／pageerror | 新分享旅程收集0筆 |
| 截圖 | 桌面、390px手機已目視；無新按鈕裁切，桌面成功圖示截斷已修復 |
| 操作 | native user activation、取消、重試、複製、焦點、防連點及真實建局雙入口通過 |

可持續保留的畫面在 `/Users/ian/.codex/visualizations/2026/09/11/01a08e26-2b11-7460-bed6-c56ab82cd8a6/share-mobile.png` 及同目錄 `share-desktop.png`。本輪因 Browser skill/plugin 未提供而使用 Playwright；若日後需要在 app 直接操作頁面，可選擇安裝 Browser plugin。

下一步：若要發布，先處理或獨立核定既有訂閱UI測試失敗，並走既有 Git release 流程。上線後由本人以實際手機檢查 LINE／複製等系統選項及貼上格式，再依使用回饋調整。
