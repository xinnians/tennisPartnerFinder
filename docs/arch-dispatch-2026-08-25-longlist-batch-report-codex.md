# 長列表批定稿回報：F4-7 content-visibility 節流

- 日期：2026-08-25
- 開工 HEAD：`2b438cf`
- 實作 commit：`8e138a3`（本回報檔未納入）
- 實作範圍：只含三個指定前端清單面的 item-level rendering containment 與靜態契約測試
- 狀態：前端、DB 與 local 收尾矩陣全部完成
- 本檔依派工單要求不列入實作 commit、不 push

## 1. 實作面與 intrinsic 量測

量測環境為 Vite dev mock、Chromium、viewport `390 × 844`。長列表資料由暫時 Playwright
量測 spec 在執行期注入；未修改 `src/mockData.js`，量測 spec 跑完已刪除。

先在未套 containment 時對代表性長列表逐列量 `getBoundingClientRect().height`，再扣除 item
上下 padding 與 border，得到 `contain-intrinsic-size` 所需的 content-box 數值：

| 清單面 | item selector | 未節流 border-box 實測 | 最終 intrinsic | skipped border-box 複驗 |
| --- | --- | --- | --- | --- |
| 附近 drawer | `.nearby-sessions__cards > .session-card` | 80 筆；118.25px | `auto 92px` | 118px |
| My Sessions needs-action | `.my-sessions-list > .my-action-card` | 24 筆；190px | `auto 156px` | 190px |
| My Sessions upcoming/history | `.my-sessions-list > .my-session-card` | 54 筆；median 141px；實際 141／183／187px | `auto 107px` | 141px |
| 球友目錄 | `.player-directory-list > .player-directory-row` | 100 筆；median 84px；實際 70／84／89px | `auto 58px` | 84px |

每條 containment 都採 `content-visibility: auto` 與 `contain-intrinsic-size: auto <px>`。`auto`
會在 item 真正渲染後記住該 item 的實際尺寸，所以 My Sessions 多按鈕／多行卡片與球友列的
高度變異不會永久沿用 median placeholder。

第一次完整 Chromium gate 證實某個切換 segment 後位於 viewport 外的首張 needs-action 卡片，
雖有 intrinsic height，Playwright `innerText()` 仍會因 skipped content 回空。未修改既有 e2e；
最終改為每個 `.my-sessions-list` 的第一張 action/session card eager render，其餘長尾維持
`auto`。這同時保住第一張可操作卡的既有語意與長列表節流收益。

CSS 只新增上述 containment／lead-item eager 規則；未改 layout、間距或 token。

## 2. 390px 長列表 rendering 證據

以 CDP `Performance.getMetrics` 包住長列表初次 mount，分別比較強制
`content-visibility: visible` 與 containment 開啟。注入量：附近 200 張、My Sessions
60 needs-action＋160 upcoming＋100 history、球友目錄 240 列。

| 清單面 | LayoutDuration | RecalcStyleDuration | TaskDuration |
| --- | ---: | ---: | ---: |
| 附近 drawer | 27.60 → 0.71ms（-97.4%） | 2.07 → 0.73ms | 76.98 → 44.62ms |
| My Sessions | 12.28 → 2.76ms（-77.5%） | 3.29 → 1.01ms | 91.43 → 74.41ms |
| 球友目錄 | 8.60 → 1.65ms（-80.8%） | 2.00 → 0.90ms | 52.73 → 40.79ms |

侷限：這是單機 dev、單輪、synthetic long-list 的相對量測，不是 production SLA；CDP trace
在加入 My Sessions 首張 eager compatibility safeguard 前取得，最終版每段最多多 eager render
一張卡，收益會略低。慢資料路徑另由既有 mobile performance e2e 的 mock delay 驗證：map shell、
base courts、loading status 在 rows 回來前保持可用。Browser live QA 以乾淨 mock env 在精確
390 × 844 開關 populated drawer：8 張 `session-card`、第一張可見、document 無水平 overflow、
console error/warn 皆空。

## 3. 群聊 feed：緩辦

本批沒有對 `.chat-feed` 或 `.chat-message` 加 containment。

