# FA-06 stage 5：blockedPlayers facade 唯讀盤點

日期：2026-09-07

## 結論

`blockedPlayers` 可以用零新依賴的小型 facade 從共用 `SessionControllerState` 拆出，且不必改頁面行為、route、
data API、RLS、RPC 或資料庫。

最小原子批次會把「資料、載入狀態、錯誤、請求世代」交給同一個 facade；My Sessions controller 只保留解除
封鎖 command，React 的「我」頁直接訂閱 facade。這樣不會為了三個欄位引入 Query library，也不會留下雙寫狀態。

本批只做唯讀盤點與固定實作範圍，沒有改 runtime、UI、測試行為、migration 或 Hosted 設定。

## 已確認的目前結構

### 三個 refresh 入口

排除函式定義後，production 恰有三個 `refreshMyPlayerBlocks()` 呼叫：

1. `main.js:467`：開啟「我」頁時重新載入。
2. `chatController.ts:177`：封鎖聊天訊息發送者後，與聊天內容一起重新載入。
3. `mySessionsController.ts:234`：解除封鎖後重新載入，成功才顯示完成訊息。

沒有第四個 runtime caller；`session-controller-sequence.test.js` 另有一個測試呼叫，不計入 production 三入口。

### 目前狀態與寫入點

- `SessionControllerState` 目前有 27 欄，其中 `blockedPlayers`、`blockedPlayersError`、
  `blockedPlayersStatus` 三欄在 `sessionController.ts:203-205` 初始化。
- `mySessionsController.ts:195-216` 同時擁有 block list 的 request、loading／ready／error 三種寫入與通知。
- `mySessionsController.ts:228` 在解除封鎖前同步讀取 `blockedPlayers`，避免對已過期的清單送 mutation。
- `authController.ts:156-163` 先使 `blockedPlayerGate` 失效，再用一筆五欄 `setState` 同時清空 blocked 三欄與
  My Sessions 兩欄。
- `selectControllerMySessionsView()` 把 blocked 三欄混進 My Sessions view；`selectMeState()` 再從該 view 取回，
  造成「我」頁資料繞經不相關的 My Sessions owner。
- `me-page-dom.test.js:160-182` 明確鎖定 `useMeState()` 與 `selectMeState()` 是同一份九欄切片。

### 四項競態防護

現況的四項必要行為都能原樣保留：

| 不變量                  | 現況                                             | facade 後固定做法                                                |
| ----------------------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| account invalidation    | auth identity boundary 清空三欄                  | `clearForAccountChange()` 同步換成空 snapshot                    |
| request generation      | `blockedPlayerGate.invalidate()` 使舊 request 失效 | gate 由 facade 私有持有，clear 時仍必須 invalidate                |
| auth snapshot           | request 前後檢查 `authEpoch`＋identity           | facade 的 `load()`／`refresh()` 繼續使用同一組 capture／current  |
| observable-state atomicity | 三欄在一次 `setState` 中一起發布               | facade 每次換整個 immutable snapshot，再一次通知所有訂閱者       |

gate 世代與 auth snapshot 是兩道分開的防線：前者處理同帳號多次 refresh 的先後，後者處理登入身分改變；實作時兩者都不刪。

## 下一批固定範圍

`FA-06 stage 5.1` 只做以下工作：

1. 新增零依賴 blockedPlayers facade，公開 `load()`、`refresh()`、`clearForAccountChange()`、
   `getSnapshot()`、`subscribe()`。
2. facade 私有持有 request gate；每個可觀察更新都以完整 snapshot 原子發布。
3. 三個既有 refresh 入口改接 facade；既有成功／失敗回傳與使用者訊息不變。
4. `SessionControllerState` 移除 blocked 三欄；My Sessions selector、controller 與 auth controller 不再讀寫它們。
5. 解除封鎖的同步守衛改讀 facade snapshot；auth identity boundary 改呼叫 `clearForAccountChange()`，My Sessions
   的兩欄 reset 仍留在原本 `setState`。
6. `useMeState()` 合併 session store 的六欄 base state與 facade 的三欄 snapshot；MePage 仍收到原本九個欄位。
7. 新增 facade 單元測試與架構 gate，明確驗證 account switch、同帳號 refresh 競態、auth snapshot 與三欄原子通知。
8. 同步更新 Node／browser harness fixture，跑 targeted、完整 frontend CI、production preview 與 bundle 比較。

如果實作需要雙寫、額外 dependency、改 API／RLS／RPC 或把 Chat／Messages stage 6 混進來，就停止該方向，不擴大本批。

## 基線驗證

```text
rg production caller：3 個 refresh call expressions
targeted Node：137 passed／0 failed
git status：clean
```

Targeted Node 包含 controller、auth、sequence、Me Page 與 frontend architecture gates。
