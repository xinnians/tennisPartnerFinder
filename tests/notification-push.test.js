import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { enableBrowserPush, vapidPublicKeyBytes } from "../src/notificationPush.js";

const PUSH_STORAGE_URL = new URL("../src/notificationPushStorage.ts", import.meta.url);
const PUSH_STORAGE_SOURCE = readFileSync(PUSH_STORAGE_URL, "utf8");
const PUSH_CLEANUP_TRANSPORT_URL = new URL("../src/notificationPushCleanupTransport.ts", import.meta.url);
const PUSH_CLEANUP_TRANSPORT_SOURCE = readFileSync(PUSH_CLEANUP_TRANSPORT_URL, "utf8");
const PUSH_CLEANUP_COORDINATOR_URL = new URL("../src/notificationPushCleanupCoordinator.ts", import.meta.url);
const PUSH_CLEANUP_COORDINATOR_SOURCE = readFileSync(PUSH_CLEANUP_COORDINATOR_URL, "utf8");
const PUSH_DEACTIVATION_URL = new URL("../src/notificationPushDeactivation.ts", import.meta.url);
const PUSH_DEACTIVATION_SOURCE = readFileSync(PUSH_DEACTIVATION_URL, "utf8");
const PUSH_AUTH_FAILURE_COORDINATOR_URL = new URL("../src/notificationPushAuthFailureCoordinator.ts", import.meta.url);
const PUSH_AUTH_FAILURE_COORDINATOR_SOURCE = readFileSync(PUSH_AUTH_FAILURE_COORDINATOR_URL, "utf8");
const PUSH_AUTH_CORRELATION_URL = new URL("../src/notificationPushAuthCorrelation.ts", import.meta.url);
const PUSH_AUTH_CORRELATION_SOURCE = readFileSync(PUSH_AUTH_CORRELATION_URL, "utf8");
const PUSH_MANUAL_REENABLE_URL = new URL("../src/notificationPushManualReenableCoordinator.ts", import.meta.url);
const PUSH_MANUAL_REENABLE_SOURCE = readFileSync(PUSH_MANUAL_REENABLE_URL, "utf8");
const PUSH_OWNER_QUARANTINE_URL = new URL("../src/notificationPushOwnerQuarantine.ts", import.meta.url);
const PUSH_OWNER_QUARANTINE_SOURCE = readFileSync(PUSH_OWNER_QUARANTINE_URL, "utf8");

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

test("the Push cleanup transport stays outside the production runtime graph", () => {
  const references = sourceFiles(new URL("../src/", import.meta.url))
    .filter((sourceUrl) => sourceUrl.href !== PUSH_CLEANUP_TRANSPORT_URL.href)
    .filter((sourceUrl) => /notificationPushCleanupTransport/u.test(readFileSync(sourceUrl, "utf8")));

  assert.deepEqual(references, []);
});

test("the Push cleanup coordinator stays outside the production runtime graph", () => {
  const references = sourceFiles(new URL("../src/", import.meta.url))
    .filter((sourceUrl) => sourceUrl.href !== PUSH_CLEANUP_COORDINATOR_URL.href)
    .filter((sourceUrl) => /notificationPushCleanupCoordinator/u.test(readFileSync(sourceUrl, "utf8")));

  assert.deepEqual(references, []);
});

test("the Push deactivation seam stays outside the production runtime graph", () => {
  const references = sourceFiles(new URL("../src/", import.meta.url))
    .filter((sourceUrl) => sourceUrl.href !== PUSH_DEACTIVATION_URL.href)
    .filter((sourceUrl) => /notificationPushDeactivation/u.test(readFileSync(sourceUrl, "utf8")));

  assert.deepEqual(references, []);
});

test("the Push Auth-failure coordinator stays outside the production runtime graph", () => {
  const references = sourceFiles(new URL("../src/", import.meta.url))
    .filter((sourceUrl) => sourceUrl.href !== PUSH_AUTH_FAILURE_COORDINATOR_URL.href)
    .filter((sourceUrl) => /notificationPushAuthFailureCoordinator/u.test(readFileSync(sourceUrl, "utf8")));

  assert.deepEqual(references, []);
});

test("the Push Auth correlation adapter stays outside the production runtime graph", () => {
  const references = sourceFiles(new URL("../src/", import.meta.url))
    .filter((sourceUrl) => sourceUrl.href !== PUSH_AUTH_CORRELATION_URL.href)
    .filter((sourceUrl) => /notificationPushAuthCorrelation/u.test(readFileSync(sourceUrl, "utf8")));

  assert.deepEqual(references, []);
});

