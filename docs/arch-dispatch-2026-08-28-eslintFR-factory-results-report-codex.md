# ESLint 恢復 Phase FR-A/B/C factory results 聯合回報（Codex）

- 日期：2026-08-28
- 開工 HEAD：`3b32588`；E-9～E-11 ACCEPTED parent：`151eec4`
- 結論：FR-A 23、FR-B 25、FR-C 15，共 63 個 factory-result findings 已清零；`src/sessionController.ts` selector 已精確上線。
- 交件狀態：generator 依合約維持紅；baseline／ledger／manifest／generator 均未修改；未 commit、未 push。
- 核可偏差：只有 `src/controller/discoveryMapController.ts:135` 的 annotation-only nullable 參數註記，詳見第 2 節；其餘實作仍凍結。

## 1. 七檔修改後結果契約防偽原文

`src/controller/mySessionsController.ts:62-82`：

```ts
export interface MySessionsController {
  actionFor: (session: SessionSummary) => ControllerSessionAction;
  beginLifecycleAction: (
    kind: string,
    sessionId: ControllerIdentifier,
    authSnapshot: ControllerAuthSnapshot
  ) => LifecycleActionToken | null;
  captureAuthSnapshot: () => ControllerAuthSnapshot;
  currentParticipation: (sessionId: ControllerIdentifier) => MySessionSummary | null;
  finishLifecycleAction: (token: LifecycleActionToken | null | undefined) => void;
  isCurrentAuthSnapshot: (snapshot: ControllerAuthSnapshot | null | undefined) => boolean;
  lifecycleActionIsInFlight: (sessionId: ControllerIdentifier) => boolean;
  mySessionGroups: () => ControllerMySessionGroups;
  notifyMySessions: () => void;
  refreshMyPlayerBlocks: (snapshot?: ControllerAuthSnapshot) => Promise<boolean>;
  refreshMySessions: () => Promise<boolean>;
  reloadParticipation: (epoch?: number, identity?: string | null) => Promise<boolean>;
  replaceMySessions: (sessions: unknown) => void;
  sessionKey: (sessionId: ControllerIdentifier) => string;
  unblockPlayer: (profileId: ControllerIdentifier) => Promise<true>;
}
```

`src/controller/playerDirectoryController.ts:88-100`：

```ts
export interface PlayerDirectoryController {
  clearPlayerDirectory: (options?: { closeReason?: string }) => void;
  clearPlayerLayer: (options?: { closeReason?: string; turnOff?: boolean }) => void;
  getPlayerGroups: () => ControllerPlayerGroup[];
  loadPlayerDirectoryList: () => Promise<boolean>;
  loadPlayers: (bounds?: MapBounds) => Promise<boolean>;
  openCourt: (court: DataCourt, onlySessions?: SessionSummary[] | null) => void;
  openPlayerCourt: (
    court: DataCourt,
    onlyPlayers?: ControllerPlayer[] | null
  ) => ControllerSurfaceHandle | null | undefined;
  openPlayerDirectory: () => Promise<boolean> | void;
}
```

`src/controller/discoveryMapController.ts:75-89`：

```ts
export interface DiscoveryMapController {
  attachMap: (map: unknown) => void;
  expandBounds: () => Promise<boolean | void> | void;
  getVisibleSessions: () => SessionSummary[];
  loadDiscovery: (bounds?: MapBounds | null) => Promise<boolean | void>;
  publish: () => void;
  refreshLocationViewport: (location: SessionControllerState["userLocation"]) => Promise<boolean | void> | void;
  resetFilters: () => void;
  retryDiscovery: () => Promise<boolean | void>;
  setCourts: (courts: DataCourt[], options?: { ready?: boolean }) => void;
  setDrawerState: (value: SessionControllerState["drawerState"]) => void;
  setFilter: <Key extends keyof ControllerFilters>(key: Key, value: ControllerFilters[Key]) => void;
  setMapUnavailable: () => void;
  startDiscoveryPolling: () => void;
}
```

`src/controller/intentController.ts:93-116`：

```ts
export interface IntentController {
  capturePendingIntentVersion: () => number;
  clearIntent: (expectedIntent?: ControllerPendingIntent | null) => boolean;
  clearPendingIntentIfUnchanged: (version: number) => boolean;
  isReconcileSuppressed: (session: SessionSummary | MySessionSummary | null | undefined) => boolean;
  openCreateIntent: () => void;
  refreshAuthoritativeState: (snapshot: ControllerAuthSnapshot) => Promise<boolean>;
  requestCurrentLocation: () => void;
  requestJoin: (
    session: SessionSummary,
    detail: ControllerSurfaceHandle | null | undefined,
    confirmingAuth: ControllerAuthSnapshot | null
  ) => Promise<Record<string, unknown>>;
  requireSessionAction: (
    intent: ControllerPendingIntent,
    options?: {
      detail?: ControllerSurfaceHandle | null;
      session?: SessionSummary | null;
    }
  ) => unknown;
  resumePendingIntent: () => Promise<boolean>;
  startPrimaryAction: (session: SessionSummary, detail: ControllerSurfaceHandle | null | undefined) => unknown;
  togglePlayerLayer: () => Promise<boolean> | void;
}
```

`src/controller/lifecycleActionsController.ts:83-102`：

