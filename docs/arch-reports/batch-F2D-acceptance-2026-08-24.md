# 批 2D（F2-3 sessionViews facade＋F2-4 main.js 拆分＋兩項清理）驗收紀錄

- 驗收日期：2026-08-24　驗收者：Claude
- 派工單：`docs/arch-dispatch-2026-08-24-frontend-F2D.md`
- 回報：`docs/arch-dispatch-2026-08-24-frontend-F2D-report-codex.md`
- 驗收範圍：基準 `0e539a8` → HEAD `e40e5f5`（10 commit）

## 結論：**ACCEPTED**（F2-3／F2-4／churn／命名清理一次通過，無退件項）

## 一、結構與凍結面 [已驗證]

- 行數：`sessionViews.js` 1978→637、`main.js` 1239→795；五個 `src/views/*.js`
  （196–614 行）＋四個 feature 模組（40–259 行），無單檔 >800。
- **具名匯出集合（一票否決）**：驗收方以跨行解析（`export function/const/let/class`
  ＋多行 `export {}` block）擷取兩版名稱集合，**53 個名稱逐一相同**
  （回報的 39 是頂層宣告行數，53 才是完整 namespace，兩個口徑驗收方都比過）。
- 凍結面對 `ed21ab4` 零 diff：`tests/`（含 116 個白箱直呼）、`index.html`、
  `sessionController.js`、`src/controller/`、`sessionStore.ts`、`syncCommit.ts`、
  `sheets.js`、`dataApi.js`、`src/data/`、`.claude/rules/`、CLAUDE.md、`package.json`。
- GOLDEN 124 筆對 `0be31a2` byte-identical；`data-testid` 集合對 `0be31a2`
  相同（驗收方 quoted 掃描 70 unique，口徑與回報的 87 不同——回報含 template
  variants——但兩口徑各自前後一致）。
- 三個 `import.meta.glob` 逐字留在 facade；`src/views/` 內 glob 為 0。

## 二、facade 委派的行為保真 [已驗證]

- **簽名機械比對**：facade 32 個 `export function` 簽名對基準逐條 diff——
  差異只有 10 個複雜簽名改為 `...args`／`{...options}` **透傳**（加寬方向，
  無參數面窄化）；這 10 個的完整解構簽名（含預設值）在 `src/views/` 實作端
  **逐字等於基準版**（10/10 SAME，程式化比對）。
- 其餘 wrapper 重新宣告的解構清單與基準逐字一致（withdraw、report、
  court drawers、player directory 等）。
- lazyMounts 以 getter 注入解決 mount 函式延後賦值；`deferSurfaceOpen` 與
  14 個 unmount 註冊 callback 留在 facade。
- 文案：`PROFILE_PUBLIC_DISCLOSURE`／`NTRP_SCALE_EXPLANATION` 留在 facade
  為唯一定義，configure 注入。

### 驗收方 canary（紅→還原→綠）

facade 的 `validateCreateSessionInput` 委派改為回傳空物件 →
`session-create-form.test.js` **8 fail**，還原後 11/11 綠——
單元測試看得穿 facade，委派錯接不會靜默。

## 三、F2-4 語意保真抽查 [已驗證]

- `applyAuthCandidate`／`handleAuthIdentityChange` 與 2C 落地版逐語句同序等價；
  `resetNotificationSettings` 接線＝`defaultNotificationSettings()`＋
  `publishPageView("me","mySessions")`、`resetPresenceTracking`＝stop＋status idle，
  與舊 inline 序列一一對應。
- `publishMePageView`→`publishPageView("me")`、`publishMeSettingsPageView`→
  `publishPageView("me","mySessions")`——引數形狀保持。
- `updatePresenceSharing` 逐行對照基準：順序、錯誤訊息、toast 文案全同。
- **presence 紅線**：raw GPS 只存在於 `onPosition` 閉包內直送 `updateMyPresence`
  RPC，無新增落地、無 log。
- F2-2 契約：`identityChanged` 於 main.js＋四個新 feature 檔全部 0；
  `session-controller-auth.test.js` 零 diff（tests/ 整體零 diff 涵蓋）。

## 四、兩項清理 [已驗證]

- churn：`pageViews.js` 以 root-keyed WeakMap 記憶 `beforeDrawerStoreChange(root)`
  ——同一 root 恆回同一 closure，`useStoreSelector` 訂閱 identity 穩定；
  語意凍結（store 變更前 `rememberFocusedSessionCard(root)`）。程式碼論證成立
  （派工單允許不設計數探針）。
- 命名：`rerenderVisibleNotificationSettings`／`wireSuccess` 反向 grep `src/`
  歸零；`createNotificationFeature` 的 option 名 `rerenderVisibleSettings` 不改
  （feature 內部泛用介面、單一 caller）——理由成立。

## 五、驗收方獨立重跑

```text
test:ci:frontend  exit 0 — unit 303/303、Playwright 270／4 skipped、
                  bundle 648146/188610（限額 703886/203176 內）
                  反掃 failed/✘/not ok：8 筆命中全為含 "failed" 的測試標題
test:db           799 PASS（Files=7）、exit 0
test:local        42 passed／11 skipped、did not run＝0、exit 0
git diff --check  乾淨；tracked worktree 乾淨
canary            facade 委派破壞 → session-create-form 8 fail；還原 11/11 綠
```

Playwright 全程未與其他測試並發；無 timeout 紅；未重置 DB。

## 六、觀察（不阻擋）

1. facade 委派 wrapper 帶「F2D freezes the facade's top-level export declaration
   scan」註解＋`prettier-ignore`——這是為了讓既有 source-scan 類測試的文字 oracle
   繼續成立。屬可接受的相容手法；批 3 退役 glob 橋接時可一併檢討這些 oracle
   是否改為行為斷言。
2. 回報自述的匯出口徑（39 宣告行 vs 53 名稱）與 testid 口徑（87 vs 70）差異
   均為掃描解析度不同，兩口徑各自前後一致，無實質出入。
