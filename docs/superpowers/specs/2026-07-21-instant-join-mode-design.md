# 球局直接加入模式（Hybrid join_mode）設計

日期：2026-07-21。狀態：user 已核可方向（Hybrid：主揪建局時選「直接加入」或「需審核」）。
本 spec 是 `docs/superpowers/specs/2026-07-17-taipei-tennis-public-mvp-design.md` 的增量變更；
未提及之處沿用該 spec 與 CLAUDE.md 現行邊界。

## 問題

申請→等核准→等結果的流程對信任要求低的球局（公園野球）摩擦過高，且目前無通知，
雙方都在盲等。保留主揪審核權的同時，讓主揪可以選擇免審核的快速成局模式。

## 決策

- `sessions` 新增 `join_mode`：`'approval'`（預設，現行為）| `'instant'`。
- `join_mode = 'instant'` 時，`request_to_join_session` 直接完成核准：申請者立即成為
  `accepted` guest，補滿最後缺額時原子地把球局轉 `full` 並自動婉拒殘餘 `requested`。
- LINE 揭露模型**不變**：仍然只有雙方皆 `accepted` 的 host↔guest 透過
  `session_contacts` 互看。instant 只是把「accepted 的產生」自動化。
- 主揪選擇 instant 即同意「任何完整 profile 的使用者加入後即互看 LINE」；
  建局表單必須明文揭露這一點。
- 附帶 hardening（審視 P0，與 instant 濫用面直接相關）：`create_session` 新增
  單一 host 的未來 open/full 球局數上限 5，超過拋 `SESSION_LIMIT`。

## 實作架構關鍵（已對 0003 trigger 驗證）

`private.enforce_session_participant_transition` 的 INSERT 分支強制 guest 只能以
`status='requested'` 進場（0003:332-334）。因此 instant 路徑**不直接 insert accepted**，
而是同一 transaction 內 `insert requested` → `update` 同列為 `accepted`：

- 走既有 `requested → accepted` 轉移防護與容量檢查（0003:379-409），零 trigger 變更。
- 「raw insert accepted 不可繞過 review 合約」的深度防禦（pgTAP 既有段落）完整保留。

## 資料契約變更

- `sessions.join_mode text not null default 'approval' check (join_mode in ('approval','instant'))`。
- `session_discovery` 尾端新增 `join_mode` 欄（第 20 欄）；`my_session_participations`
  尾端新增 `join_mode`。兩個 view 的 pgTAP 有序 allowlist 字串同步更新。
  `join_mode` 是球局屬性、非主揪個資，不違反「host 欄位僅 nickname/ntrp/profile_complete」。
- `create_session` 簽名新增 `p_join_mode text default 'approval'`（drop 舊簽名重建並重下 grant）。
- `request_to_join_session` 回傳值新增 `'ACCEPTED'`（instant 成功）；`'OK'` 仍為
  approval 申請成功；`'SESSION_EXPIRED'` 語意不變。
- 新錯誤碼 `SESSION_LIMIT`（host 未來 open/full 局數 ≥ 5 再建局）。

## UI

- 建局表單：join_mode radio（預設「需審核」）＋instant 揭露文案
  「選擇直接加入後，任何完成檔案的球友加入即成局，你們將互相看到 LINE ID」。
- 球局卡片與詳情：instant 局顯示「直接加入」badge；詳情 CTA 文字由「申請加入」
  改為「直接加入」（approval 局不變）。
- 加入確認 dialog：instant 分支文案與成功態（「已加入球局！」＋前往我的球局）。
- 主揪端 My Sessions：instant 局不會出現待審核卡（沒有 requested rows）。

## 測試

- pgTAP：allowlist 字串×2、instant 生命週期（join 回 ACCEPTED、補滿轉 full、
  滿後 join 拋 SESSION_FULL）、`SESSION_LIMIT`（第 6 局被拒；用獨立測試帳號避免
  誤傷既有 fixture）、join_mode 非法值拋 INVALID_TRANSITION。依 gate 紀律先紅後綠。
- unit：dataApi allowlist/映射、validateCreateSessionInput 的 joinMode。
- e2e（local）：host 建 instant 局 → guest 直接加入 → 雙方互看 LINE。
- mock：mockData 補 `joinMode`（至少一筆 instant），mock 旅程驗 badge 與 zero console error。

## 非目標

- 通知（獨立 Spec C，需 outbox＋Edge Function＋email 選型，另案）。
- approval↔instant 的事後切換 RPC（YAGNI，第一版建局時一次決定）。
- 候補、waitlist（CLAUDE.md 禁區，未開題）。

## 文件同步

`.claude/rules/supabase.md`（19 欄→20 欄、join_mode 語意、SESSION_LIMIT）與
CLAUDE.md 的 discovery 欄位敘述、`request_to_join_session` 行為描述。
