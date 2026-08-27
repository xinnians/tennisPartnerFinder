import { mountDialog, mountSheet } from "../sheets.ts";
import { sessionActionMessage } from "../sessionActionMessages.ts";
import { runAsyncAction } from "../sessionActions.ts";
import { sessionScheduleLabel, sessionVenuePresentation } from "../sessionPresentation.ts";

let deferSurfaceOpen;
let lazyMounts;
let preloadReportDialog;
let preloadSessionChatSheet;
let preloadSessionDetailSheet;
let preloadSessionUnavailableSheet;
let preloadWithdrawSessionConfirmationDialog;
let registerChatContent;
let registerDetailContent;
let registerReportContent;
let registerUnavailableContent;
let registerWithdrawContent;

/** Configure the facade-owned lazy mounts and surface registration callbacks. */
export function configureSessionSurfaceViews(dependencies) {
  ({
    deferSurfaceOpen,
    lazyMounts,
    preloadReportDialog,
    preloadSessionChatSheet,
    preloadSessionDetailSheet,
    preloadSessionUnavailableSheet,
    preloadWithdrawSessionConfirmationDialog,
    registerChatContent,
    registerDetailContent,
    registerReportContent,
    registerUnavailableContent,
    registerWithdrawContent,
  } = dependencies);
}

