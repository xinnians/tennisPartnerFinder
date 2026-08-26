# 前端架構分析比較報告：Claude vs Codex（2026-08-25）

> 流程聲明：Claude 先在未讀 Codex 文件的情況下完成
> `docs/frontend-design-architecture-analysis-2026-08-25-claude.md`（階段 A），
> 之後才讀取 `docs/frontend-design-architecture-analysis-2026-08-25-codex.md` 並撰寫本報告。
> 本報告中對 Codex 的每一項採信或反駁，都經過 Claude 重新以程式碼或指令實查；
> 標記沿用 [已驗證]／[推論]／[不確定]。階段 A 文件依指示不回改；
> 比較過程發現的階段 A 勘誤集中在 §12。

---

## 0. 先講結果

兩份分析在**大方向上高度一致**：不換框架、保留 Vite + React 19、完成「React 接管最後一哩」、
保留 dataApi 資料邊界、白箱測試分類處置、桌面雙欄等數據、README 的 LINE 流程已過期。
分歧集中在**優先級排序**（README 的嚴重度、CSS import order 的位階、拆大檔的時機）與
**個別建議的成本估計**（sheet 取代 drawer、feature 目錄大搬家、TanStack 的熱度）。
沒有任何一方建議會破壞隱私邊界、auth 防護或 bundle gate——分歧都在「先做哪個、多快做」。

## 1. 交叉驗證：Codex 的事實宣稱逐項實查

依驗收紀律，Codex 提出而 Claude 階段 A 未自行執行的證據，本階段全部重跑：

| Codex 宣稱 | Claude 實查結果 | 判定 |
| --- | --- | --- |
| `npm audit --omit=dev` 0 vulnerabilities | 實跑：`found 0 vulnerabilities` | [已驗證] 吻合 |
| 完整 `npm audit` 2 high、皆開發工具鏈間接依賴 | 實跑：`2 high severity vulnerabilities`，路徑經 `node_modules/postcss`（dev 工具鏈） | [已驗證] 吻合 |
| CSS 65.87 KB／gzip 10.86 KB | 實量 dist：65,865 B／gzip 10,886 B | [已驗證] 吻合 |
| 390px toolbar clientWidth 約 366、scrollWidth 約 463 | 實量（mock 5173、390×844）：`{clientWidth:366, scrollWidth:463, overflowX:"auto"}` | [已驗證] 分毫不差 |
| test:mock 286 passed／4 skipped | Claude 獨立實跑相同結果（56.1s） | [已驗證] 吻合 |
| 主 bundle 距 gzip gate 約 1 KB | gate 192,420 − 實測 191,332 ＝ 1,088 B | [已驗證] 吻合 |
| 大檔行數表（App 957、MySessions 853…） | 與 Claude `wc -l` 全部一致 | [已驗證] 吻合 |

**結論：Codex 的量化事實精確度極高，無一項被推翻。**

## 2. 雙方一致的事實與建議

1. 專案品質高：視覺識別、隱私邊界、stale/race 防護、測試安全網、漸進遷移策略都是資產。
2. **最大結構性成本是 React／legacy 雙軌交界**（snapshot、adapter、portal、同步 commit、
   controller 四層並存），下一步是「完成 React ownership」而不是換架構。
3. 不換框架：維持 Vite + React 19；不做 Next.js/Remix/SSR；React Router 現在非必要；
   不加 Redux/Tailwind/大型 UI 庫。
4. `dataApi → repositories/mappers → Supabase view/RPC` 邊界原樣保留。
5. 白箱測試要分類：保留隱私／欄位 allowlist／bundle／a11y fail-closed gate，
   退役純內部形狀測試，且「刪 adapter 時同步刪它的白箱測試」。
6. 主 bundle 654.84 KB 已貼 gate 上限；剩餘大宗是 React＋Supabase 合法 eager，
   不能靠 manualChunks 假拆解決；新增任何依賴前必先量 bundle。
7. README 的 LINE 互看流程已退役、必須修正。
8. 桌面雙欄：等 Analytics 裝置比例再決定（NP-05），兩方皆不建議立即實作。
9. 手機 chips 列可捲動但不可發現（雙方獨立發現同一問題；Codex 給了量測數字，
   Claude 給了 `overflow-x:auto`＋`::-webkit-scrollbar{display:none}` 的 CSS 證據，
   map-page.css:165-176——兩份證據互補、指向同一結論）。
