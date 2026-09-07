# FA-05 phase 1 低風險清理

日期：2026-09-07  
狀態：完成；runtime 只移除一個已證明無效果的呼叫，其餘為 TypeScript／module API 收斂

## 白話結論

這批刪掉一個開機時必定什麼都不做的預載呼叫、把三個只有檔案內部會用到的名稱取消對外 export，並移除 13 個只為舊
相容性測試保留的 presentation runtime re-export 與 10 組失效格式鷹架。登入後真正會預載畫面的路徑仍保留，UI、資料流程
與 Hosted 設定都沒有改變。

## 查證與修改

### 1. 移除開機時的無效 preload

- 修改前 `src/main.js` 有兩個 `preloadAuthenticatedViewsForAuth(...)` call。
- 保留 `onAuthIdentityChange` 裡傳入 `context.session` 的有效 call；這條路徑在身分驗證完成後預載私有頁面。
- 移除 `init()` 尾端傳入 `getAppState().authSession` 的 call。此時 controller 已建立，但
  `createSessionController()` 的初始 state 明確是 `authSession: null`；而
  `preloadAuthenticatedViewsForAuth(null)` 內部明確不呼叫任何 preload，所以沒有 runtime 效果。
- 新增 source gate，固定 `src/main.js` 只剩一個 call，且必須位於 `onAuthIdentityChange` 路徑。

### 2. 取消三個不必要的 export

- `SurfaceSlot`：仍供 `SurfaceHost.tsx` 內部型別使用，但 repository 內沒有外部 import；純型別不進 production JavaScript。
- `PROFILE_PUBLIC_DISCLOSURE`：仍在 `sessionViews.js` 內提供 profile 與 session form 設定，repository 內沒有外部 import。
- `sessionFormSheetRuntime`：仍在 `sessionViews.js` 內傳給 `configureSessionFormViews`，repository 內沒有外部 import。
- 新增 source gate，確認三者仍存在且保持私有，避免之後不小心重新擴大 facade API。

### 3. 收掉 13 個 presentation runtime re-export

- 全庫查證 13 個 runtime 的 production consumers 全都直接 import `sessionPresentation.ts`；`sessionViews.js` 的 re-export 只剩
  `session-presentation-boundary.test.js` 自己在讀，沒有 production caller 或其他功能測試 caller。
- 移除這 13 個 facade re-export，並把舊相容性測試改成反向 gate：確認它們不會再回到 legacy facade。
- 保留 `messagesFromGroups` 與 `nearbySessionsSummaryText` 兩個仍有實際 facade consumer 的 helper re-export。
- `sessionPresentation.ts` 內 13 個 `Object.freeze` runtime 本體完全沒有刪除，React consumers 也沒有改路徑。

### 4. 清除失效 F2D／Prettier 鷹架

- `src/sessionViews.js` 原有 10 組 `F2D` 註解加 `prettier-ignore`，但全庫測試已沒有 F2D export declaration scan。
- 移除 10 組鷹架並重新跑 Prettier；wrapper 只變成標準格式，參數與委派目標不變。
- 新 gate 會阻止 `F2D` 或 `prettier-ignore` 回到這個 facade。

### 5. 本批刻意不改的項目

- `authenticatedViewPreloads` 清單未調整。下載時機會影響登入後網路行為，依 final-v3 應先由 phase 2 production preview 與效能
  基線取得數字後再決定，不能把它當成純 dead-code 清理。
- `ds-bundle/` 與 `.design-sync/` 依既定決策保留，本批沒有修改。

## Before／after

| 項目 | 修改前 | 修改後 |
| --- | ---: | ---: |
| `main.js` auth preload calls | 2 | 1（只留 verified identity transition） |
| 檔內 helper／type 的多餘 export | 3 | 0 |
| facade presentation runtime re-export | 13 | 0（兩個仍有 consumer 的 helper re-export 保留） |
| F2D＋`prettier-ignore` 鷹架 | 10 組 | 0 |
| production JS raw total | 852,758 bytes | 852,737 bytes（-21） |
| production JS gzip total | 261,346 bytes | 261,314 bytes（-32） |
| main raw／gzip | 650,134／191,175 bytes | 650,113／191,175 bytes |

## 驗證結果

- targeted architecture／React lifecycle／presentation boundary：24／24 通過。
- 完整 frontend CI：通過；Node 639 tests／634 passed／5 skipped，Playwright 354 tests／350 passed／4 skipped，
  production build 通過。
- production bundle structural gates：通過；仍為 32 files，development E2E hook 只存在 development build、12 個 demo
  identifiers 未進 production、private repository 與 Sentry 仍保持獨立 chunk。
- 開發期 byte 規則照既定政策只 report：total raw 超出 2,776、total gzip 超出 2,252；main 與 lazy chunk limits 通過。
- typecheck、ESLint、Prettier、`git diff --check`：通過。
- migration、DB、Edge Function、Secret、credential、Hosted deploy／request：沒有變更。

## 下一步

繼續 `FA-05` 的 production-equivalent preview、效能基線與 Bundle ADR。先唯讀確認現有 Vite／Vercel／Playwright
部署等價條件與目前可重現的量測環境，不自行填 production Secret、provider 值或 byte hard limits。
