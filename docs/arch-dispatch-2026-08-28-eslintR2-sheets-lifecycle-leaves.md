# ESLint 恢復 Phase R2-A/B/C 聯合派工單：sheets 42＋surface-lifecycle 19＋零星 2（三 stage 單次交件,清零批）

- 日期：2026-08-28。模板＝R1 聯合批;切法裁決見 R1 驗收紀錄
  （`docs/arch-reports/eslintR1-app-pages-acceptance-2026-08-28.md`「下批要件」,
  經對立審查全查）。**本批完成後 manifest 歸零(63→0),是最後的清零批**;
  收攏批(off 移除+generator 裁決)另立。
- 開工基準：`82dfe55`（R1 ACCEPTED,manifest 63/14）之後包含本派工單的
  最新 main HEAD。開工前 porcelain 應為空。
- 修法全部=method signature→function property（63 筆 proposedFixClass 均
  `function-property-contract`,已驗證）。
- **零 diff 自證檔 ×2**:`src/sheets.ts`（finding `:185:27` 的宣告在
  surfaceContracts）與 `src/sheets/SessionDetailSheet.tsx`（僅 lifecycle
  2 筆,宣告在 SurfaceHost）**全程不編輯**,`git diff --stat` 空自證。
- 交件時 generator 紅簽章;不改 ledger／manifest／generator。你不
  commit、不 push。

## 最終交件紅簽章（`--check`,恰**六十五條**）

missing×63（manifest 陣列序,逐字抄錄）→
`findings expected 63, received 0` → `files expected 14, received 0`。

**Stage 快照**:R2-A 後=missing×42＋`findings expected 63, received 21`＋
`files expected 14, received 12`=**44 條**（Report＋Withdraw 兩檔清空）;
R2-B 後=missing×61＋`…received 2`＋`files …received 2`=**63 條**。

## Canary（逐檔 ad-hoc 差分,每拍逐 line:col）

開工基線（per-file 總數,雙 family 合計）:Create **16**／Decide **4**／
Edit **4**／Filter **8**／PlayerCard **8**／PlayerDirectory **8**／
Profile **4**／Report **1**／SessionChat **4**／Withdraw **1**／
SessionDetail **2**／sheets.ts **1**／mySessionsCreatedFocus **1**／
privateDataRepository **1**,合計 63。

- R2-A 後:八個雙 family sheet 檔各餘 **2**（恰為 lifecycle 兩行）、
  Report／Withdraw **0**;SessionDetail 2／sheets.ts 1／零星 2 不變,
  合計 21。
- R2-B 後:全部 sheet 檔與 sheets.ts **0**;僅餘零星 2。
- R2-C 後:全庫 **0**。
- 每 stage 完成後 `npm run lint` 必須綠（既有 scoped 14 檔不受影響）。

## Stage R2-A：sheet contracts 42（10 檔,自檔宣告）

盤點 ground truth（宣告行以下列為準,開工以 AST＋manifest 自驗;42 筆
finding ↔ 42 個獨立宣告,**零一對多**）:

- **CreateSessionSheet.tsx 14**:`CreateSessionContentOptions`（`:94-116`）
  的 bumpTime `:95`／canPublish `:96`／clock `:97`／dateValueNow `:101`／
  **donePresentation `:102-106`（本批唯一多行:頭行
  `donePresentation(`→`donePresentation: (`,尾行
  `): CreateDonePresentation;`→`) => CreateDonePresentation;`,參數行
  原樣）**／fixedStartAt `:107`／candidateWindow `:108`／now `:110`／
  onBackToMap `:111`／onClose `:112`／onSubmit `:113`／onViewMySessions
  `:114`／toast `:115`;另 `CourtCell` 內聯 type 的 onClick `:140`
  （對應 finding `:135:3` 參數解構行）。凍結:config `:98`／courts `:99`
  ／courtsReady `:100`／initialForm `:109`／contentRef `:124`／CourtCell
  的 court／role／selected `:137-139`。
- **DecideSessionSheet.tsx 2**:`DecideSessionContentOptions`（`:27-34`）
  onClose `:29`／onDecide `:30`。凍結:candidateIds `:28`／rangeEndLocal
  `:31`／startAtLocal `:32`／unavailable `:33`;**`DecideSessionContentContract.setCourts`
  `:24` 是 method signature 但非 finding（ref 呼叫不觸發）——凍結,
  有 `*ContentContract` 的八個編輯檔同理,一律不得順手改**。
