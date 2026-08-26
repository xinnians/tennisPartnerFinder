# 批 4A 驗收紀錄（三份重複計數收斂單一 manifest）

- 日期：2026-08-26。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-26-batch4A-manifest.md`；Codex 回報：
  `docs/arch-dispatch-2026-08-26-batch4A-manifest-report-codex.md`。
- 驗收方法：本機重跑 gate＋production diff 審閱＋四組 canary 全數獨立複跑
  （本批 test-only、unit 級 canary，驗收方親跑，未另派對立審查 agent）。

## 結論：**ACCEPTED**——批 4 前置完成，4B 可開工

## 通過項（全部本機重驗）

1. **Gate 全綠** [已驗證]：typecheck／lint／prettier／`git diff --check` exit 0；
   unit 336/336、mock 288 passed／4 skipped。（Codex 側首跑撞已立案
   `chat-settings-filters:468` flake、重跑過；驗收側一次過。）
2. **範圍自證** [已驗證]：diff 恰四檔（兩測試＋fixture＋回報），零 `src/` 變更——
   `test:local`／`build`／bundle 豁免成立。
3. **四組 canary 全數獨立複跑三拍** [已驗證]：
   - `sheetAdapters` 移一筆→`app-errors` 紅（錯誤指名 `CourtPlayersSheet.tsx`）→還原綠;
   - `lazyPages` 移 MePage→lifecycle 紅（指名 `src/pages/MePage.tsx`）→還原綠;
   - `navDestinations` 移 `map`→lifecycle 紅（指名 `'map'`）→還原綠;
   - `imperativeMethodBodies` 移 `enterConfirming`→`:179` 紅（`3 !== 2`）→還原綠。
   兩檔還原後 SHA-256 與 Codex 回報基準逐字相同
   （`957c0604…`／`ee6e72c2…`）。
4. **收斂品質** [已驗證]：app-errors 兩處由裸長度升級為 repo-relative POSIX 排序
   名冊 `deepStrictEqual`（掃描證據不變、只改期望來源）；lazyPages／navDestinations
   走既有 `assertExactNamedScan`（拒缺項、多項與重複）；`:179` 引用檔內方法清單
   （偏離 manifest 的設計理由已由回報 §3 如實記載，核准——避免製造 F 群批 5
   將再動的第二份名冊鏡像）。manifest 新兩欄走 `namedList` frozen 樣板，
   既有六組零 diff。
5. **凍結面** [已驗證]：diff 之外零變更（`:94`／`:109`／`session-presentation-boundary:114`
   ／spec 檔／`src/` 全部未動）。

## 驗收註記（一項語意觀察，判定可接受）

**navDestinations 掃描不再綁 `aria-current` 形狀**：舊斷言驗證「四個 tab 的
`aria-current` 由 `activePage` 推導」的完整字面；新掃描只驗 `activePage === "…"`
字面集合（此為派工單原文指定，Codex 忠實執行）。結構面弱化由行為 oracle 承接
[已驗證]：`performance.spec.js:207-214`（map／my-sessions 切換時 `aria-current="page"`
跟隨移轉、舊 tab 失去屬性）＋`navigation-shell-smoke.spec.js:228`（messages）——
符合 Q3「行為 oracle 優於結構鏡像」原則，不退件。殘餘縫隙：`me` tab 的
`aria-current` 無單獨行為斷言（四 tab 同一程式路徑，風險極低，不立案）。

## 量化更新

- 三份互不引用重複計數歸零：`app-errors` 14/8、lifecycle 3/4 全部改引名冊；
  `:179` 的 3 改引檔內清單。
- `surfaceManifest.js` 欄位 6→8（`lazyPages`＋`navDestinations`）。
- mock 基準維持 288 passed／4 skipped；unit 336。
- 4B 設計輸入：Codex 回報 §4.5 的兩階段殼方案（Escape 必須同步、
  `setJoinPreview`／`enterConfirming` 才進 `deferSurfaceOpen.methods` 佇列、
  三個 race oracle）採納為 4B 派工單基礎。
