# ESLint 恢復 Phase E-9～E-11 controller ports 收官聯合回報（Codex）

- 日期：2026-08-28
- 開工 HEAD：`8a86c2a`
- E-8 ACCEPTED parent：`f63b688`
- 結論：E-9 lifecycle ports 11、E-10 intent ports 22、E-11 lifecycle extraction 2 均完成；35 個 findings 清零，兩個檔案的 scoped selector 已上線。
- 交件狀態：generator 按合約維持紅；baseline／ledger／manifest／generator 均未修改；未 commit、未 push。

## 1. 修改後 interface 防偽原文

`src/controller/intentController.ts:47-91`：

```ts
interface IntentControllerDependencies {
  actionFor: (session: SessionSummary) => ControllerSessionAction;
  api: IntentDataApi;
  beginLifecycleAction: (
    kind: string,
    sessionId: ControllerIdentifier,
    snapshot: ControllerAuthSnapshot
  ) => LifecycleActionToken | null;
  captureAuthSnapshot: () => ControllerAuthSnapshot;
  clearPlayerLayer: (options?: { closeReason?: string }) => void;
  commitPlayerVisibility: () => Promise<void>;
  currentParticipation: (sessionId: ControllerIdentifier) => MySessionSummary | null;
  finishLifecycleAction: (token: LifecycleActionToken | null | undefined) => void;
  intentStore: IntentStore;
  isCurrentAuthSnapshot: (snapshot: ControllerAuthSnapshot | null | undefined) => boolean;
  lifecycleActionIsInFlight: (sessionId: ControllerIdentifier) => boolean;
  loadDiscovery: () => Promise<boolean | void>;
  loadPlayerDirectoryList: () => Promise<boolean>;
  loadPlayers: () => Promise<boolean>;
  locationGate: ControllerRequestGate;
  openCreateSession: (handlers: {
    courts: unknown[];
    courtsReady: boolean;
    onClose(options?: { reason?: string }): void;
    onSubmit(input: unknown): Promise<unknown>;
    onViewMySessions(sessionId: ControllerIdentifier): void;
  }) => ControllerSurfaceHandle | null | undefined;
  openLogin: (handlers: { action: string; onClose(options?: { reason?: string }): void }) => unknown;
  openSessionChat: (sessionId: ControllerIdentifier) => unknown;
  openSessionDetail: (session: SessionSummary, options?: { initialStage?: string }) => unknown;
  profilePrompt: (context: {
    courts: unknown[];
    courtsReady: boolean;
    intent: ControllerPendingIntent;
    onClose(options?: { reason?: string; saved?: boolean }): void;
    returnSession: SessionSummary | null;
  }) => ControllerSurfaceHandle | null | undefined;
  publish: () => void;
  refreshLocationViewport: (location: { lat: number; lng: number }) => Promise<boolean | void> | void;
  reloadParticipation: (epoch: number, identity: string | null) => Promise<boolean>;
  showCreatedSession: (sessionId: ControllerIdentifier) => void;
  store: Store<SessionControllerState, ControllerEventName>;
  surfaceRegistry: SurfaceRegistry;
  toast: (message: string) => void;
}
```

`src/controller/lifecycleActionsController.ts:25-43`：

```ts
interface LifecycleDataApi {
  acceptSessionParticipant?: (sessionId: ControllerIdentifier, participantId: ControllerIdentifier) => Promise<unknown>;
  cancelSession?(sessionId: ControllerIdentifier): Promise<unknown>;
  confirmSessionAttendance?(sessionId: ControllerIdentifier): Promise<unknown>;
  decideSessionCourt?(
    sessionId: ControllerIdentifier,
    courtId: ControllerIdentifier,
    startAt: unknown
  ): Promise<unknown>;
  declineSessionParticipant?: (
    sessionId: ControllerIdentifier,
    participantId: ControllerIdentifier
  ) => Promise<unknown>;
  loadSessionSummary?(sessionId: ControllerIdentifier): Promise<unknown>;
  markSessionPlayed?(sessionId: ControllerIdentifier): Promise<unknown>;
  respondToSessionInvite?(sessionId: ControllerIdentifier, decision: string): Promise<unknown>;
  updateSession?(input: Record<string, unknown>): Promise<unknown>;
  withdrawFromSession?(sessionId: ControllerIdentifier): Promise<unknown>;
}
```

`src/controller/lifecycleActionsController.ts:59-81`：

