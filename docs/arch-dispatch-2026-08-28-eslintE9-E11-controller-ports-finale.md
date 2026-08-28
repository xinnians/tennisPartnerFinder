# ESLint 恢復 Phase E-9~E-11 聯合派工單：controller ports 收官三批（單次交件）

- 日期：2026-08-28。模板＝E-8 紅簽章制;三 stage 要件源自 E-8 驗收紀錄
  （`docs/arch-reports/eslintE8-chat-port-acceptance-2026-08-28.md`
  「E-9 派工輸入」段,經對立審查逐筆複算）。
- 開工基準：`f63b688`（E-8 ACCEPTED,manifest 198/22/63）之後包含本
  派工單的最新 main HEAD。開工前 `git status --porcelain` 應為空。
- **本單三個 stage 依序執行、一次交件、驗收方一次驗收**（省轉交
  成本,user 拍板）。每個 stage 完成時抄錄「stage 快照證據」,最終
  交件=三 stage 合併狀態。
- 交件時 generator 紅簽章;不改 ledger／不重生 manifest／不改
  generator。你不 commit、不 push。

## 最終交件紅簽章（`node scripts/generate-eslint-unbound-manifest.mjs
--check`,恰三十七條 `- ` 條目、順序固定）

missing×35（依 expectedFindings 序=**檔名字典序分組、無交錯**:
intent 22 筆在前 → lifecycle 13 筆在後,且 lifecycle 內部 extraction
2 在前、ports 11 在後——read-back 已產出精確 35 筆序列供驗收對照,
交件時逐字抄錄實際輸出）→ `findings expected 198, received 163` →
`files expected 22, received 20`（lifecycle 與 intent 兩檔全清）——
無其他條目。

---

## Stage 1（E-9）：lifecycle ports 11——無 selector 批

`src/controller/lifecycleActionsController.ts` 的
`LifecycleActionsDependencies`（`:56-78`,14 成員=11 目標＋
`api:57`／`store:74`／`surfaceRegistry:75`）十一個 method signature 改
function property。目標（stableId／宣告行／finding 行）:

| stableId | member | 宣告行 | finding 行 |
| --- | --- | --- | --- |
| `4500e4510b7a7d554218f8eedbd80850` | `beginLifecycleAction` | `:58-62`（多行） | `108:3` |
| `7f9eafaf86f052e1ea15e32b5e395eb1` | `captureAuthSnapshot` | `:63` | `109:3` |
| `d9244d7a6c863395e13063a98c0006a1` | `finishLifecycleAction` | `:64` | `110:3` |
| `f70ddcdff97a9c195874e28a5caffb70` | `isCurrentAuthSnapshot` | `:65` | `111:3` |
| `65091efc930269d3532efef4dd2c1ee8` | `openDecideSession` | `:66-69`（多行） | `112:3` |
| `2fd1b37c0f88d35da7e88cbe478f783c` | `openEditSession` | `:70` | `113:3` |
| `987535f9fa42320940cfbad9cf7df3af` | `openWithdrawConfirmation` | `:71` | `114:3` |
| `d8c2f57104bc8e4f92a22ce394cb2273` | `refreshAuthoritativeState` | `:72` | `115:3` |
| `3388ea60fb76122bbe9aff704854a09c` | `sessionKey` | `:73` | `116:3` |
| `8fe7fe129236a63dbd4b6396d64095e5` | `toast` | `:76` | `119:3` |
| `9ef772e2211454c055d7dfb76970d334` | `transitionSurfaces` | `:77` | `120:3` |

- **本 stage 不加 selector**（該檔 extraction 2 未清,提前上線會被
  generator 反向 assert 與 `npm run lint` 擋）。
- **形狀注意**:此檔是 parameter-destructure——finding 行就在 factory
  簽名的**參數解構 `:107-120` 十四行內,逐字不動**（factory 簽名開頭
  `:106` 與型別註記收尾 `:121` 一併凍結;與 E-8「factory signature
  凍結」不同,勿照抄措辭）。
- `:71` 的 `openWithdrawConfirmation` 單行內嵌
  `{ onConfirm(): unknown }`——外層改 function property,**inline
  nested `onConfirm()` 維持 method 形狀、token 序列不變**。
- **凍結（Stage 3 前）**:`LifecycleDataApi:25-40` 全部（**含
  `acceptSessionParticipant?:26`／`declineSessionParticipant?:34`——
  它們是 extraction 兩筆的宣告點,Stage 3 才解凍**）;
  `DecideHandlers:42-47`／`EditHandlers:49-54`;**結果 interface
  `LifecycleActionsController:80-99`——對應 `sessionController.ts:
  455-465` 十一筆（屬 63,凍結）;其中 `requireMySessionAction:87-90`
  與 `withdrawMySession:98` 和你剛在 E-8 轉過的 chat deps 成員**同名
  同形**,機械套用最易誤轉,獨立標紅**。
- 傳播面（零 diff＋typecheck 對點）:`sessionController.ts:47`／
  `:54`／`:115`／`:116`／`:120`（三個 indexed access,多於 E-8）;
  construction `:438-453` 唯一,`api: api!` 唯一非 shorthand。
- **Stage 1 canary（ad-hoc 差分,committed lint 不適用）**:
  修復前 `npx eslint --rule
  '{"@typescript-eslint/unbound-method":"error"}'
  src/controller/lifecycleActionsController.ts` 恰紅 **13**（逐
  line:col 抄錄:108-116/119/120 ports＋230:49/230:80 extraction）→
  修復後恰紅 **2 且逐 line:col=230:49/230:80**（列舉非裸計數）→
  暫退 11 筆再回 **13（逐 line:col 與首拍一致）**→精確還原 SHA。
- **Stage 1 快照證據**:此時 generator 紅簽章=missing×11＋
  `findings expected 198, received 187`＋**無 files 條目**（該檔仍餘
  2 筆）;餘檔 byteEqual 區間=切 `:56-78` 後 HEAD vs current 全等。

## Stage 2（E-10）：intent ports 22——controller ports 最後一檔

`src/controller/intentController.ts` 的 `IntentControllerDependencies`
（`:47-91`,27 成員=22 目標＋`api:49`／`intentStore:60`／
`locationGate:66`／`store:88`／`surfaceRegistry:89`）二十二個 method
signature 改 function property。目標宣告行:`actionFor:48`、
`beginLifecycleAction:50-54`（多行）、`captureAuthSnapshot:55`、
`clearPlayerLayer:56`、`commitPlayerVisibility:57`、
`currentParticipation:58`、`finishLifecycleAction:59`、
`isCurrentAuthSnapshot:61`、`lifecycleActionIsInFlight:62`、
`loadDiscovery:63`、`loadPlayerDirectoryList:64`、`loadPlayers:65`、
`openCreateSession:67-73`（多行,nested `onClose:70`／`onSubmit:71`／
`onViewMySessions:72` 與 `courts:68`／`courtsReady:69` 凍結——行號
開工自驗）、**`openLogin:74`（單行內嵌 nested
`onClose(options?: { reason?: string }): void`——外層改,nested token
序列不變,新型態）**、`openSessionChat:75`、`openSessionDetail:76`、
`profilePrompt:77-83`（多行,nested `onClose` 與四個 property 凍結）、
`publish:84`、`refreshLocationViewport:85`、`reloadParticipation:86`、
`showCreatedSession:87`、`toast:90`。finding 行=解構 `:124-150` 中的
22 行（manifest line 欄為準,stableId 表=現行 manifest 該檔 22 筆,
開工時自行列印核對）。

- **同檔凍結**:`IntentDataApi` 等其他 interface;exported
  `IntentController`（`:93-`）——對應 `sessionController.ts:424-435`
  十二筆（屬 63,凍結）,同名陷阱同 Stage 1 邏輯。
- construction `sessionController.ts:394-422` 唯一;**非 shorthand
  五處原文保留**:`api: api!`（`:396`）、
  `loadDiscovery: () => discoveryMapController.loadDiscovery()`、
  `loadPlayers: () => playerDirectoryController.loadPlayers()`、
  `openSessionChat: (sessionId) => openSessionChat(sessionId)`、
  `profilePrompt: promptProfile`（改名傳入,來源 `:121`）。
- 傳播面:`sessionController.ts:46`（別名）／`:53`（api 交集）／
  `:114/:118/:121/:125/:126`（indexed access:openCreateSession/
  openLogin/profilePrompt/showCreatedSession/intentStore——行號開工
  自驗,以 grep `IntentControllerOptions[` 為準）;零 diff＋typecheck
  對點。
- **selector 上線**:該檔 22 筆即全部,全清後把
  `"src/controller/intentController.ts"` 依字典序插入 scoped files
  （`discoveryMapController` 之後、`mySessionsController` 之前;
  prettier 產物為準）。
- **Stage 2 canary（selector 上線後,committed lint 可用）**:lint 綠
  →暫退 22 筆→恰紅 22 於解構行（逐字抄錄實測行號）→精確還原 SHA→
  綠。
- **Stage 2 快照證據**:generator 紅簽章=missing×33＋
  `findings expected 198, received 165`＋`files expected 22, received
  21`;餘檔 byteEqual 區間=切 `:47-91` 後全等。

## Stage 3（E-11）：lifecycle extraction 2＋該檔 selector 上線

- **解凍兩個成員**:`LifecycleDataApi` 的
  `acceptSessionParticipant?:26` 與 `declineSessionParticipant?:34`
  改 optional function property（`name?: (args) => R;`,optional 記號
  保留）;其餘 `LifecycleDataApi` 成員仍凍結。
  **prettier 行為預告（read-back 實測）**:`accept…` 轉換後恰 120
  字元維持單行;`decline…` 轉換後 121 字元 > printWidth,prettier 會
  展開為四行——**這是預期產物**,最終檔淨 +3 行、後續內容行號位移
  （`:230` 的 `apiAction` 行→`:233`）。Stage 3 canary 暫退兩筆時
  行號隨之回到 `230:49/230:80`,看到 233 不是做錯。
- **`:230` runtime 原文一字不動**:`const apiAction = decision ===
  "accepted" ? api.acceptSessionParticipant :
  api.declineSessionParticipant;`——修的是 contract 形狀,不是呼叫。
  母計畫此 family 標高風險（port 可替換,實作者可能依賴 receiver）;
  E-1 抽樣已證 construction path（`bindPrivateMethod` 回傳 arrow、
  private repository 具名 async closure）目前不讀 `this`,若你在
  重驗中發現任何 construction 實作讀 `this`,**停手回報**（移行為批）。
- **selector 上線**:此時該檔全清,把
  `"src/controller/lifecycleActionsController.ts"` 依字典序插入
  （`intentController` 之後、`mySessionsController` 之前）。
- **Stage 3 canary**:ad-hoc 差分 2→0（逐 line:col）;selector 上線後
  `npm run lint` 綠→暫退 `:26`／`:34` 兩行→恰紅 2 於 `230:49`／
  `230:80`→還原 SHA→綠。
- data port 傳播:`sessionController.ts:54` 的
  `LifecycleActionsControllerOptions["api"]` 交集零 diff＋typecheck
  對點;`api: api!` construction 不動。

---

## 聯合硬驗收條件

**紀律**:canary 前先抄目標檔 SHA-256;清除一律精確編輯還原、禁
`git checkout`;還原後比 SHA。

1. 最終紅簽章恰三十七條（見篇首）,逐字抄錄。
2. 三個 stage 各自的 canary 與快照證據逐字入回報（Stage 1 差分
   13→2→13、Stage 2 lint 22 筆、Stage 3 差分 2→0＋lint 2 筆）。
3. **逐 stableId 三點對點 ×35**（三表:宣告行／canary 或差分命中行／
   紅簽章同 ID）。
4. **餘檔 byteEqual ×2**:intent 切 `:47-91`;lifecycle 因 Stage 3
   prettier 展開有行號位移,改用 hunk 論證——最終
   `git diff -U0 -- src/controller/lifecycleActionsController.ts` 的
   **全部 hunk 恰落在兩個 interface 區**（`LifecycleDataApi`
   `:25-40`→最終 `:25-43`;`LifecycleActionsDependencies`
   `:56-78`→最終 `:59-81`）,等價於「HEAD 切兩區間 vs 最終檔切對應
   區間後餘檔逐 byte 全等」,兩種寫法擇一自證。
5. **erased-token 全等 ×2**:兩檔各自 A–D 口徑 esbuild 逐 byte 全等。
6. **selector 精確度**:`npx eslint --print-config` 證 intent／
   lifecycleActions=error、`sessionController.ts`＝off（未外溢）;
   `sheets.ts` 等抽一檔仍 off。
7. **無新增例外**:不加 `any`／`@ts-ignore`／inline disable／wrapper／
   `.bind()`／新 arrow。

## 解凍清單（Q3 守則:未列即凍結）

- `src/controller/lifecycleActionsController.ts`:11 目標外層＋
  Stage 3 的 `:26`／`:34` 兩行。
- `src/controller/intentController.ts`:22 目標外層。
- `eslint.config.js`:僅 scoped 區塊 `files` 陣列（兩次插入）。

**仍凍結**:其餘 `src/**` 全部（含 `sessionController.ts`——兩檔結果
interface 的 23 筆跨檔 finding 全在此,誤清即紅簽章漂移）、
`tests/**`、`scripts/**`、baseline／ledger／manifest（交件維持 HEAD
版）、`tsconfig.json`、`package.json`、`package-lock.json`、全域 off
行、databaseTypes override、bundle gate。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

- typecheck／lint／prettier:check／build／check:production-bundle
  （main 與 total gzip 淨 0 B）／test:session-unit（346）／test:mock
  （≥298）／**test:local（動 src,必跑;基準=API 2＋browser 45/11;
  紅時先數 DB 再 guarded reset 三拍分類）**／`git diff --check`。
- 最終紅簽章＋三 stage canary＋逐 stableId ×35＋餘檔 byteEqual ×2＋
  erased ×2＋selector 精確度。
- `git status --porcelain` 全庫:恰為解凍 3 檔＋回報,共 4 條。

## 回報合約

寫
`docs/arch-dispatch-2026-08-28-eslintE9-E11-controller-ports-finale-report-codex.md`
（不 commit、不 push），必含:兩檔修改後 interface 逐字原文（防偽）、
最終紅簽章三十七條逐字、三 stage canary／快照逐字、逐 stableId 三表、
餘檔 byteEqual ×2、erased ×2、收尾矩陣逐字、Codex 五問（第 5 問答
「factory results 63 依方案 A 切三批的具體分組建議——63 筆全報
`sessionController.ts:302-613` 的七個 result destructure,宣告分散
七個 controller 檔的結果 interface;請按宣告檔分組給 3 批的組合
（如 15+8+13／12+11／3+1 或其他）,並評估:同批多宣告檔時餘檔
byteEqual 怎麼組織、`sessionController.ts` 恰在最後一批全清時
selector 上線、63 筆的紅簽章在三批各自的條目數」）、未做／疑義／
BLOCKED。

## missing×35 預測序列（read-back 產出,交件時對照;實際輸出為準）

1–22 `src/controller/intentController.ts`:
`68bcd45f`／`b06b01d2`／`30b027aa`／`07150d83`／`89342c0a`／
`3e3a3b20`／`06658390`／`156f8c70`／`d5945f03`／`0bbe3ff8`／
`2e8dcfe2`／`2b633044`／`d41ddf19`／`61a99f77`／`32a61647`／
`b9e9cf08`／`c0964e8d`／`879f40b8`／`36eaa31d`／`4691d544`／
`b4065b3b`／`487726c7`（前 8 hex,全 ID 見 manifest）。
23–35 `src/controller/lifecycleActionsController.ts`:
`935b4a87`／`a3efe94c`（extraction 2 在前）→`4500e451`／`8fe7fe12`／
`9ef772e2`／`7f9eafaf`／`d9244d7a`／`f70ddcdf`／`65091efc`／
`2fd1b37c`／`987535f9`／`d8c2f571`／`3388ea60`（ports 11）。

## 驗收方後續動作（記載供對照,非你的工作）

ACCEPTED 時驗收方原子完成:驗收紀錄落盤→ledger 追加三十五筆（batch
分標 "E-9"×11／"E-10"×22／"E-11"×2）→重生 manifest（預期 163／20／
63）→`--check` 綠→一併 commit＋進度表回填。
