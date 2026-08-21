import { memo, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";

export interface SurfaceContentLifecycle {
  isSurfaceRootLive(): boolean;
  unmount(): void;
}

interface SurfaceContentHandle extends SurfaceContentLifecycle {
  commit(update: () => void): void;
  render(children: ReactNode): void;
}

interface SurfaceContentTestHooks {
  surfaceContentLifecycle?: {
    onUnmount?(surfaceId: string): void;
  };
}

export interface SurfaceSlot {
  children: ReactNode;
  id: number;
  rootElement: HTMLElement;
}

export type SurfaceHostSnapshot = ReadonlyMap<HTMLElement, SurfaceSlot>;

interface SurfaceHostProps {
  slots: SurfaceHostSnapshot;
}

let nextSurfaceSlotId = 1;
let renderSurfaceHost: ((slots: SurfaceHostSnapshot) => void) | null = null;
const slots = new Map<HTMLElement, SurfaceSlot>();

const SurfacePortal = memo(function SurfacePortal({ slot }: { slot: SurfaceSlot }) {
  return createPortal(slot.children, slot.rootElement);
});

/** React content only; the imperative shell remains owned by sheets.js. */
export function SurfaceHost({ slots: current }: SurfaceHostProps) {
  return [...current.values()].map((slot) => <SurfacePortal key={slot.id} slot={slot} />);
}

export function installSurfaceHostRenderer(renderer: (slots: SurfaceHostSnapshot) => void): void {
  renderSurfaceHost = renderer;
  if (slots.size) renderer(new Map(slots));
}

function commitSurfaceSlots(): void {
  if (!renderSurfaceHost) throw new Error("SurfaceHost renderer is unavailable.");
  renderSurfaceHost(new Map(slots));
}

/** Imperative sheet adapters read their portal DOM before returning; React-owned event updates bypass this boundary. */
function commitSynchronously(update: () => void): void {
  flushSync(update);
}

/** Register one existing shell content slot with the single App root. */
export function mountSurfaceContent(rootElement: HTMLElement): SurfaceContentHandle {
  const id = nextSurfaceSlotId++;
  let isLive = true;

  return {
    commit(update) {
      if (!isLive) return;
      commitSynchronously(update);
    },
    isSurfaceRootLive: () => isLive,
    render(children) {
      if (!isLive) return;
      slots.set(rootElement, { children, id, rootElement });
      commitSynchronously(commitSurfaceSlots);
    },
    unmount() {
      if (!isLive) return;
      isLive = false;
      try {
        if (slots.get(rootElement)?.id === id) {
          slots.delete(rootElement);
          commitSynchronously(commitSurfaceSlots);
        }
      } finally {
        const hooks = (globalThis as typeof globalThis & { __tennisE2ETestHooks?: SurfaceContentTestHooks })
          .__tennisE2ETestHooks;
        hooks?.surfaceContentLifecycle?.onUnmount?.(rootElement.closest<HTMLElement>(".surface")?.id ?? "");
      }
    },
  };
}
