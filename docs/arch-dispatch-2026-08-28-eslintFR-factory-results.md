# ESLint 恢復 Phase FR-A/B/C 聯合派工單：factory results 63 筆（三 stage 單次交件）

- 日期：2026-08-28。模板＝E-9~E-11 聯合批;分組裁決與要件源自其驗收
  紀錄（`docs/arch-reports/eslintE9-E11-controller-ports-finale-acceptance-2026-08-28.md`
  「Factory results 63 分批裁決」段,經對立審查複算）。
- 開工基準：`151eec4`（E-9~E-11 ACCEPTED,manifest 163/20/63）之後
  包含本派工單的最新 main HEAD。開工前 porcelain 應為空。
- **本單特性（與先前所有批不同）**:63 筆 finding **全部位於
  `src/sessionController.ts`**（七個 factory result 的解構處）,但
  **該檔全程不編輯**——修的是七個 controller 檔的結果契約宣告。
  `sessionController.ts` 以 `git diff --stat` 空自證（最強論證）。
- **守門形狀**:`sessionController.ts` 的 selector 在 **FR-C 完成後**
  才上線（63 全清;generator 反向 assert 機器強制此順序）。FR-A/B
  期間唯一 canary=**ad-hoc override 差分**
  （`npx eslint --rule '{"@typescript-eslint/unbound-method":"error"}'
  src/sessionController.ts`）:現況恰 **63**（行域 314-613)→FR-A 後
  **40**→FR-B 後 **15**→FR-C 後 **0**——每拍逐 line:col 列舉,
  非裸計數。
- 交件時 generator 紅簽章;不改 ledger／manifest／generator。你不
  commit、不 push。

## 最終交件紅簽章（`--check`,恰**六十六條** `- ` 條目、順序固定）

missing×63（依 expectedFindings 序=manifest 陣列序,交件逐字抄錄）→
`findings expected 163, received 100` →
`files expected 20, received 19`（sessionController 清空）→
`sessionController findings expected 63, received 0`
（**注意:此第 66 條是本單特有**——finding path 全在該檔,推導 gate
必然觸發;E-9~E-11 驗收紀錄的 FR 條目數 24/26/17 有兩誤:漏算
sessionController 推導條,且 FR-B/C 誤用單批增量 missing 而非累計
——generator 每次輸出**累計**,以本單 25/50/66 為準）。

**Stage 快照**:FR-A 後=missing×23＋`findings expected 163, received
140`＋`sessionController findings expected 63, received 40`（無 files
條）=**25 條**;FR-B 後=missing×48＋`…received 115`＋
`…received 15`=**50 條**。

## 修法通則（三 stage 共用）

- 每筆 finding 的修復點=**宣告檔中對應成員**的 method signature→
  function property（外層改法同 E-5~E-11;多行成員只改外層,nested
  與參數行原樣）。成員名以 manifest `expressionFingerprint` 為準
  （`getPlayerGroups: playerGroups` 等改名解構取**成員名**
  getPlayerGroups／getVisibleSessions／isReconcileSuppressed）。
- **成員涵蓋事實（read-back 複算）**:七個結果契約的成員總數恰為
  63,與被解構集合**完全重合,凍結面為空集合**——每個結果 interface
  ／inline 回傳型別的全部成員都要轉,hunk 應覆蓋整個宣告 body
  （與 E-9 的「凍結陷阱」不同,本批無「留下不轉」的成員）。開工時
  逐檔以 manifest＋AST 列印「stableId→成員名→宣告行」對照表入回報
  （三點對點表基礎）。
- prettier（read-back 已逐行預驗）:轉換 delta 恆 +4 字元,63 個成員
  **無一超過 printWidth 120**（最長=authController `:75 setAuthState`
  116→恰 120）,prettier 實測**零重排、各檔行數不變**——**出現折行
  即代表轉換寫法有誤,紅旗**。hunk 論證:每檔 `git diff -U0` 的
  hunk 必須全落在該檔的結果宣告區間內。
- 七個 controller 檔的 **Dependencies interface（前批剛轉完）零 diff**
  ——同檔雙 contract,誤動 Dependencies 不清 finding 但會弄髒批面。