10. 匿名「我的球局」登入卡下方的三個空區段是雜訊，應簡化。
11. checkJs:false 讓核心編排 JS 不受 TS 檢查，應分批 TS 化，不一次全改。

## 3. 結論不同之處、差異來源與判定

| # | 面向 | Claude 獨立結論 | Codex 結論 | 最終判定 | 證據／理由 |
| --- | --- | --- | --- | --- | --- |
| 1 | README LINE 過期的嚴重度 | **P0**（公開信任＋AI 誤導，半天可修） | **P2**（文件類） | **P0**（採 Claude） | 差異來源＝優先級評分，非事實。Codex 自己寫的影響（「新開發者可能重新加入已退役功能」「分析工具可能被誤導」）正是高風險低成本的定義；README.md:4、:16、:27-29 [已驗證] |
| 2 | CSS import order 位階 | **P2**（13 檔穩定、有註解與測試守護） | **P1**（不穩定邊界，先抽 tokens.css） | **P2 偏 P1 的折衷**：token 抽離提前做（見 §8），@layer 翻案仍不單獨立案 | 差異來源＝風險偏好。實查發現 token 抽離**已無測試阻礙**：contrast-tokens.test.js 現行版遞迴掃全部 src CSS（test:13-34），不再綁 session.css 單檔——比雙方原先想的都便宜 [已驗證] |
| 3 | 超大檔案拆分的時機 | 未列獨立 P1；視為雙軌接線的症狀，容器化後自然縮小再拆 | **P1**，第一階段就拆四大檔 | **折衷**：純展示子元件（區段卡片）現在就可拆；與 options-bag 接線耦合的部分等容器化後拆，避免拆兩次 | 差異來源＝技術取捨。MySessionsPage 的 options 與 actions 介面即佔 57 行（MySessionsPage.tsx:58-92、108-129 [已驗證]），元件內再逐層傳遞；先容器化可讓拆出的子元件介面不沿用肥大 options [推論] |
| 4 | flushSync／同步 commit | 獨立列 P1-2，量化「恰 3 caller」，設專批降到 0 | 有提「移除 syncCommit」（第二階段第 4 項）但未展開成本與效能面 | **採 Claude 的顯式專批＋量化標準**（3→0），納入 Codex 的階段位置 | Claude 證據較完整：sessionStore.ts:99-103 每次 emit 都 flushSync、syncCommit 全庫 3 caller [已驗證：grep] |
| 5 | TanStack Query 熱度 | 現在不導入；列明重評觸發條件（樂觀更新需求、cache 失效 bug 重現） | 現在不導入，但「比 Router 更可能有實質效益」，第三階段排 discovery/chat spike | **合併**：不排程導入；把兩方條件合成 spike 協議（§8）。追加一個雙方都沒點破的硬阻礙：**gzip gate 只剩 1,088 B，引入任何非平凡依賴前必須先由負責人重編 bundle 預算**，這使「現在不導入」不只是偏好而是 gate 事實 | 差異來源＝風險偏好；阻礙證據 [已驗證]：check-production-bundle 輸出 191,332／192,420 |
| 6 | sheet 疊層（詳情蓋在抽屜上） | 未列為問題（視為既有焦點契約的一部分） | 建議「詳情取代 drawer 內容」 | **方向可取、成本被低估；併入桌面雙欄設計時一起做**，不做獨立手機批 | 差異來源＝成本估計。取代式導覽會動到 sheets.js:24-50 的還原鏈與 pageViews.js 焦點意圖機制（drawer 卡片持續存在是 restore 目標的前提）[已驗證：程式碼]；相關 e2e 需重寫 |
| 7 | 目標目錄結構 | 保留現有佈局（controller/features/pages/sheets），只收斂接線 | features/*/api·model·ui 全面重組＋shared/ | **先採 Claude 的最小搬移；Codex taxonomy 作為終態選項**，若採用需獨立批處理封條 | 差異來源＝技術取捨。Codex 方案與現有 `src/features/`「純邏輯模組」語意衝突，且 legacy-style-scan 的目錄斷言、SURFACE_MANIFEST、appRuntime 副檔名表都會大面積跟動（tests/legacy-style-scan.test.js:21-41 [已驗證]）；此成本 Codex 未列 |
| 8 | 檔案行數上限 | 未設 | 建議 page/sheet <400 行 | 採納為**指引不設 gate**（避免再造一個字面封條） | 差異來源＝風險偏好；400 是合理經驗值但入 gate 會重蹈白箱耦合 |
| 9 | npm audit | 未執行（階段 A 限制） | 有執行並給結論 | **Codex 勝出項**；Claude 補跑後確認 | §1 |
| 10 | chips 修法 | 加 fade／捲動提示 | **釘住「篩選」在右側**，其餘 quick filter 捲動 | **採 Codex 方案**（完整篩選入口不應被藏住的論證成立），fade 為次選 | 差異來源＝設計取捨；兩方事實一致 |
| 11 | CLAUDE.md 漂移（map.ts/pins.ts、10 個 features、controller/pages/sheets 未列） | P0-2 | 未提及 | **納入最終方案**（併 P0 文件批） | Claude 獨有發現 [已驗證]：`ls src/features` 10 目錄 vs CLAUDE.md「六個」 |
| 12 | README／index.html 品牌名不一致（球局 vs 球咖） | 有 | 未提及 | 併入文件批 | README.md:1 vs index.html:16 [已驗證] |
| 13 | 白箱耦合量化 | 142 個 `__importAppModule` 字面點、manifest／export scan 逐項列 | 定性描述（檔案長度、選擇器字面、module path） | 兩方同結論；**量化目標採 Claude（142→<50）** | grep 實測 [已驗證] |
| 14 | 型別債細節 | eslint 10 條 no-unsafe-* 整批關閉（eslint.config.js:83-100） | 只提 checkJs:false | 兩者都對；完成標準併列「checkJs 開啟＋unsafe 豁免歸零」 | [已驗證] |
| 15 | 匿名首頁輕量 REST client（不載完整 Supabase SDK） | 未提出 | P2 提出，明確要求先 spike | **成立、保留為 spike 候選**；Claude 補充一個 Codex 未列的成本：`restoreAuth()` 在 boot 就跑（main.js:694），回訪的已登入者會付 auth 延遲，spike 必須涵蓋 | 差異來源＝發現面不同；[已驗證：main.js:688-698] |
| 16 | 桌面雙欄前的中間態 | 提出低成本置中／max-width 過渡 | 只畫了終態雙欄圖 | 採 Claude 的中間態＋Codex 的終態設計圖 | 互補 |
| 17 | 評估框架 | tech-debt 評分（Impact+Risk × 6−Effort） | 四標準檢核表（命中率／落地風險／複雜度收益／驗證方式） | 兩者互補；本報告 §11 用 Codex 的四標準互評 | — |

**差異來源統計**：17 項分歧中，0 項來自事實判讀錯誤（雙方事實全部互相印證）；
7 項是優先級／風險偏好（#1、2、5、8、10 等）；6 項是技術取捨（#3、6、7、16 等）；
4 項是發現面不同（#9、11、12、15——各自漏看對方有的東西）。

## 4. 哪一方的證據較完整

- **量測與外部工具面：Codex 較完整**——npm audit（兩種模式）、CSS 產物體積、
  toolbar clientWidth/scrollWidth 實測數字。三項 Claude 皆補驗吻合。
- **程式內部結構與行為面：Claude 較完整**——flushSync 恰 3 caller、142 個白箱字面點、
  22 個 callback／26 個 props 的變更放大路徑、TS 化率 73%（JS 5,567 行）、
  `pageOwnerIdentity` 跨帳號防護、雙源 props/store 樣式（MessagesPage.tsx:93-95）、
  Escape 焦點還原與深連結 empty sheet 的行為實測、與 NP-01～06 既有 ADR 的逐條對齊。
- **視覺建議的具體度：Codex 較好**（釘住篩選、雙欄線框、取代式詳情）；
  **視覺問題的證據鏈：Claude 較好**（CSS 行號、a11y name 實測）。

## 5. 哪一方可能忽略了重要成本或風險

Codex 忽略／低估的：

1. **feature 目錄大搬家與封條測試的碰撞面**（§3 #7）：legacy-style-scan 的目錄非空斷言、
   SURFACE_MANIFEST、appRuntime 副檔名映射都會跟著大改；其第一階段「拆四大檔」若含搬目錄，
   實際成本高於文中印象。
2. **「詳情取代 drawer」的焦點契約重寫成本**（§3 #6）。
3. **TanStack spike 的 gate 前置**：1,088 B gzip 餘裕下，spike 若要進 main bundle
   必然先觸發棘輪紅燈；「導入前必須量 bundle」該升級為「導入前必須重編 gate 預算」。
4. README 誤導的**對外**風險（公開 repo 對使用者與潛在貢獻者宣稱交換 LINE）壓成 P2。

Claude（階段 A）忽略／不足的：

1. **未跑 npm audit**——依賴健康只憑版本新舊推論，Codex 補上了實據。
2. chips 問題只有 CSS 證據沒有量測數字；Codex 的 366/463 更有說服力。
3. 視覺改善方案不如 Codex 具體（fade 提示 vs 釘住篩選——後者更好）。
4. 對「匿名輕量 REST client」這條 bundle 想像力不足，沒有主動提出。
5. 階段 A 引用了 session.css 的過時檔頭描述（見 §12 勘誤）。

## 6. Codex 建議中，Claude 原本沒發現、檢查後認為成立的

1. **npm audit 納入常規驗證**：實跑吻合（prod 0；full 2 high 於 dev 間接依賴）。成立。
2. **釘住「篩選」chip、其餘 quick filter 捲動**：比 fade 更直接解決「完整篩選入口不可藏」。成立。
3. **匿名首頁輕量 REST discovery client 的 spike 候選**：成立（附加 `restoreAuth` 延遲成本
   必須納入 spike 範圍，見 §3 #15）。
4. **「每刪一段 adapter 就同步刪它的白箱測試」原則**：把測試退役綁定在 adapter 退役上，
   比 Claude 原本的「獨立測試重分類批」更不容易漏。成立，兩者合併使用。
5. **page/sheet <400 行的經驗值**：成立為指引（不入 gate）。
6. **「不要為了讓測試不變而永久保留不合理的檔案組合」**：直指 session.css 三塊合併檔的
   存在理由；配合 §12 勘誤（該測試已泛化），這個組合現在就可以拆。成立。

## 7. Codex 建議中，Claude 檢查後不同意（附證據）

1. **CSS import order 列 P1**：不同意位階。13 檔結構自批 10 以來穩定、順序有 main.js:2-19
   註解與多重測試守護、實際翻車案例為零（migration-reports 無此類回歸紀錄 [推論]）；
   相比之下雙軌接線每個功能批都在付稅。維持 P2，但把「token 抽離」提前（因實查已無阻礙）。
2. **「詳情取代 drawer 內容」作為獨立改善**：不同意現在做。sheets.js:52-57 的
   「detail 置換 court drawer 並保留原 opener」與 resolveRestoreTarget 的抽屜語境
   fallback（sheets.js:24-50）都以「drawer 持續存在」為前提；改成取代式要重寫還原契約
   與對應 e2e。建議併入桌面雙欄設計（右欄天然是取代式）一次解決。
3. **第一階段就全面拆四大檔**：不同意順序（見 §3 #3 折衷）。
4. **目標 taxonomy（features/*/api·model·ui）作為近期目標**：不同意近期執行；
   作為終態選項保留。理由見 §3 #7。

