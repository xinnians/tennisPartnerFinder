import { expect, test } from "@playwright/test";

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const SERVER_CONSENT = Object.freeze({
  consentEpoch: "22222222-2222-4222-8222-222222222222",
  consentId: "9223372036854775807",
  consentVersion: "9223372036854775807",
});

async function createEnabledBinding(page) {
  return page.evaluate(
    async ({ authUserId, serverConsent }) => {
      const { createNotificationPushStorage } = await import("/src/notificationPushStorage.ts");
      const storage = createNotificationPushStorage();
      const deviceId = await storage.getOrCreateLogicalDeviceId();
      const provisioning = await storage.beginExplicitPushProvisioning({
        authUserId,
        deviceId,
        expectedCurrentRevision: null,
      });
      const digest = new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(provisioning.cleanupToken))
      );
      window.name = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
      const enabled = await storage.commitPushProvisioning({
        authUserId,
        bindingId: provisioning.bindingId,
        deviceId,
        expectedLocalRevision: provisioning.localRevision,
        ...serverConsent,
      });
      return {
        bindingId: enabled.bindingId,
        deviceId,
        hasCleanupToken: Object.hasOwn(enabled, "cleanupToken"),
        localRevision: enabled.localRevision,
        state: enabled.state,
      };
    },
    { authUserId: AUTH_USER_ID, serverConsent: SERVER_CONSENT }
  );
}

