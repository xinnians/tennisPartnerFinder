import { createClient, NavigatorLockAcquireTimeoutError, processLock } from "@supabase/supabase-js";

export const SUPABASE_AUTH_STORAGE_KEY = "tennis-partner-finder-auth";

function normalizedRefreshErrorCode(body) {
  if (!body || typeof body !== "object") return null;
  const value = typeof body.code === "string" ? body.code : body.error_code;
  if (typeof value !== "string") return null;
  const code = value.trim();
  return code && code.length <= 128 ? code : null;
}

/**
 * Observe only Auth refresh responses. The request body contains the refresh
 * credential, so this wrapper deliberately passes it through without reading,
 * copying, hashing, logging, or retaining it.
 */
export function createSupabaseAuthRefreshObserver(supabaseUrl, request = globalThis.fetch) {
  const baseUrl = new URL(supabaseUrl);
  if (!baseUrl.pathname.endsWith("/")) baseUrl.pathname += "/";
  const refreshEndpoint = new URL("auth/v1/token", baseUrl);
  let latest = null;
  let revision = 0;

  function evidence(kind, status = null, code = null) {
    return Object.freeze({ revision, kind, status, code });
  }

  function isRefreshRequest(input, init) {
    try {
      const candidate = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      return (
        method === "POST" &&
        candidate.origin === refreshEndpoint.origin &&
        candidate.pathname === refreshEndpoint.pathname &&
        candidate.searchParams.get("grant_type") === "refresh_token"
      );
    } catch {
      return false;
    }
  }

  async function observedFetch(input, init) {
    if (!isRefreshRequest(input, init)) return request(input, init);

    const requestRevision = ++revision;
    latest = evidence("pending");
    try {
      const response = await request(input, init);
      if (response.ok) {
        if (revision === requestRevision) latest = evidence("success", response.status);
        return response;
      }

      let code = null;
      try {
        code = normalizedRefreshErrorCode(await response.clone().json());
      } catch {
        // Status without a canonical code is still useful unavailable evidence.
      }
      if (revision === requestRevision) latest = evidence("api-error", response.status, code);
      return response;
    } catch (error) {
      if (revision === requestRevision) latest = evidence("network-error", 0);
      throw error;
    }
  }

  return Object.freeze({
    fetch: observedFetch,
    read: () => latest,
    take: () => {
      const captured = latest;
      latest = null;
      return captured;
    },
  });
}

/**
 * Keep the browser path fail-closed even when a partial/non-conforming Web
 * Locks implementation invokes the callback without an acquired lock.
 *
 * @template Result
 * @param {string} name
 * @param {number} acquireTimeout
 * @param {() => Promise<Result>} task
 * @returns {Promise<Result>}
 */
async function browserNavigatorLock(name, acquireTimeout, task) {
  await Promise.resolve();
  return globalThis.navigator.locks.request(
    name,
    acquireTimeout === 0 ? { ifAvailable: true, mode: "exclusive" } : { mode: "exclusive" },
    async (lock) => {
      if (!lock) {
        if (acquireTimeout === 0) {
          throw new NavigatorLockAcquireTimeoutError(
            `Acquiring an exclusive Navigator LockManager lock "${name}" immediately failed`
          );
        }
        throw new Error("此瀏覽器未能取得安全的跨分頁登入鎖。");
      }
      return task();
    }
  );
}

/**
 * Serialize every auth storage operation under one name. The installed
 * auth-js uses `0` only for a best-effort auto-refresh tick; all other calls
 * are forced to wait without a timeout so Web Locks can never enter its
 * timeout-and-steal path while an older refresh is still running.
 *
 * @template Result
 * @param {string} name
 * @param {number} acquireTimeout
 * @param {() => Promise<Result>} task
 * @returns {Promise<Result>}
 */
export function serializeSupabaseAuthStorage(name, acquireTimeout, task) {
  const safeAcquireTimeout = acquireTimeout === 0 ? 0 : -1;
  const hasCrossContextLock = typeof globalThis.navigator?.locks?.request === "function";
  if (hasCrossContextLock) return browserNavigatorLock(name, safeAcquireTimeout, task);
  if (typeof globalThis.window !== "undefined") {
    return Promise.reject(new Error("此瀏覽器不支援安全的跨分頁登入鎖。"));
  }
  return processLock(name, safeAcquireTimeout, task);
}

/**
 * @template Result
 * @param {() => Promise<Result>} task
 * @returns {Promise<Result>}
 */
export function withSupabaseAuthStorageLock(task) {
  return serializeSupabaseAuthStorage(`lock:${SUPABASE_AUTH_STORAGE_KEY}`, -1, task);
}

function storedAuthRefreshCredentialPresent() {
  try {
    const stored = globalThis.localStorage?.getItem(SUPABASE_AUTH_STORAGE_KEY);
    if (!stored) return false;
    const parsed = JSON.parse(stored);
    return typeof parsed?.refresh_token === "string" && parsed.refresh_token.trim().length > 0;
  } catch {
    return false;
  }
}

// Capture only a boolean before createClient starts its asynchronous auth recovery.
// Keeping the token itself here would create another long-lived credential copy.
export const hadInitialAuthRefreshCredential = storedAuthRefreshCredentialPresent();

const env = import.meta.env ?? {};
const url = env.VITE_SUPABASE_URL ?? "";
const anonKey = env.VITE_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(url && anonKey) && url !== "___" && anonKey !== "___";

const authRefreshObserver = isSupabaseConfigured ? createSupabaseAuthRefreshObserver(url) : null;

export function takeSupabaseAuthRefreshEvidence() {
  return authRefreshObserver?.take() ?? null;
}

/** @type {import("@supabase/supabase-js").SupabaseClient<import("./data/databaseTypes.ts").Database> | null} */
export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        storageKey: SUPABASE_AUTH_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
        lock: serializeSupabaseAuthStorage,
        lockAcquireTimeout: -1,
      },
      global: { fetch: authRefreshObserver.fetch },
    })
  : null;
