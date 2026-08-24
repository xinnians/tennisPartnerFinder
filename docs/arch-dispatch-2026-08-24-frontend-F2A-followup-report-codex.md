# 批 2A 補件（A-1／A-2／A-3）執行回報

- 日期：2026-08-24
- 開工 HEAD：`6d3d4f0`
- 實作 commits：
  - `5a8948f fix(arch-F2A): enforce RPC argument contracts`
  - `144dc3a refactor(arch-F2A): remove unused data barrel`
- push：未執行
- 本回報：依派工要求不列入實作 commit

## 一、改了什麼

- `src/data/repositories/dataRepository.ts`：以 RPC 名稱推導精確 Args 鍵名與值型別，移除 `as never`，把未定型輸入逐欄正規化；並恢復 join preview／message feed 對非法 session id 的 null 語意。
- `tests/session-data-boundary.test.js`：新增非法 session id 在兩條 query 邊界都維持 null 語意的單元測試。
- `src/data/index.ts`：刪除零 consumer 的型別 barrel，消除可繞過 `dataApi.js` facade 的 import 路徑。

`src/data/databaseTypes.ts`、既有 select literal、literal guard、`supabaseClient.js` JSDoc、GOLDEN、testid、文案、規則檔與 `src/syncCommit.ts` 均未修改。[已驗證]

```text
$ git diff 6d3d4f0..HEAD -- src/data/databaseTypes.ts
（空輸出）
```

## 二、A-1：RPC 參數型別鏈

### 2.1 實作形狀

[已驗證] `callRpc<Name extends RpcName>` 與 `callLifecycleRpc<Name extends RpcName>` 的 params 都由 `RpcFunctions[Name]["Args"]` 推導；RPC 名稱、參數名稱與參數個數未改。

生成檔的 function Args 沒有表達 SQL nullability，但現行凍結契約確實需要 null，例如 `save_my_profile.p_line_id: null`、candidate `create_session.p_court_id: null`。因此 repository 由生成型別映出 `RepositoryDatabase`：保留每個生成的 RPC 名稱、參數鍵與非 null 值型別，只對每個值補 `null`。這讓真實契約可編譯，同時不允許 boolean 位置放 string，也不允許多／少／拼錯參數。[已驗證]

沒有使用 `as never`、`as any`、`as unknown as` 或 `@ts-expect-error`。[已驗證]

被型別鏈暴露的未定型呼叫點處理如下：[已驗證]

- number 類 ID、座標、NTRP、slots 走 `asNumber`，非法值成 `null`。
- text 類 play type、timestamp、decision、venue type 走 `asText`，非字串成空字串。
- candidate court IDs 與 profile court IDs 逐筆 `asNumber`；後者有既有 `PROFILE_INCOMPLETE` 防線。
- nullable RPC 欄位仍傳 null，沒有用假數字或假字串迎合生成型別。

### 2.2 `as never` 前後

開工前：[已驗證]

```text
$ grep -rn "as never" src/
src/sheets/PlayerCardSheet.tsx:144:        // Legacy no-op when the form branch was never rendered: it bailed out as
src/data/repositories/dataRepository.ts:173:    const { data, error } = await activeClient.rpc(name, params as never);
```

完成後：[已驗證]

```text
$ grep -rn "as never" src/
src/sheets/PlayerCardSheet.tsx:144:        // Legacy no-op when the form branch was never rendered: it bailed out as
```

唯一剩餘命中是既有英文註解，不是 TypeScript 斷言。原 2A 回報漏列的 `as never` 已由 A-1 退役。[已驗證]

### 2.3 新 canary 1：RPC 參數名稱拼錯

暫時把 `p_chat_message_enabled` 改成 `p_chat_message_enabled_typo`：[已驗證]

