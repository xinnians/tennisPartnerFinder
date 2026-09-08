import { isUsableAbortSignal } from "./abortableOperation.ts";
import {
  PUSH_OWNER_QUARANTINE_RPC_NAME,
  type OwnerQuarantineRpcArguments,
  type OwnerQuarantineRpcResponse,
  type PushOwnerQuarantineRpc,
} from "./notificationPushOwnerQuarantine.ts";

export const PUSH_OWNER_QUARANTINE_RPC_ADAPTER_ERROR_CODES = Object.freeze({
  INVALID_CONFIGURATION: "PUSH_OWNER_QUARANTINE_RPC_ADAPTER_INVALID_CONFIGURATION",
});

export class NotificationPushOwnerQuarantineRpcAdapterError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "NotificationPushOwnerQuarantineRpcAdapterError";
    this.code = code;
  }
}

interface PostgrestRpcBuilderLike extends PromiseLike<OwnerQuarantineRpcResponse> {
  abortSignal(signal: AbortSignal): PromiseLike<OwnerQuarantineRpcResponse>;
}

interface OwnerQuarantineClientLike {
  rpc(functionName: typeof PUSH_OWNER_QUARANTINE_RPC_NAME, arguments_: OwnerQuarantineRpcArguments): unknown;
}

interface OwnerQuarantineRpcAdapterOptions {
  readonly client: unknown;
}

function adapterError(): NotificationPushOwnerQuarantineRpcAdapterError {
  return new NotificationPushOwnerQuarantineRpcAdapterError(
    PUSH_OWNER_QUARANTINE_RPC_ADAPTER_ERROR_CODES.INVALID_CONFIGURATION
  );
}

function isBuilder(value: unknown): value is PostgrestRpcBuilderLike {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { abortSignal?: unknown }).abortSignal === "function" &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

/** Keep Supabase/PostgREST details behind the exact owner-quarantine RPC port. */
export function createNotificationPushOwnerQuarantineRpc(
  options: OwnerQuarantineRpcAdapterOptions
): PushOwnerQuarantineRpc {
  const client = options?.client;
  if (
    !client ||
    typeof client !== "object" ||
    Array.isArray(client) ||
    typeof (client as { rpc?: unknown }).rpc !== "function"
  ) {
    throw adapterError();
  }
  const exactClient = client as OwnerQuarantineClientLike;

  return (functionName, arguments_, signal) => {
    if (functionName !== PUSH_OWNER_QUARANTINE_RPC_NAME || (signal !== undefined && !isUsableAbortSignal(signal))) {
      throw adapterError();
    }
    const builder = exactClient.rpc(functionName, arguments_);
    if (!isBuilder(builder)) throw adapterError();
    return signal ? builder.abortSignal(signal) : builder;
  };
}
