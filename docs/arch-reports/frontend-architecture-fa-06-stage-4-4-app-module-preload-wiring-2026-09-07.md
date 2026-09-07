# FA-06 stage 4.4：app module 與 preload wiring 拆分證據

日期：2026-09-07

## 結論

app-module 狀態、登入內容接線、authenticated／named preloads 與 `pointerover`／`focusin` intent listeners 已從
`sessionViews.js` 搬到 `src/views/sessionViewWiring.js`。`main.js` 直接從新 owner 取得 wiring 與 React app bridge；
既有 `sessionViews` 對外名稱仍用 re-export 保持相容。

新增測試實際連續初始化兩次，確認 listener 只各註冊一次。完整 frontend CI 與 production preview 都通過；沒有
UI、資料、migration 或 Hosted 變更。

## 實際變更

- `configureSessionViewModules`、app-module reference、login modal renderer 與 eager page preloader state 搬到
  `sessionViewWiring.js`。
- `preloadNonHomeViews`、`preloadAuthenticatedViewsForAuth`、toast／toolbar／bottom navigation bridge 搬到新 owner。
- `preloadForIntent` 與兩個 document listeners 搬到新 owner。
- 新增 private `installSessionViewPreloadListeners()` 與 module-level guard：
  - 沒有 `document` 時不安裝。
  - 同一 module instance 重複 configure 時不會重複安裝。
  - `pointerover` 仍保留 passive option，`focusin` 行為不變。
- `main.js` 直接從 `sessionViewWiring.js` 匯入 7 個 wiring／bridge API；surface open／DOM adapter facade 仍從
  `sessionViews.js` 匯入。
- `sessionViews.js` re-export 8 個相容 API，87 個 browser harness calls 不必改名。
- `SURFACE_MANIFEST.structureSources.authenticatedPreload` 與 browser port manifest 都同步改指向真實 owner。

## 結構核對

| 契約                                   |           stage 4.3 |                      stage 4.4 |
| -------------------------------------- | ------------------: | -----------------------------: |
| `sessionViews.js` 行數                 |                 284 |                            167 |
| configure calls／unmount registrations | 4／14，wiring owner |            4／14，wiring owner |
| intent listeners                       |     2，facade owner |                2，wiring owner |
| browser port entries                   |       54 UI globals | 54 UI globals，只換 2 個 owner |
| `sessionViews` browser harness calls   |        87／12 specs |                   87／12 specs |

AST browser port gate 的第一次實掃只出現以下精確差異：

- 移除 `src/sessionViews.js::<top-level>::document`。
- 移除 `src/sessionViews.js::preloadForIntent::Element`。
- 新增 `src/views/sessionViewWiring.js::installSessionViewPreloadListeners::document`。
- 新增 `src/views/sessionViewWiring.js::preloadForIntent::Element`。

沒有新增第三個 browser port，也沒有把它藏到未盤點檔案。manifest 是依這次 AST 實掃結果更新，不是預填猜測。
DOM mutation ledger 仍為 18 files／125 nodes／34 symbols／112 references。

## Idempotence 與行為驗證

新增 Node 測試使用可計數的 document adapter，連續呼叫兩次 `configureSessionViewModules`：

- 實際只收到 `pointerover`、`focusin` 各一次，共 2 次註冊。
- 若移除 guard，測試會收到 4 次並失敗。
- callback 都是 function；`pointerover` 的 `passive: true` 與 `focusin` 無 options 都有核對。

既有 browser targeted 另確認 card／pin intent preload、loading shell、replacement、queued command 與 unmount
競態，14 項全部通過。

## 完整驗證

```text
targeted architecture／form／controller：152 passed／0 failed
targeted lazy lifecycle Playwright：14 passed／0 failed
session unit aggregate：639 passed／5 skipped／0 failed
mock Chromium aggregate：348 passed／4 skipped／0 failed
production preview：5 passed／0 failed
vite production build：526 modules transformed
production bundle structural checks：passed
git diff --check：passed
```

Production preview 再次覆蓋 anonymous／authenticated／OAuth callback，以及 390px 慢速網路的 Chromium／WebKit；
5 項全部通過。

## Bundle 影響

本批 development production build 與 stage 4.3 基線比較：

| 範圍     | stage 4.3 raw／gzip／Brotli | stage 4.4 raw／gzip／Brotli |          差異 |
| -------- | --------------------------: | --------------------------: | ------------: |
| main     |   650,806／191,352／159,988 |   650,841／191,365／159,913 | +35／+13／-75 |
| total JS |   853,461／261,545／221,002 |   853,496／261,534／220,921 | +35／-11／-81 |

- main 仍低於既有 raw／gzip 上限 658,867／192,420，分別保留 8,026／1,055 bytes。
- total raw／gzip 比目前參考值多 3,535／2,472 bytes，依開發期政策只報告、不阻擋。
- release enforce、private repository、Sentry、demo identifier 與 production E2E hook gates 都未放寬。

## 本批未做

- 沒有改 `sessionViews` 的 87 個 browser harness calls，也沒有直接刪除 facade API。
- 沒有改 preload 名冊、authenticated truthy gate、intent selector、UI、導航或 focus 行為。
- 沒有改資料 contract、Push runtime、migration、Supabase、Hosted、secret、deploy 或 request。

## 下一步

依 stage 4.5 先重新盤點 87 個 harness calls、production imports 與每個 facade export 的 caller。只有在新 owner
已有直接測試、production 能直接 import，且舊 bridge 可在同一批刪除時才退役 facade；若成本或風險不符，就保留
facade 並把理由寫成明確結論，不為了減少檔案數硬改測試。
