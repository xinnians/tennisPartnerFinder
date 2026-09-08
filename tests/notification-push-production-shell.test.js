import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createNotificationPushProductionShell,
  NotificationPushProductionShellError,
  PUSH_PRODUCTION_SHELL_ERROR_CODES,
} from "../src/notificationPushProductionShell.ts";
import { createNotificationPushSignOutContinuation } from "../src/notificationPushSignOutContinuation.ts";
import { createNotificationPushRuntimeComposition } from "../src/notificationPushRuntimeComposition.ts";
import { encodeBase64Url } from "../supabase/functions/_shared/push-cleanup-protocol.js";

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const SIGN_OUT_BINDING = Object.freeze({
  authUserId: AUTH_USER_ID,
  bindingId: "22222222-2222-4222-8222-222222222222",
  deviceId: "33333333-3333-4333-8333-333333333333",
  localRevision: "44444444-4444-4444-8444-444444444444",
  serverConsent: Object.freeze({
    consentEpoch: "55555555-5555-4555-8555-555555555555",
    consentId: "1",
    consentVersion: "1",
  }),
  state: "enabled",
});

function authority(overrides = {}) {
  return {
    isVerificationRevisionCurrent: () => true,
    isVerifiedAuthProofCurrent: () => true,
    notifyUnauthorized: async () => {},
    readCurrentVerifiedAuthProof: () => ({ accessToken: "memory-only", authUserId: AUTH_USER_ID, revision: 1 }),
    readVerifiedAuthProof: () => ({ accessToken: "memory-only", authUserId: AUTH_USER_ID, revision: 1 }),
    ...overrides,
  };
}

function fakeRuntime({
  onFailure = async () => ({ kind: "ignored" }),
  onSignOut = async () => ({ kind: "pending" }),
  readState = async () => ({ kind: "disabled" }),
} = {}) {
  return Object.freeze({
    authCorrelation: Object.freeze({ processAuthFailureNotice: onFailure }),
    manualReenable: Object.freeze({ startManualPushReenable: async () => ({ kind: "pending" }) }),
    signOutCleanup: Object.freeze({ processCurrentDeviceSignOut: onSignOut }),
    storage: Object.freeze({ readPushRuntimeState: readState }),
    subscriptionCoordinator: Object.freeze({ enableProvisioning: async () => ({ kind: "pending" }) }),
  });
}

