import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:4174";

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    timezoneId: "Asia/Taipei",
    trace: "on-first-retry",
  },
  webServer: {
    command: "node scripts/serve-production-preview.mjs",
    url: baseURL,
    reuseExistingServer: false,
  },
  projects: [
    {
      name: "preview-desktop-chromium",
      testMatch: /(?:production-preview|court-guides-preview)\.spec\.js/,
      use: { ...devices["Desktop Chrome"], baseURL },
    },
    {
      name: "preview-mobile-chromium",
      testMatch: /(?:production-preview-mobile|court-guides-preview)\.spec\.js/,
      use: {
        ...devices["Pixel 5"],
        baseURL,
        viewport: { height: 844, width: 390 },
      },
    },
    {
      name: "preview-mobile-webkit",
      testMatch: /(?:production-preview-mobile|court-guides-preview)\.spec\.js/,
      use: {
        ...devices["iPhone 12"],
        baseURL,
        viewport: { height: 844, width: 390 },
      },
    },
  ],
});
