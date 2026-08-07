# 批 B：UX Quick Wins × 7 ＋ 批 A 殘值清理 — Design Spec

日期：2026-08-07
狀態：待 user 核可
前置：批 A（計分板換皮）已 user 驗收（92a1405..35d44fd）。本批七項 quick wins 於
2026-08-07 拆批決策時已核可為批 B 內容；本 spec 把每項落成可驗收的行為契約。
來源：重設計基線審計 UX 痛點清單與 final review 帶走清單。

## 原則

- 不動三級 gate 語意、不動任何 RPC／view 契約、不新增資料面。
- 允許小幅 DOM 變更（checkbox 化、摺疊），但欄位 name、表單驗證、submit payload 不變。
- 每項獨立 commit；`npm run test:mock` 全綠；動到的行為補對應斷言。

## B1 My Sessions 徽章計 needsAction 全量

現況：徽章只計 host-request（`sessionController.js:229` `pendingHostRequestCount`），
guest 收到邀請不亮徽章，邀請容易放到過期。
改為：徽章 = `needsAction.length`（既有分群：host-request＋invite＋guest-request，
`sessionController.js:171-228`），與「我的球局」頁「需要你處理 N 項」同一數字。
`main.js:493` 取值端與徽章 aria-label 同步改寫；`pendingHostRequestCount` 若無其他
consumer 即改名 `needsActionCount`（改名前 grep 全 consumer）。
驗收：mock 測試斷言「有未回覆邀請時徽章亮且數字含邀請」。

## B2 探索空狀態情境渲染

現況：`renderDiscoveryEmpty`（`sessionViews.js:1646-1653`）永遠並排四顆按鈕。
改為：「清除篩選」只在目前篩選非預設時渲染；「重新載入」只在錯誤態渲染；
「擴大地圖範圍」與主 CTA「開第一局」恆在。
驗收：mock 測試分別斷言預設無篩選（兩顆）與有篩選（三顆）兩種渲染。

## B3 個人檔案「常打球場」checkbox 化

現況：directory gate 關鍵欄位用原生 `<select multiple size="4">`
（`sessionViews.js:2397`），53 座球場無搜尋、桌機需 Ctrl+click。
改為：改用與「我」頁球場訂閱同款的 checkbox 清單樣式（`#notification-court-picker`
的 option-grid＋`:has` 選中態，批 A 已換皮）；欄位 name `profile-courts` 與送出
語意（court id 陣列）不變；44px 觸控與鍵盤可及性沿用 option-grid 既有行為。
驗收：既有 profile gate 相關 mock 測試綠；新增斷言「勾選兩座球場送出的 payload
與原 multiple select 等價」。

## B4 建局表單選填摺疊

現況：開球局 sheet 11 組欄位單頁全展（`sessionViews.js:2461` 起）。
改為：「適合程度（NTRP 上下限）」「費用說明」「備註」三個選填包進一個
`<details class="form-optional">`（summary 文案「進階設定（選填）」）；欄位 name、
驗證、預設值完全不動；`<details>` 預設收合，展開狀態不需記憶。
驗收：既有建局 mock 測試綠（測試若以可見性選 input，須同步展開 details——
以行為斷言為準）；新增斷言「摺疊收合時送出，選填值仍以預設進 payload」。

## B5 首訪文案

現況：收合抽屜摘要 0 場時只有「移動地圖或調整篩選條件…」（`sessionViews.js:1595`）。
改為：未登入且 0 場時，改為一句產品說明：
「找台北市的公開網球球局，看到合適的直接申請加入。」（純文案替換，同一節點）。
已登入或有場次維持現行文案。
驗收：mock 斷言未登入 0 場時 summary-detail 含「公開網球球局」。

## B6 空狀態球場訂閱捷徑

現況：球場訂閱埋在「我」頁通知設定深處，探索側零入口。
改為：`renderDiscoveryEmpty` 加一顆次要按鈕「有新球局時通知我」→ 導向「我」頁
並捲動聚焦通知設定區（沿用既有 `showMePage`＋focus 機制，未登入者先走既有登入
intent）。不新增 RPC／view；訂閱本身仍在通知設定區完成。
驗收：mock 斷言按鈕存在且點擊後 me 頁通知設定區獲得焦點。

## B7 地圖頁 min-height 調降

現況：`session.css:594` `.map-page { min-height: 620px; }` 使 667px 高機種
（iPhone SE 類）整頁多出垂直捲動，地圖手勢與頁面捲動互相干擾。
改為：`min-height: min(620px, calc(100dvh - 60px))`。
驗收：Playwright 以 667px 高視窗斷言 `document.documentElement` 無垂直捲動；
390×844 現有測試不退化。

## B8 批 A 殘值清理（final review 帶走清單）

- 地圖底 `#dfeefa` 漸層、backdrop `rgba(11,28,50)`、`.player-layer-status`
  （`session.css:119`，舊 navy rgba＋`font-weight:800`）換計分板 token。
- 完成後 `tests/legacy-style-scan.test.js` 的 BANNED 加 `"20, 44, 75"` 與
  `"11, 28, 50"`（rgba 舊 navy 家族），canary 三拍重驗。
- `#map-data-status--loading/--warning` no-op 修飾規則清除。
- `--font-body` 決策：`body` 選擇器改引 `var(--font-body)`（style.css），或刪
  token——實作時二選一並記錄。
- Google Fonts link 補 IBM Plex Mono 700 或把 mono 節點字重降 600——二選一。
- `.player-directory-row__online/__self` 綠色語意化補記入 commit 訊息（T8 欠帳）。
- eyebrow／區段標題套 `var(--font-display)`（Barlow Condensed，中文自動 fallback）：
  依方向案落地到 `.panel-title` 類 eyebrow 節點；實作時逐選擇器列清單再套。
驗收：反掃 grep 零殘留＋canary 紅綠證據；`test:mock` 綠。

## 邊界

- B1 徽章語意、B6 捷徑均不觸發新通知、不動 notification_prefs／outbox。
- B3／B4 是 DOM 變更批次：modal/drawer 的 role/label、Tab trap、Escape、focus
  還原斷言（testing.md 規則)必須維持綠；動到的 drawer 測試同步更新。
- 隱私與產品邊界照舊（CLAUDE.md）；文案不得引入 LINE／私訊／別城市。

## 非目標

批 C 四項結構重排；public/ 三檔舊品牌債（獨立 chip task_9529d3d7）；
dark mode；任何 RPC／view／migration。

## 假設（user 掃過勾錯）

1. B1 徽章計「全量」含 guest-request（自己可撤回的申請）——與頁面「需要你處理」
   同數字。若你只要 host-request＋invite，B1 改兩類。
2. B4 摺疊 summary 文案「進階設定（選填）」、B5 產品說明句、B6 按鈕文案
   「有新球局時通知我」三句文案照此用字。
3. B8 的 `--font-body`、Plex Mono 700 兩個二選一交實作者判斷後記錄，不再回問。
