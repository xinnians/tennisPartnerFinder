# F1R（批 1 焦點迴歸修補）驗收紀錄

- 驗收日期：2026-08-24　驗收者：Claude
- 派工單：`docs/arch-dispatch-2026-08-24-frontend-F1R.md`＋修訂一、修訂二
- 回報：`docs/arch-dispatch-2026-08-24-frontend-F1R-report-codex.md`
- 驗收範圍：基準 `e907c40` → 實作 HEAD `0f57c1b`（3 個實作 commit）

## 結論：**ACCEPTED**

主驗收標的達成：`npm run test:local` 由「1 failed／31 did not run」修復為
**42 passed／11 skipped／did not run＝0**（驗收方獨立重跑，exit 0）。
兩條批 1 迴歸（F1-1 created-session focus、F1-5 picker 收合空窗）都以最小
production 修復收案，未回退批 1 已驗收成果，未改任何凍結斷言
（唯一的 oracle 調整依修訂一授權，必要性由驗收方在終態獨立證實）。

## 一、驗收方獨立重跑

| 項目 | 結果 |
| --- | --- |
| `npm run test:local` | **42 passed／11 skipped、did not run＝0**，exit 0 |
| picker race（修訂二條件）`--repeat-each=10 --retries=0` | **10/10 passed**（43.6s） |
| `npm run test:ci:frontend` | exit 0；unit 295/295、Playwright **270** passed／4 skipped、bundle 633420/184464 within gate |
| `npm run test:db` | 799 PASS |
| GOLDEN | `git diff 0be31a2 HEAD` 仍只有批 1 檔頭註解 hunk |
| `data-testid` 集合 | 與 `0be31a2` 逐字相同 |
| `git diff --check`／tracked worktree | 乾淨 |

Playwright 266→270 的變因：d59e72a 新增的 mock 迴歸測試
`created-session focus follows the subscribed store path after the one-time app mount`
（`tests/react-page-focus.spec.js:91`）在 desktop／mobile Chromium 各 +1，
加上批 1 原有的 focus spec ——數字對得上。

## 二、三個 commit 的合規審查 [已驗證]

- `e3a638f`（oracle 調整）：**單獨 commit、只動 `tests/session.spec.js` 一檔**，
  符合修訂一程序。新 oracle 保留對稱掃描、防縮水（≥15）、每輪挪座標；
  每輪等 `update_my_presence` response（`ok()` 斷言）＋雙 rAF；
  斷言原節點 connected **且**仍為 `document.activeElement`——比舊版強
  （兼抓 remount 與焦點竊取）。
- `d59e72a`（created-session focus）：`MySessionsPage` 以 `useLayoutEffect` 在
  **每次 commit**（含 store 驅動）把當前 commit 的 `groups／focusId` 交回 adapter 的
  `scheduleMySessionsCreatedFocus`；一次性語意保留
  （`onCreatedSessionFocus(expectedSessionId)` 比對後才清除）。
  不回退訂閱化與穩定 key。附帶新增 mock 迴歸測試（走真實 store-emit 路徑）。
- `0f57c1b`（picker 收合交棒）：**條件式交棒完全符合修訂二第 1 條**——
  只在 `document.activeElement` 位於 `[data-notification-courts]` 內或是
  court checkbox 時才交給 toggle；`sessionActions.ts` 的 async fallback 原樣保留；
  另以 `toggle.disabled = false` 抵銷 action helper 的同步 disable，附註解說明
  （toggle 只切 local disclosure state，pending 期間可按無害）。

## 三、驗收方的獨立 canary／探針

### 3.1 決定性探針：舊 oracle 在終態必紅 [已驗證]

修訂一的原始依據（`a27b91f` 起紅 10/10）被 codex 誠實揭露為無法重現
（`a27b91f`／`9754a4f`／`4be7a53` 補測皆 10/10 綠，詳回報 §4.3，標 [不確定]）。
驗收方因此改測**決定性問題**：在最終 HEAD `0f57c1b` 的 production 上還原
`e907c40` 版的舊測試檔，跑 3 次：

```text
3 failed —— Error: 背景重繪必須真的發生（isConnected===false poll timeout）
```

**舊 oracle 在終態機制性必紅**，oracle 調整的必要性成立；引入點的歷史
（何時從「節點被替換」變成「identity 保留」）維持 [不確定]，不影響驗收。

### 3.2 mock 迴歸測試先紅後綠 [已驗證]

把 `0f57c1b` 版的 `react-page-focus.spec.js` 帶進 `e907c40` worktree：

```text
✘ created-session focus follows the subscribed store path …（新測試，紅）
✓ page adapter updates preserve focused React controls …（既有，綠）
```

HEAD 上由完整 CI 證實綠。先紅後綠成立。

### 3.3 remount canary 的自我更正

修訂一指定的 canary（`key={slot.resetKey}`）**是驗收方開錯的條件**：
presence 路徑是 store-only commit，`resetKey` 不變，該 canary 不可能紅。
codex 實測揭露不紅（1 passed）、未偽報，改用等價且真的會 remount 的
`key={pageView?.presenceLocationStatus}` canary，紅燈輸出同時命中
`connected:false` 與 `focused:false` 兩半斷言（回報 §4.2），還原後綠。
判定：替代 canary 有效，兩半斷言的牙都被證到。

## 四、回報品質

- 兩處與授權文件不符的實測（resetKey canary 不紅、`a27b91f` 紅無法重現）
  均主動揭露並正確標 [已驗證]／[不確定]，未把未重現的紅寫成事實。
- 第二條迴歸（F1-5）依修訂二預期格式分列，附二分（`0be31a2` 10 綠、
  `4be7a53` 8/2、修復前 HEAD 5/5）與修復後 10/10 取樣。
- 診斷四題 log、假說對照、探針清除證明齊備。

## 五、觀察（不阻擋）

1. `a27b91f`〜`4be7a53` 期間 picker 測試在**更早的 subscribe-all 功能斷言**穩定紅
   （回報 §5.1），係批 1 內部的過渡態、F1-5 落地後自癒——不需行動，記錄供
   未來二分時參考：批 1 的中間 commit 不是每個都是可用狀態。
2. 舊 oracle 在 `e907c40`（單次）量到綠、在含 F1R 修復的工作樹量到穩定紅，
   確切轉折點未定位。已由終態必紅（§3.1）取代其驗收意義。
3. bundle 633375→633420（+45 raw，production 修復成本），距 gate 上限餘裕充足。

## 六、後續動作

1. F1R 三個 commit 與本紀錄、codex 回報一併收錄；批 1 驗收紀錄後註補記第二條迴歸。
2. 下一步依既定順序：**2A 補件**（`docs/arch-dispatch-2026-08-24-frontend-F2A-followup.md`，
   已發）→ 2B → 2C → 2D。
3. 全部未 push；push 由使用者執行。
