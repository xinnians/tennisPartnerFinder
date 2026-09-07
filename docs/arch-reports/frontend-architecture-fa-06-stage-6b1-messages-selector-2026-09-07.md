# FA-06 Stage 6B.1：Messages 專用資料邊界

日期：2026-09-07

## 結果

Messages 已不再借用 My Sessions 的完整分組，也不再透過 `AppServicesProvider` 的 Messages 專用 hooks 取得資料與操作。
畫面現在只訂閱自己真正使用的 `mySessions` 與 `courts`，並由 `App.tsx` 直接傳入 `sessionStore` 與
`openSessionChat`。

這是 Stage 6B 的第一個可獨立回復步驟；page-route owner 與 `main.js` 路由特例退役留在 6B.2。

## 實際變更

- 新增 `src/features/messages/messagesFeature.ts`：
  - `messagesFromSessions()` 直接從 `mySessions` 過濾可顯示的聊天球局。
  - `selectMessagesSessions()` 只讀 `mySessions`。
  - `selectMessagesCourts()` 只讀 `courts`。
- `MessagesPage` 改為直接接收 `sessionStore` 與 `onOpenChat`，不再 import App Context hooks。
- 刪除 `AppServicesProvider` 的 `MessagesServices`、`MessagesActions`、`useMessagesState()` 與
  `useMessagesActions()`。
- 刪除已被取代的 `sessionPresentation.messagesFromGroups()`。
- 更新 Messages 測試 harness，不再為 Messages 建立 App services bridge。

## 行為確認

- accepted 的 host／guest 仍顯示。
- cancelled／expired 仍排除；played 歷史局仍保留。
- 列表仍依 `startAt` 由早到晚排序。
- unread 提示與點擊開啟聊天的外部行為不變。
- 改動 `mySessionRosters` 不會改變 Messages selector 結果。
- 新增 source gate 與三個 negative canary，阻止 App Context bridge 或 roster coupling 被放回來。

## 驗證證據

```text
npm run typecheck
  passed

npm run lint -- --no-warn-ignored
  passed

node --test tests/messages-page-dom.test.js tests/session-data-boundary.test.js tests/frontend-architecture-gates.test.js
  80 passed / 0 failed

TENNIS_TEST_HARNESS_MODE=mock npx playwright test \
  tests/navigation-shell-smoke.spec.js tests/react-page-focus.spec.js \
  --project=desktop-chromium
  16 passed / 0 failed

npm run build
  528 modules transformed

npm run check:production-bundle
  structural checks passed
  byte limits remain report-only during development
```

本批 bundle：

| 範圍 | raw | gzip | Brotli |
| --- | ---: | ---: | ---: |
| main | 650,284 | 191,609 | 160,037 |
| Messages chunk | 2,154 | 1,045 | 882 |
| total JS | 853,377 | 261,968 | 221,212 |

相較 Stage 6A，total JS 為 raw -194、gzip +59、Brotli +155 bytes。總量 raw／gzip 仍超出開發期參考值
3,416／2,906 bytes；依既定決策只報告、不阻擋開發。

## 範圍界線

- 沒有改 UI、route、Chat feed、data API、RLS、RPC、migration、Hosted、secret、deploy 或 production runtime
  開關。
- 尚未宣告 Stage 6B 完成；必須完成 6B.2 route owner、刪除 `main.js` 被取代特例並做完整回歸才算完成。

## 下一步

執行 Stage 6B.2：建立零依賴 page-route owner，讓 deep link、bottom-nav click、back／forward 與 heading focus
走同一個 route command，再刪除 `main.js` 的 Messages 特例。
