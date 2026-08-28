# ESLint 恢復 Phase R1-A/B React app＋pages 聯合回報（Codex）

- 日期：2026-08-28
- 開工 HEAD：`62ca002`；FR ACCEPTED 基準：`02ec1d8`
- 結論：R1-A 22＋R1-B 15，共 37 個 findings 已清零；五個 finding files 的精確 selector 已上線。
- 交件狀態：generator 依合約維持紅；baseline／ledger／manifest／generator 均未修改；未 commit、未 push。
- Variance 偏差清單：**零偏差**。`typecheckControllerApi` 橋及所有 consumer 均直接通過，未動用 annotation 預授權。

## 1. 三宣告檔修改後防偽原文

### `src/controllerContracts.ts:274-328`

完整保留非列名凍結 methods，以防止「整個 interface 順手轉換」：

```ts
export interface ControllerApi {
  attachMap(map: unknown): void;
  cancelMySession: (sessionId: ControllerIdentifier) => Promise<unknown>;
  capturePendingIntentVersion(): number;
  clearPendingIntent(): boolean;
  clearPendingIntentIfUnchanged(version: number): boolean;
  confirmMySessionAttendance: (sessionId: ControllerIdentifier) => Promise<unknown>;
  expandBounds: () => ControllerDiscoveryResult | void;
  getAppState(): ControllerAppState;
  getMySessionGroups(): ControllerMySessionGroups;
  getMySessions(): MySessionSummary[];
  getMySessionState(): ControllerMySessionsViewState;
  getPlayerLayerState(): ControllerPlayerLayerViewState;
  getVisibleSessions(): SessionSummary[];
  loadDiscovery(bounds?: MapBounds | null): ControllerDiscoveryResult;
  markMySessionPlayed: (sessionId: ControllerIdentifier) => Promise<unknown>;
  openCourt(court: DataCourt, onlySessions?: SessionSummary[] | null): void;
  openCreateIntent: () => void;
  openPlayerCourt(court: DataCourt, onlyPlayers?: ControllerPlayer[] | null): ControllerSurfaceResult;
  openPlayerDirectory(): Promise<boolean> | void;
  openRosterParticipantReport: (
    sessionId: ControllerIdentifier,
    profileId: ControllerIdentifier
  ) => ControllerSurfaceResult;
  openSession: (sessionId: ControllerIdentifier) => ControllerSurfaceResult;
  openSessionChat: (sessionId: ControllerIdentifier) => ControllerSurfaceResult;
  openSessionDecision: (sessionId: ControllerIdentifier) => Promise<ControllerSurfaceResult>;
  openSessionEdit: (sessionId: ControllerIdentifier) => ControllerSurfaceResult;
  openSessionFromLink(sessionId: ControllerIdentifier): Promise<ControllerOpenSessionResult>;
  openSessionReport: (sessionId: ControllerIdentifier) => ControllerSurfaceResult;
  refreshMyPlayerBlocks(): Promise<boolean>;
  refreshMySessions(): Promise<boolean>;
  requestCurrentLocation(): void;
  resetFilters: () => void;
  respondInvite(sessionId: ControllerIdentifier, decision: "accepted" | "declined"): Promise<unknown>;
  resumePendingIntent(): Promise<boolean>;
  retryDiscovery: () => ControllerDiscoveryResult;
  reviewMySessionParticipant(
    sessionId: ControllerIdentifier,
    participantId: ControllerIdentifier,
    decision: "accepted" | "declined"
  ): Promise<unknown>;
  setAuthState(session: ControllerAuthSession | null, profile?: ControllerProfileEligibility | null): Promise<void>;
  setAuthSession(session: ControllerAuthSession | null): void;
  setCourts(courts: DataCourt[], options?: { ready?: boolean }): void;
  setDrawerState: (value: ControllerDrawerState) => void;
  setFilter<Key extends keyof ControllerFilters>(key: Key, value: ControllerFilters[Key]): void;
  setMapUnavailable(): void;
  setProfile(profile: Partial<Profile> | null): void;
  sessionStore: Store<SessionControllerState, ControllerEventName>;
  togglePlayerLayer(): Promise<boolean> | void;
  togglePlayerVisibility: () => Promise<void> | void;
  unblockPlayer: (profileId: ControllerIdentifier) => Promise<true>;
  withdrawMySession: (sessionId: ControllerIdentifier) => ControllerSurfaceResult;
}
```

