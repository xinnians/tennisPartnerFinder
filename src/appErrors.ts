export const APP_ERROR_SURFACES = [
  "global",
  "me-page",
  "messages-page",
  "my-sessions-page",
  "nearby-sessions-drawer",
  "court-players-sheet",
  "court-session-sheet",
  "create-session-sheet",
  "decide-session-sheet",
  "edit-session-sheet",
  "filter-sheet",
  "player-card-sheet",
  "player-directory-sheet",
  "profile-completion-sheet",
  "report-dialog",
  "session-chat-sheet",
  "session-detail-sheet",
  "session-unavailable-sheet",
  "withdraw-session-dialog",
] as const;

export type AppErrorSurface = (typeof APP_ERROR_SURFACES)[number];
export type AppErrorKind = "react-render" | "window-error" | "unhandled-rejection";

export interface AppErrorReport {
  readonly errorName:
    | "AggregateError"
    | "Error"
    | "EvalError"
    | "RangeError"
    | "ReferenceError"
    | "SyntaxError"
    | "TypeError"
    | "URIError";
  readonly kind: AppErrorKind;
  readonly surface: AppErrorSurface;
}

/** The complete payload contract available to any future external transport. */
export const APP_ERROR_TRANSPORT_FIELDS = Object.freeze(["errorName", "kind", "surface"] as const);
export type AppErrorTransport = (report: AppErrorReport) => void;

const SAFE_ERROR_NAMES = new Set<AppErrorReport["errorName"]>([
  "AggregateError",
  "Error",
  "EvalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
]);
const SAFE_SURFACES = new Set<AppErrorSurface>(APP_ERROR_SURFACES);
const NOOP_TRANSPORT: AppErrorTransport = () => {};
const installedGlobalHandlers = new WeakMap<EventTarget, () => void>();
let transport: AppErrorTransport = NOOP_TRANSPORT;

function safeErrorName(error: unknown): AppErrorReport["errorName"] {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "Error";
  return SAFE_ERROR_NAMES.has(name as AppErrorReport["errorName"]) ? (name as AppErrorReport["errorName"]) : "Error";
}

function safeSurface(surface: string): AppErrorSurface {
  return SAFE_SURFACES.has(surface as AppErrorSurface) ? (surface as AppErrorSurface) : "global";
}

/**
 * Build the future transport payload from an allowlist. Raw messages, stacks,
 * URLs, user fields, location, retired contact identifiers and roster data never enter it.
 */
export function captureAppError(kind: AppErrorKind, surface: string, error: unknown): AppErrorReport {
  const report = Object.freeze({ errorName: safeErrorName(error), kind, surface: safeSurface(surface) });
  try {
    transport(report);
  } catch {
    // Error reporting must never become a second application failure.
  }
  return report;
}

/**
 * The sole registration point for a future vendor adapter. Production does not
 * call it yet, so the default remains NOOP_TRANSPORT.
 */
export function configureAppErrorTransport(nextTransport: AppErrorTransport = NOOP_TRANSPORT): () => void {
  const previous = transport;
  transport = typeof nextTransport === "function" ? nextTransport : NOOP_TRANSPORT;
  return () => {
    transport = previous;
  };
}

export function installGlobalErrorHandlers(
  target: EventTarget | null | undefined,
  { onCaptured = () => {} }: { onCaptured?: (report: AppErrorReport) => void } = {}
): () => void {
  if (!target?.addEventListener) return () => {};
  const existingCleanup = installedGlobalHandlers.get(target);
  if (existingCleanup) return existingCleanup;

  const capture = (kind: AppErrorKind, error: unknown) => {
    const report = captureAppError(kind, "global", error);
    try {
      onCaptured(report);
    } catch {
      // The user-facing fallback is best effort and must not recurse.
    }
  };
  const onError = (event: Event) => capture("window-error", "error" in event ? event.error : undefined);
  const onUnhandledRejection = (event: Event) =>
    capture("unhandled-rejection", "reason" in event ? event.reason : undefined);
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onUnhandledRejection);

  const cleanup = () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onUnhandledRejection);
    if (installedGlobalHandlers.get(target) === cleanup) installedGlobalHandlers.delete(target);
  };
  installedGlobalHandlers.set(target, cleanup);
  return cleanup;
}

/** Show one dismissible notice for non-React failures without exposing details. */
export function showGlobalErrorNotice(documentRoot: Document): HTMLElement | null {
  const existing = documentRoot.getElementById("app-error-notice");
  if (existing instanceof HTMLElement) return existing;
  if (!documentRoot.body) return null;

  const notice = documentRoot.createElement("aside");
  notice.id = "app-error-notice";
  notice.className = "app-error-notice";
  notice.setAttribute("role", "alert");
  notice.setAttribute("aria-label", "網頁錯誤提醒");

  const message = documentRoot.createElement("span");
  message.textContent = "剛才的操作沒有完整完成，請再試一次。";
  const close = documentRoot.createElement("button");
  close.type = "button";
  close.className = "app-error-notice__close";
  close.textContent = "關閉";
  close.addEventListener("click", () => notice.remove());
  notice.append(message, close);
  documentRoot.body.append(notice);
  return notice;
}
