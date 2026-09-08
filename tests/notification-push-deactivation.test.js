import assert from "node:assert/strict";
import test from "node:test";

import {
  NotificationPushDeactivationError,
  PUSH_DEACTIVATION_ERROR_CODES,
  createNotificationPushDeactivation,
} from "../src/notificationPushDeactivation.ts";

function subscription(endpoint, unsubscribe) {
  return { endpoint, unsubscribe };
}

test("Push deactivation rejects a missing browser reader", () => {
  for (const options of [undefined, {}, { browser: {} }]) {
    assert.throws(
      () => createNotificationPushDeactivation(options),
      (error) =>
        error instanceof NotificationPushDeactivationError &&
        error.code === PUSH_DEACTIVATION_ERROR_CODES.INVALID_CONFIGURATION
    );
  }
});

test("an absent subscription completes after one read without unsubscribe", async () => {
  const calls = [];
  const deactivation = createNotificationPushDeactivation({
    browser: {
      async readCurrentSubscription() {
        calls.push("read");
        return null;
      },
    },
  });

  assert.deepEqual(await deactivation.deactivateCurrentSubscription(), { kind: "absent" });
  assert.deepEqual(calls, ["read"]);
});

test("a failed first read fails closed without a captured subscription", async () => {
  const deactivation = createNotificationPushDeactivation({
    browser: {
      async readCurrentSubscription() {
        throw new Error("opaque initial read failure");
      },
    },
  });

  assert.deepEqual(await deactivation.deactivateCurrentSubscription(), {
    captured: null,
    evidence: "unknown",
    kind: "unknown",
  });
});

test("an already-aborted signal touches no browser port", async () => {
  let reads = 0;
  const abortController = new AbortController();
  abortController.abort();
  const deactivation = createNotificationPushDeactivation({
    browser: {
      readCurrentSubscription: async () => {
        reads += 1;
        return null;
      },
    },
  });

  assert.deepEqual(await deactivation.deactivateCurrentSubscription({ signal: abortController.signal }), {
    captured: null,
    evidence: "unknown",
    kind: "unknown",
  });
  assert.equal(reads, 0);
});

test("abort releases a never-settling subscription read without a timer", async () => {
  const abortController = new AbortController();
  let reads = 0;
  const deactivation = createNotificationPushDeactivation({
    browser: {
      readCurrentSubscription: () => {
        reads += 1;
        abortController.abort();
        return new Promise(() => {});
      },
    },
  });

  assert.deepEqual(await deactivation.deactivateCurrentSubscription({ signal: abortController.signal }), {
    captured: null,
    evidence: "unknown",
    kind: "unknown",
  });
  assert.equal(reads, 1);
});

test("abort during unsubscribe returns unknown without a second browser read", async () => {
  const abortController = new AbortController();
  let reads = 0;
  const captured = subscription("https://push.example/subscription-a", () => {
    abortController.abort();
    return new Promise(() => {});
  });
  const deactivation = createNotificationPushDeactivation({
    browser: {
      readCurrentSubscription: async () => {
        reads += 1;
        return captured;
      },
    },
  });

  assert.deepEqual(await deactivation.deactivateCurrentSubscription({ signal: abortController.signal }), {
    captured,
    evidence: "unknown",
    kind: "unknown",
  });
  assert.equal(reads, 1);
});

test("a malformed signal fails closed before reading", async () => {
  let reads = 0;
  const deactivation = createNotificationPushDeactivation({
    browser: {
      readCurrentSubscription: async () => {
        reads += 1;
        return null;
      },
    },
  });

  assert.deepEqual(await deactivation.deactivateCurrentSubscription({ signal: { aborted: false } }), {
    captured: null,
    evidence: "unknown",
    kind: "unknown",
  });
  assert.equal(reads, 0);
});

