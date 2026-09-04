import {
  CLEANUP_TOKEN_BYTES,
  decodeCanonicalCleanupToken,
  encodeBase64Url,
} from "../supabase/functions/_shared/push-cleanup-protocol.js";

export const PUSH_STORAGE_DATABASE_NAME = "tennis-partner-finder-push";
export const PUSH_STORAGE_DATABASE_VERSION = 1;
export const PUSH_STORAGE_STORES = Object.freeze({
  currentBinding: "current-binding",
  meta: "meta",
  pendingCleanups: "pending-cleanups",
});
export const PUSH_STORAGE_RECORD_KEYS = Object.freeze({
  currentBinding: "current",
  logicalDevice: "logical-device",
});

const SCHEMA_VERSION = 1;
const META_STORE = PUSH_STORAGE_STORES.meta;
const CURRENT_STORE = PUSH_STORAGE_STORES.currentBinding;
const PENDING_STORE = PUSH_STORAGE_STORES.pendingCleanups;
const PENDING_BINDING_INDEX = "by-binding-id";
const LOGICAL_DEVICE_KEY = PUSH_STORAGE_RECORD_KEYS.logicalDevice;
const CURRENT_BINDING_KEY = PUSH_STORAGE_RECORD_KEYS.currentBinding;
const EXPECTED_STORES = Object.freeze([CURRENT_STORE, META_STORE, PENDING_STORE]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const POSITIVE_BIGINT_PATTERN = /^[1-9][0-9]*$/u;
const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

export const PUSH_STORAGE_ERROR_CODES = Object.freeze({
  ACTIVE_BINDING_CONFLICT: "PUSH_STORAGE_ACTIVE_BINDING_CONFLICT",
  INVALID: "PUSH_STORAGE_INVALID",
  INVALID_INPUT: "PUSH_STORAGE_INVALID_INPUT",
  STALE: "PUSH_STORAGE_STALE",
  UNAVAILABLE: "PUSH_STORAGE_UNAVAILABLE",
});

const CLEANUP_REASONS = Object.freeze([
  "account_changed",
  "auth_rejected",
  "permission_revoked",
  "subscription_changed",
  "user_logout",
] as const);
const CLEANUP_REASON_SET = new Set<string>(CLEANUP_REASONS);
const AUTH_UNAVAILABLE_REASON = "auth_unavailable" as const;

type CleanupReason = (typeof CLEANUP_REASONS)[number];
export type PushSuspensionReason = CleanupReason | typeof AUTH_UNAVAILABLE_REASON;
type CurrentState = "auth-unverified" | "cleanup-required" | "enabled" | "provisioning";

interface LogicalDeviceRecord {
  deviceId: string;
  key: typeof LOGICAL_DEVICE_KEY;
  schemaVersion: typeof SCHEMA_VERSION;
}

export interface PushServerConsentIdentity {
  consentEpoch: string;
  consentId: string;
  consentVersion: string;
}

interface CurrentBindingBase {
  authUserId: string;
  bindingId: string;
  cleanupToken: string;
  deviceId: string;
  key: typeof CURRENT_BINDING_KEY;
  localRevision: string;
  schemaVersion: typeof SCHEMA_VERSION;
  serverConsent: PushServerConsentIdentity | null;
  state: CurrentState;
}

export interface PushProvisioningBinding extends CurrentBindingBase {
  serverConsent: null;
  state: "provisioning";
}

interface EnabledBinding extends CurrentBindingBase {
  serverConsent: PushServerConsentIdentity;
  state: "enabled";
}

interface AuthUnverifiedBinding extends CurrentBindingBase {
  reason: typeof AUTH_UNAVAILABLE_REASON;
  state: "auth-unverified";
}

interface CleanupRequiredBinding extends CurrentBindingBase {
  reason: CleanupReason;
  state: "cleanup-required";
}

type SuspendedBinding = AuthUnverifiedBinding | CleanupRequiredBinding;
type CurrentBinding = EnabledBinding | PushProvisioningBinding | SuspendedBinding;

export interface PendingPushCleanupAttempt {
  attemptId: string;
  authUserId: string;
  bindingId: string;
  bindingRevision: string;
  cleanupToken: string;
  deviceId: string;
  reason: CleanupReason;
  schemaVersion: typeof SCHEMA_VERSION;
  serverConsent: PushServerConsentIdentity | null;
}

export interface BeginPushProvisioningInput {
  authUserId: string;
  deviceId: string;
  expectedCurrentRevision: string | null;
}

export interface BeginPushReenableInput {
  authUserId: string;
  bindingId: string;
  expectedLocalRevision: string;
}

export interface CancelPushProvisioningInput {
  authUserId: string;
  bindingId: string;
  expectedLocalRevision: string;
}

export interface CommitPushProvisioningInput extends PushServerConsentIdentity {
  authUserId: string;
  bindingId: string;
  deviceId: string;
  expectedLocalRevision: string;
}

export interface CommitPushRefreshInput extends PushServerConsentIdentity {
  authUserId: string;
  bindingId: string;
  deviceId: string;
  expectedConsent: PushServerConsentIdentity;
  expectedLocalRevision: string;
}

export interface SuspendCurrentPushBindingInput {
  authUserId: string;
  bindingId: string;
  expectedLocalRevision: string;
  reason: PushSuspensionReason;
}

export interface QueueRequiredPushCleanupInput {
  authUserId: string;
  bindingId: string;
  expectedLocalRevision: string;
  reason: CleanupReason;
}

type WithoutStoredSecrets<Binding> = Binding extends CurrentBinding
  ? Omit<Binding, "cleanupToken" | "key" | "schemaVersion">
  : never;
type SafeAuthUnverifiedBinding = WithoutStoredSecrets<AuthUnverifiedBinding>;
type SafeCleanupRequiredBinding = WithoutStoredSecrets<CleanupRequiredBinding>;
type SafeEnabledBinding = WithoutStoredSecrets<EnabledBinding>;
type SafeProvisioningBinding = WithoutStoredSecrets<PushProvisioningBinding>;
type SafeCurrentBinding =
  SafeAuthUnverifiedBinding | SafeCleanupRequiredBinding | SafeEnabledBinding | SafeProvisioningBinding;

type PushBindingRuntimeState =
  | { binding: SafeAuthUnverifiedBinding; deviceId: string; kind: "auth-unverified" }
  | { binding: SafeCleanupRequiredBinding; deviceId: string; kind: "cleanup-required" }
  | { binding: SafeEnabledBinding; deviceId: string; kind: "enabled" }
  | { binding: SafeProvisioningBinding; deviceId: string; kind: "provisioning" };

export type PushRuntimeState =
  | { deviceId: null; kind: "disabled" }
  | { deviceId: string; kind: "disabled" }
  | { deviceId: string; kind: "cleanup-pending"; pendingCount: 1 }
  | PushBindingRuntimeState
  | { kind: "invalid" }
  | { kind: "unavailable" };

export class NotificationPushStorageError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "NotificationPushStorageError";
    this.code = code;
  }
}

