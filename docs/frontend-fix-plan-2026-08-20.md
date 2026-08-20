# 前端架構修正實作計劃

日期：2026-08-20（2026-08-20 更新：七項決策落檔、批號指派、批 12 完成）
查證基準：`c9bd71b`　目前 HEAD：`ea076df`（批 12 已完成，見 §9）

配套文件：
- 架構審查（含證據）：`docs/frontend-architecture-review-2026-08-20-claude.md`
- Codex 原始分析：`docs/frontend-architecture-analysis-after-react-migration-2026-08-20.md`
- Codex 複核意見：`docs/claude-frontend-architecture-followup-prompt-2026-08-20.md`

**本計劃的每一張工單都經過兩輪查證**：一名 agent 實地做出工單（含在 repo 外用
`git archive HEAD` 取乾淨副本實跑），再由另一名對抗式審查員逐條打開行號複驗、
試圖推翻。11 張工單**全部被判 NEEDS_FIX**——下面列的是修正後的版本，工時也是
審查員複算過的值，不是原始估計。

---

## 0. 開工前必讀的四個共通陷阱

這四件事會讓任何一張工單靜默失敗，先寫在前面：

### 0.1 新增的 `.spec.js` 檔不會被任何 gate 跑到

`playwright.config.js` 四個 project 的 `testMatch` 都是寫死的正則：

```
45:        testMatch: /(?:smoke|performance)\.spec\.js/,      # desktop-chromium
50:        testMatch: /(?:smoke|performance)\.spec\.js/,      # mobile-chromium
59:        testMatch: /(?:session|performance)\.spec\.js/,    # supabase-chromium
64:        testMatch: /session-mobile\.spec\.js/,             # supabase-mobile-chromium
```

新增 `tests/error-boundary.spec.js` 之類的檔案，`npm run test:mock` **完全不會執行它**，
而 `npx playwright test <不匹配的檔>` 會回 `Total: 0 tests in 0 files` 且 **exit code 0**。
只看退出碼就會判成綠——正是本專案規則點名的空集合假綠。

**凡是新增 Playwright spec 的工單，`playwright.config.js` 必須進 files 清單。**

### 0.2 新增的 `.test.js` 檔同樣不會被跑到

`package.json` 的 `test:session-unit` 是**硬編的 16 個檔案清單**，不是 glob。
新增單元測試而不改這一行，等於寫了一個永遠不執行的 gate。

### 0.3 新增檔案會自動進三支既有掃描測試，且有最小長度門檻

`tests/legacy-style-scan.test.js:31` 對掃描集的**每一個**檔案斷言：

```js
assert.ok(content.length > 100, `${path} 讀取異常,掃描集會漏檔`);
```

所以 P1-A 要新增的空殼 `src/mockData.empty.js` **必須超過 100 字元**（加註解檔頭即可），
否則會弄紅 P0-A。這是 P0-A ↔ P1-A 的真實相依。

### 0.4 跑 gate 時不可有平行作業

本輪審查自身踩到兩次：一次是我跑完整 mock e2e 時同時有 11 個 subagent 在跑，
16 條測試因 5 秒斷言逾時假紅（隔離重跑 32/32 綠、單筆 301ms vs 逾時 5000ms）；
一次是兩個 agent 同時佔用 port 5174，`npm run test:mock` 直接
`Error: http://127.0.0.1:5174 is already used`。

**判定法**：懷疑假紅先做 `-g "<測試名>" --repeat-each=3` 隔離重跑，隔離綠即推翻。

---

## 0.5　決策紀錄（2026-08-20 維護者拍板）

| # | 決策 | 結果 | 對計劃的影響 |
|---|---|---|---|
| D1 | REL 時機 | **先做完 P0 安全網再上線** | REL 排在 P0 全數完成之後 |
| D2 | 錯誤上報端點 | **暫時不做** | P1-B 縮成「Error Boundary + 全域攔截 + 降級畫面」，工時 24–34 h → **10–14 h**。代價：白屏解決了，**失明沒解決**——線上壞掉仍然只能等使用者反映 |
| D3 | production source map | **不開** | 現況零成本（D2 未做，沒有地方送堆疊）。已知限制：無特徵字串的例外無法定位。**中文文案不會被壓縮**，可用字串反查原始碼作為替代手段。等 D2 要做時再回頭評估 `sourcemap: 'hidden'` |
| D4 | focus 外框對比 | **維持現狀不改色** | **P0-C 必須重新界定，見下** |
| D5 | PWA 離線 | **不支援離線** | `push-sw.js` 不加 `fetch` handler；`pushsubscriptionchange` **仍要做**（與離線無關）。已知限制：`manifest` 宣告 `display:standalone`，加到主畫面後無網路會白屏——接受 |
| D6 | 抽屜捲動保存 | **要改** | 從 P2 升回 **P1**；需翻案批 8 的 parity 決策並落檔 |
| D7 | Safari／WebKit 測試 | **要加** | **範圍比原估大很多，見新增的 P0-E** |

### D4 的連鎖影響：P0-C 不能照原樣做

原本 P0-C 是「擴檔案涵蓋 + 加 focus 對比斷言 + 修顏色」三件一起。
D4 決定不改顏色，**所以 focus 對比斷言不能加**——加了會立刻紅在
`--color-court #1c5c3c` on `--color-ink #12291c` = 1.9457:1。

P0-C 重新界定為兩件事：

1. **仍要做**：把讀取範圍從 1 個 CSS 檔擴到 13 個（這是真正的 gate 破洞，與顏色無關）。
2. **改成**：把 focus 外框對比缺口寫成**已知且已接受的例外**，在
   `tests/contrast-tokens.test.js` 檔頭與 `.claude/rules/testing.md` 各記一筆，
   內容要含實算值、涵蓋的兩個深底位置（`.bottom-navigation`、`#map-data-status`）、
   以及「以觸控為主、桌面鍵盤為次要情境」的裁決理由與日期。

> **為什麼要落檔而不是默默不做**：不寫下來的話，下一輪任何人（或 AI）做無障礙審查
> 都會把它當成新發現再報一次，而且會誤以為是疏漏。寫下來它就是一個有日期、有理由的決定。
>
> 我對這個決定的一點保留（提出一次，之後照辦）：`:focus-visible` 在觸控上確實幾乎不會觸發，
> 所以對純手機使用者影響接近零——這個推理成立。但桌面版是存在的介面（1280px 有專屬版面），
> 外接鍵盤的平板也會遇到。它是 WCAG 1.4.11 的明確未達標項，若日後需要無障礙合規會重新浮現。

