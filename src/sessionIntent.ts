export const PENDING_SESSION_INTENT_KEY = "tennis-partner-finder:pending-session-intent";

type PendingSessionIntent =
  | { action: "join"; sessionId: number }
  | { action: "create" }
  | { action: "players" }
  | { action: "directory" }
  | { action: "visibility" };

interface PendingSessionIntentInput {
  action?: unknown;
  sessionId: number;
}

interface SessionStoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function sessionStorageOrNull(storage?: SessionStoragePort | null) {
  if (storage) return storage;
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function normalizedIntent(intent: unknown): PendingSessionIntent | null {
  if (!intent || typeof intent !== "object" || Array.isArray(intent)) return null;
  const keys = Object.keys(intent).sort();

  if (
    (intent as PendingSessionIntentInput).action === "join" &&
    keys.length === 2 &&
    keys[0] === "action" &&
    keys[1] === "sessionId" &&
    Number.isSafeInteger((intent as PendingSessionIntentInput).sessionId) &&
    (intent as PendingSessionIntentInput).sessionId > 0
  ) {
    return { action: "join", sessionId: (intent as PendingSessionIntentInput).sessionId };
  }

  if ((intent as PendingSessionIntentInput).action === "create" && keys.length === 1 && keys[0] === "action") {
    return { action: "create" };
  }

  if ((intent as PendingSessionIntentInput).action === "players" && keys.length === 1 && keys[0] === "action") {
    return { action: "players" };
  }

  if ((intent as PendingSessionIntentInput).action === "directory" && keys.length === 1 && keys[0] === "action") {
    return { action: "directory" };
  }

  if ((intent as PendingSessionIntentInput).action === "visibility" && keys.length === 1 && keys[0] === "action") {
    return { action: "visibility" };
  }

  return null;
}

/** Save only an intent to continue after authentication, never a draft. */
export function savePendingIntent(intent: unknown, storage?: SessionStoragePort | null) {
  const safeIntent = normalizedIntent(intent);
  if (!safeIntent) throw new Error("Unsupported pending session intent");

  const targetStorage = sessionStorageOrNull(storage);
  if (!targetStorage) return safeIntent;
  targetStorage.setItem(PENDING_SESSION_INTENT_KEY, JSON.stringify(safeIntent));
  return safeIntent;
}

/** Read and clear malformed/overbroad values rather than carrying them forward. */
export function readPendingIntent(storage?: SessionStoragePort | null) {
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

export function clearPendingIntent(storage?: SessionStoragePort | null) {
  sessionStorageOrNull(storage)?.removeItem(PENDING_SESSION_INTENT_KEY);
}
