# 批 10:CSS 收整——分檔、去重、@layer 決策(視覺零變更)

Base HEAD：`0098db7`（`git log --oneline -1` = `0098db7 docs: 遷移計劃進度——批 9a 完成,113 條原樣全綠,9b 縮為五項留置`）。
開工時 `git status --porcelain` 為空。

---

## 0. 防偽引用（`docs/migration-reports/batch-9a.md`「驗收方註記」節第 2 條第一句原文）

> 2. **獨立 canary（第四發，角度＝重複派發，與 dev 三發〔合併／次序／繞過〕相反方向）**：
>    `setCourts` 內 `emit("courts")` 複呼一次 → 單元測試 `decision sheet stays nonterminal…`
>    紅（`courtUpdates` 恰一次的 deepEqual 斷言）→ 還原後 246/246 綠、controller SHA 逐字
>    回復 `c945bc03…`。

---

## 1. 結論摘要

| 子目標 | 結果 |
| --- | --- |
| token/global 分檔 | **部分完成**：1429 行的 `src/session.css` 切成 13 個檔；但 token 層依測試釘住只能留在 `session.css`（§2.4） |
| `@layer` 取代來源順序依賴 | **未做，縮 scope**：三個實證反例證明本站層疊「跨群組依賴特異性」，任何 layer 切法都會翻轉勝負（§3） |
| 清除重複樣板 | **完成**：50 組逐字同宣告全數盤點，其中 12 組結構性重複去重，38 組巧合同值刻意不併（§4） |
| 視覺零變更 | **達成**：48 案例 × 2796 元素列 × 80 個 computed style 屬性 + 幾何，逐值零差異（§7）；另有靜態層疊等價證明（§8） |

`src/**/*.{js,ts,tsx}` 只改 `src/main.js` 的 import 區塊，零行為碼變更（§6）。`tests/**` 零修改零新增。

---

## 2. 分檔結構

### 2.1 檔案清單、行數與層疊位置

層疊次序＝`src/main.js` 的 import 次序（本檔即 SoT，見 §3 為何不是 `@layer`）。

| # | 檔案 | 行 | 位元組 | 內容 |
| --- | --- | ---: | ---: | --- |
| 1 | `src/style.css` | 35 | 1284 | 全域 reset/base（**未改動**，內容與 HEAD 逐字相同） |
| 2 | `src/map-page.css` | 232 | 11819 | 地圖頁殼、topbar、品牌、城市 chip、地圖控制、球友名單列、工具列 chips、程度 popover |
| 3 | `src/discovery.css` | 173 | 10738 | 附近球局 peek／抽屜、球局卡、球友卡、badge 語彙、地圖資料狀態列 |
| 4 | `src/surfaces.css` | 155 | 11466 | `.surface` 基底、表單語彙、篩選 sheet、option-grid、缺額 radio |
| 5 | `src/sheet-shells.css` | 92 | 4455 | **新增**：跨 sheet 共用殼（貼邊殼、全螢幕殼、拉把 ×5、返回鈕、sheet 頁首、註腳） |
| 6 | `src/navigation.css` | 121 | 4335 | 底部五格導覽、徽章、未讀圓點、`.visually-hidden` |
| 7 | `src/pages.css` | 239 | 19570 | 我的球局／訊息／我 三頁（含通知設定、封鎖清單、v2 頁殼、segmented、狀態章） |
| 8 | `src/session.css` | 235 | 21278 | 設計 token 層 + 球局詳情 sheet + 群組聊天（組合原因見 §2.4） |
| 9 | `src/create-session.css` | 137 | 13169 | 開球局／編輯全螢幕流程、固定底鈕、成功頁、toast |
| 10 | `src/responsive.css` | 36 | 2105 | `max-width: 700px` 與 `390px` 斷點覆寫 |
| 11 | `src/vocabulary.css` | 81 | 7465 | 批 D1 基礎語彙：time-tile／scoreboard-strip／slots-brick／chip／toggle-switch／ntrp-brick |
| 12 | `src/player-sheets.css` | 38 | 2236 | 球友名單 sheet 與球友卡 sheet |
| 13 | `src/motion.css` | 31 | 2367 | keyframes、按壓回饋、`prefers-reduced-motion` 全域降級 |
| | **合計** | **1605** | **112287** | HEAD 為 `session.css` 1429 行／101364 位元組 + `style.css` 35 行／1284 位元組 |

行數增加 141 行，全數是各檔的檔頭註解與去重說明；宣告本身只減不增（§4）。

