# 批 4C-1 驗收紀錄（React 殼骨架＋close／replacement／unmount 時序＋isolation）

- 日期：2026-08-27。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-26-batch4C1-shell.md`；Codex 回報：
  `docs/arch-dispatch-2026-08-26-batch4C1-shell-report-codex.md`。
- 驗收方法：本機重跑全套 gate＋production diff 審閱＋對立審查 agent（canary 複跑
  ×3＋parity 基線真實性 probe＋portal 路徑枚舉＋邊角可達性探測），對立審查報告：
  `docs/arch-reports/batch-4C1-adversarial-2026-08-27.md`。

## 結論：**ACCEPTED**

## 通過項（全部本機重驗或對立審查實證）

1. **Gate 全綠一次過** [已驗證]：typecheck／lint／prettier／build／bundle／
   `git diff --check` exit 0；unit 338（+2＝sheets-dom 6→8，逐筆對帳）、mock 298
   passed／4 skipped、local 45／11（無污染）。
2. **DOM parity 載重** [已驗證，對立審查最重項]：parity 期望值是硬編字面非自比對；
   把基準 commit 的舊 `mountSurface` 落成 probe 實跑同組 options（含 `<&"` 對抗性
   輸入），輸出與測試字面 byte-identical；`aria-modal` canary 紅→綠。`esc()` 移除
   安全（React 屬性跳脫經 parity 證等價；`html` 模板內部插值的 `esc()` 不變）。
3. **生命週期時序保真** [已驗證]：close 十步對照唯一變更＝`root.innerHTML=""` 換
   同步 `shell.unmount()`；canary ×2 複跑（卸載序交換紅、isolation release 移除紅，
   皆還原綠，SHA-256 與回報一致）；新增 isolation 平衡 oracle（open→close 與
   open→replace→close 雙路徑）。
4. **React 19 例外設計核准** [已驗證]：portal target 必須是 leaf——非空 legacy
   `html` 走 `dangerouslySetInnerHTML`（portal 只進 descendant），空殼 section 純
   leaf＋ref commit 補回原空白。15 條路徑逐條枚舉成立：14 條 `html:""` portal 進
   section、唯一非空是 session-sheet 且 portal 進 `.session-detail` descendant、
   loading 殼無 portal。無 wrapper、byte parity 保持。
5. **凍結面** [已驗證]：diff 恰 5 檔；`onKeyDown`／restore 鏈／rAF 聚焦／
   `closeSurface`／`openLoginModal` 逐字零變更（`-U0` hunk 落點證明）；七份指定
   e2e spec＋views＋14 sheet＋`sessionViews.js`＋`App.tsx`＋`modalIsolation.js`
   零 diff；A 群兩 `commitSynchronously` 字面在；`syncCommit` 仍恰 2 caller
   （B 群白名單檔案層級，殼渲染寫進 SurfaceHost.tsx 內不新增檔）；
   `line_id|session_contacts` 與基準相同。
6. **oracle 零弱化** [已驗證]：五條既有 sheets-dom 斷言 body 逐字相同，harness
   改 happy-dom＋`react-dom/client` 是趨真強化；E 群改寫為 `shell.unmount()` 新
   時序封條，closed 冪等與回傳 shape 兩條保留。
7. **死碼與對帳** [已驗證]：`closeSheet`／`closeModal` 全庫反掃歸零；
   `__importAppModule`（window 口徑）110 不變；bridge 時序安全（eager App import
   先於任何 mountSheet 呼叫；Node 路徑 fail-closed throw）。

## 回報勘誤（一處，不影響結論）

**React 19「runtime error」實為 dev-only `console.error` 警告**
（`warnForReactChildrenConflict`，不拋錯、portal 照常工作）——但本 repo 的
zero-console-error e2e oracle 會判紅，因此例外設計仍必要且正確；驗收紀錄以
此口徑為準。

## Bundle

main gzip 187,214（+352 B，餘 5,206 B）；total gzip 257,359（+349 B，
**餘 1,703 B——現為全庫最緊 gate**）。殼共用碼進 main 屬預期成本。
**4C-2 開單須把 total 餘裕 1,703 B 列為硬約束**；若後續批次逼近 gate，處理
選項是回收碼量或走 Q6 重編程序（使用者尚未正式拍板 Q6），不得順手放寬。

## 4C-2 加固項（對立審查裁決，非退件）

1. `shell.unmount()` 拋錯路徑：registry 先清、下次 mount 自癒（probe 實證不卡死），
   但會跳過 `onClose`＋吞錯＋殘留 stale DOM——4C-2 以 try/finally 加固。
2. `closeSurface` else 分支 `root.innerHTML=""` 與 React 殼共存已論證**不可達**，
   維持現狀；4C-2 動該函式時順手改註解說明。
3. 「非空 legacy html 走 dangerous、空 portal target 不宣告 children/danger」寫成
   正式規則（Codex 建議，採納——4C-2 派工單附帶入 `react-migration.md`）。

## 量化更新（新基準）

- main gzip **187,214**（餘 5,206 B）；total gzip **257,359**（餘 1,703 B）。
- unit **338**；mock 298 passed／4 skipped；`__importAppModule` 110。
- `sheets.js` 死 export 歸零；殼 DOM 由 React（SurfaceHost）擁有。