```ts
interface LifecycleActionsDependencies {
  api: LifecycleDataApi;
  beginLifecycleAction: (
    kind: string,
    sessionId: ControllerIdentifier,
    authSnapshot: ControllerAuthSnapshot
  ) => LifecycleActionToken | null;
  captureAuthSnapshot: () => ControllerAuthSnapshot;
  finishLifecycleAction: (token: LifecycleActionToken | null | undefined) => void;
  isCurrentAuthSnapshot: (snapshot: ControllerAuthSnapshot) => boolean;
  openDecideSession: (
    session: SessionSummary | null,
    handlers: DecideHandlers
  ) => ControllerSurfaceHandle | null | undefined;
  openEditSession: (session: MySessionSummary, handlers: EditHandlers) => ControllerSurfaceHandle | null | undefined;
  openWithdrawConfirmation: (handlers: { onConfirm(): unknown }) => unknown;
  refreshAuthoritativeState: (snapshot: ControllerAuthSnapshot) => Promise<boolean>;
  sessionKey: (sessionId: ControllerIdentifier) => string;
  store: Store<SessionControllerState, ControllerEventName>;
  surfaceRegistry: SurfaceRegistry;
  toast: (message: string) => void;
  transitionSurfaces: (name: string) => void;
}
```

兩個 nested handler 區的 method tokens 均保留：intent 的 `onClose`／`onSubmit`／`onViewMySessions`，以及 lifecycle 的 `onConfirm`。`api`、stores、gates、surface registry 等凍結 properties 未改。

## 2. 三階段 canary 與快照

### Stage 1：lifecycle ports 11

開工 ad-hoc override 恰 13 筆：

```text
108:3  beginLifecycleAction
109:3  captureAuthSnapshot
110:3  finishLifecycleAction
111:3  isCurrentAuthSnapshot
112:3  openDecideSession
113:3  openEditSession
114:3  openWithdrawConfirmation
115:3  refreshAuthoritativeState
116:3  sessionKey
119:3  toast
120:3  transitionSurfaces
230:49 api.acceptSessionParticipant
230:80 api.declineSessionParticipant
✖ 13 problems (13 errors, 0 warnings)
```

修復 ports 後恰餘 extraction 2：

```text
230:49 api.acceptSessionParticipant
230:80 api.declineSessionParticipant
✖ 2 problems (2 errors, 0 warnings)
```

暫退 11 筆後再次精確得到上述 13 個 line:col；還原後來源 SHA-256 同為：

```text
acd63bc6e651a8799932a3ab12302338815ff31b239ba994fa10dcfa6bbc777a
```

Stage 1 generator 紅快照逐字：

```text
- expected finding missing from current scan: 4500e4510b7a7d554218f8eedbd80850 (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: 8fe7fe129236a63dbd4b6396d64095e5 (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: 9ef772e2211454c055d7dfb76970d334 (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: 7f9eafaf86f052e1ea15e32b5e395eb1 (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: d9244d7a6c863395e13063a98c0006a1 (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: f70ddcdff97a9c195874e28a5caffb70 (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: 65091efc930269d3532efef4dd2c1ee8 (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: 2fd1b37c0f88d35da7e88cbe478f783c (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: 987535f9fa42320940cfbad9cf7df3af (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: d8c2f57104bc8e4f92a22ce394cb2273 (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: 3388ea60fb76122bbe9aff704854a09c (src/controller/lifecycleActionsController.ts)
- findings expected 198, received 187
```

無 `files` 條目，符合該檔仍有 extraction 2 的預期。

### Stage 2：intent ports 22

selector 上線、暫退 22 筆後的 committed lint：

```text
124:3 actionFor
126:3 beginLifecycleAction
127:3 captureAuthSnapshot
128:3 clearPlayerLayer
129:3 commitPlayerVisibility
130:3 currentParticipation
131:3 finishLifecycleAction
133:3 isCurrentAuthSnapshot
134:3 lifecycleActionIsInFlight
135:3 loadDiscovery
136:3 loadPlayerDirectoryList
137:3 loadPlayers
139:3 openCreateSession
140:3 openLogin
141:3 openSessionChat
142:3 openSessionDetail
143:3 profilePrompt
144:3 publish
145:3 refreshLocationViewport
146:3 reloadParticipation
147:3 showCreatedSession
150:3 toast
✖ 22 problems (22 errors, 0 warnings)
```

