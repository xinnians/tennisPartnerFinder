import { BANDS, DEFAULT_FILTER_STATE } from "./filters.ts"; // eslint-disable-line no-unused-vars -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
import { esc } from "./util.js";
import {
  runNotificationSettingAction, // eslint-disable-line no-unused-vars -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
  runPresenceSettingAction, // eslint-disable-line no-unused-vars -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
} from "./sessionActions.ts";
import { taipeiDayWord } from "./sessionPresentation.ts"; // eslint-disable-line no-unused-vars -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
import * as sessionFormViews from "./views/sessionFormViews.js";
import * as discoverySurfaceViews from "./views/discoverySurfaceViews.js";
import * as profileSurfaceView from "./views/profileSurfaceView.js";
import * as sessionSurfaceViews from "./views/sessionSurfaceViews.js";
export { messagesFromGroups, nearbySessionsSummaryText } from "./sessionPresentation.ts";
export {
  configureMapFilterToolbar,
  configureSessionViewModules,
  NTRP_SCALE_EXPLANATION,
  preloadAuthenticatedViewsForAuth,
  preloadNonHomeViews,
  renderBottomNavigation,
  renderMapFilterToolbar,
  renderToast,
} from "./views/sessionViewWiring.js";

export function validateCreateSessionInput(input = {}, { now = new Date() } = {}) {
  return sessionFormViews.validateCreateSessionInput(input, { now });
}

export function validateUpdateSessionInput(input = {}, { now = new Date() } = {}) {
  return sessionFormViews.validateUpdateSessionInput(input, { now });
}

export function openSessionChatSheet(...args) {
  return sessionSurfaceViews.openSessionChatSheet(...args);
}

export function openSessionSheet(...args) {
  return sessionSurfaceViews.openSessionSheet(...args);
}

export function openSessionUnavailableSheet() {
  return sessionSurfaceViews.openSessionUnavailableSheet();
}

export function openWithdrawSessionConfirmation({ onClose = () => {}, onConfirm = async () => {} } = {}) {
  return sessionSurfaceViews.openWithdrawSessionConfirmation({ onClose, onConfirm });
}

export function openReportDialog({ targetLabel = "這個項目", onClose = () => {}, onSubmit = () => {} } = {}) {
  return sessionSurfaceViews.openReportDialog({ targetLabel, onClose, onSubmit });
}

export function openProfileCompletionSheet({ ...options } = {}) {
  return profileSurfaceView.openProfileCompletionSheet(options);
}

export const CREATE_SLOT_OPTIONS = [...sessionFormViews.CREATE_SLOT_OPTIONS];

export const CREATE_NTRP_BANDS = [...sessionFormViews.CREATE_NTRP_BANDS];

export function deriveCreateVenueType(mode, booked) {
  return sessionFormViews.deriveCreateVenueType(mode, booked);
}

export function createNtrpRangeForBand(bandKey) {
  return sessionFormViews.createNtrpRangeForBand(bandKey);
}

export function createDateChipDate(key, now = new Date()) {
  return sessionFormViews.createDateChipDate(key, now);
}

export function resolveCreateDateValue(form, now = new Date()) {
  return sessionFormViews.resolveCreateDateValue(form, now);
}

export function bumpCreateTimeMinutes(time, deltaMinutes) {
  return sessionFormViews.bumpCreateTimeMinutes(time, deltaMinutes);
}

export function createFixedStartAtLocal(form, now = new Date()) {
  return sessionFormViews.createFixedStartAtLocal(form, now);
}

export function createCandidateWindowLocal(form, now = new Date()) {
  return sessionFormViews.createCandidateWindowLocal(form, now);
}

export function createSessionFormCanPublish(form) {
  return sessionFormViews.createSessionFormCanPublish(form);
}

export function createSessionFormRawInput(form, now = new Date()) {
  return sessionFormViews.createSessionFormRawInput(form, now);
}

export function openCreateSessionSheet({ ...options } = {}) {
  return sessionFormViews.openCreateSessionSheet(options);
}

export function openDecideSessionSheet(...args) {
  return sessionFormViews.openDecideSessionSheet(...args);
}

export function openEditSessionSheet(...args) {
  return sessionFormViews.openEditSessionSheet(...args);
}

export function openCourtSessionDrawer(court, sessions, { courts = [], onOpenSession = () => {} } = {}) {
  return discoverySurfaceViews.openCourtSessionDrawer(court, sessions, { courts, onOpenSession });
}

export function openCourtPlayersDrawer(court, players, { onClose = () => {}, onOpenPlayer = () => {} } = {}) {
  return discoverySurfaceViews.openCourtPlayersDrawer(court, players, { onClose, onOpenPlayer });
}

export function openPlayerDirectoryList({ onClose = () => {}, onOpenPlayer = () => {}, onRetry = () => {} } = {}) {
  return discoverySurfaceViews.openPlayerDirectoryList({ onClose, onOpenPlayer, onRetry });
}

export function openFilterSheet({ ...options } = {}) {
  return discoverySurfaceViews.openFilterSheet(options);
}

export function openPlayerCardSheet(...args) {
  return discoverySurfaceViews.openPlayerCardSheet(...args);
}

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

// One-way boundary: this legacy adapter may mount React and consume presentation
// helpers, while React modules import only sessionPresentation.ts and never reach
// back into this file.

export { taipeiLocalDateTimeToIso } from "./taipeiTime.ts";
