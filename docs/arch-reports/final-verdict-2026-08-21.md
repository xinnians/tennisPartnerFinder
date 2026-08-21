# 全管線終驗判定（2026-08-21，批 C6R／C4 補正／D1–D4／E1–E3）

驗收方：Claude。範圍：commit `9f9e70d`（C6R）至 `eea1f0c`（E3）共 9 commit。
前段批次判定見 `handback-verdict-2026-08-21.md`。

## 總判定

**9 批全部 ACCEPTED，arch-hardening 管線開發側全案完成。**
11 個獨立驗收 agent 零 confirmed FAIL；所有 WARN 均已裁決（見下）。

## Gate 獨立重跑（不接 pipe，exit code 為準）

- typecheck、lint、prettier:check、test:session-unit 281/281、test:mock 266 passed／4
  skipped、build、check:production-bundle、`git diff --check`：全綠。
- `test:local`：local API 2 passed、supabase-chromium 42 passed／11 skipped、
  supabase-mobile-chromium 6 passed：全綠（本輪無 fixture 耗盡）。
- WebKit（非阻擋）：126 passed／6 failed／3 skipped，逐字等於既有基準，未劣化。
- 首輪 test:mock 曾紅一條（`smoke.spec.js:4108` 日期 chip「detached from DOM」）：
  隔離 `--repeat-each=5` 5/5 綠、全套重跑 266 綠，判定為負載相依 flaky；時間窗上也可能
  受下述驗收 agent 事故影響，非程式回歸。

## 量化終態（對照 2026-08-21 早上基線）

| 指標 | 基線 | 終態 |
| --- | ---: | ---: |
| React root（`createRoot` 呼叫點） | 18 root／5 呼叫點 | **1** |
| `flushSync`（tsx） | 30 | **2** |
| eager `import.meta.glob` | 18 | **2**（首頁範圍，派工允許） |
| `main.js` 行數／頂層 `let` | 1,580／33 | 1,483／28（全表分類在 batch-D3.md） |
| 型別覆蓋（ts+tsx 行數占比） | 42.5% | **60.7%**（js 7,867／ts 6,082／tsx 6,045） |
| 主 chunk | 714.34／200.64 kB | **639.90／184.71 kB** |

bundle gate：上限 703,886 raw／203,176 gzip（E1 實測×1.1）。**三拍由驗收方獨立重現**：
綠 → 上限暫調 600,000 驗紅（`AssertionError: 639896 exceeds 600000`）→ 精確恢復驗綠，
工作樹淨空。`npm run db:gen-types` 重跑 diff 為空。

## 邊界與契約（HEAD 視角）

supabase 呼叫全落在 facade＋`src/data/**`；`p_line_id: null` 凍結；LINE 聯絡面零讀寫渲染
（`lineProviderId` 僅登入 provider id，追蹤消費端確認）；migrations／supabase tests／
courts.json 零變更；依賴零新增；tsconfig 三值未動。React 契約：sheet 殼（backdrop／focus
trap／Escape／surface stack／焦點回復）100% 留在 `sheets.js`，React 以 `createPortal` 掛
內容槽，符合 react-migration 殼條款；Maps 維持 imperative；tests 全區間零斷言弱化。
E3 隱私由驗收方親驗：外送欄位凍結 `["errorName","kind","surface"]`＋「全 src 僅
appErrors.ts 引用註冊點」掃描測試＋production NOOP 斷言＋接線文件禁送清單。

## WARN 裁決紀錄

1. **D3 動了 `sessionController.js`（+67/−37）而 07 派工檔可動清單漏列**：逐行檢視限於
   單一 owner 所需的 store 欄位／API 接線，無夾帶。裁決＝派工方白名單缺口，已補註於
   07 派工檔，不退件。
2. **E1 基準數字 717.45 vs 驗收重測 717.20 kB**：0.03% 量測噪訊，方向與結論不受影響。
3. **E2 三拍缺過程級證據**：由驗收方獨立重跑三拍補齊（見上）。
4. **react-unmount.spec 全域 hook 隨 D2 內部改名**：斷言期望值逐字未變，屬綁內部結構
   契約測試的合法演進。

## 流程事故紀錄（不影響判定，留檔防再犯）

一個 D2 驗收 agent 曾對主工作樹誤跑 `git checkout 6dfb6f6 -- .`，隨即以
`git checkout HEAD -- .` 復原；終態 `git status` 0 項、staged diff 空，經清潔樹全套 gate
重跑背書無殘留影響。教訓：查歷史 commit 一律 `git show`／`git worktree`，禁止對主樹
checkout——已寫入派工 memory，後續驗收 prompt 明文禁止。

## 未盡事項（全屬非派工項，待使用者）

REL／push、hosted preview 人工 QA、CSP Report-Only→enforcing、error transport 廠商拍板
與接線（步驟見 `docs/error-transport-wiring.md`）、WebKit 六條實機 Safari 分類、
本機 `node_modules/node_modules` symlink 清理。
