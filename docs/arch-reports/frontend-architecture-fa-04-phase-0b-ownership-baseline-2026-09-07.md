# FA-04 phase 0b ownership 基線

日期：2026-09-07  
狀態：完成；只新增測試、manifest 與文件，沒有 runtime、UI、migration 或 Hosted 變更

## 白話結論

這批把「哪些程式可以直接改 DOM」及「哪些地方可以直接使用瀏覽器能力」列成 CI 會核對的正式清單。以後有人增加新的
DOM 寫入、讓 controller 直接讀新的 browser global，或在更新畫面時替換四個長駐通知節點，測試會失敗，不會等到 UI
出現偶發問題才發現。

清單不是用行號或推測建立。每一列都由目前 TypeScript Program 的型別與 AST 實際掃描產生，再沿實際 ref／caller 判定
owner、保留理由及退役階段。本批 34 個 mutation symbols 都能唯一判定 owner，沒有需要產品決策的歧義。

## 1. DOM mutation ledger

正式基線為：

- 17 個 source files。
- 125 個 mutation AST nodes。
- 34 個 owner symbols。
- 去重後 112 組 `API + target/ref`。

掃描內容包括：

- 型別可確認為 DOM `Node` 的直接 property assignment。
- 舊 JS 或 `any` target 上明確列出的 DOM property assignment，包含原本漏掉的 `value`、`inert`、`scrollTop` 與
  `style.*`。
- DOM tree mutation methods、`classList` mutation、`style.setProperty/removeProperty`。
- JSX 或 object property 的 `dangerouslySetInnerHTML`。

manifest 每個 symbol 都保存檔案、symbol、實際 API／target、ref 來源、owner、保留原因與預定退役階段，不使用容易因排版變動
而失效的行號。測試另外鎖住 17／125／34／112 四個數字，避免在同一 symbol 與 target 下多加一筆寫入卻被去重掩蓋。

反向 canary 已驗證：在虛擬 source 新增未審查的 `value` 與 `style` 寫入時 gate 會變紅；還原目前 Program 後重新變綠。

## 2. Browser port manifest

正式 scope 分為四類：

| 類別 | 實際筆數 | 意義 |
| --- | ---: | --- |
| controller direct | 1 | controller 函式體仍直接讀 browser global 的既有債務 |
| platform adapters | 26 | 15 個明列 adapter files，加上 1 個已注入 `Document` 的 controller port |
| UI globals | 54 | app、page、view 與 browser entry 可以直接使用的 UI/browser 邊界 |
| type-only | 152 | 只出現在型別位置、實際不會在 runtime 讀取的 TypeScript DOM library references |

唯一的 controller direct debt 是
`src/controller/intentController.ts::requestCurrentLocation::globalThis.navigator`。它是現況基線，不代表新增 direct access
已獲准；新增一個 controller `globalThis.document` 的反向 canary 已確認會使測試失敗。

runtime 掃描範圍明列 20 個目前架構要治理的 browser ports：事件註冊、base64／crypto、DOM、fetch／form/request、history、
IndexedDB／Web Storage、location／navigator／Notification、animation frame 與 window。跨 runtime 的一般語言／Web primitives
（例如 timer 與 `URL`）不列為 browser-only runtime port；若它們只出現在 DOM library 型別位置，仍會進 type-only 清單。這個
scope 已寫在 manifest，不靠維護者記憶。

## 3. 四個 React 外長駐 live roots

Browser test 在初次載入後保存下列四個實際 DOM node reference：

- `#player-layer-status`
- `#map-data-status`
- `#nearby-sessions-count-status`
- `#toast-root`

測試接著真的更新球友狀態、地圖狀態、通知 toast，並透過「內湖區」篩選讓附近球局 live count 從 7 場變成 2 場；再執行
地圖頁 → 我的頁 → 地圖頁切換。最後逐一確認四個 reference 仍是同一個、仍連在 document 上的 DOM node。

desktop Chromium、390px mobile Chromium 與 390px mobile WebKit 共 3／3 通過，console／page runtime error 為 0。

## 驗證結果

- architecture targeted：9／9 通過。
- persistent live roots targeted：3／3 通過。
- 完整 frontend CI：通過；Node 638 tests／633 passed／5 skipped，Playwright 354 tests／350 passed／4 skipped，
  production build 通過。
- production bundle：實際重建為 total 852,758 raw／261,346 gzip；main 650,134 raw／191,175 gzip。開發期既定規則只
  report total raw 超出 2,797、total gzip 超出 2,284，main 與全部結構 gate 通過；數值與 phase 0a 基線相同。
- typecheck、ESLint、Prettier、`git diff --check`：通過。
- production runtime、UI、bundle source、migration、DB、Edge Function、Secret、credential、Hosted request：全都沒有變更。

## 下一步

進入 `FA-05`，先依 final-v3 階段 1 的已證明範圍做低風險清理與 before／after 驗證；不擴張到尚未確認的 production
runtime policy、真實 Push、generation／legacy cutoff 或 bundle release byte limits。
