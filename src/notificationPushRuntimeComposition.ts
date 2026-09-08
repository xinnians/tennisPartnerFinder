import type { AuthVerificationAuthority } from "./features/profile-auth/authRefreshCoordinator.ts";
import { createNotificationPushAuthCorrelation } from "./notificationPushAuthCorrelation.ts";
import { createNotificationPushAuthFailureCoordinator } from "./notificationPushAuthFailureCoordinator.ts";
import { createNotificationPushCleanupCoordinator } from "./notificationPushCleanupCoordinator.ts";
import { createNotificationPushCleanupTransport } from "./notificationPushCleanupTransport.ts";
import { createNotificationPushDeactivation } from "./notificationPushDeactivation.ts";
import { createNotificationPushManualReenableCoordinator } from "./notificationPushManualReenableCoordinator.ts";
import { createNotificationPushOwnerQuarantine } from "./notificationPushOwnerQuarantine.ts";
import { createNotificationPushSignOutCoordinator } from "./notificationPushSignOutCoordinator.ts";
import { createNotificationPushSubscriptionLocalComposition } from "./notificationPushSubscriptionLocalComposition.ts";
import { createNotificationPushUserActions } from "./notificationPushUserActions.ts";

type SubscriptionCompositionOptions = Parameters<typeof createNotificationPushSubscriptionLocalComposition>[0];
type OwnerQuarantineOptions = Parameters<typeof createNotificationPushOwnerQuarantine>[0];

export interface NotificationPushRuntimeCompositionOptions extends Omit<SubscriptionCompositionOptions, "auth"> {
  readonly auth: AuthVerificationAuthority;
  readonly cleanupEndpoint: string;
  readonly quarantineRpc: OwnerQuarantineOptions["rpc"];
}

export function createNotificationPushRuntimeComposition(options: NotificationPushRuntimeCompositionOptions) {
  const { auth, cleanupEndpoint, ...subscriptionOptions } = options;
  const subscription = createNotificationPushSubscriptionLocalComposition({
    ...subscriptionOptions,
    auth: {
      isVerifiedAuthProofCurrent: (proof) => auth.isVerifiedAuthProofCurrent(proof),
      notifyUnauthorized: (input) => auth.notifyUnauthorized(input),
      readVerifiedAuthProof: (input) => Promise.resolve(auth.readVerifiedAuthProof(input)),
    },
  });
  const cleanupTransport = createNotificationPushCleanupTransport({
    cleanupEndpoint,
    cryptoRef: options.cryptoRef,
    fetchRef: options.fetchRef,
    locationRef: options.locationRef,
  });
  const cleanup = createNotificationPushCleanupCoordinator({
    storage: subscription.storage,
    transport: cleanupTransport,
  });
  const authFailure = createNotificationPushAuthFailureCoordinator({ cleanup, storage: subscription.storage });
  const authCorrelation = createNotificationPushAuthCorrelation({
    authFailure,
    isVerificationRevisionCurrent: (revision) => auth.isVerificationRevisionCurrent(revision),
    storage: subscription.storage,
  });
  const manualReenable = createNotificationPushManualReenableCoordinator({
    cleanup,
    enable: subscription.coordinator,
    isVerifiedAuthProofCurrent: ({ authUserId, revision }) =>
      auth.readVerifiedAuthProof({ authUserId, revision }) !== null,
    storage: subscription.storage,
  });
  const deactivation = createNotificationPushDeactivation({ browser: subscription.browser });
  const ownerQuarantine = createNotificationPushOwnerQuarantine({ rpc: options.quarantineRpc });
  const signOutCleanup = createNotificationPushSignOutCoordinator({
    browser: deactivation,
    cleanup,
    owner: ownerQuarantine,
    storage: subscription.storage,
  });

  return Object.freeze({
    userActions: createNotificationPushUserActions({
      auth,
      storage: subscription.storage,
      subscription: subscription.coordinator,
      manualReenable,
      cleanup,
    }),
    authCorrelation,
    manualReenable,
    signOutCleanup,
    storage: subscription.storage,
    subscriptionCoordinator: subscription.coordinator,
  });
}

export type NotificationPushRuntimeComposition = ReturnType<typeof createNotificationPushRuntimeComposition>;
