# ESLint 恢復 Phase E-5 派工單：discoveryMap controller ports 6 筆

- 日期：2026-08-28。母文件：
  `docs/arch-plan-2026-08-27-typeaware-eslint-restoration.md` §4E；模板＝
  E-4（`docs/arch-reports/eslintE4-mysessions-port-acceptance-2026-08-28.md`,
  含紅簽章常設判準）；差異點已按 E-4 對立審查提醒寫入本單。
- 開工基準：`48dd6c6`（E-4 ACCEPTED）之後包含本派工單的最新 main HEAD。
  開工前 `git status --porcelain` 應為空；有條目即停手回報。
- **流程同 E-4 紅簽章制**：你交件時 generator 維持紅簽章；**不改**
  ledger、**不重生** manifest（驗收方 ACCEPTED 時原子完成）。G1／G2 已
  常駐，本批**不改 generator**。
- 你不 commit、不 push；working tree 交驗收方。

## 目標六筆（manifest stable ID 凍結；該檔全部、單一 owner）

| stableId | 位置 | expression |
| --- | --- | --- |
| `1ed8b19ddfae0cdc2ecf7234a2069d51` | `discoveryMapController.ts:96:3` | `getPlayerGroups` |
| `545214c04e96dec6589b97408d383638` | `:97:3` | `loadPlayers` |
| `1b8f9d6f4ff0613167cf9610203242ee` | `:99:3` | `reconcileActiveDetail` |
| `4ef06f27267ec8414004d40a450e2bcb` | `:100:3` | `render` |
| `68f6f0bc444c826ad20bd5d2bb8a505c` | `:101:3` | `renderPins` |
| `34af30da673a2ea64bbfff5a73fb2e16` | `:102:3` | `renderPlayers` |

## 修改一：`src/controller/discoveryMapController.ts`（唯一 src 改動面）

`DiscoveryMapDependencies`（`:59-73`，未 export）的**恰六個** method
signature（`:63`／`:64`／`:66`／`:67`／`:68`／`:69`）改 function
property：

**注意六行不連續：`:65 mapTools?: MapTools;` 夾在中間，原位不動**——
不可整塊 replace（interface 成員移位不會被 erased-token／lint／行數
守門攔到）。逐行原位改：

```ts
// 修改前（:63-69 現行原文，mapTools 行原樣保留）
  getPlayerGroups(): ControllerPlayerGroup[];
  loadPlayers(bounds: MapBounds): Promise<boolean>;
  mapTools?: MapTools;
  reconcileActiveDetail(bounds: MapBounds): void;
  render(view: ControllerMapViewPayload): void;
  renderPins(sessions: SessionSummary[]): void;
  renderPlayers(view: ControllerPlayerLayerViewState): void;
// 修改後（mapTools 行零 diff）
  getPlayerGroups: () => ControllerPlayerGroup[];
  loadPlayers: (bounds: MapBounds) => Promise<boolean>;
  mapTools?: MapTools;
  reconcileActiveDetail: (bounds: MapBounds) => void;
  render: (view: ControllerMapViewPayload) => void;
  renderPins: (sessions: SessionSummary[]) => void;
  renderPlayers: (view: ControllerPlayerLayerViewState) => void;
```

- 成員順序、參數名、回傳型別一字不動；其餘成員（`api`／
  `discoveryGate`／`discoveryPollIntervalMs?`／`mapTools?`／`store`／
  `surfaceRegistry`／`visibilityTarget?`——本就是 property signature，
  含兩個帶預設的 optional）**零 diff**；`:92-` factory destructure 原文
  不動。
- construction site 唯一（開單實測）：`sessionController.ts:363-377`。
  **注意 `:367` 是 `getPlayerGroups: playerGroups` 改名傳入、`:364` 是
  `api: api!`（皆非 shorthand），其餘為 shorthand——全部與 function
  property 契約相容，零 diff**。發現第二個 construction site 即停手
  回報。
- **已知非 construction site 的傳播面（不觸發停手條款）**：
  `sessionController.ts:45`（`Parameters` 推導）、`:52`
  （`["api"]`）、`:102-105`（`mapTools`／`render`／`renderPins`／
  `renderPlayers` 的 indexed access 轉出到 public options）——函式型別
  形狀不變，僅 bivariance→contravariance;`createSessionController` 無
  `.ts` caller（E-4 已驗），零影響。

## 修改二：`eslint.config.js` scoped files 追加

```js
files: ["src/controller/discoveryMapController.ts", "src/controller/mySessionsController.ts", "src/map.ts"],
```

（精確路徑、字典序;禁 glob——其餘五個 controller 檔仍有 finding,
glob 會觸發 generator 反向 assert。追加後整行 112 字元 < printWidth
120,單行即 prettier 產物,不換行。）

