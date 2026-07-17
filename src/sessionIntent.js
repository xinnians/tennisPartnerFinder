export const PENDING_SESSION_INTENT_KEY = "tennis-partner-finder:pending-session-intent";

function sessionStorageOrNull(storage) {
  if (storage) return storage;
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function normalizedIntent(intent) {
  if (!intent || typeof intent !== "object" || Array.isArray(intent)) return null;
  const keys = Object.keys(intent).sort();

  if (
    intent.action === "join" &&
    keys.length === 2 &&
    keys[0] === "action" &&
    keys[1] === "sessionId" &&
    Number.isSafeInteger(intent.sessionId) &&
    intent.sessionId > 0
  ) {
    return { action: "join", sessionId: intent.sessionId };
  }

  if (intent.action === "create" && keys.length === 1 && keys[0] === "action") {
    return { action: "create" };
  }

  return null;
}

/** Save only an intent to continue after authentication, never a draft. */
export function savePendingIntent(intent, storage) {
  const safeIntent = normalizedIntent(intent);
  if (!safeIntent) throw new Error("Unsupported pending session intent");

  const targetStorage = sessionStorageOrNull(storage);
  if (!targetStorage) return safeIntent;
  targetStorage.setItem(PENDING_SESSION_INTENT_KEY, JSON.stringify(safeIntent));
  return safeIntent;
}

/** Read and clear malformed/overbroad values rather than carrying them forward. */
export function readPendingIntent(storage) {
  const targetStorage = sessionStorageOrNull(storage);
  if (!targetStorage) return null;

  const rawIntent = targetStorage.getItem(PENDING_SESSION_INTENT_KEY);
  if (!rawIntent) return null;

  try {
    const safeIntent = normalizedIntent(JSON.parse(rawIntent));
    if (safeIntent) return safeIntent;
  } catch {
    // Treat malformed JSON exactly like an unsupported intent.
  }

  targetStorage.removeItem(PENDING_SESSION_INTENT_KEY);
  return null;
}

export function clearPendingIntent(storage) {
  sessionStorageOrNull(storage)?.removeItem(PENDING_SESSION_INTENT_KEY);
}
