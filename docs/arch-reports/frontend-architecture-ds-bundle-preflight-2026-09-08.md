# `ds-bundle` 全量差異盤點

日期：2026-09-08  
盤點基準：`93420b4`

## 白話結論

`ds-bundle/` 要保留，但現在不能直接當成 production UI 的可靠副本。

9 張現有卡片都能在桌面與 390px 視窗正常開啟；沒有空白頁、錯誤遮罩、console error、page error、載入失敗或
橫向爆版。實際問題是同步資料已經落後：production 現在有 React 與 13 份 CSS，bundle 的說明仍停在無 React、
兩份 CSS 的舊架構；CSS 有 21 組已確認的有效差異，索引另列出 10 個本機不存在的檔案。

這不代表 production code 對不上，也不需要改 production UI。下一步應先讓 bundle 的 CSS、說明與檢查機制
跟 production 對齊，再更新 9 張卡片中的舊來源與示範內容。

## 本次怎麼確認

本次只讀取 repo、啟動本機 Vite，並用專案既有 Playwright Chromium 檢查卡片；沒有安裝依賴、修改 runtime、
呼叫 Hosted、執行 migration 或寫入 production 資料。

Browser plugin／browser skill 在本次環境沒有提供，因此依 frontend testing 流程使用專案既有 Playwright。
target flow 是：逐張開啟卡片，在 desktop 1280×900 與 mobile 390×844 渲染，確認頁面身分、內容、錯誤、
overflow、focus 與一個可操作行為，再對照現行 source、DOM 與 CSS。

盤點範圍：

- `ds-bundle/` 全部 13 個 tracked files，其中 9 個是 HTML 卡片。
- `.design-sync/config.json`、`.design-sync/NOTES.md`、`.design-sync/conventions.md`。
- production 固定載入的 13 份 CSS。
- 卡片內 49 筆 source reference 與 171 個不重複靜態 class。
- 9 張卡片 × 2 種 viewport，共 18 次 render。

## 檔案與設定差異

### 已確認存在的卡片

```text
components/actions/Buttons/Buttons.html
components/actions/Chips/Chips.html
components/cards/SessionCard/SessionCard.html
components/chat/Chat/Chat.html
components/feedback/ErrorStates/ErrorStates.html
components/feedback/Toast/Toast.html
components/foundations/Tokens/Tokens.html
components/navigation/BottomNav/BottomNav.html
components/surfaces/Sheet/Sheet.html
```

### README 有列、repo 內沒有的 10 個檔案

```text
components/foundations/Bricks/Bricks.html
components/screens/MePage/MePage.html
components/screens/MySessions/MySessions.html
components/screens/ChatRoom/ChatRoom.html
components/screens/SessionDetail/SessionDetail.html
components/screens/FilterSheet/FilterSheet.html
components/screens/Messages/Messages.html
components/screens/CreateSession/CreateSession.html
components/screens/DrawerOpen/DrawerOpen.html
components/screens/MapHome/MapHome.html
```

`.design-sync/NOTES.md` 說這些畫面曾存在於遠端設計專案，但這不能證明目前遠端仍存在，也不能代替 repo 內的檔案。
本批沒有登入遠端設計工具，因此只把它們記為「README 索引與目前 repo 不一致」，沒有猜測遠端狀態。

另外三項設定已確定過時：

- README、conventions 與 config 仍使用舊名稱「網球球局地圖設計系統」；目前 production 品牌是「球咖」。
- config 仍寫「原生 ES modules、無 React」，但目前 app 已有 React root、pages 與 sheets。
- README／NOTES 說 `_ds_bundle.css` 只逐字複製 `src/style.css + src/session.css`；production 現在依固定順序載入
  13 份 CSS。

## CSS 實際差異

比對不是只看檔案大小。掃描會拆開 grouped selectors，並合併同一 selector 最後真正生效的 declarations，避免把
CSS 拆檔或選取器分組方式誤判成視覺差異。