### D7 的連鎖影響：不是「加一個 project」

我實跑了 WebKit（`devices["iPhone 12"]`，390×844，跑 `smoke` + `performance`）：

```
86 failed / 40 passed / 3 skipped   (2.4 min)
```

錯誤分類（`grep -c` 實算）：

| 類型 | 數量 | 性質 |
|---|---|---|
| `page.evaluate: TypeError: Importing a module script failed.` | **82** | **測試 harness 不相容，不是 app 的問題** |
| `expect(locator).toBeFocused()` | 4 | 可能是 Safari 真實的焦點行為差異 |

**根因已隔離**（獨立探針，Chromium 對照組）：

| `import()` 的位置 | Chromium | WebKit |
|---|---|---|
| 直接寫在 `page.evaluate` 裡 | OK | **OK** |
| 在 `addInitScript` 注入的函式裡 | OK | **ERR: Importing a module script failed.** |

`tests/fixtures/appRuntime.js:4-12` 的 `installAppModuleImporter` 正是用 `addInitScript`
注入 `__importAppModule`。**修這 10 行就會一次解開 82 條紅**，然後才看得到 Safari 底下
app 真正的問題（目前被 harness 的紅蓋住）。

→ 所以 D7 被拆成兩張單：**P0-E（修 harness）** 與 **P3-A（把 mobile-webkit 納入 CI）**。

---

## 1. 優先級總表

> 已依 §0.5 的七項決策更新。工時全部是對抗審查員複算後的值。
>
> **批號接續遷移管線**（遷移批已用到批 11）。每批一份
> `docs/migration-reports/batch-<批號>.md`，隨該批一起 commit。
> REL 不是批次而是一次發布，不占批號。

| # | 批號 | 項目 | 優先級 | 工時 | 相依 | 可獨立提交／回滾 |
|---|---|---|---|---|---|---|
| P0-B | **批 12** ✅ 已完成 | 刪 10 處雙重型別斷言 | **P0** | 實耗 ~1.5 h | — | ✅ bundle hash 未變 |
| P0-A | **批 13** | `legacy-style-scan` 改遞迴 | **P0** | 1 h | — | ✅ 單檔改動 |
| P0-C | **批 14** | contrast gate 擴到 13 檔 | **P0** | 3–4 h | — | ✅ |
| P0-E | **批 15** | 修 `appRuntime.js` 支援 WebKit | **P0** | 2–4 h | — | ✅ |
| P0-D | **批 16** | 重建 CI | **P0** | 12–18 h | 批 12–15 全綠 | ✅ |
| — | （REL） | React 版首次上 production | **P0 之後** | 8–11 h | 批 12–16 | ⚠️ |
| P1-A | **批 17** | `mockData` 排除出 production bundle | P1 | 4–6 h | 批 13 | ✅ |
| P1-C | **批 18** | 抽屜捲動保存 | P1 | 5–6 h | — | ✅ |
| P1-B | **批 19** | Error Boundary + 全域攔截 | P1 | 10–14 h | §0.1 | ⚠️ 切兩個 commit |
| P1-D | **批 20** | sheet 關閉時 `unmount` | P1 | 5–7 h | §0.1、§0.2 | ✅ |
| P1-E | **批 21** | 安全 header（`vercel.json`） | P1 | 7–10 h | REL 之後 | ⚠️ |
| P2-A | **批 22** | 抽 `sessionPresentation.ts` 斬循環 | P2 | 5–7 h | 批 12 | ✅ |
| P3-A | **批 23** | mobile-webkit 納入 CI | P3 | 4–8 h + triage | 批 15、16 | ✅ 先不擋合併 |

> **批 12 已由 Claude 完成並提交**，作為後續各批的格式樣本：
> `docs/migration-reports/batch-12.md`。它示範了證據怎麼列、canary 三拍加對照組怎麼跑、
> 驗收條件怎麼寫成可證偽的形式、豁免哪些 gate 要寫理由。
> **Codex 修訂計劃時請跳過 P0-B。**

**P0（批 13–16）合計約 18–27 人時**，這是 REL 之前要清掉的量（批 12 已完成的 1.5 h 不計）。

> 下面的相依圖用工單代號（P0-A 等）。代號與批號的對照見上表；
> §2 起的各節標題也沿用代號。

**相依圖**（箭頭 = 必須先完成）

```
P0-A ─┬─────────────► P1-A          （空殼檔必須 >100 字元，見 §0.3）
      │
P0-B ─┼─────────────► P2-A          （刪斷言後抽模組才有型別保護）
      │
P0-C ─┤
      │
P0-E ─┴─► P0-D ─► REL ─► P1-E       （CSP 要在 React 版上線後才驗得準）
                    │
                    └─► P3-A        （CI 穩定後才加第二個瀏覽器引擎）

P1-B、P1-C、P1-D 三者互相獨立，可平行，但都受 §0.1／§0.2 的 gate 註冊規則約束。
```

---

## 2. 第 0 階段：補安全網（P0）

> 目標：讓「守門檢查抓得到違規」且「不靠人記得跑」。這一階段做完之前，
> 後面每一個改動都沒有安全網。

### P0-A　`legacy-style-scan` 改遞迴

**問題**　`tests/legacy-style-scan.test.js:10` 的 `readdirSync(SRC_DIR, { withFileTypes: true })`
不遞迴，`entry.isFile()` 直接把三個子目錄丟掉。批 10 之後 `src/pages`（4）、
`src/sheets`（14）、`src/components`（2）共 20 個 `.tsx`／5,656 行完全逃出掃描。
非空防呆 `FILES.length >= 23` 被頂層 38 檔 + `index.html` = 39 輕鬆滿足，
所以**漏掃一半檔案還是綠**。實測：往 `src/sheets/SessionChatSheet.tsx` 注入 `#142c4b`，
現行測試依然 GREEN。

**改哪裡**　`tests/legacy-style-scan.test.js` 單檔。

- 第 10–13 行改遞迴。**建議直接複用 repo 既有寫法**：
  `tests/session-create-form.test.js:16-24` 已有一個可用的 `readSourceTree()` 遞迴掃描器，
  沿用它比自己發明 `{ recursive: true }` 更一致，也避開 Node 版本差異
  （本機 v22.22.3，但 `package.json` 無 `engines`、repo 無 `.nvmrc`）。
- 第 27 行 `FILES.length >= 23` → `>= 50`。**這個數字有講究**：它必須高於
  「只掃頂層」的退化值 39，否則有人把遞迴拿掉時掃描集退回 39 檔，會再次假綠。
- 第 8–9 行與 24–25 行的註解都寫著已經不成立的數字與敘述，一併改。