```ts
export interface LifecycleActionsController {
  cancelMySession: (sessionId: ControllerIdentifier) => Promise<unknown>;
  confirmMySessionAttendance: (sessionId: ControllerIdentifier) => Promise<unknown>;
  markMySessionPlayed: (sessionId: ControllerIdentifier) => Promise<unknown>;
  mySessionForAction: (sessionId: ControllerIdentifier) => MySessionSummary;
  openSessionDecision: (sessionId: ControllerIdentifier) => Promise<SurfaceResult>;
  openSessionEdit: (sessionId: ControllerIdentifier) => SurfaceResult;
  requireMySessionAction: (
    sessionId: ControllerIdentifier,
    predicate: (session: MySessionSummary) => boolean
  ) => { authSnapshot: ControllerAuthSnapshot; session: MySessionSummary };
  respondInvite: (sessionId: ControllerIdentifier, decision: string) => Promise<unknown>;
  reviewMySessionParticipant: (
    sessionId: ControllerIdentifier,
    participantId: ControllerIdentifier,
    decision: string
  ) => Promise<unknown>;
  withdraw: (session: SessionSummary, detail: ControllerSurfaceHandle | null | undefined) => unknown;
  withdrawMySession: (sessionId: ControllerIdentifier) => SurfaceResult;
}
```

`src/controller/authController.ts:73-77`：

```ts
}: AuthControllerDependencies): {
  setAuthSession: (session: ControllerAuthSession | null) => void;
  setAuthState: (session: ControllerAuthSession | null, profile?: ControllerProfileEligibility | null) => Promise<void>;
  setProfile: (profile: Partial<Profile> | null) => void;
} {
```

`src/controller/chatController.ts:66-68`：

```ts
export function createChatController(dependencies: ChatControllerDependencies): {
  openSessionChat: (sessionId: ControllerIdentifier) => ControllerSurfaceHandle | null | undefined;
} {
```

五個具名 result interface 的 hunks 全落在上述 body；auth AST 鎖定 factory return `TypeLiteral`（3 members），chat AST 鎖定 factory return `TypeLiteral`（1 member）。七檔 Dependencies interfaces 均零 diff。

## 2. 唯一核可偏差：nullable annotation

位置：`src/controller/discoveryMapController.ts:135`。

Before：

```ts
async function loadDiscovery(bounds = read().bounds): Promise<boolean | void> {
```

After：

```ts
async function loadDiscovery(bounds: MapBounds | null = read().bounds): Promise<boolean | void> {
```

原因：result interface 與公開 `ControllerApi` 已允許 `null`，且 implementation 的 `validBounds(bounds)` 會對 `null` fallback 至 Taipei bounds；method signature 轉 function property 後啟用 contravariance，原本過窄的 inferred parameter 才顯露。此修改只補齊實際既有契約，esbuild 會擦除，沒有 runtime token 或行為差異。

替代方案（收窄兩層公開契約）未採用，避免破壞既有 nullable caller 與 exact contract check。`src/controller/playerDirectoryController.ts:146` 的 `loadPlayers(bounds = read().bounds)` 對外契約是 `bounds?: MapBounds`、不含 `null`，FR-A typecheck 綠，未出現同型連鎖。

## 3. 三階段 canary 與 generator 快照

### FR-A

開工 ad-hoc override 恰 63，逐 line:col：

```text
314:5 315:5 316:5 317:5 318:5 319:5 320:5 321:5 322:5 323:5 324:5 325:5 326:5 327:5 328:5
353:5 354:5 355:5 356:5 357:5 358:5 359:5 360:5
379:5 380:5 381:5 382:5 383:5 384:5 385:5 386:5 387:5 388:5 389:5 390:5 391:5
424:5 425:5 426:5 427:5 428:5 429:5 430:5 431:5 432:5 433:5 434:5 435:5
455:5 456:5 457:5 458:5 459:5 460:5 461:5 462:5 463:5 464:5 465:5
468:11 468:27 468:41 613:11
```

FR-A 後 63→40；消失的是 `314:5-328:5` 與 `353:5-360:5`。餘下逐 line:col：

```text
379:5 380:5 381:5 382:5 383:5 384:5 385:5 386:5 387:5 388:5 389:5 390:5 391:5
424:5 425:5 426:5 427:5 428:5 429:5 430:5 431:5 432:5 433:5 434:5 435:5
455:5 456:5 457:5 458:5 459:5 460:5 461:5 462:5 463:5 464:5 465:5
468:11 468:27 468:41 613:11
```

Generator 恰 25 條：

```text
- expected finding missing from current scan: 7070bcce055e4ba65a309b97a384bf6f (src/sessionController.ts)
- expected finding missing from current scan: 94b2661fb673833217e2e18d3b1e1667 (src/sessionController.ts)
- expected finding missing from current scan: 2cbb5ae4f0b951f92c6de5e02f7df9dd (src/sessionController.ts)
- expected finding missing from current scan: 67bd39025e4b8e9c09843e49ec9d8b27 (src/sessionController.ts)
- expected finding missing from current scan: a8679898090886881726da07732ad23e (src/sessionController.ts)
- expected finding missing from current scan: 03294447169dfc77adde9c176b8056cf (src/sessionController.ts)
- expected finding missing from current scan: 3d3765ccbf8c510ea389fcc82d190bb9 (src/sessionController.ts)
- expected finding missing from current scan: 55316e76ad009dbe6f2c023cdb429320 (src/sessionController.ts)
- expected finding missing from current scan: 625443911762ad6a826341b98bbb5db5 (src/sessionController.ts)
- expected finding missing from current scan: 3929393dc05484279b4c34df61bfe553 (src/sessionController.ts)
- expected finding missing from current scan: a32aefa9cfac55e9c9e8c6f87fa168b1 (src/sessionController.ts)
- expected finding missing from current scan: bc68e315e2514106ed715e2d387b7cd7 (src/sessionController.ts)
- expected finding missing from current scan: 0ee1045176e9d7410b69fdcfe7ae7af3 (src/sessionController.ts)
- expected finding missing from current scan: 733e70efa2147480d273cb729c4be94d (src/sessionController.ts)
- expected finding missing from current scan: 199c7b6ee40d1b50dfce75e583e1b738 (src/sessionController.ts)
- expected finding missing from current scan: 7ebdcb29b9a1ee15eb9bfe242e922275 (src/sessionController.ts)
- expected finding missing from current scan: f81c028cf652376abddd8b30060db6ba (src/sessionController.ts)
- expected finding missing from current scan: 5b17e82aca25514a7935291ae34eda39 (src/sessionController.ts)
- expected finding missing from current scan: a78b9b24613fb613430c329ecc7d73ef (src/sessionController.ts)
- expected finding missing from current scan: e11912c61797d97c904fac8f6e31b998 (src/sessionController.ts)
- expected finding missing from current scan: 48f122f6cdec472220528fb9845da03d (src/sessionController.ts)
- expected finding missing from current scan: 7d4d069b1610d7aa9ee6962ca962c23f (src/sessionController.ts)
- expected finding missing from current scan: dd4bba1a2e4a353675464a4322d1d2c6 (src/sessionController.ts)
- findings expected 163, received 140
- sessionController findings expected 63, received 40
```

