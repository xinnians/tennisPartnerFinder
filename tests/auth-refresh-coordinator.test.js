import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthApiError,
  AuthRefreshDiscardedError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from "@supabase/supabase-js";

import { resolveInitialSession } from "../src/data/authApi.ts";
import { createAuthRefreshCoordinator } from "../src/features/profile-auth/authRefreshCoordinator.ts";

function authSession(identity, token) {
  return {
    access_token: token,
    refresh_token: `refresh-${token}`,
    user: { id: identity },
  };
}

function deferred() {
  let reject;
  let resolve;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function createCoordinatorHarness(verifications, { onApplyCandidate } = {}) {
  const applied = [];
  const failures = [];
  const scheduled = [];
  const signals = { anonymous: 0, signedOut: 0, verified: 0, verifyCalls: 0 };
  const coordinator = createAuthRefreshCoordinator({
    applyCandidate: async (candidate, options) => {
      applied.push({ candidate, options });
      if (onApplyCandidate) await onApplyCandidate(candidate, options);
    },
    onConfirmedAnonymous: () => {
      signals.anonymous += 1;
    },
    onSignedOut: () => {
      signals.signedOut += 1;
    },
    onVerificationFailure: (failure) => {
      failures.push(failure);
    },
    onVerified: () => {
      signals.verified += 1;
    },
    schedule: (task) => scheduled.push(task),
    verifyCurrentSession: () => {
      signals.verifyCalls += 1;
      const next = verifications.shift();
      if (!next) throw new Error("unexpected auth verification");
      return typeof next === "function" ? next() : next;
    },
  });

  return {
    applied,
    coordinator,
    failures,
    async flushScheduled() {
      while (scheduled.length) {
        const tasks = scheduled.splice(0);
        for (const task of tasks) task();
        await new Promise((resolve) => setImmediate(resolve));
      }
    },
    scheduled,
    signals,
  };
}

test("verified Auth proof is readable only for the exact current verification revision", async () => {
  const verification = deferred();
  const accountA = authSession("account-a", "fresh-a");
  const harness = createCoordinatorHarness([() => verification.promise]);

  const restoring = harness.coordinator.restore();
  harness.coordinator.recordAuthEvent(accountA, "TOKEN_REFRESHED");
  verification.resolve({ kind: "verified", session: accountA });
  await restoring;
  await harness.flushScheduled();

  const proof = harness.coordinator.readVerifiedAuthProof({ authUserId: "account-a", revision: 1 });
  assert.deepEqual(proof, { accessToken: "fresh-a", authUserId: "account-a", revision: 1 });
  assert.equal(Object.isFrozen(proof), true);
  assert.deepEqual(harness.coordinator.readCurrentVerifiedAuthProof(), proof);
  assert.notEqual(harness.coordinator.readCurrentVerifiedAuthProof(), proof, "each read returns a short-lived copy");
  assert.equal(harness.coordinator.isVerificationRevisionCurrent(1), true);
  assert.equal(harness.coordinator.isVerifiedAuthProofCurrent(proof), true);
  assert.equal(harness.coordinator.readVerifiedAuthProof({ authUserId: "account-b", revision: 1 }), null);
  assert.equal(harness.coordinator.readVerifiedAuthProof({ authUserId: "account-a", revision: 0 }), null);
  assert.equal(harness.coordinator.isVerifiedAuthProofCurrent({ ...proof, accessToken: "cached-or-replaced" }), false);
  assert.equal(harness.coordinator.isVerifiedAuthProofCurrent({ ...proof, extra: "not-an-exact-proof" }), false);

  harness.coordinator.recordAuthEvent(accountA, "USER_UPDATED");
  assert.equal(harness.coordinator.isVerificationRevisionCurrent(1), false);
  assert.equal(harness.coordinator.isVerifiedAuthProofCurrent(proof), false);
  assert.equal(harness.coordinator.readCurrentVerifiedAuthProof(), null);
  assert.equal(harness.coordinator.readVerifiedAuthProof({ authUserId: "account-a", revision: 1 }), null);
});

test("an exact unauthorized notice re-verifies Auth and stale notices do nothing", async () => {
  const firstVerification = deferred();
  const secondVerification = deferred();
  const accountA1 = authSession("account-a", "fresh-a-1");
  const accountA2 = authSession("account-a", "fresh-a-2");
  const harness = createCoordinatorHarness([() => firstVerification.promise, () => secondVerification.promise]);

  const restoring = harness.coordinator.restore();
  harness.coordinator.recordAuthEvent(accountA1, "TOKEN_REFRESHED");
  firstVerification.resolve({ kind: "verified", session: accountA1 });
  await restoring;
  await harness.flushScheduled();

  const retrying = harness.coordinator.notifyUnauthorized({ authUserId: "account-a", revision: 1 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.signals.verifyCalls, 2);
  assert.equal(harness.coordinator.readVerifiedAuthProof({ authUserId: "account-a", revision: 1 }), null);
  assert.equal(harness.applied.at(-1).candidate, null);

  harness.coordinator.recordAuthEvent(accountA2, "TOKEN_REFRESHED");
  secondVerification.resolve({ kind: "verified", session: accountA2 });
  await retrying;
  await harness.flushScheduled();

  const refreshedProof = harness.coordinator.readVerifiedAuthProof({ authUserId: "account-a", revision: 2 });
  assert.deepEqual(refreshedProof, { accessToken: "fresh-a-2", authUserId: "account-a", revision: 2 });
  await harness.coordinator.notifyUnauthorized({ authUserId: "account-a", revision: 1 });
  await harness.coordinator.notifyUnauthorized({ authUserId: "account-b", revision: 2 });
  assert.equal(harness.signals.verifyCalls, 2, "stale or foreign notices cannot start another Auth request");
});

test("Auth failure notices expose only stable kind, revision, and an optional prior verified owner", async () => {
  const initial = deferred();
  const accountA = authSession("account-a", "fresh-a");
  const unavailableError = new Error("must not leave the Auth boundary");
  const rejectedError = new Error("must not leave the Auth boundary");
  const harness = createCoordinatorHarness([
    () => initial.promise,
    Promise.resolve({ error: unavailableError, kind: "unavailable", session: null }),
    Promise.resolve({ error: rejectedError, kind: "rejected", session: null }),
  ]);

  const restoring = harness.coordinator.restore();
  harness.coordinator.recordAuthEvent(accountA, "TOKEN_REFRESHED");
  initial.resolve({ kind: "verified", session: accountA });
  await restoring;
  await harness.flushScheduled();

  await harness.coordinator.retry();
  await harness.coordinator.retry();

  assert.deepEqual(harness.failures, [
    { kind: "unavailable", priorVerifiedAuthUserId: "account-a", revision: 1 },
    { kind: "rejected", priorVerifiedAuthUserId: "account-a", revision: 1 },
  ]);
  for (const failure of harness.failures) {
    assert.equal(Object.isFrozen(failure), true);
    assert.deepEqual(Object.keys(failure), ["kind", "priorVerifiedAuthUserId", "revision"]);
    assert.equal(JSON.stringify(failure).includes("must not leave"), false);
    assert.equal(JSON.stringify(failure).includes("fresh-a"), false);
  }
});

test("cold Auth failure has no invented owner and a newer event suppresses stale failure notice", async () => {
  const coldHarness = createCoordinatorHarness([
    Promise.resolve({ error: new Error("offline"), kind: "unavailable", session: null }),
  ]);
  await coldHarness.coordinator.restore();
  assert.deepEqual(coldHarness.failures, [{ kind: "unavailable", revision: 0 }]);
  assert.deepEqual(Object.keys(coldHarness.failures[0]), ["kind", "revision"]);

  const verification = deferred();
  const applyStarted = deferred();
  const releaseApply = deferred();
  const supersededHarness = createCoordinatorHarness([() => verification.promise], {
    async onApplyCandidate(candidate) {
      if (candidate !== null) return;
      applyStarted.resolve();
      await releaseApply.promise;
    },
  });
  const restoring = supersededHarness.coordinator.restore();
  verification.resolve({ error: new Error("offline"), kind: "unavailable", session: null });
  await applyStarted.promise;
  supersededHarness.coordinator.recordAuthEvent(authSession("account-b", "cached-b"), "SIGNED_IN");
  releaseApply.resolve();
  await restoring;
  assert.deepEqual(supersededHarness.failures, []);
});

function refreshClient({
  current = authSession("account-a", "cached"),
  error = null,
  fresh = null,
  initializationError = null,
} = {}) {
  let refreshCalls = 0;
  return {
    client: {
      auth: {
        async initialize() {
          return { error: initializationError };
        },
        async getSession() {
          return { data: { session: current }, error: null };
        },
        async refreshSession() {
          refreshCalls += 1;
          return { data: { session: fresh }, error };
        },
      },
    },
    get refreshCalls() {
      return refreshCalls;
    },
  };
}

test("auth data boundary forces a server refresh and never returns the cached session", async () => {
  const cached = authSession("account-a", "cached");
  const fresh = authSession("account-a", "fresh");
  const harness = refreshClient({ current: cached, fresh });

  assert.deepEqual(await resolveInitialSession(harness.client), { kind: "verified", session: fresh });
  assert.equal(harness.refreshCalls, 1);
});

test("auth data boundary only reports anonymous when no refresh credential evidence exists", async () => {
  const noSessionClient = {
    auth: {
      async initialize() {
        return { error: null };
      },
      async getSession() {
        return { data: { session: null }, error: null };
      },
    },
  };

  assert.deepEqual(await resolveInitialSession(noSessionClient), { kind: "anonymous", session: null });
  assert.deepEqual(
    await resolveInitialSession(noSessionClient, JSON.stringify({ refresh_token: "boot-refresh" })),
    { error: null, kind: "unavailable", session: null },
    "a credential removed during auth initialization must not be guessed to be anonymous"
  );
  assert.deepEqual(await resolveInitialSession(noSessionClient, null, true), {
    error: null,
    kind: "unavailable",
    session: null,
  });
});

test("observed refresh evidence rejects only known 4xx codes with boot credential evidence", async () => {
  const noSessionClient = {
    auth: {
      async initialize() {
        return { error: null };
      },
      async getSession() {
        return { data: { session: null }, error: null };
      },
    },
  };
  const rejectedEvidence = {
    code: "refresh_token_not_found",
    kind: "api-error",
    revision: 1,
    status: 400,
  };
  assert.deepEqual(await resolveInitialSession(noSessionClient, null, true, () => rejectedEvidence), {
    error: rejectedEvidence,
    kind: "rejected",
    session: null,
  });
  assert.deepEqual(await resolveInitialSession(noSessionClient, null, false, () => rejectedEvidence), {
    kind: "anonymous",
    session: null,
  });

  for (const evidence of [
    { ...rejectedEvidence, kind: "pending", status: null },
    { ...rejectedEvidence, kind: "network-error", status: 0 },
    { ...rejectedEvidence, kind: "api-error", status: 503 },
    { ...rejectedEvidence, code: "user_banned" },
  ]) {
    assert.deepEqual(await resolveInitialSession(noSessionClient, null, true, () => evidence), {
      error: null,
      kind: "unavailable",
      session: null,
    });
  }
});

test("auth refresh classification uses exact evidence and keeps ambiguous errors unavailable", async (t) => {
  for (const code of ["refresh_token_already_used", "refresh_token_not_found", "session_expired"]) {
    await t.test(`${code} is an explicit rejection`, async () => {
      const error = new AuthApiError(code, 400, code);
      const harness = refreshClient({ error });
      assert.deepEqual(await resolveInitialSession(harness.client), { error, kind: "rejected", session: null });
    });
  }

  const discarded = new AuthRefreshDiscardedError();
  assert.deepEqual(await resolveInitialSession(refreshClient({ error: discarded }).client), {
    error: discarded,
    kind: "superseded",
    session: null,
  });

  for (const status of [0, 500, 504, 520, 530]) {
    const error = new AuthRetryableFetchError("temporary", status);
    assert.deepEqual(await resolveInitialSession(refreshClient({ error }).client), {
      error,
      kind: "unavailable",
      session: null,
    });
  }

  for (const [status, code] of [
    [400, "bad_jwt"],
    [400, "user_banned"],
    [400, "validation_failed"],
    [408, "request_timeout"],
    [409, "conflict"],
    [429, "over_request_rate_limit"],
    [500, "refresh_token_not_found"],
  ]) {
    const error = new AuthApiError(code, status, code);
    assert.deepEqual(await resolveInitialSession(refreshClient({ error }).client), {
      error,
      kind: "unavailable",
      session: null,
    });
  }

  const ambiguousMissing = new AuthSessionMissingError();
  assert.deepEqual(await resolveInitialSession(refreshClient({ error: ambiguousMissing }).client), {
    error: ambiguousMissing,
    kind: "unavailable",
    session: null,
  });
});

test("an initialization error without a session is unavailable, not anonymous", async () => {
  const initializationError = new AuthApiError("bad_code_verifier", 400, "bad_code_verifier");
  const harness = refreshClient({ current: null, initializationError });

  assert.deepEqual(await resolveInitialSession(harness.client), {
    error: initializationError,
    kind: "unavailable",
    session: null,
  });
  assert.equal(harness.refreshCalls, 0);
});

test("an initialization error does not bypass refresh when a current session exists", async () => {
  const initializationError = new AuthApiError("bad_code_verifier", 400, "bad_code_verifier");
  const fresh = authSession("account-a", "fresh");
  const harness = refreshClient({ fresh, initializationError });

  assert.deepEqual(await resolveInitialSession(harness.client), { kind: "verified", session: fresh });
  assert.equal(harness.refreshCalls, 1);
});

test("auth data boundary fails closed on a null or ownerless refresh result", async () => {
  assert.deepEqual(await resolveInitialSession(refreshClient({ fresh: null }).client), {
    error: null,
    kind: "unavailable",
    session: null,
  });
  assert.deepEqual(await resolveInitialSession(refreshClient({ fresh: { access_token: "fresh", user: {} } }).client), {
    error: null,
    kind: "unavailable",
    session: null,
  });
  assert.deepEqual(
    await resolveInitialSession(refreshClient({ fresh: { access_token: "", user: { id: "account-a" } } }).client),
    { error: null, kind: "unavailable", session: null }
  );
});

test("cached auth events remain private-closed until the matching TOKEN_REFRESHED event", async () => {
  const verification = deferred();
  const cached = authSession("account-a", "cached");
  const fresh = authSession("account-a", "fresh");
  const harness = createCoordinatorHarness([() => verification.promise]);

  const restoring = harness.coordinator.restore();
  harness.coordinator.recordAuthEvent(cached, "SIGNED_IN");
  harness.coordinator.recordAuthEvent(cached, "INITIAL_SESSION");
  assert.equal(harness.applied.length, 0, "the auth callback only records and schedules work");
  await harness.flushScheduled();
  assert.deepEqual(harness.applied, [
    {
      candidate: null,
      options: { forcePublic: false, reconcilePageOwner: false },
    },
  ]);

  harness.coordinator.recordAuthEvent(fresh, "TOKEN_REFRESHED");
  verification.resolve({ kind: "verified", session: fresh });
  await restoring;

  assert.deepEqual(
    harness.applied.filter(({ candidate }) => candidate?.user?.id).map(({ candidate }) => candidate.access_token),
    ["fresh"]
  );
  assert.equal(harness.signals.verified, 1);

  await harness.flushScheduled();
  assert.deepEqual(
    harness.applied.filter(({ candidate }) => candidate?.user?.id).map(({ candidate }) => candidate.access_token),
    ["fresh"],
    "delayed cached-event tasks cannot overwrite the published fresh result"
  );
});

test("a cached SIGNED_IN cannot override a confirmed-anonymous boot result", async () => {
  const bootVerification = deferred();
  const cached = authSession("account-a", "cached");
  const harness = createCoordinatorHarness([
    () => bootVerification.promise,
    Promise.resolve({ error: new Error("offline"), kind: "unavailable", session: null }),
    Promise.resolve({ error: new Error("still offline"), kind: "unavailable", session: null }),
  ]);

  const restoring = harness.coordinator.restore();
  harness.coordinator.recordAuthEvent(cached, "SIGNED_IN");
  bootVerification.resolve({ kind: "anonymous", session: null });
  await restoring;
  await harness.flushScheduled();

  assert.equal(
    harness.signals.verifyCalls,
    3,
    "the newer cached event and its deferred task both re-read authority instead of trusting the cache"
  );
  assert.equal(
    harness.applied.some(({ candidate }) => candidate?.user?.id),
    false
  );
  assert.equal(harness.signals.anonymous, 0, "a superseded anonymous result cannot clear the boot intent");
});

test("SIGNED_OUT is a barrier that a late refresh result cannot reopen", async () => {
  const verification = deferred();
  const accountA = authSession("account-a", "fresh-a");
  const harness = createCoordinatorHarness([() => verification.promise]);
  const restoring = harness.coordinator.restore();

  harness.coordinator.recordAuthEvent(null, "SIGNED_OUT");
  assert.equal(harness.signals.signedOut, 0, "the auth callback itself has no external side effects");
  await harness.flushScheduled();
  assert.equal(harness.signals.signedOut, 1);

  verification.resolve({ kind: "verified", session: accountA });
  await restoring;
  assert.equal(
    harness.applied.some(({ candidate }) => candidate?.user?.id),
    false
  );
  assert.equal(harness.signals.signedOut, 1, "one SIGNED_OUT event clears intent once");

  harness.coordinator.recordAuthEvent(accountA, "TOKEN_REFRESHED");
  await harness.flushScheduled();
  assert.equal(
    harness.applied.some(({ candidate }) => candidate?.user?.id),
    false,
    "TOKEN_REFRESHED without a newer sign-in cannot cross the sign-out barrier"
  );
});

test("SIGNED_OUT during a pending verified publication leaves the final state public", async () => {
  const verification = deferred();
  const applyStarted = deferred();
  const releaseApply = deferred();
  const accountA = authSession("account-a", "fresh-a");
  const harness = createCoordinatorHarness([() => verification.promise], {
    async onApplyCandidate(candidate) {
      if (candidate?.access_token !== accountA.access_token) return;
      applyStarted.resolve();
      await releaseApply.promise;
    },
  });

  const restoring = harness.coordinator.restore();
  harness.coordinator.recordAuthEvent(accountA, "TOKEN_REFRESHED");
  verification.resolve({ kind: "verified", session: accountA });
  await applyStarted.promise;

  harness.coordinator.recordAuthEvent(null, "SIGNED_OUT");
  await harness.flushScheduled();
  assert.equal(harness.applied.at(-1).candidate, null);

  releaseApply.resolve();
  await restoring;
  assert.equal(harness.applied.at(-1).candidate, null);
  assert.equal(harness.signals.signedOut, 1);
  assert.equal(harness.signals.verified, 0, "the superseded publication never emits a verified signal");
});

test("an account switch during a pending publication re-verifies and finishes on the new account", async () => {
  const verifyA = deferred();
  const verifyB = deferred();
  const applyAStarted = deferred();
  const releaseApplyA = deferred();
  const accountA = authSession("account-a", "fresh-a");
  const cachedB = authSession("account-b", "cached-b");
  const freshB = authSession("account-b", "fresh-b");
  const harness = createCoordinatorHarness([() => verifyA.promise, () => verifyB.promise], {
    async onApplyCandidate(candidate) {
      if (candidate?.access_token !== accountA.access_token) return;
      applyAStarted.resolve();
      await releaseApplyA.promise;
    },
  });

  const restoring = harness.coordinator.restore();
  harness.coordinator.recordAuthEvent(accountA, "TOKEN_REFRESHED");
  verifyA.resolve({ kind: "verified", session: accountA });
  await applyAStarted.promise;

  harness.coordinator.recordAuthEvent(cachedB, "SIGNED_IN");
  await harness.flushScheduled();
  assert.equal(harness.applied.at(-1).candidate, null);
  releaseApplyA.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.signals.verifyCalls, 2);

  harness.coordinator.recordAuthEvent(freshB, "TOKEN_REFRESHED");
  verifyB.resolve({ kind: "verified", session: freshB });
  await restoring;
  await harness.flushScheduled();

  assert.equal(harness.applied.at(-1).candidate?.user?.id, "account-b");
  assert.equal(harness.signals.verified, 1, "only the new account reaches the verified signal");
});

test("an A refresh superseded by SIGNED_IN B re-verifies and publishes only B", async () => {
  const verifyA = deferred();
  const verifyB = deferred();
  const accountB = authSession("account-b", "fresh-b");
  const harness = createCoordinatorHarness([() => verifyA.promise, () => verifyB.promise]);
  const restoring = harness.coordinator.restore();

  harness.coordinator.recordAuthEvent(authSession("account-b", "cached-b"), "SIGNED_IN");
  verifyA.resolve({ error: new AuthRefreshDiscardedError(), kind: "superseded", session: null });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.signals.verifyCalls, 2, "the newer account is verified without an arbitrary retry timer");

  harness.coordinator.recordAuthEvent(accountB, "TOKEN_REFRESHED");
  verifyB.resolve({ kind: "verified", session: accountB });
  await restoring;
  await harness.flushScheduled();

  assert.deepEqual(
    harness.applied.filter(({ candidate }) => candidate?.user?.id).map(({ candidate }) => candidate.user.id),
    ["account-b"]
  );
});