**做完會不會變紅**　不會，已實測。9 個 BANNED 值在三個子目錄的 `grep -ric` 命中**全為 0**，
全 src 遞迴 grep 也全 0；新納入檔案最小 1,099 bytes，不會踩 `content.length > 100`。
`lint`／`prettier:check`／`typecheck` 的範圍都不含 `tests/`。

**驗收條件**
1. `node --test tests/legacy-style-scan.test.js` 綠，且掃描集為 59 檔（58 + `index.html`）、
   其中巢狀檔 20 個。
2. 掃描集逐字包含 `src/sheets/SessionChatSheet.tsx`、`src/pages/MePage.tsx`、
   `src/components/Avatar.tsx`。
3. 對 `src/sheets/` 任一檔注入 `#142c4b` → 測試變紅，且失敗訊息指名該巢狀路徑。
4. 把遞迴改回非遞迴 → 測試變紅、訊息為「掃描集過小」。
   ⚠️ **審查員實測到的坑**：只換 `readdirSync` 選項而不同步改後面的 `.map()`，
   會得到 `TypeError: entry.split is not a function` 而不是預期訊息。驗收步驟要寫完整。
5. `grep -n '22 個\|>= 23' tests/legacy-style-scan.test.js` 零命中。
   ⚠️ 註解裡**不得**複述舊數字交代沿革，否則第 5 條當場自打嘴巴。
6. `git diff --stat` 只有這一個檔，`src/` 零變更。

**必跑**　`node --test tests/legacy-style-scan.test.js`、`npm run test:session-unit`、
`npm run test:mock`、`git diff --check`

---

### P0-B　刪 `as unknown as ...Runtime`（**批 12，已完成**）

> ✅ 已實作並提交（`ea076df`），報告：`docs/migration-reports/batch-12.md`。
> 實作結果比本節規劃好：修根因（`sessionCardPresentation` 的 JSDoc）後
> **10 處全部可刪**，不是原本規劃的 9 處。以下保留原工單內容供對照。

**問題**　`src/` 有 10 處 `return xxxRuntime as unknown as XxxRuntime;`。
`as unknown as` 等於把 `.tsx` 自己宣告的 `interface XxxRuntime` 對 `sessionViews.js`
實際 `Object.freeze({...})` 匯出的一致性檢查整個關掉。**實測**：把
`sessionViews.js:126` 的 `avatarInitial` 改名成 `avatarInitialX`，`tsc --noEmit` 仍然 exit 0。

在乾淨副本實驗：10 處全改直接賦值後，**只有 `src/components/SessionCard.tsx:43` 報 TS2322**，
原因是 JS 端 `courts = []` 被推成 `never[]`，不是真的型別不相容。**其餘 9 處 exit 0** —— 白丟。

**改哪裡**　9 個 `.tsx` 各刪一個斷言；`SessionCard.tsx` 二選一（改單層 `as`，或在
`sessionViews.js` 加 JSDoc 讓 JS 端推成 `CourtSummary[]`——後者更好，順手修掉根因）。

**⚠️ 審查員抓到的漏項**　`docs/migration-reports/batch-8.1.md:136`、`8.3.md:272`、
`8.5.md:273`、`8.6.md:422` 逐字把這個寫法記載為**批次標準模式**；
Codex 的分析文件也斷言「TSX 必須用 `as unknown as`」。不同步這些文件，
下一個人會照著再寫回來。工單必須含文件項。

**做完會不會變紅**　不會（含 `tsc`／`eslint`／`prettier`／`vite build` 全綠，
bundle 位元組數不變——雙重斷言是純編譯期構造）。

**驗收條件**
1. `grep -rc "as unknown as" src/` 從 10 降到 0（或 1，若 SessionCard 選單層 `as`）。
2. **有牙證明**：把 `sessionViews.js` 任一 runtime 欄位改名 → `npm run typecheck` **變紅**
   （改動前是靜默通過）。這是本項的核心驗收，不做等於沒驗。
3. `npx vite build` 產出的 JS 位元組數與改動前一致。
4. `docs/migration-reports/*` 與 Codex 分析文件的相關段落已加後註。

**必跑**　`npm run typecheck`、`npm run lint`、`npm run prettier:check`、`npm run test:mock`、
`npm run build`

---

### P0-E　修 `appRuntime.js`，讓測試 harness 能在 WebKit 執行（新增，2–4 h）

**問題**　`tests/fixtures/appRuntime.js:4-12` 的 `installAppModuleImporter` 用
`page.addInitScript` 注入 `globalThis.__importAppModule = (name) => import(...)`。
WebKit 不允許從 `addInitScript` 注入的函式做動態 `import()`，
82 條測試因此全部死在 `TypeError: Importing a module script failed.`。

**已隔離的根因**（獨立探針，含 Chromium 對照組，見 §0.5）：
問題只出在「`import()` 寫在 `addInitScript` 注入的函式裡」這個組合；
同一個 `import()` 直接寫在 `page.evaluate` 裡，WebKit 完全正常。

**改哪裡**　`tests/fixtures/appRuntime.js` 一個函式。方向（由實作者選一個並說明理由）：

- (a) 改成在 `page.goto` 之後用 `page.evaluate` 定義 `__importAppModule`
  ——缺點是每次導航後要重新定義，呼叫點可能要調整。
- (b) 用 `page.addInitScript` 注入一個 `<script type="module">` 標籤到文件裡，
  由真正的 module script 提供 importer。
- (c) 改用 `page.exposeFunction` + Node 端轉發（最重，通常不需要）。

**⚠️ 必須注意**　這個 fixture 被 `smoke`、`performance`、`session`、`session-mobile`
四支 spec 共用。**改完 Chromium 那四個 project 必須維持完全相同的通過數**，
這是本工單的主要風險。

**驗收條件**
1. Chromium 側零回歸：`npm run test:mock` 的通過數與改動前**逐字相同**（改動前基準見 §7）。
2. WebKit 側：`Importing a module script failed` 的出現次數從 **82 降到 0**。
3. WebKit 剩餘失敗數逐條列出並分類（預期約 4 條 `toBeFocused`），
   **每一條都要判定是「Safari 真實行為差異」還是「測試寫法問題」**，不可只給總數。
4. 這一單**不**修 Safari 的行為差異，也**不**把 mobile-webkit 加進 `npm run test:mock`
   ——那是 P3-A。本單只負責讓 harness 能跑。

**必跑**　`npm run test:mock`（Chromium 零回歸）＋ 以臨時設定跑一次 WebKit 取新數字

---

