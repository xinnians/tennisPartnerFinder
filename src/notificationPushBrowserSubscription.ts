export const PUSH_BROWSER_SUBSCRIPTION_ERROR_CODES = Object.freeze({
  INVALID_CONFIGURATION: "PUSH_BROWSER_SUBSCRIPTION_INVALID_CONFIGURATION",
});

export class NotificationPushBrowserSubscriptionError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "NotificationPushBrowserSubscriptionError";
    this.code = code;
  }
}

interface PushSubscriptionValue {
  readonly auth: string;
  readonly endpoint: string;
  readonly p256dh: string;
}

type ValidatedPushSubscription = PushSubscriptionValue | null;

interface BrowserNotificationLike {
  readonly permission: unknown;
  requestPermission(): PromiseLike<unknown>;
}

interface BrowserPushManagerLike {
  getSubscription(): PromiseLike<unknown>;
  subscribe(input: { applicationServerKey: Uint8Array; userVisibleOnly: true }): PromiseLike<unknown>;
}

interface BrowserServiceWorkerContainerLike {
  readonly ready: PromiseLike<unknown>;
  getRegistration(clientURL?: string): PromiseLike<unknown>;
  register(scriptUrl: string): PromiseLike<unknown>;
}

interface BrowserNavigatorLike {
  readonly serviceWorker?: BrowserServiceWorkerContainerLike;
}

interface BrowserSubscriptionOptions {
  readonly cryptoRef?: Crypto;
  readonly navigatorRef?: BrowserNavigatorLike;
  readonly notificationRef?: BrowserNotificationLike;
  readonly validateSubscription: (subscription: PushSubscriptionValue) => PromiseLike<ValidatedPushSubscription>;
  readonly vapidPublicKey: string;
}

interface PreparePushSubscriptionInput {
  readonly kind: "enable" | "refresh";
  readonly signal?: AbortSignal;
}

export type PreparedBrowserPushSubscription =
  { kind: "cancelled-before-network" } | { kind: "pending" } | { kind: "ready"; subscription: PushSubscriptionValue };

const CANCELLED_RESULT = Object.freeze({ kind: "cancelled-before-network" } as const);
const PENDING_RESULT = Object.freeze({ kind: "pending" } as const);
const SERVICE_WORKER_PATH = "/push-sw.js";
const VAPID_PUBLIC_KEY_BYTES = 65;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;

function browserSubscriptionError(code: string): NotificationPushBrowserSubscriptionError {
  return new NotificationPushBrowserSubscriptionError(code);
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<PropertyKey, unknown>, expectedKeys: string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === expectedKeys.length && expectedKeys.every((key) => keys.includes(key));
}

function validPrepareInput(value: unknown): value is PreparePushSubscriptionInput {
  if (!isRecord(value)) return false;
  const expectedKeys = Reflect.ownKeys(value).includes("signal") ? ["kind", "signal"] : ["kind"];
  if (!hasExactKeys(value, expectedKeys) || (value.kind !== "enable" && value.kind !== "refresh")) return false;
  return (
    !Reflect.ownKeys(value).includes("signal") ||
    value.signal === undefined ||
    (isRecord(value.signal) && typeof (value.signal as { aborted?: unknown }).aborted === "boolean")
  );
}

function isAborted(signal: AbortSignal | undefined): boolean {
  try {
    return signal?.aborted === true;
  } catch {
    return true;
  }
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function exactVapidBytes(value: unknown): Uint8Array | null {
  if (typeof value !== "string" || !value || !BASE64URL_PATTERN.test(value) || value.length % 4 === 1) return null;
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = globalThis.atob(value.replaceAll("-", "+").replaceAll("_", "/") + padding);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return bytes.byteLength === VAPID_PUBLIC_KEY_BYTES && bytes[0] === 4 && encodeBase64Url(bytes) === value
      ? bytes
      : null;
  } catch {
    return null;
  }
}

async function validVapidBytes(value: Uint8Array, cryptoRef: Crypto): Promise<boolean> {
  const owned = new Uint8Array(value.byteLength);
  owned.set(value);
  try {
    await cryptoRef.subtle.importKey("raw", owned.buffer, { name: "ECDH", namedCurve: "P-256" }, false, []);
    return true;
  } catch {
    return false;
  } finally {
    owned.fill(0);
  }
}

