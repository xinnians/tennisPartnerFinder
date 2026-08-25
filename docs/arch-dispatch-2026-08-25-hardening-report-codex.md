# 階段 1 加固批執行回報（Codex）

- 日期：2026-08-25
- 開工基準：`68466e3`
- 實作 commits（未 push）：
  - H-2：`57c5a33 fix(test): strip E2E hooks from production bundle`
  - H-1／D-03：`58c5d5c docs(error): keep production source maps disabled`
  - H-3：`6ac9914 feat(map): migrate configured maps to AdvancedMarker`
- 回報檔依派工要求留在 working tree，不列入上述實作 commits。

## 結論

- **H-1：BLOCKED。** [已驗證] Sentry Browser SDK `10.71.0` 即使
  `defaultIntegrations:false`、`autoSessionTracking:false`、`sendDefaultPii:false`，實際交給
  transport 的 event 仍固定多出 `platform`、`event_id`、`timestamp`、`environment`、
  `contexts`、`sdk` 等 protocol／SDK metadata，無法符合「實際送出 payload key 集合精確等於
  `APP_ERROR_TRANSPORT_FIELDS`」紅線。依派工單「不能保證只送三欄就 BLOCKED」條款，沒有安裝
  SDK、沒有接 transport、沒有增加 CSP endpoint，也沒有設定 `VITE_SENTRY_DSN`。
- **H-2：完成。** [已驗證] development bundle 保留 test hooks，production bundle
  `__tennisE2ETestHooks` 零命中；紅 canary 能確實擋下一個逃過編譯期 guard 的讀取點。
- **H-3：完成（hosted Map ID 待使用者設定）。** [已驗證] 有 Map ID 時使用
  `importLibrary("marker")`＋`AdvancedMarkerElement`；Map ID 空值或 marker library 載入失敗時走
  集中的 legacy Marker fallback。Fake Maps、desktop／390px mock e2e 與 local e2e 全綠。

## H-1（F4-6）Sentry 錯誤監控接線

### 改了什麼

- `docs/architecture-decisions.md`
  - [已驗證] D-03 落檔重評提案：production source map 與 hidden source map 均維持關閉。
  - [推論] 現行 allowlist 不外送 exception／message／stack，沒有 stack 可供 source map 解析；
    上傳 source map 只會增加 build 供應鏈與 hosted credential 面。日後若要外送 stack，須先另案
    翻修隱私契約再重評。

### 阻擋證據

以 repository 外的暫存目錄安裝目前最新版 `@sentry/browser@10.71.0`，使用自訂 transport 攔截
實際 Sentry envelope event；輸入只有三個 tags，且關閉 default integrations、session tracking、
default PII：

```text
keys = [
  "breadcrumbs",
  "contexts",
  "environment",
  "event_id",
  "platform",
  "sdk",
  "tags",
  "timestamp"
]
tags = {
  "errorName": "TypeError",
  "kind": "window-error",
  "surface": "global"
}
platform = "javascript"
sdk.name = "sentry.javascript.browser"
sdk.version = "10.71.0"
sdk.settings.infer_ip = "never"
```

[已驗證] 此 key 集合不是 `errorName/kind/surface`，且 metadata 是 SDK pipeline 加入；`beforeSend`
不是 on-wire envelope 的最後一步。官方 SDK 原始碼同樣顯示 BrowserClient 會補
`platform = "javascript"`，core 會補 event ID／timestamp，envelope header 還會補 sent time／SDK。

參考：

- Sentry JS SDK：<https://github.com/getsentry/sentry-javascript/tree/10.71.0/packages/browser>
- Sentry event payload model：<https://develop.sentry.dev/sdk/data-model/event-payloads/>

### 驗收逐條

1. **payload key 精確三欄：BLOCKED**
   - 上述實際 transport probe 為 8 個 top-level keys；多一鍵即紅，因此沒有硬接。
