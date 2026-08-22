# 台北市網球公開球局 MVP 計畫

最後更新：2026-08-03

這是目前產品、資料模型與發布決策的來源。實作細節以
`supabase/migrations/`、`supabase/tests/` 和
`docs/superpowers/specs/2026-07-27-first-public-release-functional-spec.md` 為準。

## 目標與首發範圍

解決兩件事：

- 想打球的人可在地圖上找到附近、未來、可加入的網球球局。
- 主揪可依已訂場、現場排隊或 2–3 座候選球場快速開局；成員加入後以球局群聊協調。

首發是公開 Web、**台北市網球**。球場資料目錄可保留雙北，但公開 discovery、create 和
join 只允許台北市 active court 與 active tennis sport。多運動／另一城市需有新的產品、
容量、資料品質與 RLS 決策，不是資料表有 `sport_id` 就自動開放。

不做：私人社群爬蟲、局外私訊、付款／訂場、候補、評分、教練媒合、原生 App、Realtime。

## 已確認的使用者流程

```text
地圖（初始不索取定位）
  → 收合的附近球局抽屜
  → 球局詳情
  → Google 登入／依動作補齊 nickname、ntrp 或 directory gate
  → 申請加入或直接加入
  → 主揪接受或婉拒（審核制）
  → accepted 成員進入球局群聊
```

- `使用我的位置` 是明確行為，位置只在記憶體中使用，約以 5 km 視野定位。
- 公開頁只顯示 session/court 必要資料，以及主揪 `host_nickname`、`host_ntrp`、
  `host_profile_complete`。
- 前端 LINE 聯絡面已退役；成員以球局群聊協調。
- My Sessions 將待處理項目放在設定之前；只有 accepted 成員可進群聊，封存後唯讀回顧。

## 資料與權限契約

| 項目 | 決策 |
| --- | --- |
| Public discovery | `session_discovery` 只含 explicit session/court fields 與三個 allowlisted host fields；沒有 profile ID、LINE、電話、email、常打球場或 roster。 |
| Profile gates | nickname＝非空暱稱；ntrp＝暱稱＋1.0–7.0 NTRP；directory＝ntrp＋至少一座台北市 active 常打球場。LINE、打法、時段皆非 gate。 |
| Venue | `booked`／`walk_on` 使用單一球場；`candidates` 保存 2–3 座有序候選球場與時間範圍，由主揪定案。 |
| Roster | host 看該局 roster；guest 只看自己與 host；兩者都沒有 LINE。 |
| Chat | `session_message_feed` 只給 host 與 accepted guest；封存局唯讀，user 訊息受雙向封鎖過濾。 |
| Retired contacts | `session_contacts` view 前端零 consumer；`profiles.line_id` 前端不讀、不寫、不渲染，但凍結的 `save_my_profile` 無預設值，`src/dataApi.js` 仍須傳 `p_line_id: null`；drop 或改簽名前須先處理該呼叫點。 |
| 名額 | `slots_total` 1–3；最後缺額接受在 DB lock 下原子完成，不能 overfill。 |
| Lifecycle | RPC 處理 create/request/review/invite/update/decide/withdraw/cancel/played/attendance/chat/block/report；失敗後 UI 重讀權威資料。 |
| 到期 | `expire-stale-tennis-sessions` 每 15 分鐘處理超齡局與逾範圍起點未定案候選局；RPC 也立即檢查。 |
| Notifications | service-only outbox＋每分鐘 dispatch；六項可調偏好、定案／取消恆送、球場訂閱廣播、開打與催定案提醒。 |
| Catalog | `data/courts.json` 是單一來源；已套用 generated migration 不可修改。 |

## 實作與本機驗證狀態

本機完成並已在本工作分支驗證：

- 台北市／網球 session schema、definer views、RLS、lifecycle RPC 與 pg_cron migration。
- 地圖優先 UI、三型建局、加入矩陣、編輯／定案、群聊／封鎖／檢舉、球場訂閱與 My Sessions。
- 2.5 秒 discovery delay、bounds debounce、keyboard dialog/focus、stale join、Google Maps
  failure fallback、兩 client 最後缺額併發。