function bufferSourceBytes(value: unknown): Uint8Array | null {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (!ArrayBuffer.isView(value)) return null;
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function pushManagerFromRegistration(value: unknown): BrowserPushManagerLike | null {
  if (!isRecord(value) || !isRecord(value.pushManager)) return null;
  const pushManager = value.pushManager as unknown as BrowserPushManagerLike;
  return typeof pushManager.getSubscription === "function" && typeof pushManager.subscribe === "function"
    ? pushManager
    : null;
}

function subscriptionUsesVapidKey(value: unknown, expected: Uint8Array): boolean {
  if (!isRecord(value) || !isRecord(value.options)) return false;
  const actual = bufferSourceBytes(value.options.applicationServerKey);
  return actual !== null && sameBytes(actual, expected);
}

function subscriptionHandle(value: unknown): { unsubscribe(): PromiseLike<unknown> } | null {
  if (!isRecord(value) || typeof value.unsubscribe !== "function") return null;
  return value as unknown as { unsubscribe(): PromiseLike<unknown> };
}

function subscriptionValue(value: unknown): PushSubscriptionValue | null {
  if (!isRecord(value) || typeof value.endpoint !== "string" || !value.endpoint || typeof value.toJSON !== "function") {
    return null;
  }
  let json: unknown;
  try {
    json = (value.toJSON as () => unknown)();
  } catch {
    return null;
  }
  if (!isRecord(json) || json.endpoint !== value.endpoint || !isRecord(json.keys)) return null;
  const auth = json.keys.auth;
  const p256dh = json.keys.p256dh;
  if (typeof auth !== "string" || !auth || typeof p256dh !== "string" || !p256dh) return null;
  return { auth, endpoint: value.endpoint, p256dh };
}

function sameSubscription(left: unknown, right: PushSubscriptionValue): left is PushSubscriptionValue {
  return (
    isRecord(left) &&
    hasExactKeys(left, ["auth", "endpoint", "p256dh"]) &&
    left.auth === right.auth &&
    left.endpoint === right.endpoint &&
    left.p256dh === right.p256dh
  );
}

export function createNotificationPushBrowserSubscription(
  {
    cryptoRef = globalThis.crypto,
    navigatorRef = globalThis.navigator,
    notificationRef = globalThis.Notification,
    validateSubscription,
    vapidPublicKey,
  }: BrowserSubscriptionOptions = {} as BrowserSubscriptionOptions
) {
  if (
    typeof vapidPublicKey !== "string" ||
    !exactVapidBytes(vapidPublicKey) ||
    typeof validateSubscription !== "function" ||
    !cryptoRef?.subtle
  ) {
    throw browserSubscriptionError(PUSH_BROWSER_SUBSCRIPTION_ERROR_CODES.INVALID_CONFIGURATION);
  }

  async function readCurrentSubscription(): Promise<unknown> {
    const serviceWorker = navigatorRef?.serviceWorker;
    if (!serviceWorker || typeof serviceWorker.getRegistration !== "function") {
      throw browserSubscriptionError(PUSH_BROWSER_SUBSCRIPTION_ERROR_CODES.INVALID_CONFIGURATION);
    }
    const registration = await serviceWorker.getRegistration();
    if (registration === undefined) return null;
    const pushManager = pushManagerFromRegistration(registration);
    if (!pushManager) throw browserSubscriptionError(PUSH_BROWSER_SUBSCRIPTION_ERROR_CODES.INVALID_CONFIGURATION);
    return pushManager.getSubscription();
  }

  async function preparePushSubscription(
    input: PreparePushSubscriptionInput
  ): Promise<PreparedBrowserPushSubscription> {
    let vapidBytes: Uint8Array | null = null;
    try {
      if (!validPrepareInput(input) || isAborted(input.signal)) return PENDING_RESULT;
      vapidBytes = exactVapidBytes(vapidPublicKey);
      if (!vapidBytes || !(await validVapidBytes(vapidBytes, cryptoRef)) || isAborted(input.signal)) {
        return PENDING_RESULT;
      }

      const serviceWorker = navigatorRef?.serviceWorker;
      if (
        !notificationRef ||
        typeof notificationRef.requestPermission !== "function" ||
        !serviceWorker ||
        typeof serviceWorker.register !== "function"
      ) {
        return PENDING_RESULT;
      }

      let permission = notificationRef.permission;
      if (input.kind === "enable" && permission === "default") {
        permission = await notificationRef.requestPermission();
        if (isAborted(input.signal)) return PENDING_RESULT;
      }
      if (permission !== "granted") {
        return input.kind === "enable" && (permission === "default" || permission === "denied")
          ? CANCELLED_RESULT
          : PENDING_RESULT;
      }

      await serviceWorker.register(SERVICE_WORKER_PATH);
      if (isAborted(input.signal)) return PENDING_RESULT;
      const registration = await serviceWorker.ready;
      if (isAborted(input.signal)) return PENDING_RESULT;
      const pushManager = pushManagerFromRegistration(registration);
      if (!pushManager) return PENDING_RESULT;

      let subscription = await pushManager.getSubscription();
      if (isAborted(input.signal)) return PENDING_RESULT;
      if (subscription !== null && !subscriptionUsesVapidKey(subscription, vapidBytes)) {
        const handle = subscriptionHandle(subscription);
        if (!handle) return PENDING_RESULT;
        await handle.unsubscribe();
        if (isAborted(input.signal)) return PENDING_RESULT;
        subscription = await pushManager.getSubscription();
        if (isAborted(input.signal)) return PENDING_RESULT;
        if (subscription !== null && !subscriptionUsesVapidKey(subscription, vapidBytes)) return PENDING_RESULT;
      }

      if (subscription === null) {
        subscription = await pushManager.subscribe({ applicationServerKey: vapidBytes, userVisibleOnly: true });
        if (isAborted(input.signal)) return PENDING_RESULT;
      }
      if (!subscriptionUsesVapidKey(subscription, vapidBytes)) return PENDING_RESULT;

      const extracted = subscriptionValue(subscription);
      if (!extracted) return PENDING_RESULT;
      const validated = await validateSubscription(extracted);
      if (!sameSubscription(validated, extracted) || isAborted(input.signal)) return PENDING_RESULT;
      return Object.freeze({ kind: "ready", subscription: Object.freeze(extracted) });
    } catch {
      return PENDING_RESULT;
    } finally {
      vapidBytes?.fill(0);
    }
  }

  return Object.freeze({ preparePushSubscription, readCurrentSubscription });
}
