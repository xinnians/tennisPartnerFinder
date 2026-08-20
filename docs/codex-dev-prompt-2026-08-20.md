# 給 Codex 的開發派工單：前端架構修正批 13–23

日期：2026-08-20
起始 HEAD：`ea076df`（分支 `claude/tennis-partner-finder-proto-xfrr6g`）
驗收方：Claude（會獨立重跑全部 gate，不採信自評）

---

## 1. 你要做什麼

依 `docs/frontend-fix-plan-2026-08-20.md` 實作**批 13 到批 23**，一批一個 commit。

**批 12（P0-B）已完成並提交（`ea076df`），請跳過。**
它是刻意做出來的格式樣本——`docs/migration-reports/batch-12.md` 示範了本輪要求的
證據密度、canary 寫法與報告結構，**開工前請完整讀過一遍**。

批號、優先級、相依順序見計劃 §1 的表與相依圖。**嚴格依序，不平行。**

---

## 2. 開工前必讀

| 檔案 | 為什麼 |
|---|---|
| `docs/frontend-fix-plan-2026-08-20.md` | 主計劃。每批的問題、檔案、驗收條件、必跑測試都在裡面 |
| `docs/migration-reports/batch-12.md` | **格式樣本**，你的每份報告都要達到這個規格 |
| `docs/frontend-architecture-review-2026-08-20-claude.md` | 計劃背後的證據來源（含二版更正） |
| `CLAUDE.md` | 產品與隱私紅線、gate 清單（第 120–131 行的 12 條） |
| `.claude/rules/react-migration.md` | 凍結契約與混用期規則 |
| `.claude/rules/testing.md` | 測試規則、ports、fixture |
| `docs/frontend-migration-plan-2026-08-18.md` §派工協定 | 本 repo 的既有流程慣例 |

> ⚠️ 前四份裡有四個檔目前是**未追蹤狀態**（`git status` 可見）：
> `frontend-fix-plan-2026-08-20.md`、`frontend-architecture-review-2026-08-20-claude.md`、
> `frontend-architecture-analysis-after-react-migration-2026-08-20.md`、
> `claude-frontend-architecture-followup-prompt-2026-08-20.md`。
> 請在**當前工作樹**上作業，不要從乾淨 clone 開始，否則讀不到計劃。

---

## 3. 已拍板的決策——不要重新討論

這七項由維護者拍板，計劃已依此調整。**不要提出改變它們的建議，也不要靜默偏離。**

| # | 決策 | 對你的意義 |
|---|---|---|
| D1 | 先做完 P0 安全網再上 production | 批 13–16 全綠之前不碰 REL |
| D2 | 錯誤上報端點暫時不做 | 批 19 只做 Error Boundary + 全域攔截，**不要**接任何端點；transport 位置留 no-op 掛勾 |
| D3 | production source map 不開 | 不要改 `build.sourcemap` |
| D4 | **focus 外框顏色維持不變** | 批 14 **不得**新增 focus 對比斷言（加了會立刻紅在 1.95:1），改成把缺口寫成有日期、有理由的已知例外 |
| D5 | 不支援離線 | `push-sw.js` **不加** `fetch` handler；`pushsubscriptionchange` 仍要做 |
| D6 | 抽屜捲動要改 | 批 18 執行，且必須在報告裡明寫「翻案批 8 的 parity 決策」 |
| D7 | 要加 Safari/WebKit 測試 | 拆成批 15（修 harness）與批 23（納入 CI） |

---

## 4. 五個會讓你「以為做完了但其實沒有」的陷阱

這幾條每一條都已經實測驗證過，不是理論風險。**每批開工前對照一次。**

### 4.1 新增的 `.spec.js` 不會被任何 gate 執行

`playwright.config.js` 四個 project 的 `testMatch` 是寫死的正則：

```
desktop-chromium / mobile-chromium : /(?:smoke|performance)\.spec\.js/
supabase-chromium                  : /(?:session|performance)\.spec\.js/
supabase-mobile-chromium           : /session-mobile\.spec\.js/
```

新增 `tests/error-boundary.spec.js` 之類的檔案，`npm run test:mock` **完全不會跑它**；
而 `npx playwright test <不匹配的檔>` 會回 `Total: 0 tests in 0 files` 且 **exit code 是 0**。
只看退出碼會判成綠。

→ **凡是新增 Playwright spec 的批次，`playwright.config.js` 必須進變更清單。**

### 4.2 新增的 `.test.js` 同樣不會被執行

`package.json` 的 `test:session-unit` 是**硬編的 16 個檔案清單**，不是 glob。
新增單元測試而不改那一行 = 寫了一個永遠不執行的 gate。

### 4.3 新增檔案會自動進三支既有掃描測試，且有最小長度門檻

`tests/legacy-style-scan.test.js:31` 對掃描集的每一個檔案斷言
`assert.ok(content.length > 100, ...)`。
批 17 要新增的空殼 `src/mockData.empty.js` **必須超過 100 字元**（加註解檔頭即可），
否則會弄紅批 13。

