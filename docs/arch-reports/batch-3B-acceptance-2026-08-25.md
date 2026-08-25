# 批 3B（F3-2 殼遷入 AppShell＋glob 橋接退役）驗收紀錄

- 驗收日期：2026-08-25　驗收者：Claude
- 派工單：`docs/arch-dispatch-2026-08-25-batch3B.md`
- 回報：`docs/arch-dispatch-2026-08-25-batch3B-report-codex.md`
- 驗收範圍：基準 `e6269ce` → HEAD `3af51e6`（6 commit，恰 10 檔）

## 結論：**ACCEPTED**（一次通過，無退件項）——批 3 全案完結

## 一、結構驗收 [已驗證]

- `import.meta.glob` 於 `src/` **歸零**；改為 `main.js` 兩個 eager static
  import＋`lazySurfaceLoaders` 具名 dynamic-import map（13 項）。
- 第三套 Escape listener：`filterToolbarFeature.js` 的 `keydown` 反掃 **0**。
- `flushSync`：仍僅 `src/syncCommit.ts`；allowlist 測試零修改。
- 既有 Playwright spec **零修改**（numstat 空，含批 3A 的 8 條導覽測試）。
- `surfaceManifest.js`／兩張 GOLDEN 零 diff（manifest 六組集合不變的逐項
  理由成立：login 內容是 AppShell content adapter 非新 `src/sheets/*` 檔；
  eager／lazy 集合只換載入機制）。
- `data-testid`：src＋index.html 聯集對 `0be31a2` **完全相同**（77 unique）
  ——topbar／底部導覽的 testid 從 index.html 遷入 App.tsx 後集合不變。

## 二、凍結測試調整（單獨列節，依總則）[已驗證]

1. `react-surface-lifecycle.test.js`：eager／lazy 掃描基準由「sessionViews.js
   glob regex」改為「main.js static imports＋lazySurfaceLoaders entries」，
   非空自證與 manifest 逐元素比對保留；新增 AppShell a11y 靜態守門
  （aria-current×4、popover aria、Escape guards、toast live region）。
2. `app-errors.test.js`：surface 計數 19→20（新 `login-dialog` error
   surface），斷言語意未弱化。
3. `session-data-boundary.test.js`：底部導覽掃描跟隨所有權搬移
  （main 只轉發 snapshot、App 渲染 unread dot 與 aria-label），
   非空防線與行為主張不變。

三處均忠實、已揭露、無刪弱。

## 三、驗收方 canary（皆紅→還原→綠）

1. **aria-current 恆真**（拿掉條件）→ 新 a11y 守門紅
  （`all four destination tabs must derive aria-current from React
  navigation state`）。
2. **拔 SessionDetailSheet eager import** → eager 掃描紅並**點名該模組**。

codex 側兩支（lazy loader 多塞一項→紅；popover Escape 拔掉雙 guard→
既有 smoke 抽屜誤收合紅）輸出完整；其 canary 補充「只拔 stopPropagation
仍被 defaultPrevented 擋住」的探針精確性說明，紀律良好。

## 四、瀏覽器實測抽查 [已驗證]

mock dev（`mock-design-audit` 配置）：殼視覺完好（topbar chips／品牌／
底部導覽樣式如舊）；level popover 點開（`aria-expanded=true`、band 選項
5 個）→ Escape 只關 popover（`aria-expanded=false`）、抽屜不動——
Escape 分層語意 live 驗證通過。

## 五、驗收方獨立重跑

```text
test:ci:frontend  exit 0 — unit 309/309、Playwright 282／4 skipped、
                  bundle 658143/191844（限額內）
test:db           799 PASS、exit 0
test:local        44 passed／11 skipped、did not run＝0、exit 0
git diff --check  乾淨；tracked worktree 乾淨
canary            兩支驗收方 canary 紅→還原→綠（§三）
瀏覽器實測        popover Escape 分層 live 驗證（§四）
```

Playwright 未並發（視覺抽查 dev server 已先停）；未重置 DB。

## 六、觀察

- `sessionViews.js` 637→665（+28 行 loader map／注入配置），facade 性質不變。
- login modal 殼（`mountDialog`、focus trap、stack）零搬移，符合
  「殼機制不動、只換內容」拍板。
- bundle 主 chunk 658,143（+6,194 bytes，loader 顯式化成本），gate 限額內。
