# 批 4C-2 驗收紀錄（surface stack＋topmost Escape＋Tab trap 遷入 React surface system）

- 日期：2026-08-27。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-27-batch4C2-keyboard.md`；Codex 回報：
  `docs/arch-dispatch-2026-08-27-batch4C2-keyboard-report-codex.md`。
- 驗收方法：本機重跑全套 gate＋production diff 審閱＋對立審查 agent（canary ×4
  親手複跑＋六新 oracle 載重性＋時序等價獨立判定），對立審查報告：
  `docs/arch-reports/batch-4C2-adversarial-2026-08-27.md`。

## 結論：**ACCEPTED**

## 通過項（全部本機重驗或對立審查實證）

1. **Gate 全綠一次過** [已驗證]：typecheck／lint／prettier／build／bundle／
   `git diff --check` exit 0；unit 344（+6 新 oracle 逐筆對帳）、mock 298／4、
   local 45／11（無污染，`session.spec.js:218` confirming 兩段 Escape 實跑）。
2. **單一 keyboard owner** [已驗證]：surface keydown 全庫反掃只剩
   `SurfaceHost.tsx:119`（首 entry 安裝）／`:126`（末 entry 移除）兩行，
   `sheets.js` 歸零；drawer／App 其他 keydown listener 零變化。stack 存取走
   `configureSurfaceKeyboardRegistry` bridge，`sheets.js` 不 import TSX；雙
   fail-closed guard 在 shell mount 與 isolation 之前。
3. **Escape／Tab 字面語意保真** [已驗證]：Escape 序（topmost→`preventDefault`→
   `stopPropagation`→同步 `onEscape?.()` 短路→`close()`）與兩段既有註解逐字
   搬遷；Tab trap（`FOCUSABLE_SELECTOR`＋hidden 雙條件＋首尾循環＋零 focusable
   fallback）逐字保留。三步原子遷移各有 parity 錨點（8/8 全綠）。
4. **Canary ×4 全數親手複跑三拍** [已驗證，對立審查]：(A) topmost `[0]` 化→
   「Escape 只關最上層」紅；(B) 整段 consume 移除→`session-lifecycle:341` e2e
   紅；(B') 單獨移除 `stopPropagation`→bubble 探針紅（4C-2 派工單修正後的
   對稱設計生效）；(C) wrap 對調→trap＋hidden 雙紅。還原 SHA-256 與回報一致。
5. **oracle 補洞** [已驗證]：hidden 排除、零 focusable fallback、onEscape 短路、
   bubble 探針對稱、listener 平衡、AggregateError 雙錯共 6 條新 oracle 全數
   載重（listener 平衡的 monkeypatch 計數對殘留載重；單一 owner 性質由 source
   反掃承擔，回報未誇大）。
6. **4C-1 三加固項交付** [已驗證]：(1) `shell.unmount()` try/finally——shell 錯
   不再跳過 `surfaces.delete`／`onClose`／restore，雙錯以 `AggregateError` 保存
   不吞；對立審查另證「只 shell 錯」路徑是實質改善（舊版留 stale entry 使同
   root 下次 mount 撞 "already mounted"）。(2) `closeSurface` else 不可達註解。
   (3) React leaf 規則入 `react-migration.md:54`（含 dev-only console.error 的
   正確口徑）。
7. **凍結面** [已驗證]：`captureRestoreTarget`／`resolveRestoreTarget`（C2-2
   修法）／rAF 首幀聚焦零 hunk；七份指定 e2e spec＋views＋14 sheet＋
   `sessionViews.js`＋`App.tsx`＋`modalIsolation.js`＋lifecycle 六群整檔零 diff
   （E 群封條在 try/finally 重構後仍成立：`unmountContent?.();` 先於
   `shell.unmount();`）；`syncCommit` 仍恰 2 caller；`line_id|session_contacts`
   與基準相同；`__importAppModule` 110 不變。

## 驗收註記

1. **`focusableNodes` 現兩份**（sheets.js 供凍結 rAF、SurfaceHost 供 trap），
   述詞逐字相同但屬真實漂移風險——**4C-3 單源化列必交付**（需保留「使用者已
   主動移焦不覆寫」guard）。
2. Codex 回報的 canary B 紅燈證據為濃縮改寫非逐字（語意正確，對立審查親手
   複跑取得逐字證據）；紀錄口徑以對立審查為準。

## Bundle

main gzip 187,359（+145 B，餘 5,061 B）；total gzip **257,545（+186 B，
餘 1,517 B）**——連兩批收緊（1,703→1,517）。**4C-3 開單續列硬約束**；若批 5／6
逼近 gate，走 Q6 重編程序拍板。

## 量化更新（新基準）

- main gzip **187,359**（餘 5,061 B）；total gzip **257,545**（餘 1,517 B）。
- unit **344**；mock 298 passed／4 skipped；`__importAppModule` 110。
- 殼責任遷移進度：DOM＋生命週期＋isolation（4C-1）＋stack＋Escape＋trap
  （4C-2）已入 React surface system；剩 restore focus＋rAF（4C-3）。
