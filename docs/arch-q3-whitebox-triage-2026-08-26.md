# Q3 彙總：白箱測試治理底線（2026-08-26，批 3 開工前提）

- 依據：比較報告 §9 清單＋Codex 裁決「白箱測試處置原則」＋HEAD `c5291cd` 全 tests
  實地盤點（計數皆指令複算）。
- 用途：批 3–6 每張派工單的解凍清單都以本檔分類為準；A 類是一票否決底線。
- 拍板紀錄見文末；核准後本檔生效，異動需負責人同意。

## A 類：不可放棄（治理封條，任何批不得動斷言語意）

| 保護面 | 測試 | 守什麼 |
| --- | --- | --- |
| 隱私：error transport | `app-errors.test.js:23-42` | 外送欄位只有 `errorName/kind/surface`，反掃敏感 token |
| 隱私：mapper allowlist | `session-data-boundary.test.js` | 公開／My Sessions／roster 三組顯式 allowlist；退役 LINE 識別碼零殘留 |
| 隱私：push payload | `notification-dispatch.test.js:44` | 推播內容白名單、無 LINE |
| data boundary（真 DB） | `session-data-local-api.test.js`＋pgTAP | local Supabase 實測邊界 |
| production bundle／mock 排除 | `ci-config.test.js`＋`check-production-bundle` | 棘輪、mockData alias 五形狀、E2E hook 排除 |
| WCAG 對比實算 | `contrast-tokens.test.js` | AA 4.5:1／3:1、pin 色票與 CSS token 雙向同源 |
| 安全標頭＋CSP | `security-headers.test.js` | 全路徑 header、report-only CSP、SW revalidate |
| 品牌／禁用色票封條 | `public-brand-scan.test.js`＋`legacy-style-scan.test.js` 黑名單段 | 舊色票／舊品牌零回流（**Codex 保留清單漏列，本檔補入**，裁定見 Q3-a） |
| list query 契約 | `list-query-contract.test.js` | 四常數上限、排序子句、query-site 全登記＋fail-closed canary（F4-7 資料層契約，非純結構） |
| 行為 e2e | `error-boundary`、`performance`、`navigation-shell`（路由／深連結）、`session(.spec)`／`session-mobile`、各 smoke 的 focus／Escape／restore oracle | 使用者可觀察行為，改寫可以、弱化刪除不可以 |

## B 類：行為 oracle 保留、harness 隨批改寫（oracle 一字不弱化）

| 測試 | oracle | harness 改寫批次 |
| --- | --- | --- |
| `sheets-dom.test.js` | 殼五行為（卸載序、拋錯清殼、Escape 最上層、focus trap、還原三段 fallback） | 批 4（`src/sheets.js` path＋`mountSheet` 簽名綁死） |
| `player-card-sheet-dom.test.js` | `ALREADY_INVITED` 專屬文案 alert | 批 4（`installSurfaceHostRenderer` 接線） |
| `react-unmount.spec.js` | unmount lifecycle 不洩漏 | 批 4（`#session-create-modal`／`[data-surface-close]`） |
| `react-page-focus.spec.js` Me 段 | 重繪後焦點身分保持 | 批 3（照批 1／2A harness 樣板） |
| `me-focus.test.js` | `canReceiveFocus` 五 case | 批 3／6 只改 import 行 |
| `messages`／`my-sessions-page-dom` | hooks 與 selector 同源、payload 綁定 | 樣板，批 3 複製到 Me／Nearby |

## C 類：結構鏡像，隨批退役或改寫（派工單逐批明列解凍行號）

**單點阻塞：`react-surface-lifecycle.test.js`**——四批都撞，逐群歸批：

| 斷言群 | 行 | 歸批 |
| --- | --- | --- |
| C 群 lazy page import 計數 `=3`、preload 觸發留 `sessionViews.js` | `:128-142` | 批 3 |
| A 群 sheet adapter 鏡像＋逐字禁令、SurfaceHost 內部函式名 | `:53-92` | 批 4 |
| E 群 `sheets.js` 殼關閉序四字面 | `:156-163` | 批 4 |
| B 群 `syncCommit` caller 白名單（注意 `:114` 退到零反而 fail 的 fail-closed 設計） | `:94-126` | 批 5 |
| F 群 Session Detail 禁 commit 計數 `=3` | `:165-181` | 批 5 |
| 頂層 7 檔 `readFileSync` 硬路徑（檔案消失＝import 期崩全檔） | `:7-15` | 各批同步 |
| D 群 AppShell `aria-current` 計數 `=4` | `:144-154` | 保留（批 3 不動 shell 即不撞） |

其餘 C 類：

- `surfaceManifest.js` 六組 frozen 清單（原文誤植五組，2026-08-26 勘誤）：批 3 動
  `presentationConsumers`、批 4 動
  `sheetAdapters/lazySheets/imperativeAdapters/unmountRegistrations`（8 個 imperative
  全退時撞非空斷言，批 5 一併處理）。
- **三份互不引用的重複計數**（`surfaceManifest` 14/13/8、`app-errors.test.js:121,129`
  14/8、`react-surface-lifecycle` 3/4/3）：**批 4 開工前先收斂為引用單一 manifest**。
  （2026-08-26 勘誤：app-errors 行號原誤植 :106,124，實測 :121,:129，該檔自
  c5291cd 起零變更，屬本文件抄錄錯誤。）
- `session-presentation-boundary.test.js`：鏡像＋`Object.freeze` 計數 `=13`＋docs 措辭
  逐字比對——隨批 3／4 改寫；docs 措辭比對段建議退役。
- `__importAppModule` 直呼（現 122：smoke 五檔佔 103）：隨批 3 遞減，僅觀察指標。
- `appRuntime.js` 副檔名表：`districts`／`pins` 兩筆 dead entry 順批清；批 6 轉 TS 補映射。
- 兩處零餘裕下限（批 6 前置）：`content-visibility-contract.test.js:57` `>=13` 現值
  恰 13；`legacy-style-scan.test.js:43` 每檔 `>100 bytes` 會擋拆檔小檔。
- `content-visibility` 8 個 source anchor／`session-create-form` 唯一定義掃描／
  `session-controller.test.js` 的 `main.js` 區段 regex：批 3–5 凍結字面即不撞，批 6
  拆檔時逐項改寫。

## 執行守則（隨核准生效）

1. 批 3–6 每張派工單必列「本批對 C 類的解凍行號清單」；未列者視同凍結。
2. 量化裁定（Q3-b）：`__importAppModule` 等計數**只作觀察指標，不設數值終點**——
   比較報告「142→<50」不採用（142 已證誤，現基準 122；採 Codex「數字非硬封條」原則）。
3. B 類改寫一律附 canary 或等價證據證明 oracle 有牙（沿批 2 慣例）。
4. `tests/*.tsx` harness 不在靜態 gate 的缺口＋filter sheet flake：已列路線圖插批。

## 拍板紀錄

- Q3-a 品牌／色票封條補入 A 類：**核准（2026-08-26）**。
- Q3-b 量化終點：**只作觀察指標，不設數值終點與 fail-closed gate（2026-08-26）**；
  比較報告「142→<50」正式不採用。
- Q3 全案（A 類底線＋三類分法＋歸批）：**核准（2026-08-26），即日生效**；
  批 3 開工前提達成。
