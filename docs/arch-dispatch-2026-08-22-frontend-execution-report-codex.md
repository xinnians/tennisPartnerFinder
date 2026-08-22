# 前端架構批 0 起手執行報告（F0-1、F0-2、F0-3、F0-5）

- 派工單：`docs/arch-dispatch-2026-08-22-frontend.md`
- 執行分支：`claude/tennis-partner-finder-proto-xfrr6g`
- 基準：`1f0979a`
- 最終實作 HEAD：`7d1fb66`
- 執行日期：2026-08-22（Asia/Taipei）
- 執行者：Codex

## 0. 結論摘要

- [已驗證] F0-1、F0-2、F0-3、F0-5 均已完成；F0-2 commit 先於 F0-3。
- [已驗證] F0-5 的純 formatting、覆蓋範圍、type-aware、import boundary 分成四個獨立 commit。
- [已驗證] 最終獨立全分支 code review verdict 為 `Ready to merge: Yes`，無剩餘 actionable finding。
- [已驗證] 最終 `npm run test:ci:frontend`：290 個 Node tests 全過、Playwright 266 passed／4 skipped、build 與 production bundle gate 通過。
- [已驗證] 實作 commit 完成時工作樹乾淨，分支相對 origin ahead 7。
- [不確定] `npm run test:local` 因本機 Docker daemon 未啟動而無法執行；未啟動 Docker、未重置任何資料庫。本單沒有 migration，未跑 `test:db`。
- 本報告檔是後續交付用文件，不包含在上述七個實作 commit 中。

## 1. Commit 清單與順序

```text
4d47616 chore(arch-F0-2): remove dead session view helpers
8e75d2a feat(arch-F0-3): centralize message presentation helpers
293498c test(arch-F0-1): add DOM unit safety net
406bc4d chore(arch-F0-5): format expanded targets
785c58c chore(arch-F0-5): widen lint and format coverage
15d2c41 chore(arch-F0-5): enable type-aware promise lint
7d1fb66 chore(arch-F0-5): enforce data API import boundary
```

[已驗證] `git log --format='%h %s' 1f0979a..HEAD` 的實際輸出（新到舊）：

```text
7d1fb66 chore(arch-F0-5): enforce data API import boundary
15d2c41 chore(arch-F0-5): enable type-aware promise lint
785c58c chore(arch-F0-5): widen lint and format coverage
406bc4d chore(arch-F0-5): format expanded targets
293498c test(arch-F0-1): add DOM unit safety net
8e75d2a feat(arch-F0-3): centralize message presentation helpers
4d47616 chore(arch-F0-2): remove dead session view helpers
```

---

## 2. F0-1：DOM 單元測試層

### 2.1 改了什麼

| 檔案                              | 變更                                                               |
| --------------------------------- | ------------------------------------------------------------------ |
| `package.json`                    | 加入 `happy-dom`，並把兩個新測試檔納入手列的 `test:session-unit`。 |
| `package-lock.json`               | 鎖定 `happy-dom@20.11.6` 與其相依套件。                            |
| `tests/sheets-dom.test.js`        | 以真實 `sheets.js`＋happy-dom 覆蓋殼契約。                         |
| `tests/messages-page-dom.test.js` | 透過 Vite SSR loader 載入 TSX，驗證 MessagesPage 基本渲染輸出。    |

[推論] 選擇 happy-dom 而非 jsdom：可直接搭配現有 Node test runner，支援本測試所需的 DOM、focus、inert 行為，且不引入 Vitest。Messages SSR server 使用 `optimizeDeps: { noDiscovery: true }`，避免 Vite 關閉時的背景 dependency scan 競態噪音。

### 2.2 殼契約覆蓋

- [已驗證] 關閉時先 `unmountContent`，再清除 `innerHTML`。
- [已驗證] `unmountContent` 拋錯時仍會完成殼清理，之後重拋錯誤。
- [已驗證] 兩層 surface 按 Escape 只關閉最上層。
- [已驗證] Tab／Shift+Tab 被限制在 sheet 第一與最後可互動控制項。
- [已驗證] 焦點 fallback 鏈涵蓋：重繪後同 session card → drawer collapse → `#nearby-sessions-toggle`。
- [已驗證] MessagesPage 輸出頁面標題、可開啟的球局列與未讀提示。
- [已驗證] Messages row 的 click wiring 仍由 `tests/smoke.spec.js` 實際 click 並驗證 `onOpenChat`；本項派工要求的單元層是「基本渲染輸出」。

