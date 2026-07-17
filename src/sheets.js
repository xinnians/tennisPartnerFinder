import { esc } from "./util.js";
import { pushSurfaceIsolation } from "./modalIsolation.js";

const sheetRoot = () => document.getElementById("sheet-root");
const modalRoot = () => document.getElementById("modal-root");
const surfaces = new WeakMap();
const surfaceStack = [];

function focusableNodes(surface) {
  return [...surface.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(
    (node) => !node.hasAttribute("hidden")
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
  return [...scope.querySelectorAll("[data-session-id]")].find(
    (node) => String(node.dataset.sessionId) === String(target.sessionId)
  );
}

function mountSurface(root, { id, label, className = "", html, onClose, onMount } = {}) {
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
  let surfaceEntry = null;
  const close = ({ reason = "dismiss", restoreFocus = true } = {}) => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKeyDown, true);
    const stackIndex = surfaceStack.indexOf(surfaceEntry);
    if (stackIndex >= 0) surfaceStack.splice(stackIndex, 1);
    releaseIsolation();
    root.innerHTML = "";
    surfaces.delete(root);
    onClose?.({ reason });
    if (restoreFocus) resolveRestoreTarget(previousFocus)?.focus({ preventScroll: true });
  };

  const onKeyDown = (event) => {
    if (surfaceStack.at(-1) !== surfaceEntry) return;
    if (event.key === "Escape") {
      event.preventDefault();
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
  return { root, surface, close };
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

export function openLoginModal({ onProvider, onClose } = {}) {
  const mounted = mountDialog({
    id: "login-dialog",
    label: "登入後繼續",
    className: "auth-dialog",
    onClose,
    html: `
      <div class="surface__head">
        <div>
          <p class="surface__eyebrow">登入後繼續</p>
          <h2>登入以申請加入球局</h2>
        </div>
        <button type="button" class="surface__close" data-surface-close aria-label="關閉">×</button>
      </div>
      <p class="surface__copy">我們只會在已接受的配對中提供聯絡方式。</p>
      <p class="surface__message" data-login-message role="status" aria-live="polite" aria-atomic="true"></p>
      <button type="button" class="session-primary" data-provider="google">使用 Google 登入</button>`,
  });

  mounted.root.querySelector("[data-provider]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const message = mounted.root.querySelector("[data-login-message]");
    button.disabled = true;
    try {
      await onProvider("google");
      message.textContent = "正在前往登入頁…";
    } catch {
      message.textContent = "登入啟動失敗，請稍後再試。";
      button.disabled = false;
    }
  });
}