test("a superseded refresh without a newer event immediately re-reads once", async () => {
  const reread = deferred();
  const fresh = authSession("account-a", "fresh");
  const harness = createCoordinatorHarness([
    Promise.resolve({ error: new AuthRefreshDiscardedError(), kind: "superseded", session: null }),
    () => reread.promise,
  ]);

  const restoring = harness.coordinator.restore();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.signals.verifyCalls, 2, "the stable auth state is re-read without waiting for an event");
  assert.equal(
    harness.applied.some(({ candidate }) => candidate?.user?.id),
    false,
    "a discarded result never opens private state"
  );

  harness.coordinator.recordAuthEvent(fresh, "TOKEN_REFRESHED");
  reread.resolve({ kind: "verified", session: fresh });
  await restoring;
  await harness.flushScheduled();

  assert.deepEqual(
    harness.applied.filter(({ candidate }) => candidate?.user?.id).map(({ candidate }) => candidate.access_token),
    ["fresh"]
  );
});

test("consecutive superseded results stop after one stable-state reread and resume on a new event", async () => {
  const eventDrivenVerification = deferred();
  const cached = authSession("account-a", "cached");
  const fresh = authSession("account-a", "fresh");
  const superseded = () =>
    Promise.resolve({ error: new AuthRefreshDiscardedError(), kind: "superseded", session: null });
  const harness = createCoordinatorHarness([superseded(), superseded(), () => eventDrivenVerification.promise]);

  await harness.coordinator.restore();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.signals.verifyCalls, 2, "the coordinator has no unbounded local retry loop");

  harness.coordinator.recordAuthEvent(cached, "SIGNED_IN");
  await harness.flushScheduled();
  assert.equal(harness.signals.verifyCalls, 3, "a newer auth event starts a new bounded verification cycle");

  harness.coordinator.recordAuthEvent(fresh, "TOKEN_REFRESHED");
  eventDrivenVerification.resolve({ kind: "verified", session: fresh });
  await harness.flushScheduled();
  assert.equal(harness.signals.verified, 1);
});

