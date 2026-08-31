# 前端架構開發進度

最後更新：2026-08-31

這是前端架構開發的**單一進度入口**。新的 session 應先讀本文件，再讀
`frontend-architecture-final-v3-2026-08-31.md`；舊的審查報告只作歷史紀錄，不直接代表目前狀態。

## 目前狀態

| 項目 | 狀態 |
| --- | --- |
| 工作分支 | `codex/frontend-architecture-execution` |
| 開發基準 | `51dde9c`（16 份前端架構審查文件首次入版） |
| 目前批次 | `FA-02` Push lifecycle 詳細設計 |
| 整體狀態 | `FA-00`、`FA-01` 完成；`FA-02` 準備開始 |
| runtime 變更 | 無 |
| migration 變更 | 無 |
| bundle checker／CI 變更 | checker 已分成開發期 report 與 release enforce；CI 仍走 report |
| 下一批 | `FA-02` Push lifecycle、quarantine、consent、local sign-out 設計 |

查實際 Git 狀態：

```bash
git status --short
git branch --show-current
git log --oneline --decorate -10
```

## 已確認決策

| ID | 決策 | 實作狀態 |
| --- | --- | --- |
| D1 | Push 同意採「帳號＋裝置」opt-in；換帳號必須重新同意 | 待 `FA-02/FA-03` |
| D2 | 一般登出只停止目前裝置的登入與推播；其他裝置不受影響 | 待 `FA-02/FA-03`；現行 auth-js 仍為預設 global sign-out |
| D3 | Push cleanup 結果不明時採 durable quarantine；dispatcher 送出前重查狀態 | 待 `FA-02/FA-03`；目前 schema 沒有 quarantine state |
| D4 | 只接受 quarantine 寫入前已交給外部 push service 的通知無法追回；不接受僅載入 dispatcher 記憶體後仍送出 | 待 `FA-02/FA-03` |
| D5 | quarantine 的重新確認、保存期限與到期處理由 `FA-02` 提案後再核可；不先猜 30／90 天 | 待設計 |
| D6 | session 缺少 `user.id` 時 fail-closed：視為無效、清私人狀態並要求重新登入 | 待後續 auth hardening 批次；目前仍 fallback 到 access token |
| D7 | `ds-bundle/` 與 `.design-sync/` 保留並持續使用於 UI/UX 優化 | 已決策；同步前仍需全量重驗，不能假設自動同步 |
| D8 | 開發期 bundle bytes 只報告、不阻擋 CI；demo／E2E hook／隱私與拆包邊界仍 hard fail | `FA-01` 已完成 |
| D9 | 第一個 production release candidate 前，依 route、裝置、網路、gzip／Brotli 與 Web Vitals 基線重訂並啟用 hard byte limits | 待 production baseline |

## 授權邊界

- 使用者已設定持續開發目標：依本文件逐批執行，只有產品決策、migration 核可或不可逆操作才停下確認。
- 已完成 `FA-00`、`FA-01`；可直接進行 `FA-02` 設計與唯讀查證。
- Push runtime／migration 必須先完成 `FA-02`，並取得 quarantine 到期政策的產品核可。
- 不自行 push 遠端；每批以獨立 commit 保存。

## 批次總表

| 批次 | 內容 | 狀態 | 完成條件 |
| --- | --- | --- | --- |
| FA-00 | 建立進度單一來源、回填已確認決策 | 完成 | 文件差異與 whitespace 檢查通過；無非文件變更 |
| FA-01 | 文件／rules 對齊；bundle 結構 hard gate 與開發期 size report 分流 | 完成 | 非 byte 邊界仍可翻紅；bytes 可報告；release enforcement 路徑存在 |
| FA-02 | Push lifecycle、quarantine、consent、local sign-out 詳細設計 | 待開始 | state machine、資料模型、到期方案、RPC／SW／dispatcher／測試矩陣完整 |
| FA-03 | Push runtime 與 migration | 未授權 | `FA-02` 核可後另行開始；DB、browser、雙帳號測試通過 |
| FA-04 | DOM／ownership gates 與正式 ledger／browser manifest | 未開始 | gate 有 canary；清單有明確 scope |
| FA-05 | 低風險清理、production preview、效能基線、Bundle ADR | 未開始 | before／after 可重現；未放寬未核可邊界 |
| FA-06 | `sessionViews` wiring、blockedPlayers、Chat／Messages ownership | 未開始 | 每個新 owner 都伴隨舊 bridge 刪除與完整回歸 |

## FA-00 實際內容

已做：

- 建立 `codex/frontend-architecture-execution` 分支。
- 建立本進度文件。
- 將 D1–D9 與 fail-closed 決策回填 final-v3。
- 保留 final-v3 的技術事實／待驗項目區分。

