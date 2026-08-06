# 資訊架構重整與文案統一實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **本專案實際執行模式**:各批由 Codex 依「派工 prompt」執行,主對話以 fresh read-back agent 驗收,驗收通過才釋出下一批的 prompt(同 2026-07-27 管線)。

**Goal:** 依 `docs/superpowers/specs/2026-08-06-information-architecture-redesign.md`(下稱 SPEC)重整資訊架構——開出「我」分頁承載身分與設定、退役 LINE 過渡面、簡化開球局表單與球場訂閱、讓出席回報產生用途、統一全站用詞。

**Architecture:** 八個依序堆疊的批次,先減後加:LINE 退役先拆掉最多殘留 → 導覽骨架與「我」頁 → 設定搬家 → 檔案常駐入口 → 表單簡化 → 訂閱簡化 → 信任數字(唯一 migration) → 詞表殘餘與視覺收尾。除批 7 外全為前端;瀏覽器讀寫維持 `src/dataApi.js` 的 view/RPC 唯一邊界。

**Tech Stack:** Vite 6 原生 ES modules(無框架/無 TS/無 linter)、Supabase(RLS + security definer views/RPC、pgTAP)、Playwright。

## Global Constraints(每個 Task 隱含適用)

- **匿名邊界不可擴充**:`public.session_discovery` 的主揪欄位維持 `host_nickname`／`host_ntrp`／`host_profile_complete` 三項。信任數字只走 authenticated-only view。
- **已凍結的 migration 不可手改**:001-008 與 202608050001 皆已凍結,202608050001 已套用 hosted。本計畫只新增 `202608060001`。
- raw tables 不是 browser API;前端只經 `src/dataApi.js` 的 view/RPC。
- `innerHTML` 動態內容一律 `esc()`;UI 文案繁體台灣用語。
- **定詞表(全批適用,新寫與改寫的文案一律照此)**:

  | 概念 | 只准用 | 不可再出現 |
  | --- | --- | --- |
  | 主揪拒絕申請 | 婉拒 | 未被接受、未加入、這次參與未成立 |
  | 尚有名額 | 缺 N 位 | 剩 N 位 |
  | 可加入狀態 | 開放加入 | 開放報名 |
  | 第二人稱 | 你 | 您 |
  | 個人檔案完整度 | 資料完整／資料未完成 | 檔案已完成、檔案待完成 |

- **觸控目標** ≥44×44px(390px viewport);新增的互動元素一律達標。
- pgTAP **先紅後綠**;掃描式測試必須 assert 掃描集非空。
- 測試指令:`npm test`(=test:mock,不重置 DB)、`npm run test:db`、`npm run test:local`、
  `TENNIS_TEST_HARNESS_MODE=local npx playwright test --project=supabase-mobile-chromium`;
  重置本機 DB 唯一入口 `CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test`。
- 每批完成即 commit(精確路徑 stage,不用 `-A`);**不 push**(push 由使用者執行)。
- **擴大範圍前先提案,不要直接實作**;缺陷修補與範圍擴大分開回報。

## 派工與驗收合約(每批 Codex prompt 都含)

- **三件套**:目標與動機、可觀察可證偽的驗收條件、回報格式。
- **回報合約**:只回結論+`檔案:行號`;測試數字**從實跑 log 逐字複製**,不得估算;宣稱的每個修改點附該行原文一句(以 `sed -n 'Np'` 逐字複製,防偽引用);禁貼整檔。
- **驗收**:主對話派 fresh agent 重跑測試、盤 diff 與宣稱一致、抽驗引文逐字吻合、canary 真重放,通過才進下一批。

---

## 批 1:LINE 過渡面前端退役

**Files:**
- Modify: `src/sessionViews.js`(個人檔案 LINE 欄位與 hint、「已核准的聯絡方式」整區、含 LINE 的文案)
- Modify: `src/sessionController.js`(contacts 載入與 refresh 路徑)
- Modify: `src/main.js`(`loadSessionContacts` import 與接線)
- Modify: `src/dataApi.js`(`loadSessionContacts`、`session_contacts` 查詢與匯出)
- Modify: `public/privacy.html`(§1 蒐集項、§2 可見性表格列與 LINE callout、§3 提及)
- Modify: `CLAUDE.md`、`.claude/rules/supabase.md`(LINE 條文改為已退役)
- Modify: `docs/mvp-plan.md`(登記技術債:資料庫仍存在無消費者的 LINE 面)
- Test: `tests/smoke.spec.js`、`tests/session.spec.js`、`tests/session-mobile.spec.js`、`tests/session-data-boundary.test.js`、`tests/session-controller.test.js`、`tests/fixtures/localSupabase.js`、`tests/fixtures/sessionFactory.js`

