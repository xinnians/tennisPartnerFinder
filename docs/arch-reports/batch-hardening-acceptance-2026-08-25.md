# 階段 1 加固批（H-1 Sentry／H-2 測試後門／H-3 AdvancedMarker）驗收紀錄

- 驗收日期：2026-08-25　驗收者：Claude
- 派工單：`docs/arch-dispatch-2026-08-25-hardening.md`
- 回報：`docs/arch-dispatch-2026-08-25-hardening-report-codex.md`
- 驗收範圍：基準 `68466e3` → HEAD `6ac9914`（三個 commit）

## 結論：**H-2／H-3 ACCEPTED；H-1 BLOCKED 判定成立**（依派工單條款屬正確完成，接線需使用者重新拍板契約）

## 一、H-1 Sentry：BLOCKED 判定成立 [已驗證]

- codex 依派工單「SDK 無法保證只送三欄就回報 BLOCKED」條款正確停手：
  repo 外 probe 顯示 `@sentry/browser@10.71.0` 即使關閉全部自動 context，
  on-wire event 仍固定帶 `platform`／`event_id`／`timestamp`／`sdk` 等
  8 個 top-level key——與 Sentry 官方 event payload model 的必填欄位一致，
  非設定可移除。
- 反向 grep [已驗證]：`@sentry`／`VITE_SENTRY_DSN` 於 package.json、src、
  vercel.json 零命中；`configureAppErrorTransport` 仍僅定義未呼叫；CSP 未動。
- 本地三欄 allowlist 安全網存在且有 PII 斷言
  （`tests/app-errors.test.js:26-39`：假暱稱／GPS／LINE／email 全反向斷言）。
- D-03 已顯式處置（`58c5d5c`）：hidden source map 維持不開，理由與重評前提落檔。
- **後續是使用者決策**（見驗收後呈報）：放寬 on-wire 契約（枚舉容忍的
  protocol 欄位）再接，或暫接受無外部監控。

## 二、H-2 測試後門 [已驗證]

- 單一讀取邊界 `src/e2eTestHooks.ts`（define guard＋tree-shaking）；原 6 個
  字面命中收斂為邊界內 1 處；`vite.config.ts` production define false。
- `check:production-bundle` 先以記憶體內 development build 自證掃描集非空，
  再斷言 production dist 零命中——雙向自證。
- **驗收方 canary**（紅→還原→綠）：在 `appErrors.ts` 加一個逃過邊界的
  side-effectful 字面讀取 → `npm run build`＋bundle check 紅
  （`production bundle still contains the E2E test hook`），還原重建後綠。
- **驗收程序教訓（記錄自己的錯）**：該腳本掃描**既有 dist/**、不重建
  production——canary 必須先 `npm run build` 再跑 check；驗收方前兩輪未重建
  導致假綠，補正後才得到有效紅。另：tree-shaking 會吃掉未使用 export 的
  讀取，canary 需用有側效的形式。
- mock e2e 零修改全綠（hooks 在 dev build 仍活著）。

## 三、H-3 AdvancedMarker [已驗證]

- `new google.maps.Marker` 3 → 1（唯一保留點＝集中 legacy fallback）；
  loader `v: "quarterly"`；`VITE_GOOGLE_MAPS_MAP_ID` 空值→legacy、
  有值→`importLibrary("marker")`＋AdvancedMarker（`map`／`position`／`content`
  property 形狀、`gmp-click`）。
- fakeMaps 替身同批對稱改契約；Playwright 強制 `DEMO_MAP_ID` 讓瀏覽器 e2e
  走 AdvancedMarker 路徑。
- **驗收方行為探針（覆蓋倒置疑慮）**：production 在使用者設定 Map ID 前
  跑的是 legacy fallback，而 e2e 全測 AdvancedMarker——驗收方暫時把
  e2e Map ID 清空、跑地圖／鍵盤／pin 相關 12 個測試 **12/12 綠**，證明
  重構後的 legacy 路徑在瀏覽器仍正確；config 已還原。
  觀察：使用者設好 hosted Map ID 後覆蓋自然對齊；在那之前本探針是
  legacy 路徑的瀏覽器級證據。
- local 首輪 timeout 依紀律處置（guarded reset 已揭露、輸出完整）；
  真 Map ID hosted QA 標註 [不確定] 留給使用者走查，正確。

## 四、凍結面 [已驗證]

變更恰 14 檔（三 commit）；GOLDEN／ME_GOLDEN／data-testid 對 `0be31a2`
維持已核可 hunk（codex 附 shasum，驗收方 diff 抽查一致）；`.claude/rules/`、
dataApi、文案、既有測試斷言零動。

## 五、驗收方獨立重跑

```text
test:ci:frontend  exit 0 — unit 305/305、Playwright 270／4 skipped、
                  bundle 649474/189151（限額內；含新 dev-hook-present 自證訊息）
test:db           799 PASS、exit 0
test:local        42 passed／11 skipped、did not run＝0、exit 0
git diff --check  乾淨；tracked worktree 乾淨
canary（H-2）     逃逸讀取＋rebuild → gate 紅；還原 rebuild → 綠
探針（H-3）       e2e Map ID 清空 → 地圖／鍵盤／pin 12/12 綠（legacy 路徑）
```

Playwright 未並發；驗收方未重置 DB（codex 執行過一次 guarded reset，已揭露）。

## 六、待使用者事項（驗收後移交）

1. **H-1 抉擇**：放寬 on-wire 契約（另立隱私決策批）或暫無外部監控。
2. **H-3 hosted**：Google Cloud console 建 Map ID → Vercel 設
   `VITE_GOOGLE_MAPS_MAP_ID` → push 部署 → hosted 走查（步驟見回報
   「H-3 hosted／console 操作」節）→ 之後另批刪 legacy fallback。