原因：feed 逐則高度變異大，而且 `scrollFeedToLatest` 直接依賴 `scrollHeight`；未讀清除也依賴
捲動／開啟時序。mock mobile Chromium 的「置底＋封存唯讀」targeted e2e 1/1 通過，完整
Chromium gate 的 chat 測試亦通過，WebKit 同一 chat case也通過；收尾 `test:local` 中 real-DB
chat polling、未讀 badge／nav dot 清除、封鎖後 unread 與 feed 同步，以及封存唯讀流程均通過。
本批仍未對 chat feed 啟用 containment：現有證據足以守住既有行為，但尚未對高度變異訊息做
獨立 intrinsic 量測與長 feed rendering 收益驗證，因此維持明文緩辦。

## 4. 靜態契約與 canary

新增 `tests/content-visibility-contract.test.js`，並納入 `test:session-unit`。測試會：

1. 遞迴掃描全部 CSS 且自證掃描集非空。
2. 對四條 item selector 逐一要求恰一條 `content-visibility:auto`＋
   `contain-intrinsic-size:auto <px>` 規則。
3. 比對掃描出的 selector 集與固定契約集，漏接／多接均 fail closed。
4. 檢查對應 TSX container/item markup anchor，class 改名不會靜默漏掃。

Canary 實測（最終 scanner 版本）：

- 拔掉附近卡的 `contain-intrinsic-size`：exit 1，錯誤逐字點名
  `.nearby-sessions__cards > .session-card 缺 contain-intrinsic-size:auto <px>`。
- 把 `.session-card` 改為 `.session-card-canary`：exit 1，錯誤同時列出 actual／expected selector
  集與缺漏名稱。
- 每次均立即還原；最終 `node --test tests/content-visibility-contract.test.js` exit 0。

## 5. 凍結面

- `contrast-tokens.test.js`：7/7（含新 contract 一起跑）PASS；既有 token／pin 同源 gate 零修改。
- `data-testid`：`src/` pre-batch 與 current 均 111 個 assignment；changed lines 0。
- `tests/session-controller-sequence.test.js` pre-batch/current SHA-256 均
  `990849449f98bb0b7e695a687474e0fef02bf383b2a00e88da7629e53835deea`。
- 對 `0be31a2` 的既有 `data-testid|GOLDEN|ME_GOLDEN` 核可 hunk checksum 維持
  `5f4e88a2423f06297ea0e68f61566eec48ea9bb8679e9f18b68a86bb54cf9868`。
- pre-batch 至本批 existing `tests/*.spec.js` 變更檔數為 0；既有 e2e assertion 零修改。

## 6. 驗收矩陣

Playwright 全程 workers=1，沒有兩套 Playwright 並發；未執行 DB reset。

| 指令／檢查 | 結果 |
| --- | --- |
| `npm run test:ci:frontend` | PASS；unit 314/314；Chromium 286 passed、4 conditional skipped；build／bundle gate／diff check PASS |
| targeted innerText regression（desktop＋mobile Chromium） | PASS 2/2 |
| targeted chat archived／置底（mobile Chromium） | PASS 1/1 |
| `npm run test:mock:webkit`（非阻擋） | 136 passed、3 skipped、6 failed；六筆全是既有 focus restoration `toBeFocused` timeout，chat case PASS |
| `npm run test:db` | PASS；7 files、799/799 tests，exit 0 |
| `npm run test:local` | PASS；local API 2/2；Supabase Chromium 45 passed、11 conditional skipped（56/56 accounted for），exit 0；did-not-run＝0 |
| `git diff --check` | PASS；空輸出 |

前次 Docker daemon 無回應的 blocker 由使用者恢復環境後解除。本次依序單獨重跑
`test:db` 與 `test:local`，兩者均一次通過；`test:local` 未命中「find two unused Taipei
courts」fixture 累積污染訊號，因此沒有查後重設的必要，也沒有執行 DB reset。Playwright
仍保持單 worker、沒有與其他套件並發。

## 7. 未做

- 未碰資料層 limit／pagination、view contract、migration、pgTAP 或任何 DB 檔。
- 未做 virtualization、infinite scroll、skeleton、bundle chunk、controller／dataApi 改動。
- 未擴充 `mockData.js`；臨時量測 fixture／spec 已移除。
- 未對 court sheets 加 containment。
- 未對 chat feed 加 containment。
- 未 push。