test("stays dormant until explicit use and preserves exact cleanup work across reloads", async ({ page }) => {
  await page.goto("/");

  const dormant = await page.evaluate(async () => {
    const databaseName = "tennis-partner-finder-push";
    const beforeImport = !(await indexedDB.databases()).some(({ name }) => name === databaseName);
    await import("/src/notificationPushStorage.ts");
    const afterImport = !(await indexedDB.databases()).some(({ name }) => name === databaseName);
    return { afterImport, beforeImport };
  });
  expect(dormant).toEqual({ afterImport: true, beforeImport: true });

  const prepared = await page.evaluate(async (authUserId) => {
    const { createNotificationPushStorage } = await import("/src/notificationPushStorage.ts");
    const storage = createNotificationPushStorage();
    const deviceId = await storage.getOrCreateLogicalDeviceId();
    const provisioning = await storage.beginExplicitPushProvisioning({
      authUserId,
      deviceId,
      expectedCurrentRevision: null,
    });
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(provisioning.cleanupToken))
    );
    window.name = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return {
      bindingId: provisioning.bindingId,
      deviceId,
      localRevision: provisioning.localRevision,
      tokenLength: provisioning.cleanupToken.length,
    };
  }, AUTH_USER_ID);
  expect(prepared.tokenLength).toBe(43);

  const schema = await page.evaluate(async () => {
    const request = indexedDB.open("tennis-partner-finder-push");
    const database = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction(["meta", "current-binding", "pending-cleanups"], "readonly");
    const completion = new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => undefined;
    });
    const meta = transaction.objectStore("meta");
    const current = transaction.objectStore("current-binding");
    const pending = transaction.objectStore("pending-cleanups");
    const pendingIndex = pending.index("by-binding-id");
    const result = {
      currentIndexes: Array.from(current.indexNames),
      currentKeyPath: current.keyPath,
      metaIndexes: Array.from(meta.indexNames),
      metaKeyPath: meta.keyPath,
      pendingIndex: {
        keyPath: pendingIndex.keyPath,
        multiEntry: pendingIndex.multiEntry,
        unique: pendingIndex.unique,
      },
      pendingIndexes: Array.from(pending.indexNames),
      pendingKeyPath: pending.keyPath,
      stores: Array.from(database.objectStoreNames),
      version: database.version,
    };
    await completion;
    database.close();
    return result;
  });
  expect(schema).toEqual({
    currentIndexes: [],
    currentKeyPath: "key",
    metaIndexes: [],
    metaKeyPath: "key",
    pendingIndex: { keyPath: "bindingId", multiEntry: false, unique: true },
    pendingIndexes: ["by-binding-id"],
    pendingKeyPath: "attemptId",
    stores: ["current-binding", "meta", "pending-cleanups"],
    version: 1,
  });

  await page.reload();
  const locallyPaused = await page.evaluate(
    async ({ authUserId, serverConsent }) => {
      const { createNotificationPushStorage } = await import("/src/notificationPushStorage.ts");
      const storage = createNotificationPushStorage();
      const provisioning = await storage.readPushProvisioning(authUserId);
      if (!provisioning) return { provisioningMissing: true };
      const digest = new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(provisioning.cleanupToken))
      );
      const tokenMatches = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("") === window.name;
      const enabled = await storage.commitPushProvisioning({
        authUserId,
        bindingId: provisioning.bindingId,
        deviceId: provisioning.deviceId,
        expectedLocalRevision: provisioning.localRevision,
        ...serverConsent,
      });
      const suspended = await storage.suspendCurrentPushBinding({
        authUserId,
        bindingId: enabled.bindingId,
        expectedLocalRevision: enabled.localRevision,
        reason: "auth_unavailable",
      });
      return {
        attemptIsNull: suspended.attempt === null,
        enabledExposesToken: Object.hasOwn(enabled, "cleanupToken"),
        pendingCount: (await storage.listPendingPushCleanups()).length,
        provisioningMissing: false,
        state: suspended.state.state,
        suspendedExposesToken: Object.hasOwn(suspended.state, "cleanupToken"),
        tokenMatches,
      };
    },
    { authUserId: AUTH_USER_ID, serverConsent: SERVER_CONSENT }
  );
  expect(locallyPaused).toEqual({
    attemptIsNull: true,
    enabledExposesToken: false,
    pendingCount: 0,
    provisioningMissing: false,
    state: "auth-unverified",
    suspendedExposesToken: false,
    tokenMatches: true,
  });

  await page.reload();
  const queued = await page.evaluate(async (authUserId) => {
    const { createNotificationPushStorage } = await import("/src/notificationPushStorage.ts");
    const storage = createNotificationPushStorage();
    const runtime = await storage.readPushRuntimeState();
    if (runtime.kind !== "auth-unverified") return { wrongRuntime: runtime.kind };
    const result = await storage.suspendCurrentPushBinding({
      authUserId,
      bindingId: runtime.binding.bindingId,
      expectedLocalRevision: runtime.binding.localRevision,
      reason: "user_logout",
    });
    if (!result.attempt) return { attemptMissing: true };
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(result.attempt.cleanupToken))
    );
    return {
      attemptId: result.attempt.attemptId,
      bindingId: result.attempt.bindingId,
      reason: result.attempt.reason,
      runtimeExposesToken: Object.hasOwn(runtime.binding, "cleanupToken"),
      stateExposesToken: Object.hasOwn(result.state, "cleanupToken"),
      tokenMatches: Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("") === window.name,
    };
  }, AUTH_USER_ID);
  expect(queued).toMatchObject({
    bindingId: prepared.bindingId,
    reason: "user_logout",
    runtimeExposesToken: false,
    stateExposesToken: false,
    tokenMatches: true,
  });

  await page.reload();
  const completed = await page.evaluate(async (attemptId) => {
    const { createNotificationPushStorage } = await import("/src/notificationPushStorage.ts");
    const storage = createNotificationPushStorage();
    const before = await storage.readPushRuntimeState();
    const [attempt] = await storage.listPendingPushCleanups();
    if (!attempt) return { attemptMissing: true };
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(attempt.cleanupToken))
    );
    if (!("deviceId" in before) || before.deviceId === null) return { deviceMissing: true };
    const nextOwner = "33333333-3333-4333-8333-333333333333";
    let pendingConflictCode = null;
    try {
      await storage.beginExplicitPushProvisioning({
        authUserId: nextOwner,
        deviceId: before.deviceId,
        expectedCurrentRevision: null,
      });
    } catch (error) {
      pendingConflictCode = error instanceof Error && "code" in error ? error.code : null;
    }
    let modifiedCode = null;
    try {
      await storage.completePendingPushCleanup({ ...attempt, reason: "auth_rejected" });
    } catch (error) {
      modifiedCode = error instanceof Error && "code" in error ? error.code : null;
    }
    const afterModified = await storage.listPendingPushCleanups();
    const exactCompleted = await storage.completePendingPushCleanup(attempt);
    const after = await storage.readPushRuntimeState();
    const nextBinding = await storage.beginExplicitPushProvisioning({
      authUserId: nextOwner,
      deviceId: before.deviceId,
      expectedCurrentRevision: null,
    });
    const replayCompleted = await storage.completePendingPushCleanup(attempt);
    const afterReplay = await storage.readPushRuntimeState();
    const tokenMatches = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("") === window.name;
    window.name = "";
    return {
      afterKind: after.kind,
      beforeKind: before.kind,
      exactCompleted,
      modifiedCode,
      nextBindingPreserved:
        afterReplay.kind === "provisioning" &&
        afterReplay.binding.bindingId === nextBinding.bindingId &&
        !Object.hasOwn(afterReplay.binding, "cleanupToken"),
      pendingAfterModified: afterModified.length,
      pendingConflictCode,
      replayCompleted,
      sameAttempt: attempt.attemptId === attemptId,
      tokenMatches,
    };
  }, queued.attemptId);
  expect(completed).toEqual({
    afterKind: "disabled",
    beforeKind: "cleanup-pending",
    exactCompleted: true,
    modifiedCode: "PUSH_STORAGE_STALE",
    nextBindingPreserved: true,
    pendingAfterModified: 1,
    pendingConflictCode: "PUSH_STORAGE_ACTIVE_BINDING_CONFLICT",
    replayCompleted: false,
    sameAttempt: true,
    tokenMatches: true,
  });
});

