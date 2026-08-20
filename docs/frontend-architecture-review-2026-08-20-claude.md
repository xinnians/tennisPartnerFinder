# 前端架構獨立審查（React + TypeScript 遷移後）

日期：2026-08-20（2026-08-20 二版，依 Codex 複核意見修正）
審查基準：**`c9bd71b`**。初版寫 `dec0065`；`dec0065..c9bd71b` 只動了 `CLAUDE.md`、
`.claude/rules/*`、`docs/frontend-migration-plan-*`（共 5 個文件檔、32 行增修），
`git diff dec0065..HEAD -- src/ tests/ package.json` 為空，**前端程式零變更**，
所以初版的全部技術分析在 `c9bd71b` 仍然成立。工作樹對 tracked 檔零差異。

本檔是對 `docs/frontend-architecture-analysis-after-react-migration-2026-08-20.md`（Codex）
的**獨立複核**：先在不讀該文件的前提下由 11 個維度平行審查，再對每條發現做對抗式驗證，
最後逐條查核 Codex 的可證偽主張。§6 是兩份分析的比對。

---

## 1. 一句話結論

**遷移的執行紀律是我看過同類專案裡的前段班，但架構取捨的帳還沒結。**

React 的成本已全額付清（+53% gzip bundle、雙層心智模型、18 條字串橋、10 處雙重斷言），
收益卻被設計掉了大半——三個頁面用 `key={generation}` 每次重繪整棵重掛，等於把
reconciliation 關掉。這不是失敗，是**刻意的 parity 鷹架**；問題是遷移已宣告收官，
鷹架卻沒拆。

Codex 說「畫面遷移成功，架構遷移尚未完成」——這個判斷我複核後同意，且證據比他舉的更硬。

---

## 2. 方法與證據等級

| 項目 | 做法 |
|---|---|
| 獨立分析 | 11 個維度平行 subagent，明令禁讀既有分析文件以避免錨定 |
| 對抗式驗證 | 22 條 high/medium finding 各配一名「嘗試推翻」的驗證員，要求逐字核對引用原文 |
| Codex 查核 | 抽出 28 條可證偽主張，7 組查核員逐條用原始碼驗真偽 |
| 完整性批判 | 1 名批判者針對 79 條 finding 找「還沒查的面向」 |
| 實跑 gate | typecheck / lint / prettier / build / 248 unit / 258 mock e2e 全部我親自跑過 |
| 線上實測 | 以瀏覽器實訪 qiuka.tw（production），讀 console 與 network |

合計 42 個 agent、406 萬 token、1,186 次工具呼叫。

**驗證有效性的證據**：79 條初判 finding 中，6 條 high + 16 條 medium 進對抗驗證後，
只有 2 條 CONFIRMED、20 條 PARTIAL，其中 17 條被降級為 low。這不是驗證員放水，
是初判傾向誇大——本檔只採用經得起推翻的部分。

---

## 3. 現況地圖（全部實測數字）

### 3.1 規模

| 面向 | 數字 |
|---|---|
| `.js`（未受檢） | 22 檔 / **10,017 行**（63%） |
| `.ts` | 3 檔 / 237 行 |
| `.tsx` | 20 檔 / 5,656 行 |
| 四大核心檔 | sessionViews 3,034 + sessionController 2,480 + main 1,575 + dataApi 1,178 = **8,267 行**，全部是 `.js` |
| React 單元 | 3 個導覽頁 + 1 個地圖抽屜 + 14 個 sheet/dialog + 2 個共用元件 |
| CSS | 13 檔 / 1,622 行 / 370 個 class / **0 個 CSS Module** |

### 3.2 React 使用形態（最能說明現況的一組數字）

> **二版更正**：初版這一格報的是「文字出現次數」（含 `import` 行），不是實際呼叫次數。
> Codex 指出後我重算，他的數字是對的。以下兩欄都列出，避免再被誤讀。

| | 實際呼叫 | 文字命中（含 import 行） |
|---|---|---|
| `useState` | **20** | 35 |
| `useRef` | **17** | 23 |
| `useCallback` | **5** | 8 |
| `useMemo` | **0** | 0 |
| `useEffect` | **0** | 0 |
| `flushSync` | **29** | 47（＝29 呼叫 + 18 import） |
| `createRoot` | **18** | 36（僅計 `.tsx`） |
| `unmount` | **0** | 0 |
| `dangerouslySetInnerHTML` | **0** | 0 |

計數方式：呼叫數用 `grep -rho '\buseState('`（`useRef` 另計泛型形式 `useRef<`），
文字命中用 `grep -rho '\buseState\b'`。

**結論不受影響**：`useEffect = 0` 不是紀律好，是**React 完全沒有被賦予生命週期責任**——
輪詢、訂閱、焦點託管、非同步流程全留在 legacy `.js`。React 只負責把 props 畫成 DOM。
`createRoot 18 / unmount 0` 這組對比也不變。

### 3.3 Gate 現況（我實跑）

| Gate | 結果 |
|---|---|
| `typecheck` | ✅ exit 0 |
| `lint` | ✅ exit 0 |
| `prettier:check` | ✅ All matched files use Prettier code style! |
| `build` | ✅ 907ms，但印出 >500 kB chunk 警告 |
| `test:session-unit` | ✅ `# tests 248 # pass 248 # fail 0`，1.86s |
| mock e2e（258 tests） | ✅ 隔離重跑全綠 |
| CI | ❌ **不存在**（無 `.github/`、無 git hook、無 husky） |

