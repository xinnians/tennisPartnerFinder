# 批 3C-1 補件派工單（B3C1-FU-1〜FU-2，極小批）

- 日期：2026-08-26。退件依據：`docs/arch-reports/batch-3C1-me-acceptance-2026-08-26.md`
  退件項（Me 頁 pending-action 帳號隔離 scope 退化為永久 null）。
- 開工基準：`3cfe4db` ＋ **目前未提交的批 3C-1 working tree**（主體已驗收通過，
  不得 revert；本補件疊加其上）。
- 範圍：`src/main.js` 一處＋（如需）`src/pages/MePage.tsx` 的 `MePageOptions` 型別
  一欄＋回報文件補正。**零其他變更。**
- 你不 commit、不 push。

## B3C1-FU-1：恢復 bag 的 `sessionStore` 欄（live scope fallback 復活）

`src/main.js` `mountMeDestination` 的 bag 加回一行：
`sessionStore: controller?.sessionStore,`，並加註解：
「bridge-scope-only：凍結 bridge 的 commit callback 需要 live 讀 user id 做跨帳號
pending 隔離（mount-once 下 closure 捕捉的 authSession 恆為登入前快照）；3C-2 隨
adapter 退役時以 scope 搬進 MePage 根治」。

- 事實依據：`pageViews.js:21` 的第一 fallback
  `options.sessionStore?.getState?.().authSession?.user?.id` 是每次 commit 的 live 讀；
  被移除後退化為 closure null。
- `MePageOptions` 若需要型別欄配合，加回 `sessionStore?`（標同樣註解）；MePage 元件
  本體**不得**恢復消費它（資料仍走 provider hooks）。
- 不補測試：會紅的 oracle 需要 node-replacement 情境（見驗收紀錄「重要證偽」節），
  成本屬 3C-2 的 scope 遷移批，該批已排定補 Me 帳號切換測試。

## B3C1-FU-2：回報文件補正

`docs/arch-dispatch-2026-08-26-batch3C1-me-report-codex.md` §3 的「既有第二 fallback
仍取得相同 user id」聲稱不實（mount-once 時序），改寫為如實描述：本補件恢復
`sessionStore` 欄的原因與 3C-2 根治計畫；並補記「`account-settings:141-146` 在 HEAD
即不咬 bridge sync」的證偽事實（引驗收紀錄）。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

| 檢查 | 指令 | 通過標準 |
| --- | --- | --- |
| 型別 | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Mock | `npm run test:mock` | 全綠（≥286 passed；存量 flake 已立案不算紅） |
| 空白 | `git diff --check` | 無輸出 |

（一行 production 變更；build／bundle／test:local 沿用 3C-1 已驗數字。）

## 回報合約

寫 `docs/arch-dispatch-2026-08-26-batch3C1-followup-report-codex.md`（不 commit、不 push），
含：FU-1 diff 與註解原文、FU-2 修正段原文、收尾矩陣逐字輸出、未做／疑義／BLOCKED。
