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
