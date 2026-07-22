# 球友層第一波：球友卡目錄＋邀入球局 設計

日期：2026-07-21。狀態：user 已核可方向。這是「球局中心 → 球局＋球友雙層」的產品
擴張第一波，**有意識地變更**現行 CLAUDE.md 的部分隱私條文（見「邊界變更」節）；
spec 核可即代表這些條文變更被授權，執行 plan 內含同步修訂。

## User 已拍板的範圍

- 第一波：**球友卡（opt-in 目錄）＋邀入我的球局**。地圖錨點用靜態常打球場。
- 第二波（本 spec 不含）：球場 check-in（自願、限時）、一對一自由邀約。
- 可見性：**登入＋完整 profile** 才能看球友地圖；匿名永不可見。
- 已擋掉：背景即時定位（web 不可行＋跟蹤風險）。

## 隱私基線（不可退讓）

- 預設完全不可見：`profiles.is_public` 預設 false，僅本人透過 RPC 開關。
- 球友卡揭露欄位精確為：暱稱、NTRP、打法、可打時段、常打球場（含座標供地圖）、
  `profile_id`（不透明數字，僅作邀請目標識別）、`is_self`。**永不包含** LINE、
  真名、email、歷史球局。
- LINE 揭露模型完全沿用：邀請被接受 → 雙方 `accepted` → `session_contacts` 生效。
- 可隨時下架（開關關閉即從目錄消失）。

## 資料模型（復用優先，零新表）

- **opt-in 旗標**：復用 `profiles.is_public`（0001 遺留死欄位，現無任何讀者）。
  ⚠ 既有耦合：`save_my_profile` 的 upsert 目前每次把 `is_public` 寫死 false
  （insert 與 on conflict update 皆是，0003:734-741）——必須改為 update 分支
  保留現值，否則每次存檔都會把球友卡下架。此回歸必須有 pgTAP 斷言保護。
- **地圖錨點**：復用 `profile_courts`（常打球場，profile 表單已有）。球友卡以
  (profile × court) 為列，前端按球場分組聚合，與球場 pin 架構一致。
- **邀約**：復用 `session_participants`，`status` check 擴充加 `'invited'`；
  新欄 `initiated_by text not null default 'guest' check (initiated_by in ('guest','host'))`
  （區分邀請與申請＋供每日上限計數）。invited 列天然出現在
  `my_session_participations`，「收到的邀請」零新 view。

## Trigger 擴充（已對 0003 全文驗證，共 4 處）

`invited` 是新 participant 狀態，`private.enforce_session_participant_transition`
與 capacity invariant 必須同步放行，否則 RPC 寫入會被自家 trigger 擋：

1. INSERT 分支（0003:332-334）：guest 進場狀態由僅 `requested` 擴為
   `requested | invited`；`invited` insert 沿用同段的 parent open＋future 檢查
   （0003:361-373 的條件擴為 `status in ('requested','invited')`）。
2. UPDATE 狀態機（0003:346-352）：新增合法轉移
   `invited → accepted`、`invited → declined`。
3. accepted 轉移容量防護（0003:383）：`old.status <> 'requested'` 擴為
   `old.status not in ('requested','invited')`——invited→accepted 自動獲得
   既有的 open＋future＋容量檢查。
4. `enforce_session_capacity_invariant`（0003:489-497）：full 局不可殘留
   pending 列的檢查由 `requested` 擴為 `in ('requested','invited')`。

對應地，三處「補滿自動婉拒」（`review_join_request`、instant join、新的
`respond_to_session_invite`）一律 decline `status in ('requested','invited')`。

## 新 DB 物件

- `private.has_complete_profile(p_user_id uuid) returns boolean`：把
  `require_complete_profile` 的完整性條件抽成可供 view 使用的判定（不 raise）。
- `public.player_directory` view（definer，grant **僅 authenticated**）：
  欄位有序為 `profile_id, nickname, ntrp, play_types, slot_codes, court_id,
  court_name, court_district, court_lat, court_lng, is_self`。
  列條件：`is_public` 且卡片本人 profile 完整 且 court 為台北市 active；
  viewer gate：`private.has_complete_profile(auth.uid())` 為 false 時回 0 列。
- `public.set_player_visibility(p_visible boolean) returns text`：
  `require_complete_profile()` 後更新本人 `is_public`；回 `'OK'`。
