import { validateCanonicalPushSubscriptionStructure } from "../supabase/functions/_shared/push-subscription-v2-protocol.js";
import { createNotificationPushBrowserSubscription } from "./notificationPushBrowserSubscription.ts";
import { createNotificationPushStorage } from "./notificationPushStorage.ts";
import { createNotificationPushSubscriptionCoordinator } from "./notificationPushSubscriptionCoordinator.ts";
import { createNotificationPushSubscriptionTransport } from "./notificationPushSubscriptionTransport.ts";

interface VerifiedAuthProof {
  readonly accessToken: string;
  readonly authUserId: string;
  readonly revision: number;
}

interface PushSubscriptionCompositionAuthPort {
  isVerifiedAuthProofCurrent: (proof: VerifiedAuthProof) => boolean;
  notifyUnauthorized: (input: { authUserId: string; revision: number }) => PromiseLike<void> | void;
  readVerifiedAuthProof: (input: { authUserId: string; revision: number }) => PromiseLike<VerifiedAuthProof | null>;
}

interface BrowserNotificationLike {
  readonly permission: unknown;
  requestPermission(): PromiseLike<unknown>;
}

interface BrowserServiceWorkerContainerLike {
  readonly ready: PromiseLike<unknown>;
  register(scriptUrl: string): PromiseLike<unknown>;
}

interface PushSubscriptionLocalCompositionOptions {
  readonly auth: PushSubscriptionCompositionAuthPort;
  readonly cryptoRef?: Crypto;
  readonly fetchRef?: typeof globalThis.fetch;
  readonly indexedDb?: IDBFactory;
  readonly locationRef?: Pick<Location, "origin">;
  readonly navigatorRef?: { readonly serviceWorker?: BrowserServiceWorkerContainerLike };
  readonly notificationRef?: BrowserNotificationLike;
  readonly subscriptionEndpoint: string;
  readonly vapidPublicKey: string;
}

export const PUSH_SUBSCRIPTION_LOCAL_COMPOSITION_ERROR_CODES = Object.freeze({
  INVALID_CONFIGURATION: "PUSH_SUBSCRIPTION_LOCAL_COMPOSITION_INVALID_CONFIGURATION",
});

export class NotificationPushSubscriptionLocalCompositionError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "NotificationPushSubscriptionLocalCompositionError";
    this.code = code;
  }
}

function compositionError(code: string): NotificationPushSubscriptionLocalCompositionError {
  return new NotificationPushSubscriptionLocalCompositionError(code);
}

export function createNotificationPushSubscriptionLocalComposition(options: PushSubscriptionLocalCompositionOptions) {
  const auth = options?.auth;
  if (
    !auth ||
    typeof auth.isVerifiedAuthProofCurrent !== "function" ||
    typeof auth.notifyUnauthorized !== "function" ||
    typeof auth.readVerifiedAuthProof !== "function"
  ) {
    throw compositionError(PUSH_SUBSCRIPTION_LOCAL_COMPOSITION_ERROR_CODES.INVALID_CONFIGURATION);
  }

  const cryptoRef = options.cryptoRef ?? globalThis.crypto;
  const storage = createNotificationPushStorage({ cryptoRef, indexedDb: options.indexedDb });
  const browser = createNotificationPushBrowserSubscription({
    cryptoRef,
    navigatorRef: options.navigatorRef,
    notificationRef: options.notificationRef,
    validateSubscription: async (subscription) =>
      (await validateCanonicalPushSubscriptionStructure(subscription, cryptoRef)) ? subscription : null,
    vapidPublicKey: options.vapidPublicKey,
  });
  const transport = createNotificationPushSubscriptionTransport({
    cryptoRef,
    fetchRef: options.fetchRef,
    locationRef: options.locationRef,
    subscriptionEndpoint: options.subscriptionEndpoint,
  });
  const coordinator = createNotificationPushSubscriptionCoordinator({ auth, browser, storage, transport });

  return Object.freeze({ browser, coordinator, storage });
}
