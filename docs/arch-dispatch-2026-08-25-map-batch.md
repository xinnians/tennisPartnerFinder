# 地圖批派工單：F4-9 TS 化／所有權收斂＋F4-1 marker diff＋F4-4 色票同源

- 日期：2026-08-25
- 路線圖：`docs/arch-roadmap-2026-08-25.md` 階段 4；母派工單 F4-1／F4-9／F4-4
- 開工基準：以當前 origin HEAD 為準（`f19bae7` 之後）
- 順序**建議** F4-9 → F4-1 → F4-4（先有型別與單一所有權，diff 才好做）；
  若你有更好切序，說明理由。每子項至少一個 commit、每刀跑
  `npm run test:session-unit`。

## Ground truth（2026-08-25 實測）

- `src/map.js` 319 行／`src/pins.js` 207 行／`tests/fixtures/fakeMaps.js` 361 行。
- **全拆重建**：三個 renderer（`renderSessionPins:181`／`renderCourtBasePins:220`
  ／`renderPlayerPins:235`）都先 `detachMarkers` 再全建；60 秒 discovery 輪詢
  資料不變也照拆。
- **狀態分持**：`main.js:165-167` 持三個 marker 陣列，`map.js:17` 持
  `userMarker`＋map singleton——F4-9 目標是併成單一 map-view 模組。
- **雙路徑**：H-3 後 `createMarker` 依 Map ID 走 AdvancedMarker 或 legacy
  fallback；**diff 機制必須兩路徑都適用**（e2e 以 `DEMO_MAP_ID` 走 advanced，
  legacy 至少單元覆蓋）。
- **色票手動同步**：`pins.js:1-4` 四個常數（NAVY `#12291c`、BLUE `#1c5c3c`、
  LIME `#ddf53c`、SOFT_BLUE `#e8f2e3`）註解自承「無法讀 CSS 變數，值與
  session.css 同步」；token 定義在 `session.css:23-34`。pins.js 另有
  `#fff`／`#eef0ec`／`#8b978d`／`#5a675e` 等字面。
- **fakeMaps**：已有 `FakeAdvancedMarker`（content／gmp-click），但**不記錄
  create／update／detach 次數**——diff 驗收需要的觀測面待補。
- **production 遺留謎題**：qiuka.tw fresh load 仍出現一筆 `google.maps.Marker`
  deprecation 警告（2026-08-25 實測），代表某處實例化了一次 legacy marker，
  來源未定位——本批查明。

## F4-9 地圖層 TS 化＋狀態所有權收斂

1. `map.js`／`pins.js` 轉 `.ts` strict（套 domainTypes；Google Maps 型別
   以最小自定義 interface 或 `@types/google.maps`，選型說明）。
2. map singleton＋`main.js` 三個 marker 陣列＋`userMarker` 併成單一
   map-view 模組（狀態唯一持有者）；`main.js` 只剩接線。
3. `appRuntime.js` 副檔名表（若引用 `map.js`／`pins.js` 路徑）同步。
4. **e2e 零改動**（含 fakeMaps 既有斷言此步不動）。

## F4-1 marker diff

1. keyed diff：session＝`sessionId`、court／player＝`courtId`；
   cluster pin 另定義成員集合 fingerprint（成員變才算變）。
2. 語意：unchanged → marker 實例、content 節點、listener、DOM **零操作**；
   removed → 經 adapter detach；changed → 只更新 position／content／zIndex
   必要欄位，**不重綁 listener**；新增 → 建立。
3. `fakeMaps.js` 擴充 op 計數（create／update／detach／content-replace），
   掃描集非空自證。
4. **驗收核心斷言**：模擬 60 秒輪詢回同一批資料 → op 計數全零
  （unit＋mock e2e 各一條）；資料變一筆 → 恰一 update、零重建。
5. 既有視覺／點擊／鍵盤 e2e 零修改全綠。

## F4-4 pin 色票單一 token 來源

1. 單一來源自選機制（build-time 產出或測試鎖同源皆可，說明理由），
   涵蓋四個具名常數 ↔ `session.css` 對應 token。
2. **fail-closed canary 雙向**：改 CSS token 一側 → gate 紅；改 pins 常數
   一側 → gate 紅；各附輸出。
3. `contrast-tokens` 測試零修改綠。
4. pins.js 其餘色字面（`#eef0ec` 等）逐一列出：入 token 或留字面附理由，
   不強制全收。

## 遺留謎題：production legacy Marker 警告

定位 fresh load 實例化 legacy Marker 的來源（提示方向：`userMarker`？
`createMarker` 在 marker library resolve 前被呼叫的競態？fallback 判斷的
邊角？），修復或以證據說明為何無害；回報單獨列節。

## 不在範圍

1. F4-3 bundle 拆分（階段 5）；不調 chunk 策略。
2. 不動 controller／dataApi／殼（3B 成果）；不刪 legacy fallback 分支
  （待 hosted 真 Maps QA 後另批）。
3. 不做虛擬化或 F4-7。

## 驗收與回報

寫成 `docs/arch-dispatch-2026-08-25-map-batch-report-codex.md`，不列入實作
commit、不 push。逐子項：改了什麼、選型理由、canary 紅→還原→綠、
「已刪除／歸零」附反向 grep、謎題調查單獨列節、未做明說。

**收尾標準矩陣**：`npm run test:ci:frontend`、`npm run test:db`、
`npm run test:local`（did not run＝0）、`git diff --check`；GOLDEN 兩張、
`data-testid` 集合、既有 e2e 斷言對 `0be31a2` 維持已核可 hunk。
Playwright 不並發；DB 重置只可用 guarded 指令。