還原後 lint 綠，intent SHA-256 精確回到：

```text
73598d522eb7b244a942ba9bc870d1031d135fcdfd21e3b34f884567707f094f
```

Stage 2 generator 紅快照逐字（missing 33 後接兩個 aggregates）：

```text
- expected finding missing from current scan: 68bcd45f1b8e292a01d2f84abdd70dfd (src/controller/intentController.ts)
- expected finding missing from current scan: b06b01d28df408f45ac0ea8d971ba600 (src/controller/intentController.ts)
- expected finding missing from current scan: 30b027aa7733f7874e59e89a8d788e37 (src/controller/intentController.ts)
- expected finding missing from current scan: 07150d83c1fe92aa4dec1d8cfa8330ce (src/controller/intentController.ts)
- expected finding missing from current scan: 89342c0a3f1aba92fa9e80b3bdb3c5f3 (src/controller/intentController.ts)
- expected finding missing from current scan: 3e3a3b206c2d1ec8eddc5c96c3961773 (src/controller/intentController.ts)
- expected finding missing from current scan: 066583902dbea6b6fde181d82519c0c0 (src/controller/intentController.ts)
- expected finding missing from current scan: 156f8c70ce523cc2a226cb7584d56694 (src/controller/intentController.ts)
- expected finding missing from current scan: d5945f03c02fcea2096b28a92e8375dc (src/controller/intentController.ts)
- expected finding missing from current scan: 0bbe3ff81b107341aaa0d90711f85e3b (src/controller/intentController.ts)
- expected finding missing from current scan: 2e8dcfe212bbfb4ca691efd0b7adebb9 (src/controller/intentController.ts)
- expected finding missing from current scan: 2b63304478171c40b719ae12ab2eff56 (src/controller/intentController.ts)
- expected finding missing from current scan: d41ddf19c5fb8d1ff4fe72867238998a (src/controller/intentController.ts)
- expected finding missing from current scan: 61a99f774bb9f06677e1e1382a097054 (src/controller/intentController.ts)
- expected finding missing from current scan: 32a61647bb76353596f6563b982a801d (src/controller/intentController.ts)
- expected finding missing from current scan: b9e9cf08367840cec2ff89cc875f02fc (src/controller/intentController.ts)
- expected finding missing from current scan: c0964e8de068514795efbdb20941a4d2 (src/controller/intentController.ts)
- expected finding missing from current scan: 879f40b82f4b20752b2511df708bf6f1 (src/controller/intentController.ts)
- expected finding missing from current scan: 36eaa31dd823cc56eaf83ad6321f8483 (src/controller/intentController.ts)
- expected finding missing from current scan: 4691d544841fbd7af7e4c3568c0881d7 (src/controller/intentController.ts)
- expected finding missing from current scan: b4065b3b6f1ac3e9a0ec77e4be8e9f4e (src/controller/intentController.ts)
- expected finding missing from current scan: 487726c7ea17870ba5b74809a2915ceb (src/controller/intentController.ts)
- expected finding missing from current scan: 4500e4510b7a7d554218f8eedbd80850 (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: 8fe7fe129236a63dbd4b6396d64095e5 (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: 9ef772e2211454c055d7dfb76970d334 (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: 7f9eafaf86f052e1ea15e32b5e395eb1 (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: d9244d7a6c863395e13063a98c0006a1 (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: f70ddcdff97a9c195874e28a5caffb70 (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: 65091efc930269d3532efef4dd2c1ee8 (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: 2fd1b37c0f88d35da7e88cbe478f783c (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: 987535f9fa42320940cfbad9cf7df3af (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: d8c2f57104bc8e4f92a22ce394cb2273 (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: 3388ea60fb76122bbe9aff704854a09c (src/controller/lifecycleActionsController.ts)
- findings expected 198, received 165
- files expected 22, received 21
```

### Stage 3：lifecycle extraction 2

Stage 2 結束時 ad-hoc 恰 2（`230:49`、`230:80`）；轉為 optional function properties 後恰 0。selector 上線後 lint 綠；暫退兩筆再次精確得到：

```text
230:49 api.acceptSessionParticipant
230:80 api.declineSessionParticipant
✖ 2 problems (2 errors, 0 warnings)
```

還原後 lint／ad-hoc 均綠，lifecycle 最終 SHA-256 精確回到：