`refreshMySessions`、`reviewMySessionParticipant`、`respondInvite`、`onAccept` 對應的 indexed-access 來源及其他非 findings method signatures 均原樣保留。

### `src/app/AppServicesProvider.tsx`

`:18-41`：

```ts
export interface MySessionsAppActions {
  onBack: () => unknown;
  onCreatedSessionFocus: (sessionId?: ControllerIdentifier) => boolean;
  onEnablePush: () => unknown;
  onSignIn: () => unknown;
}

export interface NearbyDrawerAppActions {
  onSubscribe: () => unknown;
}

export interface MeAppActions {
  lineProviderId: string;
  onEditProfile: () => unknown;
  onEnablePush: () => unknown;
  onLinkProvider: (provider: string) => unknown;
  onSaveCourtSubscriptions: (courtIds: number[]) => unknown;
  onSaveNotificationPreferences: (preferences: import("../domainTypes.ts").NotificationPreferences) => unknown;
  onSetOpenToGreeting: (enabled: boolean) => unknown;
  onSetPresenceSharing: (enabled: boolean) => unknown;
  onSignIn: () => unknown;
  onSignOut: () => unknown;
  supportHref: string;
}
```

`:115-138`（凍結陷阱一併逐字列出）：

```ts
export interface MySessionsActions {
  onAccept(
    sessionId?: ControllerIdentifier,
    participantId?: ControllerIdentifier
  ): ReturnType<ControllerApi["reviewMySessionParticipant"]>;
  onAcceptInvite(sessionId?: ControllerIdentifier): ReturnType<ControllerApi["respondInvite"]>;
  onCancel: MySessionsServices["cancelMySession"];
  onConfirmAttendance: MySessionsServices["confirmMySessionAttendance"];
  onCreateSession(): ReturnType<ControllerApi["openCreateIntent"]>;
  onDecline(
    sessionId?: ControllerIdentifier,
    participantId?: ControllerIdentifier
  ): ReturnType<ControllerApi["reviewMySessionParticipant"]>;
  onDeclineInvite(sessionId?: ControllerIdentifier): ReturnType<ControllerApi["respondInvite"]>;
  onDecide: MySessionsServices["openSessionDecision"];
  onEdit: MySessionsServices["openSessionEdit"];
  onMarkPlayed: MySessionsServices["markMySessionPlayed"];
  onOpenChat: MySessionsServices["openSessionChat"];
  onOpenSession: MySessionsServices["openSession"];
  onRefresh: () => ReturnType<ControllerApi["refreshMySessions"]>;
  onReportParticipant: MySessionsServices["openRosterParticipantReport"];
  onReportSession: MySessionsServices["openSessionReport"];
  onWithdraw: MySessionsServices["withdrawMySession"];
}
```

### `src/app/App.tsx:39-49`

```ts
interface FilterToolbarHandlers {
  onOpenFilter: () => void;
  onSetFilter(field: "band" | "dateKey" | "instantOnly", value: boolean | string | null): void;
}

interface LoginModalOptions {
  action?: string;
  lineProviderId?: string;
  onClose: () => void;
  onProvider?: (provider: string) => unknown;
}
```

`onSetFilter` method signature 與兩個 data properties 保持凍結原文。

## 2. R1-A canary 與 generator 快照

開工逐檔 ad-hoc canary：

```text
App.tsx: 370:22 612:64 612:73                                  (3)
AppServicesProvider.tsx: 235:33 236:24 272:44 292:23 293:21
294:22 295:16 296:16 297:17 324:17 325:28 330:17 331:15 332:21
333:19 334:22 336:28 337:24 338:19                            (19)
MePage.tsx: 646:5 647:5 648:5 649:5 650:5 651:5 652:5 653:5 654:5 (9)
MySessionsPage.tsx: 631:30 654:13 655:19 656:15 674:79          (5)
NearbySessionsDrawer.tsx: 187:11                                (1)
```

R1-A 後：App `3→0`、Provider `19→0`；pages 精確保留 `9/5/1`，其 line:col 與上列相同。`npm run typecheck`、lint、Prettier 均綠。

R1-A generator 恰 24 條，逐字：

