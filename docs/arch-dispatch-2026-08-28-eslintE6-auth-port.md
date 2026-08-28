# ESLint 恢復 Phase E-6 派工單：auth controller ports 12 筆

- 日期：2026-08-28。模板＝E-5（紅簽章制;
  `docs/arch-reports/eslintE5-discoverymap-port-acceptance-2026-08-28.md`
  E-6 拍板段:auth 是五檔中唯一全單行、全 shorthand、無 data-port `api`
  的檔,模板可原樣沿用）。
- 開工基準：`1cbe80e`（E-5 ACCEPTED）之後包含本派工單的最新 main HEAD。
  開工前 `git status --porcelain` 應為空;有條目即停手回報。
- 流程同紅簽章制：交件時 generator 紅簽章;**不改** ledger、**不重生**
  manifest、**不改** generator。
- 你不 commit、不 push;working tree 交驗收方。

## 目標十二筆（manifest stable ID 凍結;該檔全部、單一 owner;
missing 順序依此表）

| stableId | finding 位置 | expression | 宣告行 |
| --- | --- | --- | --- |
| `e3756c71329c99ecce0faf2cf1fb90f0` | `authController.ts:58:3` | `clearIntent` | `:32` |
| `34da16e02753441592963c60f9c1f92f` | `:67:3` | `reloadParticipation` | `:41` |
| `9cf1a1bf5de918b6f012db21e9448272` | `:68:3` | `replaceMySessions` | `:42` |
| `a04a92d2dbfb309588618abf80bee8a9` | `:69:3` | `resumePendingIntent` | `:43` |
| `5a005b71ad7f5043efe3fdab6f06cdfc` | `:72:3` | `transitionSurfaces` | `:46` |
| `cd3b31d43e48fe667f04b54ff0e6830d` | `:59:3` | `clearPlayerDirectory` | `:33` |
| `52c2ee79658beebfe1218e957221cc7c` | `:60:3` | `clearPlayerLayer` | `:34` |
| `509f4bf0b4e992c0bf2c222d8d37485e` | `:61:3` | `isCurrentAuthSnapshot` | `:35` |
| `862b5090ce883d3a2e69f05b4b9a6e13` | `:62:3` | `notifyMySessions` | `:36` |
| `eb8043a3396ced0e46fca111e5723768` | `:64:3` | `publish` | `:38` |
| `4a2f858cb237f19e8fbc0154c8a09e44` | `:65:3` | `reconcileActiveChatParticipation` | `:39` |
| `5c3954bc5387ad8b7428bd54f70d4abd` | `:66:3` | `reconcileActiveDetailParticipation` | `:40` |

## 修改一：`src/controller/authController.ts`（唯一 src 改動面）

`AuthControllerDependencies`（`:30-47`，未 export）的**恰十二個**單行
method signature 改 function property。**目標行不連續：`:37
onAuthIdentityChange?: AuthIdentityChangeHandler | null;` 夾在 `:36` 與
`:38` 之間、`:44 store`／`:45 surfaceRegistry` 夾在 `:43` 與 `:46`
之間——三行原位一字不動,不可整塊 replace,逐行原位改**：

```ts
// 修改前（:31-46 現行原文,非目標行原樣保留）
  blockedPlayerGate: ControllerRequestGate;
  clearIntent(): boolean;
  clearPlayerDirectory(options?: { closeReason?: string }): void;
  clearPlayerLayer(options?: { closeReason?: string }): void;
  isCurrentAuthSnapshot(snapshot: { epoch: number; identity: string | null }): boolean;
  notifyMySessions(): void;
  onAuthIdentityChange?: AuthIdentityChangeHandler | null;
  publish(): void;
  reconcileActiveChatParticipation(): void;
  reconcileActiveDetailParticipation(): void;
  reloadParticipation(epoch: number, identity: string | null): Promise<boolean>;
  replaceMySessions(sessions: unknown): void;
  resumePendingIntent(): Promise<boolean>;
  store: Store<SessionControllerState, ControllerEventName>;
  surfaceRegistry: SurfaceRegistry;
  transitionSurfaces(name: string, options?: SurfaceCloseOptions): void;
// 修改後（blockedPlayerGate/onAuthIdentityChange/store/surfaceRegistry 四行零 diff）
  blockedPlayerGate: ControllerRequestGate;
  clearIntent: () => boolean;
  clearPlayerDirectory: (options?: { closeReason?: string }) => void;
  clearPlayerLayer: (options?: { closeReason?: string }) => void;
  isCurrentAuthSnapshot: (snapshot: { epoch: number; identity: string | null }) => boolean;
  notifyMySessions: () => void;
  onAuthIdentityChange?: AuthIdentityChangeHandler | null;
  publish: () => void;
  reconcileActiveChatParticipation: () => void;
  reconcileActiveDetailParticipation: () => void;
  reloadParticipation: (epoch: number, identity: string | null) => Promise<boolean>;
  replaceMySessions: (sessions: unknown) => void;
  resumePendingIntent: () => Promise<boolean>;
  store: Store<SessionControllerState, ControllerEventName>;
  surfaceRegistry: SurfaceRegistry;
  transitionSurfaces: (name: string, options?: SurfaceCloseOptions) => void;
```

