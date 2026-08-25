# bundle 批派工單：F4-3 組成分析→拆分＋附帶 fail-closed unit 補測

- 日期：2026-08-25
- 路線圖：`docs/arch-roadmap-2026-08-25.md` 階段 5；母派工單 F4-3 條目
- 開工基準：以當前 origin HEAD 為準（`991c3fe` 之後）
- 順序**必須**：先出組成報告、依報告拆、最後擴 gate——不先看報告不落刀。
  每子項至少一個 commit、每刀跑 `npm run test:session-unit`。

## Ground truth（2026-08-25 實測）

- **現行 chunk**：主 chunk `index-*.js` 661,080 raw／192,693 gzip；
  `sentryBrowserSdk-*.js` 87,975（lazy，gate 強制不得進主 chunk）；
  13 個 lazy surface chunk（最大 MySessionsPage 16,912、MePage 16,125、
  CreateSessionSheet 15,225，其餘 ≤5,469）。
- **gate 機制**：`scripts/check-production-bundle.mjs` 只管主 chunk
  raw≤703,886／gzip≤203,176（E1 基線 639,896/184,705＋10% headroom）、
  Sentry marker 不在主 chunk、demo 識別字缺席；**尚無 per-chunk 與 dist
  總量預算**。它掃既有 `dist/`——**改動後必先 `npm run build` 再跑 check**，
  否則掃到舊產物假綠。
- **vite.config.ts**：無 `manualChunks`；production build 有 mockData alias
  與 `__TENNIS_E2E_TEST_HOOKS__`／`__TENNIS_DEPLOY_ENVIRONMENT__` define，
  拆分不得破壞這三者。
- **載入語意**（3B 落地）：`sessionViews.js:264` `lazySurfaceLoaders` 13 項
  顯式 dynamic import；`pointerover`／`focusin` 暖身、`deferSurfaceOpen`
  延遲開啟／失敗文案、`preloadAuthenticatedViews` 僅登入後觸發。
- **探針陷阱**：production 主 chunk 識別字被 minify，「某模組不在主 chunk」
  的斷言不可 grep 識別字名，要用值或 marker（Sentry marker 先例）。
- rollup-plugin-visualizer 未安裝；允許加 devDependency（回報列版本）。

## F4-3-1 組成報告（先行，獨立 commit）

1. 以 rollup-plugin-visualizer（或等價）產出主 chunk 組成；報告落檔
   `docs/arch-reports/bundle-composition-2026-08-25.md`（模組→bytes 摘要表，
   前 20 大＋分類小計；原始 JSON/HTML 不入版，路徑寫進報告）。
2. 報告要能回答：主 chunk 內最大宗是什麼？私人功能（chat、notification
   設定、directory mutation）與 `src/data/` repositories 各佔多少？
   visualizer 插件只在分析模式啟用，不改 production build 輸出。

## F4-3-2 依報告拆分

1. 拆分目標依報告決定；母單候選方向：`src/data/` repositories 延後載入、
   未登入不載入私人功能。**收益不到位的候選不硬拆**——每刀附「預期收益
   （報告數字）→ 實際收益（build 前後）」對照，收益低於成本的寫明不拆理由。
2. `manualChunks` 只當快取優化用，不當「假拆分」——被 eager import 的模組
   搬進 manualChunks 仍會被首屏載入，不算收益。
3. 載入語意不變：13 項 lazy surface、暖身、`deferSurfaceOpen` 文案、
   Sentry lazy、production mock alias 全部維持；失敗載入的使用者面訊息不變。
4. 既有 e2e 斷言零修改全綠；GOLDEN／testid 凍結面照舊。

## F4-3-3 gate 擴充

1. 主 chunk 基線下修至新實測值＋合理 headroom（附計算式與理由）；
   **驗收底線：主 chunk 較 661,080/192,693 實質下降**，只搬不減不算過。
2. 新增 per-chunk 預算與 dist JS 總量預算（防「拆出去但總量暴增」）；
   總量基線取本批 build 實測＋headroom，附數字。
3. **未登入不載私人功能的 e2e 斷言**：未登入首屏（地圖＋探索）完成後，
   網路面板無私人功能模組請求；機制自選（dev 模組請求或 preview build
   皆可，說明理由），斷言需載重——canary：把一個私人模組改 eager import
   → 斷言紅。
4. gate canary：把一個 lazy 模組塞回主 chunk（或等價）→ per-chunk／主
   chunk gate 紅；紅→還原→綠附輸出。

## 附帶項：b42707e fail-closed unit 補測（地圖批覆蓋債，獨立 commit）

補一條 unit：fake `importLibrary` reject（設 Map ID）→ `loadGoogleMaps`
reject；斷言呼叫端 catch 走 `setMapUnavailable` 降級面（`main.js:682-685`
既有路徑）。canary：把 `map.ts` 的 reject 改回 resolve（恢復 fail-open）
→ 該測試紅；紅→還原→綠附輸出。

## 不在範圍

1. F4-7 長列表節流／虛擬化（階段 6）。
2. 不刪「無 Map ID」legacy fallback；不動 controller／dataApi／殼。
3. 不動 CSP、Service Worker、預載 hint 以外的 index.html 節點。
4. 不改 Sentry 接線與 error transport 契約。

## 驗收與回報

寫成 `docs/arch-dispatch-2026-08-25-bundle-batch-report-codex.md`，不列入
實作 commit、不 push。逐子項：報告摘要、每刀預期／實際收益對照、不拆
理由、gate 新基線計算式、canary 紅→還原→綠、「已刪除／歸零」附反向
grep、未做明說。

**收尾標準矩陣**：`npm run test:ci:frontend`、`npm run test:db`、
`npm run test:local`（did not run＝0）、`git diff --check`；GOLDEN、
`data-testid` 集合、既有 e2e 斷言對 `0be31a2` 維持已核可 hunk。
Playwright 不並發；DB 重置只可用 guarded 指令；bundle 檢查前必先 build。
