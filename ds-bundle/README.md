# 網球球局地圖設計系統 — 使用慣例(v2 計分板改版完成版)

台北市網球公開球局 MVP(手機優先,QA 基準 390px)。視覺語言「計分板」:墨綠 ink、球場綠 court、optic 黃 signal、紙白底、1.5px 實線框(`--border-strong`)與 mono 數字。v2(D1–D9,2026-08-11)已全站落地。

## 設定與包裹

不需要 provider 或框架。純 HTML+CSS:引入 `styles.css` 即可(closure:`tokens/tokens.css` + `_ds_bundle.css`)。字體 Noto Sans TC(內文 400/500/700)、IBM Plex Mono(數字,只有 500/600;`font-synthesis:none`,不要寫 700 mono)、Barlow Condensed(600/700,只用於 eyebrow 與品牌字)。

## 樣式語彙(唯一正典,不要發明新色值或新 class)

- 顏色一律走 token:`--color-ink`/`--color-court`/`--color-signal`(高亮,只配 ink 底或 ink 字)/`--color-surface-page`/`--color-surface-card`/`--color-text-secondary`/`--color-line`/`--color-danger(-bg)`/`--color-success(-bg)`/`--color-info-bg`/`--color-disabled-bg`/`--color-disabled-text`。深底(ink)上的非活躍字用 `#9db3a4`(慣例色,不循淺底映射)。
- 字階 `--text-xs`…`--text-2xl`;間距 `--space-1`…`--space-8`;圓角 `--radius-sm/md/lg/xl/pill`;框線 `--border-strong`(1.5px ink)/`--border-thin`;動效 `--ease-brand` 配 keyframes `qmSheetUp/qmFade/qmPop/qmSlide/qmToast`。
- **時間磚**:`.time-tile`(mono 時間+日期副行;`--compact` 58px、`--detail` 74px、`--ongoing` ink 反相)。**記分板條**:`.scoreboard-strip`(三格 `__cell`,`__eyebrow`+`__value`,`__cell--inverse` ink 反相格)。**NTRP 磚**:`.ntrp-brick`(ink 底 signal mono;`--sm` 內聯小磚)。
- **chips**:`.chip`(基底;`--form` 表單選項、`--district` 小號、`--time` mono)、選中態 `.is-selected`(ink 反相);程度選項 `.band-option` 選中 `.is-active`。`.toggle-switch[aria-checked]`(52×31 軌+knob,熱區已擴 44px)。
- 按鈕:`.session-primary`(ink 底 signal 字,每畫面至多一顆;`--instant` signal 底 ink 字)、`.session-secondary`、`.session-tertiary`(court 綠底線文字鈕)、`.filters-reset`、`.surface__close`。
- 卡片:`.session-card`(`__body/__title/__court/__meta/__foot/__chevron`+`.slots-brick` 缺額磚)、`.my-session-brief`(薄卡列)+狀態章 `.my-status-chip(--info/--success/--danger/--host)`、badge `.session-badge(--instant/--ongoing/--candidate/--host)`。
- 地圖首頁:`.map-topbar`(`__row`)、`.app-brand`(`__dot/__name/__code`)、`.city-chip`、`.topbar-icon-button`、`.map-toolbar`(chips 列)、`.level-popover`、`.map-zoom-controls`(44px 直欄)。
- 抽屜/面板:`.nearby-peek`(收合條)與 `.nearby-drawer`(兩態,無 backdrop);`.surface`+`--sheet/--dialog`、`.surface__head/__eyebrow/__copy`;詳情 `.session-detail`(`__head/__court/__meta/__scoreboard`、`.host-row`、`.candidate-decide-panel`、CTA `.cta-row/.cta-status(--pending/--joined/--disabled)/.cta-text-action/.cta-footnote`);篩選 `.filter-sheet__grabber/__scroll/__footer`。
- 全螢幕流:開球局 `.create-v2__*`(segmented/court-cell/stepper/固定底鈕漸層座)+成功頁;我的球局 `.my-sessions-v2__*`(segmented+空狀態);訊息頁 `.messages-*`;聊天室 `.chat-v2__*`+泡泡 `.chat-message`(他人)/`--self`(success-bg 右尖)/`--system`(pill)。
- 導覽:`.bottom-navigation`(ink 底 h84)+`__item`+置中 `__create`(52px signal 方圓鈕上移)、`.my-sessions-badge`(數字)、`.my-sessions-unread-dot`(訊息格圓點)。
- 回饋:`.toast`(ink 深底+signal 勾)、全域錯誤提示 `.app-error-notice`(可關閉,ink 深底,批 19 新增)、區塊級 fallback `.app-error-fallback`(React error boundary,批 19 新增)。

## 不可破壞的規範

