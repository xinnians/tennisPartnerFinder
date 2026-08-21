# 批次 B1 回報：DB 產生型別與 domain literal union

## 變更檔案與目的

- `src/data/databaseTypes.ts`：由本機 Supabase schema 產生的完整 TypeScript 型別；檔頭明示 generated、禁止手改。
- `src/domainTypes.ts`：將可由 DB constraint 與安全 mapper 確認的有限值域收斂為 literal union。
- `package.json`：新增可重現且會套用專案 Prettier 的 `db:gen-types` script。
- `tests/session-data-boundary.test.js`：讓隱私掃描排除唯一的 generated schema 宣告檔，同時斷言該檔確實具有 generated 檔頭；所有 runtime／手寫前端來源仍遞迴掃描。
- `docs/arch-reports/batch-B1.md`：保存本批次證據。

沒有修改 `.js` runtime、DB migration、DB test 或公開資料 allowlist。

## 欄位值域與來源

| domain 欄位／型別 | literal union | DB 來源 | mapper 來源 |
| --- | --- | --- | --- |
| `sportCode` / `SportCode` | `"tennis"` | `202607270005_discovery_decided_at.sql:8` 的公開 view 固定 `sport_row.code='tennis'` | `dataApi.js:257` |
| `playType`、profile/roster `playTypes` / `PlayType` | `"單打" \| "雙打" \| "對拉" \| "練球"` | `202607170003_public_taipei_tennis_sessions.sql:59`；profile 同值域另見 `202607020001_initial_mvp_schema.sql:34-38` | `dataApi.js:264, 367, 475` |
| session `status` / `SessionStatus` | `"open" \| "full" \| "cancelled" \| "played" \| "expired"` | `202607170003_public_taipei_tennis_sessions.sql:65-66` | `dataApi.js:273` |
| `joinMode` / `SessionJoinMode` | `"approval" \| "instant"` | `202607210001_session_join_mode.sql:1-3` | `dataApi.js:274` |
| `venueType` / `SessionVenueType` | `"booked" \| "walk_on" \| "candidates"` | `202607270001_venue_types_profile_gates.sql:3-4` | `dataApi.js:275` |
| viewer/roster/join-preview `role` / `SessionParticipantRole` | `"host" \| "guest"` | `202607170003_public_taipei_tennis_sessions.sql:83` | `dataApi.js:344, 369, 378` |
| viewer/roster `status` / `SessionParticipantStatus` | `"requested" \| "invited" \| "accepted" \| "declined" \| "withdrawn"` | 最新 constraint：`202607210002_player_directory_invites.sql:3-7` | `dataApi.js:345, 370` |
| chat `kind` / `SessionMessageKind` | `"user" \| "system"` | `202607270003_session_chat.sql:3-8` | `dataApi.js:404` |
| profile `slots` / `ProfileSlotCode` | `"wd-m" \| "wd-a" \| "wd-e" \| "we-m" \| "we-a" \| "we-e"` | `202607020001_initial_mvp_schema.sql:41-45` | `dataApi.js:477` |

上述值域都來自 migration 的 constraint／公開 view 條件及 mapper 實際欄位，未憑印象補值。

## 16 個 consumer 核對

`rg -l 'domainTypes\.ts' src | sort | wc -l` 為 `16`。

| consumer | 有限值域使用情況 |
| --- | --- |
| `src/components/SessionCard.tsx` | 只透過 presentation 顯示，不直接比對 literal。 |
| `src/pages/MePage.tsx` | profile slots 轉為顯示陣列；未做額外值域分支。 |
| `src/pages/MessagesPage.tsx` | `viewerRole === "host"`。 |
| `src/pages/MySessionsPage.tsx` | 比對 accepted、open/full、host、booked/walk_on。所有 literal 均在 union 內。 |
| `src/pages/NearbySessionsDrawer.tsx` | 只使用獨立的 map UI status，不是 DB session status。 |
| `src/sessionPresentation.ts` | 比對 venue、join、session/participant status、role、message kind；所有 literal 均在 union 內。 |
| `src/sheets/CourtPlayersSheet.tsx` | 只顯示打法資料。 |
| `src/sheets/CourtSessionSheet.tsx` | 只傳遞 `SessionSummary`。 |
| `src/sheets/CreateSessionSheet.tsx` | 表單輸入仍保留既有 runtime 驗證，沒有改行為。 |
| `src/sheets/DecideSessionSheet.tsx` | 不直接使用本批 DB union。 |
| `src/sheets/EditSessionSheet.tsx` | 比對 `venueType === "walk_on"`，literal 在 union 內。 |
| `src/sheets/PlayerCardSheet.tsx` | 只顯示打法資料。 |
| `src/sheets/PlayerDirectorySheet.tsx` | 使用獨立的 `SurfaceLoadStatus`。 |
| `src/sheets/ProfileCompletionSheet.tsx` | 只呈現表單可選打法與時段。 |
| `src/sheets/SessionChatSheet.tsx` | 以 `ChatMessage.kind` 建立既有 class/data attribute，無新分支。 |
| `src/sheets/SessionDetailSheet.tsx` | 比對 instant、host 與 surface load status；domain literal 均合法。 |

TypeScript consumer 沒有漏掉新型別造成的錯誤；`npm run typecheck` 不需新增 cast 或抑制即可通過。

## 存量 JavaScript 比對點

下列是 `rg` 盤點後，與本批 DB/domain union 直接相關的 `.js` 比對／集合位置（fixture 的合法值另有完整掃描，但不是分支）：

