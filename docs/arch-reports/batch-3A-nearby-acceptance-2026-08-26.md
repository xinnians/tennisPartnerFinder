# 批 3A 驗收紀錄（NearbyDrawer 資料與 action 單源化）

- 日期：2026-08-26。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-26-batch3A-nearby.md`；Codex 回報：
  `docs/arch-dispatch-2026-08-26-batch3A-nearby-report-codex.md`。
- 驗收方法：本機重跑全套 gate＋production diff 審閱＋對立審查 agent（穿透鏈追蹤＋canary）。
- （檔名帶 `nearby` 以區別 2026-08-25 舊管線的 `batch-3A-acceptance-2026-08-25.md`。）

## 結論：**ACCEPTED**（一次通過，無退件項；三個非退件觀察移交 3B）

## 通過項（全部本機重驗或對立審查實證）

1. **Gate 全綠** [已驗證]：typecheck／lint／prettier／build／bundle／`git diff --check`
   exit 0；mock 286 passed／4 skipped（本輪無 flake）；`test:local` 45 passed／11 skipped，
   無需 reset。
2. **Bundle** [已驗證]：main 654,311／gzip 191,311（**−178 B，餘 1,109 B——超過整條管線
   開工時的 1,088 B**）；total 840,907／256,398（−156 B，餘 2,664 B）。與回報逐字一致。
3. **收線** [已驗證]：main.js bag 9→0（單參數呼叫）；bridge 轉發物件只剩
   `onBeforeStoreChange`；元件 Options 17→3 過渡欄；`nearbyDrawerApp.onSubscribe`
   語意逐字搬移進 services。bridge 簽名 `(root, options={})` 收為 `(root)`——production
   唯一 caller 已零傳參、測試直呼歸零，屬收線自然完成，驗收判在解凍範圍內。
4. **焦點管道接點完好（本批核心風險）** [已驗證]：pageViews 焦點機制全套零 diff；
   `onBeforeStoreChange` 穿透鏈五段完整（bridge→slot spread→元件→hook 第五參數→
   `sessionStore` beforeStoreChange）。Canary：把 hook 傳遞改 `undefined`→
   `performance.spec.js:325`「stale drawer card hands keyboard focus to the empty-state
   retry」與 `:342`「delayed discovery refresh keeps drawer focus」**兩測立即紅**→
   還原 sha256 相同後綠——管道有測試載重，無覆蓋缺口。
5. **4 個直呼點改寫 oracle 保真** [已驗證]：斷言區全在 diff hunk 之外未動；刺激改
   fake store `setState`＋`emit("map")`（比 adapter 重呼更貼 production 高頻路徑）；
   chat-settings 點還補傳 `filters` 比原版更真實。
6. **hooks 契約** [已驗證]：`NearbyDrawerState` 自 `ControllerMapViewPayload` Pick
   六欄、selector 為 `selectControllerMapView` 投影無第二套 derive；六 action Pick＋
   memoize；`useNearbyDrawerAppActions` fail-closed；過渡參數註解明寫 3B 移除；
   既有 Messages／MySessions hooks 零語意變更。
7. **凍結面** [已驗證]：`react-surface-lifecycle`／`app-errors`／
   `content-visibility-contract`／`sheets-dom`／surfaceManifest／appRuntime 全零 diff；
   `:139` lazy 計數 `=3` 實跑仍過；drawer 保持 eager；六個 DOM／class 字面與
   `surface="nearby-sessions-drawer"` 全留；`renderDiscovery` 與 live region 未動；
   bridge／facade／slot 俱在（3B 才退）。
8. **計數對帳** [已驗證]：`__importAppModule` 122→**119**，−3 全在
   session-lifecycle（兩行 sessionViews＋一行 sessionController import，唯一消費即
   drawer 驅動，真退役）；無換拼法；`renderNearbySessionsDrawer(` 測試呼叫 4→0。
   **119 為新觀察基準。**
9. **新測試** [已驗證]：`nearby-drawer-dom.test.js` 4/4 pass（`deepStrictEqual` 六欄
   切片並 seed `locationMessage` 證明排除、六 action 轉呼＋參數綁定、fail-closed 實證、
   retry 無裸 sleep）；已註冊 `test:session-unit`（package.json 唯一變更，在範圍內）；
   harness 純 Provider DI 無 window 掛鉤。

## 移交批 3B 的三個觀察（非阻擋）

1. 重寫後 test 1 的 `__batch18DiscoveryLoads` 計數為測試 plumbing，對 production
   無證偽力（等價覆蓋在 `session-controller.test.js`）——3B 或日後清理時註明。
2. `onBeforeStoreChange` 穿透的唯一載重測試是 `performance.spec.js:325/:342`——
   **3B 搬焦點管道前不得先改寫這兩測**（管道遷移的紅綠對照就靠它們）。
3. `performance.spec.js:364` 在 canary 下仍綠（焦點存活靠 React 節點穩定性，非管道）——
   3B 選 canary 時不可拿它當管道證據。

## 量化更新

- `__importAppModule`：119（新基準）。三頁（Messages／MySessions／NearbyDrawer 資料側）
  完成 hooks 單源；main gzip 餘 1,109 B。
- 剩餘：3B（drawer 焦點管道＋adapter 退役）、3C（Me）。
