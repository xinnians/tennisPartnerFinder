# 批 0.5 驗收紀錄（新碼邊界 ADR＋分批解凍）

- 日期：2026-08-26。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-26-batch0.5.md`；Codex 回報：
  `docs/arch-dispatch-2026-08-26-batch0.5-report-codex.md`。
- 開工基準：派工單寫 `7a0a74d`，實際開工 HEAD 為 `2047777`（規劃文件 commit，為
  `7a0a74d` 的直接後繼，未動本批目標檔）——Codex 已在回報中主動核對並說明，接受。

## 結論：**ACCEPTED**（技術驗收通過；條文生效待負責人最終核准）

## 逐項核對

1. **變更範圍** [已驗證]：`git status --short` 僅 `.claude/rules/react-migration.md`（+9）、
   `docs/architecture-decisions.md`（+5/−1）兩檔＋回報檔，與派工範圍一致。
2. **ADR 四條** [已驗證]：RO-01～RO-04 逐字符合派工單指定文本；5 欄格式、狀態「生效」、
   日期 2026-08-26、出處指向路線圖批 0.5 節；`:3` 更新日期改 2026-08-26；既有 32 條零改動
   （diff 僅新增列與日期行）。
3. **分批解凍節** [已驗證]：新 H2「React ownership 分批解凍（2026-08-26）」落在
   「批 3 解凍（2026-08-25）」之後、「Sheet 批固定模式」之前；diff 純新增 9 行,
   原凍結條文（:21／:24／原 :41／原 :42）一字未改；六條內容涵蓋依批解凍機制、批 1
   Messages 列名、e2e harness 改寫授權（oracle 不得弱化）、批 4 殼、批 5 flushSync、
   「仍不解凍」一票否決收尾——「解什麼＋仍不解什麼」成對，符合解凍儀式。
4. **Gate 本機重跑** [已驗證]：`npm run typecheck`、`npm run lint`、`git diff --check`
   皆 exit 0；`npm run test:mock` exit 0、286 passed／4 skipped（52.7s，不超 55.7s 基準）；
   log 中 12 個 `failed` 字樣全為測試標題，反掃無真失敗。與 Codex 回報數字一致。
5. **回報合約** [已驗證]：逐條對照含最終原文、原凍結條文行號引用、收尾矩陣逐字輸出、
   「未做：無」、「疑義／BLOCKED：無」俱全。

## 驗收方附帶修正（非 Codex 缺失）

RO 出處 anchor 原綁到路線圖含「狀態：已派工」的 H2 標題——狀態回填會斷鏈。屬派工單
給定連結目標的設計缺陷。修正：路線圖標題改為穩定形式「批 0.5：新碼邊界 ADR＋分批解凍」
（狀態移入內文），`architecture-decisions.md` 四條 anchor 同步改短。隨本批驗收 commit 入版。

## 生效與 commit

- 條文屬治理文本，依路線圖規則：驗收通過後由負責人最終核准才生效；核准後隨驗收 commit
  一併入版，並回填路線圖批 0.5 狀態。
- **2026-08-26 負責人已核准，條文即日生效**；RO-01～04 與分批解凍節自本 commit 起約束
  後續所有批次。
