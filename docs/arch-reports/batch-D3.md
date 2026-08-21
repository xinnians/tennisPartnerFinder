# 批次 D3 回報：main.js 狀態去重

## 開工重盤

D2 commit 後重新量測：

```text
$ wc -l src/main.js
1469 src/main.js
$ rg -n '^let ' src/main.js | wc -l
33
```

`main.js` 的 `courts`、`courtsReady`、`authSession`、`currentProfile` 與 controller store 存在雙 owner；派工前提成立。

盤點同時確認 controller 原本名為 `profile` 的欄位其實只裝 `currentProfileEligibility()` 的衍生結果，不是完整私人 profile。若只刪 `main.js` 變數會把兩種資料混為一談，因此本批把 store 明確拆成 `profile`（完整私人 profile）與 `profileEligibility`（權限衍生值）。

## 變更與檔案意圖

- `src/sessionController.js`
  - controller store 成為 courts、courtsReady、authSession、完整 profile 的唯一 owner。
  - 原 eligibility 欄位正名為 `profileEligibility`，既有 gate、epoch、surface reconciliation 與 payload 仍讀同一種資料。
  - 新增窄介面 `getAppState()`、`setAuthSession()`、`setProfile()`；既有 `setCourts()`、`setAuthState()` 的外部語意不變。
  - player visibility RPC 成功時，同步更新完整 profile 與 eligibility 的 `isPublic`，兩者不會短暫互相打架。
- `src/main.js`
  - 刪除四個重複頂層 owner；所有讀取改取當下的 `controller.getAppState()` snapshot，所有寫入走 controller API。
  - 同帳號 token refresh 用 `setAuthSession()` 只換 session，不多跑 identity-change 流程。
  - `currentAuthIdentity` 也改由 store auth session 即時計算後刪除，避免保留另一份身份鏡像。
- `src/controllerContracts.ts`：state 契約新增完整 profile 與正名後的 eligibility，並補 App state slice／API 型別。
- `tests/session-controller.test.js`：新增 store owner runtime 測試，確認 eligibility 更新不會覆寫完整 profile。
- `tests/session-data-boundary.test.js`：結構契約演進為 main 不得重建五個已移除鏡像，掃描集非空。
- 新增本回報 `docs/arch-reports/batch-D3.md`。

`sessionViews.js`、App／SurfaceHost、sheet shell、Google Maps 介面、dataApi、features 與對外行為均未修改。

## 單一 owner 與同步順序

- `getAppState()` 每次回傳當下 snapshot，不跨 `await` 快取。
- 身份真正改變時，仍由 `setAuthState()` 同步寫入 auth／eligibility、清私人資料、關閉 account-bound surface，再進非同步 reload；原時序測試逐字全綠。
- 同身份 token refresh 只用 `setAuthSession()` 更新 store 中的 session，保留原本「不清 profile、不關 confirmation、不額外 reload participation」行為。
- 完整 profile 儲存、presence 設定、profile reload 與登出預設值都只寫 controller store；`main.js` 不再持有副本。
- `courts` 載入成功／失敗先透過既有 `setCourts()` 寫 store，再由 main 讀同一份 snapshot 畫 base pins 與計算 eligibility。

## 量化收斂

```text
$ wc -l src/main.js
1483 src/main.js

$ rg -n '^let ' src/main.js | wc -l
28

$ rg -n '^let (courts|courtsReady|authSession|currentProfile|currentAuthIdentity)\b' src/main.js
（無輸出）
```

頂層 `let` 由 33 降為 28；五個鏡像全數移除。行數增加是把隱含全域讀寫改成明確的 store snapshot／同步順序，不以行數作 D3 驗收判準。

## 剩餘 28 個頂層 let 全表

