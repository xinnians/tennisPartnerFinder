# 球局直接加入模式（join_mode）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 主揪建局時可選「直接加入」（instant）或「需審核」（approval，現行預設）；instant 局申請即原子成為 accepted，LINE 揭露模型不變；附帶 host 開局上限 5。

**Architecture:** `sessions.join_mode` 欄＋`request_to_join_session` 的 instant 分支（insert requested → 同 transaction update accepted，零 trigger 變更）＋`session_discovery`/`my_session_participations` 尾端加欄＋前端建局表單 radio 與詳情 CTA 分支。Spec：`docs/superpowers/specs/2026-07-21-instant-join-mode-design.md`。

**Tech Stack:** Supabase migration（plpgsql、definer RPC、pgTAP）、原生 ES modules（無框架/TS/linter）、node --test、Playwright。

## Global Constraints

- 已套用的 migration 不可修改；本 plan 一律新增 `supabase/migrations/202607210001_session_join_mode.sql`（若當日已有其他新 migration，流水號順延並全文同步改名）。
- 所有前端讀寫只經 `src/dataApi.js`；raw table 不是 browser API。
- `innerHTML` 動態內容一律 `esc()`；UI 與註解繁體中文。
- 測試紀律：`npm test` 不重置 DB；清庫唯一入口 `CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test`；pgTAP 先紅後綠（gate 三拍：存量綠 → canary 紅 → 實作綠）。
- 不可 push；commit 由 plan 步驟明列、精確路徑 stage，不用 `git add -A`。
- Playwright 標題 grep 一律帶 `--project`。
- 行號引用以錨定字串為準（檔案會漂移），改前先 grep 錨點。

---

### Task 1: pgTAP canary — allowlist 與 instant 生命週期斷言（先紅）

**Files:**
- Modify: `supabase/tests/session_rls.sql`

**Interfaces:**
- Produces: 對 Task 2 migration 的可證偽驗收條件。

- [ ] **Step 1: 確認存量綠（三拍第一拍）**

```bash
npx supabase start
CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test
npm run test:db
```
Expected: 全綠（`session_rls.sql` plan(243)、`my_profile_rls.sql` plan(16)、courts 全 PASS）。不綠先停：基底已壞，回報監督 session。

- [ ] **Step 2: 更新兩個 allowlist 斷言字串（canary）**

在 `session_rls.sql` 中 grep 錨點 `discovery has the exact public SessionSummary allowlist`，該斷言的期望字串尾端加 `,join_mode`：

```sql
  'id,session_id,sport_code,court_id,court,court_district,court_lat,court_lng,start_at,play_type,ntrp_min,ntrp_max,slots_total,slots_remaining,notes,host_nickname,host_ntrp,host_profile_complete,status,join_mode',
```

`my_session_participations` 的斷言**不是** ordered string，而是子集檢查（grep `table_name = 'my_session_participations'`，形如 `column_name in ('viewer_role', ..., 'can_confirm_attendance') ... having count(*) = 8`）：把 `'join_mode'` 加進 `in (...)` 清單，並把 `having count(*) = 8` 改為 `= 9`。這樣 migration 前 count 為 8 ≠ 9 會紅（canary 有牙），migration 後轉綠。

- [ ] **Step 3: 新增 instant 生命週期與 SESSION_LIMIT 斷言**

在檔案「6 個 RPC 到期邊界」段之前（grep 錨點自行定位一個既有 fixture 段落之後）新增一段。fixture 模式沿用檔內慣例（`insert into auth.users ... on conflict do nothing` → `set local role authenticated` → `set_config('request.jwt.claim.sub', ...)` → 透過 RPC 建資料 → `reset role` 後用 `set_config('pgtap.xxx', ...)` 傳 id）。新增使用者 uuid 用檔內未用過的 `...2001`（instant host）、`...2002`（instant guest A）、`...2003`（instant guest B）、`...2004`（limit host）。斷言內容（每一條 `select is(...)`/`throws_ok(...)` 都要計入 plan 數）：

