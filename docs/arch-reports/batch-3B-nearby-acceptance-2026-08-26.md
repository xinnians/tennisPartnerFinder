# 批 3B 驗收紀錄（NearbyDrawer 焦點管道 React 化＋adapter 退役）

- 日期：2026-08-26。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-26-batch3B-nearby.md`；Codex 回報：
  `docs/arch-dispatch-2026-08-26-batch3B-nearby-report-codex.md`。
- 驗收方法：本機重跑全套 gate＋production diff 審閱＋對立審查 agent
  （機械 diff＋canary 複驗＋快照時機論證查核）。

## 結論：**ACCEPTED**（無退件項；三個非退件觀察記錄於尾節）

## 通過項

1. **Gate 全綠** [已驗證]：typecheck／lint／prettier／build／bundle／`git diff --check`
   exit 0；`test:local` 45 passed／11 skipped；mock 首輪撞已立案的
   `chat-settings-filters:468` 存量 flake（task_d6de363e），依派工單條款重跑
   286 passed／4 skipped 綠。
2. **Bundle** [已驗證]：main 654,041／gzip 191,023（**−288 B，餘 1,397 B**）；
   total 840,637／256,086（**−312 B，餘 2,976 B**）。與回報逐字一致，gate 未調。
3. **焦點管道機械保真** [已驗證]：`src/nearbyDrawerFocus.ts`（203 行）與 HEAD
   `pageViews.js` drawer 段正規化 diff 後**唯一實質差異是 close 分支的 Prettier
   換行重排**（語意逐字元等價）；intent 四形態、五 action 白名單、快照決策、
   bail-out 布林式、四分支順序、`aria-expanded` 判定、六段 recovery 優先序、
   loading fallback、rAF 時機、`preventScroll` 全數逐字保留；WeakMap-per-root
   三結構未簡化。舊符號模組外歸零，selector 單一來源。
4. **快照時機完整性** [已驗證]：store 變更前快照由
   `useBeforeNearbyDrawerStoreChange()` 在 hook 內綁定（callback identity WeakMap
   快取，不觸發重訂閱）；commit 後還原由元件同一顆 `useLayoutEffect` 直呼
   `restoreNearbyDrawerFocus(rootElement)`；「bridge 進入時快照」消失的論證成立——
   HEAD 下該時機只在 init 發生一次，當時 `#nearby-sessions-drawer` 是空靜態節點，
   快照必然 no-op，語意中立。
5. **Canary 三拍（對立審查自做，不採信回報）** [已驗證]：廢掉快照捕捉單行→
   `performance.spec.js:325/:342` 兩測同紅→備份覆回 byte-identical（sha256 與回報
   一致）→復跑綠；`:364` 未被當作管道證據（3A 移交觀察 3 遵守）。
6. **adapter 歸零** [已驗證]：五符號 src＋tests 反掃歸零；`onStoreCommit` 僅剩
   Me 面；`configurePageViews` 剩兩鍵、`renderMePage` bridge 完好（3C 範圍）；
   pageViews.js 259→62 行；直接 portal（fixed-root 式＋`NearbyDrawerFocusProvider`
   ＋`resetKey=0`，與 HEAD slot 實質行為等價）；元件歸零 prop，
   `NearbySessionsDrawerOptions` 型別退役。
7. **凍結面** [已驗證]：`react-surface-lifecycle`（含 `:139` `=3` 實跑重新執行過）、
   `sheets-dom`（四字面在位，6/6 pass）、`performance :325/:342`、`app-errors`、
   `content-visibility` 全零 diff；`syncCommit` 恰 3 caller（Me 的
   `commitPageAdapterSynchronously` 未動）；`#nearby-sessions-count-status` 與
   `renderDiscovery` 可執行碼零變更。
8. **計數與移交觀察** [已驗證]：`__importAppModule` 119→119 逐檔相同；
   harness／dom test import 新模組**本尊**零 clone；3A 三個移交觀察全收
   （plumbing 計數移除且真 oracle 保留、兩載重測試原封、`:364` 未誤用）。

## 非退件觀察（記錄備查）

1. `renderDiscovery` 的 live-region 註解因反掃歸零要求改寫措辭——純註解、已揭露。
2. 回報「不保留舊 bridge symbol」措辭略誇大：`rememberFocusedSessionCard` 於新模組
   內部沿用舊名——這是保真的正面證據，非缺陷。
3. close 分支一處 Prettier 純格式重排，語意等價。

## 量化更新（NearbyDrawer 全案完結）

- NearbyDrawer 與 Messages／MySessions 同級：main.js 零 drawer 鏈、焦點管道
  單一 strict TS 來源。
- main gzip 餘 **1,397 B**（管線開工時 1,088 B→現已淨賺 309 B）；
  `__importAppModule` 基準 119。
- 剩餘：批 3C（Me，批 3 壓軸）→ 批 4（sheet 殼）→ 批 5（syncCommit）→ 批 6。