### 2.3 針對性驗收輸出

```text
$ node --test tests/sheets-dom.test.js tests/messages-page-dom.test.js
# tests 7
# pass 7
# fail 0

$ node --test tests/ci-config.test.js
# tests 13
# pass 13
# fail 0
```

### 2.4 Canary：破壞卸載／清殼順序

臨時把 `root.innerHTML = ""` 移到 `unmountContent?.()` 前，未提交。

```text
$ node --test tests/sheets-dom.test.js
not ok 1 - 關閉 sheet 時先卸載內容再清空殼
error: |-
  Expected values to be strictly equal:

  false !== true
...
# pass 4
# fail 2
```

[已驗證] Canary 後完整還原 `src/sheets.js`；實作 commit 沒有 production 行為改動。

### 2.5 未做／守門測試

- 沒有引入 Vitest。
- 沒有刪改既有測試或調整計數斷言。
- `tests/ci-config.test.js` 既有 `readdirSync` 對照成功確認兩個新檔均在 aggregate 中；本項不需修改該檔。

---

## 3. F0-2：死碼清除

### 3.1 改了什麼

| 檔案                  | 變更                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/sessionViews.js` | 刪除 `renderDiscoveryEmpty`、`successPushPromptMarkup`、`sessionHostInitial`、`dialogFocusable`，以及專屬 import／輔助內容。 |

### 3.2 刪除當下的反向搜尋

以下以 F0-2 commit `4d47616` 為準，避免 F0-3 後合法共用 helper 造成時間序混淆。

```text
$ git grep -n "renderDiscoveryEmpty" 4d47616 -- src tests scripts
（空輸出；git grep exit 1）

$ git grep -n "successPushPromptMarkup" 4d47616 -- src tests scripts
（空輸出；git grep exit 1）

$ git grep -n "dialogFocusable" 4d47616 -- src tests scripts
（空輸出；git grep exit 1）