## 8. Claude 建議中，Codex 沒有提出、值得納入的

1. **CLAUDE.md 程式結構節更新**（map.ts/pins.ts、10 features、controller/pages/sheets/views）
   ——AI 協作地基，漂移會複製錯誤前提到所有後續派工。
2. **README／index.html 品牌名對齊**（球局 vs 球咖）。
3. **flushSync 降級專批與「3→0 caller」量化標準**。
4. **量化完成標準組**：新功能觸碰檔案 ≤3、main.js ≤300 行、`__importAppModule` 142→<50、
   legacy JS <500 行、unsafe 豁免 10→0。
5. **桌面中間態**（置中 max-width、收攏漂浮元素）不必等雙欄拍板。
6. **TanStack 重評觸發條件清單**（樂觀更新需求擴大、cache 失效類 bug 重現）＋
   **bundle gate 重編列為前置決策**。
7. **`#9db3a4` ×3 等散落色票收 token**（discovery.css:37、vocabulary.css:44、:84）。
8. **球局卡 SR 名稱冗長**與（Codex 也提的）匿名頁簡化併成一個 a11y/文案小批。

## 9. 兩份方案對既有保護面的影響檢核

| 保護面 | Claude 方案 | Codex 方案 | 檢核結論 |
| --- | --- | --- | --- |
| Supabase 資料與隱私邊界 | 不動 dataApi/repositories/mappers；ESLint 邊界規則沿用 | 同樣明文保留（其目標架構 data/ 原樣） | **兩案皆不破壞**。唯 Codex 的「輕量 REST client」spike 若實作，必須仍走 dataApi facade 與 select allowlist，不可另開請求路徑 |
| Auth identity 切換 | controller／authSnapshot／SURFACE_TRANSITIONS 保留到最後批 | 第二階段把 surface registry 收斂進 React context/store | 兩案皆可保住，但 **Codex 第二階段風險略高**：`authIdentityChanged` 的批次關閉語意（sessionController.js:137-146）要在 React 化的 surface stack 中逐條移植並以既有 identity-switch e2e 驗證 |
| Stale request 防護 | requestGate＋epoch 全數保留；Query spike 需證明等價 | 同；第三階段盤點 gate/poller 後才動 | 兩案皆不破壞；合併後規則＝「gate 只可在 spike 證明等價後被取代，不可先刪」 |
| Focus／sheet 行為 | 殼遷移批凍結 aria/testid/焦點契約，e2e 保綠 | 同方向；另有「詳情取代 drawer」會改變契約 | 基本盤兩案皆守；**取代式詳情單獨執行會破壞現行還原鏈**，已改列入雙欄設計（§7.2） |
| Bundle gate | 棘輪沿用；新依賴前先重編預算 | 同（明文「先量 bundle」） | 兩案皆不破壞；補強為「重編 gate 預算是負責人決策，不是工程自行放寬」 |
| 現有測試 | 行為測試保留；白箱封條隨 adapter 退役分批改寫，保留隱私/品牌/對比/bundle 封條 | 同原則 | 兩案一致；合併 keep-list 見下 |