- `VITE_SUPPORT_EMAIL` 有值時會渲染「聯絡支援」mail-to 入口；production 值仍須由部署者
  設定，不能提交預設信箱。
- 「我的球局」頁的登出（僅登入時渲染）；清理由 `setAuthState(null, null)` 既有分支處理。
- `public/privacy.html` 靜態隱私權政策頁與站內連結。
- local DB pgTAP、mock desktop/mobile、local desktop/mobile、build 與 generator check。

### 已知技術債

- `public.session_contacts` view 前端零 consumer；`profiles.line_id` 欄前端不讀、不寫、不渲染，但因
  `save_my_profile` 凍結簽名且 `p_line_id` 無預設值，`src/dataApi.js` 仍必須傳 `p_line_id: null`。
  drop 欄位或修改簽名前必須先處理該呼叫點；後續資料清理須以新 migration 一併移除 view、欄位與相關測試。

hosted 的執行狀況見下方「Hosted 發布 gate（2026-07-20 執行紀錄）」，該節逐項標示已驗與
未驗；本節只代表本機驗證。

## 本機 release gate

```bash
npx supabase start
CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test
npm run test:db
npm run test:mock
npm run test:local
TENNIS_TEST_HARNESS_MODE=local npx playwright test --project=supabase-mobile-chromium
node scripts/generate-courts-seed.mjs --check
npm run build
git diff --check
```

`npm test` 與 `npm run test:local` 都不會清資料庫。只在需要乾淨 fixture 時，使用帶
`CONFIRM_LOCAL_DB_RESET=1` 的 local-only reset。

## 首次公開發布 checklist（2026-08-03 建立；2026-08-04 執行 hosted，尚未發布）

本節是 hosted 發布的人工 gate。**2026-08-04 已實際執行下列已勾選項**（migration 已套用至
hosted、Edge Function 已部署、preview 已由 git push 建置、兩帳號 QA 已完成）；未勾選項仍是
未完成，不得把本機測試通過解讀成已完成。發布本身尚未進行。

**2026-08-22 純前端 REL 執行紀錄**（arch-hardening 管線，零新 migration）：本機 release
gate 全綠（pgTAP 799、mock 266、local 42＋6＋2、build＋bundle gate）；
`supabase migration list` 25/25 local↔remote 對齊零 drift；分支 push 後 preview alias
（`...git-cla-6f302a...`）經 smoke 確認跑新版（lazy chunks、零 console 錯誤）。本節
DB／Edge Function／cron 各 [x] 項為 2026-08-04 紀錄，本次無 DB 變更故不重跑；剩餘
未勾項（穩定 preview 人工 QA、QA 資料清理）仍待負責人完成後才可把 `main` push 上
production。

- [x] 備份 hosted schema/data，記錄 profiles、sessions、participants、messages、reports、
  notification outbox 與 push subscription 的 migration 前 counts。
  2026-08-04 執行：`supabase db dump`（schema 112KB／data 48KB，存放於執行者本機）；
  preflight counts＝profiles 3、sessions 7、session_participants 10、notification_outbox 6、
  push_subscriptions 2、district_subscriptions 24（隨 007 退役）、reports 0、courts 85。
- [x] 先在乾淨 local DB 套用至 `202607270008` 並完成本頁「本機 release gate」；以
  `npx supabase migration list` 確認 remote 無 drift，再由負責人授權套用
  `202607270001`–`202607270008`。清單必須明列
  `202607270006_session_join_preview_avatar`、`202607270007_notification_rework` 與
  `202607270008_drop_legacy_profile_gate`。
  2026-08-04 執行：`supabase db push` 套用八個 migration，事後 `migration list` 21/21
  local↔remote 全對齊。