### FR-B

Ad-hoc override：40→15；餘下逐 line:col：

```text
455:5 456:5 457:5 458:5 459:5 460:5 461:5 462:5 463:5 464:5 465:5
468:11 468:27 468:41 613:11
```

Generator 恰 50 條，完整逐字為：

```text
- expected finding missing from current scan: 7070bcce055e4ba65a309b97a384bf6f (src/sessionController.ts)
- expected finding missing from current scan: 94b2661fb673833217e2e18d3b1e1667 (src/sessionController.ts)
- expected finding missing from current scan: 2cbb5ae4f0b951f92c6de5e02f7df9dd (src/sessionController.ts)
- expected finding missing from current scan: 67bd39025e4b8e9c09843e49ec9d8b27 (src/sessionController.ts)
- expected finding missing from current scan: a8679898090886881726da07732ad23e (src/sessionController.ts)
- expected finding missing from current scan: 03294447169dfc77adde9c176b8056cf (src/sessionController.ts)
- expected finding missing from current scan: 3d3765ccbf8c510ea389fcc82d190bb9 (src/sessionController.ts)
- expected finding missing from current scan: 55316e76ad009dbe6f2c023cdb429320 (src/sessionController.ts)
- expected finding missing from current scan: 625443911762ad6a826341b98bbb5db5 (src/sessionController.ts)
- expected finding missing from current scan: 3929393dc05484279b4c34df61bfe553 (src/sessionController.ts)
- expected finding missing from current scan: a32aefa9cfac55e9c9e8c6f87fa168b1 (src/sessionController.ts)
- expected finding missing from current scan: bc68e315e2514106ed715e2d387b7cd7 (src/sessionController.ts)
- expected finding missing from current scan: 0ee1045176e9d7410b69fdcfe7ae7af3 (src/sessionController.ts)
- expected finding missing from current scan: 733e70efa2147480d273cb729c4be94d (src/sessionController.ts)
- expected finding missing from current scan: 199c7b6ee40d1b50dfce75e583e1b738 (src/sessionController.ts)
- expected finding missing from current scan: 7ebdcb29b9a1ee15eb9bfe242e922275 (src/sessionController.ts)
- expected finding missing from current scan: f81c028cf652376abddd8b30060db6ba (src/sessionController.ts)
- expected finding missing from current scan: 5b17e82aca25514a7935291ae34eda39 (src/sessionController.ts)
- expected finding missing from current scan: a78b9b24613fb613430c329ecc7d73ef (src/sessionController.ts)
- expected finding missing from current scan: e11912c61797d97c904fac8f6e31b998 (src/sessionController.ts)
- expected finding missing from current scan: 48f122f6cdec472220528fb9845da03d (src/sessionController.ts)
- expected finding missing from current scan: 7d4d069b1610d7aa9ee6962ca962c23f (src/sessionController.ts)
- expected finding missing from current scan: dd4bba1a2e4a353675464a4322d1d2c6 (src/sessionController.ts)
- expected finding missing from current scan: 2d84d1e8194fdc8aa03ccc4a0be00486 (src/sessionController.ts)
- expected finding missing from current scan: cc65f8e626fc05693c25312c8e2d1405 (src/sessionController.ts)
- expected finding missing from current scan: f95313672e3c42ca1760c4a9998cce69 (src/sessionController.ts)
- expected finding missing from current scan: 0e4f0d5bda56bd810391639117a043d5 (src/sessionController.ts)
- expected finding missing from current scan: 952ab042953540ef553cceec161f35c2 (src/sessionController.ts)
- expected finding missing from current scan: 7fd5382e5ac09e4bbef26951d4026bf2 (src/sessionController.ts)
- expected finding missing from current scan: e64d362dd89452c31532feec18e7c0b3 (src/sessionController.ts)
- expected finding missing from current scan: 8537ce9ba5d471ba3b43cef7e20b11f2 (src/sessionController.ts)
- expected finding missing from current scan: e009a7bfe79896b97e3bd91ca7c8d2a8 (src/sessionController.ts)
- expected finding missing from current scan: a763b784d9100b0b97247f5da7a4de1a (src/sessionController.ts)
- expected finding missing from current scan: 145d7136c96f3d5e3eb3bc8cf15459d1 (src/sessionController.ts)
- expected finding missing from current scan: e55dc28bb6eaff545e54cba02e04359a (src/sessionController.ts)
- expected finding missing from current scan: 90e8bb9ab0a0abd38d82eb34090db9ec (src/sessionController.ts)
- expected finding missing from current scan: dd0103e607dd5cd49375c7639f746a3a (src/sessionController.ts)
- expected finding missing from current scan: 714b2b19051727e37873a15f8abb8dad (src/sessionController.ts)
- expected finding missing from current scan: 989506111c1537962a46a3f804568857 (src/sessionController.ts)
- expected finding missing from current scan: 4219d4acb206ec862872e8f309f031a9 (src/sessionController.ts)
- expected finding missing from current scan: f665c68113ae21ccf39074e857fa5e1d (src/sessionController.ts)
- expected finding missing from current scan: 596f20c2a4823d0e219eb83a954d08d2 (src/sessionController.ts)
- expected finding missing from current scan: 45ba806804e38fb646d6bf70db44d0e7 (src/sessionController.ts)
- expected finding missing from current scan: 953ac6451f3af4a29eedd6d02d0da8b6 (src/sessionController.ts)
- expected finding missing from current scan: 4d0fd9670f2828589b676e81e324c9e7 (src/sessionController.ts)
- expected finding missing from current scan: 810c642497c9030079d22a06bc2af603 (src/sessionController.ts)
- expected finding missing from current scan: e686d63f5493334dd7b0ff7b32d87fa2 (src/sessionController.ts)
- expected finding missing from current scan: fa6d600bf5bec18e07171eb623fc0526 (src/sessionController.ts)
- findings expected 163, received 115
- sessionController findings expected 63, received 15
```

