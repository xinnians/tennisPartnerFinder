# 前端架構開發進度

最後更新：2026-08-31

這是前端架構開發的**單一進度入口**。新的 session 應先讀本文件，再讀
`frontend-architecture-final-v3-2026-08-31.md`；舊的審查報告只作歷史紀錄，不直接代表目前狀態。

## 目前狀態

| 項目 | 狀態 |
| --- | --- |
| 工作分支 | `codex/frontend-architecture-execution` |
| 開發基準 | `51dde9c`（16 份前端架構審查文件首次入版） |
| 目前批次 | `FA-00` 文件治理基線 |
| 整體狀態 | `FA-00` 完成；後續批次尚未開始 |
| runtime 變更 | 無 |
| migration 變更 | 無 |
| bundle checker／CI 變更 | 無 |
| 下一批 | `FA-01` 開發規則與 Bundle gate 分流 |

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
| D8 | 開發期 bundle bytes 只報告、不阻擋 CI；demo／E2E hook／隱私與拆包邊界仍 hard fail | 待 `FA-01` |
| D9 | 第一個 production release candidate 前，依 route、裝置、網路、gzip／Brotli 與 Web Vitals 基線重訂並啟用 hard byte limits | 待 production baseline |

## 授權邊界

- 已執行授權：`FA-00`，限進度文件與 final-v3 決策回填。
- 尚未修改：runtime、migration、rules、bundle checker、CI、byte limits。
- Push runtime／migration 必須先完成 `FA-02`，並取得 quarantine 到期政策的產品核可。
- 不自行 push 遠端；每批以獨立 commit 保存。

## 批次總表

| 批次 | 內容 | 狀態 | 完成條件 |
| --- | --- | --- | --- |
| FA-00 | 建立進度單一來源、回填已確認決策 | 完成 | 文件差異與 whitespace 檢查通過；無非文件變更 |
| FA-01 | 文件／rules 對齊；bundle 結構 hard gate 與開發期 size report 分流 | 待開始 | 非 byte 邊界仍可翻紅；bytes 可報告；release enforcement 路徑存在 |
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

## 已知阻塞與風險

- 現行 `scripts/check-production-bundle.mjs` 仍會以 bytes hard fail；D8 尚未落地。
- 現行 `push_subscriptions` 只有 active row，沒有 quarantine／consent／expiry state。
- 現行一般登出走 auth-js 預設 global scope，與 D2 尚未一致。
- 現行 identity helpers 仍以 `access_token` fallback，與 D6 尚未一致。
- `ds-bundle/` 是人工同步資料包；繼續使用前要確認與目前 UI/CSS 一致。

## 下一個 session 的起點

1. 確認分支為 `codex/frontend-architecture-execution` 且工作樹乾淨。
2. 讀本文件的 D8／D9 與 `FA-01` 完成條件。
3. 在改 checker 前，先重跑現行 `npm run build && npm run check:production-bundle` 保存基線。
4. `FA-01` 只改 docs／rules／scripts／CI，不改 runtime 或 byte limit 數字。
5. 完成後更新本文件的狀態、實際命令、結果與下一步，再建立獨立 commit。

## 進度紀錄

| 日期 | 批次 | 紀錄 |
| --- | --- | --- |
| 2026-08-31 | FA-00 | 建立執行分支、單一進度入口，寫入已確認產品與開發政策。 |
