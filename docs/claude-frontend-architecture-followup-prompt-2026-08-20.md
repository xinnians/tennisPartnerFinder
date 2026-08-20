# Claude 前端架構複核與計劃整理 Prompt

請重新確認並修正這份架構審查：

`/Users/ian/tennisPartnerFinder/docs/frontend-architecture-review-2026-08-20-claude.md`

同時參考 Codex 原始報告：

`/Users/ian/tennisPartnerFinder/docs/frontend-architecture-analysis-after-react-migration-2026-08-20.md`

請以「目前工作區實際程式碼」為唯一事實來源，不要直接相信兩份報告中的數字。先確認當前 HEAD、working tree 與 `dec0065` 之後是否有程式碼變化。

Codex 複核後，認為你的主要架構結論成立，但以下項目需要你再次驗證或修正。

## 1. React 使用數字

請區分「文字出現次數」和「實際呼叫次數」。

Codex 在目前程式碼得到：

- `useState` 實際呼叫：20，不是 35。
- `useRef` 實際呼叫：17，不是 23。
- `useCallback` 實際呼叫：5，不是 8。
- `createRoot` 實際呼叫：18。
- `flushSync` 實際呼叫：29，不是 47。
- `useEffect`：0。
- `useMemo`：0。

47 次 `flushSync` 是 29 次呼叫加 18 條 import。

另外，附錄中的：

```bash
grep -r createRoot src --include='*.tsx' | wc -l
```

會同時算 import 和呼叫，結果應是 36，不是註解寫的 18。請重新驗證並修正報告及可重現指令。

## 2. 審查基準

報告寫 `dec0065`，但 Codex 複核時目前 HEAD 是 `c9bd71b`。中間看起來只有文件用語變更，前端程式沒有改動。

請確認最新 HEAD；若只有文件變更，請註明技術分析仍適用，不要把舊 commit 寫成目前 HEAD。

## 3. 正式環境測試資料

Codex 同意你的修正：

- `.env.local` 指向本機 Supabase。
- `host-時間戳` 資料來自本機測試 fixture。
- `qiuka.tw` 實測目前為 0 場，沒有測試帳號資料。
- local Supabase URL 防護已存在。

因此目前不應列為 P0。但「正式站 0 場」只是 2026-08-20 的時間點觀察，不應寫成永久保證。

## 4. CI 計劃不可以只複製 workflow

`.worktrees/public-release-qa-ci/.github/workflows/quality-gate.yml` 使用：

- `test:ci:frontend`
- `test:ci:supabase`

但目前主工作區 `package.json` 沒有這兩個 script，它們只存在另一個 worktree。

請確認完整相依變更。計劃應寫成「整合並驗證完整 CI worktree／branch」，不能只寫「把 `quality-gate.yml` 入版」，否則 CI 會直接失敗。

## 5. 錯誤監控工具

`@vercel/analytics` 主要是頁面分析及自訂互動事件，不是完整前端例外監控。

請把建議修正為：

- React Error Boundary。
- `window.onerror`。
- `unhandledrejection`。
- Sentry、Bugsnag，或明確定義的自建錯誤端點。
- production source map、敏感資料過濾、錯誤分組及告警策略。

不要把 Vercel Web Analytics 當成主要錯誤監控方案。

## 6. generation key 的因果關係

請把不同問題拆清楚：

- bundle 變大：React runtime、eager import、`mockData` 靜態匯入。
- 捲動歸零、元件狀態重設：generation key 整棵重掛。
- 事件可能重複綁定：legacy `querySelector`／`addEventListener` 補線方式。
- 雙層狀態、props 膨脹：legacy adapter 架構。
- 循環相依：`sessionViews.js` 與 TSX 雙向 import。

generation key 不是 bundle 變大的共同上游，請修正最後結論的因果描述。

移除 generation key 的正確順序仍應保留：

