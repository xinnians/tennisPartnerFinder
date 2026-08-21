# 批次 C6 BLOCKED 回報：notifications 前提與現況不符

## 結論

本批 BLOCKED，未實作、未跑重複 gate；依總則只提交本份 BLOCKED 回報，不建立 runtime refactor commit。

原因不是技術做不到，而是派工規格彼此衝突：C6 要從 `sessionController.js` 抽出「通知偏好、Web Push、球場訂閱」，但這三項功能目前全部在 `src/main.js` 與 UI；controller 沒有可搬的對應函式、state 或 API。C 批又明文禁止修改 `main.js` 與 UI，且要求每個子批都讓 controller 行數下降。

依 `00-overview.md` 的 BLOCKED 判準，「批次檔前提與現況不符」必須停止，不可硬修。

## 盤點證據

`sessionController.js` 搜尋通知責任：

```text
src/sessionController.js:179:  // 都不進任何 payload,是純機械資源,留在 closure——收進 store 只會製造沒有訂閱者
src/sessionController.js:321:  store.subscribe("map", (current) => {
src/sessionController.js:385:  store.subscribe("mySessions", (current) => {
src/sessionController.js:757:  store.subscribe("courts", (current) => {
src/sessionController.js:845:    mapTools.subscribeToMapIdle?.(map, () => {
src/sessionController.js:854:    // Subscribe first so both synchronous fakes and Google's later idle event
src/sessionController.js:2030:      // The private DOM may currently contain a roster. Push the
```

以上只有 store／map 的 `subscribe` 字樣與一般英文註解；沒有通知偏好、Web Push、court subscription 的實作。

真正的通知責任位置：

```text
src/main.js:335:function defaultNotificationSettings() {
src/main.js:859:async function refreshNotificationSettings() {
src/main.js:886:async function updateNotificationPreferences(preferences) {
src/main.js:904:async function updateCourtSubscriptions(courtIds) {
src/main.js:935:async function seedAllTaipeiCourtSubscriptions() {
src/main.js:953:async function enablePushNotifications() {
```

資料 API 接線也在 `main.js`：`loadNotificationPreferences`、`saveNotificationPreferences`、`loadCourtSubscriptions`、`saveCourtSubscriptions`、`savePushSubscription`。畫面 callback 在 `main.js:1021,1085,1087-1088`；Me 與成功提示 UI 在 `src/pages/MePage.tsx`、`src/pages/MySessionsPage.tsx` 與 `src/sessionViews.js`。

`ControllerApi` 沒有 notification preference、push 或 court subscription 方法；B4 的 42 個公開方法也不能在 C 批改動。

## 為什麼不能硬做

### 方案 A：直接搬 `main.js` 通知流程

會違反 C 批凍結白名單：`main.js` 禁動、controller API 凍結、呼叫點要求零修改。

### 方案 B：搬聊天未讀或 toast，命名成 notifications

會把不同責任混為一談。聊天未讀已屬 C2/C3，toast 是跨 feature UI feedback；都不是派工明列的通知偏好、Push 或球場訂閱。這也無法提供 C6 要求的搬移對照。

### 方案 C：新增空的 notifications feature

controller 行數不會下降，沒有 runtime 責任被搬移，等於用空殼假裝完成，不符合驗收條件。

## Controller 行數

```text
C6 搬移前：2119 src/sessionController.js
C6 搬移後：2119 src/sessionController.js
```

沒有實作，因此行數不變；這也直接證明無法滿足「每子批單調下降」。

## C1–C5 已完成狀態

| 子批 | commit | controller 行數 |
| --- | --- | ---: |
| C1 discovery | `f65d0a7` | 2480 → 2406 |
| C2 session-lifecycle | `2be5511` | 2406 → 2263 |
| C3 chat | `14c4434` | 2263 → 2240 |
| C4 profile-auth | `f50c1d2` | 2240 → 2188 |
| C5 player-directory | `0fdbe5c` | 2188 → 2119 |

C1–C5 均有獨立回報與 commit；必要 gate 已通過。C6 只有本份 BLOCKED 回報 commit，沒有 runtime 變更；後續 D／E 批未開始，符合嚴格順序。

## 建議 Claude／使用者拍板

建議採以下其一，不能由本批自行假設：

1. **建議方案：修訂 C6 白名單與目標。** 允許修改 `src/main.js`，先把其中六個 notification use case 搬到 `src/features/notifications/`，由 main 保留 UI composition 與薄轉發；同時把 C6 的行數驗收改為量測 `main.js`，不要要求無相關責任的 controller 下降。這最符合真實 ownership。
2. **保守方案：取消 C6。** 明確記錄 notifications 本來就不在 controller，將 C1–C5 視為 C 批完成；另開新的獨立批次處理 main 的 notification 架構，並重新定義可動檔案、API 與 gate。

不建議把 notifications 硬塞進 controller；那會讓架構方向倒退。

## 白名單與未動範圍

- C6 沒有修改 `src/`、測試、UI、data facade、DB、migration、球場資料或環境設定。
- `git diff -- src/main.js src/sessionViews.js`：exit 0，無輸出。
- 沒有新增 runtime LINE 欄位、讀取、映射或渲染。
- 沒有 push、deploy、DB reset 或 migration。

## BLOCKED／偏差

- BLOCKED：是。
- 阻擋類型：批次檔前提與現況不符，且完成原目標需要修改明文凍結的 `main.js`／UI ownership。
- 偏差：無；依總則停止，沒有自行擴大權限或用不相干程式湊批次。
