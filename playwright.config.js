import { defineConfig, devices } from "@playwright/test";

const localSupabaseUrl = "http://127.0.0.1:54321";
const localSupabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

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
      command: `VITE_GOOGLE_MAPS_API_KEY=e2e VITE_SUPABASE_URL=${localSupabaseUrl} VITE_SUPABASE_ANON_KEY=${localSupabaseAnonKey} npm run dev -- --host 127.0.0.1 --port 5175`,
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
  ],
});
