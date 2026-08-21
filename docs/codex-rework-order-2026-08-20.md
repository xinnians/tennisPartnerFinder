# 批 13–23 退件單（給 Codex）

日期：2026-08-20　受驗 HEAD：`5944731`
驗收報告：`docs/migration-reports/batch-13-23-acceptance.md`
原派工單：`docs/codex-dev-prompt-2026-08-20.md`（交付格式、canary 四拍規格沿用，不重述）

---

## 0. 先講結論

批 13–23 的工程實質是紮實的，**大部分通過**。驗收方另外設計了 11 顆 canary
（刻意不重跑你示範的那一顆，改測「這道牙能不能咬到別的違規」），**11 顆全部咬到**。
對稱接線零缺口、循環確實斬斷、隱私紅線與 `esc()` 面零踩線、D2 與 D4 兩條拍板誠實遵守。
批 19 主動揭露自己第一次 gate 抓到的真回歸、批 21 誠實說明範圍偏離，這兩份是好報告的樣子。

退件的是 **1 條阻擋回歸 + 4 個「守門測試自己有洞」+ 4 條報告誠實度問題 + 9 項雜項**。

**本輪最重要的一件事不是修 bug，是改豁免判準**（§1）。批 20 的回歸連漏 11 批，
根因就是那條判準。

批號接續：**批 24–28**。每批一個 commit、一份 `docs/migration-reports/batch-<n>.md`。

| 批 | 內容 | 優先級 | 相依 |
| --- | --- | --- | --- |
| **24** | 修批 20 的 `removeChild` 回歸 + 改豁免判準 | **阻擋 REL** | — |
| **25** | 補四個守門洞 | **P0** | — |
| **26** | 讓 WebKit 訊號可重現 | P1 | — |
| **27** | 回填批 22 的護欄註解 + 更正四份報告的假 ✅ | P1 | — |
| **28** | 收尾雜項九項 | P2 | 批 25 |

批 24 與 25 互相獨立，可平行。**REL 建議等批 24、25 完成。**

---

## 1. 全域規則變更：`test:local` 的豁免判準（每一批都適用，從批 24 起）

### 現行判準錯在哪

批 13–23 每一批都用同一句話豁免：

> `npm run test:db`、`npm run test:local` 豁免：本批零 migration、零 `dataApi.js`、零 RPC 簽名

**這個判準選錯層次。** `npm run test:local` 不是資料庫測試——它是
`supabase-chromium` **對真實資料跑的瀏覽器旅程測試**，覆蓋純前端路徑：聊天捲動、
封存唯讀重繪、sheet 生命週期、焦點還原。批 18、20、22 全都動了這些路徑。

`npm run test:mock` 抓不到，是因為 mock fixture 走不到 `cancel_session` 之後的封存重繪。
所以「mock 全綠」不能替代 `test:local`。

最後一次實跑完整 Supabase gate 的是批 16，在批 18–22 之前。之後五批全部靠這句話豁免，
結果批 20 的回歸一路帶到 HEAD。

### 新判準

> **動到 `src/` 任何 runtime 程式碼，就不得豁免 `npm run test:local`。**
> 只有「純測試檔／CI 設定／文件」的批次才可豁免。
> `npm run test:db` 維持原判準（零 migration 即可豁免）。

依此判準回頭看批 13–23：批 13、14、15、16、21、23 的豁免成立；
**批 17（改 `vite.config.ts`）、18、19、20、22 的豁免不成立**。

### 要落檔的位置

1. `docs/frontend-fix-plan-2026-08-20.md` §7（既有流程規範）加一條。
2. `.claude/rules/testing.md`：在測試規則段落寫明這條判準。
3. 批 24 的報告 §1 引用這條，並說明它是被什麼實證推翻的。

---

## 2. 批 24（阻擋）：修批 20 的 `removeChild` 回歸

### 2.1 現象（驗收方實測，非推測）

```
[supabase-chromium] › tests/session.spec.js:1566:1
  › accepted members exchange escaped chat, manage blocks, and retain archived read-only history

Error: expect(received).toEqual(expected)
+ Array [
+   "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.",
+ ]
  1686 |   expect(runtimeErrors).toEqual([]);
```

重現指令：

