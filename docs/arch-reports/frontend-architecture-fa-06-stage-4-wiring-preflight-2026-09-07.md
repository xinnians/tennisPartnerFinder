# FA-06 階段 4：surface wiring 唯讀盤點

- 日期：2026-09-07
- 基準 commit：`25059b4`
- 範圍：final-v3 階段 4 的結構 gate、surface loader、wiring 與相容 facade
- 結果：可以開工；本文件只記錄查證結果，沒有修改 runtime、migration、Hosted 或 production 設定

## 白話結論

現在的 `sessionViews.js` 同時做了三件事：保留舊 API、管理 lazy loader，以及在檔案載入時偷偷完成其他
view 模組的接線。問題不是功能壞掉，而是「只要 import 這個舊檔，接線就會自動發生」，責任不清楚，也讓
未來拆檔容易被讀檔名的測試擋住。

這一階段會先讓測試從 manifest 得知真正 owner，再把 loader 與接線逐批搬出去。`sessionViews.js` 先保留
相容用途，不一次改掉 87 個測試呼叫，因此不會用大爆改換取表面上的檔案變小。

## 已核對的現況

### Manifest 與結構 gate

- `tests/fixtures/surfaceManifest.js` 實際為 81 行，由 3 支測試 import：
  `app-errors.test.js`、`react-surface-lifecycle.test.js`、`session-presentation-boundary.test.js`。
- manifest 現有名冊實際數量：sheet adapters 14、unmount registrations 14、eager modules 1、
  lazy pages 3、navigation destinations 4、lazy sheets 14、imperative adapters 8、presentation consumers 14。
- `react-surface-lifecycle.test.js` 仍把 `sessionViews.js` 寫死為 lazy loader、unmount registration 與
  authenticated preload 的來源。這三個 owner 搬檔時會造成與行為無關的假紅燈。
- 現有核心契約仍有效且必須保留：單一 React root、`syncCommit` 唯一實作與 2 個 caller、14 個
  unmount registration、surface close 順序、1 個 eager App、14 個 lazy sheets、3 個 lazy pages、
  authenticated identity 才 warm，以及 4 個導覽目的地與既有可及性契約。

### final-v3 所稱的「可退役 5 條」

用 final-v3 首次入版 commit `51dde9c` 回看當時行號後，5 條的精確內容是：

1. lazy loader 物件不得含 `eager:` 的字面斷言。
2. `sessionViews.js` 內必須依序出現 `pointerover`、`focusin` 的字面斷言。
3. `sessionViews.js` 不得含 `content.renderStage`／`function renderStage` 的字面斷言。
4. `sessionPresentation.ts` 必須剛好出現 13 次 `Object.freeze` 的字面計數。
5. 三份歷史 migration report 必須保留特定措辭的一組斷言。

這些都鎖住檔案寫法或歷史文字，沒有提供新的使用者行為保護。移除它們不等於移除 lazy、生命週期、
可及性或隱私契約。

### Runtime wiring

- `sessionViews.js` 目前有 4 個頂層 configure 呼叫：session surface、profile、discovery、form；form 確實最後。
- 另有 2 個真正的頂層預載 listener：`pointerover` 與 `focusin`。
- `configureSessionViewModules` 是 function declaration；唯一 production caller 是 `main.js`，而且在建立
  controller 與首次 React render 前呼叫。
- `deferSurfaceOpen` 目前也是 function declaration。搬到 `src/views/surfaceLoaders.js` 後仍必須保持 function
  declaration，不能改成依賴宣告順序的函式運算式。
- 四個 `src/views/*` configure 模組彼此沒有互相 import；可依文件順序 discovery → session → profile →
  form 搬到專用 wiring 模組，由 `main.js` 明確啟動。
- 瀏覽器規格目前有 87 次 `window.__importAppModule("sessionViews")`，分布於 12 個 spec 檔。這是最後評估
  facade 退役時的真實成本，本階段前半不改名。