type PushStorageCrypto = Pick<Crypto, "getRandomValues" | "randomUUID">;

interface NotificationPushStorageOptions {
  cryptoRef?: PushStorageCrypto;
  indexedDb?: IDBFactory;
}

function storageError(code: string): NotificationPushStorageError {
  return new NotificationPushStorageError(code);
}

function normalizeStorageError(error: unknown): NotificationPushStorageError {
  return error instanceof NotificationPushStorageError ? error : storageError(PUSH_STORAGE_ERROR_CODES.UNAVAILABLE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: unknown, expectedKeys: string[]): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  return (
    actualKeys.length === sortedExpectedKeys.length &&
    actualKeys.every((key, index) => key === sortedExpectedKeys[index])
  );
}

function isCanonicalUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isCanonicalUuidV4(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

function isCanonicalPostgresBigint(value: unknown): value is string {
  if (typeof value !== "string" || !POSITIVE_BIGINT_PATTERN.test(value)) return false;
  try {
    return BigInt(value) <= MAX_POSTGRES_BIGINT;
  } catch {
    return false;
  }
}

function isCleanupToken(value: unknown): value is string {
  const bytes = decodeCanonicalCleanupToken(value);
  if (!bytes) return false;
  bytes.fill(0);
  return true;
}

function isServerConsent(value: unknown): value is PushServerConsentIdentity {
  return (
    hasExactKeys(value, ["consentEpoch", "consentId", "consentVersion"]) &&
    isCanonicalUuid(value.consentEpoch) &&
    isCanonicalPostgresBigint(value.consentId) &&
    isCanonicalPostgresBigint(value.consentVersion)
  );
}

function isLogicalDeviceRecord(value: unknown): value is LogicalDeviceRecord {
  return (
    hasExactKeys(value, ["deviceId", "key", "schemaVersion"]) &&
    value.key === LOGICAL_DEVICE_KEY &&
    value.schemaVersion === SCHEMA_VERSION &&
    isCanonicalUuidV4(value.deviceId)
  );
}

const CURRENT_BASE_KEYS = [
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

function hasValidCurrentBase(value: Record<string, unknown>): boolean {
  return (
    value.key === CURRENT_BINDING_KEY &&
    value.schemaVersion === SCHEMA_VERSION &&
    isCanonicalUuid(value.authUserId) &&
    isCanonicalUuidV4(value.bindingId) &&
    isCleanupToken(value.cleanupToken) &&
    isCanonicalUuid(value.deviceId) &&
    isCanonicalUuidV4(value.localRevision)
  );
}

function isCurrentBinding(value: unknown): value is CurrentBinding {
  if (!isRecord(value) || !hasValidCurrentBase(value)) return false;

  if (value.state === "provisioning") {
    return hasExactKeys(value, CURRENT_BASE_KEYS) && value.serverConsent === null;
  }
  if (value.state === "enabled") {
    return hasExactKeys(value, CURRENT_BASE_KEYS) && isServerConsent(value.serverConsent);
  }
  if (value.state === "auth-unverified") {
    return (
      hasExactKeys(value, [...CURRENT_BASE_KEYS, "reason"]) &&
      value.reason === AUTH_UNAVAILABLE_REASON &&
      (value.serverConsent === null || isServerConsent(value.serverConsent))
    );
  }
  if (value.state === "cleanup-required") {
    return (
      hasExactKeys(value, [...CURRENT_BASE_KEYS, "reason"]) &&
      typeof value.reason === "string" &&
      CLEANUP_REASON_SET.has(value.reason) &&
      (value.serverConsent === null || isServerConsent(value.serverConsent))
    );
  }
  return false;
}

function isPendingCleanupAttempt(value: unknown): value is PendingPushCleanupAttempt {
  return (
    hasExactKeys(value, [
      "attemptId",
      "authUserId",
      "bindingId",
      "bindingRevision",
      "cleanupToken",
      "deviceId",
      "reason",
      "schemaVersion",
      "serverConsent",
    ]) &&
    value.schemaVersion === SCHEMA_VERSION &&
    isCanonicalUuidV4(value.attemptId) &&
    isCanonicalUuid(value.authUserId) &&
    isCanonicalUuidV4(value.bindingId) &&
    isCanonicalUuidV4(value.bindingRevision) &&
    isCleanupToken(value.cleanupToken) &&
    isCanonicalUuid(value.deviceId) &&
    typeof value.reason === "string" &&
    CLEANUP_REASON_SET.has(value.reason) &&
    (value.serverConsent === null || isServerConsent(value.serverConsent))
  );
}

function sameServerConsent(left: PushServerConsentIdentity | null, right: PushServerConsentIdentity | null): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.consentEpoch === right.consentEpoch &&
    left.consentId === right.consentId &&
    left.consentVersion === right.consentVersion
  );
}