| 項目                            |  bundle | production | 結果                  |
| ------------------------------- | ------: | ---------: | --------------------- |
| CSS bytes                       | 102,371 |    114,984 | 不同                  |
| rule occurrences                |     582 |        573 | 結構不同              |
| expanded selector occurrences   |     640 |        668 | 結構不同              |
| design tokens                   |      50 |         50 | 50 個名稱與值全部一致 |
| 完全一致的 selector occurrences |     648 |        648 | 一致                  |
| 有效宣告不同                    |       4 |          4 | 需同步                |
| bundle only                     |       2 |          0 | 需逐項處理            |
| production only                 |       0 |         15 | bundle 缺少           |

4 個有效宣告差異：

1. `.create-v2__court-grid`：production 的 max-height 已改為 `min(320px, 30dvh)`。
2. `.create-v2__footer`：production 已加入 `env(safe-area-inset-bottom)`。
3. `.create-v2__scroll`：production 已調整底部空間、加入 `scroll-padding-bottom`，並移除舊 `position: relative`。
4. `.level-chip`：production 已移除 `font-weight: 600`。

bundle only：

- `.chip--district`
- `.time-tile--done`

production only：

- Auth 登入方式相關 10 個 selector。
- My Sessions 清單間距相關 3 個 selector。
- Nearby Sessions 卡片間距 1 個 selector。
- Player Directory 列間距 1 個 selector。

`.chip--district` 值得特別處理：目前 `FilterSheet.tsx` 還會輸出這個 class，但 production 已沒有它的專屬 CSS；
舊 bundle 仍套用舊樣式，所以同一段 markup 在 bundle 與 production 會呈現不同結果。

production 13 份 CSS 的順序已逐檔讀取並固定為：

```text
style.css
map-page.css
discovery.css
surfaces.css
sheet-shells.css
navigation.css
pages.css
session.css
create-session.css
responsive.css
vocabulary.css
player-sheets.css
motion.css
```

## source 與示範內容差異

卡片與 design-sync 文件共找到 49 筆 source reference，其中 9 筆指向已不存在的路徑；去重後是 4 個退役路徑：

```text
src/filters.js
src/sheets.js
src/sessionViews.js
src/sessionController.js
```

另有存在但行號已錯位的引用，例如：

- `src/session.css:139` 已不是 instant button selector。
- `src/pages/MySessionsPage.tsx:585` 已不是「重新整理」。
- `src/main.js:1260-1274` 超過目前檔案長度 702 行。

因此後續同步應優先引用「檔案＋export／component 名稱」，避免繼續用容易失效的固定行號。

171 個靜態 class 中，掃描只把 `chat-message--system`、`chat-message--user` 標為 production source 沒有相同字面；
實查 `SessionChatSheet.tsx` 是用 `chat-message--${row.kind}` 動態產生，因此這兩個不是廢棄 class。
`chat-message--user` 沒有專屬 CSS 也不是錯誤，因為它沿用 `.chat-message` 基底。

目前 Chat 卡仍缺少 production 已有的空狀態、檢舉／封鎖、封存提示與 disabled 狀態示範；BottomNav 的說明仍把
topbar owner 寫成舊 vanilla `main.js`。這些都是 bundle 文件落後，不是 production 功能缺失。

## Render 與互動驗證

18 次 render 全部得到相同的基礎結果：

- HTTP 200、內容非空、title 正常、stylesheet 有載入。
- 0 framework overlay、0 console warning/error、0 page error、0 failed request。
- 0 horizontal overflow。
- 第一個互動元件可取得 3px solid focus outline；Tokens 卡沒有互動元件，所以 focus 留在 body，不列為失敗。
- 所有互動元件都有可讀名稱；input、select、textarea 都有 label。
- BottomNav 點擊 `.app-brand` 後 URL 正確變成 `#tab-map`。

已確認的卡片缺陷：

