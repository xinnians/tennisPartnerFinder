import { pushSurfaceIsolation } from "./modalIsolation.js";
import { AUTH_LINE_PROVIDER_ID } from "./config.js";
import { FOCUSABLE_SELECTOR } from "./focusableSelector.js";

const sheetRoot = () => document.getElementById("sheet-root");
const modalRoot = () => document.getElementById("modal-root");
const surfaces = new WeakMap();
let mountReactSurfaceShell = null;
let surfaceKeyboardRegistry = null;

export function configureSurfaceShellRenderer(renderer) {
  mountReactSurfaceShell = renderer;
}

export function configureSurfaceKeyboardRegistry(registry) {
  surfaceKeyboardRegistry = registry;
}

function focusableNodes(surface) {
  return [...surface.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
    (node) => !node.hasAttribute("hidden") && !node.closest("[hidden]")
  );
}

function captureRestoreTarget(node) {
  if (!(node instanceof HTMLElement)) return null;
  const sessionId = node.dataset?.sessionId ?? null;
  const drawer = node.closest("#nearby-sessions-drawer");
  return { drawerId: drawer?.id ?? null, node, sessionId };
}

function resolveRestoreTarget(target) {
  if (!target) return null;
  if (target.node?.isConnected) return target.node;
  if (!target.sessionId) return null;
  const scope = target.drawerId ? document.getElementById(target.drawerId) : document;
  if (!scope) return null;
  const restoredCard = [...scope.querySelectorAll("[data-session-id]")].find(
    (node) => String(node.dataset.sessionId) === String(target.sessionId)
  );
  if (restoredCard) return restoredCard;
  // An authoritative refresh can remove a public card while its detail and
  // confirmation are still open. Return focus to the persistent drawer
  // surface so closing those layers never leaves a keyboard user at body.
  // 批 C2-2 fix round 1(review Important):這個 fallback 鏈原本(改動前)只有
  // [data-nearby-dialog] [data-nearby-close] 一條,且是無條件套用——resolveRestoreTarget
  // 是通用函式,任何 mountSheet/mountDialog(My Sessions 卡片開的 report/chat sheet 等,
  // 完全跟抽屜無關)都會走到這裡。half 沒有 [data-nearby-dialog],批 C2-2 一度把
  // 「收合」鈕/toggle 也加進同一條無條件 fallback,結果變成任何非抽屜 surface 的卡片
  // 消失後關閉,焦點都會被無條件送去抽屜 toggle——擴散到抽屜以外、零測試覆蓋的規模。
  // 修正:「收合」鈕/toggle 只在還原目標原本就屬於抽屜語境時使用(target.drawerId
  // 有值,即 captureRestoreTarget 當初用 node.closest("#nearby-sessions-drawer")
  // 命中);非抽屜語境維持修法前行為——只試 full 專屬選擇器,找不到就不移動焦點。
  const drawerCloseFallback = target.drawerId
    ? (scope.querySelector('[data-testid="drawer-collapse"]') ?? scope.querySelector("#nearby-sessions-toggle"))
    : null;
  return scope.querySelector("[data-nearby-dialog] [data-nearby-close]") ?? drawerCloseFallback;
}