function sameAttempt(left: PendingPushCleanupAttempt, right: PendingPushCleanupAttempt): boolean {
  return (
    left.attemptId === right.attemptId &&
    left.authUserId === right.authUserId &&
    left.bindingId === right.bindingId &&
    left.bindingRevision === right.bindingRevision &&
    left.cleanupToken === right.cleanupToken &&
    left.deviceId === right.deviceId &&
    left.reason === right.reason &&
    left.schemaVersion === right.schemaVersion &&
    sameServerConsent(left.serverConsent, right.serverConsent)
  );
}

function randomUuid(cryptoRef: PushStorageCrypto): string {
  try {
    const value = cryptoRef.randomUUID();
    if (!isCanonicalUuidV4(value)) throw storageError(PUSH_STORAGE_ERROR_CODES.UNAVAILABLE);
    return value;
  } catch (error) {
    throw normalizeStorageError(error);
  }
}

function randomCleanupToken(cryptoRef: PushStorageCrypto): string {
  const bytes = new Uint8Array(CLEANUP_TOKEN_BYTES);
  try {
    cryptoRef.getRandomValues(bytes);
    return encodeBase64Url(bytes);
  } catch (error) {
    throw normalizeStorageError(error);
  } finally {
    bytes.fill(0);
  }
}

function requestValue<Result>(request: IDBRequest<Result>): Promise<Result> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? storageError(PUSH_STORAGE_ERROR_CODES.UNAVAILABLE));
  });
}

function transactionCompletion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? storageError(PUSH_STORAGE_ERROR_CODES.UNAVAILABLE));
    transaction.onerror = () => undefined;
  });
}

function validateDatabaseSchema(database: IDBDatabase): void {
  const stores = Array.from(database.objectStoreNames).sort();
  if (database.version !== PUSH_STORAGE_DATABASE_VERSION || stores.join("\0") !== EXPECTED_STORES.join("\0")) {
    throw storageError(PUSH_STORAGE_ERROR_CODES.INVALID);
  }

  const transaction = database.transaction(EXPECTED_STORES, "readonly");
  const meta = transaction.objectStore(META_STORE);
  const current = transaction.objectStore(CURRENT_STORE);
  const pending = transaction.objectStore(PENDING_STORE);
  const pendingIndexes = Array.from(pending.indexNames);
  if (
    meta.keyPath !== "key" ||
    meta.autoIncrement ||
    meta.indexNames.length !== 0 ||
    current.keyPath !== "key" ||
    current.autoIncrement ||
    current.indexNames.length !== 0 ||
    pending.keyPath !== "attemptId" ||
    pending.autoIncrement ||
    pendingIndexes.length !== 1 ||
    pendingIndexes[0] !== PENDING_BINDING_INDEX
  ) {
    throw storageError(PUSH_STORAGE_ERROR_CODES.INVALID);
  }
  const bindingIndex = pending.index(PENDING_BINDING_INDEX);
  if (bindingIndex.keyPath !== "bindingId" || !bindingIndex.unique || bindingIndex.multiEntry) {
    throw storageError(PUSH_STORAGE_ERROR_CODES.INVALID);
  }
}

