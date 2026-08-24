# F1R 修訂一：授權調整 `session.spec.js:1948` 的測試 oracle

- 日期：2026-08-24
- 修訂對象：`docs/arch-dispatch-2026-08-24-frontend-F1R.md` 的「第二步」約束第 2 條
  （「不得改任何既有 e2e 斷言」）——**僅對本檔指名的一條測試放行**，其餘照舊。
- 授權依據：母派工單總則第 5 條本就允許凍結測試調整，條件是回報單獨列節＋逐筆說明變因。

## 驗收方的獨立查證（三項主張全部成立）

1. **[已驗證] 斷言內容**：`tests/session.spec.js` 的
   `every Me control keeps focus through a background rerender`（現行 :1948 起）
   在 :2005-2014 以 `isConnected === false` 的 poll 當「重繪確實發生」的證據，
   且測試內註解自承這是代理探針：
   「盯住目前這個節點：重繪會把它換掉，isConnected 轉 false 就是重繪確實發生的直接證據。」
   真正守的不變量是收尾斷言：`dropped`（焦點掉到 body 的控件清單）必須為空。
2. **[已驗證] 機制衝突**：基準 `0be31a2` 的路徑是
   `updatePresenceLocationStatus` → `renderMeDestination()`（`0be31a2:src/main.js:272-276`）
   → adapter render → generation-key remount → 節點被替換；
   現行 HEAD 同函式（`src/main.js:280-283`）只做 `publishPageView("me")` → store emit →
   React 原地更新，節點 identity 保留——**這正是批 1 已驗收（ACCEPTED）的目標行為**。
   強迫 production 恢復節點替換等於回退 F1-1／F1-2。
3. **[已驗證] 兩條要求確實互斥**：F1R 原約束「不得改 e2e 斷言」與「不得回退批 1 成果」
   在這條測試上無法同時滿足。該測試源自 `c8cbb9d`（cover the profile entry in the
   Me focus tables），批 1 至 2A 期間 `tests/session.spec.js` 零改動，工作樹也尚未動它。

## 裁決：**授權**，附下列條件

### 範圍

- 只准改這一條測試的 oracle。`session.spec.js:532` 與其他任何既有斷言仍然一個字不准動。
- 對稱掃描與防縮水斷言（`nonCourtTotal ≥ 15`、`total ≥ nonCourtTotal`）保留不動。
- 每次迭代挪動座標以避開 tracker 50 公尺／60 秒節流的設計保留——每一輪都必須真的
  觸發一次 presence 更新。

### 新 oracle 必須同時保住舊測試的兩半價值

舊測試 = 「證明重繪發生」＋「重繪後焦點不掉 body」。新 oracle 對應為：

1. **「重繪發生」改錨在可觀察的因果鏈**：每輪 emit 座標後，等待該輪的
   `update_my_presence` 請求完成，再等雙重 `requestAnimationFrame` 讓對應的
   React commit 跑完。這是本檔隔壁測試（discovery empty-state subscribe，
   等 `notification_prefs` 回應＋雙 rAF）已確立的同型 oracle，沿用即可。
   若你發現 `update_my_presence` 完成後不必然觸發 commit，改錨在實際會觸發
   commit 的訊號上，並在回報說明。
2. **不變量升級為同節點保焦**：斷言被盯住的節點 `isConnected === true` **且**
   仍是 `document.activeElement`。這比舊版更強——舊版允許焦點落到「替換後的
   新節點」，新版要求同一節點連續持焦；同時它自動抓到 remount 迴歸
   （節點一旦被替換就紅），與 `react-page-focus.spec.js` 的守門同向。

### Canary（授權的對價，缺一即退件）

- **remount canary**：暫時把 Me 頁的 key 改回會變動的值（`key={slot.resetKey}`，
  批 1 驗收用過的同一招），跑這條測試必須**紅**；還原後綠。附兩次完整輸出。
  這證明新 oracle 守得住「節點被替換」這一側。
- 「重繪發生」那一側由 `waitForResponse` 本身 fail-closed（presence 更新若沒發生，
  測試逾時紅），不需另造 canary，但回報要指出這點。

### 程序

- oracle 調整**獨立成一個 commit**，不與 production 修復混在同一個 commit。
- 回報依總則第 5 條在「守門測試調整」單獨列節，寫明：舊 oracle 是實作代理、
  被已驗收的批 1 語意反轉、不變量保留且升級；附 `0be31a2` 通過與 `a27b91f` 起
  失敗（10/10）的實測輸出。

### 同類衝突的預先授權（窄）

`test:local` 剩餘測試若再出現**同一根因**的 oracle 衝突（以「節點被替換」當重繪證據、
被批 1 的 identity 保留語意反轉），依同樣條件處理即可，不必再停下來問：
逐條附二分證據（基準綠、`a27b91f` 起紅）＋機制說明＋獨立 commit＋單獨列節＋
對應 canary。**任何其他類型的既有斷言修改仍然禁止**，遇到就停下來回報。

## F1R 其餘條款不變

驗收標的仍是 `npm run test:local` 全綠且 `did not run` 為 0；診斷四題的 runtime 證據、
mock 迴歸測試（修復前紅→修復後綠）、GOLDEN 逐字不變、testid 集合不變、
探針清乾淨、完整 gate——全部照原派工單。
