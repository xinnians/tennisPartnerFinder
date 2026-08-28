# ESLint 恢復 Phase E-7 派工單：playerDirectory controller ports 13 筆（首個多行簽名批）

- 日期：2026-08-28。模板＝E-6 紅簽章制;凍結清單與差異點源自 E-6 驗收
  紀錄（`docs/arch-reports/eslintE6-auth-port-acceptance-2026-08-28.md`
  「E-7 派工輸入」段,經對立審查逐筆複算）。
- 開工基準：`8007e3e`（E-6 ACCEPTED）之後包含本派工單的最新 main HEAD。
  開工前 `git status --porcelain` 應為空;有條目即停手回報。
- 流程同紅簽章制：交件時 generator 紅簽章;不改 ledger／不重生
  manifest／不改 generator。
- **本批是首個含多行 method signature 的批**:驗收不用「diff 行數」
  自證（多行改動＋prettier 重排會使行數不定）,改用**逐 stableId
  三點對點**（E-5 驗收拍板）。
- 你不 commit、不 push;working tree 交驗收方。

## 目標十三筆（manifest stable ID 凍結;該檔全部、單一 owner）

| stableId | member | finding 行 | 宣告行區間 |
| --- | --- | --- | --- |
| `eb04e759cc4cf6e905697e4b6ce2ee06` | `captureAuthSnapshot` | `109:3` | `:46` |
| `3b8caa77050a0787e319652907aa7265` | `publish` | `120:3` | `:79` |
| `c4409683140c0deed10a011b2ee14522` | `reloadParticipation` | `121:3` | `:80` |
| `77882e87081d797558371271c5b99245` | `requireSessionAction` | `122:3` | `:81` |
| `ddfc3fbebe89c821c0c1cb923020802c` | `transitionSurfaces` | `125:3` | `:84` |
| `5db1cfcb66828b1ad35770cde90c1ac4` | `visibleSessions` | `126:3` | `:85` |
| `614e224d354fee168352fc27e6aae982` | `isCurrentAuthSnapshot` | `110:3` | `:47` |
| `5df8df592522cc83b0e9a9261dcd9e03` | `openCourtDrawer` | `111:3` | `:48-52`（多行） |
| `f5e840372c0aee2407cb0e1a37a9d900` | `openCourtPlayersDrawer` | `112:3` | `:53-57`（多行） |
| `e059c6c214384b533ee05809a3aad86f` | `openCreateIntent` | `113:3` | `:58` |
| `cb489a441fd27ff9e499282e5c5d7395` | `openPlayerCard` | `114:3` | `:59-69`（多行） |
| `73aef827bbad053d1251acb3d85dd9f8` | `openPlayerDirectoryList` | `115:3` | `:70-74`（多行） |
| `0d0ccf3e15796e9eb1c985902254ae69` | `openSessionById` | `116:3` | `:75` |

## 修改一：`src/controller/playerDirectoryController.ts`（唯一 src 改動面）

`PlayerDirectoryControllerDependencies`（`:44-86`，未 export，19 成員=
13 目標＋6 凍結）的十三個 method signature 改 function property。

**九個單行目標**：同前批模式 `name(args): R;` → `name: (args) => R;`。

**四個多行目標——只改外層形狀**（`name(` → `name: (`、`): R;` →
`) => R;`）,**參數表與 handlers 物件型別逐 token 零 diff**：

