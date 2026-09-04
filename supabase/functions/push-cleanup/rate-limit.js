import { decodeCanonicalBase64Url } from "../_shared/push-cleanup-protocol.js";

export const PUSH_CLEANUP_RATE_LIMIT_KEY_BYTES = 32;
export const PUSH_CLEANUP_RATE_LIMIT_POLICY_VERSION = 1;
export const PUSH_CLEANUP_LIMITER_CANARY_REQUEST_HEADER = "x-qiuka-cleanup-limiter-canary";
export const PUSH_CLEANUP_LIMITER_CANARY_TOKEN_BYTES = 32;

const POSTGRES_INTEGER_MAX = 2_147_483_647;
const POLICY_KEYS = Object.freeze(["global", "idleTtlSeconds", "source", "version"]);
const BUCKET_POLICY_KEYS = Object.freeze(["capacity", "refillMilliseconds"]);
const GLOBAL_BUCKET_LABEL = "qiuka.tw/push-cleanup-rate-limit/global/v1";
const SOURCE_BUCKET_LABEL_PREFIX = "qiuka.tw/push-cleanup-rate-limit/source/v1/";
const IPV4_PATTERN = /^(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){3}$/u;

function exactKeys(value, expected) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return keys.length === sortedExpected.length && keys.every((key, index) => key === sortedExpected[index]);
}

function positivePostgresInteger(value) {
  return Number.isSafeInteger(value) && value > 0 && value <= POSTGRES_INTEGER_MAX;
}

function normalizeBucketPolicy(value) {
  if (
    !exactKeys(value, BUCKET_POLICY_KEYS) ||
    !positivePostgresInteger(value.capacity) ||
    !positivePostgresInteger(value.refillMilliseconds)
  ) {
    return null;
  }
  return {
    capacity: value.capacity,
    refillMilliseconds: value.refillMilliseconds,
  };
}

export function parseCanonicalRateLimitPolicy(serialized) {
  if (typeof serialized !== "string" || !serialized) throw new Error("PUSH_CLEANUP_RATE_LIMIT_POLICY_INVALID");
  try {
    const value = JSON.parse(serialized);
    if (
      !exactKeys(value, POLICY_KEYS) ||
      value.version !== PUSH_CLEANUP_RATE_LIMIT_POLICY_VERSION ||
      !positivePostgresInteger(value.idleTtlSeconds)
    ) {
      throw new Error("PUSH_CLEANUP_RATE_LIMIT_POLICY_INVALID");
    }
    const global = normalizeBucketPolicy(value.global);
    const source = normalizeBucketPolicy(value.source);
    if (!global || !source) throw new Error("PUSH_CLEANUP_RATE_LIMIT_POLICY_INVALID");
    const normalized = {
      global,
      idleTtlSeconds: value.idleTtlSeconds,
      source,
      version: PUSH_CLEANUP_RATE_LIMIT_POLICY_VERSION,
    };
    if (JSON.stringify(normalized) !== serialized) throw new Error("PUSH_CLEANUP_RATE_LIMIT_POLICY_INVALID");
    return Object.freeze({
      ...normalized,
      global: Object.freeze(global),
      source: Object.freeze(source),
    });
  } catch {
    throw new Error("PUSH_CLEANUP_RATE_LIMIT_POLICY_INVALID");
  }
}

export async function loadRateLimitHmacKey(serialized, cryptoRef = globalThis.crypto) {
  const bytes = decodeCanonicalBase64Url(serialized);
  if (bytes?.byteLength !== PUSH_CLEANUP_RATE_LIMIT_KEY_BYTES) {
    bytes?.fill(0);
    throw new Error("PUSH_CLEANUP_RATE_LIMIT_KEY_INVALID");
  }
  try {
    return await cryptoRef.subtle.importKey("raw", bytes, { hash: "SHA-256", name: "HMAC" }, false, ["sign"]);
  } catch {
    throw new Error("PUSH_CLEANUP_RATE_LIMIT_KEY_INVALID");
  } finally {
    bytes.fill(0);
  }
}

export function matchesHostedLimiterCanaryToken(configuredToken, presentedToken) {
  const configuredBytes = decodeCanonicalBase64Url(configuredToken);
  const presentedBytes = decodeCanonicalBase64Url(presentedToken);
  try {
    if (
      configuredBytes?.byteLength !== PUSH_CLEANUP_LIMITER_CANARY_TOKEN_BYTES ||
      presentedBytes?.byteLength !== PUSH_CLEANUP_LIMITER_CANARY_TOKEN_BYTES
    ) {
      return false;
    }
    let difference = 0;
    for (let index = 0; index < PUSH_CLEANUP_LIMITER_CANARY_TOKEN_BYTES; index += 1) {
      difference |= configuredBytes[index] ^ presentedBytes[index];
    }
    return difference === 0;
  } finally {
    configuredBytes?.fill(0);
    presentedBytes?.fill(0);
  }
}

function canonicalIpv4(value) {
  if (!IPV4_PATTERN.test(value)) return "";
  const octets = value.split(".");
  return octets.every((octet) => Number(octet) <= 255) ? octets.join(".") : "";
}

function canonicalIpv6(value) {
  if (!value.includes(":") || value.includes("%") || value.includes("[") || value.includes("]")) return "";
  try {
    const hostname = new URL(`http://[${value}]/`).hostname;
    return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : "";
  } catch {
    return "";
  }
}

export function canonicalIpAddress(value) {
  if (typeof value !== "string" || !value || value !== value.trim()) return "";
  return canonicalIpv4(value) || canonicalIpv6(value);
}

export function trustedHostedClientAddress(headers) {
  if (!headers || typeof headers.get !== "function") return "";
  const cloudflareAddress = canonicalIpAddress(headers.get("cf-connecting-ip"));
  const realAddress = canonicalIpAddress(headers.get("x-real-ip"));
  return cloudflareAddress && cloudflareAddress === realAddress ? cloudflareAddress : "";
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(key, value, cryptoRef) {
  const input = new TextEncoder().encode(value);
  try {
    const digest = new Uint8Array(await cryptoRef.subtle.sign("HMAC", key, input));
    try {
      return bytesToHex(digest);
    } finally {
      digest.fill(0);
    }
  } finally {
    input.fill(0);
  }
}

async function sha256Hex(value, cryptoRef) {
  const input = new TextEncoder().encode(value);
  try {
    const digest = new Uint8Array(await cryptoRef.subtle.digest("SHA-256", input));
    try {
      return bytesToHex(digest);
    } finally {
      digest.fill(0);
    }
  } finally {
    input.fill(0);
  }
}

export async function deriveRateLimitBucketHashes(sourceAddress, key, cryptoRef = globalThis.crypto) {
  const canonicalAddress = canonicalIpAddress(sourceAddress);
  if (!canonicalAddress || !key) throw new Error("PUSH_CLEANUP_RATE_LIMIT_SOURCE_INVALID");
  const [globalBucketHash, sourceBucketHash] = await Promise.all([
    sha256Hex(GLOBAL_BUCKET_LABEL, cryptoRef),
    hmacHex(key, `${SOURCE_BUCKET_LABEL_PREFIX}${canonicalAddress}`, cryptoRef),
  ]);
  if (globalBucketHash === sourceBucketHash) throw new Error("PUSH_CLEANUP_RATE_LIMIT_KEY_INVALID");
  return Object.freeze({ globalBucketHash, sourceBucketHash });
}
