# FA-06 stage 4.2：共用 surface loader 拆分證據

日期：2026-09-07

## 結論

已把 `sessionViews.js` 裡負責延遲載入 React sheet／dialog 的共同底座搬到
`src/views/surfaceLoaders.js`。這次只改程式放置位置與明確 owner，沒有改畫面流程、資料契約、Push、migration、
Hosted 或 production 設定。

完整 Node、Chromium、WebKit、production build、bundle 結構 gate 與 production preview 都通過。沒有證據顯示
這次搬檔造成使用者可見行為改變。

## 實際變更

- 新增 `src/views/surfaceLoaders.js`，集中管理：
  - 14 個 sheet／dialog dynamic imports。
  - 14 個 mount binding 與對應 preloader。
  - frozen `lazySurfaceMounts` getter 集合。
  - loading shell HTML 與 `deferSurfaceOpen`。
- `sessionViews.js` 改為匯入這些 loader；原本的 loader map、mount binding、preloader、loading HTML 與
  `deferSurfaceOpen` 已刪除。
- 4 個 configure 呼叫、14 個 unmount registration、2 個 authenticated preload listener 與 app-module wiring
  仍留在 `sessionViews.js`，留待後續 stage 4.3／4.4；沒有一次搬太多責任。
- `SURFACE_MANIFEST.structureSources.lazySurfaceLoaders` 改指向新 owner。
- HTML renderer inventory 與 DOM mutation ledger 同步改指向新檔案。
- lifecycle gate 額外要求 loader owner 必須明確匯出 `deferSurfaceOpen`，避免只改 manifest 路徑卻漏搬核心函式。

## 結構核對

搬檔後重新掃描的實際結果：

| 契約                                 |                            結果 |
| ------------------------------------ | ------------------------------: |
| dynamic imports                      |                              14 |
| mount bindings／preloaders           |                          14／14 |
| unmount registrations                | 14，仍由 `sessionViews.js` 擁有 |
| 頂層 configure calls                 |  4，仍由 `sessionViews.js` 擁有 |
| authenticated preload listeners      |  2，仍由 `sessionViews.js` 擁有 |
| `sessionViews` browser harness calls |           87，分布於 12 支 spec |

正式 DOM mutation AST 基線變成 18 files／125 nodes／34 symbols／112 references。只有 owner file 數由 17 增為
18；node、symbol 與 reference 數都沒有改變。這組數字來自 gate 的實際掃描結果，再據此更新 manifest，沒有預填猜測。

## 行為與競態驗證

延遲載入最容易出錯的是「載入完成前先關閉」或「新 surface 取代舊 surface」。本批沿用既有測試驗證：

- 關閉或取代時，每個 React portal 只 unmount 一次。
- 已卸載 detail 不會被較晚完成的 Promise 重新畫回來。
- loading shell 可被 Escape 關閉，載入完成後也不會晚掛載。
- loading 期間排隊的指令只會重播到 replacement 一次。
- replacement 不誤觸發 `onClose`，真正關閉仍只觸發一次。
- session card／map pin 的 intent preload 仍不會直接開啟 detail。

上述 Playwright targeted 回歸為 14 passed／0 failed。

## 完整驗證

```text
targeted Node：151 passed／0 failed
targeted lazy lifecycle Playwright：14 passed／0 failed
session unit aggregate：638 passed／5 skipped／0 failed
mock Chromium aggregate：348 passed／4 skipped／0 failed
production preview：5 passed／0 failed
vite production build：525 modules transformed
production bundle structural checks：passed
git diff --check：passed
```

Production preview 實際覆蓋：

- anonymous desktop 不載入 private chunk。
- authenticated desktop 會透過同一 probe 載入 private chunk。
- OAuth PKCE callback 能回到 production app 並驗證本機 session。
- 390px 慢速網路 Chromium 與 WebKit 的 shell 都可使用。

## Bundle 影響

本批 development production build 與 stage 4.1 基線比較：

| 範圍     | stage 4.1 raw／gzip／Brotli | stage 4.2 raw／gzip／Brotli |             差異 |
| -------- | --------------------------: | --------------------------: | ---------------: |
| main     |   650,113／191,175／159,810 |   650,799／191,358／159,879 |  +686／+183／+69 |
| total JS |   852,737／261,314／220,788 |   853,454／261,564／220,922 | +717／+250／+134 |

- main 仍低於既有 raw／gzip 上限 658,867／192,420，分別保留 8,068／1,062 bytes。
- total raw／gzip 比目前參考值多 3,493／2,502 bytes。
- 依已核可的開發期政策，total 超額只報告、不阻擋；release enforce 沒有被放寬或移除。
- 增量來自新增一個 module boundary；本批沒有以提高門檻掩蓋變化。

## 本批未做

- 沒有搬 4 個 configure calls、unmount wiring、authenticated preload listeners 或 app-module wiring。
- 沒有改 87 個 `sessionViews` browser harness calls。
- 沒有改 UI 文案、互動、導航、focus、資料 contract、migration、Supabase、Hosted、secret 或 deploy。
- 沒有啟用 Push v2 runtime，也沒有執行 Hosted request。

## 下一步

進入 stage 4.3 前先依現有 gate 查清 `PROFILE_PUBLIC_DISCLOSURE`、`NTRP_SCALE_EXPLANATION` 與
`sessionFormSheetRuntime` 的測試／私有邊界，再把 4 個 configure calls 與 14 個 unmount registrations 搬到
`src/views/sessionViewWiring.js`。`main.js` 必須有一個明確 wiring 呼叫，並依 preflight 固定的
discovery → session → profile → form 順序執行；listener 與 app-module wiring 留到 stage 4.4。
