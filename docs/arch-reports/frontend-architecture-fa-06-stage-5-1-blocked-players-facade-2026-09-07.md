# FA-06 Stage 5.1：blockedPlayers 狀態拆分證據

日期：2026-09-07

## 白話結論

封鎖名單已從共用的 session store 搬到自己的小型 facade。現在「我的球局」不再持有這份資料；「我」頁會直接訂閱
facade。帳號切換時會先清掉舊帳號的名單，再公開新帳號身分，因此畫面不會短暫把 A 帳號的封鎖名單配到 B 帳號。

這一批只重整前端狀態所有權，沒有改畫面、route、資料 API、RLS、RPC、migration、Hosted、secret 或部署設定。

## 實作範圍

- 新增 `src/features/blocked-players/blockedPlayersFacade.ts`，提供 `load()`、`refresh()`、
  `clearForAccountChange()`、`getSnapshot()`、`subscribe()`。
- facade 私有持有 request gate；每次發布都一次換掉完整且 frozen 的三欄 snapshot：
  `blockedPlayers`、`blockedPlayersError`、`blockedPlayersStatus`。
- `SessionControllerState` 從 27 欄降為 24 欄；My Sessions selector／controller 不再讀寫 blocked 三欄。
- 三個 production refresh 入口維持不變：開啟「我」頁、封鎖聊天對象後、解除封鎖後。
- 解除封鎖前的同步 membership 守衛改讀 facade 最新 snapshot。
- Auth identity boundary 先呼叫 `clearForAccountChange()`，再發布新 auth identity；原本五欄 reset 拆為 facade
  三欄與 My Sessions 兩欄，沒有雙寫。
- `useMeState()` 同時訂閱 session store 的六欄與 facade 的三欄，對 Me Page 仍提供相同九欄契約。
- `test:session-unit` 正式收錄新的 facade 測試，並新增 architecture gate 與 negative canary。

## 四項競態不變量

| 不變量                  | 已確認行為                                                           |
| ----------------------- | -------------------------------------------------------------------- |
| account invalidation    | 帳號邊界同步清空 snapshot 並使舊 request generation 失效             |
| request generation      | 同帳號較晚 refresh 勝出；較早 response 不可覆寫                      |
| auth snapshot           | 即使 request gate 尚未失效，過期 identity／epoch response 仍不可落地 |
| observable-state 原子性 | 訂閱者只看到完整三欄 snapshot，不會看到半套 loading／rows／error     |

## 測試證據

```text
blockedPlayers targeted：27 passed
完整 Node session-unit：645 passed / 5 skipped / 0 failed
mock Chromium：348 passed / 4 skipped / 0 failed
production preview Chromium + WebKit：5 passed / 0 failed
local API：4 passed / 0 failed
local desktop Chromium：44 passed / 11 skipped / 0 failed
local mobile Chromium：6 passed / 0 failed
production build：526 modules
bundle structural gate：passed
```

完整 mobile WebKit mock 另以單一 worker 重跑：165 passed／3 skipped／8 failed。八個失敗都在既有跨功能的
focus assertion；元素存在，但 WebKit 回報 inactive，分散於 presence、notification、location、filter、drawer 與 page
focus。這次新增的帳號切換封鎖名單案例通過。依現行 CI 政策，WebKit mock 是非阻擋檢查；目前證據只能把它列為
WebKit focus 相容性風險，不能推定為本批回歸，也不猜測根因。

## Bundle

| 範圍     |     raw |    gzip |  Brotli |
| -------- | ------: | ------: | ------: |
| main     | 650,482 | 191,518 | 159,993 |
| total JS | 853,137 | 261,685 | 220,992 |

相較 Stage 4.6，main 增加 509／177／301 bytes，total 增加 509／179／258 bytes。現行開發期參考值的 total
raw／gzip 超額是 3,176／2,623 bytes；依 D8 只報告、不阻擋，沒有調高任何門檻。release enforce 仍會失敗，正式
release candidate 前仍須依 D9 用正式 hosting、裝置、網路與 Web Vitals 重訂基線。

## 下一步

先做 FA-06 Stage 6 的唯讀 preflight：逐格重驗 Chat／Messages 的所有權與依賴，並確認 unread command 的原地變異
如何改成 My Sessions owner command。未完成盤點前，不先假設 Stage 6A 應採哪種結構。
