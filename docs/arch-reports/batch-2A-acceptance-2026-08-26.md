# 批 2A 驗收紀錄（MySessions 資料與 action 單源化）

- 日期：2026-08-26。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-26-batch2A-mysessions.md`；Codex 回報：
  `docs/arch-dispatch-2026-08-26-batch2A-mysessions-report-codex.md`。
- 驗收方法：本機重跑全套 gate＋production diff 逐檔審閱＋對立審查 agent（含 canary）。

## 結論：**ACCEPTED**（一次通過，無退件項；三個非阻擋觀察移交 2B）

## 通過項（全部本機重驗或對立審查實證）

1. **Gate 全綠** [已驗證]：typecheck／lint／prettier／build／bundle／`git diff --check`
   exit 0；mock 286 passed／4 skipped、0 not-ok。
2. **test:local 環境紅一次，非迴歸** [已驗證]：首跑 `session-data-local-api` loopback
   fixture 紅（`assert.ok(summary)` falsy）；取證本機測試 DB 累積 272 筆 sessions
   ＝既知 fixture 污染模式（批 2A 零 dataApi／DB 變更）。依標準流程
   `CONFIRM_LOCAL_DB_RESET=1` guarded reset 後重跑：45 passed／11 skipped 全綠。
   紅→reset→綠三拍完整。
3. **Bundle** [已驗證]：main 655,402／gzip 191,763（＋91 B，餘 657 B）；
   MySessionsPage lazy 16,282／4,791（**−630 raw／−143 gzip**，最緊 gate 鬆到餘 709 B）；
   total 841,792／256,779（**−72 B gzip**）。三組皆 within，數字與回報逐字一致。
4. **收線** [已驗證]：options bag 31→8（恰為派工單保留集）；`MySessionsPageOptions`
   解凍 23 欄全刪；16 個 action 綁定語意（`"accepted"`／`"declined"` payload）逐一保留；
   hooks 型別自 `ControllerApi` `Pick`／`ReturnType` 切片，selector 沿用
   `selectControllerMySessionsView` 投影，無第二套 derive。
5. **action-scope 語意遷移成立（本批核心風險）** [已驗證]：由 adapter push 時設定改為
   頁面 commit effect（`MySessionsPage.tsx:661-672`）以 store 導出 `actionScopeKey`
   （`authEpoch`）每次 commit 重設——語意更強。對立審查 canary：把 scope key 改 `null`
   → account-settings `:390` 跨帳號洩漏測試立即紅（account-A 錯誤洩進 account-B），
   還原 byte-identical 後全綠。epoch 變更觸發鏈（authController bump→
   `replaceMySessions([])`→notify）已逐段核實。
6. **28 處直呼改寫 oracle 保真** [已驗證]：零斷言被刪或放寬；rerender 刺激改真實
   store emit（更貼 production）；harness 為 Provider prop DI，無 window 掛鉤、
   production 不可達；`src/` 零 fixtures 引用。
7. **`__importAppModule` 139→122（−17）逐檔對帳全真退役** [已驗證]：account-settings
   −7、session-lifecycle −6、auth-forms −3、navigation-shell −1；diff 新增行零筆
   `await import("/src/`（批 1 退件的換拼法違規未重犯）；`renderMySessionsPage(`
   測試呼叫 28→0。**122 為新觀察基準。**
8. **新測試** [已驗證]：`my-sessions-page-dom.test.js` 3/3 pass；`deepStrictEqual`、
   retry assertion、fixture 非空；16 個 action 欄以相異參數驗完整呼叫序列含
   decision payload 綁定。已註冊進 `test:session-unit`（package.json 唯一變更，
   屬新測試必要接線，判在範圍內）。
9. **凍結面** [已驗證]：`App.tsx`、`sessionViews.js`、`surface="my-sessions-page"`、
   class 字面契約、五個非 controller callback、`pageViewStore` 管道全部零 diff。

## 移交批 2B 的三個觀察（非阻擋）

1. bridge commit callback 無條件 `syncPendingMySessionActions` 先於頁面 scope 重設的
   順序理論窗（實務不可達：epoch 首 commit 必為空 groups）——2B 收 bridge 時移除。
2. `pageViews.js` 的 `hasAdapterActionScope` 分支已全庫零 caller，防禦性死碼——
   隨 2B adapter 退役清除。
3. harness 內 rAF 焦點管道 clone（`mySessionsAppHarness.tsx:138-158`）與 production
   `scheduleMySessionsCreatedFocus` 的 drift 風險（local suite 尚有真路徑覆蓋兜底）——
   2B 遷管道時收斂為單一來源。

## 量化更新

- `__importAppModule`：139→**122**（新基準）。
- Messages＋MySessions 兩頁均已 hooks 單源；剩 Me／NearbyDrawer 未遷。
- main gzip 餘 657 B（批 2B 收 adapter 應可回收）；MySessions lazy 餘 709 B。