- [x] 匿名 REST 重驗 `session_discovery` 恰為 25 欄；raw sessions、participants、messages、
  blocks、candidate courts、court subscriptions、notification prefs/outbox 皆無旁路；
  `session_join_preview` 只允許 authenticated。
  2026-08-04 執行：25 欄明確 select 回 200；`select=line_id` 回 400（42703）；
  `session_join_preview` 與 11 個 raw 面（含 reports、player_presence）全部 401（42501）。
- [x] 重新部署 `notification-outbox-dispatch` Edge Function；確認十事件標題與五欄摘要
  allowlist，訊息本文、LINE 與 subscription key 不進 payload 或 log。
  2026-08-04 執行：`supabase functions deploy` 完成；十事件標題與 payload allowlist 由
  `tests/notification-dispatch.test.js` 與本機 dispatch proof 覆蓋。
- [x] 確認四個 cron：`dispatch-notification-outbox` 每分鐘、`enqueue-session-reminders` 每
  5 分鐘、`expire-stale-tennis-sessions` 每 15 分鐘、`purge-archived-session-messages`
  每日 03:30。
  2026-08-04 於 hosted 查證四個 job 皆存在且 `active=true`、排程與上列一致。
  **reminder 冪等改以 local pgTAP 為準**（`supabase/tests/notification_rework.sql` 第二輪掃描
  0 新列、partial unique index 觸發 23505）；刻意不在 production 造 controlled fixture，
  理由同保存政策項。
- [x] 以至少兩個 Google 帳號走完三型建局、候選定案、approval／instant 加入、編輯／取消；
  accepted 前看不到群聊，accepted 後 host 發言 guest 收到、guest 回覆 host 收到，封存後歷史
  可讀但送訊得到 `SESSION_ARCHIVED`。另驗 HTML 文字轉義與群訊推播不含本文。
  2026-08-04 執行：三型建局、候選局雙虛線釘→定案收斂單一實心釘、編輯缺額、approval 申請→
  主揪核准、instant 直接加入、群聊雙向收發、封存唯讀、加入前名單、LINE 過渡揭露、
  六個通知偏好與球場訂閱皆通過；注入 `<img onerror>` 以純文字呈現且未觸發；console 零錯誤；
  推播由執行者於裝置實際收到。**未逐一重跑「取消球局」**（既有 QA 局保留給執行者清理時驗證）。
- [x] 群聊治理：雙向封鎖後 user 訊息互不可見、system 訊息仍可見；join／invite 的中性封鎖
  結果不揭露關係；單則訊息檢舉可建立。`reports.status` 尚無產品工作流，人工處理責任與存取者
  必須在發布前由負責人記錄，不得宣稱已自動化。
  2026-08-04 執行：主揪於群聊封鎖 guest 後該 guest 的 user 訊息即從 feed 消失、系統訊息仍在，
  封鎖清單出現該人並可解封、解封後清單歸零。**單則訊息檢舉未於 hosted 實際送出**
  （避免在 production 留下無法結案的 `open` 檢舉，見下方人工流程）；檢舉入口與
  `MESSAGE_NOT_VISIBLE` 契約由 local e2e 與 pgTAP 覆蓋。

  **檢舉人工處理流程（2026-08-04 記錄，首發版本）**

  - 負責人與唯一存取者：專案擁有者（`ian`）。無其他人可讀 `reports`。
  - 頻率：每週一次，由擁有者以 AI 輔助拉取整份檢舉資料後逐筆人工確認。
  - 存取方式：Supabase Dashboard／服務端查詢 `public.reports`（含 `message_id` 關聯訊息）。
    `reports` 對 browser role 無讀取權限，前端沒有也不得新增後台頁面。
  - 處置手段（第一版皆為人工，無自動化）：直接於資料庫調整球局狀態、必要時停用該帳號；
    `reports.status` 目前無任何 RPC 可改，維持 `open` 不影響處置，僅代表未結案。
  - 副作用備忘：`open` 狀態的檢舉會使關聯訊息豁免 90 天 purge，直到人工結案。
    結案機制屬後續版本，不得在文件或 UI 宣稱已自動化。
