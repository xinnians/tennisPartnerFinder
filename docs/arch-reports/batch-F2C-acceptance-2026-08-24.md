# 批 2C（F2-1 controller 內部拆分＋F2-2 auth 差分單一化）驗收紀錄

- 驗收日期：2026-08-24　驗收者：Claude
- 派工單：`docs/arch-dispatch-2026-08-24-frontend-F2C.md`
- 回報：`docs/arch-dispatch-2026-08-24-frontend-F2C-report-codex.md`
- 驗收範圍：基準 `11ad3e7` → HEAD `6688869`（8 個拆分 commit＋1 formatting commit）

## 結論：**ACCEPTED**（F2-1＋F2-2 一次通過，無退件項）

## 一、結構驗收 [已驗證]

- 行數：`src/sessionController.js` 2180 → 711；八個新模組 117–564 行，無單檔 >800
  （`wc -l` 實測與回報逐字相符）。
- 公開表面：組裝檔 return 物件 46 鍵＝`ControllerApi` 46 鍵（皆以指令計數）。
- `grep -c "identityChanged" src/main.js` → **0**（基準為 3）。
- 凍結測試檔對 `11ad3e7` 全部零 diff：`session-controller.test.js`、
  `session-controller-sequence.test.js`、`smoke.spec.js`、`react-page-focus.spec.js`、
  `session.spec.js`（含 4 個 e2e 白箱直呼點）。
- 禁區檔案零 diff：`sessionStore.ts`、`syncCommit.ts`、`sheets.js`、`dataApi.js`、
  `src/data/`、`.claude/rules/`、CLAUDE.md。
- GOLDEN 124 筆：擷取 `const GOLDEN` 區塊與 `0be31a2` 版 diff **byte-identical**
  （雙方 10744 bytes）；`ME_GOLDEN` 19 筆本批未動；`data-testid` 集合與 `0be31a2`
  完全相同（sort -u 後 diff 空）。
- formatting commit `6688869` 實看 diff：僅一處 import 換行重排，純格式。

## 二、契約與 canary [已驗證]

- **驗收方自建契約 canary**（與 codex 用的 `unblockPlayer` 不同鍵）：從
  `ControllerApi` 刪掉 `openSessionChat` 一行 → `npx tsc --noEmit` 紅
  （`TS2741: Property 'openSessionChat' is missing…`），還原綠。
- 契約檢查同時抓「簽名不符」：驗收方把 `ControllerSurfaceResult` 的 `| void`
  拿掉 → typecheck 紅並點名 `openRosterParticipantReport` 回傳型別不符，還原綠
  ——證明 `controllerApiContract.ts` 的雙向檢查對鍵集合與簽名都有牙。

## 三、F2-2 auth 差分單一化 [已驗證]

- `main.js` 差分乾淨：舊 identity-change 重置區塊**逐字**搬進
  `handleAuthIdentityChange`，回傳值即舊碼傳給 `setAuthState` 的 eligibility；
  `applyAuthCandidate` 收斂為 gate invalidate＋`controller.setAuthSession(session)`。
- `authController.applyAuthState` 與舊 `setAuthState`（`11ad3e7` 版）逐行同構：
  三級 gate 差分、epoch 條件、clearIntent／clearPlayerLayer／clearPlayerDirectory
  條件、transition 分支、emit 順序、identityChanged 重置塊、reconcile、
  reloadParticipation、resumePendingIntent guard 全數一致。
- 輕路徑：新 else 分支＝舊 `setAuthSession`（`setState`＋`emit("me")`）逐字同構；
  無 callback 時 identity 變更仍走輕路徑，故 controller 單元測試零修改成立。
- main 其餘 5 個 `setAuthState` 呼叫點（profile 載入／儲存流）不經 callback，
  行為不變。
- `authIdentity` 殘餘 7 處命中逐一檢視：全部是 async 完成時的 stale-result guard
  （比對「捕捉時 identity vs 當下 identity」），無一用於「換帳號→重置」判定，
  與回報所列一致。

### 新 auth 單元測試的載重驗證（驗收方三支 canary，各自紅→還原→綠）

1. 拔輕路徑（讓同帳號 refresh 也走完整 reconcile）→ 紅。
2. 把 main-reset callback 移到 `applyAuthState` 之後（時序倒轉）→ 紅。
3. 拔 `setProfile` 的 `emit("me")`（2B 查出的覆蓋缺口）→ 紅。

三支結束後 baseline 118/118 綠。

## 四、回報未逐項揭露、驗收方查證後放行的三項變更

1. **`ControllerSurfaceResult` 加寬 `| void`**：實證探針點名
   `openRosterParticipantReport`；追源是工廠依賴預設值
   `openReport = () => {}`（`sessionController.js:57`）被 TS 推導為 `() => void`。
   runtime 函式本體逐字未動、仍 `return dialog`——加寬只是把「注入預設 stub 時
   本來就可能回 undefined」的既存事實寫進型別，行為零變化。
2. **`sessionStore` 收進 `ControllerApi`**：回報有提（「含 sessionStore」），
   但屬契約檔變更，一併記錄。
3. **`sessionSelectors.ts` 新增 `selectControllerPlayerLayerView`**：與舊
   `sessionController.js:334`／`:2140` 的 inline 構造逐欄同構，忠實抽取。

三項皆 [已驗證] 無行為變化；回報紀律面要求下批起契約檔任何 hunk 逐項列出。

## 五、跨 await 讀取抽查 [已驗證]

grep 新模組中 `= read()` 捕捉點：全部是既有的 epoch／staleness 快照模式
（捕捉後與當下比對，即凍結語意本身），無「整包 state 快取跨 await 使用」的新形。

## 六、驗收方獨立重跑

```text
node --test session-controller{,-sequence,-auth}  118/118 PASS
test:ci:frontend  exit 0 — unit 303/303、Playwright 270／4 skipped、
                  bundle 640983/186568（限額 703886/203176 內）
                  反掃 failed/✘/not ok：12 筆命中全為含 "failed" 的測試標題（皆 ok）
test:db           799 PASS（Files=7）
test:local        42 passed／11 skipped、did not run＝0、exit 0
git diff --check  乾淨；tracked worktree 乾淨
```

Playwright 全程未與其他測試並發；無 timeout 紅，未動用 `--repeat-each`；未重置 DB。

## 七、其他

- `package.json` 唯一變更＝把 `session-controller-auth.test.js` 註冊進
  `test:session-unit`。
- bundle：回報 640983/186568，較 2B 後 633125/184418 增約 7.8KB——拆分模組樣板
  成本，production bundle gate 仍過。