> ⚠️ **本次審查自身的教訓**：我第一次跑完整 mock e2e 時出現 16 red，但那是我同時跑
> 11 個 subagent 造成機器負載、5 秒斷言逾時所致。隔離重跑 32/32 綠、12.2 秒（同批
> 測試在滿載時逾時 5,000ms，隔離時單筆 301ms）。**這 16 個紅不是專案缺陷。**
> 但它揭露一個真實的脆弱性：suite 用 5s 硬性 timeout 且無 CI，gate 可信度綁在
> 「跑的時候機器夠閒」。

### 3.4 Bundle（實測歸因）

| | pre-React（`d704172`） | 現在（`dec0065`） | 變化 |
|---|---|---|---|
| 主 JS | 488.42 kB | **713.77 kB** | +46.1% |
| 主 JS gzip | 131.56 kB | **201.04 kB** | **+52.8%** |
| CSS | 67.3 kB | 64.61 kB | −4% |
| chunk 數 | 1 + 分析 | 1 + 分析 | 零 code splitting |

**歸因（二版：改用可重現的 `manualChunks` 探針重做，數字微調）**

探針設定檔保存在
`<scratchpad>/vite.chunks.probe.config.mjs`（把 `react`/`react-dom`/`scheduler` 切成
`react-vendor`、`src/mockData.js` 切成 `mockdata`），跑
`npx vite build --config <該檔>` 可完整重現：

| chunk | raw | gzip |
|---|---|---|
| `react-vendor`（react + react-dom + scheduler） | **193.70 kB** | **60.50 kB** |
| `mockdata`（`src/mockData.js`） | 6.30 kB | 1.85 kB |
| `index`（應用碼） | 511.86 kB | 137.22 kB |

- raw 總增量 713.77 − 488.42 = **225.35 kB**
- React runtime 佔 193.70 / 225.35 = **85.9%**（初版寫 84%，係口算，已更正）
- 應用碼增量 (511.86 + 6.30) − 488.42 = **29.74 kB**，只佔 13.2%

**遷移的應用碼代價其實很小，成本幾乎全在 React runtime 本身。**

Codex 對這一段的補充我採納，寫進結論：

- lazy loading **仍然值得做**——它縮小的是初始應用碼與單一 chunk 體積，這部分確實有 500 kB。
- 但**救不回那 194 kB**：首頁的附近球局抽屜本身就是 React 元件，React runtime 必進初始 bundle。
- 所以 code splitting 的正確期待是「首屏解析與執行變快」，不是「bundle 瘦一半」。

### 3.5 二版新增的重大事實：**整套 React 遷移從未上過 production**

兩份報告都沒發現這件事，它會改變整個優先順序討論。

```
$ curl -sSI https://qiuka.tw | grep last-modified
last-modified: Mon, 17 Aug 2026 09:46:20 GMT

$ curl -s https://qiuka.tw | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'
assets/index-BkwDmHwv.js                    # ← 本機 HEAD build 是 index-Ddb_WTIS.js

$ curl -s https://qiuka.tw/assets/index-BkwDmHwv.js | wc -c
485342                                      # ← HEAD build 是 713767

$ curl -s https://qiuka.tw/assets/index-BkwDmHwv.js | grep -c 'Minified React error'
0                                           # ← HEAD build 是 2
$ curl -s https://qiuka.tw/assets/index-BkwDmHwv.js | grep -c 'onCommitFiberRoot'
0                                           # ← HEAD build 是 1
```

git 側完全吻合：

| | commit | 日期 | React | `src/pages` + `src/sheets` |
|---|---|---|---|---|
| `main`（= production） | `638bdf9` | 2026-08-17 | ❌ 無 | 0 個檔 |
| 工作分支 | `c9bd71b` | 2026-08-20 | ✅ | 19 個檔 |

`main` 落後工作分支 **53 個 commit**。工作分支已 push 到 origin（`dec0065`），
所以 React 版存在於 preview alias，但 **production 服務的是 8/17 的 pre-React build**。

**這代表什麼**：下一次合併到 `main`，會是一次 53 commit、主 bundle +225 kB raw／
+53% gzip 的整個前端換血——而目前**零 CI、零 error boundary、零錯誤上報**。
這不是「架構債」，是一次具體的發布風險事件，值得單獨規劃（見 §8 的 REL 項）。

**一個讓風險小很多的事實**：`git diff --name-only main..HEAD -- supabase/migrations/`
**為空**——這 53 個 commit 沒有任何新 migration，是純前端變更（47 個 `src/`、9 個 `tests/`、
26 個 `docs/` 與工具鏈設定）。所以回滾只需要把 Vercel 切回前一個 production deployment，
沒有資料面的不可逆動作。

順帶更正初版一句話：初版 §P2 說「production console 實測有 `google.maps.Marker`
deprecated warning」——那是在 **pre-React 的正式站**上讀到的，取證來源要說清楚。
`src/map.js` 在 `main..HEAD` 之間確實有改過（批 1d，6 增 26 刪），但我直接查過 HEAD 版：
`google.maps.Marker` 仍有 4 處、圖釘仍是每次全清重建，所以這個 warning 與結論在
React 版一樣成立。

---

## 4. 這個架構的本質（我的判斷）

Codex 的架構圖是對的但少了關鍵一環。真正的形狀是：

