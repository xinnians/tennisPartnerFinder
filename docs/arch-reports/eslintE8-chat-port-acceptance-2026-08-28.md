# ESLint 恢復 Phase E-8 驗收紀錄（chat controller ports 11 筆，首個 body-destructure 批）

- 日期：2026-08-28。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-28-eslintE8-chat-port.md`；Codex
  回報：`docs/arch-dispatch-2026-08-28-eslintE8-chat-port-report-codex.md`。
- 驗收方法：本機重跑完整 gate（含 test:local）＋親自複跑紅簽章／抽樣
  canary（單行 toast＋多行 openChat）／erased-token／餘檔 byteEqual＋
  唯讀對立審查 agent（opus，精簡三面）。

## 結論：**ACCEPTED**

## 通過項（全部本機重驗）

1. **紅簽章十三條** [已驗證]：missing×11 依表序＋209/198＋23/22;
   manifest SHA=HEAD。
2. **規則有牙**（親自抽樣）:暫退 toast＋openChat（多行含尾行）→恰紅
   2 筆於 body 解構行 `74:5/81:5`（非宣告行,body-destructure 型態
   確認）→還原 SHA `f3eee694…7e11` 與回報候選逐字一致→綠;Codex
   全量 canary 11 筆行號=manifest line 欄。
3. **erased-token** [已驗證]:6,273 bytes、SHA `48de8b43…364e`（對立
   審查獨立複算同值）;**餘檔 byteEqual**（切 `:29-59` 後 9,429 bytes,
   FULL byteEqual=false 證明非空斷言）[已驗證]。
4. **零越界**（對立審查）:五個 hunk 全落 `:29-59`,改動恰 13 行（11
   宣告＋2 多行尾行）;nested 5/canWithdraw/courts/非目標 4/`:66-68`
   mine 全零 diff;`--print-config` chat=error、lifecycle/intent=off。
5. **回報防偽全中**:七 SHA、ad-hoc 13 errors 實測、198/22 與 187/22
   算術經對立審查獨立重算。
6. **Gate 9/9 全綠** [已驗證]:unit 346×2、mock 298/4、local API 2＋
   browser 45/11、bundle 淨 0 B。

## E-9（lifecycle ports 11,無 selector 批）派工輸入（對立審查產出並核驗）

- 11 筆 stableId／宣告行／finding 行表=對立審查回報（`4500e451…`
  beginLifecycleAction:58-62 起,finding 108-116/119/120;interface
  `:56-78`,14 成員=11 目標＋api:57/store:74/surfaceRegistry:75）。
- **形狀差異**:lifecycle 是 parameter-destructure——finding 行就在
  factory 簽名的參數解構 `:106-121` 內;E-8 的「factory signature
  凍結」措辭不可照抄,改為「參數解構 `:106-121` 十四行逐字不動」。
- **餘檔 byteEqual 區間=`:56-78`**（23 行),一條涵蓋 LifecycleDataApi
  ／兩 Handlers／結果 interface／解構／實作。
- **凍結**:`LifecycleDataApi:25-40`（含 extraction 兩宣告點
  accept:26/decline:34——動了 canary 差分失效）;DecideHandlers
  `:42-47`／EditHandlers `:49-54`;inline nested `onConfirm:71`;
  **結果 interface `:80-99` 對應 sessionController:455-465 十一筆
  （`requireMySessionAction:87-90` 與 `withdrawMySession:98` 是與
  E-8 剛轉的 deps 成員同名同形陷阱,獨立標紅）**。
- 傳播面:`sessionController.ts:47/:54/:115/:116/:120`（三個 indexed
  access,多於 E-8 的一個);construction `:438-453` 唯一,`api: api!`
  唯一非 shorthand。
- **canary=ad-hoc override 差分**（committed config 對該檔仍 off,
  本批不加 selector）:現況 `npx eslint --rule …` 恰 13
  （11 ports＋extraction 230:49/230:80）→修完應**恰 2 且逐 line:col
  列舉**（洞 A 修正:還原拍也以 13 個 line:col 列舉,非裸計數）→
  暫退再回 13。紅簽章=missing×11＋`findings expected 198, received
  187`＋**無 files 條目**（該檔仍餘 2 筆,22 檔不變）。
- **已知守門空窗（洞 C,記帳）**:generator `--check` 不在 CI;E-9
  落地後至 extraction 批上線 selector 前,這 11 筆 port 無自動守門,
  僅靠 ledger 強掃——extraction 批應緊接排入。

## Ledger 追加（本紀錄即 acceptanceDoc）

十一筆依 manifest 序:`e700dada…`／`d79fd5ad…`／`0bb560ee…`／
`70000263…`／`63a82b1a…`／`7e9f1007…`／`da1560bb…`／`abb1fa02…`／
`c4c01719…`／`ee4c9bb3…`／`99a96b72…`
（`src/controller/chatController.ts`，batch "E-8"）。重生後
manifest=198／22／63。

## 量化更新

- `unbound-method`：209→**198**／23→**22** 檔;上線 6 檔;
  controller-callback-port 44→33。
- bundle／unit 346／mock 298／local 45 基準不變。
