# ESLint 恢復 Phase E-8 派工單：chat controller ports 11 筆（首個 body-destructure 批）

- 日期：2026-08-28。模板＝E-7 紅簽章制;要件源自 E-7 驗收紀錄
  （`docs/arch-reports/eslintE7-playerdirectory-port-acceptance-2026-08-28.md`
  「E-8 派工輸入」七條,經對立審查逐筆複算）。
- 開工基準：`a795d10`（E-7 ACCEPTED）之後包含本派工單的最新 main HEAD。
  開工前 `git status --porcelain` 應為空;有條目即停手回報。
- 流程同紅簽章制：交件時 generator 紅簽章;不改 ledger／不重生
  manifest／不改 generator。
- **本批差異**:chat 的 factory 收整顆 `dependencies` 後在 body 解構
  （`invocationStyle=destructured-function`）——**finding／canary 紅點
  在 body 解構行 `:72-84`,不在宣告行**。
- 你不 commit、不 push;working tree 交驗收方。

## 目標十一筆（manifest stable ID 凍結;表序=manifest 陣列序=紅簽章
missing 序,toast 開頭）

| stableId | member | finding 行（body 解構） | 宣告行區間 |
| --- | --- | --- | --- |
| `e700dadac9062df874386df1a1eb2bc7` | `toast` | `81:5` | `:55` |
| `d79fd5ad5211ca65be7b00a4daf62f24` | `transitionSurfaces` | `82:5` | `:56` |
| `0bb560eeae89cf52c331fd23d606f51e` | `withdrawMySession` | `84:5` | `:58` |
| `700002637db483e5d5cab91d567aca64` | `isCurrentAuthSnapshot` | `72:5` | `:32` |
| `63a82b1a032be827ea0f3f1083178ddf` | `notifyMySessions` | `73:5` | `:33` |
| `7e9f1007fe33058f35738036d82c1ab1` | `openChat` | `74:5` | `:34-45`（多行） |
| `da1560bb7600a9b8512921a4b4bdf283` | `openReportForTarget` | `75:5` | `:46` |
| `abb1fa02f2d369e6837b907aa1c225ba` | `readCourts` | `76:5` | `:47` |
| `c4c01719deed2482bbcb76288ff49073` | `refreshMyPlayerBlocks` | `77:5` | `:48` |
| `ee4c9bb35d8cfedb6ae4805024af2323` | `refreshMySessions` | `78:5` | `:49` |
| `99a96b72c6cd05925bb962d0e5599f74` | `requireMySessionAction` | `79:5` | `:50-53`（多行） |

## 修改一：`src/controller/chatController.ts`（唯一 src 改動面）

`ChatControllerDependencies`（`:29-59`，未 export，15 成員=11 目標＋
4 凍結）的十一個 method signature 改 function property。九個單行同前批
模式;兩個多行只改外層：

```ts
// openChat 修改後（:34-45;handlers 物件 :36-44 原樣含 canWithdraw/courts/五個 nested）
  openChat: (
    session: MySessionSummary,
    handlers: {
      canWithdraw: boolean;
      courts: unknown[];
      onBlock(profileId: ControllerIdentifier): Promise<true>;
      onClose(): void;
      onPost(body: unknown): Promise<unknown>;
      onReport(messageId: ControllerIdentifier): unknown;
      onWithdraw(): unknown;
    }
  ) => ControllerSurfaceHandle | null | undefined;
// requireMySessionAction 修改後（:50-53;參數行原樣）
  requireMySessionAction: (
    sessionId: ControllerIdentifier,
    predicate: (session: MySessionSummary | null | undefined) => boolean
  ) => { authSnapshot: ControllerAuthSnapshot; session: MySessionSummary };
```

兩段 snippet 已經 read-back 以 prettier stdin 實測=產物本身,可直接
照抄;改後 `:29-59` 仍為 31 行（實測穩定）,與硬驗收 4 的切除區間
一致。nested token 序列不變是硬條件。

### 凍結清單（逐 token 零 diff,「順手一致化」即退件）

- **nested handler method signature 5 筆**:`onBlock:39`／`onClose:40`
  ／`onPost:41`／`onReport:42`／`onWithdraw:43`;handler 內非 method
  property:`canWithdraw:37`／`courts:38`。
- 非目標成員 4:`api:30`／`chatPollIntervalMs:31`／`surfaceRegistry:54`
  ／`visibilityTarget:57`（11＋4＝15＝全成員）。
- **明確凍結的同檔地雷**:`:66-68` factory inline return type 的
  `openSessionChat`（`:67`）——其 finding 是
  `sessionController.ts:613:11`（stableId `b5443c26d5d8f44f05321a8a506272f8`,
  屬 63 筆）,誤改會使 sessionController 63→62、紅簽章多出條目,即
  越界退件。`ChatDataApi` 等同檔其他 interface 同凍結。
- body 解構 `:69-85` 與全部實作零 diff。

### construction 與傳播面

