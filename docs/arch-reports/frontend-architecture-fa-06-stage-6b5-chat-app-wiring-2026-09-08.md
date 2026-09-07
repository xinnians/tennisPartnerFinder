# FA-06 Stage 6B.5：Chat app wiring 與第一個 vertical slice 完成

日期：2026-09-08
實作基準：`b09eec7`

## 白話結論

Chat controller 現在只負責確認權限、建立 Chat model 與管理資料生命週期，不再決定要開哪一張畫面。真正的
`SessionChatSheet` 改由 app wiring 開啟；Messages、我的球局與球局詳情三個入口共用同一個 app-level command。

原本 `main → sessionController → chatController → concrete sheet` 的 callback 鏈已拆除。帳號切換、失去 accepted
資格、重開 Chat、使用者關閉、畫面開啟失敗與 feed 啟動失敗都仍會關閉或釋放正確的 model，不會留下 polling。

Stage 6B 與既定的第一個 vertical slice 至此完成。本批沒有 migration、Hosted、secret、request、deploy 或
production runtime control 變更。

## 實際變更

- controller contract 以 `createSessionChat()` 回傳受權限保護的 Chat model，model 提供 feed、操作、開始、釋放與
  controller lifecycle close subscription。
- 新增 app-owned `createSessionChatOpener()`，負責把 model 接到 concrete Chat surface；先完成 close subscription，
  再啟動 feed，避免漏掉初始狀態。
- `main.js` 建立唯一且穩定的 `openSessionChat` app command，Messages、My Sessions 與 detail CTA 都走這個入口。
- detail 的 accepted-member primary action 由 app wiring 接手；intent controller 不再反向呼叫 Chat surface。
- Chat model 建立後若 surface 不存在或 mount 失敗，立即 release；feed 啟動失敗時會先關閉已 mount 的 surface，再
  release model。
- controller lifecycle 發出的 close reason／focus option 原樣傳給 app-owned surface；surface 關閉後解除訂閱並
  release model。

## 已刪除的舊邊界

以下 production 路徑已確認不存在：

- `SessionControllerOptions.openChat`
- `ChatControllerDependencies.openChat`
- chat controller 內的 `openChat()` concrete surface 呼叫
- `main.js` 的 `openChat: openSessionChatSheet` mapping
- `ControllerApi.openSessionChat`
- App provider 透過 `controller.openSessionChat` 開 Chat

新 source gate 對這六類各有一個 add-red／restore-green canary。它檢查實際 production source，不以文件文字代替
退役證據。

## 已驗證行為

- 同一個 app command 可從 Messages、My Sessions 與 detail CTA 開啟 Chat。
- accepted-member 權限檢查、account/auth snapshot 與 active model identity 保持在 controller。
- 同 session 重開、account switch 或失去參與資格時，舊 surface 收到正確 close options，feed 隨 release 停止。
- messages／roster、loud／quiet refresh、foreground polling、read cursor、archived 唯讀、post／report／block／withdraw
  行為保持不變。
- desktop、mobile、真實 local Supabase 與 production preview 都有執行，不以 mock 或單一 viewport 推論。

## 驗證結果

```text
courts seed check：pass
typecheck：pass
lint：pass
Prettier：pass
targeted Node：194 passed / 0 failed
完整 Node：666 passed / 5 skipped / 0 failed（671 tests）
完整 mock Chromium：348 passed / 4 skipped / 0 failed
selected desktop + mobile Chromium：117 passed / 1 skipped / 0 failed
local Supabase API：4 passed / 0 failed
local desktop Chromium：44 passed / 11 skipped / 0 failed
local mobile Chromium：6 passed / 0 failed
production preview Chromium：4 passed / 0 failed
mock mobile WebKit（non-blocking）：166 passed / 3 skipped / 7 failed
production build：pass
bundle structural checks：pass
git diff --check：pass
```

WebKit 的 7 個失敗都落在既有 account settings、discovery、map/bootstrap、performance、page focus 與 nearby drawer
focus 範圍；沒有 Chat 測試失敗。這條工作依既定政策為 non-blocking，本批沒有把它寫成通過。

本次 production bundle：

```text
main JS raw/gzip/brotli：649,121 / 191,413 / 159,896 bytes
total JS raw/gzip/brotli：853,560 / 262,410 / 221,605 bytes
SessionChatSheet raw/gzip：6,630 / 2,750 bytes
```

相較 6B.4，main raw／gzip／Brotli增加 630／217／285 bytes；total 增加 630／212／309 bytes。開發期 total
raw／gzip分別比目前 report 基準多 3,599／3,348 bytes；依已核可 D8 只報告、不阻擋開發。main 與最大 app lazy
chunk 仍在各自門檻內，結構 gate 全數通過。

## 後續

final-v3 明列的 Stage 4、5、6A、6B 已完成。下一批先做唯讀 completion audit：重新對照 final-v3、正式 gate 與
目前 production graph，列出仍未完成、需要產品確認或可安全繼續的項目，再決定下一個 vertical slice；不直接猜測
新架構工作。