test("same-proof TOKEN_REFRESHED events share an in-flight candidate publication", async () => {
  const bootVerification = deferred();
  const applyStarted = deferred();
  const releaseApply = deferred();
  const initial = authSession("account-a", "fresh-1");
  const rotated = authSession("account-a", "fresh-2");
  let rotatedApplyCalls = 0;
  const harness = createCoordinatorHarness([() => bootVerification.promise], {
    async onApplyCandidate(candidate) {
      if (candidate?.access_token !== rotated.access_token) return;
      rotatedApplyCalls += 1;
      applyStarted.resolve();
      await releaseApply.promise;
    },
  });

  const restoring = harness.coordinator.restore();
  harness.coordinator.recordAuthEvent(initial, "TOKEN_REFRESHED");
  bootVerification.resolve({ kind: "verified", session: initial });
  await restoring;
  await harness.flushScheduled();
  assert.equal(harness.signals.verified, 1);

  harness.coordinator.recordAuthEvent(rotated, "TOKEN_REFRESHED");
  harness.scheduled.shift()();
  await applyStarted.promise;

  harness.coordinator.recordAuthEvent(rotated, "TOKEN_REFRESHED");
  harness.scheduled.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(rotatedApplyCalls, 1, "the duplicate waits for the first publication");

  releaseApply.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    harness.applied.filter(({ candidate }) => candidate?.user?.id).map(({ candidate }) => candidate.access_token),
    ["fresh-1", "fresh-2"]
  );
  assert.equal(harness.signals.verified, 2, "the duplicate does not emit a second verified signal");
  assert.deepEqual(harness.coordinator.readCurrentVerifiedAuthProof(), {
    accessToken: "fresh-2",
    authUserId: "account-a",
    revision: 3,
  });
});

