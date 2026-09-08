import assert from "node:assert/strict";
import test from "node:test";

import {
  createNotificationPushSignOutContinuation,
  NotificationPushSignOutContinuationError,
  PUSH_SIGN_OUT_CONTINUATION_ERROR_CODES,
} from "../src/notificationPushSignOutContinuation.ts";

function deferred() {
  let reject;
  let resolve;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    reject = rejectPromise;
    resolve = resolvePromise;
  });
  return { promise, reject, resolve };
}

test("configuration requires exact Push and current-device Auth ports", () => {
  for (const options of [
    undefined,
    {},
    { processPushSignOut: async () => {} },
    { signOutCurrentDevice: async () => {} },
    { processPushSignOut: null, signOutCurrentDevice: async () => {} },
  ]) {
    assert.throws(
      () => createNotificationPushSignOutContinuation(options),
      (error) =>
        error instanceof NotificationPushSignOutContinuationError &&
        error.code === PUSH_SIGN_OUT_CONTINUATION_ERROR_CODES.INVALID_CONFIGURATION
    );
  }
});

test("Push cleanup runs before Auth and its data-free result never controls Auth", async () => {
  for (const pushResult of [
    { kind: "completed" },
    { kind: "pending" },
    { kind: "ignored" },
    { private: "malformed" },
    null,
  ]) {
    const calls = [];
    const abortController = new AbortController();
    const continuation = createNotificationPushSignOutContinuation({
      processPushSignOut: async (input) => {
        calls.push(["push", input]);
        return pushResult;
      },
      signOutCurrentDevice: async () => {
        calls.push(["auth"]);
      },
    });

    assert.equal(await continuation.processCurrentDeviceSignOut({ signal: abortController.signal }), undefined);
    assert.deepEqual(calls, [["push", { signal: abortController.signal }], ["auth"]]);
  }
});

test("synchronous and asynchronous Push failures still continue to Auth", async () => {
  for (const processPushSignOut of [
    () => {
      throw new Error("private synchronous Push failure");
    },
    async () => {
      throw new Error("private asynchronous Push failure");
    },
  ]) {
    let authCalls = 0;
    const continuation = createNotificationPushSignOutContinuation({
      processPushSignOut,
      signOutCurrentDevice: async () => {
        authCalls += 1;
      },
    });

    await continuation.processCurrentDeviceSignOut();
    assert.equal(authCalls, 1);
  }
});

test("an already-aborted signal skips Push but still continues to Auth", async () => {
  const abortController = new AbortController();
  abortController.abort();
  let authCalls = 0;
  let pushCalls = 0;
  const continuation = createNotificationPushSignOutContinuation({
    processPushSignOut: async () => {
      pushCalls += 1;
    },
    signOutCurrentDevice: async () => {
      authCalls += 1;
    },
  });

  await continuation.processCurrentDeviceSignOut({ signal: abortController.signal });
  assert.equal(pushCalls, 0);
  assert.equal(authCalls, 1);
});

test("abort releases a never-settling Push operation and continues to Auth", async () => {
  const abortController = new AbortController();
  const calls = [];
  const continuation = createNotificationPushSignOutContinuation({
    processPushSignOut: () => {
      calls.push("push");
      return new Promise(() => {});
    },
    signOutCurrentDevice: async () => {
      calls.push("auth");
    },
  });

  const pending = continuation.processCurrentDeviceSignOut({ signal: abortController.signal });
  assert.deepEqual(calls, ["push"]);
  abortController.abort();
  await pending;
  assert.deepEqual(calls, ["push", "auth"]);
});

test("invalid input skips Push rather than risking an unbounded wait, then continues to Auth", async () => {
  for (const input of [null, { extra: true }, { signal: { aborted: false } }]) {
    let authCalls = 0;
    let pushCalls = 0;
    const continuation = createNotificationPushSignOutContinuation({
      processPushSignOut: async () => {
        pushCalls += 1;
      },
      signOutCurrentDevice: async () => {
        authCalls += 1;
      },
    });

    await continuation.processCurrentDeviceSignOut(input);
    assert.equal(pushCalls, 0);
    assert.equal(authCalls, 1);
  }
});

test("concurrent calls share one Push and one Auth operation", async () => {
  const push = deferred();
  const firstAbort = new AbortController();
  const duplicateAbort = new AbortController();
  let authCalls = 0;
  let pushCalls = 0;
  const continuation = createNotificationPushSignOutContinuation({
    processPushSignOut: ({ signal }) => {
      pushCalls += 1;
      assert.equal(signal, firstAbort.signal);
      return push.promise;
    },
    signOutCurrentDevice: async () => {
      authCalls += 1;
    },
  });

  const first = continuation.processCurrentDeviceSignOut({ signal: firstAbort.signal });
  const duplicate = continuation.processCurrentDeviceSignOut({ signal: duplicateAbort.signal });
  duplicateAbort.abort();
  assert.equal(first, duplicate);
  assert.equal(pushCalls, 1);
  assert.equal(authCalls, 0);

  push.resolve({ kind: "completed" });
  await first;
  assert.equal(authCalls, 1);
});

test("Auth failures stay authoritative, are shared, and reset single-flight for a retry", async () => {
  const firstAuth = deferred();
  let authCalls = 0;
  let pushCalls = 0;
  const continuation = createNotificationPushSignOutContinuation({
    processPushSignOut: async () => {
      pushCalls += 1;
      return { kind: "completed" };
    },
    signOutCurrentDevice: () => {
      authCalls += 1;
      return authCalls === 1 ? firstAuth.promise : Promise.resolve();
    },
  });

  const first = continuation.processCurrentDeviceSignOut();
  const duplicate = continuation.processCurrentDeviceSignOut();
  assert.equal(first, duplicate);
  firstAuth.reject(new Error("private Auth failure"));
  await assert.rejects(first, /private Auth failure/u);
  await assert.rejects(duplicate, /private Auth failure/u);
  assert.equal(authCalls, 1);
  assert.equal(pushCalls, 1);

  await continuation.processCurrentDeviceSignOut();
  assert.equal(authCalls, 2);
  assert.equal(pushCalls, 2);
});