- 對比一律過 WCAG AA;`--color-text-secondary` 不要調淡。
- 觸控目標 ≥44px;focus 樣式是全域 `:focus-visible { outline: 3px solid var(--color-court) }`,元件不要寫 `outline:none`。
- 動效走 `--ease-brand`;全域已有 `prefers-reduced-motion: reduce` 降級,不要繞過。
- 時間與數字用 `--font-mono` + `font-variant-numeric: tabular-nums`。

## 真相所在

樣式全文:`styles.css` → `tokens/tokens.css`(token 全表)+ `_ds_bundle.css`(app 實際 stylesheet 逐字複製,含全域基座)。組合示範見 `components/<群組>/<名稱>/` 卡片;`components/screens/` 是 mock 模式 390×844 實機截圖(地圖區為本機 fallback 底,正式站是 Google Maps)。

## 慣用寫法示範(取自實作)

```html
<button type="button" class="session-card">
  <span class="time-tile"><span class="time-tile__start">19:00</span><span class="time-tile__date">08/12 三</span></span>
  <span class="session-card__body">
    <span class="session-card__title"><span class="session-card__court">大安運動中心網球場</span>
      <span class="session-badge session-badge--instant">直接加入</span></span>
    <span class="session-card__meta">雙打 · NTRP 3.0–4.0 · 主揪 阿哲 3.5</span>
    <span class="session-card__foot"><span class="slots-brick">缺 2 位</span></span>
  </span>
  <span class="session-card__chevron" aria-hidden="true">›</span>
</button>
```

---

## 元件索引(2026-08-11 回同步,repo HEAD 2685213;2026-08-21 補充批 19 錯誤狀態元件,其餘卡片未重驗)

### 動作 Actions
- **Buttons**(`components/actions/Buttons/Buttons.html`)——primary / secondary / tertiary / instant / CTA 狀態列與選中態
- **Chips**(`components/actions/Chips/Chips.html`)——chip 基底/變體/選中態、band-option 與 toggle-switch

### 卡片 Cards
- **Session Card**(`components/cards/SessionCard/SessionCard.html`)——v2 球局卡(時間磚+內容)/球友卡/我的球局薄卡列與狀態章

### 回饋 Feedback
- **Toast 與狀態**(`components/feedback/Toast/Toast.html`)——v2 toast(ink 底+signal 勾)/ 地圖狀態 chip / 清單狀態列 / badge
- **錯誤狀態**(`components/feedback/ErrorStates/ErrorStates.html`)——全域錯誤提示 toast(`.app-error-notice`)/ 區塊級 fallback(`.app-error-fallback`,批 19 新增)

### 基礎 Foundations
- **Design Tokens**(`components/foundations/Tokens/Tokens.html`)——計分板配色/字階/間距/圓角/陰影/停用態/動效(v2 D1)
- **計分磚 Bricks**(`components/foundations/Bricks/Bricks.html`)——time-tile / scoreboard-strip / ntrp-brick / slots-brick

### 導覽 Navigation
- **Bottom Navigation**(`components/navigation/BottomNav/BottomNav.html`)——v2 五格導覽:4 個 __item + 置中浮起 __create,含數字徽章與未讀圓點

### 畫面 Screens
- **「我」頁**(`components/screens/MePage/MePage.html`)——mock 模式 390×844 實截(已登入態,v2)
- **我的球局頁**(`components/screens/MySessions/MySessions.html`)——mock 模式 390×844 實截
- **球局群組聊天室**(`components/screens/ChatRoom/ChatRoom.html`)——mock 模式 390×844 實截
- **球局詳情 sheet**(`components/screens/SessionDetail/SessionDetail.html`)——mock 模式 390×844 實截(v2)
- **篩選 sheet**(`components/screens/FilterSheet/FilterSheet.html`)——mock 模式 390×844 實截(v2)
- **訊息頁**(`components/screens/Messages/Messages.html`)——mock 模式 390×844 實截
- **開球局全螢幕流**(`components/screens/CreateSession/CreateSession.html`)——mock 模式 390×844 實截
- **附近球局(兩態抽屜・展開)**(`components/screens/DrawerOpen/DrawerOpen.html`)——mock 模式 390×844 實截
- **首頁(地圖+頂列)**(`components/screens/MapHome/MapHome.html`)——mock 模式 390×844 實截(v2)

### 聊天 Chat
- **群組聊天**(`components/chat/Chat/Chat.html`)——v2 泡泡三型(他人/自己/系統)+ 名冊 + 輸入區

### 面板 Surfaces
- **Sheet 與表單**(`components/surfaces/Sheet/Sheet.html`)——surface sheet + 表單契約 + 篩選 sheet grabber/footer + 球局詳情頭部摘要