- [x] 保存政策：90 天 purge 與「有 report 關聯的訊息保留」**以 local pgTAP 為準**
  （`supabase/tests/session_chat.sql` 的 purge 斷言；hosted schema 與 local 同源，
  `purge-archived-session-messages` cron 每日 03:30 已於 hosted 確認 active）。
  **刻意不在 production 造 controlled fixture**：需寫入測試訊息與竄改 `archived_at`，
  失敗會殘留半套資料，風險大於驗證價值。首批真實球局封存滿 90 天前，
  若要提前驗證，應在 local 或另建 staging 專案執行。
  90 天目前是暫訂值，變更必須同步隱私政策與 migration。
- [x] 退役聯絡面技術債：確認新註冊不蒐集 LINE、`session_contacts` view 前端零 consumer，且
  `profiles.line_id` 前端不讀、不寫、不渲染；凍結的 `save_my_profile` 因 `p_line_id` 無預設值，
  `src/dataApi.js` 仍須傳 `p_line_id: null`。drop 欄位或改簽名前先處理該呼叫點，再做備份、count
  preflight 與新 migration，不手改已凍結 migration。
  2026-08-22 前端側查證（arch 管線終驗，見 `docs/arch-reports/final-verdict-2026-08-21.md`）：
  LINE 聯絡面於 `src/` 零讀寫渲染（`lineProviderId` 僅登入 provider id）、`p_line_id: null`
  保留於 `src/data/` repository、隱私掃描測試含補償斷言全綠。欄位 drop 與 migration 仍未做，
  維持凍結。
- [ ] 穩定 preview 人工 QA：OAuth、Maps referrer、390px 慢網路、鍵盤焦點、支援／隱私連結、
  console/pageerror、球場訂閱可涵蓋全部台北市 active 球場與六個通知偏好。
  2026-08-04 部分完成：於 preview alias（`...-git-cla-6f302a-...`）確認 OAuth 兩帳號登入、
  Maps 正常載入、console/pageerror 零、球場訂閱多選與六個通知偏好可存檔。
  **仍未做**：390px 實機慢網路、鍵盤焦點走查、支援／隱私連結實際點開檢視。
- [ ] 清除 QA 球局、訊息、profile/auth fixtures；確認匿名 discovery 無 QA 資料後，才由負責人
  決定 release 發布與社群分享時機。

## Hosted 發布 gate（2026-07-20 執行紀錄）

首次 hosted 發布 gate 於 2026-07-20 執行。完整逐項輸出留存在執行者本機的
`~/tennisPartnerFinder-backups/20260720-143340/`（schema 與資料備份、gate-status.md）。
以下標記僅代表**該次實測**；未實際執行的子項一律標為未完成，不得因整關通過而視為已驗。
這些歷史結果不能替代上方 2026-08-03 首次公開發布 checklist。

1. **備份與差異**：**完成**。`supabase db dump` 取得 schema 與資料備份；migration 前
   筆數 courts 85、profiles 1、partner_requests 1、reports 2。本機 gate 全綠。
2. **Migration**：**完成**。push 前 remote 僅有 `202607020001`、`202607080001`；套用
   `202607170001`–`202607170004` 後六個 stamp 全數 local 與 remote 相符。
3. **匿名安全**：**完成**。匿名 REST 實測：`session_discovery` 記載的 19 欄逐欄探測皆
   回 200，10 個敏感欄位（`line_id`、`host_id`、email、電話等）逐欄探測皆回 400 不存在。
   逐欄探測只證明這些欄位存在與不存在，「恰好是這 19 欄、不多不少」由本機
   `supabase/tests/session_rls.sql:269-277` 的完整有序比對保證。raw `sessions`、
   `session_participants`、`profiles`、`sports` 與 `session_contacts`、
   `session_participant_roster`、`my_session_participations`、`my_profile` 全數 401；
   `partner_requests`、`legacy_partner_requests`、`public_profile_discovery` 全數 404；
   八個 lifecycle RPC（`create_session`、`request_to_join_session`、
   `review_join_request`、`withdraw_from_session`、`cancel_session`、
   `mark_session_played`、`confirm_session_attendance`、`create_report`）以正確簽名
   呼叫皆回 401。