```
sessionViews.js  ──18 條 import.meta.glob 字面路徑（eager）──▶  20 個 .tsx
       ▲                                                            │
       └────────── 14 個 .tsx 反向 import ../sessionViews.js ────────┘
                        （10 處用 as unknown as 強制轉型）
```

這是一個**雙向的循環相依，而且兩個方向的型別都是斷的**：

- 去程：`import.meta.glob(..., {eager:true})` 在此 tsconfig 下回傳
  `Record<string, unknown>`，mount 函式的型別是 `unknown`。
- 回程：`sessionViews.js` 是 `checkJs:false` 的 `.js`，匯出的 runtime 物件型別
  被 10 個 `.tsx` **各自手寫一份介面再 `as unknown as` 蓋掉**。

**我實地做的三拍證明**（存量綠 → canary 紅 → 還原綠）：

```ts
// src/__probe_typesafety.ts（驗完已刪）
const canary: string = mapSessionSummary({}).sessionId;   // 期待 number|null → 應報錯
```
`npx tsc --noEmit` → **exit 0，零錯誤**。

反向對照組（證明不是模組解析失敗）：
```ts
import { __definitely_not_exported__ } from "./dataApi.js";
```
→ `error TS2305: Module '"./dataApi.js"' has no exported member`。

**結論**：TypeScript 認得 `dataApi.js` 的匯出「名單」，但值的型別全是 `any`。
`strict: true` 保護的是 5,893 行；真正流資料的 10,017 行完全在外面。

驗證員另做了 canary 實測：把 `--checkJs` 打開，四大檔立刻各爆
**sessionViews 413 / sessionController 373 / main 300 / dataApi 268** 個錯誤。

---

## 5. 確認成立的問題

### P0 — 沒有

隱私紅線六項逐條查證**全部遵守**（§7.1），gate 全綠，production 站沒有測試資料。
沒有任何上線阻擋級問題。

### P1 — 值得排進下一個迭代

#### P1-1　`legacy-style-scan` 是假綠：React 層 20 檔 / 5,656 行完全逃出掃描

```js
// tests/legacy-style-scan.test.js:10-14
const srcFiles = readdirSync(SRC_DIR, { withFileTypes: true })
  .filter((entry) => entry.isFile() && [".css",".js",".ts",".tsx"].some(...))
```

`readdirSync` **不遞迴**。批 10 把元件搬進 `src/pages/`、`src/sheets/`、
`src/components/` 之後，這三個目錄裡的 20 個 `.tsx` 一個都掃不到。

更糟的是防呆本身失效：`assert.ok(FILES.length >= 23)` 的下限被 src 頂層的
38 個檔 + index.html 輕鬆滿足，**掃描集非空的斷言照樣綠**。檔內註解還寫著
「之後 src/ 新增樣式或渲染檔會自動納入掃描，不必記得手動加進 FILES」——這句話
在批 10 之後已經不成立。驗證員用 canary 實證：把 `#d7f22a` 與 `Baloo` 注入
`src/pages/MePage.tsx`，測試仍綠。

> 這正好符合你 memory 裡「守門檢查上線前必須以故意違規確認會失敗」的規則：掃描式測試的非空斷言
> 擋得住「目錄改名」，擋不住「目錄變深」。

**修法**：`readdirSync(..., { recursive: true })`，並把下限改成對子目錄檔數也有效的判準。

#### P1-2　全庫零 CI、零 git hook，而 `git push` 直接觸發部署

- `git ls-tree` 掃全部 17 個 ref，`.github/` 命中數皆為 0
- `.worktrees/public-release-qa-ci/.github/workflows/quality-gate.yml` 有一份**寫好但從未入版**的完整草稿（frontend + supabase 兩個 job）
- `.git/hooks` 未設，無 husky、無 lint-staged
- CLAUDE.md 列的 11 道 gate 全靠人工逐行打指令
- `vite build` 不檢型別，Vercel 只擋語法錯 → **型別／lint／測試失敗都能無聲上線**

驗證員修正了一點：這個風險**不含資料外洩**（隱私紅線由伺服端 RLS 執行，
hosted migration 不由 git push 套用）。最壞後果是前端回歸上到 preview／qiuka.tw
直到人工發現。所以是 P1 不是 P0。

> **二版更正（Codex 指出，我複驗後成立，而且比他說的更嚴重）**
> 初版寫「行動明確且便宜：把已寫好的 `quality-gate.yml` 入版」——**這樣做 CI 會直接失敗。**
> 那份 yml 呼叫 `test:ci:frontend` 與 `test:ci:supabase`，兩個 script 只存在於
> `codex/public-release-qa-ci` 分支，主線 `package.json` 的 `grep -c 'test:ci'` = **0**。
>
> 我進一步查了那個分支的實際狀態，它比「缺兩個 script」麻煩得多——**它落後主線 73 個
> commit，是 React/TS 遷移之前的世界**：
>
> | | 該分支 `package.json` |
> |---|---|
> | 缺的 script | `typecheck`、`lint`、`prettier:check`、`pretest:mock`、`pretest:local`（全部是 TS 時代才有的 gate） |
> | `test:mock` | 帶 `--project=mobile-webkit`，但主線 `playwright.config.js` 只有 desktop-chromium / mobile-chromium / supabase-chromium / supabase-mobile-chromium **四個** project → 直接跑會報 project not found |
> | `test:session-unit` | 只列 15 個檔，缺批 11 新增的 `tests/session-controller-sequence.test.js` |
> | 有價值的部分 | 它**有** `test:local:mobile`（`--project=supabase-mobile-chromium`），正是主線缺的那條 |
>
> **正確行動**：那份 yml 只能當 job 結構的樣板（checkout / setup-node / supabase start-stop /
> artifact 上傳 / concurrency 都可沿用）；`test:ci:*` 必須**對著目前主線的 `package.json`
> 重寫**，並逐項對照 CLAUDE.md 的 gate 清單確認無遺漏。順手把 `test:local:mobile` 撿回主線。