**Interfaces:**
- 移除後 `renderMySessionsPage` 不再接收 `contactsForSession`、`contactsError` 參數;
  `refreshMySessions` 的 `includeContacts` 選項與其呼叫點一併移除。
- 個人檔案表單提交 payload 不再含 `lineId`;`save_my_profile` RPC 簽名**不變**(該參數傳 null)。
- **資料庫層完全不動**:`public.session_contacts` view、`profiles.line_id` 欄位保留。

**Tasks:**

- [ ] **T1.1 紅→綠**:新增反向掃描測試——`src/` 全目錄對 `session_contacts`、`line_id`、`lineId`、`LINE` 零命中(掃描集非空斷言:先證明掃得到 `src/*.js` 檔案清單非空)。先跑證明紅。
- [ ] **T1.2**:移除 `src/dataApi.js` 的 `loadSessionContacts` 與 `session_contacts` 查詢及其 export;移除 `src/main.js` import 與接線。
- [ ] **T1.3**:移除 `src/sessionViews.js` 的「已核准的聯絡方式」整區(對方暱稱、LINE readonly 欄、複製 LINE ID、複製開場訊息、複製狀態、contacts 錯誤與重試)與個人檔案的 LINE 欄位與 hint。
- [ ] **T1.4**:移除 `src/sessionController.js` 的 contacts 載入/refresh 路徑與 `includeContacts` 分支。
- [ ] **T1.5**:清掉所有提及 LINE 的 UI 文案(暱稱公開揭露聲明、profile 揭露句、建局加入方式 hint),改寫為群聊敘事。
- [ ] **T1.6**:`public/privacy.html` 移除 LINE 蒐集項、可見性表格的 LINE ID 列與整段 LINE callout;`CLAUDE.md`、`.claude/rules/supabase.md` 的 LINE 條文改為「已退役(資料庫面保留為技術債)」;`docs/mvp-plan.md` 登記技術債。
- [ ] **T1.7**:更新受影響測試(移除 LINE 斷言、fixture 的 line_id 設定);T1.1 掃描轉綠;完整 gate 全綠;commit。

**驗收條件:** T1.1 掃描測試由紅轉綠且掃描集非空;`git diff` 對 `supabase/migrations/` 零 diff;隱私政策無 LINE 字樣;完整本機 gate 全綠。

---

## 批 2:四格導覽與「我」頁骨架

**Files:**
- Modify: `index.html`(底部導覽第四格、新 `#me-page` 容器、header 移除兩顆按鈕)
- Modify: `src/main.js`(`showMePage`、`syncBottomNavigation` 三格→四格、header 監聽移除)
- Modify: `src/sessionViews.js`(新增 `renderMePage`)
- Modify: `src/session.css`(四格導覽、`.me-page` 樣式)
- Test: `tests/smoke.spec.js`、`tests/session-mobile.spec.js`

**Interfaces:**
- `index.html` 新增 `<section id="me-page" class="me-page" aria-label="我" hidden>`,內含 `<div id="me-root"></div>`;
  導覽新增 `<button id="me-tab" data-testid="me-tab" class="bottom-navigation__item" aria-controls="me-page">我</button>`。
- `src/main.js` 新增 `showMePage({ focus = false } = {})`,比照 `showMySessionsPage`(main.js:740-759):
  設 `activePage = "me"`、隱藏 `#tab-map` 與 `#my-sessions-page`、顯示 `#me-page`、呼叫 `renderMeDestination()`、`syncBottomNavigation()`。
  `showMapPage` 與 `showMySessionsPage` 需同步隱藏 `#me-page`。
- `renderMePage(root, { authSession, profile, avatarUrl, onEditProfile, onSignIn, onSignOut })` — 本批只渲染:
  眉標「我」、身分卡(頭像／暱稱／NTRP)、登出按鈕、未登入時的登入 CTA、站務連結區(聯絡支援、隱私權政策)。
  設定四組與個人檔案入口留待批 3、批 4。