- construction site 唯一（開單實測）：`sessionController.ts:468-485`,
  **全 shorthand**,零 diff。發現第二個即停手回報。
- **已知傳播面（非 construction site,不觸發停手）**:
  `sessionController.ts:43`（`Parameters<typeof createAuthController>[0]`
  別名定義,推導透明）與 `:124` `onAuthIdentityChange?:
  AuthControllerOptions["onAuthIdentityChange"]`——該成員**本批不動**
  （非 12 筆之一）,零影響;auth 無 data-port `api` 交集。
- **明確凍結的同檔地雷**:`:73-77` `createAuthController` 的 inline
  回傳型別含三個 method signature（`setAuthSession`／`setAuthState`／
  `setProfile`）——其 declaration 對應 **`sessionController.ts:468`
  的三筆 finding（屬 63 筆,本批凍結）**,動它會使 sessionController
  63→60、紅簽章多出 4 條,即越界退件。同檔其他 interface
  （`IdentityDecision` 等）與 `:57/:63/:70/:71` 的 destructure 缺口行
  零 diff。
- **零成本自證**:`git diff --stat src/controller/authController.ts`
  應恰 **12 insertions／12 deletions**（越界 `:74-76` 一改即變 15/15,
  當場攔下）。

## 修改二：`eslint.config.js` scoped files 追加

```js
files: ["src/controller/authController.ts", "src/controller/discoveryMapController.ts", "src/controller/mySessionsController.ts", "src/map.ts"],
```

（精確路徑、字典序 `auth`<`discoveryMap`<`mySessions`;禁 glob。追加
後單行 148 字元 > printWidth 120,prettier 產物已實測為下列多行形式,
直接採用:）

```js
    files: [
      "src/controller/authController.ts",
      "src/controller/discoveryMapController.ts",
      "src/controller/mySessionsController.ts",
      "src/map.ts",
    ],
```

## 硬驗收條件

**紀律**:canary 前先抄目標檔 SHA-256;清除一律精確編輯還原、禁
`git checkout`;還原後比 SHA。

1. **紅簽章（交件狀態,逐字抄錄）**:generator exit 非 0,錯誤**恰為
   十四條 `- ` 條目、順序固定**（標頭與 stack 不計）:missing×12
   （依上表序,path=`src/controller/authController.ts`）→
   `findings expected 234, received 222` →
   `files expected 25, received 24`——無其他條目。
2. **規則有牙三拍**:selector 追加後 `npm run lint` 全綠→暫退十二行回
   method signature→lint 恰紅 **12 筆**（預測紅點=destructure 行
   `:58/:59/:60/:61/:62/:64/:65/:66/:67/:68/:69/:72`,以 canary 實測
   行號逐字抄錄驗證）→精確還原 SHA→綠。
3. **erased-token 全等**:HEAD 與修改後的 `authController.ts` 以 A–D
   口徑 esbuild 逐 byte 全等。
4. **無新增例外**:不加 `any`／`@ts-ignore`／inline disable／wrapper／
   `.bind()`／新 arrow。
5. **常設判準三證**:①lint canary 恰紅 12 筆逐字②`eslint.config.js`
   diff 恰一處＋generator／`SCAN_GLOBS`／baseline／ledger／manifest
   零 diff 自證③erased-token 全等。

## 解凍清單（Q3 守則：未列即凍結）

- `src/controller/authController.ts`:僅上表十二個成員宣告形狀（以
  名稱為準）。
- `eslint.config.js`:僅 scoped 區塊 `files` 陣列（含 prettier 對該行
  的自動換行）。

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
- 紅簽章逐字＋規則三拍＋erased-token。
- `git status --porcelain` 全庫:恰為解凍 2 檔＋回報,共 3 條。

## 回報合約

寫 `docs/arch-dispatch-2026-08-28-eslintE6-auth-port-report-codex.md`
（不 commit、不 push），必含:修改後 `:30-47` 逐字原文（防偽引用）、
紅簽章十四條逐字、lint canary 紅 12 筆逐字（含實際行號）、
erased-token 對帳、收尾矩陣逐字、Codex 五問（第 5 問答「playerDirectory
13 筆批的差異點細化——該檔多行 method signature 的行區間
（`openCourtDrawer:48-52`／`openCourtPlayersDrawer:53-57`／
`openPlayerCard:59-69`／`openPlayerDirectoryList:70-74`,E-5 對立審查
盤點）、nested handler method signature 的明確凍結清單（非 manifest
findings 不得順手改）、四個 forwarding arrow construction 傳入的原文
保留（含 `requireSessionAction` 的 `as Promise<boolean> | void`
cast）,以及該批驗收條件按 E-5 驗收紀錄拍板改寫為逐 stableId 對點
三條的具體寫法」）、未做／疑義／BLOCKED。

## 勘誤備註

E-5 驗收紀錄 `:51` 的「auth −12→228/25」為筆誤,本單以實算
**222/24** 為準（234−12=222、25−1=24;read-back 獨立複算確認）。

## 驗收方後續動作（記載供對照,非你的工作）

ACCEPTED 時驗收方原子完成:驗收紀錄落盤→ledger 追加十二筆（batch
"E-6"）→重生 manifest（預期 222／24／63）→`--check` 綠→一併 commit。