- construction site 唯一（開單實測）:`sessionController.ts:613`
  （`const { openSessionChat } = createChatController({`）;目標中唯一
  非 shorthand 傳入 **`:620` `readCourts: () => read().courts,` 原文
  保留**,其餘含 `api: api!` 全段零 diff。發現第二個即停手回報。
- **傳播面（零 diff＋typecheck 綠對點）**:`sessionController.ts:44`
  （`Parameters` 別名）／`:51`（`ChatControllerOptions["api"]` data
  port 交集）／`:117`（`openChat?: ChatControllerOptions["openChat"]`
  ——strict 下參數雙變轉逆變;現存 consumer=`:159` 零參數預設值與
  `.js` caller,風險低但以 `npm run typecheck` 全綠實證）。
  `sessionController.ts:266` 的 `openChat: [` 是 surface 字串鍵表,
  無關型別。

## 修改二：`eslint.config.js` scoped files 追加

在現有多行陣列依字典序插入
`"src/controller/chatController.ts"`（`authController` 之後、
`discoveryMapController` 之前;prettier 產物為準）。禁 glob。

## 硬驗收條件

**紀律**:canary 前先抄目標檔 SHA-256;清除一律精確編輯還原、禁
`git checkout`;還原後比 SHA。

1. **紅簽章（`node scripts/generate-eslint-unbound-manifest.mjs
   --check`,逐字抄錄）**:exit 非 0,恰**十三條 `- ` 條目、順序固定**:
   missing×11（依上表序,path=`src/controller/chatController.ts`）→
   `findings expected 209, received 198` →
   `files expected 23, received 22`——無其他條目（不得有
   sessionController／unexpected／scope-gate 錯誤）。
2. **規則有牙三拍（canary 序列明寫）**:先完成 port 11 筆修復→加
   精確 selector→`npm run lint` 綠→保持 selector,暫退 11 筆宣告回
   method signature→lint 恰紅 **11 筆且行號固定在 body 解構
   `72/73/74/75/76/77/78/79/81/82/84`（非宣告行,逐字抄錄實測行號）**
   →精確還原候選 SHA→綠。
3. **逐 stableId 三點對點**:三欄語意本批與 E-7 不同——宣告點=
   `:32-:58` 的宣告行、lint 點=body 解構 `:72-84` 的 canary 紅點行
   （**宣告點≠lint 點是本批關鍵差異**）、generator 點=紅簽章同
   stableId/path。十一列逐筆三欄全中。
3b. **selector 精確度**（紅簽章態下 scope gate 不執行,需獨立自證）:
   `npx eslint --print-config` 證 `chatController.ts`=error、未清檔
   （如 `lifecycleActionsController.ts`）仍 off。
4. **餘檔 byteEqual 反證（E-7 最強反證,必交付）**:切掉
   `ChatControllerDependencies` 整段（`:29-59`）後,檔案其餘部分
   HEAD vs working **byteEqual=true**——一條涵蓋 nested／非目標／
   factory／實作全體。
5. **erased-token 全等**:A–D 口徑 esbuild 逐 byte 全等。
6. **無新增例外**:不加 `any`／`@ts-ignore`／inline disable／wrapper／
   `.bind()`／新 arrow。

## 解凍清單（Q3 守則:未列即凍結）

- `src/controller/chatController.ts`:僅上表十一個目標成員的外層宣告
  形狀。
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
- 紅簽章＋三拍＋逐 stableId 對點＋餘檔 byteEqual＋erased-token。
- `git status --porcelain` 全庫:恰為解凍 2 檔＋回報,共 3 條。

## 回報合約

寫 `docs/arch-dispatch-2026-08-28-eslintE8-chat-port-report-codex.md`
（不 commit、不 push），必含:修改後 `:29-59` 逐字原文（防偽引用）、
紅簽章十三條逐字、lint canary 紅 11 筆逐字（實測行號）、逐 stableId
十一列對點表、餘檔 byteEqual 自證、erased-token 對帳、收尾矩陣逐字、
Codex 五問（第 5 問答「lifecycle ports 11 批差異點細化——該檔 13 筆
=ports 11＋extraction 2（`:230:49`／`:230:80`,同一行,不屬本批）;
**ports 11 批不加 selector**（檔案未全清,generator 反向 assert 會擋
提前上線）——紅簽章與驗收條件在『無 selector 上線』下如何改寫:
`npm run lint` 的 canary 無法用（committed config 對該檔仍 off 且本批
不加 selector）,但 ad-hoc override canary 可用（read-back 已實測
`npx eslint --rule '{"@typescript-eslint/unbound-method":"error"}'
src/controller/lifecycleActionsController.ts` 現況恰紅 13——請以此
為基礎設計 canary 與交件證據;多行簽名行區間
（`beginLifecycleAction:58-62`／`openDecideSession:66-69`,E-5 對立
審查盤點）與 nested 凍結;construction `:438` 與 `api: api!`」）、
未做／疑義／BLOCKED。

## 驗收方後續動作（記載供對照,非你的工作）

ACCEPTED 時驗收方原子完成:驗收紀錄落盤→ledger 追加十一筆（batch
"E-8"）→重生 manifest（預期 198／22／63）→`--check` 綠→一併 commit
＋進度表回填。