#### P1-3　10 處 `as unknown as ...Runtime`，實測 9 處是白丟檢查

驗證員以 `git archive HEAD` 取乾淨副本做實驗：

- 10 處全改直接賦值 → 只有 `src/components/SessionCard.tsx:43` 報 `TS2322`，
  且原因是 JS 端 `courts = []` 被推成 `never[]`，不是真的型別不相容。
- 其餘 **9 處 exit 0**。

三種漂移 canary 都證實斷言會吞掉錯誤：介面加不存在的方法（TS2741）、
JS 端改名（TS2741）、JS 端改回傳欄位名（TS2322）——加上 `as unknown as` 後全部靜默。

這是**這次審查唯一一條 CONFIRMED 且維持 medium 的 finding**，而且修法零風險：
刪掉 9 個斷言，第 10 個改單層斷言或補 JSDoc。這是投報比最高的一項。

#### P1-4　`src/mockData.js` 完整打進 production bundle

`dist/assets/index-Ddb_WTIS.js` 內可 grep 到「示範山嵐」「示範彗星」等 11 個虛構球友
（`dataApi.js:2` 是靜態 import，tree-shaking 救不了）。目前沒有使用者可見後果
（真實模式不走 mock 路徑）。

**體積要說準**：`manualChunks` 探針量到 `mockData.js` 獨立後是 **6.30 kB raw / 1.85 kB gzip**。
初版寫「白吃 bundle」語氣過重——真正的問題是**把 demo 資料出貨給所有使用者**，不是體積。

另外 build 端沒有任何「production 必須有 Supabase env」的斷言。

**注意一個相依**：mock 模式是測試 harness 的基礎（`test:mock` 用
`TENNIS_TEST_HARNESS_MODE=mock`，`playwright.config.js` 在 mock 模式把
`VITE_SUPABASE_URL` 塞 `"___"`），所以任何排除方案都不能讓 258 個 mock e2e 失效。
這不是一行改動。

#### P1-5　`--- 本次審查新發現 ---` 生產環境零可觀測性

- 全 `src/` 與 `index.html`：零 `window.onerror`、零 `unhandledrejection`、零 `addEventListener("error")`
- 唯一 console 呼叫是 `src/main.js:1434` 且 `if (import.meta.env?.DEV)` 包住 → production 完全靜默
- 18 個 `createRoot` 全裸掛，**零 error boundary**（grep `componentDidCatch` / `ErrorBoundary` 無結果）
- 唯一線上遙測是 `@vercel/analytics` 的 `inject()`，只有瀏覽量、無錯誤

對一個「63% 程式碼零型別檢查 + 命令式 DOM 補線」的前端來說，這代表**線上第一個
未預期例外會是白屏，而且沒有人會知道**。搭配 §3.5——下一次上線是一次 53 commit 的
整個前端換血——這一項的優先度應該再往上抬。

> **二版更正（Codex 指出，成立）**：初版 §8 寫「先接到 `@vercel/analytics` 或最小的自建端點」。
> **`@vercel/analytics` 是頁面分析與自訂事件工具，不是例外監控**，不可當主要方案。
> 正確的最小組合是：
>
> 1. React Error Boundary（包在正確的層級，見下）
> 2. `window.onerror`
> 3. `unhandledrejection`
> 4. 一個真正的錯誤接收端：Sentry／Bugsnag，或明確定義的自建端點
> 5. 配套決策：production source map 要不要開、敏感欄位過濾、錯誤分組與告警策略
>
> 其中第 4、5 項是**需要你拍板的選型**，不是我能替你決定的（見 §10）。
> 隱私紅線在這裡特別重要：錯誤上報絕不可帶 LINE、GPS、email、nickname 或 roster。

### P2 — 記錄下來，不急

