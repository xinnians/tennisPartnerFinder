# 批 2B（小項打包）驗收紀錄

- 驗收日期：2026-08-24　驗收者：Claude
- 派工單：`docs/arch-dispatch-2026-08-24-frontend-F2B.md`
- 回報：`docs/arch-dispatch-2026-08-24-frontend-F2B-report-codex.md`
- 驗收範圍：基準 `238a830` → HEAD `49c7016`（6 子項 commit＋1 formatting commit）

## 最終結論：**ACCEPTED**（含 B-5 補件 `4debd26`，複驗見 §四）

## 初驗結論：五項 ACCEPTED＋B-5 條件式退件（一處漏改的顯示點）

| 子項 | 判定 |
| --- | --- |
| B-1 退役 `drawerScrollPositions` | ✅ |
| B-2 `me` 通道第二張 GOLDEN 表 | ✅ |
| B-3 mock 路徑補 mapper | ✅ |
| B-4 通知偏好預設收斂單點 | ✅ |
| B-5 `ACTION_MESSAGES` 上移 UI 層 | ⚠️ 退件一項：`PlayerCardSheet.tsx:177` 漏改，邀請專屬錯誤文案靜默降級成通用 fallback |
| B-6 儲存 profile 只打一次 courts | ✅ |

依派工單「任一子項退件不影響其他子項驗收」，五項先行結案。

## 一、驗收方獨立重跑

```text
test:ci:frontend  exit 0 — unit 301/301、Playwright 270／4 skipped
test:db           799 PASS
test:local        42 passed／11 skipped、did not run＝0
GOLDEN            既有 124 筆與 0be31a2 區塊級 diff 逐字相同
data-testid       集合與 0be31a2 相同
git diff --check  乾淨；tracked worktree 乾淨
bundle            633125/184418（較 2A 後 633597 下降——B-5 把文案表移出主 chunk 的資料層路徑）
```

## 二、各子項證據

### B-1 [已驗證]

三符號＋WeakMap 反向 grep 空；`drawerFocusIntents` 5 處保留；
兩個 batch-18 測試零修改（本批 diff 未觸及 `tests/smoke.spec.js`）且 local 全綠。

### B-2 [已驗證]——含驗收方 canary 與一項覆蓋觀察

第二張 `ME_GOLDEN` 表（19 筆 `步驟|me`）獨立收集、獨立斷言；
**既有 124 筆表與 `0be31a2` 區塊級 diff 逐字相同**（驗收方擷取兩版 `const GOLDEN`
區塊直接 diff）。canary：拔掉 `setCourts` 的 `emit("me")` → 新表紅
（`not ok 1 - sessionController dispatches the frozen me-channel sequence independently`），
還原綠。

**觀察（不阻擋）**：17 步腳本不呼叫 `setProfile`，其 `emit("me")` 不在新表覆蓋面
（驗收方拔掉它仍全綠實測）。五個 emit 點目前覆蓋 setCourts／setAuthState 鏈／
notifyMySessions；`setProfile`／`setAuthSession` 留白，2C 動 controller 時留意。

### B-3 [已驗證]

`mapMockPlayerDirectoryRow`／`mapMockPlayerPresenceDirectoryRow` 落地
（`profileMappers.ts:96`／`:131`），mock 路徑 `dataRepository.ts:246`／`:265`
改走 mapper；74 行單元測試含 literal fallback 案例；mock e2e 零修改全綠。

### B-4 [已驗證]

新葉子 `src/notificationPreferences.ts`：`defaultNotificationPreferences`＋
`notificationPreferencesForRead`（缺欄位＝true）＋`notificationPreferencesForWrite`
（僅顯式 true 送 enabled）——讀寫不對稱以兩個具名函式明文化，比派工單要求的
註解形式更好。三層反向 grep：六連 `!== false` 與六個 `true` 字面已改引用單點。
feature 層補齊六欄的保護保留（write helper 本身就是它）。

### B-5：搬移本體正確，但漏了一個顯示點