**新檔一律放 `src/` 直屬，不放 `src/styles/` 子目錄**——`tests/legacy-style-scan.test.js:10-13` 用
`readdirSync(SRC_DIR)` 且**不遞迴**，只掃 `src/` 直屬檔。放子目錄會讓舊視覺常數封條的掃描面
從「整份 CSS」縮成「只剩 session.css」，是靜默的 gate 弱化。放直屬則自動納入，符合該檔
第 8-9 行註解「之後 src/ 新增樣式或渲染檔會自動納入掃描」的設計意圖。實測掃描集由
27 檔（26 src + index.html）成長為 **39 檔**（38 src + index.html），斷言下限 23 仍安全。

### 2.2 token 區塊位移的零影響證明

`session.css` 排在第 8 位，token 區塊因此由全域第 1 位移到第 8 位。三項證據證明對計算值零影響：

1. **全庫只有一處 custom property 宣告區塊**。以括號配對掃描 `src/*.css` 全部規則，
   宣告 `--*` 的選擇器集合＝`[":root"]`（`session.css`），`style.css` 為 `[]`；共 27 行 `--x:` 宣告。
2. **JS 端沒有任何寫入**。`grep -rn "setProperty|style.cssText|--color-|--space-|--radius-|--z-|--bottom-navigation" src/**`
   命中皆為 `var(--x)` **讀取**（SVG `stroke`、TSX 的 `stroke` 屬性）或 `src/pins.js:1-4` 的字面
   hex 同步註解，零寫入點。
3. 單一宣告的 custom property，其計算值與宣告位置無關（無競爭宣告即無層疊比較）。

### 2.3 「零重排」的建置產物證明（stage 1，去重前）

先只做切檔、不做去重，`npm run build` 後把 minified CSS 依頂層大括號配對切成規則序列比對：

```text
HEAD rules: 567  NEW rules: 567
multiset identical: true
token rule index HEAD: 9  NEW: 391
token rule byte-identical: true
remaining rule count: 566 566
其餘 566 條規則順序與內容逐條相同: true
```

即：切檔在建置產物上**只造成 `:root{--color-*}` 這一條規則的位置改變**（第 9 → 391），
其餘 566 條規則的**內容與相對順序逐條相同**。配合 §2.2，切檔本身對計算值零影響是被證明的，
不是被斷言的。

### 2.4 批 10 當時為何 token 與群聊不能搬出 `session.css`

> **批 14 後註（2026-08-20）**：`tests/contrast-tokens.test.js` 已改為自動讀取 `src/`
> 全部 13 個 CSS 檔，下面是批 10 當時的歷史限制，不再是目前契約。token 與三條群聊
> 規則日後可在維持層疊與視覺契約的前提下搬檔。

`tests/contrast-tokens.test.js` 以 `readFileSync` **直讀 `src/session.css` 的字面內容**，正則驗三件事，
而 `tests/**` 是本批凍結面（零修改零新增）：

| 測試位置 | 釘住什麼 | 對分檔的約束 |
| --- | --- | --- |
| `tests/contrast-tokens.test.js:31-41` | 11 個 `--color-*: #hex` 字面值 | token 層必須留在本檔 |
| `tests/contrast-tokens.test.js:69`、`:86-92` | `.chat-session-summary span`／`.chat-archived-note`／`.chat-message__meta` 三條規則，正則 `\n<選擇器> \{([^}]*)\}` 要求**選擇器頂格、規則體同一行** | 群聊區塊必須留在本檔，且不得縮排包進任何區塊 |
| `tests/contrast-tokens.test.js:85` | `assert.ok(CSS.length > 10_000)` | 本檔必須保有足量實質內容 |

第三條是本批中途才觸發的實測失敗（切完只剩 8758 字元 → 紅）。解法選了**零重排**的那條：
原始 `session.css` 中詳情 sheet（第 899–1033 行）**緊鄰**群聊區塊（第 1034–1106 行）之前，
把兩者一起留在本檔既滿足長度下限，又不需要搬動任何規則的相對順序。最終 18175 字元，測試綠。

這是分檔結構唯一的「非主題性」妥協，已在 `src/session.css` 檔頭逐項寫明原因。

---

## 3. `@layer` 決策：**未做**，附三個實證反例

派工單允許「若盤點後認為某子目標風險大於收益,可縮 scope」。盤點結論是 `@layer` 在本站
**不是低風險的組織手段，而是行為變更**，理由如下。

### 3.1 機制前提

