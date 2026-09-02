import {
  isAuthApiError,
  isAuthRefreshDiscardedError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
  type Provider,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  hadInitialAuthRefreshCredential,
  isSupabaseConfigured,
  supabase,
  SUPABASE_AUTH_STORAGE_KEY,
  takeSupabaseAuthRefreshEvidence,
  withSupabaseAuthStorageLock,
} from "../supabaseClient.js";
import type { Database } from "./databaseTypes.ts";
import { DataApiUnavailableError, asDataApiError } from "./dataErrors.ts";

interface AuthSessionTokens {
  access_token?: unknown;
  refresh_token?: unknown;
  user?: { id?: unknown } | null;
}

interface AuthRefreshEvidence {
  code: string | null;
  kind: "api-error" | "network-error" | "pending" | "success";
  revision: number;
  status: number | null;
}

export type AuthVerificationFailureReason = "rejected" | "superseded" | "unavailable";

export type AuthVerificationResult =
  | { kind: "anonymous"; session: null }
  | { kind: "verified"; session: unknown }
  | { error: unknown; kind: AuthVerificationFailureReason; session: null };

type AuthClient = Pick<SupabaseClient<Database>, "auth">;

const REJECTED_REFRESH_CODES = new Set(["refresh_token_already_used", "refresh_token_not_found", "session_expired"]);
const OBSERVED_REJECTED_REFRESH_CODES = new Set([...REJECTED_REFRESH_CODES, "session_not_found"]);

function requireDefaultSupabase(): AuthClient {
  if (!isSupabaseConfigured || !supabase) throw new DataApiUnavailableError();
  return supabase;
}

function storedRefreshCredentialPresent(storedSession: string | null): boolean {
  if (!storedSession) return false;
  try {
    const session = JSON.parse(storedSession) as AuthSessionTokens;
    return typeof session?.refresh_token === "string" && session.refresh_token.trim().length > 0;
  } catch {
    return false;
  }
}

function verifiedSessionCandidate(session: unknown): boolean {
  if (typeof session !== "object" || session === null) return false;
  const candidate = session as AuthSessionTokens;
  return (
    typeof candidate.access_token === "string" &&
    candidate.access_token.trim().length > 0 &&
    typeof candidate.user?.id === "string" &&
    candidate.user.id.trim().length > 0
  );
}

function observedRefreshRejection(
  credentialWasPresent: boolean,
  readRefreshEvidence: () => AuthRefreshEvidence | null
): AuthVerificationResult | null {
  if (!credentialWasPresent) return null;
  const evidence = readRefreshEvidence();
  if (
    evidence?.kind !== "api-error" ||
    evidence.status === null ||
    evidence.status < 400 ||
    evidence.status >= 500 ||
    evidence.code === null ||
    !OBSERVED_REJECTED_REFRESH_CODES.has(evidence.code)
  ) {
    return null;
  }
  return { error: evidence, kind: "rejected", session: null };
}

function verificationFailure(
  error: unknown,
  credentialWasPresent: boolean,
  readRefreshEvidence: () => AuthRefreshEvidence | null
): AuthVerificationResult {
  // Reading through the production observer consumes the latest revision, so
  // one account's rejection cannot be reused by a later restore attempt.
  const observedRejection = observedRefreshRejection(credentialWasPresent, readRefreshEvidence);
  if (isAuthRefreshDiscardedError(error)) return { error, kind: "superseded", session: null };
  if (isAuthRetryableFetchError(error)) return { error, kind: "unavailable", session: null };
  if (
    isAuthApiError(error) &&
    error.status >= 400 &&
    error.status < 500 &&
    typeof error.code === "string" &&
    REJECTED_REFRESH_CODES.has(error.code)
  ) {
    return { error, kind: "rejected", session: null };
  }
  if (observedRejection) return observedRejection;
  // auth-js uses this same error for both a local missing session and the
  // server's session_not_found response. Without stronger evidence it must
  // not be reported as a server rejection.
  if (isAuthSessionMissingError(error) && !credentialWasPresent) {
    return { kind: "anonymous", session: null };
  }
  return { error, kind: "unavailable", session: null };
}

/**
 * Never returns the cached getSession() value as authenticated. A non-null
 * result is published only after refreshSession() has contacted Auth and
 * returned a session with a usable user.id.
 */
