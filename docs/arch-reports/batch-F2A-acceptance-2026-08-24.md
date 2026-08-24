# 批 2A（型別鏈地基 F2-5 a／b／c／d）驗收紀錄

- 驗收日期：2026-08-24　驗收者：Claude
- 派工單：`docs/arch-dispatch-2026-08-24-frontend-F2A.md`
- 補件派工單：`docs/arch-dispatch-2026-08-24-frontend-F2A-followup.md`
- 回報：`docs/arch-dispatch-2026-08-24-frontend-F2A-report-codex.md`
- 補件回報：`docs/arch-dispatch-2026-08-24-frontend-F2A-followup-report-codex.md`
- 驗收範圍：基準 `f4080f2` → 初驗 HEAD `e907c40`（4 個 commit）→
  補件 `5a8948f`／`144dc3a`（F1R 的 3 個 commit 之後）

## 最終結論：**ACCEPTED**（含補件，2026-08-24；複驗見 §六）

## 初驗結論：條件式退件（CHANGES REQUESTED）

(a) 的收斂主體、(b) 的九個 guard、(d) 的 instanceof 全部通過且證據強度高。
退件事由兩項必修、一項補件，都集中在**守門的實際涵蓋範圍**與**揭露完整性**。

| 事項 | 類別 | 阻擋 |
| --- | --- | --- |
| A-1 `callRpc` 的 `as never` 讓 RPC 參數完全不受型別檢查，且未揭露 | 守門涵蓋不足＋陳述過度 | 是 |
| A-2 新 barrel 開了 facade 繞路；回報的 canary 測錯東西 | 紅線守門退化 | 是 |
| A-3 兩處 `?? sessionId` 執行期行為變更未揭露；`as never` 未列入斷言盤點 | 回報格式 | 是（補寫可結案） |

**另有一項與 2A 無關、但優先度更高的發現**：`npm run test:local` 那條紅燈經二分確認是
**批 1 的 `a27b91f`（F1-1）引入的迴歸**，不是「既存失敗」的無主問題。詳見 §四。

---

## 一、通過項目（全部由驗收方獨立重跑）

### 1. 交付邊界 [已驗證]

四個 commit 各自單一主題，檔案範圍全在派工內：

```text
bd6244b  src/data/authApi.ts / dataRepository.ts / selects.ts / src/supabaseClient.js
e42f28f  package.json / literalGuards.ts / profileMappers.ts / sessionMappers.ts
         / tests/data-mapper-guards.test.js / tests/session-data-boundary.test.js
f9fbaf1  src/data/index.ts / src/domainTypes.ts
e907c40  src/sessionController.js
```

`src/data/databaseTypes.ts`（生成檔）一行未改 ✓。
`sessionController.js` 只動 F2-5(d) 那一處＋一行 import ✓。
`sessionViews.js`／`main.js` 零改動 ✓。

### 2. (a) 路線選擇與 select 字串完整性 [已驗證] — 最關鍵的一項

選了 JSDoc 而非改副檔名（`src/supabaseClient.js` +1 行），因此六個消費者、
appRuntime 副檔名表、兩個測試 fixture import 全部不必動。符合 CLAUDE.md 的
「存量 .js 不因工具鏈強制改寫」。

`selects.ts` 從陣列 join 改成字串 literal（-122／+21 行）是本批風險最高的改動——
**驗收方以程式比對前後所有匯出**（把舊檔與新檔同時 import 後逐項 diff）：

```text
SAME  COURT_SUBSCRIPTIONS_SELECT / MY_PLAYER_BLOCKS_SELECT / MY_PROFILE_SELECT
SAME  MY_SESSIONS_SELECT / NOTIFICATION_PREFS_SELECT / PLAYER_DIRECTORY_SELECT
SAME  PLAYER_PRESENCE_DIRECTORY_SELECT / SESSION_DISCOVERY_SELECT
SAME  SESSION_JOIN_PREVIEW_SELECT / SESSION_MESSAGE_FEED_SELECT / SESSION_ROSTER_SELECT
GONE  COURT_COLUMNS（陣列）
NEW   COURT_SELECT = id,name,city,district,lat,lng（同欄位、同順序）
```

