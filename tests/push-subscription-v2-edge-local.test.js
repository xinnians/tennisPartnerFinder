import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import { encodeBase64Url } from "../supabase/functions/_shared/push-cleanup-protocol.js";
import {
  canonicalPushSubscriptionPublicJwkJson,
  encryptPushSubscriptionEnvelope,
  pushSubscriptionRsaThumbprint,
} from "../supabase/functions/_shared/push-subscription-v2-protocol.js";
import { loadLocalSupabaseConfig } from "./fixtures/localSupabaseConfig.js";
import { createProfile, makeAdminClient, signUpUser } from "./fixtures/localSupabase.js";

const LOCAL_ORIGIN = "http://127.0.0.1:5176";
const PUBLIC_KEY_URL = `${LOCAL_ORIGIN}/push-subscription-key-v1.json`;
const PROVIDER_ORIGIN = "https://push-fixture.qiuka.tw";
const RUN_LOCAL_EDGE_TEST = process.env.RUN_LOCAL_PUSH_SUBSCRIPTION_V2_EDGE_TEST === "1";
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SUPABASE_CLI = path.join(REPOSITORY_ROOT, "node_modules", "supabase", "dist", "supabase.js");
const VITE_CLI = path.join(REPOSITORY_ROOT, "node_modules", "vite", "bin", "vite.js");
const STARTUP_TIMEOUT_MS = 30_000;
const TEST_TIMEOUT_MS = 75_000;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function localDatabaseContainerId() {
  const containers = spawnSync(
    "docker",
    ["ps", "--filter", `label=com.supabase.cli.workdir=${REPOSITORY_ROOT}`, "--format", "{{.ID}} {{.Names}}"],
    { encoding: "utf8", maxBuffer: 1024 * 1024 }
  );
  if (containers.error || containers.status !== 0) throw new Error("Unable to locate the local database container.");
  for (const line of containers.stdout.split(/\r?\n/u)) {
    const [id, name] = line.trim().split(/\s+/u);
    if (id && name?.startsWith("supabase_db_")) return id;
  }
  throw new Error("The local Supabase database container is not running.");
}

function runLocalDatabaseSql(sql) {
  const result = spawnSync(
    "docker",
    ["exec", "-i", localDatabaseContainerId(), "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres"],
    { encoding: "utf8", input: sql, maxBuffer: 1024 * 1024 }
  );
  if (result.error || result.status !== 0) throw new Error("The local Push v2 DB fixture command failed.");
  return result.stdout.trim();
}

function sqlLiteral(value) {
  return value === null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
}

async function generateRsaKeys() {
  const pair = await crypto.subtle.generateKey(
    {
      hash: "SHA-256",
      modulusLength: 2048,
      name: "RSA-OAEP",
      publicExponent: new Uint8Array([1, 0, 1]),
    },
    true,
    ["encrypt", "decrypt"]
  );
  const [publicJwk, privateJwk] = await Promise.all([
    crypto.subtle.exportKey("jwk", pair.publicKey),
    crypto.subtle.exportKey("jwk", pair.privateKey),
  ]);
  const kid = await pushSubscriptionRsaThumbprint(publicJwk);
  return { privateJwk: { ...privateJwk, kid }, publicJwk: { ...publicJwk, kid } };
}

async function generateP256PublicKey() {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
}

async function fetchWithTimeout(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(2_000) });
}

async function waitUntilReady(url, child, didSpawnFail) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (didSpawnFail() || child.exitCode !== null || child.signalCode !== null) {
      throw new Error("The local Edge runtime exited before Push v2 became ready.");
    }
    try {
      const response = await fetchWithTimeout(url, { headers: { origin: LOCAL_ORIGIN } });
      if (response.status === 400 && (await response.text()) === '{"kind":"invalid","version":1}') return;
    } catch {
      // The gateway can refuse connections while the worker is compiling.
    }
    await delay(100);
  }
  throw new Error("The local Push v2 Edge handler did not become ready.");
}

async function waitUntilPublicKeyReady(child, didSpawnFail) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (didSpawnFail() || child.exitCode !== null || child.signalCode !== null) {
      throw new Error("The local Vite runtime exited before the Push v2 public key became ready.");
    }
    try {
      const response = await fetchWithTimeout(PUBLIC_KEY_URL);
      if (response.status === 200 && response.headers.get("cache-control") === "no-store") return;
    } catch {
      // Vite can refuse connections while its plugin is starting.
    }
    await delay(100);
  }
  throw new Error("The local Push v2 public-key asset did not become ready.");
}

