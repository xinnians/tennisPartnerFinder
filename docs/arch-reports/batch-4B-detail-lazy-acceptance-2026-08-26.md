# 批 4B 驗收紀錄（SessionDetailSheet 重 lazy 化）

- 日期：2026-08-26。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-26-batch4B-detail-lazy.md`；Codex 回報：
  `docs/arch-dispatch-2026-08-26-batch4B-detail-lazy-report-codex.md`。
- 驗收方法：本機重跑全套 gate＋production diff 審閱＋對立審查 agent（canary 複跑
  ×2＋caller 面掃描＋pin 預熱真實性查核），對立審查報告：
  `docs/arch-reports/batch-4B-adversarial-2026-08-26.md`。

## 結論：**ACCEPTED**

## 通過項（全部本機重驗或對立審查實證）

1. **Gate 全綠一次過** [已驗證]：typecheck／lint／prettier／build／bundle／
   `git diff --check` exit 0；unit 336、mock 298 passed／4 skipped（新 oracle ×5
   desktop＋mobile＝+10）；local 45 passed／11 skipped（無污染，未 reset）。
2. **Bundle** [已驗證]：main 637,109／gzip **186,862**（−3,652 B，餘 5,558 B——
   管線開工以來最寬）；新 SessionDetailSheet chunk 16,054／4,850 落 per-lazy gate
   18,000／5,500 內；total 839,733／257,010（+1,597 B gzip，餘 2,052 B）。
   數字與回報逐字一致。
3. **Canary 複跑 ×2** [已驗證，對立審查]：(a) methods 名單破壞→FIFO replay oracle
   紅（`TypeError: detail.enterConfirming is not a function`）→還原綠；(b) 額外
   canary：移除 defer 分支 `onClose` 參數→onClose oracle 紅（Expected 1,
   Received 0）→還原綠——兩條都咬 production 語意，非結構鏡像。
4. **五條 race oracle 品質** [已驗證]：Playwright route 真攔 Vite module request、
   pending-Escape 後無 late-mount、FIFO replay 終態正確、onClose 恰一次、兩條匿名
   intent oracle 走真 UI。深連結 `#/session/9001` 冷載入 spec 原檔零 diff 重跑綠。
5. **Caller 面無行為缺口** [已驗證，對立審查補掃——回報未涵蓋]：production caller
   唯一（`main.js:615` 經 facade），下游只用 deferred handle 露出面（`close`／
   `setJoinPreview?.`／`enterConfirming?.`）；`registerUnmount` 14 處全是內部
   `mounted` 不經對外 handle；無同步 DOM 依賴；遞迴 bag 21 option 與簽名一一對應。
6. **凍結面** [已驗證]：`SessionDetailSheet.tsx`／`sheets.js`／`deferSurfaceOpen`
   本體／`registerDetailContent` 零 diff；lifecycle 唯一 hunk 在 eager regex；
   `line_id|session_contacts` hit 集合與基準相同（隱私紅線零新增觸點）。
7. **匿名預熱** [已驗證]：intent 分支在 document-level listener、auth gate 外；
   selector 三來源（`SessionCard.tsx` testid、`MySessionsPage.tsx`
   `data-open-my-session`、`map.ts` pin title `球局 · ` 前綴）事實查核通過。

## 疑義判定（Codex 回報 §11）

**main 釋回 3,652 B（非預估 4–5 KB）、total gzip +1,597 B**——判定可接受：
total 增加是 code-splitting 固有成本（新 chunk 邊界＋Avatar 抽成共享 chunk＋各
chunk 獨立壓縮），本批目標本來就是 main（首載關鍵路徑）；total 仍有 2,052 B 餘裕。
**4C 派工單必須把 total 餘裕收緊記入基準判斷。**

## 紀錄修正（兩處，不影響結論）

1. **`__importAppModule` 口徑**：Codex 的 107→110 是 `window.__importAppModule`
   口徑（排除 `appRuntime.js:12` 的 `globalThis.` 定義行）；裸符號口徑是 108→111。
   兩口徑 delta 皆 +3、全在新 oracle、production 零新增。今後對帳固定以
   `window.__importAppModule(` 口徑記錄，新基準 **110**。
2. **pin 預熱對真實 Maps 標 [不確定]**：production 走 AdvancedMarker，
   `gmp-advanced-marker` 是否把 title 落成事件路徑上的 attribute 無法由 repo 證明
   （Fake Maps 的 title button 是 fixture 自己放的）；回報 §9.3 的 production 口氣
   過強。降級為「測試已證、production 待 hosted QA」；miss 時 fallback 是 loading
   殼、無正確性風險。**已掛入 hosted QA 待辦：真機驗證 map pin hover/focus 是否
   觸發 SessionDetailSheet chunk 預熱。**

## 量化更新（新基準）

- main gzip **186,862**（餘 5,558 B）；total gzip 257,010（餘 2,052 B）；
  SessionDetailSheet chunk 4,850（餘 650 B）；最大 lazy 仍 MySessionsPage 4,829。
- mock 基準 **298 passed／4 skipped**；unit 336。
- `__importAppModule`（window 口徑）：**110**。
- eager React 模組只剩 `App.tsx`；`lazySurfaceLoaders` 14 筆。
