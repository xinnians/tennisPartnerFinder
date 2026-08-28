export interface SurfaceShellProps {
  className: string;
  html: string;
  id: string;
  label: string;
}

export interface SurfaceShellHandle {
  surface: HTMLElement;
  unmount(): void;
}

export type SurfaceShellRenderer = (root: HTMLElement, options: SurfaceShellProps) => SurfaceShellHandle;

export interface SurfaceRestoreTarget {
  drawerId: string | null;
  node: HTMLElement;
  sessionId: string | null;
}

export interface SurfaceKeyboardEntry {
  close(options?: { reason?: string; restoreFocus?: boolean }): void;
  onEscape?: () => unknown;
  restoreFocus: SurfaceRestoreTarget | null;
  surface: HTMLElement;
}

export interface SurfaceKeyboardRegistry {
  register(entry: SurfaceKeyboardEntry): () => void;
}

export interface SurfaceFocusRegistry {
  captureRestoreTarget(node: Element | null): SurfaceRestoreTarget | null;
  focusInitial(entry: SurfaceKeyboardEntry): void;
  restoreFocus(target: SurfaceRestoreTarget | null): void;
}

export interface LoginModalContentOptions {
  action: string;
  lineProviderId: string;
  onClose(): void;
  onProvider?: (provider: string) => unknown;
}

export interface LoginModalContentHandle {
  unmount: () => void;
}

export type LoginModalContentRenderer = (
  surface: HTMLElement,
  options: LoginModalContentOptions
) => LoginModalContentHandle;
