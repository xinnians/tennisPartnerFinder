# F0-7 派工單：靜態掃描計數斷言改清單推導（階段 2.5，3B 前置）

- 日期：2026-08-25
- 路線圖：`docs/arch-roadmap-2026-08-25.md` 階段 2.5；母派工單 F0-7 條目
- 開工基準：以當前 origin HEAD 為準（`55902f9` 之後）
- 排程理由：3B（F3-2 殼遷入）會改 sheet／eager／glob 集合——先把魔術數字
  清單化，3B 屆時只改一份 manifest 並在報告說明變因，而不是同步改散在
  多檔的計數。

## Ground truth（2026-08-25 實測）

魔術數字散佈點：

- `tests/react-surface-lifecycle.test.js`：`:46` sheet adapters **14**、
  `:56` `registerUnmount` **14**、`:62` imperative adapters **8**、
  `:103` `eager: true` 恰 **2**、`:105` lazy sheets **13**、
  `:135` `surfaceContent.commit(` 恰 **3**。
- `tests/session-presentation-boundary.test.js`：`:20` `REACT_CONSUMERS`
  陣列＋`:112` 長度 **14**。
- 現況實數：`src/sheets/*.tsx` 14 檔；`sessionViews.js` glob 3 處。

## 作法約束

1. 建立**單一 manifest 模組**（建議 `tests/fixtures/surfaceManifest.js` 或
   等價位置，不放 `src/`——它是測試契約不是 runtime 資料）：列出 sheet
   adapters、eager 面、lazy sheets、imperative adapters、presentation
   consumers 的**具名清單**（檔名／識別字，不是數字）。
2. 兩個測試檔改為由 manifest 推導期望值：計數斷言改成
  「掃描結果集合 === manifest 集合」的**逐元素比對**（不只長度），
   缺一、多一都要能指出是哪個名字。
3. **掃描集非空自證**保留：每個掃描斷言前先證掃描有命中（防空集合假綠）。
4. 既有斷言語意不得弱化：`eager:` 禁令（`:106`）、`surfaceContent.commit`
   恰 3 等**行為性**斷言照舊，只把「數字」換成「由清單推導」。
5. 不動 `src/` 任何檔案；純測試重構。

## 驗收條件

1. 兩檔內寫死的 14／13／8／2 等計數字面消失（附前後 grep；
   `surfaceContent.commit` 的 3 若改由 manifest 推導亦可，保留原樣也可，
   說明選擇）。
2. **canary A**：在 manifest 外新增一個假 sheet 檔（如
   `src/sheets/CanarySheet.tsx` 含 adapter 樣板）→ 測試必紅且錯誤訊息
   **點名該檔**；刪除後綠。附輸出。
3. **canary B**：從 manifest 刪一個既有項 → 測試紅（反向也要有牙）；
   還原綠。附輸出。
4. `npm run test:ci:frontend` 全綠；本批不動 runtime，`test:local` 免跑，
   但 `test:db` 照標準矩陣慣例附上。
5. `git diff --check` 乾淨；`data-testid`／GOLDEN 零觸碰（不在變更面）。

## 不在範圍

1. 3B 本體；`src/` 與 `.claude/rules/` 零觸碰。
2. 不順手擴充掃描涵蓋面（如把其他測試檔的數字也清單化）——只做母單
   點名的兩檔；發現其他魔術數字列入回報建議即可。

## 回報要求

寫成 `docs/arch-dispatch-2026-08-25-F0-7-report-codex.md`，不列入實作
commit、不 push。manifest 形狀說明；驗收逐條附指令＋實際輸出；
兩支 canary 紅→還原→綠完整輸出；未做明說。