```bash
TENNIS_TEST_HARNESS_MODE=local npx playwright test --project=supabase-chromium tests/session.spec.js:1566 --repeat-each=3 --reporter=line
```

驗收方實測 **3/3 紅**，不是 flaky。

### 2.2 Bisect（每個點都實跑同一條測試）

| commit | 批 | 結果 |
| --- | --- | --- |
| `9d08f01` | 批 13 之前 | 1 passed |
| `1ec3b34` | 批 17 | 1 passed |
| `293fe16` | 批 18 | 1 passed |
| `d54c098` | 批 19 | 1 passed |
| **`9cc25a8`** | **批 20** | **1 failed** |
| `5944731` | HEAD | 1 failed（3/3） |

### 2.3 觸發點

驗收方在隔離副本對 `tests/session.spec.js` 每個互動後插入
`if (runtimeErrors.length) throw ...` 檢查點，輸出：

```
PROBE first error after line 1681
```

`tests/session.spec.js:1681` 逐字：

```js
  await chat.locator("[data-surface-close]").click();
```

也就是**關閉「已封存唯讀」狀態的聊天 sheet**。
同一測試 `:1647` 的第一次關閉（未封存狀態）**不會**觸發。
兩者之間發生了 `host.client.rpc("cancel_session", ...)`（`:1672`），聊天轉為封存唯讀。

### 2.4 驗收方的根因推測（**你要自己確認，不要照抄**）

`src/sheets.js:78-97` 的 `close()` 順序是：

```
releaseIsolation → unmountContent?.()（:87） → root.innerHTML = ""（:92） → onClose → 還原焦點
```

批 20 在 `:92` 之前插入了 `reactRoot.unmount()`。
而 `src/sheets/SessionChatSheet.tsx:71-75` 的註解逐字寫著：

> the composer and every imperatively owned node stay outside the generation.

也就是 React 容器內**混有指令式擁有的節點**。封存重繪若增刪了這些節點，
React 的 `unmount()` 走訪自己記得的子節點就會對不上。
批 20 之前 `close()` 只做 `innerHTML = ""`，這種不一致永遠不會爆。

### 2.5 要求

1. **不得靠放寬斷言變綠。** `tests/session.spec.js:1686` 的
   `expect(runtimeErrors).toEqual([])` 是既有凍結斷言，不得修改、不得加白名單。
2. **不得整批回滾批 20。** 卸載契約要留著；要修的是它與指令式節點的衝突。
3. 修完要能同時滿足：
   - `tests/session.spec.js:1566` 在 `supabase-chromium` `--repeat-each=3` 全綠。
   - `tests/react-unmount.spec.js` 既有兩格維持綠（批 20 的成果沒被抵消）。
   - 驗收方的 canary 仍會紅：移除 `src/sessionViews.js:1063` 的
     `mounted.registerUnmount(content.unmount);` → `node --test tests/react-surface-lifecycle.test.js`
     必須 `# fail 1`。
4. **加一條會抓到這個缺陷的自動化測試。** 目前只有 `supabase-chromium` 抓得到，
   而它是最慢、最容易被豁免的一格。優先做成 mock 模式跑得到的版本
   （mock fixture 要能走到封存重繪後再關閉）；若證明 mock 做不到，
   在報告裡寫明為什麼，並保留 local 版本。

### 2.6 canary 四拍

第 4 拍對照組用 `git archive d54c098`（批 19，回歸之前）——證明這條路徑在批 20 之前是綠的，
所以你補的測試是針對批 20 引入的缺陷，不是本來就壞。

### 2.7 必跑 gate

全部 12 道，**含 `npm run test:db` 與 `npm run test:local`**（依 §1 新判準，本批不得豁免）。
`test:local` 需要本機 Supabase；如需重置，唯一入口是
`CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test`。

---

## 3. 批 25（P0）：補四個守門洞

這四個洞由驗收方各跑一顆 canary 證實——**canary 加上去之後測試仍然全綠**，
也就是這些違規目前抓不到。四個都是幾行的修改。

### 3.1 批 22 的 boundary gate 用寫死清單（與批 13 修的是同一種假綠）

`tests/session-presentation-boundary.test.js:5-20` 逐字：

```js
const REACT_CONSUMERS = [
  "src/components/Avatar.tsx",
  ...共 14 個字串字面值
];
```

