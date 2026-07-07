# 球局優先(session-first)+ 台北球場指南 實作計劃

日期:2026-07-07
狀態:規劃完成,待實作(下一個 session 檢查後動手)
關聯:`docs/mvp-plan.md`(planning SoT)、`docs/superpowers/plans/2026-07-03-monetization-growth-plan.md`
對照路線圖(Artifact v2):https://claude.ai/code/artifact/07651c23-a9e5-481c-b217-784663e89901

---

## 0. 這份計劃在做什麼(一句話)

把產品從「一對一找人配對」重構成「以**球局(session)為原子單位**」,新增「**台北球場指南**」當零用戶冷啟動層,並**修掉 `line_id` 個資破口**。變現暫緩。

---

## 1. 為什麼(策略背景,讓未來 session 快速對齊,別重犯錯)

- **動機**:創辦人做這個是為了**學新技術、找創作新鮮感**,不一定要變成一門生意 → 現階段**不以變現為目標**。
- **市場現實(2026 查證)**:
  - 網球媒合在台灣**不是空白市場**:LoveTennis(lovetennis.tw)是直接競品——卡片制、全免費、無地圖、無外部聚合、traction 未知。
  - 真正的差異化只有兩點:**地圖(圖釘=球場)+ 冷啟動內容**。「專注配對」**不是**差異(LoveTennis 已在做)。
  - **PTT `tennis_life`** 徵球量太少、散全台、台北稀疏 → 只能當「佐料」。冷啟動主力改成**球場指南 + opt-in 本人發布 + 人工種子**。
  - 純「找球伴配對」出了名**難直接收費**(TennisPAL、RacketPal 是反例)。真要變現是**供給端**(教練/場館/贊助),不是跟玩家收配對費。
  - 別爬 FB 私密社團 / LINE 群(技術死、法律紅:Meta Groups API 已關、LINE 群需被邀請、轉載含 LINE ID 的貼文踩個資法)。只做 PTT 公開板 + 去識別 + 連回原文。
- **形狀關鍵洞見**(Fable 5 與分析收斂):
  - 長期球伴是「**打出來的結果**」不是「申請來的輸入」。
  - 一對一配對成功 = 兩根釘退場(**越成功地圖越空**);「球局/場次」每週會再生。
  - 台北雙打「**缺 1 缺 2**」是主流形態 → 原子單位應是「一場球局」,資料層別寫死 pair。

---

## 2. 成功指標

- **北極星**:每週**成局數**(邀請 → 接受 → 事後回報「打成了」)。
- **裁判指標**:**同伴回訪率**(成局兩人 30 天內再約同一人)→ 裁決「台北要不要長期球伴」:高 → 把畢業機制做深;低 → 轉 pickup(這條路通往成長更快的**匹克球 open play**)。
- **個人軌(主指標)**:出貨了什麼、學會什麼。別被 DAU 綁架。

---

## 3. 四個現在就要鎖的設計決策(晚改成本極貴)

1. **聯絡方式**:雙方 `accepted` 才互露 LINE ID(**永不露電話**)。「接受」這個動作同時創造「球局」實體,所有指標掛在它上面。
2. **兩層釘都要有到期**:PTT 釘 14 天 TTL + 視覺分離(空心/灰 + 來源標籤 + 日期)+ 過期降級成「區域熱度」;真人釘也改「本週可打」每週衰減,不是永久「我存在」。
3. **資料最小化**:PTT 只存 `球場座標 + 時段 + 去識別摘要 + 原文連結`;不存全文(著作權)、不存作者 ID(個資)。
4. **球局 = 一等公民 schema**(不是聊天副作用);NTRP 存 `self_reported`,但留 `verified` / 社群校準的擴充位。

---

## 4. Workstream A — 球局 schema(取代 `partner_requests`)

### 從 `partner_requests` → `sessions` 對照

| partner_requests(現有) | sessions(升級) | 差異 |
|---|---|---|
| `desired_time_text` 自由文字 | `start_at timestamptz` | 結構化時間,可排序/過期/量測 |
| (無) | `play_type` | 補結構化打法 |
| (無) | `slots_total 1–3` | 涵蓋單打(1)與雙打「缺 1 缺 2」 |
| `status` open/closed/expired/removed | `status` open/full/played/expired/cancelled | 加 played(成局)、full(湊滿) |
| `request_text`/`raw_skill_text` | `notes` | 合併 |
| (無) | `session_participants` 表 | 誰加入/接受/打成了 |

> pre-beta、無真實資料 → 建議直接**讓 `sessions` 取代 `partner_requests`**(dataApi 與 Playwright 一起改)。

### DDL(比照現有風格:identity PK、snake_case、CHECK enum、RLS)