```text
- expected finding missing from current scan: 381f65d1a81d4b4845ae3233b47dcfe5 (src/app/App.tsx)
- expected finding missing from current scan: 5349689dfd59d35a8aad0a6430dde021 (src/app/App.tsx)
- expected finding missing from current scan: fd8f82b6b84462b5f7b3c3d61963ba02 (src/app/App.tsx)
- expected finding missing from current scan: 33ef24902650ba00096e4bc80c7adf9c (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: c2a1c8893f98ecb729ad380754173b1a (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: d90e683950bc91f4cb4cb3e0033403a4 (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: d380ccf9e34a183fcc4d6f4bd6cfa5d9 (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: c35222a2d4b304e04e5b99e773d090c6 (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: d205af51a91bb396f587d3b89139ecdb (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: 9299c6dfd40087ebcf7acff6301402d8 (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: e83a7e5701a9ae775a524a8e59e687bd (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: e73025caac78b52d815eef7ec90a8b64 (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: f08f2b22f9283a98c90d6f95f2d112e4 (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: 5071641263a1039db509c67d40397c36 (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: 5d06050134b6106d437ee9c3eeb754fb (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: f22a24baa82d6f2e15fef8a69bacbd3f (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: 8a996bd02857404c5093d2c71985145c (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: d64359cb4a452bfbfd7500da9b701f5f (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: 205afa7fae0dbc120e781005bca6d5c9 (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: 828bd2a3516c07d4424506f14bc7fbee (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: 61b34b0f50b069a6a772da178f476b8a (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: 5ace336c098cb1ff87c845b48995a3da (src/app/AppServicesProvider.tsx)
- findings expected 100, received 78
- files expected 19, received 17
```

## 3. R1-B、selector 與暫退 canary

R1-B 後五檔 ad-hoc canary 全部 exit 0：App `0`、Provider `0`、Me `9→0`、MySessions `5→0`、Nearby `1→0`。

Selector 依字典序加入五個精確 path。真實 `--print-config`：

```text
src/app/App.tsx [2]
src/app/AppServicesProvider.tsx [2]
src/pages/MePage.tsx [2]
src/pages/MySessionsPage.tsx [2]
src/pages/NearbySessionsDrawer.tsx [2]
src/sheets/FilterSheet.tsx [0]
src/sheets/CreateSessionSheet.tsx [0]
```

暫退前 SHA：

```text
953c86d29ff59ac24ecb5192e6161ce13b01996a15d36f9c200d9ac6cb3b55fe  src/controllerContracts.ts
4327db8a348ccd9957462549a9d43c47dfe1af3dad28a9a63498845fb525b541  src/app/AppServicesProvider.tsx
```

精確暫退 `cancelMySession` 與 `onEditProfile` 後，committed lint 只紅：

```text
src/app/AppServicesProvider.tsx:324:17
src/pages/MePage.tsx:646:5
✖ 2 problems (2 errors, 0 warnings)
```

以 `apply_patch` 精確還原後兩個 SHA 與上列完全相同，lint 再綠；未使用 checkout。

## 4. 最終 generator 紅簽章（恰 39 條）