**白箱測試合併處置清單**：
保留（不變量封條）——public-brand-scan、legacy-style-scan 的禁用色票段、contrast-tokens
的 WCAG 實算、data-mapper-guards、security-headers、check-production-bundle、
session-data-boundary、a11y 行為 e2e。
逐批退役（結構鏡像）——react-surface-lifecycle 的 import/export 掃描、SURFACE_MANIFEST
計數比對、F2D facade export scan（sessionViews.js 的 prettier-ignore 群）、
`__importAppModule` 直呼（隨 adapter 消失改為行為斷言）、檔案長度／單行形狀類斷言。

## 10. 使用者指定問題的最終回答

1. **React／legacy 雙軌是不是最優先？** 是「最優先的結構問題」（兩方一致）；
   但「最優先的行動」是半天可完成的文件真實批（README＋CLAUDE.md）——先修會說謊的地圖，
   再拆橋。
2. **controller、store、snapshot、portal 先拆哪個？** 先拆 **snapshot／page-slot 的
   options-bag 接線**（renderXInApp 相容層）：它是變更放大的主因、拆除後 portal 自然消失。
   controller 與 store **不拆**——它們是 stale／identity 防護的權威來源，是資產；
   surface registry 最後收斂。Codex 的「App ownership」與此同向，順序上 Claude 更明確。
