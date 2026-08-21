# 批 24–28 獨立驗收報告（退件修正輪）

驗收者：Claude（未參與實作）
日期：2026-08-21　受驗 HEAD：`7e10e37`　基準：`5944731`
退件單：`docs/codex-rework-order-2026-08-20.md`
上一輪驗收：`docs/migration-reports/batch-13-23-acceptance.md`

## 0. 結論

**通過。阻擋項已解除，可以進 REL。**

退件單的 1 條阻擋項、4 個守門洞、4 條報告誠實度問題、9 項雜項——**全部落實**。
驗收方對修正後的守門重新設計了 12 顆 canary：**上一輪咬不到的四個洞現在全紅**，
批 28 六項全紅，上一輪已有的牙沒有退化。

殘留 5 條 minor，都不擋 REL；其中一條的成因是**退件單自己的處方寫窄了**（§4.4），
這條算驗收方的帳。

---

## 1. 阻擋項：已解除

### 1.1 實測

```bash
TENNIS_TEST_HARNESS_MODE=local npx playwright test --project=supabase-chromium \
  tests/session.spec.js:1566 --repeat-each=3 --reporter=line
```

→ **3 passed**（上一輪同指令為 3/3 紅）。

`supabase-chromium` 全套回到 **42 passed / 11 skipped**，與批 16 基準逐字相同。

### 1.2 根因修得對

批 24 找到的根因比驗收方的推測更精確：
`src/sessionViews.js` 舊 `setArchived()` 裡的
`mounted.root.querySelector("[data-chat-withdraw]")?.remove()`
指令式移除了一個 **React 條件渲染** 的節點（`canWithdraw && !archived`），
所以批 20 後續的 `reactRoot.unmount()` 會對已消失的節點再 `removeChild`。

修法是把整個封存轉換收進 React 一次 render（`content.setArchived()` → `useState`），
不是繞過症狀。四個封存效果（`input.disabled`／`send.disabled`／`archivedNote.hidden`／
移除 withdraw）全部改由同一次 render 完成，`data-testid`／class／aria 零改名。

### 1.3 沒有走捷徑

- `tests/session.spec.js` **零 diff**，`:1686` 的 `expect(runtimeErrors).toEqual([])` 逐字未動。
- 批 20 的卸載契約保留：移除 `src/sessionViews.js:1063` 的 `registerUnmount` →
  `react-surface-lifecycle` 仍 `# fail 1`。
- **新增了 mock 模式的回歸測試**，且有牙：驗收方把 `setArchived()` 改回指令式 `.remove()`，
  `tests/smoke.spec.js` 的 mock 測試紅並逐字重現
  `Failed to execute 'removeChild' on 'Node': ...`。
  這件事現在由最便宜、最常跑的 `test:mock` 守著，不再只靠最容易被豁免的 `test:local`。

### 1.4 豁免判準已落檔

`docs/frontend-fix-plan-2026-08-20.md` §7 第 7 點與 `.claude/rules/testing.md` 都寫進：

> 只要批次修改 `src/` 的 runtime 程式碼，就不得豁免 `npm run test:local`；
> 只有純測試檔、CI 設定或文件批次可豁免。

批 24 自己沒有豁免 `test:local`。

---

## 2. 我實際跑過的 gate

機器無平行作業。

| Gate | 實測 | 一致 |
| --- | --- | --- |
| `node scripts/generate-courts-seed.mjs --check` | exit 0 | ✅ |
| `npm run typecheck` | exit 0 | ✅ |
| `npm run lint` | exit 0 | ✅ |
| `npm run prettier:check` | `All matched files use Prettier code style!` | ✅ |
| `git diff --check` | exit 0 | ✅ |
| `npm run test:session-unit` | `# tests 276 # pass 276 # fail 0` | ✅ |
| Chromium mock e2e | `266 passed / 4 skipped` | ✅ |
| `npx vite build` | `index-BS_ixvSh.js 714.34 kB / gzip 200.64 kB` | ✅ |
| `npm run check:production-bundle` | `12 files, 12 demo identifiers absent` | ✅ |
| `npm run test:db` | `Files=7, Tests=799, Result: PASS` | ✅ |
| local API | `# tests 2 # pass 2 # fail 0` | ✅ |
| `supabase-chromium` | `42 passed / 11 skipped` | ✅ |
| `npm run test:local:mobile` | `6 passed` | ✅ |
| `npm run test:mock:webkit` ×3 | `126/6/3`、`126/6/3`、**`125/7/3`** | 見 §3 |

---

## 3. WebKit：訊號已可重現

avatar CDN stub 有效——上一輪那兩條網路相依失敗
（`smoke.spec.js:1640`、`:1696`）在三次跑分中**全部消失**。

第三次跑出 `125/7/3`，多的是 `performance.spec.js:175`。
**這不是誤差，是交付物自己預告的**：