4. **兩帳號資料邊界**：**完成（一項限制）**。兩個 Google 帳號實測：accept 前雙方
   `session_contacts` 皆 0 筆且主揪 LINE 字串未出現於任何回應；accept 後雙方各 1 筆且
   精確為對方；roster 全程無 `line_id`；guest 直接讀 raw table 得 403。
   **未驗**：host 有多位 guest 時彼此不可互看——該次測試缺額為 1，僅有單一 guest。
   此項目前由 `supabase/tests/session_rls.sql` 與 `session_contacts` 的 host↔guest
   配對條件保證，尚未在 hosted 以三帳號實測。
5. **到期**：**部分完成**。`expire-stale-tennis-sessions` job 存在、`*/15 * * * *`、
   `active=true`。**未驗**：hosted 的 controlled stale-session check 與 RPC 拒絕 stale
   state（本機 pgTAP 已覆蓋）。
6. **穩定 preview 手動 QA**：**部分完成**。已驗：Google OAuth callback（四次往返皆導回
   穩定網址）、Maps referrer、drawer 空狀態、create／join／review 的 accept 分支／
   accepted-only contact 顯示、支援與隱私連結、console 無 error。
   **未驗**：review 的婉拒（decline）分支、初始無定位 prompt 與位置成功／拒絕分支、
   約 5 km 視野、cancel/played/report、390px 慢網路 3 秒可用性、hosted 鍵盤焦點
   （末四項本機 E2E 已覆蓋，但未在 hosted 重跑）。
7. **公開資訊**：**完成**。production `VITE_SUPPORT_EMAIL` 已設定，實測渲染
   `mailto:` 正確；`/privacy.html` 已上線並經負責人審核。政策內容以兩個 subagent
   對照 migration 與 `src/` 逐條查核，並據此補正六處揭露不足。
8. **資料清理與發布**：**技術面完成**。QA 球局與 QA profile 已刪除、QA auth 帳號已移除、
   hosted email signup 已關閉（`/auth/v1/signup` 回 `email_provider_disabled`）；
   匿名 discovery 為 0 筆。**社群分享連結尚未執行**，由負責人決定時機。

發布前若要補齊上述「未驗」項目，需再跑一次對應子項並更新本節，不可沿用本次紀錄。

## Hosted migration 執行紀錄（2026-07-22：join_mode＋球友層）

`202607210001_session_join_mode`、`202607210002_player_directory_invites` 於
2026-07-22 套用至 hosted（負責人授權並親自執行 `supabase db push`）。備份與逐項輸出
留存於 `~/tennisPartnerFinder-backups/20260722-153251/`。

1. **備份與 count preflight**：**完成**。schema 與 data dump；migration 前筆數
   courts 85、profiles 1、legacy_partner_requests 1、legacy_reports 2，與 2026-07-20
   基線一致；sessions／session_participants 0 筆。
2. **Migration list 對齊**：**完成**。套用前 remote 六個 stamp 無 drift；套用後八個
   stamp local 與 remote 全數相符。
3. **匿名安全（本次增量面）**：**完成**。匿名 REST 實測：`session_discovery` 的
   `join_mode` 欄回 200；`line_id` 探測回 400（42703 不存在）；`player_directory`
   回 401（42501 permission denied）；`set_player_visibility`、`invite_to_session`、
   `respond_to_session_invite` 三個新 RPC 匿名呼叫皆回 401（42501）。
