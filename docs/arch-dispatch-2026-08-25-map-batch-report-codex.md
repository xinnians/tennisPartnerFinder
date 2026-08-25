# 地圖批執行回報：F4-9／F4-1／F4-4

- 日期：2026-08-25
- 派工單：`docs/arch-dispatch-2026-08-25-map-batch.md`
- 開工基準：`f19bae7`
- 最終實作 HEAD：`203b37b`
- 結論：F4-9、F4-1、F4-4 與 production legacy Marker 調查均完成；標準矩陣最終全綠，did not run＝0。
- 依派工單要求，本回報檔不納入實作 commit；沒有 push。

## 1. Commit 切分

| commit | 子項 | 內容 |
| --- | --- | --- |
| `64b0c4b` | F4-9 | `map.js`／`pins.js` strict TS 化、地圖狀態所有權收斂 |
| `0927993` | F4-1 | 三層 marker keyed diff、雙 adapter 更新、op 可觀測面與核心測試 |
| `d42e56b` | F4-4 | 四個具名 pin 色票與 CSS token 的 fail-closed gate |
| `b42707e` | production 謎題 | 設有 Map ID 時 Advanced Marker 載入失敗改為 fail closed |
| `203b37b` | 測試 fixture | fake Advanced Marker 套用 anchor，忠實模擬同座標 pin 的實際分層 |

順序採派工單建議的 F4-9 → F4-1 → F4-4：先建立型別邊界與唯一狀態持有者，再在同一模組內做 reconcile，最後鎖定 SVG 色票來源。每個子項落刀後均執行 `npm run test:session-unit` 並通過；最終同一指令為 311/311 通過。

## 2. F4-9：TS 化與單一所有權

### 改動

- `src/map.js` → `src/map.ts`、`src/pins.js` → `src/pins.ts`；兩檔納入現有 strict `tsc --noEmit`。
- 選擇最小自定義 Google Maps interfaces，而非新增 `@types/google.maps`。本模組只需要 Map、Marker、AdvancedMarker、Point、Size、Bounds 與 listener 的窄介面；此選型不增加 runtime／dev dependency，也讓 legacy fake 與真實 Maps 走同一結構型別邊界。
- `src/domainTypes.ts` 新增 `MapCourtSummary`；profile mapper 的 court 型別沿用該 domain shape。
- map singleton、session／court／player 三層 marker state 與 user marker 全由 `src/map.ts` 的 `markerState` 持有；`src/main.js` 只呼叫 render／location API，不再保存 marker 陣列。
- `tests/fixtures/appRuntime.js` 的 module extension 表同步為 `map: ".ts"`、`pins: ".ts"`。

### 已刪除／歸零證據

```text
$ rg -n "let (sessionMarkers|courtMarkers|playerMarkers)|let userMarker" src
（空輸出）
$ rg -n "from ['\"]\\./pins\\.js['\"]|src/(map|pins)\\.js" src
（空輸出）
$ test ! -e src/map.js && test ! -e src/pins.js
exit 0
```

F4-9 commit 沒有修改既有 e2e assertion 或當時的 fakeMaps 行為。

## 3. F4-1：keyed marker diff

### Key 與 fingerprint

- 單場 session：`session:${sessionId}`。
- 未定案候選場地：同一 `sessionId` 會同時投影到多個球場，因此使用 `session:${sessionId}:court:${courtId}` 消除同層 key 衝突；這是 session identity 的多位置投影，不以陣列 index 當 identity。
- court：`court:${courtId}`。
- player 聚合：`player:${courtId}`。
- session cluster：`cluster:${courtId}`；資料 fingerprint 另含排序後的 sessionId 成員集合及可見 session 資料，所以成員集合不變且資料不變才是 unchanged。

### Reconcile 語意

- unchanged：沿用同一 marker、content node 與既有 listener，完全不呼叫 Maps mutation API。
- added：只建立新 marker。
- removed：經共用 adapter 以 `setMap(null)` 或 `marker.map = null` detach。
- changed：只比較並更新有差異的 map／position／pin content（或 legacy icon＋label）／title／zIndex；listener 建立一次後透過 `entry.activate` 讀最新 callback，不重綁。
- map instance 改變時才 detach 該 layer 的舊 entries；一般 60 秒 discovery refresh 不再整層拆建。

