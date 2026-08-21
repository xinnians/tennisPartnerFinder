# 批 E：效能與 production hardening（repo 側，E1–E3 依序）

先讀 `00-overview.md`；共通紅線與回報合約適用。前置：D4 已 commit。
CSP enforcing 切換、error transport 廠商接線、實機 Safari 都是**非派工項**，不在本批。

## 目標與動機

主 chunk 714.34 kB（gzip 200.64 kB）超過 Vite 500 kB 警告線，且缺少防止再膨脹的自動 gate
與 production 錯誤監控的接線準備。本批做 repo 側能完成的三件事：非首頁 lazy loading（E1）、
bundle 大小 gate（E2）、error transport 接點（E3）。

## E1：非首頁 lazy loading

現況基準（2026-08-21）：`sessionViews.js` 18 個 `import.meta.glob(..., { eager: true })`，
主 chunk 714.34 kB（gzip 200.64 kB）。已驗證**不能只刪 `eager: true`**：glob 取值模式會直接
拿到 `undefined`，且 mount 後有同步查 DOM／設焦點的呼叫鏈。D 批完成後，App root 已具備
可等待的載入邊界，本子批才動手。

1. 「我」「訊息」「我的球局」頁與非首頁 sheet 改動態 import（React.lazy 或等價機制），
   首頁地圖＋附近球局＋詳情 sheet 留在主 chunk。
2. 載入中狀態必須有可及性處理（不搶焦、不閃爍空白）；焦點契約不變。
3. preload 策略：hover／focus／登入完成等高機率下一步預載對應 chunk。
4. 驗收：`npm run build` 前後 chunk 數字逐字進回報；主 chunk raw 與 gzip 均顯著下降；
   全部 e2e 綠（特別是換頁與 sheet 開啟旅程）。

## E2：bundle size gate（防長回去）

1. 新增自動化檢查（併入 `scripts/check-production-bundle.mjs` 或新 script 掛進
   `check:production-bundle`）：主 chunk raw／gzip 超過上限即 fail。
   上限 = E1 實測值 × 1.1（寫死數字並註記依據）。
2. **gate 有牙三拍證明**（缺一不可，證據逐字進回報）：
   (a) 現量綠；(b) 把上限暫調成低於現量 → 驗紅；(c) 恢復上限 → 綠。
   canary 清除用精確編輯，禁 `git checkout` 整檔還原。

## E3：error transport 接點（不選廠商）

1. `src/appErrors.ts` 現況：`configureAppErrorTransport` 存在、production 走
   `NOOP_TRANSPORT`、無任何 production 呼叫點。本子批只做「接線準備」：
   - 固化 transport 註冊點與**允許外送的固定欄位 allowlist**（不得含 raw message、stack
     內敏感資料、暱稱、聊天內容、位置；以現有隱私 allowlist 為基礎）。
   - 寫 `docs/error-transport-wiring.md`：未來接 Sentry 或其他廠商時的步驟、env 需求、
     禁送欄位清單。
2. **不新增任何依賴、不接任何 SDK、production 行為維持 NOOP**。廠商選擇是使用者拍板項。

## 凍結白名單

- 可動：`src/sessionViews.js`（glob 改動態）、`src/app/**`、`scripts/check-production-bundle.mjs`
  或新 script、`package.json` scripts、`src/appErrors.ts`、新文件。
- 禁動：`vercel.json`（CSP 切換是 hosted 人工項）、`.env*`、依賴清單（`package.json`
  dependencies 零新增）。

## 驗收條件

- 每子批完整 gate 全綠；E1/E2 附 build 數字對照；E2 附三拍證據；
  E3 附 `rg -n 'configureAppErrorTransport' src` 證明 production 仍無呼叫點。

## commit 與回報

- commit：`refactor(arch-E1): 非首頁 lazy loading`、`test(arch-E2): 主 chunk 大小 gate`、
  `refactor(arch-E3): error transport 接點與文件`
- 回報檔：`docs/arch-reports/batch-E<n>.md`。
