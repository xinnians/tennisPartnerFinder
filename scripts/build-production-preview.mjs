import { build } from "vite";

import { loadLocalSupabaseConfig } from "../tests/fixtures/localSupabaseConfig.js";

const { apiUrl, publicKey } = loadLocalSupabaseConfig();

// A production-mode bundle is required to prove the real chunk graph. Override
// every browser-facing value that Vite could otherwise read from .env.local so
// this test build can never inherit a developer or production integration.
Object.assign(process.env, {
  PUSH_CLEANUP_PUBLIC_JWK_JSON: "",
  PUSH_SUBSCRIPTION_PUBLIC_JWK_JSON: "",
  VERCEL_ENV: "preview",
  VITE_AUTH_LINE_PROVIDER_ID: "",
  VITE_GOOGLE_MAPS_API_KEY: "e2e",
  VITE_GOOGLE_MAPS_MAP_ID: "DEMO_MAP_ID",
  VITE_SENTRY_DSN: "",
  VITE_SUPABASE_ANON_KEY: publicKey,
  VITE_SUPABASE_URL: apiUrl,
  VITE_SUPPORT_EMAIL: "support@example.test",
  VITE_WEB_PUSH_VAPID_PUBLIC_KEY: "",
});

await build({ mode: "production" });