- **EditSessionSheet.tsx 2**:`EditSessionContentOptions`（`:30-41`）
  onClose `:35`／onSubmit `:36`。其餘成員與 `:44` setCourts 凍結。
- **FilterSheet.tsx 6（三個 interface）**:`FilterSheetContentOptions`
  （`:33-39`）onClose `:35`／onReset `:36`／onSetFilter `:37`;
  `FilterControlsProps`（`:71-74`）onSelect `:73`（finding `:76:64`）;
  `FilterFooterProps`（`:169-173`）onApply `:170`／onReset `:171`
  （findings `:175:25`／`:175:34`）。**同名異宣告防呆:onReset 兩筆分屬
  兩個 interface（`:36` 與 `:171`）,各自獨立,不可只改一處**。
- **PlayerCardSheet.tsx 6**:`PlayerCardSheetContentOptions`（`:36-46`）
  onClose `:39`／onCreate `:40`／onInvite `:41`／onSeeDirectory `:42`;
  `InviteOptions` 內聯（`:76-81`）onCreate `:79`;`InviteEmpty` 同行
  inline `:54`（`{ onCreate }: { onCreate(): void }`——**使用點＝宣告行
  同一行,只改 type 子字串 `onCreate(): void`→`onCreate: () => void`**）。
  **onCreate 三筆＝三個獨立宣告（54／79／40）,不可合併**。
- **PlayerDirectorySheet.tsx 6**:`PlayerDirectorySheetContentOptions`
  （`:36-40`）onClose `:37`／onOpenPlayer `:38`／onRetry `:39`（此
  interface 三成員全轉,凍結面空）;`DirectoryBody` 內聯（`:77-85`）
  onOpenPlayer `:82`／onRetry `:83`（state `:84` 凍結）;`DirectoryRow`
  同行 inline `:46`（**轉後 110→114,本批最接近 printWidth 的一行;同行
  `player: DirectoryPlayer` property 不可動**）。**onOpenPlayer 三筆／
  onRetry 兩筆各自獨立**。
- **ProfileCompletionSheet.tsx 2**:`ProfileCompletionContentOptions`
  （`:24-45`）onClose `:35`／onSubmit `:36`;**18 個資料 property 凍結**。
- **ReportDialog.tsx 1**:`ReportDialogContentOptions`（`:13-16`）
  onClose `:14`;targetLabel `:15` 凍結。
- **SessionChatSheet.tsx 2**:`SessionChatContentOptions`（`:31-41`）
  onClose `:35`／onFeedClick `:36`。
- **WithdrawSessionConfirmationDialog.tsx 1**:
  `WithdrawSessionConfirmationContentOptions`（`:4-6`）onClose `:5`
  （唯一成員,凍結面空）。

**R2-A 期間八個雙 family 檔的 surface-lifecycle 行凍結**（Create
`:814/:821`、Decide `:161/:165`、Edit `:308/:312`、Filter `:290/:297`、
PlayerCard `:304/:308`、PlayerDirectory `:214/:218`、Profile
`:280/:284`、SessionChat `:282/:289`——全在 mount 函式 return 物件,
與宣告區間不重疊,R2-B 靠 SurfaceHost 宣告轉換清除,不動這些行）。

## Stage R2-B：surface-lifecycle 19（宣告集中兩檔,fan-out 型）

- `src/app/SurfaceHost.tsx`:`SurfaceContentLifecycle`（`:13-16`）**兩個
  成員全轉**:isSurfaceRootLive `:14`、unmount `:15`——清除九個 sheet
  檔各 2 筆(18)。**`SurfaceContentHandle extends SurfaceContentLifecycle`
  （`:18` 起）的 commit／render 是 method signature 非 findings,凍結**;
  extends 關係是 typecheck 載重點。
- `src/surfaceContracts.ts`:`LoginModalContentHandle`（`:45-47`）unmount
  `:46` 單成員全轉——清除 `sheets.ts:185:27`（`mounted.registerUnmount(
  content.unmount)` method-reference 傳遞,轉後合法化）。**同檔相鄰
  `:41` 的 `onClose(): void;` method signature 非 finding,凍結**。
- 九個 sheet 檔與 sheets.ts 本 stage **不編輯**（宣告轉換即清 finding）。

## Stage R2-C：零星 2（各自檔內宣告）

- `src/mySessionsCreatedFocus.ts`:`MySessionsCreatedFocusOptions.
  onCreatedSessionFocus` `:7`（finding `:15:3` 參數解構）。
