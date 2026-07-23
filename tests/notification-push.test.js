import assert from "node:assert/strict";
import test from "node:test";

import { enableBrowserPush, vapidPublicKeyBytes } from "../src/notificationPush.js";

test("VAPID public keys decode from URL-safe base64", () => {
  assert.deepEqual([...vapidPublicKeyBytes("AQIDBA")], [1, 2, 3, 4]);
});

test("enabling browser push requests permission and subscribes through the service worker", async () => {
  const calls = [];
  const subscription = {
    endpoint: "https://push.example/subscription",
    toJSON: () => ({ endpoint: "https://push.example/subscription", keys: { auth: "auth", p256dh: "key" } }),
  };
  const result = await enableBrowserPush({
    NotificationRef: {
      permission: "default",
      requestPermission: async () => {
        calls.push("permission");
        return "granted";
      },
    },
    navigatorRef: {
      serviceWorker: {
        register: async (path) => {
          calls.push(["register", path]);
          return {
            pushManager: {
              getSubscription: async () => null,
              subscribe: async (options) => {
                calls.push(["subscribe", options.userVisibleOnly, [...options.applicationServerKey]]);
                return subscription;
              },
            },
          };
        },
      },
    },
    vapidPublicKey: "AQIDBA",
  });

  assert.deepEqual(result, { status: "granted", subscription: subscription.toJSON() });
  assert.deepEqual(calls, ["permission", ["register", "/push-sw.js"], ["subscribe", true, [1, 2, 3, 4]]]);
});

test("denied browser permission never registers a service worker or subscribes", async () => {
  let registered = false;
  const result = await enableBrowserPush({
    NotificationRef: { permission: "denied", requestPermission: async () => "denied" },
    navigatorRef: { serviceWorker: { register: async () => (registered = true) } },
    vapidPublicKey: "AQIDBA",
  });

  assert.deepEqual(result, { status: "denied", subscription: null });
  assert.equal(registered, false);
});
