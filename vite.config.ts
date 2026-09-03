import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { visualizer } from "rollup-plugin-visualizer";

import {
  createPushCleanupPublicKeyAssetPlugin,
  PUSH_CLEANUP_PUBLIC_JWK_ENV,
} from "./scripts/pushCleanupPublicKeyAsset.mjs";
import {
  createPushSubscriptionPublicKeyAssetPlugin,
  PUSH_SUBSCRIPTION_PUBLIC_JWK_ENV,
} from "./scripts/pushSubscriptionPublicKeyAsset.mjs";

const EMPTY_MOCK_DATA_MODULE = new URL("./src/mockData.empty.js", import.meta.url).pathname;
const MOCK_DATA_IMPORT = /^(?:.*\/)?mockData\.js$/;
const BUNDLE_ANALYSIS_ENABLED = process.env.BUNDLE_ANALYZE === "1";
const BUNDLE_ANALYSIS_PATH = "/tmp/tennis-partner-finder-bundle-composition-2026-08-25.json";

function cleanupPublicJwk(mode: string): string {
  const fileEnvironment = loadEnv(mode, import.meta.dirname, "PUSH_CLEANUP_");
  return process.env[PUSH_CLEANUP_PUBLIC_JWK_ENV] ?? fileEnvironment[PUSH_CLEANUP_PUBLIC_JWK_ENV] ?? "";
}

function subscriptionPublicJwk(mode: string): string {
  const fileEnvironment = loadEnv(mode, import.meta.dirname, "PUSH_SUBSCRIPTION_");
  return process.env[PUSH_SUBSCRIPTION_PUBLIC_JWK_ENV] ?? fileEnvironment[PUSH_SUBSCRIPTION_PUBLIC_JWK_ENV] ?? "";
}

export default defineConfig(({ command, mode }) => ({
  define: {
    __TENNIS_E2E_TEST_HOOKS__: JSON.stringify(command !== "build" || mode !== "production"),
    __TENNIS_DEPLOY_ENVIRONMENT__: JSON.stringify(process.env.VERCEL_ENV === "production" ? "production" : "preview"),
  },
  plugins: [
    react(),
    createPushCleanupPublicKeyAssetPlugin(cleanupPublicJwk(mode)),
    createPushSubscriptionPublicKeyAssetPlugin(subscriptionPublicJwk(mode)),
    ...(BUNDLE_ANALYSIS_ENABLED
      ? [
          visualizer({
            emitFile: false,
            filename: BUNDLE_ANALYSIS_PATH,
            gzipSize: true,
            template: "raw-data",
          }),
        ]
      : []),
  ],
  resolve:
    command === "build" && mode === "production"
      ? { alias: [{ find: MOCK_DATA_IMPORT, replacement: EMPTY_MOCK_DATA_MODULE }] }
      : undefined,
}));
