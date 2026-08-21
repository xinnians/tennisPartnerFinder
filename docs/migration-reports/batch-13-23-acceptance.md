# 批 13–23 獨立驗收報告

驗收者：Claude（未參與批 13–23 實作）
日期：2026-08-20　受驗 HEAD：`5944731`　基準：`9d08f01`
驗收契約：`docs/frontend-fix-plan-2026-08-20.md` §8

## 0. 結論

**條件性通過。程式碼主體紮實，但有一條必須先修的回歸。**

批 20 引入一條**確定性回歸**，只有被全部批次豁免的 `npm run test:local` 抓得到。
其餘 10 批的實質內容經獨立重現後成立；新增的守門檢查我用自己設計的 11 顆 canary 測過，
全部咬得到違規。另有 4 條「守門測試自己有洞」與 4 條報告誠實度問題，應修但不擋。

建議：**修完批 20 回歸再談 REL**，其餘 8 項可排一個收尾批。

---

## 1. 我實際跑過的 gate（不採信報告文字）

機器無平行作業。

| Gate | 我的實測 | 報告宣稱 | 一致 |
| --- | --- | --- | --- |
| `node scripts/generate-courts-seed.mjs --check` | `--check 通過`，exit 0 | 通過 | ✅ |
| `npm run typecheck` | exit 0 | exit 0 | ✅ |
| `npm run lint` | exit 0 | exit 0 | ✅ |
| `npm run prettier:check` | `All matched files use Prettier code style!` | 同 | ✅ |
| `npm run test:session-unit` | `# tests 270 # pass 270 # fail 0` | 270 passed | ✅ |
| Chromium mock e2e | `266 passed / 4 skipped`（2.4m） | `266 / 4` | ✅ |
| `npx vite build` | `index-BOmOb8W3.js 714.35 kB / gzip 200.57 kB` | `714.35 / 200.57` | ✅ |
| `npm run check:production-bundle` | `12 files, 12 demo identifiers absent`，exit 0 | 同 | ✅ |
| `git diff --check` | exit 0 | exit 0 | ✅ |
| `npm run test:db` | `Files=7, Tests=799, Result: PASS` | 7 files / 799 / PASS | ✅ |
| local API 測試 | `# tests 2 # pass 2 # fail 0` | 2 passed | ✅ |
| `npm run test:local:mobile` | `6 passed` | 6 passed | ✅ |
| **`supabase-chromium`** | **`1 failed` / 41 passed / 11 skipped** | 批 16：`42 passed / 11 skipped` | ❌ **見 §2** |
| `npm run test:mock:webkit` | **`123 passed / 9 failed / 3 skipped`** | `125 / 7 / 3` | ❌ **見 §3.2** |

除了兩格，所有數字與報告逐字相符。

---

## 2. 阻擋項：批 20 引入的確定性回歸

### 2.1 現象

```
[supabase-chromium] › tests/session.spec.js:1566:1
  › accepted members exchange escaped chat, manage blocks, and retain archived read-only history

Error: expect(received).toEqual(expected)
+ Array [
+   "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.",
+ ]
  1686 |   expect(runtimeErrors).toEqual([]);
```

`--repeat-each=3` → **3/3 紅**。不是 flaky。

### 2.2 Bisect（每個點都實跑同一條測試）

| commit | 批 | 結果 |
| --- | --- | --- |
| `9d08f01` | 批 13 之前 | **1 passed** |
| `1ec3b34` | 批 17 | **1 passed** |
| `293fe16` | 批 18 | **1 passed** |
| `d54c098` | 批 19 | **1 passed** |
| `9cc25a8` | **批 20** | **1 failed** |
| `5944731` | HEAD | **1 failed（3/3）** |

**回歸來自批 20（sheet 關閉時 unmount）。**

### 2.3 觸發點

在隔離副本逐個互動插入檢查點後定位：

```
PROBE first error after line 1681:
  ["Failed to execute 'removeChild' on 'Node': ..."]
```