| 變數 | 分類 | 本批處置／保留理由 |
| --- | --- | --- |
| `google` | imperative 資源 | Google Maps API handle；不屬 React/store 可序列化狀態，依凍結規則保留。 |
| `map` | imperative 資源 | Google Map instance；由 map adapter 持有，保留。 |
| `latestFilters` | view adapter 鏡像 | DOM chip 與 filter sheet 的同步輸入；D4 檢視 adapter 退場。 |
| `activeFilterSheet` | imperative surface handle | 用來向已開 filter sheet 發命令；不是可渲染 state。 |
| `courtCatalogueStatus` | lifecycle 狀態 | 區分 loading／ready／error 以產生 directory eligibility；目前沒有重複 owner，保留。 |
| `sessionMarkers` | imperative 資源 | Google Maps marker handles，供下次 render 清理／替換。 |
| `courtMarkers` | imperative 資源 | Google Maps base marker handles，保留。 |
| `playerMarkers` | imperative 資源 | Google Maps player marker handles，保留。 |
| `latestPlayerLayerView` | map adapter 鏡像 | map 晚到時重播最後一份 player view；不進 React App。 |
| `controller` | bootstrap handle | init 後供 DOM wiring／adapter 呼叫；不是 domain state。 |
| `storedProfileExists` | profile lifecycle | 表示資料庫是否原本有 profile row，決定首次訂閱種入；不能由空 Set 推論。 |
| `activeProfileCompletion` | imperative surface handle | account change 時精確關閉目前 profile sheet。 |
| `profileLoadStatus` | request lifecycle | 區分 idle/loading/ready/error，阻止失敗讀取變成可編輯空 profile。 |
| `profileRevision` | 競態守衛 | 阻止舊 profile request 覆蓋較新的 save/account。 |
| `activePage` | legacy navigation adapter | 控制既有 hidden page 與 focus 路徑；D4 再評估進 App。 |
| `createdSessionFocusId` | focus intent | 建立／加入成功後定位卡片；消費一次後清除。 |
| `createdSessionFocusReason` | focus intent | 區分 created/joined 文案，不是 domain session state。 |
| `meRenderGeneration` | 競態守衛 | 防止舊 rAF 對換新的 Me DOM 回焦。 |
| `mySessionsRenderGeneration` | 競態守衛 | 防止舊 rAF 對換新的 My Sessions DOM 回焦。 |
| `messagesRenderGeneration` | 競態守衛 | 防止舊 rAF 對換新的 Messages DOM 回焦。 |
| `pendingMeFocus` | focus intent | 跨同步 DOM replacement 保存 Me 控制項焦點。 |
| `suppressMeFocusRelease` | focus transaction flag | 區分程式重畫造成的 focusout 與使用者離開。 |
| `pendingMySessionsFocus` | focus intent | 跨 My Sessions 重畫保存動作焦點。 |
| `notificationSettings` | feature view state | C6R feature 透過 getter/setter 邊界持有；D4 不改 feature ownership。 |
| `presenceLocationStatus` | device lifecycle | geolocation tracker 的 UI 狀態，與私人 profile 不同。 |
| `presenceTracker` | imperative 資源 | geolocation watch handle，需要 stop／restart，不能放可渲染 store。 |
| `sessionHashRouteGeneration` | 競態守衛 | 防止舊 deep-link request 開啟錯誤 session。 |
| `bootDeepLinkReopenPending` | 一次性 bootstrap flag | auth/profile 競速後只自動重開一次 deep link。 |

分類合計：imperative 資源／handle 9、競態／focus／bootstrap 守衛 11、lifecycle／feature 狀態 5、待 D4 檢視的 view/navigation adapter 3；共 28，與掃描一致。

## Gate

最終版本的 `npm run typecheck`、`npm run lint`、`npm run prettier:check`：全綠。

`npm run test:session-unit`：

```text
1..279
# tests 279
# pass 279
# fail 0
# skipped 0
```

`npm run test:mock`（最後程式調整後重跑）：

```text
4 skipped
266 passed (2.5m)
```

`npm run test:local`（最後程式調整後重跑）：

```text
API：2 passed，0 failed
Playwright：11 skipped，42 passed (1.5m)
```

沒有 fixture 資源耗盡，未執行 local DB reset。

`npm run build`：

```text
✓ 148 modules transformed.
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-CgKsGA-d.css   65.39 kB │ gzip:  10.76 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-C1rc8heD.js   717.65 kB │ gzip: 201.21 kB
✓ built in 887ms
```

`npm run check:production-bundle`：

```text
production bundle check passed: 12 files, 12 demo identifiers absent
```

`git diff --check`：exit 0，無輸出。

## 非阻擋 WebKit

依規格只跑一次：

```text
7 failed
3 skipped
125 passed (2.1m)
```

固定參考是 126／6／3；多一項為 `keyboard dialogs trap focus and return it to the trigger` 的 WebKit focus timeout，與 D1 記錄的既有波動相同。D3 未修改 App／SurfaceHost／sheet／focus trap，正式 Chromium 同案例全綠；依非阻擋規則保留原始結果，不重跑修飾數字。

## 反向掃描與白名單

- `rg -n '^let (courts|courtsReady|authSession|currentProfile|currentAuthIdentity)\b' src/main.js`：輸出空。
- controller owner 測試非空，實際寫入 courts、auth session、private profile 後驗完整 snapshot，並確認 eligibility 不覆寫 profile。
- controller 17-step frozen call-sequence 測試全綠，沒有更動預期 sequence。
- `git diff -- src/sessionViews.js src/sheets.js src/map.js src/pins.js src/dataApi.js src/features supabase/migrations supabase/tests data/courts.json`：輸出空。
- `sessionController.js` 與 `controllerContracts.ts` 是完成「controller store 單一 owner」不可分割的 owner／契約修改；沒有改外部 API、feature 或 map 方向。
- 沒有 push、deploy、改 `.env*`、reset DB 或套 migration。

## BLOCKED／偏差

- BLOCKED：無。
- 偏差：單次非阻擋 WebKit 比固定參考多一項已知 focus timeout；必要 gate 全綠，證據如上。