### 4.4 跑 gate 時不可有任何平行作業

本輪審查自己踩過兩次：
- 一邊跑 11 個 subagent 一邊跑 `test:mock` → 16 條因 5 秒斷言逾時假紅
  （隔離重跑 32/32 綠，單筆 301ms vs 逾時 5000ms）
- 兩個作業同時佔 port 5174 → `Error: http://127.0.0.1:5174 is already used`

→ 跑 gate 時不要同時開 dev server、不要同時跑第二個 build。
→ **懷疑假紅先做 `-g "<測試名>" --repeat-each=3` 隔離重跑，隔離綠即推翻**，
  不要花時間解釋原因，也不要因此改測試。

### 4.5 「已經存在的東西」不要當成缺陷再修一次

本輪至少發生過三次同型錯誤，請主動避免：

- **先查是不是刻意取捨**：`git log` 該檔、翻 `docs/migration-reports/`。
  抽屜捲動歸零就是批 8 白紙黑字保留的 parity 決策，不是漏修。
- **先查建議是不是已經實作**：「CI 檢查 Supabase URL 禁止指向 production」這條建議
  其實早就存在（`tests/fixtures/localSupabaseConfig.js` 的
  `validateLocalSupabaseConfig` 對 `API_URL` 做嚴格比對，不符就 throw，
  另有 9 條回歸測試守著）。
- **先查數字量的是什麼**：`grep -c useState` 量的是文字出現次數（含 import 行），
  `grep -c 'useState('` 才是實際呼叫次數。兩者差很多，報告請寫清楚量的是哪一種。

---

## 5. 交付方式

### 5.1 每批的交付物

1. **程式碼變更**——只含該批範圍，不夾帶。
2. **`docs/migration-reports/batch-<批號>.md`**——規格見 §5.3。
3. **一個 commit**，訊息含：批號、做了什麼、為什麼、canary 結果、gate 結果、
   豁免了哪些 gate 與理由。commit 訊息結尾加：

   ```
   Co-Authored-By: Codex <noreply@openai.com>
   ```

> **這一條偏離了 `docs/frontend-migration-plan-2026-08-18.md` 派工協定第 2 條**
> （原文是「Codex 實作，**不 commit**」，由 Claude 驗收後才 commit）。
> 改動理由：本輪是「多批一次做完再統一驗收」，若全部堆在同一個工作樹 diff 裡，
> 無法逐批驗收、也無法部分退件。**每批一個 commit 是為了讓驗收可以逐批進行、
> 退件時只回滾該批。** 請在批 13 的報告裡記一筆這個流程偏離。

### 5.2 順序與檢查點

依相依圖執行：

```
批 13(P0-A) ─► 批 17(P1-A)        批 12 ✅ ─► 批 22(P2-A)
批 14(P0-C) ┐
批 15(P0-E) ┴─► 批 16(P0-D) ─► (REL) ─┬─► 批 21(P1-E)
                                       └─► 批 23(P3-A)

批 18、19、20 互相獨立，可任意順序，但都受 §4.1／§4.2 約束。
```

**建議在批 16（CI）之前停一次讓 Claude 驗收批 13–15**。
理由：批 16 要花 12–18 人時且需多輪 push 調校，若批 13–15 有需要退件的地方，
在 CI 建好之前發現成本低很多。

**REL 不要做**——那是發布動作，由維護者決定時機。

### 5.3 批次報告規格（照 `batch-12.md` 的結構）

必含六段：

1. **問題**——為什麼要做，附「現況沒有牙／現況會怎樣」的實測證據。
2. **改動**——逐檔說明改了什麼、為什麼這樣改。
3. **canary 四拍**——見 §5.4。
4. **完整 gate**——逐條列指令與逐字輸出；豁免的要寫理由。
5. **驗收條件對照**——把計劃裡該批的驗收條件逐條打勾，附證據。
6. **變更清單與偏離**——`git diff --stat`，加上跟工單不同的地方與理由。

### 5.4 canary 是四拍不是三拍

| 拍 | 內容 |
|---|---|
| 1 | 改動後、無 canary → 綠 |
| 2 | 改動後 + canary → **紅**，附逐字錯誤輸出與 exit code |
| 3 | 精確刪除 canary 還原 → 綠，附還原後的逐字內容確認 |
| 4 | **對照組：改動前（`git archive HEAD` 乾淨副本）+ 同一顆 canary → 靜默** |

**第 4 拍是關鍵**，它證明這道牙是「本批長出來的」而不是「本來就有」。
只跑前三拍無法區分這兩件事。

清除 canary **一律用精確字串替換，禁用 `git checkout`**——它會連同檔案裡
其他未提交的改動一起洗掉。

### 5.5 每批必跑的 gate

以 `CLAUDE.md` 第 120–131 行的 12 條為準。最少要跑：

```bash
npm run typecheck
npm run lint
npm run prettier:check
node scripts/generate-courts-seed.mjs --check
npm run test:session-unit
npm run test:mock
npm run build
git diff --check
```