```sql
-- === instant join mode ===
-- instant host 建 instant 局（缺額 1）
select is(
  public.create_session(
    (select id from public.courts where is_active and city = '台北市' order by id limit 1),
    '單打', now() + interval '5 days', null, null, 1, '__pgtap_instant_session__', 'instant'
  ) is not null, true,
  'instant host creates an instant session'
);

-- join_mode 非法值被拒
select throws_ok(
  $$ select public.create_session(
       (select id from public.courts where is_active and city = '台北市' order by id limit 1),
       '單打', now() + interval '5 days', null, null, 1, null, 'bogus') $$,
  'P0001', 'INVALID_TRANSITION',
  'create_session rejects an unknown join_mode'
);

-- guest A 直接加入回 ACCEPTED
select is(
  public.request_to_join_session(current_setting('pgtap.instant_session_id')::bigint),
  'ACCEPTED',
  'instant join returns ACCEPTED immediately'
);

-- 該列已是 accepted、initiated_by 預設 guest
select is(
  (select participant_row.status from public.session_participants participant_row
   where participant_row.session_id = current_setting('pgtap.instant_session_id')::bigint
     and participant_row.role = 'guest'),
  'accepted',
  'instant join persists an accepted guest row'
);

-- 補滿最後缺額後球局轉 full
select is(
  (select session_row.status from public.sessions session_row
   where session_row.id = current_setting('pgtap.instant_session_id')::bigint),
  'full',
  'instant join fills the last slot atomically'
);

-- 滿局再 join 拋 SESSION_FULL（guest B）
select throws_ok(
  $$ select public.request_to_join_session(current_setting('pgtap.instant_session_id')::bigint) $$,
  'P0001', 'SESSION_FULL',
  'joining a full instant session raises SESSION_FULL'
);

-- 雙方 accepted 後 contact 互看（instant 路徑沿用 LINE 模型）
select is(
  (select count(*)::integer from public.session_contacts
   where session_id = current_setting('pgtap.instant_session_id')::bigint),
  1,
  'instant accepted pair exposes exactly one contact row to the guest'
);

-- === SESSION_LIMIT ===
-- limit host 連開 5 局成功後，第 6 局拋 SESSION_LIMIT
select throws_ok(
  $$ select public.create_session(
       (select id from public.courts where is_active and city = '台北市' order by id limit 1),
       '單打', now() + interval '6 days', null, null, 1, '__pgtap_limit_6__', 'approval') $$,
  'P0001', 'SESSION_LIMIT',
  'the sixth concurrent future session is rejected'
);
```

注意：
- 上列為斷言骨架，fixture 的 auth.users insert、set_config 切換、與「limit host 先開 5 局」的迴圈（可用 `select public.create_session(...)` 連續 5 次、每次不同 notes）依檔內既有模式補齊。
- contact 斷言要在 guest A 的 jwt 下執行（viewer 視角）。
- 檔首 `plan(243)` 依實際新增斷言數更新（含 fixture 中以 `ok()` 包住的建立斷言）。

- [ ] **Step 4: 跑紅（三拍第二拍）**

```bash
npm run test:db
```
Expected: FAIL——兩個 allowlist 斷言（實際欄位無 `join_mode`）、`create_session` 8 參數版不存在（`function ... does not exist`）等。記下失敗清單；若此時全綠代表 canary 無牙，停下重查。

- [ ] **Step 5: Commit**

```bash
git add supabase/tests/session_rls.sql
git commit -m "test: join_mode 與 SESSION_LIMIT 的 pgTAP canary（預期紅）"
```

---

### Task 2: Migration `202607210001_session_join_mode.sql`（轉綠）

**Files:**
- Create: `supabase/migrations/202607210001_session_join_mode.sql`

**Interfaces:**
- Consumes: 0003 的 `private.lock_and_expire_session`、`private.require_complete_profile`、`private.viewer_profile_id`。
- Produces: `create_session(p_court_id, p_play_type, p_start_at, p_ntrp_min, p_ntrp_max, p_slots_total, p_notes, p_join_mode default 'approval') returns bigint`；`request_to_join_session(p_session_id) returns text` 可回 `'ACCEPTED'`；`session_discovery`（20 欄，尾欄 `join_mode`）；`my_session_participations`（尾欄 `join_mode`）。

- [ ] **Step 1: 撰寫 migration**

檔案內容依序四段。**段 1：欄位**

