# 批 2B 驗收紀錄（MySessions app 服務承載＋焦點管道收斂＋adapter 退役）

- 日期：2026-08-26。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-26-batch2B-mysessions.md`；Codex 回報：
  `docs/arch-dispatch-2026-08-26-batch2B-mysessions-report-codex.md`。
- 驗收方法：本機重跑全套 gate＋production diff 審閱＋對立審查 agent（機械 diff 保真
  ＋canary）。

## 結論：**ACCEPTED**（程式碼零退件；回報文件兩處缺陷由本紀錄勘誤，見尾節）

## 通過項

1. **Gate 全綠** [已驗證]：typecheck／lint／prettier／build／bundle／`git diff --check`
   exit 0；`test:local` 45 passed／11 skipped；mock 見下述 flake 事件後重跑
   286 passed／4 skipped、0 not-ok。
2. **mock 單次紅＝存量 flake，非本批迴歸** [已驗證]：首輪 `chat-settings-filters-smoke
   :468`（filter sheet 一次性 `querySelectorAll` 不重試）失敗一次。取樣裁決：工作樹
   `--repeat-each=10` 紅 4／10；HEAD `ea9d7b2` 乾淨 worktree 同樣 4／10——同率＝存量
   問題（`reuseExistingServer: false` 排除跨樹 server 污染）。已立獨立修復任務
   （會話任務卡 task_d6de363e），不併本批。
3. **Bundle** [已驗證]：main 654,646／gzip 191,489（**−274 B，餘 931 B**——收 adapter
   鏈回收餘裕）；MySessions lazy 16,481／4,831（＋40 B gzip，頁面自持焦點排程）；
   total 841,242／256,554（**−225 B**，餘 2,508 B）。數字與回報逐字一致，未調 gate。
4. **焦點管道逐字保真** [已驗證]：`src/mySessionsCreatedFocus.ts` 與 HEAD
   `pageViews.js:209-240` 機械 diff——僅簽名與 `querySelector` 泛型正規化差異；
   selector、guest-request 謂詞、one-shot ack 短路、`preventScroll`、rAF 時機、
   批 C3-3／D6 註解全部逐字相同。selector 全庫單一來源（harness clone 已刪，0 殘留）。
   Canary：selector 改錯→created-session 測試立即紅（`toBeFocused` 失敗）→還原
   sha256 相同→綠。
5. **AppServices 設計合格** [已驗證]：typed bundle `{controller, pageViewStore,
   mySessionsApp}`；`useAppServices`／context 不 export；新 hooks 缺注入即 throw
   （fail-closed）；防替換 guard 沿用；`pageViewStore` 為同一實例搬運（`pageViewStore.ts`
   零 diff），MePage 路徑零 diff；4 個 app callback 語意逐字保留（ack 次序：比對 id→
   清空→`publishPageView`→bool）。
6. **adapter 鏈歸零** [已驗證]：`renderMySessionsPage`／`renderMySessionsPageInApp`／
   `mountMySessionsDestination`／`mySessionsPages`／`hasAdapterActionScope`／
   `MySessionsPageOptions`／`onCreatedSessionCommit` 於 src＋tests 全掃 **0**；
   preload 鏈與 hover 預熱凍結完好；`syncCommit` 恰 3 caller 未動
   （`commitPageAdapterSynchronously` 仍服務 me／nearby）；直接 portal 比照 Messages
   （`resetKey=0` 同式）。2A 三個移交觀察全數收掉。
7. **測試面** [已驗證]：`react-page-focus.spec.js` 零 diff，created-session 測試經真
   Provider→真頁面→真焦點模組（canary 紅即實證）；`my-sessions-page-dom.test.js`
   新增 page-view／app-actions 測試 4/4 pass（`deepStrictEqual`＋retry，payload 逐一驗）；
   `__importAppModule` 維持 **122**（0 差），新增 `import("/src` 掃描 0。
8. **凍結沿用** [已驗證]：`showMySessionsPage`／`publishPageView` 機制（含 `:525`
   上游觸發器）、route、testid／`data-my-*`／文案、`surface="my-sessions-page"`、
   MePage／NearbyDrawer 全部零變更。

## 驗收方勘誤（Codex 回報文件兩處，程式碼無涉）

1. **回報 §9「typecheck 涵蓋 harness」為不實**：`tsconfig.json` include 僅 `src/**`＋
   `vite.config.ts`，`tests/*.tsx` fixture（`mySessionsAppHarness`、`messagesAppHarness`）
   不在 typecheck／lint／prettier 任何靜態 gate 內，僅由測試 runtime 覆蓋。此缺口自
   批 2A 引入 harness 起即存在，非本批新增；已列路線圖插批處理。
2. **回報 §2 漏揭露微差異**：`onCreatedSessionFocus` ack 預設參數由 HEAD 的 mount 時
   快照（`= focusSessionId`）改為活值（`= createdSessionFocusId`）。production 排程器
   恆傳明確 id 且有 truthy guard，此路徑不可觸發；語意上反而更正確。留檔備查。

## 批 2 全案量化（2026-08-26 收案）

- main.js 的 MySessions mount 鏈歸零；Messages＋MySessions 皆為「hooks 單源＋直接
  portal」同級。
- main gzip 191,489（餘 931 B，較批 2 開工前的 748 B 回升）；`__importAppModule` 122。
- 剩餘遷移對象：Me、NearbyDrawer（批 3）。
