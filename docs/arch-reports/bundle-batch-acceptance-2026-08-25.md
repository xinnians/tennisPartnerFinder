# bundle 批（F4-3 組成分析→拆分＋fail-closed 補測）驗收紀錄

- 驗收日期：2026-08-25　驗收者：Claude
- 派工單：`docs/arch-dispatch-2026-08-25-bundle-batch.md`
- 回報：`docs/arch-dispatch-2026-08-25-bundle-batch-report-codex.md`
- 驗收範圍：基準 `991c3fe`（=`6a5fc69` 派工單 commit 之前的實作基準）→
  `5f57957`（4 commit，恰 10 檔）＋退件修正 `28945b3`

## 結論：**ACCEPTED（結案）**——退件單項經 `28945b3` 修正後 delta 驗收通過（§六）

（以下為第一輪驗收原文；退件單項的修正驗收見 §六。）

### ~~退件單項~~（已修正）原裁決：退件單項 1 筆，其餘全數通過

### 退件單項：private dynamic import 失敗語意

[已驗證] `dataRepository.ts:136-150` 把 import promise 永久快取且無失敗清除
（全 repo 反掃 `privateDataApiRequest = null` 零筆、該檔零 `.catch`）。
兩個後果：

1. **rejected promise 永久快取**：登入時 private chunk 載入一次失敗（行動
   網路閃斷、SPA 舊分頁跨部署後 chunk 404——本管線已三次實測 stale-tab
   是真實情境），此後所有私人操作（建立／加入球局、聊天、My Sessions）
   永久失敗，只能手動重整。這是本批新引入的失敗模式（拆分前全 eager，
   無此路徑），且 codex 自己在 `map.ts` fail-closed（`loadPromise = null`
   後 reject）已示範正確模式。
2. **錯誤形狀違反派工約束**：import 失敗是原生 `TypeError`（英文技術訊息），
   不走 `asDataApiError` 家族；`sessionActionMessages.ts:46` 會把非空
   message 直出 UI——違反派工單「失敗載入的使用者面訊息不變」。
   （profile 載入路徑有「請重新整理」中文引導是部分緩解，但球局操作
   路徑沒有。）

**修正要求**：import 失敗時 (a) 清除 `privateDataApiRequest` 允許重試；
(b) 把錯誤包成既有 DataApiError 形狀或確保 UI 顯示在地化訊息。附
canary：模擬 import reject → 第二次呼叫重新 import；UI 訊息斷言。

## 一、通過項結構驗收 [已驗證]

- **拆分保真**：`createDataApi` 回傳 38 個方法鍵集合新舊 diff 空；42 個
  函式逐一本體比對僅註解刪除／字母序重排／lazy plumbing，零邏輯改寫；
  RPC 名稱集合與 `.from()` 目標集合逐字相同。
- **隱私紅線**：`p_line_id: null` 保留（`privateDataRepository.ts:305`）；
  零 raw table 存取；eager 側只剩 courts／session_discovery 三個匿名函式；
  `session_join_preview` 搬 private 側正確（DB grant 僅 authenticated，
  前端僅登入後呼叫）。`dataApi.js`／controller／殼／SW 零 diff。
- **收益判定**：主 chunk 661,080/192,693 → 654,775/191,398（-0.95%/-0.67%）。
  判「實質下降」成立：組成報告證明 attribution 84% 是 Supabase（790,851）
  ＋React（592,988）的匿名首屏合法依賴，可拆上限本就 ~20,747；報告先行、
  不拆理由逐項成立（Supabase＝匿名探索＋auth restore 依賴；React＝首屏殼；
  `manualChunks` 拒當假收益）。total JS +0.33% 有揭露有鎖。
- **gate 擴充**：main 以 index.html 唯一 entry script 辨識（非檔名猜測）、
  Sentry 以內容 marker 歸類、其餘一律套 lazy 預算——無「落到無預算類別」
  漏洞；private marker 斷言恰 1（`assert.equal(length, 1)`，消失即紅）；
  掃描集非空自證多層（檔數≥4、main>100KB、JS chunk≥4）。新上限
  658,867/192,420 低於舊 main 體積，構成棘輪。
- **fail-closed 補測**（地圖批覆蓋債清償）：fake `importLibrary` reject →
  斷言 reject 訊息＋cause＋`setMapUnavailable` 恰一次；另以 regex 靜態守
  `main.js` startMap catch 接線。`map.ts` 第三參數 `mapId` 預設取原常數，
  唯一 production 呼叫端傳兩參數，語意等價。
- 工具鏈：visualizer 僅 `BUNDLE_ANALYZE=1` 啟用，CI 全 workflow 反掃無此
  變數；分析 build 後普通 build hash 不變（插件不影響輸出）。

## 二、凍結面 [已驗證]

GOLDEN 宿主檔位元組 991c3fe＝HEAD（25187）；testid 差集空（77 unique）；
對 `0be31a2` 核可 hunk 過濾 diff 逐字相同零漂移；`performance.spec.js`
numstat `18 0` 純新增；其餘 spec 零修改。

