# 批 A：計分板視覺重設計 — Token 系統與全站換皮 Design Spec

日期：2026-08-07
狀態：待 user 核可
前置決策（已拍板）：改版範圍含 UX 重排，拆批 A→B→C；視覺方向選定「計分板」；
dark mode 不納入但 token 語意命名留空間；Baloo 2 退役、bottom nav 改深底、
地圖 pin 改樣式、lime 全站替換，四項假設已核可。
基線審計：session scratchpad `redesign-baseline-audit.md`（畫面 23、CSS 六維度無 scale、
UX 痛點與硬邊界清單）；方向案定稿 `design-directions.html` v2（方向 02）。

## 1. 方向定義

球局的核心資訊是數字與地點：時間、NTRP、缺額、球場。「計分板」方向用計分板的
語言呈現——墨綠與紙白打底、optic 黃只在關鍵訊號亮起、純數字一律等寬字體、
小圓角與實線邊框。個性：精準、成熟、工具感。

- 中文一律 Noto Sans TC；純數字（時間、NTRP、名額、計數徽章）用 IBM Plex Mono；
  區段標題／eyebrow 用 Barlow Condensed（限拉丁與數字，中文自然 fallback Noto）。
- 品牌字標由 Baloo 2 改為 Barlow Condensed「球局」＋optic 圓點（網球）。
- 陰影退位、實線框上位：層級靠 1.5px 墨綠實線與紙白對比，不靠大陰影。

## 2. Token 系統（session.css 頂部單一 :root）

命名走語意層（surface／text／signal），不用原料名（paper／mist），為未來 dark mode
留翻值空間。`style.css` 的字面量全數併入同一 token 層，消除 --navy 重複定義。

### 2.1 色彩

| Token | 值 | 用途 |
|---|---|---|
| `--color-ink` | `#12291C` | 結構、主文字、深底面 |
| `--color-court` | `#1C5C3C` | 次品牌強調、mono 數字強調 |
| `--color-signal` | `#DDF53C` | 唯一訊號色：CTA、選中態、關鍵徽章 |
| `--color-surface-page` | `#FAF9F3` | 頁面底 |
| `--color-surface-card` | `#FFFFFF` | 卡片、sheet 底 |
| `--color-text-primary` | `#12291C` | 主文字 |
| `--color-text-secondary` | `#5C6A5F` | 次要文字（AA 實算不足即加深，見 §5） |
| `--color-line` | `#CFD8CD` | 分隔線、弱框 |
| `--color-danger` / `--color-danger-bg` | `#A1241B` / `#FFF0EF` | 錯誤態 |
| `--color-success` / `--color-success-bg` | `#1C5C3C` / `#E8F2E3` | 成功態（併掉現有三套綠） |
| `--color-info-bg` | `#EEF1E7` | 聊天泡泡、中性提示底 |

現有 8 個 :root 變數與約 57 處散落 hex（含 28 處 `#fff`）全數映射到上表；
警示黃綠（`#f7fbe9`/`#c8dc9d` 等）併入 success／info 系。

### 2.2 字體與字階

```css
--font-body: "Noto Sans TC", sans-serif;
--font-mono: "IBM Plex Mono", monospace;      /* 僅純數字串；font-variant-numeric: tabular-nums */
--font-display: "Barlow Condensed", "Noto Sans TC", sans-serif;
```

字階 7 級（現有 79 處、15 種 font-size 全數收斂映射）：

| Token | size/line-height | 用途 |
|---|---|---|
| `--text-xs` | 11px/1.5 | 徽章、輔助標記 |
| `--text-sm` | 12px/1.5 | meta、提示 |
| `--text-base` | 14px/1.6 | 內文、按鈕 |
| `--text-md` | 15px/1.5 | 卡片標題 |
| `--text-lg` | 17px/1.4 | 時間等 mono 數字 |
| `--text-xl` | 20px/1.3 | 頁區標題 |
| `--text-2xl` | 24px/1.25 | 頁首大標 |

字重紀律：內文 400／500、標題 700、900 廢止（現況全站 800-900 的問題來源）。
index.html:15 的 Google Fonts link 改為 Noto Sans TC(400;500;700)＋IBM Plex Mono(500;600)
＋Barlow Condensed(600;700)，移除 Baloo 2。

### 2.3 Spacing／Radius／邊框／陰影／z-index