- header 移除 `#open-session`(開球局)與 `#open-my-sessions`(我的球局)兩顆按鈕及其 `src/main.js` 監聽;
  保留品牌連結、城市標籤、`#use-location`。
- 頁尾 `.site-links` 從 `index.html` 的浮動位置移除,兩個連結改由 `renderMePage` 產生;
  `src/main.js` 的 `renderSupportContact` 改為供給 `renderMePage` 的資料而非直接操作 DOM。

**Tasks:**

- [ ] **T2.1 紅→綠**:Playwright 測試——四格導覽存在且 `me-tab` 可點進「我」頁;登入後身分卡顯示暱稱;未登入顯示登入 CTA 與隱私權政策連結;地圖頁不再有浮動 `.site-links`;header 只剩三項。先跑證明紅。
- [ ] **T2.2**:`index.html` 加第四格與 `#me-page` 容器、移除 header 兩顆按鈕與浮動 `.site-links`。
- [ ] **T2.3**:`src/main.js` 加 `showMePage`、三個 `show*Page` 互斥隱藏、`syncBottomNavigation` 支援四格、移除 header 監聽、`renderMeDestination()` 接線。
- [ ] **T2.4**:`src/sessionViews.js` 實作 `renderMePage`(身分卡 + 登出 + 登入 CTA + 站務連結),所有動態值過 `esc()`。
- [ ] **T2.5**:`src/session.css` 四格導覽等寬、`.me-page` 沿用 `.my-sessions-page` 既有視覺語彙(不新增風格),觸控目標 ≥44px。
- [ ] **T2.6**:390px 幾何斷言(四格不溢出、導覽項 ≥44px);測試轉綠;完整 gate 全綠;commit。

**驗收條件:** 四格導覽在 390px 不溢出且每格 ≥44×44px;「我」頁匿名可進且含隱私權政策連結;地圖頁 `.site-links` 零命中;身分卡顯示 Google 頭像與暱稱;登出可用;完整 gate 全綠。

---

## 批 3:設定四組搬家與「我的球局」瘦身

**Files:**
- Modify: `src/sessionViews.js`(四組設定區塊從 `renderMySessionsPage` 移入 `renderMePage`)
- Modify: `src/main.js`(設定相關 handler 改接 `renderMeDestination`;`showMySessionsPage` 移除設定 refresh)
- Modify: `src/sessionController.js`(封鎖清單 refresh 的觸發點改隨「我」頁)
- Modify: `src/session.css`(設定區塊在新頁的樣式)
- Test: `tests/smoke.spec.js`、`tests/session.spec.js`、`tests/session-mobile.spec.js`、`tests/session-controller.test.js`

**Interfaces:**
- `renderMePage` 參數擴充:`blockedPlayers`、`blockedPlayersError`、`blockedPlayersStatus`、`courts`、
  `notification`、`presence`、`playerVisibility`、`onEnablePush`、`onNotificationPrefChange`、
  `onCourtSubscriptionChange`、`onSetPresenceSharing`、`onSetOpenToGreeting`、`onTogglePlayerVisibility`、
  `onUnblockPlayer` — 皆自 `renderMySessionsPage` 現有同名參數平移,**行為與 data-testid 不變**。
- `renderMySessionsPage` 移除上述設定相關參數,只保留球局清單相關(`groups`、`createdSessionId`、
  `courts`、`onAccept`、`onDecline` 等)。建局成功的推播 CTA(`created-session-enable-push`)**留在我的球局頁**
  ——它是情境式引導,不是設定。
- `showMePage` 需觸發 `refreshNotificationSettings()` 與 `controller.refreshMyPlayerBlocks()`;
  `showMySessionsPage` 移除這兩個呼叫。
- 通知區需標明推播是裝置級:hint 補「推播開關只影響這台裝置;下方的事件偏好套用到你的帳號」。

**Tasks:**

