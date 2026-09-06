import { Agent as HttpsAgent } from "node:https";
import { resolve4 as nodeResolve4, resolve6 as nodeResolve6 } from "node:dns/promises";

import {
  hasExactKeys,
  parseCanonicalProviderOriginsPolicy,
  validateCanonicalEndpoint,
} from "../_shared/push-subscription-v2-protocol.js";

// Keep this fail-closed list aligned with IANA's Globally Reachable column.
// https://www.iana.org/assignments/iana-ipv4-special-registry/
const IPV4_BLOCKED_CIDRS = Object.freeze([
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]);
const IPV4_GLOBALLY_REACHABLE_EXCEPTIONS = Object.freeze(["192.0.0.9", "192.0.0.10"]);

function fixedError(code) {
  return new Error(code);
}

function parseIpv4(address) {
  if (typeof address !== "string" || !address) return null;
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => (/^(?:0|[1-9][0-9]{0,2})$/u.test(part) ? Number(part) : -1));
  if (octets.some((octet) => octet < 0 || octet > 255)) return null;
  return octets.reduce((value, octet) => value * 256 + octet, 0);
}

function ipv4InCidr(address, base, prefixLength) {
  const blockSize = 2 ** (32 - prefixLength);
  return Math.floor(address / blockSize) === Math.floor(base / blockSize);
}

function parseIpv6(address) {
  if (typeof address !== "string" || !address || address.includes("%") || address.includes(".")) return null;
  const normalized = address.toLowerCase();
  if (!/^[0-9a-f:]+$/u.test(normalized) || normalized.split("::").length > 2) return null;

  const [leftText, rightText] = normalized.split("::");
  const left = leftText ? leftText.split(":") : [];
  const right = rightText ? rightText.split(":") : [];
  if ([...left, ...right].some((part) => !/^[0-9a-f]{1,4}$/u.test(part))) return null;

  const omitted = 8 - left.length - right.length;
  if ((normalized.includes("::") && omitted < 1) || (!normalized.includes("::") && omitted !== 0)) return null;
  const groups = [...left, ...Array.from({ length: omitted }, () => "0"), ...right].map((part) =>
    Number.parseInt(part, 16)
  );
  if (groups.length !== 8) return null;

  return Uint8Array.from(groups.flatMap((group) => [group >>> 8, group & 0xff]));
}

function bytesMatchPrefix(bytes, prefix, bitLength) {
  const wholeBytes = Math.floor(bitLength / 8);
  for (let index = 0; index < wholeBytes; index += 1) {
    if (bytes[index] !== prefix[index]) return false;
  }
  const remainingBits = bitLength % 8;
  if (!remainingBits) return true;
  const mask = (0xff << (8 - remainingBits)) & 0xff;
  return (bytes[wholeBytes] & mask) === (prefix[wholeBytes] & mask);
}

function ipv6Prefix(value) {
  const parsed = parseIpv6(value);
  if (!parsed) throw fixedError("DISPATCH_DNS_POLICY_INVALID");
  return parsed;
}

// Most of 2001::/23 is reserved, but IANA marks these exact entries globally reachable.
// https://www.iana.org/assignments/iana-ipv6-special-registry/
const IPV6_GLOBALLY_REACHABLE_EXCEPTIONS = Object.freeze([
  [ipv6Prefix("2001:1::1"), 128],
  [ipv6Prefix("2001:1::2"), 128],
  [ipv6Prefix("2001:1::3"), 128],
  [ipv6Prefix("2001:3::"), 32],
  [ipv6Prefix("2001:4:112::"), 48],
  [ipv6Prefix("2001:20::"), 28],
  [ipv6Prefix("2001:30::"), 28],
]);
const IPV6_IETF_ASSIGNMENTS_PREFIX = ipv6Prefix("2001::");
const IPV6_TRANSLATION_PREFIX = ipv6Prefix("64:ff9b::");
const IPV6_BLOCKED_CIDRS = Object.freeze([
  [ipv6Prefix("2001:db8::"), 32],
  [ipv6Prefix("2002::"), 16],
  [ipv6Prefix("3fff::"), 20],
]);

export function isPublicNetworkAddress(address, family) {
  if (family === 4) {
    const parsed = parseIpv4(address);
    if (parsed === null) return false;
    if (IPV4_GLOBALLY_REACHABLE_EXCEPTIONS.includes(address)) return true;
    return !IPV4_BLOCKED_CIDRS.some(([base, prefixLength]) => ipv4InCidr(parsed, parseIpv4(base), prefixLength));
  }

  if (family === 6) {
    const parsed = parseIpv6(address);
    if (!parsed) return false;
    if (bytesMatchPrefix(parsed, IPV6_TRANSLATION_PREFIX, 96)) return true;
    if ((parsed[0] & 0xe0) !== 0x20) return false;
    if (bytesMatchPrefix(parsed, IPV6_IETF_ASSIGNMENTS_PREFIX, 23)) {
      return IPV6_GLOBALLY_REACHABLE_EXCEPTIONS.some(([prefix, prefixLength]) =>
        bytesMatchPrefix(parsed, prefix, prefixLength)
      );
    }
    return !IPV6_BLOCKED_CIDRS.some(([prefix, prefixLength]) => bytesMatchPrefix(parsed, prefix, prefixLength));
  }

  return false;
}