test("a stale scheduled cached event cannot clear a fresh candidate while its apply is pending", async () => {
  const verification = deferred();
  const freshApplyStarted = deferred();
  const releaseFreshApply = deferred();
  const cached = authSession("account-a", "cached");
  const fresh = authSession("account-a", "fresh");
  const harness = createCoordinatorHarness([() => verification.promise], {
    async onApplyCandidate(candidate) {
      if (candidate?.access_token !== fresh.access_token) return;
      freshApplyStarted.resolve();
      await releaseFreshApply.promise;
    },
  });

  const restoring = harness.coordinator.restore();
  harness.coordinator.recordAuthEvent(cached, "SIGNED_IN");
  harness.coordinator.recordAuthEvent(fresh, "TOKEN_REFRESHED");
  verification.resolve({ kind: "verified", session: fresh });
  await freshApplyStarted.promise;

  const staleCachedTask = harness.scheduled.shift();
  staleCachedTask();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(harness.applied, [
    {
      candidate: fresh,
      options: { reconcilePageOwner: true },
    },
  ]);

  releaseFreshApply.resolve();
  await restoring;
  await harness.flushScheduled();
  assert.deepEqual(
    harness.applied.filter(({ candidate }) => candidate === null),
    [],
    "the stale cached task never publishes a trailing fail-closed write"
  );
  assert.equal(harness.signals.verified, 1);
});

