import { GoTrueClient } from "@supabase/supabase-js";

import { serializeSupabaseAuthStorage } from "../../src/supabaseClient.js";

const AUTH_URL = "https://auth-lock.test";
const STORAGE_KEY = "auth-lock-browser-sdk";

let operation = null;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json", "x-supabase-api-version": "2024-01-01" },
    status,
  });
}

function session(identity, accessToken, refreshToken) {
  return {
    access_token: accessToken,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    refresh_token: refreshToken,
    token_type: "bearer",
    user: { id: identity },
  };
}

function jwtFor(identity) {
  const encode = (value) => btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({
    exp: Math.floor(Date.now() / 1000) + 3600,
    sub: identity,
  })}.${encode("signature")}`;
}

function createAuthClient(request) {
  return new GoTrueClient({
    autoRefreshToken: false,
    detectSessionInUrl: false,
    fetch: request,
    lock: serializeSupabaseAuthStorage,
    lockAcquireTimeout: -1,
    persistSession: true,
    skipAutoInitialize: true,
    storage: globalThis.localStorage,
    storageKey: STORAGE_KEY,
    url: AUTH_URL,
  });
}

function track(client, promise) {
  const current = operation;
  current.promise = promise
    .then((result) => {
      current.state = result.error ? `error:${result.error.code ?? result.error.name}` : "done";
    })
    .catch((error) => {
      current.state = `error:${error instanceof Error ? error.name : "unknown"}`;
    })
    .finally(() => client.dispose());
}

export function seedAccountA() {
  globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(session("account-a", "cached-a", "refresh-a")));
}

export function storedIdentity() {
  const stored = globalThis.localStorage.getItem(STORAGE_KEY);
  return stored ? (JSON.parse(stored).user?.id ?? null) : null;
}

export function operationState() {
  return operation?.state ?? null;
}

export function startHeldRefresh() {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  operation = { release, state: "starting" };
  const current = operation;
  const client = createAuthClient(async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.endsWith("/token?grant_type=refresh_token")) throw new Error(`unexpected refresh URL: ${url}`);
    current.state = "held";
    await gate;
    return jsonResponse(session("account-a", "fresh-a", "refresh-a-next"));
  });
  track(client, client.refreshSession());
}

export function releaseHeldRefresh() {
  operation?.release?.();
}

export function startAccountSwitch() {
  operation = { state: "waiting" };
  const client = createAuthClient(async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.endsWith("/user")) throw new Error(`unexpected account-switch URL: ${url}`);
    return jsonResponse({ user: { id: "account-b" } });
  });
  track(client, client.setSession({ access_token: jwtFor("account-b"), refresh_token: "refresh-b" }));
}

export function startLocalSignOut() {
  operation = { state: "waiting" };
  const client = createAuthClient(async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.endsWith("/logout?scope=local")) throw new Error(`unexpected sign-out URL: ${url}`);
    return new Response(null, { status: 200 });
  });
  track(client, client.signOut({ scope: "local" }));
}
