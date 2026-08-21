# 批次 B3b 回報：拆分 repository 與 auth facade

## 變更檔案與目的

- `src/dataApi.js`：縮成 79 行 thin facade，原名 re-export 既有 69 個公開符號，並保留全部 module-level proxy 簽名。
- `src/data/repositories/dataRepository.ts`：集中所有 `.from()`／`.rpc()`、mock fallback 與資料操作流程；用 generated DB row 型別描述查詢邊界。
- `src/data/repositories/selects.ts`：逐字搬移既有 select allowlist，沒有增減公開或私有欄位。
- `src/data/authApi.ts`：型別化初始 session 還原、auth listener、OAuth 登入／登出與 identity linking。
- `src/data/dataErrors.ts`：型別化既有錯誤類別、action code 與 Supabase error 轉換；中文訊息及不揭露封鎖的語意不變。
- `docs/arch-reports/batch-B3b.md`：保存本子批驗收證據。

沒有修改 `src/main.js`、UI、controller、測試、DB、RPC 名稱、select 欄位或 `p_line_id: null`。

## 結構結果

| 模組 | 行數 | 責任 |
| --- | ---: | --- |
| `src/dataApi.js` | 79 | 對外相容 facade 與預設 instance proxy |
| `src/data/repositories/dataRepository.ts` | 688 | query、RPC、mock fallback 與資料流程 |
| `src/data/repositories/selects.ts` | 123 | 查詢欄位 allowlist |
| `src/data/authApi.ts` | 106 | Supabase auth 邊界 |
| `src/data/dataErrors.ts` | 121 | data/auth 共用錯誤語意 |

repository 對外只 export `createDataApi`；auth、errors、mappers 與 select constants 由 facade 明確 re-export，沒有 barrel。所有 TypeScript import 都有實際副檔名，型別 import 使用 `import type`。

Supabase 的動態查詢結果先以 `unknown` 留在外部邊界，再集中轉成 `databaseTypes.ts` 對應的 table/view row；沒有使用 `any`、`@ts-ignore` 或 `@ts-expect-error`。

## Facade 公開符號前後對照

前後都以實際 dynamic import 的 `Object.keys(module).sort()` 產出，不是手抄：

```bash
node -e 'import("./src/dataApi.js").then((module) => process.stdout.write(`${Object.keys(module).sort().join("\n")}\n`))'
```

| 時點 | export 行數 | SHA-256 |
| --- | ---: | --- |
| 拆分前 | 69 | `97d07f1ed56cf349517143195740ba676ec3303ea3b105858ba844de3ad8e8f3` |
| 拆分後 | 69 | `97d07f1ed56cf349517143195740ba676ec3303ea3b105858ba844de3ad8e8f3` |

`diff -u /tmp/arch-b3b-exports-before.txt /tmp/arch-b3b-exports-after.txt`：exit 0，無輸出。公開符號一個都沒有增刪或改名。

## 測試變紅分類

| 類型 | 結果 | 處置 |
| --- | --- | --- |
| mapper allowlist runtime 斷言 | 全綠 | key 集合與 mapper 行為不變；不改測試。 |
| LINE token／`line_id` 遞迴掃描 | 全綠 | 新的 repository/auth/errors 自動納入掃描；不需演進。 |
| `src/main.js` source scan | 全綠 | 本批未動 `main.js`；不需演進。 |
| repository、RPC、auth runtime 測試 | 全綠 | mock 與 local Supabase 都通過；不改測試。 |

