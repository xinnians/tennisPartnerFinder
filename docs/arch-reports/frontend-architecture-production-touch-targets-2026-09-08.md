# Production 觸控尺寸複核與修正

日期：2026-09-08  
分支：`codex/frontend-architecture-execution`

## 結論

`ds-bundle` 卡片先前量到的小按鈕，不能直接當成正式 App 的問題。這次把元件放回真正的 production
畫面與容器後，確認有 35 筆可點區域小於 44×44px；目前能由專案控制的項目都已修正。

修正後在 390×844 的 16 個畫面狀態中，共量測 99 筆可點區域，低於 44×44px 的筆數是 0。這些數字是
瀏覽器實際的 `getBoundingClientRect()` 結果，不是由 CSS 原始碼推算。

## 怎麼確認

- 使用目前 production 的 React component、view adapter、CSS 載入順序與實際 root。
- viewport 固定為 390×844。
- 掃描可見且可操作的 button、link、input、select、textarea、包住表單元件的 label 與 switch。
- disabled 元件不是當下可操作目標，因此不列入。
- 元件若用 `::before` 擴大透明熱區，量測會把該熱區算進去。
- popover／sheet 動畫完成後才取尺寸，避免把動畫中的縮放誤判成最終尺寸。

## 修正前查到的真實缺口

| 畫面 | 小於 44px 的量測 | 實際尺寸 |
| --- | ---: | --- |
| 程度快選 | 5 | 38～39px 高 |
| 登入視窗 | 1 | Google 登入 38px 高 |
| 聊天室 | 1 | 取消參加 35px 高 |
| 地圖錯誤狀態 | 1 | 重新載入 32px 高 |
| 附近球局錯誤狀態 | 1 | 重新載入 38px 高 |
| 我的球局／已加入 | 8 | 分頁 42px；卡片動作 38px |
| 我的球局／主揪 | 7 | 分頁 42px；卡片動作 38px |
| 我的球局／邀請 | 5 | 分頁 42px；卡片動作 38px |
| 檢舉視窗 | 5 | 四個理由 17px；送出 38px |
| React 錯誤備援 | 1 | 關閉 38px 高 |

底部導覽、篩選 sheet、一般附近球局抽屜、球局詳情、退出確認視窗與全域錯誤通知在修正前就已合格。

## 實作方式

這次沒有直接把全站 `.session-primary`／`.session-secondary`／`.session-tertiary` 基底一起放大，因為那會同時
改動未列入本批的桌面密度與其他畫面。改用畫面範圍明確的規則：

- 地圖程度快選與登入 provider 按鈕補足 44px。
- 地圖錯誤與附近球局錯誤的重試按鈕補足 44px。
- 我的球局兩個分頁讓真正的 button 盒子至少 44px；外框連同 1.5px 邊線為 47px。
- 我的球局所有卡片動作補足 44px。
- 檢舉理由的整列 label 與送出按鈕補足 44px。
- 聊天室取消參加與 React 錯誤備援關閉按鈕補足 44px。
- 重新產生 `ds-bundle/_ds_bundle.css`，讓設計資料包與 production CSS 保持一致。

永久守門放在 `tests/touch-targets-smoke.spec.js`。測試不是列出幾個指定按鈕，而是掃描每個指定 root
底下全部可操作元件；未來在這些畫面新增小按鈕時會直接失敗。

## 修正後結果

以下 16 個 production 狀態全部是 0 筆違規：

- 底部導覽、程度快選、篩選 sheet。
- 一般附近球局抽屜、附近球局錯誤、地圖錯誤。
- 球局詳情、登入、聊天室、檢舉、退出確認。
- 我的球局已加入／主揪／邀請三種狀態。
- 全域錯誤通知、React 錯誤備援。

人工查看程度快選、我的球局、聊天室與檢舉視窗的 390px screenshots，沒有發現水平溢出、內容遮蔽或
按鈕互相擠壓。runtime console／page error 為 0。

## 地圖 marker 為什麼不列入結論

mock Maps 會自行建立 `.test-marker` button，並把 button 寬高直接設成 marker 圖案寬高，所以量到 9 個
40px 球局 marker 與 9 個 25px 球場 marker。這只能證明測試替身的盒子大小。

production 在有 Map ID 時使用 Google `AdvancedMarkerElement` 與 `gmpClickable`，fallback 才使用 legacy
`google.maps.Marker`。目前沒有可用的正式 Google Maps runtime／key 證據可量它的最終 hit area，因此本批不把
mock 數字冒充 production 缺陷，也不宣稱正式 marker 已合格。這項保持為獨立待驗證事項。

## `ds-bundle` 卡片剩餘差異

production CSS 同步後，用原本算法重跑 9 張卡片：desktop 小尺寸量測由 47 降到 41，mobile 由 25 降到 20。
再排除 disabled 元件並正確計入 toggle 的 `::before` 熱區後，精確結果為 desktop 37、mobile 16。

mobile 剩餘 16 筆只在 Buttons（10）與 Chips（6）卡：卡片直接展示 38px 的基底類別，且程度選項沒有放進
production 的 `#band-options` 或 `.filter-sheet-band-grid` 容器。這是設計卡片脫離 production container 的差異，
不是這次已驗證畫面的 production 缺陷。下一批應修卡片的展示脈絡，並加入 mobile computed-size gate。

## 驗證紀錄

- 新增觸控守門：desktop Chromium、mobile Chromium、mobile WebKit 共 9／9 通過。
- 完整 frontend CI：Node 672 passed／5 skipped；mock Chromium 354 passed／4 skipped；typecheck、lint、
  Prettier、design-system check、build、bundle structure 與 `git diff --check` 全部通過。
- production JavaScript main：649,121 raw／191,412 gzip／159,724 Brotli bytes。
- production JavaScript total：853,560 raw／262,415 gzip／221,459 Brotli bytes。依 D8，開發期 total raw／gzip
  仍只報告超過現行參考值 3,599／3,353 bytes，不阻擋開發。
- WebKit 全量第一次為 167 passed／3 skipped／9 failed；其中一項重跑通過，剩下 8 項都是既有 focus 斷言。
  將同 8 項放到未含本批修改的 clean `9643fe3` snapshot 單工執行，8 項仍全部以相同 focus 斷言失敗。因此只能
  確認它們不是本批 CSS／測試造成；本文件不猜測根因。

本批沒有 migration、Hosted、secret、deployment、request、runtime control 或資料變更。