/** Open the accepted-member chat with an event-driven, authority-refreshed feed. */
export function openSessionChatSheet(
  session,
  {
    canWithdraw = false,
    courts = [],
    onBlock = () => {},
    onClose = () => {},
    onPost = () => {},
    onReport = () => {},
    onWithdraw = () => {},
  } = {}
) {
  if (!lazyMounts.sessionChat) {
    return deferSurfaceOpen({
      id: "session-chat-sheet",
      label: "球局群組聊天",
      className: "session-chat-sheet",
      load: preloadSessionChatSheet,
      methods: ["setArchived", "setState"],
      onClose,
      open: () =>
        openSessionChatSheet(session, { canWithdraw, courts, onBlock, onClose, onPost, onReport, onWithdraw }),
    });
  }
  let archived = ["cancelled", "expired", "played"].includes(String(session?.status).toLowerCase());
  const venue = sessionVenuePresentation(session, courts);
  // 批 D7:header 副行沿用抽取規格 §4 chatSub 語意(今天/明天/週X + 時刻 + 主揪
  // X/我),與既有 .chat-session-summary(下方保留,aria-label="球局資訊",供
  // 候選局/已定案文案等既有測試斷言)分工——前者是新視覺標題,後者是既有資訊卡。
  const headerSub = sessionScheduleLabel(session);
  const mounted = mountSheet({
    id: "session-chat-sheet",
    label: "球局群組聊天",
    className: "session-chat-sheet",
    onClose,
    html: "",
  });
  const content = lazyMounts.sessionChat(mounted.surface, {
    archived,
    canWithdraw,
    headerSub,
    onClose: () => mounted.close(),
    onFeedClick: (event) => handleFeedClick(event),
    playType: String(session.playType),
    venueBadge: venue.badge,
    venueCourt: venue.court,
    venueTime: venue.time,
  });
  registerChatContent(mounted, content);
  const feed = mounted.root.querySelector("[data-chat-feed]");
  const loading = mounted.root.querySelector("[data-chat-loading]");
  const error = mounted.root.querySelector("[data-chat-error]");
  const input = mounted.root.querySelector("[data-testid='chat-message-input']");
  const send = mounted.root.querySelector("[data-testid='chat-send']");
  const announcement = mounted.root.querySelector("[data-chat-announcement]");
  let feedInitialized = false;
  let knownMessageIds = new Set();
  let scrollRequestId = 0;

  function scrollFeedToLatest() {
    const requestId = ++scrollRequestId;
    const scroll = () => {
      if (requestId !== scrollRequestId || !mounted.root.contains(feed)) return;
      feed.scrollTop = feed.scrollHeight;
    };
    scroll();
    requestAnimationFrame(() => {
      scroll();
      requestAnimationFrame(scroll);
    });
  }

  function setArchived(message = "") {
    archived = true;
    // Keep React's DOM ownership coherent: the withdraw button is conditional
    // React output, so the archived transition must remove it through a render.
    // Imperatively detaching it makes a later root.unmount() call removeChild on
    // an already-removed node (the batch-20 archived-chat close regression).
    content.setArchived();
    if (message) {
      error.textContent = message;
      error.hidden = false;
      error.focus({ preventScroll: true });
    }
    scrollFeedToLatest();
  }

  function setState({ errorMessage = "", messages = [], roster: participants = [], status = "ready" } = {}) {
    const safeMessages = Array.isArray(messages) ? messages : [];
    loading.hidden = status !== "loading";
    if (status === "loading") loading.textContent = "正在讀取群組訊息…";
    error.textContent = errorMessage;
    error.hidden = !errorMessage;
    // 背景輪詢會週期重繪 feed:只有在使用者本來就貼近底部時才跟捲到底,回看歷史時
    // 保留原捲動位置(React 以 generation key 重建全部訊息節點,與舊 innerHTML 置換
    // 一樣會歸零 scrollTop,必須先量後還原)。
    const nearBottom = !feedInitialized || feed.scrollHeight - feed.scrollTop - feed.clientHeight < 48;
    const previousScrollTop = feed.scrollTop;
    content.setContent(participants, safeMessages);
    if (nearBottom) scrollFeedToLatest();
    else feed.scrollTop = previousScrollTop;
    if (status === "ready") {
      const nextMessageIds = new Set(safeMessages.map((message) => String(message?.messageId ?? "")).filter(Boolean));
      const newMessageCount = feedInitialized
        ? [...nextMessageIds].filter((messageId) => !knownMessageIds.has(messageId)).length
        : 0;
      announcement.textContent = newMessageCount ? `新增 ${newMessageCount} 則訊息` : "";
      knownMessageIds = nextMessageIds;
      feedInitialized = true;
    }
  }

  mounted.root.querySelector("[data-chat-composer]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (archived || send.disabled) return;
    const body = String(input.value ?? "").trim();
    error.hidden = true;
    if (!body || body.length > 1000) {
      error.textContent = "請輸入 1 至 1000 字的純文字訊息。";
      error.hidden = false;
      return;
    }
    await runAsyncAction({
      root: mounted.root,
      callback: () => onPost(body),
      controls: [send, input],
      error,
      clearError: false,
      errorMessage: "訊息暫時無法傳送，請稍後再試。",
      errorFocus: true,
      onSuccess: () => {
        input.value = "";
      },
      canRestoreControls: () => !archived,
    });
  });
  // 委派語意不變:onClick 宣告在 [data-chat-feed] 上(React 18 的原生 listener 掛在
  // createRoot 容器,feed 與容器之間無 stopPropagation),訊息節點被 generation key
  // 重建也不需要重新綁定,`event.target.closest()` 的判準與舊 addEventListener 版
  // 逐字相同。
  const handleFeedClick = (event) => {
    const reportButton = event.target.closest("[data-chat-report]");
    const blockButton = event.target.closest("[data-chat-block]");
    if (reportButton)
      void Promise.resolve()
        .then(() => onReport(reportButton.dataset.chatReport))
        .catch((reportError) => {
          error.textContent = sessionActionMessage(reportError, "目前無法開啟檢舉。");
          error.hidden = false;
        });
    if (blockButton)
      void Promise.resolve(onBlock(blockButton.dataset.chatBlock)).catch((blockError) => {
        error.textContent = sessionActionMessage(blockError, "封鎖設定暫時無法更新，請稍後再試。");
        error.hidden = false;
      });
  };
  mounted.root.querySelector("[data-chat-withdraw]")?.addEventListener("click", () => {
    onWithdraw();
  });

  return { ...mounted, setArchived, setState };
}