test("a TOKEN_REFRESHED event with an empty access token is never sent to the profile sink", async () => {
  const verification = deferred();
  const fresh = authSession("account-a", "fresh");
  const harness = createCoordinatorHarness([() => verification.promise]);
  const restoring = harness.coordinator.restore();

  harness.coordinator.recordAuthEvent(fresh, "TOKEN_REFRESHED");
  verification.resolve({ kind: "verified", session: fresh });
  await restoring;
  await harness.flushScheduled();

  harness.coordinator.recordAuthEvent({ access_token: "  ", user: { id: "account-a" } }, "TOKEN_REFRESHED");
  await harness.flushScheduled();

  assert.equal(
    harness.applied.some(({ candidate }) => candidate?.access_token === "  "),
    false
  );
  assert.equal(harness.applied.at(-1).candidate, null);
  assert.equal(harness.signals.verified, 1);
});

test("late INITIAL_SESSION and duplicate fresh events cannot roll back or reload a verified session", async () => {
  const verification = deferred();
  const cached = authSession("account-a", "cached");
  const fresh = authSession("account-a", "fresh");
  const harness = createCoordinatorHarness([() => verification.promise]);
  const restoring = harness.coordinator.restore();

  harness.coordinator.recordAuthEvent(cached, "SIGNED_IN");
  harness.coordinator.recordAuthEvent(fresh, "TOKEN_REFRESHED");
  verification.resolve({ kind: "verified", session: fresh });
  await restoring;
  await harness.flushScheduled();
  const appliedBeforeLateEvents = harness.applied.length;

  harness.coordinator.recordAuthEvent(cached, "INITIAL_SESSION");
  harness.coordinator.recordAuthEvent(fresh, "TOKEN_REFRESHED");
  await harness.flushScheduled();

  assert.equal(harness.applied.length, appliedBeforeLateEvents);
  assert.equal(harness.signals.verified, 1);
});

