# FA-06 Stage 6B.3：Chat surface 邊界唯讀複核

日期：2026-09-08
盤點基準：`c073ce5`

## 白話結論

6B 的 route 與 Messages 資料邊界已經收斂，但 Chat 還不能算完成。現在 controller 會把 feed 狀態推進
`sheet.setState()`，封存時再呼叫 `sheet.setArchived()`；Chat 畫面則一半由 React 管、一半由舊 JavaScript 直接改 DOM。

這段可以退役，而且不需要新套件、migration 或產品選項。為降低一次改動的風險，分成兩個 runtime 小批：先讓 React
直接訂閱 Chat 狀態並拿回完整 UI ownership，再把「建立 Chat session」與「開哪一個 surface」分開。兩批都完成後才宣告
Stage 6B 與第一個 vertical slice 完成。

## 已確認的現況

| 邊界 | 實際狀況 |
| --- | --- |
| production concrete wiring | `main.js` 把 `openSessionChatSheet` 指定給 `SessionControllerOptions.openChat` |
| controller 呼叫 | `chatController.ts` 呼叫 `openChat()`，再以 `publish → sheet.setState()` 推送 feed 狀態 |
| archived 呼叫 | 發文收到 `SESSION_ARCHIVED` 時，controller 直接呼叫 `sheet.setArchived()` |
| Chat feed API | `getSnapshot/refresh/start/stop`；沒有 `subscribe()`，快照也不含 loading/error |
| React adapter | `SessionChatSheet.tsx` 是 8 個 imperative sheet adapters 之一，公開 `setContent/setArchived` |
| legacy DOM owner | `sessionSurfaceViews.js` 內有 5 個 Chat mutation ledger symbols：open、feed click、scroll、state、archived |
| lazy 邊界 | Chat 是 14 個 lazy sheets 之一；預載器與 chunk 邊界應保留，不是本次要刪的 bridge |
| mount/unmount | `surfaceLoaders.js` 載入 mount export；`sessionViewWiring.js` 登記 content unmount；關閉順序是 content → shell |
| Browser 測試直呼 | 3 支 spec 共 5 次直接呼叫 `openSessionChatSheet()`；另有函式本身的 lazy 重入呼叫 1 次 |
| production 相關檔 | `main.js`、`sessionController.ts`、`controller/chatController.ts` 三處共同形成 open callback 鏈 |

盤點方法包含 TypeScript AST call-expression 掃描、production import/reference 掃描、formal mutation ledger、surface manifest
與現有測試。不能把 AST 的 6 次 `openSessionChatSheet()` 全算成測試呼叫；其中 1 次是函式在 lazy 載入後重入自己。

## 現在為什麼仍是雙重 ownership

```text
chatFeedFacade
  → publish(state)
  → chatController
  → ControllerSurfaceHandle.setState(state)
  → sessionSurfaceViews 直接改 loading/error/announcement/scroll
  → SessionChatSheet.setContent() 再更新 React rows
```

同一張畫面裡，React 管 roster、messages、archived note 與按鈕是否存在；舊 adapter 管 loading、error、announcement、
composer submit、input 清空與 feed scroll。這正是既定架構原則要消除的雙重 ownership。

`mountSheet` 的 backdrop、Escape、focus trap、focus restore 與 content-before-shell unmount 是共用 surface 基礎設施，仍須保留；
它們不是 Chat legacy bridge。

## 6B.4：先退役 imperative state/DOM adapter

最小實作範圍：

- Chat feed 快照加入 `status/errorMessage`，並提供穩定 `subscribe()`；messages 與 roster 仍用同一筆 immutable snapshot 發布。
- `SessionChatSheet` 用 `useSyncExternalStore` 直接訂閱 feed，React 管 loading、load error、rows 與 aria-live announcement。
- composer submit、report、block、withdraw 改用 React event；pending、validation error、成功清空與 error focus 由元件 state/ref 管。
- feed 捲動改成 React effect/layout effect；保留初次或 near-bottom 才跟到底、回看歷史時保留位置的規則。
- archived 先改成 React 可訂閱狀態或明確 props/state command，不再透過 DOM/sheet setter。
- 刪除 `ControllerSurfaceHandle.setState`、deferred `setState/setArchived` queue、Chat 的 5 個 legacy mutation ledger entries與
  `SessionChatContentContract` imperative methods。
- lazy chunk、shared `mountSheet`、surface registry identity、feed request/auth/surface 三層 stale guard與 ReportDialog 都不改。

這一批完成標準不是把函式搬檔，而是 production source 中不再存在 `sheet.setState()`、Chat `sheet.setArchived()`、
`contentRef.current` 或 `sessionSurfaceViews.js` 的 Chat DOM mutations。

## 6B.5：再移除 controller → concrete surface 選擇

最小實作方向：

- controller 只建立受權限保護的 Chat session/model，持有 feed、操作與生命週期，不 import 或呼叫 concrete sheet。
- app/feature wiring 取得該 model 後才開 `SessionChatSheet`；Messages、My Sessions 與 detail CTA 共用同一個 app-level open
  command。
- account switch、失去 accepted authority、同 session 重開仍由 registry/model lifecycle 關閉；controller 不保存 concrete
  sheet handle。
- 刪除 `SessionControllerOptions.openChat`、`ChatControllerDependencies.openChat` 與 `main.js` 的
  `openChat: openSessionChatSheet`。
- 新 source gate 要能讓上述任一 callback wiring 或 concrete sheet reference 回流時翻紅。

不採「把 `openSessionChatSheet` 搬到 `features/chat/` 但保留相同 callback」；那只換檔名，沒有移除邊界。

## 不可退步的行為

- messages/roster 並行讀取；loud/quiet refresh、hidden/visible polling 不變。
- request generation、auth snapshot、active context identity 三層 stale guard各自保留。
- account switch 不顯示上一帳號資料，關閉/替換後 pending response 不落地且 timer 歸零。
- mark-read 失敗重試、成功去重、cursor 單調前進；immutable unread clear 仍通知 Messages/My Sessions/底部導覽。
- archived chat 唯讀；發文成功清空 input，失敗可重試；report/block 仍只接受目前可見訊息。
- 初次/近底部自動捲到底，閱讀歷史時保留位置；新訊息 announcement 仍只報新增數。
- lazy loading、關閉、Escape、focus trap/restore、aria-live、44px targets 與 XSS escaping 不退步。
- Push payload 不加入聊天正文；ReportDialog、data API、RLS/RPC、Hosted 與 production runtime 不進本批。

## 本批基線

```text
targeted Node：152 passed / 0 failed
production working tree：clean
migration：不需要
```

targeted Node 包含 feed、session controller、Messages DOM、route、architecture gate 與 surface lifecycle。6B.4 與 6B.5
各自先跑相關測試；兩批完成後再跑 final-v3 要求的完整 mock、local、preview、build、bundle 與 diff 驗證。

## 下一步

直接實作 6B.4。沒有需要使用者先確認的產品行為或外部操作。