```text
d0cb33f31b7b3bbcb45a5eb629b4220876301e93227a2b9d36bb4db16778c4fb
```

最終 `apiAction` 只因 Prettier 預期展開而位移至 `:233`，原文零 diff：

```ts
const apiAction = decision === "accepted" ? api.acceptSessionParticipant : api.declineSessionParticipant;
```

## 3. 逐 stableId 三點對點（35）

「紅簽章」欄的 `same ID` 表示最終 generator 缺失列逐字使用該列完整 stableId。

### E-9 lifecycle ports 11

| stableId | member／最終宣告行 | canary 命中 | 紅簽章 |
| --- | --- | --- | --- |
| `4500e4510b7a7d554218f8eedbd80850` | `beginLifecycleAction:61-65` | `108:3` | same ID |
| `8fe7fe129236a63dbd4b6396d64095e5` | `toast:79` | `119:3` | same ID |
| `9ef772e2211454c055d7dfb76970d334` | `transitionSurfaces:80` | `120:3` | same ID |
| `7f9eafaf86f052e1ea15e32b5e395eb1` | `captureAuthSnapshot:66` | `109:3` | same ID |
| `d9244d7a6c863395e13063a98c0006a1` | `finishLifecycleAction:67` | `110:3` | same ID |
| `f70ddcdff97a9c195874e28a5caffb70` | `isCurrentAuthSnapshot:68` | `111:3` | same ID |
| `65091efc930269d3532efef4dd2c1ee8` | `openDecideSession:69-72` | `112:3` | same ID |
| `2fd1b37c0f88d35da7e88cbe478f783c` | `openEditSession:73` | `113:3` | same ID |
| `987535f9fa42320940cfbad9cf7df3af` | `openWithdrawConfirmation:74` | `114:3` | same ID |
| `d8c2f57104bc8e4f92a22ce394cb2273` | `refreshAuthoritativeState:75` | `115:3` | same ID |
| `3388ea60fb76122bbe9aff704854a09c` | `sessionKey:76` | `116:3` | same ID |

### E-10 intent ports 22

| stableId | member／宣告行 | canary 命中 | 紅簽章 |
| --- | --- | --- | --- |
| `68bcd45f1b8e292a01d2f84abdd70dfd` | `actionFor:48` | `124:3` | same ID |
| `b06b01d28df408f45ac0ea8d971ba600` | `lifecycleActionIsInFlight:62` | `134:3` | same ID |
| `30b027aa7733f7874e59e89a8d788e37` | `loadDiscovery:63` | `135:3` | same ID |
| `07150d83c1fe92aa4dec1d8cfa8330ce` | `loadPlayerDirectoryList:64` | `136:3` | same ID |
| `89342c0a3f1aba92fa9e80b3bdb3c5f3` | `loadPlayers:65` | `137:3` | same ID |
| `3e3a3b206c2d1ec8eddc5c96c3961773` | `openCreateSession:67-73` | `139:3` | same ID |
| `066583902dbea6b6fde181d82519c0c0` | `openLogin:74` | `140:3` | same ID |
| `156f8c70ce523cc2a226cb7584d56694` | `openSessionChat:75` | `141:3` | same ID |
| `d5945f03c02fcea2096b28a92e8375dc` | `openSessionDetail:76` | `142:3` | same ID |
| `0bbe3ff81b107341aaa0d90711f85e3b` | `profilePrompt:77-83` | `143:3` | same ID |
| `2e8dcfe212bbfb4ca691efd0b7adebb9` | `beginLifecycleAction:50-54` | `126:3` | same ID |
| `2b63304478171c40b719ae12ab2eff56` | `publish:84` | `144:3` | same ID |
| `d41ddf19c5fb8d1ff4fe72867238998a` | `refreshLocationViewport:85` | `145:3` | same ID |
| `61a99f774bb9f06677e1e1382a097054` | `reloadParticipation:86` | `146:3` | same ID |
| `32a61647bb76353596f6563b982a801d` | `showCreatedSession:87` | `147:3` | same ID |
| `b9e9cf08367840cec2ff89cc875f02fc` | `toast:90` | `150:3` | same ID |
| `c0964e8de068514795efbdb20941a4d2` | `captureAuthSnapshot:55` | `127:3` | same ID |
| `879f40b82f4b20752b2511df708bf6f1` | `clearPlayerLayer:56` | `128:3` | same ID |
| `36eaa31dd823cc56eaf83ad6321f8483` | `commitPlayerVisibility:57` | `129:3` | same ID |
| `4691d544841fbd7af7e4c3568c0881d7` | `currentParticipation:58` | `130:3` | same ID |
| `b4065b3b6f1ac3e9a0ec77e4be8e9f4e` | `finishLifecycleAction:59` | `131:3` | same ID |
| `487726c7ea17870ba5b74809a2915ceb` | `isCurrentAuthSnapshot:61` | `133:3` | same ID |

