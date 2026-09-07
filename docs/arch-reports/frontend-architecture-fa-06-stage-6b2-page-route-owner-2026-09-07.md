# FA-06 Stage 6B.2：page-route owner

日期：2026-09-07

## 結果

四個主頁面的 page/hash/private owner/history/focus 規則已集中到零 runtime dependency 的
`pageRouteOwner.ts`。Messages 的 deep link、底部導覽點擊、Back／Forward 與標題焦點都走同一個
`navigate()` command。

`main.js` 已刪除 Messages 專屬的 route 函式與分支；只保留注入 owner 的 DOM、History、focus 薄介面，以及
My Sessions／Me 真正需要的進頁副作用。

## 實際變更

- 新增 `src/features/navigation/pageRouteOwner.ts`，單一保存：
  - 四頁 hash、root element、tab id 與 heading focus selector。
  - active page。
  - push／replace／none history 規則與 `pageOwnerIdentity`。
  - 登出離開私人頁、換帳號離開舊 owner 頁的規則。
  - Messages／My Sessions／Me 進頁前收合 drawer 的規則。
- `main.js` 刪除 `PAGE_ROUTES`、`pageFromHash()`、`setActivePage()`、`showMapPage()`、
  `showMePage()`、`showMessagesPage()` 與本地 `reconcilePageRouteOwner()`。
- bottom navigation 不再判斷 `messages-tab`；先由 owner 將 tab id 轉成 page，再送進同一 command。
- `main.js` 不再保存 `activePage`，Bottom Navigation 與 Profile orchestration 都讀 owner。
- DOM mutation ledger 與 browser-port manifest 已換成實際的新薄介面 owner。
- `showMySessionsPage()` 只留下 create／join 卡片 focus target 的 page-view 狀態；真正切頁仍交給 route owner。

## 行為確認

- `#tab-messages` 與其他三頁 hash 可直接開啟，reload 後仍停在同頁。
- Messages → Me → browser Back 會回 Messages，Back／Forward 不新增 history。
- bottom-nav click 會寫入目前帳號的 owner identity。
- 換帳號時，舊 owner 的 page history 會 replace 回 map。
- 登出時，Messages／My Sessions 會回 map；公開的 Me 頁保留既有行為。
- Messages heading focus selector 只存在 route owner，`main.js` 不再知道該 selector。
- owner 檔沒有 import；所有 browser API 都由 `main.js` 的具名薄介面注入。
- source gate 與三個 negative canary 會阻止 Messages 專屬 main route／tab branch／heading focus 回來。

## 驗證證據

```text
npm run test:mock
  Node: 659 passed / 5 skipped / 0 failed
  Chromium desktop + mobile: 348 passed / 4 skipped / 0 failed

targeted page-route / profile / architecture Node
  19 passed / 0 failed

targeted navigation + focus desktop/mobile Chromium
  32 passed / 0 failed

npm run lint -- --no-warn-ignored
npm run prettier:check
git diff --check
  passed

npm run build
  529 modules transformed

npm run check:production-bundle
  structural checks passed
  byte limits remain report-only during development
```

本批 bundle：

| 範圍 | raw | gzip | Brotli |
| --- | ---: | ---: | ---: |
| main | 650,481 | 191,883 | 160,168 |
| Messages chunk | 2,154 | 1,044 | 884 |
| Chat chunk | 5,280 | 2,080 | 1,757 |
| total JS | 853,574 | 262,224 | 221,337 |

相較 6B.1，total JS 為 raw +197、gzip +256、Brotli +125 bytes。總量 raw／gzip 超出開發期參考值
3,613／3,162 bytes；main raw／gzip 仍在各自門檻內。依既定決策只報告、不阻擋開發。

## 範圍界線

- 沒有新增 Router 或其他 runtime dependency。
- 沒有改 UI、Chat feed、data API、RLS、RPC、migration、Hosted、secret、deploy 或 production runtime 開關。
- 本步不宣告整個 6B 完成。Stage 6 preflight 明列 `SessionChatSheet` imperative adapter 要留到 6B wiring
  處理，原始 final candidate 也要求移除此 slice 的 controller → surface 實作選擇；下一步先只讀重驗該邊界，
  不能把 route owner 完成誤寫成整片完成。

## 下一步

執行 6B.3 唯讀邊界重驗：列出 Chat surface adapter 的實際 caller、mount／unmount、mutation、focus、lazy 與
controller contract，確認可同批退役的最小 wiring；證據足夠後才改 runtime。