**通過的部分** [已驗證]：文案表逐字搬到 `src/sessionActionMessages.ts`
（含保留「刻意不揭露封鎖」註解）；`sessionActionMessage(error, fallback)` 先查
`code`、再以 `name` 退 UNKNOWN、非 action 錯誤（如 `DataApiUnavailableError` 的
mock 模式文案）原樣透傳——設計正確。派工單列的七個顯示點全部改走 resolver；
create（`runAsyncAction`）、join（controller 先 resolve 再回 `joinError`）、
chat post／report／block、archived、withdraw 路徑逐一追過都對。
驗收方 canary：改表中一字 → 釘表測試紅（`not ok 1 - session action messages stay
complete and exact in the UI layer`），還原綠。data 層中文反向 grep 只剩
`DataApiUnavailableError` 自己的訊息（非 ACTION_MESSAGES 範圍）與註解。

**退件事由**：`SessionActionError.message` 現為 `""`，而
**`src/sheets/PlayerCardSheet.tsx:177`** 仍是
`(inviteError as Error | null)?.message || "邀請失敗，請稍後再試。"`。
邀請路徑（`invite_to_session` → controller `onInvite` 原樣重拋）丟的正是
`SessionActionError`，驗收方最小重現：

```text
new SessionActionError("ALREADY_INVITED").message === ""
→ PlayerCardSheet 顯示「邀請失敗，請稍後再試。」
```

基準行為是顯示「你已邀請過這位球友。」等專屬文案——**使用者可見的文案迴歸**，
且無任何 e2e 斷言這些字串（驗收方 grep 空），gate 全綠抓不到。

**驗收方自我更正**：派工單的「七個顯示點」清單是我掃的，當時漏掃 `src/sheets/`
與 `src/pages/`——這一點是共同根因。但 B-5 的驗收條件寫明「UI 錯誤文案逐字不變」，
消費者全掃本來就是執行方責任的一部分。

**補件要求（小）**：
1. `PlayerCardSheet.tsx:177` 改走 `sessionActionMessage(inviteError, "邀請失敗，請稍後再試。")`。
2. 全 `src/` 再掃一次 `.message` 消費點（含 sheets／pages），逐一列出並判定；
   驗收方已掃的其餘命中（`SessionDetailSheet.tsx:730` 只接 controller 已 resolve 的
   意外拋錯、`NearbySessionsDrawer` 的 `mapStatus.message`、`prompt.message`／
   `snapshot.message`／`presentation.message` 均非 data 錯誤）可直接引用後確認。
3. 附一個單元或 DOM 測試釘住邀請錯誤文案（防同類再犯）。
4. 收尾跑 `test:ci:frontend`＋`test:local`。

### B-6 [已驗證]

`loadCurrentProfileWithCourts(courts?)` 抽出共用；save 路徑重用已載入的 courts、
**保留 RPC 後權威重讀**（`my_profile` 仍重新 select）——比「快取整包 profile」
的做法正確。假 client 序列測試斷言 courts 查詢恰一次。

## 三、後續動作（初驗時）

1. codex 補 B-5 的一處顯示點＋消費者全掃＋釘測試（§二 B-5 即補件規格）。

---

## 四、B-5 補件複驗（2026-08-24）：**PASS**

- 補件 commit：`4debd26 fix(arch-F2B): preserve player invite action messages`
- 修法 [已驗證]：`PlayerCardSheet.tsx` 改走
  `sessionActionMessage(inviteError, "邀請失敗，請稍後再試。")`，leaf import、
  零新增 state／effect。
- 釘測試 [已驗證]：新 `tests/player-card-sheet-dom.test.js` 是真 React DOM 測試
  （vite ssrLoadModule＋happy-dom 實掛 sheet，`onInvite` 拋
  `SessionActionError("ALREADY_INVITED")`，斷言 `[role='alert']` 逐字顯示
  「你已邀請過這位球友。」）；已登記 `test:session-unit`。
- **驗收方 canary**：把該行改回舊寫法 → 新測試紅
  （actual `'邀請失敗，請稍後再試。'`），還原後綠。
- 消費點重掃 [已驗證]：`src/` 僅剩 `SessionDetailSheet.tsx:730`（只接 controller
  已 resolve 後的意外拋錯）與 `mapStatus.message` 等非 data 錯誤——零漏網。
- 矩陣 [已驗證]：unit 302/302、Playwright 270／4、local 42／did not run＝0、
  `git diff --check` 乾淨。

## 五、收錄與後續

1. 2B 全部文件（回報、本紀錄）於本次收錄提交；接著發 2C。
2. 全部未 push。
