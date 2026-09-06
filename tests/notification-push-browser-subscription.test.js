import assert from "node:assert/strict";
import test from "node:test";

import {
  createNotificationPushBrowserSubscription,
  NotificationPushBrowserSubscriptionError,
  PUSH_BROWSER_SUBSCRIPTION_ERROR_CODES,
} from "../src/notificationPushBrowserSubscription.ts";
import {
  encodeBase64Url,
  validateCanonicalPushSubscriptionStructure,
} from "../supabase/functions/_shared/push-subscription-v2-protocol.js";

const vapidKeyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
const VAPID_BYTES = new Uint8Array(await crypto.subtle.exportKey("raw", vapidKeyPair.publicKey));
const VAPID_PUBLIC_KEY = encodeBase64Url(VAPID_BYTES);
const SUBSCRIPTION_VALUE = Object.freeze({
  auth: "auth-value",
  endpoint: "https://push.example.invalid/exact",
  p256dh: "p256dh-value",
});

function subscription({
  endpoint = SUBSCRIPTION_VALUE.endpoint,
  json = { endpoint, keys: { auth: SUBSCRIPTION_VALUE.auth, p256dh: SUBSCRIPTION_VALUE.p256dh } },
  key = VAPID_BYTES,
  onUnsubscribe = () => true,
} = {}) {
  return {
    endpoint,
    options: { applicationServerKey: key.slice().buffer },
    toJSON: () => json,
    unsubscribe: async () => onUnsubscribe(),
  };
}

function createHarness({
  existing = [null],
  permission = "granted",
  promptResult = "granted",
  subscribed = subscription(),
  subscribeAction,
  validateSubscription = async (candidate) => candidate,
} = {}) {
  const calls = [];
  const reads = [...existing];
  const pushManager = {
    getSubscription: async () => {
      calls.push("get-subscription");
      return reads.length > 1 ? reads.shift() : (reads[0] ?? null);
    },
    subscribe: async (options) => {
      calls.push(["subscribe", options.userVisibleOnly, [...options.applicationServerKey]]);
      subscribeAction?.();
      return subscribed;
    },
  };
  const readyRegistration = { pushManager };
  const serviceWorker = {
    get ready() {
      calls.push("ready");
      return Promise.resolve(readyRegistration);
    },
    register: async (path) => {
      calls.push(["register", path]);
      return {
        pushManager: {
          getSubscription: async () => Promise.reject(new Error("register result must not be used")),
          subscribe: async () => Promise.reject(new Error("register result must not be used")),
        },
      };
    },
  };
  const port = createNotificationPushBrowserSubscription({
    navigatorRef: { serviceWorker },
    notificationRef: {
      permission,
      requestPermission: async () => {
        calls.push("permission");
        return promptResult;
      },
    },
    validateSubscription: async (candidate) => {
      calls.push(["validate", candidate]);
      return validateSubscription(candidate);
    },
    vapidPublicKey: VAPID_PUBLIC_KEY,
  });
  return { calls, port };
}

test("construction is dormant and rejects invalid fixed dependencies", () => {
  const harness = createHarness();
  assert.equal(typeof harness.port.preparePushSubscription, "function");
  assert.deepEqual(harness.calls, []);

  for (const options of [
    undefined,
    {},
    { validateSubscription: async (candidate) => candidate, vapidPublicKey: "AQIDBA" },
    { validateSubscription: null, vapidPublicKey: VAPID_PUBLIC_KEY },
  ]) {
    assert.throws(
      () => createNotificationPushBrowserSubscription(options),
      (error) => {
        assert.ok(error instanceof NotificationPushBrowserSubscriptionError);
        assert.equal(error.code, PUSH_BROWSER_SUBSCRIPTION_ERROR_CODES.INVALID_CONFIGURATION);
        assert.equal(error.message, PUSH_BROWSER_SUBSCRIPTION_ERROR_CODES.INVALID_CONFIGURATION);
        return true;
      }
    );
  }
});

test("enable requests permission before browser activity and only exact refusal cancels provisioning", async () => {
  const granted = createHarness({ permission: "default" });
  assert.deepEqual(await granted.port.preparePushSubscription({ kind: "enable" }), {
    kind: "ready",
    subscription: SUBSCRIPTION_VALUE,
  });
  assert.deepEqual(granted.calls.slice(0, 4), ["permission", ["register", "/push-sw.js"], "ready", "get-subscription"]);

  for (const options of [
    { permission: "denied" },
    { permission: "default", promptResult: "default" },
    { permission: "default", promptResult: "denied" },
  ]) {
    const refused = createHarness(options);
    assert.deepEqual(await refused.port.preparePushSubscription({ kind: "enable" }), {
      kind: "cancelled-before-network",
    });
    assert.equal(
      refused.calls.some((call) => Array.isArray(call) && call[0] === "register"),
      false
    );
  }
});

test("refresh never opens a permission prompt", async () => {
  for (const permission of ["default", "denied", "unexpected"]) {
    const harness = createHarness({ permission });
    assert.deepEqual(await harness.port.preparePushSubscription({ kind: "refresh" }), { kind: "pending" });
    assert.deepEqual(harness.calls, []);
  }
});