**十條 select 字串逐字相同，零欄位遺漏、零重排**。`COURT_COLUMNS` 的兩個消費者
（`dataRepository.ts:43`／`:197`）都已同步，反向 grep 無殘留。

### 3. (a) 斷言退役 [已驗證]

```text
$ grep -rn "as unknown as" src/
src/features/discovery/discoveryFeature.ts:13
src/features/discovery/discoveryFeature.ts:18
```

4→2，只剩派工明定不動的兩處 ✓。`rowsAs`／`rowAs` 全數退役，換成真正做窄化的
`rowsOrEmpty<Row>(value: Row[] | null)`；13 個呼叫點的逐處決策表與實際 diff 相符 ✓。
手寫的 `QueryBuilder`／`RepositoryClient`／10 個 Row 型別別名全部刪除，改由 client 推導 ✓。

### 4. (a) 型別鏈確實接通（部分）[已驗證]

驗收方自造四個 canary：

| canary | 結果 |
| --- | --- |
| `.select("id,not_a_real_column")` | **紅** `TS2345 ... column 'not_a_real_column' does not exist on 'courts'` |
| RPC 名稱打錯（`cancel_session_typo`） | **紅** `TS2345` ← 這是基準沒有的新覆蓋 |
| RPC **參數名稱**打錯（`p_chat_message_enabled_typo`） | **綠** ← 見 A-1 |
| RPC **參數型別**錯（boolean 位置放字串） | **綠** ← 見 A-1 |

欄位側與 RPC 名稱側確實接上了，這是實質進步。

### 5. (b) 九個 literal union guard [已驗證] — 設計比派工要求的更好

`src/data/mappers/literalGuards.ts` 用 `Record<Union, true>` 建 accept-list，
配 `Object.hasOwn` 判定。這讓 accept-list **由建構本身保證完整**——
驗收方 canary：在 `domainTypes.ts` 的 `SessionStatus` 加一個 `"abandoned"` 而不改 guard：

```text
$ npm run typecheck  → EXIT=2
error TS2741: Property 'abandoned' is missing in type
'{ open: true; full: true; cancelled: true; played: true; expired: true; }'
but required in type 'Record<SessionStatus, true>'.
```

**fail-closed 成立**，比派工單想像的陣列寫法強。

**accept-list 對 DB 的獨立查核**（驗收方自行掃 `supabase/migrations/`，
不看 `domainTypes.ts`，避免自我證成）：

| union | migration CHECK 原文 | 相符 |
| --- | --- | --- |
| `PlayType` | `check (play_type in ('單打','雙打','對拉','練球'))` | ✓ |
| `SessionStatus` | `check (status in ('open','full','cancelled','played','expired'))` | ✓ |
| `SessionJoinMode` | `check (join_mode in ('approval','instant'))` | ✓ |
| `SessionVenueType` | `check (venue_type in ('booked','walk_on','candidates'))` | ✓ |
| `SessionParticipantRole` | `check (role in ('host','guest'))` | ✓ |
| `SessionParticipantStatus` | `check (status in ('requested','invited','accepted','declined','withdrawn'))` | ✓ |
| `SessionMessageKind` | `check (kind in ('user','system'))` | ✓ |
| `ProfileSlotCode` | `check (slot_code in ('wd-m','wd-a','wd-e','we-m','we-a','we-e'))` | ✓ |
| `SportCode` | 無 CHECK；`sport_row.code` 來自 sports 表（FK 約束） | ✓（產品決策：首發只有網球） |

**沒有混淆同名欄位**：migrations 另有兩個值集不同的 `status`
（`('open','closed','expired','removed')` 與 `('open','reviewed','dismissed')`），
屬其他表，guard 沒有誤用它們。

**fallback 選擇確實保守**：status→`expired`（隱藏而非誤顯）、
participantStatus→`withdrawn`（去權限）、role→`guest`（去權限）、
messageKind→`system`（不把未知內容當使用者訊息渲染）、joinMode→`approval`（要審核）。
逐項成立。10 個新單元測試，`package.json` 的 `test:session-unit` 已同步登記 ✓。