/**
 * Open a public session detail sheet with the privacy-reviewed field order.
 *
 * 批 C3-2:join 旅程單層化。動作區是就地切換的四態狀態機
 * (idle/confirming/submitting/success/error,容器帶 `data-join-stage`),不再開
 * 第二層 join confirmation dialog——舊的獨立確認 dialog 函式已整支退役。
 *
 * 批 D4b:視覺改 v2 計分板殼(dc L333-426),join 五態狀態機、資料契約與全部
 * data-testid 不動;canDecide 的「定案」動作搬進候選定案面板(渲染在
 * `.session-detail__actions` 之外,不隨五態重繪)。新增 isMine 參數(頭部
 * 「我主揪的」badge 與候選資訊列的 guest-only 條件用)。
 */
export function openSessionSheet(
  session,
  {
    action,
    canDecide = false,
    canEdit = false,
    canChat = false,
    canReport = false,
    isMine = false,
    showJoinPreview = false,
    courts = [],
    notificationSettings = {},
    initialStage = "idle",
    onCopyLink = () => {},
    onDecide = () => {},
    onEdit = () => {},
    onChat = () => {},
    onPrimary = () => {},
    onConfirmJoin = async () => ({}),
    onEnablePush = () => {},
    onViewMySessions = () => {},
    onReport = () => {},
    onWithdraw = () => {},
    onClose = () => {},
  } = {}
) {
  if (!lazyMounts.sessionDetail) {
    return deferSurfaceOpen({
      id: "session-sheet",
      label: "球局詳情",
      className: "session-detail-sheet",
      load: preloadSessionDetailSheet,
      methods: ["setJoinPreview", "enterConfirming"],
      onClose,
      open: () =>
        openSessionSheet(session, {
          action,
          canDecide,
          canEdit,
          canChat,
          canReport,
          isMine,
          showJoinPreview,
          courts,
          notificationSettings,
          initialStage,
          onCopyLink,
          onDecide,
          onEdit,
          onChat,
          onPrimary,
          onConfirmJoin,
          onEnablePush,
          onViewMySessions,
          onReport,
          onWithdraw,
          onClose,
        }),
    });
  }
  const venue = sessionVenuePresentation(session, courts);
  let content = null;

  const mounted = mountSheet({
    id: "session-sheet",
    label: "球局詳情",
    className: "session-detail-sheet",
    onClose,
    onEscape: () => {
      // 假設 1(design spec):confirming 態 Escape 先退一步回 idle,sheet 不關;
      // 其餘四態(idle/submitting/success/error)交回 mountSheet 現行關閉語意。
      return content?.handleEscape() ?? false;
    },
    html: `
      <span class="session-detail-sheet__grabber"></span>
      <div class="session-detail"></div>`,
  });

  const contentRoot = mounted.root.querySelector(".session-detail");
  content = lazyMounts.sessionDetail(
    contentRoot,
    {
      action,
      canChat,
      canDecide,
      canEdit,
      canReport,
      courts,
      isMine,
      notificationSettings,
      session,
      showJoinPreview,
      venue,
    },
    {
      expectedAccepted: Boolean(action?.expectedAccepted),
      joinPreview: { participants: [], status: "loading" },
      message: "",
      stage: initialStage,
    },
    {
      onChat,
      onCloseSurface: () => mounted.close(),
      onConfirmJoin,
      onCopyLink,
      onDecide,
      onEdit,
      onEnablePush,
      onPrimary,
      onReport,
      onViewMySessions: (sessionId) => {
        mounted.close({ reason: "view-my-sessions", restoreFocus: false });
        onViewMySessions(sessionId);
      },
      onWithdraw,
    }
  );
  registerDetailContent(mounted, content);
  const setJoinPreview = (state) => {
    if (content.isSurfaceRootLive()) content.setJoinPreview(state);
  };

  function enterConfirming({ expectedAccepted } = {}) {
    content.enterConfirming(expectedAccepted === undefined ? undefined : Boolean(expectedAccepted));
  }

  return { ...mounted, setJoinPreview, enterConfirming };
}

/** Explain a public deep link that no longer resolves to an available session. */
export function openSessionUnavailableSheet() {
  if (!lazyMounts.sessionUnavailable) {
    return deferSurfaceOpen({
      id: "session-unavailable-sheet",
      label: "找不到球局",
      load: preloadSessionUnavailableSheet,
      open: () => openSessionUnavailableSheet(),
    });
  }
  const mounted = mountSheet({
    id: "session-unavailable-sheet",
    label: "找不到球局",
    html: "",
  });
  const content = lazyMounts.sessionUnavailable(mounted.surface, () => mounted.close());
  registerUnavailableContent(mounted, content);
  return mounted;
}