test("the production shell is statically wired disabled and never loads the Push v2 runtime", async () => {
  let loads = 0;
  const shell = createNotificationPushProductionShell({
    loadRuntime: async () => {
      loads += 1;
      throw new Error("disabled mode must not import the runtime");
    },
    mode: "disabled",
  });
  shell.installAuthVerificationAuthority(authority());

  assert.equal(await shell.readEnabledRuntime(), null);
  assert.deepEqual(await shell.processAuthVerificationFailure({ kind: "unavailable", revision: 0 }), {
    kind: "ignored",
  });
  assert.deepEqual(await shell.processCurrentDeviceSignOut(), { kind: "ignored" });
  assert.deepEqual(await shell.processCurrentDeviceSignOut({ signal: { aborted: false } }), { kind: "ignored" });
  assert.equal(loads, 0);

  const [mainSource, shellSource] = await Promise.all([
    readFile(new URL("../src/main.js", import.meta.url), "utf8"),
    readFile(new URL("../src/notificationPushProductionShell.ts", import.meta.url), "utf8"),
  ]);
  assert.match(mainSource, /createNotificationPushProductionShell\(\{ mode: "disabled" \}\)/u);
  assert.match(mainSource, /onAuthVerificationAuthority/u);
  assert.match(mainSource, /onAuthVerificationFailure/u);
  assert.match(mainSource, /createNotificationPushSignOutContinuation\(\{/u);
  assert.match(
    mainSource,
    /processPushSignOut: \(input\) => notificationPushV2Shell\.processCurrentDeviceSignOut\(input\)/u
  );
  assert.match(mainSource, /onSignOut: notificationPushSignOutContinuation\.processCurrentDeviceSignOut/u);
  assert.doesNotMatch(mainSource, /notificationPushRuntimeComposition/u);
  assert.match(shellSource, /return import\("\.\/notificationPushRuntimeComposition\.ts"\)/u);
});

test("the production outer continuation single-flights Auth while the disabled shell stays dormant", async () => {
  let authCalls = 0;
  let releaseAuth;
  let runtimeLoads = 0;
  const authPending = new Promise((resolve) => {
    releaseAuth = resolve;
  });
  const shell = createNotificationPushProductionShell({
    loadRuntime: async () => {
      runtimeLoads += 1;
      throw new Error("disabled shell must not load runtime");
    },
    mode: "disabled",
  });
  const continuation = createNotificationPushSignOutContinuation({
    processPushSignOut: (input) => shell.processCurrentDeviceSignOut(input),
    signOutCurrentDevice: () => {
      authCalls += 1;
      return authPending;
    },
  });

  const first = continuation.processCurrentDeviceSignOut();
  const duplicate = continuation.processCurrentDeviceSignOut();
  assert.equal(first, duplicate);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(authCalls, 1);
  assert.equal(runtimeLoads, 0);

  releaseAuth();
  await first;
  assert.equal(authCalls, 1);
  assert.equal(runtimeLoads, 0);
});

test("an enabled shell lazy-loads once, shares one runtime, and replaces it only for a new Auth authority", async () => {
  let creates = 0;
  let failures = 0;
  let loads = 0;
  const module = {
    createNotificationPushRuntimeComposition: ({ auth }) => {
      creates += 1;
      assert.ok(auth.readCurrentVerifiedAuthProof());
      return fakeRuntime({
        onFailure: async ({ notice }) => {
          failures += 1;
          assert.deepEqual(notice, { kind: "rejected", revision: 1 });
          return { kind: "cleanup-completed" };
        },
      });
    },
  };
  const shell = createNotificationPushProductionShell({
    loadRuntime: async () => {
      loads += 1;
      return module;
    },
    mode: "enabled",
    runtimeOptions: {},
  });
  const firstAuthority = authority();
  shell.installAuthVerificationAuthority(firstAuthority);
  assert.equal(loads, 0, "installing Auth alone stays lazy");

  const [first, duplicate] = await Promise.all([shell.readEnabledRuntime(), shell.readEnabledRuntime()]);
  assert.equal(first, duplicate);
  assert.equal(loads, 1);
  assert.equal(creates, 1);
  assert.deepEqual(await shell.processAuthVerificationFailure({ kind: "rejected", revision: 1 }), {
    kind: "cleanup-completed",
  });
  assert.equal(failures, 1);

  shell.installAuthVerificationAuthority(firstAuthority);
  assert.equal(await shell.readEnabledRuntime(), first);
  assert.equal(creates, 1);

  shell.installAuthVerificationAuthority(authority());
  const replacement = await shell.readEnabledRuntime();
  assert.notEqual(replacement, first);
  assert.equal(loads, 1, "the JavaScript module is imported only once");
  assert.equal(creates, 2, "a new Auth authority cannot reuse the old authority-bound runtime");
});

test("the enabled shell obtains and rechecks its own current proof and binding before sign-out cleanup", async () => {
  const calls = [];
  const abortController = new AbortController();
  const currentAuthority = authority({
    isVerifiedAuthProofCurrent: (proof) => {
      calls.push(["current-proof", proof.authUserId, proof.revision]);
      return true;
    },
  });
  const runtime = fakeRuntime({
    onSignOut: async (input) => {
      calls.push(["sign-out", input]);
      return { kind: "completed" };
    },
    readState: async () => {
      calls.push("read-state");
      return { binding: SIGN_OUT_BINDING, deviceId: SIGN_OUT_BINDING.deviceId, kind: "enabled" };
    },
  });
  const shell = createNotificationPushProductionShell({
    loadRuntime: async () => ({ createNotificationPushRuntimeComposition: () => runtime }),
    mode: "enabled",
    runtimeOptions: {},
  });
  shell.installAuthVerificationAuthority(currentAuthority);

  assert.deepEqual(await shell.processCurrentDeviceSignOut({ signal: abortController.signal }), {
    kind: "completed",
  });
  assert.deepEqual(
    calls.map((call) => (Array.isArray(call) ? call[0] : call)),
    ["current-proof", "current-proof", "read-state", "current-proof", "sign-out"]
  );
  const signOutInput = calls.at(-1)[1];
  assert.equal(signOutInput.authUserId, AUTH_USER_ID);
  assert.equal(signOutInput.binding, SIGN_OUT_BINDING);
  assert.equal(signOutInput.signal, abortController.signal);
  assert.equal(Object.hasOwn(signOutInput, "accessToken"), false);
});

test("authority drift after reading storage prevents sign-out cleanup", async () => {
  let current = true;
  let cleanupCalls = 0;
  const currentAuthority = authority({ isVerifiedAuthProofCurrent: () => current });
  const runtime = fakeRuntime({
    onSignOut: async () => {
      cleanupCalls += 1;
      return { kind: "completed" };
    },
    readState: async () => {
      current = false;
      return { binding: SIGN_OUT_BINDING, deviceId: SIGN_OUT_BINDING.deviceId, kind: "enabled" };
    },
  });
  const shell = createNotificationPushProductionShell({
    loadRuntime: async () => ({ createNotificationPushRuntimeComposition: () => runtime }),
    mode: "enabled",
    runtimeOptions: {},
  });
  shell.installAuthVerificationAuthority(currentAuthority);

  assert.deepEqual(await shell.processCurrentDeviceSignOut(), { kind: "pending" });
  assert.equal(cleanupCalls, 0);
});

test("abort releases a never-settling runtime load and invalid signals stay dormant", async () => {
  let loads = 0;
  const shell = createNotificationPushProductionShell({
    loadRuntime: () => {
      loads += 1;
      return new Promise(() => {});
    },
    mode: "enabled",
    runtimeOptions: {},
  });
  shell.installAuthVerificationAuthority(authority());

  assert.deepEqual(await shell.processCurrentDeviceSignOut({ signal: { aborted: false } }), { kind: "pending" });
  assert.equal(loads, 0);

  const abortController = new AbortController();
  const pending = shell.processCurrentDeviceSignOut({ signal: abortController.signal });
  abortController.abort();
  assert.deepEqual(await pending, { kind: "pending" });
  assert.equal(loads, 1);
});

test("the enabled shell fails closed when the lazy module is unavailable", async () => {
  let loads = 0;
  const shell = createNotificationPushProductionShell({
    loadRuntime: async () => {
      loads += 1;
      throw new Error("offline");
    },
    mode: "enabled",
    runtimeOptions: {},
  });
  shell.installAuthVerificationAuthority(authority());

  assert.equal(await shell.readEnabledRuntime(), null);
  assert.deepEqual(await shell.processAuthVerificationFailure({ kind: "rejected", revision: 1 }), {
    kind: "pending",
  });
  assert.equal(loads, 1, "there is no guessed import retry loop");
});

test("an Auth authority replacement cannot publish a runtime bound to the old authority", async () => {
  let releaseModule;
  const pendingModule = new Promise((resolve) => {
    releaseModule = resolve;
  });
  const capturedAuthorities = [];
  const shell = createNotificationPushProductionShell({
    loadRuntime: () => pendingModule,
    mode: "enabled",
    runtimeOptions: {},
  });
  const firstAuthority = authority();
  const secondAuthority = authority();
  shell.installAuthVerificationAuthority(firstAuthority);
  const staleRead = shell.readEnabledRuntime();
  shell.installAuthVerificationAuthority(secondAuthority);
  releaseModule({
    createNotificationPushRuntimeComposition: ({ auth }) => {
      capturedAuthorities.push(auth);
      return fakeRuntime();
    },
  });

  assert.equal(await staleRead, null);
  const current = await shell.readEnabledRuntime();
  assert.ok(current);
  assert.deepEqual(capturedAuthorities, [secondAuthority]);
});

test("the runtime composition connects B1, B9, cleanup, subscription, and manual re-enable without side effects", async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const vapidPublicKey = encodeBase64Url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
  const calls = { fetch: 0, indexedDb: 0, notification: 0, serviceWorker: 0 };
  const runtime = createNotificationPushRuntimeComposition({
    auth: authority(),
    cleanupEndpoint: "https://project.supabase.co/functions/v1/push-cleanup",
    fetchRef: async () => {
      calls.fetch += 1;
      throw new Error("construction must stay offline");
    },
    indexedDb: {
      open() {
        calls.indexedDb += 1;
        throw new Error("construction must not open IndexedDB");
      },
    },
    locationRef: { origin: "https://qiuka.tw" },
    navigatorRef: {
      serviceWorker: {
        getRegistration: async () => {
          calls.serviceWorker += 1;
          throw new Error("construction must not read service worker registration");
        },
        ready: new Promise(() => {}),
        register: async () => {
          calls.serviceWorker += 1;
          throw new Error("construction must not register a service worker");
        },
      },
    },
    notificationRef: {
      permission: "default",
      requestPermission: async () => {
        calls.notification += 1;
        return "denied";
      },
    },
    quarantineRpc: async () => ({ data: "OK", error: null }),
    subscriptionEndpoint: "https://project.supabase.co/functions/v1/push-subscription-v2",
    vapidPublicKey,
  });

  assert.deepEqual(Object.keys(runtime), [
    "authCorrelation",
    "manualReenable",
    "signOutCleanup",
    "storage",
    "subscriptionCoordinator",
  ]);
  assert.equal(typeof runtime.authCorrelation.processAuthFailureNotice, "function");
  assert.equal(typeof runtime.manualReenable.startManualPushReenable, "function");
  assert.equal(typeof runtime.signOutCleanup.processCurrentDeviceSignOut, "function");
  assert.equal(typeof runtime.storage.readPushRuntimeState, "function");
  assert.equal(typeof runtime.subscriptionCoordinator.enableProvisioning, "function");
  assert.deepEqual(calls, { fetch: 0, indexedDb: 0, notification: 0, serviceWorker: 0 });
});

test("the shell rejects malformed construction and Auth authority inputs with one fixed error", () => {
  for (const options of [undefined, null, {}, { mode: "unknown" }, { mode: "enabled" }]) {
    assert.throws(
      () => createNotificationPushProductionShell(options),
      (error) => {
        assert.ok(error instanceof NotificationPushProductionShellError);
        assert.equal(error.code, PUSH_PRODUCTION_SHELL_ERROR_CODES.INVALID_CONFIGURATION);
        return true;
      }
    );
  }

  const shell = createNotificationPushProductionShell({ mode: "disabled" });
  assert.throws(() => shell.installAuthVerificationAuthority({}), NotificationPushProductionShellError);
});