```sql
-- 球局:一場「約好要打的球」。取代 partner_requests。
create table if not exists public.sessions (
  id bigint generated always as identity primary key,
  host_profile_id bigint not null references public.profiles (id) on delete cascade,
  court_id bigint not null references public.courts (id) on delete restrict,
  play_type text not null check (play_type in ('單打', '雙打', '對拉', '練球')),
  start_at timestamptz not null,
  duration_min int not null default 120 check (duration_min between 30 and 300),
  ntrp_min numeric(2, 1) check (ntrp_min is null or (ntrp_min >= 1.0 and ntrp_min <= 7.0)),
  ntrp_max numeric(2, 1) check (ntrp_max is null or (ntrp_max >= 1.0 and ntrp_max <= 7.0)),
  slots_total smallint not null default 1 check (slots_total between 1 and 3), -- 缺幾人
  notes text,
  status text not null default 'open'
    check (status in ('open', 'full', 'played', 'expired', 'cancelled')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ntrp_min is null or ntrp_max is null or ntrp_min <= ntrp_max)
);

-- 參加/邀請/成局:一列 = 一個人對一場球局的關係。這張表就是漏斗儀表。
create table if not exists public.session_participants (
  id bigint generated always as identity primary key,
  session_id bigint not null references public.sessions (id) on delete cascade,
  profile_id bigint not null references public.profiles (id) on delete cascade,
  role text not null default 'guest' check (role in ('host', 'guest')),
  status text not null default 'requested'
    check (status in ('requested', 'accepted', 'declined', 'withdrawn')),
  played_confirmed boolean not null default false, -- 事後「打成了」一鍵回報
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, profile_id)
);

create index if not exists sessions_open_start_idx on public.sessions (status, start_at) where status = 'open';
create index if not exists sessions_court_idx on public.sessions (court_id, start_at);
create index if not exists sp_session_idx on public.session_participants (session_id);
create index if not exists sp_profile_idx on public.session_participants (profile_id);
```

### 狀態機

```
session.status:  open ─(湊滿)→ full ─(有人回報打成了)→ played
                  │              │
                  ├─(過 expires_at)┴→ expired
                  └─(主人取消)──────→ cancelled

participant.status: requested ─(主人接受)→ accepted ─(事後)→ played_confirmed=true
                       │                       │
                       └─(拒絕)→ declined      └─(自己退出)→ withdrawn
```

兩種流程共用同一組表:①貼球局徵人 → 別人 `requested` → 主人 `accepted`;②看到球友直接約 → 開球局 + 幫對方建 `requested`(邀請)→ 對方 `accepted`。

### 修掉 line_id 個資破口(重點)

```sql
-- 1) 公開探索 view 移除 line_id(其餘照舊)
create or replace view public.public_profile_discovery as
select p.id as profile_id, p.nickname, p.ntrp,
       c.id as court_id, c.name as court_name, c.district as court_district,
       c.lat as court_lat, c.lng as court_lng,
       array_remove(array_agg(distinct ppt.play_type), null) as play_types,
       array_remove(array_agg(distinct ps.slot_code), null) as slot_codes
from public.profiles p
join public.profile_courts pc on pc.profile_id = p.id
join public.courts c on c.id = pc.court_id and c.is_active
left join public.profile_play_types ppt on ppt.profile_id = p.id
left join public.profile_slots ps on ps.profile_id = p.id
where p.is_public
group by p.id, p.nickname, p.ntrp, c.id, c.name, c.district, c.lat, c.lng;
-- ↑ 少了 p.line_id

-- 2) 只有「同一場球局、雙方都 accepted」才看得到對方 line_id
create or replace view public.session_contacts
with (security_invoker = true) as
select me.session_id,
       other.profile_id as counterpart_profile_id,
       pr.nickname       as counterpart_nickname,
       pr.line_id        as counterpart_line_id
from public.session_participants me
join public.session_participants other
     on other.session_id = me.session_id and other.profile_id <> me.profile_id
join public.profiles viewer on viewer.id = me.profile_id and viewer.user_id = (select auth.uid())
join public.profiles pr on pr.id = other.profile_id
where me.status = 'accepted' and other.status = 'accepted';
```

> ⚠️ **全 schema 最敏感的一塊**。務必比照 `supabase/tests/quick_contact_rls.sql` 寫 pgTAP:驗證「未 accepted 查不到 line_id」「anon 完全查不到」。

### 核心指標 SQL

```sql
-- 北極星:每週成局數
select date_trunc('week', s.start_at) as wk, count(*) as games_formed
from public.sessions s where s.status = 'played' group by 1 order by 1 desc;

-- 裁判:同伴回訪率(成局兩人 30 天內再約同人)
with pairs as (
  select least(a.profile_id, b.profile_id) as p1, greatest(a.profile_id, b.profile_id) as p2, s.start_at
  from public.session_participants a
  join public.session_participants b on b.session_id = a.session_id and a.profile_id < b.profile_id
  join public.sessions s on s.id = a.session_id
  where a.played_confirmed and b.played_confirmed
)
select count(*) filter (
    where exists (select 1 from pairs p2 where p2.p1 = pairs.p1 and p2.p2 = pairs.p2
                  and p2.start_at > pairs.start_at and p2.start_at <= pairs.start_at + interval '30 days')
  )::float / nullif(count(*), 0) as rebook_rate_30d
from pairs;
```

`session_participants` 就是漏斗儀表:`requested`=有興趣、`accepted`=聯絡交換、`played`=成局,不用另建分析表。

### A 待辦清單