4. **兩帳號 hosted 旅程**：**完成**。同日以兩個 Google 帳號在 preview 穩定別名實測
   （帳號 B 為新註冊的 QA 帳號，暱稱 QA測試B、LINE 為測試字串 `qa-test-b`）：

   - 球友目錄：B 完成檔案後可讀 `player_directory` 並在地圖看到已 opt-in 的 A；
     B 自己未 opt-in 故不在目錄中（opt-out 預設正確）。球友卡欄位為暱稱、NTRP、
     打法、時段、常打球場，**無 LINE**。
   - opt-in 下架：A 關閉球友卡後，同一 viewer 重載圖層即回空列表、pin 消失；重新
     開啟後恢復。
   - 邀請旅程：B 邀請 A → A 的「需要你處理」出現邀請卡（不含 LINE）→ A 接受 →
     缺額 1 歸零並自動轉 `full` → 雙方各自看到對方 LINE（A 看到 `qa-test-b`、
     B 看到 A 的 LINE）。重複邀請被擋（`ALREADY_INVITED`）；`invited` 期間不佔缺額。
   - instant join：A 建「直接加入」局，詳情顯示 badge 與「直接加入」CTA，確認 dialog
     揭露「加入後你與主揪即可互相看到 LINE ID」；B 直接加入後立即成局並互看 LINE，
     全程無審核步驟。
   - 生命週期與隱私連動：B 退出後、主揪取消球局後，對方卡片的聯絡方式區塊都不再
     渲染，LINE 不再揭露。
   - 前端：390px 與桌面佈局、圖層 toggle、未登入 gate 皆正常；全程無 `console.error`
     或 `pageerror`。

5. **資料清理**：**完成**。兩個 QA 球局皆已取消／退出，套用後匿名 `session_discovery`
   實測回 0 筆（`content-range: */0`）。**殘留**：QA 帳號 B 的 auth user 與 profile
   尚未刪除（需 service_role 或 Dashboard，未授權自動執行）；該帳號未 opt-in，
   不會出現在球友目錄。

6. **未驗（本次未執行）**：cron 對新增球局的到期驗證（本機 pgTAP 已覆蓋）。

本計畫不授權自動 deployment、hosted DB reset、環境變數寫入、migration push 或社群發文。

## Hosted migration 執行紀錄（2026-08-07：訂閱上限＋信任數字）

`202608050001_court_subscription_limit` 與 `202608060001_trust_counts` 的 hosted 狀態。
備份與 preflight 留存於 `~/tennisPartnerFinder-backups/20260807-110130/`（`preflight.md` 含完整表格）。

**補記**：`202608050001`（球場訂閱上限改為「當下台北市 active 球場總數」）先前已套用至 hosted
但未在本頁留下紀錄；2026-08-07 的 `migration list` 顯示它 local↔remote 已對齊，於此補登。

`202608060001` 於 2026-08-07 套用（負責人授權並親自執行 `supabase db push`）。

1. **備份與 count preflight**：**完成**。`supabase db dump` 取得 schema 152K／data 48K→58K；
   migration 前筆數 profiles 3、sessions 13、session_participants 22、session_messages 12、
   notification_outbox 26、push_subscriptions 3、court_subscriptions 54、courts 85、reports 0、
   player_blocks 0、player_presence 0。計數以 `courts 85` 與 `profiles 3` 兩個錨點對 2026-08-04
   基線交叉驗證一致。
2. **Migration list 對齊**：**完成**。套用前 22/22 對齊、`202608060001` 為唯一 pending；
   套用後 **23/23 全數相符、零 pending**。
3. **匿名安全（本次增量面）**：**完成**。匿名 REST 實測：
   - `session_discovery` `select=*` 回傳**恰 25 欄且與 allowlist 逐欄同序**；明列 25 欄 select 回 200。
   - `session_discovery?select=hosted_played_count` 與 `select=played_count` 皆回 400（42703 不存在）
     ——兩個新欄位**未外洩到匿名面**。
   - `session_join_preview`、`player_directory` 皆回 401（42501 permission denied）。
   - 12 個 raw 面（`sessions`、`profiles`、`session_participants`、`session_messages`、
     `player_blocks`、`player_presence`、`notification_outbox`、`push_subscriptions`、
     `court_subscriptions`、`notification_prefs`、`reports`、`session_candidate_courts`）
     全部 401。