```ts
// openCourtDrawer 修改後（:48-52;handlers 行原樣）
  openCourtDrawer: (
    court: DataCourt,
    sessions: SessionSummary[],
    handlers: { courts: DataCourt[]; onOpenSession(sessionId: ControllerIdentifier): unknown }
  ) => ControllerSurfaceHandle | null | undefined;
// openCourtPlayersDrawer 修改後（:53-57）
  openCourtPlayersDrawer: (
    court: DataCourt,
    players: ControllerPlayer[],
    handlers: { onClose(): void; onOpenPlayer(player: ControllerPlayer): unknown }
  ) => ControllerSurfaceHandle | null | undefined;
// openPlayerCard 修改後（:59-69;handlers 六行原樣）
  openPlayerCard: (
    player: ControllerPlayer | PlayerDirectoryEntry,
    handlers: {
      courts: DataCourt[];
      myInvitableSessions: MySessionSummary[];
      onClose(): void;
      onCreate(): void;
      onInvite(sessionId: ControllerIdentifier): Promise<unknown>;
      onSeeDirectory(): unknown;
    }
  ) => ControllerSurfaceHandle | null | undefined;
// openPlayerDirectoryList 修改後（:70-74;handlers 三行原樣）
  openPlayerDirectoryList: (handlers: {
    onClose(): void;
    onOpenPlayer(player: PlayerDirectoryEntry): unknown;
    onRetry(): Promise<boolean>;
  }) => ControllerSurfaceHandle | null | undefined;
```

若 prettier 對改後形狀有不同重排,以 `prettier:check` 綠的產物為準,
但 **nested 內容 token 序列不變**是硬條件。

### 凍結清單（逐 token 零 diff,「順手一致化」即退件）

- **nested handler method signature 10 筆**（非 manifest findings,
  erased-token 抓不到,驗收方逐 token 對點）:`onOpenSession:51`、
  `onClose`＋`onOpenPlayer` **同在 `:56`（整行零 diff）**、
  `onClose:64`／`onCreate:65`／`onInvite:66`／`onSeeDirectory:67`、
  `onClose:71`／`onOpenPlayer:72`／`onRetry:73`。
- handler 內非 method property:`courts`（`:51`／`:62`）、
  `myInvitableSessions`（`:63`）。
- 非目標成員 6:`api:45`／`playerCardGate:76`／`playerDirectoryGate:77`
  ／`playerGate:78`／`store:82`／`surfaceRegistry:83`。
- **明確凍結的同檔地雷**:同檔 exported `interface
  PlayerDirectoryController`（`:88-100`）的 8 個 method signature（含
  多行 `openPlayerCourt:95-98`,形狀誘惑度極高）——其 declaration 對應
  `sessionController.ts:353-360` 的 8 筆 finding（屬 63 筆,本批凍結）,
  動它會使 sessionController 63→55、紅簽章由 15 條膨脹為 24 條,即
  越界退件。`CapturingRequestGate.capture:30`、`PlayerDataApi:34-36`
  三個 optional method signature 同凍結。

### construction 與傳播面

- construction site 唯一（開單實測）:`sessionController.ts:331-351`;
  `api: api!` 在 `:332`;**四個 forwarding arrow 原文保留**:
  `:337 openCreateIntent: () => intentController.openCreateIntent(),`、
  `:344 publish: () => discoveryMapController.publish(),`、
  `:346 requireSessionAction: (intent) =>
  intentController.requireSessionAction(intent) as Promise<boolean> |
  void,`（含 cast）、`:350 visibleSessions: () =>
  discoveryMapController.getVisibleSessions(),`。發現第二個
  construction site 即停手回報。
- **新傳播面（與 E-6 不同:是目標成員本身,不觸發停手但必驗）**:
  `sessionController.ts:49`（`Parameters` 別名）＋`:110-113` 對
  `openCourtDrawer`／`openCourtPlayersDrawer`／`openPlayerDirectoryList`
  ／`openPlayerCard` 四個**目標**成員的 indexed access（
  `SessionControllerOptions`,未 export,consumer 全 `.js` 不進
  checkJs）——`sessionController.ts` 零 diff,以 `npm run typecheck`
  全綠對點;`sessionController.ts:56` 的 `["api"]` 為非目標（注意與
  `playerDirectoryController.ts:56` 的 nested 凍結行是兩個檔,勿混淆）。

## 修改二：`eslint.config.js` scoped files 追加

在現有多行陣列依字典序插入
`"src/controller/playerDirectoryController.ts"`（`mySessionsController`
之後、`src/map.ts` 之前;prettier 產物為準）。禁 glob。