```sql
alter table public.sessions
  add column join_mode text not null default 'approval'
  check (join_mode in ('approval', 'instant'));
```

**段 2：`create_session` 換簽名（drop 舊 + 新建 + 重下 grant）**。新函式全文＝現行 0003:772-862 版本加三處：參數尾新增 `p_join_mode text default 'approval'`；大 if 驗證加 `or p_join_mode is null or p_join_mode not in ('approval', 'instant')`；`require_complete_profile` 後新增上限 guard；insert 欄位與 values 各加 `join_mode`/`p_join_mode`：

```sql
drop function public.create_session(bigint, text, timestamptz, numeric, numeric, integer, text);

create or replace function public.create_session(
  p_court_id bigint,
  p_play_type text,
  p_start_at timestamptz,
  p_ntrp_min numeric,
  p_ntrp_max numeric,
  p_slots_total integer,
  p_notes text,
  p_join_mode text default 'approval'
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  host_profile bigint;
  tennis_sport_id bigint;
  taipei_court_id bigint;
  created_session_id bigint;
  host_open_session_count integer;
begin
  host_profile := private.require_complete_profile();

  -- 單一主揪同時掛在架上的未來球局上限，siege 防護
  select count(*)
  into host_open_session_count
  from public.sessions session_row
  where session_row.host_profile_id = host_profile
    and session_row.status in ('open', 'full')
    and session_row.start_at > now();

  if host_open_session_count >= 5 then
    raise exception 'SESSION_LIMIT';
  end if;

  if p_start_at is null or p_start_at <= now() then
    raise exception 'SESSION_STARTED';
  end if;

  if p_play_type is null
    or p_play_type not in ('單打', '雙打', '對拉', '練球')
    or p_slots_total is null
    or p_slots_total not between 1 and 3
    or (p_notes is not null and char_length(p_notes) > 500)
    or p_join_mode is null
    or p_join_mode not in ('approval', 'instant')
    or ((p_ntrp_min is null) <> (p_ntrp_max is null))
    or (p_ntrp_min is not null and (
      p_ntrp_min not between 1.0 and 7.0
      or p_ntrp_max not between 1.0 and 7.0
      or p_ntrp_min > p_ntrp_max
    )) then
    raise exception 'INVALID_TRANSITION';
  end if;

  select sport_row.id
  into tennis_sport_id
  from public.sports sport_row
  where sport_row.code = 'tennis'
    and sport_row.is_active;

  if tennis_sport_id is null then
    raise exception 'INVALID_TRANSITION';
  end if;

  select court_row.id
  into taipei_court_id
  from public.courts court_row
  where court_row.id = p_court_id
    and court_row.is_active
    and court_row.city = '台北市';

  if taipei_court_id is null then
    raise exception 'INVALID_TRANSITION';
  end if;

  insert into public.sessions (
    sport_id, host_profile_id, court_id, play_type, start_at,
    ntrp_min, ntrp_max, slots_total, notes, join_mode
  )
  values (
    tennis_sport_id, host_profile, taipei_court_id, p_play_type, p_start_at,
    p_ntrp_min, p_ntrp_max, p_slots_total::smallint, p_notes, p_join_mode
  )
  returning id into created_session_id;

  insert into public.session_participants (session_id, profile_id, role, status)
  values (created_session_id, host_profile, 'host', 'accepted');

  return created_session_id;
end;
$$;

revoke all on function public.create_session(bigint, text, timestamptz, numeric, numeric, integer, text, text) from public, anon, authenticated;
grant execute on function public.create_session(bigint, text, timestamptz, numeric, numeric, integer, text, text) to authenticated;
```

**段 3：`request_to_join_session` instant 分支**。全文＝現行 0003:864-928 版本，在既有 prior_status 檢查之後、原 insert 之前插入 instant 分支（宣告區加 `accepted_guest_count integer;`）：