### 6. (d) instanceof [已驗證]

```text
$ grep -rn "error?.name ===\|error.name ===" src/
（空輸出）
```

改用 `error instanceof DataApiUnavailableError`，import 走 `./dataApi.js` facade
（不繞過邊界）✓。使用者文案逐字未改 ✓。既有測試以真 class 做
`assert.rejects`，不受影響 ✓。

### 7. 行為零變化與收尾 [已驗證]

```text
$ git diff 0be31a2 HEAD -- tests/session-controller-sequence.test.js
（仍只有批 1 那個檔頭註解 hunk；124 筆 GOLDEN 未動）

全 src/ 的 data-testid 集合與 0be31a2 逐字相同。

$ npm run test:ci:frontend  → EXIT=0
# tests 295 / # pass 295 / # fail 0
4 skipped / 268 passed (2.4m)
production bundle check passed: main chunk 633375/184441 bytes within 703886/203176

$ npm run test:db           → EXIT=0
Files=7, Tests=799, Result: PASS   （not ok 筆數：0）

$ git diff --check          → EXIT=0
```

Node 285→295＝10 個新 guard 測試，變因對得上。
bundle 632764→633375（+611 raw／+226 gzip，guard 檔的成本），
**回報貼的是升級後的數字**，沒有沿用舊值 ✓。

---

## 二、退件事項

### A-1（必修）RPC 參數完全不受型別檢查，且未揭露

`src/data/repositories/dataRepository.ts:170-175`：

```ts
  async function callRpc(name: RpcName, params: Record<string, unknown>): Promise<unknown> {
    const activeClient = requireClient();
    // The shared wrapper intentionally accepts heterogeneous RPC argument
    // records; individual repository methods own their runtime normalization.
    const { data, error } = await activeClient.rpc(name, params as never);
```

`as never` 是**基準沒有的新斷言**（`f4080f2` 全庫零 `as never`，
`PlayerCardSheet.tsx:144` 那筆只是註解裡的英文字）。它的效果不是「參數型別放寬」，
而是**整個參數物件完全跳過檢查**。驗收方 canary：

```text
把 p_chat_message_enabled 改名成 p_chat_message_enabled_typo
$ npm run typecheck → EXIT=0（綠）

把 p_chat_message_enabled 的值換成字串 "not-a-boolean"
$ npm run typecheck → EXIT=0（綠）
```

**為什麼這件事在這個 repo 特別重要**：CLAUDE.md 把 RPC 簽名列為凍結契約
（`save_my_profile` 的 `p_line_id: null`、六參數 `set_notification_prefs` 等）。
RPC 參數是這條型別鏈最值錢的目標，而它現在一個字都沒守到。mock 模式的 e2e 不打 RPC，
所以唯一會抓到參數打錯的是 `test:local`／pgTAP——而 `test:local` 目前是紅的（見 §四）。

回報 §2.4 的結論寫「證明 relation→select→mapper 型別鏈已接通」，
§2.3 提到「異質 RPC wrapper 仍只負責 action error normalization」，
但**沒有任何一處說明 RPC 參數不受檢查，也沒把 `as never` 列入斷言盤點**。
§2.2 的「4→2」因此是選擇性呈現。

**要求**：
1. 把 `callRpc` 改成按 RPC 名稱推導參數型別，例如
   `callRpc<N extends RpcName>(name: N, params: PublicSchema["Functions"][N]["Args"])`，
   讓 `as never` 退役。若某些呼叫點因此需要 runtime 正規化才能滿足型別，那正是要暴露的。
2. 附**兩個 canary**：參數名稱打錯 → 紅、參數型別錯 → 紅（各附紅→還原→綠）。
3. 若判斷技術上做不到（例如 supabase-js 的型別在此無法收窄），**明說做不到的理由並附
   實測輸出**，同時在 `dataRepository.ts` 留下說明註解，並在回報中把「RPC 參數側未受
   型別保護」寫成明確的已知限制——不可讓「型別鏈已接通」這句話涵蓋它。

### A-2（必修）新 barrel 開了 facade 繞路，回報的 canary 測錯東西

