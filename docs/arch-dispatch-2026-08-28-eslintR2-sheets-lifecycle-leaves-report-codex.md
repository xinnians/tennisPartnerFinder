# ESLint 恢復 Phase R2-A/B/C sheets＋lifecycle＋leaves 聯合回報（Codex）

- 日期：2026-08-28
- 開工 HEAD：`d923cdc`；R1 ACCEPTED 基準：`82dfe55`
- 結論：R2-A 42＋R2-B 19＋R2-C 2，共 63 個 findings 已清零；14 個 finding files 的精確 selector 已分兩波上線，最終 scoped 陣列為 28 檔。
- 交件狀態：generator 依合約維持紅；baseline／ledger／manifest／generator 均未修改；未 commit、未 push。
- Variance 偏差清單：**零偏差**。未加 annotation、`any`、`@ts-ignore`、inline disable、wrapper、`.bind()` 或新 arrow。

## 1. 十四個編輯檔的修改後宣告防偽原文

以下逐字列出所有解凍 declaration 區域，並保留派工單指定的相鄰凍結成員。

### `src/sheets/CreateSessionSheet.tsx`

```ts
interface CreateSessionContentOptions {
  bumpTime: (time: string | null, deltaMinutes: number) => string;
  canPublish: (form: CreateSessionFormState) => boolean;
  clock: (value: Date) => string;
  config: CreateSessionSheetConfig;
  courts: CreateCourt[];
  courtsReady: boolean;
  dateValueNow: (value: Date) => string;
  donePresentation: (
    value: CreateSessionValidatedValue,
    result: CreateSessionResult | null | undefined,
    courts: CreateCourt[]
  ) => CreateDonePresentation;
  fixedStartAt: (form: CreateSessionFormState, now: Date) => string;
  candidateWindow: (form: CreateSessionFormState, now: Date) => CandidateWindow;
  initialForm: CreateSessionFormState;
  now: () => Date;
  onBackToMap: () => void;
  onClose: () => void;
  onSubmit: (form: CreateSessionFormState, nodes: CreateSessionActionNodes) => void | Promise<void>;
  onViewMySessions: (sessionId: number | null) => void;
  toast: (message: string) => void;
}

export interface CreateSessionContentContract {
  setCourts(courts: CreateCourt[], options?: { ready?: boolean }): void;
  showDone(value: CreateSessionValidatedValue, result?: CreateSessionResult | null): void;
}

interface CreateSessionSheetProps extends CreateSessionContentOptions {
  contentRef: React.Ref<CreateSessionContentContract>;
}
```

```ts
function CourtCell({
  court,
  role,
  selected,
  onClick,
}: {
  court: CreateCourt;
  role: "court" | "cand-court";
  selected: boolean;
  onClick: () => void;
}) {
```

### `src/sheets/DecideSessionSheet.tsx`

```ts
export interface DecideSessionContentContract {
  setCourts(courts: DecideSessionCourt[], options?: { ready?: boolean }): void;
}

interface DecideSessionContentOptions {
  candidateIds: Set<string>;
  onClose: () => void;
  onDecide: (event: React.MouseEvent<HTMLButtonElement>) => void;
  rangeEndLocal: string;
  startAtLocal: string;
  unavailable: boolean;
}
```

### `src/sheets/EditSessionSheet.tsx`

```ts
interface EditSessionContentOptions {
  courts: EditCourt[];
  courtsReady: boolean;
  hasOptionalValues: boolean;
  ntrpExplanation: string;
  onClose: () => void;
  onSubmit: (nodes: EditSessionActionNodes) => void | Promise<void>;
  playTypeHint: string;
  playTypes: string[];
  session: EditableSession;
  startAtLocal: string;
}

export interface EditSessionContentContract {
  setCourts(courts: EditCourt[], options?: { ready?: boolean }): void;
}
```

### `src/sheets/FilterSheet.tsx`

```ts
interface FilterSheetContentOptions {
  filters?: FilterSheetFiltersInput | null;
  onClose: () => void;
  onReset: () => void;
  onSetFilter: (field: FilterField, value: FilterValue) => void;
  resultCount?: unknown;
}

export interface FilterSheetContentContract {
  setFilters(filters?: FilterSheetFiltersInput | null): void;
  setResultCount(count: unknown): void;
}
```

```ts
interface FilterControlsProps {
  filters: FilterSheetFilters;
  onSelect: (field: FilterField, value: string) => void;
}
```

```ts
interface FilterFooterProps {
  onApply: () => void;
  onReset: () => void;
  resultCount: string;
}
```

### `src/sheets/PlayerCardSheet.tsx`

