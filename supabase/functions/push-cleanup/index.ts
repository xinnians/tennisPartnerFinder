import { loadPrivateKeyRing } from "./crypto.js";
import { createPushCleanupHandler } from "./handler.js";
import {
  deriveRateLimitBucketHashes,
  loadRateLimitHmacKey,
  parseCanonicalRateLimitPolicy,
  trustedHostedClientAddress,
} from "./rate-limit.js";
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

let rateLimitKeySource = "";
let rateLimitPolicySource = "";
let rateLimitConfigPromise: Promise<{
  key: CryptoKey;
  policy: ReturnType<typeof parseCanonicalRateLimitPolicy>;
}> | null = null;
function configuredRateLimit() {
  const policyJson = env("PUSH_CLEANUP_RATE_LIMIT_POLICY_JSON");
  const serializedKey = env("PUSH_CLEANUP_RATE_LIMIT_HMAC_KEY");
  if (!rateLimitConfigPromise || policyJson !== rateLimitPolicySource || serializedKey !== rateLimitKeySource) {
    rateLimitPolicySource = policyJson;
    rateLimitKeySource = serializedKey;
    rateLimitConfigPromise = Promise.resolve().then(async () => {
      const policy = parseCanonicalRateLimitPolicy(policyJson);
      return { key: await loadRateLimitHmacKey(serializedKey), policy };
    });
  }
  return rateLimitConfigPromise;
}

async function consumeRateLimit(request: Request) {
  const sourceAddress = hostedRuntime ? trustedHostedClientAddress(request.headers) : "127.0.0.1";
  if (!sourceAddress) throw new Error("PUSH_CLEANUP_RATE_LIMIT_SOURCE_REQUIRED");
  const { key, policy } = await configuredRateLimit();
  const { globalBucketHash, sourceBucketHash } = await deriveRateLimitBucketHashes(sourceAddress, key);
  const supabaseUrl = env("SUPABASE_URL").replace(/\/+$/u, "");
  if (!supabaseUrl) throw new Error("PUSH_CLEANUP_SERVICE_CONFIG_REQUIRED");

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/consume_push_cleanup_rate_limit`, {
    body: JSON.stringify({
      p_global_bucket_hash_hex: globalBucketHash,
      p_global_capacity: policy.global.capacity,
      p_global_refill_milliseconds: policy.global.refillMilliseconds,
      p_idle_ttl_seconds: policy.idleTtlSeconds,
      p_source_bucket_hash_hex: sourceBucketHash,
      p_source_capacity: policy.source.capacity,
      p_source_refill_milliseconds: policy.source.refillMilliseconds,
    }),
    headers: {
      accept: "application/json",
      apikey: configuredSecretKey(),
      "content-type": "application/json",
    },
    method: "POST",
    redirect: "error",
  });

  if (!response.ok) throw new Error("PUSH_CLEANUP_RATE_LIMIT_FAILED");
  const outcome: unknown = await response.json();
  if (outcome !== "ALLOW" && outcome !== "LIMIT") throw new Error("PUSH_CLEANUP_RATE_LIMIT_FAILED");
  return outcome;
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
    consumeRateLimit,
    hostedRuntime,
    loadKeyRing: configuredKeyRing,
    localTestEnabled,
    quarantineByDigest,
  })
);
