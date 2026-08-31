import { loadPrivateKeyRing } from "./crypto.js";
import { createPushCleanupHandler } from "./handler.js";
import { cleanupRuntimeAccess, exactHttpOrigin } from "./runtime.js";

function env(name: string) {
  return Deno.env.get(name) ?? "";
}

const { hostedRuntime, localTestEnabled } = cleanupRuntimeAccess(env);
const allowedOrigin = exactHttpOrigin(env("PUSH_CLEANUP_ALLOWED_ORIGIN"));

let keyRingSource = "";
let keyRingPromise: ReturnType<typeof loadPrivateKeyRing> | null = null;
function configuredKeyRing() {
  const serialized = env("PUSH_CLEANUP_PRIVATE_JWKS_JSON");
  if (!keyRingPromise || serialized !== keyRingSource) {
    keyRingSource = serialized;
    keyRingPromise = loadPrivateKeyRing(serialized);
  }
  return keyRingPromise;
}

function configuredSecretKey() {
  const serialized = env("SUPABASE_SECRET_KEYS");
  if (serialized) {
    try {
      const keys = JSON.parse(serialized) as Record<string, unknown>;
      if (typeof keys.default === "string" && keys.default) return keys.default;
    } catch {
      throw new Error("PUSH_CLEANUP_SERVICE_CONFIG_REQUIRED");
    }
    throw new Error("PUSH_CLEANUP_SERVICE_CONFIG_REQUIRED");
  }

  const legacyKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (legacyKey) return legacyKey;
  throw new Error("PUSH_CLEANUP_SERVICE_CONFIG_REQUIRED");
}

async function quarantineByDigest(digestHex: string) {
  const supabaseUrl = env("SUPABASE_URL").replace(/\/+$/u, "");
  if (!supabaseUrl) throw new Error("PUSH_CLEANUP_SERVICE_CONFIG_REQUIRED");

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/quarantine_push_by_token`, {
    body: JSON.stringify({ p_cleanup_token_hash_hex: digestHex }),
    headers: {
      accept: "application/json",
      apikey: configuredSecretKey(),
      "content-type": "application/json",
    },
    method: "POST",
    redirect: "error",
  });

  if (!response.ok) throw new Error("PUSH_CLEANUP_COMMAND_FAILED");
  const outcome: unknown = await response.json();
  if (outcome !== "OK") throw new Error("PUSH_CLEANUP_COMMAND_FAILED");
  return outcome;
}

Deno.serve(
  createPushCleanupHandler({
    allowedOrigin,
    hostedRuntime,
    loadKeyRing: configuredKeyRing,
    localTestEnabled,
    quarantineByDigest,
  })
);