| 項目 | 證據 |
|---|---|
| 底部導覽 focus 外框對比 1.95:1（未達 WCAG 1.4.11 的 3:1） | `style.css:31` `--color-court #1c5c3c` on `--color-ink #12291c`；`contrast-tokens.test.js` 只驗文字色、不驗外框 |
| 對比 gate 只讀 `src/session.css` 一個檔 | 批 10 拆成 13 檔後涵蓋率剩 1/13 |
| 附近球局抽屜捲動位置每 60 秒歸零 | `DISCOVERY_POLL_INTERVAL_MS=60000` → `publish()` → `key={generation}` 全樹重掛。**二版更正歸因**：`docs/migration-reports/batch-8.md:64` 記載遷移前的 `root.innerHTML` 就是同樣行為，批 8 刻意保留 parity——這是既有 UX 問題與待翻案的產品決策，不是 React 造成的回歸。群聊 feed 已有「先量後還原」的同型修法可照抄 |
| `push-sw.js` 22 行、零 fetch handler、零 `pushsubscriptionchange` | **二版修正措辭**：沒有 `fetch` handler 代表**沒有離線快取能力**；產品若未承諾離線使用，這是取捨不是缺陷（`manifest.webmanifest` 宣告 `display:standalone`，值得確認產品意圖）。缺 `pushsubscriptionchange` 是實質的推播韌性缺口——**訂閱失效後無法自動恢復**，使用者要手動重新開啟才會再收到 |
| Edge Function（156 行，握 service role + VAPID）在所有 gate 外 | 不進 tsconfig include、不進 lint/prettier；測試只覆蓋 4 個純函式 |
| 無 `vercel.json` | **二版依實測 response header 重寫**（`curl -sSI https://qiuka.tw`）：**已有** `strict-transport-security: max-age=63072000`（Vercel 預設 HSTS），所以不是「完全沒有安全 header」。**缺的是** Content-Security-Policy、`X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy`（此站要 geolocation）。另外注意 HTML 上帶 `access-control-allow-origin: *`。反向驗證安全的兩點：`dist` 無 `.map`、路由走 hash 故不需 SPA rewrite |
| `google.maps.Marker` 已 deprecated | `src/map.js` 4 處；production console 實測有此 warning。且每次 bounds 變動全清重建（`oldMarkers.forEach(m => m.setMap(null))`） |
| `DataApiUnavailableError` 預設訊息面向開發者 | 「此操作需要已設定的 Supabase 環境。」只有建立球局一處換成使用者語言 |
| `og:image` / `og:url` 寫死 `https://qiuka.tw` | preview 部署分享出去會呈現正式站圖文 |
| npm audit 2 個 high | 皆 dev-only（postcss，經 vite 傳遞）；`--omit=dev` 為 0 |
| 14 個 sheet 的 React root 從不 unmount | `sheets.js:76` 直接 `root.innerHTML = ""`。**今天零後果**（0 個 useEffect 就沒有 cleanup 可漏），但誰加第一個 useEffect 誰踩雷 |

---

## 6. 與 Codex 分析的比對

### 6.1 事實準確度：Codex 這份文件品質很高

28 條可證偽主張的查核結果：

| 裁決 | 數量 |
|---|---|
| TRUE | 22 |
| MOSTLY_TRUE | 4 |
| MISLEADING | 1 |
| UNVERIFIABLE | 1 |
| **FALSE** | **0** |

數字類主張逐一重算全部命中：`713.77 kB / 201.04 kB`、`64.61 / 10.65`、
`10,017 / 237 / 5,656` 行、`2,480 / 3,034 / 1,575 / 1,178`、`18 個 eager glob`、
`14 個 TSX 反向依賴`、`1,429 行拆成 13 檔`、`248 個單元測試`、
`桌面 520px`——連小數點兩位都對得上。**沒有一條是編的。**

### 6.2 我要修正的四點

| # | Codex 原文 | 修正 |
|---|---|---|
| **P0 測試資料污染** | 「實測目前連線資料時，畫面出現大量名稱像 `host-20260819T...` 的帳號」→ 列為 P0 | **這幾乎確定是本機資料，不是正式環境。** `.env.local` 指向 `http://127.0.0.1:54321`；`host-<時間戳>` 的唯一產生器是 `tests/fixtures/sessionFactory.js` 的 `createActor()`。我實訪 qiuka.tw：整個台北市 lat 24.918–25.142 / lng 121.330–121.770、未來 14 天窗口的 `session_discovery` 查詢回來「這個地圖範圍內 0 場可加入」。**正式站看不到任何測試資料。**<br>**二版補充（Codex 提醒，成立）**：「正式站 0 場」是 **2026-08-20 這個時間點的觀察**，不是永久保證。它證明的是「當下沒有污染」，不是「不可能被污染」。真正提供保證的是 `validateLocalSupabaseConfig` 那道防護（見下一列），那才是結構性的。 |
| 「CI 啟動時檢查 project URL，禁止測試指向 production」 | 列為待辦 | **這道防護已經存在，而且位置比 CI 更前面。** `tests/fixtures/localSupabaseConfig.js` 的 `validateLocalSupabaseConfig` 對 `API_URL` 做 `!==` 嚴格比對，不是 `http://127.0.0.1:54321` 就直接 throw；`tests/local-supabase-config.test.js` 有 9 條回歸測試守著。這條建議可以劃掉。 |
| 「TSX **必須**用 `as unknown as ...` 自己保證 JS 型別正確」 | | 是 **10/14**，不是全部。MePage 與 SessionDetailSheet 直接用 runtime 物件（MePage 甚至用 `ReturnType<typeof ...>` 反推），MessagesPage 與 MySessionsPage 只用單層 `as`。而且**實測 9/10 根本不需要**——這比 Codex 的說法更值得行動。 |
| 「React 遷移前 gzip 約 130 KB；現在約增加 54%」 | | 基準值對（`d704172` 實測 131.56 kB），但增幅實算是 **+52.8%**。54% 是用四捨五入後的「130」回推來的，把 1.2 個百分點的捨入誤差寫進了結論。 |
| 「4 個主頁」 | | 精確說是 **3 個導覽頁 + 1 個地圖頁抽屜**。`NearbySessionsDrawer.tsx` 掛在 `#nearby-sessions-drawer`，地圖頁殼本身仍是 `main.js` 的原生 DOM。 |
| 「實測主控台沒有 error 或 warning」 | | production 有 warning：`google.maps.Marker is deprecated`（我實訪 qiuka.tw 讀 console）。來源是 Google SDK 不是應用碼，但對應的 `src/map.js` 用法確實該升級到 `AdvancedMarkerElement`。 |
| 「沒有濫用 `useEffect`」 | | 講保守了。是 **0 個 useEffect**——這不是「沒濫用」，是 React 根本沒被賦予生命週期責任。這個事實比 Codex 的措辭更能支撐他自己的「React 仍被當成 HTML 模板」論點。 |