- SessionCard、Chat、Sheet 三張卡沒有 viewport meta；一般桌面模擬 390px 能顯示，不代表真實手機會使用正確 viewport。
- Toast 卡重複使用 `id="map-data-status"` 兩次。
- mobile 原始 bounding box 掃描發現多張卡有小於 44px 的互動元件：Buttons 10、Chips 8、SessionCard 4、
  ErrorStates 1、Toast 1、BottomNav 1。部分 toggle 或包裹 label 的真實 hit area 可能較大，因此本批不把每一筆都
  宣告為 production accessibility bug；但 bundle 自己承諾觸控目標至少 44px，而數個普通 demo button 實測只有
  34–40px，足以判定 bundle 的示範與規範沒有完全一致。

實際檢視 Chat、Sheet、BottomNav、Buttons、Toast、SessionCard 的 mobile screenshots 後，沒有發現截斷、重疊、
錯誤遮罩或橫向爆版。截圖只保存在 `/tmp/tennis-ds-render-audit/`，沒有把測試產物提交進 repo。

## 差異處理清單

| 差異                                   | 判定       | 下一步                                            |
| -------------------------------------- | ---------- | ------------------------------------------------- |
| 50 個 token                            | 無 drift   | 保持不動，加入自動比對                            |
| 4 changed／2 bundle-only／15 prod-only | 真實 drift | 由 13 份 production CSS 產生 deterministic bundle |
| 10 個 README 索引缺檔                  | 真實 drift | 先讓索引只描述 repo 可交付內容，不假設遠端現況    |
| 無 React／兩份 CSS／舊品牌說明         | 真實 drift | 更新 README、config、NOTES、conventions           |
| 4 個退役 source 路徑與失效行號         | 真實 drift | 改成現行 owner／symbol 引用                       |
| 3 張缺 viewport meta                   | 卡片缺陷   | 補上 mobile viewport                              |
| Toast 重複 ID                          | 卡片缺陷   | 每個狀態示範使用唯一 ID                           |
| 多個 demo target 小於 44px             | 待同步驗證 | CSS 對齊後重跑；只修有實際證據的 bundle 元件      |
| 動態 Chat class 字面不存在             | 假陽性     | 不刪除                                            |

## 建議的實作切法

### 批次 A：先讓 CSS 與文件不再靜默漂移

- 用固定順序從 production 13 份 CSS 產生 standalone `_ds_bundle.css`。
- 新增 drift checker；只要 production CSS 改了但 bundle 沒同步，CI／本機檢查要直接指出。
- 保持 `tokens/tokens.css` 與 production 50 個 token 完全一致。
- 更新 README、config、NOTES、conventions 的品牌、React 與來源說明。
- README 索引先改成 repo 內實際存在的 9 張卡，不虛構缺少的本機檔案。

### 批次 B：再更新 9 張卡片

- 更新退役 owner、失效行號、React ownership 與示範狀態。
- 補三張 viewport meta、修 Toast 重複 ID。
- 對齊 CSS 後再跑 desktop／390px render、focus、console、overflow 與互動檢查。
- 只有 production source 能證明的結構才寫進卡片；不從舊遠端筆記猜新 UI。

這兩批都只會改設計同步資料、檢查工具與文件，不先改 production UI。若日後要把缺少的 10 張畫面重新匯入 repo，
必須以當時 production 畫面重新產生，不能還原 2026-08-11 的舊檔冒充現況。

## 驗證結果

```text
CSS semantic audit：50 tokens exact；648 identical；4 changed；2 bundle-only；15 production-only
source audit：49 references；9 missing occurrences；4 unique retired paths
markup audit：171 distinct static classes；2 dynamic Chat variants confirmed valid
render audit：18/18 HTTP 200；0 console/page/request errors；0 overlay；0 horizontal overflow
interaction：BottomNav app-brand → #tab-map，passed
visual review：Chat／Sheet／BottomNav／Buttons／Toast／SessionCard mobile screenshots checked
```

本批是 preflight，只產出可重現差異與後續切法；沒有修改 `src/`、production runtime、migration、Hosted、secret、
deployment 或資料。
