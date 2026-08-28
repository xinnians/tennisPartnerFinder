# Type-aware ESLint 九條規則恢復拆批方案

- 日期：2026-08-27
- 基準：批 6F 兩個 feature 完成 TypeScript 轉換後的 working tree
- 性質：未來派工基礎；**不是規則恢復核可，也不修改 `eslint.config.js`**

## 1. 掃描方法

以 Node 載入現行 flat config，在記憶體中只把九條既存 `off` 規則覆寫成
`error`，再由 `ESLint` API 掃描 `src/**/*.{ts,tsx}` 與 `vite.config.ts`。沒有建立
暫存 config、沒有寫檔，也沒有變更正式 lint 結果。

掃描總量為 325 個 finding；批 6F 新轉的兩檔沒有出現在任何 finding 清單。

## 2. 當下 ground truth

| 規則                             | findings | 檔案數 | 檔案                                                                                                                                                                                                                                                                                                              |
| -------------------------------- | -------: | -----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-redundant-type-constituents` |        9 |      6 | `app/App.tsx`、`controllerContracts.ts`、`data/authApi.ts`、`data/databaseTypes.ts`、`sheets.ts`、`surfaceContracts.ts`                                                                                                                                                                                           |
| `no-unnecessary-type-assertion`  |       10 |      8 | `controller/lifecycleActionsController.ts`、`controller/playerDirectoryController.ts`、`data/dataErrors.ts`、`features/discovery/discoveryFeature.ts`、`features/notifications/notificationFeature.ts`、`features/profile-auth/profileAuthFeature.ts`、`requestGate.ts`、`sessionStore.ts`                        |
| `no-unsafe-return`               |        8 |      2 | `data/repositories/dataRepository.ts`、`sessionPresentation.ts`                                                                                                                                                                                                                                                   |
| `no-unsafe-call`                 |        5 |      3 | `data/repositories/dataRepository.ts`、`features/notifications/notificationFeature.ts`、`sheets.ts`                                                                                                                                                                                                               |
| `no-unsafe-member-access`        |       25 |      4 | `features/chat/chatFeature.ts`、`features/notifications/notificationFeature.ts`、`sessionController.ts`、`sessionPresentation.ts`                                                                                                                                                                                 |
| `no-unsafe-assignment`           |       12 |      7 | `config.ts`、`controller/chatController.ts`、`features/notifications/notificationFeature.ts`、`filters.ts`、`map.ts`、`sessionController.ts`、`sessionPresentation.ts`                                                                                                                                            |
| `no-base-to-string`              |        8 |      4 | `profile.ts`、`sessionController.ts`、`sessionPresentation.ts`、`taipeiTime.ts`                                                                                                                                                                                                                                   |
| `no-unsafe-argument`             |        2 |      1 | `sessionPresentation.ts`                                                                                                                                                                                                                                                                                          |
| `unbound-method`                 |      246 |     28 | `app/App.tsx`、`app/AppServicesProvider.tsx`、七個 `controller/*Controller.ts`、`data/repositories/privateDataRepository.ts`、`map.ts`、`mySessionsCreatedFocus.ts`、`pages/MePage.tsx`、`pages/MySessionsPage.tsx`、`pages/NearbySessionsDrawer.tsx`、`sessionController.ts`、十一個 `sheets/*.tsx`、`sheets.ts` |

## 3. `unbound-method` 初步抽樣分類

這 246 筆不能以全域 `.bind()` 或 arrow rewrite 機械修正。初步抽樣分成：

| 類型                           | 代表位置                                                  | 初判                                                               | 後續處置                                                                                                                     |
| ------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| React callback property        | `app/App.tsx:370` 的 `filterToolbarHandlers.onOpenFilter` | 高機率 false positive；port method 未宣告 `this: void`             | 先把 callback-only interface method 改成 function property 或加 `this: void`，擦除後 token 應全等                            |
| context/hook action 解構       | `pages/MePage.tsx:646-654`                                | 高機率 false positive；來源是 app action object                    | 從 provider contract 單源補 callback function-property 型別，不在 consumer 逐筆包 arrow                                      |
| controller factory result 解構 | `sessionController.ts:314-328` 等 63 筆                   | 高機率 false positive；factory 回傳 closure function               | 優先在 `ControllerApi`／各 subcontroller return interface 宣告 `this: void` 或 function property，並以 exact-key bridge 驗證 |
| surface lifecycle method 傳遞  | `sheets.ts:185`、`CreateSessionSheet.tsx:814,821`         | 需查實作後判定；可能是 closure，也可能依賴 receiver                | 逐一追到 `mountSurfaceContent`／surface handle 定義；只有確認不讀 `this` 才做 type-only 宣告                                 |
| API method 擷取後呼叫          | `lifecycleActionsController.ts:230`                       | **this-sensitive 風險較高**；結構 port 不保證實作者不依賴 receiver | 優先改 port 為 function-property contract並驗 factory；若實作者真依賴 receiver，需保留 receiver call 或顯式 bind，另做行為批 |
| injected repository callback   | `privateDataRepository.ts:130` 的 `loadCourts`            | 中等風險；目前實作者像 closure，但 injection contract 可換         | 查所有 construction site，再決定 `this: void` 或 wrapper；不憑單一實作消音                                                   |
| built-in/static callback       | `privateDataRepository.ts:135` 的 `Array.isArray`         | false positive 樣本；靜態函式不依賴 receiver                       | 可用 `this: void` 已知簽名或小型 wrapper；需 token／測試證明，不全域豁免                                                     |
| callback defaults              | `map.ts:470` 的 `onSession`／`onCluster`                  | 高機率 false positive                                              | 改 `SessionPinHandlers` callback 型別，不改 destructure/default runtime                                                      |

正式專批前應產出完整 246 筆分類 manifest，至少包含「定義來源、construction site、
是否讀 `this`、預定修法、載重測試」。初步抽樣不能當作批量核可。

## 4. 建議五段批序

### A. 小量 unsafe argument／call／return——**ACCEPTED（2026-08-28）**

狀態：已完成並驗收（`docs/arch-reports/eslintA-unsafe-boundary-acceptance-2026-08-28.md`）。
三規則恢復、15 筆清零、零 runtime token；連帶 member-access 25→6、
assignment 12→4（餘 283 findings）。以下原方案文字保留為歷史依據。

- 範圍：`no-unsafe-argument` 2、`no-unsafe-call` 5、`no-unsafe-return` 8；集中在
  `sessionPresentation.ts`、repository、notification、`sheets.ts`。
- 順序：先把 repository mapper／presentation input-output boundary 從 `any` 收斂成
  `unknown`＋guard，再修 call site；避免在 consumer 端堆 assertion。
- 風險：資料 mapper fallback、lazy module callable 與 React presentation 回傳 shape。
- 驗收草案：每條規則各有暫時 canary 打紅→SHA 還原→綠；所有 runtime 檔逐檔
  esbuild token 對帳；unit/mock/local/build/bundle 全矩陣。

### B. redundant constituent／unnecessary assertion 純型別批——**ACCEPTED（2026-08-28）**

狀態：已完成並驗收（`docs/arch-reports/eslintB-type-purity-acceptance-2026-08-28.md`）。
兩規則恢復、17 筆清零、零 runtime token；`databaseTypes.ts` 依 §5 方案一
scoped override 記帳 2 筆。債餘 4 條 off／266 findings（264 待修＋2 記帳）。
以下原方案文字保留為歷史依據。

- 範圍：9＋10 個 finding。
- 順序：先 handwritten contracts，再處理 generated `databaseTypes.ts` 的政策項。
- 風險：移除 assertion 可能讓後續推導變寬；union 簡化可能改 public type surface，雖不改
  runtime 仍需下游 typecheck bridge。
- 驗收草案：兩規則分別 canary；`.d.ts`／contract consumer typecheck；esbuild 擦除全等；
  generated file 若未拍板則以 scoped override 留在後續，不得手改後假裝可重生。

### C. unsafe assignment／member-access 資料邊界批——**ACCEPTED（2026-08-28）**

狀態：已完成並驗收（`docs/arch-reports/eslintC-data-boundary-acceptance-2026-08-28.md`）。
兩規則恢復、10 筆清零（port 收斂 4＋collection cast 6）、零 runtime token。
債餘 2 條 off／256 findings（254 待修＋2 記帳）。以下原方案文字保留為歷史依據。

- 範圍：12＋25 個 finding；notification、session controller、presentation 是交集熱點。
- 順序：由來源向下游修（config／repository payload → mapper → controller → UI），避免用
  assertion 把 `any` 往後搬。
- 風險：外部資料、dynamic import 與 surface payload narrowing 容易誤改 fallback。
- 驗收草案：惡意／malformed payload canary、stale gate tests、兩規則各自紅綠三拍、逐檔
  token 對帳、完整 mock/local。

### D. `no-base-to-string` UI policy 批——**ACCEPTED（2026-08-28）**

狀態：已完成並驗收（`docs/arch-reports/eslintD-base-to-string-acceptance-2026-08-28.md`）。
證明制零行為路線（8 站 erasable cast＋construction-site 證明，零 object
來源、零文案裁決）；含 cast 寬窄裁決記帳。債餘 1 條 off（unbound-method
246）＋2 記帳。以下原方案文字保留為歷史依據。

- 範圍：8 個 finding，四檔。
- 先為 null／undefined／object／symbol 定義逐欄位顯示政策，再改實作；不能用通用
  `String(value)` 自動消音。
- 風險：使用者可見文案、日期時間與錯誤 fallback。
- 驗收草案：每個 finding 有 before/after 輸入矩陣，既存中文字面 seal、token 差異逐點
  裁決、mock/local 視覺 journey。

### E. `unbound-method` 專批——**進行中（進度表 2026-08-28 回填）**

進度控制：本節進度表＋`docs/arch-eslint-phaseE-removal-ledger.json`
（機器帳：已接受移除逐筆）＋`docs/arch-eslint-phaseE-unbound-manifest.json`
header（現值）。每批 ACCEPTED 時回填本表。

| 批次 | 範圍 | 狀態 | commit | 驗收紀錄 |
| --- | --- | --- | --- | --- |
| E-1 | manifest 產出（generator＋246 筆分類，不改碼） | ACCEPTED | `77365a0` | `eslintE1-unbound-manifest-acceptance-2026-08-28.md` |
| E-2 | callback-default 2（map.ts；首個 scoped 上線） | ACCEPTED | `abd0cf1` | `eslintE2-map-callback-default-acceptance-2026-08-28.md` |
| E-3 | ledger 機械化（常數退場、集合等式、scoped 正反 assert） | ACCEPTED | `e5ca551` | `eslintE3-manifest-ledger-acceptance-2026-08-28.md` |
| E-4 | mySessions ports 4＋G1/G2 守門（首個紅簽章流程批） | ACCEPTED | `48dd6c6` | `eslintE4-mysessions-port-acceptance-2026-08-28.md` |
| E-5 | discoveryMap ports 6 | ACCEPTED | `1cbe80e` | `eslintE5-discoverymap-port-acceptance-2026-08-28.md` |
| E-6 | auth ports 12 | 已派工待 Codex | 派工單 `f46b2af` | — |
| E-7 起 | chat 11 → lifecycle ports 11（不加 selector）→ playerDirectory 13 → intent 22 → lifecycle extraction 2 → factory results 63（sessionController，family/owner 切小批，最後一批才上線）→ React contracts 79（app 22／sheets 42／pages 15）→ method-ref 1＋surface-lifecycle 19 | 未派 | — | — |

量化現況（E-5 後）：`unbound-method` **234 findings／25 檔**（baseline
246−ledger 12）；scoped 上線 3 檔（map／mySessions／discoveryMap）；
另 databaseTypes ledger 2（§5 方案一）。全庫清零後收攏：移除全域 off
＋scoped 區塊，裁決 generator/manifest 轉常規 gate 或退役。

流程紀律（E-3／E-4 拍板，詳見各驗收紀錄）：實作者交**紅簽章**
（generator 恰 N+2 條錯誤）＋lint canary＋erased-token 三重證據；
ledger 追加與 manifest 重生由驗收方 ACCEPTED 時原子完成；清零門檻以
檔計非 family 計；多行簽名檔（chat／lifecycle／playerDirectory／
intent）驗收改逐 stableId 對點（nested handler method signature 非
findings，不得順手改）。

以下原始方案文字保留為歷史依據。

- 範圍：246 筆／28 檔；先做完整分類 manifest，再依 contract family 切小批，而非一次
  開規則。
- 建議次序：plain callback ports → controller closure returns → React provider actions →
  surfaces → repository/API 高風險 receiver。
- 風險：錯誤 bind、callback identity 改變、React effect dependency／memoization、真正
  receiver-dependent method 失去 `this`。
- 驗收草案：每個小批只開該 scope 的規則；identity/call-order tests、strict canary、
  erased-token 對帳。凡需 wrapper／bind 而產生 runtime token，必須列點裁決並跑對應行為矩陣。

## 5. `databaseTypes.ts` generated 策略（待拍板）

目前 `no-redundant-type-constituents` 觸及 `src/data/databaseTypes.ts`。可選策略：

1. **建議起點：generated scoped override**。只對具固定 generated header 的該檔暫時維持
   off；handwritten TS 先恢復規則。優點是 `npm run db:gen-types` 可重生；缺點是 generated
   債仍存在，需明確追蹤。
2. generator 後處理／上游修正：把 deterministic rewrite 納入 `db:gen-types` 並測
   `generate → git diff --exit-code`。只有能證明每次重生穩定時才採用。
3. 不建議：直接手改 generated 檔。下一次 Supabase type generation 會覆寫，形成假綠。

拍板前不得把 generated finding 靜默排除，也不得在 generated 檔加入 inline disable。

## 6. 共通驗收紀律

- 每批先以記憶體 override 重掃並凍結 finding manifest；修完後同口徑為零。
- 規則 canary：暫加最小違例→lint 精準打紅→SHA-256 byte-identical 還原→綠。
- annotation／type-only 修正應以 esbuild 擦除 token 全等；任何 runtime token 差異逐點列
  before/after、載重測試與裁決。
- 固定跑 typecheck、lint、Prettier、build、production bundle、unit、mock、local、
  `git diff --check`。
- 不以新增 `any`、`@ts-ignore`、inline disable 或擴大 global override 清零。

## 7. 明文邊界

本文件只提供未來拆批方案。本批 `eslint.config.js` 必須零 diff，九條規則仍維持現況；
任何一條的實際恢復都需另立派工、凍結 manifest 與核可範圍。