CSS 層疊順序是「重要性 → **layer** → 特異性 → 來源順序」。**layer 比特異性更早決勝**：
較後 layer 的低特異性規則會贏過較前 layer 的高特異性規則。本站現行層疊的正確性**大量依賴
跨群組的特異性勝出**，因此任何把這些群組切成不同 layer 的做法都會翻轉勝負。

### 3.2 三個反例（皆為現行碼實況）

1. **`responsive` 若成為較後的 layer，六個 sheet 殼全壞。**
   `responsive.css:23` 的 `@media (max-width:700px) { .surface { width: calc(100vw - 20px); max-height: 80dvh; padding: var(--space-4) } }`
   特異性 (0,1,0)；六個 `.surface.<sheet>` 殼（filter／session-detail／player-directory／
   player-card／session-chat／create-v2）特異性 (0,2,0)，宣告 `width:auto; max-width:none;
   max-height:none/88dvh/74dvh` 等。今天由特異性決勝、sheet 殼贏；layer 化後 responsive 贏，
   ≤700px（含首發主力的 390px）所有貼邊與全螢幕 sheet 的寬高定位全部改變。
2. **`motion` 若成為最後的 layer，按壓回饋覆寫全壞。**
   `motion.css` 的 `.band-option:active { transform: scale(0.95) }` 特異性 (0,2,0);
   `map-page.css` 的 `#band-options .band-option:active { transform: scale(0.97) }` 是 (1,2,0)、
   `surfaces.css` 的 `.filter-sheet-band-grid .band-option:active { transform: scale(0.97) }` 是 (0,3,0)。
   今天兩者以特異性贏 0.97；layer 化後 motion 贏 0.95。
3. **`base` 若成為第一個 layer，`button:disabled` 的既有優先權消失。**
   `style.css:33` 的 `button:disabled { cursor: not-allowed; opacity: 0.58 }` 特異性 (0,1,1)，
   今天勝過元件層 (0,1,0) 的 `cursor` 宣告（如 `create-session.css` 的 `.create-v2__publish { cursor: pointer }`）。
   把 base 放進第一個 layer 後元件層永遠贏——**恰好翻掉 base 唯一真正需要優先權的那條規則**。

### 3.3 附帶結論

- 「把 layer 順序設成與現行來源順序一致」**無法**規避以上問題：問題不在 layer 之間的順序，
  而在 layer 邊界本身會使特異性讓位。
- 要安全導入 `@layer`，得先把上述跨群組特異性依賴改寫掉——那是行為變更重構，
  不屬於「視覺零變更」批次。**建議另開批討論，本批不硬做。**
- `!important` 已逐一盤點：全庫僅 4 處（`style.css:35` `[hidden]`、`discovery.css` 的
  `.location-feedback` margin-top、`session.css` 的 `.chat-message__sender` margin-bottom、
  `motion.css` 的 reduced-motion `*`），**四者屬性互不重疊**，故 layer 化的
  「important 順序反轉」在本站不會造成衝突。這條對本次決策不構成翻案理由（反例 1–3 才是）。
- 代價：檔間層疊仍依賴 `src/main.js` 的 import 次序。緩解＝該處與 13 個檔的檔頭都寫明
  「這串 import 的次序就是層疊次序，調換會靜默改變視覺」與各檔的層疊位置編號。

---

## 4. 重複盤點與去重

### 4.1 盤點方法（不靠肉眼）

對 `npm run build` 的 minified CSS，把每條規則拆成「選擇器 / 宣告體」，以**宣告體字串**分組，
取出所有 `≥2` 個選擇器共用同一宣告體的組。結果：**50 組逐字同宣告**。

### 4.2 兩類重複的分界

派工單要求「先證明重複是逐字重複」。實際盤點發現 50 組裡多數是**巧合同值**而非樣板重複，
兩者必須分開處理：

- **結構性重複**：同一個視覺元件被逐批各寫一次（sheet 拉把 ×5、頁頭 ×3、全螢幕殼 ×2……）。
  合併是還原單一來源，**去重**。
- **巧合同值**：語意無關的元件剛好共用一個值。例如 `transform:scale(.92)` 出現在
  `.topbar-icon-button:active` 等 8 個互不相干的選擇器上、`flex:1;min-width:0` 出現在 9 個、
  `margin:0` 出現在 8 個。把它們併成選擇器清單會把無關元件耦合起來，日後任一方要改值就得先拆，
  **刻意不併**。

**12 組去重、38 組保留**。

### 4.3 逐組去重決策（含逐字比對結果）