export function validatedPublicDnsResult(result) {
  if (!hasExactKeys(result, ["ipv4", "ipv6"]) || !Array.isArray(result.ipv4) || !Array.isArray(result.ipv6)) {
    throw fixedError("DISPATCH_DNS_RESULT_INVALID");
  }

  const entries = [
    ...result.ipv4.map((address) => ({ address, family: 4 })),
    ...result.ipv6.map((address) => ({ address, family: 6 })),
  ];
  if (!entries.length || entries.some(({ address, family }) => !isPublicNetworkAddress(address, family))) {
    throw fixedError("DISPATCH_DNS_RESULT_INVALID");
  }

  const unique = new Map();
  for (const entry of entries) unique.set(`${entry.family}:${entry.address.toLowerCase()}`, entry);
  return Object.freeze(
    [...unique.values()]
      .sort((left, right) => left.family - right.family || left.address.localeCompare(right.address))
      .map((entry) => Object.freeze({ ...entry }))
  );
}

function resolvedAddresses(settled, family) {
  if (settled.status === "fulfilled") return settled.value;
  if (settled.reason?.code === "ENODATA") return [];
  throw fixedError(`DISPATCH_DNS_IPV${family}_FAILED`);
}

export async function resolveDispatcherAddresses(
  hostname,
  { resolve4Ref = nodeResolve4, resolve6Ref = nodeResolve6 } = {}
) {
  if (
    typeof hostname !== "string" ||
    !hostname ||
    typeof resolve4Ref !== "function" ||
    typeof resolve6Ref !== "function"
  ) {
    throw fixedError("DISPATCH_DNS_RESOLVER_INVALID");
  }
  const [ipv4Result, ipv6Result] = await Promise.allSettled([resolve4Ref(hostname), resolve6Ref(hostname)]);
  return validatedPublicDnsResult({
    ipv4: resolvedAddresses(ipv4Result, 4),
    ipv6: resolvedAddresses(ipv6Result, 6),
  });
}

function lookupError(code) {
  const error = fixedError(code);
  error.code = "ENOTFOUND";
  return error;
}

export function createPinnedLookup(expectedHostname, vettedAddresses) {
  if (typeof expectedHostname !== "string" || !expectedHostname || !Array.isArray(vettedAddresses)) {
    throw fixedError("DISPATCH_DNS_PIN_INVALID");
  }
  const addresses = validatedPublicDnsResult({
    ipv4: vettedAddresses.filter((entry) => entry?.family === 4).map((entry) => entry.address),
    ipv6: vettedAddresses.filter((entry) => entry?.family === 6).map((entry) => entry.address),
  });

  return function pinnedLookup(hostname, options, callback) {
    let lookupOptions = options;
    let done = callback;
    if (typeof options === "function") {
      done = options;
      lookupOptions = {};
    }
    if (typeof done !== "function") throw fixedError("DISPATCH_DNS_CALLBACK_REQUIRED");
    if (hostname !== expectedHostname) {
      done(lookupError("DISPATCH_DNS_PIN_MISMATCH"));
      return;
    }

    const family = typeof lookupOptions === "number" ? lookupOptions : Number(lookupOptions?.family ?? 0);
    if (![0, 4, 6].includes(family)) {
      done(lookupError("DISPATCH_DNS_FAMILY_UNAVAILABLE"));
      return;
    }
    const compatible = family ? addresses.filter((entry) => entry.family === family) : addresses;
    if (!compatible.length) {
      done(lookupError("DISPATCH_DNS_FAMILY_UNAVAILABLE"));
      return;
    }

    if (typeof lookupOptions === "object" && lookupOptions?.all === true) {
      done(
        null,
        compatible.map((entry) => ({ ...entry }))
      );
      return;
    }
    done(null, compatible[0].address, compatible[0].family);
  };
}

export function createPinnedHttpsAgent(expectedHostname, vettedAddresses) {
  return new HttpsAgent({
    keepAlive: false,
    lookup: createPinnedLookup(expectedHostname, vettedAddresses),
    maxSockets: 1,
  });
}

function digestHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function prepareDispatcherEgress({
  cryptoRef = globalThis.crypto,
  endpoint,
  resolveAddresses,
  serializedProviderOrigins,
}) {
  if (typeof resolveAddresses !== "function") throw fixedError("DISPATCH_DNS_RESOLVER_REQUIRED");
  const policy = await parseCanonicalProviderOriginsPolicy(serializedProviderOrigins, cryptoRef);
  const validatedEndpoint = validateCanonicalEndpoint(endpoint, policy.origins);
  if (!validatedEndpoint) throw fixedError("DISPATCH_PROVIDER_POLICY_REJECTED");

  const hostname = new URL(validatedEndpoint).hostname;
  const addresses = validatedPublicDnsResult(await resolveAddresses(hostname));
  return Object.freeze({
    addresses,
    agent: createPinnedHttpsAgent(hostname, addresses),
    endpoint: validatedEndpoint,
    hostname,
    policyDigest: digestHex(policy.digest),
  });
}

export function computePushTtlSeconds({ databaseNowMs, expiresAtMs, requestDeadlineMs, safetyBudgetMs }) {
  const values = [databaseNowMs, expiresAtMs, requestDeadlineMs, safetyBudgetMs];
  if (
    values.some((value) => !Number.isSafeInteger(value)) ||
    databaseNowMs < 0 ||
    expiresAtMs < 0 ||
    requestDeadlineMs < 0 ||
    safetyBudgetMs < 0
  ) {
    throw fixedError("DISPATCH_TTL_INPUT_INVALID");
  }
  const remainingMs = expiresAtMs - databaseNowMs - requestDeadlineMs - safetyBudgetMs;
  return Math.max(0, Math.floor(remainingMs / 1000));
}