$ git grep -n "sessionHostInitial" 4d47616 -- src tests scripts
4d47616:src/pages/MessagesPage.tsx:58:function sessionHostInitial(session: MessagesSession): string {
4d47616:src/pages/MessagesPage.tsx:130:        {sessionHostInitial(session)}
```

[已驗證] 最終 HEAD 的前三個符號仍為空：

```text
$ grep -rn "renderDiscoveryEmpty\|successPushPromptMarkup\|dialogFocusable" src tests scripts
（空輸出）
```

[已驗證] 最終 `sessionHostInitial` 出現在 `src/sessionPresentation.ts`、MessagesPage consumer 與新增契約測試；這是 F0-3 的合法單一來源，不是 F0-2 死碼復活。

### 3.3 未做／守門測試

- 沒有碰 MessagesPage 當時仍活著的本地 `sessionHostInitial`；由後續 F0-3 處理。
- 沒有修改任何既有測試或數字斷言。

---

## 4. F0-3：presentation helper 複本收斂

### 4.1 改了什麼

| 檔案                                          | 變更                                                          |
| --------------------------------------------- | ------------------------------------------------------------- |
| `src/pages/MessagesPage.tsx`                  | 刪除四個本地 helper；改由 `sessionPresentation.ts` 匯入。     |
| `src/sessionPresentation.ts`                  | 新增共用純函式 `sessionScheduleLabel`、`sessionHostInitial`。 |
| `src/sessionViews.js`                         | 刪除本地 `sessionScheduleLabel`，改為 import。                |
| `tests/session-presentation-boundary.test.js` | 新增 schedule／host-initial 契約案例。                        |

`taipeiDayWord`、`sessionVenuePresentation` 直接使用既有 presentation exports；`sessionScheduleLabel`、`sessionHostInitial` 提升進同一 boundary。

### 4.2 TDD 輸出

```text
$ node --test tests/session-presentation-boundary.test.js
not ok 4 - session schedule and host-initial presentation preserve chat labels
error: 'presentation.sessionScheduleLabel is not a function'
```

完成 helper 後：

```text
1..7
# tests 7
# pass 7
# fail 0
```

新增案例驗證：

- candidates 時段：`週一 09:30–11:00 · 主揪 阿玲`
- viewer 是 host：`我`
- nickname initial：`阿`
- fallback initial：`主`

### 4.3 必要 grep 與守門計數

```text
$ grep -n "function taipeiDayWord\|function sessionScheduleLabel\|function sessionHostInitial\|function sessionVenuePresentation" src/pages/MessagesPage.tsx
（空輸出）

$ grep -n "function sessionScheduleLabel" src/sessionViews.js
（空輸出）

$ grep -c "Object.freeze" src/sessionPresentation.ts
13
```

- [已驗證] presentation consumers 維持 14。
- [已驗證] `Object.freeze` 維持 13，未改數字。
- [已驗證] TSX 模組沒有反向 import `sessionViews.js`。
- [已驗證] 沒有修改 Playwright snapshot／既有 Playwright assertions；最終 Playwright mock 全綠。
- [已驗證] 訊息頁 UI 文案與格式沒有改變。

---

## 5. F0-5：lint／format 覆蓋、type-aware 與邊界規則

## 5.1 Commit 拆分

### `406bc4d`：純 formatting

以下 29 檔只含 Prettier 輸出；逐檔以父 commit 內容套用相同 Prettier 後 byte compare，29/29 完全一致。

```text
scripts/generate-courts-seed.mjs
src/main.js
src/map.js
src/notificationPush.js
src/pins.js
src/playerPresence.js
src/sessionController.js
src/sessionViews.js
src/sheets.js
src/supabaseClient.js
tests/filters.test.js
tests/fixtures/fakeMaps.js
tests/fixtures/sessionFactory.js
tests/local-supabase-config.test.js
tests/notification-dispatch.test.js
tests/performance.spec.js
tests/player-presence.test.js
tests/public-brand-scan.test.js
tests/react-surface-lifecycle.test.js
tests/reset-local-test-db.test.js
tests/session-controller-sequence.test.js
tests/session-controller.test.js
tests/session-create-form.test.js
tests/session-data-boundary.test.js
tests/session-data-local-api.test.js
tests/session-mobile.spec.js
tests/session-route.test.js
tests/session.spec.js
tests/smoke.spec.js
```

### `785c58c`：lint／Prettier 覆蓋

| 檔案／群組                                                                                                                                                                                      | 變更                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `eslint.config.js`                                                                                                                                                                              | JS basic lint、browser／Node globals 分流。                 |
| `package.json`、`package-lock.json`                                                                                                                                                             | 擴張 scripts，加入 `@eslint/js@10.0.1`、`globals@17.11.0`。 |
| `tests/ci-config.test.js`                                                                                                                                                                       | 新增 scripts 精確自檢。                                     |
| `src/main.js`、`src/pins.js`、`src/sessionController.js`、`src/sessionCriteria.js`、`src/sessionViews.js`                                                                                       | 只加逐點繁中 lint disable，不改既有 JS 邏輯。               |
| `tests/messages-page-dom.test.js`、`tests/public-brand-scan.test.js`、`tests/session-controller.test.js`、`tests/session-data-boundary.test.js`、`tests/session.spec.js`、`tests/smoke.spec.js` | 只加逐點繁中 lint disable，不改測試語意。                   |

最終 scripts：

```text
lint:
eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts

prettier:check:
prettier --check "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts package.json package-lock.json tsconfig.json vercel.json
```

### `15d2c41`：type-aware Promise lint

| 檔案                             | 變更                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `eslint.config.js`               | TS／TSX 與 `vite.config.ts` 升至 `recommendedTypeChecked`、啟用 project service、兩條 Promise 規則為 error。 |
| `src/pages/MePage.tsx`           | 在既有 Promise chain 前加 `void`。                                                                           |
| `src/sheets/PlayerCardSheet.tsx` | React form callback 以 `void handleSubmit(event)` 保持 void callback 契約。                                  |

### `7d1fb66`：data import boundary

| 檔案                                                      | 變更                                                                                                      |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `eslint.config.js`                                        | 封鎖 static／dynamic `supabaseClient`、mapper、repository 深路徑；非 literal dynamic import fail closed。 |
| `src/dataApi.js`                                          | curated re-export `isSupabaseConfigured`。                                                                |
| `src/main.js`                                             | `isSupabaseConfigured` 改由既有 dataApi import 取得。                                                     |
| `src/features/notifications/notificationFeature.ts`       | `isSupabaseConfigured` 改由既有 dataApi import 取得。                                                     |
| `src/controllerContracts.ts`                              | 兩條既有 type-only mapper import 加逐行繁中白名單。                                                       |
| `src/features/discovery/discoveryFeature.ts`              | 一條既有 type-only mapper import 加逐行繁中白名單。                                                       |
| `src/features/player-directory/playerDirectoryFeature.ts` | 一條既有 type-only mapper import 加逐行繁中白名單。                                                       |

[已驗證] `isSupabaseConfigured` 仍是同一個 module binding；沒有新增 repository 行為、沒有改 RPC 或 `dataApi` 操作語意。

## 5.2 三個必要 Canary

### 未格式化 `.js`

暫增 `scripts/__format_canary__.js` 後：

```text
[warn] scripts/__format_canary__.js
[warn] Code style issues found in the above file. Run Prettier with --write to fix.
```

### Floating Promise

暫增：

```ts
async function floatingPromiseCanary(): Promise<void> {}

floatingPromiseCanary();
```

實際紅燈：

```text
/Users/ianlin/tennisPartnerFinder/src/__floating_promise_canary__.ts
  3:1  error  Promises must be awaited, end with a call to .catch, end with a call to .then with a rejection handler or be explicitly marked as ignored with the `void` operator  @typescript-eslint/no-floating-promises

✖ 1 problem (1 error, 0 warnings)
```

### 越界 import

暫增 static Supabase import；規則落地但 consumer 尚未遷移時的完整紅燈：

```text
> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts


/Users/ianlin/tennisPartnerFinder/src/__restricted_import_canary__.ts
  1:1  error  './supabaseClient.js' import is restricted from being used by a pattern. 禁止直接匯入 supabaseClient；請改由 dataApi facade 存取。  no-restricted-imports

/Users/ianlin/tennisPartnerFinder/src/features/notifications/notificationFeature.ts
  13:1  error  '../../supabaseClient.js' import is restricted from being used by a pattern. 禁止直接匯入 supabaseClient；請改由 dataApi facade 存取。  no-restricted-imports

/Users/ianlin/tennisPartnerFinder/src/main.js
  81:1  error  './supabaseClient.js' import is restricted from being used by a pattern. 禁止直接匯入 supabaseClient；請改由 dataApi facade 存取。  no-restricted-imports

✖ 3 problems (3 errors, 0 warnings)
```

[已驗證] `.js` 副檔名、extensionless、目錄、尾斜線、mapper value import 都會被拒絕。

## 5.3 Review 補強 Canary

全分支 review 發現 `no-restricted-imports` 不處理 `import()`，以及原 path-wide type-only pattern 會讓相同深度的新 consumer 自動通過。修正前以下兩檔同跑 lint 為 exit 0：

```js
void import("./supabaseClient.js");
```

```ts
import type { DataCourt } from "./data/mappers/profileMappers.ts";
export type RestrictedMapperTypeCanary = DataCourt;
```

修正後：

```text
/Users/ianlin/tennisPartnerFinder/src/__restricted_dynamic_import_canary__.js
  1:6  error  禁止動態匯入資料層內部；請改由 dataApi facade 存取。  no-restricted-syntax

/Users/ianlin/tennisPartnerFinder/src/__restricted_mapper_type_canary__.ts
  1:1  error  './data/mappers/profileMappers.ts' import is restricted from being used by a pattern. 禁止直接匯入 data 內部 mapper；請改由 dataApi facade 存取。  no-restricted-imports

✖ 2 problems (2 errors, 0 warnings)
```

再驗 template literal／字串串接：

```js
void import(`./supabaseClient.js`);
void import("./" + "supabaseClient.js");
```

```text
/Users/ianlin/tennisPartnerFinder/src/__restricted_nonliteral_import_canary__.js
  1:6  error  動態 import 路徑必須使用字串 literal，以便靜態驗證資料邊界。  no-restricted-syntax
  2:6  error  動態 import 路徑必須使用字串 literal，以便靜態驗證資料邊界。  no-restricted-syntax

✖ 2 problems (2 errors, 0 warnings)
```

[已驗證] 所有 canary 都以 `apply_patch` 刪除；最終 canary 檔案掃描為空。

## 5.4 Promise 修正與 disable 清單

### Promise 最小修正

- `src/pages/MePage.tsx:624`：`void Promise.resolve(onLinkProvider(provider)).finally(...)`；Promise、finally callback 與按鈕復原順序不變。
- `src/sheets/PlayerCardSheet.tsx:222`：`onSubmit={(event) => void handleSubmit(event)}`；沒有加入 `await`、沒有改 `catch`／`finally` 時序。
- [已驗證] 沒有 Promise rule 的 inline disable。

### 暫時關閉的九個既有 type-aware 規則

每條設定前均有繁中註解：「既有 type-aware 型別債，本批不改變既有程式語意。」

| 規則                             |                設定行 | 初始 finding | 理由                                 |
| -------------------------------- | --------------------: | -----------: | ------------------------------------ |
| `no-redundant-type-constituents` | `eslint.config.js:62` |            9 | 既有型別組合問題，本批不改型別語意。 |
| `no-unnecessary-type-assertion`  | `eslint.config.js:64` |            4 | 移除斷言會改既有型別表達。           |
| `no-unsafe-return`               | `eslint.config.js:66` |            8 | 修正需調整資料回傳契約。             |
| `no-unsafe-call`                 | `eslint.config.js:68` |            4 | 修正可能改變資料呼叫語意。           |
| `no-unsafe-member-access`        | `eslint.config.js:70` |           23 | 需逐一收斂既有 `any` 成員存取。      |
| `no-unsafe-assignment`           | `eslint.config.js:72` |            6 | 需修改既有型別與資料流程。           |
| `no-base-to-string`              | `eslint.config.js:74` |            2 | 改寫可能影響 UI 字串化。             |
| `no-unsafe-argument`             | `eslint.config.js:76` |            1 | 需先釐清資料契約。                   |
| `unbound-method`                 | `eslint.config.js:78` |           60 | 修正範圍大且可能影響 `this` 綁定。   |

### 29 個既有 JS lint disable

共同理由：`既有 JS lint 債；本批只擴大守門範圍，不改執行語意。`

```text
src/main.js:372                                      no-useless-assignment
src/pins.js:2                                        no-unused-vars
src/sessionController.js:1659                        no-useless-assignment
src/sessionController.js:1755                        no-useless-assignment
src/sessionController.js:1863                        preserve-caught-error
src/sessionController.js:1947                        no-useless-assignment
src/sessionCriteria.js:16                            no-extra-boolean-cast
src/sessionViews.js:1                                no-unused-vars
src/sessionViews.js:16                               no-unused-vars
src/sessionViews.js:17                               no-unused-vars
src/sessionViews.js:29                               no-unused-vars
src/sessionViews.js:889                              no-unused-vars
tests/ci-config.test.js:22                           no-regex-spaces
tests/ci-config.test.js:29                           no-regex-spaces
tests/ci-config.test.js:31                           no-regex-spaces
tests/ci-config.test.js:87                           no-useless-escape
tests/ci-config.test.js:139                          no-regex-spaces
tests/ci-config.test.js:174                          no-regex-spaces
tests/ci-config.test.js:180                          no-regex-spaces
tests/messages-page-dom.test.js:44                   no-useless-escape
tests/public-brand-scan.test.js:9                    no-unused-vars
tests/session-controller.test.js:3722                no-unused-vars
tests/session-data-boundary.test.js:415              no-regex-spaces
tests/session.spec.js:635                            no-unused-vars
tests/session.spec.js:709                            no-unused-vars
tests/smoke.spec.js:2285                             no-useless-escape
tests/smoke.spec.js:3535                             no-useless-escape
tests/smoke.spec.js:3538                             no-useless-escape
tests/smoke.spec.js:3734                             no-useless-escape
```

## 5.5 import boundary 白名單

### 設定層級白名單

- `src/data/**`：資料層內部可以引用其 implementation modules。
- `src/dataApi.js`：唯一 curated facade，必須引用 mapper、repository 與 Supabase configuration 才能輸出批准能力。

### 五個既有 type-only 白名單

以下均為逐行繁中 `eslint-disable-next-line no-restricted-imports`；不存在相對深度或 path-wide 自動放行。

| 檔案:行                                                     | 型別                                                         | 理由                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| `src/controllerContracts.ts:11`                             | `DataCourt`、`MyPlayerBlock`、`PlayerPresenceDirectoryEntry` | controller contract 純型別；現有 JS facade 無 type barrel。   |
| `src/controllerContracts.ts:13`                             | `MapBounds`                                                  | controller map bounds 純型別；現有 JS facade 無 type barrel。 |
| `src/features/discovery/discoveryFeature.ts:6`              | `MapBounds`                                                  | discovery bounds 純型別；現有 JS facade 無 type barrel。      |
| `src/features/notifications/notificationFeature.ts:12`      | `DataCourt`                                                  | 通知球場純型別；現有 JS facade 無 type barrel。               |
| `src/features/player-directory/playerDirectoryFeature.ts:4` | `PlayerDirectoryEntry`、`PlayerPresenceDirectoryEntry`       | 玩家目錄純型別；現有 JS facade 無 type barrel。               |

最終反向掃描：

```text
$ rg -n --glob 'src/**/*.{js,ts,tsx}' 'supabaseClient|data/(mappers|repositories)' src
src/controllerContracts.ts:11:import type { DataCourt, MyPlayerBlock, PlayerPresenceDirectoryEntry } from "./data/mappers/profileMappers.ts";
src/controllerContracts.ts:13:import type { MapBounds } from "./data/mappers/queryMappers.ts";
src/dataApi.js:1:import { createDataApi } from "./data/repositories/dataRepository.ts";
src/dataApi.js:11:export { isSupabaseConfigured } from "./supabaseClient.js";
src/dataApi.js:18:} from "./data/mappers/profileMappers.ts";
src/dataApi.js:25:} from "./data/mappers/sessionMappers.ts";
src/dataApi.js:39:} from "./data/repositories/selects.ts";
src/features/notifications/notificationFeature.ts:12:import type { DataCourt } from "../../data/mappers/profileMappers.ts";
src/features/player-directory/playerDirectoryFeature.ts:4:import type { PlayerDirectoryEntry, PlayerPresenceDirectoryEntry } from "../../data/mappers/profileMappers.ts";
src/features/discovery/discoveryFeature.ts:6:import type { MapBounds } from "../../data/mappers/queryMappers.ts";
src/data/repositories/dataRepository.ts:9:import { isSupabaseConfigured, supabase } from "../../supabaseClient.js";
src/data/authApi.ts:1:import { isSupabaseConfigured, supabase, SUPABASE_AUTH_STORAGE_KEY } from "../supabaseClient.js";
```

[已驗證] 結果只含 data layer 自身、dataApi facade 與上表五個逐行 type-only 例外。

---

## 6. 守門測試調整（單獨列示）

- `tests/session-presentation-boundary.test.js`：新增 helper 契約案例；沒有改 consumer 計數，沒有改 `Object.freeze` 計數。
- `tests/ci-config.test.js`：新增一個 lint／Prettier scripts 精確自檢；沒有靜默修改既有數字斷言。最終該檔為 13/13 passed。
- `package.json`：`test:session-unit` 手列新增 `tests/sheets-dom.test.js`、`tests/messages-page-dom.test.js`。
- [已驗證] 沒有刪除既有測試。
- [已驗證] 沒有為綠燈修改 Playwright snapshot 或既有 Playwright assertions。
- [已驗證] presentation consumers 維持 14；`Object.freeze` 維持 13。

---

## 7. 最終重跑驗收

### 7.1 靜態檢查

```text
$ npm run lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts
exit 0