- `src/data/repositories/privateDataRepository.ts`:
  `PrivateDataRepositoryOptions.loadCourts` `:105`（finding `:130:3`
  參數解構）。其餘成員凍結。

## Prettier 預驗（盤點以 sed 實套驗證,非手數）

單行成員 delta 恆 +4;多行 donePresentation 頭／尾行 delta **+2／+2**
（尾行 `): `→`) => `）;轉後全部 ≤120,最緊=PlayerDirectory `:46`
（110→114）。**零折行、各檔行數不變;出現折行即紅旗**。R2-B/C 共
**五個**宣告行（SurfaceHost `:14`／`:15`＋surfaceContracts `:46`＋
零星 `:7`／`:105`）全部短行,同規則。

## Selector 上線（兩波,字典序人工確認,陣列無自動排序）

- **R2-B 後一次插 12 檔**,全在 `"src/sessionController.ts"` **之後**
  （`src/se` < `src/sh`）:先 `"src/sheets.ts"`（`sheets.` 的 `.` 0x2E <
  `sheets/` 的 `/` 0x2F）,再 10＋1 個 `src/sheets/*.tsx` 依字母序
  （CreateSession／DecideSession／EditSession／Filter／PlayerCard／
  PlayerDirectory／ProfileCompletion／Report／SessionChat／
  SessionDetail／Withdraw...——SessionChatSheet < SessionDetailSheet,
  開工自驗全序）。**R2-A 後不上線任何 selector**（八檔仍有 lifecycle
  2;Report／Withdraw 雖清空,併入 R2-B 一次上線較易機械驗收——R1
  驗收紀錄裁決）。
- **R2-C 後插 2 檔**:`"src/data/repositories/privateDataRepository.ts"`
  插 `src/controller/playerDirectoryController.ts` 之後、`src/map.ts`
  之前（`src/c` < `src/d` < `src/m`）;`"src/mySessionsCreatedFocus.ts"`
  插 `src/map.ts` 之後、`src/pages/MePage.tsx` 之前（`map` < `my` <
  `pages`）。最終陣列恰 **28 檔**。
- 上線後 `npm run lint` 綠=全庫 28 檔守門。暫退抽樣（跨三 stage 各一）:
  暫退 `SurfaceContentLifecycle:15 unmount`→committed lint 紅於九檔
  各 unmount 行＋（`surfaceContracts:46` 不動故 sheets.ts 不紅）;暫退
  `CreateSessionContentOptions:112 onClose`→紅於 `CreateSessionSheet.tsx:173:3`;
  暫退 `PrivateDataRepositoryOptions:105`→紅於
  `privateDataRepository.ts:130:3`。紀律:暫退前抄 SHA、精確還原、
  比 SHA、禁 `git checkout`。

## Typecheck 載重（具名檢查點）

1. `SurfaceContentHandle extends SurfaceContentLifecycle`
   （SurfaceHost `:18`）:基底轉 function property 後 extends 與九個
   mount 函式 return 物件字面量的結構賦值仍相容。
2. `sheets.ts:185` `mounted.registerUnmount(content.unmount)`:
   `LoginModalContentHandle.unmount` 轉後 method-reference 傳遞型別
   仍成立。
3. 各 sheet 檔 `mountXxxContent` 的 options 參數解構與 React 元件
   props 傳遞（42 筆 contract 的 consumer 全在自檔,typecheck 綠即證）。

**Variance 衝突預授權**（同 R1 條件）:TS2322 參數寬窄衝突可在實作端
加 annotation-only 註記,限 erased-token 全等＋逐處單列＋不動 runtime
token＋不收窄公開契約;無法以 annotation 解決→BLOCKED 回報。

## 聯合硬驗收條件

1. 最終紅簽章恰**六十五條**逐字（missing×63 manifest 陣列序＋兩條
   aggregate）。
2. 兩個 stage 快照（44／63 條＋逐檔 canary 差分逐 line:col）逐字入回報。
3. **逐 stableId 三點對點 ×63**（宣告檔:行:成員／finding path:line:col
   ／stableId;同名異宣告 **5 組**——onCreate×3／onOpenPlayer×3／
   onRetry×2／onReset×2／**unmount×2（SurfaceHost `:15` 對 9 筆 vs
   surfaceContracts `:46` 對 1 筆,跨檔同名異宣告）**——逐筆分列）。
4. **零 diff 自證 ×2**:`git diff --stat -- src/sheets.ts
   src/sheets/SessionDetailSheet.tsx` 空（最高優先,反向即退件）。
