import { isUsableAbortSignal, settleAbortableOperation } from "./abortableOperation.ts";

const CANONICAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const POSTGRES_BIGINT_MAX = "9223372036854775807";

export const PUSH_OWNER_QUARANTINE_RPC_NAME = "quarantine_push_device";

export const PUSH_OWNER_QUARANTINE_ERROR_CODES = Object.freeze({
  INVALID_CONFIGURATION: "PUSH_OWNER_QUARANTINE_INVALID_CONFIGURATION",
  INVALID_INPUT: "PUSH_OWNER_QUARANTINE_INVALID_INPUT",
});

export class NotificationPushOwnerQuarantineError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "NotificationPushOwnerQuarantineError";
    this.code = code;
  }
}

export interface OwnerQuarantineRpcArguments {
  p_consent_epoch: string;
  p_device_id: string;
  p_expected_version: string;
}

export interface OwnerQuarantineRpcResponse {
  data?: unknown;
  error?: unknown;
}

export type PushOwnerQuarantineRpc = (
  functionName: typeof PUSH_OWNER_QUARANTINE_RPC_NAME,
  arguments_: OwnerQuarantineRpcArguments,
  signal?: AbortSignal
) => PromiseLike<OwnerQuarantineRpcResponse>;

interface PushOwnerQuarantineOptions {
  rpc: PushOwnerQuarantineRpc;
}

interface QuarantineOwnedPushDeviceInput {
  consentEpoch: string;
  consentVersion: string;
  deviceId: string;
  signal?: AbortSignal;
}

export type PushOwnerQuarantineResult = { kind: "completed" } | { kind: "pending" } | { kind: "stale" };

const COMPLETED_RESULT = Object.freeze({ kind: "completed" } as const);
const PENDING_RESULT = Object.freeze({ kind: "pending" } as const);
const STALE_RESULT = Object.freeze({ kind: "stale" } as const);

function ownerQuarantineError(code: string): NotificationPushOwnerQuarantineError {
  return new NotificationPushOwnerQuarantineError(code);
}

function isCanonicalUuid(value: unknown): value is string {
  return typeof value === "string" && CANONICAL_UUID_PATTERN.test(value);
}

function isPositivePostgresBigint(value: unknown): value is string {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/u.test(value)) return false;
  return (
    value.length < POSTGRES_BIGINT_MAX.length ||
    (value.length === POSTGRES_BIGINT_MAX.length && value <= POSTGRES_BIGINT_MAX)
  );
}

export function createNotificationPushOwnerQuarantine(options: PushOwnerQuarantineOptions) {
  const rpc = options?.rpc;
  if (typeof rpc !== "function") {
    throw ownerQuarantineError(PUSH_OWNER_QUARANTINE_ERROR_CODES.INVALID_CONFIGURATION);
  }

  async function quarantineOwnedPushDevice(input: QuarantineOwnedPushDeviceInput): Promise<PushOwnerQuarantineResult> {
    const consentEpoch = input?.consentEpoch;
    const consentVersion = input?.consentVersion;
    const deviceId = input?.deviceId;
    const signal = input?.signal;
    if (
      !isCanonicalUuid(deviceId) ||
      !isCanonicalUuid(consentEpoch) ||
      !isPositivePostgresBigint(consentVersion) ||
      (signal !== undefined && !isUsableAbortSignal(signal))
    ) {
      throw ownerQuarantineError(PUSH_OWNER_QUARANTINE_ERROR_CODES.INVALID_INPUT);
    }

    const rpcResult = await settleAbortableOperation(
      () =>
        rpc(
          PUSH_OWNER_QUARANTINE_RPC_NAME,
          {
            p_consent_epoch: consentEpoch,
            p_device_id: deviceId,
            p_expected_version: consentVersion,
          },
          signal
        ),
      signal
    );
    if (rpcResult.kind !== "completed") return PENDING_RESULT;
    const response = rpcResult.value;
    if (!response || typeof response !== "object" || response.error !== null) return PENDING_RESULT;
    if (response.data === "OK") return COMPLETED_RESULT;
    if (response.data === "STALE_PUSH_DEVICE") return STALE_RESULT;
    return PENDING_RESULT;
  }

  return Object.freeze({ quarantineOwnedPushDevice });
}