### P0-C　contrast gate 擴到 13 檔（**已依 D4 重新界定：不改顏色**）

**問題**　`tests/contrast-tokens.test.js:5` 只 `readFileSync` 一個 `src/session.css`
（批 10 已拆成 13 檔），另外 12 檔完全沒掃到；11 組配對全是「文字疊底色」，
**零組驗 focus 外框**，所以 WCAG 1.4.11（非文字元素 3:1）在這個 gate 上是空白。

實算：`--color-court #1c5c3c` 疊在 `--color-ink #12291c` 上只有 **1.9457:1**。
底部導覽 5 顆 tab 的鍵盤焦點等於看不見。

**⚠️ 審查員抓到的三件事（顏色相關的第四件已因 D4 移除）**

1. **三份文件寫著已失效的假契約**，不同步就只修一半：
   `src/main.js:5-6`、`docs/migration-reports/batch-10.md:91`、
   `docs/frontend-migration-plan-2026-08-18.md:353` 都聲稱
   「contrast-tokens 以正則直讀 `src/session.css` 的字面內容」。
2. **剝註解會改變長度門檻**：13 檔 concat 未剝註解是 98,729 字元，剝完只剩 73,271。
   工單原本把下限寫 80,000（未剝註解的數字），照做會當場弄紅既有第 3 支測試。
3. **canary 用「把 SRC_DIR 指向不存在目錄」不會紅在預期的斷言上**——
   `readdirSync` 在 module 載入期就丟 ENOENT，整支檔案掛掉，非空斷言根本沒執行。
   要改用「把某個 CSS 檔的 token 值改成不合格值」當 canary。

**焦點對比缺口的落檔內容（D4 決定不修，但必須寫下來）**

實算值（我用 WCAG relative luminance 公式對**全部 7 種實際底色**算過）：

| focus 外框 `--color-court #1c5c3c` 疊在 | 對比 | 門檻 3.0 |
|---|---|---|
| `--color-ink #12291c`（底部導覽、`#map-data-status`） | **1.95** | ❌ |
| `--color-surface-page #faf9f3` | 7.53 | ✅ |
| `--color-surface-card #ffffff` | 7.94 | ✅ |
| `--color-success-bg #e8f2e3` | 6.90 | ✅ |
| `--color-danger-bg #fff0ef` | 7.17 | ✅ |
| `--color-info-bg #eef1e7` | 6.94 | ✅ |
| `--color-disabled-bg #e3e6dc` | 6.28 | ✅ |

**只有深底那一種不合格，其餘六種都很寬裕。** 涉及兩個位置：
`.bottom-navigation`（`src/navigation.css:28`）與 `#map-data-status`（`src/discovery.css:153`）。

若日後要改，已驗證可用的單色解是 `#2e8b57`：對上述 7 種底色全部達標，最弱邊 3.36。
（記在這裡是為了讓未來翻案時不用重算，不是現在要做。）

**工時**　3–4 人時（原估 9–12 h 含選型與改色；D4 之後只剩擴檔案與落檔）。

**驗收條件**
1. 測試讀取 13 個 CSS 檔（用 readdir，不寫死清單），且有非空下限與「至少 N 檔」斷言。
2. 既有 11 組文字對比配對全數維持綠。
3. **有牙證明**：把任一 CSS 檔的某個文字色 token 改成不合格值 → 測試變紅並指名該配對；
   還原後綠。
4. 三份文件的假契約敘述已更正。
5. focus 對比缺口已寫進 `tests/contrast-tokens.test.js` 檔頭與
   `.claude/rules/testing.md`，內容含實算值、兩個位置、裁決理由與日期（2026-08-20）。
6. **不新增** focus 對比斷言（加了會紅，見 §0.5 D4）。

---

### P0-D　重建 CI

**問題**　全庫零 CI（`gh api .../actions/workflows` 回 `total_count: 0`）、零 git hook。
CLAUDE.md 列的 12 條 gate 全靠人工逐行敲，而 `git push` 直接觸發部署。

**❌ 不可以直接複製舊 workflow。** `.worktrees/public-release-qa-ci/.github/workflows/quality-gate.yml`
呼叫 `test:ci:frontend` / `test:ci:supabase`，這兩個 script 只存在於
`codex/public-release-qa-ci` 分支，主線 `grep -c 'test:ci' package.json` = **0**。
而那個分支**落後主線 73 個 commit**，是 React/TS 遷移之前的世界：

| | 該分支 `package.json` |
|---|---|
| 缺的 script | `typecheck`、`lint`、`prettier:check`、`pretest:mock`、`pretest:local` |
| `test:mock` | 帶 `--project=mobile-webkit`，主線只有四個 project，**直接跑會 project not found** |
| `test:session-unit` | 只列 15 檔，缺批 11 的 `tests/session-controller-sequence.test.js` |
| 可撿的東西 | 它**有** `test:local:mobile`（`supabase-mobile-chromium`），正是主線缺的那條 |

**正確做法**　那份 yml 只當 job 結構樣板（checkout / setup-node / supabase start-stop /
artifact 上傳 / concurrency 可沿用）；`test:ci:*` **對著目前主線的 `package.json` 重寫**，
逐項對照 CLAUDE.md 第 120–131 行的 12 條 gate 確認無遺漏。

**⚠️ 三個會卡住的實際問題**

1. **`workflow_dispatch` 需要 workflow 檔存在於 repo 的預設分支**。
   `gh repo view` 顯示預設分支是 `main`，而 main 落後 54 個 commit（審查當下 53，批 12 後 54）。
   → 觸發條件不能只寫 `branches: [main]`，必須包含實際開發主線
   `claude/tennis-partner-finder-proto-xfrr6g`；或先做 REL 讓 main 追上。
2. **`tests/performance.spec.js:87` 的 `expect(Date.now() - startedAt).toBeLessThan(1_000)`
   餘裕偏薄**。我實測：暖 cache 12/12 綠，冷 cache（每次清 `node_modules/.vite`）6/6 綠，
   典型值 600–680 ms。**所以它不是既有 flaky**（審查員宣稱本機就會紅，我複驗後推翻——
   他當時機器上有多個 agent 在跑 build）。但 1000 ms 的門檻只有約 35% 餘裕，
   在共用 GitHub runner 上會偏緊。→ **建議把預算參數化**（CI 用較寬值），
   而不是等它在 CI 上假紅才處理。
3. **`tests/local-supabase-config.test.js:81-108` 有兩條測試直接斷言
   `createPlaywrightConfig`**。動 `playwright.config.js` 的 CI 分支會牽動它們。

