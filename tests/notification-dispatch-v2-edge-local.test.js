import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadLocalSupabaseConfig } from "./fixtures/localSupabaseConfig.js";

const RUN_LOCAL_EDGE_TEST = process.env.RUN_LOCAL_NOTIFICATION_DISPATCH_V2_CANARY_TEST === "1";
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SUPABASE_CLI = path.join(REPOSITORY_ROOT, "node_modules", "supabase", "dist", "supabase.js");
const STARTUP_TIMEOUT_MS = 30_000;
const TEST_TIMEOUT_MS = 75_000;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 2_000) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
}

async function waitUntilReady(url, child, didSpawnFail) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (didSpawnFail() || child.exitCode !== null || child.signalCode !== null) {
      throw new Error("The local dispatcher v2 canary runtime exited before becoming ready.");
    }
    try {
      const response = await fetchWithTimeout(url);
      if (response.status === 405 && (await response.text()) === '{"kind":"method-not-allowed"}') return;
    } catch {
      // The local gateway can refuse connections while the worker is compiling.
    }
    await delay(100);
  }
  throw new Error("The local dispatcher v2 canary did not become ready.");
}

async function stopRuntime(child, closePromise) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    if (closePromise) await Promise.race([closePromise, delay(1_000)]);
    return;
  }
  child.kill("SIGINT");
  const stopped = await Promise.race([closePromise, delay(10_000).then(() => null)]);
  if (stopped) {
    if (stopped.code !== 0 && stopped.signal !== "SIGINT") {
      throw new Error("The local dispatcher v2 canary runtime exited unexpectedly.");
    }
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
  await Promise.race([closePromise, delay(2_000)]);
  throw new Error("The local dispatcher v2 canary runtime required a forced stop.");
}

test(
  "local Edge resolves, pins, and uses the same public address for one bounded HTTPS socket",
  { skip: !RUN_LOCAL_EDGE_TEST, timeout: TEST_TIMEOUT_MS },
  async () => {
    const { apiUrl } = loadLocalSupabaseConfig();
    const functionUrl = `${apiUrl}/functions/v1/notification-dispatch-v2-canary`;
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "qiuka-dispatch-v2-canary-"));
    const environmentPath = path.join(temporaryDirectory, "function.env");
    const environment = [
      "DISPATCH_V2_CANARY_RUNTIME_MODE=local-test-v1",
      "DISPATCH_V2_CANARY_ENDPOINT=https://www.google.com/generate_204",
      'DISPATCH_V2_CANARY_PROVIDER_ORIGINS=["https://www.google.com"]',
      "DISPATCH_V2_CANARY_DEADLINE_MS=8000",
      "DISPATCH_V2_CANARY_DNS_SERVER=8.8.8.8",
      "",
    ].join("\n");

    let child;
    let childClosePromise;
    let output = "";
    let spawnFailed = false;
    let testError;
    try {
      await writeFile(environmentPath, environment, { mode: 0o600 });
      assert.equal((await stat(environmentPath)).mode & 0o777, 0o600);
      child = spawn(
        process.execPath,
        [
          SUPABASE_CLI,
          "functions",
          "serve",
          "notification-dispatch-v2-canary",
          "--no-verify-jwt",
          "--env-file",
          environmentPath,
        ],
        {
          cwd: REPOSITORY_ROOT,
          detached: true,
          env: { ...process.env, SUPABASE_NO_UPDATE_NOTIFIER: "1" },
          stdio: ["ignore", "pipe", "pipe"],
        }
      );
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
      const response = await fetchWithTimeout(functionUrl, { method: "POST" }, 20_000);
      const responseText = await response.text();
      assert.equal(response.status, 200, responseText);
      const body = JSON.parse(responseText);
      assert.deepEqual(Object.keys(body).sort(), [
        "addressFamily",
        "addressMatched",
        "kind",
        "policyVerified",
        "reusedSocket",
        "statusCode",
        "transport",
      ]);
      assert.ok(body.addressFamily === 4 || body.addressFamily === 6);
      assert.equal(body.addressMatched, true);
      assert.equal(body.kind, "accepted");
      assert.equal(body.policyVerified, true);
      assert.equal(body.reusedSocket, false);
      assert.equal(body.statusCode, 204);
      assert.equal(body.transport, "deno-native-tcp-starttls");
    } catch (error) {
      testError = error;
    } finally {
      try {
        await stopRuntime(child, childClosePromise);
      } catch (error) {
        testError ??= error;
      }
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
    if (testError) {
      throw new Error(
        `Local dispatcher v2 Edge canary failed: ${String(testError.message ?? testError)}\nRuntime output:\n${output}`,
        { cause: testError }
      );
    }
  }
);