### 不能遺失的獨立邊界

- private repository 主 chunk 隔離、demo identifier 與 production E2E hook 邊界仍由
  `scripts/check-production-bundle.mjs` 負責。
- LINE 聯絡資料退役與允許的登入用途仍由 `tests/session-data-boundary.test.js` 負責。
- 本次 targeted 基線把 lifecycle、presentation、ownership、privacy 與 CI config 一起跑過：121／121 通過。
  所以後續不能把這些獨立 gate 誤當成 wiring 測試而刪除。

### Ownership manifest 的連動

- `deferSurfaceOpen` 同時存在於 HTML renderer inventory 與 DOM mutation ledger。搬檔時兩處都要從
  `src/sessionViews.js::deferSurfaceOpen` 重掛到新 symbol 路徑。
- DOM mutation ledger 目前為 17 files／125 nodes／34 symbols／112 references。若只把
  `deferSurfaceOpen` 搬進新檔、而 `sessionViews.js` 仍保留其他 mutation，file 數會成為 18；其餘數量應由 AST
  實掃決定，不能手填推測值。
- browser port manifest 目前另列 `src/sessionViews.js::<top-level>::document` 與
  `src/sessionViews.js::preloadForIntent::Element`。listener 與 intent preloader 搬檔時也要按實際 symbol 重掛。

## 固定實作順序

### 4.1 Gate manifest 化（tests only）

- 在既有 `SURFACE_MANIFEST` 新增 frozen 的結構來源路徑；初值仍指向目前真實 owner。
- lifecycle gate 透過 manifest 讀 lazy loader、unmount wiring 與 auth preload owner，不再寫死
  `sessionViews.js`。
- 保留名冊逐項比對與 key === dynamic import 字面；來源不存在、掃描為空、少項、多項或重複都必須紅。
- 精確移除上節列出的 5 組純字面凍結。

### 4.2 共用 loader 底座

- 新增文件已指定的 `src/views/surfaceLoaders.js`，搬 14 個 dynamic import、mount binding、preloader 與
  `deferSurfaceOpen`。
- `sessionViews.js` 先繼續提供既有 facade API；不改 87 個 harness calls。
- 同批更新 surface manifest owner、HTML renderer inventory 與 mutation ledger，並用 AST 實掃值更新 baseline。

### 4.3 四個 configure

- 新增專用 `src/views/sessionViewWiring.js`，由 `main.js` composition root 明確呼叫。
- 搬移順序固定為 discovery → session surfaces → profile → form；form 最後。
- 14 個 register-unmount 函式隨 wiring 搬移，manifest 指向新 owner；舊的 4 個頂層 configure 必須歸零。

### 4.4 App module 與 preload listener

- 搬 `configureSessionViewModules`、`pointerover`／`focusin` listener 與其 app-module/preload 狀態到專用 wiring。
- `main.js` 仍須在 controller 與首次 render 前完成一次接線；重複設定不得新增重複 listener。
- 更新 browser port manifest 的真實檔案＋symbol，不以行號維護。

### 4.5 Facade 評估

- 前四批與完整回歸通過後，才重新量 87 個 harness calls 與 production imports。
- 只有每個新 owner 都已有直接測試、舊 bridge 可同批刪除時才退役 facade；否則保留，不為了檔案數硬拆。

## 每批驗收

每個 runtime 批至少執行：targeted Node gates、typecheck、lint、Prettier、mock Chromium、production build、
bundle checker 與 `git diff --check`。涉及 loader、listener 或 surface lifecycle 時，另跑既有 lazy-load race、
unmount、Escape、navigation/focus 規格；最後再跑完整 frontend CI。這個階段不需要 migration。

## 本次未做

- 未修改 `src/`、測試、manifest、依賴、bundle limits、migration、Hosted、secret 或 runtime 開關。
- 未宣稱 facade 可以立刻刪除。
- 未把 local preview 當成 production 裝置或 Web Vitals 證據。
