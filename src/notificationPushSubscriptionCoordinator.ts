export const PUSH_SUBSCRIPTION_COORDINATOR_ERROR_CODES = Object.freeze({
  INVALID_CONFIGURATION: "PUSH_SUBSCRIPTION_COORDINATOR_INVALID_CONFIGURATION",
});

export class NotificationPushSubscriptionCoordinatorError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "NotificationPushSubscriptionCoordinatorError";
    this.code = code;
  }
}

interface PushServerConsentIdentity {
  readonly consentEpoch: string;
  readonly consentId: string;
  readonly consentVersion: string;
}

interface PushSubscriptionValue {
  readonly auth: string;
  readonly endpoint: string;
  readonly p256dh: string;
}

interface PushProvisioningBinding {
  readonly authUserId: string;
  readonly bindingId: string;
  readonly cleanupToken: string;
  readonly deviceId: string;
  readonly key: "current";
  readonly localRevision: string;
  readonly schemaVersion: 1;
  readonly serverConsent: null;
  readonly state: "provisioning";
}

interface PushEnabledBinding {
  readonly authUserId: string;
  readonly bindingId: string;
  readonly deviceId: string;
  readonly localRevision: string;
  readonly serverConsent: PushServerConsentIdentity;
  readonly state: "enabled";
}

interface VerifiedAuthProof {
  readonly accessToken: string;
  readonly authUserId: string;
  readonly revision: number;
}

interface PushSubscriptionCoordinatorAuthPort {
  isVerifiedAuthProofCurrent: (proof: VerifiedAuthProof) => boolean;
  notifyUnauthorized: (input: { authUserId: string; revision: number }) => PromiseLike<void> | void;
  readVerifiedAuthProof: (input: { authUserId: string; revision: number }) => PromiseLike<VerifiedAuthProof | null>;
}

type PreparedPushSubscription =
  { kind: "cancelled-before-network" } | { kind: "pending" } | { kind: "ready"; subscription: PushSubscriptionValue };

interface PushSubscriptionCoordinatorBrowserPort {
  preparePushSubscription: (input: {
    kind: "enable" | "refresh";
    signal?: AbortSignal;
  }) => PromiseLike<PreparedPushSubscription>;
}

interface PushSubscriptionCoordinatorStoragePort {
  cancelExplicitPushProvisioning: (input: {
    authUserId: string;
    bindingId: string;
    expectedLocalRevision: string;
  }) => PromiseLike<void>;
  commitPushProvisioning: (input: {
    authUserId: string;
    bindingId: string;
    consentEpoch: string;
    consentId: string;
    consentVersion: string;
    deviceId: string;
    expectedLocalRevision: string;
  }) => PromiseLike<unknown>;
  commitPushRefresh: (input: {
    authUserId: string;
    bindingId: string;
    consentEpoch: string;
    consentId: string;
    consentVersion: string;
    deviceId: string;
    expectedConsent: PushServerConsentIdentity;
    expectedLocalRevision: string;
  }) => PromiseLike<unknown>;
  readPushProvisioning: (authUserId: string) => PromiseLike<PushProvisioningBinding | null>;
  readPushRuntimeState: () => PromiseLike<unknown>;
}

type PushSubscriptionTransportResult =
  | {
      bindingId: string;
      consentEpoch: string;
      consentId: string;
      consentVersion: string;
      kind: "committed";
      version: 1;
    }
  | { kind: "endpoint-unavailable" | "invalid" | "stale" | "unavailable"; version: 1 }
  | { kind: "unauthorized" };

interface PushSubscriptionCoordinatorTransportPort {
  sendEnable: (input: {
    accessToken: string;
    authUserId: string;
    predecessor: PushServerConsentIdentity | null;
    provisioning: PushProvisioningBinding;
    signal?: AbortSignal;
    subscription: PushSubscriptionValue;
  }) => PromiseLike<PushSubscriptionTransportResult>;
  sendRefresh: (input: {
    accessToken: string;
    authUserId: string;
    binding: PushEnabledBinding;
    signal?: AbortSignal;
    subscription: PushSubscriptionValue;
  }) => PromiseLike<PushSubscriptionTransportResult>;
}

interface PushSubscriptionCoordinatorOptions {
  auth: PushSubscriptionCoordinatorAuthPort;
  browser: PushSubscriptionCoordinatorBrowserPort;
  storage: PushSubscriptionCoordinatorStoragePort;
  transport: PushSubscriptionCoordinatorTransportPort;
}

interface EnableProvisioningInput {
  readonly authProofRevision: number;
  readonly authUserId: string;
  readonly predecessor: PushServerConsentIdentity | null;
  readonly provisioning: PushProvisioningBinding;
  readonly signal?: AbortSignal;
}

