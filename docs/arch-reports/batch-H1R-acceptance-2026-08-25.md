# H-1R（error transport 契約放寬＋Sentry 接線）驗收紀錄

- 驗收日期：2026-08-25　驗收者：Claude
- 派工單：`docs/arch-dispatch-2026-08-25-H1R-sentry.md`
- 回報：`docs/arch-dispatch-2026-08-25-H1R-sentry-report-codex.md`
- 驗收範圍：基準 `b93b0ab` → HEAD `bf89206`（單一 commit）

## 結論：**ACCEPTED**（一次通過，無退件項）

## 一、契約先行 [已驗證]

- `error-transport-wiring.md` 新增「On-wire 容忍欄位」節（8 個枚舉 key、
  tags 精確三鍵、breadcrumbs 空、environment 二字面、`infer_ip: "never"`、
  日期＋拍板出處）；`src/appErrors.ts` 三欄本體零 diff。

## 二、接線實作 [已驗證]

- `sentryErrorTransport.ts` 唯一薄 adapter；`captureException` 反掃零命中；
  `sentryBrowserSdk.ts` 窄 re-export 控 lazy chunk 內容。
- DSN 空白／格式錯誤在 dynamic import 前 short-circuit（URL 解析＋https＋
  username＋數字 project id 驗證）。
- `main.js:140` configure 恰一次、`main.js:144` `installGlobalErrorHandlers`
  在其後——順序正確。

## 三、隱私與載重 [已驗證]

- 真 SDK envelope 攔截測試 3/3 綠；codex 四支 canary（多鍵／第四 tag／
  breadcrumb 塞入／message 洩漏）紅→還原→綠俱附輸出。
- **驗收方兩支不同軸 canary**（紅→還原→綠）：
  1. `sendDefaultPii: false→true` → envelope 測試紅（`infer_ip` 斷言）。
  2. 空 DSN gate 繞過（空值改回傳假 DSN）→ 零載入測試紅
    （`loads no SDK, sends no request` 抓到）。
- 空 DSN 實測：SDK 載入 0、fetch 0、console 空（unit＋in-app browser 雙證）。

## 四、CSP 與 secret [已驗證]

- `vercel.json` 只加一個精確 origin `https://o4511969009074176.ingest.us.sentry.io`
 （與使用者 DSN 的 ingest host 逐字一致，驗收方比對）；wildcard 禁用有測試鎖。
- **完整 DSN／public key／project id 反掃 repo 零命中**（驗收方
  grep key 與 project id 皆 0）。

## 五、bundle [已驗證]

- 主 chunk 651015/189880（+1541 bytes＝本地 gate／wiring，SDK 不在內）；
  lazy chunk `sentryBrowserSdk-*.js` 87980 bytes 獨立存在；
  `check-production-bundle` 新增雙向 gate（主 chunk 無 marker＋lazy chunk 必有）。
- baseline 比較採 detached worktree 同 env 重建——方法正確。

## 六、驗收方獨立重跑

```text
test:ci:frontend  exit 0 — unit 308/308、Playwright 270／4 skipped、
                  bundle 651015/189880（限額內）＋Sentry lazy chunk 辨識
test:db           799 PASS、exit 0
test:local        42 passed／11 skipped、did not run＝0、exit 0
git diff --check  乾淨
sentry 測試       3/3（驗收方重跑）＋兩支自建 canary 紅→還原→綠
```

Playwright 未並發；未重置 DB。

## 七、後續

- 使用者已設 Vercel `VITE_SENTRY_DSN`（2026-08-25）；push 部署後生效。
- 部署後驗證：正常瀏覽不應載 sentry chunk／發請求；錯誤發生時 Sentry 後台
  應只見三 tags 事件。sampling／alert／enforcing CSP 均另議。