test("serializes two tabs and rejects the stale cleanup mutation without extra rows", async ({ context, page }) => {
  const peer = await context.newPage();
  await Promise.all([page.goto("/"), peer.goto("/")]);

  const createDevice = (target) =>
    target.evaluate(async () => {
      const { createNotificationPushStorage } = await import("/src/notificationPushStorage.ts");
      return createNotificationPushStorage().getOrCreateLogicalDeviceId();
    });
  const [firstDevice, secondDevice] = await Promise.all([createDevice(page), createDevice(peer)]);
  expect(firstDevice).toBe(secondDevice);

  const begin = (target) =>
    target.evaluate(
      async ({ authUserId, deviceId }) => {
        const { createNotificationPushStorage } = await import("/src/notificationPushStorage.ts");
        const storage = createNotificationPushStorage();
        const binding = await storage.beginExplicitPushProvisioning({
          authUserId,
          deviceId,
          expectedCurrentRevision: null,
        });
        const stored = await storage.readPushProvisioning(authUserId);
        return {
          bindingId: binding.bindingId,
          localRevision: binding.localRevision,
          tokenMatchesStored: binding.cleanupToken === stored?.cleanupToken,
        };
      },
      { authUserId: AUTH_USER_ID, deviceId: firstDevice }
    );
  const [firstPrepared, secondPrepared] = await Promise.all([begin(page), begin(peer)]);
  expect(firstPrepared).toEqual(secondPrepared);
  expect(firstPrepared.tokenMatchesStored).toBe(true);

  await page.evaluate(async (authUserId) => {
    const { createNotificationPushStorage } = await import("/src/notificationPushStorage.ts");
    const provisioning = await createNotificationPushStorage().readPushProvisioning(authUserId);
    if (!provisioning) throw new Error("PROVISIONING_MISSING");
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(provisioning.cleanupToken))
    );
    localStorage.setItem(
      "push-storage-test-token-digest",
      Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")
    );
  }, AUTH_USER_ID);
  const sameCrossTabToken = await peer.evaluate(async (authUserId) => {
    const { createNotificationPushStorage } = await import("/src/notificationPushStorage.ts");
    const provisioning = await createNotificationPushStorage().readPushProvisioning(authUserId);
    if (!provisioning) return false;
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(provisioning.cleanupToken))
    );
    const actual = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
    const expected = localStorage.getItem("push-storage-test-token-digest");
    localStorage.removeItem("push-storage-test-token-digest");
    return actual === expected;
  }, AUTH_USER_ID);
  expect(sameCrossTabToken).toBe(true);

  const commit = (target) =>
    target.evaluate(
      async ({ authUserId, deviceId, prepared, serverConsent }) => {
        const { createNotificationPushStorage } = await import("/src/notificationPushStorage.ts");
        const enabled = await createNotificationPushStorage().commitPushProvisioning({
          authUserId,
          bindingId: prepared.bindingId,
          deviceId,
          expectedLocalRevision: prepared.localRevision,
          ...serverConsent,
        });
        return {
          bindingId: enabled.bindingId,
          deviceId: enabled.deviceId,
          hasCleanupToken: Object.hasOwn(enabled, "cleanupToken"),
          localRevision: enabled.localRevision,
          serverConsent: enabled.serverConsent,
          state: enabled.state,
        };
      },
      {
        authUserId: AUTH_USER_ID,
        deviceId: firstDevice,
        prepared: firstPrepared,
        serverConsent: SERVER_CONSENT,
      }
    );
  const [firstEnabled, secondEnabled] = await Promise.all([commit(page), commit(peer)]);
  expect(firstEnabled).toEqual(secondEnabled);
  expect(firstEnabled.state).toBe("enabled");
  expect(firstEnabled.hasCleanupToken).toBe(false);

  const suspend = (target) =>
    target.evaluate(
      async ({ authUserId, bindingId, expectedLocalRevision }) => {
        const { createNotificationPushStorage } = await import("/src/notificationPushStorage.ts");
        try {
          const result = await createNotificationPushStorage().suspendCurrentPushBinding({
            authUserId,
            bindingId,
            expectedLocalRevision,
            reason: "user_logout",
          });
          return { attemptId: result.attempt?.attemptId ?? null, status: "fulfilled" };
        } catch (error) {
          return {
            code: error instanceof Error && "code" in error ? error.code : null,
            status: "rejected",
          };
        }
      },
      {
        authUserId: AUTH_USER_ID,
        bindingId: firstEnabled.bindingId,
        expectedLocalRevision: firstEnabled.localRevision,
      }
    );
  const outcomes = await Promise.all([suspend(page), suspend(peer)]);
  expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
  expect(outcomes.filter(({ code, status }) => status === "rejected" && code === "PUSH_STORAGE_STALE")).toHaveLength(1);

  const counts = await page.evaluate(async () => {
    const request = indexedDB.open("tennis-partner-finder-push");
    const database = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction(["meta", "current-binding", "pending-cleanups"], "readonly");
    const readAll = (storeName) =>
      new Promise((resolve, reject) => {
        const read = transaction.objectStore(storeName).getAll();
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error);
      });
    const [meta, current, pending] = await Promise.all([
      readAll("meta"),
      readAll("current-binding"),
      readAll("pending-cleanups"),
    ]);
    database.close();
    return { current: current.length, meta: meta.length, pending: pending.length };
  });
  expect(counts).toEqual({ current: 0, meta: 1, pending: 1 });
});

