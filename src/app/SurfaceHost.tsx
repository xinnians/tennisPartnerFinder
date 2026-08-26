import { memo, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { getE2ETestHooks } from "../e2eTestHooks.ts";
import { configureSurfaceShellRenderer } from "../sheets.js";
import { syncCommit } from "../syncCommit.ts";

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

interface SurfaceShellHandle {
  surface: HTMLElement;
  unmount(): void;
}

interface SurfaceShellProps {
  className: string;
  html: string;
  id: string;
  label: string;
}

interface SurfaceShellEntry {
  id: number;
  props: Readonly<SurfaceShellProps>;
  rootElement: HTMLElement;
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
const shellRegistry = new Map<HTMLElement, SurfaceShellEntry>();

function preserveEmptyTemplateWhitespace(surface: HTMLElement | null): void {
  if (surface && surface.childNodes.length === 0) surface.append("\n      \n    ");
}

const SurfaceShell = memo(function SurfaceShell({ className, html, id, label }: SurfaceShellProps) {
  // React 19 requires a portal target to be a leaf without React children or
  // dangerouslySetInnerHTML. Adapters that target the section use empty-html
  // shells, so their byte-parity whitespace is restored during this React
  // commit; non-empty templates portal into a descendant or remain legacy HTML.
  const content = html ? { dangerouslySetInnerHTML: { __html: `\n      ${html}\n    ` } } : {};
  return (
    <>
      {"\n    "}
      <div className="surface-backdrop" data-surface-dismiss="" />
      {"\n    "}
      <section
        id={id}
        data-testid={id}
        className={`surface ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        ref={html ? undefined : preserveEmptyTemplateWhitespace}
        {...content}
      />
    </>
  );
});

const SurfacePortal = memo(function SurfacePortal({ slot }: { slot: SurfaceSlot }) {
  return createPortal(slot.children, slot.rootElement);
});

/** React owns immutable surface shells and their independently registered content portals. */
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
  syncCommit(update);
}

/** Render one immutable shell portal and synchronously return its committed section. */
export function mountSurfaceShell(rootElement: HTMLElement, options: SurfaceShellProps): SurfaceShellHandle {
  if (shellRegistry.has(rootElement)) throw new Error("Surface shell root is already mounted.");
  const id = nextSurfaceSlotId++;
  const props = Object.freeze({
    className: String(options.className),
    html: String(options.html),
    id: String(options.id),
    label: String(options.label),
  });
  const entry = { id, props, rootElement };
  shellRegistry.set(rootElement, entry);
  slots.set(rootElement, { children: <SurfaceShell {...props} />, id, rootElement });
  try {
    commitSynchronously(commitSurfaceSlots);
  } catch (error) {
    if (shellRegistry.get(rootElement)?.id === id) shellRegistry.delete(rootElement);
    if (slots.get(rootElement)?.id === id) slots.delete(rootElement);
    throw error;
  }

  const surface = rootElement.querySelector<HTMLElement>(".surface");
  if (!surface) {
    shellRegistry.delete(rootElement);
    slots.delete(rootElement);
    commitSynchronously(commitSurfaceSlots);
    throw new Error("Surface shell did not mount.");
  }
  let isLive = true;
  return {
    surface,
    unmount() {
      if (!isLive) return;
      isLive = false;
      if (shellRegistry.get(rootElement)?.id === id) shellRegistry.delete(rootElement);
      if (slots.get(rootElement)?.id === id) {
        slots.delete(rootElement);
        commitSynchronously(commitSurfaceSlots);
      }
    },
  };
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
        const hooks = getE2ETestHooks<SurfaceContentTestHooks>();
        hooks?.surfaceContentLifecycle?.onUnmount?.(rootElement.closest<HTMLElement>(".surface")?.id ?? "");
      }
    },
  };
}

// sheets.js stays directly importable in Node; the eager browser SurfaceHost installs this bridge once.
configureSurfaceShellRenderer(mountSurfaceShell);
