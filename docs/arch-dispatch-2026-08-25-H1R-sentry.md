# H-1R 派工單：error transport 契約放寬＋Sentry 接線

- 日期：2026-08-25
- 前情：加固批 H-1 BLOCKED（`docs/arch-reports/batch-hardening-acceptance-2026-08-25.md` §一）
  ——「on-wire 精確三鍵」契約與 Sentry 協定必帶欄位不相容。
- **使用者拍板（2026-08-25）**：放寬契約後接線。放寬僅限「廠商協定技術欄位」，
  message／stack／URL／breadcrumb 內容／一切 PII 紅線**不變**。
- 開工基準：`0f79e07`。

## 第一步：契約修訂（先改文件再寫程式）

修訂 `docs/error-transport-wiring.md`，新增「on-wire 容忍欄位」節：

1. 送出 event 的 **top-level key 集合必須 ⊆ 枚舉清單**（以 H-1 probe 實測為基準：
   `tags`、`event_id`、`timestamp`、`platform`、`environment`、`sdk`、`contexts`、
   `breadcrumbs`；若實接時出現清單外 key，先回報再議，不得自行擴充）。
2. `tags` **精確等於** `errorName`／`kind`／`surface` 三鍵。
3. `breadcrumbs` 必須為空陣列（integrations 全關的預期結果，以測試斷言鎖住）。
4. 除 `tags` 外，任何欄位**不得含 app 衍生值**：以 PII canary 反向斷言鎖
  （序列化整個 envelope，斷言不含假 email／GPS／暱稱／LINE 字串）。
5. `environment` 只可為固定字面（`production`／`preview`）；`sdk.settings`
   需含 `infer_ip: "never"`。
6. 修訂節標注日期與「2026-08-25 使用者拍板」出處；原三欄 allowlist
  （`AppErrorReport`／`APP_ERROR_TRANSPORT_FIELDS`）**程式側不變**——
   放寬的是 wire 層容忍，不是 app 可送資料。

## 第二步：接線（原 H-1 條款全數沿用）

1. 薄 adapter 只映射三欄進 `tags`；禁 `captureException`；
   `defaultIntegrations:false`、`sendDefaultPii:false`、autoSession／tracing／
   replay／breadcrumb 全關。
2. SDK dynamic import 不進主 chunk；`VITE_SENTRY_DSN` 空值完全不載入、
   等價 NOOP（零請求零 console）。
3. 啟動時恰一次 `configureAppErrorTransport`（global handlers 前）；
   restore 保存。
4. `vercel.json` Report-Only CSP `connect-src` 加 DSN 對應的**精確** ingest host。
5. transport 失敗吞掉，不得影響畫面或形成錯誤迴圈。

## 驗收

1. **攔截測試**：實送 envelope 的 top-level keys ⊆ 枚舉清單、`tags` 精確三鍵、
   `breadcrumbs` 空——三個斷言各自 canary（故意加一鍵／改 tags／塞 breadcrumb
   → 紅，還原綠，附輸出）。
2. **PII canary**：message 含假 email＋GPS 的 error 經完整 pipeline →
   序列化 envelope 反向斷言；先讓 adapter 誤傳 message 證明測試會抓（紅），
   還原綠。
3. `check:production-bundle`：主 chunk bytes 前後對照（不因 SDK 上升）；
   sentry 模組不在主 chunk（附 chunk 清單）。
4. DSN 空值：零網路請求、零 console（測試證明）。
5. CSP diff 僅一個精確 host。
6. 標準矩陣：`test:ci:frontend`＋`test:db`＋`test:local`（did not run＝0）＋
   `git diff --check`；GOLDEN／testid 對 `0be31a2` 維持已核可 hunk。

## 使用者側（回報單獨列節，不代做）

Sentry 專案建立、DSN 取得、Vercel env `VITE_SENTRY_DSN` 設定、部署 push。
本批程式碼在 DSN 未設時必須完全靜默，故可先合入等 env。

## 不在範圍

取樣率／alert 規則／enforcing CSP／source map（D-03 已裁決不開）；
不動三欄 `AppErrorReport` 本體。

## 回報要求

寫成 `docs/arch-dispatch-2026-08-25-H1R-sentry-report-codex.md`，不列入實作
commit、不 push；驗收逐條附指令＋實際輸出；canary 全部紅→還原→綠；
未做明說。