派工單 (c) 的條件寫得很明白：「barrel 只可匯出型別，不得匯出 runtime 值」，
驗收條件 2 是「從 `src/pages/` 任一檔**透過新 barrel import 一個 runtime 值**，
證明 `no-restricted-imports`／`typecheck` 會紅」。

回報 §4.2 做的是：在 `MePage.tsx` 把型別 `SessionSummary` 當值用，得到
`TS2693 'SessionSummary' only refers to a type, but is being used as a value`。
**這只證明「型別不是值」，與 barrel 無關**——同樣的錯誤在任何檔案對任何型別都會發生。

驗收方做了派工單真正要求的那個 canary：在 `src/data/index.ts` 加一行
`export { createDataApi } from "./repositories/dataRepository.ts";`，
再從 `src/pages/MePage.tsx` import 並使用它：

```text
$ npm run typecheck → EXIT=0（綠）
$ npm run lint      → EXIT=0（綠）
```

**page 拿到了 repository factory，兩個守門都沒紅。** 成因：

- `eslint.config.js` 的 facade 規則 block 是
  `files: ["src/**/*.{js,ts,tsx}"], ignores: ["src/data/**", "src/dataApi.js", "src/syncCommit.ts"]`
  ——`src/data/index.ts` 落在 `src/data/**` 裡，所以 barrel 自己可以自由 import repository。
- 而 page 端 import 的路徑是 `../data/index.ts`，不匹配
  `**/data/mappers/**`／`**/data/repositories/**` 任何 restricted pattern。

這直接踩到 CLAUDE.md 紅線「所有前端讀寫都必須經過 `src/dataApi.js` 的 view/RPC 邊界」，
也就是把 F0-5 建好的守門開了一個後門。

**加重情節**：這個 barrel **目前零消費者**
（`grep -rn 'data/index' src/ tests/` 空輸出），內容全部是 `domainTypes.ts` 的再匯出，
而 `domainTypes.ts` 本來就到處可以 import。也就是說它現階段沒有帶來任何好處，
只帶來一條沒被守住的繞路。

**要求二擇一，並說明選擇理由**：

- **保留 barrel**：加上守門讓它 fail-closed。可行做法：改用
  `@typescript-eslint/no-restricted-imports` 搭 `allowTypeImports: true` 把
  `**/data/index*` 加進 restricted patterns（型別 import 放行、值 import 變紅）；
  或加一條靜態測試斷言 `src/data/index.ts` 只含 `export type` 語句。
  **必須附驗收方那個 canary 的紅燈輸出**（barrel 加 runtime export ＋ page 引用 → 紅）。
- **刪掉 barrel**：只保留 F2-5(c) 的另一半（`domainTypes.ts` 註解修正）。派工單原文是
  「domain 型別搬進 `domainTypes.ts` **或** `src/data/index.ts` barrel」，
  型別已經全在 `domainTypes.ts`，選前者是完全合規的收尾。

### A-3（補件）兩處執行期行為變更與新斷言未揭露

回報全文沒有出現 `?? sessionId`、`as never`、或任何行為變更的說明。實際有三處：

**1. `loadSessionJoinPreview`**（`dataRepository.ts:308-310`）

```diff
- async function loadSessionJoinPreview(sessionId: unknown) {
-   const normalizedSessionId = asNumber(sessionId);
+ async function loadSessionJoinPreview(sessionId: number) {
+   const normalizedSessionId = asNumber(sessionId) ?? sessionId;
```

**2. `loadSessionMessages`**（`dataRepository.ts:329`）

```diff
-      .eq("session_id", asNumber(sessionId))
+      .eq("session_id", asNumber(sessionId) ?? sessionId)
```

`asNumber` 對非數值回傳 `null`（`valueMappers.ts:1-5`）。改動後非數值輸入不再被
正規化成 `null`，而是原樣傳給 PostgREST。實務上呼叫端（`sessionController.js`）
一律傳數字，所以這是失敗路徑上的差異；但 `sessionController.js` 是 `.js` 且未開
`checkJs`，簽名從 `unknown` 收成 `number` **不產生任何編譯期強制**，
等於「型別看起來變嚴、執行期正規化變鬆」。

