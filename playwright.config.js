import { defineConfig, devices } from "@playwright/test";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./tests/fixtures/localSupabase.js";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command:
        "VITE_GOOGLE_MAPS_API_KEY=e2e VITE_SUPABASE_URL=___ VITE_SUPABASE_ANON_KEY=___ npm run dev -- --host 127.0.0.1 --port 5174",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
    },
    {
      command: `VITE_GOOGLE_MAPS_API_KEY=e2e VITE_SUPABASE_URL=${SUPABASE_URL} VITE_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY} npm run dev -- --host 127.0.0.1 --port 5175`,
      url: "http://127.0.0.1:5175",
      reuseExistingServer: false,
    },
  ],
  projects: [
    {
      name: "desktop-chromium",
      testMatch: /smoke\.spec\.js/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:5174" },
    },
    {
      name: "mobile-chromium",
      testMatch: /smoke\.spec\.js/,
      use: {
        ...devices["Pixel 5"],
        baseURL: "http://127.0.0.1:5174",
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "supabase-chromium",
      testMatch: /supabase\.spec\.js/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:5175" },
    },
    {
      name: "supabase-mobile-chromium",
      testMatch: /supabase\.spec\.js/,
      use: {
        ...devices["Pixel 5"],
        baseURL: "http://127.0.0.1:5175",
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