2. **PII canary：未執行 adapter canary**
   - 原因：adapter 不得在 vendor wire contract 已知不合規時接入。
   - 既有本地 allowlist 安全網仍綠：`tests/app-errors.test.js` 的含 email／座標／LINE 假資料測試
     仍斷言 `Object.keys(report) === APP_ERROR_TRANSPORT_FIELDS` 且序列化內容無 canary 字串。
3. **production bundle／反向 grep：未加入 SDK**

   ```text
   $ rg -n '@sentry|VITE_SENTRY_DSN' package.json package-lock.json src vercel.json
   （空輸出）
   $ rg -n 'configureAppErrorTransport' src
   src/appErrors.ts:86:export function configureAppErrorTransport(...)
   ```

   [已驗證] 主 chunk 最終 `649474/189151` bytes；沒有 Sentry chunk 或主 chunk 增量可比較，因為
   合規檢查在安裝前即 BLOCKED。
4. **DSN 空值零請求／零 console：未新增呼叫點**
   - [已驗證] production 仍只有 `appErrors.ts` 的 registration 定義、沒有呼叫；行為維持既有
     NOOP，所以沒有 Sentry network request 或 Sentry console output。
5. **CSP：未修改**
   - [已驗證] 因沒有 DSN／project，無合法精確 ingest host 可加入；加入猜測 host 會違反派工紅線。
6. **D-03：完成**
   - commit `58c5d5c` 已把「hidden source map 維持不開」理由與重評前提寫進決策索引。

### H-1 hosted 操作

- `VITE_SENTRY_DSN`：**本批不要在 Vercel 設定**。
- Sentry project／ingest host／CSP：**本批不要建立或加入**。
- 後續若產品決定放寬「on-wire 只能三鍵」契約，須先另立隱私決策，再於
  **Vercel → Project → Settings → Environment Variables** 設定公開 DSN，並以該 DSN 的精確
  ingest origin 更新 Report-Only CSP；這不是本批授權。

## H-2（F4-8）拔除 `__tennisE2ETestHooks` 出貨路徑

### 改了什麼

- `src/e2eTestHooks.ts`
  - [已驗證] 新增唯一 test-hook 讀取邊界；Node 單元／dev 預設開啟，production define 為 false。
- `src/app/SurfaceHost.tsx`、`src/components/AppErrorBoundary.tsx`、
  `src/data/repositories/dataRepository.ts`、`src/mockData.js`
  - [已驗證] 原 6 個字面命中全部改走共同邊界；hook 行為／testid／文案不變。
- `vite.config.ts`
  - [已驗證] production build 定義 `__TENNIS_E2E_TEST_HOOKS__ = false`；serve 與非 production
    build 為 true。
- `scripts/check-production-bundle.mjs`
  - [已驗證] 先以 `vite.build({ mode:"development", write:false })` 自證掃描集非空，再斷言
    production dist 零命中。
- `tests/ci-config.test.js`
  - [已驗證] 鎖定 production／development define 的相反值。

### 驗收與 canary

基線主 chunk：

```text
production bundle check passed: 28 files, 12 demo identifiers absent;
main chunk 648016/188600 bytes within 703886/203176
```

故意在共同邊界加入一個 define 之前的直接 property read，production build 後 gate 變紅：

```text
AssertionError [ERR_ASSERTION]: production bundle still contains the E2E test hook
    at scripts/check-production-bundle.mjs:54:8
actual: false
expected: true
```

還原 canary 後綠：

```text
production bundle check passed: development E2E hook present, production E2E hook absent;
28 files, 12 demo identifiers absent; main chunk 647941/188540 bytes
within 703886/203176
```

最終（含 H-3）仍綠：

```text
production bundle check passed: development E2E hook present, production E2E hook absent;
28 files, 12 demo identifiers absent; main chunk 649474/189151 bytes
within 703886/203176
$ rg -n '__tennisE2ETestHooks' dist
（空輸出）
```