```text
src/map.js:129 joinMode === "instant"
src/sessionCriteria.js:16 venueType === "candidates"
src/sessionCriteria.js:20 status === "full"
src/sessionCriteria.js:25 status === "open"
src/sessionViews.js:164-165 play type Set
src/sessionViews.js:176,202-204,238-246 venue type default/validation/branches
src/sessionViews.js:188,218 join mode default/validation
src/sessionViews.js:471,478 viewerRole === "host"
src/sessionViews.js:823 archived status Set
src/sessionViews.js:1318,1320,1513,1863 play type arrays/default/legacy edit allowance
src/sessionViews.js:1519-1520,1600,1613 venue/join form conversion
src/sessionController.js:143-150,200-235,266-269 session/participant status and role branches
src/sessionController.js:633,690-692,779-811 role/status/join branches
src/sessionController.js:1192-1199,1275,1335,1448-1449 role/status/venue/message branches
src/sessionController.js:1695,1853-1890,1927-1937 lifecycle role/status/venue branches
src/filters.js:102,126,169 join/session status branches
src/dataApi.js:309,879-880 mapper/RPC defaults
src/dataApi.js:956,964 participant decision literals
src/main.js:1003-1004,1017-1018 participant decision literals
```

全部比對值都落在上表 union 內；依批次紅線，沒有修改任何 `.js`。

## 產物重現與安全檢查

連續執行兩次 `npm run db:gen-types`：

```text
before=16f3d2d9cebce853365321d2fa580c42cdc4946aea38a141e66463fc2cd5547d
after=16f3d2d9cebce853365321d2fa580c42cdc4946aea38a141e66463fc2cd5547d
```

產物共 `1970` 行。以下 secret／連線資訊掃描 exit 0、無輸出：

```bash
rg -n "postgresql://|sb_secret_|JWT_SECRET|SERVICE_ROLE|ANON_KEY|127\.0\.0\.1|5432[0-9]|eyJhbGci" src/data/databaseTypes.ts
```

## Gate 輸出

`npm run typecheck`：

```text
> tennis-partner-finder@0.1.0 typecheck
> tsc --noEmit
```

`npm run lint`：

```text
> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{ts,tsx}" vite.config.ts
```

`npm run prettier:check`：

```text
Checking formatting...
All matched files use Prettier code style!
```

`npm run test:session-unit` 尾端摘要：

```text
1..276
# tests 276
# suites 0
# pass 276
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1966.877083
```

`npm run test:mock` 尾端摘要：

```text
4 skipped
266 passed (2.5m)
```

`npm run test:local` 尾端摘要：

```text
11 skipped
42 passed (1.5m)
```

`npm run build` 尾端摘要：

```text
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-CgKsGA-d.css   65.39 kB │ gzip:  10.76 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-BS_ixvSh.js   714.34 kB │ gzip: 200.64 kB
✓ built in 918ms
```

`npm run check:production-bundle`：

```text
production bundle check passed: 12 files, 12 demo identifiers absent
```

`git diff --check`：exit 0，無輸出。

## 非阻擋 WebKit 訊號

完整執行 `npm run test:mock:webkit`：

```text
7 failed
3 skipped
125 passed (2.2m)
```

相較參考值 `126 passed / 6 failed / 3 skipped` 多一個失敗：
`location denial is non-repeating and Maps authentication fallback keeps discovery usable` 在
`#use-my-location` 的 focus 斷言收到 `inactive`。單獨重跑仍為 `1 failed`。本批 browser 可執行碼為零變更；新增檔是未被 runtime import 的型別宣告，另一次變更只影響 Node 單元測試的掃描集合。因此列為既有 WebKit focus 相容性訊號，不修改 UI、不弱化測試，也不進行本派工明確排除的實機 Safari 分類。

## 字串掃描測試等語意演進

| 項目 | 變更前 | 變更後 |
| --- | --- | --- |
| 掃描目的 | 禁止前端 runtime 讀取／映射／渲染 legacy LINE 聯絡面。 | 完全相同。 |
| 掃描集合 | 遞迴掃描 `src/` 與 `public/` 的 JS/TS/TSX，尚未存在 generated DB 型別。 | 同一遞迴集合，只排除精確路徑 `src/data/databaseTypes.ts` 的純 schema 宣告。 |
| 非空保護 | `srcSources.length >= 15`，且必須含 `public/push-sw.js`。 | 原斷言全部保留；另斷言被排除檔案必須有 generated 檔頭。 |
| 隱私強度 | runtime 出現 `session_contacts`、`lineId` 或未核可 LINE token 即失敗。 | 完全相同；generated schema 忠實列出凍結 DB 欄位不再被誤判成 runtime 使用。 |

沒有刪除 assert、沒有空斷言、沒有放寬 runtime allowlist。

## 白名單使用

- 使用 B1 白名單：`src/domainTypes.ts`、新 `src/data/databaseTypes.ts`、`package.json` script。
- 使用共通規則允許的掃描型契約等語意演進：`tests/session-data-boundary.test.js`。
- 沒有使用 runtime、DB、DOM、文案、adapter 或同步語意例外。

## 反向掃描

禁止用型別逃生門的指令：

```bash
rg -n 'as [A-Z]| any|@ts-expect' src/domainTypes.ts src/data/
```

輸出：空（exit 1，零命中）。

禁止路徑變更：

```bash
git diff --name-only -- supabase/migrations supabase/tests data/courts.json
```

輸出：空（exit 0）。

## BLOCKED／偏差

- BLOCKED：無；必要 gate 全綠。
- 首次 `test:session-unit` 為 275/276，原因是 generated schema 宣告中的 legacy DB 名稱被 runtime 隱私掃描誤判；按共通規則完成等語意演進後為 276/276。
- 第一次 `prettier:check` 指出 Supabase 原始產物格式不符；將 Prettier 固化進 generator 後通過，且連續生成 hash 相同。
- 非阻擋 WebKit 數字偏離與單例重跑結果已完整揭露於上節。
