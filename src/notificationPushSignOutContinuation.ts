import { isUsableAbortSignal, settleAbortableOperation } from "./abortableOperation.ts";

export const PUSH_SIGN_OUT_CONTINUATION_ERROR_CODES = Object.freeze({
  INVALID_CONFIGURATION: "PUSH_SIGN_OUT_CONTINUATION_INVALID_CONFIGURATION",
});

export class NotificationPushSignOutContinuationError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "NotificationPushSignOutContinuationError";
    this.code = code;
  }
}

interface PushSignOutContinuationOptions {
  readonly processPushSignOut: (input?: { readonly signal?: AbortSignal }) => PromiseLike<unknown>;
  readonly signOutCurrentDevice: () => PromiseLike<void>;
}

interface PushSignOutContinuationInput {
  readonly signal?: AbortSignal;
}

function continuationError(): NotificationPushSignOutContinuationError {
  return new NotificationPushSignOutContinuationError(PUSH_SIGN_OUT_CONTINUATION_ERROR_CODES.INVALID_CONFIGURATION);
}

function validInput(value: unknown): value is PushSignOutContinuationInput {
  try {
    if (value === undefined) return true;
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const keys = Reflect.ownKeys(value);
    if (keys.length === 0) return true;
    return (
      keys.length === 1 &&
      keys[0] === "signal" &&
      ((value as PushSignOutContinuationInput).signal === undefined ||
        isUsableAbortSignal((value as PushSignOutContinuationInput).signal))
    );
  } catch {
    return false;
  }
}

/**
 * Keep Push cleanup best effort and Auth sign-out authoritative. The caller
 * owns any deadline and supplies its signal; this dormant core creates no timer.
 */
export function createNotificationPushSignOutContinuation(options: PushSignOutContinuationOptions) {
  const processPushSignOut = options?.processPushSignOut;
  const signOutCurrentDevice = options?.signOutCurrentDevice;
  if (typeof processPushSignOut !== "function" || typeof signOutCurrentDevice !== "function") {
    throw continuationError();
  }

  let inFlight: Promise<void> | null = null;

  function processCurrentDeviceSignOut(input?: PushSignOutContinuationInput): Promise<void> {
    if (inFlight) return inFlight;
    const inputIsValid = validInput(input);
    const signal = inputIsValid ? input?.signal : undefined;

    const operation = (async () => {
      if (inputIsValid) {
        await settleAbortableOperation(() => processPushSignOut(signal ? { signal } : undefined), signal);
      }
      await signOutCurrentDevice();
    })();
    const published = operation.finally(() => {
      if (inFlight === published) inFlight = null;
    });
    inFlight = published;
    return published;
  }

  return Object.freeze({ processCurrentDeviceSignOut });
}
