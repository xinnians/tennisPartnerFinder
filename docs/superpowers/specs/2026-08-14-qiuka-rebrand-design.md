# 球咖改名工程 design spec（球局 → 球咖）

日期：2026-08-14
狀態：已核可待執行（名稱與 icon 由 ian 拍板；網域 qiuka.tw 已購買並接上 Vercel）
前置盤點：兩個唯讀 agent 全 repo 掃描（品牌接觸點＋測試耦合），引文皆經逐字驗證。

## 背景與已定案事項

- 品牌名定案 **「球咖」**，正式全名 **「球咖｜台北網球」**，短名 **「球咖」**。
- 網域 **qiuka.tw**（含 www）已購買、掛進 Vercel、DNS 生效、SSL 已發；Production
  環境變數五個已補齊。
- icon 定案為微笑球（production candidate 資產在
  `docs/brand/concepts/qiuka/final/`，含 SVG 三檔與 16–1024px PNG）。
- 核心原則：**只改「品牌自稱」，不改產品名詞**。UI 中「球局」作為名詞（開球局、
  附近球局、我的球局、球局已取消……）全部保留；「球咖＝服務名，球局＝一場球」
  是刻意的兩層詞彙。

## 硬約束

- 測試中 155 處「球局」名詞文案不得改動；只有品牌自稱接觸點在本 spec 範圍內。
- `public/icon.svg` **檔名不可換**（`tests/public-brand-scan.test.js:14` 直接
  readFileSync、`push-sw.js:9` 與 manifest 引用路徑），只置換檔案內容。
- 新資產不得含 `tests/public-brand-scan.test.js:19` 的四個 BANNED 舊色
  （`#142c4b`、`#2465bd`、`#d7f22a`、`#eef4fb`）；微笑球用的 `#ddf53c` 不在清單，安全。
- `manifest.webmanifest` 的 `theme_color` 與 `index.html` 的 theme-color meta 必須
  維持一致（同測試檔 :34 斷言）；本次不改主題色。
- CLAUDE.md 隱私紅線全部不變；不新增任何 LINE 面。

## 變更清單（逐檔）

### A. 品牌文字（自稱接觸點）

| 檔案 | 現值 | 改為 |
|---|---|---|
| `index.html:18` | `<title>球局｜台北市網球</title>` | `<title>球咖｜台北網球</title>` |
| `index.html:34` | `.app-brand__name` 內文「球局地圖」 | 「球咖」 |
| `index.html:32` | `aria-label="球局首頁"` | `aria-label="球咖首頁"` |
| `public/manifest.webmanifest:3-4` | name「球局｜台北市網球」／short_name「球局」 | 「球咖｜台北網球」／「球咖」 |
| `public/privacy.html:6` | `<title>隱私權政策｜球局</title>` | `隱私權政策｜球咖` |
| `public/privacy.html:43` | 「球局」是一個台北市網球找球伴的公開服務。 | 「球咖」是一個…（句式不變） |
| `public/privacy.html:206` | ← 回到球局地圖 | ← 回到球咖 |

### B. 通知 fallback title（同字串兩處，必須同批同改）

- `public/push-sw.js:3`：fallback「球局通知」→「球咖通知」。
- `supabase/functions/notification-outbox-dispatch/dispatch.js:56`：同字串同改。
  十種事件 title（「球局群組有新訊息」等）皆為名詞用法，**不改**。
  Edge Function 改後需重新部署（由 ian 執行，列入上線 checklist）。

### C. icon 與 favicon

- `public/icon.svg`：內容置換為
  `docs/brand/concepts/qiuka/final/qiuka-app-icon.svg`（檔名、路徑不變）。
- `index.html:6-9`：favicon 由 inline 🎾 emoji data URI 改為 `/icon.svg`；另補
  `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`（自 final PNG 180px 複製至
  `public/apple-touch-icon.png`；iOS 不吃 SVG favicon）。
- `public/manifest.webmanifest`：icons 陣列補 192／512 PNG 與
  `purpose: "maskable"` 項（自 final PNG 複製至 `public/`）。

### D. 社群分享卡（OG，全新增）

- 新資產 `public/og.png`（1200×630）：微笑球＋「球咖」字標＋副標
  「台北網球揪球地圖」，計分板配色，需先產出字標（見 E）。
