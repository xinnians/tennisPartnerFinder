# 階段 1 加固批派工單：F4-6 Sentry＋F4-8 測試後門＋F4-2 AdvancedMarker

- 日期：2026-08-25
- 路線圖：`docs/arch-roadmap-2026-08-25.md` 階段 1（REL-code 已於 2026-08-25 部署
  `fm4t1mjdn`＝`322da94`，本批是部署後的 hot-follow 加固）
- 開工基準：以當前 origin HEAD 為準
- 三個子項彼此獨立、各自至少一個 commit；任一子項退件不影響其他子項驗收。

## 開工前必讀（讀磁碟上的現行版本）

1. `docs/error-transport-wiring.md`（F4-6 的接線契約，**逐條是紅線**）
2. 母派工單 `docs/arch-dispatch-2026-08-22-frontend.md` F4-2／F4-6／F4-8 條目
3. `docs/architecture-decisions.md` D-03 列（本批必須顯式處置）
4. 母派工單總則＋驗收協定

**通用紅線**：不動 testid／文案／既有測試斷言／`.claude/rules/`／dataApi 邊界；
production 部署一律 git push 觸發（本批只改 code，deploy 由使用者 push）。

---

## H-1（F4-6）Sentry 錯誤監控接線

**Ground truth**：`src/appErrors.ts:86` `configureAppErrorTransport` 已存在、
預設 NOOP、`src/` 零呼叫點；`AppErrorReport` 固定三欄
`errorName`／`kind`／`surface`（`APP_ERROR_TRANSPORT_FIELDS`）。

**作法約束**（接線契約逐條適用）：

1. 薄 vendor adapter：輸入 `AppErrorTransport`，只映射三欄；**不得**呼叫
   `captureException(error)` 或任何會自動帶 message／stack／URL 的 API。
2. **SDK 以 dynamic import 延遲載入，不得進主 chunk**；DSN 走
   `VITE_SENTRY_DSN`（公開值，非 secret），**空值時完全不載入 SDK**、
   行為等價 NOOP。hosted env 設定由使用者執行，回報列出需要設定的
   env 名稱與 Vercel 操作位置即可。
3. 關閉 SDK 全部自動 context：autoSessionTracking、breadcrumbs、
   sendDefaultPii、tracing、replay、URL 附掛；若 SDK 版本無法保證只送三欄，
   本項回報 BLOCKED 而不是硬接。
4. 啟動時（global handlers 安裝前）呼叫恰一次 `configureAppErrorTransport`；
   測試／HMR 保存 restore。
5. CSP：`vercel.json` 的 Report-Only policy `connect-src` 需加 Sentry ingest
   endpoint（列出精確 host，不用萬用字元）；enforcing 決策不在本批。
6. **D-03 顯式處置**：本批必須在回報中對「production hidden source map」
   做出建議並落檔決策提案（預期結論仍是「不開」——本專案不外送 stack，
   source map 無用武之地——但要寫出來，不可沉默）。

**驗收**：
1. 攔截測試：實際送出 payload 的 key 集合**精確等於**
   `APP_ERROR_TRANSPORT_FIELDS`（多一鍵即紅）。
2. **PII canary**：造一個 message 含假 email／座標的 error 經過 transport →
   斷言送出 payload 不含該字串（附紅→綠證據：先故意讓 adapter 傳 message
   證明測試會抓到，再還原）。
3. `npm run check:production-bundle`：主 chunk 尺寸不因 SDK 上升
  （附前後 bytes）；反向 grep 證明 sentry 模組不在主 chunk。
4. `VITE_SENTRY_DSN` 未設時：零網路請求、零 console 噪音（測試證明）。

## H-2（F4-8）拔除 `__tennisE2ETestHooks` 出貨路徑

**Ground truth**（6 個字面命中）：`src/mockData.js:304`、
`src/app/SurfaceHost.tsx:87-88`、`src/components/AppErrorBoundary.tsx:23`、
`src/data/repositories/dataRepository.ts:86`／`:144`。

