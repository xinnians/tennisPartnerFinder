# 批 2A 派工單：型別鏈地基（F2-5 a／b／c／d）

- 日期：2026-08-24
- 母派工單：`docs/arch-dispatch-2026-08-22-frontend.md`（批 2 的 F2-5）
- 開工基準：`c6e4238`
- 批 2 切分：**2A 型別鏈 → 2B 小項打包 → 2C controller 拆分＋auth 差分 → 2D sessionViews facade＋main.js 拆分**，依序執行。
  後三張在各自的前一批驗收通過後才會發出（避免 ground truth 過時）。

## 開工前必讀（讀磁碟上的現行版本，不要用記憶或舊快照）

1. `CLAUDE.md`（特別是「存量 `.js` 採 allowJs、不開 checkJs，不因工具鏈導入強制改寫」）
2. `.claude/rules/supabase.md`
3. `docs/arch-dispatch-2026-08-22-frontend.md`（總則＋驗收協定）

---

## 為什麼 2A 先做

2C 拆出的 controller orchestrator 與 2D 拆出的 view 模組都要直接寫 `.ts`。型別鏈修好之前拆，
新模組會繼承 `rowsAs`／`as unknown as` 的弱型別，等於把技術債複製到新檔案。

**本批不動任何大檔結構**：`sessionController.js`、`sessionViews.js`、`main.js` 除了
F2-5(d) 那一行以外不得改動。

---

## Ground truth（驗收方 2026-08-24 實測，直接用，不必重查）

母派工單寫於 2026-08-22，批 0／批 1／F0-9 之後有多項數字已變。以下是現況：

| 項目 | 母派工單 | 現況 |
| --- | --- | --- |
| `as unknown as` | 「移除斷言」 | 只剩 **4 處** |
| `error?.name ===` | 「現為字串比對」 | 只剩 **1 處** |
| `rowsAs<>` 呼叫 | 未列 | **10 處**（另有 `rowAs`） |
| `src/data/index.ts` barrel | 「或」 | **不存在** |

### (a) 型別斷言的實際分布

```text
$ grep -rn "as unknown as" src/
src/data/authApi.ts:35:  return supabase as unknown as AuthClient;
src/data/repositories/dataRepository.ts:186:  client = supabase as unknown as RepositoryClient | null,
src/features/discovery/discoveryFeature.ts:13:const filterSessionRows = filterSessions as unknown as (
src/features/discovery/discoveryFeature.ts:18:const sortSessionRows = sortSessionsForDrawer as unknown as (
```

**只有前兩處與 supabase 型別有關**；`discoveryFeature.ts` 那兩處是在轉換
filter／sort 函式的簽名，與本項無關，**不要順手動它們**。

```text
$ grep -n "rowsAs<" src/data/repositories/dataRepository.ts
152（定義）/ 233 / 258 / 277 / 296 / 323 / 335 / 351 / 364 / 375 / 407
（另有 rowAs，定義於 :156）
```

`src/data/repositories/dataRepository.ts:152-158`：

```ts
function rowsAs<Row>(value: unknown): Row[] {
  return asArray(value) as Row[];
}

function rowAs<Row>(value: unknown): Row {
  return (value ?? {}) as Row;
}
```

`src/supabaseClient.js` 目前不帶泛型：

```js
export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, { auth: { ... } })
  : null;
```

`src/data/databaseTypes.ts:5` 已匯出 `Database` 型別（1,970 行生成檔，
`npm run db:gen-types` 產生，**不可手改**）。

**`supabaseClient` 的全部消費者**（改副檔名時一個都不能漏）：

```text
src/dataApi.js:11                  export { isSupabaseConfigured } from "./supabaseClient.js";
src/data/authApi.ts:1              import { isSupabaseConfigured, supabase, SUPABASE_AUTH_STORAGE_KEY } from "../supabaseClient.js";
src/data/repositories/dataRepository.ts:9   import { isSupabaseConfigured, supabase } from "../../supabaseClient.js";
tests/session.spec.js:467          await window.__importAppModule("supabaseClient")   ← 走 appRuntime 副檔名表
tests/reset-local-test-db.test.js:9         import { SUPABASE_AUTH_STORAGE_KEY } from "../src/supabaseClient.js";
tests/fixtures/localSupabase.js:2           import { SUPABASE_AUTH_STORAGE_KEY } from "../../src/supabaseClient.js";
```

`tests/fixtures/appRuntime.js:2`：`const APP_MODULE_EXTENSIONS = Object.freeze({ districts: ".ts" });`
——已有 `.ts` 前例。

