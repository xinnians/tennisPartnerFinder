# 長列表批派工單（前半）：F4-7 content-visibility 節流

- 日期：2026-08-25
- 路線圖：`docs/arch-roadmap-2026-08-25.md` 階段 6 前半；母派工單 F4-7 條目
- 開工基準：以當前 origin HEAD 為準（`2246e60` 之後）
- 本批**只做前端渲染節流**；資料層 limit／分頁是獨立 DB 半批（動 view 契約
  與 pgTAP），本批一行資料層都不動。

## Ground truth（2026-08-25 實測）

- `src/` 現況：`content-visibility`／`contain-intrinsic` **零筆**；
  `.limit(` 亦零筆（DB 半批的事，本批不碰）。
- **四個清單面**：
  1. 附近球局 drawer：`src/pages/NearbySessionsDrawer.tsx`＋共用
     `src/components/SessionCard.tsx`。
  2. My Sessions：`src/pages/MySessionsPage.tsx` 三段
     `.my-sessions-list`（needs-action／upcoming／history；
     `pages.css:178` grid）。
  3. 球友目錄：`src/sheets/PlayerDirectorySheet.tsx`。
  4. 群聊 feed：`.chat-feed`（`session.css:200`，overflow-y auto）——
     `sessionSurfaceViews.js:96-107` 的 `scrollFeedToLatest` 以
     `feed.scrollTop = feed.scrollHeight` 置底（double-rAF），未讀清除
     依賴捲動狀態。**containment 改變高度估算會直接打壞這條**。
- Court sheets（`CourtSessionSheet`／`CourtPlayersSheet`）也有清單，量小，
  次要。
- Playwright 語意風險：`content-visibility: auto` 的離屏項目若無
  `contain-intrinsic-size` 會塌成零高，`toBeVisible` 類斷言會紅；部分引擎
  對 skipped content 的 `innerText` 回空。**既有 e2e 零修改是一票否決**——
  任何因此變紅的既有測試都是實作 bug（補 intrinsic size），不是調測試的
  理由。
- Safari 18 前不支援 `content-visibility`，屬 progressive enhancement，
  舊機自然回退全渲染；WebKit 套件維持非阻擋訊號。

## 作法要求

1. **三個清單面必做**（附近 drawer、My Sessions 三段、球友目錄）：
   list **item** 層（非捲動容器）加 `content-visibility: auto`＋
   `contain-intrinsic-size`；intrinsic 值以實測卡片高度為據（回報附
   量測方式與數字，390px 視窗為準）。多行高卡片（如含 badge 的
   SessionCard）說明取值策略（`auto <h>px` 記憶機制優先）。
2. **群聊 feed 個別評估**：只有在「置底捲動、未讀清除、封存唯讀」三個
   既有 e2e 全綠且置底行為有 live 驗證證據時才做；否則**明文緩辦**並
   說明原因（預期結論可為緩辦——feed 逐則高度變異大且捲動語意脆）。
3. **守門測試**：新增靜態 CSS 契約測試——逐一綁定「清單 item selector ↔
   content-visibility＋contain-intrinsic-size 兩屬性」，掃描集非空自證；
   fail-closed 雙向 canary：(a) 拔掉一個屬性 → 紅並點名 selector；
   (b) 改名一個 selector 使掃描漏接 → 紅。紅→還原→綠附輸出。
4. **CSS 只增不改版面**：不改既有 layout／間距／視覺 token；
   `contrast-tokens` 與（上批新加的）色票同源 gate 零修改綠。
5. **390px 慢網路走查**：以 dev（mock 資料）在 390px 視窗走四清單面，
   回報渲染節流的實測證據（方式自選：DevTools rendering stats、
   長清單注入前後的 scripting/rendering 時間對照等；說明量測法與侷限，
   不可只貼「感覺變快」）。
6. 既有 e2e 斷言零修改全綠；`data-testid`／aria 全保留。

## 不在範圍

1. 資料層 limit／分頁、view 契約、pgTAP（DB 半批另發）。
2. 虛擬化（母單明文「不過早虛擬化」）、無限捲動、骨架屏。
3. 地圖、bundle chunk 策略、controller／dataApi。
4. `mockData.js` fixture 不擴充；量測用長清單以臨時注入為之、跑完即刪。

## 驗收與回報

寫成 `docs/arch-dispatch-2026-08-25-longlist-batch-report-codex.md`，不列入
實作 commit、不 push。逐清單面：改了哪個 selector、intrinsic 值與量測依據、
群聊 feed 的做／緩辦決定與證據、canary 紅→還原→綠、量測法與數字、
未做明說。

**收尾標準矩陣**：`npm run test:ci:frontend`、`npm run test:db`、
`npm run test:local`（did not run＝0）、`git diff --check`；GOLDEN、
`data-testid` 集合、既有 e2e 斷言對 `0be31a2` 維持已核可 hunk；
`npm run test:mock:webkit` 跑一輪回報結果（非阻擋）。
Playwright 不並發。**test:local 若見「find two unused Taipei courts」或
訂閱 checkbox 逾時＝本機 fixture 累積污染**（今日已重置過一次），
先數 DB 再以 guarded `CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test`
重置並在回報揭露，不可靜默重試。
