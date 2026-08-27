import { isSupabaseConfigured, setOpenToGreeting, setPresenceSharing, updateMyPresence } from "../../dataApi.ts";
import { createPresenceTracker } from "../../playerPresence.js";

import type { ControllerAppState, ControllerProfileEligibility } from "../../controllerContracts.ts";
import type { Profile } from "../../domainTypes.ts";

interface AuthRequestSnapshot {
  identity: string | null;
  isStale(): boolean;
}

interface PresenceFeatureDependencies {
  captureAuthRequest(): AuthRequestSnapshot;
  currentProfileEligibility(): ControllerProfileEligibility;
  defaultProfile(): Partial<Profile>;
  getAppState(): ControllerAppState;
  getLocationStatus(): string;
  openProfileCompletion(options: { intent: { action: "presence" } }): unknown;
  publishMePageView(): void;
  publishMeSettingsPageView(): void;
  setLocationStatus(status: string): void;
  setProfile(profile: Partial<Profile> | null): void;
  toast(message: string): void;
}

interface PresenceSettings {
  locationStatus: string;
  openToGreeting: boolean;
  sharePresence: boolean;
}

interface PresenceTracker {
  start(): boolean;
  stop(): void;
}

interface PresenceTrackerOptions {
  onError(status: string): void;
  onPosition(point: { lat: number; lng: number }): Promise<void>;
}

let dependencies: PresenceFeatureDependencies;
let presenceTracker: PresenceTracker | null = null;

/** Keep location tracking orchestration outside the application entrypoint. */
export function configurePresenceFeature(options: PresenceFeatureDependencies): void {
  dependencies = options;
}

export function presenceSettingsForProfile(): PresenceSettings {
  const profile = dependencies.getAppState().profile;
  return {
    locationStatus: dependencies.getLocationStatus(),
    openToGreeting: profile?.openToGreeting === true,
    sharePresence: profile?.sharePresence === true,
  };
}

export function stopPresenceTracking(): void {
  presenceTracker?.stop();
  presenceTracker = null;
}

export function resetPresenceTracking(): void {
  stopPresenceTracking();
  dependencies.setLocationStatus("idle");
}

function updatePresenceLocationStatus(status: string): void {
  dependencies.setLocationStatus(status);
  dependencies.publishMePageView();
}

export function reconcilePresenceTracking(): boolean {
  const { authSession, profile } = dependencies.getAppState();
  const eligible = dependencies.currentProfileEligibility();
  const canTrack = Boolean(isSupabaseConfigured && authSession && eligible.ntrp && profile?.sharePresence === true);
  if (!canTrack) {
    stopPresenceTracking();
    return false;
  }
  if (!presenceTracker) {
    presenceTracker = (createPresenceTracker as (options: PresenceTrackerOptions) => PresenceTracker)({
      onError: updatePresenceLocationStatus,
      onPosition: async ({ lat, lng }) => {
        const request = dependencies.captureAuthRequest();
        await updateMyPresence({ lat, lng });
        if (request.isStale()) return;
        updatePresenceLocationStatus("active");
      },
    });
  }
  const started = presenceTracker.start();
  if (started && dependencies.getLocationStatus() === "idle") {
    dependencies.setLocationStatus("requesting");
    dependencies.publishMePageView();
  }
  return started;
}

export async function updatePresenceSharing(shared: boolean): Promise<boolean | void> {
  const request = dependencies.captureAuthRequest();
  const { authSession, profile } = dependencies.getAppState();
  if (!request.identity || !authSession || !isSupabaseConfigured) {
    throw new Error("請先登入後再調整在線設定。");
  }
  if (!dependencies.currentProfileEligibility().ntrp) {
    dependencies.openProfileCompletion({ intent: { action: "presence" } });
    return false;
  }
  await setPresenceSharing(shared === true);
  if (request.isStale()) throw new Error("登入狀態已變更，請重新整理後再試。");
  dependencies.setProfile({ ...(profile ?? dependencies.defaultProfile()), sharePresence: shared === true });
  if (shared) reconcilePresenceTracking();
  else {
    stopPresenceTracking();
    dependencies.setLocationStatus("idle");
    dependencies.publishMePageView();
  }
  dependencies.publishMeSettingsPageView();
  dependencies.toast(shared ? "已開啟在線分享。" : "已隱藏在線狀態。");
}

export async function updateOpenToGreetingSetting(open: boolean): Promise<boolean | void> {
  const request = dependencies.captureAuthRequest();
  const { authSession, profile } = dependencies.getAppState();
  if (!request.identity || !authSession || !isSupabaseConfigured) {
    throw new Error("請先登入後再調整在線設定。");
  }
  if (!dependencies.currentProfileEligibility().ntrp) {
    dependencies.openProfileCompletion({ intent: { action: "presence" } });
    return false;
  }
  await setOpenToGreeting(open === true);
  if (request.isStale()) throw new Error("登入狀態已變更，請重新整理後再試。");
  dependencies.setProfile({ ...(profile ?? dependencies.defaultProfile()), openToGreeting: open === true });
  dependencies.publishMeSettingsPageView();
  dependencies.toast(open ? "已開啟接受現場問候。" : "已關閉接受現場問候。");
}
