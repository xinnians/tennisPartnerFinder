# 長列表批（F4-7 後半 資料層上限與定序契約）驗收紀錄

- 驗收日期：2026-08-25　驗收者：Claude
- 派工單：`docs/arch-dispatch-2026-08-25-listcap-batch.md`
- 回報：`docs/arch-dispatch-2026-08-25-listcap-batch-report-codex.md`
- 驗收範圍：基準 `d019a29` → HEAD `08e359f`（1 commit，恰 8 檔）

## 結論：**ACCEPTED**（一次通過，無退件項）

## 一、結構驗收 [已驗證]（src diff 逐行讀畢）

- **四查詢三件組**與回報逐字一致：discovery `start_at,session_id ASC`＋
  limit 200；directory `nickname,profile_id,court_id ASC`＋limit 200（原
  **零定序**缺陷同時修復）；my sessions `updated_at,session_id DESC`＋
  limit 100；chat `created_at,message_id DESC`＋limit 200＋mapper 後
  `.reverse()`——UI 收到的仍是舊→新。上限常數集中
  `listQueryLimits.ts`，採派工單全部預設值。
- **mock 等價**：discovery／directory 非 configured 分支補同序 sort＋
  `slice`；my sessions／chat 的 mock 分支原本即回 `[]`（`:211`／`:252`，
  批前既有），「天然不超限」聲稱成立。
- **截斷可觀測性**：discovery 的 dev 警示走 `import.meta.env?.DEV`，
  production 內聯後死碼消除、無 console 噪音、訊息零個資；其餘三面靜默
  的理由（無恢復操作即不提示）成立。
- **`player_directory` 選序不影響 UI**：`playerDirectoryFeature.ts:42-45`
  UI 自行以在場優先＋暱稱（zh-Hant）排序，repository 序僅決定截斷集合；
  `(profile_id, court_id)` 複合鍵為真實 row 粒度（每人每常打球場一列），
  tie-break 選擇正確，零 migration 成立。
- **pgTAP 純增**：兩檔僅 plan 計數（193→195、472→475）與 skip 計數跟隨，
  新增 5 條斷言全部內建非空掃描（`count(*) > 0 and …`）；無既有斷言刪弱。
- **契約測試**：brace-matching 本體抽取 → `.from()` 站點枚舉對固定 13
  站點集合精確比對（新增未分類查詢即紅）、四 view capped 集合鎖定、
  order／limit 字面逐一要求、四常數鎖值；另有 in-memory 自我 canary
  證明 validator 有牙。

## 二、凍結面 [已驗證]

`tests/*.spec.js`／TSX／CSS／index.html 零 diff（numstat 空）；testid
差集空；GOLDEN 宿主檔 SHA-256 前後相同（`9908494…`）。mock e2e 零修改
即全綠，證明正常量級下四查詢行為對 UI 不可感。

## 三、驗收方 canary（皆紅→還原→綠，與 codex 兩支錯開）

1. 常數鎖值：`SESSION_DISCOVERY_LIMIT` 200→201 → 紅。
2. 拔 discovery 的 `session_id` tie-break → 紅並點名
   （`loadSessionDiscovery is missing order contract .order("session_id"…`）。
3. **語意 canary**：拔 chat `.reverse()` → `session-data-boundary` 的
   ordered-feed unit 紅——「舊→新呈現」斷言證實有牙。

codex 側兩支（拔 limit、新增未知無 limit query）輸出完整。

## 四、驗收方獨立重跑

```text
test:ci:frontend  exit 0 — unit 319/319、Playwright 286 passed／4 skipped、
                  build＋bundle gate PASS
test:db           804 PASS（799→804，+5 新契約）、exit 0
test:local        45 passed／11 skipped、did not run＝0、exit 0
git diff --check  乾淨；tracked worktree 乾淨（僅回報檔未提交，符合約定）
```

Playwright 未並發；未重置 DB；零 migration、無 hosted 事項。

## 五、觀察（非阻擋）

1. 站點掃描以 `async function` 正則抽本體——未來以箭頭函式或非 async
   寫法新增查詢會漏掃。現行兩檔全為 async function 風格，風險低；
   後續改寫風格時需同步 scanner。
2. repository 的 nickname 排序用預設 locale，UI 用 `zh-Hant`——僅在
   >200 列截斷時影響「誰被截掉」，正常量級無感；回報已自承為 safety
   valve 既有限制。
3. 截斷點可能落在同一 profile 的多球場列之間（directory row 粒度所致），
   回報已誠實揭露；分頁／profile-level 查詢留待未來需要時另批。
4. F4-7 全案（前半 containment＋後半資料層契約）至此完結。