test("a duplicate SIGNED_IN proof preserves an already verified session while revalidation is pending", async () => {
  const bootVerification = deferred();
  const revalidation = deferred();
  const initial = authSession("account-a", "fresh-1");
  const rotated = authSession("account-a", "fresh-2");
  const harness = createCoordinatorHarness([() => bootVerification.promise, () => revalidation.promise]);

  const restoring = harness.coordinator.restore();
  harness.coordinator.recordAuthEvent(initial, "TOKEN_REFRESHED");
  bootVerification.resolve({ kind: "verified", session: initial });
  await restoring;
  await harness.flushScheduled();
  harness.applied.length = 0;

  harness.coordinator.recordAuthEvent(initial, "SIGNED_IN");
  await harness.flushScheduled();
  assert.deepEqual(harness.applied, [], "the already published proof is not cleared or re-applied from cache");
  assert.equal(harness.signals.verifyCalls, 2);

  harness.coordinator.recordAuthEvent(rotated, "TOKEN_REFRESHED");
  revalidation.resolve({ kind: "verified", session: rotated });
  await harness.flushScheduled();

  assert.deepEqual(
    harness.applied.map(({ candidate }) => candidate?.access_token ?? null),
    ["fresh-2"]
  );
  assert.equal(harness.signals.verified, 2);
});