### 6.3 Codex 漏掉的（本輪新增）

按重要性排：

1. **`legacy-style-scan` 假綠**（P1-1）——Codex 說「測試覆蓋很完整」是專案強項，
   方向對，但沒發現這個 gate 在批 10 之後已經漏掉整個 React 層。
2. **零 CI、零 git hook**（P1-2）——Codex 完全沒提。他說「gate 全部通過」是對的，
   但沒問「誰保證下次也會跑」。
3. **9/10 的 `as unknown as` 是白丟的**（P1-3）——Codex 只說「TSX 必須這樣做」，
   等於把可拆的鷹架誤判成必要成本。
4. **`mockData.js` 進 production bundle**（P1-4）。
5. **零 error boundary / 零錯誤回報**（P1-5）。
6. **`push-sw.js` 零 fetch handler、零 `pushsubscriptionchange`**。
7. **Edge Function 在所有 gate 外**。
8. **無 `vercel.json`** → 零安全 header。
9. **抽屜捲動位置每 60 秒歸零**——初版說這是「generation key 唯一一個今天就在傷害
   使用者的具體後果」。**二版更正：歸因錯了。**
   `docs/migration-reports/batch-8.md:64` 的取捨表逐字寫著
   `| .nearby-drawer__scroll | 每次是新 element，scrollTop 回 0 | 相同 | 會保留 scrollTop，是可觀察行為變更 |`，
   同節並說明「本批要求使用者可見行為零改變……沒有引入『React 悄悄保留捲動』的差異」。
   也就是**遷移前的 `root.innerHTML` 就是這個行為，批 8 是刻意保留 parity**。
   所以它是一個真實的 UX 問題，但它是**產品行為決策**，不是 React 遷移造成的回歸，
   也**不能拿來當 generation key 的罪證**。（這條是我自己的歸因錯誤，不是 Codex 的。）
10. **focus 外框對比 1.95:1**。

### 6.4 我這輪被推翻／降級的（誠實揭露）

對抗驗證推翻了不少我的初判，列出來讓你知道哪些**不要**當成問題：

- 「`domainTypes.ts` 與 mapper 漂移、是永久假綠」→ **推翻**。
  `tests/session-data-boundary.test.js`（57 個測試）對 mapper 做 key 集合白名單
  逐一比對，canary 實測兩次都變紅。不是編譯期守門，但**已證明能抓到違規**。
- 「render 期間寫 WeakMap 會在 StrictMode 下雙寫」→ **推翻**。
  `resolveMySessionsSegment` 對重複呼叫輸出等冪，驗證員以 Node 模擬跑過三次同值。
- 「`.js` 完全沒 lint 會藏正確性缺陷」→ **推翻**。
  驗證員建臨時 config 對全部 `.js` 套 ESLint 核心正確性規則，**只漏 5 處
  unused-var 死碼，零正確性缺陷**。
- 「`sessionViews.js` 跨邊界改寫 React 子樹違反明文禁令」→ **定性不成立**。
  `react-migration.md` 禁的是反方向（React 不得跨界改 sheet root）；
  adapter 寫自己的 sheet 是被明文授權的。
- 「OAuth 登入會摧毀 `#/session/:id` 深連結」→ **我自己推翻了完整性批判者的這條**。
  hash 確實會掉（`redirectTo: location.origin`），但 `src/sessionIntent.js` 把
  `{action:"join", sessionId}` 存進 `sessionStorage`，`resumePendingIntent()`
  在 auth 落地後重開球局。controller 內唯一的登入入口 `requireSessionAction`
  一律先存 intent。殘餘問題只剩「回來後網址不再是可分享的深連結」，屬 low。

---

## 7. 專案真正的強項（不是客套，是查證後的）

### 7.1 隱私與資料邊界：六條紅線逐條查證，全部遵守

| 紅線 | 裁決 |
|---|---|
| 所有讀寫過 `dataApi.js` | ✅ 全 src 的 `.from(` 14 處全在 `dataApi.js`；`.rpc(` 全庫僅 1 處單一出口 |
| raw `sessions`/`session_participants`/`profiles` 不給 browser | ✅ 零直接存取 |
| LINE 退役 | ✅ `src/` 只剩 `dataApi.js:822` 的 `p_line_id: null`（凍結簽名所需），零讀取零渲染；且有遞迴掃描測試守著，canary 實測能抓到違規 |
| 匿名面只三欄 | ✅ `dataApi.js:32-34` 恰好是 `host_nickname` / `host_ntrp` / `host_profile_complete`，mapper 逐欄具名而非物件展開 |
| raw GPS 不落地 | ✅ 座標只存在 tracker closure 的節流狀態，start/stop 對稱清除，唯一出口直送 RPC |
| Web Push payload 白名單 | ✅ 遵守 |

**而且 React 遷移不但沒有侵蝕邊界，反而更乾淨**：20 個 React 模組**沒有一個**
import `dataApi.js`，也沒有一個碰 `document` / `window` / `globalThis`，
全部只吃 props。分層比紅線要求得還嚴。

### 7.2 反假綠紀律