**工時**　12–18 人時，且**不可能在一個工作段內完成**——調 CI runner 的 timeout 與觀察
flake 通常要 2–3 輪 push。

---

## 3. 第 1 階段：止血（P1）

### P1-A　`mockData` 排除出 production bundle（4–6 h，相依 P0-A）

**推薦方案**：build-time alias 換空殼（`vite.config.ts` 加 alias，production build 時
把 `./mockData.js` 指到一個空殼檔）。實測：`grep -rl 示範山嵐 dist` → NOT FOUND；
`test:session-unit` 248/248；mock e2e 254 passed / 4 skipped；掃描 gate 三拍有牙。

**⚠️ 四個修正**
1. **alias 正則太窄**。實測 `import { MOCK_PLAYERS } from "../mockData.js"`
   （相對路徑不同）不符合 `/^\.\/mockData\.js$/`，demo 資料原封不動回到出貨 bundle。
   → 必須改用能涵蓋所有相對路徑寫法的判準，並補一條掃描 gate 守住。
2. **空殼檔必須 > 100 字元**（見 §0.3），否則弄紅 P0-A。
3. **數字寫錯會讓正確實作被判失敗**：`MOCK_SESSIONS.length === 8`（不是 10）、
   `MOCK_PLAYERS.length === 3`、`COURTS.length === 9`、「示範○○」暱稱共 12 個。
   驗收條件不要寫成 10 場／11 個球友。
4. **不要把 exact bytes 寫進驗收**：有沒有 `.env.local`、裡面放什麼值，
   都會改變 inline 進 bundle 的字串長度。用「dist 內 grep 不到示範暱稱」當判準即可。

### P1-B　Error Boundary + 全域攔截（**D2 決定不含上報**，10–14 h）

> **D2 的範圍縮減**：不做端點選型、不做隱私白名單 payload、不做 source map 上傳。
> 只做「錯誤發生時使用者看到可以關掉的降級畫面，而不是白屏」。
> **代價要記得**：白屏解決了，失明沒解決——線上壞掉你還是不會知道，只能等使用者反映。
> 建議在 `transport` 位置留一個 no-op 掛勾，未來接端點時不用重新設計。

**⚠️ 以下三點與 D2 無關，仍然成立**：

1. **`playwright.config.js` 必須改**（§0.1），否則新 spec 永遠不跑、exit 0 假綠。
2. **8 個 sheet adapter 有 `if (!contentRef.current) throw` 契約檢查**。
   Error Boundary 攔到錯誤後 ref 不會掛上，adapter 照樣拋，而且拋在
   `src/sheets.js:125 onMount` 裡，導致 :126 的 `requestAnimationFrame` 沒註冊、
   焦點託管斷掉。**「boundary 圍住爆炸」這個心智模型是錯的**——它只是把一個
   uncaught error 換成另一個。這 8 個 adapter 要逐一改成「boundary 觸發時走替代 return」，
   是動到 imperative handle 契約的邊界。
3. **沒有現成的 render-error 注入機制**：`__tennisE2ETestHooks` 全庫只有 2 處，
   都在資料層，無法讓某個 React 元件在 render 期拋錯。canary 要自己造。

**建議切兩個可獨立回滾的 commit**（D2 之後從三個縮成兩個）：
① 全域攔截（`window.onerror` + `unhandledrejection`）+ no-op transport 掛勾 + 單元測試
② Error Boundary 元件 + 18 個 root 接線 + `playwright.config.js` 的 `testMatch` + canary

**隱私紅線（雖然 D2 暫緩，設計時就要成立）**：未來一旦接上端點，
payload **絕不可**帶 LINE、GPS、email、nickname、roster。
所以 no-op transport 的介面就要設計成**白名單建構**（列舉允許欄位），
不是黑名單過濾——否則接端點那天要重寫。

### P1-D　sheet 關閉時 `unmount`（5–7 h）

**⚠️ 會紅的路徑有兩條，不是一條**：
- `src/sheets/SessionDetailSheet.tsx` 的 `commit()`——實測 `root.render()` 在 `unmount()`
  之後丟 `Error: Cannot update an unmounted root.`
- `src/sessionViews.js:1996-2012` 的 `submitJoin()` → `renderStage` → `commit()`，
  **工單原本全篇未提**，實測走同一個 `commit()` 丟同樣的錯。

兩條都需要 `isSurfaceRootLive` 守衛。**沒有守衛時現有全套 gate 完全不會紅**——
`vite build`、`tsc`、`eslint`、`prettier`、單元測試全綠——所以沒有任何自動防線
攔得住半套上線。這是本項必須自帶 gate 的理由。

### P1-E　安全 header（7–10 h，跨 3–4 次部署）

**現況（實測 `curl -sSI https://qiuka.tw`）**：已有
`strict-transport-security: max-age=63072000`（Vercel 預設）與
`access-control-allow-origin: *`；**缺** CSP、`X-Content-Type-Options`、
`Referrer-Policy`、`Permissions-Policy`。

**⚠️ 兩個修正**
1. **Referrer-Policy 的動機講錯了**。URL fragment 依規範**永遠不會**進 `Referer`，
   所以「`#/session/:id` 會外洩給 Google Maps／Supabase」是錯的。
   加它仍然值得（Chromium 預設 `strict-origin-when-cross-origin` 已相當保守，
   顯式宣告是防未來預設變動），但理由要寫對。
2. **CSP 驗證的環境對不上**：在工作分支（React，20 個 `.tsx`）驗 CSP，
   卻把 header cherry-pick 到 main（pre-React，0 個 `.tsx`）跑 production——
   兩份 build 的資源需求不同，驗過的結論不適用。
   → **CSP 應該在 REL 之後做**，或至少確保驗證與上線跑同一份 build。

**推進順序（不會炸站）**：preview Report-Only → 人工全流程掃 console →
preview enforce → production Report-Only → production enforce。

### P1-C　抽屜捲動保存（**D6 決定要改**，5–6 h）

**這是翻案一個既有決策，不是修 bug——這件事要寫進 commit 訊息與批次報告。**

`docs/migration-reports/batch-8.md:64` 的取捨表逐字寫著：

```
| .nearby-drawer__scroll | 每次是新 element，scrollTop 回 0 | 相同 | 會保留 scrollTop，是可觀察行為變更 |
```

同節並說明「本批要求使用者可見行為零改變……沒有引入『React 悄悄保留捲動』的差異」。
也就是**遷移前的 `root.innerHTML` 就是這個行為，批 8 是刻意保留 parity**。
D6 決定翻案：使用者滑到哪就停在哪。

