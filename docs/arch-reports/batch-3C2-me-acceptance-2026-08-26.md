# 批 3C-2 驗收紀錄（Me 管道收斂＋adapter 與整套 slot 機制退役，批 3 收官）

- 日期：2026-08-26。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-26-batch3C2-me.md`；Codex 回報：
  `docs/arch-dispatch-2026-08-26-batch3C2-me-report-codex.md`。
- 驗收方法：本機重跑全套 gate＋production diff 審閱＋對立審查 agent
  （獨立 canary 複跑＋必要性反向 canary），對立審查報告：
  `docs/arch-reports/batch-3C2-adversarial-2026-08-26.md`。

## 結論：**ACCEPTED**——批 3（NearbyDrawer＋Me）全案完結，四頁全同級

## 通過項（全部本機重驗或對立審查實證）

1. **Gate 全綠** [已驗證]：typecheck／lint／prettier／build／bundle／`git diff --check`
   exit 0；mock 288 passed／4 skipped（含新 oracle desktop＋mobile 各 1）、unit 336 pass；
   local 首跑紅＝fixture 累積污染（`session-data-local-api.test.js:87`，DB 數得 272 筆
   殘留 session，與批 2A 同型）→ guarded reset → 重跑綠（紅→reset→綠三拍，見下）。
2. **Bundle 三組全降** [已驗證]：main 652,480／gzip 190,514（−338，餘 1,906 B）；
   total 838,388／255,413（−416，餘 3,649 B）；MePage chunk 15,439／gzip 4,929
   （−68，餘 571 B）。與回報逐字一致；`__importAppModule` 維持 107（本批零變動，
   無換拼法）。
3. **Scope 遷移＋canary 三拍** [已驗證，對立審查獨立複跑]：scope 遷入 `MePage.tsx`
   無依賴陣列 layout effect，key＝live `authSession?.user?.id ?? null`（自 `useMeState()`
   store 訂閱）——3C-1 退件的根治。刪 `setMySessionActionScope` 一行→新 oracle 紅
   （`Expected: enabled / Received: disabled`，落點確為帳號 B 的 replacement toggle）
   →byte-identical 還原→綠。
4. **node-replacement oracle 有牙** [已驗證]：`account-settings-smoke.spec.js` 新測試
   真斷言原 node `isConnected === false`（替換真發生），stale reject 在切帳號之後才
   發生——正是 3C-1「重要證偽」要求的情境，補上了 Me scope 管道自始缺乏的載重測試。
5. **slot 五件套歸零** [已驗證]：`PageSlot`／`renderPortals`／`renderPage`／`nextSlotId`
   ／`commitPageAdapterSynchronously` 全刪；十個退役符號 src＋tests 反掃零 match；
   `syncCommit(` 除 helper 本體外僅剩 `sessionStore.ts`／`SurfaceHost.tsx` 兩 caller
   （3→2，批 5 提前收一個）；`react-surface-lifecycle.test.js` 相對基準恰一行 diff
   （`:109` approvedCallers 移除 `"app/App.tsx"`），該檔 6/6 綠。
6. **`pageViews.js` 刪檔** [已驗證]：兩個純 DOM helper 遷回 `sessionViews.js`，函式
   本體 byte-identical（唯一差＝兩行 JSDoc 未帶走，minor）；`renderMapDataStatus`
   具名簽名本來就是 pageViews 原形（`...args`＋prettier-ignore 只是舊 facade wrapper）；
   `rg "pageViews"` src＋tests 零 match。
7. **凍結面** [已驗證]：`showMePage` 兩顆 rAF 零 hunk（現行 `main.js:462`／`:465-467`）；
   lifecycle `:139` lazy `=3` 與 `:140-141` SESSION_VIEWS 字面斷言仍在且過；
   `line_id|session_contacts` hit 集合與基準完全相同（各 12 hits，隱私紅線零新增觸點）；
   MySessions／Messages／Nearby／sheets 殼零改動。

## 派工外變更裁決（一項，揭露充分）：**必要且等價，核准**

**main.js init 啟動 listener 改綁靜態 host delegation** [已驗證，對立審查反向 canary]：

- 變更：五個 tab、`.app-brand`、`#player-directory-open` 的直掛 listener 改成
  `#map-topbar-root`／`#bottom-navigation-root`（index.html `:34`／`:119` 靜態節點）
  delegation。
- 必要性實證：把 delegation 改回基準直掛寫法→`navigation-shell-smoke.spec.js`
  desktop-chromium **14/14 全紅**，init 拋
  `Cannot read properties of null (reading 'addEventListener')`——確定性 init 崩潰。
  根因：`commitPageAdapterSynchronously` 的 init 同步 flush 原本是整個 init listener
  掛載序列的**隱性保證**（隱藏耦合），slot 退役後 React 首次 commit 晚於直掛時點。
- 等價性實證：七行為逐一對照語意相同；兩 host 子樹無 click 路徑 `stopPropagation`；
  邊緣差（節點缺失時 fail-fast 消失、`Element` guard）不可觀察或屬改善。
- 程序註記：此變更在解凍清單之外，但屬在範圍變更（slot 退役）的必然連帶、回報 §4／§9
  充分揭露並附測試證據，與批 1「未揭露灌指標」性質相反——核准，並記入教訓
  （派工單開單時未預見該隱性耦合，屬驗收方 ground truth 盲點）。

## 回報敘述勘誤（兩處，不影響結論）

1. **Auth preload「Before」敘述被推翻** [已驗證，對立審查]：回報稱舊 bridge 觸發提供
   auth 差分——實際上 `renderMePage` 在基準只被 mount-once 的 `mountMeDestination`
   於 init 呼叫一次，當下 `authSession` 恆 null（auth restore 在 boot 之後），舊觸發是
   **實質死觸發、從未生效**。新接線（init snapshot＋`onAuthIdentityChange`，
   `authController.ts:174` 於 identityChanged 觸發，涵蓋 restore／sign-in／切帳號，
   sign-out no-op）**是修復死觸發的行為改善，不是等價搬移**；無漏接情境。
2. 「49-test focused matrix」數字無法重建（實為 14／project、42 全 projects）。

## test:local 三拍

首跑紅（`session-data-local-api.test.js:87` `assert.ok(summary)`，1 fail）→ 數 DB
272 筆殘留 session → `CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test` → 重跑
45 passed／11 skipped 綠。（Codex 側跑綠是因其執行序早於污染累積臨界。）

## 量化更新（新基準）

- main gzip **190,514**（餘 1,906 B）；total gzip 255,413（餘 3,649 B）；
  MePage chunk gzip 4,929（餘 571 B）。
- `syncCommit` production caller：**2**（`sessionStore.ts`／`SurfaceHost.tsx`，批 5）。
- `__importAppModule`：107（不變）。
- mock 基準更新：**288 passed／4 skipped**（新 oracle ×2）。

## 教訓

1. 退役同步 flush 前先盤點它隱性保證了誰：`commitPageAdapterSynchronously` 表面只服務
   Me adapter，實際撐著 init 全部直掛 listener——「移除 A 只影響 A」要用反向 canary
   證明，不能從呼叫鏈推定。
2. 「等價落點」宣稱要先驗舊觸發真的活著：舊 auth preload 是死觸發，搬移實為修復；
   驗收把它如實寫成行為改善，避免文件把死碼描述成有效行為。
