# 批 22：抽出 TypeScript presentation，斬斷 React 反向相依

日期：2026-08-20　基準：`bdf0b86`
對應工單：`docs/frontend-fix-plan-2026-08-20.md` 的 **P2-A**

## 1. 問題

改動前共有 14 個 TSX 檔直接 `import ../sessionViews.js`；同一個 `sessionViews.js` 又用 18 個
eager `import.meta.glob` 載入 React 頁面與 sheet，形成雙向相依：

```text
sessionViews.js → TSX → sessionViews.js
```

舊版 `npm run typecheck` 仍為 exit 0，表示這個循環與模組初始化順序沒有任何自動防線。
TSX 還各自保留 runtime interface 與延後讀值的 `runtime()` 包裝，目的只是避開循環初始化，讓真正
的呈現型別仍由每個消費者自己描述。

## 2. 改動

- 新增 `src/sessionPresentation.ts`：集中 13 個 React 會使用的 frozen runtime、
  `messagesFromGroups`、附近球局摘要，以及它們的呈現 helper；輸入改用
  `SessionSummary`、`MySessionSummary`、`CourtSummary` 等共用 TypeScript 型別。
- 14 個 TSX 全部單向 import `sessionPresentation.ts`，不再碰 `sessionViews.js`；不需要為載入
  順序延後讀值，所以刪除 10 組重複 runtime interface / `runtime()` wrapper。
- `sessionViews.js` 保留對舊呼叫端的相容 re-export，但不重複建立 runtime；新 gate 以模組
  identity 證明兩邊拿到同一物件。
- DOM-backed pending state、focus 與 async action 不是假裝成「純呈現」，另抽到
  `src/sessionActions.js`。`sessionViews.js` 與 TypeScript runtime 共用同一組 WeakMap/action
  owner，避免拆檔後各有一份 pending 狀態。
- 建局／編輯表單的 `sessionFormSheetRuntime` 留在 `sessionViews.js`：它沒有被 TSX 反向
  import，不在本次循環內，硬搬只會擴大風險。
- 新增 4 條單元 gate，並註冊到寫死檔名的 `test:session-unit`：鎖住 14→0 反向 import、
  presentation 不得回頭依賴 view adapter、禁止 `@ts-nocheck` / explicit `any`，以及相容
  re-export 不得複製物件。

最終相依方向為：

```text
14 個 TSX ────────→ sessionPresentation.ts ─→ sessionActions.js
sessionViews.js ──┴→ sessionPresentation.ts
sessionViews.js ───→ sessionActions.js
```

## 3. canary 四拍

canary 精確把 `Avatar.tsx` 第一行從：

```text
import { avatarRuntime } from "../sessionPresentation.ts";
```

改回：

```text
import { avatarRuntime } from "../sessionViews.js";
```

1. 改動後、無 canary：新 boundary spec 為 `4 passed`、exit 0。
2. 加入 canary 後，同一指令 exit 1，逐字關鍵輸出：

   ```text
   src/components/Avatar.tsx misses the presentation boundary
   1..4
   # pass 3
   # fail 1
   ```

3. 用精確 patch 還原 import 後，完整新 spec 重跑 3 次為 `12 passed`、exit 0。
4. 用 `git archive bdf0b86` 建立 `/private/tmp` 對照組。舊樹反向 import 實數為 14，
   `npm run typecheck` 仍 exit 0；也沒有 boundary spec，因此同一種反向依賴完全靜默。

## 4. 完整 gates

`npm run test:ci:frontend` 在最終樹執行：

| Gate                        | 結果                                               |
| --------------------------- | -------------------------------------------------- |
| courts seed `--check`       | 通過                                               |
| `npm run typecheck`         | exit 0                                             |
| `npm run lint`              | exit 0                                             |
| `npm run prettier:check`    | `All matched files use Prettier code style!`       |
| `npm run test:session-unit` | `269 passed / 0 failed`                            |
| Chromium mock e2e           | `266 passed / 4 skipped`（270）                    |
| Batch 22 穩定性取樣         | `12 passed`（4 格 × 3 次）                         |
| `npm run build`             | 主 JS `714.35 / 200.57 kB`；CSS `65.39 / 10.76 kB` |
| production bundle gate      | 12 output files；12 demo identifiers absent        |
| `git diff --check`          | exit 0                                             |

相較批 21，主 JS raw 少 0.22 kB、gzip 少 0.88 kB；本批沒有承諾 code splitting，這個數字只用來
確認沒有因相容 re-export 把 runtime 複製進 bundle。CSS 完全相同。

`npm run test:db`、`npm run test:local` 豁免：本批零 migration、零 `dataApi.js`、零 RPC
簽名；資料白名單與 Supabase 契約未改。266 條 mock browser 測試已實際走過 My Sessions、
聊天、profile、球友卡、候選定案與 session detail，覆蓋這次移動的 presentation/action 使用面。

## 5. 驗收條件

| 條件                                                       | 結果 |
| ---------------------------------------------------------- | ---- |
| 14 個 TSX 對 `sessionViews.js` 的反向 import 從 14 降為 0  | ✅   |
| 14 個 TSX 全部改由 `sessionPresentation.ts` 取得規則       | ✅   |
| presentation 不 import view adapter、不含 eager glob       | ✅   |
| TypeScript presentation 無 `@ts-nocheck`、無 explicit any  | ✅   |
| 舊 `sessionViews.js` API re-export 同一個 runtime 物件     | ✅   |
| DOM async action 的 WeakMap / pending state 只有一個 owner | ✅   |
| `sessionFormSheetRuntime` 未被無關擴張搬動                 | ✅   |
| 既有 DOM、文案、class、aria、testid 與行為保持             | ✅   |

## 6. 變更清單與偏離

- `src/sessionPresentation.ts`
- `src/sessionActions.js`
- `src/sessionViews.js`
- `src/components/Avatar.tsx`
- `src/components/SessionCard.tsx`
- `src/pages/{MePage,MessagesPage,MySessionsPage,NearbySessionsDrawer}.tsx`
- `src/sheets/{CourtPlayersSheet,DecideSessionSheet,PlayerCardSheet,PlayerDirectorySheet}.tsx`
- `src/sheets/{ProfileCompletionSheet,ReportDialog,SessionChatSheet,SessionDetailSheet}.tsx`
- `tests/session-presentation-boundary.test.js`
- `package.json`
- `docs/migration-reports/batch-22.md`

架構審查建議先從 `avatarRuntime` / `sessionCardRuntime` 試拆，再逐步往大 runtime 前進；本批在
完整 gate 保護下把同一條循環的 14 個消費者一次收斂，避免留下「部分 TSX 仍可反向 import」的
模糊邊界。另一個刻意偏離是新增 `sessionActions.js`：`runAsyncAction` 等函式會操作 DOM、焦點與
pending WeakMap，不屬於純 presentation；若直接搬進 `.ts` 命名的呈現模組，檔名與責任會說謊。
目前 action 檔仍是 JS，之後若要 TypeScript 化應獨立成批，不在這次解循環時擴張。