AdvancedMarker 與 legacy Marker 共用同一 reconcile；建立與欄位更新才在 adapter 邊界分流。

### 可觀測面與測試

`tests/fixtures/fakeMaps.js` 新增非空 marker 掃描集及 `create`／`update`／`detach`／`contentReplace` 計數，並以 WeakSet 把同一輪多欄位 setter 合併為一次 marker update。

- unit（legacy）：等價資料重畫為 `{ create:0, update:0, detach:0, contentReplace:0 }`；單筆座標變更恰 `update:1`，其餘為 0；marker instance、listener count 穩定。
- mock e2e（AdvancedMarker）：用 clone 後的同批資料模擬 60 秒 poll，四項 op 全零且 instance／content node 相同；只改一筆座標後恰一 update、零 create／detach／content replace。
- `tests/smoke.spec.js` 相對本批基準只有一個純新增 49 行 test block，沒有刪除或改寫既有 assertion。

完整前端 gate 第一輪曾有一個桌面測試逾時：同球場的 session／player fake marker 疊在同一位置，測試點到 session pin。production AdvancedMarker 會套用 `anchorLeft`／`anchorTop`，fake 未套用。`203b37b` 只補齊 fixture 的 anchor 版面語意，未改產品邏輯或既有 assertion；單項、unit 與完整前端 gate 重跑均綠。

## 4. F4-4：pin 色票單一來源 gate

### 選型

`session.css` 保持 canonical source。SVG data URI 無法在 `<img>` 內解析文件 CSS variables，因此不把 runtime CSS custom property 塞進 SVG；改由既有 `contrast-tokens.test.js` 讀兩個實檔並 fail closed。gate 要求以下四個具名常數及四個 token 都恰好存在且逐值相等：

| pins 常數 | CSS token | 值 |
| --- | --- | --- |
| `NAVY` | `--color-ink` | `#12291c` |
| `BLUE` | `--color-court` | `#1c5c3c` |
| `LIME` | `--color-signal` | `#ddf53c` |
| `SOFT_BLUE` | `--color-success-bg` | `#e8f2e3` |

這個測試鎖同源方案沒有 codegen 產物與 build ordering，且 `test:session-unit`／`test:ci:frontend` 都會執行，適合目前四個固定色票的規模。

### 雙向 canary

暫改一側、觀察 gate 紅、還原，再改另一側；兩次變更均未留在工作樹：

```text
CSS-only canary:
NAVY=#12291c 與 CSS token=#12291d 不同源

pins-only canary:
NAVY=#12291d 與 CSS token=#12291c 不同源

還原後：contrast-tokens 6/6 passed；test:session-unit 311/311 passed
```

### 其餘 `pins.ts` 色字面

- `#fff`：保留。它是 SVG 內局部白色實色（視覺上對應 card white），不是新增的具名品牌色；SVG data URI 同樣不能直接使用 CSS token。
- `#eef0ec`／`#8b978d`／`#5a675e`：保留為「已額滿」pin 的一組局部 disabled 灰階語彙，三者共同表達狀態，且沒有一組完全對應的既有 CSS token。
- `#46554b`：保留在候選文字與 court pin。它雖與 `--color-text-secondary` 現值相同，但目前不是四個具名 pin palette 常數；單獨再宣告一份 constant 不會消除 SVG／CSS 的雙值來源，擴大 gate 留待專門的 pin semantic-token 批次。
- `rgba(255,255,255,0.85)`：保留為 cluster glyph 的局部透明白，alpha 是該 glyph 的視覺語意，不是全域實色色票。
- 註解中的 `#ddf53c` 只是設計比對說明；runtime 使用 `LIME`。

既有 contrast pair／focus exception 沒有修改，完整 contrast suite 綠。

## 5. Production legacy Marker 警告調查

使用 in-app Browser 的既有 production session 檢查 `https://qiuka.tw/`，並讀取當前 production bundle：

