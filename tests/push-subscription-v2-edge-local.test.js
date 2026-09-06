import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { encodeBase64Url } from "../supabase/functions/_shared/push-cleanup-protocol.js";
import {
  encryptPushSubscriptionEnvelope,
  pushSubscriptionRsaThumbprint,
} from "../supabase/functions/_shared/push-subscription-v2-protocol.js";
import { loadLocalSupabaseConfig } from "./fixtures/localSupabaseConfig.js";
import { createProfile, makeAdminClient, signUpUser } from "./fixtures/localSupabase.js";

const LOCAL_ORIGIN = "http://127.0.0.1:5173";
const PROVIDER_ORIGIN = "https://push-fixture.qiuka.tw";
const RUN_LOCAL_EDGE_TEST = process.env.RUN_LOCAL_PUSH_SUBSCRIPTION_V2_EDGE_TEST === "1";
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SUPABASE_CLI = path.join(REPOSITORY_ROOT, "node_modules", "supabase", "dist", "supabase.js");
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

async function stopEdgeRuntime(child, closePromise) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    if (closePromise) await Promise.race([closePromise, delay(1_000)]);
    return;
  }
  child.kill("SIGINT");
  const stopped = await Promise.race([closePromise, delay(10_000).then(() => null)]);
  if (stopped) {
    if (stopped.code !== 0) throw new Error("The local Edge runtime exited unexpectedly.");
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
  await Promise.race([closePromise, delay(2_000)]);
  throw new Error("The local Edge runtime required a forced stop.");
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
  "encrypted enable and refresh traverse authoritative Auth and the real local DB commands",
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
    const deviceId = randomUUID();
    const bindingId = randomUUID();
    const cleanupTokenHash = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
    const subscription = {
      auth: encodeBase64Url(crypto.getRandomValues(new Uint8Array(16))),
      endpoint,
      p256dh: encodeBase64Url(p256dh),
    };

    let child;
    let childClosePromise;
    let createdUserId = "";
    let profileId = "";
    let accessToken = "";
    let output = "";
    let spawnFailed = false;
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
              bindingId,
              cleanupTokenHash,
              deviceId,
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
            bindingId,
            cleanupTokenHash,
            deviceId,
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

      stage = "enable command";
      const enableResponse = await send(enableBody);
      assert.equal(enableResponse.status, 200);
      const enabled = await enableResponse.json();
      assert.deepEqual(Object.keys(enabled).sort(), [
        "bindingId",
        "consentEpoch",
        "consentId",
        "consentVersion",
        "kind",
        "version",
      ]);
      assert.equal(enabled.bindingId, bindingId);
      assert.equal(enabled.kind, "committed");
      assert.equal(enabled.version, 1);

      stage = "refresh command";
      const refreshBody = JSON.stringify(
        await encryptPushSubscriptionEnvelope(
          {
            bindingId,
            deviceId,
            expectedConsent: {
              consentEpoch: enabled.consentEpoch,
              consentId: enabled.consentId,
              consentVersion: enabled.consentVersion,
            },
            kind: "refresh",
            subscription,
            version: 1,
          },
          createdUserId,
          rsaKeys.publicJwk
        )
      );
      const refreshResponse = await send(refreshBody);
      assert.equal(refreshResponse.status, 200);
      assert.deepEqual(await refreshResponse.json(), enabled);

      stage = "database verification";
      assert.equal(
        runLocalDatabaseSql(`
          select consent_row.state || '|' || consent_row.client_binding_id::text || '|' || subscription_row.endpoint
          from private.push_device_consents consent_row
          join public.push_subscriptions subscription_row on subscription_row.consent_id = consent_row.id
          where consent_row.profile_id = ${profileId}::bigint
            and consent_row.device_id = '${deviceId}'::uuid;
        `),
        `enabled|${bindingId}|${endpoint}`
      );

      stage = "Edge shutdown and log scan";
      await delay(300);
      await stopEdgeRuntime(child, childClosePromise);
      child = undefined;
      for (const sensitive of [accessToken, cleanupTokenHash, endpoint, serializedJwks, ...privateKeyValues]) {
        assert.equal(output.includes(sensitive), false, "Edge output must not contain Push v2 secrets or capabilities");
      }
    } catch (error) {
      const safeDetail = stage === "foreign provider rejection" ? ` ${String(error?.message ?? "")}` : "";
      testError = new Error(`Push v2 Edge flow failed at ${stage}.${safeDetail}`, { cause: error });
    }

    const cleanupErrors = [];
    try {
      if (child && childClosePromise) await stopEdgeRuntime(child, childClosePromise);
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
