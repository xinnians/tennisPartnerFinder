export type AbortableOperationResult<Value> =
  Readonly<{ kind: "aborted" }> | Readonly<{ kind: "completed"; value: Value }> | Readonly<{ kind: "failed" }>;

const ABORTED_RESULT = Object.freeze({ kind: "aborted" } as const);
const FAILED_RESULT = Object.freeze({ kind: "failed" } as const);

export function isUsableAbortSignal(value: unknown): value is AbortSignal {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { aborted?: unknown }).aborted === "boolean" &&
    typeof (value as { addEventListener?: unknown }).addEventListener === "function" &&
    typeof (value as { removeEventListener?: unknown }).removeEventListener === "function"
  );
}

/**
 * Stop awaiting a dependency when the caller aborts. This deliberately creates
 * no timer and does not claim that a non-cancellable browser primitive stopped.
 */
export function settleAbortableOperation<Value>(
  operation: () => PromiseLike<Value>,
  signal?: AbortSignal
): Promise<AbortableOperationResult<Value>> {
  if (typeof operation !== "function" || (signal !== undefined && !isUsableAbortSignal(signal))) {
    return Promise.resolve(FAILED_RESULT);
  }
  if (signal?.aborted) return Promise.resolve(ABORTED_RESULT);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: AbortableOperationResult<Value>) => {
      if (settled) return;
      settled = true;
      try {
        signal?.removeEventListener("abort", onAbort);
      } catch {
        // A conforming AbortSignal does not throw here; fail-safe cleanup only.
      }
      resolve(result);
    };
    const onAbort = () => finish(ABORTED_RESULT);

    try {
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) {
        finish(ABORTED_RESULT);
        return;
      }
      Promise.resolve(operation()).then(
        (value) => finish(Object.freeze({ kind: "completed", value })),
        () => finish(FAILED_RESULT)
      );
    } catch {
      finish(FAILED_RESULT);
    }
  });
}