- Spacing 4px 基底：`--space-1..8` = 4/8/12/16/20/24/32/40px；現有 14 種 gap 值就近收斂。
- Radius：`--radius-sm` 4px（徽章、輸入框）、`--radius-md` 8px（卡片、按鈕、sheet、
  浮動 chip）、`--radius-pill` 999px（僅頭像）；其餘 10 種現值全收斂，18px surface
  圓角與 pill 按鈕廢止。
- 邊框：`--border-strong` 1.5px `--color-ink`；`--border-thin` 1px `--color-line`。
- 陰影 2 級：`--elevation-1`（浮動控制項）、`--elevation-2`（sheet/toast）；其餘 5 處手寫
  rgba 陰影廢止或降級為實線框。
- z-index 具名化：`--z-header/--z-map-controls/--z-drawer/--z-sheet/--z-toast` 五個
  主層具名；現況散落 12 種裸數字（0–40），逐一就近對映到具名層或層內偏移，
  只改名不改相對序。
- 斷點維持 700/460/390 字面量＋檔頭註解（CSS 無法在 @media 用 var，不引 build pipeline）。

## 3. 換皮範圍與 commit 粒度

不動 DOM 結構、class 名、文案語意與任何流程（那是批 B／C 的事）。逐區換值，
每區一個 commit，各自跑 `npm run test:mock`＋截圖對照：

1. Token 層建立＋字體引入（index.html＋:root，全站尚未套用）
2. App header＋bottom navigation（深底 ink＋optic 選中態）
3. 地圖工具列＋pin（`src/pins.js` 內樣式參數：方形 ink 底＋optic mono 數字）
4. 附近球局抽屜＋球局卡（時間 mono、審核制／直接加入／名額已滿徽章體系）
5. Sheet／dialog surface＋球局詳情＋加入確認
6. 表單（建立／編輯／定案／個人檔案／檢舉）
7. My Sessions＋我頁（含在線狀態、通知設定區）
8. 群聊＋toast＋殘餘徽章收尾
9. `style.css` 併入、死值清掃、對比測試更新（§5 的 gate 三拍在此完成）

## 4. 邊界（不可越線）

- 只改呈現：三級 gate、RPC／view 邊界、`dataApi.js`、文案語意一律不動。
- CLAUDE.md 全部產品／隱私邊界照舊：LINE 永不入 UI、匿名面欄位不增、
  聊天僅球局群聊、台北市＋網球。
- 44px 觸控目標（2026-08-06 才全面修過）與 AA 對比是不可退底線。
- Google Maps 基底圖資的 cloud styling 不在本批（維持預設圖資，僅換 pin）。

## 5. 驗收條件

1. `npm run test:mock` 全綠；`git diff --check` 乾淨。
2. `tests/contrast-tokens.test.js` 改寫為新 token 組合的 AA 斷言（至少：次要文字 on
   page／card、signal on ink、ink on signal、danger／success on 各自 bg），並斷言
   受測集合非空；斷言值以實算為準，`#5C6A5F` 等候選值不足 4.5:1 就加深。
3. 舊色殘留掃描：測試斷言 `src/**` 無 `#d7f22a`、`#2465bd`、`#142c4b`、`#eef4fb`
   殘留（Baloo 2 字串同掃）；gate 三拍——存量綠、塞 canary 舊色驗紅、移除後綠。
4. 每區換皮前後截圖對照留檔 scratchpad；換皮完成後 390px 視窗手動走查
   一次探索→詳情→（登入 gate 畫面）動線。
5. 發布前重跑 `docs/mvp-plan.md` release checklist 的 UI 相關人工項（390px 慢網路、
   鍵盤焦點、支援／隱私連結）。

## 6. 非目標

Dark mode（僅語意命名預留）；批 B quick wins；批 C 結構重排（篩選收 sheet、
三段抽屜、join 單層化、群聊未讀）；Google Maps 圖資 styling；任何 DOM／文案／
流程／資料契約變更。

## 7. 風險與備註

- Barlow Condensed／IBM Plex Mono 不含 CJK：所有 font-family 宣告必含 Noto Sans TC
  fallback；中文誤入 mono 宣告是方向案審稿抓過的錯，實作時以「mono 只給純數字
  節點」為紀律。
- optic 黃 `#DDF53C` 亮度高：只能當 ink 上的文字色或 ink 文字的底色，
  永不與白底直接相鄰承載文字（對比不足）。
- 換皮期間 Playwright 若有斷言吃到顏色／字串（如 badge 文案），以行為斷言為準、
  樣式斷言隨批更新；「直接加入」「群組聊天」等 label 字串是行為耦合點，不改文案。