```sql
  if locked_session.join_mode = 'instant' then
    -- 直接加入：insert requested 再同交易轉 accepted，
    -- 完整沿用 participant trigger 的轉移與容量防護。
    select count(*)
    into accepted_guest_count
    from public.session_participants participant_row
    where participant_row.session_id = locked_session.id
      and participant_row.role = 'guest'
      and participant_row.status = 'accepted';

    if accepted_guest_count >= locked_session.slots_total then
      update public.sessions
      set status = 'full'
      where id = locked_session.id
        and status = 'open';
      raise exception 'SESSION_FULL';
    end if;

    insert into public.session_participants (session_id, profile_id, role, status)
    values (locked_session.id, guest_profile, 'guest', 'requested');

    update public.session_participants
    set status = 'accepted'
    where session_id = locked_session.id
      and profile_id = guest_profile;

    if accepted_guest_count + 1 = locked_session.slots_total then
      update public.sessions
      set status = 'full'
      where id = locked_session.id;

      update public.session_participants
      set status = 'declined'
      where session_id = locked_session.id
        and role = 'guest'
        and status = 'requested';
    end if;

    return 'ACCEPTED';
  end if;
```

**段 4：兩個 view 尾端加欄**（create or replace 只能尾端加，grant 由 view 保留不需重下）。全文重貼 0003:1240-1288 的 `session_discovery` 定義，select 清單最後（`session_row.status` 之後）加 `session_row.join_mode`，`group by` 不需加（`session_row.id` 已是 group key 的函數依賴來源，但為與現檔風格一致、避免舊版 postgres 歧義，直接在 group by 清單尾端加 `session_row.join_mode` 亦可）；同法重貼 `my_session_participations`（0003:1290-1370），select 尾端（`can_confirm_attendance` 之後）加 `session_row.join_mode`。

- [ ] **Step 2: 跑綠（三拍第三拍）**

```bash
CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test
npm run test:db
```
Expected: 全 PASS，plan 數與斷言數一致。若 `SESSION_LIMIT` canary 誤傷既有 fixture（某既有 host 開局 ≥ 5），把該 host 的部分測試球局改由其他既有測試帳號建立，不放寬上限。

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/202607210001_session_join_mode.sql supabase/tests/session_rls.sql
git commit -m "feat: 球局新增 join_mode 直接加入模式與 host 開局上限"
```

---

### Task 3: dataApi 與 mockData

**Files:**
- Modify: `src/dataApi.js`（`SESSION_SUMMARY_COLUMNS`、`sessionSummaryValues`、`SESSION_ACTION_CODES`、`ACTION_MESSAGES`、`createSession`、`requestToJoinSession`）
- Modify: `src/mockData.js`（每筆加 `joinMode`）
- Test: `tests/session-data-boundary.test.js`、`tests/session-data-local-api.test.js`（若其斷言 SELECT 字串）

**Interfaces:**
- Produces: `SessionSummary.joinMode: 'approval'|'instant'`；`createSession({..., joinMode = 'approval'})`；`requestToJoinSession(sessionId)` 回 `{ outcome, accepted, reloadRequired }`；錯誤碼 `SESSION_LIMIT` 與文案。

- [ ] **Step 1: 先跑 unit 存量**

```bash
npm run test:session-unit
```
Expected: 綠。

- [ ] **Step 2: 修改 dataApi**

1. `SESSION_SUMMARY_COLUMNS` 陣列尾端（`"status"` 之後）加 `"join_mode"`。
2. `sessionSummaryValues` 回傳物件加 `joinMode: asText(row.join_mode)`（放 `status` 之後）。
3. `SESSION_ACTION_CODES` 加 `"SESSION_LIMIT"`；`ACTION_MESSAGES` 加
   `SESSION_LIMIT: "你同時開放中的球局已達上限，請先處理現有球局。"`。
4. `createSession` wrapper：

```js
async function createSession({ courtId, playType, startAt, ntrpMin = null, ntrpMax = null, slotsTotal, notes = null, joinMode = "approval" }) {
  const sessionId = await callRpc("create_session", {
    p_court_id: asNumber(courtId),
    p_play_type: playType,
    p_start_at: startAt,
    p_ntrp_min: ntrpMin == null ? null : asNumber(ntrpMin),
    p_ntrp_max: ntrpMax == null ? null : asNumber(ntrpMax),
    p_slots_total: asNumber(slotsTotal),
    p_notes: notes == null ? null : asText(notes),
    p_join_mode: joinMode,
  });
  return { sessionId: asNumber(sessionId) };
}
```

5. `requestToJoinSession` 改為不走 `callLifecycleRpc`（其 outcome allowlist 不含 ACCEPTED）：

```js
async function requestToJoinSession(sessionId) {
  const outcome = await callRpc("request_to_join_session", { p_session_id: sessionId });
  if (outcome !== "OK" && outcome !== "ACCEPTED" && outcome !== "SESSION_EXPIRED") {
    throw new SessionActionError("UNKNOWN_ACTION_ERROR");
  }
  return { outcome, accepted: outcome === "ACCEPTED", reloadRequired: outcome === "SESSION_EXPIRED" };
}
```

6. `mapMockSessionSummary` 若逐欄映射需補 `joinMode`（先讀該函式；若是直接展開則只需 mock 資料帶欄位）。

- [ ] **Step 3: mockData 每筆補 `joinMode`**

`MOCK_SESSIONS` 六筆各加 `joinMode: "approval"`，其中 `sessionId: 9002` 改為 `joinMode: "instant"`（保留一筆 instant 供 mock UI 驗證）。

- [ ] **Step 4: 補/修 unit 斷言後跑綠**

`tests/session-data-boundary.test.js` 對 `SESSION_DISCOVERY_SELECT`/`MY_SESSIONS_SELECT` 的既有斷言是 `.includes()` 子集檢查——加欄不會破、**不需改**。但同檔約 459 行有一則 `assert.deepEqual(..., { outcome: "SESSION_EXPIRED", reloadRequired: true })` 鎖住 `requestToJoinSession` 的 2-key 回傳形狀，本 task 改為 3-key 後它會紅：把期望物件補上 `accepted: false`。另新增一則：

```js
test("requestToJoinSession maps ACCEPTED outcome", async () => {
  const api = createDataApi({
    configured: true,
    client: { rpc: async () => ({ data: "ACCEPTED", error: null }) },
  });
  const result = await api.requestToJoinSession(9001);
  assert.equal(result.accepted, true);
  assert.equal(result.reloadRequired, false);
});
```

（`createDataApi` 的 client 注入形狀以檔內既有 fake client 測試為準，比照撰寫。）

```bash
npm run test:session-unit
```
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/dataApi.js src/mockData.js tests/session-data-boundary.test.js
git commit -m "feat: dataApi 與 mock 支援 join_mode 與 ACCEPTED 結果"
```

