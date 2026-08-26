import { createContext, createElement, useContext, type ReactNode } from "react";

const NearbyDrawerRootContext = createContext<HTMLElement | null>(null);

const nearbyDrawerFocusIntents = new WeakMap<HTMLElement, string>();

const nearbyDrawerLoadingFocusFallbacks = new WeakSet<HTMLElement>();

const nearbyDrawerBeforeStoreChangeCallbacks = new WeakMap<HTMLElement, () => void>();

const DRAWER_TOGGLE_FOCUS = "__drawer-toggle__";

const DRAWER_CLOSE_FOCUS = "__drawer-close__";

const DRAWER_ACTION_FOCUS_PREFIX = "__drawer-action__:";

const DRAWER_ACTION_IDS = new Set([
  "discovery-reset",
  "drawer-map-retry",
  "discovery-expand",
  "discovery-subscribe",
  "discovery-first",
]);

export function NearbyDrawerFocusProvider({
  children,
  rootElement,
}: {
  children: ReactNode;
  rootElement: HTMLElement;
}) {
  return createElement(NearbyDrawerRootContext.Provider, { value: rootElement }, children);
}

export function useNearbyDrawerRoot(): HTMLElement {
  const rootElement = useContext(NearbyDrawerRootContext);
  if (!rootElement) throw new Error("NearbyDrawer root is unavailable.");
  return rootElement;
}

// 「目前開著的抽屜面板」查詢:collapsed 時 section 帶 hidden,回傳 null;
// v2 兩態下 open 就是唯一的開啟狀態,判準是 hidden 屬性。
function activeDrawerPanel(root: HTMLElement): HTMLElement | null {
  const panel = root.querySelector<HTMLElement>("#nearby-sessions-list");
  return panel && !panel.hidden ? panel : null;
}

function rememberFocusedSessionCard(root: HTMLElement): void {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return;
  if (active.matches("#nearby-sessions-toggle")) {
    setDrawerFocusIntent(root, DRAWER_TOGGLE_FOCUS);
    return;
  }
  if (active.matches("[data-nearby-close], [data-testid='drawer-collapse']")) {
    // The loading fallback is only a temporary reachable target. Preserve the
    // original card/action intent through the next authoritative rerender.
    // ✕ 與把手都收斂回同一個 DRAWER_CLOSE_FOCUS 意圖。
    if (!nearbyDrawerLoadingFocusFallbacks.has(root)) setDrawerFocusIntent(root, DRAWER_CLOSE_FOCUS);
    return;
  }
  if (DRAWER_ACTION_IDS.has(active.id)) {
    setDrawerFocusIntent(root, `${DRAWER_ACTION_FOCUS_PREFIX}${active.id}`);
    return;
  }
  const card = active.closest<HTMLElement>("[data-session-id]");
  if (card?.dataset.sessionId) setDrawerFocusIntent(root, card.dataset.sessionId);
}

function beforeNearbyDrawerStoreChange(root: HTMLElement): () => void {
  let callback = nearbyDrawerBeforeStoreChangeCallbacks.get(root);
  if (!callback) {
    callback = () => rememberFocusedSessionCard(root);
    nearbyDrawerBeforeStoreChangeCallbacks.set(root, callback);
  }
  return callback;
}

export function useBeforeNearbyDrawerStoreChange(): () => void {
  return beforeNearbyDrawerStoreChange(useNearbyDrawerRoot());
}

function setDrawerFocusIntent(root: HTMLElement, intent: string): void {
  nearbyDrawerLoadingFocusFallbacks.delete(root);
  nearbyDrawerFocusIntents.set(root, intent);
}

function clearDrawerFocusIntent(root: HTMLElement): void {
  nearbyDrawerLoadingFocusFallbacks.delete(root);
  nearbyDrawerFocusIntents.delete(root);
}

function drawerRecoveryTarget(root: HTMLElement): HTMLElement | null {
  const panel = activeDrawerPanel(root);
  if (!panel) return null;
  return (
    panel.querySelector<HTMLElement>("#drawer-map-retry") ??
    panel.querySelector<HTMLElement>("[data-session-id]") ??
    panel.querySelector<HTMLElement>("#discovery-expand") ??
    panel.querySelector<HTMLElement>("#discovery-subscribe") ??
    panel.querySelector<HTMLElement>("#discovery-reset") ??
    panel.querySelector<HTMLElement>("#discovery-first")
  );
}