`npm run test:db` 與 `npm run test:local` 若要豁免，**必須寫明理由**
（例如「零 migration、零 `dataApi.js` 改動、零 RPC 簽名改動」），
且理由要能用 `git diff --name-only` 反查。不可靜默跳過。

---

## 6. 驗收方會怎麼退件

Claude 會獨立重跑全部 gate，**不採信報告裡的自評數字**。以下任一項成立即退件：

| 檢查 | 退件條件 |
|---|---|
| 引用真偽 | 報告裡的 `檔案:行號` 打開後原文對不上或行號漂移。**上一輪 11 份工單有 4 份出現這個問題** |
| 「不會變紅」的宣稱 | 實跑後真的紅了 |
| canary 可執行性 | 照著跑跑不出宣稱的紅。**上一輪有 2 份工單的 canary 在物理上不可能觸發** |
| 驗收條件可證偽性 | 出現「確認運作正常」「記憶值不被污染」這種分辨不出做了沒做的條件 |
| 數字 | 目測而非用指令重算；或把文字出現次數當成呼叫次數 |
| 交付物完整性 | 缺批次報告、缺 gate 輸出、豁免沒寫理由、動到凍結項沒說明 |
| 工作區清潔 | `git status --porcelain` 有探針檔或非該批的變更殘留 |
| 絕對化宣稱 | 「沒有任何可利用路徑」「完全沒有問題」這類無法證明的說法。改寫成「本次檢查未發現…」 |

---

## 7. 硬性禁止

1. **不要 push 到 remote。** push 一律由維護者執行。
2. **不要合併到 `main`。** `main` 就是 Vercel 的 production branch，
   目前跑的是 2026-08-17 的 pre-React 版本，落後 54 個 commit（含批 12）。
   合併＝一次把整個前端換掉，那是 REL 的範圍。
3. **不要用 `vercel deploy`。** 部署一律 git push 觸發（`CLAUDE.md` 有記過教訓）。
4. **不要改凍結項**：既有 e2e 斷言、`data-testid`、`id`、`class`、`aria`、文案、
   DOM 結構。若某批非動不可，在報告裡單獨列出並說明理由。
5. **不要為了讓測試轉綠而改測試。** 測試紅了先判斷是真紅還是 §4.4 的假紅。
6. **不要碰隱私紅線**：`CLAUDE.md` 列的六條（dataApi 邊界、raw table、LINE 退役、
   匿名面三欄白名單、raw GPS、Web Push payload）。批 19 設計上報 payload 時特別注意
   ——即使 D2 決定暫不接端點，介面也要用**白名單建構**而非黑名單過濾。
7. **`CLAUDE.md` 只剩 14 行預算**（現 186 行，自訂上限 200 行）。要加內容請壓縮。
8. **不要留探針檔。** 收工前 `git status --porcelain` 必須乾淨。

---

## 8. 基準線（用來判斷有沒有漂移）

| 項目 | 值 |
|---|---|
| 起始 HEAD | `ea076df` |
| `npm run typecheck` / `lint` | exit 0 |
| `npm run prettier:check` | `All matched files use Prettier code style!` |
| `npm run test:session-unit` | `# tests 248 # pass 248 # fail 0` |
| `npm run test:mock` | `254 passed / 4 skipped`（258） |
| `npx vite build` 主 JS | 713.77 kB / gzip 201.04 kB（chunk `index-Ddb_WTIS.js`） |
| `npx vite build` CSS | 64.61 kB / gzip 10.65 kB |
| `grep -rc "as unknown as" src/` | 0（批 12 已清） |
| `grep -c "import.meta.glob" src/sessionViews.js` | 18 |
| `.tsx` 反向 import `sessionViews.js` | 14 檔 |
| `legacy-style-scan` 掃描集 | 39 檔（遞迴後應為 59） |
| WebKit mock 跑分（現況） | 86 failed / 40 passed / 3 skipped，其中 82 是 harness 問題 |
| `main` 落後 | 54 commit（含批 12），`main..HEAD` 零 migration |
| `CLAUDE.md` | 186 行 / 上限 200 |

任何一個數字對不上，**先查是不是 §4.4 的環境問題**，不要直接改計劃或改測試。

---

## 9. 如果你不同意計劃

計劃本身經過兩輪查證（實作 agent + 對抗審查員），但不是不能改。
若你發現某批的做法有問題：

- **在報告裡寫明**：哪裡不對、你的證據（`檔案:行號` + 逐字原文 + 實測輸出）、
  你的替代方案。
- **不要靜默偏離**。批 12 就有一處正向偏離（原規劃刪 9 處，實作發現修根因後
  10 處全可刪），它被寫在報告 §7「偏離與後續建議」裡，這是正確做法。
- **前提錯誤請直接說**。計劃裡若有事實錯誤，指出來比照做有價值。
  本輪 Codex 指出的 hook 計數問題就是這樣被修正的。