`tests/session.spec.js:1681` 是 `await chat.locator("[data-surface-close]").click();`
——**關閉「已封存唯讀」狀態的聊天 sheet**。
同一測試 `:1647` 的第一次關閉（未封存狀態）不會觸發。

### 2.4 推測根因

`src/sheets.js:78-97` 的 `close()` 順序是
`releaseIsolation → unmountContent() → root.innerHTML = "" → onClose → 還原焦點`，
批 20 在 `innerHTML = ""` 之前插入了 `reactRoot.unmount()`。

`src/sheets/SessionChatSheet.tsx:71-75` 的註解逐字寫著：

> the composer and every imperatively owned node stay outside the generation.

也就是 React 容器內**混有指令式擁有的節點**。`cancel_session` 之後聊天轉為封存唯讀時
若有指令式節點被增刪，React 的 `unmount()` 走訪自己記得的子節點就會對不上。
批 20 之前 `close()` 只做 `innerHTML = ""`，這種不一致永遠不會爆。

**這是推論**，需要實作方確認；但 §2.2 的 bisect 與 §2.3 的觸發點是實測。

### 2.5 為什麼 11 批都沒發現

每一批（含批 20 自己）都用同一句話豁免：

> `npm run test:db`、`npm run test:local` 豁免：本批零 migration、零 `dataApi.js`、零 RPC 簽名

**這個判準用錯層次。** `test:local` 不只是資料庫測試，它是**對真實資料的瀏覽器旅程測試**，
覆蓋純前端路徑（聊天捲動、封存唯讀、sheet 生命週期）。批 18/20/22 全都動了這些路徑。
最後一次實跑完整 Supabase gate 的是批 16，在批 18–22 之前。

豁免規則應改成：**動到 `src/` 任何 runtime 程式碼就不得豁免 `test:local`**；
只有純測試檔／CI 設定／文件的批次才可豁免。

---

## 3. 應修、但不擋合併（4 條 major）

### 3.1 批 22 的 boundary gate 用寫死 14 檔清單——與批 13 修掉的是同一種假綠

`tests/session-presentation-boundary.test.js:5-20` 逐字：

```js
const REACT_CONSUMERS = [
  "src/components/Avatar.tsx",
  ...共 14 個字串字面值
];
```

實測：`find src -name '*.tsx' | wc -l` → **21**。7 個 `.tsx` 不在管轄內。

我的 canary：從**未列管**的 `src/sheets/FilterSheet.tsx` 重建同一條反向相依

```js
import { avatarRuntime as __cycle } from "../sessionViews.js";
```

→ `node --test tests/session-presentation-boundary.test.js` = **`# pass 4 # fail 0`**。
循環可以被無聲重建。

修法：把寫死清單換成遞迴掃 `src/**/*.tsx` + 非空下限（`>= 21`），比照批 13 的
`readSourceTree()`。

### 3.2 批 23 的 WebKit「7 failed」不可重現，且驗收條件「7/7 全數分類」不成立

我的完整實跑是 **9 failed**，多出兩條未分類：

- `tests/performance.spec.js:175`（`keyboard dialogs trap focus and return it to the trigger`）
- `tests/smoke.spec.js:1640`（`authenticated pre-join roster ... avatar fallback`）

`--repeat-each=3` 取樣：

| 測試 | 3 次中紅幾次 |
| --- | --- |
| `performance.spec.js:59` | 3/3（穩定紅） |
| `performance.spec.js:175` | 0/3 |
| `smoke.spec.js:1640` | 2/3 |
| `smoke.spec.js:1696` | 2/3 |

根因：`tests/smoke.spec.js:1665,1690,1703,1711` 直接使用**真實外網網址**
`https://lh3.googleusercontent.com/...`，而 `tests/fixtures/fakeMaps.js` 只 stub 了
`maps.googleapis.com`（:200）、`fonts.googleapis.com`（:209）、`fonts.gstatic.com`（:212）。
Google 回 400 → WebKit 記成 console error → `runtimeErrors` 非空。

