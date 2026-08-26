# 批 3C-1 驗收紀錄（MePage 資料與 action 單源化）

- 日期：2026-08-26。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-26-batch3C1-me.md`；Codex 回報：
  `docs/arch-dispatch-2026-08-26-batch3C1-me-report-codex.md`。
- 驗收方法：本機重跑全套 gate＋production diff 審閱＋對立審查 agent
  （canary 含 HEAD 對照）。

## 結論：**退件（小補件）**——主體通過，一項行為退化必須補正後 ACCEPTED

補件派工單：`docs/arch-dispatch-2026-08-26-batch3C1-followup.md`。批 3C-1 與補件一起 commit。

## 通過項（全部本機重驗或對立審查實證）

1. **Gate 全綠** [已驗證]：typecheck／lint／prettier／build／bundle／`git diff --check`
   exit 0；mock 286 passed／4 skipped（一次過，無 flake）；local 45 passed／11 skipped。
2. **Bundle 三組全降** [已驗證]：main 653,562／gzip 190,852（−171，餘 1,568 B）；
   total 839,689／255,829（−257，餘 3,233 B）；**MePage chunk 15.65 kB／gzip 約 4,997
   （5,120→餘裕 380→503 B，全庫最緊 gate 反而鬆了）**。與回報逐字一致。
3. **meApp 契約** [已驗證]：9 callback＋2 常數與 HEAD bag 逐字相同；hooks fail-closed、
   memoize；build 產物驗證 hooks 在 main chunk、MePage chunk 零 hit。
4. **衍生欄保真** [已驗證]：`selectMeState` 的 avatarUrl／linkedProviders 與 HEAD
   production 主路徑逐字相同（與 feature 模組 pre-emit fallback 的 `.map` 差異已由
   回報如實揭露）；`playerVisibility`／`blockedPlayers*` 自
   `selectControllerMySessionsView` 投影，無第二套 derive。
5. **contract 變更判在範圍內** [已驗證]：`controllerContracts.ts` 僅純型別
   （`ControllerAuthSession` 加寬描述既存 runtime 欄位＋新 `ControllerMeViewState`）；
   `ControllerApi` 方法與 exact-key 橋零變更——屬「衍生欄搬移」的必要型別接線。
6. **focusNotificationSettings 真 UI** [已驗證]：harness clone 保留 `id="me-root"`
   原位，點真 `#discovery-subscribe`→production `onSubscribe`→`showMePage`→
   production rAF 打真 `#me-root`；手動 focus 行已刪。
7. **14 處直呼改寫 oracle 字面保留** [已驗證]：抽查 4 條斷言未動；
   `renderMePage(` 測試呼叫歸零；`__importAppModule` 119→**107** 逐檔對帳全真退役；
   新 `me-page-dom.test.js` 4/4（11 action 參數綁定逐一驗）；harness 純 Provider DI。
8. **凍結面** [已驗證]：bag 26→4（`authSession` bridge-only＋`notificationSettings`
   ＋`presence`＋`pageViewStore`）；bridge／slot／preload／`configurePageViews`／
   兩顆 rAF／`meFocus.js`／`sessionActions.ts` 零 diff；`surface="me-page"` 保留；
   MySessions／Messages／Nearby 零改動。

## 退件項（一項，production 行為退化）

**Me 頁 pending-action 帳號隔離 scope 退化為永久 null** [已驗證，對立審查 canary]：

- HEAD：bridge commit callback 第一 fallback `options.sessionStore?.getState?.()...`
  是**每次 commit 的 live 讀**，登入後取得真實 user id。
- 本批：`sessionStore` 欄退役後只剩 closure 捕捉的 `authSession`——`mountMeDestination`
  是 mount-once（init 同步執行），auth 恢復在其後，**production 恆為 null**。
  sign-out 是 SPA 流程不 reload，帳號切換情境真實存在；`sessionActions.ts` 的跨帳號
  pending 隔離在 Me 頁實質失效，且零測試覆蓋（canary 證明）。
- 根因鏈：**派工單 ground truth 寫錯**（「語意由第二 fallback 承接，production 值相同」
  ——驗收方未驗 mount-once 時序，自我糾正記錄於此）→實作照辦→Codex 回報 §3 以不實
  聲稱背書而非揭露（此為回報缺陷）。
- 補正（最小）：bag 恢復 `sessionStore` 欄一行（live fallback 復活，行為零退步），
  3C-2 隨 adapter 退役時以「scope 搬進 MePage、以 auth identity 為 key」根治並補
  會紅的 oracle。

## 重要證偽（記錄，3C-2 規劃輸入）

派工單稱 `account-settings:141-146` 是 bridge sync 管道的唯一 oracle——對立審查在
**HEAD** 上 canary（刪 `syncPendingMySessionActions`）全 mock 綠：**該斷言在 HEAD 就
從未咬過 bridge closure**，實際載重是 React node identity＋`runMySessionAction` 的
imperative disable。含意：(1) Me 的 scope／sync 管道自始缺乏有牙測試；(2) 3C-2 遷移
時的 canary 必須用 node-replacement 情境（比照 session-lifecycle「stay pending across
replacement」模式），不能用現有 Me rerender 情境。

## 補件驗收（2026-08-26 同日）：**ACCEPTED**——批 3C-1 全案結案

- 補件回報：`docs/arch-dispatch-2026-08-26-batch3C1-followup-report-codex.md`。
- FU-1 [已驗證]：bag 恢復 `sessionStore: controller?.sessionStore`＋註解逐字；
  `MePageOptions` 留型別欄（bridge 讀自己的參數），`MePageProps` 不含、MePage 本體
  `props.sessionStore` 反掃 0——live scope fallback 復活、行為零退步、單源不回退。
- FU-2 [已驗證]：回報 §3 不實聲稱改寫為 mount-once 時序如實描述；node-replacement
  oracle 需求已載明供 3C-2。
- Gate 本機重跑 [已驗證]：typecheck／lint／`git diff --check` exit 0；
  mock 286 passed／4 skipped、0 not-ok。

## 量化更新

- `__importAppModule`：119→**107**（新基準）。
- main gzip 餘 1,568 B；MePage chunk 餘約 503 B。
- 四頁資料/action 全數 hooks 單源；剩 3C-2（管道＋adapter＋slot 全套退役）。