### E-11 lifecycle extraction 2

| stableId | member／最終宣告行 | canary 命中 | 紅簽章 |
| --- | --- | --- | --- |
| `935b4a871e023b6e95762ff458fe80a2` | `acceptSessionParticipant:26` | `230:49` | same ID |
| `a3efe94c1bb08d148764c4f2c3783ce7` | `declineSessionParticipant:34-37` | `230:80` | same ID |

## 4. 最終 generator 紅簽章（恰 37 條）

```text
- expected finding missing from current scan: 68bcd45f1b8e292a01d2f84abdd70dfd (src/controller/intentController.ts)
- expected finding missing from current scan: b06b01d28df408f45ac0ea8d971ba600 (src/controller/intentController.ts)
- expected finding missing from current scan: 30b027aa7733f7874e59e89a8d788e37 (src/controller/intentController.ts)
- expected finding missing from current scan: 07150d83c1fe92aa4dec1d8cfa8330ce (src/controller/intentController.ts)
- expected finding missing from current scan: 89342c0a3f1aba92fa9e80b3bdb3c5f3 (src/controller/intentController.ts)
- expected finding missing from current scan: 3e3a3b206c2d1ec8eddc5c96c3961773 (src/controller/intentController.ts)
- expected finding missing from current scan: 066583902dbea6b6fde181d82519c0c0 (src/controller/intentController.ts)
- expected finding missing from current scan: 156f8c70ce523cc2a226cb7584d56694 (src/controller/intentController.ts)
- expected finding missing from current scan: d5945f03c02fcea2096b28a92e8375dc (src/controller/intentController.ts)
- expected finding missing from current scan: 0bbe3ff81b107341aaa0d90711f85e3b (src/controller/intentController.ts)
- expected finding missing from current scan: 2e8dcfe212bbfb4ca691efd0b7adebb9 (src/controller/intentController.ts)
- expected finding missing from current scan: 2b63304478171c40b719ae12ab2eff56 (src/controller/intentController.ts)
- expected finding missing from current scan: d41ddf19c5fb8d1ff4fe72867238998a (src/controller/intentController.ts)
- expected finding missing from current scan: 61a99f774bb9f06677e1e1382a097054 (src/controller/intentController.ts)
- expected finding missing from current scan: 32a61647bb76353596f6563b982a801d (src/controller/intentController.ts)
- expected finding missing from current scan: b9e9cf08367840cec2ff89cc875f02fc (src/controller/intentController.ts)
- expected finding missing from current scan: c0964e8de068514795efbdb20941a4d2 (src/controller/intentController.ts)
- expected finding missing from current scan: 879f40b82f4b20752b2511df708bf6f1 (src/controller/intentController.ts)
- expected finding missing from current scan: 36eaa31dd823cc56eaf83ad6321f8483 (src/controller/intentController.ts)
- expected finding missing from current scan: 4691d544841fbd7af7e4c3568c0881d7 (src/controller/intentController.ts)
- expected finding missing from current scan: b4065b3b6f1ac3e9a0ec77e4be8e9f4e (src/controller/intentController.ts)
- expected finding missing from current scan: 487726c7ea17870ba5b74809a2915ceb (src/controller/intentController.ts)
- expected finding missing from current scan: 935b4a871e023b6e95762ff458fe80a2 (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: a3efe94c1bb08d148764c4f2c3783ce7 (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: 4500e4510b7a7d554218f8eedbd80850 (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: 8fe7fe129236a63dbd4b6396d64095e5 (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: 9ef772e2211454c055d7dfb76970d334 (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: 7f9eafaf86f052e1ea15e32b5e395eb1 (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: d9244d7a6c863395e13063a98c0006a1 (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: f70ddcdff97a9c195874e28a5caffb70 (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: 65091efc930269d3532efef4dd2c1ee8 (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: 2fd1b37c0f88d35da7e88cbe478f783c (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: 987535f9fa42320940cfbad9cf7df3af (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: d8c2f57104bc8e4f92a22ce394cb2273 (src/controller/lifecycleActionsController.ts)
- expected finding missing from current scan: 3388ea60fb76122bbe9aff704854a09c (src/controller/lifecycleActionsController.ts)
- findings expected 198, received 163
- files expected 22, received 20
```