- [ ] **T3.1 紅→綠**:測試——四組設定的既有 `data-testid`(`presence-sharing-toggle` 等)出現在「我」頁而非「我的球局」頁;「我的球局」頁只剩三個球局 section;設定操作(開關球友卡、改通知偏好、解除封鎖)在新位置仍成功。先跑證明紅。
- [ ] **T3.2**:把球友卡、在線狀態、通知設定、封鎖清單四個區塊的 markup 與事件接線自 `renderMySessionsPage` 平移到 `renderMePage`,保留全部 `data-testid` 與失敗回滾行為。
- [ ] **T3.3**:`src/main.js` 的設定 handler 改在 `renderMeDestination` 重繪;`showMePage` 加 refresh、`showMySessionsPage` 移除。
- [ ] **T3.4**:通知區補裝置級 hint;站務連結置於設定之後。
- [ ] **T3.5**:390px 斷言涵蓋「我」頁全區塊(不溢出、觸控 ≥44px);測試轉綠;完整 gate 全綠;commit。

**驗收條件:** 四組設定在「我」頁功能與搬家前一致(含失敗回滾與焦點行為);「我的球局」頁不再出現任何設定 `data-testid`;裝置級 hint 存在;完整 gate 全綠。

---

## 批 4:個人檔案常駐入口與非 gate 模式

**Files:**
- Modify: `src/sessionViews.js`(`openProfileCompletionSheet` 加非 gate 模式;`renderMePage` 加入口)
- Modify: `src/main.js`(常駐入口 handler)
- Test: `tests/smoke.spec.js`、`tests/session.spec.js`、`tests/session-controller.test.js`

**Interfaces:**
- `openProfileCompletionSheet` 新增選項 `{ mode = "gate" }`,可為 `"gate"` 或 `"standalone"`:
  - `"standalone"`:眉標改「個人檔案」、標題改「編輯個人檔案」、**不顯示** gate 提示句與「完成後將回到:…」、
    送出鈕文字改「儲存」;欄位、驗證、`save_my_profile` 呼叫與錯誤處理**完全不變**。
  - `"gate"`:現行行為逐字保留(眉標「完成後即可繼續」、gate 提示、「儲存並繼續」、續行原 intent)。
- `renderMePage` 身分卡下方新增 `<button data-edit-profile data-testid="edit-profile">編輯個人檔案</button>`,
  僅登入時渲染;`src/main.js` 接 `openProfileCompletionSheet({ mode: "standalone", ... })`。
- 儲存成功後重繪「我」頁身分卡(暱稱/NTRP 可能已變)。

**Tasks:**

- [ ] **T4.1 紅→綠**:測試——(a) 已通過全部 gate 的帳號能從「我」頁開檔案表單並改暱稱、儲存後身分卡更新;(b) standalone 模式不出現「完成後即可繼續」與 gate 提示句;(c) gate 路徑的既有測試全部維持綠(行為未回歸)。先跑證明紅。
- [ ] **T4.2**:`openProfileCompletionSheet` 加 `mode` 分支,gate 路徑的字串逐字不動。
- [ ] **T4.3**:`renderMePage` 加入口、`src/main.js` 接線、儲存後重繪。
- [ ] **T4.4**:測試轉綠;完整 gate 全綠;commit。

**驗收條件:** standalone 與 gate 兩模式各有測試;gate 模式的既有斷言零修改即通過(以 `git diff` 證明相關測試未被改動);儲存後身分卡即時反映新暱稱。

---

## 批 5:開球局表單簡化與打法收斂

**Files:**
- Modify: `src/sessionViews.js`(建局表單第一題、打法選項、缺額控件;編輯表單同步)
- Modify: `src/filters.js`(打法 chip 清單)
- Modify: `index.html`(若打法 chip 為靜態 markup)
- Test: `tests/session-create-form.test.js`、`tests/smoke.spec.js`、`tests/session.spec.js`

**Interfaces:**
- 建局表單第一題 legend 由「場地類型」改為「場地確定了嗎?」;三個 radio 的 `value` **不變**
  (`booked`／`walk_on`／`candidates`),label 與說明句改為:
  - `booked` → 「已訂好場地」／「時間與球場都確定了。」
  - `walk_on` → 「球場確定,但要現場排隊」／「公共球場現場輪流,人到齊不保證馬上有場地。」
  - `candidates` → 「還沒確定,先列候選」／「先列 2–3 座候選球場與時間範圍,之後再定案通知大家。」