3. **是否應保留 Vite + React 19？** 保留（兩方一致、零分歧）。
4. **TanStack Query 現在導入是否值得？** 不值得。三重理由：requestGate/epoch 語意
   Query 不原生提供；NP-01 的 mapper 繞過風險仍在；**gzip gate 僅剩 1,088 B，導入前
   必先重編預算**。保留「discovery 或 chat 單點 spike」作為未來動作，觸發條件＝
   樂觀更新需求擴大或 cache 失效 bug 重現。
5. **React Router 是否真的有必要？** 沒有。路由總量＝PAGE_ROUTES＋7 行 sessionRoute.js
   ＋10 行 routeCurrentHash，已含跨帳號防護；Router 解決的是這裡不存在的問題（兩方一致）。
6. **是否有充分理由改用 Next.js 或 Remix？** 沒有。SSR 對登入牆＋client 地圖無收益，
   且觸動 auth/push/隱私重驗（兩方一致）。若未來要 SEO，採 Codex 的「獨立公開 landing」
   而不是整站換框架。
7. **CSS import order 應如何改善？** 短期：把 token 抽成 `styles/tokens.css`（實查已無
   測試阻礙，見 §12）＋落檔「新樣式不得依賴跨檔順序」規則；中期：@layer 翻案（NP-04）
   併入白箱測試改寫批評估，不單獨立案；不導入 Tailwind（兩方一致）。