## Stage FR-A：mySessions 15＋playerDirectory 8（23 筆）

- `src/controller/mySessionsController.ts`:`export interface
  MySessionsController`（`:62-82`）中**被解構的 15 個成員**
  （解構處 `sessionController.ts:314-328`,全 shorthand）:actionFor／
  beginLifecycleAction／captureAuthSnapshot／currentParticipation／
  finishLifecycleAction／isCurrentAuthSnapshot／
  lifecycleActionIsInFlight／mySessionGroups／notifyMySessions／
  refreshMyPlayerBlocks／refreshMySessions／reloadParticipation／
  replaceMySessions／sessionKey／unblockPlayer（成員名開工以
  manifest 對照自驗;interface 中未列成員凍結）。
- `src/controller/playerDirectoryController.ts`:`export interface
  PlayerDirectoryController`（`:88-100`）中被解構的 8 個成員
  （`:353-360`,含 `:355 getPlayerGroups: playerGroups` 改名——成員
  名=getPlayerGroups）:clearPlayerDirectory／clearPlayerLayer／
  getPlayerGroups／loadPlayerDirectoryList／loadPlayers／openCourt／
  openPlayerCourt（多行 `:95-98`?開工自驗）／openPlayerDirectory。
- **FR-A 快照證據**:ad-hoc 63→40（逐 line:col:consumed 的 23 行
  =314-328＋353-360 消失）;紅簽章 25 條。

## Stage FR-B：discoveryMap 13＋intent 12（25 筆）

- `src/controller/discoveryMapController.ts`:`export interface
  DiscoveryMapController`（`:75-89`）中被解構的 13 個成員
  （`:379-391`,含 `:381 getVisibleSessions: visibleSessions` 改名）。
- `src/controller/intentController.ts`:`export interface
  IntentController`（`:93-116`）中被解構的 12 個成員（`:424-435`,
  含 `isReconcileSuppressed: reconcileSuppressed` 改名）。
- **FR-B 快照證據**:ad-hoc 40→15;紅簽章 50 條。

## Stage FR-C：lifecycle 11＋auth 3＋chat 1（15 筆）＋sessionController selector 上線

- `src/controller/lifecycleActionsController.ts`:`export interface
  LifecycleActionsController`（`:83-102`,E-11 位移後行號）中被解構
  的 11 個成員（`:455-465`）——注意 `requireMySessionAction`／
  `withdrawMySession` 等成員在 E-9 是「凍結陷阱」,本 stage 才輪到
  轉它們。
- `src/controller/authController.ts`:**工廠簽名上的 inline 顯式回傳
  型別**（`:73-77`,非具名 interface）的三個 method
  （`setAuthSession:74`／`setAuthState:75`／`setProfile:76`）——
  對應 `sessionController.ts:468` **單行三筆（cols 11/27/41）**,
  canary 與對點表必逐 `line:col`。切除論證用 AST 釘死該回傳型別
  literal 節點,凍結緊鄰的 `}: AuthControllerDependencies): {` 頭段
  token。
- `src/controller/chatController.ts`:inline 回傳型別（`:66-68`）的
  `openSessionChat:67`（對應 `:613:11`——E-8 的凍結 mine,本 stage
  才解凍）。
- **selector 上線**:63 全清後把 `"src/sessionController.ts"` 加入
  scoped files 陣列**末端**——字典序在七個 `src/controller/*` 與
  `src/map.ts` 之後（`src/m` < `src/s`）。**此陣列無自動排序
  （prettier 不排陣列、無 lint 規則),位置需人工確認**。上線後
  `npm run lint` 綠=全覆蓋守門,回溯驗證 FR-A/B 的 48 筆。
- **FR-C 快照證據**:ad-hoc 15→0;lint 綠→暫退抽樣（auth 三筆之一
  ＋lifecycle 一筆）→lint 紅於 `:468`／對應解構行→還原 SHA→綠。

## 聯合硬驗收條件

**紀律**:canary 前抄 SHA;清除只用精確編輯還原、禁 `git checkout`;
還原後比 SHA。

