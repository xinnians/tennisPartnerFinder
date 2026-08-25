# 彈性批（F0-8 分支名解耦＋F4-10 測試基建）驗收紀錄

- 驗收日期：2026-08-25　驗收者：Claude
- 派工單：`docs/arch-dispatch-2026-08-25-flex-batch.md`
- 回報：`docs/arch-dispatch-2026-08-25-flex-batch-report-codex.md`
- 驗收範圍：基準 `f9f8a2c` → HEAD `3c066f5`（2 commit：`d6fc10a` F0-8、
  `3c066f5` F4-10；恰 12 檔）

## 結論：**ACCEPTED**（一次通過，無退件項）——路線圖全案完結

## 一、F4-10 搬移保真：驗收方獨立驗證 [已驗證]

不採信 codex 的 parser 自證，另以**行級多重集合比對**獨立驗：舊
`smoke.spec.js`（aad6d75，6,034 行）過濾 import／註解／空行後 5,251 行，
對新 7 個 spec＋`tests/fixtures/smoke.js` 聯集比對——

- test title 多重集合 126/126 逐字相同；
- 只在舊檔的 9 行＝helper／hook signature（搬進 fixture 時加 `export`、
  `beforeEach` 改為 per-test fixture 機制）；只在新檔的 46 行＝多行
  import 成員與 export 包裝；
- **零測試本體行差異**——搬移零改寫成立。

Playwright 集合：mock 290（11 檔）、WebKit 145、local 62——`--list` 實點；
五個 project `testMatch` regex 逐字未動（diff 零觸碰）；
`test:mock`／`test:local`／`test:ci:*` scripts 逐字未改。

## 二、平行化與互依處置 [已驗證]

- `workers: isLocal ? 1 : mockWorkers`（4）；bare import 經 env 檢查維持 1
  （既有序列化相容契約保留）；新增守門「mock bounded parallelism／local
  single-worker」。
- 兩個平行化互依案例（bare-import 契約、共享 `beforeEach` 受 module cache
  影響）處置正確：fixture 化 per-test 安裝 importer，test 本體零改寫，
  已由 §一 的行級比對覆蓋。
- **wall-clock 驗收方自測**：mock Playwright 286 tests **52.8 秒**
  （基線 workers=1 約 160 秒，驗收方今日三輪 2.6–2.7 分鐘實測）——
  codex 的三輪 163.84s→58.56s（-64.3%）量級一致，收益成立。
- local 實跑印出 `Running 56 tests using 1 worker`——單 worker live 證實。

## 三、F0-8 [已驗證]

- 守門改推導式：workflow 恰兩處 branch filter、逐字等於
  `[main, DEVELOPMENT_BRANCH]`、且分支名總出現數＝受檢過濾器數
  （禁游離出現點）；附 in-memory drift 自證測試。
- 換分支需改 3 處／2 檔（workflow ×2＋常數 ×1）——YAML 吃不到外部常數的
  結構上限已誠實揭露，符合派工單「省不掉明說」。

## 四、驗收方 canary（皆紅→還原→綠，與 codex 錯開）

1. workflow **push** 過濾器改 canary 分支名（codex 做的是 pull_request 側）
   → 2 條測試紅；還原 17/17 綠。
2. 拔 `isLocal ? 1 :` 分流讓 local 吃 4 workers → 新守門紅
   （`mock projects use bounded parallelism while local projects remain
   single-worker`）；還原綠。

## 五、WebKit 補跑（codex 未跑、已揭露；驗收方代跑）

`test:mock:webkit`：**136 passed／6 failed／3 skipped**——failed 計數與
既有非阻擋基準一致（失敗案例分佈在拆檔後的新檔名，類型仍為既有
focus／timing 訊號），拆檔未使 WebKit 套件劣化。`test:local:mobile`
未跑維持缺口：62 test 集合以 `--list` 驗證收集正常，實跑留待下次
CI（`test:ci:supabase` 含該套件）。

## 六、驗收方獨立重跑

```text
test:ci:frontend  exit 0 — unit 321/321（+2 新守門）、mock 286 passed／
                  4 skipped（52.8s）、build＋bundle gate PASS
test:db           804 PASS、exit 0
test:local        45 passed／11 skipped、did not run＝0、1 worker、exit 0
webkit（非阻擋）  136／6／3，符合基準
git diff --check  乾淨；tracked worktree 乾淨（僅回報檔未提交，符合約定）
```

Playwright 兩套未並發；未重置 DB。

## 七、觀察（非阻擋）

1. `data-testid`／GOLDEN 零變動（純測試批，由構造保證＋標準方法複驗）。
2. eslint.config 為 `tests/fixtures/smoke.js` 加豁免一行，與既有三個
   fixture 檔同列，合理。
3. mock 4 workers 依 12 logical CPU 取值；他機核數不同時是效能參數
   非正確性參數，無守門必要。