test("keeps cleanup-required and the original token when the move transaction aborts", async ({ page }) => {
  await page.goto("/");
  const enabled = await createEnabledBinding(page);
  expect(enabled).toMatchObject({ hasCleanupToken: false, state: "enabled" });

  const result = await page.evaluate(
    async ({ authUserId, enabledBinding }) => {
      const module = await import("/src/notificationPushStorage.ts");
      const storage = module.createNotificationPushStorage();
      const originalAdd = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function (...args) {
        if (this.name === module.PUSH_STORAGE_STORES.pendingCleanups) this.transaction.abort();
        return originalAdd.apply(this, args);
      };
      let abortCode = null;
      try {
        await storage.suspendCurrentPushBinding({
          authUserId,
          bindingId: enabledBinding.bindingId,
          expectedLocalRevision: enabledBinding.localRevision,
          reason: "user_logout",
        });
      } catch (error) {
        abortCode = error instanceof Error && "code" in error ? error.code : null;
      } finally {
        IDBObjectStore.prototype.add = originalAdd;
      }

      const runtime = await storage.readPushRuntimeState();
      const pendingBefore = await storage.listPendingPushCleanups();
      if (runtime.kind !== "cleanup-required") return { wrongRuntime: runtime.kind };

      const request = indexedDB.open(module.PUSH_STORAGE_DATABASE_NAME);
      const database = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const read = database
        .transaction(module.PUSH_STORAGE_STORES.currentBinding, "readonly")
        .objectStore(module.PUSH_STORAGE_STORES.currentBinding)
        .get(module.PUSH_STORAGE_RECORD_KEYS.currentBinding);
      const rawCurrent = await new Promise((resolve, reject) => {
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error);
      });
      database.close();
      const digest = new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawCurrent.cleanupToken))
      );
      const tokenMatches = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("") === window.name;

      let wrongReasonCode = null;
      try {
        await storage.queueRequiredPushCleanup({
          authUserId,
          bindingId: runtime.binding.bindingId,
          expectedLocalRevision: runtime.binding.localRevision,
          reason: "auth_rejected",
        });
      } catch (error) {
        wrongReasonCode = error instanceof Error && "code" in error ? error.code : null;
      }
      const attempt = await storage.queueRequiredPushCleanup({
        authUserId,
        bindingId: runtime.binding.bindingId,
        expectedLocalRevision: runtime.binding.localRevision,
        reason: runtime.binding.reason,
      });
      const attemptDigest = new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(attempt.cleanupToken))
      );
      const attemptTokenMatches =
        Array.from(attemptDigest, (byte) => byte.toString(16).padStart(2, "0")).join("") === window.name;
      window.name = "";
      return {
        abortCode,
        attemptTokenMatches,
        pendingBefore: pendingBefore.length,
        reason: runtime.binding.reason,
        tokenMatches,
        wrongReasonCode,
      };
    },
    { authUserId: AUTH_USER_ID, enabledBinding: enabled }
  );
  expect(result).toEqual({
    abortCode: "PUSH_STORAGE_UNAVAILABLE",
    attemptTokenMatches: true,
    pendingBefore: 0,
    reason: "user_logout",
    tokenMatches: true,
    wrongReasonCode: "PUSH_STORAGE_STALE",
  });
});

test("fails closed without repairing extra singleton rows or a future database", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async (authUserId) => {
    const module = await import("/src/notificationPushStorage.ts");
    const storage = module.createNotificationPushStorage();
    const deviceId = await storage.getOrCreateLogicalDeviceId();
    const provisioning = await storage.beginExplicitPushProvisioning({
      authUserId,
      deviceId,
      expectedCurrentRevision: null,
    });

    const openCurrent = indexedDB.open(module.PUSH_STORAGE_DATABASE_NAME);
    const currentDatabase = await new Promise((resolve, reject) => {
      openCurrent.onsuccess = () => resolve(openCurrent.result);
      openCurrent.onerror = () => reject(openCurrent.error);
    });
    const corruptTransaction = currentDatabase.transaction(module.PUSH_STORAGE_STORES.currentBinding, "readwrite");
    corruptTransaction.objectStore(module.PUSH_STORAGE_STORES.currentBinding).add({
      ...provisioning,
      bindingId: crypto.randomUUID(),
      key: "orphan",
      localRevision: crypto.randomUUID(),
    });
    await new Promise((resolve, reject) => {
      corruptTransaction.oncomplete = () => resolve();
      corruptTransaction.onabort = () => reject(corruptTransaction.error);
      corruptTransaction.onerror = () => undefined;
    });
    currentDatabase.close();

    const corruptRuntime = await storage.readPushRuntimeState();
    let corruptMutationCode = null;
    try {
      await storage.getOrCreateLogicalDeviceId();
    } catch (error) {
      corruptMutationCode = error instanceof Error && "code" in error ? error.code : null;
    }

    const verifyCorrupt = indexedDB.open(module.PUSH_STORAGE_DATABASE_NAME);
    const corruptDatabase = await new Promise((resolve, reject) => {
      verifyCorrupt.onsuccess = () => resolve(verifyCorrupt.result);
      verifyCorrupt.onerror = () => reject(verifyCorrupt.error);
    });
    const corruptReadTransaction = corruptDatabase.transaction(module.PUSH_STORAGE_STORES.currentBinding, "readonly");
    const corruptReadCompletion = new Promise((resolve, reject) => {
      corruptReadTransaction.oncomplete = () => resolve();
      corruptReadTransaction.onabort = () => reject(corruptReadTransaction.error);
      corruptReadTransaction.onerror = () => undefined;
    });
    const corruptRead = corruptReadTransaction.objectStore(module.PUSH_STORAGE_STORES.currentBinding).getAll();
    const corruptRows = await new Promise((resolve, reject) => {
      corruptRead.onsuccess = () => resolve(corruptRead.result);
      corruptRead.onerror = () => reject(corruptRead.error);
    });
    await corruptReadCompletion;
    corruptDatabase.close();

    const deletion = indexedDB.deleteDatabase(module.PUSH_STORAGE_DATABASE_NAME);
    await new Promise((resolve, reject) => {
      deletion.onsuccess = () => resolve();
      deletion.onerror = () => reject(deletion.error);
      deletion.onblocked = () => reject(new Error("DELETE_BLOCKED"));
    });

    const futureOpen = indexedDB.open(module.PUSH_STORAGE_DATABASE_NAME, 2);
    futureOpen.onupgradeneeded = () => {
      futureOpen.result.createObjectStore("future").put("keep", "sentinel");
    };
    const futureDatabase = await new Promise((resolve, reject) => {
      futureOpen.onsuccess = () => resolve(futureOpen.result);
      futureOpen.onerror = () => reject(futureOpen.error);
    });
    futureDatabase.close();

    const futureRuntime = await storage.readPushRuntimeState();
    let futureMutationCode = null;
    try {
      await storage.getOrCreateLogicalDeviceId();
    } catch (error) {
      futureMutationCode = error instanceof Error && "code" in error ? error.code : null;
    }

    const futureVerify = indexedDB.open(module.PUSH_STORAGE_DATABASE_NAME);
    const preservedDatabase = await new Promise((resolve, reject) => {
      futureVerify.onsuccess = () => resolve(futureVerify.result);
      futureVerify.onerror = () => reject(futureVerify.error);
    });
    const sentinelRead = preservedDatabase.transaction("future", "readonly").objectStore("future").get("sentinel");
    const sentinel = await new Promise((resolve, reject) => {
      sentinelRead.onsuccess = () => resolve(sentinelRead.result);
      sentinelRead.onerror = () => reject(sentinelRead.error);
    });
    const futureVersion = preservedDatabase.version;
    preservedDatabase.close();

    return {
      corruptMutationCode,
      corruptRows: corruptRows.length,
      corruptRuntime: corruptRuntime.kind,
      futureMutationCode,
      futureRuntime: futureRuntime.kind,
      futureVersion,
      sentinel,
    };
  }, AUTH_USER_ID);

  expect(result).toEqual({
    corruptMutationCode: "PUSH_STORAGE_INVALID",
    corruptRows: 2,
    corruptRuntime: "invalid",
    futureMutationCode: "PUSH_STORAGE_UNAVAILABLE",
    futureRuntime: "unavailable",
    futureVersion: 2,
    sentinel: "keep",
  });
});

