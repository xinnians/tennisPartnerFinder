import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  cleanupTokenDigestHex,
  encodeBase64Url,
  encryptCleanupTokenEnvelope,
  rsaJwkThumbprint,
} from "../supabase/functions/push-cleanup/crypto.js";
import { deriveRateLimitBucketHashes, loadRateLimitHmacKey } from "../supabase/functions/push-cleanup/rate-limit.js";
import { loadLocalSupabaseConfig } from "./fixtures/localSupabaseConfig.js";
import { createProfile, makeAdminClient, signUpUser } from "./fixtures/localSupabase.js";

const LOCAL_ORIGIN = "http://127.0.0.1:5173";
const RUN_LOCAL_EDGE_TEST = process.env.RUN_LOCAL_PUSH_CLEANUP_EDGE_TEST === "1";
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SUPABASE_CLI = path.join(REPOSITORY_ROOT, "node_modules", "supabase", "dist", "supabase.js");
const STARTUP_TIMEOUT_MS = 30_000;
const TEST_TIMEOUT_MS = 75_000;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function generateKeyMaterial() {
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
  const kid = await rsaJwkThumbprint(publicJwk);
  if (!kid) throw new Error("Unable to create the local cleanup key id.");
  return {
    privateJwk: { ...privateJwk, kid },
    publicJwk: { ...publicJwk, kid },
  };
}

function watchOutput(streams, sensitiveValues) {
  let leaked = false;
  const overlap = Math.max(...sensitiveValues.map((value) => value.length), 1) - 1;

  for (const stream of streams) {
    let trailingText = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      const text = `${trailingText}${chunk}`;
      if (sensitiveValues.some((value) => value && text.includes(value))) leaked = true;
      trailingText = text.slice(-overlap);
    });
  }

  return () => leaked;
}

function localContainerLogsContainSensitiveValue(since, sensitiveValues) {
  const containers = spawnSync(
    "docker",
    ["ps", "-a", "--filter", `label=com.supabase.cli.workdir=${REPOSITORY_ROOT}`, "--format", "{{.ID}}"],
    { encoding: "utf8", maxBuffer: 1024 * 1024 }
  );
  if (containers.error || containers.status !== 0) {
    throw new Error("Unable to enumerate local Supabase containers for the cleanup log check.");
  }

  const containerIds = containers.stdout.split(/\s+/u).filter(Boolean);
  if (containerIds.length === 0) throw new Error("No local Supabase containers were available for the log check.");

  for (const containerId of containerIds) {
    const logs = spawnSync("docker", ["logs", "--since", since, containerId], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    if (logs.error || logs.status !== 0) {
      throw new Error("Unable to inspect one local Supabase container log.");
    }
    const output = `${logs.stdout}${logs.stderr}`;
    if (sensitiveValues.some((value) => output.includes(value))) return true;
  }
  return false;
}

function localDatabaseContainerId() {
  const containers = spawnSync(
    "docker",
    ["ps", "--filter", `label=com.supabase.cli.workdir=${REPOSITORY_ROOT}`, "--format", "{{.ID}} {{.Names}}"],
    { encoding: "utf8", maxBuffer: 1024 * 1024 }
  );
  if (containers.error || containers.status !== 0) {
    throw new Error("Unable to locate the local Supabase database container.");
  }
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
  if (result.error || result.status !== 0) throw new Error("The local cleanup DB fixture command failed.");
  return result.stdout.trim();
}

function localSupabaseAdminLogValues(expectedApiUrl) {
  const result = spawnSync(process.execPath, [SUPABASE_CLI, "status", "-o", "json"], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error("Unable to read local Supabase admin keys for the cleanup log check.");
  }

  let status;
  try {
    status = JSON.parse(result.stdout);
  } catch {
    throw new Error("The local Supabase status was not valid JSON.");
  }
  const values = [status.SECRET_KEY, status.SERVICE_ROLE_KEY];
  if (status.API_URL !== expectedApiUrl || values.some((value) => typeof value !== "string" || !value)) {
    throw new Error("The local Supabase admin keys were unavailable for the cleanup log check.");
  }
  return values;
}

async function fetchWithTimeout(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(2_000) });
}

