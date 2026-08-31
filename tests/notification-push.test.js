import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { enableBrowserPush, vapidPublicKeyBytes } from "../src/notificationPush.js";

const PUSH_STORAGE_URL = new URL("../src/notificationPushStorage.ts", import.meta.url);
const PUSH_STORAGE_SOURCE = readFileSync(PUSH_STORAGE_URL, "utf8");

function sourceFiles(directoryUrl) {
  return readdirSync(directoryUrl, { withFileTypes: true }).flatMap((entry) => {
    const entryUrl = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, directoryUrl);
    if (entry.isDirectory()) return sourceFiles(entryUrl);
    return /\.(?:js|ts|tsx)$/u.test(entry.name) ? [entryUrl] : [];
  });
}

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

test("the Push storage foundation stays outside the production runtime graph", () => {
  const references = sourceFiles(new URL("../src/", import.meta.url))
    .filter((sourceUrl) => sourceUrl.href !== PUSH_STORAGE_URL.href)
    .filter((sourceUrl) => /notificationPushStorage/u.test(readFileSync(sourceUrl, "utf8")));

  assert.deepEqual(references, []);
});

test("the Push storage foundation has no network, Supabase, or unsafe fallback boundary", () => {
  const importSources = [...PUSH_STORAGE_SOURCE.matchAll(/\bfrom\s+"([^"]+)";/gu)].map((match) => match[1]);
  const sideEffectImports = [...PUSH_STORAGE_SOURCE.matchAll(/^\s*import\s+"([^"]+)";/gmu)].map((match) => match[1]);

  assert.deepEqual(importSources, ["../supabase/functions/_shared/push-cleanup-protocol.js"]);
  assert.deepEqual(sideEffectImports, []);
  assert.doesNotMatch(PUSH_STORAGE_SOURCE, /\bimport\s*\(/u);
  assert.doesNotMatch(PUSH_STORAGE_SOURCE, /\b(?:dataApi|supabaseClient)\b/u);
  assert.doesNotMatch(PUSH_STORAGE_SOURCE, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/u);
  assert.doesNotMatch(PUSH_STORAGE_SOURCE, /\b(?:localStorage|sessionStorage|Math\.random)\b/u);
});