### FR-C

Ad-hoc override：15→0。selector 上線後 committed lint 綠。暫退 `cancelMySession` 與 `setAuthSession` 兩筆，lint 精確紅於 `src/sessionController.ts:455:5` 與 `:468:11`；用精確 patch 還原後 lifecycle/auth SHA 回到 `3be13d91a999abaa9a3fac60d5950a3604667bf366a8103fa0e5861ae5e291cb`／`72d88455db8b1733fdf225a982e8c437979e17e0eb50d2146d624fcc0a96d66d`，lint 再綠。

## 4. 最終 generator 紅簽章（恰 66 條）

```text
- expected finding missing from current scan: 7070bcce055e4ba65a309b97a384bf6f (src/sessionController.ts)
- expected finding missing from current scan: 94b2661fb673833217e2e18d3b1e1667 (src/sessionController.ts)
- expected finding missing from current scan: 2cbb5ae4f0b951f92c6de5e02f7df9dd (src/sessionController.ts)
- expected finding missing from current scan: 67bd39025e4b8e9c09843e49ec9d8b27 (src/sessionController.ts)
- expected finding missing from current scan: a8679898090886881726da07732ad23e (src/sessionController.ts)
- expected finding missing from current scan: 03294447169dfc77adde9c176b8056cf (src/sessionController.ts)
- expected finding missing from current scan: 3d3765ccbf8c510ea389fcc82d190bb9 (src/sessionController.ts)
- expected finding missing from current scan: 55316e76ad009dbe6f2c023cdb429320 (src/sessionController.ts)
- expected finding missing from current scan: 625443911762ad6a826341b98bbb5db5 (src/sessionController.ts)
- expected finding missing from current scan: 3929393dc05484279b4c34df61bfe553 (src/sessionController.ts)
- expected finding missing from current scan: a32aefa9cfac55e9c9e8c6f87fa168b1 (src/sessionController.ts)
- expected finding missing from current scan: bc68e315e2514106ed715e2d387b7cd7 (src/sessionController.ts)
- expected finding missing from current scan: 0ee1045176e9d7410b69fdcfe7ae7af3 (src/sessionController.ts)
- expected finding missing from current scan: 733e70efa2147480d273cb729c4be94d (src/sessionController.ts)
- expected finding missing from current scan: 199c7b6ee40d1b50dfce75e583e1b738 (src/sessionController.ts)
- expected finding missing from current scan: 7ebdcb29b9a1ee15eb9bfe242e922275 (src/sessionController.ts)
- expected finding missing from current scan: f81c028cf652376abddd8b30060db6ba (src/sessionController.ts)
- expected finding missing from current scan: 5b17e82aca25514a7935291ae34eda39 (src/sessionController.ts)
- expected finding missing from current scan: a78b9b24613fb613430c329ecc7d73ef (src/sessionController.ts)
- expected finding missing from current scan: e11912c61797d97c904fac8f6e31b998 (src/sessionController.ts)
- expected finding missing from current scan: 48f122f6cdec472220528fb9845da03d (src/sessionController.ts)
- expected finding missing from current scan: 7d4d069b1610d7aa9ee6962ca962c23f (src/sessionController.ts)
- expected finding missing from current scan: dd4bba1a2e4a353675464a4322d1d2c6 (src/sessionController.ts)
- expected finding missing from current scan: 2d84d1e8194fdc8aa03ccc4a0be00486 (src/sessionController.ts)
- expected finding missing from current scan: cc65f8e626fc05693c25312c8e2d1405 (src/sessionController.ts)
- expected finding missing from current scan: f95313672e3c42ca1760c4a9998cce69 (src/sessionController.ts)
- expected finding missing from current scan: 0e4f0d5bda56bd810391639117a043d5 (src/sessionController.ts)
- expected finding missing from current scan: 952ab042953540ef553cceec161f35c2 (src/sessionController.ts)
- expected finding missing from current scan: 7fd5382e5ac09e4bbef26951d4026bf2 (src/sessionController.ts)
- expected finding missing from current scan: e64d362dd89452c31532feec18e7c0b3 (src/sessionController.ts)
- expected finding missing from current scan: 8537ce9ba5d471ba3b43cef7e20b11f2 (src/sessionController.ts)
- expected finding missing from current scan: e009a7bfe79896b97e3bd91ca7c8d2a8 (src/sessionController.ts)
- expected finding missing from current scan: a763b784d9100b0b97247f5da7a4de1a (src/sessionController.ts)
- expected finding missing from current scan: 145d7136c96f3d5e3eb3bc8cf15459d1 (src/sessionController.ts)
- expected finding missing from current scan: e55dc28bb6eaff545e54cba02e04359a (src/sessionController.ts)
- expected finding missing from current scan: 90e8bb9ab0a0abd38d82eb34090db9ec (src/sessionController.ts)
- expected finding missing from current scan: dd0103e607dd5cd49375c7639f746a3a (src/sessionController.ts)
- expected finding missing from current scan: 714b2b19051727e37873a15f8abb8dad (src/sessionController.ts)
- expected finding missing from current scan: 989506111c1537962a46a3f804568857 (src/sessionController.ts)
- expected finding missing from current scan: 4219d4acb206ec862872e8f309f031a9 (src/sessionController.ts)
- expected finding missing from current scan: f665c68113ae21ccf39074e857fa5e1d (src/sessionController.ts)
- expected finding missing from current scan: 596f20c2a4823d0e219eb83a954d08d2 (src/sessionController.ts)
- expected finding missing from current scan: 45ba806804e38fb646d6bf70db44d0e7 (src/sessionController.ts)
- expected finding missing from current scan: 953ac6451f3af4a29eedd6d02d0da8b6 (src/sessionController.ts)
- expected finding missing from current scan: 4d0fd9670f2828589b676e81e324c9e7 (src/sessionController.ts)
- expected finding missing from current scan: 810c642497c9030079d22a06bc2af603 (src/sessionController.ts)
- expected finding missing from current scan: e686d63f5493334dd7b0ff7b32d87fa2 (src/sessionController.ts)
- expected finding missing from current scan: fa6d600bf5bec18e07171eb623fc0526 (src/sessionController.ts)
- expected finding missing from current scan: 10d5f36331028b3b71ba1179fc5bfa20 (src/sessionController.ts)
- expected finding missing from current scan: c55ce135c93b5ad36f59603cb9c6c2a7 (src/sessionController.ts)
- expected finding missing from current scan: 49afb87b426f991563e208f1b3686c26 (src/sessionController.ts)
- expected finding missing from current scan: ca155a32fbf9f3a49b7f4a5cdff7b5cb (src/sessionController.ts)
- expected finding missing from current scan: 3b6254b035a420c8aa25f46b5e5d80e0 (src/sessionController.ts)
- expected finding missing from current scan: ffd87b1a218027f976aed427c3012fb7 (src/sessionController.ts)
- expected finding missing from current scan: a66a4a29f2b23f368274e5f1c28a4c55 (src/sessionController.ts)
- expected finding missing from current scan: 80352f9fee870451473db7938f599c68 (src/sessionController.ts)
- expected finding missing from current scan: b99e4e96a5d7fb7f33cc503ef943f65a (src/sessionController.ts)
- expected finding missing from current scan: 95f665d10c120a5ce901ff466437ab51 (src/sessionController.ts)
- expected finding missing from current scan: 29c29cf98cb343030ff9b7c042eee312 (src/sessionController.ts)
- expected finding missing from current scan: cbe8f0200281fdf0b14c8dd95b7cb553 (src/sessionController.ts)
- expected finding missing from current scan: 75cd4020732a1733d8c57bde1aa0dea0 (src/sessionController.ts)
- expected finding missing from current scan: 781cbd80fd64568ed8036d655435de14 (src/sessionController.ts)
- expected finding missing from current scan: b5443c26d5d8f44f05321a8a506272f8 (src/sessionController.ts)
- findings expected 163, received 100
- files expected 20, received 19
- sessionController findings expected 63, received 0
```

