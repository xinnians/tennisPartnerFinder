# 首次公開發布實作計畫(First Public Release)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **本專案實際執行模式**:各 Stage 由 Codex 依「派工 prompt」執行,主對話以 fresh read-back agent 驗收,驗收通過才釋出下一個 Stage 的 prompt(同 2026-07-23 C/D/E 管線)。

**Goal:** 依 `docs/superpowers/specs/2026-07-27-first-public-release-functional-spec.md`(下稱 SPEC)完成三型場地、門檻矩陣、球局編輯/定案、球局群聊、球場訂閱通知與文件收尾,達到首次社群發布狀態。

**Architecture:** 六個依序堆疊的 Stage:資料模型 → 球局流程 RPC → 群聊 → UI → 通知重排 → 文件與測試收尾。所有瀏覽器讀寫維持 `src/dataApi.js` 的 view/RPC 唯一邊界(群聊採輪詢式,SPEC「讀寫通道」節);推播沿用 outbox + pg_cron + Edge Function 派送鏈。

**Tech Stack:** Vite 6 原生 ES modules(無框架/無 TS)、Supabase(RLS + security definer views/RPC、pg_cron、pgTAP)、Web Push(VAPID)。

## Global Constraints(每個 Task 隱含適用)

- Migration stamp 線性遞增:本計畫使用 `202607270001` 起;已套用的 migration 不可手改。
- pgTAP **先紅後綠**;gate 類測試必須「存量綠 → canary 違規紅 → 移除 canary 綠」三拍證明有牙;掃描式測試 assert 掃描集非空。
- raw tables 不是 browser API;前端只經 `src/dataApi.js` 的 view/RPC。
- push payload allowlist 只有 `court`/`message`/`slots_remaining`/`start_at`/`url`(+派送端合成 title);**訊息本文與 LINE 永不進 payload/outbox/log**。
- `innerHTML` 動態內容一律 `esc()`;UI 文案繁體台灣用語,術語沿 SPEC 術語節(主揪/直接加入/審核加入/候選局)。
- 測試指令:`npm test`(=test:mock,不重置 DB)、`npm run test:db`、`npm run test:local`;重置本機 DB 唯一入口 `CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test`。
- 部署一律 git push 觸發 Vercel;push 由使用者執行。
- 每個 Task 完成即 commit(精確路徑 stage,不用 `-A`)。

## 派工與驗收合約(每個 Stage 的 Codex prompt 都含)

- **三件套**:目標與動機、可觀察可證偽的驗收條件、回報格式。
- **回報合約**:只回結論+`檔案:行號`;紅綠證據貼測試名與輸出摘要;禁貼整檔;宣稱的每個修改點附該行原文一句(防偽)。
- **驗收**:主對話派 fresh agent 重跑測試、盤點 diff 與宣稱 commit 一致、抽驗 gate 三拍證據,通過才進下一 Stage。

---

## Stage 1:資料模型(venue_type、候選表、門檻矩陣、球場訂閱)

**Files:**
- Create: `supabase/migrations/202607270001_venue_types_profile_gates.sql`
- Modify: `supabase/tests/session_rls.sql`、`supabase/tests/player_presence_rls.sql`(門檻與 allowlist 契約;repo 無 player_visibility_rls.sql,可見性測試在 presence 檔內)
- Modify: `src/dataApi.js`(discovery mapper 新欄位、save_my_profile 參數鬆綁、球場訂閱讀寫)

**Interfaces(後續 Stage 依賴):**
- `public.sessions` 新欄位:`venue_type text not null default 'booked' check (venue_type in ('booked','walk_on','candidates'))`、`range_end timestamptz`、`decided_at timestamptz`,並附 shape 約束:

```sql
alter table public.sessions
  add constraint sessions_venue_time_shape check (
    (venue_type = 'candidates' and range_end is not null and range_end > start_at)
    or (venue_type in ('booked','walk_on') and range_end is null and decided_at is null)
  );
```

  時間語義:`start_at`=固定開始(booked)/集合時間(walk_on)/**可打時間範圍起點**(candidates);`range_end`=範圍終點(僅 candidates);`decided_at`=定案時刻(僅 candidates,未定案為 null)。
- 新表:

```sql
create table public.session_candidate_courts (
  session_id bigint not null references public.sessions(id) on delete cascade,
  court_id bigint not null references public.courts(id),
  position smallint not null check (position between 1 and 3),
  primary key (session_id, court_id),
  unique (session_id, position)
);

create table public.court_subscriptions (
  profile_id bigint not null references public.profiles(id) on delete cascade,
  court_id bigint not null references public.courts(id),
  created_at timestamptz not null default now(),
  primary key (profile_id, court_id)
);
```

  兩表 RLS:candidate courts 隨 discovery 面讀(見下)、不開 browser 寫;court_subscriptions owner-only select,寫入走 RPC。
- 門檻矩陣函式(取代單一 `private.require_complete_profile()`,舊函式保留但不再被呼叫,Stage 6 移除):

```sql
create function private.require_profile_gate(p_level text) returns bigint
-- p_level: 'nickname' | 'ntrp'(=暱稱+NTRP) | 'directory'(=暱稱+NTRP+至少一台北市 active 常打球場)
-- 回傳 profile_id;不足時 raise exception 'PROFILE_INCOMPLETE'
```

  六個現行呼叫點改接:`create_session`→`'ntrp'`、`request_to_join_session`→`'nickname'`、`invite_to_session`→`'ntrp'`、`set_player_visibility`→`'directory'`、`set_presence_sharing`/`set_open_to_greeting`/`update_my_presence`→`'ntrp'`。
- `save_my_profile`:必填只剩暱稱;`line_id`/`ntrp`/`play_types`/`slot_codes`/常打球場全改選填(空值不再丟 `PROFILE_INCOMPLETE`);不動 `is_public`/`open_to_greeting`/`share_presence`(既有回歸保護)。
- `public.session_discovery` **一次性改版**:既有 20 欄之後追加 `venue_type`、`range_end`、`candidate_court_ids bigint[]`(依 position 排序;非候選局為 null)→ **23 欄有序 allowlist**;`host_profile_complete` 語義改為「暱稱+NTRP 已填」。`my_session_participations` 同步補 `venue_type`/`range_end`/`decided_at`。
- 新 RPC:`set_court_subscriptions(p_court_ids bigint[])`——整組覆寫,上限為當下台北市 active 球場總數,須為台北市 active 球場。

**Tasks:**

- [ ] **T1.1 紅**:pgTAP 加「23 欄 allowlist 完整字串比對」「暱稱-only profile 可 join 不可 create(`PROFILE_INCOMPLETE`)」「暱稱+NTRP 可 create」「directory opt-in 缺常打球場紅」「candidates 局缺 range_end 被 shape 約束擋下」「court_subscriptions 匿名零權限、他人列不可見(非空斷言:本人列 ≥1)」→ 跑 `npm run test:db` 確認**紅**。
- [ ] **T1.2 綠**:寫 migration 202607270001(上述全部 DDL+函式+view 重建+grant/revoke)→ `npm run test:db` 全綠。
- [ ] **T1.3 三拍**:canary(例:暫時把 create_session 的 gate 降為 `'nickname'`)→ 對應測試紅 → 還原綠;回報三拍輸出。
- [ ] **T1.4**:`src/dataApi.js` mapper 補 `venue_type`/`range_end`/`candidate_court_ids`;`saveMyProfile` 參數鬆綁;`loadCourtSubscriptions`/`saveCourtSubscriptions`;unit 測試(tests/ 對應檔)紅→綠。
- [ ] **T1.5**:`npm test` 全綠;commit(訊息 `feat: venue types, profile gate matrix, court subscriptions`)。

**驗收條件(可證偽):**
1. `test:db` 全綠且含上述新斷言;三拍證據齊(貼測試名+紅綠輸出)。
2. 反向 grep:`require_complete_profile` 在**現行有效** RPC 定義中零呼叫(歷史定義除外)。
3. 匿名 REST 探測:`session_discovery` 回 23 欄;`court_subscriptions`/`session_candidate_courts` 匿名不可讀寫。
4. 既存兩型球局(現行資料)在新 schema 下 `venue_type='booked'` 預設成立、discovery 不掉列(存量非空斷言)。

---

## Stage 2:球局流程 RPC(建立三型、加入矩陣、編輯、定案、過期)

**Files:**
- Create: `supabase/migrations/202607270002_session_flow_rpcs.sql`
- Modify: `supabase/tests/session_rls.sql`
- Modify: `src/dataApi.js`(create 參數、joinSession 回傳碼、updateSession、decideSessionCourt)

**Interfaces:**
- `create_session` 新參數:`p_venue_type text default 'booked'`、`p_candidate_court_ids bigint[] default null`、`p_range_end timestamptz default null`。驗證矩陣:booked/walk_on 須單一 `p_court_id`、禁候選參數;candidates 須候選 2~3 個台北市 active 球場、`range_end > start_at`、`court_id`=position 1 候選(代表列,**候選表為權威**)。建局成功 → best-effort 寫 `court_new_session` outbox 給**訂閱任一相關球場**者(candidates=各候選球場訂閱者聯集去重;payload `court`=命中訂閱的那個球場、`start_at`=範圍起點);outbox `event_type` CHECK 同步擴充。
- `request_to_join_session` 加入矩陣(SPEC 加入規則表):instant+NTRP 在範圍內→`ACCEPTED`;instant+NTRP 未填→建立 requested、回 `OK_NTRP_MISSING`;instant+範圍外→requested、回 `OK_NTRP_OUT_OF_RANGE`;approval→requested、回 `OK`。窗口:candidates 未定案至 `start_at`(範圍起點)止;其餘沿現行 `start_at+2h`。
- 新 RPC `update_session(p_session_id, p_start_at, p_court_id, p_slots_missing, p_ntrp_min, p_ntrp_max, p_play_type, p_fee_note, p_note)`:主揪限定、status open/full、窗口內;**不可改** `venue_type`/`join_mode`;`p_court_id` 僅同型內更換(candidates 未定案不可由此改 court);缺額不得低於已 accepted 數(沿用既有 trigger);變更 → `session_updated` outbox 給 accepted 參加者。
- 新 RPC `decide_session_court(p_session_id, p_court_id, p_start_at)`:candidates 且未定案限定;`p_court_id` 必在候選表;`p_start_at` 落在 [原 start_at, range_end];寫入 `court_id`/`start_at`/`decided_at=now()` → `session_decided` outbox(恆送)。
- 過期規則:cron 與各 lifecycle RPC 進場檢查追加「candidates 且 `decided_at is null` 且 `start_at <= now()` → expired」;逾期下架時對 accepted 參加者發 `session_updated`(message=「候選球局逾期未定案,已下架」),不新增事件型別。
- `cancel_session` → `session_cancelled` outbox(恆送)。

**Tasks:**

- [ ] **T2.1 紅**:pgTAP 新斷言——三型建局驗證矩陣(候選 1 個紅/4 個紅/非台北紅)、加入矩陣四分支回傳碼、範圍外者主揪可核准、`update_session` 禁改型/禁低於 accepted、`decide_session_court` 非候選紅/定案後再定案紅/非候選表球場紅、未定案逾起點 expire、canary。→ `test:db` 紅。
- [ ] **T2.2 綠**:migration 202607270002 實作上述;`test:db` 綠;三拍。
- [ ] **T2.3**:`dataApi.js` 對接(`createSession` 三型參數、`joinSession` 新回傳碼 mapper、`updateSession`、`decideSessionCourt`);unit 紅→綠;`npm test` 綠;commit。

**驗收條件:** 加入矩陣四分支各有紅綠測試;`court_new_session` 只進訂閱者 outbox(非訂閱者零列,斷言非空集);`session_decided`/`session_cancelled` payload 過 allowlist CHECK;窗口規則三型各一測試;editable/不可編輯欄位各至少一紅測試。

---

## Stage 3:球局群組聊天(表、RLS、RPC、封存、檢舉、封鎖)

**Files:**
- Create: `supabase/migrations/202607270003_session_chat.sql`
- Modify: `supabase/tests/session_rls.sql`(或新檔 `supabase/tests/session_chat.sql`)
- Modify: `src/dataApi.js`

**Interfaces:**

```sql
create table public.session_messages (
  id bigint generated always as identity primary key,
  session_id bigint not null references public.sessions(id) on delete cascade,
  sender_profile_id bigint references public.profiles(id),  -- null=系統訊息
  kind text not null default 'user' check (kind in ('user','system')),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table public.player_blocks (
  blocker_profile_id bigint not null references public.profiles(id) on delete cascade,
  blocked_profile_id bigint not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_profile_id, blocked_profile_id),
  check (blocker_profile_id <> blocked_profile_id)
);
```

- 兩表 browser 零直讀寫(revoke all)。讀取走 definer view `public.session_message_feed`:viewer 須為該局主揪或 accepted 參加者;**雙向封鎖過濾**(viewer 封鎖的與封鎖 viewer 的 sender 之 user 訊息不出現);欄位:`message_id, session_id, sender_profile_id, sender_nickname, kind, body, created_at, is_self`。
- RPC:
  - `post_session_message(p_session_id, p_body)`:成員限定;**status 必須 open/full**(封存=cancelled/played/expired 後拒收,回 `SESSION_ARCHIVED`);插入後 best-effort `chat_message` outbox 給其他成員,**節流**:同 session+recipient 5 分鐘內已有 chat_message 列則跳過;payload `message`=「群組有新訊息」,**永不含本文**。
  - `set_player_block(p_profile_id, p_blocked boolean)`:寫 `player_blocks`,**不設任何目標授權限制**(2026-07-28 修訂:授權收窄會誤殺「封鎖騷擾式邀請來源」等合法情境,已兩度退件);目標不存在時靜默回 `OK` 不插入,使存在與不存在不可區分。
    進場檢查掛在**四支** RPC:`request_to_join_session`、`invite_to_session`、`respond_to_session_invite`、`review_join_request`(accept 分支;declined/婉拒必須維持可用)。
    回傳碼依 caller 方向分邊(2026-07-28 新增):caller 是封鎖者 → `BLOCKED`;caller 是被封鎖者 → `SESSION_UNAVAILABLE`(request/respond)、`INVITEE_NOT_AVAILABLE`(invite)、`GUEST_UNAVAILABLE`(review)。互相封鎖走 `BLOCKED`。
    `post_session_message` 的推播收件人迴圈同樣要套雙向封鎖過濾(與 feed 一致),避免被封鎖者收到看不到內容的幽靈通知。
  - `create_report` 擴充 `p_message_id bigint default null`:檢舉單則訊息(報表關聯,訊息標記 reported 免於清除)。
- 系統訊息:`private.post_system_message(session_id, body)`,由 accept/withdraw/update/decide/cancel 路徑呼叫。
- 保存政策:pg_cron 每日 job `purge-archived-session-messages`:刪除「封存逾 90 天且未被檢舉」的 user 訊息。
- 封存唯讀:view 對封存局仍可讀(成員回顧),只擋寫。

**Tasks:**

- [ ] **T3.1 紅**:pgTAP——非成員讀 feed 零列+成員非空、requested/declined 不可讀、封存後 post 回 `SESSION_ARCHIVED` 但 feed 仍可讀、雙向封鎖訊息互不可見、封鎖後 join/invite 回 `BLOCKED`、chat_message payload 無本文(canary:塞 body 進 payload → CHECK 紅)、節流(5 分鐘內第二則不產 outbox)、purge 不刪已檢舉訊息。→ 紅。
- [ ] **T3.2 綠**:migration 202607270003;三拍;`test:db` 綠。
- [ ] **T3.3**:`dataApi.js`:`loadSessionMessages`/`postSessionMessage`/`setPlayerBlock`/`createReport` 擴充;unit 紅→綠;commit。

**驗收條件:** feed 成員邊界紅綠齊;封鎖三效果(訊息/加入/邀請)各一測試;payload canary 三拍;purge 掃描集非空斷言;`session_contacts` 未動(過渡保留,回歸測試仍綠)。

---

## Stage 4:UI 改版(三型表單、候選圖釘、加入矩陣、聊天、名單、07-25 球友層)

> **2026-07-28 執行修訂:本階段拆成五批派工**,原因是單批跨 8 個檔、7 個 Task 的退件成本過高,
> 且盤點發現兩個必須先解的基礎問題。各批獨立驗收:
> - **4A 基礎層**:migration `202607270005`(`session_discovery` 補 `decided_at`,否則定案前後匿名面
>   欄位組合相同,T4.2 的「候選虛線多釘、定案後單釘」做不出來)+ 前端門檻三級化
>   (`src/main.js:755-763` 仍是含 lineId/courts/types/slots 的六條 AND,比 DB 嚴,
>   使 spec 的「LINE 選填」在畫面上未生效)+ `src/main.js` api 物件接線 Stage 1-3 的八個未接函式。
> - **4B**:T4.1 建局三型表單 + T4.2 球局呈現與加入四碼三態 + 場地型別篩選。
> - **4C**:T4.3 定案 sheet + 編輯表單 + My Sessions 入口 + 候選虛線多釘/定案單釘。
> - **4D**:T4.4 聊天面板(2026-08-03 修訂:T4.5 因需 migration 006 抽出為獨立批;4D=T4.4,
>   已完成,HEAD d00d948)。
> - **T4.5 獨立批**:加入前名單+Google 頭像(migration `202607270006`:profiles.avatar_url、
>   save_my_profile 頭像同步含 Google CDN allowlist、登入面 view `session_join_preview`),
>   已完成(HEAD d01c802,001-006 凍結)。
> - **4E**:T4.6 通知設定球場多選 + 07-25 球友層改版 + T4.7 全綠與 390px。
>   4E 另需處理三筆已立案的產品項:
>   (a) **My Sessions 資訊架構回歸**(`supabase-mobile-chromium` 本機 gate 長期紅燈的根因):
>   `#my-needs-action` 被球友卡、通知設定(12 個行政區 checkbox)、在場狀態三塊設定壓到 y=1406,
>   390px 下超出第一屏。斷言由 `5a06b34` 引入時是綠的,是後續三個 commit 造成的回歸。
>   修法是把 needs-action 移回設定之上或收合設定;**禁止**用 `scrollIntoViewIfNeeded` 遮蔽
>   (`38d86a0` 已對 upcomingCard 做過一次,再做就沒有警報器了)。T4.6 的行政區改球場多選會順手消掉最大元凶。
>   (b) **在場互惠面的 viewer 門檻落差**:`sessionController.js:668` 卡 `directory`,
>   而 `player_presence_directory`(`202607270001:855-861`)只需 `ntrp + share_presence`,方向=嚴。
>   07-25 的「目錄轉列表、地圖只留在線」正是要拆這條共用路徑,拆完要確認 loadPlayers 分成兩段。
>   (c) 連帶文案:`sessionViews.js:793`／`:802` 仍用已退役的「完成／完整檔案」概念,`:802` 是事實錯誤。

**Files:**
- Modify: `src/sessionViews.js`(建局表單三型分段+候選球場複選 2~3+一鍵定案 sheet+編輯表單+聊天面板+加入前名單+通知設定改球場訂閱)
- Modify: `src/sessionController.js`(聊天輪詢:進群載入+推播/回前景刷新;定案/編輯 action)
- Modify: `src/main.js`、`src/map.js`、`src/pins.js`(候選局虛線圖釘多釘、定案收斂)、`src/filters.js`(場地狀態篩選、候選局排序錨=範圍起點)、`src/mockData.js`
- Modify: 07-25 spec 範圍的球友層檔案(目錄轉列表、地圖只留「在線」、邀請沿球友卡;以該 spec 的檔案清單為準)
- Test: `tests/`(session-create-form、session-controller、新 chat/decide 單元)+ Playwright mock/local 流程

**Tasks:**

- [ ] **T4.1**:建局表單:先選三型 → 只顯示該型欄位;候選複選(勾 1 個時就地引導轉已訂場/等場文案);人數軟連動(單打帶 1/雙打帶 3,可改);主揪 NTRP 未填就地補填。unit 紅→綠。
- [ ] **T4.2**:球局詳情與清單:三型標示、候選局「候選:A/B/C・日期・時間範圍」、加入矩陣三種按鈕態(加入/申請+補填提示/申請+範圍外註記);地圖候選虛線多釘、定案後單釘。
- [ ] **T4.3**:一鍵定案 sheet(候選按鈕列+時間預設範圍起點)+編輯表單(可編輯欄位白名單)+我的球局入口。
- [ ] **T4.4**:聊天面板(輪詢式:開啟載入、推播點擊/`visibilitychange` 刷新、送訊、系統訊息樣式、封存唯讀態、訊息檢舉/封鎖入口)。
- [ ] **T4.5**:加入前參加者名單(登入面,暱稱/頭像/NTRP)+頭像(Google 或預設)。
- [ ] **T4.6**:通知設定:行政區勾選 → 球場多選(上限為當下台北市 active 球場總數)+一次性重選提示;07-25 球友層改版照該 spec 執行。
- [ ] **T4.7**:`npm test` 與 `TENNIS_TEST_HARNESS_MODE=local npx playwright test --project=supabase-mobile-chromium` 全綠(local 跑兩次證無殘留);390px 檢查;commit(可拆多個)。

**驗收條件:** Playwright 覆蓋:三型建局各一條、候選定案流程、聊天送收與封存唯讀、加入矩陣三態、球場訂閱重選;`grep -n "行政區"` 於 UI 文案僅剩遷移提示;所有新 innerHTML 動態值過 `esc()`(抽查);繁體文案抽查(主揪/直接加入)。

---

## Stage 5:通知重排(球場廣播收尾、開打前提醒、催定案、派送端)

**Files:**
- Create: `supabase/migrations/202607270006_notification_rework.sql`
  (stamp 修訂:004 已被 Stage 3 的 chat_block_hardening 佔用並凍結,005 為 Stage 4A 的 discovery decided_at;
  本階段順帶補 spec 已知取捨①:`my_player_blocks` 遮罩加上 viewer 側 directory 門檻)
- Modify: `supabase/functions/notification-outbox-dispatch/dispatch.js`(notificationTitle 新事件)、`tests/notification-dispatch.test.js`
- Modify: `supabase/tests/`(cron/事件斷言)

**Interfaces:**
- `notification_pref_enabled` 更新:`session_decided`/`session_cancelled` **恆真(恆送)**;`session_updated`/`chat_message`/`session_reminder`/`court_new_session` 依偏好(court_new_session 由訂閱控制,偏好恆真)。
- 開打前提醒:pg_cron 每 5 分鐘 job `enqueue-session-reminders`:對 `start_at` 落在 [now()+55min, now()+65min)、status open/full、(candidates 須已定案)的局,對 accepted 參加者寫 `session_reminder`(以 unique 防重:同 session+recipient+type 只一列)。
- 催定案:同 job 掃 candidates 未定案且 `start_at - now() <= 3h`,對主揪寫一次性 `decide_reminder`(payload url 直達定案深連結)。
- 行政區退場:drop `district_subscriptions` 表、`set_district_subscriptions` RPC、`district_new_session` 事件(constraint 移除)。
- `notificationTitle` 新增:`session_updated`=「球局資訊更新」、`session_decided`=「球局場地時間定案」、`session_cancelled`=「球局已取消」、`chat_message`=「球局群組有新訊息」、`session_reminder`=「球局即將開始」、`decide_reminder`=「候選球局待定案」、`court_new_session`=「訂閱球場有新球局」。
- 派送 Edge Function 部署由使用者執行(授權邊界);config.toml 不變。

**Tasks:**

- [ ] **T5.1 紅→綠**:pgTAP——恆送事件無視偏好、reminder 防重(跑兩次 job 仍一列)、催定案僅一次、district 物件已不存在(反向斷言)。migration 202607270004。三拍。
- [ ] **T5.2**:dispatch.js 標題表+`tests/notification-dispatch.test.js` 新事件紅→綠;`npm test` 綠;commit。

**驗收條件:** 每事件型別各一 payload allowlist 測試;reminder 冪等證據;本機 `supabase functions serve` 派送一輪含新事件的實測輸出(沿 C 階段的 dispatch proof 模式)。

---

## Stage 6:文件、契約與發布收尾

**Files:**
- Modify: `CLAUDE.md`(聊天邊界、LINE 過渡、Session 資料流程節三型+定案+編輯、球場訂閱句、門檻矩陣)
- Modify: `.claude/rules/supabase.md`(新表/view/RPC 清單、23 欄 allowlist、群聊 RLS 原則、payload 增項)
- Modify: `docs/mvp-plan.md`(release checklist 增群聊治理/保存政策;兩帳號驗收旅程改群聊;驗證門檻與觀察指標定稿)
- Modify: `public/privacy.html`(LINE 改選填與退場說明、群聊訊息資料類別/90 天/檢舉留存/封鎖)
- Cleanup: 移除 `private.require_complete_profile` 舊函式與死碼(`courtPicker.js`、`util.js` 三 export——先看各檔 git log 再刪)

**Tasks:**

- [ ] **T6.1**:四份文件依 SPEC「待更新文件」節逐條改寫;文件內不得標記未實際執行的 hosted gate 為完成。
- [ ] **T6.2**:死碼清理+舊 gate 函式移除(migration 202607270005);`test:db` 綠。
- [ ] **T6.3**:全套驗證:`npm run test:db`、`npm test`、`npm run test:local`(連跑兩次)、`node scripts/generate-courts-seed.mjs --check`、`npm run build`、`git diff --check` 全綠。
- [ ] **T6.4**:mvp-plan release checklist 逐項執行(hosted migration/部署/兩帳號 QA/發布皆由使用者授權執行),完成後記錄執行紀錄。

**驗收條件:** 文件與實作零漂移(fresh agent 以 grep 對照抽驗 10 條);全測試綠;checklist 未完成項誠實標注。

---

## Self-Review 紀錄

- Spec coverage:三型/生命週期/加入矩陣(S2)、軟連動與表單(S4)、群聊含治理五項(S3+S5)、門檻矩陣與 host_profile_complete(S1)、球場訂閱與提醒(S1+S5)、07-25 球友層(S4)、驗證門檻與 privacy(S6)、深連結來源參數(S4 T4.4 推播刷新+S5 payload url)——全數對應。
- 恆送語義落點:S5 `notification_pref_enabled`;取消/定案兩事件。
- 型別一致性:`venue_type` 值(`booked/walk_on/candidates`)、回傳碼(`OK_NTRP_MISSING`/`OK_NTRP_OUT_OF_RANGE`/`SESSION_ARCHIVED`/`NOT_SESSION_MEMBER`/`INVALID_MESSAGE`/`BLOCKED`/`SESSION_UNAVAILABLE`/`GUEST_UNAVAILABLE`)、`session_candidate_courts.position` 於 S1 定義、S2/S4 引用一致。
  Stage 4 接線注意:`SESSION_UNAVAILABLE`/`GUEST_UNAVAILABLE` 是**終局**狀態,文案不可寫成「請重新載入後再試」誘導重試,也不可揭露封鎖。