function openDatabase(indexedDb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(normalizeStorageError(error));
    };

    let request: IDBOpenDBRequest;
    try {
      request = indexedDb.open(PUSH_STORAGE_DATABASE_NAME, PUSH_STORAGE_DATABASE_VERSION);
    } catch (error) {
      fail(error);
      return;
    }

    request.onblocked = () => fail(storageError(PUSH_STORAGE_ERROR_CODES.UNAVAILABLE));
    request.onerror = () => fail(request.error);
    request.onupgradeneeded = (event) => {
      if (event.oldVersion !== 0) {
        request.transaction?.abort();
        return;
      }
      const database = request.result;
      database.createObjectStore(META_STORE, { keyPath: "key" });
      database.createObjectStore(CURRENT_STORE, { keyPath: "key" });
      const pending = database.createObjectStore(PENDING_STORE, { keyPath: "attemptId" });
      pending.createIndex(PENDING_BINDING_INDEX, "bindingId", { unique: true });
    };
    request.onsuccess = () => {
      const database = request.result;
      if (settled) {
        database.close();
        return;
      }
      try {
        validateDatabaseSchema(database);
        database.onversionchange = () => database.close();
        settled = true;
        resolve(database);
      } catch (error) {
        database.close();
        fail(error);
      }
    };
  });
}

interface RawStoredState {
  attempts: unknown;
  bindings: unknown;
  devices: unknown;
}

interface StoredState {
  attempts: PendingPushCleanupAttempt[];
  binding: CurrentBinding | undefined;
  device: LogicalDeviceRecord | undefined;
}

async function loadStoredState(transaction: IDBTransaction): Promise<StoredState> {
  const devicesPromise: Promise<unknown> = requestValue(transaction.objectStore(META_STORE).getAll());
  const bindingsPromise: Promise<unknown> = requestValue(transaction.objectStore(CURRENT_STORE).getAll());
  const attemptsPromise: Promise<unknown> = requestValue(transaction.objectStore(PENDING_STORE).getAll());
  const [devices, bindings, attempts] = await Promise.all([devicesPromise, bindingsPromise, attemptsPromise]);
  return validateStoredState({ attempts, bindings, devices });
}

function validateStoredState({ attempts, bindings, devices }: RawStoredState): StoredState {
  if (!Array.isArray(devices) || !Array.isArray(bindings) || !Array.isArray(attempts)) {
    throw storageError(PUSH_STORAGE_ERROR_CODES.INVALID);
  }
  if (devices.length > 1 || bindings.length > 1 || attempts.length > 1) {
    throw storageError(PUSH_STORAGE_ERROR_CODES.INVALID);
  }

  const device: unknown = devices[0];
  const binding: unknown = bindings[0];
  if (device !== undefined && !isLogicalDeviceRecord(device)) throw storageError(PUSH_STORAGE_ERROR_CODES.INVALID);
  if (binding !== undefined && !isCurrentBinding(binding)) throw storageError(PUSH_STORAGE_ERROR_CODES.INVALID);
  if (!attempts.every(isPendingCleanupAttempt)) {
    throw storageError(PUSH_STORAGE_ERROR_CODES.INVALID);
  }
  if (!device) {
    if (binding || attempts.length > 0) throw storageError(PUSH_STORAGE_ERROR_CODES.INVALID);
    return { attempts, binding: undefined, device: undefined };
  }
  if (binding && binding.deviceId !== device.deviceId) throw storageError(PUSH_STORAGE_ERROR_CODES.INVALID);
  if (attempts.some((attempt) => attempt.deviceId !== device.deviceId)) {
    throw storageError(PUSH_STORAGE_ERROR_CODES.INVALID);
  }
  if (binding && attempts.length > 0) throw storageError(PUSH_STORAGE_ERROR_CODES.INVALID);
  return { attempts, binding, device };
}

async function withTransaction<Result>(
  indexedDb: IDBFactory,
  mode: IDBTransactionMode,
  task: (transaction: IDBTransaction) => Promise<Result>
): Promise<Result> {
  const database = await openDatabase(indexedDb);
  try {
    const transaction = database.transaction(EXPECTED_STORES, mode);
    const completion = transactionCompletion(transaction);
    try {
      const result = await task(transaction);
      await completion;
      return result;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already be committed or aborted.
      }
      try {
        await completion;
      } catch {
        // Preserve the first, privacy-safe error below.
      }
      throw normalizeStorageError(error);
    }
  } catch (error) {
    throw normalizeStorageError(error);
  } finally {
    database.close();
  }
}

function requireValidInput(condition: boolean): void {
  if (!condition) throw storageError(PUSH_STORAGE_ERROR_CODES.INVALID_INPUT);
}