1. 先把事件移進 React `onClick`／`onSubmit`。
2. 驗證同一操作只觸發一次。
3. 處理焦點與捲動保存。
4. 才移除 generation key。
5. Sheet 關閉流程加入 `reactRoot.unmount()`。

## 7. 安全性措辭

「沒有任何可利用 XSS 路徑」過於絕對。

請改成類似：

> 本次原始碼檢查未找到可利用的 XSS 路徑；剩餘 `innerHTML` 使用靜態內容或經過 `esc()`。

同樣地，沒有 `vercel.json` 不代表完全沒有安全 Header。Codex 實測正式站已有 HSTS，但缺少：

- CSP。
- `X-Content-Type-Options`。
- `Referrer-Policy`。
- `Permissions-Policy`。

請按實際 response header 描述。

## 8. Service Worker

沒有 `fetch` handler 代表沒有離線快取能力。如果產品沒有承諾離線使用，不應直接定義為缺陷。

缺少 `pushsubscriptionchange` 可以保留為推播韌性問題，但請使用「訂閱失效後可能無法自動恢復」，不要寫成必然永久收不到。

## 9. Bundle 與 code splitting

請保留以下較精確的判斷：

- lazy loading 仍能縮小初始應用程式碼和單一 chunk。
- 但首頁 Nearby Drawer 已經需要 React，因此 React runtime 仍會進初始 bundle。
- code splitting 無法取回大部分約 194 KB raw React runtime 成本。
- `manualChunks` 的 84% 歸因若要成為正式決策依據，請保存可重現設定或 bundle analyzer 產物，不要只留下文字結論。
- `mockData.js` 應與 production bundle 分離。

## 10. 優先級與執行計劃

請在重新確認後，整理一份可以直接排入開發的計劃，至少包含：

- 優先級。
- 問題與目標。
- 需要修改的檔案／模組。
- 相依順序。
- 預估工作量。
- 主要風險。
- 驗收條件。
- 必跑測試。
- 是否可獨立提交及回滾。

建議順序如下。

### 第 0 階段：補安全網

- 修正 `legacy-style-scan` 遞迴。
- contrast gate 涵蓋所有 CSS 與 focus 對比。
- 移除可安全移除的雙重型別斷言。
- 整合完整 CI 變更。

### 第 1 階段：低風險止血

- `mockData` 排除 production bundle。
- Error Boundary 與錯誤監控。
- Nearby Drawer 捲動保存。
- Sheet root 正確 unmount。
- 安全 Header。

### 第 2 階段：拆循環相依

- 把 `sessionViews.js` runtime／presentation helper 搬到獨立 `.ts`。
- 先從 Avatar、SessionCard 開始。
- 取消 TSX 對 `sessionViews.js` 的反向依賴。
- 為 lazy loading 建立條件。

### 第 3 階段：核心 TypeScript 化

- data mapper／DTO。
- Store state 與 channel。
- Controller state。
- 分功能拆 Controller。
- `main.js` 最後處理。

### 第 4 階段：拆除 parity 鷹架

- 事件回 React。
- 移除 generation key。
- 減少 `flushSync`。
- 建立單一 App root／SurfaceHost。
- 地圖保留 imperative adapter。

驗收 gate 至少包含：

- `npm run typecheck`
- `npm run lint`
- `npm run prettier:check`
- `npm run build`
- `npm run test:session-unit`
- desktop／mobile mock Playwright。
- local Supabase／RLS gate，並使用隔離本機環境。
- bundle 大小前後比較。
- 故意違規 canary，確認掃描測試真的會紅。
- 390px 手機版與桌面版主要流程。
- production deploy 前人工 checklist。

## 回覆要求

請先不要修改程式碼。

先回覆：

1. 哪些 Codex 修正成立、部分成立或不成立。
2. 修正後的問題清單與優先級。
3. 完整分階段實作計劃。
4. 哪些項目需要產品或技術決策。
5. 建議先開哪一個最小、可獨立驗證的 PR。

說明請使用繁體中文、白話、簡潔，不要只重述兩份報告。
