# FA-06 stage 4.3：session view wiring 拆分證據

日期：2026-09-07

## 結論

四組 React surface configure 與 14 個 unmount registrations 已從 `sessionViews.js` 搬到專用的
`src/views/sessionViewWiring.js`，並由 `main.js` 在建立 controller 前明確啟動一次。

所有 targeted、完整 frontend CI 與 production preview 都通過。這次沒有改畫面、互動、資料契約、migration、
Hosted 或 production 設定。

## 實際變更

- 新增 `src/views/sessionViewWiring.js`，成為四組 surface dependency injection 的單一 owner。
- configure 執行順序依 preflight 固定為：
  1. discovery surfaces
  2. session surfaces
  3. profile surface
  4. session form surfaces
- 14 個 `mounted.registerUnmount(content.unmount)` callbacks 隨 configure 一起搬移。
- `PROFILE_PUBLIC_DISCLOSURE` 與 `sessionFormSheetRuntime` 一起搬到真正使用它們的 wiring owner，維持私有、未匯出。
- `NTRP_SCALE_EXPLANATION` 的字串仍只有一份定義；`sessionViews.js` 只保留相容 re-export，因此既有 browser
  harness API 沒有改名。
- `SURFACE_MANIFEST.structureSources.unmountRegistrations` 已改指向新 owner。
- `main.js` 依序呼叫 `configureSessionViewSurfaces()`、`configureSessionViewModules({ appModule })`，兩者都在
  controller 建立與首次 render 前完成。

## 結構核對

| 契約                                     |      stage 4.2 |        stage 4.3 |
| ---------------------------------------- | -------------: | ---------------: |
| `sessionViews.js` 行數                   |            448 |              284 |
| `sessionViews.js` 頂層 surface configure |              4 |                0 |
| `sessionViewWiring.js` surface configure |              0 |                4 |
| unmount registrations                    |             14 |               14 |
| authenticated preload listeners          | 2，位於 facade | 2，仍位於 facade |
| `sessionViews` browser harness calls     |   86／11 specs |     86／11 specs |

DOM mutation ledger 仍是 18 files／125 nodes／34 symbols／112 references；新 wiring 沒有新增直接 DOM mutation，
因此不需要改動 mutation baseline。browser port manifest 也未改，因為 listener 與 `Element` 邊界尚未搬檔。

## Gate 與 canary

lifecycle gate 現在明確驗證：

- `main.js` 只有一次 `configureSessionViewSurfaces()`。
- surface wiring 必須早於 app-module wiring。
- 四個 configure 在新 owner 各出現一次，順序必須是 discovery → session → profile → form。
- 舊 facade 不得再出現這四個 configure calls。
- profile disclosure 與 form runtime 留在新 owner且維持 private。
- unmount registration 名冊仍逐項等於既有 14 項 manifest。

暫時移除 `main.js` 的 explicit wiring call 時，lifecycle 測試為 6 passed／1 failed；還原後為 7／7，證明新 gate
會攔住未啟動的 wiring，canary 沒有殘留。

## 測試中發現並修正的問題

第一輪 targeted test 指出 `createSessionDonePresentation` 被誤從 `sessionPresentation.ts` 匯入；實際 owner 是
`sessionFormViews.js`。已依原始 import 與模組 export 修正，再從同一批 targeted tests 重跑到 151／151。
錯誤版本沒有建立 commit，也沒有進入任何 Hosted 或 production 環境。

## 完整驗證

```text
targeted architecture／form／controller：151 passed／0 failed
targeted lazy lifecycle Playwright：14 passed／0 failed
session unit aggregate：638 passed／5 skipped／0 failed
mock Chromium aggregate：348 passed／4 skipped／0 failed
production preview：5 passed／0 failed
vite production build：526 modules transformed
production bundle structural checks：passed
git diff --check：passed
```

Production preview 再次覆蓋 anonymous／authenticated／OAuth callback，以及 390px 慢速網路的 Chromium／WebKit；
5 項全部通過。

## Bundle 影響

本批 development production build 與 stage 4.2 基線比較：

| 範圍     | stage 4.2 raw／gzip／Brotli | stage 4.3 raw／gzip／Brotli |         差異 |
| -------- | --------------------------: | --------------------------: | -----------: |
| main     |   650,799／191,358／159,879 |   650,806／191,352／159,988 | +7／-6／+109 |
| total JS |   853,454／261,564／220,922 |   853,461／261,545／221,002 | +7／-19／+80 |

- main 仍低於既有 raw／gzip 上限 658,867／192,420，分別保留 8,061／1,068 bytes。
- total raw／gzip 比目前參考值多 3,500／2,483 bytes，依開發期政策只報告、不阻擋。
- release enforce、private repository、Sentry、demo identifier 與 production E2E hook gates 都沒有放寬。

## 本批未做

- 沒有搬 `configureSessionViewModules`、app-module state、authenticated preloads、`pointerover`／`focusin`
  listeners 或 `Element` intent preloader。
- 沒有改 86 個 facade browser harness calls。
- 沒有改 UI、導航、focus、資料 contract、Push runtime、migration、Supabase、Hosted、secret、deploy 或 request。

## 下一步

執行 stage 4.4：把 app-module wiring、authenticated preload state 與兩個 intent listeners 搬到專用 wiring owner，
並把安裝 listener 做成可重複呼叫但不會重複註冊的明確函式。`main.js` 仍須在 controller 與首次 render 前完成一次
接線；同批依 AST 實掃結果更新 browser port manifest。`sessionViews` facade 與 86 個 harness calls 留到 stage 4.5
再評估。