## 硬驗收條件

**紀律**:canary 前先抄目標檔 SHA-256;清除一律精確編輯還原、禁
`git checkout`;還原後比 SHA。

1. **紅簽章（`node scripts/generate-eslint-unbound-manifest.mjs
   --check`,逐字抄錄）**:exit 非 0,恰**十五條 `- ` 條目、順序固定**:missing×13（依上表序,path=
   `src/controller/playerDirectoryController.ts`）→
   `findings expected 222, received 209` →
   `files expected 24, received 23`——無其他條目。
2. **規則有牙三拍**:selector 追加後 `npm run lint` 全綠→暫退十三個
   宣告回 method signature→lint 恰紅 **13 筆**（預測紅點=destructure
   行 `:109-:126` 中的 13 行,以實測行號逐字抄錄）→精確還原 SHA→綠。
3. **逐 stableId 三點對點（取代行數自證）**:每筆①宣告點=對應
   member 精確轉 function property、nested 與非目標逐 token 全等
   ②lint 點=canary 在表列 finding 行命中同一 member③generator 點=
   紅簽章逐列同一 stableId/path 無額外 missing。
4. **erased-token 全等**:HEAD 與修改後該檔以 A–D 口徑 esbuild 逐
   byte 全等。
5. **無新增例外**:不加 `any`／`@ts-ignore`／inline disable／wrapper／
   `.bind()`／新 arrow。

## 解凍清單（Q3 守則:未列即凍結）

- `src/controller/playerDirectoryController.ts`:僅十三個目標成員的
  外層宣告形狀。
- `eslint.config.js`:僅 scoped 區塊 `files` 陣列。

**仍凍結**:其餘 `src/**` 全部（含 `sessionController.ts`）、
`tests/**`、`scripts/**`、baseline／ledger／manifest（交件維持 HEAD
版）、`tsconfig.json`、`package.json`、`package-lock.json`、全域 off
行、databaseTypes override、bundle gate。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

- typecheck／lint／prettier:check／build／check:production-bundle
  （main 與 total gzip 淨 0 B）／test:session-unit（346）／test:mock
  （≥298）／**test:local（動 src,必跑;基準=API 2＋browser 45 passed
  11 skipped;紅時先數 DB 再 guarded reset 三拍分類）**／
  `git diff --check`。
- 紅簽章逐字＋規則三拍＋逐 stableId 對點＋erased-token。
- `git status --porcelain` 全庫:恰為解凍 2 檔＋回報,共 3 條。

## 回報合約

寫
`docs/arch-dispatch-2026-08-28-eslintE7-playerdirectory-port-report-codex.md`
（不 commit、不 push），必含:修改後 `:44-86` 逐字原文（防偽引用）、
紅簽章十五條逐字、lint canary 紅 13 筆逐字（含實際行號）、逐 stableId
十三列對點表（member／宣告改動／canary 命中行三欄）、nested 10 筆＋
非目標 6 成員零 diff 自證、erased-token 對帳、收尾矩陣逐字、Codex 五問
（第 5 問答「chat 11 筆批差異點細化——finding 行=body 解構 72-84
（destructured-function 型,E-5 對立審查已記）,factory 簽名
`createChatController(dependencies: ChatControllerDependencies)`,
interface `:29-59` 含 `openChat:34-45`／`requireMySessionAction:50-53`
兩個多行與 nested `onBlock/onClose/onPost/onReport/onWithdraw:39-43`;
construction `:613` 含 `readCourts: () => read().courts` 非 shorthand;
以及 canary 紅點在 body 解構行的驗證寫法」）、未做／疑義／BLOCKED。

## 驗收方後續動作（記載供對照,非你的工作）

ACCEPTED 時驗收方原子完成:驗收紀錄落盤→ledger 追加十三筆（batch
"E-7"）→重生 manifest（預期 209／23／63）→`--check` 綠→一併 commit
＋進度表回填。