[已驗證] mock 全套仍為 `270 passed / 4 skipped`；hooks 在 serve build 活著，error injection、
unmount 與 mock data hooks 的既有測試均未修改且全綠。

## H-3（F4-2）AdvancedMarker 遷移＋版本釘選

### 改了什麼

- `src/config.js`
  - [已驗證] 新增公開 env `VITE_GOOGLE_MAPS_MAP_ID`，空值預設 legacy fallback。
- `src/map.js`
  - [已驗證] loader 改為 `v:"quarterly"`；Map ID 存在時動態
    `google.maps.importLibrary("marker")`。
  - [已驗證] session／court／player／user 四類建立與銷毀共用單一 marker adapter。
  - [已驗證] AdvancedMarker 使用 `map`／`position`／`content` properties、
    `gmpClickable:true` 與 `gmp-click`；仍維持「全拆→重建」，沒有做 F4-1 diff。
  - [已驗證] Map ID 空值、`importLibrary` 不存在或 marker library 載入失敗時使用 legacy Marker。
- `src/pins.js`
  - [已驗證] `advancedMarkerContent` 把既有 SVG icon、label origin、字型／色彩／尺寸轉為 DOM，
    anchor 沿用原 icon geometry，未改任何 pin 文案或圖形常數。
- `tests/fixtures/fakeMaps.js`
  - [已驗證] 新增 AdvancedMarker fake，實作 `map`／`position`／`content` property contract 與
    `gmp-click` 鍵盤路徑；snapshot 從 `content img` 讀 icon。
  - [已驗證] legacy fake 只為 production fallback 單元契約保留；Playwright 設定強制 demo Map ID，
    browser e2e 實際走 AdvancedMarker fake。
- `playwright.config.js`、`tests/ci-config.test.js`
  - [已驗證] browser harness 設 `VITE_GOOGLE_MAPS_MAP_ID=DEMO_MAP_ID`，且單元 gate 鎖定
    AdvancedMarker property shape。

### 驗收

1. **legacy Marker 前後計數**

   ```text
   # 開工基準
   $ rg -c 'new google\.maps\.Marker' src
   3
   # 最終
   $ rg -n 'new google\.maps\.Marker' src
   src/map.js:115:  const marker = new google.maps.Marker({
   ```

   [已驗證] 精確 grep 由 3 降為 1。保留的單一建立點是明示 fallback，集中承接 session、court、
   player、user 四個概念建立點；待 hosted Map ID 就位並完成真 Maps QA 後才可另批刪除。
2. **loader quarterly**

   ```diff
   -      v: "weekly",
   +      v: "quarterly",
   ```

   ```text
   src/map.js:42: google.maps.importLibrary("marker")
   src/map.js:63: v: "quarterly"
   ```

3. **Fake Maps／鍵盤／390px**

   ```text
   $ npm run test:mock
   # units: tests 305, pass 305, fail 0
   # Playwright: 270 passed, 4 skipped
   ```

   [已驗證] 既有 `map idle ... session pins remain keyboard-compatible` 斷言零修改；pin focus 後
   Enter 開啟 `#session-sheet`，Escape 還原焦點。臨時 390px visual probe 輸出：

   ```json
   {
     "advancedContents": 18,
     "fakeMarkers": 18,
     "focusedBeforeEnter": true,
     "sessionSheetVisibleAfterEnter": true
   }
   ```

   截圖證據（repo 外，不列入 commit）：
   - `/tmp/tennis-advanced-marker-390.png`
   - `/tmp/tennis-advanced-marker-enter-390.png`
