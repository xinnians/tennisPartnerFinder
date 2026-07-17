const layers = [];
const originalStates = new Map();
let managedNodes = new Set();
let nextLayerOrder = 0;

function remember(node) {
  if (!node || originalStates.has(node)) return;
  originalStates.set(node, { hadInertAttribute: node.hasAttribute("inert"), inert: Boolean(node.inert) });
}

function setInert(node, inert) {
  if (!node) return;
  remember(node);
  node.inert = inert;
  if (inert) node.setAttribute("inert", "");
  else node.removeAttribute("inert");
}

function restore(node) {
  const original = originalStates.get(node);
  if (!original) return;
  node.inert = original.inert;
  if (original.hadInertAttribute) node.setAttribute("inert", "");
  else node.removeAttribute("inert");
  originalStates.delete(node);
}

function topLayer() {
  return layers.reduce((current, candidate) => {
    if (!current || candidate.priority > current.priority) return candidate;
    if (candidate.priority < current.priority) return current;
    return candidate.order > current.order ? candidate : current;
  }, null);
}

function applyTopLayer() {
  const top = topLayer();
  const desired = new Set((top?.targets?.() ?? []).filter(Boolean));
  for (const node of managedNodes) {
    if (!desired.has(node)) restore(node);
  }
  for (const node of desired) setInert(node, true);
  managedNodes = desired;
}

/** Stack-safe inert isolation for one modal layer. */
export function pushModalIsolation(targets, { priority = 0 } = {}) {
  const layer = { order: ++nextLayerOrder, priority, targets };
  layers.push(layer);
  applyTopLayer();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const index = layers.indexOf(layer);
    if (index >= 0) layers.splice(index, 1);
    applyTopLayer();
  };
}

/** Isolate every app sibling except the root that contains the active surface. */
export function pushSurfaceIsolation(root) {
  return pushModalIsolation(
    () => {
      const app = document.getElementById("app");
      if (!app) return [];
      return [...app.children].filter((node) => node !== root && node.id !== "toast-root");
    },
    { priority: 2 }
  );
}

/** Isolate map discovery background without making the active drawer panel inert. */
export function pushDrawerIsolation(toggle) {
  return pushModalIsolation(
    () => [
      document.querySelector(".app-header"),
      document.getElementById("map"),
      document.querySelector(".map-toolbar"),
      document.getElementById("level-popover"),
      document.getElementById("map-data-status"),
      document.getElementById("sheet-root"),
      document.getElementById("modal-root"),
      toggle,
    ],
    { priority: 1 }
  );
}
