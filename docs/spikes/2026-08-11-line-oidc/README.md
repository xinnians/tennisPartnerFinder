# LINE 登入 spike:Supabase custom provider × LINE Login v2.1

日期:2026-08-11。狀態:**待人工執行**(需要 LINE Developers channel 與獨立測試 Supabase 專案,均由使用者親自建立)。

## 結論先講:路徑已因研究修正

原構想「Supabase custom provider 的 Auto-discovery (OIDC) 模式串 LINE」**已確認不可行**:

- [已驗證] LINE 官方文件明載:「For native apps, LINE SDK, or LIFF apps, ES256 ... is returned,
  and **for web login, HS256** ... is returned.」(https://developers.line.biz/en/docs/line-login/verify-id-token/)
  ——web 授權碼流程拿到的 id_token 是用 channel secret 簽的 HS256,跟 discovery 文件宣稱的
  ES256 不符。
- [已驗證] Supabase Auth(gotrue)的 OIDC 驗證器(`internal/api/provider/oidc.go` 的
  `ParseIDToken`,經 coreos/go-oidc)只信任 discovery 宣告的演算法清單,不會退回 HS256,
  所以驗證必然失敗。未合併的 supabase/auth PR #2578(first-party LINE provider 提案)與
  日文圈實測(https://zenn.dev/sasatech/articles/02b8fb72b45cdd)、ory/kratos discussion #1116
  都獨立印證同一根因。

**本 spike 改驗證修正後的主路徑:custom provider 的 Manual configuration(OAuth2)模式**——
手動填 authorization/token/userinfo 三個端點,gotrue 走 `CustomOAuthProvider.GetUserData`,
[已驗證] 該路徑不呼叫 `ParseIDToken`,只用 access_token 打 userinfo,完全繞開簽章問題。
前端介面不變,仍是 `signInWithOAuth({ provider: "custom:line" })`。

不採用 Clerk/Auth0 橋接(使用者不進 `auth.users`,會打穿現有 RLS)。

## spike 要驗證的四件事

1. Manual OAuth2 模式 + LINE 三端點,登入能否走通。
2. 使用者是否照常進 `auth.users`,`auth.uid()` 與既有 RLS 零改動可用。
   ([已驗證] 原始碼層面所有 provider 共用 `createAccountFromExternalIdentity` 同一 pipeline,
   官方 blog 亦稱 same flow/same RLS;spike 做最後實證。)
3. email 拿不拿得到:LINE 的 email 在 id_token 裡,**userinfo 端點是否回傳 email 未知**;
   manual 模式只讀 userinfo,可能完全拿不到 email。
4. 同 email 的 Google/LINE 身分連結行為。[推論] 不會自動 link:Supabase 只在
   `email_verified:true` 時自動 link(https://supabase.com/docs/guides/auth/auth-identity-linking),
   而 LINE 的 claims 清單根本沒有 `email_verified` 欄位,generic 路徑會落在 Go zero value
   `false`——spike 實證。

## 已驗證的技術事實(來源:LINE discovery 文件與 Supabase 官方文件)

- [已驗證] LINE 端點:authorization `https://access.line.me/oauth2/v2.1/authorize`、
  token `https://api.line.me/oauth2/v2.1/token`、userinfo `https://api.line.me/oauth2/v2.1/userinfo`;
  scopes `openid profile email`;`subject_types_supported: ["pairwise"]`。
- [已驗證] Supabase custom provider:identifier 必須 `custom:` 開頭;manual 模式欄位為
  Authorization URL、Token URL、UserInfo URL;前端 `signInWithOAuth({ provider: "custom:<slug>" })`;
  Free 方案上限 3 個 custom provider。
- [已驗證] 錯誤代碼參考:`validation_failed`(400)、`conflict`(400,identifier 重複)、
  `over_custom_provider_quota`(400)、`custom_provider_not_found`(404)。

## 風險備忘

| 風險 | 說明 | spike 對應 |
|---|---|---|
| manual 模式不驗 id_token 簽章 | 身分改以 TLS 下的 userinfo 回應為準(與 GitHub/Facebook 型 OAuth2 provider 同級的信任模型),可接受但要知情 | 附註 |
| userinfo 可能無 email | LINE 把 email 放 id_token;manual 模式只讀 userinfo → 可能建立無 email 使用者,linking 完全不可能,通知/聯絡也拿不到 email | 檢查 3、7 |
| 不自動 link(即使有 email) | 缺 `email_verified` claim → Supabase 視為未驗證,不自動 link | 矩陣 B/C |
| pairwise subject | LINE 的 `sub` 對不同 channel 不同;測試 channel 與正式 channel 的使用者身分**不互通**,正式環境務必用正式 channel 從零開始 | 附註 |
| email scope 需申請 | LINE console 的 Email address permission 核准後才拿得到 email | Part A 第 6 步 |

## Part A:建立 LINE Login channel(使用者操作)

1. 登入 https://developers.line.biz/console/ → 建立(或選既有)Provider。
2. Create channel → 類型選 **LINE Login**。地區台灣、名稱如 `tennis-partner-finder-dev`。
3. 建立後到 channel 的 **LINE Login** 分頁確認啟用 web app;**Basic settings** 分頁取得
   **Channel ID**(= client_id)與 **Channel secret**(= client_secret)。
4. Callback URL 先留著,Part B 第 4 步會拿到 Supabase 的 callback URL 回來填。
5. 注意:channel 未 Publish 前處於 Developing 狀態,通常只有 channel 管理員/測試員能登入
   (在 console 的 Roles 分頁加測試帳號);正式上線前才 Publish。[未驗證,請以 console 實況為準]
6. (選)要測 email,在 channel 申請 **OpenID Connect → Email address permission**,
   核准後 scopes 才能加 `email`。

## Part B:建立測試 Supabase 專案(使用者操作)

1. 在 Supabase dashboard 建**全新測試專案**(免費即可),不可用正式專案。
2. Authentication → Sign In / Providers → **Add custom provider**,方法選 **Manual configuration**:
   - Identifier:`custom:line`
   - Client ID:LINE Channel ID
   - Client Secret:LINE Channel secret
   - Authorization URL:`https://access.line.me/oauth2/v2.1/authorize`
   - Token URL:`https://api.line.me/oauth2/v2.1/token`
   - UserInfo URL:`https://api.line.me/oauth2/v2.1/userinfo`
   - Scopes:`openid profile`(email 權限核准後改 `openid profile email`)
3. 建立表單上會顯示唯讀 **Callback URL**(形如 `https://<ref>.supabase.co/auth/v1/callback`),
   複製它。
4. 回 LINE console,把該 Callback URL 填進 LINE Login 分頁的 **Callback URL**。
5. Authentication → URL Configuration:Site URL 與 Redirect URLs 加入
   `http://localhost:8000/spike.html`。
6. (選,linking 測試用)同一測試專案再設定內建 Google provider(可用既有 Google OAuth
   client,把測試專案 callback 加進 Google Cloud console 的 redirect URIs)。
7. SQL Editor 執行以下 spike 輔助物件:

```sql
create table if not exists public.spike_rows (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);
alter table public.spike_rows enable row level security;
create policy "owner only" on public.spike_rows
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.whoami()
returns table (uid uuid, jwt_email text, jwt_provider text)
language sql stable
as $$
  select auth.uid(),
         auth.jwt() ->> 'email',
         auth.jwt() -> 'app_metadata' ->> 'provider';
$$;
grant execute on function public.whoami() to authenticated;
```

## Part C:跑 spike 頁(使用者操作)

```bash
python3 -m http.server 8000 --directory docs/spikes/2026-08-11-line-oidc
```

瀏覽 http://localhost:8000/spike.html → 填測試專案 URL、anon key、provider `custom:line` →
儲存設定 → 依下表逐項操作。頁面 pin supabase-js **2.110.0**(與 app 相同)並鏡射
`src/supabaseClient.js` 的 auth 設定(`flowType: "pkce"`),結論才可外推。

## 驗證 checklist(逐項填「實際結果」)

| # | 動作 | 觀察點 | 預期 | 實際 |
|---|---|---|---|---|
| 1 | 點「以 LINE 登入」→ LINE 授權 → 回跳 | 頁面「目前 session」 | 出現 user id;失敗時頁面 redirect error log 顯示 GoTrue 錯誤,逐字記下 | |
| 2 | 測試專案 SQL:`select id, email, created_at, raw_app_meta_data->>'provider' as provider from auth.users order by created_at desc;` | auth.users | 有新列;記下 provider 實際值(`custom:line` 或其他) | |
| 3 | 同上 SQL 的 email 欄 + 頁面 identities 區塊 | email 有無 | 記錄 userinfo 路徑實際拿不拿得到 email(無 email scope 時應為 null;有 scope 時待觀察) | |
| 4 | 點「whoami()」 | RPC 結果 | `uid` = 畫面上的 user id → `auth.uid()` 零改動可用 | |
| 5 | 點「寫入 spike_rows」再「讀回」 | RLS | 寫入成功且 `user_id` = uid;讀回看得到自己的列 | |
| 6 | 點「登出」再「讀回」 | 匿名 RLS | 被拒或 0 列(anon 無 policy) | |
| 7 | 再次 LINE 登入 | auth.users | **同一** user id,不重複建號(userinfo 的 `sub` 穩定) | |

### (選)反證實驗:OIDC 模式的預期失敗

若想留下研究結論的一手證據:另建一個 identifier(如 `custom:line-oidc`)用
**Auto-discovery (OIDC)** 模式、Issuer `https://access.line.me`,以它登入。
預期:LINE 授權後回跳時失敗(id_token 是 HS256、驗證器只收 discovery 宣告的 ES256)。
把 GoTrue 回傳的逐字錯誤記錄在此:＿＿＿＿。測完刪掉這個 provider。

## 連結測試(manual identity linking)

同 email 自動合併在此路徑**不可能**(userinfo 規格上永遠無 email,見執行紀錄),取而代之驗
Supabase 的手動連結:測試專案已開 `security_manual_linking_enabled` 與 `mailer_autoconfirm`。

| # | 動作 | 預期 | 實際 |
|---|---|---|---|
| L1 | 登出 → spike 頁「Email 註冊/登入」建主帳號 | session 出現 email user id(記下) | |
| L2 | 點「連結 LINE 到目前帳號」→ LINE 授權 → 回跳 | user id **不變**,identities 多出 `custom:line`(用「列出 identities」看) | |
| L3 | 登出 → 「以 LINE 登入」 | user id **等於 L1 的 id** → 兩種登入進同一帳號 | |
| L4 | (選)「解除 LINE 連結」 | identities 移除,可重測 | |

注意:某個 LINE 帳號若已單獨建過號(檢查 1 的產物),連結會失敗(identity 已綁定);
先請協助方刪除該測試使用者再跑 L2。

## 同 email linking 矩陣(需 Part B 第 6 步 + email 權限)

| 順序 | 步驟 | 預期([推論],以實測為準) | 實際 |
|---|---|---|---|
| A | 全新 email:先 Google 登入 → 登出 → LINE 登入(**無** email scope) | 兩個不同 user id(LINE 使用者無 email) | |
| B | email 權限核准後:先 Google 登入(email X)→ 登出 → LINE 登入(同 email X) | 不自動 link(缺 `email_verified`);記錄實際是「建第二個 user」還是「被拒」 | |
| C | 反向:先 LINE(email X)→ 登出 → Google(email X) | Google 帶 `email_verified:true`,可能 link 進 LINE 建的帳號;記錄實際行為 | |

> 矩陣結果決定產品決策:若確認不自動 link,正式上線文案必須引導**既有 Google 用戶沿用 Google
> 登入**,否則改點 LINE 會生出第二個空白帳號(nickname/NTRP 全空)。這不是資料損毀,
> 但會造成「我的球局不見了」的支援案件。

## 通過後:搬到正式專案(使用者操作,對應 release checklist 的 OAuth 段)

1. 建**正式** LINE Login channel(不可沿用測試 channel;pairwise sub 不互通,測試帳號資料不搬)。
2. 正式 Supabase 專案照 Part B 第 2-4 步設定 `custom:line`(用正式 channel 憑證、manual 模式),
   並**開啟 Allow users without email(email_optional)**——不開會重現
   「Error getting user email」500。`security_manual_linking_enabled` 先不開,
   等「連結帳號」功能實作時一併處理。
3. Vercel **Preview** 環境(與 `VITE_SUPABASE_*` 同位置,綁工作分支)加
   `VITE_AUTH_LINE_PROVIDER_ID=custom:line`;沒設這個變數時前端不顯示 LINE 按鈕,
   所以 Supabase 端未設好前可以安全部署。
4. [推論] Supabase 的 Redirect URLs allowlist 按 URL 不分 provider,前端 `redirectTo` 沿用
   `location.origin`,理論上不需新增;請在正式 QA 時實際點一次確認。
5. 跑 `docs/mvp-plan.md` release checklist 的 OAuth 人工檢查(兩種 provider 都要)。
6. LINE channel 送 Publish(未 Publish 只有測試員能登入)。

## 失敗處置與觀望項

- Manual OAuth2 模式也失敗 → 此路徑作廢,回報逐字錯誤後再議;屆時唯一乾淨選項是等
  supabase/auth PR #2578(first-party LINE provider,截至 2026-08-11 open 未合併,
  https://github.com/supabase/auth/pull/2578)或自 fork。
- 觀望:PR #2578 若合併,LINE 變內建 provider(含 email `Verified: true` 覆寫),
  屆時可把 custom provider 換成內建,前端只改 provider 字串。

## 執行紀錄

- **2026-08-14:SPIKE 全數通過(結案)。** 開啟 Allow users without email 後:
  - 檢查 1-7 全過:LINE 登入成功、`auth.users` 一列(email null、provider 逐字為
    `custom:line`)、`whoami()` uid 相符、RLS 寫讀過、登出後匿名讀被拒、重登同 id。
  - 連結測試 L1-L4 過:email 主帳號 + `linkIdentity({provider:"custom:line"})` 成功,
    user id 不變、identities 兩筆(`email`+`custom:line`);登出後以 LINE 單獨登入回到
    **同一** user id(auth log 02:57:00 `/authorize`→`/token 200`→`/callback 302`,
    `users.last_sign_in_at` 同步更新;注意 `identities.last_sign_in_at` 在後續登入
    不會更新,勿以它判斷)。→ **manual identity linking 對 custom provider 可用**,
    「連結帳號」可排 backlog。
  - 結論:manual OAuth2 + `email_optional` 是可行正式路徑;正式專案設定見下節,
    **Allow users without email 必開**,否則重現 500。
- 2026-08-14:實測進度。callback URL 修正後 `/authorize`→LINE→`/callback` 走通,但 GoTrue 回
  `500: Error getting user email from external provider`。追查結論([已驗證]):LINE userinfo
  規格上**永遠只回 sub/name/picture、無 email**(與權限無關);gotrue 檢查是
  `if len(userData.Emails) == 0 && !emailOptional`,官方解法是 provider 設定
  `email_optional: true`(dashboard「Allow users without email」),Zenn 實測同解。
  app 端 grep 確認 `src/` 零 email 依賴、`profiles` 無 email 欄,開啟無產品影響。
  產品結論:LINE 帳號永遠無 email → 與 Google 帳號**不可能自動合併**,上線文案須引導
  老用戶沿用 Google;手動合併走 manual identity linking(見連結測試段)。測試專案已另開
  `security_manual_linking_enabled=true`、`mailer_autoconfirm=true`。

- 2026-08-13:LINE channel 已由使用者建立。測試 Supabase 專案已以 CLI 建立:
  `tennis-line-spike`(ref `chqnctwakrequoxnvopi`,ap-southeast-1,隨機 db 密碼未保存,
  需要時到 dashboard reset)。`site_url`/`uri_allow_list`(`http://localhost:8000/spike.html`)、
  `custom_oauth_enabled`、spike SQL(`spike_rows`+`whoami`)均已透過 Management API 設定完成。
  待辦:dashboard 填 custom provider 表單(含 secret,使用者親自)、LINE console 填
  callback URL、跑 checklist。

## 紅線提醒

LINE「聯絡面」已退役:本 spike 與後續實作是 LINE「登入」,不得順帶蒐集或渲染 LINE ID
到任何 profile 欄位或畫面;`profiles.line_id` 是凍結技術債,不可觸碰。spike 頁面刻意
只顯示 identity 的 key 名與 email,不印 LINE userId(sub)值。