批 23 的分類表本身**是準確的**（我逐條比對六條 focus 失敗的斷言行號，描述與實際
`toBeFocused()` 失敗位置完全吻合）。問題只在數字：單次執行被寫成權威基準，且已經
落進 `.claude/rules/testing.md:44-45`。

修法：把頭像網址加進 `fakeMaps.js` 的 route stub（根治），並把 `.claude/rules/testing.md`
的基準改成「6 條穩定 focus 差異 + 2 條網路相依」或直接不寫死數字。

### 3.3 `tests/ci-config.test.js` 缺對稱斷言——整個 Supabase gate 可被靜默移除

三顆 canary，**全部維持 `# pass 8 # fail 0`**（即測試抓不到）：

| canary | 後果 |
| --- | --- |
| 刪掉 `.github/workflows/quality-gate.yml` 的 `- run: npm run test:ci:supabase` | 799 條 pgTAP + 全部 local 旅程從 CI 消失 |
| 在 `frontend` job 加 `continue-on-error: true` | typecheck／lint／test:mock／build／bundle gate 全變成不擋合併 |
| 把 `test:ci:supabase` 的 `npm run test:local && npm run test:local:mobile` 改成只留 mobile | 桌面 42 條旅程從 CI 消失 |

第三顆的成因是 `tests/ci-config.test.js:79-80` 用 `script.includes(gate)`，
而 `"npm run test:local"` 是 `"npm run test:local:mobile"` 的**前綴子字串**。

對照：frontend 側在 `:39` 有 `assert.match(WORKFLOW, /run: npm run test:ci:frontend/)`，
Supabase 側全檔只有 `:78` 的 package.json 查表，**沒有任何 workflow 側斷言**。

修法：補 `assert.match(WORKFLOW, /run: npm run test:ci:supabase/)`；
補「frontend／supabase job 不得出現 `continue-on-error`」的反向斷言；
gate 比對改成以 `&&` 切 token 逐項相等，不用 `includes`。

### 3.4 批 22 刪掉 116–134 行註解，其中含「哪條 e2e 鎖住這段計算」的護欄，且未揭露

實測：

```
git show bdf0b86:src/sessionViews.js | grep -cE '^\s*(//|\*|/\*)'          → 349
cat src/sessionViews.js src/sessionPresentation.ts src/sessionActions.js \
  | grep -cE '^\s*(//|\*|/\*)'                                            → 215
```

消失的包含這兩條（舊 `sessionViews.js:2909` 與 `:3002` 逐字）：

```
// session.spec.js:1865/1890/1893 的 hosted 測試鎖定,不可移除)。打法整行 dc 沒有,
// value」測試鎖定的字串(時段：週末下午、mystery<img...>),不可改動計算方式。
```

全庫反向 grep：「不可移除」「由 session.spec.js」「鎖定」在 `src/` 命中數皆為 **0**。

報告 §6 專門有「偏離」一節，卻把整批描述成「集中／另抽」的搬移，零處提及註解刪除。

修法：把仍然成立的護欄註解搬回 `sessionPresentation.ts` 對應函式上；報告 §6 補一句。

---

## 4. 建議修、可延後（minor / note）

1. **批 14 的 contrast 掃描不遞迴**（`tests/contrast-tokens.test.js:11-14` 用
   `readdirSync` + `entry.isFile()`）。目前 13 個 CSS 全在 `src/` 頂層所以無害，
   但這正是批 13 剛修掉的模式；日後出現 `src/pages/*.css` 會靜默漏掃，`>= 13` 門檻擋不住。
2. **批 13 的下限 `>= 50` 對「部分退化」無效**。實際掃描集現為 65 檔
   （`src/` 64 個 `.css/.js/.ts/.tsx` + `index.html`），漏掉 15 檔仍會綠。
