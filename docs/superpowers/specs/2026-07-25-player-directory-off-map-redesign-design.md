# 球友目錄下地圖：目錄轉列表、地圖只留在線 設計

日期：2026-07-25。狀態：user 已核可方向（拍板決策見下）。

本 spec 是 `2026-07-21-player-directory-invites-design.md` 與
`2026-07-23-player-presence-design.md` 的**增量演進，非推翻**：07-21 明列「地圖錨點
用靜態常打球場」為第一波權宜、check-in 列第二波；07-23 的在場（presence）即為那個
第二波，已實作驗收。本 spec 把第一波的靜態常打球場地圖圖釘退役，改由在線層承載
地圖、由列表承載目錄瀏覽與邀請。**全部為前端改動，零 migration，不動任何已上線的
view / RPC / 表。**

## 命名（在場 → 在線）

使用者可見文字「在場」一律改為「在線」。這是**純文案**改名；底層概念不變，仍是
「現在真的在某座台北市 active court」。**程式識別碼與資料庫欄位一律不改**：
`player_presence`、`player_presence_directory`、`share_presence`、`isPresent`、
`presenceCount`、`playerPresenceLabel`、`presence-*` CSS class、含 `presence` 的
`data-testid` 全部保留原樣。只換顯示字串。

## User 已拍板的決策

1. **地圖球友圖層 → 只剩在線**（presence）；拿掉靜態常打球場圖釘。左上角開關
   「顯示球友」→「顯示在線」，行為與文字終於一致。
2. **球友目錄 → 從地圖降級為可瀏覽列表**（登入＋完整 profile 才可見），沿用現有
   球友卡與邀請。被邀者能在名單裡看到自己（保留自我可見回饋）。
3. **邀請入口 → 只做「翻名單 → 球友卡 → 邀請」**（復用既有 `openPlayerCardSheet`）；
   **不做**球局內邀請入口（可日後再加，見非目標）。
4. **常打球場資訊 → 名單以文字顯示球場名，`player_directory` view 完全不動**
   （court_lat / court_lng 仍在 authenticated payload，但前端不再畫成圖釘）。
5. **既有 opt-in 使用者 → 不 re-consent，只改開關說明文案**：`is_public` 從一開始
   就是 `invite_to_session` 的邀請授權 gate（`202607210002:484`），球友卡今天就有
   邀請鈕，opt-in 者現在已可被邀，本次不擴大實際曝光，只把文案講準。

## 隱私 delta（本次淨縮小）

- 移除「靜態常打球場地圖圖釘」＝拿掉「持久、非互惠、揭露習慣出沒地點」的最高
  洩漏面。同一資訊改以文字呈現在 authenticated-only 名單，曝光受眾從「地圖上任何
  完整會員被動看到」收窄為「主動翻名單者」。
- 硬邊界全部不變：authenticated-only、雙方 `accepted` 才經 `session_contacts`
  互看 LINE、LINE 永不進 payload / view / UI、匿名面 `session_discovery`
  allowlist 不變。
- **已知殘留（本次刻意不處理）**：`player_directory` view 仍 select
  court_lat / court_lng，完整 profile 的登入者仍可直接查 view 取得座標——本次選擇
  「前端不渲染、view 不動」以零 migration / 零回歸為先。若日後判定座標須完全離開
  wire，於下次本來就要動 directory 的 migration 一併裁欄位，不單獨為此開一輪 hosted
  re-QA。

## 不可退讓（維持不動）

- **零資料庫改動**：`player_directory`、`player_presence_directory`、`is_public`、
  `share_presence`、`profile_courts`、所有 RPC 一律不動。
- `profile_courts` 是 `require_complete_profile` / `has_complete_profile` 的完整性
  gate（建局／加入／被邀資格皆依賴），不得移除；profile 表單「常打球場」必填
  選擇器（`sessionViews.js:1564` 一帶）保留。
- `is_public` 是 `invite_to_session` 的邀請授權 gate，不得退休。

## 設計與 UI 變更

### 地圖（只留在線）

- 地圖球友圖層資料源改為**僅** `player_presence_directory`；不再把
  `player_directory`（靜態常打球場）畫成 pin。
- `loadPlayers()`（`sessionController.js:660-718`）拆分：presence 直接餵地圖
  （court-grouped pin，沿用 07-23 的「在線 N 人」亮點與球場球友抽屜）；directory
  不再進地圖來源。移除原本依 `profileId` 把兩份合併的 dedup 段落。
- `playerGroups()`（`sessionController.js:349-370`）只聚合 presence 列。
- `renderPlayerLayerToggle`（`sessionViews.js:1856-1866`）文字
  `顯示球友 / 隱藏球友` → `顯示在線 / 隱藏在線`。
- 點在線球場 pin → `openCourtPlayersDrawer`（現有）顯示該球場在線球友 → 球友卡 →
  邀請，維持可用（此路徑天然只含在線者）。

### 球友名單（目錄轉列表）

- 新增「球友名單」入口（地圖畫面上的按鈕／選單項），開啟一份可瀏覽列表 sheet。
  入口 gate 沿用既有 `requireSessionAction`（登入＋完整 profile）。
- 資料源沿用 `player_directory`（現有 `loadPlayerDirectory`），改以**不帶 bounds**
  載入台北市所有 opt-in 球友（列表非地圖，無視窗範圍）。
- 每列顯示：暱稱、NTRP、打法、時段、常打球場（文字）；若該人同時在線
  （presence）標「在線」badge 並排前。
- 點一列 → 現有 `openPlayerCardSheet`（`sessionViews.js:1772-1852`）→
  「邀請加入我的球局」。完全復用現有球友卡、`playerInviteChoices`、送出邀請流程。