命令 exit 1、`^- ` 計數 66，正是等待驗收方 ledger／manifest 更新的合約紅，不是產品驗證失敗。

## 5. stableId 三點對點（63）

格式：`stableId | declaration owner:line member | sessionController line:col`；同一 stableId 即為第 4 節紅簽章 ID。

```text
7070bcce055e4ba65a309b97a384bf6f | mySessionsController.ts:63 actionFor | 314:5
94b2661fb673833217e2e18d3b1e1667 | mySessionsController.ts:64 beginLifecycleAction | 315:5
2cbb5ae4f0b951f92c6de5e02f7df9dd | mySessionsController.ts:77 refreshMySessions | 324:5
67bd39025e4b8e9c09843e49ec9d8b27 | mySessionsController.ts:78 reloadParticipation | 325:5
a8679898090886881726da07732ad23e | mySessionsController.ts:79 replaceMySessions | 326:5
03294447169dfc77adde9c176b8056cf | mySessionsController.ts:80 sessionKey | 327:5
3d3765ccbf8c510ea389fcc82d190bb9 | mySessionsController.ts:81 unblockPlayer | 328:5
55316e76ad009dbe6f2c023cdb429320 | mySessionsController.ts:69 captureAuthSnapshot | 316:5
625443911762ad6a826341b98bbb5db5 | mySessionsController.ts:70 currentParticipation | 317:5
3929393dc05484279b4c34df61bfe553 | mySessionsController.ts:71 finishLifecycleAction | 318:5
a32aefa9cfac55e9c9e8c6f87fa168b1 | mySessionsController.ts:72 isCurrentAuthSnapshot | 319:5
bc68e315e2514106ed715e2d387b7cd7 | mySessionsController.ts:73 lifecycleActionIsInFlight | 320:5
0ee1045176e9d7410b69fdcfe7ae7af3 | mySessionsController.ts:74 mySessionGroups | 321:5
733e70efa2147480d273cb729c4be94d | mySessionsController.ts:75 notifyMySessions | 322:5
199c7b6ee40d1b50dfce75e583e1b738 | mySessionsController.ts:76 refreshMyPlayerBlocks | 323:5
7ebdcb29b9a1ee15eb9bfe242e922275 | playerDirectoryController.ts:89 clearPlayerDirectory | 353:5
f81c028cf652376abddd8b30060db6ba | playerDirectoryController.ts:90 clearPlayerLayer | 354:5
5b17e82aca25514a7935291ae34eda39 | playerDirectoryController.ts:91 getPlayerGroups | 355:5
a78b9b24613fb613430c329ecc7d73ef | playerDirectoryController.ts:92 loadPlayerDirectoryList | 356:5
e11912c61797d97c904fac8f6e31b998 | playerDirectoryController.ts:93 loadPlayers | 357:5
48f122f6cdec472220528fb9845da03d | playerDirectoryController.ts:94 openCourt | 358:5
7d4d069b1610d7aa9ee6962ca962c23f | playerDirectoryController.ts:95 openPlayerCourt | 359:5
dd4bba1a2e4a353675464a4322d1d2c6 | playerDirectoryController.ts:99 openPlayerDirectory | 360:5
2d84d1e8194fdc8aa03ccc4a0be00486 | discoveryMapController.ts:76 attachMap | 379:5
cc65f8e626fc05693c25312c8e2d1405 | discoveryMapController.ts:77 expandBounds | 380:5
f95313672e3c42ca1760c4a9998cce69 | discoveryMapController.ts:86 setFilter | 389:5
0e4f0d5bda56bd810391639117a043d5 | discoveryMapController.ts:87 setMapUnavailable | 390:5
952ab042953540ef553cceec161f35c2 | discoveryMapController.ts:88 startDiscoveryPolling | 391:5
7fd5382e5ac09e4bbef26951d4026bf2 | discoveryMapController.ts:78 getVisibleSessions | 381:5
e64d362dd89452c31532feec18e7c0b3 | discoveryMapController.ts:79 loadDiscovery | 382:5
8537ce9ba5d471ba3b43cef7e20b11f2 | discoveryMapController.ts:80 publish | 383:5
e009a7bfe79896b97e3bd91ca7c8d2a8 | discoveryMapController.ts:81 refreshLocationViewport | 384:5
a763b784d9100b0b97247f5da7a4de1a | discoveryMapController.ts:82 resetFilters | 385:5
145d7136c96f3d5e3eb3bc8cf15459d1 | discoveryMapController.ts:83 retryDiscovery | 386:5
e55dc28bb6eaff545e54cba02e04359a | discoveryMapController.ts:84 setCourts | 387:5
90e8bb9ab0a0abd38d82eb34090db9ec | discoveryMapController.ts:85 setDrawerState | 388:5
dd0103e607dd5cd49375c7639f746a3a | intentController.ts:94 capturePendingIntentVersion | 424:5
714b2b19051727e37873a15f8abb8dad | intentController.ts:95 clearIntent | 425:5
989506111c1537962a46a3f804568857 | intentController.ts:114 startPrimaryAction | 434:5
4219d4acb206ec862872e8f309f031a9 | intentController.ts:115 togglePlayerLayer | 435:5
f665c68113ae21ccf39074e857fa5e1d | intentController.ts:96 clearPendingIntentIfUnchanged | 426:5
596f20c2a4823d0e219eb83a954d08d2 | intentController.ts:97 isReconcileSuppressed | 427:5
45ba806804e38fb646d6bf70db44d0e7 | intentController.ts:98 openCreateIntent | 428:5
953ac6451f3af4a29eedd6d02d0da8b6 | intentController.ts:99 refreshAuthoritativeState | 429:5
4d0fd9670f2828589b676e81e324c9e7 | intentController.ts:100 requestCurrentLocation | 430:5
810c642497c9030079d22a06bc2af603 | intentController.ts:101 requestJoin | 431:5
e686d63f5493334dd7b0ff7b32d87fa2 | intentController.ts:106 requireSessionAction | 432:5
fa6d600bf5bec18e07171eb623fc0526 | intentController.ts:113 resumePendingIntent | 433:5
10d5f36331028b3b71ba1179fc5bfa20 | lifecycleActionsController.ts:84 cancelMySession | 455:5
c55ce135c93b5ad36f59603cb9c6c2a7 | lifecycleActionsController.ts:85 confirmMySessionAttendance | 456:5
49afb87b426f991563e208f1b3686c26 | lifecycleActionsController.ts:101 withdrawMySession | 465:5
ca155a32fbf9f3a49b7f4a5cdff7b5cb | lifecycleActionsController.ts:86 markMySessionPlayed | 457:5
3b6254b035a420c8aa25f46b5e5d80e0 | lifecycleActionsController.ts:87 mySessionForAction | 458:5
ffd87b1a218027f976aed427c3012fb7 | lifecycleActionsController.ts:88 openSessionDecision | 459:5
a66a4a29f2b23f368274e5f1c28a4c55 | lifecycleActionsController.ts:89 openSessionEdit | 460:5
80352f9fee870451473db7938f599c68 | lifecycleActionsController.ts:90 requireMySessionAction | 461:5
b99e4e96a5d7fb7f33cc503ef943f65a | lifecycleActionsController.ts:94 respondInvite | 462:5
95f665d10c120a5ce901ff466437ab51 | lifecycleActionsController.ts:95 reviewMySessionParticipant | 463:5
29c29cf98cb343030ff9b7c042eee312 | lifecycleActionsController.ts:100 withdraw | 464:5
cbe8f0200281fdf0b14c8dd95b7cb553 | authController.ts:74 setAuthSession | 468:11
75cd4020732a1733d8c57bde1aa0dea0 | authController.ts:75 setAuthState | 468:27
781cbd80fd64568ed8036d655435de14 | authController.ts:76 setProfile | 468:41
b5443c26d5d8f44f05321a8a506272f8 | chatController.ts:67 openSessionChat | 613:11
```