**3.** `as never` 未列入 §2.2 的斷言盤點（見 A-1）。

**要求**：三處逐一揭露。第 1、2 項另需說明：是刻意接受這個失敗路徑差異，
還是應該改成「非數值直接拋錯」或「保留 `asNumber` 的 null 語意」。

---

## 三、觀察（不阻擋）

1. `RpcName = keyof PublicSchema["Functions"]` 讓 RPC **名稱**打錯會紅，這是基準沒有的
   新覆蓋，值得保留與稱許——問題只在參數側（A-1）。
2. `literalGuards.ts` 的 `Record<Union, true>` 模式建議在批 2B/2C 遇到類似需求時沿用；
   它把「清單完整性」交給編譯器，比手寫陣列強。
3. bundle +611 bytes raw 是 guard 檔的合理成本，距 gate 上限仍有大量餘裕，不需處理。

---

## 四、與 2A 無關但優先度更高：`test:local` 的紅燈是批 1 的迴歸

回報 §7.2 說「一項既存 focus 斷言失敗；在改動前的 `f4080f2` 亦可穩定重現，
因此未納入本批修正」。**前半句成立，但結論不完整。**

### 驗收方的查證

失敗測試：`tests/session.spec.js:488` 
`a complete profile creates a Taipei session with an explicit Taipei ISO timestamp and focuses its upcoming card`，
斷言在 `:532`：

```text
Error: expect(locator).toBeFocused() failed
Locator: locator('#my-upcoming-sessions [data-session-id]').first()
Expected: focused / Received: inactive
```

| 驗證步驟 | 結果 |
| --- | --- |
| HEAD `e907c40` 跑 `test:local` | 1 failed／11 skipped／**31 did not run**／10 passed |
| 基準 `f4080f2` 同樣跑 | **完全相同**（1 failed／11 skipped／31 did not run／10 passed） |
| `CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test` 後在 HEAD 重跑 | **仍然相同** → 不是 fixture 累積污染 |

所以它不是 flaky、不是 DB 狀態、也不是 2A 造成。接著往批 1 二分
（每次都在乾淨 worktree、只跑該條測試）：

```text
0be31a2  批 1 之前                                  → 1 passed
7c1d1bc  test(arch-F1-7) lower dispatch golden      → 1 passed
a27b91f  feat(arch-F1-1) subscribe React pages …    → 1 failed   ← 引入點
9754a4f  refactor(arch-F1-2) stabilize page slots   → 1 failed
f228686  refactor(arch-F1-3) move page events       → 1 failed
cd0b73d  refactor(arch-F1-4) retire focus restore   → 1 failed
7112d6d  批 1 收尾                                   → 1 failed
```

`a27b91f` 以 `--repeat-each=3` 取樣：**3 failed**，不是 flaky。

### 結論與自我更正

**`a27b91f`（F1-1 store 訂閱化）在 local 模式打破了「建立球局後鍵盤焦點落在新卡片」
這條斷言。** mock 模式的 e2e 全綠，所以批 1 的 gate 沒有攔到。

**我在批 1 的 ACCEPTED 判定漏了這件事**，原因是當時 Docker 沒開、`test:local` 沒跑，
我把它記成「REL 前必補跑」。這筆技術債現在到期了。

### 為什麼這件事比 2B 更急

1. **使用者可見的無障礙迴歸**：建立球局後焦點不再落到新卡片。390px 鍵盤走查是
   `docs/mvp-plan.md` release checklist 的明列項目。
2. **它讓 31 個 `test:local` 測試從不執行**。2C／2D 要動的正是 controller 與 view 的
   render／focus 路徑，而唯一會跑真 RPC 的安全網目前是死的——A-1 的 RPC 參數洞
   也只有這套測試抓得到。
3. 修它需要的診斷（F1-1 的訂閱化如何影響 `createdSessionFocusId`／
   `highlightSessionId` 的交付時機）與 2C 高度重疊，先修可以少一次來回。

