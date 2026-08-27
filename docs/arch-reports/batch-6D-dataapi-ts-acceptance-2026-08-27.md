# 批 6D 驗收紀錄（`dataApi.ts` typed forwarding facade）

- 日期：2026-08-27。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-27-batch6D-dataapi-ts.md`；Codex 回報：
  `docs/arch-dispatch-2026-08-27-batch6D-dataapi-ts-report-codex.md`。
- 驗收方法：本機重跑完整 gate＋獨立擦除 token 對帳＋strict／method-key 探針
  親自複跑＋importer byte 級驗證＋唯讀對立審查 agent（與 gate 平行、零污染）。

## 結論：**ACCEPTED**

## 通過項（全部本機重驗）

1. **annotation-only 無例外** [已驗證]：驗收方獨立 esbuild 擦除比對 HEAD，
   **raw 逐 byte 全等**（無 6C 類核可偏差）；production 全部 chunk hash 與
   基準相同（main `index-BWygPPVv` 不變），bundle 四項淨 0 B（total gzip 餘
   1,435 B）。
2. **隱私邊界 export 面零漂移** [已驗證]：擦除全等即 export 語句全等；
   Node 實際 import 得 70 exports；對立審查 38 列「export 名＝型別 key＝
   forwarding 目標」三向對帳零錯位，且與 `dataRepository.ts:221-259` 回傳
   38 key 集合相等。`src/data/**`／`supabaseClient.js`／`domainTypes`／
   `tsconfig`／`package` 零 diff（含 `privateDataApiLoader` lazy 邊界與
   `privateDataRepository.ts:324` `p_line_id: null`）；
   `privateDataRepository-CfJqlfj0.js` 仍為獨立 lazy chunk。
3. **探針 ×2 親自複跑** [已驗證]：strict 探針紅指名（:117）；method-key
   有牙探針（`"loadCourts"`→不存在名）TS2339 紅、列出完整 38 方法型別——
   證明 `Parameters<DataApi[...]>` 真綁 factory 方法集合；各 byte-identical
   還原後綠。
4. **解凍面精確執行** [已驗證]：9 import edge byte 級僅副檔名；
   `:440` regex 封條副檔名同步且 `:442` 非空 guard 原樣；
   `eslint.config.js` 恰兩處字面（`:109` 豁免／`:156` override，規則語意
   零變更）；appRuntime 恰一鍵；frontmatter paths／CLAUDE.md／README ×2／
   mockData.empty 註解全同步。
5. **Gate 全綠一次過**：typecheck／lint／prettier／build／bundle／unit 346／
   targeted boundary 79/79／mock 298/4／local 2/2＋45/11（無 reset）／
   `git diff --check`／三條反掃全零／`__importAppModule` 110。
6. **對立審查（唯讀）六攻擊面全 PASS**：含 dataApi.ts sha256 與回報探針
   restored 值逐字相同（探針流程真實發生）。

## 覆蓋債（記入）

- 38 條 forwarding 無逐條獨立 spy oracle（由三向對帳＋token 全等＋
  boundary 79 條補足）。
- `type DataApi` 留在 facade 檔內（不從 repository export）——6E 若需同型別
  應同樣檔內推導，不回頭擴 `src/data/` 面。

## 6E 設計輸入（採納 Codex §9.5）

`sessionController.js`（711 行、14 assembly 節點、2 runtime export）**直接
機械轉不先拆檔**（拆分與 annotation 同批會失去 token 對帳能力）。要點：
edge 盤點用 static／dynamic／readFile／comment 四口徑；
`controllerApiContract.ts` 已以 `ReturnType<typeof createSessionController>`
做雙向 exact check——只同步 import `.ts` 保留此橋，不得讓 assembly 反向
import contract；factory options 建最小 `SessionControllerOptions`（約 28 個
注入 callback 如實保留 tolerant，不收窄成完整 DOM／Supabase 型別以免 unit
fakes 失配）；`api` 用最小 data port，不要把 70-export facade 當依賴型別；
難點順序＝callback signatures→store 27 欄與 Map generic→surface transition
union→7 subcontroller options→async gate／auth narrowing→DOM/timer port→
catch `unknown`；JSDoc 三 anchor（`Store<...>`／`ControllerOpenSessionResult`
／`Promise<void> | void`）先轉 erasable annotation；lint 逼 runtime 改寫時
沿 6C 停手裁決。
