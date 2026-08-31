import assert from "node:assert/strict";
import test from "node:test";

import { GoTrueClient } from "@supabase/supabase-js";

import { resolveInitialSession } from "../src/data/authApi.ts";
import {
  createSupabaseAuthRefreshObserver,
  serializeSupabaseAuthStorage,
  SUPABASE_AUTH_STORAGE_KEY,
  withSupabaseAuthStorageLock,
} from "../src/supabaseClient.js";

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function authSession(identity, accessToken, refreshToken) {
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
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({
    exp: Math.floor(Date.now() / 1000) + 3600,
    sub: identity,
  })}.${Buffer.from("signature").toString("base64url")}`;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json", "x-supabase-api-version": "2024-01-01" },
    status,
  });
}

function raceStorage(storageKey, initialSession) {
  const entries = new Map([[storageKey, JSON.stringify(initialSession)]]);
  const releaseSecondRead = deferred();
  const secondReadStarted = deferred();
  let sessionReads = 0;

  return {
    entries,
    releaseSecondRead,
    secondReadStarted,
    storage: {
      async getItem(key) {
        if (key === storageKey) {
          sessionReads += 1;
          if (sessionReads === 2) {
            secondReadStarted.resolve();
            await releaseSecondRead.promise;
          }
        }
        return entries.get(key) ?? null;
      },
      async removeItem(key) {
        entries.delete(key);
      },
      async setItem(key, value) {
        entries.set(key, value);
      },
    },
  };
}

function authClient({ fetch, storage, storageKey }) {
  return new GoTrueClient({
    autoRefreshToken: false,
    detectSessionInUrl: false,
    fetch,
    lock: serializeSupabaseAuthStorage,
    lockAcquireTimeout: -1,
    persistSession: true,
    skipAutoInitialize: true,
    storage,
    storageKey,
    url: "https://auth-lock.test",
  });
}

async function letQueuedWorkRun() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("auth storage fails closed in a browser without cross-tab Web Locks", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  let taskRan = false;
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
    await assert.rejects(
      serializeSupabaseAuthStorage("browser-without-web-locks", -1, async () => {
        taskRan = true;
      }),
      /不支援安全的跨分頁登入鎖/
    );
    assert.equal(taskRan, false);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete globalThis.window;
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else delete globalThis.navigator;
  }
});

test("auth storage fails closed when a non-conforming browser returns no acquired lock", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  let taskRan = false;
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        locks: {
          request: async (_name, _options, callback) => callback(null),
        },
      },
    });
    await assert.rejects(
      serializeSupabaseAuthStorage("browser-null-web-lock", -1, async () => {
        taskRan = true;
      }),
      /未能取得安全的跨分頁登入鎖/
    );
    assert.equal(taskRan, false);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete globalThis.window;
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else delete globalThis.navigator;
  }
});

test("auth storage preserves fail-fast semantics when an immediate browser lock is unavailable", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  let taskRan = false;
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        locks: {
          request: async (_name, options, callback) => {
            assert.deepEqual(options, { ifAvailable: true, mode: "exclusive" });
            return callback(null);
          },
        },
      },
    });
    await assert.rejects(
      serializeSupabaseAuthStorage("browser-busy-web-lock", 0, async () => {
        taskRan = true;
      }),
      (error) => error?.isAcquireTimeout === true
    );
    assert.equal(taskRan, false);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete globalThis.window;
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else delete globalThis.navigator;
  }
});

test("auth refresh observer matches only the configured refresh endpoint and retains no credential or error body", async () => {
  const secret = "secret-refresh-token";
  let requestBodyRead = false;
  const requestInit = new Proxy(
    { body: JSON.stringify({ refresh_token: secret }), method: "POST" },
    {
      get(target, property, receiver) {
        if (property === "body") requestBodyRead = true;
        return Reflect.get(target, property, receiver);
      },
    }
  );
  const observer = createSupabaseAuthRefreshObserver("https://project.supabase.co", async () =>
    jsonResponse(
      {
        code: "refresh_token_not_found",
        message: "must-not-be-retained",
        refresh_token: secret,
      },
      400
    )
  );

  await observer.fetch("https://project.supabase.co/auth/v1/token?grant_type=refresh_token", {
    body: JSON.stringify({ refresh_token: secret }),
  });
  await observer.fetch("https://other.supabase.co/auth/v1/token?grant_type=refresh_token", requestInit);
  await observer.fetch("https://project.supabase.co/auth/v1/token/?grant_type=refresh_token", requestInit);
  await observer.fetch("https://project.supabase.co/auth/v1/token?grant_type=pkce", requestInit);
  assert.equal(observer.read(), null, "origin, path, and grant type must all match exactly");

  await observer.fetch("https://project.supabase.co/auth/v1/token?grant_type=refresh_token", requestInit);
  const evidence = observer.read();
  assert.deepEqual(evidence, {
    code: "refresh_token_not_found",
    kind: "api-error",
    revision: 1,
    status: 400,
  });
  assert.equal(Object.isFrozen(evidence), true);
  assert.equal(requestBodyRead, false, "the observer must pass the credential body through without reading it");
  assert.equal(JSON.stringify(evidence).includes(secret), false);
  assert.equal(JSON.stringify(evidence).includes("must-not-be-retained"), false);
});

test("auth refresh observer follows the Fetch method override on a Request input", async () => {
  const endpoint = "https://project.supabase.co/auth/v1/token?grant_type=refresh_token";
  const observer = createSupabaseAuthRefreshObserver("https://project.supabase.co", async () =>
    jsonResponse({ code: "refresh_token_not_found" }, 400)
  );

  await observer.fetch(new Request(endpoint), { method: "POST" });
  assert.deepEqual(observer.take(), {
    code: "refresh_token_not_found",
    kind: "api-error",
    revision: 1,
    status: 400,
  });

  await observer.fetch(new Request(endpoint, { method: "POST" }), { method: "GET" });
  assert.equal(observer.read(), null, "init.method overrides Request.method just like the Fetch standard");
});

test("auth refresh observer never reads a successful token response and pending work invalidates stale rejection evidence", async () => {
  const secondResponse = deferred();
  let calls = 0;
  let successfulBodyCloneCalls = 0;
  const observer = createSupabaseAuthRefreshObserver("https://project.supabase.co", async () => {
    calls += 1;
    if (calls === 1) return jsonResponse({ error_code: "refresh_token_not_found" }, 400);
    const response = await secondResponse.promise;
    response.clone = () => {
      successfulBodyCloneCalls += 1;
      throw new Error("successful token bodies must remain unread");
    };
    return response;
  });

  await observer.fetch("https://project.supabase.co/auth/v1/token?grant_type=refresh_token", { method: "POST" });
  assert.equal(observer.read().kind, "api-error");

  const refreshing = observer.fetch("https://project.supabase.co/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
  });
  assert.deepEqual(observer.read(), { code: null, kind: "pending", revision: 2, status: null });
  secondResponse.resolve(jsonResponse({ access_token: "must-not-be-observed" }));
  await refreshing;

  assert.deepEqual(observer.read(), { code: null, kind: "success", revision: 2, status: 200 });
  assert.equal(successfulBodyCloneCalls, 0);
});

test("auth refresh observer reduces server and network failures without retaining their messages", async () => {
  const serverFailure = createSupabaseAuthRefreshObserver("https://project.supabase.co", async () =>
    jsonResponse(
      {
        code: "refresh_token_not_found",
        message: "server-secret-message",
      },
      503
    )
  );
  await serverFailure.fetch("https://project.supabase.co/auth/v1/token?grant_type=refresh_token", { method: "POST" });
  assert.deepEqual(serverFailure.read(), {
    code: "refresh_token_not_found",
    kind: "api-error",
    revision: 1,
    status: 503,
  });
  assert.equal(JSON.stringify(serverFailure.read()).includes("server-secret-message"), false);

  const networkFailure = createSupabaseAuthRefreshObserver("https://project.supabase.co", async () => {
    throw new Error("network-secret-message");
  });
  await assert.rejects(
    networkFailure.fetch("https://project.supabase.co/auth/v1/token?grant_type=refresh_token", { method: "POST" }),
    /network-secret-message/
  );
  assert.deepEqual(networkFailure.read(), {
    code: null,
    kind: "network-error",
    revision: 1,
    status: 0,
  });
  assert.equal(JSON.stringify(networkFailure.read()).includes("network-secret-message"), false);
});

test("real auth-js initialization rejection stays recoverable through exact refresh evidence", async (t) => {
  const storageKey = `auth-refresh-evidence-${Date.now()}`;
  const expiredSession = {
    ...authSession("account-a", "expired-access", "expired-refresh"),
    expires_at: Math.floor(Date.now() / 1000) - 60,
  };
  const entries = new Map([[storageKey, JSON.stringify(expiredSession)]]);
  const storage = {
    async getItem(key) {
      return entries.get(key) ?? null;
    },
    async removeItem(key) {
      entries.delete(key);
    },
    async setItem(key, value) {
      entries.set(key, value);
    },
  };
  const observer = createSupabaseAuthRefreshObserver("https://project.supabase.co", async () =>
    jsonResponse({ code: "session_not_found", message: "Session not found" }, 400)
  );
  const auth = new GoTrueClient({
    autoRefreshToken: true,
    detectSessionInUrl: false,
    fetch: observer.fetch,
    lock: serializeSupabaseAuthStorage,
    lockAcquireTimeout: -1,
    persistSession: true,
    storage,
    storageKey,
    url: "https://project.supabase.co/auth/v1",
  });
  t.after(() => auth.dispose());

  const initialized = await auth.initialize();
  assert.equal(initialized.error, null, "installed auth-js recovery currently swallows this rejection");
  assert.deepEqual(await auth.getSession(), { data: { session: null }, error: null });
  assert.equal(entries.has(storageKey), false);
  assert.deepEqual(observer.read(), {
    code: "session_not_found",
    kind: "api-error",
    revision: 1,
    status: 400,
  });

  const exactEvidence = observer.read();
  const rejected = await resolveInitialSession({ auth }, JSON.stringify(expiredSession), true, observer.take);
  assert.deepEqual(rejected, { error: exactEvidence, kind: "rejected", session: null });
  assert.equal(observer.read(), null, "a rejection revision can classify only one restore attempt");

  const withoutBootCredential = await resolveInitialSession({ auth }, null, false, observer.take);
  assert.deepEqual(
    withoutBootCredential,
    { kind: "anonymous", session: null },
    "transport evidence alone must never invent a rejected boot credential"
  );
});

test("auth storage lock prevents an old refresh from overwriting a concurrent account switch", async () => {
  const storageKey = `auth-lock-switch-${Date.now()}`;
  const accountA = authSession("account-a", "cached-a", "refresh-a");
  const freshA = authSession("account-a", "fresh-a", "refresh-a-next");
  const accountBToken = jwtFor("account-b");
  const harness = raceStorage(storageKey, accountA);
  const clientA = authClient({
    fetch: async (url) => {
      assert.match(String(url), /token[?]grant_type=refresh_token$/);
      return jsonResponse(freshA);
    },
    storage: harness.storage,
    storageKey,
  });
  const clientB = authClient({
    fetch: async (url) => {
      assert.match(String(url), /\/user$/);
      return jsonResponse({ user: { id: "account-b" } });
    },
    storage: harness.storage,
    storageKey,
  });

  const refreshingA = clientA.refreshSession();
  await harness.secondReadStarted.promise;
  let switched = false;
  const switchingToB = clientB
    .setSession({ access_token: accountBToken, refresh_token: "refresh-b" })
    .then((result) => {
      switched = true;
      return result;
    });
  await letQueuedWorkRun();

  assert.equal(switched, false, "account B must wait while account A owns the storage lock");
  assert.equal(JSON.parse(harness.entries.get(storageKey)).user.id, "account-a");

  harness.releaseSecondRead.resolve();
  const [refreshResult, switchResult] = await Promise.all([refreshingA, switchingToB]);
  assert.equal(refreshResult.error, null);
  assert.equal(switchResult.error, null);
  assert.equal(JSON.parse(harness.entries.get(storageKey)).user.id, "account-b");
});

test("auth storage lock prevents an old refresh from resurrecting a signed-out session", async () => {
  const storageKey = `auth-lock-signout-${Date.now()}`;
  const accountA = authSession("account-a", "cached-a", "refresh-a");
  const freshA = authSession("account-a", "fresh-a", "refresh-a-next");
  const harness = raceStorage(storageKey, accountA);
  const clientA = authClient({
    fetch: async (url) => {
      assert.match(String(url), /token[?]grant_type=refresh_token$/);
      return jsonResponse(freshA);
    },
    storage: harness.storage,
    storageKey,
  });
  const clientB = authClient({
    fetch: async (url) => {
      assert.match(String(url), /\/logout[?]scope=local$/);
      return new Response(null, { status: 200 });
    },
    storage: harness.storage,
    storageKey,
  });

  const refreshingA = clientA.refreshSession();
  await harness.secondReadStarted.promise;
  let signedOut = false;
  const signingOut = clientB.signOut({ scope: "local" }).then((result) => {
    signedOut = true;
    return result;
  });
  await letQueuedWorkRun();

  assert.equal(signedOut, false, "sign-out must wait while account A owns the storage lock");
  assert.equal(JSON.parse(harness.entries.get(storageKey)).user.id, "account-a");

  harness.releaseSecondRead.resolve();
  const [refreshResult, signOutResult] = await Promise.all([refreshingA, signingOut]);
  assert.equal(refreshResult.error, null);
  assert.equal(signOutResult.error, null);
  assert.equal(harness.entries.has(storageKey), false);
});

test("real OAuth sign-in and identity linking complete inside the shared production lock", async (t) => {
  const entries = new Map([
    [SUPABASE_AUTH_STORAGE_KEY, JSON.stringify(authSession("account-a", jwtFor("account-a"), "refresh-a"))],
  ]);
  const requests = [];
  const storage = {
    async getItem(key) {
      return entries.get(key) ?? null;
    },
    async removeItem(key) {
      entries.delete(key);
    },
    async setItem(key, value) {
      entries.set(key, value);
    },
  };
  const client = new GoTrueClient({
    autoRefreshToken: false,
    detectSessionInUrl: false,
    fetch: async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      requests.push(url);
      assert.match(url, /\/user\/identities\/authorize[?]/);
      return jsonResponse({ url: "https://provider.test/link-account-a" });
    },
    flowType: "pkce",
    lock: serializeSupabaseAuthStorage,
    lockAcquireTimeout: -1,
    persistSession: true,
    skipAutoInitialize: true,
    storage,
    storageKey: SUPABASE_AUTH_STORAGE_KEY,
    url: "https://auth-lock.test",
  });
  t.after(() => client.dispose());

  const signIn = await withSupabaseAuthStorageLock(() =>
    client.signInWithOAuth({
      provider: "google",
      options: { skipBrowserRedirect: true },
    })
  );
  assert.equal(signIn.error, null);
  assert.match(signIn.data.url, /\/authorize[?].*provider=google/);
  assert.equal(
    typeof entries.get(`${SUPABASE_AUTH_STORAGE_KEY}-code-verifier`),
    "string",
    "the PKCE verifier is written while the shared lock is held"
  );

  const linked = await withSupabaseAuthStorageLock(() =>
    client.linkIdentity({
      provider: "google",
      options: { skipBrowserRedirect: true },
    })
  );
  assert.equal(linked.error, null);
  assert.equal(linked.data.url, "https://provider.test/link-account-a");
  assert.equal(requests.length, 1);
});
