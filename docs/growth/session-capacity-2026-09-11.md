# 開局招募人數正整數輸入

2026-09-11 使用者核可：取消開局缺額最多 3 位的限制，改成可填正整數；先討論 UI／UX 後核可實作。本批不修改主動邀請的 24 小時 10 次規則。

## 介面與行為

- 開局「缺幾位」改為可直接輸入欄位，保留 −／＋、不含主揪的提示；手機使用 numeric inputMode。1 位時減號停用。
- 允許暫時清空；送出才檢查空白、0、負數、小數及非十進位整數字串。錯誤在欄位旁呈現，使用 aria-invalid、aria-describedby、role=alert；修改人數即清除該提示，其他已填欄位保留。
- 尚未手動改人數時，保留單打 1／雙打 3 的預設建議；手動輸入或按加減後，切換打法不覆蓋人數。再開一局保留原局人數，切換打法亦不覆蓋。
- 編輯頁「還缺幾位」改為「招募人數」，數字仍代表總 guest 名額。依既有 slotsTotal − slotsRemaining 顯示已加入／剩餘；低於已加入人數阻止送出。資料尚未具備時不杜撰已加入數；最終容量仍由 RPC 鎖定與 constraint 判定。
- 變更 CreateSessionSheet、EditSessionSheet、repeatSessionDraft 與共用 SessionCapacityInput／sessionCapacityError。保留 adapter／RPC 參數名稱，表單 slotsTotal、slotsMissing 不變；原 output 的 create-need-value 改為 input，編輯 radio 改為 session-edit-slots-value。按鈕仍有獨立 label；sheet 焦點回復與生命週期未改。

## 資料契約

- 新 migration `202609110003_session_capacity_positive_integer.sql`：sessions.slots_total 從 smallint 改為 integer，CHECK 改為 > 0；create_session／update_session 保留 integer 簽名，移除 3 位上限及 smallint cast。
- 同一 transaction 重建依賴該欄位的 session_discovery、my_session_participations，slots_remaining 改為 integer；原有欄位順序、公開 allowlist、authenticated-only 個人清單保持。容量 constraint trigger 的 guest_slots 也改為 integer。
- 不另訂產品人數上限；可表示範圍與既有 PostgreSQL integer RPC 一致（1–2,147,483,647），前端超出時明確提示，不截斷、不偷偷改成 3、不把溢位數送入 RPC。TypeScript 生成型別仍為 number，RPC 簽名不變。
- 最後名額、接受／退出、封存、封鎖、個人檔案門檻及資料權限規則維持。未修改已發布 migration，未重置本機 DB。

## 驗證

- 本機 migration up 成功；SQL 全套 1,338 項通過（新增 25 項包含 6／32768／integer 最大值、三種場地、create／update、匿名與個人 view、加入後遞減、額滿後擴充重開與角色拒絕）。
- 完整 unit 784 pass／5 skip；typecheck、lint、prettier、build、production bundle structural check 通過，容量預算 0 exceeded。CSS 已同步 ds-bundle。
- Browser plugin not available，依 frontend-testing-debugging 使用 repo Playwright；localhost:5174，Chrome 1280×720／390×844，表單相關組 83 pass／1 skip；最終人數定向 Chrome 桌面／手機與 WebKit 390×844 共 6 pass。驗 page title、非空表單、無 Vite overlay、無 app console error、輸入／加減／清空／錯誤／玩法保值／送出 payload，以及編輯 Escape 焦點回復。Chrome 桌面／手機截圖目視無人數欄位重疊。
- `npm run test:local` API 3 pass／1 fail，仍為既有探索 fixture 的 DISCOVERY_TOO_BROAD，未進 browser；未清庫、未放寬探索斷言。
- 真實本機 `supabase-chromium` 定向編輯：UI送出 12 人後，DB read-only 查核 slots_total=12、status=open、備註符合測試；但 refreshAuthoritativeState 回 false，顯示「球局狀態暫時無法重新載入」，編輯 sheet 未關閉，因此此項 fail，未完成後續詳情驗證。這是儲存後 refresh 失敗的證據，不把完整旅程標為通過；與同環境探索資料量阻礙一併待查。
- 過程中修正 migration 首次未套用時的 SQL 結尾語法、pgTAP immediate constraints 的 fixture 設定、CSS 同步及 React 錯誤狀態，最終相關驗證已通過。編輯既有測試由「切換打法強制變 3」改為核可的保留原值。
- 日誌 `/tmp/qiuka-capacity-{db,all-unit,lint,format,build,bundle,local,browser,focused-browser,focused-local}.log`；截圖 `/tmp/qiuka-capacity-{create,edit}-{desktop-chromium,mobile-chromium,mobile-webkit}.png`。皆為本機虛構資料。

實作與上述本機驗證完成；未 commit、push、Hosted migration 或部署，沒有真實產品成效。正式發布須先依既有 release checklist 發布 DB migration，再發布前端；正式雙帳號與手機實機驗收另行記錄。

## 2026-09-11 使用者核可部署

- 發布前完整 frontend gate 通過：unit 784 pass／5 skip、Chromium 390 pass／4 skip、typecheck／lint／format／build／bundle 0 exceeded；SQL 1,338 pass。前述本機整合限制仍保留，不宣稱本輪已修復。
- 正式 schema／data 備份於 `/Users/ian/tennisPartnerFinder-backups/20260911-capacity-release/`（SQL 權限0600）；首次短期登入失敗，序列重試成功。dry-run 只含本支 migration，實際 db push 成功，44/44 對齊。
- 正式缺額欄位、兩個 view 及容量 trigger 已擴為 integer；CHECK >0、create/update 不再限制3位。前後 counts 一致：profiles3／sessions5／participants5／messages3／reports0／outbox27／push subscriptions4；五個cron均active，匿名discovery25欄與原表／私人面拒絕權限檢查通過。
- 前端待本次 Git push 觸發 Vercel；部署後結果另記於進度。本輪不建立正式測試球局或發送訊息／通知；正式OAuth雙帳號、裝置鍵盤與真實使用成效未驗。