## 6. 零 diff、餘檔與 erased-token 證明

`git diff --stat -- src/sessionController.ts` 與 `git diff --numstat -- src/sessionController.ts` 均無輸出。其 `:68` 仍逐字為：

```ts
action: ReturnType<ReturnType<typeof createMySessionsController>["actionFor"]>;
```

Typecheck 綠，證明 function-property 轉換後 indexed `ReturnType<>` 與唯一 `.ts` consumer 仍相容。

餘檔切除指定 result declaration 後，HEAD/current 逐 byte 全等：

| 檔案 | REST bytes | REST SHA-256（兩側相同） | 結果 |
| --- | ---: | --- | --- |
| mySessionsController.ts | 12,626 | `18ee3edc97e745b636fed3d7c448de3a8fb5503e884e3648ffcb77778335c825` | true |
| playerDirectoryController.ts | 13,090 | `822ba48542bb1a69fbd1038006694fe9e1c36f720b577145a5ddf8583bd175a0` | true |
| discoveryMapController.ts | 10,282 | `5616441aa2ea5c795028cba347201f74989468f1b9c7715315ed044f974c9c5e` | true |
| intentController.ts | 21,421 | `c9a86153bce0d3f27d140c88efb12847fa3829c89944d3256c6d8257ae6d768e` | true |
| lifecycleActionsController.ts | 16,471 | `178cd0dd7091885e011ac5c3984dfb3341e0933a59654a88d31a05f9620aa021` | true |
| authController.ts | 7,109 | `d85a81704396bce8fdcee8aca787f1bc5a0bc05c449ad7d60554ec0a2ecc2f6a` | true |
| chatController.ts | 10,575 | `c8a6f6dbef9b256654d3c58d0e313fd987832fcb8df5a8ad35a00d2263d02f8b` | true |