`:41` 是 `for (const path of REACT_CONSUMERS) {`。

實測 `find src -name '*.tsx' | wc -l` → **21**。7 個不在管轄內：
`AppErrorBoundary`、`CourtSessionSheet`、`CreateSessionSheet`、`EditSessionSheet`、
`FilterSheet`、`SessionUnavailableSheet`、`WithdrawSessionConfirmationDialog`。
其中多個仍在 `sessionViews.js` 的 18 個 eager glob 之內。

**驗收方的 canary（維持綠）**：在 `src/sheets/FilterSheet.tsx` 開頭加

```js
import { avatarRuntime as __cycle } from "../sessionViews.js";
```

→ `node --test tests/session-presentation-boundary.test.js` = `# pass 4 # fail 0`。

**修法**：改成遞迴掃 `src/**/*.tsx`（比照 `tests/legacy-style-scan.test.js:11-19` 的
`readSourceTree()`）+ 非空下限。注意 `AppErrorBoundary.tsx` 不是 presentation 消費者，
`:43` 那條「必須 import `sessionPresentation.ts`」不能無差別套到全部 21 檔——
建議拆成兩條：**全部 `.tsx` 都不得 import `sessionViews.js`**（遞迴、全集），
以及**這 14 個必須 import `sessionPresentation.ts`**（可維持清單，但要有下限斷言）。

### 3.2 `ci-config.test.js` 沒有鎖住 workflow 的 Supabase job

`tests/ci-config.test.js` 全檔唯一提到 `test:ci:supabase` 的是 `:78` 的
`const script = PACKAGE.scripts["test:ci:supabase"];`——**只查 package.json，
沒有任何 workflow 側斷言**。對照 frontend 側 `:39` 有
`assert.match(WORKFLOW, /run: npm run test:ci:frontend/);`。

**驗收方的 canary（維持綠）**：從 `.github/workflows/quality-gate.yml` 刪掉
`      - run: npm run test:ci:supabase` → `# pass 8 # fail 0`。
整個 Supabase job（799 條 pgTAP + 全部 local 旅程）可以從 CI 消失而沒人知道。

**修法**：補 `assert.match(WORKFLOW, /run: npm run test:ci:supabase/);`。

### 3.3 必過的 job 可以被靜默降級成不擋合併

`grep -c continue-on-error tests/ci-config.test.js` = 1，唯一出現在 `:116` 的 WebKit
正則內，只單向鎖了「WebKit 要不擋」，沒有反向鎖「frontend／supabase 要擋」。

**驗收方的 canary（維持綠）**：在 `frontend` job 的 `timeout-minutes: 30` 之後插入
合法縮排的 `    continue-on-error: true` → `# pass 8 # fail 0`。
typecheck／lint／test:mock／build／bundle gate 全部變成裝飾品。

**修法**：補一條斷言，鎖住 `frontend:` 與 `supabase:` 兩個 job 區塊內不得出現
job 級 `continue-on-error`（注意 `:101` 的 `npx supabase stop` step 級那條是合法的，
不要一併鎖死）。

### 3.4 `script.includes(gate)` 被前綴子字串滿足

`tests/ci-config.test.js:79-80` 逐字：

```js
  for (const gate of ["npm run test:db", "npm run test:local", "npm run test:local:mobile", "git diff --check"]) {
    assert.ok(script.includes(gate), `Supabase CI gate missing: ${gate}`);
```

`"npm run test:local"` 是 `"npm run test:local:mobile"` 的**前綴子字串**。

**驗收方的 canary（維持綠）**：把 `test:ci:supabase` 的
`npm run test:local && npm run test:local:mobile` 改成只留 `npm run test:local:mobile`
→ `# pass 8 # fail 0`。桌面 42 條旅程從 CI 消失。

**修法**：改成用 `&&` 切 token 後逐項相等比對，不用 `includes`。
`:22-34` 的 frontend 側請一併檢查有沒有同樣的子字串陷阱。

### 3.5 批 25 的 canary 四拍

四個洞各補一顆 canary，證明補完之後上面四段的 canary 都會紅；
第 4 拍對照組用 `git archive 5944731` 證明現況確實是綠的（驗收方已測過，你要自己重跑）。

### 3.6 必跑 gate

