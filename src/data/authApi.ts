import type { Provider, SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase, SUPABASE_AUTH_STORAGE_KEY } from "../supabaseClient.js";
import type { Database } from "./databaseTypes.ts";
import { DataApiUnavailableError, asDataApiError } from "./dataErrors.ts";

interface AuthSessionTokens {
  access_token: string;
  refresh_token: string;
}

type AuthClient = Pick<SupabaseClient<Database>, "auth">;

function requireDefaultSupabase(): AuthClient {
  if (!isSupabaseConfigured || !supabase) throw new DataApiUnavailableError();
  return supabase;
}

/**
 * A null return is deliberately reserved for a confirmed anonymous state.
 * Transport/refresh failures reject so callers can retain a recoverable
 * post-login intent instead of treating a temporary auth failure as logout.
 */
export async function resolveInitialSession(
  client: AuthClient,
  storedSession: string | null = null
): Promise<unknown | null> {
  const { data, error } = await client.auth.getSession();
  if (error) throw asDataApiError(error);
  if (data?.session) return data.session;
  if (!storedSession) return null;

  let session: AuthSessionTokens | null = null;
  try {
    session = JSON.parse(storedSession) as AuthSessionTokens;
  } catch {
    return null;
  }
  if (!session?.access_token || !session?.refresh_token) return null;

  const { data: restored, error: restoreError } = await client.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (restoreError) throw asDataApiError(restoreError);
  return restored?.session ?? null;
}

export async function getInitialSession(): Promise<unknown | null> {
  if (!isSupabaseConfigured) return null;
  const client = requireDefaultSupabase();
  const stored = globalThis.localStorage?.getItem(SUPABASE_AUTH_STORAGE_KEY);
  return resolveInitialSession(client, stored);
}

export function onAuthStateChange(callback: (session: unknown | null, event: string) => void): () => void {
  if (!isSupabaseConfigured) return () => {};
  const client = requireDefaultSupabase();
  const { data } = client.auth.onAuthStateChange((event, session) => callback(session, event));
  return () => data.subscription.unsubscribe();
}

export async function signInWithOAuthProvider(provider: Provider): Promise<void> {
  const client = requireDefaultSupabase();
  const { error } = await client.auth.signInWithOAuth({
    provider,
    options: { redirectTo: globalThis.location?.origin },
  });
  if (error) throw asDataApiError(error);
}

export async function signOut(): Promise<void> {
  const client = requireDefaultSupabase();
  const { error } = await client.auth.signOut();
  if (error) throw asDataApiError(error);
}

// manual identity linking:把另一個登入 provider 掛到「目前已登入」的帳號(整頁 redirect,
// 需要 Supabase 專案開啟 manual linking)。連結狀態一律讀 session user 的 identities,不另外 fetch。
export async function linkLoginIdentity(provider: Provider): Promise<void> {
  const client = requireDefaultSupabase();
  const { error } = await client.auth.linkIdentity({
    provider,
    options: { redirectTo: globalThis.location?.origin },
  });
  if (error) throw asDataApiError(error);
}