- `index.html` head 新增：`og:title`（球咖｜台北網球）、`og:description`
  （草案：「找你的球咖，開你的球局。台北網球公開球局地圖。」文案 ian 可改）、
  `og:image`（`https://qiuka.tw/og.png`）、`og:url`（`https://qiuka.tw/`）、
  `og:type`、`twitter:card`（summary_large_image）。

### E. 品牌資產修正（design-critique 2026-08-14 結論）

- `qiuka-smile-mark-mono.svg` 六處 fill 改 `currentColor`（README 已承諾此用法）。
- 產出「球咖」字標與橫式 lockup（OG 卡與後續貼文用）。
- `docs/brand/concepts/qiuka/final/README.md` 的「接縫永遠維持兩道」改寫為
  家族規則：微笑與輪廓不變，球面紋理隨球種替換；兩道接縫是網球版規格。
- 專用 16px favicon 簡化版（去接縫）：**可選**，若 16px 實測可接受則後補。

## 灰區拍板（已決，ian 可否決）

1. `index.html:23` `aria-label="台北市球局地圖"` **不改**——它描述的是「台北市的
   球局的地圖」這個功能區域，屬名詞用法；保留可讓 4 處既有測試斷言
   （performance.spec.js:75、429；smoke.spec.js:115、129）零紅。
2. 通知 fallback「球局通知」**改為「球咖通知」**——它是 app 層級預設標題，屬自稱。
3. 底部導覽「找球局／我的球局／開球局」等所有名詞文案**不動**。

## 測試同步

- 新增 `toHaveTitle(/球咖/)` 斷言（現況 title 零覆蓋，是缺口順手補）。
- `tests/public-brand-scan.test.js` 擴充：三檔掃「球局｜」「球局地圖」殘留＝0
  （名詞「球局」在 privacy.html 合法存在，掃描模式必須帶分隔符，不可裸掃「球局」）。
- 行為層斷言優先（沿用批 1 教訓：不新增脆弱的靜態正則守門；上述殘留掃描以
  「有牙三拍」驗證：存量綠 → 故意留一處殘留驗紅 → 移除後綠）。
- `notification-dispatch.test.js` 中 fallback 字串若有斷言，同步至「球咖通知」。

## 不做（YAGNI）

- 不改任何 UI 名詞「球局」（155 處測試文案、202 行 src 命中全不動）。
- 不改 `docs/` 歷史文件與 CLAUDE.md 產品描述（內部文件，另案）。
- 不做動畫 logo、多色延伸、商標申請流程（商標查詢由 ian 另行處理）。
- 不改 theme_color／品牌色系。
- share/深連結文案不加品牌名（現況純 URL，維持）。

## 執行順序與驗收

1. 本批在工作分支執行，**排在 Codex QA 的 GO 判定之前落地**——理由：對外第一
   印象必須是「球咖＋qiuka.tw」，且 QA 剩餘項（兩帳號旅程、實體 iPhone、慢網路）
   本來就未跑，改名後一併在最終 SHA 上驗，避免發布後立刻改名重驗。
2. 驗收 gate：`npm run test:mock`（含 public-brand-scan 擴充）、`npm run build`、
   `git diff --check` 全綠；殘留掃描三拍證明有牙。
3. grep 驗收：`球局｜`、`球局地圖`、`球局首頁`、`球局通知` 於
   `index.html`＋`public/`＋`dispatch.js` 命中 0（`index.html:23` 的
   「台北市球局地圖」為唯一豁免）。
4. 上線後人工 QA 追加三項：iOS 加入主畫面 icon 正確、LINE／FB 貼連結出現 OG 卡、
   通知 fallback 標題顯示「球咖通知」。
5. Supabase Site URL 於切換正式網域時改為 `https://qiuka.tw`（ian 執行，
   Redirect URLs 已加）。

## 假設（錯了請勾）

- 「球咖｜台北網球」為正式全名格式（去掉「市」字，較口語）。
- OG 描述文案草案可由 ian 直接改字，不需回spec。
- apple-touch-icon 與 maskable PNG 直接取自 final 資產，不重繪。
- Edge Function 重部署與 hosted 操作照慣例由 ian 親自執行。