派工單點名的兩組，逐字比對後**都不是完全相同的副本**：

| 組 | 副本 | 逐字比對 | 決策 |
| --- | --- | --- | --- |
| **sheet 拉把 ×5** | `.nearby-drawer__bar`／`.filter-sheet__grabber`／`.session-detail-sheet__grabber`／`.player-directory-sheet__grabber`／`.player-card-sheet__grabber` | **三種形狀**：共同 `display/width/height/border-radius/background` 相同；`margin` 三種（`0 auto`／`2px auto 12px`／`2px auto 14px`）；`flex:none` **只有兩個有** | 抽共同 5 宣告成一條，三種 margin 各一條，`flex:none` 只給原本就有的兩個。**不補齊**——另外三個的父層不是 flex 容器，補上會改動 `flex-grow/shrink/basis` 的 computed 值 |
| **頁頭 ×3** | 訊息／我／我的球局 的 `__head`＋`__eyebrow`＋`__title` | `__eyebrow` 三份**逐字相同**；`__title` 只有訊息與「我」相同（`margin:2px 0 0`），我的球局是 `margin:0`；`__head` 只有「我」與我的球局相同（`space-2`），訊息是 `space-3` | eyebrow 三併一、title 二併一、head 二併一；**兩處差異保留**並就地註明原因 |

其餘十組：

| 組 | 選擇器 | 比對 | 決策 |
| --- | --- | --- | --- |
| 全螢幕殼 ×2 | `.surface.session-chat-sheet`／`.surface.create-v2` | 13 宣告**逐字相同** | 整條合併 → `sheet-shells.css` |
| 貼邊殼 ×2 | `.surface.session-detail-sheet`／`.surface.player-card-sheet` | 13 宣告**逐字相同** | 整條合併 |
| 貼邊殼共同定位 ×4 | 上述兩者 + `.surface.filter-sheet`／`.surface.player-directory-sheet` | 6 宣告（對稱 inset、bottom、width、max-width、貼邊圓角、陰影）相同，其餘不同 | 抽共同 6 條，差異留在各檔 |
| 返回鈕 ×2 | `.chat-v2__back`／`.create-v2__back`（含 `:active`） | **逐字相同** | 合併 |
| 全螢幕頁首 ×2 | `.chat-v2__head`／`.create-v2__head` | 5 宣告相同，群聊多一條 `border-bottom` | 抽共同 5 條，差異留一條 |
| sheet 頁首 ×2 | `.filter-sheet__head`／`.player-directory-sheet__head` | **逐字相同** | 合併 |
| 註腳 ×2 | `.cta-footnote`／`.player-card-sheet__footnote` | **逐字相同** | 合併 |
| 頁殼寬度 ×2 | `.my-sessions-shell`／`.messages-shell` | **逐字相同** | 合併（`.me-shell` 多 `display/gap`，不併） |
| 工具列 ×2 | `.my-sessions-shell__tools`／`.my-sessions-v2__tools` | **逐字相同** | 合併 |
| 空狀態文字 ×2 | `.messages-page__empty-text`／`.my-sessions-v2__empty-text` | **逐字相同** | 合併 |
| 「我」頁白卡殼 ×8 | `.me-identity-card`／`.me-sign-in-card`／`.me-service-links`／`.player-visibility`／`.me-edit-profile`／`.me-login-methods`／`.notification-settings`／`.blocked-player-settings` | 4 宣告（padding／border／radius 12px／background）相同，各自的 display/gap/margin-top 不同 | 抽共同 4 條；`.presence-settings`（success-bg 底色是「分享中」語意）**刻意排除** |
| 設定卡 h2 ×5、卡內 `margin:0` ×7 | `.player-visibility h2` 等 | 各自**逐字相同** | 各併一條 |

合併後每個被併的 class 都做過反向確認：全庫沒有第二條規則宣告同屬性到同一元素
（見 §8 檢查 1／檢查 2 的自動化結果，以及 `grep -h -o` 的選擇器出現次數清點）。

**成果（實算，非手數）**：dist CSS 規則數 **567 → 546（−21 條）**，位元組 **67426 → 64716（−2710）**，
而**宣告總筆數 2643 → 2643 完全不變**——正是「只合併、不增刪任何宣告」的定義。

---

## 5. CSS Module 化決策：**不上**

`.claude/rules/react-migration.md` 的頁面批凍結面明列「每批凍結 testid、id、class、aria、文案、
DOM 結構與全域 CSS」，而 CSS Module 會把 class 名編譯成雜湊名。實際衝突面：