function mountSurface(root, { id, label, className = "", html, onClose, onMount, onEscape } = {}) {
  const active = surfaces.get(root);
  // When a detail replaces a court sheet in the same root, retain the court
  // opener rather than the card about to be removed with the old surface.
  const previousFocus = active?.restoreFocus ?? captureRestoreTarget(document.activeElement);
  closeSurface(root, { reason: "replace", restoreFocus: false });
  if (!mountReactSurfaceShell) throw new Error("Surface shell React renderer is unavailable.");
  if (!surfaceKeyboardRegistry) throw new Error("Surface keyboard registry is unavailable.");
  const shell = mountReactSurfaceShell(root, { className, html, id, label });
  const { surface } = shell;
  const releaseIsolation = pushSurfaceIsolation(root);
  let closed = false;
  let unmountContent = null;
  let unregisterSurfaceKeyboard = null;
  let surfaceEntry;
  const registerUnmount = (unmount) => {
    if (typeof unmount !== "function") throw new TypeError("Surface unmount callback must be a function.");
    if (closed) {
      unmount();
      return;
    }
    unmountContent = unmount;
  };
  const close = ({ reason = "dismiss", restoreFocus = true } = {}) => {
    if (closed) return;
    closed = true;
    unregisterSurfaceKeyboard?.();
    unregisterSurfaceKeyboard = null;
    releaseIsolation();
    let unmountError = null;
    try {
      unmountContent?.();
    } catch (error) {
      unmountError = error;
    }
    unmountContent = null;
    let shellUnmountError = null;
    try {
      shell.unmount();
    } catch (error) {
      shellUnmountError = error;
    } finally {
      surfaces.delete(root);
      onClose?.({ reason });
      if (restoreFocus) resolveRestoreTarget(previousFocus)?.focus({ preventScroll: true });
    }
    if (unmountError && shellUnmountError) {
      throw new AggregateError([unmountError, shellUnmountError], "Surface content and shell unmount failed.");
    }
    if (unmountError) throw unmountError;
    if (shellUnmountError) throw shellUnmountError;
  };

  surfaceEntry = { close, onEscape, restoreFocus: previousFocus, surface };
  unregisterSurfaceKeyboard = surfaceKeyboardRegistry.register(surfaceEntry);
  root.querySelector("[data-surface-dismiss]")?.addEventListener("click", close);
  root.querySelectorAll("[data-surface-close]").forEach((button) => button.addEventListener("click", close));
  surfaces.set(root, surfaceEntry);

  onMount?.({ root, surface, close });
  requestAnimationFrame(() => {
    // Do not overwrite an intentional focus move made immediately after a
    // surface opens (for example, a keyboard action selecting its primary
    // CTA before the next animation frame).
    if (!closed && !surface.contains(document.activeElement)) {
      (focusableNodes(surface)[0] ?? surface).focus({ preventScroll: true });
    }
  });
  return { root, surface, close, registerUnmount };
}

function closeSurface(root, { reason = "dismiss", restoreFocus = true } = {}) {
  const active = surfaces.get(root);
  if (active) {
    active.close({ reason, restoreFocus });
  } else {
    // A registered React shell always has a surfaces entry. Reaching this
    // branch means there is no live shell; clear only defensive stale DOM.
    root.innerHTML = "";
  }
}

/** Mount a focus-trapped bottom/side sheet for public session information. */
export function mountSheet(options) {
  return mountSurface(sheetRoot(), { ...options, className: `surface--sheet ${options.className ?? ""}`.trim() });
}

/** Mount a focus-trapped confirmation or sign-in dialog. */
export function mountDialog(options) {
  return mountSurface(modalRoot(), { ...options, className: `surface--dialog ${options.className ?? ""}`.trim() });
}

let mountLoginModalContent = null;

export function configureLoginModalContent(renderer) {
  mountLoginModalContent = renderer;
}

// lineProviderId 是 Supabase custom provider 識別符;空值時不渲染 LINE 按鈕,
// 部署端未設好 provider 前保持既有單一 Google 入口。
export function openLoginModal({ action = "", onProvider, onClose, lineProviderId = AUTH_LINE_PROVIDER_ID } = {}) {
  const mounted = mountDialog({
    id: "login-dialog",
    label: "登入後繼續",
    className: "auth-dialog",
    onClose,
    html: "",
  });
  if (!mountLoginModalContent) throw new Error("Login modal React content is unavailable.");
  const content = mountLoginModalContent(mounted.surface, {
    action: String(action),
    lineProviderId: String(lineProviderId),
    onClose: () => mounted.close(),
    onProvider,
  });
  mounted.registerUnmount(content.unmount);
}