test("site-data deletion creates a new logical device and removes old pending work", async ({ page }) => {
  await page.goto("/");
  const enabled = await createEnabledBinding(page);
  const beforeDelete = await page.evaluate(
    async ({ authUserId, enabledBinding }) => {
      const module = await import("/src/notificationPushStorage.ts");
      const result = await module.createNotificationPushStorage().suspendCurrentPushBinding({
        authUserId,
        bindingId: enabledBinding.bindingId,
        expectedLocalRevision: enabledBinding.localRevision,
        reason: "user_logout",
      });
      const deletion = indexedDB.deleteDatabase(module.PUSH_STORAGE_DATABASE_NAME);
      await new Promise((resolve, reject) => {
        deletion.onsuccess = () => resolve();
        deletion.onerror = () => reject(deletion.error);
        deletion.onblocked = () => reject(new Error("DELETE_BLOCKED"));
      });
      window.name = "";
      return { attemptCreated: result.attempt !== null, oldDeviceId: enabledBinding.deviceId };
    },
    { authUserId: AUTH_USER_ID, enabledBinding: enabled }
  );
  expect(beforeDelete.attemptCreated).toBe(true);

  await page.reload();
  const afterDelete = await page.evaluate(async () => {
    const { createNotificationPushStorage } = await import("/src/notificationPushStorage.ts");
    const storage = createNotificationPushStorage();
    const deviceId = await storage.getOrCreateLogicalDeviceId();
    return {
      deviceId,
      pendingCount: (await storage.listPendingPushCleanups()).length,
      runtime: (await storage.readPushRuntimeState()).kind,
    };
  });
  expect(afterDelete.deviceId).not.toBe(beforeDelete.oldDeviceId);
  expect(afterDelete).toMatchObject({ pendingCount: 0, runtime: "disabled" });
});

test("Auth unavailable closes the exact local binding without creating cleanup work", async ({ page }) => {
  await page.goto("/");
  const enabled = await createEnabledBinding(page);
  expect(enabled).toMatchObject({ hasCleanupToken: false, state: "enabled" });

  const result = await page.evaluate(async (authUserId) => {
    const [{ createNotificationPushStorage }, { createNotificationPushAuthFailureCoordinator }] = await Promise.all([
      import("/src/notificationPushStorage.ts"),
      import("/src/notificationPushAuthFailureCoordinator.ts"),
    ]);
    const storage = createNotificationPushStorage();
    const before = await storage.readPushRuntimeState();
    if (before.kind !== "enabled") return { wrongRuntime: before.kind };

    let cleanupCalls = 0;
    const coordinator = createNotificationPushAuthFailureCoordinator({
      cleanup: {
        processPendingPushCleanup: async () => {
          cleanupCalls += 1;
          return { kind: "completed" };
        },
      },
      storage,
    });
    const coordinatorResult = await coordinator.processAuthFailure({
      authUserId,
      binding: before.binding,
      kind: "unavailable",
    });
    const after = await storage.readPushRuntimeState();
    if (after.kind !== "auth-unverified") return { wrongRuntime: after.kind };
    return {
      cleanupCalls,
      coordinatorResult,
      exposesCleanupToken: Object.hasOwn(after.binding, "cleanupToken"),
      pendingCount: (await storage.listPendingPushCleanups()).length,
      reason: after.binding.reason,
      state: after.binding.state,
    };
  }, AUTH_USER_ID);
  expect(result).toEqual({
    cleanupCalls: 0,
    coordinatorResult: { kind: "local-closed" },
    exposesCleanupToken: false,
    pendingCount: 0,
    reason: "auth_unavailable",
    state: "auth-unverified",
  });

  await page.reload();
  const persisted = await page.evaluate(async () => {
    const { createNotificationPushStorage } = await import("/src/notificationPushStorage.ts");
    const storage = createNotificationPushStorage();
    const runtime = await storage.readPushRuntimeState();
    return {
      pendingCount: (await storage.listPendingPushCleanups()).length,
      reason: runtime.kind === "auth-unverified" ? runtime.binding.reason : null,
      runtime: runtime.kind,
    };
  });
  expect(persisted).toEqual({ pendingCount: 0, reason: "auth_unavailable", runtime: "auth-unverified" });
});