$ npm run prettier:check
Checking formatting...
All matched files use Prettier code style!
exit 0

$ npm run typecheck
> tsc --noEmit
exit 0

$ git diff --check
（空輸出；exit 0）
```

### 7.2 ci-config

```text
$ node --test tests/ci-config.test.js
1..13
# tests 13
# pass 13
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

### 7.3 最終 `npm run test:ci:frontend` 尾段

```text
ℹ tests 290
ℹ suites 0
ℹ pass 290
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0

Running 270 tests using 1 worker
  4 skipped
  266 passed (2.7m)

> tennis-partner-finder@0.1.0 build
> vite build

vite v6.4.3 building for production...
✓ 148 modules transformed.
...
dist/assets/index-ho-HLxon.js  639.83 kB │ gzip: 184.52 kB
✓ built in 757ms

> tennis-partner-finder@0.1.0 check:production-bundle
> node scripts/check-production-bundle.mjs

production bundle check passed: 28 files, 12 demo identifiers absent; main chunk 639827/184520 bytes within 703886/203176
```

[已驗證] 聚合 command 完成 exit 0；最後一段 `git diff --check` 亦成功，否則 `&&` chain 不會完成。

### 7.4 最終 grep

```text
$ grep -rn "renderDiscoveryEmpty\|successPushPromptMarkup\|dialogFocusable" src tests scripts
（空輸出）

$ grep -n "function taipeiDayWord\|function sessionScheduleLabel\|function sessionHostInitial\|function sessionVenuePresentation" src/pages/MessagesPage.tsx
（空輸出）

$ grep -n "function sessionScheduleLabel" src/sessionViews.js
（空輸出）

$ rg --files src tests scripts | rg '__.*canary|canary.*\.(js|ts)$'
（空輸出）
```

