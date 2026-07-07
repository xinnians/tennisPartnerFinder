# 開發行程 Roadmap（競品重盤後）

日期：2026-07-08
狀態：已核准，為**排程 source of truth**（批次順序與驗收條件以本檔為準）
關聯：`docs/mvp-plan.md`（planning SoT，指向本檔）、
`docs/superpowers/plans/2026-07-07-session-first-and-court-guide-plan.md`（schema/UX 設計正文，本檔 §4 有三條技術修正）

---

## 0. 一句話

發現競品 baseline.tw 後全盤重盤：session-first 方向**保留**（被獨立驗證），差異化改押
「**地圖上的人＋accepted 才互露 LINE＋一熱區深度指南**」，深度指南（SEO 獲客資產）排第一批，
之後依批次完成 sessions 重構直到私測 beta 就緒。

---

## 1. 為什麼重排（2026-07-08 競品查證，附來源）

### baseline.tw（新發現的直接競品）

- 雙北網球免費 Web 工具：112 座球場庫＋地圖（圖釘=球場）＋官方同源租借時段查詢
  （臺北體育局、新北高灘地）＋球場周邊 CCTV 路面＋**session 制揪團**（缺 N 人、
  程度門檻「2.5 以上」、報名後站內討論串、加入後互看球員卡、不露 LINE ID）＋
  比賽記錄與自有 Baseline Rating。LINE 一鍵登入、無 App、無金流、無教練端。
  來源：baseline.tw 的 /about、/map、/venues、/venue/210、/play、/play/1、/ground、/matches（2026-07-08 抓取，經第二輪反駁式查核全數 CONFIRMED）。
- **Traction 趨近於零**：域名 2026-05-24 才註冊（TWNIC whois；crt.sh 憑證同日簽發），
  全站僅 1 筆招募中球局，PTT/FB/IG/Threads/新聞查無提及，站上不署名
  （whois 指向小型科技有限公司＋個人 gmail）。6 月中仍在部署新子網域＝活躍開發中。
- 它的球場頁**很薄**：位置＋租借連結＋CCTV，無面數/材質/燈光/費用/搶場規則（抽查 /venue/210、/venue/1060）。

### LoveTennis（lovetennis.tw）現況更新

- 還活著：找球友列表 229 位球友；新增「揪球開團」活動頁（**0 場活動**）與
  Coach Matching 入口；仍無地圖。「純卡片制」舊假設已部分過時。

### 其他

- 未發現其他 2025–2026 新進台灣網球媒合服務。
- LINE openchat 揪球群仍是主流管道（可驗證單群 132–620 人、多群並存）；群主簡介
  自述痛點與我們假設一致（「找伴找場地很辛苦」「需提前二天以上相約」）。

### 對舊假設的衝擊

| 舊假設（07-07 計畫） | 查證結果 |
|---|---|
| 直接競品只有 LoveTennis | **推翻**——baseline.tw 比 LoveTennis 更像我們 |
| 差異化＝地圖＋球場指南內容 | **大半推翻**——地圖與 112 座球場庫它都有；**指南深度**它沒有 |
| session-first 是我們的新方向 | 它已上線雛形——反而**驗證了需求判斷**（兩個獨立團隊收斂到同一形狀） |

反面教材（排程依據）：baseline 出貨了 session 功能但沒有獲客層 → 全站只有 1 團。
零流動性市場裡媒合迴圈自己不會帶來用戶，**獲客資產（指南）排第一批**。

---

## 2. 重定位後的差異化

1. **以「人」為單位的地圖探索**——baseline 地圖上沒有人、LoveTennis 有人沒地圖；
   這格目前全市場只有我們佔（且是已出貨的程式碼）。
2. **一熱區深度球場指南**——費用/搶場規則/材質/面數/燈光/尖離峰，
   可被 Google 索引的落地頁＝零用戶也運作的被動獲客管道。
3. **Mutual-consent 聯絡揭露**——accepted 才互露 LINE，把對話送回 LINE；
   對比 baseline 的站內討論串（冷啟動期站內訊息易成死城）。

## 3. 已鎖定決策（2026-07-08 與創辦人逐題確認）

