# Phase CL 退件修正單（FIX,三條）

- 日期：2026-08-29。主交件=`docs/arch-dispatch-2026-08-28-eslintCL-closing-report-codex.md`。
- 退件性質:**派工單設計缺陷**(斷言 3 的 grep 方案),非執行失誤;主交件其餘
  全部通過驗收(config 手術/generator 退役/接線/凍結面/拍組 A/synthetic/
  真實暫退/零掃描),**本單只修三條,已通過部分不重做**。
- 工作基準:現有 working tree(porcelain 恰 5 條)之上直接修;不 commit、不 push。

## FIX-1:斷言 3 重寫(ESLint API 版,取代 grep regex)

對立審查隔離副本實測:現行 regex 可被①bare `/* eslint-disable */`
②規則名距 `eslint-disable` 超過 200 字元的具名 disable(6 個規則名列多行
即自然超標)③`/* eslint @typescript-eslint/unbound-method: "off" */`
inline rule-config——三形式繞過,且都同時過 lint 與現 gate。

重寫 `tests/eslint-unbound-policy.test.js` 第三個 test 為「終端行為」斷言
(審查 PoC 已實測):

```js
const eslint = new ESLint({ cwd: ROOT, overrideConfig: { linterOptions: { noInlineConfig: true } } });
const results = await eslint.lintFiles(files);   // files=斷言 2 同一列舉(84 檔)
const hits = results.flatMap((r) => r.messages.filter((m) => m.ruleId === RULE));
assert.equal(hits.length, 0, ...);
```

- 原理:`noInlineConfig` 使所有 inline 註解失效後實際跑 lint,**只取本規則**
  的命中——其他 15 處合法 disable 產生的訊息被 ruleId 過濾,不受影響。
- 保留掃描集非空斷言(`files.length >= 70`;與斷言 2 共用列舉可提為共用
  常數)。刪除 regex 與 `src/**` 115 檔文字掃描(斷言 3 的列舉改同斷言 2)。
- 實測效能 ~4s(隔離副本),`test:session-unit` 全域可接受。
- 順帶:斷言 1 的行內註解「A single rule-name occurrence also proves no
  files-scoped override…」語意過強(混淆式縮限實測由斷言 2 擋),改寫或
  刪除該行註解。

**有牙拍(必做,逐字入回報)**:乾淨樹新 test 3 passed→三攻擊各一拍
(①bare ②具名 disable 且 gap ≥210 字元 ③inline rule-config,各暫插
`src/` 任一檔或臨時 canary 檔)→新斷言 3 各**紅**(抄失敗原文)→精確
還原→綠+SHA 對。拍組 A(off 回歸)不需重做(斷言 1/2 未動)。

## FIX-2:`eslint.config.js:83` 遺留註解改寫

現行 `:83`「`// 既有 type-aware 型別債，本批不改變既有程式語意。`」在
`:84` 已定形 `"error"` 後語意相反。改寫為不含規則名的終態描述(例:
`// type-aware 恢復管線終態：本區塊規則全為專案明訂 error。`)——
**不得含 `unbound-method` 字面**(會觸發斷言 1 的出現次數=1 誤殺,審查
已實測)。改後 policy test 仍 3 passed。

## FIX-3:回報修正

在主回報檔(report-codex.md)修正:①§9 Q2 重寫(舊 regex 三形式可繞過,
已改 ESLint API 方案+三攻擊拍證據);②§3 貼新 test 全文;③§5 拍組 B
補三攻擊拍紀錄;④§8 矩陣的 policy gate 行更新。其餘章節不動。

## 驗收條件

1. 新 test 全文防偽+三攻擊拍逐字。
2. `eslint.config.js` diff 仍恰兩 hunk(:83-84 同 hunk 內多一行註解變更
   可接受,scoped 區塊刪除 hunk 不變);規則名全檔仍恰 1 次。
3. porcelain 仍恰 5 條;`src/**`(除臨時拍還原)/四資產 零 diff。
4. 收尾:typecheck/lint/prettier/session-unit(349)/mock/local 全綠照跑。