```text
- expected finding missing from current scan: 381f65d1a81d4b4845ae3233b47dcfe5 (src/app/App.tsx)
- expected finding missing from current scan: 5349689dfd59d35a8aad0a6430dde021 (src/app/App.tsx)
- expected finding missing from current scan: fd8f82b6b84462b5f7b3c3d61963ba02 (src/app/App.tsx)
- expected finding missing from current scan: 33ef24902650ba00096e4bc80c7adf9c (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: c2a1c8893f98ecb729ad380754173b1a (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: d90e683950bc91f4cb4cb3e0033403a4 (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: d380ccf9e34a183fcc4d6f4bd6cfa5d9 (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: c35222a2d4b304e04e5b99e773d090c6 (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: d205af51a91bb396f587d3b89139ecdb (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: 9299c6dfd40087ebcf7acff6301402d8 (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: e83a7e5701a9ae775a524a8e59e687bd (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: e73025caac78b52d815eef7ec90a8b64 (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: f08f2b22f9283a98c90d6f95f2d112e4 (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: 5071641263a1039db509c67d40397c36 (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: 5d06050134b6106d437ee9c3eeb754fb (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: f22a24baa82d6f2e15fef8a69bacbd3f (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: 8a996bd02857404c5093d2c71985145c (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: d64359cb4a452bfbfd7500da9b701f5f (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: 205afa7fae0dbc120e781005bca6d5c9 (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: 828bd2a3516c07d4424506f14bc7fbee (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: 61b34b0f50b069a6a772da178f476b8a (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: 5ace336c098cb1ff87c845b48995a3da (src/app/AppServicesProvider.tsx)
- expected finding missing from current scan: 286c77305dc747dccbb3e3e1a714b343 (src/pages/MePage.tsx)
- expected finding missing from current scan: 4e722df82116ae3c5ab35fc0a249d965 (src/pages/MePage.tsx)
- expected finding missing from current scan: d3b6de3899597abd8a0152d6c7f5f061 (src/pages/MePage.tsx)
- expected finding missing from current scan: c47ad97e43f155115bcb52d2d57eb771 (src/pages/MePage.tsx)
- expected finding missing from current scan: 2d74f742ee21e82dfadf1b695f2d7bd2 (src/pages/MePage.tsx)
- expected finding missing from current scan: e31fe2120b5ab5ba2dcdd1d69949d13e (src/pages/MePage.tsx)
- expected finding missing from current scan: ae16a9db4e90135d18277ebe6dee836d (src/pages/MePage.tsx)
- expected finding missing from current scan: 6b4d7581c25b390b45df4b82b9a895d3 (src/pages/MePage.tsx)
- expected finding missing from current scan: 77a33127a2cbb48d538827ec73f92bac (src/pages/MePage.tsx)
- expected finding missing from current scan: 2f4826ee1fba4f3a48a79aa1d2107b83 (src/pages/MySessionsPage.tsx)
- expected finding missing from current scan: e8f980d7fafd716418e9aec84324f9b6 (src/pages/MySessionsPage.tsx)
- expected finding missing from current scan: 6b71d4e31795c288d35d9b3a289665f7 (src/pages/MySessionsPage.tsx)
- expected finding missing from current scan: eb98876aa2376e3467a58b7332cf0d43 (src/pages/MySessionsPage.tsx)
- expected finding missing from current scan: eb2e4b44c6f5449994b952aba9ab22d6 (src/pages/MySessionsPage.tsx)
- expected finding missing from current scan: f34f540fee5d3b59a5cfcf6c88aee8c1 (src/pages/NearbySessionsDrawer.tsx)
- findings expected 100, received 63
- files expected 19, received 14
```

命令 exit 1、`^- ` 計數 39；expected sessionController 0 與 received 0 相等，因此沒有衍生條目。

## 5. stableId 三點對點（37）

格式：`stableId | declaration path:line member | finding path:line:column`。