- [ ] 新 migration:`sessions` + `session_participants`(RLS/`set_updated_at` trigger/grant 照 `partner_requests` pattern:owner 才能改、open+未過期才對 anon 公開讀;`session_participants` 只有主人與本人讀得到,**不對 anon 開**)。
- [ ] 改 `public_profile_discovery` 移除 `line_id`。
- [ ] 建 `session_contacts` view(`security_invoker`)。
- [ ] pgTAP 測試:未 accepted / anon 都拿不到 `line_id`。
- [ ] `src/dataApi.js`:新增 create/load/join/accept/confirmPlayed;mapper 與 mock 形狀同步(維持 mock 與 DB 同形狀原則)。
- [ ] `src/mockData.js`:demand/session mock 對齊新形狀。
- [ ] Playwright:更新約球流程(邀請 → **接受才露 LINE** → 回報成局);更新 `supabase.spec.js`。
- [ ] 決定:`partner_requests` 直接取代 vs 保留(建議取代)。

---

## 5. Workstream B — 台北球場指南(Stage 00 冷啟動層)

### `court_details` 表(貼在現有 `courts` 旁)

```sql
create table if not exists public.court_details (
  court_id bigint primary key references public.courts (id) on delete cascade,
  surface text check (surface in ('硬地', '紅土', 'PU', '人工草', '其他')),
  is_indoor boolean not null default false,
  court_count smallint,                 -- 面數
  has_lights boolean,                   -- 夜間照明
  is_free boolean,                      -- 免費/收費
  booking_method text,                  -- 官方App / 電話 / 現場 / 體育局系統 / 點數制
  booking_url text,
  booking_phone text,
  booking_rules text,                   -- 提前幾天、每日上限、幾點開搶
  fee_note text,                        -- 尖峰/離峰/整面/按人 費用摘要
  peak_hours text,                      -- 例:平日17-19、假日13-19
  source_url text,                      -- 資料來源
  verified_at date,                     -- 查證日期(費率會變,必記)
  updated_at timestamptz not null default now()
);
-- RLS:anon/authenticated 皆可 select(公開內容);寫入僅限維運。
```

欄位優先序:🟢 一次收(材質、室內外、面數、燈光、座標);🟡 會變要標日期(費用、預約方式、搶場規則、尖離峰 → 存 `verified_at` + `source_url`)。

### 先做哪些球場(**集中一熱區做深,不攤平**)

現有 seed 已有 6 個。建議第一熱區選「**大安–中正 一帶**」:

| 優先 | 球場 | 類型 | 資料來源 |
|---|---|---|---|
| ⭐ 第一叢 | 大安森林公園網球場 | 公有 | vbs.sports.taipei + 現場 |
| ⭐ 第一叢 | 中正網球中心 | 公有 | 運動中心系統 + 官網 |
| ⭐ 第一叢 | 青年公園網球場 | 公有 | vbs.sports.taipei |
| ⭐ 錨點 | 台北網球中心(內湖) | 公有旗艦 | tsc.taipei(尖離峰/電話預約規則齊全) |
| 次批 | 臺北網球場(民營) | 民營 | taipeitenniscourt.com(費率/點數/每日1hr上限) |
| 次批 | 迎風/百齡/大佳 河濱 | 河濱免費/低價 | 水利處 + 河濱公告 |

### B 待辦清單

- [ ] 建 `court_details` 表 + RLS(公開可讀)。
- [ ] 第一熱區 4 個 + 錨點台北網球中心先填,每筆存 `verified_at` + `source_url`。
- [ ] UI:球場抽屜/落地頁顯示指南欄位;**訂場只顯示資訊、不做交易**。
- [ ] (可選)每個球場一個可分享/可被 Google 索引的落地頁(SEO 冷啟動)。

---

## 6. 建議實作順序

1. **先 B**:`court_details` + 第一熱區球場(零用戶就有用、風險最低、士氣友善)。
2. **再 A**:`sessions` + `session_participants` + **line_id 修補**(核心 + 個資修補一起做)。
3. 加分析查詢(北極星 / 同伴回訪率)。
4. opt-in 發布體驗做到「**比 LINE 群好用**」(地圖曝光 / 程度時段篩選 / 一鍵約 / 有人回應通知)。
5. 之後才談變現(選配,供給端)。

---

## 7. 別做 / 鐵則

- 別攤多城市多運動;火力集中一熱區。
- 玩家基本配對**永遠免費**;要收錢跟供給端收。
- 別爬 FB 私密社團 / LINE 群 / 用帳號登入爬;只做 PTT 公開板 + 去識別 + 連回原文。
- 別把媒體大數當市場(匹克球 120 萬是預估)。
- line_id 隱私鐵則:**accepted 才露**、永不露電話。

---

## 8. 待創辦人決定(open questions)

- `partner_requests` 直接取代 vs 保留?(建議取代)
- 第一熱區確定「大安–中正」?還是「內湖/台北網球中心」?
- v1 UI 先只開單打,還是一開始就露空位 1–3?
- 要不要現在就接 LINE 官方帳號當通知/回訪層(留存最缺鉤子),還是晚點?