Discovery REST 的切除面是 result interface `:75-89` 加上唯一核可 annotation `:135`；因此表中的全等同時證明除此兩處外 implementation 零變。

esbuild 擦除型別後，全檔 HEAD/current 逐 byte 全等：

| 檔案 | erased bytes | erased SHA-256（兩側相同） | 結果 |
| --- | ---: | --- | --- |
| mySessionsController.ts | 8,851 | `13bf75b0b3579431b2af8950cf4a3c0feb69bba1a5bd14d51d9589bbb86bb026` | true |
| playerDirectoryController.ts | 7,747 | `953ada2862220336ccdd557d9e61a09817156e43b2ee69c1d81d4bc785774027` | true |
| discoveryMapController.ts | 5,990 | `25b91d955dd12250dbdc4638d9ef5642bfad89dce116828993c16c9a1653dc4e` | true |
| intentController.ts | 14,309 | `d5d7c2467012d90ce14bcc6cac929a07223077362b04cd0c9a954184d974b5a9` | true |
| lifecycleActionsController.ts | 11,629 | `dd622aea02d147226db38ea0a134a0735ebcacb605162be4f40a5b5bdc0b5a48` | true |
| authController.ts | 3,984 | `344d7cdf8429bbe2b4d863091e08f420ab2d58293494b0090af725ffb179dfeb` | true |
| chatController.ts | 6,273 | `48de8b43aa1db6c1670777efa7d4146ac5c9164cdceabf433add4455a346364e` | true |

因此 nullable annotation 也符合「erased-token 逐 byte 全等」核可條件，而不是例外於該 gate。

## 7. selector 與收尾矩陣

`eslint.config.js` scoped files 尾端現為：

```text
src/controller/authController.ts
src/controller/chatController.ts
src/controller/discoveryMapController.ts
src/controller/intentController.ts
src/controller/lifecycleActionsController.ts
src/controller/mySessionsController.ts
src/controller/playerDirectoryController.ts
src/map.ts
src/sessionController.ts
```

真實 `--print-config`：`src/sessionController.ts` rule severity `[2]`；`src/sheets.ts` 與 `src/app/App.tsx` 均 `[0]`。沒有 glob、inline disable、`any`、`@ts-ignore`、wrapper、`.bind()` 或新 arrow。