- 打法 `<select>` 選項移除「對拉」,剩「單打」「雙打」「練球」,各附一句說明(以 `optgroup` 或欄位下方 hint 呈現,擇一即可)。
  **`sessions.play_type` 的 CHECK 約束與 RPC 不動**。
- **打法白名單必須拆成兩個常數**:[已驗證] `src/sessionViews.js:195` 與 `:247`(建局與編輯的驗證)
  目前共用同一個 `CREATE_PLAY_TYPES` Set。若直接把它收為三值,既有「對拉」球局在編輯表單一按儲存就會
  被前端驗證擋下。作法:
  - `CREATE_PLAY_TYPES`(建局用)= `單打／雙打／練球`
  - `EDIT_PLAY_TYPES`(編輯用)= `單打／雙打／對拉／練球`(與 DB CHECK 一致)
  - 編輯表單的 `<select>` 只有在該局現值為「對拉」時才額外渲染該選項。
- 缺額 `<select id="session-slots-total">` 改為三顆 radio/button(`data-testid="session-slots-1|2|3"`),
  上限維持 1–3;欄位下方 hint「不含你自己」。單打→1、雙打→3 的自動連動行為保留。
- `src/filters.js` 的打法 chip 移除「對拉」。

**Tasks:**

- [ ] **T5.1 紅→綠**:測試——(a) 第一題 legend 與三個新 label 存在且 value 未變;(b) 打法只有三個可選項、篩選 chip 只剩三個;(c) 缺額三顆按鈕可點且送出值正確、hint 存在;(d) 既有「對拉」球局在編輯表單仍可儲存。先跑證明紅。
- [ ] **T5.2**:建局表單第一題改寫 + 三句說明。
- [ ] **T5.3**:打法收斂為三項 + 說明句;編輯表單的既有值保留邏輯;`src/filters.js` chip 同步。
- [ ] **T5.4**:缺額改三顆按鈕 + 「不含你自己」hint;編輯表單同步。
- [ ] **T5.5**:測試轉綠;`create_session` 12 參數呼叫點與 `SessionSummary` 欄位零 diff(契約凍結面驗證);完整 gate 全綠;commit。

**驗收條件:** `venue_type` 三值與 `create_session`／`update_session` 呼叫參數零變更(附 diff 證明);打法可選項為三、篩選 chip 為三;缺額按鈕觸控 ≥44px;「對拉」既有局編輯可儲存的測試為綠;完整 gate 全綠。

---

## 批 6:訂閱球場兩段式簡化

**Files:**
- Modify: `src/sessionViews.js`(`renderMePage` 的通知區訂閱控件)
- Modify: `src/main.js`(訂閱送出邏輯)
- Test: `tests/smoke.spec.js`、`tests/session.spec.js`

**Interfaces:**
- 原生 `<select multiple data-notification-courts>` 改為兩段式:
  - 主控:`<input type="checkbox" data-subscribe-all-courts data-testid="subscribe-all-courts">`「全台北市球場」。
    勾選時送出當下全部台北市 active 球場 id(`state.courts` 已只含 active)。
  - `<button data-toggle-court-picker data-testid="toggle-court-picker">只訂閱特定球場</button>` 展開後,
    以既有 `option-grid` checkbox 樣式列出球場,並顯示「已訂閱 N 座」即時字樣(`role="status"`)。
- 載入時的狀態判定:訂閱數 === 台北市 active 球場數 → 主控勾選且清單收合;否則主控未勾且清單展開。
- `set_court_subscriptions` RPC **不動**(上限已於 202608050001 放寬為當下台北市 active 球場總數)。

**Tasks:**

- [ ] **T6.1 紅→綠**:測試——(a) 勾「全台北市球場」後送出的 id 陣列長度等於球場清單長度;(b) 展開細選可單獨勾選並正確送出;(c) 已訂閱全部時重新載入頁面,主控為勾選狀態且清單收合;(d) 「已訂閱 N 座」隨勾選更新。先跑證明紅。
- [ ] **T6.2**:實作兩段式控件(移除原生 multi-select),沿用 `option-grid` 樣式。
- [ ] **T6.3**:`src/main.js` 送出邏輯與載入時狀態判定。
- [ ] **T6.4**:測試轉綠;390px 觸控 ≥44px;完整 gate 全綠;commit。

