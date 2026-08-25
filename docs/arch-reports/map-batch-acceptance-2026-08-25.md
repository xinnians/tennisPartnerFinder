# 地圖批（F4-9 TS 化＋F4-1 marker diff＋F4-4 色票同源）驗收紀錄

- 驗收日期：2026-08-25　驗收者：Claude
- 派工單：`docs/arch-dispatch-2026-08-25-map-batch.md`
- 回報：`docs/arch-dispatch-2026-08-25-map-batch-report-codex.md`
- 驗收範圍：基準 `f19bae7` → HEAD `203b37b`（實作 5 commit，恰 11 檔；另含驗收方
  自己的派工單 commit `2695e34`）

## 結論：**ACCEPTED**（一次通過，無退件項；一筆覆蓋債列後續）

## 一、結構驗收 [已驗證]

- **F4-9**：`map.js`／`pins.js` → strict `.ts`；三層 marker state＋`userMarker`＋
  map singleton 收斂為 `map.ts` 單一 `markerState`（`map.ts:148-164`）；`main.js`
  三個 marker 陣列反掃歸零，只剩 render／location 接線。Google Maps 型別為
  最小自定義 interface，`package.json`／lock 零 diff（無 `@types/google.maps`）。
  `appRuntime.js` 副檔名表同步 `map/pins: ".ts"`。逐段比對 64b0c4b 與舊
  `map.js`：語意等價搬移，僅 optional chaining 與 `?? []` 防禦性微調。
- **F4-1**：keyed diff 五類 key（含候選局 `session:{id}:court:{id}` 多位置投影、
  cluster 成員 fingerprint）；unchanged → fingerprint 相同即跳過、零 Maps API
  呼叫（`map.ts:398`）；changed → `updateMarkerEntry` 逐欄位比對；listener 建立
  一次、更新只換 `entry.activate`（`map.ts:374`）不重綁；map instance 變才整層
  detach。AdvancedMarker／legacy 共用同一 reconcile，分流只在兩處 adapter 邊界
  （`map.ts:297`、`entry.kind` 分支）。
- **F4-4**：`contrast-tokens.test.js` 讀兩實檔逐值鎖四對常數↔token；
  `assert.equal(declarations.length, 4)` 加 `cssValue()` match 失敗即紅——兩側
  「恰好存在」皆 fail-closed。其餘色字面逐一盤點與回報一致，無漏列。
- **謎題（fail-closed）**：`b42707e` 將設 Map ID 時三種 AdvancedMarker 取得失敗
  全改 reject（`map.ts:189-208`），落入 `main.js:682-685` 既有「地圖暫不可用、
  列表仍可用」catch；未設 Map ID 的 legacy fallback 保留。`203b37b` 僅動
  fakeMaps fixture（+18 行 anchor），零產品碼。
- 反掃：marker 陣列／`userMarker`／舊路徑 import／`map.js`／`pins.js` 全歸零；
  `import.meta.glob` 仍歸零；`flushSync` 仍僅 `syncCommit.ts`。

## 二、凍結面 [已驗證]

- GOLDEN 宿主檔 `session-controller-sequence.test.js`：f19bae7＝HEAD 位元組
  相同（25187），本批 diff 空（驗收方以宿主檔比對為準；codex 回報的 10141/456
  是其自訂抽取法，兩法皆判零漂移）。
- `data-testid`（src＋index.html）：77 unique，f19bae7 → HEAD 差集空。
- 對 `0be31a2` 的核可 hunk：`git diff --unified=0` 過濾
  `data-testid|GOLDEN|ME_GOLDEN`，f19bae7 與 HEAD 兩份逐字相同——零漂移。
- `smoke.spec.js` numstat `49 0`——純新增；既有 e2e 斷言零修改。
- unit 測試一處改寫（`session-controller.test.js`：「player replacement
  preserves other layers」→「unchanged player reconciliation preserves every
  layer」）：舊斷言斷的是「重畫必拆建」，正是 F4-1 要消滅的行為，屬行為變更的
  必然跟隨，非凍結面（凍結面是 e2e／testid／GOLDEN／文案）。

## 三、驗收方 canary（皆紅→還原→綠）

1. **F4-1 有牙**：`reconcileMarkerLayer` 注入「整層先 detach 再重建」（模擬回歸
   批前行為）→ unit 紅 2 條並點名（`legacy marker keyed diff makes a repeated
   poll a zero-op…`＋同場 anchor 測試）；還原後 115/115 綠。
   刻意不選「拿掉 fingerprint 條件」——該刀會被逐欄位 diff 吸收成無效探針。
2. **F4-4 CSS 側**：`--color-ink` `#12291c→#12291d` → 紅，訊息精確
   （`NAVY=#12291c 與 CSS token=#12291d 不同源`）；還原綠。
3. **F4-4 pins 側**：`NAVY` 常數同幅改值 → 紅；還原後 6/6 綠。

零操作斷言為精確字面比對（unit `deepEqual`、e2e `toEqual` 四項計數），非無界
regex；fakeMaps 掃描集非空自證在 `session-controller.test.js:3174`。

## 四、驗收方獨立重跑

```text
test:ci:frontend  exit 0；bundle guard 661080/192693（限額 703886/203176 內）
                  ——聚合輸出計數行被截，另以單套件重跑取實見計數：
test:session-unit 311/311、exit 0
test:mock         284 passed／4 skipped、exit 0
test:db           799 PASS、exit 0
test:local        44 passed／11 skipped、did not run＝0、exit 0
git diff --check  乾淨；tracked worktree 乾淨（僅回報檔未提交，符合約定）
```

Playwright 未並發；未重置 DB。

## 五、覆蓋債（本批唯一實質缺口，非退件）

**`b42707e` fail-closed 行為翻轉零測試覆蓋**：若未來把 reject 改回 resolve
（恢復 fail-open 靜默降級），沒有任何 gate 會紅。判非退件的理由：派工單謎題節
只要求「修復或以證據說明無害」未要求測試；且回歸後果是恢復批前的靜默降級
（legacy marker 照常渲染），非使用者面破壞。**建議下一批補一條 unit**（fake
`importLibrary` reject → `loadGoogleMaps` reject → `setMapUnavailable`）。

## 六、觀察（皆非阻擋）

1. `BLUE` 常數目前無 runtime 消費者（court pin 不直接著色），純 gate 佔位——
   程式碼註解有揭露，回報四對表未明說。
2. 回報稱 unit 側「四項 op 全零」，實際 unit 只計 create／update／detach 三項；
   `contentReplace` 僅 e2e advanced 路徑驗——legacy 無 content node，語意完備，
   數字表述小誤。
3. `contrast-tokens` 既有測試有一行讀檔路徑跟隨改名（`pins.js→pins.ts`），
   「零修改」嚴格說是「斷言零修改」。
4. `pins.ts:192` 註解仍寫「pins.js」，過時字面。
5. fail-closed 三路 reject 前都清 `loadPromise`，允許重試但現無重試呼叫端，
   無害。
6. production 原始警告已無法在當前 deployment 重現（codex 與驗收方 08-25 實測
   均 0 筆）；本批修的是與症狀一致且可由 source 證明的 fail-open 路徑，
   歷史單筆不強行歸因——處理方式符合派工單「修復或以證據說明」。

## 七、回報紀律

`test:local` 第一輪 90 秒 timing timeout 有揭露並重跑；canary 輸出完整；
「已刪除／歸零」皆附反向 grep；謎題單獨列節。揭露落差僅上述觀察 1-3 的
表述精度，無隱匿。