- `.claude/rules/testing.md:45` 逐字：「另有一條負載相依、非穩定的 dialog focus 訊號」
- `docs/migration-reports/batch-26.md:119-120` 把它單列為「負載相依、非穩定」，
  明寫「不混稱 Safari focus 穩定差異」
- `docs/migration-reports/batch-23.md:77` 記錄「驗收完整跑曾紅；隔離 `--repeat-each=3` 為 0/3」

驗收方一名審查員曾把這判為 blocker，經對抗複驗**推翻**：交付物三處都明文標成不穩定，
與「宣稱它穩定」正好相反。

批 23 的錯誤數字以**後註**更正（保留原文與審計軌跡），驗收條件表逐字改成
`| 所有 WebKit 失敗均分類並附處置 | 初版 ❌；批 26 更正後歷史 9/9、現行穩定 6/6 |`——
誠實標記自己的初版是錯的，沒有靜默改寫。

唯一建議：`.claude/rules/testing.md:44-45` 的基準句仍以 `126/6/3` 為頭條數字。
改成「6 條穩定失敗；另有 1 條負載相依訊號，完整跑偶爾為 7 failed」會少一次誤判。

---

## 4. 守門測試：12 顆 canary 重測

### 4.1 上一輪咬不到的四個洞——現在全紅

| canary | 上一輪 | 本輪 | 新的失敗訊息 |
| --- | --- | --- | --- |
| 從未列管的 `FilterSheet.tsx` 重建反向 import | 🟢 綠 | 🔴 | `every TSX module stays outside the legacy sessionViews dependency edge` |
| 刪掉 yml 的 `- run: npm run test:ci:supabase` | 🟢 綠 | 🔴 | `Supabase CI owns reset, pgTAP, desktop, and mobile browser journeys` |
| `frontend` job 加 `continue-on-error: true` | 🟢 綠 | 🔴 | `required frontend and Supabase jobs cannot be downgraded to continue-on-error` |
| `test:ci:supabase` 只留 mobile（前綴子字串） | 🟢 綠 | 🔴 | 同上第 2 條 |

`tests/session-presentation-boundary.test.js` 已改成 `readTsxTree()` 遞迴全集 +
`ALL_TSX.length >= 21` 下限，且**正確拆成兩條規則**：
全部 `.tsx` 不得反向 import（全集）／那 14 個必須 import `sessionPresentation.ts`（清單）。
`AppErrorBoundary.tsx` 沒有被無差別牽連——這正是退件單 §3.1 特別提醒的地方。

`continue-on-error` 的反向斷言用 `/^    continue-on-error:/m`（4 空格＝job 級），
yml:101 那個 8 空格的 step 級（`npx supabase stop`）不受影響，符合 §3.3 的「不要一併鎖死」。

### 4.2 批 28 六項——全紅

| canary | 結果 |
| --- | --- |
| 新增 `src/pages/canary.css` 逃出 contrast 掃描 | 🔴 兩條同時紅 |
| `legacy-style-scan` 只漏掉 `src/components`（2 檔） | 🔴 |
| `sessionPresentation.ts` 用 `as any` | 🔴 |
| 新增未登記的 `tests/canary-unregistered.test.js` | 🔴 |
| 已列管檔的反向 import（回歸檢查） | 🔴 |
| 移除 `registerUnmount`（回歸檢查） | 🔴 |

`legacy-style-scan` 的門檻從 `>= 50` 拉到貼近實數，現在**漏掉兩個檔就會紅**，
不再有上一輪那 15 檔的假綠空間。

### 4.3 批 27 額外加的牙

批 27 不只回填護欄註解，還加了一條 gate 鎖住它們不得再消失。
驗收方刪掉回填的註解 → `batch 27 guard rationale and corrected acceptance claims stay explicit`
**紅**。這超出退件單要求。

### 4.4 殘留：五條 minor