---

## 8. 未做／環境限制

`src/` runtime 有變動，因此嘗試執行 local Supabase suite 前先跑：

```text
$ npx supabase status
{"linked_project":{"project_ref":"ttjzxhihctrtoqdsqxdb","project_name":"TennisPartnetFinder","org_slug":"ynibelucqmtfwlalwzyk","org_id":"ynibelucqmtfwlalwzyk"},"_tag":"Error","error":{"code":"LegacyStatusDbInspectError","message":"failed to inspect container health: Cannot connect to the Docker daemon at unix:///Users/ianlin/.docker/run/docker.sock. Is the docker daemon running?"}}
```

- [不確定] `npm run test:local` 未執行，原因是 Docker daemon 未啟動，而非測試失敗。
- 沒有擅自啟動 Docker。
- 沒有重置或修改任何本機／hosted 資料庫。
- 本單沒有 migration，依規則不需跑 `test:db`。
- 沒有執行 push、PR 或 merge。

---

## 9. Code review 紀錄

### F0-1 review

- 初次發現 focus fallback 未明確覆蓋 `#nearby-sessions-toggle`；已補案例並重審關閉。
- 發現 Vite server 關閉 dependency scan 噪音；加入 `optimizeDeps.noDiscovery` 並重驗無噪音。