```text
381f65d1a81d4b4845ae3233b47dcfe5 | App.tsx:47 onClose | App.tsx:612:64
5349689dfd59d35a8aad0a6430dde021 | App.tsx:48 onProvider | App.tsx:612:73
fd8f82b6b84462b5f7b3c3d61963ba02 | App.tsx:40 onOpenFilter | App.tsx:370:22
33ef24902650ba00096e4bc80c7adf9c | controllerContracts.ts:325 togglePlayerVisibility | AppServicesProvider.tsx:235:33
c2a1c8893f98ecb729ad380754173b1a | controllerContracts.ts:326 unblockPlayer | AppServicesProvider.tsx:236:24
d90e683950bc91f4cb4cb3e0033403a4 | controllerContracts.ts:299 openSessionChat | AppServicesProvider.tsx:272:44
d380ccf9e34a183fcc4d6f4bd6cfa5d9 | controllerContracts.ts:281 expandBounds | AppServicesProvider.tsx:292:23
c35222a2d4b304e04e5b99e773d090c6 | controllerContracts.ts:291 openCreateIntent | AppServicesProvider.tsx:293:21
d205af51a91bb396f587d3b89139ecdb | controllerContracts.ts:298 openSession | AppServicesProvider.tsx:294:22
9299c6dfd40087ebcf7acff6301402d8 | controllerContracts.ts:307 resetFilters | AppServicesProvider.tsx:295:16
e83a7e5701a9ae775a524a8e59e687bd | controllerContracts.ts:310 retryDiscovery | AppServicesProvider.tsx:296:16
e73025caac78b52d815eef7ec90a8b64 | controllerContracts.ts:319 setDrawerState | AppServicesProvider.tsx:297:17
f08f2b22f9283a98c90d6f95f2d112e4 | controllerContracts.ts:299 openSessionChat | AppServicesProvider.tsx:333:19
5071641263a1039db509c67d40397c36 | controllerContracts.ts:298 openSession | AppServicesProvider.tsx:334:22
5d06050134b6106d437ee9c3eeb754fb | controllerContracts.ts:294 openRosterParticipantReport | AppServicesProvider.tsx:336:28
f22a24baa82d6f2e15fef8a69bacbd3f | controllerContracts.ts:303 openSessionReport | AppServicesProvider.tsx:337:24
8a996bd02857404c5093d2c71985145c | controllerContracts.ts:327 withdrawMySession | AppServicesProvider.tsx:338:19
d64359cb4a452bfbfd7500da9b701f5f | controllerContracts.ts:276 cancelMySession | AppServicesProvider.tsx:324:17
205afa7fae0dbc120e781005bca6d5c9 | controllerContracts.ts:280 confirmMySessionAttendance | AppServicesProvider.tsx:325:28
828bd2a3516c07d4424506f14bc7fbee | controllerContracts.ts:300 openSessionDecision | AppServicesProvider.tsx:330:17
61b34b0f50b069a6a772da178f476b8a | controllerContracts.ts:301 openSessionEdit | AppServicesProvider.tsx:331:15
5ace336c098cb1ff87c845b48995a3da | controllerContracts.ts:289 markMySessionPlayed | AppServicesProvider.tsx:332:21
286c77305dc747dccbb3e3e1a714b343 | AppServicesProvider.tsx:31 onEditProfile | MePage.tsx:646:5
4e722df82116ae3c5ab35fc0a249d965 | AppServicesProvider.tsx:32 onEnablePush | MePage.tsx:647:5
d3b6de3899597abd8a0152d6c7f5f061 | AppServicesProvider.tsx:33 onLinkProvider | MePage.tsx:648:5
c47ad97e43f155115bcb52d2d57eb771 | AppServicesProvider.tsx:34 onSaveCourtSubscriptions | MePage.tsx:649:5
2d74f742ee21e82dfadf1b695f2d7bd2 | AppServicesProvider.tsx:35 onSaveNotificationPreferences | MePage.tsx:650:5
e31fe2120b5ab5ba2dcdd1d69949d13e | AppServicesProvider.tsx:36 onSetOpenToGreeting | MePage.tsx:651:5
ae16a9db4e90135d18277ebe6dee836d | AppServicesProvider.tsx:37 onSetPresenceSharing | MePage.tsx:652:5
6b4d7581c25b390b45df4b82b9a895d3 | AppServicesProvider.tsx:38 onSignIn | MePage.tsx:653:5
77a33127a2cbb48d538827ec73f92bac | AppServicesProvider.tsx:39 onSignOut | MePage.tsx:654:5
2f4826ee1fba4f3a48a79aa1d2107b83 | AppServicesProvider.tsx:20 onCreatedSessionFocus | MySessionsPage.tsx:631:30
e8f980d7fafd716418e9aec84324f9b6 | AppServicesProvider.tsx:19 onBack | MySessionsPage.tsx:654:13
6b71d4e31795c288d35d9b3a289665f7 | AppServicesProvider.tsx:21 onEnablePush | MySessionsPage.tsx:655:19
eb98876aa2376e3467a58b7332cf0d43 | AppServicesProvider.tsx:22 onSignIn | MySessionsPage.tsx:656:15
eb2e4b44c6f5449994b952aba9ab22d6 | AppServicesProvider.tsx:134 onRefresh | MySessionsPage.tsx:674:79
f34f540fee5d3b59a5cfcf6c88aee8c1 | AppServicesProvider.tsx:26 onSubscribe | NearbySessionsDrawer.tsx:187:11
```

`openSession`／`openSessionChat` 各自一個 declaration 對兩個 stableIds，已分列。

## 6. pages 零 diff、餘檔與 erased-token 證明

`git diff --stat -- src/pages/` 無輸出；三個 page SHA 仍為開工值：