test("manual re-enable atomically converges two tabs on one subscription-changed cleanup", async ({
  context,
  page,
}) => {
  const peer = await context.newPage();
  await Promise.all([page.goto("/"), peer.goto("/")]);
  const enabled = await createEnabledBinding(page);

  const suspended = await page.evaluate(
    async ({ authUserId, enabledBinding }) => {
      const { createNotificationPushStorage } = await import("/src/notificationPushStorage.ts");
      const storage = createNotificationPushStorage();
      await storage.suspendCurrentPushBinding({
        authUserId,
        bindingId: enabledBinding.bindingId,
        expectedLocalRevision: enabledBinding.localRevision,
        reason: "auth_unavailable",
      });
      const runtime = await storage.readPushRuntimeState();
      if (runtime.kind !== "auth-unverified") throw new Error("AUTH_UNVERIFIED_BINDING_MISSING");
      return runtime.binding;
    },
    { authUserId: AUTH_USER_ID, enabledBinding: enabled }
  );

  const begin = (target) =>
    target.evaluate(
      async ({ authUserId, binding }) => {
        const { createNotificationPushStorage } = await import("/src/notificationPushStorage.ts");
        const storage = createNotificationPushStorage();
        const attempt = await storage.beginExplicitPushReenable({
          authUserId,
          bindingId: binding.bindingId,
          expectedLocalRevision: binding.localRevision,
        });
        const digest = new Uint8Array(
          await crypto.subtle.digest("SHA-256", new TextEncoder().encode(attempt.cleanupToken))
        );
        return {
          attemptId: attempt.attemptId,
          bindingId: attempt.bindingId,
          bindingRevision: attempt.bindingRevision,
          reason: attempt.reason,
          tokenDigest: Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(""),
        };
      },
      { authUserId: AUTH_USER_ID, binding: suspended }
    );
  const [first, second] = await Promise.all([begin(page), begin(peer)]);
  expect(first).toEqual(second);
  expect(first).toMatchObject({
    bindingId: enabled.bindingId,
    bindingRevision: suspended.localRevision,
    reason: "subscription_changed",
    tokenDigest: await page.evaluate(() => window.name),
  });

  const afterCleanup = await page.evaluate(
    async ({ authUserId, oldAttemptId, oldBindingId, oldTokenDigest }) => {
      const { createNotificationPushStorage } = await import("/src/notificationPushStorage.ts");
      const storage = createNotificationPushStorage();
      const pending = await storage.listPendingPushCleanups();
      const runtimeBefore = await storage.readPushRuntimeState();
      if (!pending[0]) throw new Error("PENDING_CLEANUP_MISSING");
      await storage.completePendingPushCleanup(pending[0]);
      const runtimeAfter = await storage.readPushRuntimeState();
      if (!("deviceId" in runtimeAfter) || runtimeAfter.deviceId === null) throw new Error("DEVICE_ID_MISSING");
      const provisioning = await storage.beginExplicitPushProvisioning({
        authUserId,
        deviceId: runtimeAfter.deviceId,
        expectedCurrentRevision: null,
      });
      const digest = new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(provisioning.cleanupToken))
      );
      const newTokenDigest = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
      return {
        newBinding: provisioning.bindingId !== oldBindingId,
        newCleanupToken: newTokenDigest !== oldTokenDigest,
        pendingAttemptId: pending[0].attemptId,
        pendingCount: (await storage.listPendingPushCleanups()).length,
        runtimeAfter: (await storage.readPushRuntimeState()).kind,
        runtimeBefore: runtimeBefore.kind,
        sameAttempt: pending[0].attemptId === oldAttemptId,
      };
    },
    {
      authUserId: AUTH_USER_ID,
      oldAttemptId: first.attemptId,
      oldBindingId: enabled.bindingId,
      oldTokenDigest: first.tokenDigest,
    }
  );
  expect(afterCleanup).toEqual({
    newBinding: true,
    newCleanupToken: true,
    pendingAttemptId: first.attemptId,
    pendingCount: 0,
    runtimeAfter: "provisioning",
    runtimeBefore: "cleanup-pending",
    sameAttempt: true,
  });
});