3. **批 16 §5「凍結…e2e 斷言零變更 ✅」與自己 §6 矛盾**：
   `tests/performance.spec.js:92` 的 `1_000 → DISCOVERY_SHELL_BUDGET_MS` 確實改了既有斷言。
   改動本身是工單授權的，問題只在驗收表打了假 ✅。
4. **批 21 §5「CSP 使用目前 React build 的外部來源清單 ✅」超譯 gate 能力**：
   `tests/security-headers.test.js:40-51` 只做整串 substring 比對，分辨不出某個 directive
   少一項來源。（我實測它抓得到「整條 policy 完全沒寫某 origin」——拿掉
   `https://*.supabase.co` 會紅並指名。）
5. **`CLAUDE.md:137` 稱 workflow 在 `main` 執行**，但 `git ls-tree -r main --name-only |
   grep -c '^\.github/'` = **0**，且該檔從未進過任何 remote ref。目前 push 到 `main`
   與 `workflow_dispatch` 都跑不到這份 gate。應改成「已設定、待 REL 後生效」。
6. **`npm run check:production-bundle` 在 CI 有、CLAUDE.md 本機清單沒有**。照 CLAUDE.md
   逐行敲的人會在 push 後才發現。
7. **`src/sessionActions.js`（338 行新程式碼）既不進 `typecheck` 也不進 `lint`**
   （`lint` 只掃 `.ts/.tsx`，`checkJs: false`）。批 22 報告只寫「仍是 JS」，未點出這件事。
8. **7/11 個 commit 訊息含字面 `\n` 而非真換行**（批 13、14、15、16、17、21、22），
   `git log` 會擠成一行。批 18、19、20、23 格式正確。已在歷史裡，不建議為此改寫。
9. **`test:session-unit` 是 21 個寫死檔名**，全庫沒有任何「`tests/*.test.js` 差集為零」
   的完整性斷言。目前差集確實為零，但下一支新測試漏登記不會有人發現。

---

## 5. 守門檢查有沒有牙——我自己設計的 canary

不重跑 Codex 那顆，改測「這道牙能不能咬到**別的**違規」。全部在
`git archive HEAD` 的隔離副本執行，主 repo 零觸碰。

**咬到了（11/11）**

| canary | 目標 | 結果 |
| --- | --- | --- |
| 在 `SessionCard.tsx` 新增反向 import | 批 22 boundary | 🔴 指名檔案 |
| `sessionPresentation.ts` 塞 `: any` | 批 22 boundary | 🔴 |
| 移除 `sessionViews.js:1063` 的 `registerUnmount` | 批 20 lifecycle | 🔴 |
| CSP 拿掉 `https://*.supabase.co` | 批 21 headers | 🔴 指名缺的來源 |
| `test:ci:frontend` 拿掉 `npm run typecheck` | 批 16 ci-config | 🔴 指名缺的 gate |
| 巢狀 `src/pages/MePage.tsx` 注入 `#64758b` | 批 13 style scan | 🔴 指名路徑 |
| `src/pages.css` 注入 `--color-text-secondary: #f0f0f0` | 批 14 contrast | 🔴 兩條同時紅 |
| 停用 production mockData alias 後 build | 批 17 bundle gate | 🔴 `still contains demo identifier: 示範山嵐` |
| 清空 `dist/` 後跑 bundle gate | 批 17 非空防呆 | 🔴 `scan is unexpectedly small: 0 files` |
| 拿掉 `MePage.tsx` 的 `<AppErrorBoundary>` | 批 19 boundary | 🔴 `renders a naked React root` |
| 拿掉 WebKit job 的 `continue-on-error` | 批 23 ci-config | 🔴 |

**咬不到（4 個洞，已列在 §3.1 與 §3.3）**

---

## 6. 明確通過的部分

