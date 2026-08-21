# design-sync 筆記

- 2026-08-10 首次同步。此 repo 是原生 ES modules app(無 React、無 Storybook、無元件 dist),
  完整 converter 管線無原料可跑;經 user 確認走「手工基線包」:
  token/元件/畫面卡片手寫,樣式逐值抄自 `src/session.css`(計分板 token 層,批 A 產物),
  不重新發明任何值。
- 目標專案:網球球局地圖設計系統(f654e3fc-35d4-4eed-acb0-6210d8f4fac4),首次同步時為空專案。
- 卡片來源目錄 `ds-bundle/`(未提交;要版本化由 user 決定)。
- 畫面截圖用 mock 模式(`.claude/launch.json` 的 mock-design-audit,port 5173),
  本機 Maps key 是佔位,地圖區為清單 fallback 漸層底——截圖如此呈現是本機環境限制,非設計現況。
- 字體(Noto Sans TC / IBM Plex Mono / Barlow Condensed)以 Google Fonts @import 引入卡片;
  未打包 woff2。若 claude.ai/design 端封鎖外部字體,卡片會退回系統字,README 已註明字體名。
- 不產 `_ds_sync.json`(手工 shape 無 keyRecipe;skill 明文允許省略,代價是下次同步全量重驗)。

## 2026-08-11 回同步(v2 D1-D9 完成版,repo HEAD 2685213)

- `_ds_bundle.css` 改為 app stylesheet 逐字複製(src/style.css+src/session.css 全文),
  不再手抄摘錄;token :root 同步存在於 bundle 與 tokens.css(值相同)。
- 卡片 18 張:7 張既有元件卡改 v2、新增 Bricks/Chips 兩張元件卡、畫面卡 9 張
  (5 張刷新+CreateSession/MySessions/Messages/ChatRoom 新增;DrawerHalf 更名 DrawerOpen,
  舊目錄遠端已刪)。
- conventions.md 更新為 v2 正典並逐名 grep 驗證;helper 抓到示範 markup 的
  `.time-tile__clock` 應為 `.time-tile__start`,已修。
- 舊卡曾引用從未進 bundle 的 `.location-button`/`.app-header`/`.city-label`,重寫時已換真實 class。
- 設計 read-back 待問(下次設計 session):訊息列副行時間格式(工程合成式)、
  導覽數字徽章視覺(dc 無對應)、詳情 badge 雙語彙(venue badge+dc badge 並存)收斂。

## 2026-08-21 補充同步(單卡,repo HEAD b7ed4a0)

- 範圍限定:只新增批 19(d54c098,2026-08-20)引入的錯誤處理 UI,其餘既有卡片未重驗
  (自 08-11 基準以來的 CSS 改動經查僅結構重排/死宣告刪除,視覺零變更,詳見對話紀錄)。
- 新卡 **錯誤狀態**(`components/feedback/ErrorStates/ErrorStates.html`):
  `.app-error-notice`(逐字取自 `src/appErrors.ts` showGlobalErrorNotice)、
  `.app-error-fallback`(逐字取自 `src/components/AppErrorBoundary.tsx`)。
- `_ds_bundle.css` 對應插入四條宣告(緊接 `.toast__check` 之後,與本機
  `src/create-session.css` 位置一致);README.md 樣式語彙、元件索引同步補充。
- 未新增 token,沿用既有 `--z-toast`/`--radius-lg`/`--radius-md`/`--color-signal` 等。

## 2026-08-21 重新驗證既有 9 張卡片(repo HEAD 260ef16 起)

- 背景:上次卡片內容基準是 08-11(v2 D1-D9),期間 repo 發生大規模 vanilla→React 遷移
  (sessionViews.js 由 3990 行大量瘦身,新增 src/pages/*.tsx、src/sheets/*.tsx)。用戶要求
  重新驗證剩下 8 張既有卡片(Bricks 除外,原生 CSS 磚無遷移疑慮)。
- **第一輪驗證**(9 個平行 agent,含 Chips 因 schema 異常重跑一次):8 張回報有落差,
  只有 Bricks 完全準確。落差分佈:class 名稱本身無一被改名或刪除(視覺語彙撐過遷移),
  但 demo 呈現的結構、文案、變體覆蓋度大量過時,含一項嚴重項——Sheet 卡片的「建立公開球局」
  子示範其實已變成編輯表單的殘餘外殼(真正建局流程改版成全螢幕 create-v2 chip/stepper 流程)。
- **修正**:8 張卡片依驗證結果逐一重寫(Bricks 不動)。
- **第二輪驗證**(fresh agent,不用原改寫 agent 自驗):8 張仍抓到殘留/改寫時新造的錯誤
  (虛構文案、虛構 data-testid/aria-label、citation 行號錯誤等),只有 BottomNav 過關、
  Sheet 無需改動(唯一落差是本機 ds-bundle/ 沒有 screens/ 目錄造成的假陽性,遠端專案實際有)。
- **修正**:依第二輪結果對 Buttons/Chips/SessionCard/Chat/Toast/Tokens 六張再修一輪。
- **第三輪驗證**(針對六張修正過的卡片再次 fresh agent 覆核):確認前兩輪落差全部修正
  無誤,但抓到新的小疵(CSS 選取器鏈虛構、hit-area 數學敘述誤導、player-card 兩個 span
  順序顛倒、Chat 卡缺 5 個一定會渲染的 data-* / aria-live / tabindex 屬性與兩個整段隱藏
  元素、Toast 卡文字自相矛盾、Tokens 卡 --elevation-2 消費端誤植「抽屜」)。
- **修正**:六張再修一輪,本機截圖覆核渲染無異常,已上傳。三輪修正+驗證後停止迭代
  (第四輪預期只會抓到更瑣碎的細節,報酬遞減)。
- 未變更:Bricks、BottomNav、Sheet 三張(Sheet 已於第二輪驗證確認準確)。
- 品牌文案落差(球局地圖→球咖,08-15 改名)已在 BottomNav 卡修正;design-sync 專案本身
  名稱「網球球局地圖設計系統」與 conventions.md/README 標題仍用舊名,是否要一併改名
  待 user 決定,本輪未動。