未做：

- 未改應用程式、資料庫、Service Worker、Edge Function、測試、rules 或 CI。
- 未執行 runtime test suite；本批沒有 runtime 變更。
- 未把 quarantine 保存天數寫死。

本批驗證：

```text
文件非空與 code fence 成對
git diff --check
git diff --name-only（只允許本進度文件與 final-v3）
```

## FA-01 實際內容

已做：

- 保留原本 8 個 raw／gzip byte 數值，集中到 `scripts/productionBundlePolicy.mjs`，沒有調高門檻。
- `npm run check:production-bundle` 改為開發期 report：超過 bytes 會列出差額，但不因此失敗。
- 新增 `npm run check:production-bundle:release` 與明確的 `--enforce-byte-limits` 參數；相同超額在
  release 模式會合併列出並 hard fail，未知參數也會失敗。
- demo identifier、E2E hook、輸出完整性、private repository 與 Sentry 拆包仍是 hard gate。
- Sentry 特例不再靠 `sentry_version` 字串分類；checker 另跑 production `write:false` build，要求
  `src/sentryBrowserSdk.ts` 與全部 `@sentry` module 只存在同一 chunk、不得混入其他 app module，
  也不得再 import 其他 chunk，並核對該 chunk 與磁碟 `dist` 內容相同。原 marker 只保留作第二層檢查。
- 在既有 `tests/ci-config.test.js` 補 report／enforce、邊界相等、未知參數與 Sentry provenance canary；
  沒有新增未被聚合 script 收錄的孤立 test file。
- 對齊 `CLAUDE.md` 與三份 `.claude/rules/` 的真實路徑、命令、CI job、Playwright 範圍及 byte 政策。

刻意未做：

- 未修改 `.github/workflows/quality-gate.yml`；frontend CI 原本就會在 build 後呼叫預設 checker，
  因此現在自然取得 report 行為。
- 未修改 app runtime、migration、Service Worker、Edge Function、任何 byte 數值，也未加入 Brotli 門檻。
- 未 push 遠端。

實測 bundle 基線（production、32 files、508 modules）：

| 範圍 | raw bytes | gzip bytes | 現有門檻 raw／gzip |
| --- | ---: | ---: | ---: |
| main | 638,937 | 187,466 | 658,867／192,420 |
| 最大一般 lazy（My Sessions） | 16,476 | 4,828 | 18,000／5,500 |
| Sentry | 87,975 | 29,723 | 90,000／31,000 |
| total JS | 841,561 | 257,627 | 849,961／259,062 |

本批驗證：

```text
node --test tests/ci-config.test.js：19 passed
npm run check:production-bundle：report mode，0 exceeded
npm run check:production-bundle:release：enforce mode，0 exceeded
npm run test:ci:frontend：通過；Playwright 298 passed / 4 skipped
wc -l CLAUDE.md：200
git diff --check：通過
```

補充：完整 CI 輸出曾出現 `WebSocket server error: Port 24678 is already in use` 警告，相關 unit
與整體聚合仍全部通過；本批沒有把這則警告誤寫成測試失敗，也沒有在未查因前宣稱已消失。

## 已知阻塞與風險

- 開發期 bytes 已改為 report；release hard limits 仍沿用歷史數值，必須在第一個 production
  release candidate 前依真實裝置、網路、gzip／Brotli 與 Web Vitals 重訂，不能把目前通過當成正式基線。
- 現行 `push_subscriptions` 只有 active row，沒有 quarantine／consent／expiry state。
- 現行一般登出走 auth-js 預設 global scope，與 D2 尚未一致。
- 現行 identity helpers 仍以 `access_token` fallback，與 D6 尚未一致。
- `ds-bundle/` 是人工同步資料包；繼續使用前要確認與目前 UI/CSS 一致。

## 下一個 session 的起點

1. 確認分支為 `codex/frontend-architecture-execution` 且工作樹乾淨。
2. 讀本文件 D1–D5 與 final-v3 的 Push 事實清單；不得把提案寫成現況。
3. 逐檔核對 browser、auth、RPC、Service Worker、Edge Function、migration、pgTAP 與測試現況。
4. `FA-02` 只做可實作的詳細設計，不先修改 runtime 或 migration。
5. 提出 quarantine 保存期限／到期方案的實證與取捨，停下取得產品核可後才排定 `FA-03`。

## 進度紀錄

| 日期 | 批次 | 紀錄 |
| --- | --- | --- |
| 2026-08-31 | FA-00 | 建立執行分支、單一進度入口，寫入已確認產品與開發政策。 |
| 2026-08-31 | FA-01 | Bundle 結構 hard gate 與 byte report／release enforce 分流完成，rules 與測試同步。 |