---

### Task 4: 建局表單與驗證

**Files:**
- Modify: `src/sessionViews.js`（`validateCreateSessionInput`、`openCreateSessionSheet`）
- Test: `tests/session-create-form.test.js`

**Interfaces:**
- Produces: `validateCreateSessionInput` 的 `value.joinMode`；表單 radio `name="joinMode"`。

- [ ] **Step 1: 先寫失敗測試**

`tests/session-create-form.test.js` 新增：

```js
test("joinMode 預設 approval 且只接受合法值", () => {
  const base = { courtId: "101", playType: "單打", slotsTotal: "1", startAtLocal: futureLocal(), notes: "" };
  assert.equal(validateCreateSessionInput(base).value.joinMode, "approval");
  assert.equal(validateCreateSessionInput({ ...base, joinMode: "instant" }).value.joinMode, "instant");
  assert.equal(validateCreateSessionInput({ ...base, joinMode: "bogus" }).valid, false);
});
```

（`futureLocal()` 之類的未來時間 helper 以檔內既有寫法為準。）跑 `npm run test:session-unit`，Expected: 新測試 FAIL。

- [ ] **Step 2: 實作**

`validateCreateSessionInput`：頂部取值加 `const joinMode = String(input.joinMode ?? "approval");`；驗證加 `if (!["approval", "instant"].includes(joinMode)) errors.joinMode = "請選擇加入方式。";`；`value` 加 `joinMode`。

`openCreateSessionSheet` 的表單 HTML，在缺額欄位（`session-slots-total`）之後插入：

```html
<fieldset class="form-fieldset"><legend>加入方式</legend>
  <label><input type="radio" name="joinMode" value="approval" checked /> 需審核（你逐一核准申請者）</label>
  <label><input type="radio" name="joinMode" value="instant" /> 直接加入（先到先得，立即成局）</label>
  <p class="form-hint">選擇直接加入後，任何完成檔案的球友加入即成局，你們將互相看到 LINE ID。</p>
</fieldset>
```

