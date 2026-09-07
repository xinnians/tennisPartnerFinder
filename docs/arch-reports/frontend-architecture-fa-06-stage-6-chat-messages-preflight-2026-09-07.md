# FA-06 Stage 6：Chat／Messages 唯讀盤點

日期：2026-09-07
盤點基準：`9297c33`

## 白話結論

Chat／Messages 仍適合作為下一個完整功能切片，但不能直接照舊報告的數字開工。

真正要拆的是三件事：Chat 現在直接修改 My Sessions 的未讀資料、Chat 的 server state 塞在 surface context、Messages
route 的規則分散在 `main.js` 與 React App。安全順序是：先移除未讀原地修改，再建立 Chat feed 單一 owner，最後才收斂
Messages route。三批都不需要新套件或 migration。

## 已重驗的目前數字

| 維度                                            | 目前事實                                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `SessionControllerOptions` 的 `open*` callbacks | 12 個；Chat 使用 `openChat` 1 個                                                         |
| surface registry                                | 11 個 entry；Chat 使用 1 個                                                              |
| `SURFACE_TRANSITIONS`                           | 15 個 transition key；Chat 出現在 `authIdentityChanged`、`openChat` 2 個                 |
| 共用 session store                              | 24 個初始欄位；Chat feed 本身 0 欄，但未讀權威投影在 `mySessions[].unreadMessageCount`   |
| Chat surface context                            | 8 欄：auth snapshot、read cursor、messages、poller、request gate、roster、session、sheet |
| `ChatControllerDependencies`                    | 15 個注入項目，其中 data API 5 個                                                        |
| Node controller chat 呼叫                       | `tests/session-controller.test.js` 直接呼叫 `controller.openSessionChat()` 7 次          |
| Browser surface chat 呼叫                       | 3 支 spec 直接呼叫 `openSessionChatSheet()` 共 5 次                                      |
| `SessionChatSheet` chunk                        | 5,280 raw／2,081 gzip／1,751 Brotli；距 18,000／5,500 門檻 12,720／3,419                 |
| `MessagesPage` chunk                            | 1,719 raw／872 gzip／733 Brotli；距 18,000／5,500 門檻 16,281／4,628                     |

舊文件的 `5/86` 是當時對 facade 測試用語的人工歸類，現在 facade 已退役，不能再當目前呼叫點數。舊表的
`0/27 store 欄位` 也只能描述 Chat feed，不能描述整個 Chat＋Messages：Messages 目前讀 `courts` 與 My Sessions groups；
該 groups selector 又會把 `mySessions` 與 `mySessionRosters` 合成新物件，即使 Messages UI 根本不使用 roster。

## 現在的資料流

```text
loadMySessions RPC
  → session store.mySessions[].unreadMessageCount
  → My Sessions groups
  → Messages rows + bottom-nav unread dot

openSessionChat
  → surfaceRegistry 的 chat context
  → messages + roster 並行讀取
  → imperative SessionChatSheet.setState
  → markSessionChatRead RPC
  → 目前直接修改 context.session.unreadMessageCount = 0
  → notify My Sessions / Messages / bottom nav
```

`context.session` 是 `mySessions` 陣列中的同一個物件，所以目前的歸零會繞過 `store.setState()`，直接修改共用物件。這是
Stage 6 開工前必須先消除的鉸鏈。

## Chat 生命週期不變量

| 行為                  | 已確認的現況                                                                    | 搬移時不可少                     |
| --------------------- | ------------------------------------------------------------------------------- | -------------------------------- |
| 初次開啟              | accepted membership 檢查後建立新 context，立即 loud refresh                     | 先 loading，保留既有 rows        |
| 同一 context 多次讀取 | `requestGate.issue()` 讓較新的 refresh 使較舊 response 失效                     | request generation               |
| 帳號／gate 變更       | `authSnapshot` epoch＋identity 比對                                             | auth snapshot guard              |
| 同 session 重開       | `surfaceRegistry.is("chat", context)` 用物件 identity 擋舊 context              | surface identity guard           |
| 前景輪詢              | interval 為 quiet refresh，不閃 loading；hidden 不打；visible 觸發 loud refresh | quiet／loud 差異與 visibility    |
| 關閉／換聊天          | registry release 先 invalidate request，再停 poller                             | late response 不落地、timer 歸零 |
| 已讀游標              | 同一個最新 message id 成功後不重打；失敗不前進 cursor，下一次 refresh 重試      | `lastMarkedMessageId`            |
| 權限變更              | participation refresh 失去 accepted 就關閉；仍有權限則換最新 session            | authority reconciliation         |
| 已結束球局            | cancelled／expired／played 轉 archived read-only                                | `setArchived()`                  |
| 帳號切換              | `authIdentityChanged` transition 關 chat，release 同時停 request／poller        | 前一帳號資料不可見               |

## 明確排除項目

- `ReportDialog` 不搬。Chat 訊息檢舉、球局檢舉與 roster 參與者檢舉都共用 `openReportForTarget()` 與同一個
  `reportDialog` registry entry，硬切會擴大本批邊界。
- 不改 Push payload。現行 chat notification 寫入固定文案「群組有新訊息」，dispatcher allowlist 只有
  `court/message/slots_remaining/start_at/url`；訊息正文沒有進 notification payload。
- 不改 route、data API、RLS、RPC、migration、Hosted、secret 或部署設定。

## 建議的實作批次

### Stage 6.0：unread command

- 在 My Sessions owner 新增 `clearMySessionUnread(sessionId)`。
- 只 clone `mySessions` 陣列與命中的 session；不原地改舊物件，不變動 roster version。
- Chat 改注入這個 command，刪除 `notifyMySessions` 依賴與 `context.session.unreadMessageCount = 0`。
- 維持「非零才 emit」、RPC 失敗仍樂觀顯示 0、下一次 authoritative participation reload 可訂正。
- 新 gate 必須讓舊原地 mutation 回來時測試翻紅。

### Stage 6A：Chat feed owner

- 建立一個 Chat feed facade，實際接管 messages、roster、last-marked cursor、request gate 與 poller。
- `chatController` 保留開啟、發文、封鎖、檢舉與撤回的 orchestration；舊的 refresh／cursor／poller邏輯要同批從
  controller 刪除，避免只多包一層。
- registry 仍保存 active context identity，release 仍是唯一停止點；三層 stale guard 不合併。
- 不改 route；`SessionChatSheet` 的 imperative adapter 暫時保留到 6B wiring 一起處理。

### Stage 6B：Messages route owner＋bridge 退役

- 先讓 Messages 使用專用 selector，只取 `mySessions` 與 `courts`；不再借完整 My Sessions groups／roster。
- 建立零依賴 page-route owner，集中 page/hash/private-owner/history/focus 規則；不新增 Router 套件。
- `#tab-messages` deep link、bottom-nav click、back／forward 與 heading focus 只能走同一個 route command。
- 刪除 `main.js` 中被取代的 Messages 特例與 App services bridge；沒有舊 bridge 實際退役就不算完成。

## 本批基線

```text
targeted Node：191 passed / 0 failed
targeted desktop + mobile Chromium：121 passed / 1 skipped / 0 failed
Stage 5.1 完整 local DB/browser 證據：API 4/4、desktop 44/11 skipped、mobile 6/6
git diff：本批只允許文件
```

## 下一步

直接實作 Stage 6.0。它不改資料契約、沒有 migration，也沒有產品選項需要確認。