4. **本機 gate（套用前，PM 親跑）**：`db 774 PASS／unit 206／mock 175+3／local 33+8／mobile 4／
   build 67 modules`；seed `--check` 綠；`git diff --check` exit 0。canary 三拍獨立重跑：
   存量 774 綠 → 匿名面注入一欄後 test 42、409 精確指名且其餘 470 全過 → 重置後 774 綠、
   `session_discovery` 回 25 欄、零殘留。
5. **回退方式**：本 migration 零資料變更；回退＝重新套用三個物件的既有定義
   （`202607270006:113`、`202607270001:791`、`202607270004:196`）。
6. **未做**：Edge Function 未重新部署（本 migration 不動 outbox 與 payload）；
   cron 未重新確認（不在本 migration 範圍）。

## Hosted migration 執行紀錄（2026-08-13：球場目錄 82→89）

`202608110001_courts_catalog_double_north.sql`（2026-08-11 官方來源全面查核，commit
1c99e74；查核方法與來源見 `docs/tennis-ecosystem/source-surveys-2026-08-11.md`）。
負責人授權後由 Claude 執行 `supabase db push`。

1. **備份與 count preflight**：**完成**。`umask 077` dump 至
   `~/tennisPartnerFinder-backups/20260813-courts/`；schema 160,144 bytes（SHA-256
   `a7763073…` 與 2026-08-11 preflight 完全相同＝schema 零漂移）、data 70,162 bytes。
   migration 前筆數 courts 85（錨點與 2026-08-04／08-07／08-11 三份紀錄交叉一致）、
   sports 1、profiles 3、sessions 14、session_participants 23、session_candidate_courts 5、
   session_messages 15、session_chat_read_cursors 1、reports 0、player_blocks 0、
   player_presence 0、notification_prefs 1、notification_outbox 36、push_subscriptions 3、
   court_subscriptions 107。
2. **Migration list 對齊**：**完成**。套用前 24/24 對齊、`202608110001` 為唯一 pending
   （dry-run 確認）；套用後 **25/25 全數相符、零 pending**。
3. **套用後驗證（匿名 REST，與地圖前端同讀取路徑）**：**完成**。anon 可見 courts
   恰 **89**（台北市 61＋新北市 28）；8 座新增（至善國中、新民國中、文林國小、
   北投運動中心、木柵國小、松山高中、台北教育大學、三民國中）與改名後的蘆堤網球場
   各回 1 列；5 筆停用（台師大林口、微風運河舊名、大安森林、中正網球中心、迎風河濱）
   anon 面全部 0 列。
4. **本機 gate（套用前）**：主線 merge commit `a62a11d` 上 seed `--check` 綠、
   `test:db` 799 PASS（含以 89 座斷言的 courts_catalog）。
5. **回退方式**：純資料變更（insert 9、update 80、停用 2），無 DELETE、無 schema／
   RLS／view 變更；回退＝重放 `202607170002` 回到 82 active，或以本次 dump restore。
   台北市 active 只增不減（53→61），`profile_courts` 與 `court_subscriptions` join key
   零斷鏈；訂閱上限依 `202608050001` 規則自動隨 active 總數變為 61。
6. **未做**：Edge Function 與 cron 不在本 migration 範圍；線上地圖 8 個新圖釘的
   人工目視確認留待負責人。

## 首兩週的社群與指標

### 分發管道與文案（2026-08-04 拍板）

已核可管道只有三處：Threads 發文、LINE openchat 公開揪球群、FB 網球社團。

文案以**主揪**為目標受眾——名額管理、程度篩選與開打提醒的自動化對主揪才是淨增益；
對已經在群裡「喊 +1」的球友來說，改用新平台的邊際價值很薄。球友端交給主揪把
`#/session/:id` 深連結帶回原本的群裡，讓社群成為分發面而不是競爭面。
每篇貼文連到具體球局深連結而非首頁。貼文可以帶 `?s=` 參數，但要知道它在目前方案的
Dashboard 上看不到（限制見下方檢核點），管道分辨實際上靠的是 referrer。
文案要清楚說明「三型開局／申請或直接加入／accepted 後進群聊」；產品內聯絡一律使用群聊。