本批只改 `tests/`，依 §1 新判準可豁免 `test:db` / `test:local`，但**要在報告裡引用新判準**。

---

## 4. 批 26（P1）：讓 WebKit 訊號可重現

### 4.1 問題

`docs/migration-reports/batch-23.md:69` 逐字寫 `125 passed / 7 failed / 3 skipped（135）`，
`:100` 的驗收條件寫「所有 WebKit 失敗均分類並附處置 | ✅ 7/7」。
這個數字已經寫進 `.claude/rules/testing.md:44-45` 當基準。

**驗收方完整實跑是 `123 passed / 9 failed / 3 skipped`**，多出兩條未分類：

- `tests/performance.spec.js:175`（`keyboard dialogs trap focus and return it to the trigger`）
- `tests/smoke.spec.js:1640`（`authenticated pre-join roster ... avatar fallback`）

`--repeat-each=3` 取樣：

| 測試 | 3 次中紅幾次 |
| --- | --- |
| `performance.spec.js:59` | 3/3（穩定紅） |
| `performance.spec.js:175` | 0/3 |
| `smoke.spec.js:1640` | 2/3 |
| `smoke.spec.js:1696` | 2/3 |

### 4.2 根因

`tests/smoke.spec.js:1665, 1690, 1703, 1711` 直接使用**真實外網網址**
`https://lh3.googleusercontent.com/a/stage-t45-host` 與
`https://lh5.googleusercontent.com/a/stage-t45-self`。

`tests/fixtures/fakeMaps.js` 只 stub 了三個網域：

```
:200  page.route("https://maps.googleapis.com/maps/api/js**", ...)
:209  page.route("https://fonts.googleapis.com/**", ...)
:212  page.route("https://fonts.gstatic.com/**", ...)
```

頭像網址沒有 stub → 瀏覽器真的送出請求 → Google 回 400 → WebKit 記成 console error
→ `captureConsoleErrors` 收到 → `expect(runtimeErrors).toEqual([])` 紅。

這與批 10–11 那次「真實字型 CDN 偶發 404」是同一類問題，當時的解法就是 stub。

### 4.3 要求

1. 在 `tests/fixtures/fakeMaps.js` 補 `page.route("https://lh*.googleusercontent.com/**", ...)`
   的 stub（回傳一張最小的合法圖片或 204，視 `dispatchEvent("error")` 的既有測試語意而定
   ——注意 `:1691` 與 `:1712` 是**刻意**觸發 `error` 事件驗 fallback，stub 不能讓那段失效）。
2. 補完後重跑 `npm run test:mock:webkit` **至少 3 次**，把三次的數字全部寫進報告。
   如果三次不一致，代表還有別的不穩定源，繼續查，不要挑一次好看的寫。
3. 更新 `docs/migration-reports/batch-23.md:69, :100` 與 `.claude/rules/testing.md:44-45`
   的數字與分類表。`performance.spec.js:175` 若仍偶發，要單獨分類為
   「負載相依、非穩定」，不要混進「Safari focus 差異」。
4. **不得**為了讓數字好看而改既有 e2e 斷言或把 WebKit 加進 `test:mock`。

### 4.4 附帶確認

批 23 的六條 focus 失敗分類表**是準確的**——驗收方逐條比對過實際失敗的
`toBeFocused()` 行號（`performance.spec.js:86`、`smoke.spec.js:212, 832, 2373, 2586, 3228`），
描述與事實完全吻合。這部分不用改，只有數字與「7/7」那句要改。

---

## 5. 批 27（P1）：回填批 22 的護欄註解 + 更正四份報告的假 ✅

### 5.1 批 22 刪掉了指名 e2e 斷言的護欄註解，且未揭露

實測：

```bash
git show bdf0b86:src/sessionViews.js | grep -cE '^\s*(//|\*|/\*)'                       # 349
cat src/sessionViews.js src/sessionPresentation.ts src/sessionActions.js \
  | grep -cE '^\s*(//|\*|/\*)'                                                          # 215
```

消失的內容包含這兩條（舊 `sessionViews.js:2909` 與 `:3002` 逐字）：

```
// session.spec.js:1865/1890/1893 的 hosted 測試鎖定,不可移除)。打法整行 dc 沒有,
// value」測試鎖定的字串(時段：週末下午、mystery<img...>),不可改動計算方式。
```

