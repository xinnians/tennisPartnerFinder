# 批 C3：加入流程單層化 — Design Spec

日期：2026-08-08
狀態：待 user 核可
前置：批 A／B／C1／C2 已驗收。已拍板：**兩段式同層**——確認與成功態內嵌
詳情 sheet，不再開第二、三層 dialog。

## 1. 問題與目標

現況（基線審計 medium 痛點）：加入一局要經過詳情 sheet → 加入確認 dialog
（幾乎逐欄重複渲染同一份球局摘要）→ dialog 內成功態＋推播引導，最多三層
surface；確認層資訊與詳情層高度重複，成功後焦點還要特別跳轉到底部導覽。

目標：整個 join 旅程只有一層 surface（詳情 sheet）；確認、送出中、成功、
失敗四態都在 sheet 的動作區就地切換。

## 2. 行為設計（sheet 動作區狀態機）

```
idle ──點「申請加入/直接加入」──▶ confirming ──點「確認送出」──▶ submitting
confirming ──點「取消」/Escape──▶ idle          submitting ──成功──▶ success
                                                submitting ──失敗──▶ error(可重試)
```

- **idle**：現行動作區（主 CTA＋複製連結＋檢舉等）。
- **confirming**：主 CTA 原地變成「確認送出」＋「取消」兩鈕（44px）；動作區
  上方顯示差異提示——不重複球局摘要（詳情就在上方），只顯示本次送出的
  關鍵確認資訊：join 型式（審核制／直接加入）與 NTRP 提示（未填 NTRP 或
  超出範圍時，沿用現行 `OK_NTRP_MISSING`／`OK_NTRP_OUT_OF_RANGE` 對應的
  事前說明文案語意）。Escape 在 confirming 態退回 idle（不關 sheet）。
- **submitting**：兩鈕 disabled＋「送出中…」；沿用現行 RPC 呼叫與錯誤處理。
- **success**：動作區變成功卡——依 `OK`／`OK_NTRP_MISSING`／`OK_NTRP_OUT_OF_RANGE`
  三種結果顯示現行對應文案；內嵌現行推播引導 prompt（success-push-prompt）；
  CTA「查看我的球局」（點擊關 sheet 並導向 My Sessions 聚焦新參與卡——沿用
  既有 created-session 聚焦骨架）。焦點移至成功卡標題（`tabindex="-1"`），
  不再自動跳底部導覽。
- **error**：動作區顯示錯誤訊息＋「重試」（回 confirming）；沿用現行錯誤文案。

## 3. Gate 與既有流程整合

- nickname gate 不變：未登入→login dialog、未達 gate→profile sheet，resume
  後回到詳情 sheet 並直接進 **confirming** 態（intent resume 語意沿用）。
- `request_to_join_session` RPC、封鎖中性文案、原子容量規則零變更。
- `openJoinSessionConfirmation` dialog 退役：函式與其測試移除；
  `closeActiveDetail(..., preserveJoinConfirmation)` 相關機制一併清理
  （改動前 grep 全 consumer）。
- withdraw／檢舉／取消球局等其他確認 dialog **不在本批範圍**（維持現行）。

## 4. 實作邊界

- 不動 dataApi／RPC／gate 語意；不動球局詳情資訊區塊（只動動作區）。
- sheet 在四態切換中不得重建整個 surface（保焦點——批 B Task 4 教訓：值同步
  或就地替換動作區節點並管理焦點，禁全 sheet innerHTML 重灌）。
- C2 帶走項在本批收：(a) `setDrawerExpanded` wrapper 退場（剩 2 個 false
  caller 改 `setDrawerState("collapsed")` 後刪 wrapper）；(b) half 計數摘要
  aria-live polite；(c) `drawer-collapse` click 直接測試；(d) level popover
  Escape 缺口（開著 popover 按 Escape 應先關 popover 不收抽屜）。

## 5. 測試計畫

- 狀態機四態切換（含 Escape 退回 idle、confirming 取消、error 重試）。
- 三種成功結果文案斷言（mock instant／approval／NTRP 缺與範圍外情境）。
- 成功態焦點落成功卡標題；「查看我的球局」導向並聚焦。
- gate resume 後直接進 confirming 的斷言（mock 直測＋local 真 gate journey）。
- 全庫 `openJoinSessionConfirmation` 零殘留反掃。
- C2 帶走四項各自斷言（wrapper 反掃、aria-live 存在、collapse click、
  popover Escape 順序）。
- local：session.spec.js 的 join journeys 改寫後 mock＋local 雙路徑綠。

## 6. 驗收條件

1. §5 全綠；`build`／`git diff --check` 乾淨。
2. 手動走查：390px 申請加入全程停留同一張 sheet；成功後一鍵到 My Sessions。
3. 鍵盤走查：confirming Escape 退回 idle、sheet Escape 關閉（idle 態）。

## 7. 非目標

C4 群聊未讀；invite／review／withdraw 等其他流程的單層化；樂觀 UI；
join 後的即時 roster 更新機制變更。

## 8. 假設（user 掃過勾錯）

1. confirming 態 Escape 退回 idle 而非關 sheet（兩段語意：先退一步）；idle 態
   Escape 維持關 sheet。
2. 成功態 CTA 文案「查看我的球局」；點擊行為＝關 sheet＋切 My Sessions＋聚焦
   新參與卡。
3. 推播引導 prompt 沿用現行元件樣式內嵌於成功卡下方，行為不變。
4. instant join（直接加入）同樣走兩段確認（防誤觸的價值對 instant 更高——
   一點就進局）；若你要 instant 維持單擊直送，勾此條。
