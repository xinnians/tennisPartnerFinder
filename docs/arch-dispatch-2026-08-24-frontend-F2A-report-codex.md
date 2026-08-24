# 批 2A 執行回報：型別鏈地基（F2-5 a／b／c／d）

- 日期：2026-08-24
- 派工單：`docs/arch-dispatch-2026-08-24-frontend-F2A.md`
- 開工基準：`c6e4238`
- 開工時 HEAD：`f4080f2`（比基準多本派工單與母派工單 docs-only 變更）
- 實作 HEAD：`e907c40`
- 分支：`claude/tennis-partner-finder-proto-xfrr6g`
- 結論：[已驗證] F2-5(a)～(d) 均已完成；`npm run test:ci:frontend`、799 筆 pgTAP 與 2 筆 live API test 全綠。
- 限制：[已驗證] `npm run test:local` 的 browser 段仍有一個既存 focus 斷言失敗；HEAD 10/10 重現，未套本批程式碼的 `f4080f2` 亦 3/3 重現，詳見 §8。
- 提交／推送：[已驗證] 四個子項各自 commit；本回報不列入實作 commit，未 push。

## 1. Commit 與完整檔案清單

```text
$ git log --oneline f4080f2..HEAD
e907c40 refactor(arch-F2A-d): use instanceof for data availability
f9fbaf1 refactor(arch-F2A-c): add type-only data barrel
e42f28f refactor(arch-F2A-b): guard mapper literal unions
bd6244b refactor(arch-F2A-a): connect Supabase database types
```

```text
$ git diff --name-status f4080f2..HEAD
M package.json
M src/data/authApi.ts
A src/data/index.ts
A src/data/mappers/literalGuards.ts
M src/data/mappers/profileMappers.ts
M src/data/mappers/sessionMappers.ts
M src/data/repositories/dataRepository.ts
M src/data/repositories/selects.ts
M src/domainTypes.ts
M src/sessionController.js
M src/supabaseClient.js
A tests/data-mapper-guards.test.js
M tests/session-data-boundary.test.js
```

