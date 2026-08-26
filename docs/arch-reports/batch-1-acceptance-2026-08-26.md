# 批 1 驗收紀錄（Messages-only 容器化試點）

- 日期：2026-08-26。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-26-batch1-messages.md`；Codex 回報：
  `docs/arch-dispatch-2026-08-26-batch1-messages-report-codex.md`。
- 驗收方法：本機重跑全套 gate＋production diff 逐檔審閱＋獨立對立審查 agent
  攻測試改寫（含 canary 實證）。

## 結論：**退件（小補件）**——主體通過，測試面四項補正後即 ACCEPTED

補件派工單：`docs/arch-dispatch-2026-08-26-batch1-followup.md`。批 1 與補件一起 commit。

## 通過項（本機重驗全數成立）

1. **Gate 全綠** [已驗證]：`typecheck`／`lint`／`prettier:check`／`build`／
   `check:production-bundle`／`git diff --check` 皆 exit 0；`test:mock` 286 passed／
   4 skipped、0 not-ok；`test:local` exit 0、45 passed／11 skipped、TAP 無 not ok。
2. **Bundle 數字與回報逐字一致** [已驗證]：main 655,171／191,672（gzip 餘 748 B）、
   total 842,192／256,851（餘 2,211 B）、lazy 上限不變；淨增 +340 B gzip 已誠實揭露,
   在 gate 內。
3. **收線完整** [已驗證]：`renderMessagesPage`／`mountMessagesDestination`／
   `EMPTY_MESSAGES_GROUPS`／`MessagesPageOptions`／`messagesPages` 於 src、tests 反掃
   0 命中；main.js／sessionViews.js／pageViews.js／App.tsx 四層 adapter 鏈全退。
4. **Provider 契約合格** [已驗證]：`useAppServices` 不 export、hooks 型別自
   `ControllerApi`／`SessionControllerState` 切片、selector 沿用
   `selectControllerMySessionsView`、courts 走 store channel 無新資料路;
   `configureAppServicesInApp` 有防替換 guard。boot 序核對:所有 render adapter 呼叫
   都在 `configureAppServicesInApp`（main.js:763）之後。
5. **凍結沿用** [已驗證]：route `:192`、`messages-row-*` testid、
   `surface="messages-page"` boundary、lazy import、空狀態文案、`syncCommit` 恰 3 處未動。
6. **Oracle 保真（對立審查）** [已驗證]：焦點測試改寫後同 node identity＋持焦＋connected
   三斷言俱在，rerender 改為真實 store emit（比原版更真實）；canary 實證有牙——改
   row key 強制換 node 測試立即轉紅，還原後 diff 歸零。navigation-shell 斷言謂詞全保留。
7. **無測試後門** [已驗證]：harness 走 dev server `import("/tests/...")`＋Provider prop
   注入，production dist 不可達；`__tennisE2ETestHooks` 守門與 `e2eTestHooks.ts` 零變更。
8. **無 flaky 反模式** [已驗證]：`expect.poll`／auto-retry／retryAssertion，無裸 sleep。

## 退件項（全在測試面，production 碼不動）

1. **指標誠實性（主因）**：`react-page-focus.spec.js` 三處 `__importAppModule("x")` 被改拼
   為 `await import("/src/x.js")`（`:21`、`:121-124`），白箱耦合仍在，只是躲過計數
   regex；其中 `:121-124` 兩處屬 created-session／MySessions 測試，**與本批 Messages
   範圍無關**。141→136 的 −5 中只有 navigation-shell 的 −2 是真退役。回報 §4 未揭露。
   修正：還原拼法，讓 `__importAppModule` 計數回到「真退役才下降」的口徑。
2. **覆蓋缺口**：rows→empty 的同樹轉換原由 adapter 重渲染覆蓋，改寫後變成 unmount＋
   驗空 root，list→empty reconciliation 分支失去覆蓋。修正：harness 補 emit 空
   `mySessions` 後斷言 empty 出現。
3. `messages-page-dom.test.js` hooks unit 用 loose `assert.deepEqual`，`[42]` 可過
   `["42"]`；改 `deepStrictEqual`。
4. `react-page-focus.spec.js:6` 的 `installAppModuleImporter` beforeEach 已無消費者，
   死設定順批清除。

## 補件驗收（2026-08-26 同日）：**ACCEPTED**——批 1 全案結案

- 補件回報：`docs/arch-dispatch-2026-08-26-batch1-followup-report-codex.md`。
- B1-FU-1 [已驗證]：三處還原 `__importAppModule` 拼法（react-page-focus 回到 3 處），
  總計數 **139**＝141 − navigation-shell 真退役 2；殘餘 `/src/` 直呼僅存量
  `sessionStore.ts` 一處（`:143`），未越界。**139 取代 136 成為新觀察基準。**
- B1-FU-2 [已驗證]：已掛載 Messages tree 上 emit 空 `mySessions`→斷言
  `.messages-page__empty` visible＋既有文案（`react-page-focus.spec.js:112-117`），
  auto-retry 斷言。
- B1-FU-3 [已驗證]：兩個 hooks unit 改 `deepStrictEqual`（`:130`、`:156`）。
- B1-FU-4 [已驗證]：`installAppModuleImporter` 保留正確——拼法還原後本檔重新有 3 個消費點。
- 範圍 [已驗證]：src diff 與批 1 主體逐檔一致（5 檔、34+／98−），補件零 src 變更。
- Gate 本機重跑 [已驗證]：typecheck／lint／`git diff --check` exit 0；mock 286 passed／
  4 skipped、0 not-ok。

## 量化（更正基準表延伸）

- `__importAppModule`：141→136（本批實測），但其中 −3 為拼法變更——**補件還原後以
  補件驗收的重測值為新基準**，本欄暫不採 136。
- 接線層數：Messages 更新路徑 5 檔 5 層→3 檔 3 層 [已驗證：diff 對照]。
- 五問結論可信；「此模式適合複製」的判斷留待批 2 選頁引用。