不要由私人群組匯入貼文，也不要拿 QA 假資料填滿地圖。
**也不得把第三方在社群發的揪球貼文代建成球局**：代建的球局沒有真正的主揪，
申請沒有人能審核會直接死鎖，instant 局更會讓加入者誤以為已經成局；
這同時違反「不轉貼私人 LINE／Facebook 社群內容」的產品邊界。
要從社群取得供給只有一條路——找到正在揪球的人，請他**本人**建局。

**種子供給：待定（發布前必須補上）。** 發布日匿名 discovery 必然是 0 筆。
目前尚未決定用哪種方式讓首屏有真實球局，候選方案：創辦人自行開 1–2 場真實球局、
一對一招募 pilot 主揪、或先以球場訂閱蓄水等供給出現再回收。
這一段沒有定案就發布，首波社群注意力會落在空地圖與登入牆上。

每週用有權限的安全查詢彙整：

| 漏斗 | 最小指標 |
| --- | --- |
| 進站與啟用 | 實際使用者數、nickname／ntrp／directory gate 各層人數 |
| 供給 | booked／walk_on／candidates 建局數、候選定案率、未來 open session 數 |
| 配對 | approval requests、instant joins、accepted joins、accept rate |
| 群聊與治理 | 有訊息的 accepted 球局數、發訊成員數、封鎖數、訊息檢舉數、封存後 purge／保留數 |
| 通知 | 開啟 push 人數、球場訂閱人數、各事件 enqueue／sent／attempts、失效 endpoint 數 |
| 結果 | played reports、出席確認、取消／退出原因 |

首兩週不以未定義的單一轉換率宣告成功；每週保留上述原始 counts 與分母，先辨識最大漏斗落差，
只選一個有證據的摩擦點改進，例如建局型別、抽屜發現、登入恢復、加入審核、群聊或通知。
樣本不足或安全／治理 gate 未完成時，不擴張城市或功能。

### 第 4 週檢核點（量化門檻，2026-08-04 定稿）

沿用既有 MVP 設計的門檻：**20 位真實使用者、8 個真實球局、3 次成功加入、至少 1 次回報打成**。
這是判讀方向的 KPI，不是延後上線的門檻。

未達成時的動作（預先承諾，避免無限期「再觀察一週」）：

- 停止新增功能，把時間全部投入分發實驗；或
- 把範圍收斂到單一 pilot 球場，先在一個點做出看得見的成局密度。

成局率的分型判讀（booked／walk_on／candidates）需各型至少 3 筆才做；樣本不足時只記錄原始
counts，不做比率結論。「進站」層的分母來自 Vercel Analytics 的 pageview 與 referrer；註冊之後的
行為才來自資料庫查詢——兩者分母不同，判讀時不可混用。

程式已接上（production-only 動態載入），但**要先在 Vercel Dashboard 啟用 Analytics 並重新以
Git deployment 建置，才會開始收集**；在那之前進站層沒有任何資料。

已知限制（2026-08-04 依官方文件查證，寫在這裡以免把量不到的東西當成指標）：

- Hobby 方案 Dashboard 的 Pages 維度**排除 query string**，`?s=` 送得出去但看不到；
  依 UTM 分組需要 Web Analytics Plus 以上方案。
- URL hash 會隨初次 pageview 送出，但官方未承諾保存或在 Dashboard 呈現，
  因此 `#/session/:id` 深連結**不能**當作分析維度。
- 所以現階段可回答的是「總進站量」與「來源平台（referrer）」；**無法**回答
  「同一個平台上哪一篇貼文有效」。要做到後者需升級方案或改用其他 analytics。
- Hobby 每月含 50,000 events，超額後暫停收集。

## 球場生態研究（非上線前置）

了解台北網球生態有助於選擇初期分發與球場引導，但不應延後安全、生命週期與 hosted QA。
使用 `docs/tennis-ecosystem/README.md` 的 15 張官方來源卡，記錄訂場方式、可驗證空檔與
固定活動／課程。禁止抓取私人群組，或把未被官方來源佐證的俱樂部佔場說法寫成事實。