| 檔案                                      | 一句話摘要                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/supabaseClient.js`                   | 以 JSDoc 把 client 標成 `SupabaseClient<Database>`，不改既有 `.js` 路徑。                            |
| `src/data/authApi.ts`                     | 改用 Supabase 正式 auth 型別並移除 client 雙重斷言。                                                 |
| `src/data/repositories/selects.ts`        | 把 `.join()` 產生的 widened string 改為 literal select strings，讓 Supabase parser 能檢查欄名。      |
| `src/data/repositories/dataRepository.ts` | 直接使用 typed client，退役 `rowsAs`／`rowAs`，以 typed `rowsOrEmpty` 做陣列 runtime 防禦。          |
| `src/data/mappers/literalGuards.ts`       | 新增九個 DB 邊界 literal guard、明文 fallback 與 array unknown omission。                            |
| `src/data/mappers/sessionMappers.ts`      | 所有 session union 產生點改走 guard。                                                                |
| `src/data/mappers/profileMappers.ts`      | play types／slot codes 改走 array guard。                                                            |
| `tests/data-mapper-guards.test.js`        | 九個 union 各驗已知值與未知 fallback，另驗 array unknown 不會被杜撰成可用值。                        |
| `tests/session-data-boundary.test.js`     | 把不符合 DB CHECK 的舊 `kind: "message"` fixture 校正為合法 `kind: "user"`；測試目的與斷言結構不變。 |
| `package.json`                            | 把新增 top-level unit test 納入 `test:session-unit`。                                                |
| `src/data/index.ts`                       | 新增只含 `export type` 的 domain/surface type barrel。                                               |
| `src/domainTypes.ts`                      | 修正首行註解，不再誤稱 mapper 位於 `dataApi.js`。                                                    |
| `src/sessionController.js`                | 經 `dataApi.js` 匯入 class，唯一錯誤分流改用 `instanceof`。                                          |

## 2. F2-5(a)：Database 泛型與 query 型別鏈

### 2.1 路線選擇

[已驗證] 選擇保留 `src/supabaseClient.js` 並加 JSDoc：

```js
/** @type {import("@supabase/supabase-js").SupabaseClient<import("./data/databaseTypes.ts").Database> | null} */
```

[推論] 這符合 `CLAUDE.md` 的 allowJs／不因工具鏈強制改寫存量 `.js` 原則；也不需改六個 consumer、appRuntime extension map 或測試 fixture import。`src/data/databaseTypes.ts` 一行未改。

### 2.2 `as unknown as` 前後

前：

```text
$ git grep -n "as unknown as" f4080f2 -- src
f4080f2:src/data/authApi.ts:35:  return supabase as unknown as AuthClient;
f4080f2:src/data/repositories/dataRepository.ts:186:  client = supabase as unknown as RepositoryClient | null,
f4080f2:src/features/discovery/discoveryFeature.ts:13:const filterSessionRows = filterSessions as unknown as (
f4080f2:src/features/discovery/discoveryFeature.ts:18:const sortSessionRows = sortSessionsForDrawer as unknown as (
```

後：

```text
$ grep -rn "as unknown as" src/
src/features/discovery/discoveryFeature.ts:13:const filterSessionRows = filterSessions as unknown as (
src/features/discovery/discoveryFeature.ts:18:const sortSessionRows = sortSessionsForDrawer as unknown as (
```

[已驗證] 4→2；只剩派工明定不動的 discovery signature adapters。

### 2.3 `rowsAs`／`rowAs` 前後計數與逐處決策

前：2 個 helper definition、`rowsAs` 10 call、`rowAs` 3 call。

```text
$ git grep -n -E "rowsAs<|rowAs<" f4080f2 -- src/data/repositories/dataRepository.ts
f4080f2:src/data/repositories/dataRepository.ts:152:function rowsAs<Row>(value: unknown): Row[] {
f4080f2:src/data/repositories/dataRepository.ts:156:function rowAs<Row>(value: unknown): Row {
f4080f2:src/data/repositories/dataRepository.ts:233:    return rowsAs<CourtRow>(data).map(mapCourt);
f4080f2:src/data/repositories/dataRepository.ts:258:    return rowsAs<SessionDiscoveryRow>(data).map(mapSessionSummary);
f4080f2:src/data/repositories/dataRepository.ts:277:    return rowsAs<PlayerDirectoryRow>(data).map(mapPlayerDirectoryRow);
f4080f2:src/data/repositories/dataRepository.ts:296:    return rowsAs<PlayerPresenceDirectoryRow>(data).map(mapPlayerPresenceDirectoryRow);
f4080f2:src/data/repositories/dataRepository.ts:312:    return data ? mapSessionSummary(rowAs<SessionDiscoveryRow>(data)) : null;
f4080f2:src/data/repositories/dataRepository.ts:323:    return rowsAs<MySessionRow>(data).map(mapMySession);
f4080f2:src/data/repositories/dataRepository.ts:335:    return rowsAs<SessionRosterRow>(data).map(mapSessionRosterRow);
f4080f2:src/data/repositories/dataRepository.ts:351:    return rowsAs<SessionJoinPreviewRow>(data).map(mapSessionJoinPreviewRow);
f4080f2:src/data/repositories/dataRepository.ts:364:    return rowsAs<SessionMessageRow>(data).map(mapSessionMessageRow);
f4080f2:src/data/repositories/dataRepository.ts:375:    return rowsAs<MyPlayerBlockRow>(data).map(mapMyPlayerBlockRow);
f4080f2:src/data/repositories/dataRepository.ts:385:    return mapCurrentProfile(rowAs<CurrentProfileRow>(data), courts);
f4080f2:src/data/repositories/dataRepository.ts:396:    return mapNotificationPreferences(rowAs<NotificationPreferencesRow>(data));
f4080f2:src/data/repositories/dataRepository.ts:407:    return rowsAs<{ court_id?: unknown }>(data)
```

逐處：

| 方法／來源                                   | 決策                              | 理由                                             |
| -------------------------------------------- | --------------------------------- | ------------------------------------------------ |
| `loadCourts`／`courts.select`                | 退役 `rowsAs`，保留 `rowsOrEmpty` | typed select 已推導 row；只需 null／非陣列防禦。 |
| `loadSessionDiscovery`／view select          | 同上                              | 同上。                                           |
| `loadPlayerDirectory`／view select           | 同上                              | 同上。                                           |
| `loadPlayerPresenceDirectory`／view select   | 同上                              | 同上。                                           |
| `loadSessionSummary`／`maybeSingle`          | 退役 `rowAs`                      | typed result 本身是 selected row 或 null。       |
| `loadMySessions`／view select                | 退役 `rowsAs`，保留 `rowsOrEmpty` | typed result array。                             |
| `loadSessionRoster`／view select             | 同上                              | typed result array。                             |
| `loadSessionJoinPreview`／view select        | 同上                              | typed result array。                             |
| `loadSessionMessages`／view select           | 同上                              | typed result array。                             |
| `loadMyPlayerBlocks`／view select            | 同上                              | typed result array。                             |
| `loadCurrentProfile`／`maybeSingle`          | 退役 `rowAs`                      | null 已在前一行排除。                            |
| `loadNotificationPreferences`／`maybeSingle` | 退役 `rowAs`，null 用 `{}`        | mapper 本來允許 partial/default。                |
| `loadCourtSubscriptions`／table select       | 退役 `rowsAs`，保留 `rowsOrEmpty` | selected `court_id` 已由 client 推導。           |

[已驗證] Ground truth 中這 13 個 call 全部來自 `.from(...).select(...)`，沒有一個是 RPC `Json` result；因此本批沒有需要保留的 `rowsAs`／`rowAs`。異質 RPC wrapper 仍只負責 action error normalization，未套 row helper。

後：`rowsAs` 0、`rowAs` 0；typed `rowsOrEmpty` definition 1、call 10。

```text
$ grep -n -E "rowsAs<|rowAs<|rowsOrEmpty" src/data/repositories/dataRepository.ts
123:function rowsOrEmpty<Row>(value: Row[] | null): Row[] {
202:    return rowsOrEmpty(data).map(mapCourt);
227:    return rowsOrEmpty(data).map(mapSessionSummary);
246:    return rowsOrEmpty(data).map(mapPlayerDirectoryRow);
265:    return rowsOrEmpty(data).map(mapPlayerPresenceDirectoryRow);
292:    return rowsOrEmpty(data).map(mapMySession);
304:    return rowsOrEmpty(data).map(mapSessionRosterRow);
320:    return rowsOrEmpty(data).map(mapSessionJoinPreviewRow);
333:    return rowsOrEmpty(data).map(mapSessionMessageRow);
344:    return rowsOrEmpty(data).map(mapMyPlayerBlockRow);
376:    return rowsOrEmpty(data)
```

### 2.4 Select canary（紅→還原綠）

暫把 `loadCourts` 的 `.select(COURT_SELECT)` 改成 `.select("id,not_a_real_column")`：

```text
$ npm run typecheck
> tsc --noEmit

src/data/repositories/dataRepository.ts(202,34): error TS2345: Argument of type '(row?: Partial<...>) => DataCourt' is not assignable to parameter of type '(value: SelectQueryError<"column 'not_a_real_column' does not exist on 'courts'.">, ...) => DataCourt'.
```

[已驗證] 診斷直接包含 `column 'not_a_real_column' does not exist on 'courts'`，證明 relation→select→mapper 型別鏈已接通。還原後：

```text
$ npm run typecheck
> tsc --noEmit
（exit 0，無診斷）
```

## 3. F2-5(b)：九個 literal union runtime guard

### 3.1 DB ground truth、accept-list 與 fallback

| Union                      | DB／browser ground truth                                                                                                                                                                                  | Accept-list                                       | Fallback 與理由                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| `SportCode`                | `202607170003_public_taipei_tennis_sessions.sql:1274-1276`：`where session_row.status in ('open', 'full') ... and sport_row.code = 'tennis'`。此欄沒有 table CHECK；browser view predicate 才是實際邊界。 | `tennis`                                          | `tennis`；首發 browser boundary 只可能是 tennis。                       |
| `PlayType`                 | `202607170003...:59`：`play_type text not null check (play_type in ('單打', '雙打', '對拉', '練球'))`；profile 另由 `202607020001_initial_mvp_schema.sql:34-36` 同值 CHECK。                              | 單打、雙打、對拉、練球                            | singular=`練球`（最少宣稱賽制）；array unknown 直接丟棄，避免杜撰偏好。 |
| `SessionStatus`            | `202607170003...:65-66`：`check (status in ('open', 'full', 'cancelled', 'played', 'expired'))`                                                                                                           | open、full、cancelled、played、expired            | `expired`；不把未知局誤標為可加入。                                     |
| `SessionJoinMode`          | `202607210001_session_join_mode.sql:1-3`：`check (join_mode in ('approval', 'instant'))`                                                                                                                  | approval、instant                                 | `approval`；不承諾未知局可直接加入。                                    |
| `SessionVenueType`         | `202607270001_venue_types_profile_gates.sql:3-4`：`check (venue_type in ('booked', 'walk_on', 'candidates'))`                                                                                             | booked、walk_on、candidates                       | `candidates`；不杜撰已訂場或現場候位，保留「尚待確認」的保守呈現。      |
| `SessionParticipantRole`   | `202607170003...:83`：`role text not null check (role in ('host', 'guest'))`                                                                                                                              | host、guest                                       | `guest`；不授予 host 管理 UI。                                          |
| `SessionParticipantStatus` | 最新約束 `202607210002_player_directory_invites.sql:3-7`：`check (status in ('requested', 'invited', 'accepted', 'declined', 'withdrawn'))`                                                               | requested、invited、accepted、declined、withdrawn | `withdrawn`；未知狀態不取得 accepted 權限。                             |
| `SessionMessageKind`       | `202607270003_session_chat.sql:3-8`：`kind text not null default 'user' check (kind in ('user','system'))`                                                                                                | user、system                                      | `system`；避免把未知內容歸因給某位使用者。                              |
| `ProfileSlotCode`          | `202607020001_initial_mvp_schema.sql:41-44`：`slot_code text not null check (slot_code in ('wd-m', 'wd-a', 'wd-e', 'we-m', 'we-a', 'we-e'))`                                                              | wd-m、wd-a、wd-e、we-m、we-a、we-e                | `null`，array mapper 丟棄；任何合法 slot fallback 都會捏造可打時段。    |

[已驗證] accept-list 直接寫成 `Record<Union, true>`，domain union 若增減而 guard 未同步會 typecheck 紅；runtime lookup 使用 `Object.hasOwn`，沒有裸斷言。

### 3.2 裸斷言前後

前（派工指定 grep）：9 處。

```text
$ git grep -n -E " as PlayType| as SessionStatus| as SessionParticipantStatus| as ProfileSlotCode" f4080f2 -- src/data
f4080f2:src/data/mappers/profileMappers.ts:92:    playTypes: asArray(row.play_types) as PlayType[],
f4080f2:src/data/mappers/profileMappers.ts:93:    slotCodes: asArray(row.slot_codes) as ProfileSlotCode[],
f4080f2:src/data/mappers/profileMappers.ts:141:    types: new Set(... as PlayType[]),
f4080f2:src/data/mappers/profileMappers.ts:143:    slots: new Set(... as ProfileSlotCode[]),
f4080f2:src/data/mappers/sessionMappers.ts:34:    playType: asText(row.play_type) as PlayType,
f4080f2:src/data/mappers/sessionMappers.ts:70:    playType: asText(session.playType) as PlayType,
f4080f2:src/data/mappers/sessionMappers.ts:119:    viewerParticipantStatus: asText(row.viewer_participant_status) as SessionParticipantStatus,
f4080f2:src/data/mappers/sessionMappers.ts:141:    playTypes: ... as PlayType[],
f4080f2:src/data/mappers/sessionMappers.ts:144:    status: asText(row.status) as SessionParticipantStatus,
```

後：

```text
$ grep -rn -E " as PlayType| as SessionStatus| as SessionParticipantStatus| as ProfileSlotCode" src/data/
（空輸出，exit 0）
```

[已驗證] 另有該 grep 未涵蓋的 SportCode／join mode／venue／role／message kind 裸斷言亦全部改走 guard。

### 3.3 Guard unit tests

```text
$ node --test tests/data-mapper-guards.test.js
ok 1 - SportCode guard accepts a known value and uses its explicit fallback for an unknown value
ok 2 - PlayType guard accepts a known value and uses its explicit fallback for an unknown value
ok 3 - SessionStatus guard accepts a known value and uses its explicit fallback for an unknown value
ok 4 - SessionJoinMode guard accepts a known value and uses its explicit fallback for an unknown value
ok 5 - SessionVenueType guard accepts a known value and uses its explicit fallback for an unknown value
ok 6 - SessionParticipantRole guard accepts a known value and uses its explicit fallback for an unknown value
ok 7 - SessionParticipantStatus guard accepts a known value and uses its explicit fallback for an unknown value
ok 8 - SessionMessageKind guard accepts a known value and uses its explicit fallback for an unknown value
ok 9 - ProfileSlotCode guard accepts a known value and uses its explicit fallback for an unknown value
ok 10 - array-valued play-type and profile-slot guards omit unknown entries instead of inventing availability
1..10
# tests 10
# pass 10
# fail 0
```

[已驗證] `tests/ci-config.test.js` 綠，證明新檔已登錄 `test:session-unit`。

### 3.4 GOLDEN 行為

```text
$ git diff c6e4238 HEAD -- tests/session-controller-sequence.test.js
（空輸出）
```

[已驗證] 124 筆 GOLDEN 檔逐字未變；完整 frontend gate 亦通過該 frozen sequence test。

## 4. F2-5(c)：type-only barrel 與註解

### 4.1 匯出清單

`src/data/index.ts` 的 23 個 export 全為 type：

```text
ChatMessage, CourtSummary, MySessionSummary, NotificationPreferences,
PlayType, Profile, ProfileSlotCode, SessionDetailSurfaceContract,
SessionJoinMode, SessionJoinPreview, SessionJoinPreviewState,
SessionMessageKind, SessionParticipantRole, SessionParticipantStatus,
SessionRoster, SessionRosterEntry, SessionStatus, SessionSummary,
SessionVenueType, SportCode, SurfaceCloseOptions, SurfaceContract,
SurfaceLoadStatus
```

[已驗證] 檔案只含 `export type { ... } from "../domainTypes.ts"`，runtime export 為 0；`dataApi.js` 仍是唯一 browser runtime data boundary。

新註解：

```ts
/** Shared domain and surface shapes produced at the typed data-mapper boundary. */
```

[已驗證] 舊註解把 allowlisted mapper 說成在 `dataApi.js`；現況 mapper 已位於 `src/data/mappers/`，`dataApi.js` 是 facade，故修為不綁錯誤實作位置的 boundary 描述。

### 4.2 Runtime import canary（紅→還原綠）

暫在 `src/pages/MePage.tsx` 以 value import `SessionSummary` 並執行 `void SessionSummary`：

```text
$ npm run typecheck
> tsc --noEmit

src/pages/MePage.tsx(16,6): error TS2693: 'SessionSummary' only refers to a type, but is being used as a value here.
```

還原後：

```text
$ npm run typecheck
> tsc --noEmit
（exit 0，無診斷）
```

[已驗證] 新 barrel 無 runtime 值可讓 page 繞過 facade；canary 已完全還原，`git diff -- src/pages/MePage.tsx` 空輸出。

## 5. F2-5(d)：`instanceof` 錯誤分流

[已驗證] `src/sessionController.js` 只經 `./dataApi.js` re-export 匯入 `DataApiUnavailableError`，沒有越過 facade 深 import。

前：

```text
$ git grep -n -E "error\?\.name ===|error\.name ===" f4080f2 -- src
f4080f2:src/sessionController.js:1837:      if (error?.name === "DataApiUnavailableError") {
```

後：

```text
$ grep -rn -E "error\?\.name ===|error\.name ===" src/
（空輸出，exit 0）
```

### 5.1 偽造 name canary

暫加 controller test：`createSession` 丟出 `Object.assign(new Error("canary-original-error"), { name: "DataApiUnavailableError" })`，並斷言 catch 到同一 object。

```text
$ node --test --test-name-pattern="F2A instanceof canary" tests/session-controller.test.js
TAP version 13
# Subtest: F2A instanceof canary rejects a forged DataApiUnavailableError name
ok 1 - F2A instanceof canary rejects a forged DataApiUnavailableError name
1..1
# tests 1
# pass 1
# fail 0
```

[已驗證] 偽造 name 不再被換成本機示範文案；temporary test 已移除，`git diff -- tests/session-controller.test.js` 空輸出。

### 5.2 既有文案行為

```text
$ TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/smoke.spec.js --project=desktop-chromium --grep "profile and create sheets disclose public nickname use|mock-mode create does not open OAuth"
Running 2 tests using 1 worker
✓ profile and create sheets disclose public nickname use and retain a local-demo create failure
✓ mock-mode create does not open OAuth or fabricate a new session
2 passed (2.2s)
```

[已驗證] 第一條逐字使用既有完整錯誤：`本機示範資料僅供瀏覽；登入、儲存個人檔案與建立球局需在已設定服務的環境使用。`；第二條驗 mock 未設定服務的可觀察 toast。沒有改 throw 文案或加入 `cause`。

## 6. 完整 frontend gate 與靜態收尾

執行期間沒有並行第二個 dev server 或其他 `node --test`。

```text
$ npm run test:ci:frontend
--check 通過:產出檔案與 data/courts.json 重生結果一致。
> tsc --noEmit
> eslint ...
Checking formatting...
All matched files use Prettier code style!
...
1..290
# tests 295
# pass 295
# fail 0
...
Running 272 tests using 1 worker
4 skipped
268 passed (2.4m)
...
✓ 151 modules transformed.
dist/assets/index-BRMuaAO8.js  633.38 kB │ gzip: 184.44 kB
✓ built in 987ms
production bundle check passed: 28 files, 12 demo identifiers absent; main chunk 633375/184441 bytes within 703886/203176
（exit 0）
```

```text
$ git diff --check
（空輸出，exit 0）
```

建立本報告前：

```text
$ git status --short
（空輸出）
```

[已驗證] 四個 canary 全部還原；本報告建立後依派工要求維持唯一 untracked file。

## 7. Supabase／local 驗證

### 7.1 pgTAP

```text
$ npm run test:db
supabase/tests/courts_catalog.sql ........ ok
supabase/tests/my_profile_rls.sql ........ ok
supabase/tests/notification_rework.sql ... ok
supabase/tests/player_presence_rls.sql ... ok
supabase/tests/session_chat.sql .......... ok
supabase/tests/session_join_preview.sql .. ok
supabase/tests/session_rls.sql ........... ok
All tests successful.
Files=7, Tests=799
Result: PASS
```

### 7.2 `npm run test:local`

```text
$ npm run test:local
TAP version 13
ok 1 - loopback fixture exercises profile RPC, discovery allowlist, and lifecycle outcome
ok 2 - third authenticated account sees only host and accepted guest in the live join preview
# tests 2
# pass 2
# fail 0
...
Running 53 tests using 1 worker
...
10 passed
1 failed
31 did not run
11 skipped
```

唯一失敗：

```text
tests/session.spec.js:488
a complete profile creates a Taipei session with an explicit Taipei ISO timestamp and focuses its upcoming card

Error: expect(locator).toBeFocused() failed
Locator: locator('#my-upcoming-sessions [data-session-id]').first()
Expected: focused
Received: inactive
Timeout: 5000ms
```

依派工 protocol 以 `--repeat-each=10 --retries=0` 取樣：

```text
$ TENNIS_TEST_HARNESS_MODE=local npx playwright test tests/session.spec.js --project=supabase-chromium --grep "a complete profile creates a Taipei session" --repeat-each=10 --retries=0
Running 10 tests using 1 worker
10 failed
（10 次皆為同一 toBeFocused 斷言）
```

再於 isolated temporary worktree、未含本批程式碼的 `f4080f2` 取樣：

```text
$ git worktree add --detach <temp> f4080f2
$ TENNIS_TEST_HARNESS_MODE=local npx playwright test tests/session.spec.js --project=supabase-chromium --grep "a complete profile creates a Taipei session" --repeat-each=3 --retries=0
Running 3 tests using 1 worker
3 failed
（3 次皆為同一 toBeFocused 斷言）
```

- [已驗證] live API/data path 綠；失敗只在建立成功後導向 My Sessions 的 focus transfer。
- [已驗證] `f4080f2` 3/3 已同樣失敗，故不是 2A diff 引入。
- [不確定] 根因屬既有 focus/navigation 行為或本機環境差異；本批證據不足以在不改 UI 結構的前提下定根因。
- [已驗證] 未為求綠修改 focus 邏輯或 e2e 斷言；這會超出 2A 且違反「大檔除 (d) 一行不動」範圍。temporary worktree 已移除。

## 8. 未做／不在範圍

- [已驗證] 未改 `src/data/databaseTypes.ts`、`src/features/discovery/discoveryFeature.ts`、`src/sessionViews.js`、`src/main.js`、`src/syncCommit.ts`、`.claude/rules/` 或 migration。
- [已驗證] `src/sessionController.js` 只動 F2-5(d) 的 class import、判斷與緊鄰 lint 註解；沒有結構拆分。
- [已驗證] 未新增 runtime dependency、未改 testid、UI 文案或任何 e2e 斷言。
- [已驗證] 未做 F2-6～F2-9、drawer scroll、GOLDEN me 通道、2B／2C／2D。
- [已驗證] 未跑非阻擋 `npm run test:mock:webkit`／`test:local:mobile`；派工未要求，且 local desktop 已有明確既存 focus failure。
- [已驗證] 未 push；本回報不 commit。