interface RefreshEnabledBindingInput {
  readonly authProofRevision: number;
  readonly authUserId: string;
  readonly binding: PushEnabledBinding;
  readonly signal?: AbortSignal;
}

export type PushSubscriptionCoordinatorResult = { kind: "committed" } | { kind: "pending" };

const COMMITTED_RESULT = Object.freeze({ kind: "committed" } as const);
const PENDING_RESULT = Object.freeze({ kind: "pending" } as const);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const CLEANUP_TOKEN_PATTERN = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u;
const POSITIVE_BIGINT_PATTERN = /^[1-9][0-9]*$/u;
const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

function coordinatorError(code: string): NotificationPushSubscriptionCoordinatorError {
  return new NotificationPushSubscriptionCoordinatorError(code);
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<PropertyKey, unknown>, expectedKeys: string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === expectedKeys.length && expectedKeys.every((key) => keys.includes(key));
}

function validUuid(value: unknown, version4Only = false): value is string {
  return typeof value === "string" && (version4Only ? UUID_V4_PATTERN : UUID_PATTERN).test(value);
}

function validBigint(value: unknown): value is string {
  if (typeof value !== "string" || !POSITIVE_BIGINT_PATTERN.test(value)) return false;
  try {
    return BigInt(value) <= MAX_POSTGRES_BIGINT;
  } catch {
    return false;
  }
}

function validConsent(value: unknown): value is PushServerConsentIdentity {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["consentEpoch", "consentId", "consentVersion"]) &&
    validUuid(value.consentEpoch) &&
    validBigint(value.consentId) &&
    validBigint(value.consentVersion)
  );
}

function sameConsent(left: unknown, right: unknown): boolean {
  return (
    validConsent(left) &&
    validConsent(right) &&
    left.consentEpoch === right.consentEpoch &&
    left.consentId === right.consentId &&
    left.consentVersion === right.consentVersion
  );
}

const PROVISIONING_KEYS = [
  "authUserId",
  "bindingId",
  "cleanupToken",
  "deviceId",
  "key",
  "localRevision",
  "schemaVersion",
  "serverConsent",
  "state",
];
const ENABLED_KEYS = ["authUserId", "bindingId", "deviceId", "localRevision", "serverConsent", "state"];

function validProvisioning(value: unknown): value is PushProvisioningBinding {
  return (
    isRecord(value) &&
    hasExactKeys(value, PROVISIONING_KEYS) &&
    validUuid(value.authUserId) &&
    validUuid(value.bindingId, true) &&
    typeof value.cleanupToken === "string" &&
    CLEANUP_TOKEN_PATTERN.test(value.cleanupToken) &&
    validUuid(value.deviceId, true) &&
    value.key === "current" &&
    validUuid(value.localRevision, true) &&
    value.schemaVersion === 1 &&
    value.serverConsent === null &&
    value.state === "provisioning"
  );
}

function sameProvisioning(left: unknown, right: PushProvisioningBinding): boolean {
  return (
    validProvisioning(left) &&
    left.authUserId === right.authUserId &&
    left.bindingId === right.bindingId &&
    left.cleanupToken === right.cleanupToken &&
    left.deviceId === right.deviceId &&
    left.key === right.key &&
    left.localRevision === right.localRevision &&
    left.schemaVersion === right.schemaVersion &&
    left.serverConsent === right.serverConsent &&
    left.state === right.state
  );
}

function validEnabledBinding(value: unknown): value is PushEnabledBinding {
  return (
    isRecord(value) &&
    hasExactKeys(value, ENABLED_KEYS) &&
    validUuid(value.authUserId) &&
    validUuid(value.bindingId, true) &&
    validUuid(value.deviceId, true) &&
    validUuid(value.localRevision, true) &&
    validConsent(value.serverConsent) &&
    value.state === "enabled"
  );
}

function sameEnabledBinding(left: unknown, right: PushEnabledBinding): boolean {
  return (
    validEnabledBinding(left) &&
    left.authUserId === right.authUserId &&
    left.bindingId === right.bindingId &&
    left.deviceId === right.deviceId &&
    left.localRevision === right.localRevision &&
    sameConsent(left.serverConsent, right.serverConsent)
  );
}

function enabledBindingFromRuntime(value: unknown): PushEnabledBinding | null {
  if (!isRecord(value) || !hasExactKeys(value, ["binding", "deviceId", "kind"]) || value.kind !== "enabled") {
    return null;
  }
  if (!validEnabledBinding(value.binding) || value.deviceId !== value.binding.deviceId) return null;
  return value.binding;
}

