# 長列表批派工單（後半）：F4-7 資料層上限與定序契約

- 日期：2026-08-25
- 路線圖：`docs/arch-roadmap-2026-08-25.md` 階段 6 後半；母派工單 F4-7 條目
- 開工基準：以當前 origin HEAD 為準（`b378c33` 之後）
- 定位：四個清單查詢目前**無上限撈全量**，總量隨使用者數成長——本批加
  query-time 上限（safety valve）與定序契約。**不做分頁 UI、不做無限捲動**；
  上限是防規模失控的安全閥，正常量級下使用者不可感。

## Ground truth（2026-08-25 實測）

- `.limit(` 於 `src/` 零筆。四查詢現況：
  1. `session_discovery`（`dataRepository.ts:111`）：時間窗（now-2h〜+N 天）
     ＋bounds，`.order("start_at", asc)`，無 tie-break、無 limit。
     **餵地圖圖釘＋drawer**——截斷會靜默隱藏球局，是四者中最需要
     可觀測性的面。
  2. `player_directory`（`privateDataRepository.ts:164`）：bounds 選配，
     **完全無 `.order(`**（回傳順序不定），無 limit。
  3. `my_session_participations`（`:200`）：`.order("updated_at", desc)`，
     無 tie-break、無 limit。
  4. `session_message_feed`（`:239`）：per-session，
     `.order("created_at", asc).order("message_id", asc)`，無 limit——
     直接加 limit 會截成「最舊 N 則」，**錯誤方向**；最新 N 則需 desc＋
     客端反轉。
- pgTAP 相關檔：`supabase/tests/session_rls.sql`、`session_chat.sql`。
- mock 路徑（`mockData` 分支）與真實路徑共用呼叫端；上限語意兩路徑要一致。

## 作法要求

1. **每查詢三件組：明確 order＋tie-break＋`.limit(N)`**。
   - tie-break 用 view 已曝露的唯一鍵（`session_id`／`profile_id`／
     `participation` 主鍵／`message_id`）；若某 view 缺可用 tie-break 欄位，
     先回報評估，需要 migration 就提案（新 migration 依
     `.claude/rules/supabase.md`；預期零 migration，打破此預期要說明）。
   - `player_directory` 補定序時說明選序理由（例：在線優先或暱稱／id 穩定
     序）；**不可改變 UI 呈現語意**——若 UI 現依賴到達序，先揭露現狀再定。
2. **上限值（預設採用，異議附論證）**：discovery 200、my sessions 100、
   directory 200、chat 最新 200。依據：單主揪同時至多 5 局、台北市 89 座
   球場、時間窗已收斂——正常量級遠低於閥值。
3. **chat 改「最新 N 則」**：desc＋limit＋客端反轉，呈現順序與現在逐字
   相同（舊→新）；置底、未讀清除、封存唯讀語意不變。
4. **截斷可觀測性**：討論每面 rows==limit 時的行為並落文件——discovery
   至少要 dev console 警示（不含個資）；其餘可接受靜默但要寫明理由。
   不強制加 UI。
5. **pgTAP**：為四 view 補「定序鍵存在且唯一可 tie-break」的契約斷言；
   chat 另斷言 `(created_at, message_id)` 全序。掃描集非空自證。
6. **前端守門**：unit 斷言四查詢各帶 `.order`＋`.limit`（原始碼掃描，
   非空自證＋固定集合比對，仿 `content-visibility-contract` 模式）；
   fail-closed canary 雙向（拔一個 limit → 紅；多一個未列契約的無 limit
   清單查詢 → 可偵測或說明邊界）。
7. mock 分支套同上限（`slice` 等價語意），mock e2e 零修改全綠。

## 不在範圍

1. 分頁 UI、無限捲動、「載入更多」；前半 containment 不動。
2. RLS 語意、view 欄位增刪（除非 tie-break 評估證明必要並先提案）。
3. controller／殼／dataApi.js 簽名。
4. 通知、presence、court_subscriptions 等非四清單查詢。

## 驗收與回報

寫成 `docs/arch-dispatch-2026-08-25-listcap-batch-report-codex.md`，不列入
實作 commit、不 push。逐查詢：order／tie-break／limit 三件組、chat 反轉
實作、截斷可觀測性決定、上限值採用或異議、pgTAP 斷言清單、canary
紅→還原→綠、未做明說。

**收尾標準矩陣**：`npm run test:ci:frontend`、`npm run test:db`、
`npm run test:local`（did not run＝0）、`git diff --check`；GOLDEN、
`data-testid`、既有 e2e 斷言對 `0be31a2` 維持已核可 hunk。
Playwright 不並發；DB 重置只可用 guarded 指令並揭露；若動 migration，
hosted 套用另由使用者依 release checklist 執行，本批不碰 hosted。