async function stopRuntime(child, closePromise, name) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    if (closePromise) await Promise.race([closePromise, delay(1_000)]);
    return;
  }
  child.kill("SIGINT");
  const stopped = await Promise.race([closePromise, delay(10_000).then(() => null)]);
  if (stopped) {
    if (stopped.code !== 0 && stopped.signal !== "SIGINT")
      throw new Error(`The local ${name} runtime exited unexpectedly.`);
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
  await Promise.race([closePromise, delay(2_000)]);
  throw new Error(`The local ${name} runtime required a forced stop.`);
}

function runtimeControlSnapshot() {
  return JSON.parse(
    runLocalDatabaseSql(`
      select pg_catalog.json_build_object(
        'newRuntimeMode', new_runtime_mode,
        'workerLease', worker_lease_duration::text,
        'requestDeadline', request_deadline_duration::text,
        'deliveryLease', delivery_lease_duration::text,
        'maxAttempts', max_delivery_attempts,
        'ttlBudget', push_ttl_safety_budget::text
      )::text
      from private.notification_runtime_control
      where singleton_id = 1;
    `)
  );
}

function restoreRuntimeControl(snapshot) {
  runLocalDatabaseSql(`
    update private.notification_runtime_control
    set new_runtime_mode = ${sqlLiteral(snapshot.newRuntimeMode)},
        worker_lease_duration = ${sqlLiteral(snapshot.workerLease)}::interval,
        request_deadline_duration = ${sqlLiteral(snapshot.requestDeadline)}::interval,
        delivery_lease_duration = ${sqlLiteral(snapshot.deliveryLease)}::interval,
        max_delivery_attempts = ${snapshot.maxAttempts === null ? "null" : Number(snapshot.maxAttempts)},
        push_ttl_safety_budget = ${sqlLiteral(snapshot.ttlBudget)}::interval
    where singleton_id = 1;
  `);
}