```text
$ npm run typecheck

> tennis-partner-finder@0.1.0 typecheck
> tsc --noEmit

src/data/repositories/dataRepository.ts(432,7): error TS2561: Object literal may only specify known properties, but 'p_chat_message_enabled_typo' does not exist in type '{ p_chat_message_enabled: boolean | null; p_guest_invited_enabled: boolean | null; p_guest_request_reviewed_enabled: boolean | null; p_host_new_request_enabled: boolean | null; p_session_reminder_enabled: boolean | null; p_session_updated_enabled: boolean | null; }'. Did you mean to write 'p_chat_message_enabled'?
EXIT=2
```

還原後：[已驗證]

```text
$ npm run typecheck

> tennis-partner-finder@0.1.0 typecheck
> tsc --noEmit

EXIT=0
```

### 2.4 新 canary 2：boolean 參數放 string

暫時改成 `p_chat_message_enabled: "not-a-boolean"`：[已驗證]

```text
$ npm run typecheck

> tennis-partner-finder@0.1.0 typecheck
> tsc --noEmit

src/data/repositories/dataRepository.ts(432,7): error TS2322: Type 'string' is not assignable to type 'boolean | null'.
EXIT=2
```

還原後：[已驗證]

```text
$ npm run typecheck

> tennis-partner-finder@0.1.0 typecheck
> tsc --noEmit

EXIT=0
```

### 2.5 既有 canary：錯欄位

暫時把 courts select 改成 `.select("id,not_a_real_column")`：[已驗證]

```text
$ npm run typecheck

> tennis-partner-finder@0.1.0 typecheck
> tsc --noEmit

src/data/repositories/dataRepository.ts(213,34): error TS2345: Argument of type '(row?: Partial<{ city: string | null; created_at: string; district: string; id: number; is_active: boolean; lat: number; lng: number; name: string; updated_at: string; }>) => DataCourt' is not assignable to parameter of type '(value: SelectQueryError<"column 'not_a_real_column' does not exist on 'courts'.">, index: number, array: SelectQueryError<"column 'not_a_real_column' does not exist on 'courts'.">[]) => DataCourt'.
  Types of parameters 'row' and 'value' are incompatible.
    Type 'SelectQueryError<"column 'not_a_real_column' does not exist on 'courts'.">' is not assignable to type 'Partial<{ city: string | null; created_at: string; district: string; id: number; is_active: boolean; lat: number; lng: number; name: string; updated_at: string; }> | undefined'.
EXIT=2
```

還原後 typecheck `EXIT=0`。[已驗證]

### 2.6 既有 canary：錯 RPC 名稱

暫時把 `cancel_session` 改成 `cancel_session_typo`：[已驗證]

```text
$ npm run typecheck

> tennis-partner-finder@0.1.0 typecheck
> tsc --noEmit

src/data/repositories/dataRepository.ts(585,29): error TS2345: Argument of type '"cancel_session_typo"' is not assignable to parameter of type '"cancel_session" | "confirm_session_attendance" | "create_report" | "create_session" | "decide_session_court" | "invite_to_session" | "mark_session_chat_read" | "mark_session_played" | ... 16 more ... | "withdraw_from_session"'.
EXIT=2
```

還原後 typecheck `EXIT=0`。[已驗證]

## 三、A-2：刪除 barrel（選項 A）

選 A 的理由：`src/data/index.ts` 開工時零 consumer，所有匯出本來就是 `domainTypes.ts` 的重複再匯出；刪除能直接消除 facade 繞路，且不需為無消費者抽象增加一條 lint／靜態 gate。[已驗證]

```text
$ rg -n "data/index" src tests
（空輸出）

$ test ! -e src/data/index.ts
EXIT=0
```

`src/domainTypes.ts` 的集中型別與先前已修正的檔頭註解保留。[已驗證]

## 四、A-3：三處揭露與語意選擇

