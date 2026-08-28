# ESLint 恢復 Phase R1-A/B 聯合派工單：React app 22＋pages 15（兩 stage 單次交件）

- 日期：2026-08-28。模板＝FR 聯合批（`docs/arch-dispatch-2026-08-28-eslintFR-factory-results.md`）;
  切法裁決見 FR 驗收紀錄
  （`docs/arch-reports/eslintFR-factory-results-acceptance-2026-08-28.md`「下批要件」,
  原 React-A/C 依檔案重疊合併為 R1）。
- 開工基準：`02ec1d8`（FR ACCEPTED,manifest 100/19/0）之後包含本派工單的
  最新 main HEAD。開工前 porcelain 應為空。
- **本單特性**:37 筆 finding 分布五檔,但**編輯的宣告檔只有三個**
  （`src/controllerContracts.ts`／`src/app/AppServicesProvider.tsx`／
  `src/app/App.tsx`）＋`eslint.config.js`。三個 pages 檔
  （MePage／MySessionsPage／NearbySessionsDrawer）**全程不編輯**,以
  `git diff --stat -- src/pages/` 空自證（本單最強論證,對應 FR 批的
  sessionController 零 diff）。
- **凍結陷阱回歸（與 FR「空集合」相反,回到 E-9 形狀）**:四個宣告
  interface 都含非目標成員,只轉列名成員;同 interface 的其他 method
  signature **非 findings,不得順手改**（詳見修法段粗體警告）。
- 交件時 generator 紅簽章;不改 ledger／manifest／generator。你不
  commit、不 push。

## 最終交件紅簽章（`--check`,恰**三十九條** `- ` 條目）

missing×37 → `findings expected 100, received 63` →
`files expected 19, received 14`。
**注意**:missing 順序=manifest 陣列序,本批 37 筆在陣列中**不連續**
（與 FR 批不同）——交件逐字抄錄 generator 實際輸出,不可自行按分組
重排。sessionController 推導條目本批不出現（expected 0=received 0）。

**Stage R1-A 快照**:missing×22＋`findings expected 100, received 78`＋
`files expected 19, received 17`=**24 條**。

## Canary（本批無單一聚合檔,逐 finding 檔 ad-hoc 差分）

`npx eslint --rule '{"@typescript-eslint/unbound-method":"error"}' <file>`
逐檔,每拍逐 line:col 列舉非裸計數:

- 開工基線:App.tsx **3**（370:22／612:64／612:73）、
  AppServicesProvider.tsx **19**（235:33／236:24／272:44／292:23／
  293:21／294:22／295:16／296:16／297:17／324:17／325:28／330:17／
  331:15／332:21／333:19／334:22／336:28／337:24／338:19）、
  MePage.tsx **9**（646:5-654:5）、MySessionsPage.tsx **5**（631:30／
  654:13／655:19／656:15／674:79）、NearbySessionsDrawer.tsx **1**
  （187:11）,合計 37。
- R1-A 後:App 3→**0**、AppServicesProvider 19→**0**;pages 三檔不變
  （9/5/1）。
- R1-B 後:MePage 9→**0**、MySessions 5→**0**、Nearby 1→**0**。
- 每 stage 完成後 `npm run lint` 必須綠（既有 scoped 9 檔不得受影響）。

## Stage R1-A：app 22（App.tsx 3＋AppServicesProvider 19）

### `src/controllerContracts.ts`:`ControllerApi`（`:274-328`）僅轉 17 個列名成員

cancelMySession `:276`／confirmMySessionAttendance `:280`／expandBounds
`:281`／markMySessionPlayed `:289`／openCreateIntent `:291`／
openRosterParticipantReport `:294-297`（**多行**:頭行
`openRosterParticipantReport(`→`openRosterParticipantReport: (`,尾行
`): ControllerSurfaceResult;`→`) => ControllerSurfaceResult;`,參數行
原樣——E-7 多行簽名模板）／openSession `:298`／openSessionChat `:299`
／openSessionDecision `:300`／openSessionEdit `:301`／openSessionReport
`:303`／resetFilters `:307`／retryDiscovery `:310`／setDrawerState
`:319`／togglePlayerVisibility `:325`／unblockPlayer `:326`／
withdrawMySession `:327`。

