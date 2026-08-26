import { setMySessionActionScope, syncPendingMySessionActions } from "../sessionActions.ts";
import { esc } from "../util.js";

let preloadAuthenticatedViewsForAuth;
let renderMePageInApp;

/** Configure facade-owned App mounts while keeping page adapters independently testable. */
export function configurePageViews(dependencies) {
  ({ preloadAuthenticatedViewsForAuth, renderMePageInApp } = dependencies);
}

/** Mount or update the React account and service skeleton for the Me destination. */
export function renderMePage(root, options = {}) {
  if (!renderMePageInApp) throw new Error("MePage browser mount is unavailable.");
  const authSession = options.authSession ?? null;
  preloadAuthenticatedViewsForAuth(authSession);
  setMySessionActionScope(root, authSession?.user?.id ?? null);
  renderMePageInApp(root, options, () => {
    setMySessionActionScope(
      root,
      options.sessionStore?.getState?.().authSession?.user?.id ?? authSession?.user?.id ?? null
    );
    syncPendingMySessionActions(root);
  });
}

/** Keep the persistent map chip synchronized with controller-owned layer state. */
export function renderPlayerLayerToggle(button, { message = "", on = false, status = "idle" } = {}) {
  if (!button) return;
  button.setAttribute("aria-pressed", String(Boolean(on)));
  button.classList.toggle("is-active", Boolean(on));
  // 批 D3:toggle 改為控制直欄的 icon 鈕,可讀文字住在 visually-hidden span
  //(佈局不吃字寬,測試與 SR 讀到的字不變);找不到 span 時退回整鈕文字。
  const layerText = on ? "隱藏在線" : "顯示在線";
  const layerTextNode = button.querySelector("[data-player-layer-text]");
  if (layerTextNode) layerTextNode.textContent = layerText;
  else button.textContent = layerText;
  const statusRoot = document.getElementById("player-layer-status");
  if (!statusRoot) return;
  statusRoot.hidden = !message;
  statusRoot.textContent = message;
  statusRoot.setAttribute("role", status === "error" ? "alert" : "status");
}

/** Render only user-facing, non-sensitive loading/error/location messages. */
export function renderMapDataStatus(
  root,
  { kind = "idle", message = "", onRetry = () => {}, locationMessage = "" } = {}
) {
  const visible = kind !== "idle" || Boolean(locationMessage);
  root.hidden = !visible;
  if (!visible) {
    root.innerHTML = "";
    return;
  }
  root.className = `map-data-status map-data-status--${esc(kind)}`;
  root.innerHTML = `
    ${message ? `<p>${esc(message)}</p>` : ""}
    ${kind === "error" ? '<button type="button" id="map-retry" class="session-secondary">重新載入</button>' : ""}
    ${locationMessage ? `<p id="location-feedback" class="location-feedback">${esc(locationMessage)}</p>` : ""}`;
  root.querySelector("#map-retry")?.addEventListener("click", onRetry);
}