test("the Push manual re-enable coordinator stays outside the production runtime graph", () => {
  const references = sourceFiles(new URL("../src/", import.meta.url))
    .filter((sourceUrl) => sourceUrl.href !== PUSH_MANUAL_REENABLE_URL.href)
    .filter((sourceUrl) => /notificationPushManualReenableCoordinator/u.test(readFileSync(sourceUrl, "utf8")));

  assert.deepEqual(references, []);
});

test("the Push owner-quarantine adapter stays outside the production runtime graph", () => {
  const references = sourceFiles(new URL("../src/", import.meta.url))
    .filter((sourceUrl) => sourceUrl.href !== PUSH_OWNER_QUARANTINE_URL.href)
    .filter((sourceUrl) => /notificationPushOwnerQuarantine/u.test(readFileSync(sourceUrl, "utf8")));

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

test("the dormant cleanup transport imports only public shared modules and never persists or logs secrets", () => {
  const importSources = [...PUSH_CLEANUP_TRANSPORT_SOURCE.matchAll(/\bfrom\s+"([^"]+)";/gu)].map((match) => match[1]);
  const sideEffectImports = [...PUSH_CLEANUP_TRANSPORT_SOURCE.matchAll(/^\s*import\s+"([^"]+)";/gmu)].map(
    (match) => match[1]
  );

  assert.deepEqual(importSources, [
    "../supabase/functions/_shared/push-cleanup-protocol.js",
    "../supabase/functions/_shared/push-cleanup-public-key-path.js",
  ]);
  assert.deepEqual(sideEffectImports, []);
  assert.doesNotMatch(PUSH_CLEANUP_TRANSPORT_SOURCE, /\bimport\s*\(/u);
  assert.doesNotMatch(PUSH_CLEANUP_TRANSPORT_SOURCE, /\b(?:dataApi|supabaseClient|notificationPushStorage)\b/u);
  assert.doesNotMatch(PUSH_CLEANUP_TRANSPORT_SOURCE, /\b(?:localStorage|sessionStorage|indexedDB|caches)\b/u);
  assert.doesNotMatch(PUSH_CLEANUP_TRANSPORT_SOURCE, /\bconsole\.|\b(?:Authorization|apikey)\b/u);
  assert.doesNotMatch(PUSH_CLEANUP_TRANSPORT_SOURCE, /response\.(?:arrayBuffer|blob|formData|json|text)\s*\(/u);
  assert.doesNotMatch(
    PUSH_CLEANUP_TRANSPORT_SOURCE,
    /\b(?:AbortSignal\.timeout|setTimeout|setInterval|Math\.random)\b/u
  );
});

test("the dormant cleanup coordinator has no direct runtime, scheduling, or logging dependency", () => {
  assert.doesNotMatch(PUSH_CLEANUP_COORDINATOR_SOURCE, /\b(?:import|export)\s+[^;]*\bfrom\s+["']/u);
  assert.doesNotMatch(PUSH_CLEANUP_COORDINATOR_SOURCE, /^\s*import\s+["']/gmu);
  assert.doesNotMatch(PUSH_CLEANUP_COORDINATOR_SOURCE, /\bimport\s*\(/u);
  assert.doesNotMatch(
    PUSH_CLEANUP_COORDINATOR_SOURCE,
    /\b(?:dataApi|supabaseClient|notificationPushStorage|notificationPushCleanupTransport|notificationPushOwnerQuarantine)\b/u
  );
  assert.doesNotMatch(
    PUSH_CLEANUP_COORDINATOR_SOURCE,
    /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/u
  );
  assert.doesNotMatch(PUSH_CLEANUP_COORDINATOR_SOURCE, /\b(?:localStorage|sessionStorage|indexedDB|caches)\b/u);
  assert.doesNotMatch(
    PUSH_CLEANUP_COORDINATOR_SOURCE,
    /\b(?:console|logger|Sentry)\.|\b(?:Authorization|apikey|listPendingPushCleanups)\b/u
  );
  assert.doesNotMatch(
    PUSH_CLEANUP_COORDINATOR_SOURCE,
    /\b(?:AbortSignal\.timeout|setTimeout|setInterval|queueMicrotask|Math\.random)\b/u
  );
  assert.doesNotMatch(PUSH_CLEANUP_COORDINATOR_SOURCE, /\b(?:for|while)\s*\(/u);
});

test("the dormant Push deactivation seam has no runtime, network, persistence, logging, or timer dependency", () => {
  assert.doesNotMatch(PUSH_DEACTIVATION_SOURCE, /\b(?:import|export)\s+[^;]*\bfrom\s+["']/u);
  assert.doesNotMatch(PUSH_DEACTIVATION_SOURCE, /^\s*import\s+["']/gmu);
  assert.doesNotMatch(PUSH_DEACTIVATION_SOURCE, /\bimport\s*\(/u);
  assert.doesNotMatch(
    PUSH_DEACTIVATION_SOURCE,
    /\b(?:dataApi|supabaseClient|notificationPushStorage|notificationPushCleanupCoordinator|notificationPushCleanupTransport|notificationPushOwnerQuarantine)\b/u
  );
  assert.doesNotMatch(PUSH_DEACTIVATION_SOURCE, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/u);
  assert.doesNotMatch(PUSH_DEACTIVATION_SOURCE, /\b(?:localStorage|sessionStorage|indexedDB|caches)\b/u);
  assert.doesNotMatch(PUSH_DEACTIVATION_SOURCE, /\b(?:console|logger|Sentry)\./u);
  assert.doesNotMatch(
    PUSH_DEACTIVATION_SOURCE,
    /\b(?:AbortSignal\.timeout|setTimeout|setInterval|queueMicrotask|Math\.random)\b/u
  );
  assert.doesNotMatch(PUSH_DEACTIVATION_SOURCE, /\b(?:for|while)\s*\(/u);
});

test("the dormant Push Auth-failure coordinator has no direct Auth, runtime, queue, or scheduling dependency", () => {
  assert.doesNotMatch(PUSH_AUTH_FAILURE_COORDINATOR_SOURCE, /\b(?:import|export)\s+[^;]*\bfrom\s+["']/u);
  assert.doesNotMatch(PUSH_AUTH_FAILURE_COORDINATOR_SOURCE, /^\s*import\s+["']/gmu);
  assert.doesNotMatch(PUSH_AUTH_FAILURE_COORDINATOR_SOURCE, /\bimport\s*\(/u);
  assert.doesNotMatch(
    PUSH_AUTH_FAILURE_COORDINATOR_SOURCE,
    /\b(?:dataApi|supabaseClient|notificationPushStorage|notificationPushCleanupCoordinator|notificationPushCleanupTransport|notificationPushOwnerQuarantine)\b/u
  );
  assert.doesNotMatch(
    PUSH_AUTH_FAILURE_COORDINATOR_SOURCE,
    /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/u
  );
  assert.doesNotMatch(
    PUSH_AUTH_FAILURE_COORDINATOR_SOURCE,
    /\b(?:localStorage|sessionStorage|indexedDB|caches|listPendingPushCleanups)\b/u
  );
  assert.doesNotMatch(
    PUSH_AUTH_FAILURE_COORDINATOR_SOURCE,
    /\b(?:access_token|refresh_token|onAuthStateChange|AuthVerificationResult|SIGNED_OUT|anonymous|superseded)\b/u
  );
  assert.doesNotMatch(PUSH_AUTH_FAILURE_COORDINATOR_SOURCE, /\b(?:console|logger|Sentry)\./u);
  assert.doesNotMatch(
    PUSH_AUTH_FAILURE_COORDINATOR_SOURCE,
    /\b(?:AbortSignal\.timeout|setTimeout|setInterval|queueMicrotask|Math\.random)\b/u
  );
  assert.doesNotMatch(PUSH_AUTH_FAILURE_COORDINATOR_SOURCE, /\b(?:for|while)\s*\(/u);
});

test("the dormant Push Auth correlation adapter has no direct Auth, network, storage, or scheduling dependency", () => {
  assert.doesNotMatch(PUSH_AUTH_CORRELATION_SOURCE, /\b(?:import|export)\s+[^;]*\bfrom\s+["']/u);
  assert.doesNotMatch(PUSH_AUTH_CORRELATION_SOURCE, /^\s*import\s+["']/gmu);
  assert.doesNotMatch(PUSH_AUTH_CORRELATION_SOURCE, /\bimport\s*\(/u);
  assert.doesNotMatch(
    PUSH_AUTH_CORRELATION_SOURCE,
    /\b(?:dataApi|supabaseClient|notificationPushStorage|notificationPushAuthFailureCoordinator|notificationPushCleanupCoordinator|notificationPushCleanupTransport|notificationPushOwnerQuarantine)\b/u
  );
  assert.doesNotMatch(PUSH_AUTH_CORRELATION_SOURCE, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/u);
  assert.doesNotMatch(PUSH_AUTH_CORRELATION_SOURCE, /\b(?:localStorage|sessionStorage|indexedDB|caches)\b/u);
  assert.doesNotMatch(PUSH_AUTH_CORRELATION_SOURCE, /\b(?:access_token|refresh_token|onAuthStateChange|SIGNED_OUT)\b/u);
  assert.doesNotMatch(PUSH_AUTH_CORRELATION_SOURCE, /\b(?:console|logger|Sentry)\./u);
  assert.doesNotMatch(
    PUSH_AUTH_CORRELATION_SOURCE,
    /\b(?:AbortSignal\.timeout|setTimeout|setInterval|queueMicrotask|Math\.random)\b/u
  );
  assert.doesNotMatch(PUSH_AUTH_CORRELATION_SOURCE, /\b(?:for|while)\s*\(/u);
});

test("the dormant manual re-enable coordinator has no direct runtime, network, storage, log, or timer dependency", () => {
  assert.doesNotMatch(PUSH_MANUAL_REENABLE_SOURCE, /\b(?:import|export)\s+[^;]*\bfrom\s+["']/u);
  assert.doesNotMatch(PUSH_MANUAL_REENABLE_SOURCE, /^\s*import\s+["']/gmu);
  assert.doesNotMatch(PUSH_MANUAL_REENABLE_SOURCE, /\bimport\s*\(/u);
  assert.doesNotMatch(
    PUSH_MANUAL_REENABLE_SOURCE,
    /\b(?:dataApi|supabaseClient|notificationPushStorage|notificationPushAuthFailureCoordinator|notificationPushCleanupCoordinator|notificationPushCleanupTransport|notificationPushOwnerQuarantine)\b/u
  );
  assert.doesNotMatch(PUSH_MANUAL_REENABLE_SOURCE, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/u);
  assert.doesNotMatch(PUSH_MANUAL_REENABLE_SOURCE, /\b(?:localStorage|sessionStorage|indexedDB|caches)\b/u);
  assert.doesNotMatch(PUSH_MANUAL_REENABLE_SOURCE, /\b(?:access_token|refresh_token|onAuthStateChange|SIGNED_OUT)\b/u);
  assert.doesNotMatch(PUSH_MANUAL_REENABLE_SOURCE, /\b(?:console|logger|Sentry)\./u);
  assert.doesNotMatch(
    PUSH_MANUAL_REENABLE_SOURCE,
    /\b(?:AbortSignal\.timeout|setTimeout|setInterval|queueMicrotask|Math\.random)\b/u
  );
  assert.doesNotMatch(PUSH_MANUAL_REENABLE_SOURCE, /\b(?:for|while)\s*\(/u);
});

test("the dormant owner-quarantine adapter has no secret, storage, network, logging, or timer dependency", () => {
  assert.doesNotMatch(PUSH_OWNER_QUARANTINE_SOURCE, /\b(?:import|export)\s+[^;]*\bfrom\s+["']/u);
  assert.doesNotMatch(PUSH_OWNER_QUARANTINE_SOURCE, /^\s*import\s+["']/gmu);
  assert.doesNotMatch(PUSH_OWNER_QUARANTINE_SOURCE, /\bimport\s*\(/u);
  assert.doesNotMatch(
    PUSH_OWNER_QUARANTINE_SOURCE,
    /\b(?:dataApi|supabaseClient|notificationPushStorage|notificationPushCleanupTransport)\b/u
  );
  assert.doesNotMatch(PUSH_OWNER_QUARANTINE_SOURCE, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/u);
  assert.doesNotMatch(PUSH_OWNER_QUARANTINE_SOURCE, /\b(?:localStorage|sessionStorage|indexedDB|caches)\b/u);
  assert.doesNotMatch(PUSH_OWNER_QUARANTINE_SOURCE, /\bconsole\.|\b(?:Authorization|apikey|cleanupToken|p256dh)\b/u);
  assert.doesNotMatch(
    PUSH_OWNER_QUARANTINE_SOURCE,
    /\b(?:AbortSignal\.timeout|setTimeout|setInterval|queueMicrotask|Math\.random)\b/u
  );
});