**ControllerApi 其餘成員全部凍結**——含被 indexed access 引用的
refreshMySessions／reviewMySessionParticipant／respondInvite 等
method signature:它們非 findings（使用點非 unbound 型）,轉了不清
finding 只弄髒批面。17 成員對應 19 筆 finding:openSession 與
openSessionChat 各有兩個使用點（`AppServicesProvider.tsx` 294:22＋
334:22、272:44＋333:19）,對點表一成員可對兩筆。

### `src/app/App.tsx`:兩個自檔 interface 的 3 個成員

- `FilterToolbarHandlers`（`:39-42`）:僅 onOpenFilter `:40`
  （對應 `:370:22` passed-as-callback）;**onSetFilter `:41` 凍結**。
- `LoginModalOptions`（`:44-49`）:onClose `:47`、onProvider `:48`
  （optional method:`onProvider?(provider: string): unknown;`→
  `onProvider?: (provider: string) => unknown;`,`?` 保留）,對應
  `:612:64`／`:612:73` parameter-destructure;action `:45`／
  lineProviderId `:46` 兩個資料 property 凍結——**注意 `:46` 是凍結行
  不是 onClose,行號以此為準**。

## Stage R1-B：pages 15（宣告全在 `src/app/AppServicesProvider.tsx`,pages 檔不編輯）

15 筆 finding ↔ 15 個宣告行一一對應,分屬四個 interface:

- `MySessionsAppActions`（`:18-23`）:onBack `:19`／onCreatedSessionFocus
  `:20`／onEnablePush `:21`／onSignIn `:22`——4 成員全轉（此 interface
  凍結面空）。對應 MySessionsPage `654:13`／`631:30`／`655:19`／`656:15`。
- `NearbyDrawerAppActions`（`:25-27`）:onSubscribe `:26` 全轉。對應
  NearbySessionsDrawer `187:11`。
- `MeAppActions`（`:29-41`）:onEditProfile `:31` 至 onSignOut `:39`
  九個 method 全轉,對應 MePage `646:5`-`654:5`;**lineProviderId `:30`
  ／supportHref `:40` 兩個資料 property 凍結**。
- `MySessionsActions`（`:115` 起）:**僅 onRefresh `:134`**
  （`onRefresh(): ReturnType<ControllerApi["refreshMySessions"]>;`→
  `onRefresh: () => ReturnType<…>;`,對應 MySessionsPage `674:79`
  passed-as-callback）。**最強凍結陷阱**:同 interface 的
  onAccept `:116-119`（**多行 method signature,形狀與要轉的
  `:294-297` 最像,最易被順手轉——凍結**）／onAcceptInvite `:120`／
  onCreateSession `:123`／onDecline `:124-127`／onDeclineInvite `:128`
  等 method signature 與各 `MySessionsServices["…"]` indexed-access
  property 全部原樣,一律不得順手改。

注意 onEnablePush／onSignIn 在 `MySessionsAppActions` 與 `MeAppActions`
各有一行,是**不同宣告**各對一筆 finding,不是重複。

## 修法通則與 prettier 預驗

- 轉換=外層 method signature→function property（E-5 起模板）;唯二
  特例:`:294-297` 多行（見上）、App `:48` optional。
- prettier（已逐行預算）:35 個宣告（36 個物理行）中,單行者 delta
  恆 +4,多行 `:294`／`:297` 頭尾行 delta 為 +2／+1;轉後最長=
  AppServicesProvider `:35`（107→111）,**全部 ≤120,零折行、各檔
  行數不變——出現折行即轉換寫法有誤,紅旗**（`:294-297` 單行化後
  125>120,prettier 必維持四行）。hunk 論證:三個宣告檔
  `git diff -U0` 的 hunk 必須全落在上列 interface 區間內。

