# 即時開打球局(now-start)設計(Spec D)

日期:2026-07-23。狀態:user 已核可方向(放寬現有球局時間限制,不做獨立臨時揪型態)。
本 spec 是 `2026-07-17-taipei-tennis-public-mvp-design.md` 的增量變更;依賴
`2026-07-23-notifications-web-push-design.md`(Spec C)的廣播事件。
命名注意:`instant` 一詞已被 join_mode(直接加入)使用;本 spec 一律稱
「即時開打」「now-start」,避免混用。

## 問題

產品定位自稱「台北網球的即時揪球看板」(mvp-design.md:50),但 DB 從 trigger 層
禁止開現在的局(0003:254 `new.start_at <= now()` 即拒),discovery 也只列未來局。
臨時缺人、現在就想打——LINE 群最難解的場景——目前完全無解。

## 決策

- `create_session` 允許 `start_at` 從現在起:驗證改為
  `start_at >= now() - interval '5 minutes'`(容忍表單填寫與時鐘偏差)。
- **可發現/可加入窗口**:open/full 且 `now() < start_at + interval '2 hours'`
  期間,球局仍在 discovery 顯示並可申請/直加/被邀;超過 2 小時即從探索下架、
  拒絕新加入。既有 24 小時 expiry 與 played 回報窗口**不變**。
- 已開打但仍在窗口內的球局標示「進行中」;approval/instant 兩制、LINE 揭露、
  容量原子、host 5 局上限、SESSION_LIMIT 全部照舊。
- 建立即時開打局同樣觸發 Spec C 的 `district_new_session` 廣播,不做特殊通道。

## 實作架構關鍵

「未來限制」散在多層,實作第一個 task 必須先 grep 盤點全清單再動手,已知至少:

- 0003:254 `enforce_session_transition` INSERT 分支的 `start_at <= now()`。
- `create_session` RPC 內的時間 validation(0003:772 建立,202607210001 以新簽名重建)。
- `session_discovery` view 的未來 where 條件(rules/supabase.md 明載「僅包含未來」;
  改為 `start_at + 2h` 窗口,view 以 `create or replace` 新 migration 變更)。
- `request_to_join_session`/`invite_to_session`/`respond_to_session_invite` 的
  時間 guard:確認開打後 2 小時內不被 `SESSION_EXPIRED` 或其他 guard 誤擋。
- 前端 `validateCreateSessionInput`(sessionViews.js:69)與
  `taipeiLocalDateTimeToIso` 的未來檢查;filters.js 排序。
- `session_discovery` 欄位 allowlist **不新增欄位**(進行中與否由 start_at 推導,
  前端計算),pgTAP 20 欄字串不變——若實作發現必須加欄,回頭改本 spec 再動工。

## UI

- 建局表單:時間欄旁加「現在開打」快捷(填入當下時間,仍可手改)。
- 球局卡片與詳情:`start_at <= now()` 顯示「進行中」badge 與「已開打 N 分鐘」;
  未開打維持現行倒數文案。
- 附近球局抽屜排序:進行中且有缺額的局排最前(filters.js sortSessionsForDrawer)。
- mock 模式:mockData 補一筆進行中球局供 demo 與測試。

## 測試

- pgTAP:now 建局成功;過去 10 分鐘建局被拒;`start+1h59m` 可加入、`start+2h01m`
  加入被拒且不在 discovery;24 小時 expiry 行為不變;host 上限計數把進行中局算入
  「未來 open/full」的既有語意確認(以實測為準,結果寫回本 spec)。先紅後綠。
- unit:表單驗證接受現在時間、拒過去時間;排序把進行中排前。
- e2e(local):A 開「現在開打」局 → B 直接加入 → 互看 LINE → 2 小時窗口外
  以 SQL 調時間驗下架(或以 pgTAP 覆蓋,e2e 驗 UI 標示即可)。
- mock Playwright:進行中 badge 顯示、zero console error。

## 非目標

- 候補、延長球局、開打後改時間。
- 獨立「臨時揪」輕量型態(與 check-in 綁定的喊聲;presence 上線後再評估)。

## 文件同步

`.claude/rules/supabase.md`(discovery「僅未來」→「至開打後 2 小時」)、
CLAUDE.md(create_session 與 discovery 的敘述)。