test("a different token for the same identity closes private state before revalidation", async () => {
  const bootVerification = deferred();
  const revalidation = deferred();
  const initial = authSession("account-a", "fresh-1");
  const changed = authSession("account-a", "unverified-2");
  const harness = createCoordinatorHarness([() => bootVerification.promise, () => revalidation.promise]);

  const restoring = harness.coordinator.restore();
  harness.coordinator.recordAuthEvent(initial, "TOKEN_REFRESHED");
  bootVerification.resolve({ kind: "verified", session: initial });
  await restoring;
  await harness.flushScheduled();
  harness.applied.length = 0;

  harness.coordinator.recordAuthEvent(changed, "SIGNED_IN");
  await harness.flushScheduled();
  assert.deepEqual(
    harness.applied.map(({ candidate }) => candidate),
    [null]
  );
  assert.equal(harness.signals.verifyCalls, 2);

  revalidation.resolve({ error: new Error("offline"), kind: "unavailable", session: null });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.applied.at(-1).candidate, null);
  assert.equal(harness.signals.verified, 1);
});

test("SIGNED_OUT clears proof so an identical later SIGNED_IN cannot preserve private state", async () => {
  const bootVerification = deferred();
  const initial = authSession("account-a", "fresh-1");
  const harness = createCoordinatorHarness([
    () => bootVerification.promise,
    Promise.resolve({ error: new Error("offline"), kind: "unavailable", session: null }),
  ]);

  const restoring = harness.coordinator.restore();
  harness.coordinator.recordAuthEvent(initial, "TOKEN_REFRESHED");
  bootVerification.resolve({ kind: "verified", session: initial });
  await restoring;
  await harness.flushScheduled();
  harness.applied.length = 0;

  harness.coordinator.recordAuthEvent(null, "SIGNED_OUT");
  await harness.flushScheduled();
  harness.coordinator.recordAuthEvent(initial, "SIGNED_IN");
  await harness.flushScheduled();

  assert.equal(
    harness.applied.some(({ candidate }) => candidate?.user?.id),
    false
  );
  assert.equal(
    harness.applied.every(({ candidate }) => candidate === null),
    true
  );
  assert.equal(harness.signals.signedOut, 1);
  assert.equal(harness.signals.verifyCalls, 2);
  assert.equal(harness.signals.verified, 1);
});

