# 批 2D 回報：sessionViews facade、main feature 拆分與兩項清理

- 日期：2026-08-24
- 派工單：`docs/arch-dispatch-2026-08-24-frontend-F2D.md`
- 開工基準：`ed21ab4`
- 實作範圍：`2e613ca`～`e40e5f5`
- 結論：F2-3、F2-4、`onBeforeStoreChange` churn 與命名殘留均完成；完整矩陣全綠。
- 本回報依約未納入實作 commit，未 push。

## 一、結果摘要

```text
src/sessionViews.js  1978 → 637 lines
src/main.js          1239 → 795 lines
largest new module           614 lines
tests/ against ed21ab4       0 changed files
index.html against ed21ab4   0 changed files
sessionViews white-box calls 116
```

所有新模組均低於 800 行。`sessionViews.js` 保持唯一相容入口，`main.js` 保持唯一 Vite entry。

## 二、F2-3：sessionViews facade

### 2.1 模組與 commit

| Commit    | 模組                             | 搬移內容                                                             | 行數 | 該步 session unit |
| --------- | -------------------------------- | -------------------------------------------------------------------- | ---: | ----------------- |
| `2e613ca` | `views/sessionFormViews.js`      | create/edit/decide 表單、驗證與表單純函式                            |  614 | 303/303           |
| `40cee64` | `views/pageViews.js`             | Nearby、My Sessions、Messages、Me page adapters、map/player 狀態     |  356 | 303/303           |
| `04f8d20` | `views/sessionSurfaceViews.js`   | session detail/chat、report、withdraw、unavailable surfaces          |  433 | 303/303           |
| `65aad67` | `views/profileSurfaceView.js`    | profile completion surface                                           |  196 | 303/303           |
| `c5c45b9` | `views/discoverySurfaceViews.js` | court/player/filter discovery surfaces                               |  226 | 303/303           |
| `e40e5f5` | facade compatibility follow-up   | facade delegation declarations；常數由 facade 注入 form/profile 模組 |    — | 303/303           |

上述模組沿用 `.js`：它們是既有 legacy DOM adapter、lazy mount 與 mutable surface handle 的逐字拆分；本批以行為零變化優先，沒有為 strict TS 製造成片斷言或改寫控制流程。

### 2.2 facade 匯出契約

依派工單指定的原始命令比對：

```text
diff -u \
  <(git show ed21ab4:src/sessionViews.js | grep '^export ' | sort) \
  <(grep '^export ' src/sessionViews.js | sort)

(empty, exit 0)
baseline export declaration lines: 39
HEAD export declaration lines:     39
```

39 是頂層 declaration 行數；展開既有 presentation runtime export block 後，實際 module namespace 的 53 個具名名稱也全數保留。Facade 對拆出函式採薄 delegation declaration，讓 runtime 相容與指定的原始文字 oracle 同時成立。

`PROFILE_PUBLIC_DISCLOSURE` 與 `NTRP_SCALE_EXPLANATION` 保留在 facade 作為唯一文案定義，透過 `configureSessionFormViews`／`configureProfileSurfaceView` 注入；單一 NTRP 來源 guard 維持通過。

### 2.3 glob、lazy bridge 與生命週期

```text
import.meta.glob in src/sessionViews.js: 3
import.meta.glob in src/views/:          0
mounted.registerUnmount(content.unmount) in facade: 14
```

三個 glob expression 與各自 module-level bridge 留在 facade；App、SessionDetail eager bridge 與 13 張 lazy sheet bridge 沒有搬到新路徑。Facade 以 getter-backed `lazyMounts` 注入可延後賦值的 mount 函式，避免 configure 時捕捉到 `undefined`；14 張 React surface 的 unmount 註冊仍由 facade 實際執行。

## 三、F2-4：main.js feature 拆分

### 3.1 模組與 commit

| Commit    | 模組                                              | 搬移內容                                                                      | 行數 | 該步 session unit |
| --------- | ------------------------------------------------- | ----------------------------------------------------------------------------- | ---: | ----------------- |
| `b22691b` | `features/share/shareFeature.js`                  | share URL、Clipboard API 與 textarea fallback                                 |   40 | 303/303           |
| `d997c5d` | `features/filters/filterToolbarFeature.js`        | filter toolbar/sheet 接線、badge 與 result count 同步                         |  136 | 303/303           |
| `8b68d43` | `features/presence/presenceFeature.js`            | tracker 生命週期、位置狀態與兩個 presence setting mutation                    |  101 | 303/303           |
| `061eb27` | `features/profile/profileOrchestrationFeature.js` | profile load/save、auth restore、account reset、identity linking/login/logout |  259 | 303/303           |