- fresh load 與 reload 的 console 目前都是 0 筆 warning／error，原派工單記錄的一筆 deprecation warning無法在當前 deployment 重現。
- DOM 有 62 個 `gmp-advanced-marker`、62 個 `.map-pin-visual`，legacy marker image 為 0。
- production 設有 Map ID `c5bc78564f912d8bded98797`；bundle 有 AdvancedMarker constructor，也保留一個 `new google.maps.Marker` fallback call site。

可重現的程式邊角是：設有 Map ID 時，舊 `loadGoogleMaps` 對 `importLibrary("marker")` reject、缺函式或缺 `AdvancedMarkerElement` 都會吞掉並 resolve Maps；後續 `createMarker` 因 advanced constructor 為空而走 legacy，正好會產生一次 Google deprecation warning。warning 本身不破壞功能，但表示配置為 AdvancedMarker 的 deployment 靜默降級。

`b42707e` 將有 Map ID 的三種失敗都改為 reject／fail closed，交回既有「地圖暫不可用、列表仍可用」降級面；因此配置 Map ID 時不再可能進入 legacy constructor。未配置 Map ID 的環境仍保留 legacy fallback，符合派工單「不刪 legacy fallback」限制。由於 live warning 已消失，不能把歷史那一筆斷言為某一個確定 runtime 事件；本批修的是與該症狀一致且可由 source 證明的 fail-open 路徑。

## 6. 凍結面

### GOLDEN 兩張

```text
GOLDEN:    0be31a2=10141 bytes, pre-batch=10141, HEAD=10141; HEAD == 0be31a2 == pre-batch
ME_GOLDEN: 0be31a2 尚不存在；pre-batch=456 bytes, HEAD=456; HEAD == pre-batch
```

既有 124 筆 `GOLDEN` 逐字未動；後續已核可新增的 19 筆 `ME_GOLDEN` 本批也逐字未動。

### `data-testid` 與已核可 hunk

```text
pre-batch f19bae7: 97 assignments / 96 unique
HEAD:              97 assignments / 96 unique
本批 added 0 / removed 0

0be31a2: 91 assignments / 90 unique
HEAD:     97 assignments / 96 unique
相對舊基準只有先前已核可的 6 個：
create-session-tab, map-tab, me-tab, messages-tab, my-sessions-tab, player-directory-open
```

`git diff --unified=0 0be31a2 ... -- tests` 中命中 `data-testid|GOLDEN|ME_GOLDEN` 的 checksum，在本批前後都是：

```text
5f4e88a2423f06297ea0e68f61566eec48ea9bb8679e9f18b68a86bb54cf9868
```

因此對 `0be31a2` 的既有核可 hunk 未漂移。本批唯一 e2e spec 變更是 F4-1 要求的全新增測試；既有視覺、點擊、鍵盤 assertion 沒有改寫。

## 7. 最終驗收矩陣

Playwright 均序列執行，未與另一套 Playwright 並發；未執行 DB reset。

| 指令 | 最終結果 |
| --- | --- |
| `npm run test:ci:frontend` | PASS；unit 311/311；Playwright 284 passed、4 conditional skipped；Vite production build PASS；production bundle guard PASS |
| `npm run test:db` | PASS；7 files、799 tests |
| `npm run test:local` | PASS；typecheck PASS；local API 2/2；Supabase Playwright 44 passed、11 conditional skipped；did not run＝0 |
| `git diff --check` | PASS；空輸出 |

`test:local` 第一輪在既有「逐一勾選兩座訂閱球場」案例發生一次 90 秒 UI timing timeout，使後續 22 項未執行；同案例立即單獨重跑 1/1 通過（2.6 秒），完整 `test:local` 再跑則 44 passed／11 skipped、did not run＝0。沒有為此修改產品或測試。

## 8. 明確未做

- 未做 F4-3 bundle 拆分或調整 chunk 策略；build 的既有 >500 kB warning 保留。
- 未做 controller／data API／shell 重構、虛擬化或 F4-7。
- 未移除「無 Map ID」環境需要的 legacy fallback。
- 未修改 DB schema、未 reset DB、未部署、未 push。
- 本回報檔刻意保持 uncommitted，等待驗收方閱讀。