test("the port waits for serviceWorker.ready and creates one matching subscription", async () => {
  const harness = createHarness();
  assert.deepEqual(await harness.port.preparePushSubscription({ kind: "enable", signal: undefined }), {
    kind: "ready",
    subscription: SUBSCRIPTION_VALUE,
  });
  assert.deepEqual(
    harness.calls.map((call) => (Array.isArray(call) ? call[0] : call)),
    ["register", "ready", "get-subscription", "subscribe", "validate"]
  );
  const subscribeCall = harness.calls.find((call) => Array.isArray(call) && call[0] === "subscribe");
  assert.equal(subscribeCall[1], true);
  assert.deepEqual(subscribeCall[2], [...VAPID_BYTES]);
});

test("an existing subscription is reused only when its VAPID key is current", async () => {
  const existing = subscription();
  const harness = createHarness({ existing: [existing] });
  assert.deepEqual(await harness.port.preparePushSubscription({ kind: "refresh" }), {
    kind: "ready",
    subscription: SUBSCRIPTION_VALUE,
  });
  assert.equal(
    harness.calls.some((call) => Array.isArray(call) && call[0] === "subscribe"),
    false
  );
});

test("the injected browser validator accepts canonical structure without a provider allowlist", async () => {
  const canonical = {
    auth: encodeBase64Url(new Uint8Array(16).fill(7)),
    endpoint: "https://push.other.qiuka.tw/send/opaque?token=a%2Fb",
    p256dh: encodeBase64Url(VAPID_BYTES),
  };
  const harness = createHarness({
    subscribed: subscription({
      endpoint: canonical.endpoint,
      json: { endpoint: canonical.endpoint, keys: { auth: canonical.auth, p256dh: canonical.p256dh } },
    }),
    validateSubscription: async (candidate) =>
      (await validateCanonicalPushSubscriptionStructure(candidate)) ? candidate : null,
  });

  assert.deepEqual(await harness.port.preparePushSubscription({ kind: "enable" }), {
    kind: "ready",
    subscription: canonical,
  });
});

test("VAPID rotation unsubscribes, rereads, then explicitly creates a replacement", async () => {
  const wrongKey = VAPID_BYTES.slice();
  wrongKey[1] ^= 1;
  const old = subscription({ key: wrongKey });
  const harness = createHarness({ existing: [old, null] });
  const originalPush = harness.calls.push.bind(harness.calls);
  old.unsubscribe = async () => {
    originalPush("unsubscribe");
    return false;
  };

  assert.deepEqual(await harness.port.preparePushSubscription({ kind: "enable" }), {
    kind: "ready",
    subscription: SUBSCRIPTION_VALUE,
  });
  assert.deepEqual(
    harness.calls.map((call) => (Array.isArray(call) ? call[0] : call)),
    ["register", "ready", "get-subscription", "unsubscribe", "get-subscription", "subscribe", "validate"]
  );

  const persistent = createHarness({ existing: [subscription({ key: wrongKey }), subscription({ key: wrongKey })] });
  assert.deepEqual(await persistent.port.preparePushSubscription({ kind: "enable" }), { kind: "pending" });
  assert.equal(
    persistent.calls.some((call) => Array.isArray(call) && call[0] === "subscribe"),
    false
  );
});

test("native and injected validation drift fail closed without changing raw strings", async () => {
  for (const options of [
    { subscribed: subscription({ json: { endpoint: "changed", keys: SUBSCRIPTION_VALUE } }) },
    {
      subscribed: subscription({ json: { endpoint: SUBSCRIPTION_VALUE.endpoint, keys: { auth: "", p256dh: "key" } } }),
    },
    { validateSubscription: async (candidate) => ({ ...candidate, endpoint: `${candidate.endpoint}/` }) },
    { validateSubscription: async () => Promise.reject(new Error("private validator detail")) },
  ]) {
    const harness = createHarness(options);
    assert.deepEqual(await harness.port.preparePushSubscription({ kind: "enable" }), { kind: "pending" });
  }
});

test("abort and browser failures remain pending after provisioning cannot be safely cancelled", async () => {
  const alreadyAborted = new AbortController();
  alreadyAborted.abort();
  const untouched = createHarness();
  assert.deepEqual(await untouched.port.preparePushSubscription({ kind: "enable", signal: alreadyAborted.signal }), {
    kind: "pending",
  });
  assert.deepEqual(untouched.calls, []);

  const duringSubscribe = new AbortController();
  const interrupted = createHarness({ subscribeAction: () => duringSubscribe.abort() });
  assert.deepEqual(await interrupted.port.preparePushSubscription({ kind: "enable", signal: duringSubscribe.signal }), {
    kind: "pending",
  });
  assert.equal(
    interrupted.calls.some((call) => Array.isArray(call) && call[0] === "subscribe"),
    true
  );

  const unavailable = createNotificationPushBrowserSubscription({
    navigatorRef: {},
    notificationRef: { permission: "granted", requestPermission: async () => "granted" },
    validateSubscription: async (candidate) => candidate,
    vapidPublicKey: VAPID_PUBLIC_KEY,
  });
  assert.deepEqual(await unavailable.preparePushSubscription({ kind: "enable" }), { kind: "pending" });
  assert.deepEqual(await unavailable.preparePushSubscription({ kind: "enable", extra: true }), { kind: "pending" });
});
