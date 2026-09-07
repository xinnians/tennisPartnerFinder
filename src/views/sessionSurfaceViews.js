import { mountDialog, mountSheet } from "../sheets.ts";
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
    feed,
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
      onClose,
      open: () =>
        openSessionChatSheet(session, { canWithdraw, courts, feed, onBlock, onClose, onPost, onReport, onWithdraw }),
    });
  }
  if (!feed || typeof feed.getSnapshot !== "function" || typeof feed.subscribe !== "function") {
    throw new TypeError("Chat feed is unavailable.");
  }
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
    canWithdraw,
    feed,
    headerSub,
    onBlock,
    onClose: () => mounted.close(),
    onPost,
    onReport,
    onWithdraw,
    playType: String(session.playType),
    venueBadge: venue.badge,
    venueCourt: venue.court,
    venueTime: venue.time,
  });
  registerChatContent(mounted, content);
  return mounted;
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