- `tests/smoke.spec.js`／`session.spec.js`／`session-mobile.spec.js` 有大量以 class 名為錨點的
  定位（如 `#my-sessions-page .my-sessions-v2__segmented`、`.player-profile`、`[data-chat-feed]` 旁的
  `.chat-message__bubble`），`tests/**` 是本批凍結面，改名即紅。
- `tests/contrast-tokens.test.js` 直接以**字面 class 名**正則比對 CSS 文本（§2.4）。
- `src/*.js` 以 `innerHTML` 樣板字串產生 class（620 組 class 字面組合，見 §8 的抽取數），
  Module 化必須改動所有樣板，牴觸「js/tsx 除 CSS import 外零修改」。

因此**全域 class 名全部保留**，本批只做檔案組織與重複收斂。若日後要 Module 化，
應在既有 e2e 錨點改為 `data-testid`-only 之後另開批。

---

## 6. js/tsx 修改明列

**只有 `src/main.js` 的檔首 import 區塊**，零行為碼變更：

- 移除：`import "./style.css";` / `import "./session.css";`（原第 1–2 行）
- 新增：13 行 `import "./<檔>.css";`（次序＝§2.1 表格）＋ 6 行區塊註解說明
  「這串 import 的次序就是層疊次序」。

`git status --porcelain` 全貌：`M src/main.js`、`M src/session.css`、11 個 `?? src/*.css` 新檔。
`tests/**`、`index.html`、其餘 `src/**/*.{js,ts,tsx}` 皆未觸碰（`index.html` 本批未改，
它本來就不直接引用 CSS）。

---

## 7. 幾何指紋：48 案例 × 2796 元素列，逐值零差異

### 7.1 方法

以 `0098db7` 建獨立 temp worktree（`cp -al` 硬連結 `node_modules` 後刪其 `.vite`），HEAD 與工作樹
**依序**各啟一個 Vite（5283／5284，不並行），mock 模式 env 照抄 `playwright.config.js:31-37`。
沿用批 8.6／8.7 教訓：Google Maps 與 Fonts 以 `page.route` stub；輪詢 ready 用 `localhost` 非
`127.0.0.1`；取樣前先等 **rAF 兩幀** → `waitForTimeout(700)`（最長動畫 `qmSheetUp 0.34s`）→
**兩輪 macrotask**；開 surface 前把 `Date` 換成固定時點 `2099-08-01T00:00:00.000Z`。

每個案例對其 surface root 底下**每個元素**取：
`getBoundingClientRect` 的 x/y/width/height（四捨五入到小數 2 位）＋ **80 個 computed style 屬性**
（display/position/z-index/overflow×3、color/background×2/opacity/visibility、字體 8 項、
padding 4、margin 4、border width/style/color 各 4、radius 4、box-shadow/box-sizing/outline 3、
flex 與 grid 12 項、width/height/min/max 6 項、top/right/bottom/left、transform/transition/
animation 2/cursor/pointer-events/text-overflow），外加元素識別指紋
`tag|id|排序後 class|data-testid`。兩個 viewport：desktop 1280×900、mobile 390×844。

### 7.2 覆蓋清單（24 案例 × 2 viewport ＝ 48）

| 類別 | 案例 |
| --- | --- |
| 頁面（5 面 / 8 案） | `map-initial`、`my-sessions-page`、`my-sessions-page-empty`、`messages-page`、`messages-page-empty`、`me-page`（已登入態）、`me-page-anonymous`、`map-toast` |
| 地圖面 surface | `map-nearby-drawer`（附近球局抽屜）、`map-filter-sheet`、`map-level-popover` |
| sheet（11） | `session-detail-sheet`、`session-unavailable-sheet`、`create-session-sheet`、`edit-session-sheet`、`decide-session-sheet`、`profile-completion-sheet`、`session-chat-sheet`（系統／他人／自己三型泡泡皆在）、`player-directory-sheet`（在線／非在線兩列）、`player-card-sheet`、`court-players-drawer`、`map-filter-sheet`（同上，含 12 個 `.chip--district`） |
| dialog（3） | `login-dialog`、`withdraw-dialog`、`report-dialog` |

每個 surface 至少一態；`my-sessions`／`messages` 另補空狀態、`me` 另補匿名態，用以覆蓋
§4 去重的 `__empty-text`／`__eyebrow`／白卡殼等規則。

### 7.3 結果（自 probe 輸出逐字抄錄）

