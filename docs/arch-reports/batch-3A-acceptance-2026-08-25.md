# 批 3A（F3-0 規則解凍＋F3-1 導覽狀態機／深連結＋F3-3 啟動編排）驗收紀錄

- 驗收日期：2026-08-25　驗收者：Claude
- 派工單：`docs/arch-dispatch-2026-08-25-batch3A.md`
- 回報：`docs/arch-dispatch-2026-08-25-batch3A-report-codex.md`
- 驗收範圍：基準 `19deb6c` → HEAD `bded000`（6 commit）

## 結論：**ACCEPTED**（一次通過，無退件項）

## 一、F3-0 規則修訂 [已驗證]

- diff 恰一檔七行：三條解凍（surface stack 限 3B、AppShell 接管區限 3B、
  MIG-06 翻案含 hash 命名空間與優先序）＋一條不解凍清單（testid、既有 e2e
  斷言、文案、同步 commit、dataApi 仍一票否決）——與派工單範圍逐字對齊。
- 3A 未動 DOM 結構，受影響守門測試為零，判定成立。

## 二、F3-1 導覽狀態機 [已驗證]

- hidden 矩陣：基準 9 處直接指派 → HEAD **0**（驗收方 grep）；唯一寫入點
  `setActivePage()` 依 `PAGE_ROUTES` 單一映射計算。
- router `routeCurrentHash()` 10 行、無 React Router；session route 先判、
  分頁後判、未知非空 hash 不動作、空 hash 回地圖——優先序與派工單一致。
- `#tab-*` 命名空間直接接管既有 `#tab-map` anchor（有專屬 e2e）。
- 四個 `showXPage` 保留薄包裝、`focus` 語意不變。
- **交界新設計（三個修正 commit）**：應用寫入的 history entry 帶
  `pageOwnerIdentity`，僅 boot restore 且 owner 與還原後 identity 不同時
  replace 回地圖——防跨帳號冷啟動還原私人分頁；即時登出不受影響
  （`bded000` 限定 boot scope）。屬 F3-1 新開領域的合理設計，
  有已登入冷啟動 e2e 鎖住。

## 三、F3-3 啟動編排 [已驗證]

- `bootDeepLinkReopenPending`／`sessionHashRouteGeneration` 反向 grep **0**
  （src＋tests）；router ownership 從 profile feature 移回啟動編排。
- 依賴圖明確：三路 public（courts／discovery／map）`Promise.allSettled`
  真並行不等 auth（既有產品行為保留）；session 深連結
  `openAuthReadySessionHashRoute`＝await `bootAuthReady` → 重核 hash → 開一次。

## 四、驗收方 canary（皆紅→還原→綠）

1. **hash 對映調換**（messages route 改指 `#tab-me`）→
   `each main page opens directly` 紅，還原綠。
2. **拔 auth 結構性等待**（`await bootAuthReady` 移除）→ local
   `cold boot opens an authenticated session hash once after auth settles` 紅，
   還原綠——等待語意有載重。

codex 側另有兩支 canary（實作前紅燈、pushState→replaceState 使 Back 測試紅）
輸出完整。

## 五、凍結面 [已驗證]

- 兩張 GOLDEN：sequence 測試檔對 `19deb6c` 零 diff、對 `0be31a2` 維持
  已核可 hunk（codex SHA-256 前後一致，驗收方 numstat 覆核）。
- `data-testid` 集合對 `0be31a2` 完全相同（驗收方 quoted 掃描 diff 空）。
- 既有 e2e：`smoke.spec.js`＋`session.spec.js` numstat 純新增
 （51+0／70+0）；`react-page-focus.spec.js` 零 diff。
- `sheets.js`／controller／dataApi／`syncCommit`／`sessionRoute.js` 零 diff；
  變更恰五檔。

## 六、新增 e2e 覆核

八條逐一對照派工單要求：四分頁直開、重整保位、Back、`#tab-map` anchor、
未登入×（page hash＋session hash）、已登入×（page hash＋session hash 含
只開一次的 request count 斷言）——冷啟動四象限齊備。
驗收方基線重跑：mock 六條 12/12（雙 project）、local 兩條 2/2。

## 七、驗收方獨立重跑

```text
test:ci:frontend  exit 0 — unit 308/308、Playwright 282（270 既有＋12 新）／4 skipped、
                  bundle 651949/190267（限額內）
test:db           799 PASS、exit 0
test:local        44 passed（42 既有＋2 新）／11 skipped、did not run＝0、exit 0
git diff --check  乾淨；tracked worktree 乾淨
新測試基線        mock 12/12（雙 project）、local 2/2
canary            兩支驗收方 canary 紅→還原→綠（§四）
```

Playwright 未並發；未重置 DB。
