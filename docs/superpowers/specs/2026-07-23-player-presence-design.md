# 球友在場狀態(presence:前景即時 + last-seen)設計(Spec E)

日期:2026-07-23。狀態:user 已核可方向。user 原始期望為常駐即時位置(Zenly 式);
瀏覽器無背景定位,故拍板:**原生 app 真即時追蹤記為長期方向(見未來節)**,本輪
落地網頁可行極限——網站開啟期間前景即時更新,關站後顯示 last-seen 並隨時間下架。
本 spec 是 `2026-07-21-player-directory-invites-design.md` 的增量;該 spec 第 12 行
「已擋掉:背景即時定位」的決策由 user 於 2026-07-23 知情推翻(範圍僅前景+衰減)。
實作順序:C → D → E,本件最後。

## 問題

球友層目前只有靜態「常打球場」,看不出誰現在真的在場、誰現在想打。揪球的
臨場性(在場的人最可能立刻成局)完全沒被服務;「接受現場問候」也無從表達。

## 決策

- 新增獨立開關 `share_presence`(與球友卡 `is_public` 完全分開),**預設 false**。
- 開啟後,網站前景期間以 `watchPosition` 節流更新(每 60 秒或位移 >50 公尺),
  呼叫 `update_my_presence(lat, lng)`。
- **raw GPS 座標不落地**:RPC 在 SQL 內求最近的台北市 active court,距離 ≤100 公尺
  才寫入,只存 `court_id + updated_at`,座標即棄,任何表都不存原始座標。
  不在任何球場 100 公尺內 → 不更新(舊列隨 TTL 自然下架)。
  - 行政區級模糊為**棄項**:需行政區多邊形資料、「在大安區某處」對揪球無行動價值。
    即「不在球場 = 不顯示」。
- 顯示語意:「在 ○○ 球場・N 分鐘前」;TTL 3 小時(view 過濾
  `updated_at > now() - interval '3 hours'`),關站後自然衰減下架。
- **互惠制**:viewer 自己 `share_presence = true` 才能讀到別人的 presence
  (definer view 內 gate);另沿用登入 + 完整 profile 的既有 gate。
- 一鍵隱藏:`set_presence_sharing(false)` 立即刪除本人 presence 列並關閉開關。
- 新增 `open_to_greeting`(接受現場問候)boolean,預設 false;顯示於球員卡與
  presence 資訊;沿 `is_public` 教訓,`save_my_profile` 的 upsert **不得覆寫**此欄,
  pgTAP 加回歸斷言(重存 profile 後 open_to_greeting 與 share_presence 均保留)。
- 檢舉:沿用 `create_report`;實作時確認 report target 可指向 profile,不足則以
  migration 擴充(此為實作 checkpoint,結果寫回本 spec)。
- LINE 規則、匿名面 allowlist 完全不變;presence 永不出現在任何匿名可讀面。

## 資料契約變更

- `profiles` 加 `share_presence boolean not null default false`、
  `open_to_greeting boolean not null default false`。
- `player_presence`:profile_id(pk)、court_id、updated_at。RLS:僅經 definer RPC
  寫入;browser 不可直讀,讀取一律走新 definer view。
- 新 view `player_presence_directory`,有序欄位 allowlist(pgTAP 全字串比對):
  `profile_id, nickname, ntrp, open_to_greeting, court_id, court_name,
  court_district, court_lat, court_lng, minutes_ago, is_self`。明確不含 LINE、
  email、真名、raw 座標。此 view 只 grant `authenticated`；匿名 SELECT 一律被拒。gate:
  viewer 完整 profile + viewer share_presence = true，否則登入 viewer 為 0 列。
- RPC:`update_my_presence(lat double precision, lng double precision)`、
  `set_presence_sharing(boolean)`、`set_open_to_greeting(boolean)`。

## UI

- 地圖球友圖層:有在場者的球場 pin 加「在場 N 人」亮點;球場球友抽屜內
  在場者排最前,顯示「在場・N 分鐘前」與問候標記。
- 球員卡:在場狀態列 + 「接受現場問候」標記(有開才顯示)。
- My Sessions 設定區:presence 開關(說明文案明講「開啟期間你的所在球場對
  其他有開啟的完整檔案球友可見」)、問候標記開關、一鍵隱藏。
- 首次開啟時的定位權限請求與拒絕後的說明。

## 測試

- pgTAP:presence fixture 存在後匿名 direct SELECT 被拒;不完整 viewer 0 列;未開
  share_presence 的 viewer 0 列(互惠);TTL 過期 0 列;100 公尺外 update 不寫入;
  `player_presence` 無任何座標欄(schema 斷言);allowlist 全字串;save_my_profile 回歸
  (兩開關保留);set_presence_sharing(false) 後列即刪。先紅後綠、掃描集非空。
- unit:節流邏輯、dataApi mapper、開關狀態機。
- e2e(local):A 開分享+模擬座標於球場內 → B(有開)看到 A 在場;
  C(未開)看不到任何人(反向 control);A 一鍵隱藏 → B 即刻看不到。
- mock:MOCK_PLAYERS 補在場 fixture,驗圖層與抽屜顯示。

## 實作 checkpoint(2026-07-23)

- `create_report` 已驗證可用 `p_session_id = null` 與另一位完整 profile 的
  `p_reported_profile_id` 成功建立檢舉；不需要為 presence 另加 report schema。

## 非目標(與長期方向)

- **原生 app 背景真即時追蹤:長期方向**,user 已拍板想要;需 iOS/Android app 與
  全新隱私設計,另立專案評估,本 spec 不做。
- 一對一自由約(球友層既定第二波)、聊天、到場打卡歷史。

## 文件同步

CLAUDE.md(隱私邊界節新增 presence 面與「座標不落地」底線)、
`.claude/rules/supabase.md`(新表/view/RPC 與互惠 gate)。