test("manual re-enable accepts only exact auth-unverified CAS and rolls back an aborted move", async ({ page }) => {
  await page.goto("/");
  const enabled = await createEnabledBinding(page);

  const result = await page.evaluate(
    async ({ authUserId, enabledBinding }) => {
      const module = await import("/src/notificationPushStorage.ts");
      const storage = module.createNotificationPushStorage();
      let enabledCode = null;
      try {
        await storage.beginExplicitPushReenable({
          authUserId,
          bindingId: enabledBinding.bindingId,
          expectedLocalRevision: enabledBinding.localRevision,
        });
      } catch (error) {
        enabledCode = error instanceof Error && "code" in error ? error.code : null;
      }

      await storage.suspendCurrentPushBinding({
        authUserId,
        bindingId: enabledBinding.bindingId,
        expectedLocalRevision: enabledBinding.localRevision,
        reason: "auth_unavailable",
      });
      const before = await storage.readPushRuntimeState();
      if (before.kind !== "auth-unverified") throw new Error("AUTH_UNVERIFIED_BINDING_MISSING");

      let staleCode = null;
      try {
        await storage.beginExplicitPushReenable({
          authUserId,
          bindingId: before.binding.bindingId,
          expectedLocalRevision: crypto.randomUUID(),
        });
      } catch (error) {
        staleCode = error instanceof Error && "code" in error ? error.code : null;
      }

      const originalAdd = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function (...args) {
        if (this.name === module.PUSH_STORAGE_STORES.pendingCleanups) this.transaction.abort();
        return originalAdd.apply(this, args);
      };
      let abortCode = null;
      try {
        await storage.beginExplicitPushReenable({
          authUserId,
          bindingId: before.binding.bindingId,
          expectedLocalRevision: before.binding.localRevision,
        });
      } catch (error) {
        abortCode = error instanceof Error && "code" in error ? error.code : null;
      } finally {
        IDBObjectStore.prototype.add = originalAdd;
      }

      const after = await storage.readPushRuntimeState();
      return {
        abortCode,
        enabledCode,
        pendingCount: (await storage.listPendingPushCleanups()).length,
        preservedBinding:
          after.kind === "auth-unverified" &&
          after.binding.bindingId === before.binding.bindingId &&
          after.binding.localRevision === before.binding.localRevision,
        runtime: after.kind,
        staleCode,
      };
    },
    { authUserId: AUTH_USER_ID, enabledBinding: enabled }
  );
  expect(result).toEqual({
    abortCode: "PUSH_STORAGE_UNAVAILABLE",
    enabledCode: "PUSH_STORAGE_STALE",
    pendingCount: 0,
    preservedBinding: true,
    runtime: "auth-unverified",
    staleCode: "PUSH_STORAGE_STALE",
  });
});

test("manual re-enable composes real B5 and B8 storage only after cleanup completion", async ({ page }) => {
  await page.goto("/");
  const enabled = await createEnabledBinding(page);

  const result = await page.evaluate(
    async ({ authUserId, enabledBinding, predecessor }) => {
      const [storageModule, cleanupModule, reenableModule] = await Promise.all([
        import("/src/notificationPushStorage.ts"),
        import("/src/notificationPushCleanupCoordinator.ts"),
        import("/src/notificationPushManualReenableCoordinator.ts"),
      ]);
      const storage = storageModule.createNotificationPushStorage();
      await storage.suspendCurrentPushBinding({
        authUserId,
        bindingId: enabledBinding.bindingId,
        expectedLocalRevision: enabledBinding.localRevision,
        reason: "auth_unavailable",
      });
      const before = await storage.readPushRuntimeState();
      if (before.kind !== "auth-unverified") throw new Error("AUTH_UNVERIFIED_BINDING_MISSING");

      const calls = [];
      let oldTokenMatches = false;
      let newTokenDiffers = false;
      const cleanup = cleanupModule.createNotificationPushCleanupCoordinator({
        storage,
        transport: {
          sendPushCleanup: async ({ cleanupToken }) => {
            calls.push("cleanup");
            const digest = new Uint8Array(
              await crypto.subtle.digest("SHA-256", new TextEncoder().encode(cleanupToken))
            );
            oldTokenMatches = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("") === window.name;
            return { kind: "completed" };
          },
        },
      });
      const coordinator = reenableModule.createNotificationPushManualReenableCoordinator({
        cleanup,
        enable: {
          enableProvisioning: async ({ authProofRevision, authUserId: owner, predecessor: received, provisioning }) => {
            calls.push("enable");
            if (authProofRevision !== 4 || owner !== authUserId) return { kind: "pending" };
            if (JSON.stringify(received) !== JSON.stringify(predecessor)) return { kind: "pending" };
            const digest = new Uint8Array(
              await crypto.subtle.digest("SHA-256", new TextEncoder().encode(provisioning.cleanupToken))
            );
            newTokenDiffers = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("") !== window.name;
            await storage.commitPushProvisioning({
              authUserId: owner,
              bindingId: provisioning.bindingId,
              consentEpoch: "99999999-9999-4999-8999-999999999999",
              consentId: "1",
              consentVersion: "1",
              deviceId: provisioning.deviceId,
              expectedLocalRevision: provisioning.localRevision,
            });
            return { kind: "committed" };
          },
        },
        isVerifiedAuthProofCurrent: ({ authUserId: owner, revision }) => owner === authUserId && revision === 4,
        storage,
      });
      const coordinatorResult = await coordinator.startManualPushReenable({
        authProofRevision: 4,
        authUserId,
        binding: before.binding,
      });
      const after = await storage.readPushRuntimeState();
      return {
        calls,
        coordinatorResult,
        newBinding: after.kind === "enabled" && after.binding.bindingId !== enabledBinding.bindingId,
        newTokenDiffers,
        oldTokenMatches,
        pendingCount: (await storage.listPendingPushCleanups()).length,
        runtime: after.kind,
      };
    },
    { authUserId: AUTH_USER_ID, enabledBinding: enabled, predecessor: SERVER_CONSENT }
  );
  expect(result).toEqual({
    calls: ["cleanup", "enable"],
    coordinatorResult: { kind: "committed" },
    newBinding: true,
    newTokenDiffers: true,
    oldTokenMatches: true,
    pendingCount: 0,
    runtime: "enabled",
  });
});

