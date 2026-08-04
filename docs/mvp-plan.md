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
  → accepted 成員進入球局群聊；選填 LINE 過渡面並存
```

- `使用我的位置` 是明確行為，位置只在記憶體中使用，約以 5 km 視野定位。
- 公開頁只顯示 session/court 必要資料，以及主揪 `host_nickname`、`host_ntrp`、
  `host_profile_complete`。
- LINE 選填且不是 profile gate；`session_contacts` 只作 accepted host ↔ guest 過渡 secret。
- My Sessions 將待處理項目放在設定之前；只有 accepted 成員可進群聊，封存後唯讀回顧。

## 資料與權限契約

| 項目 | 決策 |
| --- | --- |
| Public discovery | `session_discovery` 只含 explicit session/court fields 與三個 allowlisted host fields；沒有 profile ID、LINE、電話、email、常打球場或 roster。 |
| Profile gates | nickname＝非空暱稱；ntrp＝暱稱＋1.0–7.0 NTRP；directory＝ntrp＋至少一座台北市 active 常打球場。LINE、打法、時段皆非 gate。 |
| Venue | `booked`／`walk_on` 使用單一球場；`candidates` 保存 2–3 座有序候選球場與時間範圍，由主揪定案。 |
| Roster | host 看該局 roster；guest 只看自己與 host；兩者都沒有 LINE。 |
| Chat | `session_message_feed` 只給 host 與 accepted guest；封存局唯讀，user 訊息受雙向封鎖過濾。 |
| Contacts | `session_contacts` 過渡保留選填 LINE，只給 accepted host/guest；host 可看各 accepted guest，guest 只看 host。 |
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

## 首次公開發布 checklist（2026-08-03，尚未執行 hosted）

本節是下一次 hosted 發布的人工 gate；目前全部是**未完成**，不得把下方步驟或本機測試通過
解讀成 hosted 已套用、已部署或已發布。

- [ ] 備份 hosted schema/data，記錄 profiles、sessions、participants、messages、reports、
  notification outbox 與 push subscription 的 migration 前 counts。
- [ ] 先在乾淨 local DB 套用至 `202607270008` 並完成本頁「本機 release gate」；以
  `npx supabase migration list` 確認 remote 無 drift，再由負責人授權套用
  `202607270001`–`202607270008`。清單必須明列
  `202607270006_session_join_preview_avatar`、`202607270007_notification_rework` 與
  `202607270008_drop_legacy_profile_gate`。
- [ ] 匿名 REST 重驗 `session_discovery` 恰為 25 欄；raw sessions、participants、messages、
  blocks、candidate courts、court subscriptions、notification prefs/outbox 皆無旁路；
  `session_join_preview` 只允許 authenticated。
- [ ] 重新部署 `notification-outbox-dispatch` Edge Function；確認十事件標題與五欄摘要
  allowlist，訊息本文、LINE 與 subscription key 不進 payload 或 log。
- [ ] 確認四個 cron：`dispatch-notification-outbox` 每分鐘、`enqueue-session-reminders` 每
  5 分鐘、`expire-stale-tennis-sessions` 每 15 分鐘、`purge-archived-session-messages`
  每日 03:30，並以 controlled fixture 驗 session reminder 與 decide reminder 只 enqueue 一次。
- [ ] 以至少兩個 Google 帳號走完三型建局、候選定案、approval／instant 加入、編輯／取消；
  accepted 前看不到群聊，accepted 後 host 發言 guest 收到、guest 回覆 host 收到，封存後歷史
  可讀但送訊得到 `SESSION_ARCHIVED`。另驗 HTML 文字轉義與群訊推播不含本文。
- [ ] 群聊治理：雙向封鎖後 user 訊息互不可見、system 訊息仍可見；join／invite 的中性封鎖
  結果不揭露關係；單則訊息檢舉可建立。`reports.status` 尚無產品工作流，人工處理責任與存取者
  必須在發布前由負責人記錄，不得宣稱已自動化。

  **檢舉人工處理流程（2026-08-04 記錄，首發版本）**

  - 負責人與唯一存取者：專案擁有者（`ian`）。無其他人可讀 `reports`。
  - 頻率：每週一次，由擁有者以 AI 輔助拉取整份檢舉資料後逐筆人工確認。
  - 存取方式：Supabase Dashboard／服務端查詢 `public.reports`（含 `message_id` 關聯訊息）。
    `reports` 對 browser role 無讀取權限，前端沒有也不得新增後台頁面。
  - 處置手段（第一版皆為人工，無自動化）：直接於資料庫調整球局狀態、必要時停用該帳號；
    `reports.status` 目前無任何 RPC 可改，維持 `open` 不影響處置，僅代表未結案。
  - 副作用備忘：`open` 狀態的檢舉會使關聯訊息豁免 90 天 purge，直到人工結案。
    結案機制屬後續版本，不得在文件或 UI 宣稱已自動化。
- [ ] 保存政策：以 controlled archived session 驗 90 天 purge；有 report 關聯的訊息保留。
  90 天目前是暫訂值，變更必須同步隱私政策與 migration。
- [ ] LINE 存量檢查：新註冊以 nickname-only 可存檔、LINE 選填；若存量 accepted pair 有 LINE，
  `session_contacts` 仍只揭露 host ↔ guest，guest 彼此不可見。這是過渡相容檢查，不再是主旅程。
- [ ] 穩定 preview 人工 QA：OAuth、Maps referrer、390px 慢網路、鍵盤焦點、支援／隱私連結、
  console/pageerror、球場訂閱最多 10 座與六個通知偏好。
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

## 首兩週的社群與指標

先只在已核可的台北網球社群發布，文案要清楚說明「三型開局／申請或直接加入／accepted 後進群聊」；
LINE 僅是選填的過渡聯絡方式。
不要由私人群組匯入貼文，也不要拿 QA 假資料填滿地圖。

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

## 球場生態研究（非上線前置）

了解台北網球生態有助於選擇初期分發與球場引導，但不應延後安全、生命週期與 hosted QA。
使用 `docs/tennis-ecosystem/README.md` 的 15 張官方來源卡，記錄訂場方式、可驗證空檔與
固定活動／課程。禁止抓取私人群組，或把未被官方來源佐證的俱樂部佔場說法寫成事實。
