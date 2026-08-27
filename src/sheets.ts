import type {
  LoginModalContentRenderer,
  SurfaceFocusRegistry,
  SurfaceKeyboardEntry,
  SurfaceKeyboardRegistry,
  SurfaceShellProps,
  SurfaceShellRenderer,
} from "./surfaceContracts.ts";
import { pushSurfaceIsolation } from "./modalIsolation.js";
import { AUTH_LINE_PROVIDER_ID } from "./config.ts";

interface SurfaceCloseOptions {
  reason?: string;
  restoreFocus?: boolean;
}

interface SurfaceMountHandle {
  root: HTMLElement;
  surface: HTMLElement;
  close(options?: SurfaceCloseOptions): void;
  registerUnmount(unmount: unknown): void;
}

interface SurfaceMountOptions {
  id?: unknown;
  label?: unknown;
  className?: unknown;
  html?: unknown;
  onClose?: (options: { reason: string }) => void;
  onMount?: (handle: Pick<SurfaceMountHandle, "root" | "surface" | "close">) => void;
  onEscape?: () => unknown;
}

interface LoginModalOptions {
  action?: unknown;
  onProvider?: (provider: string) => unknown;
  onClose?: (options: { reason: string }) => void;
  lineProviderId?: unknown;
}

const sheetRoot = () => document.getElementById("sheet-root");
const modalRoot = () => document.getElementById("modal-root");
const surfaces = new WeakMap<HTMLElement, SurfaceKeyboardEntry>();
let mountReactSurfaceShell: SurfaceShellRenderer | null = null;
let surfaceKeyboardRegistry: SurfaceKeyboardRegistry | null = null;
let surfaceFocusRegistry: SurfaceFocusRegistry | null = null;

export function configureSurfaceShellRenderer(renderer: SurfaceShellRenderer) {
  mountReactSurfaceShell = renderer;
}

export function configureSurfaceKeyboardRegistry(registry: SurfaceKeyboardRegistry) {
  surfaceKeyboardRegistry = registry;
}

export function configureSurfaceFocusRegistry(registry: SurfaceFocusRegistry) {
  surfaceFocusRegistry = registry;
}

function mountSurface(
  root: HTMLElement,
  { id, label, className = "", html, onClose, onMount, onEscape }: SurfaceMountOptions = {}
): SurfaceMountHandle {
  const focusRegistry = surfaceFocusRegistry;
  if (!focusRegistry) throw new Error("Surface focus registry is unavailable.");
  const active = surfaces.get(root);
  // When a detail replaces a court sheet in the same root, retain the court
  // opener rather than the card about to be removed with the old surface.
  const previousFocus = active?.restoreFocus ?? focusRegistry.captureRestoreTarget(document.activeElement);
  closeSurface(root, { reason: "replace", restoreFocus: false });
  if (!mountReactSurfaceShell) throw new Error("Surface shell React renderer is unavailable.");
  if (!surfaceKeyboardRegistry) throw new Error("Surface keyboard registry is unavailable.");
  const shell = mountReactSurfaceShell(root, { className, html, id, label } as SurfaceShellProps);
  const { surface } = shell;
  const releaseIsolation = pushSurfaceIsolation(root);
  let closed = false;
  let unmountContent: (() => void) | null = null;
  let unregisterSurfaceKeyboard: (() => void) | null = null;
  const registerUnmount = (unmount: unknown) => {
    if (typeof unmount !== "function") throw new TypeError("Surface unmount callback must be a function.");
    if (closed) {
      (unmount as () => void)();
      return;
    }
    unmountContent = unmount as () => void;
  };
  const close = ({ reason = "dismiss", restoreFocus = true }: SurfaceCloseOptions = {}): void => {
    if (closed) return;
    closed = true;
    unregisterSurfaceKeyboard?.();
    unregisterSurfaceKeyboard = null;
    releaseIsolation();
    let unmountError: unknown = null;
    try {
      unmountContent?.();
    } catch (error) {
      unmountError = error;
    }
    unmountContent = null;
    let shellUnmountError: unknown = null;
    try {
      shell.unmount();
    } catch (error) {
      shellUnmountError = error;
    } finally {
      surfaces.delete(root);
      onClose?.({ reason });
      if (restoreFocus) focusRegistry.restoreFocus(previousFocus);
    }
    if (unmountError && shellUnmountError) {
      throw new AggregateError([unmountError, shellUnmountError], "Surface content and shell unmount failed.");
    }
    if (unmountError) throw unmountError as Error;
    if (shellUnmountError) throw shellUnmountError as Error;
  };

  const surfaceEntry = { close, onEscape, restoreFocus: previousFocus, surface };
  unregisterSurfaceKeyboard = surfaceKeyboardRegistry.register(surfaceEntry);
  root.querySelector("[data-surface-dismiss]")?.addEventListener("click", close as EventListener);
  root
    .querySelectorAll("[data-surface-close]")
    .forEach((button) => button.addEventListener("click", close as EventListener));
  surfaces.set(root, surfaceEntry);

  onMount?.({ root, surface, close });
  focusRegistry.focusInitial(surfaceEntry);
  return { root, surface, close, registerUnmount };
}

function closeSurface(root: HTMLElement, { reason = "dismiss", restoreFocus = true }: SurfaceCloseOptions = {}) {
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
export function mountSheet(options: SurfaceMountOptions) {
  return mountSurface(sheetRoot()!, {
    ...options,
    className: `surface--sheet ${(options.className as string | null | undefined) ?? ""}`.trim(),
  });
}

/** Mount a focus-trapped confirmation or sign-in dialog. */
export function mountDialog(options: SurfaceMountOptions) {
  return mountSurface(modalRoot()!, {
    ...options,
    className: `surface--dialog ${(options.className as string | null | undefined) ?? ""}`.trim(),
  });
}

let mountLoginModalContent: LoginModalContentRenderer | null = null;

export function configureLoginModalContent(renderer: LoginModalContentRenderer) {
  mountLoginModalContent = renderer;
}

// lineProviderId 是 Supabase custom provider 識別符;空值時不渲染 LINE 按鈕,
// 部署端未設好 provider 前保持既有單一 Google 入口。
export function openLoginModal({
  action = "",
  onProvider,
  onClose,
  lineProviderId = AUTH_LINE_PROVIDER_ID,
}: LoginModalOptions = {}) {
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