| 決策 | 結論 |
|---|---|
| 大方向 | 組合拳：sessions 照做＋深度指南當獲客資產 |
| 專案目標 | 做出真有人用的產品（traction 優先） |
| 行程單位 | 開發批次（一個 session 一批＋可證偽驗收條件，不綁日期） |
| partner_requests | 直接被 sessions 取代（不並行） |
| 缺額 UI | v1 一開始就開缺 1–3 |
| 第一熱區 | Batch 1 開工時定案（建議大安–中正＋錨點台北網球中心——皆在現有 6 座 seed 內，避開新增球場的 migration/pgTAP/mock 連鎖） |
| 變現 | 續暫緩（07-03 計畫維持 deferred） |
| 本輪不排 | LINE OA 通知層、比賽記錄/積分、PTT 聚合層 |

---

## 4. 對 07-07 計畫的三條技術修正（實作 Batch 2 時必讀）

1. **`session_contacts` 不能用 `security_invoker`**：invoker 語意下 profiles 的
   owner-only SELECT 政策會讓對方的 profiles 列永遠讀不到 → view 恆為空，雙方
   accepted 也拿不到 LINE。改 **definer view**＋view 內建
   `viewer.user_id = auth.uid()` 與雙方 accepted 條件，**grant 只給 authenticated**
   （同現有 `public_profile_discovery` 的既定模式）。行為驗收（pgTAP）不變。
2. **participant status 需加 `'invited'`**：否則「本人可把自己列改 accepted」＋
   「host 列開局即 accepted」＝任何人可對任何 open 球局 self-join＋self-accept，
   繞過雙方同意直接拿到 host 的 LINE ID。用 BEFORE UPDATE trigger 分流：
   `requested→accepted/declined` 只准 host；`invited→accepted/declined` 只准本人；
   `→withdrawn` 只准本人；`played_confirmed` 只准本人且 status='accepted'。
3. **補 roster view `session_participant_profiles`**（definer、**不含 line_id**）：
   host 的「接受請求」介面要看報名者暱稱/NTRP，而 profiles 是 owner-only、
   participants 只有數字 id。可見範圍：該局 host、本人、以及 accepted 參加者之間。

---

## 5. 開發批次

> 負責人：〔C〕Claude session 可完成；〔U〕需創辦人人工（決策/查證把關/營運）。
> 批間 app 保持可跑，每批結尾全測綠才收工。

### Batch 1 — 深度指南＋SEO 落地頁（獲客資產，不碰 DB）

- 開工決策〔U〕：熱區定案（建議大安–中正）；canonical domain（自訂網域 vs 續用
  vercel.app；SEO 信任度考量建議買網域）；slug 命名（ASCII、一旦收錄永不改）。
- 內容查證〔C+U〕：4-5 座球場的費用/預約方式/搶場規則/材質/面數/燈光/尖離峰，
  來源 vbs.sports.taipei、tsc.taipei 等官方頁，每筆記 `verifiedAt`＋`sourceUrl`
  （Claude 網路查證、創辦人抽查把關；費率會變，建議每季重驗）。
- 實作〔C〕：
  - 新增 `src/courtGuide.js`：指南內容**唯一 SoT**（key＝court name 沿用既有
    join-key 機制＋不可變 `slug`；欄位鏡射計畫中的 court_details）。
  - 新增 `scripts/build-court-pages.mjs`：`vite build` 後從 courtGuide 產
    `dist/courts/<slug>/index.html`（純靜態、inline CSS、JSON-LD
    SportsActivityLocation、canonical/OG、頁尾互鏈）＋ `dist/sitemap.xml`。
    重用 `src/util.js` 的 `esc()`/`safeUrl()`（已驗證 Node 可直接 import）。
  - `package.json`：`"build": "vite build && node scripts/build-court-pages.mjs"`
    （產生器必須在後——vite build 會清空 dist）＋`build:pages`。
  - 新增 `public/robots.txt`（Sitemap 指向）；`index.html` 補 meta description。
  - `src/sheets.js`：球場抽屜加指南摘要區塊＋「完整球場指南」連結（整頁跳轉）。
  - `src/main.js`：`init()` 加 `?court=<slug>` deep-link（pan＋開抽屜；未知 slug
    靜默略過，維持 console 零錯誤政策）。
  - 落地頁**不載 Google Maps JS**（靜態文字＋免 key 的 maps.google.com 連外），
    referrer allowlist 不用動。
  - **court_details DB 表本批不建**：bundled SoT 結構性防止落地頁/抽屜內容漂移；
    真出現「免 redeploy 改資料」需求才建表（屆時 seed 由 script 從同一份資料產生）。
