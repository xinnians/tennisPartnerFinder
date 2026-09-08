import { hostedLimiterCanaryFailure, PUSH_CLEANUP_LIMITER_CANARY_FAILURE_STAGES } from "./handler.js";
import {
  deriveRateLimitBucketHashes,
  HOSTED_CLIENT_ADDRESS_FAILURES,
  inspectTrustedHostedClientAddress,
  loadRateLimitHmacKey,
  parseCanonicalRateLimitPolicy,
} from "./rate-limit.js";

const SOURCE_FAILURE_STAGE = Object.freeze({
  [HOSTED_CLIENT_ADDRESS_FAILURES.CF_INVALID]: PUSH_CLEANUP_LIMITER_CANARY_FAILURE_STAGES.SOURCE_CF_INVALID,
  [HOSTED_CLIENT_ADDRESS_FAILURES.CF_MISSING]: PUSH_CLEANUP_LIMITER_CANARY_FAILURE_STAGES.SOURCE_CF_MISSING,
  [HOSTED_CLIENT_ADDRESS_FAILURES.HEADERS]: PUSH_CLEANUP_LIMITER_CANARY_FAILURE_STAGES.SOURCE_HEADERS,
  [HOSTED_CLIENT_ADDRESS_FAILURES.MISMATCH]: PUSH_CLEANUP_LIMITER_CANARY_FAILURE_STAGES.SOURCE_MISMATCH,
  [HOSTED_CLIENT_ADDRESS_FAILURES.REAL_INVALID]: PUSH_CLEANUP_LIMITER_CANARY_FAILURE_STAGES.SOURCE_REAL_INVALID,
});

export function configuredPushCleanupSecretKey(readEnvironment) {
  const serialized = readEnvironment("SUPABASE_SECRET_KEYS");
  if (serialized) {
    try {
      const keys = JSON.parse(serialized);
      if (typeof keys.default === "string" && keys.default) return keys.default;
    } catch {
      throw new Error("PUSH_CLEANUP_SERVICE_CONFIG_REQUIRED");
    }
    throw new Error("PUSH_CLEANUP_SERVICE_CONFIG_REQUIRED");
  }

  const legacyKey = readEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  if (legacyKey) return legacyKey;
  throw new Error("PUSH_CLEANUP_SERVICE_CONFIG_REQUIRED");
}

export function createPushCleanupRateLimitConsumer({
  cryptoRef = globalThis.crypto,
  deriveBucketHashes = deriveRateLimitBucketHashes,
  fetchRef = globalThis.fetch,
  hostedRuntime,
  inspectClientAddress = inspectTrustedHostedClientAddress,
  loadHmacKey = loadRateLimitHmacKey,
  parsePolicy = parseCanonicalRateLimitPolicy,
  readEnvironment,
}) {
  let rateLimitKeySource = "";
  let rateLimitPolicySource = "";
  let rateLimitConfigPromise = null;

  function configuredRateLimit() {
    const policyJson = readEnvironment("PUSH_CLEANUP_RATE_LIMIT_POLICY_JSON");
    const serializedKey = readEnvironment("PUSH_CLEANUP_RATE_LIMIT_HMAC_KEY");
    if (!rateLimitConfigPromise || policyJson !== rateLimitPolicySource || serializedKey !== rateLimitKeySource) {
      rateLimitPolicySource = policyJson;
      rateLimitKeySource = serializedKey;
      rateLimitConfigPromise = Promise.resolve().then(async () => {
        let policy;
        try {
          policy = parsePolicy(policyJson);
        } catch {
          throw hostedLimiterCanaryFailure(PUSH_CLEANUP_LIMITER_CANARY_FAILURE_STAGES.POLICY);
        }
        try {
          return { key: await loadHmacKey(serializedKey, cryptoRef), policy };
        } catch {
          throw hostedLimiterCanaryFailure(PUSH_CLEANUP_LIMITER_CANARY_FAILURE_STAGES.HMAC_KEY);
        }
      });
    }
    return rateLimitConfigPromise;
  }

  return async function consumeRateLimit(request) {
    let sourceAddress = "127.0.0.1";
    if (hostedRuntime) {
      const inspectedSource = inspectClientAddress(request.headers);
      sourceAddress = inspectedSource?.address ?? "";
      if (!sourceAddress) {
        const stage = SOURCE_FAILURE_STAGE[inspectedSource?.failure];
        throw hostedLimiterCanaryFailure(stage ?? PUSH_CLEANUP_LIMITER_CANARY_FAILURE_STAGES.SOURCE);
      }
    }
    const { key, policy } = await configuredRateLimit();
    let globalBucketHash;
    let sourceBucketHash;
    try {
      ({ globalBucketHash, sourceBucketHash } = await deriveBucketHashes(sourceAddress, key, cryptoRef));
    } catch {
      throw hostedLimiterCanaryFailure(PUSH_CLEANUP_LIMITER_CANARY_FAILURE_STAGES.BUCKET_HASH);
    }

    const supabaseUrl = readEnvironment("SUPABASE_URL").replace(/\/+$/u, "");
    let serviceKey;
    try {
      if (!supabaseUrl) throw new Error("missing URL");
      serviceKey = configuredPushCleanupSecretKey(readEnvironment);
    } catch {
      throw hostedLimiterCanaryFailure(PUSH_CLEANUP_LIMITER_CANARY_FAILURE_STAGES.SERVICE_CONFIG);
    }

    let response;
    try {
      response = await fetchRef(`${supabaseUrl}/rest/v1/rpc/consume_push_cleanup_rate_limit`, {
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
          apikey: serviceKey,
          "content-type": "application/json",
        },
        method: "POST",
        redirect: "error",
      });
    } catch {
      throw hostedLimiterCanaryFailure(PUSH_CLEANUP_LIMITER_CANARY_FAILURE_STAGES.RPC_FETCH);
    }

    if (!response.ok) throw hostedLimiterCanaryFailure(PUSH_CLEANUP_LIMITER_CANARY_FAILURE_STAGES.RPC_STATUS);
    let outcome;
    try {
      outcome = await response.json();
    } catch {
      throw hostedLimiterCanaryFailure(PUSH_CLEANUP_LIMITER_CANARY_FAILURE_STAGES.RPC_CONTRACT);
    }
    if (outcome !== "ALLOW" && outcome !== "LIMIT") {
      throw hostedLimiterCanaryFailure(PUSH_CLEANUP_LIMITER_CANARY_FAILURE_STAGES.RPC_CONTRACT);
    }
    return outcome;
  };
}