（`FormData` 對 radio 自然回傳選中值，submit 流程不需改。）

- [ ] **Step 3: 跑綠**

```bash
npm run test:session-unit
```
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add src/sessionViews.js tests/session-create-form.test.js
git commit -m "feat: 建局表單支援選擇直接加入或需審核"
```

---

### Task 5: 詳情 CTA、加入確認與 controller

**Files:**
- Modify: `src/sessionController.js`（`actionFor`、`requestJoin` 成功訊息、`submitCreateSession` 傳遞 joinMode——grep 確認其轉呼 `api.createSession(validation.value)` 已自然帶上）
- Modify: `src/sessionViews.js`（`sessionCard` badge、`openSessionSheet` 說明、`openJoinSessionConfirmation` instant 文案）

**Interfaces:**
- Consumes: `session.joinMode`（Task 3 mapper）、`requestJoin` 回傳物件的 `accepted`。

- [ ] **Step 1: `actionFor` 分支**

grep 錨點 `return { label: "申請加入" };`，改為：

```js
    if (String(session.joinMode) === "instant") return { label: "直接加入" };
    return { label: "申請加入" };
```

- [ ] **Step 2: 球局卡 badge**

grep `function sessionCard`（`src/sessionViews.js`），在卡片 meta 區（court/時間附近）插入：

```js
    ${session.joinMode === "instant" ? '<span class="session-badge session-badge--instant">直接加入</span>' : ""}
```

`src/session.css` 加：

```css
.session-badge--instant {
  background: var(--lime);
  color: var(--navy);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
}
```

（若檔內已有 `.session-badge` base class 則沿用；沒有就同時補 base。）

- [ ] **Step 3: 加入確認 dialog 的 instant 分支**

`openJoinSessionConfirmation`（grep 同名）依 `session.joinMode === "instant"`：標題文案改「直接加入這場球局？」、說明加「加入後你與主揪即可互相看到 LINE ID。」、確認鈕文字「直接加入」；成功態文案：`result.accepted` 為 true 時顯示「已加入球局！到我的球局查看聯絡方式。」，否則沿用現行申請送出文案。`requestJoin`（controller）已把 `{ ...result, joinSubmitted: true }` 回傳給 view，view 端據 `result.accepted` 分支即可，controller 不需改流程。

- [ ] **Step 4: mock 全套驗證**

```bash
npm run test:mock
```
Expected: unit + desktop/mobile mock Playwright 全 PASS 且 zero console error 斷言不破（mockData 的 9002 instant 卡會渲染 badge）。若 smoke/performance spec 對卡片 markup 有 snapshot 式斷言而紅，更新該斷言以含 badge。

- [ ] **Step 5: Commit**

```bash
git add src/sessionController.js src/sessionViews.js src/session.css
git commit -m "feat: 詳情與確認流程支援直接加入模式"
```

---

### Task 6: e2e — local instant 旅程與 mock 回歸

**Files:**
- Modify: `tests/fixtures/sessionFactory.js`（`createSessionViaRpc` 支援 joinMode）
- Modify: `tests/session.spec.js`（instant 旅程）
- Modify: `tests/session-mobile.spec.js`（若其斷言建局表單欄位清單，補 radio）

- [ ] **Step 1: sessionFactory 加參數**

`createFutureSessionInput`/`createSessionViaRpc` 的 RPC 參數物件加 `p_join_mode`（預設 `"approval"`，可覆寫 `"instant"`）。

- [ ] **Step 2: 新增 instant 旅程測試**

`tests/session.spec.js` 新增（沿用檔內兩帳號 fixture 模式）：host 以 factory 建 `joinMode: "instant"` 局 → guest 瀏覽器開詳情 → CTA 文字為「直接加入」→ 確認 → 成功態顯示「已加入球局」→ guest 的 My Sessions 即將打球區出現該局 → 聯絡資訊區互看 LINE。host 端 My Sessions 無待審核卡。

- [ ] **Step 3: 跑 local 全套**

```bash
npm run test:local
TENNIS_TEST_HARNESS_MODE=local npx playwright test --project=supabase-mobile-chromium
```
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/sessionFactory.js tests/session.spec.js tests/session-mobile.spec.js
git commit -m "test: instant 直接加入的 local e2e 旅程"
```

