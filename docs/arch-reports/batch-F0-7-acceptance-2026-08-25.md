# F0-7（計數斷言清單化）驗收紀錄

- 驗收日期：2026-08-25　驗收者：Claude
- 派工單：`docs/arch-dispatch-2026-08-25-F0-7.md`
- 回報：`docs/arch-dispatch-2026-08-25-F0-7-report-codex.md`
- 驗收範圍：基準 `422906a` → HEAD `e4dfc70`（單一 commit，恰三檔）

## 結論：**ACCEPTED**（一次通過）

## 驗收要點 [已驗證]

- 單一 `SURFACE_MANIFEST`（frozen 具名清單×六組）；兩測試檔改
  `assertExactNamedScan`：非空＋無重複＋排序後逐元素 deepEqual。
- 派工點名的六個計數字面（14/14/8/2/13/14）全數消失（驗收方 grep）；
  `registerUnmount` 從 call count 升級為具名 identifier 比對——比派工要求更強。
- 行為性斷言未弱化（每 sheet 禁獨立 root／禁 flushSync、`eager:` 禁令保留）。
- `src/`／規則／testid／GOLDEN 零觸碰；`git diff --check` 乾淨。

## 驗收方 canary（紅→還原→綠）

1. **清單外假 sheet**（含 `mountSurfaceContent(` 標記樣板）→ 紅並點名
   `CanaryAcceptSheet.tsx`；刪除後綠。
   附註：驗收方第一次用**無標記** stub 探針不紅——掃描定義是
   「目錄枚舉＋`mountSurfaceContent(` 標記」，無標記檔不是 adapter，
   屬探針無效而非守門漏洞（標記即 adapter 的定義）。
2. **manifest 刪 `PlayerCardSheet.tsx`** → 兩條測試紅（adapter 集合＋lazy
   boundary）並點名該檔；還原綠。

## 揭露事項

回報依「不順手擴充」條款揭露另兩個未清單化數字（App 三個 non-home dynamic
imports、presentation `Object.freeze` 13）並建議另立小項——合規，記為待辦候選。

## 驗收方獨立重跑

```text
test:ci:frontend  exit 0 — unit 308/308、Playwright 282／4 skipped、bundle 限額內
test:db           799 PASS、exit 0
test:local        依派工單豁免（純測試批、src 零觸碰）
兩守門測試        13/13（基線）＋兩支 canary 紅綠
```