```ts
export interface PlayerCardSheetContentContract {
  setInvitableSessions(sessions?: InvitableSession[] | null): void;
}

interface PlayerCardSheetContentOptions {
  courts: PlayerCardCourt[];
  myInvitableSessions: InvitableSession[];
  onClose: () => void;
  onCreate: () => void;
  onInvite: (sessionId: string) => Promise<unknown>;
  onSeeDirectory: () => void;
  player: CardPlayer;
  /** mountSheet's `#sheet-root`; the pending guard checks containment there. */
  sheetRoot: HTMLElement;
}
```

```ts
function InviteEmpty({ onCreate }: { onCreate: () => void }) {
```

```ts
function InviteOptions({
  courts,
  generation,
  onCreate,
  sessions,
}: {
  courts: PlayerCardCourt[];
  generation: number;
  onCreate: () => void;
  sessions: InvitableSession[];
}) {
```

### `src/sheets/PlayerDirectorySheet.tsx`

```ts
export interface PlayerDirectorySheetContentContract {
  setDirectory(next?: PlayerDirectorySheetInput | null): void;
}

interface PlayerDirectorySheetContentOptions {
  onClose: () => void;
  onOpenPlayer: (player: DirectoryPlayer) => void;
  onRetry: () => void;
}
```

```ts
function DirectoryRow({ onOpenPlayer, player }: { onOpenPlayer: (id: string) => void; player: DirectoryPlayer }) {
```

```ts
function DirectoryBody({
  onOpenPlayer,
  onRetry,
  state,
}: {
  onOpenPlayer: (id: string) => void;
  onRetry: () => void;
  state: PlayerDirectoryState | null;
}) {
```

### `src/sheets/ProfileCompletionSheet.tsx`

```ts
export interface ProfileCompletionContentContract {
  setCourts(courts: ProfileCompletionCourt[], options?: { ready?: boolean }): void;
}

interface ProfileCompletionContentOptions {
  avatarUrl: string;
  compactCreateGate: boolean;
  courts: ProfileCompletionCourt[];
  courtsReady: boolean;
  disclosure: string;
  gateHintText: string;
  initialSelectedCourts: Set<string>;
  nickname: string;
  ntrpDefaultValue: string;
  ntrpExplanation: string;
  onClose: () => void;
  onSubmit: (nodes: ProfileCompletionActionNodes) => void | Promise<void>;
  playTypes: string[];
  returnContextText: string;
  selectedSlots: Set<string>;
  selectedTypes: Set<string>;
  showNicknameField: boolean;
  showNtrpField: boolean;
  slotOptions: Array<[string, string]>;
  standalone: boolean;
}
```

### `src/sheets/ReportDialog.tsx`

```ts
interface ReportDialogContentOptions {
  onClose: () => void;
  targetLabel: string;
}
```

### `src/sheets/SessionChatSheet.tsx`

```ts
export interface SessionChatContentContract {
  setArchived(): void;
  setContent(roster: readonly SessionRosterEntry[], messages: readonly ChatMessage[]): void;
}

interface SessionChatContentOptions {
  archived: boolean;
  canWithdraw: boolean;
  headerSub: string;
  onClose: () => void;
  onFeedClick: (event: React.MouseEvent<HTMLElement>) => void;
  playType: string;
  venueBadge: string;
  venueCourt: string;
  venueTime: string;
}
```

### `src/sheets/WithdrawSessionConfirmationDialog.tsx`

```ts
interface WithdrawSessionConfirmationContentOptions {
  onClose: () => void;
}
```

### `src/app/SurfaceHost.tsx`

```ts
export interface SurfaceContentLifecycle {
  isSurfaceRootLive: () => boolean;
  unmount: () => void;
}

interface SurfaceContentHandle extends SurfaceContentLifecycle {
  commit(update: () => void): void;
  render(children: ReactNode): void;
}

interface SurfaceContentTestHooks {
  surfaceContentLifecycle?: {
    onUnmount?(surfaceId: string): void;
  };
}
```

### `src/surfaceContracts.ts`

```ts
export interface LoginModalContentOptions {
  action: string;
  lineProviderId: string;
  onClose(): void;
  onProvider?: (provider: string) => unknown;
}

export interface LoginModalContentHandle {
  unmount: () => void;
}
```

### `src/mySessionsCreatedFocus.ts`

```ts
interface MySessionsCreatedFocusOptions {
  createdSessionId: ControllerIdentifier;
  groups: ControllerMySessionGroups;
  highlightSessionId: ControllerIdentifier;
  onCreatedSessionFocus: (sessionId?: ControllerIdentifier) => boolean;
  rootElement: HTMLElement;
}
```

### `src/data/repositories/privateDataRepository.ts`

```ts
export interface PrivateDataRepositoryOptions {
  client: SupabaseClient<RepositoryDatabase> | null;
  configured: boolean;
  loadCourts: (city?: string) => Promise<DataCourt[]>;
  mockPlayerPresence: MockRow[];
  mockPlayers: MockRow[];
  mockSessionJoinPreviews: MockRow[];
}
```

## 2. 三階段 canary 與 generator 快照

開工 ad-hoc canary，逐檔精確 line:column：

```text
privateDataRepository.ts: 130:3                                                         (1)
mySessionsCreatedFocus.ts: 15:3                                                        (1)
sheets.ts: 185:27                                                                      (1)
CreateSessionSheet.tsx: 135:3 159:3 160:3 161:3 162:3 167:3 168:3 169:3 171:3 172:3
  173:3 174:3 175:3 176:3 814:24 821:14                                               (16)
DecideSessionSheet.tsx: 43:3 44:3 161:24 165:14                                        (4)
EditSessionSheet.tsx: 62:3 63:3 308:24 312:14                                          (4)
FilterSheet.tsx: 76:64 175:25 175:34 191:3 192:3 193:3 290:24 297:14                   (8)
PlayerCardSheet.tsx: 54:24 74:3 122:3 123:3 124:3 125:3 304:24 308:14                  (8)
PlayerDirectorySheet.tsx: 46:25 78:3 79:3 118:45 118:54 118:68 214:24 218:14           (8)
ProfileCompletionSheet.tsx: 63:3 64:3 280:24 284:14                                    (4)
ReportDialog.tsx: 18:25                                                                 (1)
SessionChatSheet.tsx: 57:3 58:3 282:24 289:14                                          (4)
SessionDetailSheet.tsx: 829:24 833:14                                                   (2)
WithdrawSessionConfirmationDialog.tsx: 15:46                                           (1)
```

R2-A 後 canary（合計 21）逐字：

```text
privateDataRepository.ts: 130:3                                                         (1)
mySessionsCreatedFocus.ts: 15:3                                                        (1)
sheets.ts: 185:27                                                                      (1)
CreateSessionSheet.tsx: 814:24 821:14                                                   (2)
DecideSessionSheet.tsx: 161:24 165:14                                                   (2)
EditSessionSheet.tsx: 308:24 312:14                                                     (2)
FilterSheet.tsx: 290:24 297:14                                                         (2)
PlayerCardSheet.tsx: 304:24 308:14                                                     (2)
PlayerDirectorySheet.tsx: 214:24 218:14                                                (2)
ProfileCompletionSheet.tsx: 280:24 284:14                                              (2)
ReportDialog.tsx: (0)
SessionChatSheet.tsx: 282:24 289:14                                                    (2)
SessionDetailSheet.tsx: 829:24 833:14                                                  (2)
WithdrawSessionConfirmationDialog.tsx: (0)
```

R2-A generator 恰 44 條，逐字：

```text
- expected finding missing from current scan: 200f349b4e570e4adccb340e0a90a7ab (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 04dc8a6870066a646fc7d8663242ba3d (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 8c97905c80d36502961d14fe027ba3f0 (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 415a369b5ecd070f88439eddbe770523 (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 525f937b582e25ebf9ddb814bf249fe6 (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 8a5f0fb1159d9943c42d46e6e51bad08 (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: c6b9d71f2dd8e59879fa5da596b2e184 (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: beb997a1cddd47ad44b042f2c5b3c799 (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: b87d1853e9e0c6830df72ad4c34ab59e (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 4c26b0b84a45fe139453a8f655742f3f (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 0688cf300c9d8f8a8232a04a24cc793b (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 5386d58d61fdc3c8d3f5bc54fa3979fa (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 1c74fb93107761f8617c669bac819d51 (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: b0694650f6b31aa338206b71cb4e8d70 (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 9417a763aadfc8dd794466d6ff0d8bed (src/sheets/DecideSessionSheet.tsx)
- expected finding missing from current scan: e090a8dd82915494b249493088e0c59b (src/sheets/DecideSessionSheet.tsx)
- expected finding missing from current scan: a97217995e823aa0732a2b37f7bc02c0 (src/sheets/EditSessionSheet.tsx)
- expected finding missing from current scan: 1bde8e1cbc776c2214d96bb03757f2f8 (src/sheets/EditSessionSheet.tsx)
- expected finding missing from current scan: caa8a657802a9333d743230740b18d4c (src/sheets/FilterSheet.tsx)
- expected finding missing from current scan: 919c2f96dd705cc7ad2ed1c251078db8 (src/sheets/FilterSheet.tsx)
- expected finding missing from current scan: 2b1c0a44c7890d1ab70b4ce63dba1d8a (src/sheets/FilterSheet.tsx)
- expected finding missing from current scan: d52ac0426a66ee169f7593360ea016b8 (src/sheets/FilterSheet.tsx)
- expected finding missing from current scan: dd852ee90a5157c825f343464e163b46 (src/sheets/FilterSheet.tsx)
- expected finding missing from current scan: aa098d97b2bf305f789849582c890c64 (src/sheets/FilterSheet.tsx)
- expected finding missing from current scan: 991e1e6df11e4d2292b4a9f30f0bcf80 (src/sheets/PlayerCardSheet.tsx)
- expected finding missing from current scan: 315a888dcf5c517826561cac9aea4f64 (src/sheets/PlayerCardSheet.tsx)
- expected finding missing from current scan: 87d756e883583ba01881ddedce659ad6 (src/sheets/PlayerCardSheet.tsx)
- expected finding missing from current scan: f24f03de7fea006e9a32cafac04575e3 (src/sheets/PlayerCardSheet.tsx)
- expected finding missing from current scan: 3c8f4fe2fb6e763bee014f5dc3a34429 (src/sheets/PlayerCardSheet.tsx)
- expected finding missing from current scan: 4bcbb6fc35fea0983a223270169867b1 (src/sheets/PlayerCardSheet.tsx)
- expected finding missing from current scan: 3408a866440355b4ab5d553313db8514 (src/sheets/PlayerDirectorySheet.tsx)
- expected finding missing from current scan: ba2ad29dc28898c425a60c55c2249280 (src/sheets/PlayerDirectorySheet.tsx)
- expected finding missing from current scan: 44854b42f28388fa807a2717902949c4 (src/sheets/PlayerDirectorySheet.tsx)
- expected finding missing from current scan: c3ee8f7038864d384ae60a94bd482afc (src/sheets/PlayerDirectorySheet.tsx)
- expected finding missing from current scan: 91adaaf936310cbfc9bb0deab0cbcac8 (src/sheets/PlayerDirectorySheet.tsx)
- expected finding missing from current scan: 07321bff177401d4adf795a7190977ef (src/sheets/PlayerDirectorySheet.tsx)
- expected finding missing from current scan: 2fe966c7dc46a31b2eac7ff82c9dce25 (src/sheets/ProfileCompletionSheet.tsx)
- expected finding missing from current scan: 3689826b800ed557fce7e761bc62eee9 (src/sheets/ProfileCompletionSheet.tsx)
- expected finding missing from current scan: ea38afa10ae1ff7c06d3a59e4f43f92c (src/sheets/ReportDialog.tsx)
- expected finding missing from current scan: 91849872dbf74bf5e0683c9772f21c5e (src/sheets/SessionChatSheet.tsx)
- expected finding missing from current scan: af95504f6fc12b4d12f7eba3feee7c2e (src/sheets/SessionChatSheet.tsx)
- expected finding missing from current scan: f4aad88b7fc3c5938232d8d56163657c (src/sheets/WithdrawSessionConfirmationDialog.tsx)
- findings expected 63, received 21
- files expected 14, received 12
```

R2-B 後 canary 逐字：

```text
privateDataRepository.ts: 130:3 (1)
mySessionsCreatedFocus.ts: 15:3 (1)
其餘十二個 opening finding files: (0)
```

R2-B generator 恰 63 條，逐字：

```text
- expected finding missing from current scan: de0fd8fa7e2a7ba061b2eeea15e7e72b (src/sheets.ts)
- expected finding missing from current scan: 200f349b4e570e4adccb340e0a90a7ab (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 04dc8a6870066a646fc7d8663242ba3d (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 8c97905c80d36502961d14fe027ba3f0 (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 415a369b5ecd070f88439eddbe770523 (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 525f937b582e25ebf9ddb814bf249fe6 (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 8a5f0fb1159d9943c42d46e6e51bad08 (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: c6b9d71f2dd8e59879fa5da596b2e184 (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: beb997a1cddd47ad44b042f2c5b3c799 (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: b87d1853e9e0c6830df72ad4c34ab59e (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 4c26b0b84a45fe139453a8f655742f3f (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 0688cf300c9d8f8a8232a04a24cc793b (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 5386d58d61fdc3c8d3f5bc54fa3979fa (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 1c74fb93107761f8617c669bac819d51 (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: b0694650f6b31aa338206b71cb4e8d70 (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 30cb2dcc70fe7111f5b47ec76e4852da (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 8d1b89c1171adab8bbac1aef20fd70db (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 9417a763aadfc8dd794466d6ff0d8bed (src/sheets/DecideSessionSheet.tsx)
- expected finding missing from current scan: e090a8dd82915494b249493088e0c59b (src/sheets/DecideSessionSheet.tsx)
- expected finding missing from current scan: 29b762f3c86a81cd0e11b78a2ec62cae (src/sheets/DecideSessionSheet.tsx)
- expected finding missing from current scan: b57d6b08f5c94ddc9e919df8e994b2b4 (src/sheets/DecideSessionSheet.tsx)
- expected finding missing from current scan: a97217995e823aa0732a2b37f7bc02c0 (src/sheets/EditSessionSheet.tsx)
- expected finding missing from current scan: 1bde8e1cbc776c2214d96bb03757f2f8 (src/sheets/EditSessionSheet.tsx)
- expected finding missing from current scan: ca71e27948f5357f8837b8cb5af8eb25 (src/sheets/EditSessionSheet.tsx)
- expected finding missing from current scan: f9e731ac85772deebae3c5e23eb9333a (src/sheets/EditSessionSheet.tsx)
- expected finding missing from current scan: caa8a657802a9333d743230740b18d4c (src/sheets/FilterSheet.tsx)
- expected finding missing from current scan: 919c2f96dd705cc7ad2ed1c251078db8 (src/sheets/FilterSheet.tsx)
- expected finding missing from current scan: 2b1c0a44c7890d1ab70b4ce63dba1d8a (src/sheets/FilterSheet.tsx)
- expected finding missing from current scan: d52ac0426a66ee169f7593360ea016b8 (src/sheets/FilterSheet.tsx)
- expected finding missing from current scan: dd852ee90a5157c825f343464e163b46 (src/sheets/FilterSheet.tsx)
- expected finding missing from current scan: aa098d97b2bf305f789849582c890c64 (src/sheets/FilterSheet.tsx)
- expected finding missing from current scan: 41ad3e9ae7e36e6ca096427f653c801c (src/sheets/FilterSheet.tsx)
- expected finding missing from current scan: 5ba9dda6de6fea747f471cdccbb65b04 (src/sheets/FilterSheet.tsx)
- expected finding missing from current scan: 991e1e6df11e4d2292b4a9f30f0bcf80 (src/sheets/PlayerCardSheet.tsx)
- expected finding missing from current scan: 315a888dcf5c517826561cac9aea4f64 (src/sheets/PlayerCardSheet.tsx)
- expected finding missing from current scan: 87d756e883583ba01881ddedce659ad6 (src/sheets/PlayerCardSheet.tsx)
- expected finding missing from current scan: f24f03de7fea006e9a32cafac04575e3 (src/sheets/PlayerCardSheet.tsx)
- expected finding missing from current scan: 3c8f4fe2fb6e763bee014f5dc3a34429 (src/sheets/PlayerCardSheet.tsx)
- expected finding missing from current scan: 4bcbb6fc35fea0983a223270169867b1 (src/sheets/PlayerCardSheet.tsx)
- expected finding missing from current scan: 7421436c0813ef95903247f7808805c7 (src/sheets/PlayerCardSheet.tsx)
- expected finding missing from current scan: a45c359d139cdea851f149f584368f3f (src/sheets/PlayerCardSheet.tsx)
- expected finding missing from current scan: 3408a866440355b4ab5d553313db8514 (src/sheets/PlayerDirectorySheet.tsx)
- expected finding missing from current scan: ba2ad29dc28898c425a60c55c2249280 (src/sheets/PlayerDirectorySheet.tsx)
- expected finding missing from current scan: 44854b42f28388fa807a2717902949c4 (src/sheets/PlayerDirectorySheet.tsx)
- expected finding missing from current scan: c3ee8f7038864d384ae60a94bd482afc (src/sheets/PlayerDirectorySheet.tsx)
- expected finding missing from current scan: 91adaaf936310cbfc9bb0deab0cbcac8 (src/sheets/PlayerDirectorySheet.tsx)
- expected finding missing from current scan: 07321bff177401d4adf795a7190977ef (src/sheets/PlayerDirectorySheet.tsx)
- expected finding missing from current scan: f595848afc7c228e62a643f4ea664869 (src/sheets/PlayerDirectorySheet.tsx)
- expected finding missing from current scan: 1b0289fa06ecbb8259e1fbe151f64455 (src/sheets/PlayerDirectorySheet.tsx)
- expected finding missing from current scan: 2fe966c7dc46a31b2eac7ff82c9dce25 (src/sheets/ProfileCompletionSheet.tsx)
- expected finding missing from current scan: 3689826b800ed557fce7e761bc62eee9 (src/sheets/ProfileCompletionSheet.tsx)
- expected finding missing from current scan: b5bbfb09d50766b1466ffae57b05696c (src/sheets/ProfileCompletionSheet.tsx)
- expected finding missing from current scan: 5e06fb201990c6768859791083494309 (src/sheets/ProfileCompletionSheet.tsx)
- expected finding missing from current scan: ea38afa10ae1ff7c06d3a59e4f43f92c (src/sheets/ReportDialog.tsx)
- expected finding missing from current scan: 91849872dbf74bf5e0683c9772f21c5e (src/sheets/SessionChatSheet.tsx)
- expected finding missing from current scan: af95504f6fc12b4d12f7eba3feee7c2e (src/sheets/SessionChatSheet.tsx)
- expected finding missing from current scan: bcc751d69035bf3e2098d61a05f008de (src/sheets/SessionChatSheet.tsx)
- expected finding missing from current scan: 2deac77676f78b362044e5bc8f23bc6d (src/sheets/SessionChatSheet.tsx)
- expected finding missing from current scan: 862ad80c01b5b81c24521940f1ebca32 (src/sheets/SessionDetailSheet.tsx)
- expected finding missing from current scan: a991e47cd001ba9a05ce0ac0b476998d (src/sheets/SessionDetailSheet.tsx)
- expected finding missing from current scan: f4aad88b7fc3c5938232d8d56163657c (src/sheets/WithdrawSessionConfirmationDialog.tsx)
- findings expected 63, received 2
- files expected 14, received 2
```

R2-C 後全庫 canary 為 0；`npm run lint` 在每一 stage 均通過。

## 3. 最終 generator 紅簽章（恰 65 條）

`node scripts/generate-eslint-unbound-manifest.mjs --check` exit 1；排除 Node stack，以下 63 個 missing 依 manifest 陣列序，後接兩個 aggregates，逐字為：

```text
- expected finding missing from current scan: 7b8644385cfb62eaa602651f632ea263 (src/data/repositories/privateDataRepository.ts)
- expected finding missing from current scan: aa2e2634b2efc4efa198597a19220c64 (src/mySessionsCreatedFocus.ts)
- expected finding missing from current scan: de0fd8fa7e2a7ba061b2eeea15e7e72b (src/sheets.ts)
- expected finding missing from current scan: 200f349b4e570e4adccb340e0a90a7ab (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 04dc8a6870066a646fc7d8663242ba3d (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 8c97905c80d36502961d14fe027ba3f0 (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 415a369b5ecd070f88439eddbe770523 (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 525f937b582e25ebf9ddb814bf249fe6 (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 8a5f0fb1159d9943c42d46e6e51bad08 (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: c6b9d71f2dd8e59879fa5da596b2e184 (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: beb997a1cddd47ad44b042f2c5b3c799 (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: b87d1853e9e0c6830df72ad4c34ab59e (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 4c26b0b84a45fe139453a8f655742f3f (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 0688cf300c9d8f8a8232a04a24cc793b (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 5386d58d61fdc3c8d3f5bc54fa3979fa (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 1c74fb93107761f8617c669bac819d51 (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: b0694650f6b31aa338206b71cb4e8d70 (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 30cb2dcc70fe7111f5b47ec76e4852da (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 8d1b89c1171adab8bbac1aef20fd70db (src/sheets/CreateSessionSheet.tsx)
- expected finding missing from current scan: 9417a763aadfc8dd794466d6ff0d8bed (src/sheets/DecideSessionSheet.tsx)
- expected finding missing from current scan: e090a8dd82915494b249493088e0c59b (src/sheets/DecideSessionSheet.tsx)
- expected finding missing from current scan: 29b762f3c86a81cd0e11b78a2ec62cae (src/sheets/DecideSessionSheet.tsx)
- expected finding missing from current scan: b57d6b08f5c94ddc9e919df8e994b2b4 (src/sheets/DecideSessionSheet.tsx)
- expected finding missing from current scan: a97217995e823aa0732a2b37f7bc02c0 (src/sheets/EditSessionSheet.tsx)
- expected finding missing from current scan: 1bde8e1cbc776c2214d96bb03757f2f8 (src/sheets/EditSessionSheet.tsx)
- expected finding missing from current scan: ca71e27948f5357f8837b8cb5af8eb25 (src/sheets/EditSessionSheet.tsx)
- expected finding missing from current scan: f9e731ac85772deebae3c5e23eb9333a (src/sheets/EditSessionSheet.tsx)
- expected finding missing from current scan: caa8a657802a9333d743230740b18d4c (src/sheets/FilterSheet.tsx)
- expected finding missing from current scan: 919c2f96dd705cc7ad2ed1c251078db8 (src/sheets/FilterSheet.tsx)
- expected finding missing from current scan: 2b1c0a44c7890d1ab70b4ce63dba1d8a (src/sheets/FilterSheet.tsx)
- expected finding missing from current scan: d52ac0426a66ee169f7593360ea016b8 (src/sheets/FilterSheet.tsx)
- expected finding missing from current scan: dd852ee90a5157c825f343464e163b46 (src/sheets/FilterSheet.tsx)
- expected finding missing from current scan: aa098d97b2bf305f789849582c890c64 (src/sheets/FilterSheet.tsx)
- expected finding missing from current scan: 41ad3e9ae7e36e6ca096427f653c801c (src/sheets/FilterSheet.tsx)
- expected finding missing from current scan: 5ba9dda6de6fea747f471cdccbb65b04 (src/sheets/FilterSheet.tsx)
- expected finding missing from current scan: 991e1e6df11e4d2292b4a9f30f0bcf80 (src/sheets/PlayerCardSheet.tsx)
- expected finding missing from current scan: 315a888dcf5c517826561cac9aea4f64 (src/sheets/PlayerCardSheet.tsx)
- expected finding missing from current scan: 87d756e883583ba01881ddedce659ad6 (src/sheets/PlayerCardSheet.tsx)
- expected finding missing from current scan: f24f03de7fea006e9a32cafac04575e3 (src/sheets/PlayerCardSheet.tsx)
- expected finding missing from current scan: 3c8f4fe2fb6e763bee014f5dc3a34429 (src/sheets/PlayerCardSheet.tsx)
- expected finding missing from current scan: 4bcbb6fc35fea0983a223270169867b1 (src/sheets/PlayerCardSheet.tsx)
- expected finding missing from current scan: 7421436c0813ef95903247f7808805c7 (src/sheets/PlayerCardSheet.tsx)
- expected finding missing from current scan: a45c359d139cdea851f149f584368f3f (src/sheets/PlayerCardSheet.tsx)
- expected finding missing from current scan: 3408a866440355b4ab5d553313db8514 (src/sheets/PlayerDirectorySheet.tsx)
- expected finding missing from current scan: ba2ad29dc28898c425a60c55c2249280 (src/sheets/PlayerDirectorySheet.tsx)
- expected finding missing from current scan: 44854b42f28388fa807a2717902949c4 (src/sheets/PlayerDirectorySheet.tsx)
- expected finding missing from current scan: c3ee8f7038864d384ae60a94bd482afc (src/sheets/PlayerDirectorySheet.tsx)
- expected finding missing from current scan: 91adaaf936310cbfc9bb0deab0cbcac8 (src/sheets/PlayerDirectorySheet.tsx)
- expected finding missing from current scan: 07321bff177401d4adf795a7190977ef (src/sheets/PlayerDirectorySheet.tsx)
- expected finding missing from current scan: f595848afc7c228e62a643f4ea664869 (src/sheets/PlayerDirectorySheet.tsx)
- expected finding missing from current scan: 1b0289fa06ecbb8259e1fbe151f64455 (src/sheets/PlayerDirectorySheet.tsx)
- expected finding missing from current scan: 2fe966c7dc46a31b2eac7ff82c9dce25 (src/sheets/ProfileCompletionSheet.tsx)
- expected finding missing from current scan: 3689826b800ed557fce7e761bc62eee9 (src/sheets/ProfileCompletionSheet.tsx)
- expected finding missing from current scan: b5bbfb09d50766b1466ffae57b05696c (src/sheets/ProfileCompletionSheet.tsx)
- expected finding missing from current scan: 5e06fb201990c6768859791083494309 (src/sheets/ProfileCompletionSheet.tsx)
- expected finding missing from current scan: ea38afa10ae1ff7c06d3a59e4f43f92c (src/sheets/ReportDialog.tsx)
- expected finding missing from current scan: 91849872dbf74bf5e0683c9772f21c5e (src/sheets/SessionChatSheet.tsx)
- expected finding missing from current scan: af95504f6fc12b4d12f7eba3feee7c2e (src/sheets/SessionChatSheet.tsx)
- expected finding missing from current scan: bcc751d69035bf3e2098d61a05f008de (src/sheets/SessionChatSheet.tsx)
- expected finding missing from current scan: 2deac77676f78b362044e5bc8f23bc6d (src/sheets/SessionChatSheet.tsx)
- expected finding missing from current scan: 862ad80c01b5b81c24521940f1ebca32 (src/sheets/SessionDetailSheet.tsx)
- expected finding missing from current scan: a991e47cd001ba9a05ce0ac0b476998d (src/sheets/SessionDetailSheet.tsx)
- expected finding missing from current scan: f4aad88b7fc3c5938232d8d56163657c (src/sheets/WithdrawSessionConfirmationDialog.tsx)
- findings expected 63, received 0
- files expected 14, received 0
```

`^- ` 計數為 65；`sessionController` expected/received 均為 0，故沒有衍生條目。

## 4. stableId 三點對點（63）

格式：`stableId | declaration path:line member | finding path:line:column`。R2-B 的 lifecycle declaration 是 fan-out；每個 finding 仍逐筆分列。

```text
7b8644385cfb62eaa602651f632ea263 | privateDataRepository.ts:105 loadCourts | privateDataRepository.ts:130:3
aa2e2634b2efc4efa198597a19220c64 | mySessionsCreatedFocus.ts:7 onCreatedSessionFocus | mySessionsCreatedFocus.ts:15:3
de0fd8fa7e2a7ba061b2eeea15e7e72b | surfaceContracts.ts:46 LoginModalContentHandle.unmount | sheets.ts:185:27
200f349b4e570e4adccb340e0a90a7ab | CreateSessionSheet.tsx:140 CourtCell.onClick | CreateSessionSheet.tsx:135:3
04dc8a6870066a646fc7d8663242ba3d | CreateSessionSheet.tsx:95 bumpTime | CreateSessionSheet.tsx:159:3
8c97905c80d36502961d14fe027ba3f0 | CreateSessionSheet.tsx:96 canPublish | CreateSessionSheet.tsx:160:3
415a369b5ecd070f88439eddbe770523 | CreateSessionSheet.tsx:107 fixedStartAt | CreateSessionSheet.tsx:169:3
525f937b582e25ebf9ddb814bf249fe6 | CreateSessionSheet.tsx:110 now | CreateSessionSheet.tsx:171:3
8a5f0fb1159d9943c42d46e6e51bad08 | CreateSessionSheet.tsx:111 onBackToMap | CreateSessionSheet.tsx:172:3
c6b9d71f2dd8e59879fa5da596b2e184 | CreateSessionSheet.tsx:112 onClose | CreateSessionSheet.tsx:173:3
beb997a1cddd47ad44b042f2c5b3c799 | CreateSessionSheet.tsx:113 onSubmit | CreateSessionSheet.tsx:174:3
b87d1853e9e0c6830df72ad4c34ab59e | CreateSessionSheet.tsx:114 onViewMySessions | CreateSessionSheet.tsx:175:3
4c26b0b84a45fe139453a8f655742f3f | CreateSessionSheet.tsx:115 toast | CreateSessionSheet.tsx:176:3
0688cf300c9d8f8a8232a04a24cc793b | CreateSessionSheet.tsx:108 candidateWindow | CreateSessionSheet.tsx:161:3
5386d58d61fdc3c8d3f5bc54fa3979fa | CreateSessionSheet.tsx:97 clock | CreateSessionSheet.tsx:162:3
1c74fb93107761f8617c669bac819d51 | CreateSessionSheet.tsx:101 dateValueNow | CreateSessionSheet.tsx:167:3
b0694650f6b31aa338206b71cb4e8d70 | CreateSessionSheet.tsx:102 donePresentation | CreateSessionSheet.tsx:168:3
30cb2dcc70fe7111f5b47ec76e4852da | SurfaceHost.tsx:14 isSurfaceRootLive | CreateSessionSheet.tsx:814:24
8d1b89c1171adab8bbac1aef20fd70db | SurfaceHost.tsx:15 unmount | CreateSessionSheet.tsx:821:14
9417a763aadfc8dd794466d6ff0d8bed | DecideSessionSheet.tsx:29 onClose | DecideSessionSheet.tsx:43:3
e090a8dd82915494b249493088e0c59b | DecideSessionSheet.tsx:30 onDecide | DecideSessionSheet.tsx:44:3
29b762f3c86a81cd0e11b78a2ec62cae | SurfaceHost.tsx:14 isSurfaceRootLive | DecideSessionSheet.tsx:161:24
b57d6b08f5c94ddc9e919df8e994b2b4 | SurfaceHost.tsx:15 unmount | DecideSessionSheet.tsx:165:14
a97217995e823aa0732a2b37f7bc02c0 | EditSessionSheet.tsx:35 onClose | EditSessionSheet.tsx:62:3
1bde8e1cbc776c2214d96bb03757f2f8 | EditSessionSheet.tsx:36 onSubmit | EditSessionSheet.tsx:63:3
ca71e27948f5357f8837b8cb5af8eb25 | SurfaceHost.tsx:14 isSurfaceRootLive | EditSessionSheet.tsx:308:24
f9e731ac85772deebae3c5e23eb9333a | SurfaceHost.tsx:15 unmount | EditSessionSheet.tsx:312:14
caa8a657802a9333d743230740b18d4c | FilterSheet.tsx:73 FilterControlsProps.onSelect | FilterSheet.tsx:76:64
919c2f96dd705cc7ad2ed1c251078db8 | FilterSheet.tsx:170 FilterFooterProps.onApply | FilterSheet.tsx:175:25
2b1c0a44c7890d1ab70b4ce63dba1d8a | FilterSheet.tsx:171 FilterFooterProps.onReset | FilterSheet.tsx:175:34
d52ac0426a66ee169f7593360ea016b8 | FilterSheet.tsx:35 FilterSheetContentOptions.onClose | FilterSheet.tsx:191:3
dd852ee90a5157c825f343464e163b46 | FilterSheet.tsx:36 FilterSheetContentOptions.onReset | FilterSheet.tsx:192:3
aa098d97b2bf305f789849582c890c64 | FilterSheet.tsx:37 FilterSheetContentOptions.onSetFilter | FilterSheet.tsx:193:3
41ad3e9ae7e36e6ca096427f653c801c | SurfaceHost.tsx:14 isSurfaceRootLive | FilterSheet.tsx:290:24
5ba9dda6de6fea747f471cdccbb65b04 | SurfaceHost.tsx:15 unmount | FilterSheet.tsx:297:14
991e1e6df11e4d2292b4a9f30f0bcf80 | PlayerCardSheet.tsx:54 InviteEmpty.onCreate | PlayerCardSheet.tsx:54:24
315a888dcf5c517826561cac9aea4f64 | PlayerCardSheet.tsx:79 InviteOptions.onCreate | PlayerCardSheet.tsx:74:3
87d756e883583ba01881ddedce659ad6 | PlayerCardSheet.tsx:39 PlayerCardSheetContentOptions.onClose | PlayerCardSheet.tsx:122:3
f24f03de7fea006e9a32cafac04575e3 | PlayerCardSheet.tsx:40 PlayerCardSheetContentOptions.onCreate | PlayerCardSheet.tsx:123:3
3c8f4fe2fb6e763bee014f5dc3a34429 | PlayerCardSheet.tsx:41 onInvite | PlayerCardSheet.tsx:124:3
4bcbb6fc35fea0983a223270169867b1 | PlayerCardSheet.tsx:42 onSeeDirectory | PlayerCardSheet.tsx:125:3
7421436c0813ef95903247f7808805c7 | SurfaceHost.tsx:14 isSurfaceRootLive | PlayerCardSheet.tsx:304:24
a45c359d139cdea851f149f584368f3f | SurfaceHost.tsx:15 unmount | PlayerCardSheet.tsx:308:14
3408a866440355b4ab5d553313db8514 | PlayerDirectorySheet.tsx:46 DirectoryRow.onOpenPlayer | PlayerDirectorySheet.tsx:46:25
ba2ad29dc28898c425a60c55c2249280 | PlayerDirectorySheet.tsx:82 DirectoryBody.onOpenPlayer | PlayerDirectorySheet.tsx:78:3
44854b42f28388fa807a2717902949c4 | PlayerDirectorySheet.tsx:83 DirectoryBody.onRetry | PlayerDirectorySheet.tsx:79:3
c3ee8f7038864d384ae60a94bd482afc | PlayerDirectorySheet.tsx:37 PlayerDirectorySheetContentOptions.onClose | PlayerDirectorySheet.tsx:118:45
91adaaf936310cbfc9bb0deab0cbcac8 | PlayerDirectorySheet.tsx:38 PlayerDirectorySheetContentOptions.onOpenPlayer | PlayerDirectorySheet.tsx:118:54
07321bff177401d4adf795a7190977ef | PlayerDirectorySheet.tsx:39 PlayerDirectorySheetContentOptions.onRetry | PlayerDirectorySheet.tsx:118:68
f595848afc7c228e62a643f4ea664869 | SurfaceHost.tsx:14 isSurfaceRootLive | PlayerDirectorySheet.tsx:214:24
1b0289fa06ecbb8259e1fbe151f64455 | SurfaceHost.tsx:15 unmount | PlayerDirectorySheet.tsx:218:14
2fe966c7dc46a31b2eac7ff82c9dce25 | ProfileCompletionSheet.tsx:35 onClose | ProfileCompletionSheet.tsx:63:3
3689826b800ed557fce7e761bc62eee9 | ProfileCompletionSheet.tsx:36 onSubmit | ProfileCompletionSheet.tsx:64:3
b5bbfb09d50766b1466ffae57b05696c | SurfaceHost.tsx:14 isSurfaceRootLive | ProfileCompletionSheet.tsx:280:24
5e06fb201990c6768859791083494309 | SurfaceHost.tsx:15 unmount | ProfileCompletionSheet.tsx:284:14
ea38afa10ae1ff7c06d3a59e4f43f92c | ReportDialog.tsx:14 onClose | ReportDialog.tsx:18:25
91849872dbf74bf5e0683c9772f21c5e | SessionChatSheet.tsx:35 onClose | SessionChatSheet.tsx:57:3
af95504f6fc12b4d12f7eba3feee7c2e | SessionChatSheet.tsx:36 onFeedClick | SessionChatSheet.tsx:58:3
bcc751d69035bf3e2098d61a05f008de | SurfaceHost.tsx:14 isSurfaceRootLive | SessionChatSheet.tsx:282:24
2deac77676f78b362044e5bc8f23bc6d | SurfaceHost.tsx:15 unmount | SessionChatSheet.tsx:289:14
862ad80c01b5b81c24521940f1ebca32 | SurfaceHost.tsx:14 isSurfaceRootLive | SessionDetailSheet.tsx:829:24
a991e47cd001ba9a05ce0ac0b476998d | SurfaceHost.tsx:15 unmount | SessionDetailSheet.tsx:833:14
f4aad88b7fc3c5938232d8d56163657c | WithdrawSessionConfirmationDialog.tsx:5 onClose | WithdrawSessionConfirmationDialog.tsx:15:46
```

同名異宣告已全部分開：`onCreate` 三宣告、`onOpenPlayer` 三宣告、`onRetry` 兩宣告、`onReset` 兩宣告，以及 `unmount` 兩宣告（`SurfaceHost.tsx:15` fan-out 9 筆；`surfaceContracts.ts:46` fan-out 1 筆）。

## 5. selector、暫退 canary 與零 diff 自證

R2-B 一次加入 12 個 sheet-related exact paths；R2-C 再加入兩個 leaves。最終 28 檔陣列依字典序，14 個本批新增 selector 的真實 `ESLint.calculateConfigForFile` 結果為：

```text
src/sheets.ts [2]
src/sheets/CreateSessionSheet.tsx [2]
src/sheets/DecideSessionSheet.tsx [2]
src/sheets/EditSessionSheet.tsx [2]
src/sheets/FilterSheet.tsx [2]
src/sheets/PlayerCardSheet.tsx [2]
src/sheets/PlayerDirectorySheet.tsx [2]
src/sheets/ProfileCompletionSheet.tsx [2]
src/sheets/ReportDialog.tsx [2]
src/sheets/SessionChatSheet.tsx [2]
src/sheets/SessionDetailSheet.tsx [2]
src/sheets/WithdrawSessionConfirmationDialog.tsx [2]
src/data/repositories/privateDataRepository.ts [2]
src/mySessionsCreatedFocus.ts [2]
```

三點暫退前 candidate SHA：

```text
4cfb2940324ad9bbcc5201acf776fbf019619d641a03becc8981643a51f278d2  src/app/SurfaceHost.tsx
d33b9537934172c25802899acb05781fb115eb6d3c55a26b30b6a45cfcc30be8  src/sheets/CreateSessionSheet.tsx
20ca3a8e79911f028a79d43e46d1615c1f9fe087f3baf6c09f0de7326b709351  src/data/repositories/privateDataRepository.ts
```

以 `apply_patch` 同時精確暫退 `SurfaceHost.tsx:15 unmount`、`CreateSessionSheet.tsx:112 onClose`、`privateDataRepository.ts:105 loadCourts` 後，committed lint 恰紅 11 筆：

```text
src/data/repositories/privateDataRepository.ts:130:3
src/sheets/CreateSessionSheet.tsx:173:3
src/sheets/CreateSessionSheet.tsx:821:14
src/sheets/DecideSessionSheet.tsx:165:14
src/sheets/EditSessionSheet.tsx:312:14
src/sheets/FilterSheet.tsx:297:14
src/sheets/PlayerCardSheet.tsx:308:14
src/sheets/PlayerDirectorySheet.tsx:218:14
src/sheets/ProfileCompletionSheet.tsx:284:14
src/sheets/SessionChatSheet.tsx:289:14
src/sheets/SessionDetailSheet.tsx:833:14
✖ 11 problems (11 errors, 0 warnings)
```

再以 `apply_patch` 精確還原；三個 candidate SHA 逐 byte 回到上列值，lint 綠。未使用 checkout。

兩個最高優先零 diff 檔：

```text
$ git diff --stat -- src/sheets.ts src/sheets/SessionDetailSheet.tsx
# 無輸出

209062b80ea9ed8e396fec0a2d2692fccc1514d3e0168c907ef38a2f1c6c0e0c  src/sheets.ts
6141987ba416f04ef2c462d14a5c24798605b891461b7664ebf8e31cb5ae9ce3  src/sheets/SessionDetailSheet.tsx
```

兩檔 SHA 與開工值相同；R2-B 只藉集中 declaration 轉換清除其 findings，從未編輯 consumer。

## 6. 餘檔論證 ×14 與 erased-token 全等 ×14

`git diff -U0` 的全部 hunk header：

```text
SurfaceHost.tsx                         @@ -14,2 +14,2 @@ SurfaceContentLifecycle
privateDataRepository.ts               @@ -105 +105 @@ PrivateDataRepositoryOptions
mySessionsCreatedFocus.ts              @@ -7 +7 @@ MySessionsCreatedFocusOptions
CreateSessionSheet.tsx                 @@ -95,3 +95,3; -101,2 +101,2; -106,3 +106,3;
                                       @@ -110,6 +110,6; -140 +140
DecideSessionSheet.tsx                 @@ -29,2 +29,2 @@ DecideSessionContentOptions
EditSessionSheet.tsx                   @@ -35,2 +35,2 @@ EditSessionContentOptions
FilterSheet.tsx                        @@ -35,3 +35,3; -73 +73; -170,2 +170,2
PlayerCardSheet.tsx                    @@ -39,4 +39,4; -54 +54; -79 +79
PlayerDirectorySheet.tsx               @@ -37,3 +37,3; -46 +46; -82,2 +82,2
ProfileCompletionSheet.tsx             @@ -35,2 +35,2 @@ ProfileCompletionContentOptions
ReportDialog.tsx                       @@ -14 +14 @@ ReportDialogContentOptions
SessionChatSheet.tsx                   @@ -35,2 +35,2 @@ SessionChatContentOptions
WithdrawSessionConfirmationDialog.tsx  @@ -5 +5 @@ WithdrawSessionConfirmationContentOptions
surfaceContracts.ts                    @@ -46 +46 @@ LoginModalContentHandle
```

因此 14 檔所有 hunk 都落在列名 declaration physical lines。hunks 不含：各 `*ContentContract` 的 ref-call methods、九個 sheet lifecycle return-object consumer、`SurfaceContentHandle.commit/render`、`surfaceContracts.ts:41 onClose`、ProfileCompletion 的 18 個 data properties、CourtCell/DirectoryRow/DirectoryBody inline types 的相鄰 properties。行數沒有改變，Prettier 沒有產生折行。

REST proof 的口徑：分別從 `git show HEAD:<file>` 與 working file 切除上述實際變更 physical lines，再比較 bytes 與 SHA-256。結果：

| 檔案 | REST bytes | REST SHA-256（兩側相同） | byteEqual |
| --- | ---: | --- | --- |
| CreateSessionSheet.tsx | 28,461 | `8de792416360d65cd62304ccd5692a2be535acaf0a2d0523f19fccc16c437975` | true |
| DecideSessionSheet.tsx | 6,069 | `8ed1e6e6b9fd11d47e9d292d103edf4899a965acdae271ae3a603f3dd723038b` | true |
| EditSessionSheet.tsx | 10,485 | `34fe2de15256fc971e840b2007efde76ffeae1eaf49f37e9660e58f0cf4a57bb` | true |
| FilterSheet.tsx | 9,898 | `e813ec7e01d469ef06433c41fd6d08c53d12e31600e51f88aea889199061b246` | true |
| PlayerCardSheet.tsx | 10,989 | `46544ed1ca45cc47f6195cd4a1c5ac1f6cfd83cd7be16f957ef1ff66c0361ed0` | true |
| PlayerDirectorySheet.tsx | 7,643 | `f7b81243daf0f70f551afedd06fa6c62edf895ec994250783abf6e993f1be02c` | true |
| ProfileCompletionSheet.tsx | 9,990 | `d12d0759ef0cb6e0af8aa0b8bc0d1f9bf7bf2c781fcacf25b32ca4d742dab3cf` | true |
| ReportDialog.tsx | 2,721 | `d483d3dd5d9f933900e4e9eca8ac44680678878ebb5eb15953e03a731ac558de` | true |
| SessionChatSheet.tsx | 10,733 | `ae7ef066272dc0127ff5d4263f7c648ca73ddc713dd265d53c245be1d3567acf` | true |
| WithdrawSessionConfirmationDialog.tsx | 2,129 | `558098336fe626f3176b4663ae2204faeb4782e2f09a3531d85be105cdcf33d1` | true |
| SurfaceHost.tsx | 12,164 | `42c9a54b051c0b5b17d0833c755507333d50dffdccbca326af1d7c7d664860ca` | true |
| surfaceContracts.ts | 1,289 | `bbaa19dd6c5dd6fc7ae3fde3d21ebff67e9b3e8bcc7cbe1e34427a04c2a5ca2c` | true |
| mySessionsCreatedFocus.ts | 2,145 | `748cfc63ad65f43bc30d3f96fdcebbc8e23a6ab9fe53715f43c2fa7f36da6b2f` | true |
| privateDataRepository.ts | 21,526 | `7e16eddfb7d2805e2c074c1cb516cadb77207defd652ea7ca3eb5a96fdb11ed6` | true |

Erased-token proof 兩側都以 stdin 餵 esbuild；`.tsx` 使用 loader `tsx`，`.ts` 使用 loader `ts`，且兩側同樣指定 `--format=esm`：

```sh
git show HEAD:"$file" | npx esbuild --loader="$loader" --format=esm
npx esbuild --loader="$loader" --format=esm < "$file"
```

結果：

| 檔案 | erased bytes | erased SHA-256（兩側相同） | byteEqual |
| --- | ---: | --- | --- |
| CreateSessionSheet.tsx | 26,798 | `ca2cf396f4c37d4d18428615a28ebd33351b7d29f2604da77b14ab61dd3ff923` | true |
| DecideSessionSheet.tsx | 4,457 | `5894534cef01616b47adca8c8ac25b5da98c7bdac43e861c1e50fde6f2cf324b` | true |
| EditSessionSheet.tsx | 10,346 | `74f1e117d59f4b576223e43a597413409145efb5644498decbc64261b814bfb4` | true |
| FilterSheet.tsx | 8,849 | `38a9ca5e86299d2b9ec67062adf589a7a958cb065c3e0b0758f23c9ab6cf0e15` | true |
| PlayerCardSheet.tsx | 9,937 | `176a62155ec39e3b5f9cbd45fe5665fdc013c052194f58e86d757bcfd5da4a5c` | true |
| PlayerDirectorySheet.tsx | 6,812 | `4dedf3f047a3234af62f0290e4015e9e9071ee69cea58e88b4c43b77c42182a0` | true |
| ProfileCompletionSheet.tsx | 8,551 | `cb8da6aef064c386e4d725a33649b028a525fe893a3c1db7d078e80cf99f084c` | true |
| ReportDialog.tsx | 2,468 | `f988db23ddc4cc62810bc9d4a030553b8aa55914d62a6d43a085944eef757dc9` | true |
| SessionChatSheet.tsx | 8,814 | `612c139539d333bb5f495b97e905348a83c3c11fcfff067fbc6359eb95100430` | true |
| WithdrawSessionConfirmationDialog.tsx | 1,934 | `e70a926e3bcd400c98edd49f54fc5ac30dd3c51deac2ad1bdc1c6c0200be4899` | true |
| SurfaceHost.tsx | 7,420 | `14f5585a5e81f531c4a401f683c0dd9bd864b1ee492748eca6c646ba754835b8` | true |
| surfaceContracts.ts | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | true |
| mySessionsCreatedFocus.ts | 1,067 | `f86fa72f9b85822d5f73eb638cd3d5137838a503b10e5714238159eeea85d9df` | true |
| privateDataRepository.ts | 18,151 | `49d04c6e649f75cd540fb15789324a2d5896ba48b954227c7025078d947a83c5` | true |

`surfaceContracts.ts` 是純型別檔，所以對稱擦除為空；14 檔均證明 runtime token 零變。

凍結資產最終 SHA 與開工值一致：

```text
ce6808be54a596f0c4d0d92b2a23bda170764d6d623ba1b0e20e1dac500852ae  scripts/generate-eslint-unbound-manifest.mjs
14e56a1675ccf4939f2e0bc3e2685070b325a32a75ef778ea1ffa45b018fd207  docs/arch-eslint-phaseE-baseline.json
0aaf2f3339bd440a81556fc6a19e90c0b1d3610f1ff67c10373438b0dd87bda0  docs/arch-eslint-phaseE-removal-ledger.json
7d8bb32af7ed39a31c895ff19a41d6f16cc87504be62a4509e3a006ebc0d5a13  docs/arch-eslint-phaseE-unbound-manifest.json
4a6a7d3f15ea9b8ee525cfd77336bcffdd6cf408cb0678058674530ff7f2cd81  docs/arch-eslint-phaseE-unbound-manifest.md
```

## 7. Typecheck 載重與收尾標準矩陣

三個具名載重點均由 typecheck 實證：

1. `SurfaceContentHandle extends SurfaceContentLifecycle` 在基底改為 function properties 後仍相容；九個 mount 函式的 return objects 均通過結構賦值。
2. `sheets.ts:185` 的 `mounted.registerUnmount(content.unmount)` 在 `LoginModalContentHandle.unmount` 改為 function property 後仍成立。
3. 42 個 sheet contracts 的 options destructuring、React props 與 consumers 全部通過。

| 驗證 | 實際結果 |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS；28 個 scoped paths 守門，最終全庫 R2 finding 0 |
| `npm run prettier:check` | PASS；All matched files use Prettier code style |
| `npm run build` | PASS；508 modules transformed |
| `npm run check:production-bundle` | PASS；32 files；main `638937/187466`、total JS `841561/257627`，相對基準淨 `0 B` |
| `npm run test:session-unit` | PASS；346 passed、0 failed |
| `npm run test:mock` | PASS；298 passed、4 skipped；一次即綠，未重現 FilterSheet readiness flake |
| `npm run test:local` | PASS；API 2 passed；browser 45 passed、11 skipped；未 reset |
| `git diff --check` | PASS |
| generator `--check` | 預期 exit 1；恰 65 bullets，逐字見第 3 節 |
| 零 diff ×2 | PASS；`src/sheets.ts`、`SessionDetailSheet.tsx` 無 diff |
| REST／erased ×14 | PASS；28 組比較皆 byteEqual |

Production bundle gate 逐字摘要：

```text
production bundle check passed: development E2E hook present, production E2E hook absent; 32 files, 12 demo identifiers absent; main 638937/187466 within 658867/192420; largest app lazy MySessionsPage-Byp_C9FO.js 16476/4828 within 18000/5500; total JS 841561/257627 within 849961/259062; private repository: privateDataRepository-CfJqlfj0.js; Sentry: sentryBrowserSdk-Czz5dmkg.js
```

## 8. Codex 五問

### 1. 如何證明只改列名 declarations，沒有順手轉換相鄰 methods？

14 檔的 `git diff -U0` hunks 全落在派工單解凍 physical lines；第 1 節把凍結 traps 與相鄰 data properties 一併逐字列出，第 6 節再以 REST byteEqual ×14 證明 hunk 外逐 byte 不變。多行 `donePresentation` 只改頭尾 token，參數行原樣。

### 2. 如何證明 runtime 與兩個 consumer-only 檔沒有改變？

14 檔 HEAD/current 的對稱 esbuild output 全部 byte-identical；`src/sheets.ts` 與 `SessionDetailSheet.tsx` 的 diff stat 為空、SHA 等於開工值。所有修法都是 TypeScript 可擦除的 method-signature→function-property contract 轉換。

### 3. 如何證明 selector 精確且規則真的有牙？

14 個本批新增 exact paths 的真實 config 都是 `[2]`，最終 scoped 陣列恰 28 檔。跨 R2-A/B/C 的三點暫退同時精確重現 11 個預期 line:column errors；精確還原後 SHA 回復且 lint 再綠。generator 的全庫獨立 scan 同時由 63/14 降為 0/0，沒有 `[0]` 且仍含 finding 的遺漏檔。

### 4. 為何 generator 紅是正確交件？

驗收資料仍代表 R1 ACCEPTED 的 63/14，working scan 已歸零；63 個 missing stableIds 加 findings/files 兩條 aggregate 正好是 65 條反向簽章。依分工，只有驗收方能原子追加 ledger、重生 manifest 並讓 `--check` 轉綠；本交件自行改資產會破壞稽核鏈。

### 5. 收攏批盤點：全域形狀、四資產去留、G1/G2 與移除後 canary

等價全庫形狀：接受 R2 後，移除 28-path scoped override，並把 TypeScript 全域 block 的 `"@typescript-eslint/unbound-method": "off"` 明確改為 `"error"`。單純刪掉 `off` 也會繼承 `recommendedTypeChecked` 的 error，語意等價；但明寫 `error` 更可稽核，也避免未來 preset 變動悄悄改變政策。`databaseTypes` 的另一規則 override 保持獨立，不受影響。

四資產建議：

- ESLint 應成為 canonical 常規 gate，因它已掃 `src/**/*.{ts,tsx}` 與 `vite.config.ts`，全域 error 後能直接阻止回歸。
- 現有 generator／manifest／ledger／baseline 是遷移期稽核工具。接受 63 筆並產生 0/0 終態後，建議把 baseline、ledger、最終 manifest 與 acceptance docs 留作凍結歷史證據，但將現有 generator 從 active gate 退役；否則它與 ESLint 重複，還持續背負 brittle 的遷移 bookkeeping。
- 若確實需要第二道獨立 gate，應另以小型「完整 glob 掃描且 findings 必須為 0」檢查取代現有 baseline-minus-ledger 模型，不再延續 removal ledger 或 generated manifest。

G1/G2 處置：G1 baseline SHA pin 在遷移期間能防止母集合漂移，但歸零後只會阻擋合理的歷史檔整理；應保留在凍結歷史 metadata，不再作 active gate。G2 `acceptanceDoc` existence check 在逐批追加 ledger 時能維持稽核鏈；收攏時應最後驗證一次每筆接受文件存在，之後交由 Git history 保存，不再讓文件搬移影響 source lint。

移除 scoped block 後的 canary 設計：

1. 列出所有 tracked `src/**/*.ts`、`src/**/*.tsx` 與 `vite.config.ts`，逐檔 `calculateConfigForFile`，要求每檔規則嚴重度皆 `[2]`；同時比較 discovered set 與 scan-target set，任何漏網即紅。
2. 跑完整 `npm run lint`，再用獨立零掃描對同一完整 globs 驗證 finding count 0。
3. 在一個從未列入舊 28-path override 的 `src` 子目錄暫建 synthetic TS canary：interface method 被 destructure，lint 必須在精確 line:column 報錯；以精確 patch 移除。另暫退一個既知真實 declaration，確認同樣紅，再依 SHA 還原。
4. 可把「全域 block 不含 off、已無 scoped override、每個 source config 皆 `[2]`」固化成 config regression test。這能證明生效範圍是全庫，而不是只覆蓋舊清單。

## 9. 最終差異與未做／疑義／BLOCKED

程式 diff stat（回報檔建立前）：

```text
eslint.config.js                                 | 14 +++++++++++
src/app/SurfaceHost.tsx                          |  4 ++--
src/data/repositories/privateDataRepository.ts   |  2 +-
src/mySessionsCreatedFocus.ts                    |  2 +-
src/sheets/CreateSessionSheet.tsx                | 30 ++++++++++++------------
src/sheets/DecideSessionSheet.tsx                |  4 ++--
src/sheets/EditSessionSheet.tsx                  |  4 ++--
src/sheets/FilterSheet.tsx                       | 12 +++++-----
src/sheets/PlayerCardSheet.tsx                   | 12 +++++-----
src/sheets/PlayerDirectorySheet.tsx              | 12 +++++-----
src/sheets/ProfileCompletionSheet.tsx            |  4 ++--
src/sheets/ReportDialog.tsx                      |  2 +-
src/sheets/SessionChatSheet.tsx                  |  4 ++--
src/sheets/WithdrawSessionConfirmationDialog.tsx |  2 +-
src/surfaceContracts.ts                          |  2 +-
15 files changed, 62 insertions(+), 48 deletions(-)
```

最終 porcelain 應恰 16 條：

```text
 M eslint.config.js
 M src/app/SurfaceHost.tsx
 M src/data/repositories/privateDataRepository.ts
 M src/mySessionsCreatedFocus.ts
 M src/sheets/CreateSessionSheet.tsx
 M src/sheets/DecideSessionSheet.tsx
 M src/sheets/EditSessionSheet.tsx
 M src/sheets/FilterSheet.tsx
 M src/sheets/PlayerCardSheet.tsx
 M src/sheets/PlayerDirectorySheet.tsx
 M src/sheets/ProfileCompletionSheet.tsx
 M src/sheets/ReportDialog.tsx
 M src/sheets/SessionChatSheet.tsx
 M src/sheets/WithdrawSessionConfirmationDialog.tsx
 M src/surfaceContracts.ts
?? docs/arch-dispatch-2026-08-28-eslintR2-sheets-lifecycle-leaves-report-codex.md
```

- 未做：依合約未 commit、未 push；未改 `src/sheets.ts`、`SessionDetailSheet.tsx`、tests、scripts、baseline、ledger、manifest、generator、全域 off、databaseTypes override 或其他凍結檔。
- 疑義：無。收攏批不在本次解凍面，以上第 5 問僅提供後續裁決建議。
- BLOCKED：否。

