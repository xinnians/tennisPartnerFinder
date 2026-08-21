# 批 A：文件現況同步（階段 0 可入庫部分）

先讀 `00-overview.md`；共通紅線與回報合約適用。

## 目標與動機

`CLAUDE.md` 開頭仍寫「既有頁面仍維持原生 DOM，後續才逐頁遷移」，已不符現況（21 個 TSX、
18 個 React root、遷移批 3–28 已完成）。文件錯誤會讓後續所有代理人拿到錯誤前提。

## 工作項

1. 更新 `CLAUDE.md`「專案定位」段的 React 遷移描述，改為反映：React 畫面遷移已大致完成
   （頁面與 sheet 以 React 呈現），目前進入核心 TypeScript 化、單一 App root 與功能模組
   拆分階段（依 `docs/frontend-architecture-review-2026-08-21-codex.md`）。
2. 順讀全檔，若有其他句子與「畫面已遷移」矛盾則一併修正；**不改**隱私邊界、資料流程、
   指令清單等其他段落的規範內容。

## 凍結白名單

- 可動：`CLAUDE.md` 中描述現況的敘述句。
- 禁動：所有規範性紅線文字（不可破壞的產品與隱私邊界、RPC 清單、gate 清單）。

## 驗收條件

- `CLAUDE.md` 總行數 ≤ 200（`wc -l` 證明）。
- 新描述與 repo 事實一致：TSX 數量、React root 數量若入文必須以指令重數（`rg --files src -g '*.tsx' | wc -l`）。
- `git diff CLAUDE.md` 只含敘述句變更，無規範性段落刪改。

## gate（文件批縮減版）

```bash
npm run test:session-unit
git diff --check
```

## commit 與回報

- commit：`docs(arch-A): 同步 CLAUDE.md 的 React 遷移現況描述`
- 回報檔：`docs/arch-reports/batch-A.md`，附 wc -l 輸出與 diff 摘要。
