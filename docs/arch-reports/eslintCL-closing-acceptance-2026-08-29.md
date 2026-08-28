# ESLint 恢復 Phase CL 收攏批驗收紀錄（ACCEPTED——管線全案完結）

- 日期：2026-08-29。派工單：`docs/arch-dispatch-2026-08-28-eslintCL-closing.md`（f568e47）
  ＋退件修正單 `docs/arch-dispatch-2026-08-29-eslintCL-fix.md`（2d5a8b1）。
- Codex 回報:`docs/arch-dispatch-2026-08-28-eslintCL-closing-report-codex.md`（含 FIX 修正）。
- 結論：**ACCEPTED**。`@typescript-eslint/unbound-method` 全庫明訂 `error`、28-path
  scoped 區塊移除、永久 policy gate 三斷言上線（接入 `test:session-unit`）、遷移
  generator 退役、四資產凍結為歷史。**Phase A–E、FR、R1、R2、CL 全案完結**:
  baseline 246 筆全清,ledger 246,manifest 0/0。

## 退件與修正歷程（一輪)

首輪對立審查退件 3 條:①grep 版 inline-disable 斷言被三形式實測打穿
（bare／gap>200 具名／inline rule-config,三者同時騙過 lint 與 gate）——
**派工單設計缺陷**（排除 `noInlineConfig` 的理由不成立:正解是開了之後只
assert 本規則,其他 15 處合法 disable 由 ruleId 過濾);②回報 Q2 過度宣稱;
③config `:83` 遺留「型別債」註解語意相反。FIX 單三條修正後複核**全部閉環**。

## 最終驗收證據鏈

- porcelain 恰 5 條;config diff 恰兩 hunk（`:83-84` 註解＋off→error、scoped
  區塊整刪）;規則名全檔恰 1 次;`src/**`／四資產／acceptance docs 零 diff;
  generator 已 `D`（退役前最後 `--check` 綠=0/0、G2 對 246 條→10 份 docs
  最後查核）。
- **新 gate 有牙(驗收方親自複跑)**:三攻擊拍（bare／gap220 具名／inline
  rule-config,tracked canary）各精確紅（`findings hidden by inline
  configuration`）;off 回歸拍紅（fail 2）;乾淨樹 3/3 綠;還原後 SHA 全對。
- **對立複核加做載重拍**:純違規零 disable 檔→斷言 3 紅於精確 line:col——
  證明 `overrideConfig` 未連帶關規則,斷言 3 非空斷言;攻擊 C（ignores 縮限）
  ／D（混淆 computed key）仍被**斷言 2** 擋住。
- synthetic canary（舊 28-path 外建檔→lint 精確紅→刪）;真實暫退
  SurfaceHost `:15`→九 sheet 檔精確紅→SHA 還原;獨立零掃描 84 檔 exit 0;
  `--print-config` 六檔（路徑先 `ls`,`[2]`×5＋main.js undefined）。
- 收尾矩陣（乾淨隔離態）:typecheck／lint／prettier／build／bundle（淨 0 B）
  ／session-unit **349**（346＋gate 3）／mock 298＋4／local API 2/2＋browser
  45/11／`git diff --check`。

## Gate 結構記帳（對立複核要求,後續 agent 必讀）

- **斷言 2 與斷言 3 覆蓋面不重疊,不得擇一刪除**:斷言 2 管 config 層
  （scoped 縮限、ignores、混淆 key——config 面的唯一承重者）;斷言 3 管
  inline 層（noInlineConfig 實 lint）。刪任一條,對應面立刻裸奔。
- **untracked 檔窗口**:兩斷言列舉自 `git ls-files`,untracked 的
  `.ts`＋inline disable 交集對 gate 隱形（commit 前必經 git add,實務窗口
  窄;純違規 untracked 檔仍被 `npm run lint` 磁碟 glob 抓）。**探針教訓**:
  canary 檔必須 `git add` 後拍,否則會誤判 gate 沒牙——驗收方實際踩過。
  可選硬化（3 行,實測會綠,留待日後）:在 `assertCompleteTypeScriptFileSet`
  加「磁碟集==tracked 集」斷言。
- config 內**不可**用規則名寫說明註解（觸發斷言 1 恰一次翻紅,fail-closed）。
- gate 成本:policy test ~7.3s(84 檔 type-aware 實 lint),session-unit 全域可忽略。

## 驗收操作教訓（本批新增)

- **探針不可與 gate 鏈平行**:首輪 mock 假紅=我的暫退探針與背景 gate 平行
  污染;隔離重跑即綠。探針做完才開 gate。
- **同名多處的暫退還原禁全域替換**:perl 全域替換把 SurfaceHost `:31`
  `SurfaceShellHandle.unmount`（shell 契約,R2 審查點名不可動）誤轉——改
  行號定位還原。同名符號檔內多處時,暫退/還原一律行號定位。
- test:local 累積污染第三見(open 162+full 70 同型水位)→guarded reset 三拍。

## 後續(管線外)

- databaseTypes 2 筆=`no-redundant-type-constituents` generated debt,維持
  單檔 override,另案評估 Supabase 新版輸出（不塞回已退役的 ledger）。
- `.claude/rules`／CLAUDE.md 無 unbound 遷移期描述,無需同步（grep 已驗）。
- 可選:`.claude/rules/testing.md` 加一句 policy gate 說明;untracked 硬化
  3 行——均另案。