### (b) literal union 與其產生點

`src/domainTypes.ts:3-11` 共九個 union：

```ts
export type SportCode = "tennis";
export type PlayType = "單打" | "雙打" | "對拉" | "練球";
export type SessionStatus = "open" | "full" | "cancelled" | "played" | "expired";
export type SessionJoinMode = "approval" | "instant";
export type SessionVenueType = "booked" | "walk_on" | "candidates";
export type SessionParticipantRole = "host" | "guest";
export type SessionParticipantStatus = "requested" | "invited" | "accepted" | "declined" | "withdrawn";
export type SessionMessageKind = "user" | "system";
export type ProfileSlotCode = "wd-m" | "wd-a" | "wd-e" | "we-m" | "we-a" | "we-e";
```

目前 mapper 端一律用**裸斷言**把任意字串斷成 union（這就是要修的「說謊」）：

```text
src/data/mappers/sessionMappers.ts:34   playType: asText(row.play_type) as PlayType,
src/data/mappers/sessionMappers.ts:43   status: asText(row.status) as SessionSummary["status"],
src/data/mappers/sessionMappers.ts:70   playType: asText(session.playType) as PlayType,
src/data/mappers/sessionMappers.ts:141  playTypes: asArray(row.play_types).filter(...) as PlayType[],
src/data/mappers/sessionMappers.ts:144  status: asText(row.status) as SessionParticipantStatus,
src/data/mappers/profileMappers.ts:92   playTypes: asArray(row.play_types) as PlayType[],
src/data/mappers/profileMappers.ts:93   slotCodes: asArray(row.slot_codes) as ProfileSlotCode[],
src/data/mappers/profileMappers.ts:141  types: new Set(...) as PlayType[],
src/data/mappers/profileMappers.ts:143  slots: new Set(...) as ProfileSlotCode[],
```

**DB 端沒有 PG enum**，允許值寫在 migration 的 CHECK 約束裡，那才是 ground truth：

```text
supabase/migrations/202607020001_initial_mvp_schema.sql:36
  play_type text not null check (play_type in ('單打', '雙打', '對拉', '練球'))
supabase/migrations/202607210001_session_join_mode.sql:3
  check (join_mode in ('approval', 'instant'))
supabase/migrations/202607270001_venue_types_profile_gates.sql:4
  venue_type text not null default 'booked' check (venue_type in ('booked', 'walk_on', 'candidates'))
```

（其餘 union 的約束自行在 `supabase/migrations/` 反查，`databaseTypes.ts` 的
`Enums` 是 `[_ in never]: never`，幫不上忙。）

### (c) barrel 與過時註解

`src/data/` 目前只有 `authApi.ts`、`dataErrors.ts`、`databaseTypes.ts`、`mappers/`、
`repositories/`，**沒有 `index.ts`**。

`src/domainTypes.ts:1`：

```ts
/** Core domain shapes returned by the allowlisted mappers in dataApi.js. */
```

過時之處：實作早已搬到 `src/data/`，`dataApi.js` 現在是 80 行純 facade。

### (d) 錯誤分流

全庫只剩一處字串比對，`src/sessionController.js:1836-1841`：

```js
    } catch (error) {
      if (error?.name === "DataApiUnavailableError") {
        // eslint-disable-next-line preserve-caught-error -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
        throw new Error("本機示範資料僅供瀏覽；登入、儲存個人檔案與建立球局需在已設定服務的環境使用。");
      }
      throw error;
    }
```

`DataApiUnavailableError` 是真的 class（`src/data/dataErrors.ts:91`，
繼承 `DataApiError`），並由 `src/dataApi.js:12` re-export。
既有測試已經以 class 形式使用它，`instanceof` 不會打到偽造物件：

```text
tests/session-data-boundary.test.js:1680
  await assert.rejects(() => postSessionMessage(81, "預設 API 訊息"), DataApiUnavailableError);
```

---

## F2-5(a) supabaseClient 帶 `Database` 泛型，移除 client 斷言

### 目標

讓 `supabase` 帶 `Database` 泛型，使 `authApi.ts:35` 與 `dataRepository.ts:186` 的
`as unknown as` 消失，並讓 `rowsAs`／`rowAs` 從「無根據的斷言」變成「型別已由 client
推導、只需要 runtime 防禦」——或直接退役。

### 作法約束