function validProof(value: unknown, authUserId: string, revision: number): value is VerifiedAuthProof {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["accessToken", "authUserId", "revision"]) &&
    typeof value.accessToken === "string" &&
    value.accessToken.length > 0 &&
    value.authUserId === authUserId &&
    value.revision === revision
  );
}

function validSubscription(value: unknown): value is PushSubscriptionValue {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["auth", "endpoint", "p256dh"]) &&
    typeof value.auth === "string" &&
    value.auth.length > 0 &&
    typeof value.endpoint === "string" &&
    value.endpoint.length > 0 &&
    typeof value.p256dh === "string" &&
    value.p256dh.length > 0
  );
}

function readySubscription(value: unknown): PushSubscriptionValue | null {
  return isRecord(value) &&
    hasExactKeys(value, ["kind", "subscription"]) &&
    value.kind === "ready" &&
    validSubscription(value.subscription)
    ? value.subscription
    : null;
}

function exactKind(value: unknown, kind: string): boolean {
  return isRecord(value) && hasExactKeys(value, ["kind"]) && value.kind === kind;
}

function committedResponse(value: unknown, bindingId: string): PushServerConsentIdentity | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["bindingId", "consentEpoch", "consentId", "consentVersion", "kind", "version"]) ||
    value.kind !== "committed" ||
    value.version !== 1 ||
    value.bindingId !== bindingId
  ) {
    return null;
  }
  const consent = {
    consentEpoch: value.consentEpoch,
    consentId: value.consentId,
    consentVersion: value.consentVersion,
  };
  return validConsent(consent) ? consent : null;
}

function validCoordinatorInput(value: unknown, keys: string[]): value is Record<PropertyKey, unknown> {
  if (!isRecord(value)) return false;
  const expectedKeys = Reflect.ownKeys(value).includes("signal") ? [...keys, "signal"] : keys;
  return hasExactKeys(value, expectedKeys);
}

