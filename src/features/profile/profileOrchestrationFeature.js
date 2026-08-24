import {
  getInitialSession,
  isSupabaseConfigured,
  linkLoginIdentity,
  loadCurrentProfile,
  onAuthStateChange,
  saveCurrentProfile,
  signInWithOAuthProvider,
  signOut,
} from "../../dataApi.js";
import { sessionIdFromHash } from "../../sessionRoute.js";

const LINK_RETURN_KEY = "tennis-link-return";

// Link failures are present only in the initial callback URL and may be removed
// by auth-client initialization, so retain the parameters at module startup.
const bootAuthParams = (() => {
  const merged = new URLSearchParams(globalThis.location?.search ?? "");
  for (const [key, value] of new URLSearchParams((globalThis.location?.hash ?? "").replace(/^#/, ""))) {
    merged.set(key, value);
  }
  return merged;
})();

let dependencies;
let storedProfileExists = false;
let activeProfileCompletion = null;
let profileLoadStatus = "idle";
let profileRevision = 0;
let bootDeepLinkReopenPending = Boolean(sessionIdFromHash(globalThis.location?.hash));

export function configureProfileOrchestrationFeature(options) {
  dependencies = options;
}

export function authIdentity(session) {
  const value = session?.user?.id ?? session?.access_token ?? null;
  return value == null ? null : String(value);
}

export function isProfileReady() {
  return profileLoadStatus === "ready";
}

export function currentLinkedProviders() {
  const { authSession } = dependencies.getAppState();
  return (authSession?.user?.identities ?? []).map((identity) => identity.provider);
}

export async function handleLinkProvider(provider) {
  try {
    sessionStorage.setItem(LINK_RETURN_KEY, provider);
    await linkLoginIdentity(provider);
  } catch {
    sessionStorage.removeItem(LINK_RETURN_KEY);
    dependencies.toast("連結啟動失敗，請稍後再試。");
  }
}

function resumeLinkReturn() {
  // eslint-disable-next-line no-useless-assignment -- inherited JS lint debt; the guarded storage access is intentional.
  let provider = null;
  try {
    provider = sessionStorage.getItem(LINK_RETURN_KEY);
    if (provider) sessionStorage.removeItem(LINK_RETURN_KEY);
  } catch {
    return;
  }
  if (!provider) return;
  dependencies.showMePage();
  if (currentLinkedProviders().includes(provider)) {
    dependencies.toast("已連結新的登入方式。");
  } else if (bootAuthParams.get("error") || bootAuthParams.get("error_description")) {
    dependencies.toast("連結未完成：這個帳號可能已綁定其他使用者。");
  }
}

export function openSafeLogin({ action = "", onClose = () => {} } = {}) {
  if (!isSupabaseConfigured) {
    onClose();
    dependencies.toast(dependencies.localDemoUnavailable);
    return null;
  }
  return dependencies.openLoginModal({
    action,
    onClose,
    onProvider: async (provider) => {
      await signInWithOAuthProvider(provider);
    },
  });
}

export async function handleSignOut() {
  try {
    await signOut();
    dependencies.toast("已登出。");
  } catch {
    dependencies.toast("登出失敗，請稍後再試。");
  }
}

function closeActiveProfileCompletion(options = { reason: "account-change", restoreFocus: false }) {
  const mounted = activeProfileCompletion;
  activeProfileCompletion = null;
  mounted?.close?.(options);
}

export function openProfileCompletion({
  courts: selectableCourts,
  courtsReady: formCourtsReady,
  intent,
  mode = "gate",
  onClose = () => {},
  returnSession,
} = {}) {
  const openedIdentity = authIdentity(dependencies.getAppState().authSession);
  let mounted = null;
  // Capture this before save: saving itself creates the profiles row.
  let seedCourtSubscriptionsAfterSave = false;
  mounted = dependencies.openProfileCompletionSheet({
    avatarUrl: dependencies.currentAuthAvatarUrl(),
    courts: selectableCourts ?? dependencies.getAppState().courts,
    courtsReady: formCourtsReady ?? dependencies.getAppState().courtsReady,
    mode,
    onClose: (detail) => {
      if (activeProfileCompletion === mounted) activeProfileCompletion = null;
      onClose(detail);
    },
    onSave: async (draft) => {
      if (!isSupabaseConfigured) throw new Error(dependencies.localDemoUnavailable);
      if (!openedIdentity || openedIdentity !== authIdentity(dependencies.getAppState().authSession)) {
        throw new Error("登入狀態已變更，請重新開啟個人檔案。");
      }
      if (profileLoadStatus !== "ready") {
        throw new Error("個人檔案暫時無法載入，請重新整理後再試。");
      }
      const wasFirstStoredProfile = !storedProfileExists;
      const saved = await saveCurrentProfile(draft);
      if (openedIdentity !== authIdentity(dependencies.getAppState().authSession)) {
        throw new Error("登入狀態已變更，請重新開啟個人檔案。");
      }
      profileRevision += 1;
      profileLoadStatus = "ready";
      storedProfileExists = true;
      seedCourtSubscriptionsAfterSave = wasFirstStoredProfile;
      const profile = saved ?? draft;
      dependencies.setProfile(profile);
      return profile;
    },
    onSaved: async (savedProfile) => {
      if (openedIdentity !== authIdentity(dependencies.getAppState().authSession)) return;
      dependencies.setProfile(savedProfile ?? dependencies.getAppState().profile ?? dependencies.defaultProfile());
      const { authSession } = dependencies.getAppState();
      if (!authSession) return;
      if (seedCourtSubscriptionsAfterSave) {
        seedCourtSubscriptionsAfterSave = false;
        await dependencies.seedAllTaipeiCourtSubscriptions();
      }
      await dependencies.getController().setAuthState(authSession, dependencies.currentProfileEligibility());
      if (dependencies.getActivePage() !== "me") return;
      if (mode === "standalone") {
        requestAnimationFrame(() => {
          document.querySelector('#me-root [data-testid="edit-profile"]')?.focus({ preventScroll: true });
        });
      }
    },
    intent,
    profile: dependencies.getAppState().profile ?? dependencies.defaultProfile(),
    returnSession: intent?.action === "join" ? returnSession : null,
  });
  activeProfileCompletion = mounted;
  return mounted;
}

export async function reloadCurrentProfile() {
  const profileLoadRevision = profileRevision;
  const request = dependencies.captureAuthRequest(() => profileLoadRevision === profileRevision);
  let profile = null;
  let loadFailed = false;
  try {
    profile = await loadCurrentProfile();
  } catch {
    loadFailed = true;
  }
  if (request.isStale()) return false;
  if (loadFailed) {
    // Refresh failure cannot replace a previously known profile with an editable blank form.
    if (profileLoadStatus !== "ready") {
      profileLoadStatus = "error";
      const { authSession } = dependencies.getAppState();
      await dependencies
        .getController()
        .setAuthState(authSession, { directory: false, nickname: false, ntrp: false, status: "error" });
    }
    throw new Error("個人檔案暫時無法載入，請重新整理後再試。");
  }
  storedProfileExists = profile !== null;
  dependencies.setProfile(profile ?? dependencies.defaultProfile());
  profileLoadStatus = "ready";
  const { authSession } = dependencies.getAppState();
  await dependencies.getController().setAuthState(authSession, dependencies.currentProfileEligibility());
  dependencies.reconcilePresenceTracking();
  if (bootDeepLinkReopenPending) {
    bootDeepLinkReopenPending = false;
    void dependencies.openSessionHashRoute();
  }
  return true;
}

export function handleAuthIdentityChange({ session }) {
  closeActiveProfileCompletion();
  dependencies.resetPresenceTracking();
  profileRevision += 1;
  dependencies.setProfile(dependencies.defaultProfile());
  storedProfileExists = false;
  dependencies.resetNotificationSettings();
  profileLoadStatus = session ? "loading" : "idle";
  return session ? { directory: false, nickname: false, ntrp: false, status: "loading" } : null;
}

function applyAuthCandidate(session) {
  dependencies.invalidateAuthRequests();
  // Account classification belongs to the controller; same-account token refreshes stay light.
  dependencies.setAuthSession(session);
  if (!session) {
    dependencies.resetPresenceTracking();
    dependencies.setProfile(dependencies.defaultProfile());
    storedProfileExists = false;
    dependencies.resetNotificationSettings();
    profileLoadStatus = "idle";
    return;
  }
  void reloadCurrentProfile().catch(() => {});
  if (bootAuthParams.get("error") || bootAuthParams.get("error_description")) resumeLinkReturn();
}

export async function restoreAuth() {
  const controller = dependencies.getController();
  const bootstrapIntentVersion = controller.capturePendingIntentVersion();
  onAuthStateChange((session, event) => {
    if (!session && event === "SIGNED_OUT") controller.clearPendingIntent();
    applyAuthCandidate(session);
    if (session && event === "SIGNED_IN") resumeLinkReturn();
  });
  const initialRequest = dependencies.captureAuthGateRequest();
  let initialSession = null;
  let initialSessionResolved = false;
  try {
    initialSession = await getInitialSession();
    initialSessionResolved = true;
  } catch {
    // A later auth event can still complete restoration after a transport failure.
  }
  if (initialSessionResolved && !initialSession && !dependencies.getAppState().authSession) {
    controller.clearPendingIntentIfUnchanged(bootstrapIntentVersion);
  }
  if (!initialSessionResolved || initialRequest.isStale()) return;
  applyAuthCandidate(initialSession);
}
