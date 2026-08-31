import {
  getInitialSession,
  isSupabaseConfigured,
  linkLoginIdentity,
  loadCurrentProfile,
  onAuthStateChange,
  saveCurrentProfile,
  signInWithOAuthProvider,
  signOut,
} from "../../dataApi.ts";

import type {
  ControllerApi,
  ControllerAppState,
  ControllerAuthSession,
  ControllerPendingIntent,
  ControllerProfileEligibility,
  ControllerSurfaceHandle,
} from "../../controllerContracts.ts";
import type { Profile, SessionSummary, SurfaceCloseOptions, SurfaceLoadStatus } from "../../domainTypes.ts";
import { createAuthRefreshCoordinator } from "../profile-auth/authRefreshCoordinator.ts";
import { sessionIdentity, validAuthSession } from "../profile-auth/profileAuthFeature.ts";

type AuthProvider = Parameters<typeof signInWithOAuthProvider>[0];
type ProfileDraft = NonNullable<Parameters<typeof saveCurrentProfile>[0]>;
type ProfileIntent = ControllerPendingIntent | { action: "presence" };

interface AuthRequestSnapshot {
  identity: string | null;
  isStale(): boolean;
}

interface ProfileCloseDetail extends SurfaceCloseOptions {
  saved?: boolean;
}

interface LoginModalOptions {
  action: string;
  onClose(): void;
  onProvider(provider: AuthProvider): Promise<void>;
}

interface ProfileCompletionSheetOptions {
  avatarUrl: string;
  courts: ControllerAppState["courts"];
  courtsReady: boolean;
  intent: ProfileIntent | null | undefined;
  mode: "gate" | "standalone";
  onClose(detail: ProfileCloseDetail): void;
  onSave(draft: ProfileDraft): Promise<Partial<Profile>>;
  onSaved(savedProfile: Partial<Profile> | null | undefined): Promise<void>;
  profile: Partial<Profile>;
  returnSession: SessionSummary | null | undefined;
}

interface ProfileCompletionOptions {
  courts?: ControllerAppState["courts"];
  courtsReady?: boolean;
  intent?: ProfileIntent | null;
  mode?: "gate" | "standalone";
  onClose?: (detail: ProfileCloseDetail) => void;
  returnSession?: SessionSummary | null;
}

interface SafeLoginOptions {
  action?: string;
  onClose?: () => void;
}

interface ProfileOrchestrationDependencies {
  captureAuthRequest(isCurrent?: () => boolean): AuthRequestSnapshot;
  currentAuthAvatarUrl(): string;
  currentProfileEligibility(): ControllerProfileEligibility;
  defaultProfile(): Partial<Profile>;
  getActivePage(): string;
  getAppState(): ControllerAppState;
  getController(): ControllerApi;
  invalidateAuthRequests(): void;
  localDemoUnavailable: string;
  openLoginModal(options: LoginModalOptions): unknown;
  openProfileCompletionSheet(options: ProfileCompletionSheetOptions): ControllerSurfaceHandle | null | undefined;
  reconcilePageRouteOwner?(options?: { forcePublic?: boolean }): void;
  reconcilePresenceTracking(): boolean;
  resetNotificationSettings(): void;
  resetPresenceTracking(): void;
  seedAllTaipeiCourtSubscriptions(): Promise<unknown>;
  setAuthSession(session: ControllerAuthSession | null): void;
  setProfile(profile: Partial<Profile> | null): void;
  showMePage(): void;
  toast(message: string): void;
}

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

let dependencies: ProfileOrchestrationDependencies;
let storedProfileExists = false;
let activeProfileCompletion: ControllerSurfaceHandle | null | undefined = null;
let profileLoadStatus: SurfaceLoadStatus = "idle";
let profileRevision = 0;

export function configureProfileOrchestrationFeature(options: ProfileOrchestrationDependencies): void {
  dependencies = options;
}

export function authIdentity(session: unknown): string | null {
  return sessionIdentity(session as ControllerAuthSession | null | undefined);
}

export function isProfileReady(): boolean {
  return profileLoadStatus === "ready";
}

export function currentLinkedProviders(): Array<string | null | undefined> {
  const { authSession } = dependencies.getAppState();
  return (authSession?.user?.identities ?? []).map((identity) => identity.provider);
}

export async function handleLinkProvider(provider: AuthProvider): Promise<void> {
  try {
    sessionStorage.setItem(LINK_RETURN_KEY, provider);
    await linkLoginIdentity(provider);
  } catch {
    sessionStorage.removeItem(LINK_RETURN_KEY);
    dependencies.toast("連結啟動失敗，請稍後再試。");
  }
}