- 驗收：
  - `npm run build` 後 `dist/courts/<slug>/index.html` 存在，`grep 費用` 直接命中
    （內容不靠 JS 渲染）；`dist/sitemap.xml` 列出 1＋N 個 URL。
  - `npm run preview` 開 `/courts/<slug>/` 內容完整；CTA 回 `/?court=<slug>` 開出抽屜。
  - `npm test` 全綠＋console 零錯誤（先讀 `.claude/rules/testing.md`）；smoke 加
    deep-link 斷言。
  - 部署後 `curl -I` 確認 production 回應無 `X-Robots-Tag: noindex`。

### Batch 2 — sessions schema＋讀路徑＋開局（快速約球下架）

- 新 migration `supabase/migrations/202607080001_session_first_schema.sql`，依序：
  1. `alter table reports drop column partner_request_id` →
     `drop table partner_requests` →（建完 sessions 後）
     `alter table reports add column session_id bigint references sessions on delete set null`＋index。
  2. 建 `sessions`＋`session_participants`：DDL 沿用 07-07 計畫 §4＋`'invited'` delta（本檔 §4-2）。
  3. RLS＋grants：anon 只讀 `open`＋未過期 sessions；host 與參加者可讀自己相關的
     **所有狀態**（順修「owner 讀不到自己 closed rows」舊 gotcha）；participants
     **不 grant anon**；用 `security definer` helpers（`viewer_profile_id()`、
     `is_session_host()`，`set search_path=''`）防 RLS 循環；BEFORE UPDATE trigger
     管狀態轉移（本檔 §4-2）；`set_updated_at` trigger 掛兩張新表；
     **顯式 grants＋sequence grants 重跑**（舊 migration 的 grant 是執行當下快照）。
  4. `public_profile_discovery`：**drop 再 create**（`create or replace view` 不能
     移除欄位）拿掉 `line_id`，**重下 grant**。
  5. `session_contacts`（definer，本檔 §4-1）＋`session_participant_profiles`
     （definer roster，本檔 §4-3）。
- pgTAP：刪 `quick_contact_rls.sql`，新 `session_rls.sql`。關鍵條：
  guest self-accept 被 trigger 擋（全計畫最關鍵一條）；accept 前雙方查
  session_contacts 皆 0 列、accept 後各恰 1 列；anon 查 discovery 無 line_id 欄、
  查 participants/contacts/roster 直接 42501；anon 只見 open＋未過期
  （seed open/expired/cancelled/full 各一）；reports 走 session_id＋spoof 被拒。
- 前端**必須同批**（partner_requests 一 drop 舊讀路徑就 404）：
  - `dataApi.js`：`loadOpenSessions` 取代 `loadActivePartnerRequests`；
    `createSession`（insert session→host participant→可選 invited 列；
    **`expires_at`＝`start_at` 由前端設**，欄位無 DB default）；`createReport`
    參數/欄位改 `session_id`；`mapDiscoveryRow` 刪 `lineId`；`mapSessionRow` 新形狀。
  - `mockData.js`：`DEMAND_PINS`→`MOCK_SESSIONS`（同 mapper 形狀、無 sessionId
    ——沿用「mock 缺 Supabase-only id 時互動早退」慣例）；六筆 `lineId` 刪除。
  - `pins.js` 「徵」→「局」；`map.js` kind 改名；`filters.js` 類型 chips 開始作用
    於 sessions＋NTRP 改**區間重疊**判斷（雙 null 照舊全過）。
  - `sheets.js`：demand sheet→session sheet（時間/類型/缺 N 人/NTRP 範圍/notes；
    **不露 host 暱稱**；「查看原貼文」external-source 流程退場）；發布 modal→
    開球局 modal（球場 select＋play_type＋`datetime-local`＋缺額 1–3＋NTRP 範圍
    ＋notes；按鈕 id `publish-request` 不改、文字改「開球局」）；刪
    `openQuickContactModal`＋`buildPlayerOpener`（**保留 `copyToClipboard`**）。
  - 文案連動：index.html 分享/LINE hint、main.js 空狀態訊息（smoke 有直接斷言，一併改）。
  - 測試：smoke/supabase spec 依新流程改寫（詳見 07-07 計畫＋本批設計）。
- 批尾：local `db reset`＋pgTAP＋`npm test` 全綠才 `npx supabase db push` 到 hosted。
- 驗收：三套測試全綠；anon REST 查 discovery 回應不含字串 `line_id`、
  `/rest/v1/partner_requests` 回 404；`grep -rn "快速約球" src/` 無結果。