function requireExpectedBinding(
  binding: CurrentBinding | undefined,
  identity: { authUserId: string; bindingId: string; expectedLocalRevision: string }
): CurrentBinding {
  if (
    !binding ||
    binding.authUserId !== identity.authUserId ||
    binding.bindingId !== identity.bindingId ||
    binding.localRevision !== identity.expectedLocalRevision
  ) {
    throw storageError(PUSH_STORAGE_ERROR_CODES.STALE);
  }
  return binding;
}

function safeBinding(binding: AuthUnverifiedBinding): SafeAuthUnverifiedBinding;
function safeBinding(binding: CleanupRequiredBinding): SafeCleanupRequiredBinding;
function safeBinding(binding: EnabledBinding): SafeEnabledBinding;
function safeBinding(binding: PushProvisioningBinding): SafeProvisioningBinding;
function safeBinding(binding: CurrentBinding): SafeCurrentBinding;
function safeBinding(binding: CurrentBinding): SafeCurrentBinding {
  if (binding.state === "auth-unverified") {
    return {
      authUserId: binding.authUserId,
      bindingId: binding.bindingId,
      deviceId: binding.deviceId,
      localRevision: binding.localRevision,
      reason: binding.reason,
      serverConsent: binding.serverConsent,
      state: "auth-unverified",
    };
  }
  if (binding.state === "cleanup-required") {
    return {
      authUserId: binding.authUserId,
      bindingId: binding.bindingId,
      deviceId: binding.deviceId,
      localRevision: binding.localRevision,
      reason: binding.reason,
      serverConsent: binding.serverConsent,
      state: "cleanup-required",
    };
  }
  if (binding.state === "enabled") {
    return {
      authUserId: binding.authUserId,
      bindingId: binding.bindingId,
      deviceId: binding.deviceId,
      localRevision: binding.localRevision,
      serverConsent: binding.serverConsent,
      state: "enabled",
    };
  }
  return {
    authUserId: binding.authUserId,
    bindingId: binding.bindingId,
    deviceId: binding.deviceId,
    localRevision: binding.localRevision,
    serverConsent: null,
    state: "provisioning",
  };
}

function bindingRuntimeState(binding: CurrentBinding, deviceId: string): PushBindingRuntimeState {
  if (binding.state === "auth-unverified") {
    return { binding: safeBinding(binding), deviceId, kind: "auth-unverified" };
  }
  if (binding.state === "cleanup-required") {
    return { binding: safeBinding(binding), deviceId, kind: "cleanup-required" };
  }
  if (binding.state === "enabled") {
    return { binding: safeBinding(binding), deviceId, kind: "enabled" };
  }
  return { binding: safeBinding(binding), deviceId, kind: "provisioning" };
}