**必須落檔**　在批次報告裡明寫「本批推翻批 8 的 `.nearby-drawer__scroll` parity 取捨，
理由：60 秒輪詢造成的跳回頂端是首頁主要瀏覽面的實際體驗問題；決策日 2026-08-20」。
不寫的話，未來任何人比對批 8 的表格都會以為這是回歸。

**改哪裡**　`src/sessionViews.js` 的 4 個插入點（重繪前量、`flushSync` commit 後還原），
照抄群聊 feed 已有的「先量後還原」寫法（`src/sessionViews.js:1605`、`1637-1641`）。

**⚠️ 工單原本有三個必須修掉的瑕疵**

1. **canary 第三拍在物理上不可能發生**。原本寫「刪掉 `clientHeight === 0` 守衛，
   收合期間重繪那格必須轉紅」——實測刪掉守衛後三條探針**仍全綠**，因為
   `rememberDrawerScrollTop` 開頭的 `drawerState !== "open"` 分支先 `return`，
   根本走不到那個檢查。這一拍要換成別的 canary（例如把「還原」那一行刪掉）。
2. **驗收條件第 4 條不可證偽**。它要驗「記憶值不被污染成 0」，斷言卻是「scrollTop 為 0」
   ——記憶值被污染成 0 與記憶值正常刪除，觀察結果都是 0。而且該序列在**未套補丁的
   HEAD 上本來就綠**，等於連「這個修法有沒有做」都測不出來。要重寫成可證偽的形式。
3. **驗收條件 2、5、6 在 files 清單裡沒有對應的測試步驟**（焦點與捲動共存、
   清單縮短後 clamp、首次渲染不拋錯），實作者照 files 寫完會少三格。

**焦點與捲動的排序**　既有的 `rememberFocusedSessionCard` / `restoreFocusedSessionCard`
在同一條重繪鏈上，而**還原焦點本身會觸發瀏覽器捲動**。兩者的先後順序必須明確指定，
並在測試裡鎖住。

**驗收條件**
1. 抽屜開啟並捲到 200px → 觸發一次 `quietRefreshDiscovery` → `scrollTop` 仍為 200
   （未套補丁時此格為 0，用 `--repeat-each=5` 取樣確認不 flaky）。
2. 焦點還原與捲動還原共存：卡片仍取得焦點，且捲動位置正確。
3. 清單變短時捲動位置 clamp 到合法範圍，不會留在超出內容的位置。
4. 抽屜收合狀態下重繪不寫入捲動記憶（用可證偽的方式驗，不能用「觀察到 0」）。
5. 三段式抽屜狀態切換（peek/half/full）時的行為已明確定義並測到。
6. 批次報告已記錄「翻案批 8 決策」。

**必跑**　`npm run typecheck`、`npm run lint`、`npm run prettier:check`、
`npm run test:mock`、新測試 `--repeat-each=5`、`npm run build`、
`node scripts/generate-courts-seed.mjs --check`

---

## 4. REL：React 版首次上 production

**這是本輪最重要的發現，兩份分析都沒提到。**

| | commit | 日期 | React | `src/pages`+`src/sheets` |
|---|---|---|---|---|
| `main`（= production） | `638bdf9` | 2026-08-17 | ❌ | 0 檔 |
| 工作分支 | `c9bd71b` | 2026-08-20 | ✅ | 19 檔 |

`main` 落後 **54 個 commit**（審查當下 53，批 12 後 54）。qiuka.tw 實測服務 `index-BkwDmHwv.js`（485,342 bytes，
`onCommitFiberRoot` = 0）——**零 React**。整套遷移從未上過 production。

**風險比想像小的三個實測事實**
1. `git diff --name-only main..HEAD -- supabase/migrations/` **為空**——純前端發布，
   零 migration，回滾沒有資料面的不可逆動作。
2. `main..HEAD` 是 fast-forward（`git rev-list --count HEAD..main` = 0）。
3. 工作分支已 push 到 origin，preview alias 上跑的就是 React 版，可先在那裡做完整 QA。

**⚠️ 四個必須處理的坑**
1. **回滾到 2026-08-14 之前的 deployment 會讓正式站切成 mock 模式**，
   公開地圖出現 `src/mockData.js` 的假球局（`supabaseClient.js:9` → `dataApi.js:648` 路徑
   實測成立）——**直接違反 CLAUDE.md 的真實模式紅線**。
   → 回滾目標必須明確指定為 2026-08-14 之後、且 `VITE_SUPABASE_*` 已設定的 deployment。
2. **`git checkout main` 在有未提交的 CLAUDE.md 編輯時會 abort**
   （CLAUDE.md 在 main 與 HEAD 差 41 行）。部署順序要把文件編輯排進去。
3. **CLAUDE.md 只剩 14 行預算**（現 186 行，自訂上限 200 行）。
   要補「production branch 事實 + bundle 基準」必須壓在 3–4 行內。
4. **驗收要用 CSS content hash**：我實測 CSS 的 content hash 不受 `VITE_*` 影響，
   而 preview alias 現行 CSS 就是 `index-B9tb6YH3.css`，等同本機 HEAD build 的產出。
   → 發布後直接斷言 qiuka.tw 引用 `assets/index-B9tb6YH3.css`，
   這能抓到「Vercel 部署了別的 commit」；原本的「檔名不等於舊值」抓不到。

**部署方式**　CLAUDE.md 明訂**一律用 git push 觸發，不要用 `vercel deploy`**
（2026-07-20 就因此讓線上站停在舊前端）。

**工時**　8–11 人時 + 隔日回訪。幾乎全在人工 QA：兩個 Google 帳號走完三型建局／
加入／群聊／封存，390px 實機慢網路，深連結三入口，IME，推播真機收訊。

---

## 5. P3-A：把 mobile-webkit 納入 CI（D7，P0-E 之後）

**前置**　P0-E 必須先完成（否則 82 條紅蓋住一切）、P0-D 的 Chromium CI 必須先穩定跑一兩週。

**要做的事**
1. `playwright.config.js` 新增 `mobile-webkit` project
   （`devices["iPhone 12"]` + 390×844，`testMatch` 比照 `mobile-chromium`）。
2. CI 加 `npx playwright install --with-deps webkit`（本機已有 `webkit-2311`，CI 要另裝）。
3. **先設為不擋合併**（`continue-on-error: true` 或獨立的非必要 job）。
   理由：CI 剛建起來時本來就有調校期，一次把兩個引擎都設成必過，會分不清紅燈是
   真的壞掉還是環境問題。等 Chromium 那條穩定再升級為必過。