### Batch 3 — 參與迴圈＋「我的球局」tab（mutual-consent 介面）

- `dataApi.js`：`joinSession`／`acceptParticipant`／`declineParticipant`／
  `acceptInvite`／`declineInvite`／`withdrawFromSession`／`cancelSession`／
  `loadMySessions`（mock 回空，比照 loadCurrentProfile 慣例）／`loadSessionContacts`。
- UI：**第三個 tab「我的球局」**（沿用 `switchTab` 通用機制；不放 profile 內——
  那是表單頁版型）。我開的局：roster（來自 roster view）＋requested 列接受/婉拒、
  accepted 列露 LINE＋複製鈕、取消球局。我報名/受邀的局：狀態徽章（等待確認可退出
  ／受邀接受婉拒／已成局露對方暱稱+LINE）。**發現機制＝pull**：登入初始化拉
  pending 數畫 tab 紅點 badge＋切 tab 重拉＋手動重新整理鈕（明確接受無推播的 MVP 限制）。
- 球員卡 CTA「快速約球」→「**邀請加入球局**」：開邀請模式的開球局 modal
  （預選對方常出沒球場、submit 帶 inviteProfileId）；沿用
  `ensureSignedInAndCompleteProfile` 門檻；mock/缺 profileId 時 toast 早退。
- 驗收：兩條 Playwright journey 綠——①A 開局→B 報名→accept 前任何頁面
  `not.toContainText`(對方 LINE)→A 見 badge 與請求→接受→雙方各見對方 LINE；
  ②邀請 journey 同構。mock 模式 smoke 全綠（零 console error）。

### Batch 4 — 成局回報＋分析＋清理收尾

- `confirmPlayed`：start_at 過後顯示「打成了」；host 確認同時 `status='played'`。
- 北極星（每週成局數）／同伴回訪率 SQL（07-07 計畫 §4 已寫好）收進 docs 固定位置。
- 清理：刪無呼叫端死碼（`sourceLabel` 等，PTT 聚合層備用者需明註原因）；
  CLAUDE.md 全面校正（product principle 反轉：line_id 改為 **DB 級 secrecy
  boundary**；shared enums 補 session/participant status）＋`wc -l` ≤200；
  mvp-plan 實作狀態翻轉。
- 驗收：成局 journey 後 psql 跑北極星 SQL 回傳本週 1；
  `grep -rn "partner_request\|快速約球" src tests supabase/tests` 無結果；全測綠。

### Batch 5 — Beta 就緒〔C+U〕

- 清理 hosted QA 資料（`QA-20260703` request＋相關 report 列——Batch 2 的
  destructive migration 可能已順帶清掉，屆時確認即可）。
- beta 訪問策略定案〔U〕；hosted stable preview 走完
  開局→報名→接受→互露 LINE→打成了 全流程 QA〔C+U〕。
- 種子招募準備〔U〕：LINE 群/朋友圈分發，配合落地頁分享；
  落地頁提交 Google Search Console。
- 驗收：hosted 全流程通過；Search Console 收錄提交完成；beta 名單與訪問方式確定。

---

## 6. 風險池（排程時已知、各批注意）

- `createSession` 三段 insert 非原子，中途失敗留孤兒 session——pre-beta 接受，
  改進方向＝包成 postgres function rpc（v1.1）。
- 公開 session sheet 的缺額顯示 `slots_total` 靜態值，部分成局不遞減直到 full
  下架——精確化需 definer 的 `session_discovery` view（v1.1）。
- 主人發現請求純靠 pull＋badge，轉化率有天花板——LINE OA 通知層列後續 open
  question，本輪不做。
- Vercel preview 部署預設 `X-Robots-Tag: noindex`、production 才可索引
  [推論，Batch 1 部署後 `curl -I` 驗證]；SEO 賭注押在 vercel.app 子網域信任度弱，
  建議買自訂網域。
- 單獨跑 `vite build`（不走 npm script）會漏落地頁——README 需註明。
- `datetime-local` 在 iOS Safari 樣式受限——原型可接受。

## 7. 紅線（不變，沿 07-07 計畫）

- 別爬 FB 私密社團／LINE 群；只做 PTT 公開板＋去識別＋連回原文（且本輪不排）。
- 玩家基本配對永遠免費；要收錢跟供給端收。
- line_id：accepted 才露、**永不露電話**。
- 火力集中一熱區，不攤多城市多運動。