`contrast-tokens`、`public-brand-scan`、`session-data-boundary`、`smoke` 四支都有
「掃描集非空」的顯式斷言（如 `assert.ok(SESSION_ACTION_CODES.length > 0,
"the action-code parity scan must not be vacuous")`）。這在多數專案裡看不到。
P1-1 之所以是缺口，正是因為這條紀律的下限值沒跟著目錄結構調整——不是紀律不存在。

### 7.3 XSS：混用期收得比預期乾淨，**本次原始碼檢查未找到可利用路徑**

> **二版修正措辭（Codex 指出，成立）**：初版寫「沒有任何可利用路徑」過於絕對——
> 那是一次靜態原始碼檢查的結論，不是形式化證明，也沒有做動態滲透測試。
> 準確的說法是：**本次原始碼檢查未找到可利用的 XSS 路徑；剩餘的 `innerHTML` 使用的
> 是靜態內容或已經過 `esc()`**。下面的證據支持這個較弱但成立的說法。

- 全 src 只剩 6 個 `innerHTML` 寫入點，全在三個 legacy `.js`
- `esc()` 涵蓋 `& < > " '` 五字元，單/雙引號屬性情境都成立
- `grep '=\${' src/*.js` 零命中 → 沒有 unquoted attribute 情境
- **關鍵**：15 個 `mountSheet`/`mountDialog` 呼叫點中 **13 個傳 `html: ""`**，
  另 2 個只傳靜態骨架。使用者可控字串（暱稱、聊天訊息、備註）已 100% 遷到
  React 文字節點，innerHTML 路徑實際上不再接觸任何使用者資料。

這是這次遷移在安全面**最大的、沒被任何人記帳的收穫**。

### 7.4 非同步過期守衛

`sessionController.js` 為九個獨立資料面各配一個 `requestGate`，
`refreshAuthoritativeState` 在寫入後（含伺服器拒絕路徑）一致重讀權威資料。
這層品質相當高，且 `sessionController.js` 是三個大檔裡唯一乾淨的一層——
完全框架無關、零 react import。

---

## 8. 建議路線圖

> **二版：這一節已被展開成獨立的可執行計劃**，含每項的檔案清單、相依順序、工時、
> 風險、驗收條件、必跑測試、可否獨立回滾，以及需要拍板的七個決策：
> **`docs/frontend-fix-plan-2026-08-20.md`**
>
> 下面保留初版的路線圖概要作為脈絡。三處已被後續查證修正的地方：
> (a) CI 不是「把 yml 入版」（見 §5 P1-2 的二版更正）；
> (b) 錯誤上報不可用 `@vercel/analytics`（見 §5 P1-5）；
> (c) 抽屜捲動是批 8 的 parity 取捨、已從 P1 降級（見 §6.3 第 9 點）。

我同意 Codex「不換框架」的判斷，也同意他的三階段大方向。差異在**順序與投報比**。

### 第 0 步：先修便宜又能立刻收利的（半天）

1. **刪 9 個 `as unknown as`**（P1-3）——零風險，立刻恢復 .js→.ts 邊界的漂移偵測。
2. **`legacy-style-scan` 改遞迴 + 調整非空下限**（P1-1）——並補 canary 反向驗證。
3. **把 `quality-gate.yml` 從 worktree 入版**（P1-2）——草稿已經寫好了。
4. **`contrast-tokens.test.js` 改讀 13 個 CSS 檔**，並加一組 focus 外框對比斷言。

這四項合計不到一天，但能補齊「守門檢查能抓到違規且會自動觸發」，
後面所有重構才有安全網。

### 第 1 步：止血（1 週）

5. `mockData.js` 改動態 import 或以 env 條件排除（P1-4）。
6. 加 error boundary + `window.onerror` + `unhandledrejection`，先接到
   `@vercel/analytics` 或最小的自建端點（P1-5）。
7. 抽屜捲動位置還原——照抄群聊 feed 已有的「先量後還原」。
8. 補 `vercel.json`（安全 header + `push-sw.js` 的 Cache-Control）。

### 第 2 步：拆循環相依（2–3 週）

Codex 這條我完全同意，且我的證據讓它更緊迫：把 `sessionViews.js` 的 presentation
純函式（14 個 `Object.freeze` runtime 匯出）抽成獨立模組，**直接用 `.ts` 寫**。
兩件事同時解決：

- 循環消失 → 可以做 lazy loading
- 那 10 個手寫 Runtime 介面全部作廢 → 型別自然對齊，不用再靠斷言

順序建議：先抽 `avatarRuntime` / `sessionCardRuntime`（最小、被最多人用）驗證流程，
再往大的走。

### 第 3 步：讓型別保護核心（3–4 週）

Codex 的順序（mapper → controller state → controller → main.js）我同意。
補一點：`dataApi.js` 轉 `.ts` 時**先跑一次 `--checkJs` 看基準錯誤數**（現在是 268），
用它當進度指標，比「感覺快好了」可靠。

### 第 4 步：拆 parity 鷹架（4–8 週）

這裡有個 Codex 沒點破的**順序陷阱**：`key={generation}` 不能單獨拿掉。

`sessionViews.js` 的 `wireMySessionsPage` / `renderNearbySessionsDrawer` 在 mount
之後用 `querySelectorAll` 逐一 `addEventListener`，**沒有 `signal` 也沒有解除**。
今天不會累加的唯一原因，就是 generation key 保證舊節點必被丟棄。

**先移除 key 會讓申請／接受／撤回等寫入操作雙發。** 正確順序是：

1. 先把補線改成元件內的 `onClick`（`MessagesPage.tsx` 已經是純 React 事件，
   證明可行，且它是唯一沒有 generation key 的頁面——這是選擇不是限制）