4. 逐條 triage P0-E 之後剩下的 WebKit 失敗，判定「Safari 真實行為差異」或「測試寫法問題」。

**已知的 Safari 高風險面**（我實地盤查，不是猜的）

| 東西 | 位置 | 為什麼 Safari 會不一樣 |
|---|---|---|
| `<input type="datetime-local">` | `EditSessionSheet.tsx:134`、`DecideSessionSheet.tsx:116` | iOS 是滾輪選擇器，UI 與值處理都與 Chrome 不同 |
| `dvh` / `svh` 單位 | `src/*.css` 共 15 處 | iOS Safari 網址列伸縮，版面破圖的經典來源 |
| `:has()` 選擇器 | `src/*.css` 共 9 處 | 舊版 Safari 不支援 |
| `inert` | `src/modalIsolation.js`（焦點隔離核心） | Safari 支援較晚 |
| Web Push | `src/notificationPush.js` | iPhone **必須先加到主畫面**才收得到，Chrome 無此限制 |

**⚠️ 副作用**　新增 project 會改變 `npm run test:mock` 的測試總數，
而多份文件記錄了目前的數字（見 §7 基準線）。這些記錄要同步。
好消息：`tests/local-supabase-config.test.js:81-108` 對 `createPlaywrightConfig` 的兩條斷言
只檢查 `webServer.env`，**不檢查 `projects`**，所以加 project 不會弄紅它們。

**驗收條件**
1. Chromium 四個 project 的通過數與加入前逐字相同。
2. WebKit 的失敗清單已逐條 triage 並落檔，每條標明類別與處置。
3. CI 上 WebKit job 為非必要狀態，且失敗不擋合併。
4. 文件裡記錄的測試數字已同步。

---

## 6. 基準線快照

**用途**：Codex 修計劃、實作者做事、我做驗收，三方都用這張表判斷有沒有漂移。
任何一個數字對不上，先查是不是環境問題（見 §0.4），不要直接改計劃。

> **兩個基準點**：`c9bd71b` 是本輪審查的基準；`ea076df`（批 12）是目前 HEAD。
> 兩者之間只差批 12，且批 12 的 bundle hash 未變，所以除了
> `as unknown as` 由 10 → 0 之外，下表全部沿用。

| 項目 | 基準值 | 取得指令 |
|---|---|---|
| 審查基準 | `c9bd71b` | — |
| 目前 HEAD | `ea076df`（批 12） | `git rev-parse --short HEAD` |
| `src/` 對 HEAD 差異 | 空 | `git diff --stat HEAD -- src/ tests/ package.json` |
| `typecheck` | exit 0 | `npm run typecheck` |
| `lint` | exit 0 | `npm run lint` |
| `prettier:check` | `All matched files use Prettier code style!` | `npm run prettier:check` |
| 單元測試 | `# tests 248 # pass 248 # fail 0` | `npm run test:session-unit` |
| mock e2e | `254 passed / 4 skipped`（258） | `npm run test:mock` |
| build 主 JS | 713.77 kB / gzip 201.04 kB | `npx vite build` |
| build CSS | 64.61 kB / gzip 10.65 kB | 同上 |
| chunk 數 | 主 chunk 1 + analytics 1 | 同上 |
| `as unknown as` | ~~10 處~~ → **0 處**（批 12 已清） | `grep -rc "as unknown as" src/` |
| `import.meta.glob` | 18 條 | `grep -c "import.meta.glob" src/sessionViews.js` |
| `.tsx` 反向 import sessionViews | 14 檔 | `grep -rl 'from "../sessionViews.js"' --include='*.tsx' src \| wc -l` |
| `legacy-style-scan` 掃描集 | 39 檔（遞迴後應為 59） | 見 P0-A |
| WebKit mock 跑分 | 86 failed / 40 passed / 3 skipped | 見 §0.5 D7 |
| WebKit `Importing a module script failed` | 82 次 | 同上 |
| production bundle | `index-BkwDmHwv.js`，485,342 bytes，零 React | `curl -s https://qiuka.tw \| grep -o 'assets/index-[A-Za-z0-9_-]*\.js'` |
| `main` 落後 | 53 commit（`c9bd71b`）→ **54**（`ea076df`） | `git rev-list --count main..HEAD` |
| `main..HEAD` migrations | 0 檔 | `git diff --name-only main..HEAD -- supabase/migrations/` |
| CLAUDE.md 行數 | 186 / 上限 200 | `wc -l CLAUDE.md` |

---

## 7. 本專案的既有流程規範（每張單都適用）

這些是 repo 已經在跑的慣例，計劃裡的每一張單都受它約束。
**Codex 修計劃時請逐項確認每張單都有對應交付物。**

1. **每批要寫批次報告**：`docs/frontend-migration-plan-2026-08-18.md:20-29`「派工協定」
   要求實作方把回報寫成 `docs/migration-reports/batch-<批號>.md`，隨該批驗收一起 commit。
   → **本計劃目前沒有指派批號，需要補。**
2. **驗收方獨立重跑**：同協定第 3 條要求驗收方獨立跑 gate、讀 diff、反向 grep，
   不採信實作方的自評。
3. **gate 清單以 CLAUDE.md 第 120–131 行為準**（12 條），
   `.claude/rules/testing.md` 有一份重複清單，兩邊要一致。
   → 多張單的 `mustRunTests` 少列了 `npm run lint`、`npm run prettier:check`、
   `node scripts/generate-courts-seed.mjs --check`，**需要補齊**。
4. **動到 CLAUDE.md / `.claude/rules` 描述範圍的改動，要同步那些檔**
   （協定規則 6）。CLAUDE.md 只剩 14 行預算。
5. **gate 要證明能抓到違規**：存量綠 → 故意違規變紅 → 還原綠，三拍缺一不可。
   清除 canary 用精確刪行，**禁用 `git checkout`**（會洗掉同檔未提交的改動）。
6. **凍結清單**（`.claude/rules/react-migration.md`）：既有 e2e 斷言、`data-testid`、
   `id`、`class`、`aria`、文案、DOM 結構，**不得為了配合改動而修改**。
   若某張單必須動，要在報告裡單獨說明理由。
7. **`test:local` 豁免看 runtime 範圍，不看資料庫範圍**：只要批次修改 `src/` 的
   runtime 程式碼，就必須跑 `npm run test:local`；只有純測試、CI 設定或文件批次可豁免。
   `npm run test:db` 仍可在零 migration 時豁免。批 20 的 archived-chat 關閉回歸證明
   mock 全綠不能替代真實 Supabase browser journey。

---

## 8. 驗收契約（我這邊會用什麼標準驗 Codex 的修正）