- `is_self` 列不顯示邀請鈕（現有邏輯），但**列出自己**，滿足被邀者自我可見。

### 開關說明文案（誠實化）

- opt-in 文案 `sessionViews.js:784`：
  `開啟後，完成檔案的球友可在地圖上你的常打球場看到你的暱稱、NTRP 與可打時段。LINE 不會顯示。`
  → 改為：
  `開啟後，你會出現在球友名單，主揪可以邀你加入球局；關閉後立即從名單移除。LINE 不會顯示。`
- 兩個開關語意現在乾淨對齊，**無需新增或拆分開關**（維持決策 5「只改文案」）：
  - `is_public`＝出現在球友名單／可被邀請。
  - `share_presence`＝在線時出現在地圖。

### 在場 → 在線 文案改名（純字串）

全庫 grep 使用者可見「在場」→「在線」。已知錨點：

- `playerPresenceLabel()` 產出（`sessionViews.js`，「在場・N 分鐘前」→「在線・N 分鐘前」）。
- 球友卡在場狀態列（`sessionViews.js:1803`「在場狀態：」→「在線狀態：」）。
- presence 設定區標題與按鈕（`sessionViews.js:792`「在場狀態」、`797`「開啟在場分享」）。
- 地圖 pin「在場 N 人」（`src/map.js` / `src/pins.js`）。
- 任何 hint／`mockData.js` 文案中的「在場」。

**不改**任何程式識別碼、資料庫欄位、`data-testid`、CSS class（見「命名」節）。

## 前端變更清單（給 Codex）

- `src/sessionController.js`：`loadPlayers`（660-718）拆為 presence→地圖、
  directory→列表兩路；新增「載入全目錄（不帶 bounds）＋開啟名單 sheet」的 action；
  `togglePlayerLayer`（1651-1663）語意變為切換在線層；`playerGroups`（349-370）
  只聚合 presence。
- `src/sessionViews.js`：新增 `openPlayerDirectoryList`（列表 sheet，復用
  player-card-row 標記與 `openPlayerCardSheet`）；`renderPlayerLayerToggle` 文案；
  opt-in 文案（784）；在場→在線 字串；名單入口按鈕。
- `src/dataApi.js`：`loadPlayerDirectory` 支援不帶 bounds 的全載（或新增
  `loadAllPlayerDirectory`）；mapper 與 view 欄位不動。
- `src/map.js` / `src/pins.js`：移除 directory 靜態 pin 渲染；保留 presence pin；
  pin 文案在場→在線。
- `src/main.js`：接線名單入口按鈕與 controller action。
- `src/mockData.js`：mock 分成「在線」與「目錄」兩份對應新資料流；在場→在線 文案。

## 測試影響

- mock（`npm run test:mock`）：圖層 toggle 旅程改為在線層；新增名單 sheet → 球友卡
  → 邀請旅程；zero console error。
- unit（`session-controller.test.js` 等）：`loadPlayers` 拆分後的 presence /
  directory 分流；名單載入 wrapper。
- e2e（local，`session.spec.js`）：既有「A opt-in → B 看到 A → 邀請 → 互看 LINE」
  改走名單而非地圖 pin；在線互惠情境（`session.spec.js:814`）維持；反向 delist
  （關閉 opt-in → 名單看不到 A）維持。
- **無 pgTAP 改動**（零 DB 變更）；仍須跑 `npm run test:db` 確認既有全綠未回歸。
- 文案改名後同步更新任何斷言「在場」字串的測試。

## 邊界變更（文件同步）

- 07-21 spec：補一節「2026-07-25 演進」——地圖錨點退役、目錄改列表、邀請入口從
  地圖圖釘改為列表；其 UI 節（88-99）對「地圖球友圖層／球友 pin」的地圖部分已被
  本 spec 取代；隱私基線（17 行）「常打球場（含座標供地圖）」的「供地圖」用途退役
  （座標仍在 view、前端不畫）。
- `CLAUDE.md`：「地圖球友圖層」語意更新為「只含在線（presence）」；球友目錄改述為
  「authenticated-only 可瀏覽名單，非地圖圖層」。`session_discovery` 匿名面與
  LINE 邊界不變。

## 非目標

- **球局內邀請入口**（先有缺額局 → 在局內找人補）：決策 3 選擇不做，日後可加。
- 動 `player_directory` view 欄位／移除座標／退休 `is_public`／砍常打球場選擇器：
  一律不做（會打穿邀請授權與完整 profile 契約）。
- 名單搜尋／進階篩選、聊天、一對一自由約、通知面新增。
- 任何 DB migration 與 hosted schema 變更。

## 排序與未決細節（實作可自行決定，錯了改起來便宜）

- **名單預設排序**：在線者置頂標「在線」，其餘先依 NTRP 相近／常打同球場，無強
  配對時依暱稱；可日後調。註：PM 提醒「在線優先」對未來球局是反訊號（正在打球的
  人較不會來你稍後的局），故在線只當置頂 badge，非配對主軸。
- **名單入口位置與樣式**（按鈕 vs tab）：實作擇一，維持行動版觸控目標 ≥44px。
- **名單載入範圍**：先載台北市全部 opt-in；數量大再加分頁／篩選。
- **上線 sequencing**：本前端改動與 presence 五個 migration（202607230001-0005）的
  hosted 部署一起走（地圖在線層需 presence view 已 live 才有資料）；directory 列表
  本身用已上線的 `player_directory` 即可運作。**先加後刪**：同一 PR 內先讓
  名單 → 球友卡 → 邀請可用，再移除地圖靜態層、開關改名。