test("Auth rejected preserves exact B5 cleanup work when the B8 transport stays pending", async ({ page }) => {
  await page.goto("/");
  const enabled = await createEnabledBinding(page);
  expect(enabled).toMatchObject({ hasCleanupToken: false, state: "enabled" });

  const result = await page.evaluate(async (authUserId) => {
    const [storageModule, cleanupModule, authFailureModule] = await Promise.all([
      import("/src/notificationPushStorage.ts"),
      import("/src/notificationPushCleanupCoordinator.ts"),
      import("/src/notificationPushAuthFailureCoordinator.ts"),
    ]);
    const storage = storageModule.createNotificationPushStorage();
    const before = await storage.readPushRuntimeState();
    if (before.kind !== "enabled") return { wrongRuntime: before.kind };

    let transportCalls = 0;
    let receivedTokenMatches = false;
    const cleanup = cleanupModule.createNotificationPushCleanupCoordinator({
      storage,
      transport: {
        sendPushCleanup: async ({ cleanupToken }) => {
          transportCalls += 1;
          const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(cleanupToken)));
          receivedTokenMatches =
            Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("") === window.name;
          return { kind: "pending" };
        },
      },
    });
    const coordinator = authFailureModule.createNotificationPushAuthFailureCoordinator({ cleanup, storage });
    const coordinatorResult = await coordinator.processAuthFailure({
      authUserId,
      binding: before.binding,
      kind: "rejected",
    });
    const after = await storage.readPushRuntimeState();
    const pending = await storage.listPendingPushCleanups();
    return {
      coordinatorResult,
      pendingCount: pending.length,
      pendingOwner: pending[0]?.authUserId ?? null,
      pendingReason: pending[0]?.reason ?? null,
      receivedTokenMatches,
      resultExposesToken: JSON.stringify(coordinatorResult).includes("cleanupToken"),
      runtime: after.kind,
      transportCalls,
    };
  }, AUTH_USER_ID);
  expect(result).toEqual({
    coordinatorResult: { kind: "pending" },
    pendingCount: 1,
    pendingOwner: AUTH_USER_ID,
    pendingReason: "auth_rejected",
    receivedTokenMatches: true,
    resultExposesToken: false,
    runtime: "cleanup-pending",
    transportCalls: 1,
  });

  await page.reload();
  const persisted = await page.evaluate(async () => {
    const { createNotificationPushStorage } = await import("/src/notificationPushStorage.ts");
    const storage = createNotificationPushStorage();
    return {
      pendingCount: (await storage.listPendingPushCleanups()).length,
      runtime: (await storage.readPushRuntimeState()).kind,
    };
  });
  expect(persisted).toEqual({ pendingCount: 1, runtime: "cleanup-pending" });
});

test("Auth rejected completes exact B5 cleanup work through B8 once", async ({ page }) => {
  await page.goto("/");
  const enabled = await createEnabledBinding(page);
  expect(enabled).toMatchObject({ hasCleanupToken: false, state: "enabled" });

  const result = await page.evaluate(async (authUserId) => {
    const [storageModule, cleanupModule, authFailureModule] = await Promise.all([
      import("/src/notificationPushStorage.ts"),
      import("/src/notificationPushCleanupCoordinator.ts"),
      import("/src/notificationPushAuthFailureCoordinator.ts"),
    ]);
    const storage = storageModule.createNotificationPushStorage();
    const before = await storage.readPushRuntimeState();
    if (before.kind !== "enabled") return { wrongRuntime: before.kind };

    let transportCalls = 0;
    let receivedTokenMatches = false;
    const cleanup = cleanupModule.createNotificationPushCleanupCoordinator({
      storage,
      transport: {
        sendPushCleanup: async ({ cleanupToken }) => {
          transportCalls += 1;
          const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(cleanupToken)));
          receivedTokenMatches =
            Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("") === window.name;
          return { kind: "completed" };
        },
      },
    });
    const coordinator = authFailureModule.createNotificationPushAuthFailureCoordinator({ cleanup, storage });
    const coordinatorResult = await coordinator.processAuthFailure({
      authUserId,
      binding: before.binding,
      kind: "rejected",
    });
    return {
      coordinatorResult,
      pendingCount: (await storage.listPendingPushCleanups()).length,
      receivedTokenMatches,
      resultExposesToken: JSON.stringify(coordinatorResult).includes("cleanupToken"),
      runtime: (await storage.readPushRuntimeState()).kind,
      transportCalls,
    };
  }, AUTH_USER_ID);
  expect(result).toEqual({
    coordinatorResult: { kind: "cleanup-completed" },
    pendingCount: 0,
    receivedTokenMatches: true,
    resultExposesToken: false,
    runtime: "disabled",
    transportCalls: 1,
  });

  await page.reload();
  const persisted = await page.evaluate(async () => {
    const { createNotificationPushStorage } = await import("/src/notificationPushStorage.ts");
    const storage = createNotificationPushStorage();
    return {
      pendingCount: (await storage.listPendingPushCleanups()).length,
      runtime: (await storage.readPushRuntimeState()).kind,
    };
  });
  expect(persisted).toEqual({ pendingCount: 0, runtime: "disabled" });
});