2. 補一條常駐 probe 斷言「同一顆按鈕的 click listener 數 ≤ 1」
3. 才拿掉 generation key

同時把 sheet 的 `reactRoot.unmount()` 補進 `mountSheet` 的 `close()`——
在有人加第一個 `useEffect` 之前。

---

## 9. 最後判斷

Codex 的結論「畫面遷移成功，架構遷移尚未完成」是對的。我補三句：

1. **這次遷移最大的收穫沒被記帳**：使用者可控字串 100% 離開 innerHTML 路徑，
   XSS 面實質關閉。這比 bundle 大 200 kB 值錢。
2. **最大的風險不在架構，在 gate**：一個 63% 程式碼零型別檢查、63% 零 lint、
   React 層逃出品牌掃描、且沒有任何 CI 的專案，靠的是人的自律。
   前面四個「半天就能做完」的項目，投報比遠高於任何架構重構。
3. **generation key 是關鍵節點，但初版把因果講糊了**（Codex 指出，成立）。
   初版說它是「bundle 沒收益、狀態雙層真相、props 爆量、捲動歸零、listener 不能解除
   的共同上游」——bundle 那一項是錯的。正確的歸因是五條**不同**的因果鏈：

   | 問題 | 真正的原因 |
   |---|---|
   | bundle 變大 | React runtime（193.70 kB，佔增量 85.9%）＋ 18 條 eager glob 無分包 ＋ `mockData` 靜態 import |
   | 捲動歸零、元件內部狀態被重設 | `key={generation}` 整棵重掛 |
   | 事件可能重複綁定 | legacy 的 `querySelector` + `addEventListener` 補線方式（43 個 add、0 個 remove） |
   | 雙層狀態、props 膨脹 | legacy adapter 架構本身 |
   | 循環相依 | `sessionViews.js` 與 `.tsx` 雙向 import |

   `key={generation}` 與 legacy 補線**互為前提**——這是為什麼拆除必須按順序，
   也是為什麼它是關鍵節點。但它不是 bundle 變大的原因，拆掉它不會讓 bundle 變小。

---

## 附錄：本次審查的可重現指令

```bash
# 規模
find src -name '*.js'  -exec cat {} + | wc -l      # 10017
find src -name '*.tsx' -exec cat {} + | wc -l      # 5656

# React 使用形態
# 注意：下面兩種寫法量的是不同東西，初版混用了，二版已分開。
grep -rho '\buseEffect\b'  src --include='*.tsx' --include='*.ts' | wc -l   # 0  文字命中
grep -rho '\buseState('    src --include='*.tsx' --include='*.ts' | wc -l   # 20 實際呼叫
grep -rho '\buseState\b'   src --include='*.tsx' --include='*.ts' | wc -l   # 35 文字命中(含 import)
grep -rho 'useRef[<(]'     src --include='*.tsx' --include='*.ts' | wc -l   # 17 實際呼叫(含泛型)
grep -rho '\bflushSync('   src --include='*.tsx' --include='*.ts' | wc -l   # 29 實際呼叫
grep -rho '\bcreateRoot('  src --include='*.tsx' --include='*.ts' | wc -l   # 18 實際呼叫
grep -r  createRoot src --include='*.tsx' | wc -l                          # 36 文字命中(含 import)
grep -rc 'unmount' src | grep -v ':0'                                      # 空

# production 跑的是哪個版本（二版新增）
curl -sSI https://qiuka.tw | grep last-modified
curl -s https://qiuka.tw | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'
curl -s https://qiuka.tw/assets/<上一行的檔名> | grep -c 'onCommitFiberRoot'   # 0 = 無 React
git log --oneline -1 main; git rev-list --count main..HEAD                  # 53
git diff --name-only main..HEAD -- supabase/migrations/                    # 空 = 純前端發布

# 正式站安全 header（二版新增）
curl -sSI https://qiuka.tw | grep -iE 'strict-transport|content-security|x-content-type|referrer-policy|permissions-policy'

# 型別邊界反向驗證（canary，跑完請刪）
cat > src/__probe.ts <<'EOF'
import { mapSessionSummary } from "./dataApi.js";
export const c: string = mapSessionSummary({}).sessionId;   // 應報錯，實際 exit 0
EOF
npx tsc --noEmit; echo "exit=$?"; rm src/__probe.ts

# .js 若開檢查會爆幾個錯
npx tsc --noEmit --checkJs 2>&1 | grep -c 'sessionViews.js'   # 413

# bundle 歸因（二版：可重現版本，不要只留文字結論）
# 探針設定檔內容見 §3.4；把 react/react-dom/scheduler 與 mockData 切成獨立 chunk。
npx vite build                                   # 基準：單一 chunk 713.77 kB / gzip 201.04 kB
npx vite build --config <scratchpad>/vite.chunks.probe.config.mjs
#   → react-vendor 193.70 kB / gzip 60.50 kB
#   → mockdata       6.30 kB / gzip  1.85 kB
#   → index        511.86 kB / gzip 137.22 kB
# pre-React 基準：git 切到 d704172 再 npx vite build → 488.42 kB / gzip 131.56 kB

# 隔離跑測試（不要跟其他重負載並行，5s 斷言會逾時假紅）
npm run test:session-unit
TENNIS_TEST_HARNESS_MODE=mock npx playwright test --project=desktop-chromium --project=mobile-chromium
```