function focusDrawerLoadingFallback(root: HTMLElement): void {
  const panel = activeDrawerPanel(root);
  // full 有「×」關閉鈕;half 沒有,退而求其次用「收合」鈕;兩者都沒有(理論上不會發生,
  // 面板都開著卻連 toggle 都找不到)才退到抽屜自己的摘要條。
  const target =
    panel?.querySelector<HTMLElement>("[data-nearby-close]") ??
    panel?.querySelector<HTMLElement>("[data-testid='drawer-collapse']") ??
    root.querySelector<HTMLElement>("#nearby-sessions-toggle");
  if (!target) return;
  nearbyDrawerLoadingFocusFallbacks.add(root);
  target.focus({ preventScroll: true });
}

export function restoreNearbyDrawerFocus(root: HTMLElement): void {
  if (!nearbyDrawerFocusIntents.get(root)) return;
  requestAnimationFrame(() => {
    const focusIntent = nearbyDrawerFocusIntents.get(root);
    if (!focusIntent) return;
    const active = document.activeElement;
    const hasNewSurface = Boolean(document.querySelector("#sheet-root .surface, #modal-root .surface"));
    const activeIsHiddenDrawerControl =
      active instanceof HTMLElement && root.contains(active) && Boolean(active.closest("[hidden]"));
    const activeIsLoadingFallback =
      nearbyDrawerLoadingFocusFallbacks.has(root) &&
      active instanceof HTMLElement &&
      active.matches("[data-nearby-close], [data-testid='drawer-collapse']");
    if (
      hasNewSurface ||
      (active?.isConnected &&
        active !== document.body &&
        active !== document.documentElement &&
        !activeIsHiddenDrawerControl &&
        !activeIsLoadingFallback)
    )
      return;
    const toggle = root.querySelector<HTMLElement>("#nearby-sessions-toggle");
    if (focusIntent === DRAWER_TOGGLE_FOCUS) {
      if (toggle?.getAttribute("aria-expanded") === "false") {
        clearDrawerFocusIntent(root);
        toggle.focus({ preventScroll: true });
      } else if (toggle?.getAttribute("aria-expanded") === "true") {
        // v2:peek 在開啟後隱藏,開啟者的焦點交棒給抽屜的「✕」。非 modal 不設
        // trap,但鍵盤動線必須跟著進到新揭示的面板,不能落在 body。
        clearDrawerFocusIntent(root);
        activeDrawerPanel(root)?.querySelector<HTMLElement>("[data-nearby-close]")?.focus({ preventScroll: true });
      }
      return;
    }
    const panel = activeDrawerPanel(root);
    if (!panel) {
      clearDrawerFocusIntent(root);
      return;
    }
    if (focusIntent === DRAWER_CLOSE_FOCUS) {
      clearDrawerFocusIntent(root);
      (
        panel.querySelector<HTMLElement>("[data-nearby-close]") ??
        panel.querySelector<HTMLElement>("[data-testid='drawer-collapse']")
      )?.focus({ preventScroll: true });
      return;
    }
    const actionId = focusIntent.startsWith(DRAWER_ACTION_FOCUS_PREFIX)
      ? focusIntent.slice(DRAWER_ACTION_FOCUS_PREFIX.length)
      : null;
    if (actionId) {
      const sameAction = DRAWER_ACTION_IDS.has(actionId) ? panel.querySelector<HTMLElement>(`#${actionId}`) : null;
      const nextAction = sameAction ?? drawerRecoveryTarget(root);
      if (!nextAction) {
        // Loading deliberately contains no stale card or recovery CTA. Keep
        // the intent for the authoritative result, but never leave keyboard
        // focus on document.body during that wait.
        focusDrawerLoadingFallback(root);
        return;
      }
      clearDrawerFocusIntent(root);
      nextAction.focus({ preventScroll: true });
      return;
    }
    const card = [...root.querySelectorAll<HTMLElement>("[data-session-id]")].find(
      (node) => String(node.dataset.sessionId) === String(focusIntent)
    );
    if (!card) {
      // During the loading render there is deliberately no stale card and no
      // retry action yet. Keep the intent through that transient state, then
      // hand focus to the first meaningful action in the final drawer state.
      const fallback = drawerRecoveryTarget(root);
      if (!fallback) {
        focusDrawerLoadingFallback(root);
        return;
      }
      clearDrawerFocusIntent(root);
      fallback.focus({ preventScroll: true });
      return;
    }
    clearDrawerFocusIntent(root);
    card.focus({ preventScroll: true });
  });
}