```text
案例數: 48
比對元素列: 2796   每列 style 屬性數: 80
sig 不符: 0   幾何不符: 0   computed style 不符: 0
HEAD console errors: 0   WORK console errors: 0
HEAD page errors: 0   WORK page errors: 0

幾何指紋:逐值零差異 PASS
```

掃描集非空且為實算：48 案例、2796 元素列（各案例 root 及其全部後代，`<script>`／`<style>` 除外），
每列 4 個幾何值 + 80 個 computed style 值 → 比較值總數 2796 × 84 ＝ **234,864**。

---

## 8. 層疊等價的靜態證明（建置產物層級）

幾何指紋只覆蓋被取樣到的狀態。為補足未取樣狀態（`:hover`／`:active`／`:disabled`／
其他資料組合），另做一組建置產物層級的證明。前提：本批**沒有改任何選擇器字面、沒有改任何值**，
只做切檔與「數條同宣告規則併成選擇器清單」。因此只要下列兩件事成立，
對任何元素、任何屬性，勝出的宣告都與 HEAD 相同：

**檢查 1 — 宣告多重集合相同。** 把 minified CSS 攤平成 `(媒體條件, 單一選擇器, 屬性, 值)`：

```text
宣告筆數(選擇器 × 屬性):HEAD 2643 / NEW 2643
檢查 1 宣告集合差異:HEAD 獨有 0 筆 / NEW 獨有 0 筆
```

**檢查 2 — 同特異性且可能命中同一元素的選擇器,先後關係不變。**
特異性不同的配對順序怎麼變都不決勝，故排除；「可能命中同一元素」判準取聯集：
(i) 一方所需 class 集合是另一方的子集（如 `.surface` ⊂ `.surface.filter-sheet`）；
(ii) 原始碼某個 class 字串同時含兩方所需 class（自 `src/**/*.{js,ts,tsx}` 與 `index.html`
抽出 **620 組** class 字面組合，涵蓋 `.chip` vs `.chip--district` 這種「不同 class 同一元素」）。

```text
原始碼抽出的 class 組合數:620
同屬性配對總數 138409;同特異性且可能命中同一元素、實際比對的 649 對
順序反轉:0 對

檢查 2 PASS(掃描集非空)
```

**驗證器自身有牙（兩發，改建置產物副本、不動工作樹）：**

- canary A（改值）：在 dist CSS 副本給 `.chip` 插入 `height:37px` →
  檢查 1 紅：`HEAD 獨有 14 筆 / NEW 獨有 15 筆`。
- canary B（搬規則）：把 `.chip{…}` 整條搬到檔尾 → 檢查 2 紅：
  `! height: |.chip vs @media(max-width:700px)|.chip (HEAD -1 → NEW 1)`、
  `! transition: |.chip vs |.filter-chip (HEAD -1 → NEW 1)`。

---

## 9. Canary：三發紅 → 綠（幾何指紋面）

| # | 角度 | 注入 | 紅的證據 | 還原 |
| --- | --- | --- | --- | --- |
| 1 | **token 值** | `--color-court: #1c5c3c` → `#1c5c3d`（僅末位 hex） | 差異值 **546**、受影響案例 **46/48**；如 `court-players-drawer/desktop .surface__eyebrow color: "rgb(28, 92, 60)" vs "rgb(28, 92, 61)"` | `session.css` SHA 逐字回復 `b6efa9b2…` |
| 2 | **檔間層疊順序** | `main.js` 對調 `map-page.css` 與 `vocabulary.css` 的 import 次序 | 差異值 **804**、受影響案例 **22/48**；如 `create-session-sheet .time-tile--done width: "64px" vs "60px"`、`gap: "3px" vs "2px"` | `main.js` import 區塊重建並確認 13 行 import |
| 3 | **去重規則本身** | 從合併後的 eyebrow 規則移除 `.my-sessions-v2__eyebrow` 一個選擇器 | 差異值 **188**、受影響案例**恰為 4**（`my-sessions-page`／`my-sessions-page-empty` × 2 viewport）；`color: "rgb(28, 92, 60)" vs "rgb(18, 41, 28)"`（掉回繼承色）、頁頭高度 117 → 136px | `pages.css` SHA 逐字回復 `39ab18cb…` |

**還原後全綠**：13 個 CSS 檔 SHA 與 canary 前逐檔比對 → 「所有 CSS 檔 SHA 逐字回復 ✓」；
重跑指紋 → `案例 48、元素列 2796;差異值 0;受影響案例 0 / 零差異(綠)`。