1. **兩條路自選，但要說明理由**：
   - 把 `src/supabaseClient.js` 改成 `.ts`。要同步 `tests/fixtures/appRuntime.js:2`
     的副檔名表、`tests/reset-local-test-db.test.js:9` 與
     `tests/fixtures/localSupabase.js:2` 的直接路徑 import。
   - 或維持 `.js`，以 JSDoc 型別標註供給泛型。這條不動任何消費者，但 CLAUDE.md 的
     「存量 .js 不因工具鏈強制改寫」原則本來就偏好這條。
2. **`rowsAs`／`rowAs` 的處置要逐個判斷，不要一刀全刪**。有些呼叫點的 `data` 來自
   RPC 回傳（型別本來就是 `Json`），泛型幫不上忙——那幾處保留是對的，但要在報告中
   列出「哪幾處退役、哪幾處保留、保留的理由」。
3. `src/data/databaseTypes.ts` 是生成檔，**一行都不准手改**。
4. 不動 `src/features/discovery/discoveryFeature.ts:13/18` 那兩處無關的斷言。

### 驗收條件

1. `grep -rn "as unknown as" src/` 的輸出從 4 處降到 **2 處**（只剩
   `discoveryFeature.ts:13/18`），附前後完整輸出。
2. `rowsAs`／`rowAs` 的前後呼叫點計數，以及逐處「退役／保留＋理由」表。
3. `npm run typecheck` 綠。**並附一個 canary**：故意在某個 repository 方法裡 select
   一個不存在的欄位（或把回傳型別接到錯的 mapper），證明 `typecheck` 會紅——
   這是本項唯一能證明「型別鏈真的接上了」的證據，存量綠不算。還原後再附綠燈。
4. 若選了改副檔名：附 `grep -rn "supabaseClient" src tests scripts` 的前後對照，
   證明六個消費者全部同步，且 `tests/session.spec.js:467` 的 `__importAppModule`
   仍可解析（`node --test tests/ci-config.test.js` 綠）。
5. `npm run test:ci:frontend` 全綠。

---

## F2-5(b) literal union 加 runtime guard

### 目標

九個 union 目前靠裸斷言產生，DB 若出現前端不認識的值，型別系統會說謊而 UI 行為未定義。
改成明確的 guard：已知值原樣通過，未知值走**明文寫死的 fallback**。

### 作法約束

1. **不得改變任何現行可觀察行為**。判準：guard 的 accept-list 必須涵蓋 DB CHECK
   約束目前允許的**全部**值。fallback 只對「今天不可能出現的值」生效。
2. 每個 union 的 accept-list 要以 `supabase/migrations/` 的 CHECK 約束為依據，
   在報告中逐一附上 `檔案:行號` 與約束原文。**不要從 `domainTypes.ts` 反推**——
   那正是要驗證的對象，拿它當證據會變成自我證成。
3. fallback 的選擇原則：**保守、不誤導使用者**。例如未知 `status` 不可 fallback 成
   `open`（會讓使用者看到不該顯示的球局）。每個 fallback 的選擇與理由逐一寫進報告。
4. guard 放在 mapper 層（資料邊界的入口），不要散到 UI。

### 驗收條件

1. 九個 union 各附：accept-list、對應的 migration CHECK 原文（`檔案:行號`）、
   fallback 值與選擇理由。
2. 每個 guard 至少一個單元測試：已知值原樣通過、未知值走 fallback。
   測試檔若是新增的 `tests/*.test.js`，必須同步 `package.json` 的
   `test:session-unit`（`tests/ci-config.test.js:65-71` 會自動比對目錄，漏加就紅）。
3. `grep -rn " as PlayType\| as SessionStatus\| as SessionParticipantStatus\| as ProfileSlotCode" src/data/`
   的前後計數，證明裸斷言已被 guard 取代（保留的要說明理由）。
4. **行為零變化**：`npm run test:ci:frontend` 全綠，且 124 筆 GOLDEN
   （`tests/session-controller-sequence.test.js`）逐字不變——附
   `git diff <基準> HEAD -- tests/session-controller-sequence.test.js` 空輸出。

---

## F2-5(c) domain 型別歸位與過時註解修正

### 目標

補一個 `src/data/index.ts` barrel（或把散落的 domain 型別集中到 `domainTypes.ts`），
並修正 `domainTypes.ts:1` 指向錯誤位置的註解。

### 作法約束