## Selector 上線（R1-B 後,五檔全清）

`eslint.config.js` scoped files 陣列插入五條,**字典序、人工確認位置**
（陣列無自動排序）:

- `"src/app/App.tsx"`、`"src/app/AppServicesProvider.tsx"` 插**陣列
  最前**（`src/app/` < `src/controller/`;App.tsx < AppServicesProvider
  ——`App.` 的 `.` (0x2E) < `AppS` 的 `S`）。
- `"src/pages/MePage.tsx"`、`"src/pages/MySessionsPage.tsx"`、
  `"src/pages/NearbySessionsDrawer.tsx"` 插 `src/map.ts` 之後、
  `src/sessionController.ts` 之前（`src/m` < `src/p` < `src/s`）。

上線後 `npm run lint` 綠=五檔全覆蓋守門。暫退抽樣:暫退
`ControllerApi:276 cancelMySession`＋`MeAppActions:31 onEditProfile`
各回 method signature→committed lint 精確紅於
`AppServicesProvider.tsx:324:17` 與 `MePage.tsx:646:5`→精確還原→
比 SHA→再綠。紀律:暫退前抄兩檔 SHA;還原只用精確編輯,禁
`git checkout`。

## Typecheck 載重（本批專屬 variance 面,具名檢查點）

ControllerApi 17 成員轉 function property 後,
`src/controller/controllerApiContract.ts:13` `typecheckControllerApi`
的回傳賦值橋（FactoryResult→ControllerApi,兩側自 FR 後皆 function
property）啟用 contravariance 實檢——typecheck 綠即證七個 controller
實作與公開契約逐成員相容,回報具名確認。次要檢查點:
`AppServicesProvider.tsx:16` `Pick<ControllerApi, "openSessionChat" |
"sessionStore">` 與 `:121` 起共 10 條 `MySessionsServices["…"]`
indexed access（對應 10 個相異目標成員）轉後仍成立。

**Variance 衝突預授權**（比照 FR 批 discoveryMap `:135` 先例）:若橋或
consumer 爆 TS2322 參數寬窄衝突,允許在**實作端加 annotation-only
型別註記**處理,條件:esbuild erased-token 全等必須維持、逐處單列
偏差（位置/原因/before/after 原文）、不改任何 runtime token、不收窄
公開契約。若無法以 annotation 解決（需動 runtime 或改契約語意）→
**BLOCKED 回報,不得自行裁量**。

## 聯合硬驗收條件

1. 最終紅簽章恰**三十九條**逐字（missing×37 依 manifest 陣列序＋兩條
   aggregate）。
2. Stage R1-A 快照（逐檔 canary 差分＋紅簽章 24 條）逐字入回報。
3. **逐 stableId 三點對點 ×37**（宣告檔:行:成員／finding path:line:col
   ／stableId;openSession／openSessionChat 一成員對兩筆分列）。
4. **pages 三檔零 diff 自證**:`git diff --stat -- src/pages/` 空
   （最高優先,反向即全批退件）。
5. **餘檔論證 ×3**:controllerContracts／AppServicesProvider／App 各自
   「hunk 全落列名 interface 區間」;凍結陷阱成員（onSetFilter／
   onAcceptInvite／onDecline 等）以 hunk 不含其行號自證。
6. **erased-token 全等 ×3**（宣告檔;口徑=**兩側均以 stdin 餵**
   `esbuild --loader=ts`,HEAD 與 working 對稱——repo 內路徑直接餵檔
   會被自動套 tsconfig 產生 `"use strict"` 假差異,見 FR 驗收紀錄）。
