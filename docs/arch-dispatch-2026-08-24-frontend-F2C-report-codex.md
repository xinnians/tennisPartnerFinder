# 批 2C 回報：sessionController 內部拆分＋auth 差分單一化

- 執行日期：2026-08-24
- 派工單：`docs/arch-dispatch-2026-08-24-frontend-F2C.md`
- 開工 HEAD：`11ad3e7`
- 實作範圍：`11ad3e7..6688869`
- 狀態：F2-1、F2-2 已完成；未 push；本回報依要求不列入實作 commit。

## 一、結果摘要

`src/sessionController.js` 保留原路徑與具名匯出 `createSessionController`，改為組裝層；公開 runtime 表面維持 46 keys。原檔由 2180 行降至 711 行，拆出的 8 個責任模組介於 117–564 行，沒有單檔超過 800 行。

F2-2 的 identity 差分現在只由 `authController` 判定。`main.js` 不再自行算 `identityChanged`；identity 變更時，controller 先同步呼叫 `onAuthIdentityChange` 讓 main-owned 狀態完成重置，再執行 controller reconcile。相同帳號的 token refresh 仍只更新 auth session 並 emit `me`，不觸發重置或 participation reload。

## 二、逐模組拆分

每一刀完成後均執行：

```text
node --test tests/session-controller.test.js tests/session-controller-sequence.test.js
117/117 passed（既有 controller 114＋sequence 3）
```

既有兩個測試檔全程零修改；auth 刀另加獨立單元測試後，對應合跑為 118/118。

| Commit    | 模組                                       | 搬移內容                                                                                                     | 主要注入／保留的機械語意                                                                                                                                            |
| --------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cbe42ae` | `controller/surfaceRegistry.ts`            | surface handle 的 get/set/update/release/close 與 transition metadata                                        | surface definitions、close/onRelease；保留 expected-handle、release cleanup、transition 順序與 close options                                                        |
| `c4482a6` | `controller/chatController.ts`             | 開啟聊天室、quiet refresh、read cursor、發文、檢舉、封鎖、poller                                             | api、auth snapshot、chat gate、surface registry、report UI、participation reload、publish；保留 request invalidation 與 poller release                              |
| `abc4576` | `controller/discoveryMapController.ts`     | discovery load/poll、publish、可見球局、map viewport、filters、courts、drawer state                          | discovery gate、map tools、render 三通道、player loaders、visibility target；保留顯式 publish 與 explicit viewport 判定                                             |
| `bb5cd2a` | `controller/playerDirectoryController.ts`  | player layer/directory 載入與清理、court/player surfaces、邀請入口                                           | player/player-directory/player-card gates、auth snapshot、intent/profile gate、surface registry、participation reload；保留 blocked/private 邊界                    |
| `84204f8` | `controller/mySessionsController.ts`       | auth snapshot、My Sessions/roster/blocked-player refresh、分組、action derivation、lifecycle in-flight gate  | participation/roster/blocked gates、api、store、兩個 participation reconcile callback；保留 generation、request gate 與 in-flight token                             |
| `098f7ef` | `controller/lifecycleActionsController.ts` | review/respond/cancel/withdraw/played/attendance/decide/edit actions                                         | lifecycle begin/finish、auth snapshot、authoritative refresh、surface registry、各 sheet opener；保留 mutation 後權威重讀與 stale guard                             |
| `35cf4f3` | `controller/intentController.ts`           | persistent join/create intent、profile/login gate、join/create submit、resume、location、player-layer toggle | intent store、request/location gates、auth snapshot、lifecycle gate、authoritative loaders、surface registry；保留 versioned clear、resume 與 reconcile suppression |
| `ca8855e` | `controller/authController.ts`             | `setProfile`、`setAuthSession`、`setAuthState`、identity classification 與 auth reconcile                    | main reset callback、三級 profile gate、surface transitions、participation reload、blocked-player gate；保留 authEpoch/readiness/reconcile 時序                     |
| `6688869` | assembly formatting                        | Prettier 對拆分後組裝檔的格式收尾                                                                            | 無行為變更                                                                                                                                                          |

閉包共享狀態改為注入時維持「使用當下讀取」：各模組注入 `store` 並在函式內呼叫 `store.getState()`，沒有把 state snapshot 改成跨 `await` 快取。`captureAuthSnapshot`／`isCurrentAuthSnapshot`、各 request gate、lifecycle in-flight gate、surface transition 與 `publish()` 顯式派發均保留。

## 三、F2-2 auth 差分單一化

### 新時序

1. `main.applyAuthCandidate(session)` 只 invalidate main 的 auth request gate，然後呼叫 `controller.setAuthSession(session)`。
2. `authController.classifyIdentity()` 以 controller store 的前一個 session 做唯一一次 identity 判定。
3. identity 有變時，先同步呼叫 `onAuthIdentityChange`；`main.handleAuthIdentityChange` 在這裡完成 profile sheet、presence、profile revision、notification/page-view 等 main-owned 重置，並回傳 loading/null eligibility。
4. callback 返回後才進 `applyAuthState`，沿用原本 controller 的 authEpoch、surface transition、state reset、participation reload 與 pending-intent resume。
5. identity 相同時走輕路徑：只 `setState({ authSession })`＋`emit("me")`。

`tests/session-controller-auth.test.js` 新測試固定三個派工特別指出但不在 GOLDEN 內的行為：

- `setProfile` 仍 emit `me`；
- identity change 的 main reset 發生在 controller 的 `me` emit/reconcile 前；
- 同帳號 token refresh 不重置、不重跑 participation load，但仍更新 token 並 emit `me`。

反向 grep：

```text
git show 11ad3e7:src/main.js | rg -c "identityChanged"  -> 3
rg -c "identityChanged" src/main.js                    -> 0
```

`main.js` 尚存的 `authIdentity()` 全是非「換帳號差分」用途：

- `439/456/464/476`：profile sheet 開啟、儲存與 onSaved 的 async stale-result guard；
- `678/680`：notification setting request 的身分捕捉與完成時 stale guard；
- `992`：上述 helper 定義。

它不再被 `applyAuthCandidate` 或任何 identity-change reset 判定使用。

## 四、ControllerApi 精確契約與 canary

`controllerContracts.ts` 的 `ControllerApi` 已完整列出 46 keys（含 `sessionStore`）。`controller/controllerApiContract.ts` 以工廠推導的 `ReturnType<typeof createSessionController>` 做雙向 key 差集，並以回傳賦值檢查每個方法簽名。獨立 AST 計數與 runtime `Object.keys` 均為 46，集合相同。

Canary 實測：暫時從 `ControllerApi` 移除 `unblockPlayer` 後執行 typecheck：

```text
npm run typecheck
exit 2
src/controller/controllerApiContract.ts(15,9): error TS2741:
Property 'unblockPlayer' is missing in type '{}' but required in type 'Record<"unblockPlayer", never>'.
```

以 `apply_patch` 還原後：

```text
npm run typecheck
exit 0
```

Canary 沒有留在工作樹或 commit。

## 五、凍結資產與白箱點

### Sequence／GOLDEN

- `git diff 11ad3e7 HEAD -- tests/session-controller-sequence.test.js`：空，代表 F2C 零新 hunk。
- 對 `0be31a2` 的 diff 只包含已核可內容：批 1 檔頭說明／recorder 介面調整，以及 2B 的獨立 `ME_GOLDEN` 19 筆與測試；既有 124 筆 `GOLDEN` 無內容差異。
- 擷取 `GOLDEN` 區塊比對：baseline/HEAD 均為 10743 bytes，逐字相同。
- `ME_GOLDEN`：19 筆；本批逐字未動。

### data-testid 與白箱直呼

- 對 `0be31a2` 與 HEAD 擷取完整靜態 `data-testid` 集合：added 0、removed 0。
- 下列 4 個 e2e 白箱直呼點所在測試檔在 F2C 全部零 diff並於完整 gate 通過：
  - `tests/react-page-focus.spec.js:96`
  - `tests/smoke.spec.js:1015`
  - `tests/smoke.spec.js:3844`
  - `tests/smoke.spec.js:5142`
- `tests/session-controller.test.js`、`tests/session-controller-sequence.test.js`、`tests/react-page-focus.spec.js`、`tests/smoke.spec.js`、`tests/session.spec.js` 對開工 HEAD 的 diff 均為空。

### 行數

```text
before  src/sessionController.js                         2180
after   src/sessionController.js                          711
        src/controller/authController.ts                  184
        src/controller/chatController.ts                  247
        src/controller/controllerApiContract.ts            19
        src/controller/discoveryMapController.ts           327
        src/controller/intentController.ts                 564
        src/controller/lifecycleActionsController.ts       409
        src/controller/mySessionsController.ts             356
        src/controller/playerDirectoryController.ts        334
        src/controller/surfaceRegistry.ts                   117