test(
  "browser composition enable and refresh traverse the real local Edge, Auth, DB, and IndexedDB",
  { skip: !RUN_LOCAL_EDGE_TEST, timeout: TEST_TIMEOUT_MS },
  async () => {
    const { apiUrl } = loadLocalSupabaseConfig();
    const functionUrl = `${apiUrl}/functions/v1/push-subscription-v2`;
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "qiuka-push-subscription-v2-edge-"));
    const environmentPath = path.join(temporaryDirectory, "function.env");
    const [rsaKeys, p256dh, vapid] = await Promise.all([
      generateRsaKeys(),
      generateP256PublicKey(),
      generateP256PublicKey(),
    ]);
    const serializedJwks = JSON.stringify({ keys: [rsaKeys.privateJwk] });
    const serializedPublicJwk = await canonicalPushSubscriptionPublicJwkJson(rsaKeys.publicJwk);
    const privateKeyValues = ["d", "p", "q", "dp", "dq", "qi"].map((name) => rsaKeys.privateJwk[name]);
    const environment = [
      "PUSH_SUBSCRIPTION_V2_RUNTIME_MODE=local-test-v1",
      `PUSH_SUBSCRIPTION_V2_ALLOWED_ORIGIN=${LOCAL_ORIGIN}`,
      `PUSH_SUBSCRIPTION_V2_PRIVATE_JWKS_JSON=${serializedJwks}`,
      `PUSH_PROVIDER_ORIGINS_V1=${JSON.stringify([PROVIDER_ORIGIN])}`,
      `WEB_PUSH_VAPID_PUBLIC_KEY=${encodeBase64Url(vapid)}`,
      "",
    ].join("\n");
    const runtimeSnapshot = runtimeControlSnapshot();
    const endpoint = `${PROVIDER_ORIGIN}/send/${randomUUID()}`;
    const canaryDeviceId = randomUUID();
    const canaryBindingId = randomUUID();
    const canaryCleanupTokenHash = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
    const subscription = {
      auth: encodeBase64Url(crypto.getRandomValues(new Uint8Array(16))),
      endpoint,
      p256dh: encodeBase64Url(p256dh),
    };

    let child;
    let childClosePromise;
    let viteChild;
    let viteClosePromise;
    let browser;
    let createdUserId = "";
    let profileId = "";
    let accessToken = "";
    let output = "";
    let spawnFailed = false;
    let viteSpawnFailed = false;
    let testError;
    let stage = "account setup";
    try {
      const account = await signUpUser(`push-v2-edge-${randomUUID()}@example.test`);
      createdUserId = account.session.user.id;
      accessToken = account.session.access_token;
      await createProfile(account.client, {
        courts: ["青年公園網球場"],
        nickname: "本機 Push v2 Edge 測試",
        ntrp: 3.5,
        playTypes: ["單打"],
        slots: ["we-m"],
      });
      profileId = runLocalDatabaseSql(`
        select profile_row.id::text
        from public.profiles profile_row
        where profile_row.user_id = '${createdUserId}'::uuid;
      `);
      assert.match(profileId, /^[1-9][0-9]*$/u);
      runLocalDatabaseSql(`
        update private.notification_runtime_control
        set new_runtime_mode = 'canary',
            worker_lease_duration = interval '30 seconds',
            request_deadline_duration = interval '10 seconds',
            delivery_lease_duration = interval '30 seconds',
            max_delivery_attempts = 3,
            push_ttl_safety_budget = interval '5 seconds'
        where singleton_id = 1;
        insert into private.notification_runtime_canary_profiles (profile_id)
        values (${profileId}::bigint);
      `);

      stage = "Edge startup";
      await writeFile(environmentPath, environment, { mode: 0o600 });
      assert.equal((await stat(environmentPath)).mode & 0o777, 0o600);
      child = spawn(process.execPath, [SUPABASE_CLI, "functions", "serve", "--env-file", environmentPath], {
        cwd: REPOSITORY_ROOT,
        detached: true,
        env: { ...process.env, SUPABASE_NO_UPDATE_NOTIFIER: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.on("error", () => {
        spawnFailed = true;
      });
      childClosePromise = new Promise((resolve) => {
        child.once("close", (code, signal) => resolve({ code, signal }));
      });
      for (const stream of [child.stdout, child.stderr]) {
        stream.setEncoding("utf8");
        stream.on("data", (chunk) => {
          output = `${output}${chunk}`.slice(-1024 * 1024);
        });
      }
      await waitUntilReady(functionUrl, child, () => spawnFailed);

      const send = async (body, token = accessToken, origin = LOCAL_ORIGIN) =>
        fetchWithTimeout(functionUrl, {
          body,
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json", origin },
          method: "POST",
        });

      stage = "foreign provider rejection";
      const foreignResponse = await send(
        JSON.stringify(
          await encryptPushSubscriptionEnvelope(
            {
              bindingId: canaryBindingId,
              cleanupTokenHash: canaryCleanupTokenHash,
              deviceId: canaryDeviceId,
              kind: "enable",
              predecessor: null,
              subscription: { ...subscription, endpoint: `https://foreign-provider.qiuka.tw/send/${randomUUID()}` },
              version: 1,
            },
            createdUserId,
            rsaKeys.publicJwk
          )
        )
      );
      const foreignBody = await foreignResponse.text();
      if (foreignResponse.status !== 409 || foreignBody !== '{"kind":"endpoint-unavailable","version":1}') {
        throw new Error(`Foreign-provider gate returned HTTP ${foreignResponse.status}.`);
      }

      stage = "encrypted enable preparation";
      const enableBody = JSON.stringify(
        await encryptPushSubscriptionEnvelope(
          {
            bindingId: canaryBindingId,
            cleanupTokenHash: canaryCleanupTokenHash,
            deviceId: canaryDeviceId,
            kind: "enable",
            predecessor: null,
            subscription,
            version: 1,
          },
          createdUserId,
          rsaKeys.publicJwk
        )
      );
      stage = "invalid JWT rejection";
      const rejectedResponse = await send(enableBody, "invalid-user-jwt");
      assert.equal(rejectedResponse.status, 401);

      stage = "untrusted Origin rejection";
      const forbiddenResponse = await send(enableBody, accessToken, `${LOCAL_ORIGIN}.evil.test`);
      assert.equal(forbiddenResponse.status, 503);

      stage = "public-key server startup";
      viteChild = spawn(process.execPath, [VITE_CLI, "--host", "127.0.0.1", "--port", "5176", "--strictPort"], {
        cwd: REPOSITORY_ROOT,
        detached: true,
        env: { ...process.env, PUSH_SUBSCRIPTION_PUBLIC_JWK_JSON: serializedPublicJwk },
        stdio: ["ignore", "pipe", "pipe"],
      });
      viteChild.on("error", () => {
        viteSpawnFailed = true;
      });
      viteClosePromise = new Promise((resolve) => {
        viteChild.once("close", (code, signal) => resolve({ code, signal }));
      });
      for (const stream of [viteChild.stdout, viteChild.stderr]) {
        stream.setEncoding("utf8");
        stream.on("data", (chunk) => {
          output = `${output}${chunk}`.slice(-1024 * 1024);
        });
      }
      await waitUntilPublicKeyReady(viteChild, () => viteSpawnFailed);

      stage = "browser composition enable and refresh";
      browser = await chromium.launch();
      const page = await browser.newPage();
      await page.goto(PUBLIC_KEY_URL);
      const browserResult = await page.evaluate(
        async ({ accessToken, authUserId, functionUrl, subscription, vapidPublicKey }) => {
          const { createNotificationPushSubscriptionLocalComposition } =
            await import("/src/notificationPushSubscriptionLocalComposition.ts");
          const { PUSH_STORAGE_DATABASE_NAME } = await import("/src/notificationPushStorage.ts");
          const decode = (value) => {
            const padding = "=".repeat((4 - (value.length % 4)) % 4);
            const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/") + padding);
            return Uint8Array.from(binary, (character) => character.charCodeAt(0));
          };
          const deleteDatabase = () =>
            new Promise((resolve, reject) => {
              const request = globalThis.indexedDB.deleteDatabase(PUSH_STORAGE_DATABASE_NAME);
              request.onsuccess = () => resolve();
              request.onerror = () => reject(request.error);
              request.onblocked = () => reject(new Error("delete blocked"));
            });

          await deleteDatabase();
          const proof = { accessToken, authUserId, revision: 21 };
          const calls = [];
          const postBodies = [];
          let currentSubscription = null;
          const fakeSubscription = {
            endpoint: subscription.endpoint,
            options: { applicationServerKey: decode(vapidPublicKey).buffer },
            toJSON: () => ({
              endpoint: subscription.endpoint,
              keys: { auth: subscription.auth, p256dh: subscription.p256dh },
            }),
            unsubscribe: async () => true,
          };
          const registration = {
            pushManager: {
              getSubscription: async () => currentSubscription,
              subscribe: async () => {
                calls.push("subscribe");
                currentSubscription = fakeSubscription;
                return currentSubscription;
              },
            },
          };
          const composition = createNotificationPushSubscriptionLocalComposition({
            auth: {
              isVerifiedAuthProofCurrent: (candidate) =>
                candidate.accessToken === proof.accessToken &&
                candidate.authUserId === proof.authUserId &&
                candidate.revision === proof.revision,
              notifyUnauthorized: () => calls.push("unauthorized"),
              readVerifiedAuthProof: async () => proof,
            },
            fetchRef: async (url, init) => {
              calls.push(init.method);
              if (init.method === "POST") postBodies.push(init.body);
              return fetch(url, init);
            },
            navigatorRef: {
              serviceWorker: {
                getRegistration: async () => registration,
                ready: Promise.resolve(registration),
                register: async (scriptUrl) => {
                  calls.push(scriptUrl);
                  return registration;
                },
              },
            },
            notificationRef: { permission: "granted", requestPermission: async () => "granted" },
            subscriptionEndpoint: functionUrl,
            vapidPublicKey,
          });

          try {
            const deviceId = await composition.storage.getOrCreateLogicalDeviceId();
            const provisioning = await composition.storage.beginExplicitPushProvisioning({
              authUserId,
              deviceId,
              expectedCurrentRevision: null,
            });
            const enableOutcome = await composition.coordinator.enableProvisioning({
              authProofRevision: proof.revision,
              authUserId,
              predecessor: null,
              provisioning,
            });
            const enabledRuntime = await composition.storage.readPushRuntimeState();
            if (enabledRuntime.kind !== "enabled") throw new Error("local enable did not commit");
            const refreshOutcome = await composition.coordinator.refreshEnabledBinding({
              authProofRevision: proof.revision,
              authUserId,
              binding: enabledRuntime.binding,
            });
            const finalRuntime = await composition.storage.readPushRuntimeState();
            return {
              calls,
              cleanupToken: provisioning.cleanupToken,
              enableOutcome,
              enabledRuntime,
              finalRuntime,
              postBodiesHideEndpoint: postBodies.every((body) => !body.includes(subscription.endpoint)),
              postBodiesHideToken: postBodies.every((body) => !body.includes(provisioning.cleanupToken)),
              postCount: postBodies.length,
              refreshOutcome,
            };
          } finally {
            await deleteDatabase();
          }
        },
        {
          accessToken,
          authUserId: createdUserId,
          functionUrl,
          subscription,
          vapidPublicKey: encodeBase64Url(vapid),
        }
      );
      await browser.close();
      browser = undefined;

      assert.deepEqual(browserResult.enableOutcome, { kind: "committed" });
      assert.deepEqual(browserResult.refreshOutcome, { kind: "committed" });
      assert.equal(browserResult.enabledRuntime.kind, "enabled");
      assert.equal(browserResult.finalRuntime.kind, "enabled");
      assert.deepEqual(browserResult.finalRuntime.binding, browserResult.enabledRuntime.binding);
      assert.equal(browserResult.postCount, 2);
      assert.equal(browserResult.postBodiesHideEndpoint, true);
      assert.equal(browserResult.postBodiesHideToken, true);
      assert.deepEqual(browserResult.calls, ["/push-sw.js", "subscribe", "GET", "POST", "/push-sw.js", "GET", "POST"]);

      stage = "database verification";
      assert.equal(
        runLocalDatabaseSql(`
          select consent_row.state || '|' || consent_row.client_binding_id::text || '|' || subscription_row.endpoint
          from private.push_device_consents consent_row
          join public.push_subscriptions subscription_row on subscription_row.consent_id = consent_row.id
          where consent_row.profile_id = ${profileId}::bigint
            and consent_row.device_id = '${browserResult.enabledRuntime.deviceId}'::uuid;
        `),
        `enabled|${browserResult.enabledRuntime.binding.bindingId}|${endpoint}`
      );

      stage = "runtime shutdown and log scan";
      await delay(300);
      await stopRuntime(child, childClosePromise, "Edge");
      child = undefined;
      await stopRuntime(viteChild, viteClosePromise, "Vite");
      viteChild = undefined;
      for (const sensitive of [
        accessToken,
        browserResult.cleanupToken,
        canaryCleanupTokenHash,
        endpoint,
        serializedJwks,
        ...privateKeyValues,
      ]) {
        assert.equal(output.includes(sensitive), false, "Edge output must not contain Push v2 secrets or capabilities");
      }
    } catch (error) {
      const safeDetail = stage === "foreign provider rejection" ? ` ${String(error?.message ?? "")}` : "";
      testError = new Error(`Push v2 Edge flow failed at ${stage}.${safeDetail}`, { cause: error });
    }

    const cleanupErrors = [];
    try {
      if (browser) await browser.close();
    } catch (error) {
      cleanupErrors.push(new Error("Push v2 browser cleanup failed.", { cause: error }));
    }
    try {
      if (viteChild && viteClosePromise) await stopRuntime(viteChild, viteClosePromise, "Vite");
    } catch (error) {
      cleanupErrors.push(new Error("Push v2 Vite process cleanup failed.", { cause: error }));
    }
    try {
      if (child && childClosePromise) await stopRuntime(child, childClosePromise, "Edge");
    } catch (error) {
      cleanupErrors.push(new Error("Push v2 Edge process cleanup failed.", { cause: error }));
    }
    if (profileId) {
      try {
        runLocalDatabaseSql(`
          delete from private.notification_runtime_canary_profiles where profile_id = ${profileId}::bigint;
          delete from public.push_subscriptions where profile_id = ${profileId}::bigint;
          delete from private.push_device_consents where profile_id = ${profileId}::bigint;
          delete from private.push_endpoint_registry
          where endpoint_fingerprint = pg_catalog.sha256(pg_catalog.convert_to('${endpoint}', 'UTF8'));
        `);
      } catch (error) {
        cleanupErrors.push(new Error("Push v2 database fixture cleanup failed.", { cause: error }));
      }
    }
    try {
      restoreRuntimeControl(runtimeSnapshot);
    } catch (error) {
      cleanupErrors.push(new Error("Push v2 runtime-control restore failed.", { cause: error }));
    }
    if (createdUserId) {
      try {
        const { error } = await makeAdminClient().auth.admin.deleteUser(createdUserId);
        if (error) cleanupErrors.push(new Error("Unable to remove the local Push v2 test account."));
      } catch (error) {
        cleanupErrors.push(new Error("Push v2 Auth fixture cleanup failed.", { cause: error }));
      }
    }
    try {
      await rm(temporaryDirectory, { force: true, recursive: true });
    } catch (error) {
      cleanupErrors.push(new Error("Push v2 temporary-file cleanup failed.", { cause: error }));
    }

    if (testError && cleanupErrors.length) {
      throw new Error(
        `${testError.message} Cleanup failures: ${cleanupErrors.map((error) => error.message).join(" ")}`
      );
    }
    if (testError) throw testError;
    if (cleanupErrors.length === 1) throw cleanupErrors[0];
    if (cleanupErrors.length > 1) throw new AggregateError(cleanupErrors, "Push v2 Edge teardown failed.");
  }
);
