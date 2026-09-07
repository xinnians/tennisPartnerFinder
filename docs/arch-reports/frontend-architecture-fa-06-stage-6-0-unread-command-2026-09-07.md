# FA-06 Stage 6.0：未讀歸零 command 證據

日期：2026-09-07

## 白話結論

Chat 不再直接改動「我的球局」裡的未讀數字。現在它只向 My Sessions owner 發出「把這個球局設為已讀」的
command；owner 會建立新的陣列與單筆球局物件，再通知 Messages、My Sessions 與底部導覽更新。

這樣可避免共用物件被偷偷原地修改，也替下一批拆出 Chat feed owner 清掉一個跨功能耦合。本批沒有改 UI、route、
資料 API、RLS、RPC、migration、Hosted、secret、deploy 或 production 設定。

## 實作範圍

- `MySessionsController` 新增私有 wiring 用的 `clearMySessionUnread(sessionId)` command，沒有擴大公開
  `ControllerApi`。
- command 找不到球局或未讀已是 0 時不發布；需要歸零時只複製 `mySessions` 陣列與命中的球局物件。
- command 不增加 `mySessionsVersion`，因為 roster／清單的 server authority 沒有改變。
- `chatController` 刪除 `notifyMySessions` 依賴與
  `context.session.unreadMessageCount = 0` 原地 mutation，改呼叫 owner command。
- mark-read 行為不變：畫面先樂觀歸零；RPC 成功才前進 `lastMarkedMessageId`，失敗則保留 cursor，下一次 refresh
  仍可重試。
- 新增 AST architecture gate 與 negative canary，日後任何 controller 重新直接賦值
  `unreadMessageCount` 都會翻紅。

## 不變量證據

| 不變量                   | 已驗證結果                                                     |
| ------------------------ | -------------------------------------------------------------- |
| 不原地修改 API row       | 原始 session 仍維持 unread 2；store 內命中項目是新的 object    |
| 精確發布                 | 2 → 0 發布一次；已為 0 的後續 mark-read 不重複發布             |
| RPC 失敗可重試           | 樂觀歸零不受影響，cursor 未前進，下一次 refresh 仍會呼叫 RPC   |
| My Sessions server owner | command 沒有增加 roster/list version，也沒有建立第二份 unread  |
| 架構防倒退               | 舊式直接 assignment 注入後 gate 精確找到 1 筆，還原後回到 0 筆 |

## 測試證據

```text
targeted controller／sequence／architecture：129 passed / 0 failed
完整 Node session-unit：646 passed / 5 skipped / 0 failed
mock desktop＋mobile Chromium：348 passed / 4 skipped / 0 failed
production preview Chromium＋WebKit：5 passed / 0 failed
local API：4 passed / 0 failed
local desktop Chromium：44 passed / 11 skipped / 0 failed
local mobile Chromium：6 passed / 0 failed
production build：526 modules
bundle structural gate：passed
```

完整 mobile WebKit mock 為 164 passed／3 skipped／9 failed；九個失敗都顯示被測元素存在，但 focus assertion
收到 `inactive`，分散在 Me 設定、location、filter、drawer、dialog 與 page focus。再以單一 worker 重跑同九項，結果
仍是九項相同型態失敗；Chat 案例通過。這批改動只涉及 unread command 與其測試，沒有修改上述頁面或共用 focus
程式。現有證據只能列為未解的 WebKit focus 相容性風險，不能證明原因，也不把它猜成本批回歸。

## Bundle

| 範圍     |     raw |    gzip |  Brotli |
| -------- | ------: | ------: | ------: |
| main     | 650,708 | 191,652 | 159,939 |
| total JS | 853,363 | 261,848 | 220,969 |

相較 Stage 5.1，main 增加 226／134 bytes、Brotli 減少 54 bytes；total 增加 226／163 bytes、Brotli 減少
23 bytes。現行開發期參考值的 total raw／gzip 超額為 3,402／2,786 bytes；依 D8 只報告、不阻擋，沒有調高
任何門檻。release enforce 仍維持 hard fail，正式 release candidate 前依 D9 重訂基線。

## 下一步

進入 FA-06 Stage 6A：建立 Chat feed facade，接管 messages、roster、read cursor、request gate 與 poller；同批刪除
controller 內被取代的 refresh／cursor／poller owner，保留 registry identity、auth snapshot 與 request generation
三層競態防護。