1. 最終紅簽章恰**六十六條**逐字（含第 66 條 sessionController 推導）。
2. 三 stage 快照（ad-hoc 63→40→15→0 逐 line:col＋紅簽章 25/50 條）
   逐字入回報。
3. **逐 stableId 三點對點 ×63**（宣告檔:成員行／解構 line:col／紅簽章
   同 ID——auth 三筆同行不同 col 分列）。
4. **`sessionController.ts` 零 diff 自證**:`git diff --stat --
   src/sessionController.ts` 空（最高優先,反向即全批退件）。
5. **餘檔論證 ×7**:五個具名 interface 檔各自「hunk 全落結果 interface
   區間」;auth/chat 用 AST 簽名切片論證。
6. **erased-token 全等 ×7**（A–D 口徑 esbuild）。
7. **selector 精確度**:`--print-config` 證 sessionController=error
   （FR-C 後）、`sheets.ts`／`App.tsx` 等未清檔仍 off。
8. **無新增例外**:不加 `any`／`@ts-ignore`／inline disable／wrapper／
   `.bind()`／新 arrow;Dependencies interfaces 零 diff。

## 解凍清單（Q3 守則:未列即凍結）

- 七個 controller 檔:僅各自結果契約中**被解構成員**的外層宣告形狀
  （auth/chat 為 inline 回傳型別的 3＋1 成員）。
- `eslint.config.js`:僅 scoped 區塊 `files` 陣列（一次插入
  sessionController）。

**仍凍結**:`src/sessionController.ts` 全檔（零 diff 自證）、七檔的
Dependencies interface 與其餘 interface／實作、其餘 `src/**`、
`tests/**`、`scripts/**`、baseline／ledger／manifest、`tsconfig.json`、
`package.json`、`package-lock.json`、全域 off 行、databaseTypes
override、bundle gate。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

- typecheck（**特別載重:63 個成員 bivariance→contravariance,
  `sessionController.ts` 是唯一 .ts consumer 且不編輯——typecheck 綠
  即證解構與轉發相容;具名檢查點=`sessionController.ts:68`
  `action: ReturnType<ReturnType<typeof
  createMySessionsController>["actionFor"]>` 是全庫唯一對結果成員的
  indexed access,轉後 `ReturnType<>` 取用仍成立,回報具名確認**;
  `--print-config` 回傳 severity 為陣列 `[0]`／`[2]` 形式）／lint／prettier:check／build／
  check:production-bundle（淨 0 B）／test:session-unit（346）／
  test:mock（≥298）／**test:local（動 src 必跑;基準=API 2＋browser
  45/11;紅時先數 DB——272 筆同型=累積污染,guarded reset 三拍）**／
  `git diff --check`。
- 紅簽章＋三 stage 快照＋對點 ×63＋零 diff 自證＋餘檔 ×7＋erased ×7。
- porcelain:恰為解凍 8 檔（七 controller＋config）＋回報,共 9 條。

## 回報合約

寫 `docs/arch-dispatch-2026-08-28-eslintFR-factory-results-report-codex.md`
（不 commit、不 push），必含:七檔修改後宣告區逐字原文（防偽）、
最終紅簽章六十六條逐字、三 stage 快照逐字、對點表 ×63、
sessionController 零 diff 自證、餘檔 ×7＋erased ×7、收尾矩陣逐字、
Codex 五問（第 5 問答「React contracts 79（app 22／sheets 42／pages
15）的三批切法與差異點盤點——宣告位置（App.tsx／AppServicesProvider
／sheets props／pages context）、finding 型態、selector 上線條件、
與 controller 批模板的不可沿用處」）、未做／疑義／BLOCKED。

## 驗收方後續動作（記載供對照,非你的工作）

ACCEPTED 時驗收方原子完成:驗收紀錄落盤→ledger 追加六十三筆（batch
分標 "FR-A"×23／"FR-B"×25／"FR-C"×15）→重生 manifest（預期 100／19
／**0**——sessionController 推導歸零）→`--check` 綠→一併 commit＋
進度表回填。