8. **現有白箱測試哪些保留、哪些退役？** 見 §9 合併清單；執行原則採 Codex 的
   「隨 adapter 退役同步刪」＋Claude 的量化終點（142→<50）。
9. **桌面雙欄應立即實作，還是等實際裝置比例？** 等 Analytics（NP-05，兩方一致）；
   但先做零風險中間態（置中 max-width、收攏孤立元素），並把「詳情取代 drawer」
   留給雙欄設計一併解。
10. **README 的 LINE 流程是否已過期？** 是，雙方獨立確認（README.md:4、:16、:27-29）。
    列 P0 立即修（判定理由見 §3 #1）。

## 11. 以 Codex 的四標準互評可信度

| 標準 | Codex 分析 | Claude 分析 |
| --- | --- | --- |
| 問題命中率 | 高：五個 P1 全是真痛點；但優先級略通膨（CSS order） | 高：P0/P1/P2 與 effort 掛鉤；漏 npm audit 面 |
| 落地風險 | 大方向安全；兩處成本低估（目錄重組、取代式詳情） | 批次全部可回滾；對封條碰撞面的預估較準 |
| 複雜度收益 | 不加框架、收斂權威來源，判斷正確 | 同；另把「不導入」綁到 gate 事實與觸發條件，更可執行 |
| 驗證方式 | 驗證清單完整、數字精確；完成標準偏定性（僅 <400 行是數字） | 驗證清單相當＋行為走查；完成標準全部可量測 |

**互評結論**：Codex 強在外部量測與設計方案具體度；Claude 強在內部結構量化、
契約成本預估與可量測收斂標準。兩份合併後互補面大於重疊面。

## 12. 階段 A 勘誤（Claude 自查，非因 Codex 而改）

依指示不回改階段 A 文件，勘誤記錄於此：

1. **P1-3 中對 contrast-tokens.test.js 的描述部分過時**。階段 A 引用 session.css:7-18
   檔頭所述「正則要求選擇器頂格、規則體同一行、本檔長度 >10,000 字元」。實查現行測試
   （tests/contrast-tokens.test.js:13-34、136-145）：已改為**遞迴掃描 src 全部 CSS**、
   要求合併掃描集 >10,000 字元與每檔 >100 字元、三個聊天 selector 需「頂格存在且使用
   token」但**不再限定所在檔案、也不要求規則體單行**（`[^}]*` 可跨行）。main.js:7 的
   註解（「不再限制 token 所在檔」）才是現況。影響：該小例證弱化，但 P1-3 主張
   （白箱耦合整體）不變——142 個字面呼叫點、export scan、manifest 皆仍成立；
   且 session.css 檔頭本身成為 P0-2「文件漂移」的又一實例，token 抽離與三塊合併檔
   的拆分**現在就可做**，比階段 A 假設的更便宜。
2. 階段 A 曾以「檔案 >10,000 字元」歸因於 session.css 單檔，實為合併掃描集門檻，同上。

## 13. 最終共同建議（整合方案）

**維持 Vite + React 19 與全部既有邊界，依下列順序完成 React ownership；
不引入任何新框架或狀態庫；每批附帶對應白箱測試的同步退役。**

### 最優先的五個行動

1. **文件真實批（P0，約半天）**：重寫 README（球局群聊流程、React 化後的專案地圖、
   品牌名對齊「球咖」）；更新 CLAUDE.md 程式結構節；順手修 session.css 過時檔頭；
   `#9db3a4` 收 token。
2. **新碼規則落檔（P0，數小時)**：禁止新增 portal-to-legacy adapter、native-listener
   相容層、未檢查的 JS controller（Codex 第一階段第 5 項，成本趨零、立即止血）。
3. **容器化批 I（P1）**：Messages＋Me 頁改 ControllerProvider/context 注入＋自行訂閱，
   淘汰該兩頁 options bag；同批刪除對應白箱斷言；建立後續所有批的樣板。