| 驗證 | 結果 |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run prettier:check` | PASS |
| `npm run build` | PASS；508 modules transformed |
| `npm run check:production-bundle` | PASS；32 files；main `638937/187466`、total JS `841561/257627`；main/total gzip 淨 `0 B` |
| `npm run test:session-unit` | PASS；346 passed |
| `npm run test:mock` | 最終 PASS；298 passed、4 skipped |
| `npm run test:local` | PASS；API 2 passed；browser 45 passed、11 skipped；未需 reset |
| `git diff --check` | PASS |
| generator `--check` | 預期 exit 1；66 bullets，逐字見第 4 節 |

Mock 第一次完整跑出現既有 lazy `FilterSheet` readiness race：測試在 snapshot 尚為 `LOADING` 時查 `[data-filter]`，兩次 isolated rerun 同型失敗；未改測試或產品碼。完成 local/build/bundle 後重跑完整 mock，最終 298/4 綠。Controller 的 emitted JS 全等，未見本批 runtime 因果。

Production bundle gate 逐字摘要：

```text
production bundle check passed: development E2E hook present, production E2E hook absent; 32 files, 12 demo identifiers absent; main 638937/187466 within 658867/192420; largest app lazy MySessionsPage-Byp_C9FO.js 16476/4828 within 18000/5500; total JS 841561/257627 within 849961/259062; private repository: privateDataRepository-CfJqlfj0.js; Sentry: sentryBrowserSdk-Czz5dmkg.js
```

## 8. Codex 五問

### 1. 如何證明只改 result contract，沒有改 consumer 或 Dependencies？

`sessionController.ts` stat/numstat 均空；五個具名 interface 的 zero-context hunks 全在 result body，auth/chat 由 AST return `TypeLiteral` 切片鎖定。逐檔切除解凍區後 REST byteEqual；七檔 Dependencies interfaces 均落在 REST 中，因此一起被證明未改。

### 2. 如何證明唯一 nullable 偏差沒有 runtime 影響？

Before/after 只差 `: MapBounds | null`，它是 esbuild 必然擦除的 annotation。Discovery 全檔 erased output 5,990 bytes、SHA-256 `25b91d…c4e` 逐 byte 相等；現存 `validBounds` fallback 本來就處理 null。其餘 implementation 由 REST 切除後全等證明凍結。

### 3. selector 為何只在 FR-C 上線，且如何證明精確？

FR-A/FR-B 的 ad-hoc canary 尚餘 40/15，因此未提早上線；FR-C 清至 0 才精確加入單一 `src/sessionController.ts` path。`--print-config` 對目標為 `[2]`、sheets/App 為 `[0]`，暫退兩筆又讓 committed lint 在預定 consumer line 精確轉紅。

### 4. 為何 generator 紅仍是正確交件？

驗收資料仍是 163/20/63，working scan 已是 100/19/0。63 個 missing IDs、findings/files/sessionController 三個 aggregate 恰 66 條，這是 acceptance 記帳前的反向防偽；自行改 ledger 或 manifest 才會越權。

### 5. React contracts 79 的三批切法與 controller 模板差異

建議依 owner／runtime surface 分成：

| 批次 | findings | declaration 位置與型態 | 以前批 acceptance 100/19 為基準的累計紅簽章 | selector 條件 |
| --- | ---: | --- | --- | --- |
| React-A app | 22 | `App.tsx` 3（2 parameter-destructure＋1 passed-as-callback）；`AppServicesProvider.tsx` 19，契約在 `controllerContracts.ts` 的 `ControllerApi`、使用點含 option-property | missing 22＋findings `100→78`＋files `19→17`＝24 | App 兩檔全清才上線 |
| React-B sheets | 42 | 10 個 sheets 各自 props declaration；finding 均 parameter-destructure | 累計 missing 64＋findings `100→36`＋files `19→15`＝66 | 只有 `ReportDialog`、`WithdrawDialog` 可上線；其餘 8 檔仍有 surface-lifecycle 2/檔 |
| React-C pages | 15 | Me 9、MySessions 5、Nearby 1；context declarations 在 `AppServicesProvider`，10 destructured-function＋4 option-property＋1 passed-as-callback | 累計 missing 79＋findings `100→21`＋files `19→12`＝81 | 三個 page finding 檔全清後各自上線 |

Sheets 明細：Create 14、Decide 2、Edit 2、Filter 6、PlayerCard 6、PlayerDirectory 6、Profile 2、Report 1、SessionChat 2、WithdrawDialog 1。Create／Decide／Edit／Filter／PlayerCard／PlayerDirectory／Profile／SessionChat 各仍有 surface-lifecycle 2；不能因本族清零就整批開 selector。

不可直接沿用 controller 模板之處：declaration owner 與 finding file 常不同；`ControllerApi` 與 context interfaces 另含非目標 members，不能整個 interface 全轉；sheet 同檔共存另一 finding family；不存在單一 `sessionController.ts` 零 diff 證據；React props/context 的 variance 可能另揭型別衝突；canary 應以 finding files 而非 declaration owner 驗；lazy surface runtime 測試需列為核心 gate。

## 9. 最終差異與未做／疑義／BLOCKED

程式 diff stat（回報檔建立前）：

```text
eslint.config.js                             |  1 +
src/controller/authController.ts             |  6 +++---
src/controller/chatController.ts             |  2 +-
src/controller/discoveryMapController.ts     | 28 ++++++++++++------------
src/controller/intentController.ts           | 28 ++++++++++++------------
src/controller/lifecycleActionsController.ts | 26 +++++++++++-----------
src/controller/mySessionsController.ts       | 32 ++++++++++++++--------------
src/controller/playerDirectoryController.ts  | 18 ++++++++--------
8 files changed, 71 insertions(+), 70 deletions(-)
```

最終 porcelain 恰 9 條：

```text
 M eslint.config.js
 M src/controller/authController.ts
 M src/controller/chatController.ts
 M src/controller/discoveryMapController.ts
 M src/controller/intentController.ts
 M src/controller/lifecycleActionsController.ts
 M src/controller/mySessionsController.ts
 M src/controller/playerDirectoryController.ts
?? docs/arch-dispatch-2026-08-28-eslintFR-factory-results-report-codex.md
```

- 未做：依合約未 commit、未 push；未改 baseline、ledger、manifest、generator、tests 或其他凍結檔。
- 疑義：實作面無未決疑義。唯一遇到的 variance 衝突已依使用者核可條件，以 annotation-only 方式處理並完成 erased-byte 證明。
- BLOCKED：否。