**驗收條件:** `src/` 中 `data-notification-courts` 的原生 multi-select 零命中;全選送出的 id 數等於台北市 active 球場數;RPC 呼叫簽名未變;完整 gate 全綠。

---

## 批 7:出席回報的用途——中性聚合數(唯一 migration)

**Files:**
- Create: `supabase/migrations/202608060001_trust_counts.sql`
- Modify: `src/dataApi.js`(兩個 view 的欄位常數與 mapper)
- Modify: `src/sessionViews.js`(加入前名單、球友卡、球友名單列的顯示)
- Test: `supabase/tests/session_rls.sql`、`tests/session-data-boundary.test.js`、`tests/session.spec.js`、`tests/smoke.spec.js`

**Interfaces:**
- `public.session_join_preview` 新增末欄 `hosted_played_count integer`:
  該列 profile 作為 host 且 `sessions.status = 'played'` 的球局數。以相關子查詢取得,不加觸發器、不加快取欄位。
- `public.player_directory` 新增末欄 `played_count integer`:
  該 profile 以 `status = 'accepted'` 且 `played_confirmed = true` 參與的球局數。
- 兩者皆為 `create or replace view`,新欄位**置於既有欄位之後**,權限與 where 條件逐字保留
  (`session_join_preview` 的 `auth.uid() is not null`、`player_directory` 的 directory gate 與 viewer 互惠條件)。
- `src/dataApi.js` 的 `SESSION_JOIN_PREVIEW_COLUMNS` 與 `PLAYER_DIRECTORY_COLUMNS` 同步新增欄位,
  mapper 產出 `hostedPlayedCount` / `playedCount`(以 `Number` 正規化,null → 0)。
- UI 顯示規則:**N === 0 時不顯示該行**;文案為中性事實——
  主揪列「已成局 N 次」、球友列「已打 N 場」。不顯示比率、星等或排名。
- 推播文案修正併入本 migration:`guest_request_reviewed` 的婉拒 body
  由「你的加入申請未被接受。」改為「你的加入申請已被婉拒。」(定詞表)。

**Tasks:**

- [ ] **T7.1 紅→綠(pgTAP)**:`supabase/tests/session_rls.sql` 加——(a) 匿名對 `session_join_preview` 與 `player_directory` 仍無 SELECT 權限;(b) `hosted_played_count` 在 0／1／多場 played 時數值正確;(c) `played_count` 只計 accepted 且 played_confirmed;(d) **`session_discovery` 欄位集合與數量未變**(防止數字外洩到匿名面)。`plan(N)` 同步調整。先跑證明紅。
- [ ] **T7.2**:撰寫 `202608060001_trust_counts.sql`——兩個 view 的 `create or replace`(逐字保留原 where 與權限)+ 推播 body 字串修正。跑 pgTAP 轉綠。
- [ ] **T7.3**:`src/dataApi.js` 欄位常數與 mapper;`tests/session-data-boundary.test.js` 斷言新欄位在 allowlist 內且順序正確。
- [ ] **T7.4**:UI 顯示——加入前名單的主揪列、球友卡、球友名單列;N=0 不顯示;所有插值過 `esc()`。
- [ ] **T7.5**:canary 三拍——把 `hosted_played_count` 加進 `session_discovery` 的 allowlist 應立刻讓 T7.1(d) 轉紅,移除後轉綠;附紅輸出原文。
- [ ] **T7.6**:完整 gate 全綠(含 `npm run test:db`);commit。

**驗收條件:** 匿名 REST 對兩個 view 仍回 42501;`session_discovery` 欄位數與批 6 完成時一致(附前後對照);canary 三拍證據齊(存量綠→違規紅→移除綠);計數正確性有 0／1／多三種案例;推播婉拒文案已改;`git diff supabase/migrations/` 僅新增 202608060001 一檔。

---

## 批 8:定詞表殘餘掃描、NTRP 說明與視覺缺陷收尾

**Files:**
- Modify: `src/sessionViews.js`、`src/sessionController.js`、`src/dataApi.js`(定詞表殘餘字串)
- Modify: `src/session.css`(對比度與字級)
- Modify: `src/pins.js`(球場圖釘描邊)
- Test: `tests/smoke.spec.js`(定詞掃描)、`tests/session-mobile.spec.js`(390px 全綠)

