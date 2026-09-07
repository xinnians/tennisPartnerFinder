# FA-06 Stage 6A：Chat feed owner 證據

日期：2026-09-07
實作基準：`fe64974`

## 白話結論

Chat 的「資料怎麼載入、多久更新、何時停止、哪一批回應可以落地」已搬到單一 feed owner。Chat controller 現在只
負責開啟聊天，以及發文、封鎖、檢舉、退出等操作協調，不再自己保存訊息、成員、已讀游標、request gate 或 poller。

畫面、route 與後端契約都沒有改。這次主要好處是：之後改 Chat 資料行為時，不必同時理解整個 session controller；
關閉聊天或切換帳號時，也有單一地方負責停止輪詢與拒絕晚到資料。

## 所有權變化

| 項目                           | 調整前                            | 調整後                                         |
| ------------------------------ | --------------------------------- | ---------------------------------------------- |
| Chat surface context           | 8 欄，含 5 組 feed/lifecycle 欄位 | 4 欄：auth snapshot、feed、session、sheet      |
| Chat controller                | 244 行                            | 193 行，只留 surface 與 mutation orchestration |
| feed query／cursor／gate／poll | 分散在 controller/context         | 137 行 `chatFeedFacade.ts` 單一 owner          |
| surface release                | 外部逐項 invalidate/stop/null     | 唯一呼叫 `feed.stop()`                         |
| 公開 Controller API            | `openSessionChat()`               | 不變                                           |

舊 controller 內的 `activeChat()`、`refreshActiveChat()`、`markActiveChatRead()`、`createRequestGate()`、
`createForegroundPoller()` 與五個舊 context 欄位已實際刪除，不是再包一層保留。

## 保留並加強的行為

- messages 與 roster 仍用 `Promise.all()` 並行載入，沒有新增 waterfall。
- loud refresh 顯示 loading；10 秒 interval 的 quiet refresh 不閃 loading；hidden tab 不輪詢，回到 visible 會 loud
  refresh。
- request generation、auth snapshot、surface identity 三層 stale guard 都有各自獨立測試；任一層失效，晚到資料都不
  落地。
- surface registry release 仍是唯一 cleanup 入口；`stop()` 會 invalidate request 並移除 poller／visibility listener。
- 同一個最新 message id 成功標已讀後不重打 RPC；失敗不前進 cursor，下一次 refresh 重試。
- 兩筆成功的 mark-read 若逆序完成，cursor 只會往較大的 message id 前進，不會倒退造成額外重送。
- 封鎖後的 blocked list 與 chat feed 仍並行 refresh；發文後仍 loud refresh；失去 accepted 權限仍關閉 Chat；final
  session 仍切 archived read-only。
- `ReportDialog` 沒有搬移；Push payload 沒有加入聊天正文。

## 防倒退測試

新增 `tests/chat-feed-facade.test.js`，共 9 個案例：

1. messages／roster 並行載入與 immutable ready snapshot。
2. 新請求勝出，quiet refresh 不發布 loading。
3. mark-read 失敗重試、成功去重、新訊息再前進。
4. 兩筆 mark-read 逆序完成時 cursor 單調遞增。
5. `stop()` 單獨使 pending response 失效。
6. auth snapshot 單獨使 pending response 失效。
7. surface identity 單獨使 pending response 失效。
8. `start()` 冪等，`stop()` 移除 visibility listener。
9. ownership gate 阻擋舊 controller/context owner 回流，含 negative canary。

## 完整驗證

```text
targeted facade／controller／auth／sequence／architecture：143 passed / 0 failed
完整 Node session-unit：655 passed / 5 skipped / 0 failed
mock desktop＋mobile Chromium：348 passed / 4 skipped / 0 failed
production preview Chromium＋WebKit：5 passed / 0 failed
local API：4 passed / 0 failed
local desktop Chromium：44 passed / 11 skipped / 0 failed
local mobile Chromium：6 passed / 0 failed
production build：527 modules
bundle structural gate：passed
```

第一次 local desktop 完整執行時，Me 頁測試等待 `update_my_presence` response 90 秒後逾時，該次 36 passed、
11 skipped、1 failed、7 未執行。相同案例單獨重跑為 1/1 passed，隨後完整 local API 與 desktop 重跑為
4/4、44/44 passed。現有證據只支持「一次無法重現的 timeout」；沒有證據可判定原因，因此不做歸因。

完整 mobile WebKit mock 維持 164 passed／3 skipped／9 failed。九個失敗仍是 Stage 6.0 已記錄的同九項 focus
assertion，元素存在但收到 `inactive`；Chat 案例通過。本批沒有修改這九項所在的 focus owner。依現有證據仍列為
未解的 WebKit focus 相容性風險，不猜原因。

## Bundle

| 範圍            |     raw |    gzip |  Brotli |
| --------------- | ------: | ------: | ------: |
| main            | 650,916 | 191,738 | 160,027 |
| Chat lazy chunk |   5,280 |   2,080 |   1,750 |
| Messages chunk  |   1,719 |     874 |     734 |
| total JS        | 853,571 | 261,909 | 221,057 |

相較 Stage 6.0，main 與 total 都增加 208／86／88 bytes（raw／gzip／Brotli）。現行開發期參考值的 total raw／gzip
超額為 3,610／2,847 bytes；依 D8 只報告、不阻擋，沒有調高任何門檻。release enforce 仍維持 hard fail。

## 明確未做

- 沒有改 UI、Messages route、App services bridge、data API、RLS、RPC、migration、Hosted、secret、deploy 或
  production 設定。
- 沒有加入 Query library、Router 或新 runtime dependency。
- 沒有把 report dialog 或 Push payload 擴進本批。

## 下一步

進入 FA-06 Stage 6B：先讓 Messages 使用只含 `mySessions` 與 `courts` 的專用 selector，再建立 Messages page-route
owner，集中 deep link、click、back/forward 與 heading focus；同批刪除 `main.js` 特例與 App services bridge，沒有舊
bridge 實際退役就不算完成。