**建議順序**：F1-R（批 1 迴歸修補）→ F2A 補件 → 2B → 2C → 2D。
派工單：`docs/arch-dispatch-2026-08-24-frontend-F1R.md`。

---

## 五、後續動作（初驗時）

1. codex 補 A-1（必修）、A-2（必修）、A-3（補件）。
2. 批 1 迴歸另立派工單 `docs/arch-dispatch-2026-08-24-frontend-F1R.md`，先做
   （已於同日完成並 ACCEPTED，見 `docs/arch-reports/batch-F1R-acceptance-2026-08-24.md`；
   批 1 驗收紀錄的後註亦已補）。

---

## 六、補件複驗（2026-08-24）：**PASS**

- 補件 commit：`5a8948f fix(arch-F2A): enforce RPC argument contracts`、
  `144dc3a refactor(arch-F2A): remove unused data barrel`
- 交付邊界 [已驗證]：`5a8948f` 只動 `dataRepository.ts`＋新增 36 行測試；
  `144dc3a` 只刪 `src/data/index.ts`。`databaseTypes.ts` 未動。

### 6.1 A-1：RPC 參數契約 — PASS

作法：`callRpc<Name extends RpcName>(name, params: RpcArgs<Name>)`，以
`RpcFunctions` 包裝型別為每個 Arg 加 `| null`（凍結契約如 `p_line_id: null`、
candidate venue 欄位刻意送 null，生成型別沒涵蓋 SQL nullability——註解有說明）。
`as never` 反向 grep 為空。被型別逼出來的 runtime 正規化（`asNumber`／`asText`）
在各呼叫點顯式浮現，正是補件派工單預期「要暴露的東西」，沒有用新斷言蓋回去。

**驗收方五個 canary 全紅、基線綠**（前四個是補件條件，第五個加測）：

| canary | 結果 |
| --- | --- |
| RPC 參數名打錯 | 紅 `TS2561` |
| RPC 參數型別錯（boolean 放字串） | 紅 `TS2322` |
| 回歸：錯欄位 | 紅 `TS2345` |
| 回歸：錯 RPC 名稱 | 紅 `TS2345` |
| **【加測】漏傳必填參數** | 紅 `TS2345` |

### 6.2 A-2：barrel — 選項 A（刪除）— PASS

`src/data/index.ts` 已刪，`grep -rn "data/index" src/ tests/` 零殘留。
選 A 的理由成立（零消費者、型別已集中於 `domainTypes.ts`）；初驗發現的
facade 繞路隨檔案消失。

### 6.3 A-3：揭露與 null 語意 — PASS

兩處 `?? sessionId` 改回：簽名恢復 `unknown`、`asNumber` 的 null 語意恢復，
null 分支走 `.is("session_id", null)`（typed client 不接受 `.eq(col, null)`，
與基準 `.eq(..., null)` 同樣對非 null 欄位回空集合——失敗路徑等價）。
新增單元測試釘住該語意（假 client 記錄呼叫序列，斷言
`["is","session_join_preview","session_id",null]` 等——測試本身可證偽）。

### 6.4 完整矩陣（驗收方獨立重跑）

```text
test:ci:frontend  exit 0 — unit 296/296（+1=新 null 語意測試）、Playwright 270／4 skipped
test:db           799 PASS
test:local        42 passed／11 skipped、did not run＝0
GOLDEN            仍只有批 1 檔頭 hunk；testid 集合與 0be31a2 相同
bundle            633597/184547 within gate（+177 raw＝正規化呼叫成本）
git diff --check  乾淨；tracked worktree 乾淨
```

### 6.5 順帶觀察（不阻擋）

`5a8948f` 附帶把 `selectedCourtIds` 回傳型別由 `Array<string | number>` 收成
`number[]`（`PROFILE_INCOMPLETE` 拋錯語意保留）與多處 `asText` 正規化——
均為型別鏈逼出的顯式化，行為差異僅在原本就非法的輸入上。

## 七、收錄與後續

1. 2A 全部文件（執行回報、補件派工單、補件回報、本紀錄）於本次收錄提交。
2. 下一步依既定順序：**2B**（小項打包）。
3. 全部未 push。