為了讓下一輪不用來回，先把我的驗收標準寫明：

| 我會檢查 | 通過條件 |
|---|---|
| 引用真偽 | 每個 `檔案:行號` 我會實際打開比對逐字原文。行號漂移或原文對不上 → 退件。本輪 11 張單有 4 張出現行號漂移 |
| 「不會變紅」的宣稱 | 我會自己實跑，不採信文字宣稱。宣稱不會紅但實際會紅 → 退件 |
| 驗收條件可證偽性 | 每條都要能明確分辨「做了」與「沒做」。像「確認運作正常」「記憶值不被污染」這種 → 退件 |
| canary 可執行性 | 我會照著跑一次。跑不出宣稱的紅 → 退件（本輪有 2 張單的 canary 在物理上不可能觸發） |
| 數字 | 一律用指令重算，不看目測值 |
| 交付物完整性 | 對照 §7 逐項確認：批號、批次報告、gate 清單、文件同步、凍結清單例外說明 |
| 工作區清潔 | 收工時 `git status --porcelain` 只能有預期的變更，不可留探針檔 |

---

## 9. 批 12 已完成——請以它為格式樣本

第一個 PR（P0-B / 批 12）**已由 Claude 做完並提交**，報告在
`docs/migration-reports/batch-12.md`。實作結果與原規劃有一處正向偏離：

> 原規劃是「刪 9 處、`SessionCard` 保留一處斷言或補 JSDoc」。
> 實作時選了補 JSDoc 修根因（`sessionCardPresentation` 的 `courts = []` 被推成
> `never[]`），結果 **10 處全部可刪**，`as unknown as` 在 `src/` 歸零。

**這批示範的六件事，後續每一批都照這個規格交付**：

1. **對照組**：不只證明「改完之後 canary 會紅」，還要證明「改之前同一顆 canary 是靜默的」
   ——否則無法區分「本批長出牙」與「本來就有牙」。
2. **canary 三拍 + 對照 = 四拍**，每拍附逐字輸出（含 exit code）。
   清除 canary 用精確字串替換，**禁用 `git checkout`**。
3. **零 runtime 影響要拿證據**：批 12 用 bundle content hash 與位元組數完全相同來證明，
   比「理論上不影響」有力得多。
4. **豁免 gate 要寫理由**：批 12 豁免 `test:db` / `test:local`，並寫明「零 migration、
   零 `dataApi.js` 改動、零 RPC 簽名改動」，可由 `git diff --name-only` 反查。
5. **驗收條件可證偽**：每條都寫成能明確分辨「做了」與「沒做」的形式。
   批 12 第 1 條還特意讓註解不含 `as unknown as` 字面，避免驗收 grep 誤判——
   這種細節請照抄。
6. **偏離要記錄**：§7 明寫哪裡跟工單不同、為什麼，以及不在本批範圍的後續建議。

**下一批（批 13 / P0-A）**：1 小時、單檔、實測不會變紅，把樣式封條補起來。
批 12 與批 13 做完，後面動型別與 CSS 就都有安全網了。

---

## 10. 這份計劃還缺什麼（交給 Codex 修訂時的待補清單）

以下是我知道還沒補齊、但需要實際動手才能定案的部分：

1. **批號指派**。§7.1 的派工協定要求每批一個編號與一份 `docs/migration-reports/batch-<n>.md`。
   目前遷移管線已用到「批 11」，這些修正單要接續編號還是另開命名空間（例如 `fix-1`），
   要先定。
2. **各單 `mustRunTests` 補齊**。多張單少列 `npm run lint`、`npm run prettier:check`、
   `node scripts/generate-courts-seed.mjs --check`。純前端且零 migration 的單若要豁免
   `npm run test:db` / `npm run test:local`，**要寫明豁免理由**，不能靜默跳過。
3. **P0-D 的 `test:ci:*` 實際內容**。目前只寫了「對著主線 package.json 重寫」，
   還沒有具體的 script 字串。要含 CLAUDE.md 12 條 gate 的完整對應。
4. **P0-D 的 CI timeout 參數化方案**。`tests/performance.spec.js:87` 的 1 秒預算
   本機實測 600–680 ms（暖 cache 12/12 綠、冷 cache 6/6 綠，**不是既有 flaky**），
   但共用 runner 上餘裕只有約 35%。要決定是提高門檻、改成環境變數，還是分開量測。
5. **P1-E 的 CSP 完整來源清單**。要逐一從程式碼找出：Google Maps script 與圖磚、
   Supabase REST/auth、`@vercel/analytics`、Google 頭像 `lh*.googleusercontent.com`、
   Web Push、字型、`data:`（圖釘 SVG）、`blob:`。漏一個就白屏。
6. **P0-E 的三個方案要選一個**並說明理由。
7. **P1-C 的三段式抽屜狀態行為定義**（peek / half / full 切換時要不要還原捲動）。
8. **每張單的回滾指令**。目前只寫了「可否獨立回滾」，沒寫實際的回滾步驟。
9. **REL 的人工 QA 清單逐項展開**。目前是概述，需要變成可勾選的項目。
10. **補上 `sessionActions.js` 的靜態分析覆蓋**。目前 `checkJs: false`，且 ESLint 只掃
    `.ts/.tsx`；後續應選擇轉成 TypeScript、開啟受控的 `checkJs`，或把 JavaScript 納入 lint，
    並先補足對應型別／規則再升成必要 gate。

---

## 附錄：本計劃的查證方式

每張工單經兩輪：

1. **產出**：一名 agent 讀原始碼、在 repo 外用 `git archive HEAD` 取乾淨副本實跑，
   產出含 `檔案:行號 + 逐字原文` 的工單。
2. **對抗**：另一名審查員逐條打開行號複驗引用真偽、實地驗證「做完會不會變紅」的宣稱、
   用 grep 掃漏掉的相依、檢查驗收條件是否可證偽。

11 張全部被判 NEEDS_FIX。審查員抓到的問題類型：引用行號漂移（多份工單）、
驗收條件不可證偽、canary 在物理上不可能觸發、數字寫錯會讓正確實作被判失敗、
漏掉必須同步的文件、工時低估。

**我另外推翻了審查員的一條**：P0-D 宣稱 `performance.spec.js` 的 1 秒預算
「在本機就會紅」（他測到 3/13 失敗）。我實測暖 cache 12/12 綠、冷 cache 6/6 綠、
典型值 600–680 ms——他當時機器上有多個 agent 在跑 build。
結論改為「餘裕偏薄，CI 上建議參數化」，而不是「既有 flaky」。