4. **local suite**
   - 第一次未 reset 的 run 在既有 notification court hydration 測試逾時：21 passed／1 failed／
     20 did not run。依派工規定以 guarded 指令清乾淨 local fixture 後全套重跑。
   - guarded 指令：`CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test`；輸出明示
     `target:"local"`、`Reset local database.`。
   - 最終：API `2 passed`；Playwright `42 passed / 11 skipped`；`did not run` 零命中。
   - [不確定] repository 的 Playwright config 固定注入 `e2e` key 並由 Fake Maps 攔截，因此不能把
     此結果宣稱為「真 hosted Maps key」測試。真 key＋真 Map ID 需使用者依下節走查。

### H-3 hosted／console 操作（使用者）

依序執行：

1. Google Cloud Console → **Google Maps Platform → Map Management → Create map ID**。
2. 建立 JavaScript Map ID（production 專案）；確認 Maps JavaScript API 已啟用，API key 的
   HTTP referrer 限制仍只含核可網域。
3. Vercel → 專案 → **Settings → Environment Variables**：新增
   `VITE_GOOGLE_MAPS_MAP_ID=<新 Map ID>`；它是公開識別值，不是 secret。
4. 至少設 Production；若要先驗 preview，同值（或獨立 preview Map ID）加入 Preview。
5. 依派工紅線只用 git push 觸發部署，不從本機 CLI production deploy。
6. hosted 走查桌面＋390px：確認沒有 `MapIdNotFound`／AdvancedMarker console error；pin SVG／label／
   anchor 與本回報截圖一致；Tab／方向鍵可到 marker，Enter 開 sheet，Escape 還原 marker focus。
7. 完成真 Maps QA 後，若要刪 legacy fallback，另立派工；本批不靜默刪除。

官方依據：

- Advanced Marker 需要 Map ID：
  <https://developers.google.com/maps/documentation/javascript/advanced-markers/add-marker#set_a_map_id>
- 可點擊／鍵盤可及 marker：
  <https://developers.google.com/maps/documentation/javascript/advanced-markers/accessible-markers>
- quarterly channel：<https://developers.google.com/maps/documentation/javascript/versions>

## 收尾標準矩陣

### `npm run test:ci:frontend`

```text
All matched files use Prettier code style!
# tests 305
# pass 305
# fail 0
4 skipped
270 passed (2.5m)
production bundle check passed: development E2E hook present, production E2E hook absent;
28 files, 12 demo identifiers absent; main chunk 649474/189151 bytes
within 703886/203176
```

### `npm run test:db`

```text
All tests successful.
Files=7, Tests=799
Result: PASS
```

### `npm run test:local`

```text
# tests 2
# pass 2
# fail 0
11 skipped
42 passed (1.3m)
did not run: 0
```

### `git diff --check`／凍結資產

```text
$ git diff --check
（空輸出）
$ git diff --unified=0 68466e3 -- tests | rg '^[-+].*(data-testid|GOLDEN|ME_GOLDEN)'
（空輸出）
$ git diff --unified=0 0be31a2 -- tests \
    | rg '^[-+].*(data-testid|GOLDEN|ME_GOLDEN)' | shasum -a 256
5f4e88a2423f06297ea0e68f61566eec48ea9bb8679e9f18b68a86bb54cf9868  -
```

[已驗證] 本批沒有修改 GOLDEN／ME_GOLDEN 兩張表、任何 `data-testid`、既有文案或既有 e2e
斷言；對 `0be31a2` 的既有核可 hunk 保持原樣。`.claude/rules/`、dataApi 邊界、CSP enforcing、
F4-1 marker diff、F4-9 TS 化、F4-4 色票均未動。

## 未做／未 push

- H-1 Sentry 接線：因 exact-three-key wire contract BLOCKED，未硬接。
- `VITE_SENTRY_DSN`、Sentry ingest CSP、Sentry alert／sampling／retention：未做。
- production／preview deploy、Vercel env、Google Cloud Map ID：未做，需使用者執行。
- 真 Google Maps key＋真 Map ID hosted QA：未做；目前本機沒有可用真 key／Map ID。
- production source map／hidden source map：維持關閉。
- 沒有 push；三個實作 commits 僅存在本機分支。