/** Require an explicit in-project warning before a member exits a session. */
export function openWithdrawSessionConfirmation({ onClose = () => {}, onConfirm = async () => {} } = {}) {
  if (!lazyMounts.withdrawConfirmation) {
    return deferSurfaceOpen({
      id: "withdraw-session-confirmation",
      label: "確認退出這一局？",
      load: preloadWithdrawSessionConfirmationDialog,
      onClose,
      open: () => openWithdrawSessionConfirmation({ onClose, onConfirm }),
      type: "dialog",
    });
  }
  const mounted = mountDialog({
    id: "withdraw-session-confirmation",
    label: "確認退出這一局？",
    onClose,
    html: "",
  });
  // mountDialog 建殼時內容還空著,綁不到 [data-surface-close];× 與「先不要」改由 React
  // onClick 呼叫同一個 mounted.close()。等價性見批 8.1:HEAD 的 listener 收到 MouseEvent,
  // close({ reason = "dismiss", restoreFocus = true } = {}) 解構它拿到的就是兩個預設值。
  const content = lazyMounts.withdrawConfirmation(mounted.surface, {
    onClose: () => mounted.close(),
  });
  registerWithdrawContent(mounted, content);
  const confirmButton = mounted.root.querySelector("[data-confirm-withdraw]");
  const error = mounted.root.querySelector("[data-withdraw-error]");
  let submitting = false;
  confirmButton?.addEventListener("click", async () => {
    if (submitting) return;
    submitting = true;
    await runAsyncAction({
      root: mounted.root,
      callback: async () => {
        await onConfirm();
        mounted.close({ reason: "complete" });
      },
      controls: [confirmButton],
      error,
      errorMessage: "退出球局暫時無法完成，請稍後再試。",
      onFinally: ({ controlsRestored }) => {
        if (controlsRestored) submitting = false;
      },
    });
  });
  return mounted;
}

/** Collect a minimal, reviewable report without exposing any new profile data. */
export function openReportDialog({ targetLabel = "這個項目", onClose = () => {}, onSubmit = () => {} } = {}) {
  if (!lazyMounts.reportDialog) {
    return deferSurfaceOpen({
      id: "report-dialog",
      label: "檢舉",
      load: preloadReportDialog,
      onClose,
      open: () => openReportDialog({ targetLabel, onClose, onSubmit }),
      type: "dialog",
    });
  }
  const mounted = mountDialog({
    id: "report-dialog",
    label: "檢舉",
    onClose,
    html: "",
  });
  // targetLabel 沿用 esc() 的 String() 語意(React 自己負責 escape);× 的 close 走
  // React onClick,理由同 openWithdrawSessionConfirmation。
  const content = lazyMounts.reportDialog(mounted.surface, {
    onClose: () => mounted.close(),
    targetLabel: String(targetLabel),
  });
  registerReportContent(mounted, content);
  const form = mounted.root.querySelector("[data-testid='report-form']");
  const submit = mounted.root.querySelector("[data-testid='report-submit']");
  const error = mounted.root.querySelector("[data-report-error]");
  const success = mounted.root.querySelector("[data-report-success]");
  let submitting = false;
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;
    const reason = form.querySelector("[name='report-reason']:checked")?.value;
    if (!reason) {
      error.textContent = "請選擇檢舉原因。";
      error.hidden = false;
      return;
    }
    submitting = true;
    await runAsyncAction({
      root: mounted.root,
      callback: () => onSubmit(reason),
      controls: [submit],
      error,
      errorMessage: "檢舉暫時無法送出，請稍後再試。",
      onSuccess: () => {
        form.hidden = true;
        success.hidden = false;
        success.focus({ preventScroll: true });
      },
      canRestoreControls: () => !form.hidden,
      onFinally: ({ controlsRestored }) => {
        if (controlsRestored) submitting = false;
      },
    });
  });
  return mounted;
}
