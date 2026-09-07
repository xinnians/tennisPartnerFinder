# `ds-bundle` 批次 B：卡片校正與自動檢查

日期：2026-09-08
分支：`codex/frontend-architecture-execution`

## 結論

9 張 HTML 卡片已逐張對照目前 production source 更新。這批修正的是設計同步資料，不是 production UI：

- 三張缺少 viewport 的卡片已補齊。
- Toast 卡片的重複 `id="map-data-status"` 已改成單一 error 狀態示範。
- 舊的 `.js` owner、固定行號、歷史 commit／批次說法與不存在的 Screens 引用已移除。
- Chat 補齊檢舉、封鎖、取消參加、空名冊、空訊息、封存提示與停用 composer。
- Bottom Navigation 改成目前 `MapTopbar`／`BottomNavigation` 的 React owner 與實際 attributes。
- Sheet 補上「練球」、關閉 selector 與目前 shell／React content 分工。

## 實際對照範圍

本批直接讀過並對照以下現行 owner：

- `src/app/App.tsx`：`MapTopbar`、`BottomNavigation`、`App` toast portal、`LoginModalContent`
- `src/app/SurfaceHost.tsx` 與 `src/sheets.ts`：共用 surface shell、focus／close lifecycle
- `src/components/SessionCard.tsx` 與 `src/sessionPresentation.ts`：探索球局卡
- `src/pages/MySessionsPage.tsx`：我的球局摘要、狀態與條件式動作
- `src/pages/NearbySessionsDrawer.tsx`：載入、錯誤與空清單
- `src/sheets/SessionChatSheet.tsx`：聊天三型、治理動作、空白與封存狀態
- `src/sheets/SessionDetailSheet.tsx`、`CourtPlayersSheet.tsx`、`CreateSessionSheet.tsx`、
  `EditSessionSheet.tsx`、`FilterSheet.tsx`
- `src/views/sessionSurfaceViews.js`、`sessionFormViews.js`、`discoverySurfaceViews.js`
- `src/filters.ts`、`src/appErrors.ts` 與現行 production CSS

更新後 9 張卡片共有 42 個不重複的明確 production source 引用；自動檢查確認每個檔案都存在。沒有用舊檔名或
固定行號冒充現況。

## 新增的持續防線

`scripts/designSystemBundle.mjs` 的 `--check` 現在除了驗 CSS／token，也會檢查：

1. 卡片清單必須精確是 repo 內的 9 張卡。
2. 每張都有 `@dsCard`、HTML5 doctype、共用 stylesheet 與 mobile viewport。
3. 同一張卡內不能有重複 ID。
4. 不能引用 `src/...:行號`、source glob 或已退役的 `components/screens/`。
5. 每張至少引用一個 production source，且檔案必須真的存在。

`tests/design-system-bundle.test.js` 新增正常案例，以及缺 viewport、重複 ID、失效 source 三種反向 canary。targeted
結果為 36／36，其中 design-system suite 為 5／5。

## Markup 與 render 複核

Static class audit：

- 9 張卡共有 175 個 class。
- `chat-message--user`／`chat-message--system` 是 `SessionChatSheet` 以 `chat-message--${row.kind}` 產生的合法動態值。
- `chat-message--user` 不需要專屬 CSS，沿用 `.chat-message`；`filter-sheet-chips--district` 是仍在 React DOM 的語意
  class，目前沒有獨立 CSS。這三項不是退役 class。

Playwright Chromium 以 desktop 1280×900 與 mobile 390×844 各跑 9 張，共 18 次：

- 18／18 HTTP 200、viewport 正確、內容非空。
- console warning/error、page error、failed request、重複 ID、缺可讀名稱、缺表單標籤、水平溢出皆為 0。
- 沒有 framework error overlay。
- 鍵盤第一個可互動元素都有 3px focus outline；純 token 卡沒有互動元素，焦點留在 body。
- BottomNav 點 `.app-brand` 後 URL 正確到 `#tab-map`。
- 代表性 screenshots 已人工查看；Chat 原先把 production backdrop 放進卡片造成整頁灰幕，本批移除展示用 backdrop
  後重跑並確認畫面正常。screenshots 存在 `/tmp/tennis-ds-render-audit/`，不提交 repo。

## 44px 的已知差異

Computed-size 報告仍列出 desktop 47 個、mobile 25 個低於 44px 的展示控制項。這個數字不能直接當成 production
違規數：部分卡片是把元件片段單獨擺出來，缺少 production 外層 selector；例如 390px production browser test 已
實際驗過 topbar 第一列、主要 map／filter 與 Chat governance controls 至少 44px。

但也不能直接忽略。現行基底確實仍有 34／36／38／40px 宣告；下一批應逐一放回真實 production route／container
量測，分成「卡片 context 假陽性」與「production 真缺口」，再只修真缺口。

## 完整驗證

`npm run test:ci:frontend` 通過：

- Node：672 passed／5 skipped（677 tests）
- mock Chromium：348 passed／4 skipped（352 tests）
- design-system check、typecheck、lint、Prettier、build、production bundle structural check、`git diff --check`：通過
- production bundle 未變：main 649,121／191,413／159,896，total 853,560／262,410／221,605
  raw／gzip／Brotli
- development total raw／gzip 依 D8 只報超出 3,599／3,348 bytes；既有 Vite 500 kB warning 仍存在

## 邊界與下一步

這批沒有修改 `src/` production UI／CSS，沒有 migration、Hosted、secret、deploy、request、runtime control 或資料操作。

下一批做 44px 真實 production context preflight：先量測、分類、列出 exact selector 與 route，不先猜要改哪些 CSS。