```text
2e369a9595334b445bb3ae224830923b94b4a8ac064e9b384895490b812b54eb  src/pages/MePage.tsx
e200224ea8ad1f735cb77d36604af8ffbda01e641f71248a649ab300360cb342  src/pages/MySessionsPage.tsx
cda2070b1197e24feeba3a91edc0d89ed80a86ae19b764ed92535ef83a09e122  src/pages/NearbySessionsDrawer.tsx
```

切除指定外層宣告行後，三宣告檔 HEAD/current REST 逐 byte 全等：

| 檔案 | REST bytes | REST SHA-256（兩側相同） | byteEqual |
| --- | ---: | --- | --- |
| controllerContracts.ts | 10,620 | `d4b78b9c4c6582fe9ae3e33cc30b8152e602a3c7c1579ef4b1daadb5e2e1e81f` | true |
| AppServicesProvider.tsx | 11,991 | `3401b9ee44a8a29a563865afc53b4df37d1f859db3484f9e4099944503fa1699` | true |
| App.tsx | 25,517 | `311706253ca82c65da5c9720cc5c200d1cfe2acf3adc9f6694dcc1e06a201353` | true |

`git diff -U0` hunks 僅在 ControllerApi 指定行、Provider `19-22/26/31-39/134`、App `40/47-48`；不含 `onSetFilter:41`、Provider `onAccept:116-119`／`onDecline:124-127` 或其他凍結成員。

兩側均以 stdin 餵 esbuild（`.ts` 用 loader `ts`，含 JSX 的 `.tsx` 對稱使用 loader `tsx`）後：

| 檔案 | erased bytes | erased SHA-256（兩側相同） | byteEqual |
| --- | ---: | --- | --- |
| controllerContracts.ts | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | true |
| AppServicesProvider.tsx | 7,145 | `369f7112849302c7f22e09a1ef602db9689f6412b24abc45ee85160b7fbfc43b` | true |
| App.tsx | 26,689 | `4366feb8c314b76a3ea46a19837029a40bc2cfe89d90f28b632f34642041f189` | true |

`controllerContracts.ts` 是純型別檔，故對稱擦除為空輸出；三檔均證明 runtime token 零變。

## 7. Typecheck 載重與收尾矩陣

`src/controller/controllerApiContract.ts:13-18` 的 `typecheckControllerApi(controller: FactoryResult): ControllerApi` 回傳橋維持原文，typecheck 綠證明 FactoryResult→ControllerApi 17 個 function properties 逆變相容。`AppServicesProvider.tsx:16` 的 `Pick<ControllerApi, "openSessionChat" | "sessionStore">` 與 `:121-137` 的十個相異 `MySessionsServices["…"]` indexed accesses 亦通過。

