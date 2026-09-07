# FA-06 階段 4.1：surface 結構 gate manifest 化

- 日期：2026-09-07
- 基準 commit：`55244c3`
- 範圍：tests／fixture／文件；零 runtime 變更
- 結果：完成；新 gate、canary 與完整 frontend CI 通過

## 白話結論

測試不再假設 lazy loader、unmount 接線與登入後預載一定住在 `sessionViews.js`。這三個 owner 現在由既有
surface manifest 指定，因此下一批搬檔時，測試會檢查「新 owner 是否完整保留契約」，不會只因檔名改變就失敗。

這批沒有搬任何 production code，也沒有改 UI。它只先把安全網改成能支援後續重構的形狀。

## 實際變更

### Manifest

`SURFACE_MANIFEST.structureSources` 新增 3 個 frozen owner：

- `authenticatedPreload`
- `lazySurfaceLoaders`
- `unmountRegistrations`

三者初值都指向目前真實 owner `src/sessionViews.js`。manifest 由 81 行變為 86 行，import consumers 仍是原本 3 支，
沒有另建第二份 manifest。

### Lifecycle gate

- 新增 fail-closed source reader：只接受 `src/` 內明確的 `.js`／`.ts`／`.tsx` 路徑，檔案不存在或內容為空會失敗。
- 14 個 unmount registration 改掃 manifest 指定 owner，仍逐名對照完整名冊。
- 14 個 lazy sheet 仍要求 object key 與 `import()` 字面完全相同；再依 owner 位置正規化為 repo path，逐名對照
  manifest。因此 loader 從 `src/` 搬到 `src/views/` 時，不需要把相對路徑誤認成不同 sheet。
- authenticated preload 改掃 manifest 指定 owner，仍要求 `preloadAuthenticatedViewsForAuth(authSession)` 只有在
  `authSession` truthy 時才 warm。
- `main.js` 仍必須只有一個 production caller，且位於 verified `onAuthIdentityChange` 路徑；這條 gate 未移除。

### 精確退役 5 組純字面凍結

依 preflight 用歷史 commit 核對的清單，移除：

1. lazy object 不得含 `eager:` 的字面檢查。
2. `pointerover` 必須排在 `focusin` 前面的字面檢查。
3. 舊 `renderStage` 名稱不得出現於 `sessionViews.js` 的字面檢查。
4. `sessionPresentation.ts` 恰有 13 個 `Object.freeze` 的計數。
5. 三份歷史 migration report 的特定措辭檢查。

真正的 eager 1、lazy sheets 14、lazy pages 3、auth-only warm、unmount 14、close order、single root、
`syncCommit` 2 callers、navigation 4 與可及性斷言仍保留。`sessionViews.js` 相容 facade 仍有另一條獨立的
`Object.freeze` 恰 1 gate；那不是本次退役項，沒有刪除。

## Canary

把 manifest 的 `lazySurfaceLoaders` owner 暫時改成不存在的 `src/sessionViews-missing.js`：

```text
not ok 3 - non-home pages and sheets stay behind explicit preloadable module boundaries
error: ENOENT: no such file or directory, open '/Users/ian/tennisPartnerFinder/src/sessionViews-missing.js'
1..7
# pass 6
# fail 1
exit 1
```

還原成 `src/sessionViews.js` 後：

```text
1..7
# pass 7
# fail 0
exit 0
```

這證明 manifest owner 不是只寫著看的註記；指錯檔案會立即翻紅。最終 working tree 沒有殘留 canary。

## 驗證結果

Targeted lifecycle／presentation／app error／ownership／privacy／CI config：

```text
1..125
# pass 125
# fail 0
```

完整 frontend CI：

```text
typecheck: pass
lint: pass
prettier: pass
Node: 638 passed / 5 skipped
Playwright Chromium: 348 passed / 4 skipped
build: 524 modules transformed
bundle structural checks: pass
git diff --check: pass
```

Bundle 數字與本批前相同：main 650,113／191,175／159,810，total JS
852,737／261,314／220,788 raw／gzip／Brotli。開發期 raw／gzip 仍只有 report，結構與隱私 gate 全部通過。

## 未做與下一步

- 未修改 `src/`、migration、依賴、bundle limit、Hosted、secret、deploy 或 runtime 開關。
- private repository、LINE、demo identifier、E2E hook gate 都未刪除或放寬。
- 下一批是 4.2：把 14 個 sheet loader、mount binding、preloader 與 `deferSurfaceOpen` 搬到已指定的
  `src/views/surfaceLoaders.js`，同步重掛 HTML renderer 與 mutation ledger。