async function waitUntilHandlerIsReady(url, child, didSpawnFail) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let lastObservation = "no HTTP response";
  while (Date.now() < deadline) {
    if (didSpawnFail() || child.exitCode !== null || child.signalCode !== null) {
      throw new Error("The local Edge runtime exited before the cleanup handler became ready.");
    }
    try {
      const response = await fetchWithTimeout(url, { headers: { origin: LOCAL_ORIGIN } });
      const body = await response.text();
      const outcome = /^\{"outcome":"(?:METHOD_NOT_ALLOWED|RETRY|FORBIDDEN)"\}$/u.test(body)
        ? body
        : "non-contract response";
      lastObservation = `HTTP ${response.status}, ${outcome}`;
      if (response.status === 405 && body === '{"outcome":"METHOD_NOT_ALLOWED"}') return;
    } catch {
      // The loopback gateway can refuse connections while the worker is compiling.
    }
    await delay(100);
  }
  throw new Error(
    `The local cleanup handler did not become ready within ${STARTUP_TIMEOUT_MS / 1_000} seconds (${lastObservation}).`
  );
}

function waitForChildClose(closePromise, milliseconds) {
  return Promise.race([closePromise, delay(milliseconds).then(() => null)]);
}

async function stopEdgeRuntime(child, closePromise) {
  if (!child.pid) {
    await waitForChildClose(closePromise, 1_000);
    return;
  }
  if (child.exitCode !== null || child.signalCode !== null) {
    const result = await waitForChildClose(closePromise, 1_000);
    if (!result || result.code !== 0) throw new Error("The local Edge runtime exited unexpectedly.");
    return;
  }

  child.kill("SIGINT");
  const stoppedAfterInterrupt = await waitForChildClose(closePromise, 10_000);
  if (stoppedAfterInterrupt) {
    if (stoppedAfterInterrupt.code !== 0) {
      throw new Error("The local Edge runtime did not exit cleanly after SIGINT.");
    }
    return;
  }

  child.kill("SIGTERM");
  const stoppedAfterTerminate = await waitForChildClose(closePromise, 5_000);
  if (!stoppedAfterTerminate) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
    const stoppedAfterKill = await waitForChildClose(closePromise, 2_000);
    if (!stoppedAfterKill) throw new Error("The local Edge runtime process group could not be stopped.");
  }
  throw new Error("The local Edge runtime required SIGTERM after SIGINT timed out.");
}