5. **餘檔論證 ×14**:編輯的 14 檔（10 sheet＋SurfaceHost＋
   surfaceContracts＋兩零星）各自「hunk 全落列名宣告區間」;凍結陷阱
   （各 ContentContract 的 ref 呼叫 method、SurfaceContentHandle
   commit/render、surfaceContracts `:41` onClose、ProfileCompletion 18
   property、同行 inline 的相鄰 property）以 hunk 不含其行號自證。
6. **erased-token 全等 ×14**:口徑**寫全**（R1 驗收 N-1 教訓）——兩側
   均 stdin 餵 `esbuild --loader=tsx`（.tsx）／`--loader=ts`（.ts）,
   如加 `--format` 參數必須兩側一致並寫入回報。
7. **selector 精確度**:`--print-config` 證 12＋2 檔=`[2]`;暫退抽樣
   三拍（見上）。全庫 28 檔後不可有任何 `src/**` 檔仍 `[0]` 卻含
   findings（manifest 歸零自證）。
8. **無新增例外**:不加 `any`／`@ts-ignore`／inline disable／wrapper／
   `.bind()`／新 arrow;variance 偏差僅限預授權條件。

## 解凍清單（Q3 守則:未列即凍結）

- 10 個 sheet 檔:僅 R2-A 列名宣告行（42 個成員的外層形狀）。
- `src/app/SurfaceHost.tsx`:僅 `:14-15` 兩行。
- `src/surfaceContracts.ts`:僅 `:46` 一行。
- `src/mySessionsCreatedFocus.ts`:僅 `:7`;
  `src/data/repositories/privateDataRepository.ts`:僅 `:105`。
- `eslint.config.js`:僅 scoped files 陣列（12＋2 插入）。
- （條件式）variance 預授權 annotation,逐處單列。

**仍凍結**:`src/sheets.ts`／`SessionDetailSheet.tsx`（零 diff 自證）、
八檔的 lifecycle return 物件行、各 ContentContract、
`SurfaceContentHandle` 的 commit/render、surfaceContracts 其餘、App／
AppServicesProvider／pages／controller 檔、其餘 `src/**`、`tests/**`、
`scripts/**`、baseline／ledger／manifest、`tsconfig.json`、
`package.json`、全域 off 行（**本批不動;收攏批處理**）、databaseTypes
override、bundle gate。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

- typecheck（三個具名檢查點確認）／lint／prettier:check／build／
  check:production-bundle（淨 0 B）／test:session-unit（346）／
  test:mock（≥298;本批動 sheets DOM 與 unmount 面,mock 是載重測試,
  若紅先隔離重跑,既知 FilterSheet lazy readiness flake 照實記錄）／
  **test:local（動 src 必跑;基準=API 2＋browser 45/11;紅先數 DB）**／
  `git diff --check`。
- 紅簽章＋兩 stage 快照＋對點 ×63＋零 diff ×2＋餘檔 ×14＋erased ×14。
- porcelain:無 variance 偏差時恰為解凍 15 檔（14 編輯檔＋config）＋
  回報,共 **16 條**;偏差時每處各加一檔。

## 回報合約

寫 `docs/arch-dispatch-2026-08-28-eslintR2-sheets-lifecycle-leaves-report-codex.md`
（不 commit、不 push）,必含:14 檔修改後宣告區逐字原文（防偽,含
凍結成員與相鄰行原樣）、最終紅簽章六十五條逐字、兩 stage 快照逐字、
對點表 ×63、零 diff 自證 ×2、餘檔 ×14＋erased ×14（口徑指令逐字）、
variance 偏差清單（無則明寫「零偏差」）、收尾矩陣逐字、Codex 五問
（第 5 問答「收攏批盤點——全域 off 行與 scoped 區塊移除後的等價全庫
形狀、generator／manifest／ledger／baseline 四資產轉常規 gate 或退役
的利弊、G1 baseline SHA pin 與 G2 acceptanceDoc 檢查的處置、移除後
的 canary 設計(如何證明全庫 error 生效且無檔漏網)」）、未做／疑義
／BLOCKED。

## 驗收方後續動作（記載供對照,非你的工作）

ACCEPTED 時驗收方原子完成:驗收紀錄落盤→ledger 追加六十三筆（batch
分標 "R2-A"×42／"R2-B"×19／"R2-C"×2）→重生 manifest（預期 **0／0**,
全庫歸零）→`--check` 綠→一併 commit＋進度表回填。
