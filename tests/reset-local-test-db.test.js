import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import playwrightConfig from "../playwright.config.js";
import { SUPABASE_AUTH_STORAGE_KEY } from "../src/supabaseClient.js";
import { SUPABASE_AUTH_STORAGE_KEY as TEST_AUTH_STORAGE_KEY } from "./fixtures/localSupabase.js";
import {
  createFutureSessionInput,
  createSessionViaRpc,
  createSessionTestContext,
  createStartedSessionInput,
} from "./fixtures/sessionFactory.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resetScript = path.join(root, "scripts", "reset-local-test-db.mjs");

function createFakeNpx(statusOutput = "") {
  const directory = mkdtempSync(path.join(os.tmpdir(), "tennis-reset-test-"));
  const logPath = path.join(directory, "npx.log");
  const cwdLogPath = path.join(directory, "npx-cwd.log");
  const npxPath = path.join(directory, "npx");
  const script = [
    "#!/bin/sh",
    "printf '%s\\n' \"$*\" >> \"$TEST_NPX_LOG\"",
    "printf '%s\\n' \"$PWD\" >> \"$TEST_NPX_CWD_LOG\"",
    "if [ \"$2\" = \"status\" ]; then",
    "  printf '%s\\n' \"$TEST_NPX_STATUS_OUTPUT\"",
    "fi",
  ].join("\n");
  writeFileSync(npxPath, script, { mode: 0o755 });
  chmodSync(npxPath, 0o755);

  return {
    directory,
    logPath,
    cwdLogPath,
    env: {
      ...process.env,
      PATH: `${directory}${path.delimiter}${process.env.PATH}`,
      TEST_NPX_LOG: logPath,
      TEST_NPX_CWD_LOG: cwdLogPath,
      TEST_NPX_STATUS_OUTPUT: statusOutput,
    },
  };
}

function runReset(env, cwd = root) {
  return spawnSync(process.execPath, [resetScript], {
    cwd,
    encoding: "utf8",
    env,
  });
}

test("local reset refuses without confirmation before invoking Supabase", () => {
  assert.ok(existsSync(resetScript), "the guarded reset script exists");
  const fakeNpx = createFakeNpx();
  const childEnv = { ...fakeNpx.env, CONFIRM_LOCAL_DB_RESET: "1" };
  delete childEnv.CONFIRM_LOCAL_DB_RESET;

  try {
    const result = runReset(childEnv);

    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /CONFIRM_LOCAL_DB_RESET=1/);
    assert.equal(existsSync(fakeNpx.logPath), false, "npx was not invoked");
  } finally {
    rmSync(fakeNpx.directory, { recursive: true, force: true });
  }
});

test("local reset rejects any API_URL other than the local Supabase API", () => {
  assert.ok(existsSync(resetScript), "the guarded reset script exists");
  const fakeNpx = createFakeNpx("API_URL=http://localhost:54321");

  try {
    const result = runReset({ ...fakeNpx.env, CONFIRM_LOCAL_DB_RESET: "1" });

    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /API_URL must be http:\/\/127\.0\.0\.1:54321/);
    assert.equal(readFileSync(fakeNpx.logPath, "utf8").trim(), "supabase status -o env");
  } finally {
    rmSync(fakeNpx.directory, { recursive: true, force: true });
  }
});

test("local reset anchors Supabase commands to the repository root", () => {
  assert.ok(existsSync(resetScript), "the guarded reset script exists");
  const fakeNpx = createFakeNpx("API_URL=http://localhost:54321");
  const otherDirectory = mkdtempSync(path.join(os.tmpdir(), "tennis-reset-cwd-"));

  try {
    const result = runReset({ ...fakeNpx.env, CONFIRM_LOCAL_DB_RESET: "1" }, otherDirectory);

    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(fakeNpx.cwdLogPath, "utf8").trim(), root);
  } finally {
    rmSync(otherDirectory, { recursive: true, force: true });
    rmSync(fakeNpx.directory, { recursive: true, force: true });
  }
});

test("future session inputs require a positive court ID", () => {
  const now = new Date("2026-07-17T04:05:06.789Z");

  assert.throws(() => createFutureSessionInput({ now }), /positive court ID/);
});

test("create_session fixture rejects a missing court ID before invoking RPC", async () => {
  const client = {
    rpc() {
      throw new Error("RPC must not be called without a court ID");
    },
  };

  await assert.rejects(createSessionViaRpc(client, { courtId: null }), /positive court ID/);
});

test("local Supabase Playwright projects are serialized", () => {
  const localProjects = playwrightConfig.projects.filter((project) =>
    ["supabase-chromium", "supabase-mobile-chromium"].includes(project.name)
  );

  assert.equal(playwrightConfig.workers, 1);
  assert.equal(localProjects.length, 2);
});

test("test fixtures share the app auth storage key and create isolated session data", () => {
  const now = new Date("2026-07-17T04:05:06.789Z");
  const context = createSessionTestContext({ now, suffix: "fixture" });
  const future = createFutureSessionInput({ now, courtId: 42 });
  const started = createStartedSessionInput({ now, courtId: 42 });
  const emails = [context.host.email, context.guest.email, context.observer.email];

  assert.equal(TEST_AUTH_STORAGE_KEY, SUPABASE_AUTH_STORAGE_KEY);
  assert.match(context.runId, /^20260717T040506789Z-fixture$/);
  assert.equal(new Set(emails).size, 3);
  assert.ok(Date.parse(future.startAt) > now.getTime());
  assert.ok(Date.parse(started.startAt) < now.getTime());
});