test(
  "canonical envelope traverses the local Edge RPC while a suffix origin is rejected",
  { skip: !RUN_LOCAL_EDGE_TEST, timeout: TEST_TIMEOUT_MS },
  async () => {
    const { apiUrl } = loadLocalSupabaseConfig();
    const adminLogValues = localSupabaseAdminLogValues(apiUrl);
    const functionUrl = `${apiUrl}/functions/v1/push-cleanup`;
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "qiuka-push-cleanup-edge-"));
    const environmentPath = path.join(temporaryDirectory, "function.env");
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = encodeBase64Url(tokenBytes);
    tokenBytes.fill(0);
    const digest = await cleanupTokenDigestHex(token);
    const rateLimitKeyBytes = crypto.getRandomValues(new Uint8Array(32));
    const serializedRateLimitKey = encodeBase64Url(rateLimitKeyBytes);
    rateLimitKeyBytes.fill(0);
    const rateLimitKey = await loadRateLimitHmacKey(serializedRateLimitKey);
    const rateLimitBuckets = await deriveRateLimitBucketHashes("127.0.0.1", rateLimitKey);
    const rateLimitPolicy = JSON.stringify({
      global: { capacity: 5, refillMilliseconds: 1000000 },
      idleTtlSeconds: 60,
      source: { capacity: 3, refillMilliseconds: 1000000 },
      version: 1,
    });
    const { privateJwk, publicJwk } = await generateKeyMaterial();
    if (!digest || typeof privateJwk.d !== "string") {
      throw new Error("Unable to create local cleanup test material.");
    }
    const privateKeyValues = ["d", "p", "q", "dp", "dq", "qi"].map((name) => privateJwk[name]);
    if (privateKeyValues.some((value) => typeof value !== "string")) {
      throw new Error("The local cleanup test key is missing private RSA fields.");
    }
    const serializedJwks = JSON.stringify({ keys: [privateJwk] });
    const envelope = await encryptCleanupTokenEnvelope(token, publicJwk);
    const environment = [
      "PUSH_CLEANUP_RUNTIME_MODE=local-test-v1",
      `PUSH_CLEANUP_ALLOWED_ORIGIN=${LOCAL_ORIGIN}`,
      `PUSH_CLEANUP_PRIVATE_JWKS_JSON=${serializedJwks}`,
      `PUSH_CLEANUP_RATE_LIMIT_HMAC_KEY=${serializedRateLimitKey}`,
      `PUSH_CLEANUP_RATE_LIMIT_POLICY_JSON=${rateLimitPolicy}`,
      "",
    ].join("\n");

    let child;
    let childClosePromise;
    let createdUserId = "";
    let adminClient;
    let spawnFailed = false;
    let outputContainsBundlerWarning;
    let outputContainsSensitiveValue;
    let testError;
    const logWindowStart = new Date(Date.now() - 1_000).toISOString();
    try {
      adminClient = makeAdminClient();
      const account = await signUpUser(`push-cleanup-edge-${randomUUID()}@example.test`);
      createdUserId = account.session.user.id;
      await createProfile(account.client, {
        courts: ["青年公園網球場"],
        nickname: "本機 Edge 清理測試",
        ntrp: 3.5,
        playTypes: ["單打"],
        slots: ["we-m"],
      });
      const deviceId = randomUUID();
      const clientBindingId = randomUUID();
      if (
        !/^[0-9a-f-]{36}$/u.test(createdUserId) ||
        !/^[0-9a-f-]{36}$/u.test(deviceId) ||
        !/^[0-9a-f-]{36}$/u.test(clientBindingId)
      ) {
        throw new Error("The local cleanup fixture IDs are invalid.");
      }
      runLocalDatabaseSql(`
        delete from private.push_cleanup_rate_limit_buckets bucket_row
        where (bucket_row.scope = 'global'
            and bucket_row.bucket_hash = pg_catalog.decode(
              '${rateLimitBuckets.globalBucketHash}', 'hex'
            ))
          or (bucket_row.scope = 'source'
            and bucket_row.bucket_hash = pg_catalog.decode(
              '${rateLimitBuckets.sourceBucketHash}', 'hex'
            ));
      `);
      const consentId = runLocalDatabaseSql(`
        insert into private.push_device_consents (
          profile_id,
          device_id,
          client_binding_id,
          state,
          reason_code,
          cleanup_token_hash
        )
        select
          profile_row.id,
          '${deviceId}'::uuid,
          '${clientBindingId}'::uuid,
          'enabled',
          'user_enabled',
          pg_catalog.decode('${digest}', 'hex')
        from public.profiles profile_row
        where profile_row.user_id = '${createdUserId}'::uuid
        returning id;
      `);
      assert.match(consentId, /^\d+$/u);

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
      outputContainsBundlerWarning = watchOutput(
        [child.stdout, child.stderr],
        ["Skipping import path outside source root"]
      );
      outputContainsSensitiveValue = watchOutput(
        [child.stdout, child.stderr],
        [
          token,
          digest,
          serializedRateLimitKey,
          rateLimitBuckets.globalBucketHash,
          rateLimitBuckets.sourceBucketHash,
          ...privateKeyValues,
          serializedJwks,
          ...adminLogValues,
        ]
      );

      await waitUntilHandlerIsReady(functionUrl, child, () => spawnFailed);
      const preflightHeaders = {
        "access-control-request-headers": "content-type",
        "access-control-request-method": "POST",
      };
      const allowedPreflight = await fetchWithTimeout(functionUrl, {
        headers: { ...preflightHeaders, origin: LOCAL_ORIGIN },
        method: "OPTIONS",
      });
      const allowedPreflightBody = await allowedPreflight.text();

      const forbiddenPreflight = await fetchWithTimeout(functionUrl, {
        headers: { ...preflightHeaders, origin: "https://qiuka.tw.evil.example" },
        method: "OPTIONS",
      });
      const forbiddenPreflightBody = await forbiddenPreflight.text();
      const preflightSnapshot = (response, body) => ({
        allowHeaders: response.headers.get("access-control-allow-headers"),
        allowMethods: response.headers.get("access-control-allow-methods"),
        allowOrigin: response.headers.get("access-control-allow-origin"),
        body,
        status: response.status,
        vary: response.headers.get("vary"),
      });
      const expectedGatewayPreflight = {
        allowHeaders: "content-type",
        allowMethods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS,TRACE,CONNECT",
        allowOrigin: "*",
        body: "",
        status: 200,
        vary: null,
      };
      // Pinned local Supabase 2.115.0 answers OPTIONS at its gateway for both
      // origins. The handler's exact-origin preflight contract is unit-tested;
      // the suffix POST below proves the external request still reaches that
      // handler gate and is rejected before crypto or DB work.
      assert.deepEqual(preflightSnapshot(allowedPreflight, allowedPreflightBody), expectedGatewayPreflight);
      assert.deepEqual(preflightSnapshot(forbiddenPreflight, forbiddenPreflightBody), expectedGatewayPreflight);

      const forbiddenResponse = await fetchWithTimeout(functionUrl, {
        body: JSON.stringify(envelope),
        headers: { "content-type": "application/json", origin: "https://qiuka.tw.evil.example" },
        method: "POST",
      });
      assert.equal(forbiddenResponse.status, 403);
      assert.equal(await forbiddenResponse.text(), '{"outcome":"FORBIDDEN"}');

      const response = await fetchWithTimeout(functionUrl, {
        body: JSON.stringify(envelope),
        headers: { "content-type": "application/json", origin: LOCAL_ORIGIN },
        method: "POST",
      });

      assert.equal(response.status, 200);
      // Pinned local Supabase 2.115.0 overwrites the handler's exact ACAO with
      // a gateway wildcard. The preceding 403 proves the handler's own exact
      // Origin gate remains the operative boundary.
      assert.equal(response.headers.get("access-control-allow-origin"), "*");
      assert.ok(
        (response.headers.get("vary") ?? "")
          .split(",")
          .map((value) => value.trim().toLowerCase())
          .includes("origin")
      );
      assert.equal(await response.text(), '{"outcome":"OK"}');
      assert.equal(
        runLocalDatabaseSql(`
          select consent_row.state || '|' || consent_row.reason_code
          from private.push_device_consents consent_row
          where consent_row.id = ${consentId}::bigint
            and consent_row.cleanup_token_hash = pg_catalog.decode('${digest}', 'hex');
        `),
        "paused|cleanup_quarantine"
      );
      assert.equal(
        runLocalDatabaseSql(`
          select pg_catalog.string_agg(
            bucket_row.scope || ':' || bucket_row.tokens::text,
            ',' order by bucket_row.scope
          )
          from private.push_cleanup_rate_limit_buckets bucket_row
          where (bucket_row.scope = 'global'
              and bucket_row.bucket_hash = pg_catalog.decode(
                '${rateLimitBuckets.globalBucketHash}', 'hex'
              ))
            or (bucket_row.scope = 'source'
              and bucket_row.bucket_hash = pg_catalog.decode(
                '${rateLimitBuckets.sourceBucketHash}', 'hex'
              ));
        `),
        "global:4,source:2"
      );
      await delay(500);
      await stopEdgeRuntime(child, childClosePromise);
      child = undefined;
      const containerLogsContainSensitiveValue = localContainerLogsContainSensitiveValue(logWindowStart, [
        token,
        digest,
        serializedRateLimitKey,
        rateLimitBuckets.globalBucketHash,
        rateLimitBuckets.sourceBucketHash,
        ...privateKeyValues,
        serializedJwks,
        ...adminLogValues,
      ]);
      assert.equal(outputContainsBundlerWarning(), false, "Edge bundle must not skip an absolute public-key path");
      assert.equal(outputContainsSensitiveValue(), false, "Edge output must not contain cleanup secrets");
      assert.equal(containerLogsContainSensitiveValue, false, "Local Supabase logs must not contain cleanup secrets");
    } catch (error) {
      testError = error;
    }

    const cleanupErrors = [];
    try {
      if (child && childClosePromise) await stopEdgeRuntime(child, childClosePromise);
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (createdUserId && adminClient) {
      try {
        const { error } = await adminClient.auth.admin.deleteUser(createdUserId);
        if (error) cleanupErrors.push(new Error("Unable to remove the local cleanup test account."));
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      runLocalDatabaseSql(`
        delete from private.push_cleanup_rate_limit_buckets bucket_row
        where (bucket_row.scope = 'global'
            and bucket_row.bucket_hash = pg_catalog.decode(
              '${rateLimitBuckets.globalBucketHash}', 'hex'
            ))
          or (bucket_row.scope = 'source'
            and bucket_row.bucket_hash = pg_catalog.decode(
              '${rateLimitBuckets.sourceBucketHash}', 'hex'
            ));
      `);
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await rm(temporaryDirectory, { force: true, recursive: true });
    } catch (error) {
      cleanupErrors.push(error);
    }

    if (testError && cleanupErrors.length) {
      throw new AggregateError([testError, ...cleanupErrors], "The cleanup Edge test and its teardown both failed.");
    }
    if (testError) throw testError;
    if (cleanupErrors.length === 1) throw cleanupErrors[0];
    if (cleanupErrors.length > 1) throw new AggregateError(cleanupErrors, "Cleanup Edge test teardown failed.");
  }
);