7. **selector 精確度**:`--print-config` 證五檔=`[2]`（severity 陣列
   形式）、`src/sheets/FilterSheet.tsx`（8 筆未清）與
   `src/sheets/CreateSessionSheet.tsx`（16 筆未清）仍 `[0]`——反例
   必須用**尚有 findings 的檔**才有牙;暫退抽樣三拍（見上）。
8. **無新增例外**:不加 `any`／`@ts-ignore`／inline disable／wrapper／
   `.bind()`／新 arrow;variance 偏差僅限預授權條件內並逐處單列。

## 解凍清單（Q3 守則:未列即凍結）

- `src/controllerContracts.ts`:僅 ControllerApi 的 17 個列名成員外層
  宣告形狀。
- `src/app/AppServicesProvider.tsx`:僅四個 interface 的 15 個列名成員。
- `src/app/App.tsx`:僅兩個 interface 的 3 個列名成員。
- `eslint.config.js`:僅 scoped 區塊 `files` 陣列（五條插入）。
- （條件式）variance 預授權:衝突發生的實作檔（可能是七個 controller
  檔或 `src/sessionController.ts`）**僅就該處 annotation 一行解凍**,
  逐處單列;無衝突時這些檔維持凍結、零 diff。

**仍凍結**:三個 pages 檔（零 diff 自證）、`src/sessionController.ts`
與七個 controller 檔（僅上述 variance 預授權例外,無偏差時零 diff）、
sheets 全部、SurfaceHost（surface-lifecycle 是 R2 批範圍）、上列
interface 的非列名成員（含 onAccept `:116-119` 等多行 method）、其餘
`src/**`、`tests/**`、`scripts/**`、baseline／ledger／manifest、
`tsconfig.json`、`package.json`、全域 off 行、databaseTypes override、
bundle gate。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

- typecheck（含兩個具名檢查點確認）／lint／prettier:check／build／
  check:production-bundle（淨 0 B）／test:session-unit（346）／
  test:mock（≥298;既知 FilterSheet lazy readiness flake 與本批無關,
  重跑最終綠即可,照實記錄）／**test:local（動 src 必跑;基準=API 2＋
  browser 45/11;紅時先數 DB——同型累積污染先 guarded reset 三拍）**／
  `git diff --check`。
- 紅簽章＋stage 快照＋對點 ×37＋pages 零 diff 自證＋餘檔 ×3＋erased ×3。
- porcelain:無 variance 偏差時恰為解凍 4 檔（三宣告檔＋config）＋
  回報,共 **5 條**;動用 variance 預授權時每處偏差各加一檔,條數
  與偏差清單一一對應。

## 回報合約

寫 `docs/arch-dispatch-2026-08-28-eslintR1-app-pages-report-codex.md`
（不 commit、不 push）,必含:三宣告檔修改後宣告區逐字原文（防偽,
含凍結成員原樣以證未動）、最終紅簽章三十九條逐字、R1-A 快照逐字、
對點表 ×37、pages 零 diff 自證、餘檔 ×3＋erased ×3、variance 偏差
清單（若有,逐處 before/after;無則明寫「零偏差」）、收尾矩陣逐字、
Codex 五問（第 5 問答「R2 批（sheets contract 42＋surface-lifecycle
19＋method-ref 1＋injected-repo 1,共 63）的三 stage 切法盤點——
surface-lifecycle 宣告集中 `src/app/SurfaceHost.tsx` 18＋
`src/surfaceContracts.ts` 1 的形狀、10 個 sheet 檔雙 family 同檔的
凍結互動、兩筆零星自檔宣告、selector 一次上線 12+ 檔的條件、與 R1
模板的不可沿用處」）、未做／疑義／BLOCKED。

## 驗收方後續動作（記載供對照,非你的工作）

ACCEPTED 時驗收方原子完成:驗收紀錄落盤→ledger 追加三十七筆（batch
分標 "R1-A"×22／"R1-B"×15）→重生 manifest（預期 63／14）→`--check`
綠→一併 commit＋進度表回填。
