import { defineConfig, devices } from "@playwright/test";
import { loadLocalSupabaseConfig } from "./tests/fixtures/localSupabaseConfig.js";

export function createPlaywrightConfig({
  mode = "mock",
  loadLocalSupabaseConfig: readLocalSupabaseConfig = loadLocalSupabaseConfig,
} = {}) {
  if (mode !== "mock" && mode !== "local") {
    throw new Error("TENNIS_TEST_HARNESS_MODE must be mock or local.");
  }

  const localConfig = mode === "local" ? readLocalSupabaseConfig() : null;
  const isLocal = mode === "local";
  const port = isLocal ? 5175 : 5174;

  return {
    testDir: "./tests",
    // The two local-Supabase projects share one mutable database.
    workers: 1,
    timeout: 30_000,
    expect: { timeout: 5_000 },
    use: {
      baseURL: "http://127.0.0.1:5174",
      timezoneId: "Asia/Taipei",
      trace: "on-first-retry",
    },
    webServer: {
      command: `npm run dev -- --host 127.0.0.1 --port ${port}`,
      env: {
        ...process.env,
        VITE_GOOGLE_MAPS_API_KEY: "e2e",
        VITE_SUPABASE_URL: isLocal ? localConfig.apiUrl : "___",
        VITE_SUPABASE_ANON_KEY: isLocal ? localConfig.publicKey : "___",
      },
      url: `http://127.0.0.1:${port}`,
      reuseExistingServer: false,
    },
    projects: [
      {
        name: "desktop-chromium",
        testMatch: /(?:smoke|performance)\.spec\.js/,
        use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:5174" },
      },
      {
        name: "mobile-chromium",
        testMatch: /(?:smoke|performance)\.spec\.js/,
        use: {
          ...devices["Pixel 5"],
          baseURL: "http://127.0.0.1:5174",
          viewport: { width: 390, height: 844 },
        },
      },
      {
        name: "supabase-chromium",
        testMatch: /(?:session|performance)\.spec\.js/,
        use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:5175" },
      },
      {
        name: "supabase-mobile-chromium",
        testMatch: /session-mobile\.spec\.js/,
        use: {
          ...devices["Pixel 5"],
          baseURL: "http://127.0.0.1:5175",
          viewport: { width: 390, height: 844 },
        },
      },
    ],
  };
}

export default defineConfig(
  createPlaywrightConfig({ mode: process.env.TENNIS_TEST_HARNESS_MODE ?? "mock" })
);