test("a delayed SIGNED_IN and TOKEN_REFRESHED sequence cannot cross a prior SIGNED_OUT barrier", async () => {
  const bootVerification = deferred();
  const tokenReverification = deferred();
  const stale = authSession("account-a", "fresh-1");
  const unavailable = { error: new Error("offline"), kind: "unavailable", session: null };
  const harness = createCoordinatorHarness([
    () => bootVerification.promise,
    Promise.resolve(unavailable),
    () => tokenReverification.promise,
  ]);

  const restoring = harness.coordinator.restore();
  harness.coordinator.recordAuthEvent(stale, "TOKEN_REFRESHED");
  bootVerification.resolve({ kind: "verified", session: stale });
  await restoring;
  await harness.flushScheduled();
  harness.applied.length = 0;

  harness.coordinator.recordAuthEvent(null, "SIGNED_OUT");
  await harness.flushScheduled();
  harness.coordinator.recordAuthEvent(stale, "SIGNED_IN");
  await harness.flushScheduled();
  assert.equal(harness.signals.verifyCalls, 2);

  harness.coordinator.recordAuthEvent(stale, "TOKEN_REFRESHED");
  await harness.flushScheduled();
  assert.equal(harness.signals.verifyCalls, 3, "the delayed token event must start a new server verification");
  assert.equal(
    harness.applied.some(({ candidate }) => candidate?.access_token === stale.access_token),
    false,
    "local cross-tab events cannot republish the signed-out token"
  );

  tokenReverification.resolve(unavailable);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.applied.at(-1).candidate, null);
  assert.equal(harness.signals.verified, 1, "only the pre-sign-out proof was ever verified");
});

test("offline boot and ownerless events stay fail-closed until a later sign-in is verified", async () => {
  const retryVerification = deferred();
  const fresh = authSession("account-a", "fresh");
  const harness = createCoordinatorHarness([
    Promise.resolve({ error: new AuthRetryableFetchError("offline", 0), kind: "unavailable", session: null }),
    () => retryVerification.promise,
  ]);

  await harness.coordinator.restore();
  assert.equal(harness.signals.anonymous, 0, "offline is not treated as confirmed anonymous");
  assert.equal(
    harness.applied.some(({ candidate }) => candidate?.user?.id),
    false
  );

  harness.applied.length = 0;
  harness.coordinator.recordAuthEvent({ access_token: "ownerless" }, "SIGNED_IN");
  await harness.flushScheduled();
  assert.equal(harness.signals.verifyCalls, 1, "an ownerless event cannot start private verification");
  assert.equal(
    harness.applied.some(({ candidate }) => candidate?.user?.id),
    false
  );

  harness.coordinator.recordAuthEvent(authSession("account-a", "cached"), "SIGNED_IN");
  await harness.flushScheduled();
  assert.equal(harness.signals.verifyCalls, 2);
  const waitingForRetry = harness.coordinator.retry();
  harness.coordinator.recordAuthEvent(fresh, "TOKEN_REFRESHED");
  retryVerification.resolve({ kind: "verified", session: fresh });
  await waitingForRetry;
  await harness.flushScheduled();

  assert.deepEqual(
    harness.applied.filter(({ candidate }) => candidate?.user?.id).map(({ candidate }) => candidate.access_token),
    ["fresh"]
  );
});

test("explicit retry starts a new verification when no verification is in flight", async () => {
  const retryVerification = deferred();
  const fresh = authSession("account-a", "fresh");
  const harness = createCoordinatorHarness([
    Promise.resolve({ error: new AuthRetryableFetchError("offline", 0), kind: "unavailable", session: null }),
    () => retryVerification.promise,
  ]);

  await harness.coordinator.restore();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.signals.verifyCalls, 1);

  const retrying = harness.coordinator.retry();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.signals.verifyCalls, 2, "retry starts a fresh call after the first call has settled");

  harness.coordinator.recordAuthEvent(fresh, "TOKEN_REFRESHED");
  retryVerification.resolve({ kind: "verified", session: fresh });
  await retrying;
  await harness.flushScheduled();

  assert.deepEqual(
    harness.applied.filter(({ candidate }) => candidate?.user?.id).map(({ candidate }) => candidate.access_token),
    ["fresh"]
  );
  assert.equal(harness.signals.verified, 1);
});

test("an online retry requested during boot waits for an in-flight unavailable result", async () => {
  const bootVerification = deferred();
  const harness = createCoordinatorHarness([
    () => bootVerification.promise,
    Promise.resolve({ kind: "anonymous", session: null }),
  ]);

  const restoring = harness.coordinator.restore();
  const retrying = harness.coordinator.retryIfNeeded();
  assert.equal(harness.signals.verifyCalls, 1);

  bootVerification.resolve({
    error: new AuthRetryableFetchError("offline", 0),
    kind: "unavailable",
    session: null,
  });
  await Promise.all([restoring, retrying]);

  assert.equal(harness.signals.verifyCalls, 2, "the early online event is retained until boot verification settles");
  assert.equal(harness.signals.anonymous, 0, "a non-boot retry does not clear the original boot intent");
});

test("confirmed anonymous alone clears the unchanged boot intent", async () => {
  const harness = createCoordinatorHarness([Promise.resolve({ kind: "anonymous", session: null })]);
  await harness.coordinator.restore();
  await harness.coordinator.retryIfNeeded();
  assert.equal(harness.signals.anonymous, 1);
  assert.equal(harness.signals.signedOut, 0);
  assert.equal(harness.signals.verifyCalls, 1, "an online event cannot reopen a terminal anonymous result");
});
