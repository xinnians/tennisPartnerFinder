import assert from "node:assert/strict";
import test from "node:test";
import { createPlaywrightConfig } from "../playwright.config.js";
import {
  LOCAL_SUPABASE_API_URL,
  loadLocalSupabaseConfig,
  parseLocalSupabaseEnvironment,
  validateLocalSupabaseConfig,
} from "./fixtures/localSupabaseConfig.js";

const SAFE_PUBLIC_KEY = "safe-test-public-key";

function safeStatusOutput({ apiUrl = LOCAL_SUPABASE_API_URL, publicKey = SAFE_PUBLIC_KEY } = {}) {
  return [`API_URL="${apiUrl}"`, `ANON_KEY="${publicKey}"`].join("\n");
}

test("local public config parses quoted status output and accepts only the exact loopback API", () => {
  const environment = parseLocalSupabaseEnvironment(safeStatusOutput());

  assert.deepEqual(validateLocalSupabaseConfig(environment), {
    apiUrl: LOCAL_SUPABASE_API_URL,
    publicKey: SAFE_PUBLIC_KEY,
  });
});

test("local public config rejects a non-loopback API target", () => {
  const environment = parseLocalSupabaseEnvironment(
    safeStatusOutput({ apiUrl: "http://127.0.0.1:54322" })
  );

  assert.throws(() => validateLocalSupabaseConfig(environment), /127\.0\.0\.1:54321/);
});

test("local public config rejects an empty public key", () => {
  const environment = parseLocalSupabaseEnvironment(safeStatusOutput({ publicKey: "" }));

  assert.throws(() => validateLocalSupabaseConfig(environment), /public key/);
});

test("local public config loader validates status output before returning it", () => {
  const config = loadLocalSupabaseConfig({
    runStatus: () => ({ status: 0, stdout: safeStatusOutput() }),
  });

  assert.deepEqual(config, {
    apiUrl: LOCAL_SUPABASE_API_URL,
    publicKey: SAFE_PUBLIC_KEY,
  });
});

test("local public config loader does not accept a failed status command", () => {
  assert.throws(
    () => loadLocalSupabaseConfig({ runStatus: () => ({ status: 1, stdout: safeStatusOutput() }) }),
    /Unable to read local Supabase status/
  );
});

test("mock Playwright configuration never resolves local public config", () => {
  let localConfigWasResolved = false;
  const config = createPlaywrightConfig({
    mode: "mock",
    loadLocalSupabaseConfig: () => {
      localConfigWasResolved = true;
      return { apiUrl: LOCAL_SUPABASE_API_URL, publicKey: SAFE_PUBLIC_KEY };
    },
  });

  assert.equal(localConfigWasResolved, false);
  assert.equal(config.webServer.env.VITE_SUPABASE_URL, "___");
  assert.equal(config.webServer.env.VITE_SUPABASE_ANON_KEY, "___");
});

test("local Playwright configuration supplies the validated runtime config only to its Vite server", () => {
  const config = createPlaywrightConfig({
    mode: "local",
    loadLocalSupabaseConfig: () => ({
      apiUrl: LOCAL_SUPABASE_API_URL,
      publicKey: SAFE_PUBLIC_KEY,
    }),
  });

  assert.equal(config.webServer.env.VITE_SUPABASE_URL, LOCAL_SUPABASE_API_URL);
  assert.equal(config.webServer.env.VITE_SUPABASE_ANON_KEY, SAFE_PUBLIC_KEY);
  assert.equal(config.webServer.command.includes(SAFE_PUBLIC_KEY), false);
});