| 驗證 | 實際結果 |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run prettier:check` | PASS；All matched files use Prettier code style |
| `npm run build` | PASS；508 modules transformed |
| `npm run check:production-bundle` | PASS；32 files；main `638937/187466`、total JS `841561/257627`，相對基準淨 `0 B` |
| `npm run test:session-unit` | PASS；346 passed、0 failed |
| `npm run test:mock` | PASS；298 passed、4 skipped；一次即綠，未重現 FilterSheet flake |
| `npm run test:local` | PASS；API 2 passed；browser 45 passed、11 skipped；未 reset |
| `git diff --check` | PASS |
| generator `--check` | 預期 exit 1；39 bullets，逐字見第 4 節 |

Production bundle gate 逐字摘要：

```text
production bundle check passed: development E2E hook present, production E2E hook absent; 32 files, 12 demo identifiers absent; main 638937/187466 within 658867/192420; largest app lazy MySessionsPage-Byp_C9FO.js 16476/4828 within 18000/5500; total JS 841561/257627 within 849961/259062; private repository: privateDataRepository-CfJqlfj0.js; Sentry: sentryBrowserSdk-Czz5dmkg.js
```

## 8. Codex 五問

### 1. 如何證明只改 35 個列名 declarations？

三檔 `git diff -U0` 只落在指定行，完整防偽原文同時展示了凍結 methods；切除變更行後三檔 REST byteEqual。35 個 declaration members 對 37 筆 findings，是因 `openSession` 與 `openSessionChat` 各有兩個使用點。

### 2. 如何證明 pages 與 runtime 均未被改動？

`git diff --stat -- src/pages/` 空且三頁 SHA 等於開工值。三宣告檔的 esbuild output 逐 byte 全等，ControllerApi／props 變更全部是可擦除型別 token。

### 3. 如何證明 selector 上線精確且有牙？

只加入五個完整 path；五個目標 `--print-config` 均 `[2]`，仍有 findings 的 Filter/Create sheets 均 `[0]`。暫退跨 stage 各一筆後 committed lint 只在預定 Provider/Page consumer 各紅一筆，還原 SHA 後再綠。

### 4. 為何 generator 紅是正確交件？

acceptance 資料仍是 100/19，working scan 已是 63/14。37 個 missing stableIds 加 findings/files 兩個 aggregate 恰 39 條，是驗收方寫 ledger 並重生 manifest 前的反向簽章；本交件自行更新資產反而違反派工。

### 5. R2 共 63 筆的三 stage 切法

建議以 family dependency 排序：

| Stage | 範圍 | 清除數 | 由 R1 ACCEPTED 63/14 推得的累計紅簽章 | selector |
| --- | --- | ---: | --- | --- |
| R2-A sheet contracts | 10 個 sheet 自檔 props contracts：Create 14、Decide 2、Edit 2、Filter 6、PlayerCard 6、PlayerDirectory 6、Profile 2、Report 1、SessionChat 2、Withdraw 1 | 42 | missing 42＋findings `63→21`＋files `14→12`＝44 | 建議暫不分散上線；Report/Withdraw 雖已清空，與 R2-B 合併一次上線較易機械驗收 |
| R2-B surface lifecycle | `SurfaceHost.tsx:13-16` 的 `isSurfaceRootLive`／`unmount` 兩個 declarations 對九檔各 2＝18；`surfaceContracts.ts:45-47` 的 `LoginModalContentHandle.unmount` 對 `sheets.ts:185:27`＝1 | 19 | 累計 missing 61＋findings `63→2`＋files `14→2`＝63 | 一次上線 12 檔：`sheets.ts`、10 個 contract sheets、另加只有 lifecycle 的 SessionDetail |
| R2-C two leaves | `mySessionsCreatedFocus.ts:7 onCreatedSessionFocus`（method-reference 1）＋`privateDataRepository.ts:105 loadCourts`（injected-repository-callback 1） | 2 | 累計 missing 63＋findings `63→0`＋files `14→0`＝65 | 兩個自檔清零後加入各自 selector；全庫 rule 最終切換另立驗收原子動作較安全 |

雙 family 互動：Create/Decide/Edit/Filter/PlayerCard/PlayerDirectory/Profile/SessionChat 在 R2-A 後各仍有 lifecycle 2，不能上 selector；Report/Withdraw 已清空；SessionDetail 不含 contract finding、只含 lifecycle 2。R2-B 完成後 sheet-related 12 檔才同時全清。

R1 模板不可直接沿用處：R2-A declarations 與 findings 多在同檔且同檔仍有另一 family；R2-B 是兩個集中 declaration members fan-out 到 19 個 findings，而非近乎一對一；12 檔 selector 必須依每檔跨 family 的終態決定；`SurfaceContentLifecycle` 尚被 `SurfaceContentHandle` extends，需用 typecheck 加載；R2-C 的兩個 leaf 是不同 family、不同 runtime 邊界，canary 與測試不可合併假設。R2 還需以 sheets DOM、React unmount、session-data-boundary 分別覆蓋三種風險面。

## 9. 最終差異與未做／疑義／BLOCKED

程式 diff stat（回報檔建立前）：

```text
eslint.config.js                |  5 +++++
src/app/App.tsx                 |  6 +++---
src/app/AppServicesProvider.tsx | 30 +++++++++++++++---------------
src/controllerContracts.ts      | 36 ++++++++++++++++++------------------
4 files changed, 41 insertions(+), 36 deletions(-)
```

最終 porcelain 恰 5 條：

```text
 M eslint.config.js
 M src/app/App.tsx
 M src/app/AppServicesProvider.tsx
 M src/controllerContracts.ts
?? docs/arch-dispatch-2026-08-28-eslintR1-app-pages-report-codex.md
```

- 未做：依合約未 commit、未 push；未改 pages、tests、scripts、baseline、ledger、manifest、generator 或其他凍結檔。
- 疑義：無。variance 預授權未動用。
- BLOCKED：否。