function resumeLinkReturn(): void {
  let provider: string | null = null;
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

export function openSafeLogin({ action = "", onClose = () => {} }: SafeLoginOptions = {}): unknown {
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

export async function handleSignOut(): Promise<void> {
  try {
    await signOut();
    dependencies.toast("已登出。");
  } catch {
    dependencies.toast("登出失敗，請稍後再試。");
  }
}

function closeActiveProfileCompletion(
  options: SurfaceCloseOptions = { reason: "account-change", restoreFocus: false }
): void {
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
}: ProfileCompletionOptions = {}): ControllerSurfaceHandle | null | undefined {
  const openedIdentity = authIdentity(dependencies.getAppState().authSession);
  let mounted: ControllerSurfaceHandle | null | undefined = null;
  // Capture this before save: saving itself creates the profiles row.
  let seedCourtSubscriptionsAfterSave = false;
  mounted = dependencies.openProfileCompletionSheet({
    avatarUrl: dependencies.currentAuthAvatarUrl(),
    courts: selectableCourts ?? dependencies.getAppState().courts,
    courtsReady: formCourtsReady ?? dependencies.getAppState().courtsReady,
    mode,
    onClose: (detail: ProfileCloseDetail) => {
      if (activeProfileCompletion === mounted) activeProfileCompletion = null;
      onClose(detail);
    },
    onSave: async (draft: ProfileDraft) => {
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
    onSaved: async (savedProfile: Partial<Profile> | null | undefined) => {
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
          document.querySelector<HTMLElement>('#me-root [data-testid="edit-profile"]')?.focus({
            preventScroll: true,
          });
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

export async function reloadCurrentProfile(): Promise<boolean> {
  const profileLoadRevision = profileRevision;
  const request = dependencies.captureAuthRequest(() => profileLoadRevision === profileRevision);
  let profile: Partial<Profile> | null = null;
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
  return true;
}

export function handleAuthIdentityChange({
  session,
}: {
  session: ControllerAuthSession | null;
}): ControllerProfileEligibility | null {
  closeActiveProfileCompletion();
  dependencies.resetPresenceTracking();
  profileRevision += 1;
  dependencies.setProfile(dependencies.defaultProfile());
  storedProfileExists = false;
  dependencies.resetNotificationSettings();
  profileLoadStatus = session ? "loading" : "idle";
  return session ? { directory: false, nickname: false, ntrp: false, status: "loading" } : null;
}

export async function applyAuthCandidate(
  candidate: ControllerAuthSession | null,
  { forcePublic = false, reconcilePageOwner = false }: { forcePublic?: boolean; reconcilePageOwner?: boolean } = {}
): Promise<void> {
  const session = validAuthSession(candidate);
  const invalidSession = candidate !== null && session === null;
  dependencies.invalidateAuthRequests();
  // Never pass an ownerless candidate downstream; the controller repeats this validation as defense in depth.
  dependencies.setAuthSession(session);
  if (reconcilePageOwner || invalidSession || forcePublic) {
    dependencies.reconcilePageRouteOwner?.({ forcePublic: invalidSession || forcePublic });
  }
  if (!session) {
    if (invalidSession) {
      closeActiveProfileCompletion();
      profileRevision += 1;
    }
    dependencies.resetPresenceTracking();
    dependencies.setProfile(dependencies.defaultProfile());
    storedProfileExists = false;
    dependencies.resetNotificationSettings();
    profileLoadStatus = "idle";
    if (invalidSession) dependencies.toast("登入狀態無效，請重新登入。");
    return;
  }
  await reloadCurrentProfile().catch(() => {});
}

interface AuthRestorePort {
  schedule?: (task: () => void) => void;
  subscribe: (callback: (session: unknown, event: string) => void) => () => void;
  subscribeOnline?: (callback: () => void) => () => void;
  verifyCurrentSession: () => ReturnType<typeof getInitialSession>;
}

export async function restoreAuthWithPort({
  schedule,
  subscribe,
  subscribeOnline,
  verifyCurrentSession,
}: AuthRestorePort): Promise<void> {
  const controller = dependencies.getController();
  const bootstrapIntentVersion = controller.capturePendingIntentVersion();
  const coordinator = createAuthRefreshCoordinator({
    applyCandidate: applyAuthCandidate,
    onConfirmedAnonymous: () => controller.clearPendingIntentIfUnchanged(bootstrapIntentVersion),
    onSignedOut: () => controller.clearPendingIntent(),
    onVerified: resumeLinkReturn,
    ...(schedule ? { schedule } : {}),
    verifyCurrentSession,
  });
  subscribe((session, event) =>
    coordinator.recordAuthEvent(session as ControllerAuthSession | null | undefined, event)
  );
  subscribeOnline?.(() => {
    void coordinator.retryIfNeeded().catch(() => {});
  });
  await coordinator.restore();
}

export async function restoreAuth(): Promise<void> {
  await restoreAuthWithPort({
    subscribe: onAuthStateChange,
    subscribeOnline: (callback) => {
      globalThis.addEventListener("online", callback);
      return () => globalThis.removeEventListener("online", callback);
    },
    verifyCurrentSession: getInitialSession,
  });
}
