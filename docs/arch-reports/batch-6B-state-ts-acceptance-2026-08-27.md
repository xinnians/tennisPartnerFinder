# 批 6B 驗收紀錄（狀態三檔 TS 化：requestGate／sessionIntent／filters）

- 日期：2026-08-27。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-27-batch6B-state-ts.md`；Codex 回報：
  `docs/arch-dispatch-2026-08-27-batch6B-state-ts-report-codex.md`。
- 驗收方法：本機重跑完整 gate＋三檔獨立型別擦除 token 對帳＋strict 探針 ×3
  親自複跑＋canary 疑義親自複驗＋importer byte 級驗證＋唯讀對立審查 agent
  （七攻擊面；依 6A 教訓限唯讀，與 gate 平行不再互相污染）。

## 結論：**ACCEPTED**

## 通過項（全部本機重驗）

1. **annotation-only 三重自證** [已驗證]：驗收方以 esbuild 獨立擦除型別比對
   HEAD，三檔 `erased_equal=true`（filters 首輪 false 是驗收方自己的 import
   正規化錯誤，修正後逐 byte 相等）；16 個 importer 檔 byte 級驗證僅副檔名
   （3 個例外如規格：appRuntime 恰一鍵、兩處註解僅副檔名）；main chunk hash
   `index-CHyqLqM4.js` 與基準相同——emit 產物 byte 級一致。
2. **strict 探針 ×3 親自複跑** [已驗證]：紅指名（requestGate:75／
   sessionIntent:98／filters:264）→byte-identical 還原→綠。
3. **Gate 全綠**：typecheck／lint／prettier／build／bundle（四項淨 0 B，total
   gzip 餘 1,428 B）／unit 346／mock 298 passed／4 skipped（一次過）／local
   （見事件）／`git diff --check`／反掃 src＋tests 全零（含裸字面；ds-bundle
   三筆為預告的範圍外殘留）。
4. **對立審查（唯讀）七攻擊面全 PASS**：sessionIntent exact-key／safe-integer
   逐 token 保留；requestGate 兩處刻意不同的 visibility 條件未被統一；filters
   BANDS 逐字元、開區間公式、badge 決策、共享 `new Set()`、sort tiebreak 零
   變更；`startAt!` 皆有短路 guard；`import type` 純 type-only；三檔 sha256 與
   回報探針還原值逐字元相符。

## Canary 疑義裁決（Codex 兩項勘誤全部成立）

- `:515` 非 Playwright test declaration（宣告在 `:505`）[已驗證]。
- **Vite dev server 對 explicit `.js` 提供 TS fallback** [已驗證]：驗收方親自
  暫移 `filters: ".ts"` 映射→`:505` 測試自然綠（1 passed）→byte-identical
  還原→綠。**ground truth 更正**：6A／6B 派工單的「缺映射→404」錯誤；
  appRuntime extensions 映射（含既有 districts／map／pins）在 mock harness 的
  dev server 下**非自然載重**，屬顯式路徑衛生與 harness 變動防護。Codex 的
  嚴格 404 攔截替代 canary（mapping absent 走 `/src/filters.js` 被拒、restored
  只請求 `.ts`）邏輯 sound，對立審查同判。**後續 canary 標準：驗 legacy
  extension 路徑一律主動攔截，不依賴 dev server 是否 fallback。**

## 事件紀錄

- test:local 首輪紅（`session-data-local-api.test.js:87` `assert.ok(summary)`）
  →數 DB：270 筆 sessions（231 open/full），同型於既往 272／253 筆污染事件
  →guarded reset→全綠（2/2＋45 passed/11 skipped）三拍 [已驗證]。

## 回報勘誤（驗收紀錄更正，不退件）

- 回報 §1「19 edge 落在 **17** 個唯一檔案」應為 **16**（指令複核
  `rg -l | sort -u | wc -l` = 16；重疊 3 檔＝`main.js`／
  `discoveryMapController.ts`／`session-data-boundary.test.js`，回報只列 2）。
  又一例「自己數的數字一律用指令算」。
- cosmetic type-lie 備註（非缺陷）：`sessionIntent.ts:12`
  `PendingSessionIntentInput.sessionId: number` 未標 optional；未 export、僅用
  於受 guard 判斷式，無 runtime 後果。

## 覆蓋債（記入）

- `requestGate`：無直接 unit import；poller 的 `!== "hidden"` vs `=== "visible"`
  差異僅由 controller integration／e2e 間接覆蓋。
- `sessionIntent`：非正整數 sessionId、損壞 JSON、無 storage fallback 無獨立
  oracle（由 token 全等＋consumer matrix 守住）。

## 6C 設計輸入（採納 Codex §9.5）

兩段式：先純 type contract leaf 再機械轉 `sheets.ts`，不得同 diff 邊抽邊改；
三個 configure bridge port 落 contract leaf 且不可 runtime import `sheets.ts`
（防 circular）；`react-surface-lifecycle.test.js:13` readFileSync 路徑與 E 群、
`sheets-dom.test.js` 的 `new URL`＋動態 import 同步（保留 Vite SSR loader 與
query 隔離，不可改 Node 直接 import）；importer 面除 static `from` 外加掃
readFileSync／URL／dynamic import／裸字面。
