import { esc } from "./util.js";

const sheetRoot = () => document.getElementById("sheet-root");
const modalRoot = () => document.getElementById("modal-root");
const surfaces = new WeakMap();

function focusableNodes(surface) {
  return [...surface.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(
    (node) => !node.hasAttribute("hidden")
  );
}

function mountSurface(root, { id, label, className = "", html, onMount } = {}) {
  closeSurface(root, { restoreFocus: false });

  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  root.innerHTML = `
    <div class="surface-backdrop" data-surface-dismiss></div>
    <section id="${esc(id)}" class="surface ${esc(className)}" role="dialog" aria-modal="true" aria-label="${esc(
      label
    )}" tabindex="-1">
      ${html}
    </section>`;

  const surface = root.querySelector(".surface");
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    surface.removeEventListener("keydown", onKeyDown);
    root.innerHTML = "";
    surfaces.delete(root);
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  };

  const onKeyDown = (event) => {
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

  surface.addEventListener("keydown", onKeyDown);
  root.querySelector("[data-surface-dismiss]")?.addEventListener("click", close);
  root.querySelectorAll("[data-surface-close]").forEach((button) => button.addEventListener("click", close));
  surfaces.set(root, { close });

  onMount?.({ root, surface, close });
  requestAnimationFrame(() => (focusableNodes(surface)[0] ?? surface).focus({ preventScroll: true }));
  return { root, surface, close };
}

function closeSurface(root, { restoreFocus = true } = {}) {
  const active = surfaces.get(root);
  if (active) {
    if (restoreFocus) active.close();
    else {
      root.innerHTML = "";
      surfaces.delete(root);
    }
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

export function openLoginModal({ onProvider }) {
  const mounted = mountDialog({
    id: "login-dialog",
    label: "登入後繼續",
    className: "auth-dialog",
    html: `
      <div class="surface__head">
        <div>
          <p class="surface__eyebrow">登入後繼續</p>
          <h2>登入以申請加入球局</h2>
        </div>
        <button type="button" class="surface__close" data-surface-close aria-label="關閉">×</button>
      </div>
      <p class="surface__copy">我們只會在已接受的配對中提供聯絡方式。</p>
      <p class="surface__message" data-login-message hidden></p>
      <button type="button" class="session-primary" data-provider="google">使用 Google 登入</button>`,
  });

  mounted.root.querySelector("[data-provider]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const message = mounted.root.querySelector("[data-login-message]");
    button.disabled = true;
    try {
      await onProvider("google");
      message.textContent = "正在前往登入頁…";
      message.hidden = false;
    } catch {
      message.textContent = "登入啟動失敗，請稍後再試。";
      message.hidden = false;
      button.disabled = false;
    }
  });
}
