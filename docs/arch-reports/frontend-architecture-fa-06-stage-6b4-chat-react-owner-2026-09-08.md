# FA-06 Stage 6B.4：Chat React 單一 UI owner

日期：2026-09-08
實作基準：`6c2f24b`

## 白話結論

Chat 畫面不再同時由 React 與舊 JavaScript 分頭改畫面。Chat feed 現在發布一份可訂閱、不可變的完整狀態；React
直接讀取這份狀態，統一管理載入、錯誤、訊息、名單、封存、操作事件、提示與捲動。

舊的 `sheet.setState()`、Chat `sheet.setArchived()`、DOM 查詢與原生事件 listener 已實際刪除。共用 sheet 的
Escape、focus trap、focus restore、lazy chunk 與 content-before-shell unmount 仍保留。

這一批沒有 migration、Hosted、secret、request、deploy 或 production runtime control 變更。

## 實際變更

- `ControllerChatFeedSnapshot` 加入 `status`、`errorMessage`、`archived` 與單調遞增的 `revision`。
- feed 新增 `subscribe()` 與可重複安全呼叫的 `archive()`；每次發布都產生新的 frozen snapshot，messages／roster
  陣列也維持 frozen。
- `SessionChatSheet` 以 `useSyncExternalStore` 直接訂閱 feed；送出、檢舉、封鎖、取消參加都改成 React event。
- 發文成功才清空輸入；發文 pending、失敗 focus、讀取錯誤與封存唯讀由 React state/ref 管理。
- 初次或原本接近底部時才自動捲到底；使用者回看舊訊息時保留位置；新訊息提示仍只計算新增 ID。
- `sessionSurfaceViews.js` 只保留組合與 mount，不再查找 Chat DOM，也不再回傳 Chat state commands。
- feed 建立時就帶入初始封存狀態；參與狀態更新或 server 回 `SESSION_ARCHIVED` 時，改發布 feed 狀態。

## 退役證據

| 項目 | 之前 | 現在 |
| --- | ---: | ---: |
| imperative React surface adapters | 8 | 7 |
| DOM mutation ledger symbols | 34 | 31 |
| DOM mutation ledger nodes | 125 | 110 |
| DOM mutation references | 112 | 100 |
| `sessionSurfaceViews.js` Chat DOM query／native listener | 有 | 0 |
| controller → Chat `setState/setArchived` | 有 | 0 |

原本 5 個 Chat legacy mutation entries 已刪除。React 為實現既有行為，保留 2 個明確登記的新 owner：成功發文後清空
自己的 input，以及在需要時調整自己的 feed `scrollTop`；這兩筆不是跨 owner 操作。

新 source gate 會檢查 controller state command、Chat imperative handle、view DOM query、native listener 與 view state
command；每一類都有 add-red／restore-green canary，不能只靠文字清單宣告退役。

## 已驗證行為

- messages／roster 並行讀取、loud／quiet refresh、foreground polling 與 stop 保持不變。
- request generation、Auth snapshot、active surface identity 三層 stale guard 保持不變。
- mark-read 失敗重試、成功去重與 cursor 單調前進通過測試。
- archived 唯讀、發文、檢舉、封鎖、取消參加、XSS escaping、Escape、focus 與 44px 觸控目標通過瀏覽器測試。
- desktop／mobile Chromium 都驗證，沒有只用單一 viewport 推論。

## 驗證結果

```text
typecheck：pass
lint：pass
Prettier：pass
targeted Node：145 passed / 0 failed
完整 Node：661 passed / 5 skipped / 0 failed（666 tests）
selected desktop + mobile Chromium：127 passed / 1 skipped / 0 failed（128 tests）
production build：pass
bundle structural checks：pass
git diff --check：pass
```

本次 production bundle：

```text
main JS raw/gzip/brotli：648,491 / 191,196 / 159,611 bytes
total JS raw/gzip/brotli：852,930 / 262,198 / 221,296 bytes
SessionChatSheet raw/gzip：6,630 / 2,740 bytes
```

開發期 total raw／gzip 分別比目前 report 基準多 2,969／3,136 bytes；依已核可 D8 只報告、不阻擋開發。
main 與最大 app lazy chunk 均在各自門檻內，結構 gate 全數通過。

## 尚未完成

6B.4 只收斂 Chat 的 UI state ownership。controller 目前仍透過注入的 `openChat` callback 選擇 concrete Chat surface；
這個邊界會在 6B.5 移到 app wiring，並刪除 `SessionControllerOptions.openChat`、
`ChatControllerDependencies.openChat` 與 `main.js` 的 concrete mapping。完成 6B.5 後才能宣告 Stage 6B 與第一個
vertical slice 完成。
