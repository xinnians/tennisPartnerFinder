import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";

export interface SurfaceContentLifecycle {
  isSurfaceRootLive(): boolean;
  unmount(): void;
}

interface SurfaceRoot extends SurfaceContentLifecycle {
  render(children: ReactNode): void;
}

interface SurfaceRootTestHooks {
  surfaceRootLifecycle?: {
    onUnmount?(surfaceId: string): void;
  };
}

/** Keep the React root's live/dead state beside the root instead of guessing from DOM connectivity. */
export function createSurfaceRoot(rootElement: HTMLElement): SurfaceRoot {
  const reactRoot = createRoot(rootElement);
  let isLive = true;

  return {
    isSurfaceRootLive: () => isLive,
    render(children) {
      if (!isLive) return;
      reactRoot.render(children);
    },
    unmount() {
      if (!isLive) return;
      isLive = false;
      try {
        reactRoot.unmount();
      } finally {
        const hooks = (globalThis as typeof globalThis & { __tennisE2ETestHooks?: SurfaceRootTestHooks })
          .__tennisE2ETestHooks;
        hooks?.surfaceRootLifecycle?.onUnmount?.(rootElement.closest<HTMLElement>(".surface")?.id ?? "");
      }
    },
  };
}