### 3.2 main.js 剩餘內容為何仍屬 bootstrap／wiring

`main.js` 現在剩下：

1. CSS 層疊順序、production analytics 與 dependency imports。
2. entry-owned controller/map/page-view store 的最小狀態，以及 toast、hash route、eligibility 等組裝邊界。
3. notification、filter、share、presence、profile feature 的 configure/factory wiring。
4. map pins、五個 destination mount/navigation 與 controller render callbacks。
5. `createSessionController` API/render/surface callback 組裝、DOM event listener 與啟動順序。

凍結的 source-scan 契約仍由真實 wiring 滿足：`getAppState()` 讀 controller state；avatar wrapper 只讀當前 auth metadata；`controller.setProfile(...)` 與 `controller.setAuthSession(...)` 明列於 feature 注入邊界。

F2-2 證據：

```text
identityChanged in src/main.js:                         0
identityChanged in four newly extracted feature paths: 0
tests/session-controller-auth.test.js F2D diff:          empty
```

identity/account 判定仍只在 controller；feature 僅接收 controller 已分類後的 `handleAuthIdentityChange` callback 與 auth candidate wiring。

## 四、兩項小清理

### 4.1 `onBeforeStoreChange` churn

`views/pageViews.js` 新增 root-keyed `WeakMap`：`beforeDrawerStoreChange(root)` 對同一 React root 只建立一次 closure，closure 仍在 store change 前呼叫 `rememberFocusedSessionCard(root)`。因此 `NearbySessionsDrawer` 的 `useStoreSelector` 在一般 commit 中收到同一 callback identity，不再因 adapter render 產生新 inline arrow 而重訂閱；root 被釋放時 WeakMap 也不阻止回收。

這個作法亦遵循本批採用的 React dependency stability 準則：穩定 effect 依賴，不額外引入全域 listener 或 render-time mutation。

### 4.2 命名殘留

`main.js` 的 local callback 改名為 `publishMeSettingsPageView`，語意直接表達 store publish；舊 `wireSuccess` 註解改寫為現行 sheet success callback。

```text
rg 'rerenderVisibleNotificationSettings|wireSuccess' src
(empty)
```

`createNotificationFeature` 的 option 名 `rerenderVisibleSettings` 沒有改：它是 feature 內部的泛用注入介面，production caller 只有 `main.js` 一處；本批只修正 caller local name，避免無必要擴張跨檔介面 churn。

## 五、凍結面

### 5.1 測試與 entry

```text
git diff --name-only ed21ab4 -- tests
(empty)

git diff --name-only ed21ab4 -- index.html
(empty)

rg '__importAppModule\("sessionViews"\)' tests | wc -l
116
```

`sessionController.js`、`sessionStore.ts`、`syncCommit.ts`、`sheets.js`、`dataApi.js`、`src/data/`、`src/rules/` 亦對 `ed21ab4` 零 diff。

### 5.2 GOLDEN 與 testid

- `tests/session-controller-sequence.test.js` 對 `ed21ab4` 零 diff：既有 124 筆 `GOLDEN` 與 19 筆 `ME_GOLDEN` 本批逐字未動。
- 對 `0be31a2` 仍只有先前批次已核可的 40-line sequence-test hunk，本批沒有新增差異。
- 對 `0be31a2` 與 HEAD 掃描完整 `src/` 的靜態 quoted/template `data-testid` 集合：87 unique，added 0、removed 0；掃描非空。檔案搬移只改位置，不改值。

## 六、最終驗證矩陣（最終 HEAD `e40e5f5`）

所有 Playwright 串行執行，期間沒有並發另一組 Playwright。

```text
npm run test:ci:frontend   exit 0
  typecheck/lint/prettier  pass
  session unit             303/303
  Playwright mock          270 passed / 4 skipped
  build                    170 modules transformed
  production bundle       648146 / 188610 bytes
                            within 703886 / 203176

npm run test:db            exit 0
  pgTAP                    799 PASS

npm run test:local         exit 0
  local API                2/2
  Supabase Playwright      42 passed / 11 skipped
  did not run              0

git diff --check           empty, exit 0
```

沒有 timeout 紅，因此不需要 `--repeat-each=10` 取樣；沒有執行 DB reset。

## 七、未做事項

- 沒有退役三個 `import.meta.glob`（留給批 3）。
- 沒有進行 `.js` 全面 strict TS 化或 F2-5 型別鏈工作。
- 沒有調整 controller modules、dataApi/data/rules、testid、GOLDEN 或任何測試斷言。
- 沒有刪除任何既有 facade export；本批不提出零消費 export 刪除案。
- 沒有 push。