canary 2 同時是一個**既有缺陷的實證**，見 §12 觀察項 1。

---

## 10. Gate 七站逐字結尾

跑前 `pgrep -fl vite` 無輸出（vite 歸零）。DB 累積授權同前批，已執行 guarded reset。

| 站 | 指令 | 逐字結尾 |
| --- | --- | --- |
| 1 | `CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test` | `{"target":"local","version":"","message":"Reset local database."}` |
| 2 | `npm run test:db` | `Files=7, Tests=799,  1 wallclock secs ( 0.04 usr  0.02 sys +  0.03 cusr  0.03 csys =  0.12 CPU)` / `Result: PASS` |
| 3 | `npm run test:mock` | `4 skipped` / `252 passed (2.4m)` |
| 4 | `npm run test:local` | `11 skipped` / `42 passed (1.4m)` |
| 5 | `TENNIS_TEST_HARNESS_MODE=local npx playwright test --project=supabase-mobile-chromium` | `6 passed (9.3s)` |
| 6 | `node scripts/generate-courts-seed.mjs --check` | `--check 通過:產出檔案與 data/courts.json 重生結果一致。` |
| 7 | `npm run typecheck` / `lint` / `prettier:check` / `build` / `git diff --check` | typecheck 與 lint 無輸出；`All matched files use Prettier code style!`；`dist/assets/index-POOF5iYX.css   64.72 kB │ gzip:  10.69 kB` / `✓ built in 850ms`；`git diff --check` 無輸出 |

---

## 11. 偏離清單

1. **`@layer` 未做**（派工單三大子目標之一）。理由與三個實證反例見 §3；派工單已預留
   「風險大於收益可縮 scope」。
2. **token 未抽成獨立檔**。被 `tests/contrast-tokens.test.js` 直讀 `src/session.css` 釘住，
   `tests/**` 凍結（§2.4）。全域 reset/base 本來就已是獨立的 `src/style.css`，本批未改其內容。
3. **`session.css` 同時裝 token＋詳情 sheet＋群聊**，是分檔結構唯一的非主題性妥協；
   起因是同一支測試的 `CSS.length > 10_000` 下限（§2.4）。選了「零重排」的合併方式。
4. **新增一個計劃外的檔 `src/sheet-shells.css`**。跨檔的結構性重複（拉把、貼邊殼、全螢幕殼）
   合併後需要一個共同的家；放進 `vocabulary.css`（批 D1 語彙）會混淆該檔定位。
5. **新檔放 `src/` 直屬而非 `src/styles/` 子目錄**，為的是不讓 `legacy-style-scan` 的掃描面
   靜默縮水（§2.1）。代價是 `src/` 直屬多了 11 個檔。
6. **去重範圍大於派工單點名的兩組**：另做了 10 組結構性重複（§4.3），其中「我」頁白卡殼 ×8
   是全案最大一組（8 選擇器 × 4 宣告）。同時**刻意不動** 38 組巧合同值。
7. **流程事故（已修復，記錄備查）**：canary 2 還原時誤用 `git checkout -- src/main.js`，
   把本批對 `main.js` 的改動一併回退到 HEAD（HEAD 只有 2 行 import）。已重建 import 區塊
   並以「13 行 import」與後續全綠指紋確認。這正是既有教訓「canary 清除禁 git checkout,
   要精確刪行」的複現——**還原 canary 一律用精確編輯，不用 `git checkout`**。

---

## 12. 觀察項（PM 裁決，本批不改）

1. **`.time-tile--done` 是死宣告。** `create-session.css` 的
   `.time-tile--done { width: 60px; gap: 2px }` (0,1,0) 排在 `vocabulary.css` 的
   `.time-tile { width: 64px; gap: 3px }` (0,1,0) **之前**，同特異性後者勝 → 修飾子完全無效。
   幾何指紋實測成功頁的時間磚為 `width=64px  rowGap=3px`（不是 60/2）；canary 2 把兩檔對調後
   立刻變成 60px/2px，反證這條今天確實不生效。**要不要讓它生效是產品決策**（會改變成功頁視覺），
   故本批原樣保留。
2. **`.level-chip { font-weight: 600 }` 是死宣告。** 被 `vocabulary.css` 較後的
   `.chip { font-weight: 500 }` 蓋掉；`map-initial` 實測 `.chip.level-chip` 的
   `fontWeight=500`。
