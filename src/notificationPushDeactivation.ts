export const PUSH_DEACTIVATION_ERROR_CODES = Object.freeze({
  INVALID_CONFIGURATION: "PUSH_DEACTIVATION_INVALID_CONFIGURATION",
});

export class NotificationPushDeactivationError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "NotificationPushDeactivationError";
    this.code = code;
  }
}

export interface BrowserPushSubscriptionHandle {
  readonly endpoint: string;
  unsubscribe(): PromiseLike<boolean>;
}

interface PushSubscriptionReader {
  readCurrentSubscription(): PromiseLike<unknown>;
}

interface PushDeactivationOptions {
  browser: PushSubscriptionReader;
}

export type PushUnsubscribeEvidence = "already-inactive" | "deactivation-started" | "unknown";

export type PushDeactivationResult<Subscription extends BrowserPushSubscriptionHandle> =
  | { kind: "absent" }
  | { captured: Subscription; evidence: PushUnsubscribeEvidence; kind: "deactivated" }
  | {
      captured: Subscription;
      current: Subscription;
      evidence: PushUnsubscribeEvidence;
      kind: "replaced";
    }
  | { captured: Subscription | null; evidence: PushUnsubscribeEvidence; kind: "unknown" };

const ABSENT_RESULT = Object.freeze({ kind: "absent" } as const);
const UNKNOWN_WITHOUT_CAPTURE = Object.freeze({ captured: null, evidence: "unknown", kind: "unknown" } as const);

function deactivationError(code: string): NotificationPushDeactivationError {
  return new NotificationPushDeactivationError(code);
}

function isSubscriptionHandle(value: unknown): value is BrowserPushSubscriptionHandle {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { endpoint?: unknown }).endpoint === "string" &&
    (value as { endpoint: string }).endpoint.length > 0 &&
    typeof (value as { unsubscribe?: unknown }).unsubscribe === "function"
  );
}

function unsubscribeEvidence(value: unknown): PushUnsubscribeEvidence {
  if (value === true) return "deactivation-started";
  if (value === false) return "already-inactive";
  return "unknown";
}

export function createNotificationPushDeactivation<Subscription extends BrowserPushSubscriptionHandle>(
  options: PushDeactivationOptions
) {
  const browser = options?.browser;
  if (!browser || typeof browser.readCurrentSubscription !== "function") {
    throw deactivationError(PUSH_DEACTIVATION_ERROR_CODES.INVALID_CONFIGURATION);
  }

  async function deactivateCurrentSubscription(): Promise<PushDeactivationResult<Subscription>> {
    let capturedValue: unknown;
    try {
      capturedValue = await browser.readCurrentSubscription();
    } catch {
      return UNKNOWN_WITHOUT_CAPTURE;
    }

    if (capturedValue === null) return ABSENT_RESULT;
    if (!isSubscriptionHandle(capturedValue)) return UNKNOWN_WITHOUT_CAPTURE;
    const captured = capturedValue as Subscription;

    let evidence: PushUnsubscribeEvidence = "unknown";
    try {
      evidence = unsubscribeEvidence(await captured.unsubscribe());
    } catch {
      // A thrown result is not evidence that deactivation failed. The required
      // second read below remains authoritative when it can prove absence or
      // replacement.
    }

    let currentValue: unknown;
    try {
      currentValue = await browser.readCurrentSubscription();
    } catch {
      return Object.freeze({ captured, evidence, kind: "unknown" });
    }

    if (currentValue === null) {
      return Object.freeze({ captured, evidence, kind: "deactivated" });
    }
    if (!isSubscriptionHandle(currentValue)) {
      return Object.freeze({ captured, evidence, kind: "unknown" });
    }
    const current = currentValue as Subscription;
    if (current.endpoint !== captured.endpoint) {
      return Object.freeze({ captured, current, evidence, kind: "replaced" });
    }
    return Object.freeze({ captured, evidence, kind: "unknown" });
  }

  return Object.freeze({ deactivateCurrentSubscription });
}