**Interfaces:**
- 定詞表殘餘替換點(前批未觸及者):
  - `mySessionStatus` 的「開放報名」→「開放加入」
  - `mySessionReason` 的「這次參與未成立」→「主揪婉拒了你的申請」
  - 角色標籤「未加入」→「已婉拒」
  - `src/dataApi.js` `ALREADY_REQUESTED` 的「您已申請加入這個球局。」→「你已申請加入這個球局。」
  - `inviteCard` 的「缺 N 位」與 `vacancyLabel` 的「剩 N 位」統一為「缺 N 位」
  - 詳情 sheet 的「檔案已完成／檔案待完成」→「資料完整／資料未完成」
- NTRP 說明句(新增於個人檔案 NTRP 欄位與建局適合程度欄位下方,同一常數):
  「NTRP 是網球程度自評分級:1.0 初學、2.5 能來回對打、3.5 能穩定控球、4.5 以上具比賽水準。」
- 視覺三修:
  - `src/session.css` mist 系容器內的次要文字由 `var(--ink-muted)` 改用新變數 `--ink-muted-strong: #57677c`
    (適用 `.session-contact` 已隨批 1 移除者除外、`.chat-message__meta`、`.chat-session-summary span`、
    `.chat-archived-note`、`.presence-settings .form-hint`)
  - `.chat-message__meta` 的 `font-size: 10px` → `12px`
  - `src/pins.js` `COURT_PIN_URL` 的 `stroke="#99aac1"` → `stroke="#64758b"`
- 詳情 sheet h2「可加入的網球球局」改為球場名(SPEC 未列,屬定詞表衍生;**若 Codex 認為超出範圍則先提案不實作**)。

**Tasks:**

- [ ] **T8.1 紅→綠**:掃描測試——定詞表「不可再出現」欄的六個詞在 `src/**/*.js` 零命中(掃描集非空斷言);先跑證明紅。
- [ ] **T8.2**:逐處替換殘餘字串。
- [ ] **T8.3**:新增 NTRP 說明常數並掛在兩處。
- [ ] **T8.4**:視覺三修(CSS 變數、字級、圖釘描邊)。
- [ ] **T8.5**:掃描轉綠;`supabase-mobile-chromium` 全綠;完整 gate 全綠;commit。

**驗收條件:** 定詞掃描測試綠且掃描集非空;NTRP 說明在兩處可見;對比度以計算證明 `#57677c` 對 `#eef4fb` ≥4.5:1、`#64758b` 對白底 ≥3:1;390px 兩條旅程綠;完整 gate 全綠。

---

## Self-Review 紀錄(2026-08-06)

**Spec 覆蓋**:SPEC 一(主結構)→批 2/3/4;二(表單)→批 5;三(LINE)→批 1;四(訂閱)→批 6;
五(信任數字)→批 7;六(定詞表)→Global Constraints + 批 8;七(視覺三修)→批 8;
八(非目標)→無對應任務(正確);九(驗證條件)→散入各批驗收條件。**無遺漏**。

**佔位符掃描**:零。所有 label、testid、CSS 變數名、檔案路徑皆為具體值。

**型別/命名一致性**:`renderMePage` 的參數在批 2 定義、批 3/4 擴充,名稱與 `renderMySessionsPage` 現有同名參數
一致(平移);`showMePage` 與既有 `showMapPage`／`showMySessionsPage` 同簽名慣例;
新 view 欄位 `hosted_played_count`／`played_count` 與前端 `hostedPlayedCount`／`playedCount` 對應一致。

**已知風險**:
1. 批 3 是最大的一批(四組設定平移),若驗收發現超過一次退件,拆成 3a(球友卡+在線)與 3b(通知+封鎖)。
2. 批 5 的「對拉」既有局編輯——[已驗證] `sessionViews.js:195`／`:247` 共用同一個 `CREATE_PLAY_TYPES`,
   直接收窄會讓既有「對拉」局在**前端驗證**就被擋(不是 DB 錯誤)。必須拆成 create/edit 兩個常數,
   此為批 5 的必測項。
3. 批 7 的 `player_directory` 每列對應一座球場(join `profile_courts`),同一 profile 多列會重複計數欄位——
   顯示端需注意去重,不影響正確性。