全庫反向 grep：`不可移除`、`由 session.spec.js`、`鎖定` 在 `src/` 命中數皆為 **0**。

`docs/migration-reports/batch-22.md` §6 專門有「偏離」一節，卻把整批描述成
「集中／另抽」的搬移（`:33` 起），零處提及註解刪除。

**要求**：把仍然成立的護欄註解搬回 `src/sessionPresentation.ts` 對應函式上。
判準是「這條註解說明的是**哪條測試鎖住這段計算**，或**為什麼不能改**」——
這類必須回填；純描述當時實作細節、搬檔後已不適用的可以不回。
在批 27 報告列出回填清單與判斷理由。

**驗收方確認的好消息**：`esc()` 呼叫點前後都是 6，逐字內容完全相同
（`sessionViews.js` 舊 `:919, 920, 923, 3036, 3038, 3040` → 新 `:487, 488, 491, 2047, 2049, 2051`），
XSS 面沒有缺口。`sessionPresentation.ts:665-667` 那段
「React 自己 escape，這裡再 `esc()` 會雙重逃逸」的判斷也是對的。

### 5.2 四處假 ✅ 要更正

| 檔案:行 | 現況逐字 | 問題 | 建議改成 |
| --- | --- | --- | --- |
| `batch-16.md:103` | `\| 凍結 DOM／文案／aria／class／testid 與 e2e 斷言零變更 \| ✅ \|` | 與自己 §6 矛盾：`tests/performance.spec.js:92` 的 `1_000 → DISCOVERY_SHELL_BUDGET_MS` 確實改了既有斷言（工單授權，改動本身沒問題） | 「一處既有 e2e 斷言依工單參數化（本機門檻值不變），其餘凍結項零變更」 |
| `batch-21.md:98` | `\| CSP 使用目前 React build 的外部來源清單 \| ✅ 本機設定與 gate \|` | 超譯 gate 能力：`tests/security-headers.test.js:40-51` 只做整串 substring 比對，分辨不出某個 directive 少一項來源 | 「已依人工盤點列入；gate 只能偵測整條 policy 完全缺少某 origin，不保證清單完整」 |
| `batch-22.md:33` | `新增 4 條單元 gate…鎖住 14→0 反向 import` | gate 只鎖 14 個寫死路徑，全庫 21 個 `.tsx`（見 §3.1） | 批 25 修完後改成「鎖住全部 `.tsx` 不得反向 import」 |
| `batch-23.md:69, :100` | `125 passed / 7 failed / 3 skipped`、`✅ 7/7` | 見 §4 | 批 26 一併處理 |

### 5.3 批 27 是純文件與註解批

依 §1 新判準：只改註解不改行為，**但註解在 `src/`**，保守起見仍請跑 `npm run test:local`
（若你能證明 diff 只含註解行，可豁免並附 `git diff -U0 | grep -v '^[-+]\s*//'` 為證）。

---

## 6. 批 28（P2）：收尾雜項

按重要性排序，都不急，可一批做完。

1. **`tests/contrast-tokens.test.js:11-12` 不遞迴**
   （`readdirSync(CSS_DIR, ...).filter((entry) => entry.isFile() && ...)`）。
   目前 13 個 CSS 全在 `src/` 頂層所以無害，但這正是批 13 剛修掉的模式；
   日後出現 `src/pages/*.css` 會靜默漏掃，`:21` 的 `>= 13` 門檻擋不住。改成遞迴。
2. **`tests/legacy-style-scan.test.js:33` 的 `FILES.length >= 50` 對「部分退化」無效。**
   實際掃描集現為 65 檔（`src/` 64 個 `.css/.js/.ts/.tsx` + `index.html`），
   漏掉 15 檔仍會綠。改成相對門檻（例如記錄目錄數 + 每個目錄非空）或把下限拉到貼近實際值。
3. **`CLAUDE.md:137` 稱 workflow 在 `main` 執行**，但
   `git ls-tree -r main --name-only | grep -c '^\.github/'` = **0**，
   且該檔從未進過任何 remote ref。目前 push 到 `main` 與 `workflow_dispatch` 都跑不到。
   改成「已設定為對 `main` 與目前開發分支執行相同 gates；尚未 push，待 REL 讓 `main`
   追上後才在 `main` 生效」。
