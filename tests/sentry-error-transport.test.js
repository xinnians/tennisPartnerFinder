import assert from "node:assert/strict";
import test from "node:test";

import { captureAppError } from "../src/appErrors.ts";
import { configureSentryErrorTransport } from "../src/sentryErrorTransport.ts";

const ALLOWED_EVENT_KEYS = new Set([
  "tags",
  "event_id",
  "timestamp",
  "platform",
  "environment",
  "sdk",
  "contexts",
  "breadcrumbs",
]);
const PRIVATE_CANARIES = /private@example\.test|25\.1,121\.5|私密暱稱|LINE=private-line-id/i;

function eventFromEnvelope(envelope) {
  const eventItem = envelope[1].find(([headers]) => headers.type === "event");
  assert.ok(eventItem, "Sentry transport did not receive an event item");
  return eventItem[1];
}

test("the real Sentry envelope keeps only approved protocol fields and no app PII", async () => {
  let resolveEnvelope;
  let observedOptions;
  const receivedEnvelope = new Promise((resolve) => {
    resolveEnvelope = resolve;
  });
  const actualSdk = await import("@sentry/browser");
  const configured = configureSentryErrorTransport({
    dsn: "https://public@example.ingest.sentry.io/1",
    environment: "preview",
    testing: {
      loadSdk: async () => ({
        captureEvent: actualSdk.captureEvent,
        init: (options) => {
          observedOptions = options;
          return actualSdk.init(options);
        },
      }),
      transport: () => ({
        send: (envelope) => {
          resolveEnvelope(envelope);
          return Promise.resolve({ statusCode: 200 });
        },
        flush: () => Promise.resolve(true),
      }),
    },
  });

  assert.equal(await configured.ready, true);
  const privateError = Object.assign(
    new Error("private@example.test GPS=25.1,121.5 nickname=私密暱稱 LINE=private-line-id"),
    { stack: "roster private@example.test 25.1,121.5" }
  );
  captureAppError("react-render", "session-detail-sheet", privateError);
  const envelope = await Promise.race([
    receivedEnvelope,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Sentry envelope timed out")), 3_000)),
  ]);
  configured.restore();

  const event = eventFromEnvelope(envelope);
  assert.doesNotMatch(JSON.stringify(envelope), PRIVATE_CANARIES);
  const unexpectedKeys = Object.keys(event).filter((key) => !ALLOWED_EVENT_KEYS.has(key));
  assert.deepEqual(unexpectedKeys, []);
  assert.deepEqual(event.tags, {
    errorName: "Error",
    kind: "react-render",
    surface: "session-detail-sheet",
  });
  assert.deepEqual(event.breadcrumbs, []);
  assert.equal(event.environment, "preview");
  assert.equal(event.sdk?.settings?.infer_ip, "never");

  assert.equal(observedOptions.defaultIntegrations, false);
  assert.deepEqual(observedOptions.integrations, []);
  assert.equal(observedOptions.sendDefaultPii, false);
  assert.equal(observedOptions.autoSessionTracking, false);
  assert.equal(observedOptions.maxBreadcrumbs, 0);
  assert.equal(observedOptions.enableLogs, false);
  assert.equal(observedOptions.sendClientReports, false);
  assert.equal(observedOptions.tracesSampleRate, undefined);
  assert.equal(observedOptions.tracesSampler, undefined);
  assert.equal(observedOptions.replaysSessionSampleRate, 0);
  assert.equal(observedOptions.replaysOnErrorSampleRate, 0);
  assert.equal(observedOptions.profilesSampleRate, 0);
  assert.equal(observedOptions.profileSessionSampleRate, 0);
  assert.deepEqual(observedOptions.dataCollection, {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: false, response: false },
    httpBodies: [],
    urlQueryParams: false,
    graphQL: { document: false, variables: false },
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    stackFrameVariables: false,
    frameContextLines: 0,
  });
});

test("an empty Sentry DSN loads no SDK, sends no request, and writes no console output", async () => {
  const originalFetch = globalThis.fetch;
  const originalConsole = {};
  const consoleCalls = [];
  let fetchCalls = 0;
  let loadCalls = 0;
  globalThis.fetch = () => {
    fetchCalls += 1;
    return Promise.reject(new Error("unexpected request"));
  };
  for (const method of ["debug", "error", "info", "log", "warn"]) {
    originalConsole[method] = console[method];
    console[method] = (...args) => consoleCalls.push([method, ...args]);
  }

  try {
    const configured = configureSentryErrorTransport({
      dsn: "   ",
      environment: "production",
      testing: {
        loadSdk: async () => {
          loadCalls += 1;
          throw new Error("SDK must not load");
        },
      },
    });
    captureAppError("window-error", "global", new Error("private@example.test"));
    assert.equal(await configured.ready, false);
    await new Promise((resolve) => setImmediate(resolve));
    configured.restore();

    assert.equal(loadCalls, 0);
    assert.equal(fetchCalls, 0);
    assert.deepEqual(consoleCalls, []);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [method, implementation] of Object.entries(originalConsole)) console[method] = implementation;
  }
});

test("Sentry capture and teardown failures remain NOOP-equivalent", async () => {
  const configured = configureSentryErrorTransport({
    dsn: "https://public@example.ingest.sentry.io/1",
    environment: "production",
    testing: {
      loadSdk: async () => ({
        captureEvent: () => {
          throw new Error("transport unavailable");
        },
        init: () => ({
          close: () => {
            throw new Error("teardown unavailable");
          },
        }),
      }),
    },
  });

  assert.equal(await configured.ready, true);
  assert.doesNotThrow(() => captureAppError("unhandled-rejection", "global", new Error("private detail")));
  assert.doesNotThrow(() => configured.restore());
});