### F0-5 review

- type-aware scope 初版誤含未受 tsconfig 管理的 Supabase Edge Function；已收斂到 `src/**/*.{ts,tsx}` 與 `vite.config.ts`，finding 關閉。
- boundary 初版未擋 mapper／repository 目錄 barrel；已加入精確目錄 regex，finding 關閉。
- 全分支 review 發現 dynamic `import()` 與 path-wide type-only 白名單漏洞；已改為 `ImportExpression` restriction、非 literal fail-closed、五個逐行白名單，finding 關閉。
- reviewer 曾建議 MessagesPage DOM test 加 click；依派工原文「基本渲染輸出」與既有 Playwright click coverage 提出技術性 pushback，reviewer 重審後關閉。

最終 reviewer assessment：

```text
Ready to merge? Yes.
Finding 1、Finding 2 均已關閉，無剩餘 actionable finding。
```

---

## 10. Claude 建議重跑指令

```bash
git status --short --branch
git log --format='%h %s' 1f0979a..7d1fb66

git grep -n "renderDiscoveryEmpty" 4d47616 -- src tests scripts
git grep -n "successPushPromptMarkup" 4d47616 -- src tests scripts
git grep -n "sessionHostInitial" 4d47616 -- src tests scripts
git grep -n "dialogFocusable" 4d47616 -- src tests scripts

grep -n "function taipeiDayWord\|function sessionScheduleLabel\|function sessionHostInitial\|function sessionVenuePresentation" src/pages/MessagesPage.tsx
grep -n "function sessionScheduleLabel" src/sessionViews.js

node --test tests/sheets-dom.test.js tests/messages-page-dom.test.js
node --test tests/ci-config.test.js
npm run lint
npm run prettier:check
npm run typecheck
npm run test:ci:frontend
git diff --check
```

注意：前三個預期為空的 `git grep`／`grep` 指令會以 exit 1 表示「無命中」，不是驗收失敗；應檢查其標準輸出確實為空。
