# 長列表批（F4-7 前半 content-visibility 節流）驗收紀錄

- 驗收日期：2026-08-25　驗收者：Claude
- 派工單：`docs/arch-dispatch-2026-08-25-longlist-batch.md`
- 回報：`docs/arch-dispatch-2026-08-25-longlist-batch-report-codex.md`
- 驗收範圍：基準 `2b438cf` → HEAD `8e138a3`（1 commit，恰 5 檔）

## 結論：**ACCEPTED**（一次通過，無退件項）

## 一、結構驗收 [已驗證]

- 逐行讀完整 diff（89 行）與回報一致：三個清單面四條 item-level containment
  （nearby `auto 92px`／my-action `auto 156px`／my-session `auto 107px`／
  directory `auto 58px`）＋My Sessions first-child eager 豁免
  （`content-visibility: visible`，解 Playwright `innerText` 對 skipped
  content 回空的相容性）；`package.json` 僅把新契約測試納入
  `test:session-unit`。零 layout／token 修改。
- **群聊 feed 明文緩辦**成立：派工單預留的緩辦路徑，理由（逐則高度變異＋
  `scrollHeight` 置底依賴）與所附證據（置底／封存 targeted e2e、real-DB
  未讀清除全綠）相符；`.chat-feed` 反掃無 containment。
- 資料層零觸碰：diff 不含任何 `src/data`／migration／`.limit(`。
- 契約測試結構：CSS 樹遞迴掃描（≥13 檔非空自證）、containment 規則集合與
  契約集**精確比對**（漏接／多接雙向紅）、每 selector 恰一條規則＋兩屬性
  regex、TSX 來源錨點防 class 改名漏掃。first-child eager 規則（無 auto／
  intrinsic）正確不進掃描集。

## 二、凍結面 [已驗證]

變更面僅 3 CSS＋1 新測試＋package.json，testid／GOLDEN／spec 依構造即不可
觸及；仍以標準方法複驗：testid 差集空、GOLDEN 宿主檔 SHA-256 前後相同
（`9908494…`）、`tests/*.spec.js` numstat 空。

## 三、驗收方 canary（皆紅→還原→綠，與 codex 兩支錯開）

1. 拔 `.my-sessions-list > .my-session-card` 的 `content-visibility` →
   紅並點名該 selector 缺該屬性。
2. TSX 錨點有牙：`PlayerDirectorySheet.tsx` 的
   `className="player-directory-row"` 改名 → 紅並點名錨點不存在。
3. 外加 rogue 規則（`.chat-feed > .chat-message` containment）→
   集合漂移紅，actual／expected 全列。

codex 側兩支（拔 nearby intrinsic、CSS selector 改名）輸出完整。

## 四、驗收方 390px 實測 [已驗證]

mock dev、390×844：`.nearby-sessions__cards > .session-card` 計算值
`content-visibility: auto`＋`contain-intrinsic-size: auto 92px`；首卡實際
渲染高 118.0px（與 codex 未節流量測 118.25px 吻合，證明 viewport 內卡片
正常全渲染）；document 無水平溢出。

CDP rendering 收益數字（Layout -77%〜-97%）為 codex 單機 synthetic 量測，
方法與侷限已如實揭露，驗收方不重跑、以「量測法誠實」標準採認為指示性
證據而非 SLA。

## 五、驗收方獨立重跑

```text
test:ci:frontend  exit 0 — unit 314/314、Playwright 286 passed／4 skipped、
                  build＋bundle gate PASS
test:db           799 PASS、exit 0
test:local        45 passed／11 skipped、did not run＝0、exit 0
git diff --check  乾淨；tracked worktree 乾淨（僅回報檔未提交，符合約定）
```

Playwright 未並發（瀏覽器實測 dev server 已先停）；未重置 DB。
WebKit 非阻擋訊號 136 passed／6 failed 為既有 focus-restoration timeout
（基準見 `.claude/rules/testing.md`），chat case 通過，非本批引入。

## 六、過程紀錄：Docker daemon 掛死

codex 首輪 `test:db`／`test:local` 因 Docker daemon 無回應受阻（回報有
揭露）。驗收方獨立證實（`docker version` 30 秒逾時）後執行恢復：GUI 退出
→ `com.docker.backend` 殘留 SIGTERM 無效升級 SIGKILL → 重啟。事後容器
清單證實當時僅本專案 supabase stack 在跑，零附帶損害；DB 完好未 reset
（恢復後煙測 799 PASS）。codex 補跑兩套一次通過。

## 七、觀察（非阻擋）

1. intrinsic 採 `auto <px>` 記憶機制，渲染過的卡片會記住實高，median
   placeholder 只影響未渲染長尾的捲動條估算——取值策略合理。
2. 契約集合精確比對意味未來對其他清單（如 chat feed 補做）加 containment
   時必須同步更新契約——刻意的 fail-closed，屬預期維護成本。
3. F4-7 後半（DB limit／分頁）仍待另發；四清單查詢至今零 `.limit(`。
