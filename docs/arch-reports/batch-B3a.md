# 批次 B3a 回報：抽出 typed mappers

## 變更檔案與目的

- `src/dataApi.js`：改為 import typed mapper/query/value 函式並原名 re-export 九個公開 mapper；repository、auth 與 facade 其他行為不動。
- `src/data/mappers/valueMappers.ts`：集中原有 number/text/boolean/array/date/profile collection 正規化。
- `src/data/mappers/sessionMappers.ts`：以 generated DB view row 與 B1 domain type 描述 session、My Sessions、roster、join preview、chat mapper。
- `src/data/mappers/profileMappers.ts`：型別化 notification、block、directory、presence、court 與 current-profile mapper。
- `src/data/mappers/queryMappers.ts`：搬移 bounds、discovery time window 與 mock 篩選純函式。
- `docs/arch-reports/batch-B3a.md`：保存本子批驗收證據。

沒有修改 `src/main.js`、repository/RPC 呼叫、auth、測試、DB、select allowlist 或 UI/controller。

## Facade 公開符號前後對照

前後都以實際 dynamic import 的 `Object.keys(module).sort()` 產出，不是手抄：

```bash
node -e 'import("./src/dataApi.js").then((module) => process.stdout.write(`${Object.keys(module).sort().join("\n")}\n`))'
```

| 時點 | export 行數 | SHA-256 |
| --- | ---: | --- |
| 拆分前 | 69 | `97d07f1ed56cf349517143195740ba676ec3303ea3b105858ba844de3ad8e8f3` |
| 拆分後 | 69 | `97d07f1ed56cf349517143195740ba676ec3303ea3b105858ba844de3ad8e8f3` |

`diff -u /tmp/arch-b3a-exports-before.txt /tmp/arch-b3a-exports-after.txt`：exit 0，無輸出。公開符號集合完全相同。

## 型別與行為對稱性

- DB row 來源直接使用 `databaseTypes.ts` 的 `session_discovery`、`my_session_participations`、`session_participant_roster`、`session_join_preview`、`session_message_feed`、`my_profile`、`my_player_blocks`、`player_directory`、`player_presence_directory`、`notification_prefs`、`courts`。
- mapper 回傳使用 B1 的 `SessionSummary`、`MySessionSummary`、`SessionRosterEntry`、`SessionJoinPreview`、`ChatMessage`、`Profile`、`NotificationPreferences` 與 literal unions。
- literal assertion、type predicate 與 type-only import 都會在編譯時移除；欄位取值、fallback、key 集合與陣列篩選順序照搬。
- `src/dataApi.js` 從 1,178 行降至 861 行；四個 mapper 模組共 449 行，拆分是搬移加型別，不是刪功能。
- production 主 JS 總大小仍為 `714.34 kB`；gzip 由 B2 的 `200.64 kB` 變為 `200.61 kB`，屬模組重新排列後的壓縮差異。

## 測試變紅分類

| 類型 | 結果 | 處置 |
| --- | --- | --- |
| mapper allowlist runtime 斷言 | 全綠 | 公開 mapper 行為與 key 集合不變；不改測試。 |
| LINE token／`line_id` 遞迴掃描 | 全綠 | 既有 helper 已自動涵蓋 `src/data/**`；不需演進。 |
| `src/main.js` source scan | 全綠 | 本批未動 `main.js`；不需演進。 |
| 其他 session unit | 全綠 | 無行為回歸；不改測試。 |

本批沒有變紅測試，因此沒有測試契約演進，也沒有刪除／放寬斷言。

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
# duration_ms 1973.63775
```

`npm run test:mock` 尾端摘要：

```text
4 skipped
266 passed (2.5m)
```

`npm run test:local` 尾端摘要：

```text
11 skipped
42 passed (1.6m)
```

`npm run build` 尾端摘要：

```text
✓ 137 modules transformed.
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-CgKsGA-d.css   65.39 kB │ gzip:  10.76 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-DpjkgPL1.js   714.34 kB │ gzip: 200.61 kB
✓ built in 923ms
```

`npm run check:production-bundle`：

```text
production bundle check passed: 12 files, 12 demo identifiers absent
```

`git diff --check`：exit 0，無輸出。

## 非阻擋 WebKit 訊號

`npm run test:mock:webkit`：

```text
6 failed
3 skipped
126 passed (2.1m)
```

數字與參考值相同，沒有劣化；仍是既有 WebKit timing/focus 差異。

## Supabase 呼叫位置 sweep

`rg -n '\.rpc\(' src`：

```text
src/dataApi.js:295:    const { data, error } = await activeClient.rpc(name, params);
```

`rg -n '\.from\(' src | grep -v 'Uint8Array\.from'`：

```text
src/dataApi.js:318:      .from("courts")
src/dataApi.js:336:      .from("session_discovery")
src/dataApi.js:356:    let query = activeClient.from("player_directory").select(PLAYER_DIRECTORY_SELECT);
src/dataApi.js:375:    let query = activeClient.from("player_presence_directory").select(PLAYER_PRESENCE_DIRECTORY_SELECT);
src/dataApi.js:396:      .from("session_discovery")
src/dataApi.js:408:      .from("my_session_participations")
src/dataApi.js:419:      .from("session_participant_roster")
src/dataApi.js:436:      .from("session_join_preview")
src/dataApi.js:447:      .from("session_message_feed")
src/dataApi.js:460:      .from("my_player_blocks")
src/dataApi.js:470:    const { data, error } = await activeClient.from("my_profile").select(MY_PROFILE_SELECT).maybeSingle();
src/dataApi.js:481:      .from("notification_prefs")
src/dataApi.js:492:      .from("court_subscriptions")
```

全部仍只在允許的 facade；`Uint8Array.from` 假陽性已明確排除。

## 隱私與反向掃描

`rg -n 'p_line_id' src`：

```text
src/data/databaseTypes.ts:1793:          p_line_id: string;
src/dataApi.js:505:      // save_my_profile 的簽名已凍結(202607270006:9),p_line_id 無預設值,呼叫端必須傳。
src/dataApi.js:507:      p_line_id: null,
```

呼叫點仍逐字為 `p_line_id: null`；generated type 的 RPC 參數也仍存在。

`rg -n '\bany\b|@ts-expect|@ts-ignore' src/data/mappers`：輸出空（exit 1）。

`git diff --name-only -- supabase/migrations supabase/tests data/courts.json`：輸出空（exit 0）。

## 白名單使用

- 只改 B3a 白名單的 `src/dataApi.js` 內部結構與新 `src/data/mappers/**`。
- 沒有改 facade 公開名稱／簽名、select allowlist、RPC、auth、測試或 runtime UI。
- import 全部有實際副檔名；型別全部使用 `import type`；沒有 barrel。

## BLOCKED／偏差

- BLOCKED：無。
- 偏差：無。