export async function resolveInitialSession(
  client: AuthClient,
  storedSession: string | null = null,
  bootCredentialWasPresent = false,
  readRefreshEvidence: () => AuthRefreshEvidence | null = () => null
): Promise<AuthVerificationResult> {
  const credentialWasPresent = bootCredentialWasPresent || storedRefreshCredentialPresent(storedSession);
  let initializationError: unknown = null;
  try {
    const initialized = await client.auth.initialize();
    initializationError = initialized.error;
  } catch (error) {
    initializationError = error;
  }

  let current;
  try {
    current = await client.auth.getSession();
  } catch (error) {
    return verificationFailure(error, credentialWasPresent, readRefreshEvidence);
  }
  if (current.error) return verificationFailure(current.error, credentialWasPresent, readRefreshEvidence);
  if (!current.data?.session) {
    const observedRejection = observedRefreshRejection(credentialWasPresent, readRefreshEvidence);
    if (observedRejection) return observedRejection;
    // URL callback failures are not refresh-rejection evidence. Keep them
    // recoverable and distinct from a confirmed anonymous boot.
    if (initializationError) {
      return { error: initializationError, kind: "unavailable", session: null };
    }
    return credentialWasPresent
      ? { error: null, kind: "unavailable", session: null }
      : { kind: "anonymous", session: null };
  }

  let refreshed;
  try {
    // Deliberately omit an explicit token. The shared auth storage lock keeps
    // this refresh serialized with the app's other reviewed auth operations;
    // auth-js's commit guard remains a second line of defense.
    refreshed = await client.auth.refreshSession();
  } catch (error) {
    return verificationFailure(error, true, readRefreshEvidence);
  }
  if (refreshed.error) return verificationFailure(refreshed.error, true, readRefreshEvidence);
  if (!verifiedSessionCandidate(refreshed.data?.session)) {
    return { error: null, kind: "unavailable", session: null };
  }
  return { kind: "verified", session: refreshed.data.session };
}

export async function getInitialSession(): Promise<AuthVerificationResult> {
  if (!isSupabaseConfigured) return { kind: "anonymous", session: null };
  const client = requireDefaultSupabase();
  let stored: string | null = null;
  try {
    stored = globalThis.localStorage?.getItem(SUPABASE_AUTH_STORAGE_KEY) ?? null;
  } catch {
    // The pre-client boolean still prevents a known credential from being
    // mistaken for a confirmed anonymous boot.
  }
  return resolveInitialSession(client, stored, hadInitialAuthRefreshCredential, takeSupabaseAuthRefreshEvidence);
}

export function onAuthStateChange(callback: (session: unknown, event: string) => void): () => void {
  if (!isSupabaseConfigured) return () => {};
  const client = requireDefaultSupabase();
  const { data } = client.auth.onAuthStateChange((event, session) => callback(session, event));
  return () => data.subscription.unsubscribe();
}

export async function signInWithOAuthProvider(provider: Provider): Promise<void> {
  const client = requireDefaultSupabase();
  const { error } = await withSupabaseAuthStorageLock(() =>
    client.auth.signInWithOAuth({
      provider,
      options: { redirectTo: globalThis.location?.origin },
    })
  );
  if (error) throw asDataApiError(error);
}

export async function signOutCurrentDevice(client: AuthClient): Promise<void> {
  // `local` clears only this browser's session. Do not wrap this in the app
  // lock again: the configured GoTrue client already runs signOut under that
  // same lock, and nesting it would deadlock.
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) throw asDataApiError(error);
}

export async function signOut(): Promise<void> {
  return signOutCurrentDevice(requireDefaultSupabase());
}

// manual identity linking:把另一個登入 provider 掛到「目前已登入」的帳號(整頁 redirect,
// 需要 Supabase 專案開啟 manual linking)。連結狀態一律讀 session user 的 identities,不另外 fetch。
export async function linkLoginIdentity(provider: Provider): Promise<void> {
  const client = requireDefaultSupabase();
  const { error } = await withSupabaseAuthStorageLock(() =>
    client.auth.linkIdentity({
      provider,
      options: { redirectTo: globalThis.location?.origin },
    })
  );
  if (error) throw asDataApiError(error);
}