for (const [returned, evidence] of [
  [true, "deactivation-started"],
  [false, "already-inactive"],
]) {
  test(`a ${String(returned)} unsubscribe is classified only after the subscription disappears`, async () => {
    const calls = [];
    const captured = subscription("https://push.example/subscription-a", async () => {
      calls.push("unsubscribe");
      return returned;
    });
    const readings = [captured, null];
    const deactivation = createNotificationPushDeactivation({
      browser: {
        async readCurrentSubscription() {
          calls.push("read");
          return readings.shift();
        },
      },
    });

    assert.deepEqual(await deactivation.deactivateCurrentSubscription(), {
      captured,
      evidence,
      kind: "deactivated",
    });
    assert.deepEqual(calls, ["read", "unsubscribe", "read"]);
  });
}

test("a thrown unsubscribe can still be proven deactivated by the required reread", async () => {
  const failure = new Error("opaque browser failure");
  const captured = subscription("https://push.example/subscription-a", async () => {
    throw failure;
  });
  const readings = [captured, null];
  const deactivation = createNotificationPushDeactivation({
    browser: { readCurrentSubscription: async () => readings.shift() },
  });

  assert.deepEqual(await deactivation.deactivateCurrentSubscription(), {
    captured,
    evidence: "unknown",
    kind: "deactivated",
  });
});

test("a non-boolean unsubscribe result cannot override a proven absent reread", async () => {
  const captured = subscription("https://push.example/subscription-a", async () => "not-a-boolean");
  const readings = [captured, null];
  const deactivation = createNotificationPushDeactivation({
    browser: { readCurrentSubscription: async () => readings.shift() },
  });

  assert.deepEqual(await deactivation.deactivateCurrentSubscription(), {
    captured,
    evidence: "unknown",
    kind: "deactivated",
  });
});

test("an exact same endpoint after unsubscribe stays unknown", async () => {
  const captured = subscription("https://push.example/subscription-a", async () => true);
  const current = subscription(captured.endpoint, async () => true);
  const readings = [captured, current];
  const deactivation = createNotificationPushDeactivation({
    browser: { readCurrentSubscription: async () => readings.shift() },
  });

  assert.deepEqual(await deactivation.deactivateCurrentSubscription(), {
    captured,
    evidence: "deactivation-started",
    kind: "unknown",
  });
});

test("a different exact endpoint is returned only as a replacement", async () => {
  const captured = subscription("https://push.example/subscription-a", async () => false);
  const current = subscription("https://push.example/subscription-b", async () => true);
  const readings = [captured, current];
  const deactivation = createNotificationPushDeactivation({
    browser: { readCurrentSubscription: async () => readings.shift() },
  });

  assert.deepEqual(await deactivation.deactivateCurrentSubscription(), {
    captured,
    current,
    evidence: "already-inactive",
    kind: "replaced",
  });
});

test("a malformed first read fails closed without calling unsubscribe or reading again", async () => {
  let reads = 0;
  const malformed = { endpoint: "https://push.example/subscription-a" };
  const deactivation = createNotificationPushDeactivation({
    browser: {
      async readCurrentSubscription() {
        reads += 1;
        return malformed;
      },
    },
  });

  assert.deepEqual(await deactivation.deactivateCurrentSubscription(), {
    captured: null,
    evidence: "unknown",
    kind: "unknown",
  });
  assert.equal(reads, 1);
});

test("a failed or malformed second read keeps the captured subscription unknown", async (t) => {
  for (const [name, secondRead] of [
    ["throw", () => Promise.reject(new Error("opaque reread failure"))],
    ["malformed", async () => ({ endpoint: "" })],
  ]) {
    await t.test(name, async () => {
      const captured = subscription("https://push.example/subscription-a", async () => "not-a-boolean");
      let reads = 0;
      const deactivation = createNotificationPushDeactivation({
        browser: {
          async readCurrentSubscription() {
            reads += 1;
            return reads === 1 ? captured : secondRead();
          },
        },
      });

      assert.deepEqual(await deactivation.deactivateCurrentSubscription(), {
        captured,
        evidence: "unknown",
        kind: "unknown",
      });
      assert.equal(reads, 2);
    });
  }
});