1. **不得放寬既有的 import 邊界**。`eslint.config.js` 已禁止 `src/**`
   （`src/data/**`、`src/dataApi.js` 除外）直接 import
   `src/data/mappers|repositories` 深路徑。新 barrel 若讓外部繞過 facade，
   等於自己拆掉 F0-5 建好的守門——**barrel 只可匯出型別，不得匯出 runtime 值**。
2. `src/dataApi.js` 仍是唯一的瀏覽器資料邊界（CLAUDE.md 紅線），本項不得改變這一點。

### 驗收條件

1. 新 barrel 的匯出清單，逐項標示是型別還是 runtime 值（應全為型別）。
2. **canary**：從 `src/pages/` 任一檔透過新 barrel import 一個 runtime 值，
   證明 `no-restricted-imports`／`typecheck` 會紅；還原後綠。
3. `domainTypes.ts:1` 的新註解內容，並說明舊註解錯在哪。
4. `npm run test:ci:frontend` 全綠。

---

## F2-5(d) 錯誤分流改 `instanceof`

### 目標

`src/sessionController.js:1837` 的 `error?.name === "DataApiUnavailableError"`
改成 `error instanceof DataApiUnavailableError`。

### 作法約束

1. 這是全庫**唯一**一處，不要去找別的地方改。
2. `sessionController.js` 是 `.js`，import 走 `src/dataApi.js` 的 re-export
   （`dataApi.js:12`），不得繞過 facade 直接 import `src/data/dataErrors.ts`。
3. 那行上方的 `// eslint-disable-next-line preserve-caught-error` 若因改法而不再需要，
   可以移除；**但不要為了移除它而改變 throw 的內容或 cause 語意**。若要加
   `{ cause: error }`，那是行為變更，需要在報告中單獨說明並確認沒有 e2e 依賴。

### 驗收條件

1. `grep -rn "error?.name ===\|error.name ===" src/` 空輸出。
2. **canary**：暫時丟一個 `name` 為 `"DataApiUnavailableError"` 但**不是**該 class
   實例的錯誤，證明新寫法不會再誤判（附輸出）；還原。
3. mock 模式下「未設定 Supabase 時建立球局」的既有錯誤文案逐字不變——
   附對應 e2e 或單元測試的實際輸出。
4. `npm run test:ci:frontend` 全綠。

---

## 不在範圍（不要順手做）

1. **不動 `sessionController.js`／`sessionViews.js`／`main.js` 的結構**——
   除了 F2-5(d) 那一行。那三個檔的拆分是 2C／2D。
2. 不動 `src/features/discovery/discoveryFeature.ts:13/18` 的兩處斷言。
3. 不動 `src/data/databaseTypes.ts`（生成檔）。
4. 不做 F2-6〜F2-9 與 `drawerScrollPositions` 退役——那些是 2B。
5. 不動 `src/syncCommit.ts` 與 F0-9 建立的守門。
6. 不改任何 testid、文案、e2e 斷言、`.claude/rules/`。
7. 不新增 runtime 依賴。

若你認為其中任何一項應該提前處理，**提出建議，不要靜默實作**。

---

## 回報要求

### 交付形式

寫成 `docs/arch-dispatch-2026-08-24-frontend-F2A-report-codex.md`，
**不列入實作 commit、不執行 push**。驗收後由驗收方連同驗收紀錄一起收錄提交。
程式碼修改照常做成 commit，接在 `c6e4238` 之後，四個子項至少各一個 commit。

### 每項回報格式

- 改了什麼（**檔案清單＋每檔一句話**，不要省略小檔）。
- 驗收條件逐條對照：每條附**指令＋實際輸出**，不是「已確認」三個字。
- 技術陳述帶 `[已驗證]`／`[推論]`／`[不確定]` tag；
  「已刪除／已歸零」類聲稱附反向 grep 輸出。
- canary 附完整輸出（紅的那次與還原後綠的那次都要）。
- 未做／做不了的項目明說原因，不可留白。

### 收尾必跑

`npm run test:ci:frontend` 全綠＋`git diff --check` 空輸出，輸出貼進回報。

### 執行注意

- **本批動到型別鏈，`npm run test:local` 與 `npm run test:db` 的價值比前幾批高很多**
  （select 字串與型別建立編譯關聯後，漏欄位只有真的打 DB 才看得出來）。
  若本機 Docker／Supabase 可用，請跑並貼輸出；不可用就明說，驗收方會列為 REL 前必補。
- 跑 Playwright 期間不要並發其他 `node --test` 或第二個 dev server。
  單一 timeout 類紅燈先用 `--repeat-each=10 --retries=0` 取樣再下判斷。
