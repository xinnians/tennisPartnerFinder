# 批 C2：三段式球局抽屜 — Design Spec

日期：2026-08-08
狀態：已核可並驗收（2026-08-08；半開露卡目標與假設 3 依驗收拍板修訂，見 §8）
前置：批 A／B／C1 已驗收。已拍板：收合態點擊摘要條→**半開**（漸進揭露）；
**全開維持 modal**（現行 dialog 行為），只有半開是新的非 modal 態。

## 1. 問題與目標

現況（基線審計 medium 痛點）：抽屜只有收合／全開兩態，一展開就 `aria-modal` 鎖住
背景並蓋掉地圖——清單與地圖互斥，無法邊看清單邊對照球場位置；手勢只支援上滑開
（>44px），沒有下滑關。

目標：新增「半開」中間態——清單露出約一張卡（下一張露頭）、地圖仍可互動、
雙向可達；全開與收合行為不變。

## 2. 三段狀態機

```
collapsed ──點擊摘要條/上滑──▶ half ──點「展開」鈕/繼續上滑──▶ full
collapsed ◀──下滑/點收合鈕/Escape── half ◀──關閉鈕/Escape/下滑── full？（見假設 2）
```

- **collapsed**：現行摘要條（含批 B 的未登入文案邏輯）。
- **half（新）**：
  - 高度約視窗 45%（390×667 露出約 1 張卡＋下一張露頭；2026-08-08 拍板維持
    45dvh 與批 A 卡片密度），清單可捲動。
  - **非 modal**：無 backdrop、不 push `modalIsolation`、無 focus trap；
    role 用 `region`＋`aria-label="附近球局"`（非 dialog）。
  - 地圖仍可互動：拖動、縮放、點 pin（pin 開詳情 sheet 蓋在半開之上，關閉
    sheet 後回半開）。
  - 進入半開**不搶焦點**（焦點留在觸發元素）；清單頭新增「展開」「收合」
    控制鈕（44px），供無手勢環境切換。
  - Escape 或下滑 → collapsed。
- **full**：現行 modal dialog 行為原樣（`aria-modal`、backdrop、trap、Escape、
  焦點還原）；進入時機改為「從 half 點展開鈕／繼續上滑」。

手勢：上滑 collapsed→half→full 漸進；下滑 full→half→collapsed（新增，
沿用既有 pointer 追蹤邏輯擴充，閾值與現行 44px 一致）。

## 3. 既有行為映射

- auto-expand 映射 **half**（讓地圖保持可見的精神）：實際寫入點經 ground truth
  確認只有兩處——`setMapUnavailable`（地圖不可用）與 stale-intent 回退；深連結
  `#/session/:id` 成功路徑本就不碰抽屜狀態，維持現狀（sheet 蓋在收合抽屜上）。
  controller 狀態由 boolean 改三值 enum（`collapsed|half|full`），改動前 grep
  全 writer／consumer（工程紀律；實作時另收編兩處繞過 setter 的直接賦值）。
- 空狀態（B2 情境按鈕＋B6 訂閱捷徑）在 half 與 full 都完整呈現。
- `drawerRecoveryTarget` 焦點回復鏈語意不變，作用於 half 與 full。
- 批 C1 帶走項在本批收：(a) courts 載入完成前 `#filter-sheet-open` disabled
  ＋載入後啟用（清掉競態窗口）；(b) 篩選 sheet 補專屬 Tab 循環斷言。

## 4. 實作邊界

- 不動 discovery 資料流、`dataApi.js`、任何 RPC；不動球局卡內容與 join 流程
  （C3 範圍）。
- `modalIsolation.js` 只在 full 時 push（half 不 inert 任何東西）；白名單語意
  照舊。
- a11y 底線：half 的 region 語意、full 的 modal 斷言、Escape 各段行為、
  44px（新控制鈕）、鍵盤完整可達（無手勢也能三段切換）。

## 5. 測試計畫

- 狀態機：collapsed→half→full→half→collapsed 全路徑（點擊與鍵盤）。
- half 非 modal：背景非 inert（地圖控件 `elementFromPoint` 可命中）、無
  backdrop、焦點不被搶。
- full modal：既有斷言不退。
- 手勢：上滑兩段、下滑兩段（Playwright touch/pointer 模擬）。
- 半開點 pin →詳情 sheet →關閉→回 half。
- 空狀態按鈕在 half 可見可點；390px 半開高度斷言；44px 掃描含新控制鈕。
- C1 帶走項：courts 未載入時主鈕 disabled 斷言；篩選 sheet Tab 循環斷言。

## 6. 驗收條件

1. §5 測試全綠（mock＋受影響 local journey）；`build`／`git diff --check` 乾淨。
2. 手動走查：390px 半開時可同時看到清單至少一張卡與地圖，並能點 pin 開詳情。
3. 鍵盤走查：無手勢完成三段切換與回復。

## 7. 非目標

C3 join 單層化、C4 群聊未讀；桌面版抽屜重新布局；清單虛擬捲動；
半開高度的使用者自訂。

## 8. 假設（user 掃過勾錯）

1. 半開高度 45%（±5% 實作時視覺對照微調，390×667 下至少露出 1 張卡）。
   ——2026-08-08 驗收拍板：原目標 1.5 張實測不可達（45dvh=1.09、50dvh=1.27），
   維持 45dvh 與批 A 卡片密度，目標定 ≥1，半開定位為「瞥一眼＋對照地圖」。
2. full 的關閉鈕與 Escape 一律回 **collapsed**（單一心智模型：關閉＝收起；
   half 才是瀏覽態）。若你偏好 full→Escape 回 half（漸退），勾此條。
3. auto-expand 一律映射 half。
   ——2026-08-08 驗收追認修正：原文括號內「深連結開 sheet 前抽屜先展開」與
   現實不符（深連結路徑不碰抽屜狀態），依 ground truth 修正為僅
   `setMapUnavailable` 與 stale-intent 兩點映射 half，深連結維持現狀。
4. 半開進入不搶焦點；「展開／收合」控制鈕放清單頭右側。