沒有 unexpected、duplicate、unresolved、sessionController 或其他 scope-gate 條目。

## 5. 餘檔 byteEqual、erased-token 與 runtime receiver

按派工指定區間切除後：

```text
REST src/controller/intentController.ts HEAD bytes=20209 sha256=f7e6c9fec539fe84b9633a4adf6633d89a4833bfd699de8532af5bcf6f0946d6
REST src/controller/intentController.ts current bytes=20209 sha256=f7e6c9fec539fe84b9633a4adf6633d89a4833bfd699de8532af5bcf6f0946d6
REST src/controller/intentController.ts byteEqual=true
REST src/controller/lifecycleActionsController.ts HEAD bytes=15509 sha256=0bd1986ead5414d70c5986a073b647a5db5f088cc5b5e8186db6f2a5316831ad
REST src/controller/lifecycleActionsController.ts current bytes=15509 sha256=0bd1986ead5414d70c5986a073b647a5db5f088cc5b5e8186db6f2a5316831ad
REST src/controller/lifecycleActionsController.ts byteEqual=true
```

intent 切除 HEAD/current `:47-91`；lifecycle 切除 HEAD `:25-40`＋`:56-78`、current `:25-43`＋`:59-81`。`git diff -U0` 的 lifecycle 全部 hunk 也只落在這兩區。

同一 `esbuild.transform` 記憶體流程，loader `ts`、format `esm`、target `esnext`、`minifyWhitespace: true`、`treeShaking: false`：

```text
ERASED src/controller/intentController.ts HEAD bytes=14309 sha256=d5d7c2467012d90ce14bcc6cac929a07223077362b04cd0c9a954184d974b5a9
ERASED src/controller/intentController.ts current bytes=14309 sha256=d5d7c2467012d90ce14bcc6cac929a07223077362b04cd0c9a954184d974b5a9
ERASED src/controller/intentController.ts byteEqual=true
ERASED src/controller/lifecycleActionsController.ts HEAD bytes=11629 sha256=dd622aea02d147226db38ea0a134a0735ebcacb605162be4f40a5b5bdc0b5a48
ERASED src/controller/lifecycleActionsController.ts current bytes=11629 sha256=dd622aea02d147226db38ea0a134a0735ebcacb605162be4f40a5b5bdc0b5a48
ERASED src/controller/lifecycleActionsController.ts byteEqual=true
```

receiver 鏈重驗：

```text
src/data/repositories/dataRepository.ts:179-182
return ((...args: unknown[]) => loadPrivateDataApi().then((api) => {
  const method = api[name] as (...values: unknown[]) => unknown;
  return method(...args);
})) as PrivateDataApi[Name];

src/data/repositories/privateDataRepository.ts:485
async function acceptSessionParticipant(sessionId: unknown, participantId: unknown) {

src/data/repositories/privateDataRepository.ts:493
async function declineSessionParticipant(sessionId: unknown, participantId: unknown) {
```

兩個具名 async closure 的函式本體均無 `this`；`dataApi.ts` 亦以 forwarding arrow 呼叫。故 E-11 只修 contract 形狀，不改 receiver 或 runtime 行為。

## 6. selector 與 frozen 檔案

`npx eslint --print-config` 的 rule 值：

```text
src/controller/intentController.ts              [2]
src/controller/lifecycleActionsController.ts    [2]
src/sessionController.ts                        [0]
src/sheets.ts                                   [0]
```

config diff 只在既有 scoped `files` 陣列依字典序新增兩個精確 path，沒有 glob。`sessionController.ts`、`sheets.ts` 均零 diff；兩個 factory construction 與 indexed-access 傳播面均零 diff，`npm run typecheck` 通過。

凍結 artifact SHA 保持開工值：