- `public.invite_to_session(p_session_id bigint, p_profile_id bigint) returns text`：
  guards 依序——`lock_and_expire_session`（expired → 回 `'SESSION_EXPIRED'`）、
  host 身分（`NOT_SESSION_HOST`）、球局 cancelled/full/not-open/started（沿用
  request_to_join 的錯誤碼組）、邀請自己（`INVALID_TRANSITION`）、對象必須
  可被發現且完整（`INVITEE_NOT_AVAILABLE`）、既有列（requested→
  `ALREADY_REQUESTED`；invited→`ALREADY_INVITED`；其他→`ALREADY_DECIDED`）、
  邀請上限（該 host 名下球局 24 小時內 `initiated_by='host'` 邀請 ≥ 10 →
  `INVITE_LIMIT`，滾動窗）。通過後 insert `(role='guest', status='invited',
  initiated_by='host')`，回 `'OK'`。
- `public.respond_to_session_invite(p_session_id bigint, p_decision text) returns text`：
  找 viewer 本人的 `invited` 列（無 → `NOT_INVITED`）；decision `'declined'` →
  status='declined'；`'accepted'` → 沿用 review_join_request 的原子容量段落
  （count→滿則轉 full 並 raise `SESSION_FULL`；接受；補滿則轉 full＋decline
  殘餘 requested/invited）。回 `'OK'`。
- `my_session_participations` 尾端新增 `can_respond_invite`
  （viewer status='invited' 且球局 open/full 且未開打）。
- `my_profile` view 尾端新增 `is_public`（開關顯示現值）。

新錯誤碼：`INVITEE_NOT_AVAILABLE`、`ALREADY_INVITED`、`NOT_INVITED`、`INVITE_LIMIT`。

## UI

- **地圖圖層**：地圖上新增「球友」圖層 toggle（與球局圖層並存切換）；未登入或
  profile 未完成時，開啟圖層導向登入／完成檔案 gate（沿用既有 gate 流程）。
- **球友 pin**：按球場聚合（「N 位球友」），點開 → 該球場球友清單 drawer
  （比照 `openCourtSessionDrawer`）→ 點球友 → 球友卡 sheet。
- **球友卡 sheet**：暱稱/NTRP/打法/時段/常打球場＋「邀請加入我的球局」。按下後
  列出 viewer 身為 host 的未來 open 局供選擇；無可邀局時引導開新局。`is_self`
  時不顯示邀請按鈕。
- **收到的邀請**：My Sessions「需要你處理」新增 invite 卡（球局資訊＋主揪暱稱/NTRP
  ＋接受/婉拒），`groupMySessions` 新增 `kind:'invite'`，排序在 host-request 之後、
  guest-request 之前。
- **opt-in 開關**：My Sessions 頁頂部「球友卡」區塊：開關＋說明文案
  「開啟後，完成檔案的球友可在地圖上你的常打球場看到你的暱稱、NTRP 與時段」。

## 測試

- pgTAP：player_directory 有序 allowlist＋排除 line_id 斷言＋anon 42501＋
  不完整 viewer 0 列＋is_public=false 不出現；save_my_profile 不重置 is_public
  （回歸保護）；invite/respond 全生命週期（含每日上限、非 host 邀人、邀自己、
  decline 封鎖、補滿 decline invited 連動）；raw writer 邊界（invited 對
  started/full 局 insert 被擋、invited→withdrawn 被擋）。先紅後綠。
- unit：dataApi 新 SELECT/mapper/wrapper、`groupMySessions` invite 分組。
  （pgTAP 的邀請上限測試以「24 小時內」為準。）
- e2e（local，寫入 `session.spec.js`——supabase-chromium 的 testMatch 只收
  `session|performance`，新檔名不會被執行）：A opt-in → B 看到 A → B 邀 A →
  A 接受 → 互看 LINE；A 關閉開關後 B 看不到 A。
- mock：`MOCK_PLAYERS` 安全示範資料；圖層 toggle 旅程＋zero console error。

## 邊界變更（CLAUDE.md / rules 同步修訂）

- 「公開探索只透過 `session_discovery`」→ 補充：登入＋完整 profile 的球友目錄
  走 `player_directory`（authenticated-only，非公開面）。
- browser 邊界清單加入：`player_directory`、`set_player_visibility`、
  `invite_to_session`、`respond_to_session_invite`。
- participant status 值域加入 `invited`；`initiated_by` 語意。
- 「舊 player-card 文件僅為歷史」條文維持——本 spec 是全新決策，非舊文件復活。

## 非目標

- check-in、一對一自由約、球友搜尋/篩選（第一波僅地圖瀏覽）、邀請訊息附言、
  匿名可見、通知。