本批沒有阻擋 gate 變紅，因此沒有測試契約演進，也沒有刪除或放寬斷言。

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
# duration_ms 1939.853625
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
✓ 141 modules transformed.
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-CgKsGA-d.css   65.39 kB │ gzip:  10.76 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-BPQu-Mfd.js   714.49 kB │ gzip: 200.71 kB
✓ built in 863ms
```

`npm run check:production-bundle`：

```text
production bundle check passed: 12 files, 12 demo identifiers absent
```

`git diff --check`：exit 0，無輸出。

## 非阻擋 WebKit 訊號

`npm run test:mock:webkit` 單次結果：

```text
7 failed
3 skipped
125 passed (2.1m)
```

相較參考值 `126 passed / 6 failed / 3 skipped` 多一個 focus 失敗：`location denial is non-repeating...` 的 `#use-my-location` 預期 focused、WebKit 回報 `inactive`。這個同一測試與同一錯誤已在 B1 的單次結果出現；B2、B3a 又回到參考值。其餘六項也是既有 WebKit timing/focus 類型。

依派工規則，此項是非阻擋訊號；不重跑美化數字、不修改 UI，也不弱化測試。阻擋的 Chromium mock、local Supabase 與 unit gates 全綠。

## Supabase 呼叫位置 sweep

`rg -n '\.rpc\(' src`：

```text
src/data/repositories/dataRepository.ts:204:    const { data, error } = await activeClient.rpc(name, params);
```

`rg -n '\.from\(' src | grep -v 'Uint8Array\.from'`：

```text
src/data/repositories/dataRepository.ts:227:      .from("courts")
src/data/repositories/dataRepository.ts:247:      .from("session_discovery")
src/data/repositories/dataRepository.ts:267:    let query = activeClient.from("player_directory").select(PLAYER_DIRECTORY_SELECT);
src/data/repositories/dataRepository.ts:286:    let query = activeClient.from("player_presence_directory").select(PLAYER_PRESENCE_DIRECTORY_SELECT);
src/data/repositories/dataRepository.ts:307:      .from("session_discovery")
src/data/repositories/dataRepository.ts:319:      .from("my_session_participations")
src/data/repositories/dataRepository.ts:330:      .from("session_participant_roster")
src/data/repositories/dataRepository.ts:347:      .from("session_join_preview")
src/data/repositories/dataRepository.ts:358:      .from("session_message_feed")
src/data/repositories/dataRepository.ts:371:      .from("my_player_blocks")
src/data/repositories/dataRepository.ts:381:    const { data, error } = await activeClient.from("my_profile").select(MY_PROFILE_SELECT).maybeSingle();
src/data/repositories/dataRepository.ts:392:      .from("notification_prefs")
src/data/repositories/dataRepository.ts:403:      .from("court_subscriptions")
```

全部集中在允許的 `src/data/repositories/**`；thin facade 與 `src/` 其他區域都是零 Supabase query/RPC 呼叫。`Uint8Array.from` 假陽性已明確排除。

## 隱私與反向掃描

`rg -n 'p_line_id' src`：

```text
src/data/databaseTypes.ts:1793:          p_line_id: string;
src/data/repositories/dataRepository.ts:418:      // save_my_profile 的簽名已凍結(202607270006:9),p_line_id 無預設值,呼叫端必須傳。
src/data/repositories/dataRepository.ts:420:      p_line_id: null,
```

runtime 呼叫仍逐字為 `p_line_id: null`；generated type 的 RPC 參數也保留。

`rg -n '\bany\b|@ts-expect|@ts-ignore' src/data`：輸出空（exit 1）。

`git diff --name-only -- supabase/migrations supabase/tests data/courts.json`：輸出空（exit 0）。

## 白名單使用

- 只修改 B3b 白名單的 `src/dataApi.js` 內部結構、新增 `src/data/**`，以及本回報檔。
- 沒有修改 facade 公開符號集合、select allowlist、RPC 名稱、`src/main.js`、UI/controller、測試或 DB。
- `p_line_id: null`、同步 proxy 呼叫方式與 auth callback 參數順序均原樣保留。

## BLOCKED／偏差

- BLOCKED：無。
- 阻擋 gate 偏差：無。
- 非阻擋訊號偏差：WebKit 單次為 `125/7/3`，已在上節完整揭露，且與 B1 已知波動相同。