4. **`npm run check:production-bundle` 在 CI 有、`CLAUDE.md` 本機清單（:118-134）沒有。**
   照 CLAUDE.md 逐行敲的人會在 push 後才發現。補進 `npm run build` 之後。
5. **`src/sessionActions.js`（338 行新程式碼）既不進 `typecheck` 也不進 `lint`**
   （`lint` 只掃 `.ts/.tsx`，`tsconfig` 是 `checkJs: false`）。
   本批不必 TS 化，但在 `docs/frontend-fix-plan-2026-08-20.md` 留一條待辦，
   並在檔頭註明這件事，免得後人以為它有型別保護。
6. **`tests/session-presentation-boundary.test.js:50` 的
   `/:\s*any\b/` 只擋標註形式的 `any`**，擋不住 `as any` / `any[]` / `<any>`。
   實際擋住那些的是 lint。要嘛補正則，要嘛在報告寫明這條靠 lint 守。
7. **`test:session-unit`（`package.json:16`）是 21 個寫死檔名**，
   全庫沒有「`tests/*.test.js` 差集為零」的完整性斷言。目前差集確實為零
   （`tests/session-data-local-api.test.js` 由 `test:local` 負責），
   但下一支新測試漏登記不會有人發現。在 `tests/ci-config.test.js` 補一條。
8. **`.github/workflows/quality-gate.yml` 用 `npx supabase` 但沒釘版本**
   （`package.json` 無 `supabase` devDependency、yml 無 `supabase/setup-cli`）。
   CLI 破壞性更新會讓 799 條 pgTAP 無預警變色。建議釘版本。
9. **7/11 個 commit 訊息含字面 `\n` 而非真換行**（批 13、14、15、16、17、21、22），
   `git log` 會擠成一行。批 18、19、20、23 格式正確。
   **不要為此改寫歷史**——已經在分支上，改寫的風險大於收益。
   只要求：批 24 起用真正的多行訊息。

---

## 7. 每批共通要求（與原派工單的差異）

沿用 `docs/codex-dev-prompt-2026-08-20.md` 的全部規格，以下三點是本輪新增或修正：

1. **豁免判準改用 §1 的新版。** 報告的 gate 段落要引用它，不要再寫舊那句。
2. **canary 第 3、4 拍也要附逐字指令與輸出。** 批 15 的第 3、4 拍只給了結論數字
   （`batch-15.md:40-44`），第三方無法照著重跑。比照 `batch-12.md` §3 的密度。
3. **驗收表不得打與自己報告其他章節矛盾的 ✅。** 有例外就寫「一處例外：…，理由見 §6」。
   §5.2 那四處就是這個問題。

## 8. 不要做的事

- 不要為了讓測試變綠而修改既有 e2e 斷言、`data-testid`、`id`、`class`、`aria`、
  文案或 DOM 結構。批 24 特別注意 `tests/session.spec.js:1686`。
- 不要整批回滾批 20、批 22。它們的成果要保留。
- 不要 push、不要 deploy、不要 REL、不要 merge 到 `main`。
- 不要改寫既有 commit 的訊息或歷史。
- 不要動 `supabase/migrations/`、`src/dataApi.js`、RPC 簽名——本輪五批都不需要。
- 不要用 `git checkout` 清 canary（會洗掉同檔其他未提交改動），一律精確字串替換。
- 重置本機測試 DB 的唯一入口是 `CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test`。

## 9. 驗收方會怎麼驗

沿用 `docs/frontend-fix-plan-2026-08-20.md` §8，加上這輪的做法：

- 所有 gate 由驗收方在無平行作業的本機實跑，不採信報告文字。
- **會另外設計「你沒示範過」的 canary**，測這道牙咬不咬得到別的違規。
  本輪 11 顆全紅、4 顆漏網，漏網的四顆就是 §3。
- **批 24 會 bisect 驗證**：修完之後在 `9d08f01`、批 19、批 20、HEAD 各跑一次
  `tests/session.spec.js:1566`，確認紅綠邊界符合你的說明。
- 引用真偽逐條開行號比對逐字原文。數字一律用指令重算。
- 收工時 `git status --porcelain` 只能有預期變更，不可留探針檔。
