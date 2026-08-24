# F1R 修訂二：授權修 F1-5 引入的 picker 收合焦點空窗（production 修復）

- 日期：2026-08-24
- 修訂對象：`docs/arch-dispatch-2026-08-24-frontend-F1R.md`——把 F1-5 這條迴歸納入
  F1R 的修復範圍（原派工單只鎖定 F1-1 的 created-session focus）。
- 性質：**production 修復授權**，與修訂一（oracle 調整）不同類。測試斷言照舊一字不改。

## 驗收方的獨立查證（機制成立）

1. **[已驗證] 測試期望**：`tests/session.spec.js` 的
   `checking the last court collapses the picker without dropping focus to body`
   斷言收合瞬間 `document.activeElement` 不得是 body，且**最終焦點落在
   `toggle-court-picker`**——codex 提議的修法正是把 production 補到與既有斷言一致，
   不是遷就實作改測試。
2. **[已驗證] 空窗機制**：`src/pages/MePage.tsx:398-403` 的 `saveCourtSelection`
   在勾滿全部球場時**同步** `setCourtPickerExpanded(false)`（F1-5 controlled 化的
   optimistic 行為），被勾的 checkbox 隨 `hidden={!courtPickerExpanded}`
   （`:452`）立刻隱形，瀏覽器把焦點丟到 body。
3. **[已驗證] 既有補救太晚**：接手焦點的 fallback 在 `src/sessionActions.ts:369-380`，
   註解自承正是為這個情境寫的（「勾到最後一座球場會讓清單自動收合，原目標隨即隱形；
   退回展開鈕才不會掉到 body」），但它掛在 `shouldRestore: ({ completed }) => completed`
   之後——**儲存 RPC 完成才跑**。F1-5 之前收合本來就發生在 RPC 後的權威重繪，
   空窗不存在；F1-5 之後收合提前到勾選當下，空窗為真。race 特性與
   2/10（F1-5）→ 5/10（HEAD）的取樣一致。
4. **[已驗證] 不與 fallback 打架**：`restore` 只接手 loose focus
   （`current === document.body` 才動作，「使用者自己移走的焦點不搶回來」）。
   同步把焦點交給 toggle 之後焦點不 loose，RPC 完成後 fallback 自然不再跳一次。

## 裁決：**授權**，附下列條件

### 修法邊界

1. **同步交棒必須是條件式的**：只有當「即將被藏起來的 picker 內」持有焦點時
   （`document.activeElement` 位於 `#notification-court-picker` 內，或就是某顆
   `data-notification-court` checkbox）才把焦點交給 `toggle-court-picker`。
   **無條件交棒是新 bug**：使用者若是勾外層的「全台北市球場」checkbox 觸發同一條
   收合路徑，焦點本來就在仍然可見的控制項上，把它搶走是焦點竊取，
   也可能弄紅 mock 的球場訂閱既有測試。
2. 只動 `src/pages/MePage.tsx` 的收合路徑（必要時允許最小的輔助 helper）；
   `sessionActions.ts` 的 async fallback **保留不動**——它仍是 rollback 重展開等
   其他路徑的安全網。
3. 獨立 commit，不與已提交的 `e3a638f`／`d59e72a` 混合。
4. 任何測試斷言、testid、DOM 結構一字不改。

### 驗收條件（在 F1R 原有矩陣之上追加）

1. **race 類 bug 用取樣證明，單次綠不算**：修復後對該條測試
   `--repeat-each=10 --retries=0` 必須 **10/10 綠**，附輸出；
   修復前的紅色取樣（現有 5/10）一併記入回報。
2. 回報說明第 1 條「條件式交棒」的實作與為什麼不會與
   `sessionActions.ts` 的 fallback 重複跳焦（引用 `focusIsLoose` 判定）。
3. 二分證據（`0be31a2` 10/10 綠、`4be7a53` 起紅）記入回報的迴歸清單，
   標明這是**批 1 的第二條迴歸**（F1-5），與第一條（F1-1 created-session focus）分列。
4. mock 的球場訂閱相關測試（subscribing to every Taipei court collapses the picker
   and reopens on demand 等）維持綠——由完整 `test:ci:frontend` 涵蓋。

### 同類事項的窄預授權

`test:local` 剩餘測試若再出現**同一類**「批 1 的 optimistic 收合／identity 語意
造成焦點掉到 body」的 production 迴歸：依同樣條件處理（條件式交棒、最小改動、
獨立 commit、取樣 10/10、二分證據、不改測試），不必再停下來問。
**其他任何類型的 production 行為修改、或任何測試斷言修改（修訂一已授權的
oracle 類除外），仍然遇到即停、回報。**

## F1R 其餘條款不變

主要驗收標的仍是 `npm run test:local` 全綠且 `did not run` 為 0；
已完成的診斷、mock 迴歸測試先紅後綠、GOLDEN 逐字不變、testid 集合不變、
探針清乾淨、完整 gate——全部照原派工單與修訂一。