1. `loadSessionJoinPreview`：2A 曾把參數從 `unknown` 收成 `number` 並以 `asNumber(sessionId) ?? sessionId` 回退原值。本補件改回 `unknown`，只保留 `asNumber`；非法值不再原樣送到 PostgREST。[已驗證]
2. `loadSessionMessages`：同樣移除 `?? sessionId`，只保留 `asNumber`。[已驗證]
3. `as never`：是 2A 新增但漏報的斷言；本補件 A-1 已退役。[已驗證]

第 1、2 項明確選擇「保留 pre-2A 的 null 語意」。Supabase typed `.eq` 不接受 null，因此合法數字仍走 `.eq("session_id", number)`；非法值走 `.is("session_id", null)`。兩個 view 的 `session_id` 都不為 null，所以兩條路仍得到空結果，不會把非法原值送往 PostgREST。[已驗證]

新增測試輸出：[已驗證]

```text
$ node --test tests/session-data-boundary.test.js
ok 40 - invalid session IDs keep the pre-2A null query semantics for preview and messages
1..60
# tests 60
# pass 60
# fail 0
EXIT=0
```

[推論] 現行 controller 呼叫點傳入 `context.session.sessionId` 等數字；新增測試另外守住 `.js` 或外部 caller 傳入非法值的失敗路徑，因此沒有 e2e 需要依賴 2A 的「原值回退」差異。

## 五、完整驗收

### 5.1 Frontend CI

```text
$ npm run test:ci:frontend
--check 通過:產出檔案與 data/courts.json 重生結果一致。
All matched files use Prettier code style!
# tests 296
# pass 296
# fail 0
4 skipped
270 passed (2.4m)
✓ built in 893ms
production bundle check passed: 28 files, 12 demo identifiers absent; main chunk 633597/184547 bytes within 703886/203176
EXIT=0
```

Node 測試由 295 增為 296，唯一變因是新增 A-3 null 語意測試。[已驗證]

### 5.2 pgTAP

```text
$ npm run test:db
All tests successful.
Files=7, Tests=799,  3 wallclock secs
Result: PASS
EXIT=0
```

### 5.3 Local 真 RPC／browser

第一次在未重置的累積 DB 上執行：[已驗證]

```text
$ npm run test:local
1 failed
11 skipped
3 did not run
38 passed (1.5m)
```

失敗是 `session.spec.js:2237` 新帳號首次儲存後預期全球場訂閱；先前焦點測試 `session.spec.js:488` 已通過。依 Supabase 規則重置：[已驗證]

```text
$ CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test
Finished supabase db reset on branch claude/tennis-partner-finder-proto-xfrr6g.
{"target":"local","version":"","message":"Reset local database."}
EXIT=0
```

重置後完整重跑：[已驗證]

```text
$ npm run test:local
# tests 2
# pass 2
# fail 0
Running 53 tests using 1 worker
11 skipped
42 passed (1.3m)
EXIT=0
```

`did not run` 已歸零；第 50～53 條訂閱 seed 測試全部執行且通過。[已驗證] 因同一份 code 在重置前失敗、重置後通過，首次紅燈判為累積 local fixture 狀態，而非本補件回歸。[推論]

### 5.4 Diff／範圍

```text
$ git diff --check
（空輸出）

$ git diff --name-only 6d3d4f0..HEAD
src/data/index.ts
src/data/repositories/dataRepository.ts
tests/session-data-boundary.test.js
```

## 六、未做／限制

- 未修改生成檔 `src/data/databaseTypes.ts`；其 RPC Args 缺 SQL nullability 的限制，以 repository 內由生成型別推導、只補 null 的型別映射處理。[已驗證]
- 未做 F2-6～F2-9、F2-1～F2-4、drawer cleanup、規則／GOLDEN／testid／文案調整。[已驗證]
- 未執行 hosted migration、遠端檢查或 push；本批沒有 schema 變更。[已驗證]
- 沒有已知未完成的 A-1／A-2／A-3 驗收項目。[已驗證]