export function createNotificationPushSubscriptionCoordinator(options: PushSubscriptionCoordinatorOptions) {
  const auth = options?.auth;
  const browser = options?.browser;
  const storage = options?.storage;
  const transport = options?.transport;
  if (
    !auth ||
    typeof auth.isVerifiedAuthProofCurrent !== "function" ||
    typeof auth.notifyUnauthorized !== "function" ||
    typeof auth.readVerifiedAuthProof !== "function" ||
    !browser ||
    typeof browser.preparePushSubscription !== "function" ||
    !storage ||
    typeof storage.cancelExplicitPushProvisioning !== "function" ||
    typeof storage.commitPushProvisioning !== "function" ||
    typeof storage.commitPushRefresh !== "function" ||
    typeof storage.readPushProvisioning !== "function" ||
    typeof storage.readPushRuntimeState !== "function" ||
    !transport ||
    typeof transport.sendEnable !== "function" ||
    typeof transport.sendRefresh !== "function"
  ) {
    throw coordinatorError(PUSH_SUBSCRIPTION_COORDINATOR_ERROR_CODES.INVALID_CONFIGURATION);
  }

  function proofIsCurrent(proof: VerifiedAuthProof): boolean {
    try {
      return auth.isVerifiedAuthProofCurrent(proof) === true;
    } catch {
      return false;
    }
  }

  async function readCurrentProof(authUserId: string, revision: number): Promise<VerifiedAuthProof | null> {
    const proof = await auth.readVerifiedAuthProof({ authUserId, revision });
    return validProof(proof, authUserId, revision) && proofIsCurrent(proof) ? proof : null;
  }

  async function notifyUnauthorized(proof: VerifiedAuthProof): Promise<void> {
    try {
      await auth.notifyUnauthorized({ authUserId: proof.authUserId, revision: proof.revision });
    } catch {
      // Auth remains the only authority; notification failure cannot become a local rejection.
    }
  }

  async function enableProvisioning(input: EnableProvisioningInput): Promise<PushSubscriptionCoordinatorResult> {
    try {
      if (
        !validCoordinatorInput(input, ["authProofRevision", "authUserId", "predecessor", "provisioning"]) ||
        !Number.isSafeInteger(input.authProofRevision) ||
        input.authProofRevision < 0 ||
        !validUuid(input.authUserId) ||
        (input.predecessor !== null && !validConsent(input.predecessor)) ||
        !validProvisioning(input.provisioning) ||
        input.provisioning.authUserId !== input.authUserId
      ) {
        return PENDING_RESULT;
      }
      const { authProofRevision, authUserId, predecessor, provisioning, signal } = input;
      const proof = await readCurrentProof(authUserId, authProofRevision);
      if (!proof) return PENDING_RESULT;

      const prepared = await browser.preparePushSubscription({ kind: "enable", signal });
      if (exactKind(prepared, "cancelled-before-network")) {
        if (!proofIsCurrent(proof)) return PENDING_RESULT;
        const stored = await storage.readPushProvisioning(authUserId);
        if (!sameProvisioning(stored, provisioning) || !proofIsCurrent(proof)) return PENDING_RESULT;
        await storage.cancelExplicitPushProvisioning({
          authUserId,
          bindingId: provisioning.bindingId,
          expectedLocalRevision: provisioning.localRevision,
        });
        return PENDING_RESULT;
      }
      const subscription = readySubscription(prepared);
      if (!subscription || !proofIsCurrent(proof)) return PENDING_RESULT;

      const beforeNetwork = await storage.readPushProvisioning(authUserId);
      if (!sameProvisioning(beforeNetwork, provisioning) || !proofIsCurrent(proof)) return PENDING_RESULT;
      const response = await transport.sendEnable({
        accessToken: proof.accessToken,
        authUserId,
        predecessor,
        provisioning,
        signal,
        subscription,
      });
      if (exactKind(response, "unauthorized")) {
        if (proofIsCurrent(proof)) await notifyUnauthorized(proof);
        return PENDING_RESULT;
      }
      const consent = committedResponse(response, provisioning.bindingId);
      if (!consent || !proofIsCurrent(proof)) return PENDING_RESULT;

      const afterNetwork = await storage.readPushProvisioning(authUserId);
      if (!sameProvisioning(afterNetwork, provisioning) || !proofIsCurrent(proof)) return PENDING_RESULT;
      const committed = await storage.commitPushProvisioning({
        authUserId,
        bindingId: provisioning.bindingId,
        deviceId: provisioning.deviceId,
        expectedLocalRevision: provisioning.localRevision,
        ...consent,
      });
      return validEnabledBinding(committed) &&
        committed.authUserId === authUserId &&
        committed.bindingId === provisioning.bindingId &&
        committed.deviceId === provisioning.deviceId &&
        sameConsent(committed.serverConsent, consent) &&
        proofIsCurrent(proof)
        ? COMMITTED_RESULT
        : PENDING_RESULT;
    } catch {
      return PENDING_RESULT;
    }
  }

  async function refreshEnabledBinding(input: RefreshEnabledBindingInput): Promise<PushSubscriptionCoordinatorResult> {
    try {
      if (
        !validCoordinatorInput(input, ["authProofRevision", "authUserId", "binding"]) ||
        !Number.isSafeInteger(input.authProofRevision) ||
        input.authProofRevision < 0 ||
        !validUuid(input.authUserId) ||
        !validEnabledBinding(input.binding) ||
        input.binding.authUserId !== input.authUserId
      ) {
        return PENDING_RESULT;
      }
      const { authProofRevision, authUserId, binding, signal } = input;
      const proof = await readCurrentProof(authUserId, authProofRevision);
      if (!proof) return PENDING_RESULT;

      const prepared = await browser.preparePushSubscription({ kind: "refresh", signal });
      const subscription = readySubscription(prepared);
      if (!subscription || !proofIsCurrent(proof)) return PENDING_RESULT;

      const beforeNetwork = enabledBindingFromRuntime(await storage.readPushRuntimeState());
      if (!sameEnabledBinding(beforeNetwork, binding) || !proofIsCurrent(proof)) return PENDING_RESULT;
      const response = await transport.sendRefresh({
        accessToken: proof.accessToken,
        authUserId,
        binding,
        signal,
        subscription,
      });
      if (exactKind(response, "unauthorized")) {
        if (proofIsCurrent(proof)) await notifyUnauthorized(proof);
        return PENDING_RESULT;
      }
      const consent = committedResponse(response, binding.bindingId);
      if (!consent || !proofIsCurrent(proof)) return PENDING_RESULT;

      const afterNetwork = enabledBindingFromRuntime(await storage.readPushRuntimeState());
      if (!sameEnabledBinding(afterNetwork, binding) || !proofIsCurrent(proof)) return PENDING_RESULT;
      const committed = await storage.commitPushRefresh({
        authUserId,
        bindingId: binding.bindingId,
        deviceId: binding.deviceId,
        expectedConsent: binding.serverConsent,
        expectedLocalRevision: binding.localRevision,
        ...consent,
      });
      return validEnabledBinding(committed) &&
        committed.authUserId === authUserId &&
        committed.bindingId === binding.bindingId &&
        committed.deviceId === binding.deviceId &&
        sameConsent(committed.serverConsent, consent) &&
        proofIsCurrent(proof)
        ? COMMITTED_RESULT
        : PENDING_RESULT;
    } catch {
      return PENDING_RESULT;
    }
  }

  return Object.freeze({ enableProvisioning, refreshEnabledBinding });
}