```text
ce6808be54a596f0c4d0d92b2a23bda170764d6d623ba1b0e20e1dac500852ae  scripts/generate-eslint-unbound-manifest.mjs
14e56a1675ccf4939f2e0bc3e2685070b325a32a75ef778ea1ffa45b018fd207  docs/arch-eslint-phaseE-baseline.json
14811d17c7fa042406a51cab0aa15c942aa3930f116402e656969a17410a4548  docs/arch-eslint-phaseE-removal-ledger.json
7f9833e5ca436501cccf49ebcabc05fd77af85f971a229c1174bb4421c797144  docs/arch-eslint-phaseE-unbound-manifest.json
14271e190f2bc3e18443d3b783cd2e865f3dea98065b9867d8437573f1eccd78  docs/arch-eslint-phaseE-unbound-manifest.md
```

未新增 `any`、`@ts-ignore`、inline disable、wrapper、`.bind()` 或 runtime arrow。

## 7. 收尾標準矩陣

| 指令／證據 | 實際結果 |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit`；exit 0 |
| `npm run lint` | 無 findings；exit 0 |
| `npm run prettier:check` | `All matched files use Prettier code style!`；exit 0 |
| `npm run test:session-unit` | tests 346；pass 346；fail 0；exit 0 |
| `npm run test:mock` | 298 passed；4 skipped；exit 0 |
| `npm run test:local` API | tests 2；pass 2；fail 0 |
| `npm run test:local` browser | 45 passed；11 skipped；exit 0 |
| `npm run build` | 508 modules transformed；exit 0 |
| `npm run check:production-bundle` | main `638937/187466`；total JS `841561/257627`；exit 0 |
| bundle 對照 | main gzip `187466 − 187466 = 0 B`；total gzip `257627 − 257627 = 0 B` |
| selector | intent `[2]`；lifecycle `[2]`；sessionController `[0]`；sheets `[0]` |
| generator 交件 | 預期 exit 1；恰 37 條紅簽章 |
| 餘檔 byteEqual | intent、lifecycle 均 true |
| erased-token | intent、lifecycle 均 true |
| `git diff --check` | 無輸出；exit 0 |

`test:local` 首跑即綠，未執行 DB count/reset。unit/mock 的既有非致命 `WebSocket server error: Port 24678 is already in use` 不影響最終 exit 0。build 只有既有 chunk-size warning。

production bundle 成功行逐字：

```text
production bundle check passed: development E2E hook present, production E2E hook absent; 32 files, 12 demo identifiers absent; main 638937/187466 within 658867/192420; largest app lazy MySessionsPage-Byp_C9FO.js 16476/4828 within 18000/5500; total JS 841561/257627 within 849961/259062; private repository: privateDataRepository-CfJqlfj0.js; Sentry: sentryBrowserSdk-Czz5dmkg.js
```

tracked diff stat（回報檔不納入 tracked diff）：

```text
 eslint.config.js                             |  2 ++
 src/controller/intentController.ts           | 50 ++++++++++++++--------------
 src/controller/lifecycleActionsController.ts | 33 +++++++++---------
 3 files changed, 45 insertions(+), 40 deletions(-)
```

全庫 porcelain 恰四條：

```text
 M eslint.config.js
 M src/controller/intentController.ts
 M src/controller/lifecycleActionsController.ts