**作法**：production build 以 Vite `define`（或等價條件編譯）把讀取路徑
編譯期歸零；mock／dev／測試 build 保持現行為。

**驗收**：
1. `check:production-bundle` 新增斷言：dist 內 `__tennisE2ETestHooks` 零命中；
   **canary**——暫時讓一個讀取點逃過 define → 斷言紅（附輸出），還原綠。
2. mock e2e 全套零修改全綠（hooks 在 mock build 仍活著）。
3. 掃描集非空自證：斷言前先證明 dev build 有命中（防空集合假綠）。

## H-3（F4-2）AdvancedMarker 遷移＋版本釘選

**Ground truth**：`src/map.js:35-42` loader `v: "weekly"`；
`new google.maps.Marker` 共 4 處（`map.js:144`／`:166`／`renderPlayerPins`
內＋`userMarker`），三個 renderer 都是「`setMap(null)` 全拆→重建」；
`pins.js` 3 處 Marker 相關；替身 `tests/fixtures/fakeMaps.js` 294 行。
`map.js:153` 註解自載「Legacy Marker needs a DOM-backed marker for reliable
keyboard access」——鍵盤可及性是既有行為，遷移後必須保住。

**作法約束**：
1. `importLibrary("marker")`＋`AdvancedMarkerElement`；loader 版本釘
   `v: "quarterly"`。
2. **AdvancedMarker 需要 `mapId`**：以 `VITE_GOOGLE_MAPS_MAP_ID` 注入；
   Map ID 需使用者在 Google Cloud console 建立（回報列出操作步驟與
   env 名稱）。**未設 mapId 時的降級行為要明確**（建議：維持 legacy Marker
   路徑作為 fallback，本批不刪 legacy 分支，待 env 就位後由使用者確認再清）。
   若採其他策略，說明理由。
3. `tests/fixtures/fakeMaps.js` 替身契約同批改寫（同批同型接線要對稱——
   替身必須模擬 AdvancedMarker 的 `map`／`position`／`content` property 形狀，
   不是舊 `setMap`／`icon`）。
4. 本批**不做** F4-1 marker diff（階段 4）；仍維持全拆重建，只換 API。
5. 鍵盤可及性：pin 的 focus／Enter 開啟行為零變化（既有 e2e 斷言零修改）。

**驗收**：
1. `grep -c "new google.maps.Marker" src/`：回報前後計數與保留理由
  （fallback 分支若保留，逐點列出）。
2. loader 參數 `v=quarterly`（附 diff）。
3. mock e2e（Fake Maps）與 `test:local`（真 Maps key）全綠；
   390px 鍵盤走查相關斷言零修改。
4. 螢幕截圖或 e2e 證據：pin 視覺與點擊／鍵盤行為不變。

---

## 不在範圍（不要順手做）

1. F4-1 marker diff／F4-9 TS 化／F4-4 色票（階段 4）。
2. CSP enforcing、Sentry 取樣率調整、alert 規則（使用者側）。
3. 批 3 全部；`.claude/rules/` 不動。
4. 若認為 legacy Marker fallback 應立即刪除，提出建議不要靜默實作。

## 回報要求

寫成 `docs/arch-dispatch-2026-08-25-hardening-report-codex.md`，不列入實作
commit、不 push。每子項：改了什麼、驗收逐條附指令＋實際輸出、canary 附
紅→還原→綠、需要使用者做的 hosted／console 操作單獨列節
（env 名稱、位置、順序）、未做明說。

**收尾必跑標準矩陣**：`npm run test:ci:frontend`、`npm run test:db`、
`npm run test:local`（did not run＝0）、`git diff --check`；GOLDEN 兩張與
`data-testid` 集合對 `0be31a2` 維持已核可 hunk。Playwright 不並發；
DB 重置只可用 guarded 指令。