3. **`.chip--district` 整條被蓋掉。** `surfaces.css` 的
   `.chip--district { height: 38px; padding: 0 13px; font-size: 13px }` 全數輸給較後的 `.chip`；
   篩選 sheet 的 12 個行政區 chip 實測 `height=36px  fontSize=13.5px`。該規則旁的註解
   「行政區 chip 比日期／打法矮一階(dc:h38 而非 h40)」描述的是**設計意圖，不是現況**。
4. 三者是同一個 pattern：**修飾子檔排在基底語彙檔之前**。若 PM 要一次修，正解是把
   `vocabulary.css` 移到消費它的檔案**之前**，並逐一確認各修飾子恢復生效後的視覺是否是想要的
   ——那是視覺變更批，不是本批。
5. `.chip--district:active { transform: scale(0.95) }` 未受影響（`.chip:active` 是 `.94`，
   但 district 那條較後，仍生效）——四個 chip 修飾子裡只有這條倖存，可作為上一點的對照。

---

## 附錄:本批未使用 `@layer` 的替代保護

因為檔間層疊改由 `src/main.js` 的 import 次序決定，三處都寫了同一件事，避免未來有人重排：

1. `src/main.js` import 區塊上方的 6 行說明（「調換次序會靜默改變視覺」）。
2. 12 個切出檔的檔頭都有 `**層疊位置 N / 13**` 與「調動 import 次序會改變層疊結果」。
3. 對順序特別敏感的四個檔（`surfaces.css`／`responsive.css`／`vocabulary.css`／`motion.css`）
   檔頭另註明它與哪些規則靠特異性或順序決勝。

## 驗收方註記（2026-08-19）

1. **偏離五條全數接受**：@layer 不做（三個實證反例＋read-back Lens 4 抽驗反例 1 屬實）、
   token 不搬（contrast-tokens 測試約束，驗收方 canary 實證有牙）、sheet-shells 新檔＋
   src/ 直屬（legacy-style-scan 非遞迴 readdir 經 Lens 4 實跑驗證，38→39 檔）、
   去重超點名範圍但 38 組巧合同值刻意不併（Lens 3 抽驗屬實）、流程事故誠實記錄
   （main.js 重建經 Lens 2 逐 hunk＋跨檔順序全數重驗，「canary 還原禁 git checkout」
   教訓第二次實證）。
2. **獨立 canary（第四發，角度＝token 位置約束，dev 三發皆指紋面未打測試面）**：
   `--color-court` 自 session.css 刪除 → `contrast-tokens` 測試紅 → 還原後 4/4 綠、
   SHA 逐字回復 `b6efa9b2…`。
3. **Read-back 四 lens，視覺零變更由四重獨立證據確立**：dev 幾何指紋（48 案例
   234,864 值零差異）、dev dist 層宣告多重集合（2643=2643）、Lens 1 獨立 source 層
   攤平（2642=2642，postcss 管線，差 1 筆為 minifier 計法差異）、Lens 2 逐鍵勝出值
   比對（2616 鍵零差異）。跨檔／檔內順序以子序列比對全數重驗（12 檔 violations=0）。
4. **兩個 concern 的裁決＝接受**：
   (a) 報告 §8「順序反轉 0 對」的普遍句過強——Lens 2／3 獨立重算各發現同一組
   12 對同特異性理論反轉（Me 頁卡片 h2 margin 叢集 ×10、discovery-empty flex ×2），
   逐一讀 markup 證實現有 DOM 下不可能同元素（各卡片為兄弟 section 永不巢套），
   加上幾何指紋經驗面覆蓋，視覺零變更結論不變；「對任何假想 markup 都等價」的
   宣稱應理解為「對現有 markup 等價」。維護注意：日後若把這些 class 用於新巢套
   結構，以工作樹 import 序為準，不要對照舊單檔時代的直覺。
   (b) guarded DB reset 授權敘述缺口——報告未記錄觸發原因且「同前批」指涉不準
   （批 9a 實際未跑 reset）。reset 走 CONFIRM 防護標準入口、事後 799 條 DB 測試
   ＋local 42 全綠，零實害，接受；日後派工單將 reset 條件改寫為兩態（疑累積必跑
   並記錄證據／否則不跑並聲明），消除模糊。
5. **報告 §2.1 HEAD 檔數手數錯誤**（宣稱 26 src 實為 27，38 才對）——實質結論
   不受影響，「自己數的數字一律指令算」紀律違例再添一例，入 memory。
6. 驗收方七站 gate 複跑全綠（mock 252／local 42 passed）；驗收期間工作樹零修改。