- **對稱接線零缺口**：14 個 sheet 全數 `createSurfaceRoot()`、14 次 `registerUnmount`、
  18 個 React root 全部包在 `<AppErrorBoundary>`（4 pages + 14 sheets），
  一個都沒漏。這是本輪最大的 silent-failure 風險面，實測乾淨。
- **批 22 循環確實斬斷**：`.tsx → sessionViews.js` 由 14 降為 0
  （唯一殘留是 `WithdrawSessionConfirmationDialog.tsx:13` 的註解）。
- **隱私紅線零踩線**：新檔 `sessionPresentation.ts`／`sessionActions.js`／`appErrors.ts`／
  `surfaceRoot.ts` 全無 supabase client、`.from(`、`.rpc(`、`fetch`；`src/dataApi.js`
  本區間零改動；`line_id` 在 `src/` 只剩 `dataApi.js:824` 的 `p_line_id: null`；
  `session_contacts` 零出現。
- **XSS 面無缺口**：`esc()` 實際呼叫點前後皆為 6，`innerHTML` 由 7 降到 3（少的 4 個是註解），
  兩個新檔產出零 HTML 字串。`sessionPresentation.ts:665-667` 還逐字說明了
  「React 自己 escape，這裡再 `esc()` 會雙重逃逸」——判斷正確。
- **D2 紅線遵守**：錯誤攔截 payload 只有 `kind`／`surface`／`errorName` 三欄，
  無 endpoint、無 source map 上傳、無 fetch/beacon。
- **D4 紅線遵守**：批 14 沒加 focus 對比斷言、沒改顏色，把 1.9457:1 的缺口
  逐字落檔在 `tests/contrast-tokens.test.js:5-8` 與 `.claude/rules/testing.md`。
- **兩支新 spec 確實被跑到**：`--list` 實證三個 mock project 皆為
  `Total: 135 tests in 4 files`（smoke／performance／error-boundary／react-unmount）。
- **批 21 的範圍偏離誠實揭露**：工單把 P1-E 排在 REL 之後，派工單又禁止 REL／push／deploy，
  報告明寫「這兩個條件無法同時完成」並只交付 Report-Only 第一階段。這是正確處理。
- **`va.vercel-scripts.com` 不是 CSP 缺口**：`@vercel/analytics` 只在
  `mode === "development"` 用外網網址，production 走同源 `/_vercel/insights/script.js`
  （dist 逐字可證），`'self'` 已涵蓋。

---

## 7. 建議處置

| 順序 | 項目 | 為什麼 |
| --- | --- | --- |
| 1 | 修 §2 的批 20 回歸 | 唯一阻擋項；且它證明豁免規則要改 |
| 2 | 改豁免規則：動 `src/` runtime 就不得豁免 `test:local` | 不改的話下次同樣漏 |
| 3 | 補 §3.1／§3.3 的四個守門洞 | 都是幾行的修改，且正是本輪 P0 要消滅的假綠 |
| 4 | §3.2 stub 頭像網址 + 改掉寫死的 WebKit 數字 | 讓 WebKit 訊號可重現 |
| 5 | §3.4 搬回護欄註解 | 下一批讀 diff 的人需要 |
| 6 | §4 的九項排一個收尾批 | 都不急 |

REL 建議等 1–3 完成。§4 可以在 REL 之後。

---

## 8. 驗收方法

- 所有 gate 由驗收者在無平行作業的本機實跑，未採信報告文字。
- 所有 canary 在 `git archive <sha>` 的隔離副本執行，`node_modules` 以 symlink 借用；
  主 repo 全程零觸碰，收工 `git status --porcelain` 為空。
- 30 名唯讀查核代理逐批比對引用真偽、數字、驗收條件可證偽性、凍結清單與隱私紅線；
  其中 14 條 major/blocker 級發現再經對抗複驗（審查員立場為「預設它是誤判」），
  0 條被推翻，多條被降級。本報告只收錄驗收者自己動手複現過的項目。
- 本報告的每個數字都由指令算出，未經目測或心算。
