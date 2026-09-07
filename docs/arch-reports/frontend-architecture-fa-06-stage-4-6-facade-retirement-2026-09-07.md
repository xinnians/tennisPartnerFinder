# FA-06 stage 4.6：`sessionViews` facade 完整退役

日期：2026-09-07

## 結論

`src/sessionViews.js` 已完整刪除。production、Node 測試與 Playwright harness 都改為直接使用真正 owner，沒有留下
test-only facade 或相容 re-export。

最後 2 個 DOM renderer 已搬到 discovery owner；完整 frontend CI、production preview 與 bundle gate 都通過。
本批沒有改 UI 行為、資料契約、migration 或 Hosted 狀態。

## 實際變更

- 刪除 167 行的 `src/sessionViews.js`，連同 27 個轉呼叫、11 個 re-export 與 2 個本檔實作出口退役。
- `main.js` 原本從 facade 取得的 17 個 named imports，改為直接來自：
  - `views/discoverySurfaceViews.js`
  - `views/sessionFormViews.js`
  - `views/profileSurfaceView.js`
  - `views/sessionSurfaceViews.js`
  - `sessionPresentation.ts`
- `renderPlayerLayerToggle`、`renderMapDataStatus` 的行為完整搬到 `discoverySurfaceViews.js`；persistent live root、
  escape、retry callback 與 ARIA 語意未改。
- 3 支 Node 功能測試改為直接測 form、wiring、Taipei time 與 presentation owner。
- 12 支 Playwright specs 不再經 facade 取得 surface／preload API。
- 原本指向 facade 的註解一併改成目前真正 owner，避免後續維護者沿錯路徑。

## Browser harness 結果

舊 facade harness 從 87 calls／12 specs 歸零。跨 owner 的同一行 import 已拆開，因此新 direct-owner calls 合計
93 次：

| 真正 owner                    | calls | specs |
| ----------------------------- | ----: | ----: |
| `views/sessionFormViews`      |    18 |     7 |
| `views/sessionSurfaceViews`   |    29 |     6 |
| `views/discoverySurfaceViews` |    20 |     6 |
| `views/profileSurfaceView`    |    15 |     5 |
| `views/sessionViewWiring`     |    11 |     8 |
| 合計                          |    93 |       |

增加 6 次只是把原本一次混取多個 owner 的 import 拆開，不代表增加 production request；這些呼叫只存在測試 harness。

## 不可回復 gate

`session-presentation-boundary.test.js` 現在會檢查：

- `src/sessionViews.js` 必須不存在。
- `src/` 不得重新 import 這個檔案。
- 其他 Node／Playwright 測試不得重新 import 舊檔或使用舊 harness name。

Canary 實測暫時放回同名檔案時為 6 passed／1 failed；移除 canary 後回到 7／7。這證明 gate 不是只在目前內容下
碰巧通過。

## AST inventory

- HTML renderer 仍為 6 個，只把 2 個 `renderMapDataStatus` owner key 改到 discovery owner。
- DOM mutation ledger 仍為 18 files／125 nodes／34 symbols／112 references：舊 facade 檔離開，同時原本沒有列入
  mutation file 的 discovery owner 接手 2 個 renderer，所以 file 總數不變。
- browser port 仍為 controller 1／platform adapter 26／UI global 54／type-only 152，只把
  `renderPlayerLayerToggle::document` owner 改到 discovery owner。
- 所有 manifest 都是依 AST 第一次失敗顯示的 owner／排序差異修正，沒有放寬掃描規則。

## 驗證

```text
typecheck：passed
lint：passed
Prettier：passed
targeted architecture／form／controller：218 passed／0 failed
12 個受影響 specs，desktop Chromium：135 passed／2 skipped／0 failed
session unit aggregate：638 passed／5 skipped／0 failed
mock Chromium aggregate：348 passed／4 skipped／0 failed
production preview：5 passed／0 failed
vite production build：525 modules transformed
production bundle structural checks：passed
legacy runtime／test import scan：0
git diff --check：passed
```

Production preview 再次覆蓋 anonymous／authenticated／OAuth callback，以及 390px 慢速網路的 Chromium／WebKit；
5 項全部通過。

## Bundle 影響

與 stage 4.4 基線比較：

| 範圍     | stage 4.4 raw／gzip／Brotli | stage 4.6 raw／gzip／Brotli |            差異 |
| -------- | --------------------------: | --------------------------: | --------------: |
| main     |   650,841／191,365／159,913 |   649,973／191,341／159,692 | -868／-24／-221 |
| total JS |   853,496／261,534／220,921 |   852,628／261,506／220,734 | -868／-28／-187 |

- production modules 從 526 降到 525。
- main 仍低於既有 raw／gzip 上限 658,867／192,420，分別保留 8,894／1,079 bytes。
- total raw／gzip 比目前參考值多 2,667／2,444 bytes，依開發期政策只報告、不阻擋。
- release enforce、private repository、Sentry、demo identifier 與 production E2E hook gates 都未放寬。

## 本批未做

- 沒有改 surface load 時序、preload 名冊、DOM 結構、樣式、導航、focus 或可及性文案。
- 沒有改 controller state、data API、Push runtime、migration、Supabase、Hosted、secret、deploy 或 request。

## 下一步

FA-06 stage 4 已完成。下一步依 final-v3 先做 FA-06 stage 5 `blockedPlayers` 零依賴 facade 的唯讀 preflight：重新
確認三個 refresh 入口、controller 三個欄位、auth 五欄 reset 與 Me Page 九欄斷言，再決定最小原子實作批次。