## 硬驗收條件

**紀律**：canary 前先抄目標檔 SHA-256;清除一律精確編輯還原、禁
`git checkout`;還原後比 SHA。

1. **紅簽章（交件狀態,逐字抄錄）**：generator exit 非 0,錯誤**恰為
   八條 `- ` 條目、順序固定**（標頭與 stack 不計）：missing×6（依上表
   序,path=`src/controller/discoveryMapController.ts`）→
   `findings expected 240, received 234` →
   `files expected 26, received 25`——無其他條目。
2. **規則有牙三拍**：selector 追加後 `npm run lint` 全綠→暫退六行回
   method signature→lint 恰紅 **6 筆**於 `:96/:97/:99/:100/:101/:102`
   ——注意 finding 行是 factory destructure 行,**先驗**暫退後 lint
   紅的實際行號並逐字抄錄（E-4 經驗:紅點在 destructure 參數行）→
   精確還原 SHA→綠。
3. **erased-token 全等**：HEAD 與修改後的 `discoveryMapController.ts`
   以 A–D 口徑 esbuild 逐 byte 全等。
4. **無新增例外**：不加 `any`／`@ts-ignore`／inline disable／wrapper／
   `.bind()`／新 arrow。
5. **常設判準自證（E-4 拍板）**：紅簽章單獨不構成證據——回報必含
   ①lint canary 恰紅 6 筆逐字（真 config,免疫排除攻擊）②
   `eslint.config.js` diff 恰一處＋generator／`SCAN_GLOBS` 零 diff 自證
   ③erased-token 全等,三者齊備。

## 解凍清單（Q3 守則：未列即凍結）

- `src/controller/discoveryMapController.ts`：僅 `:63/:64/:66/:67/:68/:69`
  六個成員宣告形狀（以名稱為準:`getPlayerGroups`／`loadPlayers`／
  `reconcileActiveDetail`／`render`／`renderPins`／`renderPlayers`）。
  **同檔另外三個 interface 明列凍結**：`DiscoveryDataApi`（`:39-41`）、
  `MapTools`（`:43-51`,四個 optional method signature）、
  `DiscoveryMapController`（`:75-89`,13 個 method signature——動它會使
  sessionController 63→50,紅簽章多出第 9 條）——「順手一致化」即越界
  退件。
- `eslint.config.js`：僅 scoped 區塊 `files` 陣列。

**仍凍結**：其餘 `src/**` 全部（含 `sessionController.ts`）、`tests/**`、
`scripts/**`（**generator 本批零 diff**）、baseline／ledger（你不追加;
canary 不涉及）、manifest 兩檔（交件維持 HEAD 版;generator throw 早於
寫檔可自證）、`tsconfig.json`、`package.json`、`package-lock.json`、
全域 off 行、databaseTypes override、bundle gate。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

- typecheck／lint／prettier:check／build／check:production-bundle
  （main 與 total gzip 淨 0 B）／test:session-unit（346）／test:mock
  （≥298）／**test:local（動 src,必跑;基準=API 2＋browser 45 passed
  11 skipped;紅時先數 DB 再 guarded reset 三拍分類——E-4 驗收時已
  reset 過一次,累積應少）**／`git diff --check`。
- 紅簽章逐字＋規則三拍＋erased-token。
- `git status --porcelain` 全庫：恰為解凍 2 檔＋回報,共 3 條;
  baseline／ledger／manifest／generator 零 diff 自證（最高優先）。

## 回報合約

寫 `docs/arch-dispatch-2026-08-28-eslintE5-discoverymap-port-report-codex.md`
（不 commit、不 push），必含：修改後 `:59-73` 逐字原文（防偽引用）、
紅簽章八條逐字、lint canary 紅 6 筆逐字（含實際行號）、erased-token
對帳、收尾矩陣逐字、Codex 五問（第 5 問答「剩餘 controller ports 五檔
（chat 11／lifecycleActions 11 註意該檔另有 api-method-extraction 2 筆
不屬 ports 批／auth 12／playerDirectory 13／intent 22）逐批走同模板時,
各檔的已知差異點盤點——construction site、非 shorthand 傳入、indexed
access 轉出、與『該檔全清才上線』的判定（lifecycleActions 13 筆需
ports 11＋extraction 2 兩批都完成才可上線,中間批不加 selector）」）、
未做／疑義／BLOCKED。

## 驗收方後續動作（記載供對照,非你的工作）

ACCEPTED 時驗收方原子完成：驗收紀錄落盤→ledger 追加六筆（batch
"E-5"）→重生 manifest（預期 234／25／63;scope gate 驗
discoveryMapController cleared＋error）→`--check` 綠→一併 commit。