| # | 問題 | 實證 | 歸屬 |
| --- | --- | --- | --- |
| 1 | contrast gate 的 `cssValue()` 用非全域 `CSS.match()`，只取掃描集裡**第一個**命中值。壞值放在真實定義**之後**（＝CSS 串接真正生效的那側）完全看不到 | 把 `--color-text-secondary: #f0f0f0` 加到 `src/vocabulary.css`（字典序在 `session.css` 之後）→ `# pass 5 # fail 0`。且掃描順序是檔名字典序，與 `src/main.js:7-19` 手排的實際 cascade 無關 | **批 14 遺留**，非本輪引入。目前無重複定義，所以是潛在洞 |
| 2 | 反向 import gate 的正則以 `from ` 錨定且要求 `.js` 副檔名 | `from "../sessionViews"`（省副檔名）→ boundary gate、`tsc`、`eslint` **三道全綠**；`import.meta.glob("../sessionViews.js")` 亦全綠 | 批 25。修法是把正則放寬成 `sessionViews(\.js)?` 並涵蓋動態 import |
| 3 | `assert.match(WORKFLOW, /run: npm run test:ci:supabase/)` 是**整檔**比對，不是 job 範圍比對。把那行搬進 `continue-on-error: true` 的 webkit job，整組 Supabase gate 靜默不擋合併而測試全綠 | 代理實跑 `# tests 9 # pass 9 # fail 0` | **退件單 §3.2 的處方就是這樣寫的**，Codex 照做無誤。這條算驗收方的帳。同檔已有 `workflowJob()` helper，改一行即可 |
| 4 | `tests/security-headers.test.js` 對 directive 沒有存在性斷言：整條刪除 `script-src`／`img-src`／`frame-src` 仍 3/3 綠（`connect-src`／`style-src`／`font-src` 因 origin 迴圈會紅） | 代理逐一實跑 | 批 21 遺留 |
| 5 | 批 27 回填的護欄註解 `src/sessionPresentation.ts:709-710` **比原版擴大了宣稱**：說「在線」「這是你」與 trust count 都由 `session.spec.js` 的 player-directory assertions 鎖住。實測只有 trust count 屬實（`tests/session.spec.js:2081/2106`）；`showOnline` 只由 mock `smoke.spec.js:4962` 鎖住，`showSelf`（「這是你」）**全庫零斷言** | 舊版 `bdf0b86:src/sessionViews.js:2908-2909` 逐字只說「`.trust-count` 由 session.spec.js:1865/1890/1893 的 hosted 測試鎖定」——原版把「鎖定」限縮在 trust count 一項，比回填版精確 | 批 27。護欄註解宣稱不存在的保護，比沒有註解更危險。修法是把範圍收斂回 trust count |

---

## 5. 沒有引入新問題

- **`archived` prop 改成 `useState` 的疑慮不成立**：`mountSessionChatSheetContent` 全程只呼叫
  一次 `flushSync(() => reactRoot.render(...))`，之後只透過 imperative handle 更新，
  props 從不重傳；`archived` 也只會 false→true。驗收方與代理各自獨立確認。
- **production dependency 逐字未動**。`package.json` 唯一異動是
  devDependency `"supabase": "2.115.0"`（exact pin，非 caret）；
  `package-lock.json` +222 行全部是 supabase 及其 transitive devDependency（`dev: true`）。
- **`esc()` 呼叫點仍是 6 個**，行號逐字停在 `src/sessionViews.js` 的
  487／488／491／2047／2049／2051，與批 22 基準相同。
- **隱私紅線零踩線**：`src/sessionPresentation.ts` +17 行與 `src/sessionActions.js` +3 行
  經指令驗證**全部是註解**，零非註解增刪。
- **未改寫歷史**：批 13–23 的十一個舊 sha 全部仍是 HEAD 祖先。
- **批 24–28 的 commit 訊息含字面 `\n` 的數量為 0**（上一輪是 7/11）。
- `CLAUDE.md` 194 行（上限 200）。`CLAUDE.md:138` 的 CI 敘述已改成
  「已設定…但尚未 push；待 REL 讓 `main` 追上後才會在 `main` 生效」。
- 未 push：領先 origin 20 個 commit、領先 `main` 71 個。

### 範圍說明

Codex 另外回報「Production dependency audit: 0 vulnerabilities」。
這不在退件單九項內，但**沒有進 repo**——沒有新增 audit script 或 CI step，
只是一次手動觀察。不算未授權的範圍擴張，但也**不是持續生效的 gate**，
下次沒人會自動重跑。

---

## 6. 建議處置

| 順序 | 項目 | 為什麼 |
| --- | --- | --- |
| — | **REL 可以走了** | 阻擋項已解除，13 道 gate 全綠 |
| 1 | §4.4 第 5 條（護欄註解過度宣稱） | 一行字。護欄註解說謊比沒有更糟 |
| 2 | §4.4 第 3 條（job 範圍比對） | 一行字，且是退件單自己的洞 |
| 3 | §4.4 第 1、2、4 條 | 都是「gate 比對字串而非概念」的同一類，可一批做完 |
| 4 | §3 的基準句改寫 | 避免下次又拿固定數字對照 |

§4.4 五條全部可以排在 REL 之後。

---

## 7. 驗收方法

- 13 道 gate 由驗收方在無平行作業的本機實跑，未採信報告文字。
- 12 顆 canary 在 `git archive HEAD` 的隔離副本執行，`node_modules` 以 symlink 借用；
  主 repo 全程零觸碰。
- 16 名唯讀查核代理逐批比對，8 條 major/blocker 級發現經對抗複驗（立場為「預設它是誤判」），
  **3 條被推翻**（含一條 blocker 誤判），5 條存活。本報告只收錄驗收方自己動手複現過的項目。
- 每個數字由指令算出，未經目測或心算。
