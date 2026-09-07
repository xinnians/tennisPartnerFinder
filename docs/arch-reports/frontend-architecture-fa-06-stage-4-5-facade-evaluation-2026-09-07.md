# FA-06 stage 4.5：`sessionViews` facade 退役評估

日期：2026-09-07

## 結論

`sessionViews.js` 已沒有不可替代的架構責任，可以退役，但必須用一個完整批次處理，不能只把 production import
改掉後留下 test-only facade。

下一批會直接讓 production 與測試使用真正 owner、搬走最後 2 個 DOM renderer，並在同一批刪除
`sessionViews.js`。這次只做唯讀盤點與決策，沒有改 runtime、UI、資料或測試行為。

## 已確認的目前結構

TypeScript AST 實掃得到 `sessionViews.js` 現有 40 個 exports：

| 類型／真正 owner           | 數量 | 現況                                             |
| -------------------------- | ---: | ------------------------------------------------ |
| `sessionFormViews.js`      |   16 | facade 只轉呼叫或複製常數                        |
| `sessionSurfaceViews.js`   |    5 | facade 只轉呼叫                                  |
| `discoverySurfaceViews.js` |    5 | facade 只轉呼叫                                  |
| `profileSurfaceView.js`    |    1 | facade 只轉呼叫                                  |
| `sessionPresentation.ts`   |    2 | facade 只 re-export                              |
| `sessionViewWiring.js`     |    8 | facade 只 re-export                              |
| `taipeiTime.ts`            |    1 | facade 只 re-export                              |
| facade 本身仍有行為        |    2 | `renderPlayerLayerToggle`、`renderMapDataStatus` |
| 合計                       |   40 | 27 個轉呼叫、11 個 re-export、2 個實作           |

最後 2 個實作都只服務 discovery/map 狀態，下一批可搬到 `discoverySurfaceViews.js`；其餘 API 的真正 owner 已存在。

## Caller 盤點

### Production

- `src/` 只有 `main.js` 匯入 facade，共 17 個 named imports。
- 17 個名稱都能改為直接匯入既有真正 owner：14 個 surface open、2 個 discovery status renderer、1 個
  presentation helper。
- production 沒有 namespace import、dynamic import 或其他隱藏 caller。

### Browser harness

- 目前是 **87 次** `__importAppModule("sessionViews")`，分布於 **12 支** Playwright spec。
- 這 87 次實際只使用 17 個 facade exports；其真正 owner 分布於 form、session、discovery、profile、wiring
  五個模組。
- 現有 importer 已接受 `views/sessionSurfaceViews` 這類相對 module name，會解析成
  `/src/views/sessionSurfaceViews.js`，不必增加 production alias。
- 少數同一行同時取不同 owner 的名稱，下一批必須拆成兩個 import，不能機械地只換字串。

### Node 功能測試與架構 gate

- 3 支 Node 功能測試共使用 11 個 facade exports：8 個 form helper、1 個 NTRP 常數、1 個 Taipei time helper、
  1 個 presentation helper。
- `react-surface-lifecycle.test.js` 與 `session-presentation-boundary.test.js` 仍把 facade 檔名當結構契約；退役時要改成
  「檔案不存在且沒有 caller 可重新引入」的 gate。
- HTML renderer／DOM mutation／browser port manifest 仍有 3 組 `sessionViews.js` owner key；搬 2 個 renderer 時要依
  AST 實掃同步換 owner。

## 10 個沒有 facade caller 的 exports

以下名稱的真正實作仍可能被 production 或檔內使用，但 facade 出口本身已沒有 caller：

- `configureMapFilterToolbar`
- `configureSessionViewModules`
- `preloadAuthenticatedViewsForAuth`
- `renderBottomNavigation`
- `renderMapFilterToolbar`
- `CREATE_SLOT_OPTIONS`
- `CREATE_NTRP_BANDS`
- `createDateChipDate`
- `resolveCreateDateValue`
- `createSessionFormRawInput`

不單獨刪這 10 個出口，原因是 partial cleanup 仍會留下兩條測試 import 路徑。下一批直接完成整個 facade 退役，
結果較容易驗證，也不會製造中間架構。

## 86／11 舊數字的查證結果

- `frontend-architecture-final-v3-2026-08-31.md` 的 86 次／11 specs 是當時正確基線。
- `63d38ea`（FA-04 phase 0b）新增 `frontend-architecture-live-roots-smoke.spec.js`，同時新增 1 次 facade import；其
  parent commit 實測為 86／11，該 commit 與目前都實測為 87／12。
- FA-06 stage 4 preflight 到 stage 4.4 文件誤沿用舊數字；本批一併更正這些現況紀錄。歷史 final-v3 不改寫。

## 下一批固定範圍

`FA-06 stage 4.6` 只做以下工作：

1. 先建立 facade 不可回復的結構 gate。
2. 把 2 個 discovery DOM renderer 搬到 `discoverySurfaceViews.js`，同步更新三份 AST owner inventory。
3. 把 `main.js`、3 支 Node 功能測試與 12 支 Playwright specs 改為直接使用真正 owner。
4. 更新兩支架構測試與相關註解後，刪除 `src/sessionViews.js`。
5. 跑 targeted Node、受影響 Playwright、完整 frontend CI、production preview 與 bundle 比較。

若中途無法同批刪除 facade，就整批不提交；不保留 production direct import＋test-only facade 的半套狀態。

## 驗證

```text
Git 歷史計數：FA-04 phase 0b parent 86／11；phase 0b 與目前 87／12
TypeScript AST：40 exports；production 17 named imports／1 importer
targeted Node baseline：210 passed／0 failed
git diff --check：passed
```

本批沒有 runtime、UI、migration、Supabase、Hosted、secret、deploy 或 request 變更。