## 三、驗收方 canary（皆紅→還原→綠）

1. **fail-closed 有牙**：`map.ts` reject 翻回 resolve → unit 紅並點名
   （`configured Advanced Marker import failures reject and drive the
   map-unavailable fallback`）；還原綠。
2. **marker gate fail-closed**：marker 字串改值使其自所有 chunk 消失 →
   build → gate 紅（`expected one private repository chunk, found 0`）；
   還原乾淨。每次皆先 build 再 check，無舊 dist 假綠。
3. **匿名網路斷言有牙**：`dataRepository.ts` 注入 eager side-effect
   import → performance 測試紅（收到該模組請求）；還原後 1 passed。

## 四、驗收方獨立重跑

```text
test:ci:frontend  exit 0 — unit 312/312、Playwright 286 passed／4 skipped、
                  build PASS、bundle gate（main 654775/191398 within
                  658867/192420；total 841549/256507 within 849961/259062）
test:db           799 PASS、exit 0
test:local        45 passed／11 skipped、did not run＝0、exit 0
git diff --check  乾淨；tracked worktree 乾淨（僅回報檔未提交，符合約定）
```

Playwright 未並發；未重置 DB。`test:local` 第一輪在
`session.spec.js:1210`（訂閱球場 checkbox 停在 disabled 的 90 秒 UI timing
timeout，與 codex 地圖批回報揭露的同一條既有 flake，非 fixture 資源紅）
中斷 22 條；單測重跑 3.1 秒過、完整重跑 45 passed／did not run＝0。

## 五、觀察（非阻擋）

1. 搬移時丟失四段原有註解，其中 `p_line_id` 凍結紅線警示註解
   （原 monolith「src/ 唯一允許出現 line_id 的位置」）建議隨退件修正
   一併補回 `privateDataRepository.ts:305` 附近。
2. `2822ac4`（docs 標題）夾帶工具鏈變更、`395f415`（test 標題）含
   privateDataRepository 的 runtime guard（marker 錨點所需的防禦性
   throw）、`5f57957`（test 標題）含 `map.ts` 參數化——三者回報均有
   實質揭露，commit 標題顆粒度偏粗，不構成隱匿。
3. startMap catch 接線守門是原始碼 regex 比對，偏脆但方向正確；
   runtime 行為主張由 unit 的 fake 注入覆蓋。
4. 回報自書「結果：ACCEPTED」——驗收結論是驗收方的裁決權，回報方
   應寫「完成」；本批實際結論見上。

## 六、退件修正 delta 驗收（`28945b3`）[已驗證]

- **修正保真**：import 失敗時 `.catch` 先清 `privateDataApiRequest = null`
  再 throw `new DataApiError("此功能暫時無法載入，請重新整理後再試。",
  { cause })`——重試語意與在地化形狀兩項要求皆落實；`privateDataApiLoader`
  DI 注入點 production 預設仍是唯一 dynamic import，split 與匿名語意不變；
  `p_line_id` 凍結紅線註解補回（`privateDataRepository.ts:305` 上方兩行）。
- **新 unit 載重**（`session-data-boundary.test.js` +33 純新增）：斷言
  DataApiError 形狀＋cause 原樣＋逐字在地化訊息＋`sessionActionMessage`
  渲染面（doesNotMatch 英文技術訊息）＋第二次呼叫成功且 import 恰 2 次。
- **驗收方 canary**：拔 `privateDataApiRequest = null` 一行 → targeted
  紅；還原 → targeted 綠、全 unit 313/313。
- **凍結面**：修正 commit 僅 3 檔（dataRepository＋紅線註解＋新 unit）；
  spec／GOLDEN／testid 相關檔零 diff。
- **獨立重跑**：`test:ci:frontend` exit 0（unit 313/313、mock 286／4
  skipped、bundle gate main 654837/191395、total 841611/256497 限額內）；
  `test:db` 799 PASS×2（reset 前後各一）。
- **test:local 紅→查因→reset→綠**：第一輪同一條 `session.spec.js:1210`
  checkbox 逾時；第二輪 176ms 快紅
  「the court scan must find two unused Taipei courts」——先數 DB：
  **424 個 open/full 球局佔滿 94 座球場**（今日多批驗收累積、未重置），
  確認為 fixture 累積污染非本批回歸；guarded
  `CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test` 後重跑
  45 passed／11 skipped／did not run＝0、exit 0。reset 後 1210 的
  checkbox 逾時同步消失，支持「兩種紅同為資料累積拖慢」假說；該 flake
  暫以本假說追蹤，再現於乾淨 DB 時才立獨立修測項。

## 七、回報紀律

順序遵守（報告先行有普通 build hash 對照自證）；預期／實際收益對照
兩口徑分列；不拆理由逐項有組成證據；canary 輸出完整；「已刪除／歸零」
附反向 grep。失敗語意缺口屬設計疏漏非隱匿。
