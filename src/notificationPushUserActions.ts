import type { AuthVerificationAuthority } from "./features/profile-auth/authRefreshCoordinator.ts";
import type { createNotificationPushStorage } from "./notificationPushStorage.ts";
import type { createNotificationPushSubscriptionCoordinator } from "./notificationPushSubscriptionCoordinator.ts";
import type { createNotificationPushManualReenableCoordinator } from "./notificationPushManualReenableCoordinator.ts";
import type { PendingPushCleanupAttempt } from "./notificationPushStorage.ts";
import type { NotificationPushRuntimeStateView } from "./notificationPushStateContract.ts";

type Storage = ReturnType<typeof createNotificationPushStorage>;
interface Options {
  auth: AuthVerificationAuthority;
  storage: Storage;
  subscription: ReturnType<typeof createNotificationPushSubscriptionCoordinator>;
  manualReenable: ReturnType<typeof createNotificationPushManualReenableCoordinator>;
  cleanup: {
    processPendingPushCleanup(input: {
      attempt: PendingPushCleanupAttempt;
      signal?: AbortSignal;
    }): PromiseLike<{ kind: "completed" } | { kind: "pending" }>;
  };
}

/** User actions are single-flight. Only data-free state names leave this owner. */
export function createNotificationPushUserActions({ auth, storage, subscription, manualReenable, cleanup }: Options) {
  let enabling: Promise<NotificationPushRuntimeStateView> | null = null;

  async function reconcile(signal?: AbortSignal) {
    const proof = auth.readCurrentVerifiedAuthProof();
    let state = await storage.readPushRuntimeState();
    if (
      proof &&
      auth.isVerifiedAuthProofCurrent(proof) &&
      "binding" in state &&
      state.binding.authUserId !== proof.authUserId
    ) {
      await storage.suspendCurrentPushBinding({
        authUserId: state.binding.authUserId,
        bindingId: state.binding.bindingId,
        expectedLocalRevision: state.binding.localRevision,
        reason: "account_changed",
      });
      state = await storage.readPushRuntimeState();
    }
    if (state.kind === "cleanup-pending" || state.kind === "cleanup-required") {
      if (state.kind === "cleanup-required") {
        await storage.queueRequiredPushCleanup({
          authUserId: state.binding.authUserId,
          bindingId: state.binding.bindingId,
          expectedLocalRevision: state.binding.localRevision,
          reason: state.binding.reason,
        });
      }
      for (const attempt of await storage.listPendingPushCleanups()) {
        if (signal?.aborted) break;
        await cleanup.processPendingPushCleanup({ attempt, signal });
      }
      state = await storage.readPushRuntimeState();
    }
    return state;
  }

  async function readState(signal?: AbortSignal): Promise<NotificationPushRuntimeStateView> {
    try {
      const state = await reconcile(signal);
      const proof = auth.readCurrentVerifiedAuthProof();
      if (
        "binding" in state &&
        (!proof || !auth.isVerifiedAuthProofCurrent(proof) || state.binding.authUserId !== proof.authUserId)
      ) {
        return { kind: "auth-unverified" };
      }
      if (state.kind === "enabled" && proof) {
        const result = await subscription.refreshEnabledBinding({
          authUserId: proof.authUserId,
          authProofRevision: proof.revision,
          binding: state.binding,
          signal,
        });
        if (result.kind !== "committed") return { kind: "auth-unverified" };
      }
      return { kind: state.kind };
    } catch {
      return { kind: "unavailable" };
    }
  }

  async function performEnable(signal?: AbortSignal): Promise<NotificationPushRuntimeStateView> {
    try {
      const proof = auth.readCurrentVerifiedAuthProof();
      if (!proof || !auth.isVerifiedAuthProofCurrent(proof)) return { kind: "auth-unverified" };
      const state = await reconcile(signal);
      if (signal?.aborted || !auth.isVerifiedAuthProofCurrent(proof)) return { kind: "auth-unverified" };
      const identity = { authUserId: proof.authUserId, authProofRevision: proof.revision, signal };
      if ("binding" in state && state.binding.authUserId !== proof.authUserId) return { kind: "cleanup-pending" };
      if (state.kind === "disabled") {
        const deviceId = await storage.getOrCreateLogicalDeviceId();
        if (!auth.isVerifiedAuthProofCurrent(proof)) return { kind: "auth-unverified" };
        const provisioning = await storage.beginExplicitPushProvisioning({
          authUserId: proof.authUserId,
          deviceId,
          expectedCurrentRevision: null,
        });
        await subscription.enableProvisioning({ ...identity, predecessor: null, provisioning });
      } else if (state.kind === "provisioning") {
        const provisioning = await storage.readPushProvisioning(proof.authUserId);
        if (provisioning) await subscription.enableProvisioning({ ...identity, predecessor: null, provisioning });
      } else if (state.kind === "auth-unverified") {
        await manualReenable.startManualPushReenable({ ...identity, binding: state.binding });
      } else if (state.kind === "enabled") {
        const refreshed = await subscription.refreshEnabledBinding({ ...identity, binding: state.binding });
        if (refreshed.kind !== "committed" && !signal?.aborted && auth.isVerifiedAuthProofCurrent(proof)) {
          const suspended = await storage.suspendCurrentPushBinding({
            authUserId: proof.authUserId,
            bindingId: state.binding.bindingId,
            expectedLocalRevision: state.binding.localRevision,
            reason: "auth_unavailable",
          });
          if (suspended.state.state === "auth-unverified") {
            await manualReenable.startManualPushReenable({ ...identity, binding: suspended.state });
          }
        }
      }
      return await readState(signal);
    } catch {
      return { kind: "unavailable" };
    }
  }

  function enable(signal?: AbortSignal): Promise<NotificationPushRuntimeStateView> {
    if (enabling) return enabling;
    enabling = performEnable(signal).finally(() => {
      enabling = null;
    });
    return enabling;
  }
  return Object.freeze({ enable, readState });
}