export function createNotificationPushStorage({
  cryptoRef = globalThis.crypto,
  indexedDb = globalThis.indexedDB,
}: NotificationPushStorageOptions = {}) {
  function requireDependencies(): { cryptoRef: PushStorageCrypto; indexedDb: IDBFactory } {
    if (!cryptoRef || !indexedDb) throw storageError(PUSH_STORAGE_ERROR_CODES.UNAVAILABLE);
    return { cryptoRef, indexedDb };
  }

  async function getOrCreateLogicalDeviceId(): Promise<string> {
    const dependencies = requireDependencies();
    return withTransaction(dependencies.indexedDb, "readwrite", async (transaction) => {
      const state = await loadStoredState(transaction);
      if (state.device) return state.device.deviceId;

      const record: LogicalDeviceRecord = {
        deviceId: randomUuid(dependencies.cryptoRef),
        key: LOGICAL_DEVICE_KEY,
        schemaVersion: SCHEMA_VERSION,
      };
      await requestValue(transaction.objectStore(META_STORE).add(record));
      return record.deviceId;
    });
  }

  async function readPushRuntimeState(): Promise<PushRuntimeState> {
    let dependencies;
    try {
      dependencies = requireDependencies();
      return await withTransaction(dependencies.indexedDb, "readonly", async (transaction) => {
        const state = await loadStoredState(transaction);
        if (!state.device) return { deviceId: null, kind: "disabled" };
        if (state.binding) {
          return bindingRuntimeState(state.binding, state.device.deviceId);
        }
        if (state.attempts.length === 1) {
          return { deviceId: state.device.deviceId, kind: "cleanup-pending", pendingCount: 1 };
        }
        return { deviceId: state.device.deviceId, kind: "disabled" };
      });
    } catch (error) {
      const normalized = normalizeStorageError(error);
      return {
        kind: normalized.code === PUSH_STORAGE_ERROR_CODES.INVALID ? "invalid" : "unavailable",
      };
    }
  }

  async function beginExplicitPushProvisioning(input: BeginPushProvisioningInput): Promise<PushProvisioningBinding> {
    requireValidInput(
      hasExactKeys(input, ["authUserId", "deviceId", "expectedCurrentRevision"]) &&
        isCanonicalUuid(input.authUserId) &&
        isCanonicalUuid(input.deviceId) &&
        (input.expectedCurrentRevision === null || isCanonicalUuid(input.expectedCurrentRevision))
    );
    const dependencies = requireDependencies();
    return withTransaction(dependencies.indexedDb, "readwrite", async (transaction) => {
      const state = await loadStoredState(transaction);
      if (!state.device || state.device.deviceId !== input.deviceId) {
        throw storageError(PUSH_STORAGE_ERROR_CODES.STALE);
      }
      if (state.attempts.length > 0) throw storageError(PUSH_STORAGE_ERROR_CODES.ACTIVE_BINDING_CONFLICT);
      if (state.binding) {
        if (
          state.binding.state === "provisioning" &&
          state.binding.authUserId === input.authUserId &&
          state.binding.deviceId === input.deviceId &&
          (input.expectedCurrentRevision === null || input.expectedCurrentRevision === state.binding.localRevision)
        ) {
          return state.binding;
        }
        throw storageError(PUSH_STORAGE_ERROR_CODES.ACTIVE_BINDING_CONFLICT);
      }
      if (input.expectedCurrentRevision !== null) throw storageError(PUSH_STORAGE_ERROR_CODES.STALE);

      const binding: PushProvisioningBinding = {
        authUserId: input.authUserId,
        bindingId: randomUuid(dependencies.cryptoRef),
        cleanupToken: randomCleanupToken(dependencies.cryptoRef),
        deviceId: input.deviceId,
        key: CURRENT_BINDING_KEY,
        localRevision: randomUuid(dependencies.cryptoRef),
        schemaVersion: SCHEMA_VERSION,
        serverConsent: null,
        state: "provisioning",
      };
      await requestValue(transaction.objectStore(CURRENT_STORE).add(binding));
      return binding;
    });
  }

  async function beginExplicitPushReenable(input: BeginPushReenableInput): Promise<PendingPushCleanupAttempt> {
    requireValidInput(
      hasExactKeys(input, ["authUserId", "bindingId", "expectedLocalRevision"]) &&
        isCanonicalUuid(input.authUserId) &&
        isCanonicalUuid(input.bindingId) &&
        isCanonicalUuid(input.expectedLocalRevision)
    );
    const dependencies = requireDependencies();
    return withTransaction(dependencies.indexedDb, "readwrite", async (transaction) => {
      const state = await loadStoredState(transaction);
      const existingAttempt = state.attempts[0];
      if (existingAttempt) {
        if (
          existingAttempt.authUserId === input.authUserId &&
          existingAttempt.bindingId === input.bindingId &&
          existingAttempt.bindingRevision === input.expectedLocalRevision &&
          existingAttempt.reason === "subscription_changed"
        ) {
          return existingAttempt;
        }
        throw storageError(PUSH_STORAGE_ERROR_CODES.STALE);
      }

      const binding = requireExpectedBinding(state.binding, input);
      if (binding.state !== "auth-unverified" || binding.reason !== AUTH_UNAVAILABLE_REASON) {
        throw storageError(PUSH_STORAGE_ERROR_CODES.STALE);
      }

      const attempt: PendingPushCleanupAttempt = {
        attemptId: randomUuid(dependencies.cryptoRef),
        authUserId: binding.authUserId,
        bindingId: binding.bindingId,
        bindingRevision: binding.localRevision,
        cleanupToken: binding.cleanupToken,
        deviceId: binding.deviceId,
        reason: "subscription_changed",
        schemaVersion: SCHEMA_VERSION,
        serverConsent: binding.serverConsent,
      };
      const currentStore = transaction.objectStore(CURRENT_STORE);
      const pendingStore = transaction.objectStore(PENDING_STORE);
      await requestValue(currentStore.delete(CURRENT_BINDING_KEY));
      await requestValue(pendingStore.add(attempt));
      return attempt;
    });
  }

  async function readPushProvisioning(authUserId: string): Promise<PushProvisioningBinding | null> {
    requireValidInput(isCanonicalUuid(authUserId));
    const dependencies = requireDependencies();
    return withTransaction(dependencies.indexedDb, "readonly", async (transaction) => {
      const state = await loadStoredState(transaction);
      return state.binding?.state === "provisioning" && state.binding.authUserId === authUserId ? state.binding : null;
    });
  }

  async function cancelExplicitPushProvisioning(input: CancelPushProvisioningInput): Promise<void> {
    requireValidInput(
      hasExactKeys(input, ["authUserId", "bindingId", "expectedLocalRevision"]) &&
        isCanonicalUuid(input.authUserId) &&
        isCanonicalUuid(input.bindingId) &&
        isCanonicalUuid(input.expectedLocalRevision)
    );
    const dependencies = requireDependencies();
    return withTransaction(dependencies.indexedDb, "readwrite", async (transaction) => {
      const state = await loadStoredState(transaction);
      const binding = requireExpectedBinding(state.binding, input);
      if (binding.state !== "provisioning") throw storageError(PUSH_STORAGE_ERROR_CODES.STALE);
      await requestValue(transaction.objectStore(CURRENT_STORE).delete(CURRENT_BINDING_KEY));
    });
  }

  async function commitPushProvisioning(input: CommitPushProvisioningInput): Promise<SafeCurrentBinding> {
    requireValidInput(
      hasExactKeys(input, [
        "authUserId",
        "bindingId",
        "consentEpoch",
        "consentId",
        "consentVersion",
        "deviceId",
        "expectedLocalRevision",
      ]) &&
        isCanonicalUuid(input.authUserId) &&
        isCanonicalUuid(input.bindingId) &&
        isCanonicalUuid(input.deviceId) &&
        isCanonicalUuid(input.expectedLocalRevision) &&
        isServerConsent({
          consentEpoch: input.consentEpoch,
          consentId: input.consentId,
          consentVersion: input.consentVersion,
        })
    );
    const dependencies = requireDependencies();
    return withTransaction(dependencies.indexedDb, "readwrite", async (transaction) => {
      const state = await loadStoredState(transaction);
      const serverConsent = {
        consentEpoch: input.consentEpoch,
        consentId: input.consentId,
        consentVersion: input.consentVersion,
      };
      if (
        state.binding?.state === "enabled" &&
        state.binding.authUserId === input.authUserId &&
        state.binding.bindingId === input.bindingId &&
        state.binding.deviceId === input.deviceId &&
        sameServerConsent(state.binding.serverConsent, serverConsent)
      ) {
        return safeBinding(state.binding);
      }
      const binding = requireExpectedBinding(state.binding, input);
      if (binding.state !== "provisioning" || binding.deviceId !== input.deviceId) {
        throw storageError(PUSH_STORAGE_ERROR_CODES.STALE);
      }

      const enabled: EnabledBinding = {
        ...binding,
        localRevision: randomUuid(dependencies.cryptoRef),
        serverConsent,
        state: "enabled",
      };
      await requestValue(transaction.objectStore(CURRENT_STORE).put(enabled));
      return safeBinding(enabled);
    });
  }

  async function commitPushRefresh(input: CommitPushRefreshInput): Promise<SafeEnabledBinding> {
    requireValidInput(
      hasExactKeys(input, [
        "authUserId",
        "bindingId",
        "consentEpoch",
        "consentId",
        "consentVersion",
        "deviceId",
        "expectedConsent",
        "expectedLocalRevision",
      ]) &&
        isCanonicalUuid(input.authUserId) &&
        isCanonicalUuid(input.bindingId) &&
        isCanonicalUuid(input.deviceId) &&
        isCanonicalUuid(input.expectedLocalRevision) &&
        isServerConsent(input.expectedConsent) &&
        isServerConsent({
          consentEpoch: input.consentEpoch,
          consentId: input.consentId,
          consentVersion: input.consentVersion,
        }) &&
        input.consentEpoch === input.expectedConsent.consentEpoch &&
        input.consentId === input.expectedConsent.consentId &&
        (input.consentVersion === input.expectedConsent.consentVersion ||
          BigInt(input.consentVersion) === BigInt(input.expectedConsent.consentVersion) + 1n)
    );
    const dependencies = requireDependencies();
    return withTransaction(dependencies.indexedDb, "readwrite", async (transaction) => {
      const state = await loadStoredState(transaction);
      const serverConsent = {
        consentEpoch: input.consentEpoch,
        consentId: input.consentId,
        consentVersion: input.consentVersion,
      };
      if (
        state.binding?.state === "enabled" &&
        state.binding.authUserId === input.authUserId &&
        state.binding.bindingId === input.bindingId &&
        state.binding.deviceId === input.deviceId &&
        sameServerConsent(state.binding.serverConsent, serverConsent)
      ) {
        return safeBinding(state.binding);
      }
      const binding = requireExpectedBinding(state.binding, input);
      if (
        binding.state !== "enabled" ||
        binding.deviceId !== input.deviceId ||
        !sameServerConsent(binding.serverConsent, input.expectedConsent)
      ) {
        throw storageError(PUSH_STORAGE_ERROR_CODES.STALE);
      }
      if (sameServerConsent(binding.serverConsent, serverConsent)) return safeBinding(binding);

      const enabled: EnabledBinding = {
        ...binding,
        localRevision: randomUuid(dependencies.cryptoRef),
        serverConsent,
      };
      await requestValue(transaction.objectStore(CURRENT_STORE).put(enabled));
      return safeBinding(enabled);
    });
  }

  async function commitLocalSuspension(input: SuspendCurrentPushBindingInput): Promise<SuspendedBinding> {
    requireValidInput(
      hasExactKeys(input, ["authUserId", "bindingId", "expectedLocalRevision", "reason"]) &&
        isCanonicalUuid(input.authUserId) &&
        isCanonicalUuid(input.bindingId) &&
        isCanonicalUuid(input.expectedLocalRevision) &&
        (input.reason === AUTH_UNAVAILABLE_REASON || CLEANUP_REASON_SET.has(input.reason))
    );
    const dependencies = requireDependencies();
    return withTransaction(dependencies.indexedDb, "readwrite", async (transaction) => {
      const state = await loadStoredState(transaction);
      const binding = requireExpectedBinding(state.binding, input);
      if (binding.state === "cleanup-required") {
        return binding;
      }
      if (binding.state === "auth-unverified" && input.reason === AUTH_UNAVAILABLE_REASON) return binding;
      if (!["provisioning", "enabled", "auth-unverified"].includes(binding.state)) {
        throw storageError(PUSH_STORAGE_ERROR_CODES.STALE);
      }

      const localRevision = randomUuid(dependencies.cryptoRef);
      const suspended: SuspendedBinding =
        input.reason === AUTH_UNAVAILABLE_REASON
          ? {
              ...binding,
              localRevision,
              reason: AUTH_UNAVAILABLE_REASON,
              state: "auth-unverified",
            }
          : {
              ...binding,
              localRevision,
              reason: input.reason,
              state: "cleanup-required",
            };
      await requestValue(transaction.objectStore(CURRENT_STORE).put(suspended));
      return suspended;
    });
  }

  async function queueRequiredPushCleanup(input: QueueRequiredPushCleanupInput): Promise<PendingPushCleanupAttempt> {
    requireValidInput(
      hasExactKeys(input, ["authUserId", "bindingId", "expectedLocalRevision", "reason"]) &&
        isCanonicalUuid(input.authUserId) &&
        isCanonicalUuid(input.bindingId) &&
        isCanonicalUuid(input.expectedLocalRevision) &&
        CLEANUP_REASON_SET.has(input.reason)
    );
    const dependencies = requireDependencies();
    return withTransaction(dependencies.indexedDb, "readwrite", async (transaction) => {
      const state = await loadStoredState(transaction);
      const binding = requireExpectedBinding(state.binding, input);
      if (binding.state !== "cleanup-required" || binding.reason !== input.reason) {
        throw storageError(PUSH_STORAGE_ERROR_CODES.STALE);
      }

      const attempt: PendingPushCleanupAttempt = {
        attemptId: randomUuid(dependencies.cryptoRef),
        authUserId: binding.authUserId,
        bindingId: binding.bindingId,
        bindingRevision: binding.localRevision,
        cleanupToken: binding.cleanupToken,
        deviceId: binding.deviceId,
        reason: input.reason,
        schemaVersion: SCHEMA_VERSION,
        serverConsent: binding.serverConsent,
      };
      const currentStore = transaction.objectStore(CURRENT_STORE);
      const pendingStore = transaction.objectStore(PENDING_STORE);
      await requestValue(currentStore.delete(CURRENT_BINDING_KEY));
      await requestValue(pendingStore.add(attempt));
      return attempt;
    });
  }

  async function suspendCurrentPushBinding(
    input: SuspendCurrentPushBindingInput
  ): Promise<{ attempt: PendingPushCleanupAttempt | null; state: SafeCurrentBinding }> {
    const suspended = await commitLocalSuspension(input);
    if (suspended.state !== "cleanup-required") {
      return { attempt: null, state: safeBinding(suspended) };
    }
    const attempt = await queueRequiredPushCleanup({
      authUserId: suspended.authUserId,
      bindingId: suspended.bindingId,
      expectedLocalRevision: suspended.localRevision,
      reason: suspended.reason,
    });
    return { attempt, state: safeBinding(suspended) };
  }

  async function listPendingPushCleanups(): Promise<PendingPushCleanupAttempt[]> {
    const dependencies = requireDependencies();
    return withTransaction(dependencies.indexedDb, "readonly", async (transaction) => {
      const state = await loadStoredState(transaction);
      return [...state.attempts].sort((left, right) => left.attemptId.localeCompare(right.attemptId));
    });
  }

  async function completePendingPushCleanup(attempt: PendingPushCleanupAttempt): Promise<boolean> {
    requireValidInput(isPendingCleanupAttempt(attempt));
    const dependencies = requireDependencies();
    return withTransaction(dependencies.indexedDb, "readwrite", async (transaction) => {
      const state = await loadStoredState(transaction);
      const stored = state.attempts.find((candidate) => candidate.attemptId === attempt.attemptId);
      if (!stored) return false;
      if (!sameAttempt(stored, attempt)) throw storageError(PUSH_STORAGE_ERROR_CODES.STALE);
      await requestValue(transaction.objectStore(PENDING_STORE).delete(attempt.attemptId));
      return true;
    });
  }

  return Object.freeze({
    beginExplicitPushProvisioning,
    beginExplicitPushReenable,
    cancelExplicitPushProvisioning,
    commitPushProvisioning,
    commitPushRefresh,
    completePendingPushCleanup,
    getOrCreateLogicalDeviceId,
    listPendingPushCleanups,
    queueRequiredPushCleanup,
    readPushProvisioning,
    readPushRuntimeState,
    suspendCurrentPushBinding,
  });
}