---

### Task 7: 文件同步與收尾 gate

**Files:**
- Modify: `.claude/rules/supabase.md`（allowlist 19→20 欄含 `join_mode`、`request_to_join_session` 的 ACCEPTED 語意、SESSION_LIMIT、join_mode 值域）
- Modify: `CLAUDE.md`（Session 資料流程節：`create_session` 敘述補 join_mode 與上限；discovery 欄位相關敘述若有列舉則同步）

- [ ] **Step 1: 修訂兩份文件**（逐字對照 spec「資料契約變更」節，不新增未實作敘述）

- [ ] **Step 2: 完整本機 gate**

```bash
npx supabase start
CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test
npm run test:db
npm run test:mock
npm run test:local
TENNIS_TEST_HARNESS_MODE=local npx playwright test --project=supabase-mobile-chromium
node scripts/generate-courts-seed.mjs --check
npm run build
git diff --check
```
Expected: 全部通過。任何一項失敗都不可標記完成，回報監督 session。

- [ ] **Step 3: Commit**

```bash
git add .claude/rules/supabase.md CLAUDE.md
git commit -m "docs: join_mode 資料契約與規則同步"
```

---

## Self-Review 紀錄（plan 作者已檢）

- Spec 覆蓋：join_mode 欄/RPC/view（Task 2）、ACCEPTED 契約（Task 2/3）、UI 三處（Task 4/5）、SESSION_LIMIT（Task 1/2）、測試矩陣（Task 1/3/4/6）、文件（Task 7）。通知明確不在本 plan。
- 型別一致：`joinMode`（前端 camelCase）↔ `join_mode`（DB）↔ `p_join_mode`（RPC 參數）貫穿 Task 2-6。
- 已知執行時自查點：`mapMockSessionSummary` 實作形狀（Task 3 Step 2.6）、SESSION_LIMIT canary 與既有 fixture 的 host 開局數（Task 2 Step 2）、smoke spec 對卡片 markup 的既有斷言（Task 5 Step 4）。

## 執行期裁決紀錄（監督 session 維護）

- **2026-07-21 Task 2 checkpoint**：獨立 review 發現本 plan 原 SQL 兩個缺陷，裁決修正並 amend Task 2 commit：
  1. SESSION_LIMIT 的 count 無鎖，同 host 併發建局可突破上限 → count 前先
     `perform 1 from public.profiles profile_row where profile_row.id = host_profile for update;`
     以 host profile row 序列化（與 repo 既有 for update 慣例一致；pgTAP 無法驗併發，以 migration 註解記錄意圖＋review 確認鎖存在為準）。
  2. SESSION_LIMIT guard 在參數驗證前，遮蔽 INVALID_TRANSITION／SESSION_STARTED → 移至 SESSION_STARTED 與參數大 if **之後**、sport 查詢之前；pgTAP 補「已達上限 host 傳過期時間 → SESSION_STARTED」斷言驗遮蔽消除。
  3. Minor 一併補：privileged raw insert 一筆 requested 到 instant 局（trigger 允許），再補滿並斷言該 requested 被 decline——這不只是覆蓋率，若防禦段失效，capacity invariant（full 局不可殘留 requested）會在 commit 時 raise。
  Task 1-2 的 plan 原文維持不動；實作以本節為準。

## 監督協議（執行 session 必讀）

- 在獨立 worktree 工作：`git worktree add -b feat/instant-join-mode ../tennisPartnerFinder-instant HEAD`。
- **不可 push**；每 task 一 commit，訊息如上。
- Checkpoint：Task 2 完成後（DB 契約成立）與 Task 7 完成後，停下回報；監督 session 會以 fresh agent 做 read-back 驗收（含 pgTAP 紅綠證據、測試輸出原文）。
- 回報格式：每 task 附「跑過的指令＋關鍵輸出行」與變更檔案清單；宣稱綠必附輸出，不接受「看起來對」。