```

## 六、完整驗收矩陣

所有 Playwright 皆依序單 worker 執行，未並發。

```text
npm run test:ci:frontend
  typecheck                         PASS
  lint                              PASS
  prettier:check                    PASS
  unit                              303/303 PASS
  Playwright                        270 passed / 4 skipped
  build                             PASS
  production bundle                PASS
  main chunk                        640983 / 186568 bytes

npm run test:db
  Files=7, Tests=799                PASS

npm run test:local
  local API                         2/2 PASS
  Playwright                        42 passed / 11 skipped
  did not run                       0

git diff --check                    PASS
```

第一次完整 frontend gate 在進入任何測試前由 `prettier:check` 指出拆分後的 `src/sessionController.js` 格式差異。以 Prettier 收尾、重跑 controller 117/117 與 typecheck 後獨立提交 `6688869`；第二次完整 frontend gate 如上全綠。沒有 timeout 紅，故不需要 `--repeat-each=10`；沒有 DB fixture 問題，未執行 reset。

## 七、Commits

```text
cbe42ae refactor(arch-F2C): extract surface registry
c4482a6 refactor(arch-F2C): extract chat controller
abc4576 refactor(arch-F2C): extract discovery map controller
bb5cd2a refactor(arch-F2C): extract player directory controller
84204f8 refactor(arch-F2C): extract my sessions state controller
098f7ef refactor(arch-F2C): extract lifecycle actions controller
35cf4f3 refactor(arch-F2C): extract pending intent controller
ca8855e refactor(arch-F2C): centralize auth identity decisions
6688869 style(arch-F2C): format controller assembly
```

## 八、明確未做／建議

- 未做 F2-3／F2-4；未拆 `main.js`、未建立 sessionViews facade。
- 未處理 `onBeforeStoreChange` churn 或既有命名／註解殘留。
- 未動 `sessionStore.ts`、`syncCommit.ts`、`sheets.js`、dataApi 邊界、`databaseTypes.ts`、`.claude/rules/`、文案、testid 或任何既有測試斷言。
- 未擴 17 步 sequence 腳本，也未把 `setProfile`／`setAuthSession` 加進兩張 GOLDEN。後兩者若未來要納入 frozen sequence，建議另案擴腳本並明列新增步驟；這會刻意改動 `ME_GOLDEN`，不應混入純重構。本批改用隔離單元測試補安全網，對兩張既有表為零影響。
- 未 push。