?? docs/arch-dispatch-2026-08-28-eslintE9-E11-controller-ports-finale-report-codex.md
```

## 8. Codex 五問

### 1. 如何證明只改外層 port，nested handlers 與同名 result contracts 未被誤改？

兩檔的 `git diff -U0` 只出現在指定 interface；nested `onClose`／`onSubmit`／`onViewMySessions`／`onConfirm` 的 method token 原文保留。切除解凍 interface 後，兩檔其餘 bytes 與 HEAD 完全一致；`sessionController.ts` 零 diff，因此 exported result interfaces 對應的 23 個 factory-result findings 未被誤清。

### 2. 如何證明 E-11 extraction 不會改變 receiver 行為？

runtime `apiAction` 原文不動。construction 最終由 `bindPrivateMethod` 回傳 arrow，private repository 的 accept/decline 是具名 async closure，兩個本體均不讀 `this`；現行鏈本來也以 `method(...args)` 無 receiver 呼叫。erased-token 全等再證明產出 JavaScript 沒有任何改變。

### 3. 如何證明 selector 精確上線、沒有外溢？

config 只新增兩個完整檔案 path。真實 `--print-config` 顯示兩個目標為 `[2]`，尚有 63 筆的 `sessionController.ts` 與抽樣 `sheets.ts` 仍為 `[0]`；沒有新增 glob、例外或全域 rule 變更。

### 4. 為何 generator 紅是正確交件，而不是失敗？

baseline／ledger／manifest 仍停在 E-8 ACCEPTED 的 198/22/63；working scan 已因本批降到 163/20/63。35 個 missing IDs 加兩個 aggregate 正好 37 條，是等待驗收方記帳與重生 manifest 的防偽簽章；本階段自行重生反而會違反派工。

### 5. factory results 63 依方案 A 切三批的具體分組建議

建議採派工示例的 `36／23／4`，原因是每個 declaration owner 僅出現在一批，並讓最後一批原子清掉 `sessionController.ts`：

| 批次 | declaration owners | sessionController result destructure | 筆數 | 以前一批 ACCEPTED baseline 計算的紅簽章 |
| --- | --- | --- | ---: | --- |
| FR-A | `mySessionsController.ts` 15＋`playerDirectoryController.ts` 8＋`discoveryMapController.ts` 13 | `:314-328`、`:353-360`、`:379-391` | 36 | missing 36＋`findings 163→127`＝37 條；files 仍 20 |
| FR-B | `intentController.ts` 12＋`lifecycleActionsController.ts` 11 | `:424-435`、`:455-465` | 23 | missing 23＋`findings 127→104`＝24 條；files 仍 20 |
| FR-C | `authController.ts` 3＋`chatController.ts` 1 | `:468`、`:613` | 4 | missing 4＋`findings 104→100`＋`files 20→19`＝6 條 |

七組具體 result members：

```text
mySessionsController 15 @ sessionController:314-328
actionFor, beginLifecycleAction, captureAuthSnapshot, currentParticipation,
finishLifecycleAction, isCurrentAuthSnapshot, lifecycleActionIsInFlight,
mySessionGroups, notifyMySessions, refreshMyPlayerBlocks, refreshMySessions,
reloadParticipation, replaceMySessions, sessionKey, unblockPlayer

playerDirectoryController 8 @ sessionController:353-360
clearPlayerDirectory, clearPlayerLayer, getPlayerGroups:playerGroups,
loadPlayerDirectoryList, loadPlayers, openCourt, openPlayerCourt,
openPlayerDirectory

discoveryMapController 13 @ sessionController:379-391
attachMap, expandBounds, getVisibleSessions:visibleSessions, loadDiscovery,
publish, refreshLocationViewport, resetFilters, retryDiscovery, setCourts,
setDrawerState, setFilter, setMapUnavailable, startDiscoveryPolling

intentController 12 @ sessionController:424-435
capturePendingIntentVersion, clearIntent, clearPendingIntentIfUnchanged,
isReconcileSuppressed:reconcileSuppressed, openCreateIntent,
refreshAuthoritativeState, requestCurrentLocation, requestJoin,
requireSessionAction, resumePendingIntent, startPrimaryAction, togglePlayerLayer

lifecycleActionsController 11 @ sessionController:455-465
cancelMySession, confirmMySessionAttendance, markMySessionPlayed,
mySessionForAction, openSessionDecision, openSessionEdit,
requireMySessionAction, respondInvite, reviewMySessionParticipant, withdraw,
withdrawMySession

authController 3 @ sessionController:468
setAuthSession, setAuthState, setProfile

chatController 1 @ sessionController:613
openSessionChat
```

同批多 declaration 檔的 byteEqual 組織方式：每個 owner 檔各自定義「切除 result interface／inline return type」的 HEAD/current 區間，逐檔回報 bytes、SHA、`byteEqual=true`；另對 `sessionController.ts` 固定回報 source zero-diff，並用 stableId→owner/member→destructure line 的 cross-table 防止跨檔錯配。每批再對所有 owner 檔各做 erased-token 全等及逐檔暫退 canary。

`sessionController.ts` 的 selector 必須等 FR-C 四筆清零後才上線；FR-A/FR-B 只能用 ad-hoc override 驗證，不能提前加 selector。另需注意 auth 是 inferred return object、chat 是 inline explicit return type，不能假設七組全都是同一種 named exported interface，派工前應先用 TypeScript AST 固定各 owner 的精確 declaration node。

## 9. 未做／疑義／BLOCKED

- 未做：依合約未 commit、未 push；未改 ledger、baseline、manifest、generator；未執行驗收方 acceptance／重生流程。
- 疑義：本批無疑義。FR-C 後續派工需特別處理 auth inferred return 與 chat inline return type 的 declaration 形狀差異。
- BLOCKED：否。