4. **chips 可發現性＋匿名頁簡化（P1，小批）**：釘住「篩選」chip（Codex 方案）；
   匿名 My Sessions 收斂為單一登入引導。
5. **容器化批 II → 殼遷移 → syncCommit 3→0 → TS 化收尾**（依 §14 順序滾動）。

### 明確不建議做的事

- 換 Next.js／Remix／SSR；引入 React Router、Redux、Zustand、Tailwind、大型 UI 庫。
- 現在導入 TanStack Query（未過 spike 協議與 gate 重編前）。
- 為消 Vite 500 KB warning 而做 manualChunks 假拆。
- 立即實作桌面雙欄或「詳情取代 drawer」（等 Analytics＋一併設計焦點契約）。
- 把 <400 行檔案上限做成測試 gate（重蹈字面封條）。
- 一次性 feature 目錄大搬家（api/model/ui taxonomy 保留為終態選項，需獨立評估封條成本）。
- 在 spike 之外實作匿名輕量 REST client。

### 建議執行順序

```text
批0 文件真實批（README/CLAUDE.md/檔頭勘誤/品牌/色票token）
批0.5 新碼規則落檔（禁止新增 legacy pattern）
批1 容器化 I（Messages+Me；ControllerProvider 樣板；同批刪對應白箱）
批2 容器化 II（MySessions+NearbyDrawer；焦點意圖改元件內 effect）
批3 殼遷移（sheets.js→React；aria/testid/焦點契約凍結沿用）
批4 syncCommit 降級（3→0；e2e 改行為等待）
批5 TS 化收尾（main/sessionController/sessionViews/views；unsafe 豁免歸零）
批6 大檔拆分收尾＋（可選）@layer 評估（此時白箱封條已瘦身）
隨時可插：chips 釘住篩選、匿名頁簡化、桌面中間態
等數據：桌面雙欄（含取代式詳情）；等觸發條件：TanStack spike、輕量 REST spike
```

### 可量測完成標準（合併版）

新功能觸碰檔案 ≤3；main.js ≤300 行；sessionViews.js＋pageViews.js 退役或合計 ≤200 行；
syncCommit caller 3→0；`__importAppModule` 142→<50；legacy JS（不含 mockData）<500 行；
ESLint unsafe 豁免 10→0 且 checkJs 開啟；page/sheet 檔案以 <400 行為指引；
bundle 棘輪與 mock suite 時間不升；README/CLAUDE.md 與 `ls src` 及實際流程逐項對齊。

## 14. 仍需由產品負責人決定的問題

1. **bundle gate 重編預算**：任何新依賴（含 TanStack spike 上線）前，gzip gate 是否
   從 192,420 上調、上調多少（現餘 1,088 B）。
2. **白箱封條退役清單逐項核可**：§9 的「退役」列每一項是否有負責人不願放棄的守護目的。
3. **@layer（NP-04）是否翻案**：併入批 6 評估時拍板。
4. **桌面雙欄啟動門檻**：Analytics 的裝置比例達到多少才啟動（NP-05 的量化版）。
5. **feature 目錄終態 taxonomy** 是否採用 Codex 的 api/model/ui 分層。
6. （沿用路線圖既有待辦）CSP enforcing、`profiles.line_id` DB 清理、REL-public 種子供給。

## 15. 對兩份分析各自的可信度與不足（總結）

- **Codex**：可信度高——所有可驗數字經 Claude 重跑無一失誤；驗證面（npm audit、量測）
  比 Claude 廣；設計建議具體。不足：優先級通膨（五個 P1）、兩處成本低估（目錄重組、
  取代式詳情）、完成標準偏定性、漏看 CLAUDE.md 漂移與品牌不一致、無白箱耦合量化。
- **Claude**：可信度高——結構主張皆附 file:line 與 grep/實跑證據，行為面（焦點、深連結、
  demo 模式）有實測。不足：漏跑 npm audit、chips 無量測數字、UX 方案具體度較低、
  一處引用過時檔頭（§12 勘誤，結論不受影響）。
- **合併判斷**：兩份分析互為對照後結論收斂度約八成，剩餘兩成分歧全部屬於順序與成本估計，
  已在 §13 逐項裁決；沒有需要仲裁的事實衝突。
