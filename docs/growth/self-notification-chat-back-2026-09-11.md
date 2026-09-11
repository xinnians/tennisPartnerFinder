# 自建球局通知與聊天室返回修正

2026-09-11 使用者核可修正回報第 1、3 項；第 2 項聊天期限維持現行規格。本批介面改動為 `chatSessionWiring` 增加可選 `bindHistory`、onClose 轉交 reason；`MySessionsPage`／`MessagesPage` 的聊天點擊處理加入入口聚焦。資料權限與既有 sheet 公開介面不變。

## 行為與實作

- 訂閱球場的新球局廣播只通知其他球友。`try_enqueue_court_new_session` 在共用產生端排除主揪，涵蓋單一球場與候選球場去重、新舊格式。v2 既有派送前主揪檢查保留。
- legacy Edge 派送前批次查核球局主揪；主揪本人或來源已不存在即不送，來源查詢錯誤則整批失敗，不猜測收件資格。僅 service-role 可執行 `filter_legacy_court_notification_ids`，不授予原表 SELECT，不增加 browser API 或 payload 欄位。
- 新 migration 將尚未送出、可重試的 legacy 自我廣播標為嘗試耗盡，不偽填 `sent_at`。已送出的通知不撤回；其他通知（主揪新申請、邀請、提醒等）不受影響。
- 聊天室由 app wiring 建立同 URL 的暫時 history entry，保留原分頁及 page owner。系統 Back／原生邊緣返回先關閉聊天室，沿用 surface 關閉、焦點回復與 feed stop。
- 我的球局／訊息入口在點擊時先聚焦，再開啟聊天室，補足 Safari 點擊按鈕不自動聚焦的差異；不改 DOM、文案或按鈕介面。
- 關閉按鈕、Escape 沿用 dismiss 並消耗暫時 entry；快速關閉後立即重開須等前一個 popstate 才建立新的 entry，不能被舊事件關閉。
- Auth／權限撤銷與 surface replacement 清除聊天 history ownership，不進行非同步返回以免蓋過較新的頁面導航。Forward 或重整不自動恢復私人聊天室；重新開啟仍經現有 membership gate。非 dismiss 可能保留同頁歷史空位，避免 lifecycle 更動導致意外導航。
- 不縮短聊天期限、不加入自訂水平滑動攔截（避免影響訊息捲動與文字操作）、不擴充公開資料。

## 驗收與狀態

以 progress.md 記錄實際測試與部署。本機需通過 SQL 主揪自訂閱／其他訂閱者／候選去重、legacy 派送篩選、history async reopen、真實登入後我的球局與訊息兩入口返回、desktop/mobile、焦點回復及既有群聊回歸。原生 iOS／Android 手勢與實際推播需另行實機驗收，不把 Playwright Back 當實機手勢。

部署順序為兩支 migration（202609110001／202609110002）、legacy Edge Function、前端；僅部署前端不足以完成通知修正。依 release checklist 分別發布，未發布前不宣稱線上已修復。

## 本機 QA 紀錄

- 環境：`http://127.0.0.1:5175`，local Supabase 真實登入／RPC，Fake Maps；1280×844 與 390×844。Browser plugin not available，採既有 Playwright。WebKit 使用 /tmp 暫存 config，沿用相同測試與 local fixture，沒有把 WebKit 結果冒充原生裝置手勢。
- 互動：我的球局 → 群組聊天 → Back → 原入口聚焦 → 重開 → 關閉按鈕 → Back 回首頁；訊息 → 該球局 → Back → 原訊息列聚焦。Chromium／WebKit 各兩種寬度通過；首次 lazy 載入也可被返回取消。
- URL／標題、非空聊天室與回到訊息清單、無 Vite overlay、console／pageerror 為空、畫面及焦點皆有斷言／截圖；圖片保存 /tmp/qiuka-chat-open-390.png、/tmp/qiuka-chat-back-390.png 等，非版控產物。
- SQL 1,313 項通過，包含主揪自訂閱、候選去重、v2 不建立主揪 fanout、legacy 舊自我事件遭拒、anon／authenticated 無資格 RPC 權限。另實際 PostgREST 驗 service RPC 可呼叫、匿名 42501；API fixture 驗自己不入列、其他訂閱者仍入列。
- 完整本機套件不是全綠：首次建檔後訂閱全選 UI 未同步，在目前程式及未修改 HEAD 2417b84 的暫存 worktree 都重現（同一本機 DB）；是本批外的既有問題。累積測試球局亦超過探索上限，使 performance.spec 的「狀態列隱藏」前提失效；未放寬斷言、未清空 DB。其餘未執行的 7 項已另跑通過。暫存 baseline worktree 已移除。
- 完整前端 gate 與最後定向回歸的精確結果，以 progress.md 收尾紀錄為準。正式推播、完整 Safari 套件及 iOS／Android 原生手勢未驗；尚未部署。
