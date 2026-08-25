import { esc } from "./util.js";
import { pushSurfaceIsolation } from "./modalIsolation.js";
import { AUTH_LINE_PROVIDER_ID } from "./config.js";
import { FOCUSABLE_SELECTOR } from "./focusableSelector.js";

const sheetRoot = () => document.getElementById("sheet-root");
const modalRoot = () => document.getElementById("modal-root");
const surfaces = new WeakMap();
const surfaceStack = [];

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
  root.innerHTML = `
    <div class="surface-backdrop" data-surface-dismiss></div>
    <section id="${esc(id)}" data-testid="${esc(id)}" class="surface ${esc(className)}" role="dialog" aria-modal="true" aria-label="${esc(
      label
    )}" tabindex="-1">
      ${html}
    </section>`;

  const surface = root.querySelector(".surface");
  const releaseIsolation = pushSurfaceIsolation(root);
  let closed = false;
  let unmountContent = null;
  let surfaceEntry = null;
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
    document.removeEventListener("keydown", onKeyDown, true);
    const stackIndex = surfaceStack.indexOf(surfaceEntry);
    if (stackIndex >= 0) surfaceStack.splice(stackIndex, 1);
    releaseIsolation();
    let unmountError = null;
    try {
      unmountContent?.();
    } catch (error) {
      unmountError = error;
    }
    unmountContent = null;
    root.innerHTML = "";
    surfaces.delete(root);
    onClose?.({ reason });
    if (restoreFocus) resolveRestoreTarget(previousFocus)?.focus({ preventScroll: true });
    if (unmountError) throw unmountError;
  };

  const onKeyDown = (event) => {
    if (surfaceStack.at(-1) !== surfaceEntry) return;
    if (event.key === "Escape") {
      event.preventDefault();
      // The opener can still own focus until this surface's first animation
      // frame. Consume Escape here so that same event cannot close an
      // underlying drawer after this top surface restores its opener.
      event.stopPropagation();
      // 批 C3-2:join 單層化——sheet 內部可以有自己的「先退一步」語意(例如
      // confirming 態的 Escape 應該退回 idle,而不是整張 sheet 關掉)。onEscape
      // 若回傳 true 代表呼叫端已經自行處理過這次 Escape,這裡就不再呼叫 close()。
      if (onEscape?.()) return;
      close();
      return;
    }
    if (event.key !== "Tab") return;

    const nodes = focusableNodes(surface);
    if (nodes.length === 0) {
      event.preventDefault();
      surface.focus();
      return;
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  surfaceEntry = { close, restoreFocus: previousFocus };
  surfaceStack.push(surfaceEntry);
  // Keep Escape and the tab loop scoped to the topmost surface even if a
  // browser extension or an async state update moves focus to document.body.
  document.addEventListener("keydown", onKeyDown, true);
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

export function closeSheet() {
  closeSurface(sheetRoot());
}

export function closeModal() {
  closeSurface(modalRoot());
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
