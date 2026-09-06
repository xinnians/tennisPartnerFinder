export const PUSH_SUBSCRIPTION_V2_VERSION = 1;
export const PUSH_SUBSCRIPTION_ENDPOINT_MAX_BYTES = 4096;
export const PUSH_SUBSCRIPTION_KEY_ALGORITHM = "RSA-OAEP-256";
export const PUSH_SUBSCRIPTION_KEY_ID_BYTES = 32;
export const PUSH_SUBSCRIPTION_KEY_ID_CHARACTERS = 43;
export const PUSH_SUBSCRIPTION_PUBLIC_KEY_DOCUMENT_BYTES = 499;
export const PUSH_SUBSCRIPTION_PUBLIC_KEY_PATH = "/push-subscription-key-v1.json";
export const PUSH_SUBSCRIPTION_RSA_MODULUS_BITS = 2048;
export const PUSH_SUBSCRIPTION_RSA_CIPHERTEXT_BYTES = PUSH_SUBSCRIPTION_RSA_MODULUS_BITS / 8;
export const PUSH_SUBSCRIPTION_RSA_LABEL_TEXT = "qiuka.tw/push-subscription-v2/key/v1";
export const PUSH_SUBSCRIPTION_AAD_PREFIX = "qiuka.tw/push-subscription-v2/envelope/v1/";
export const PUSH_SUBSCRIPTION_AES_KEY_BYTES = 32;
export const PUSH_SUBSCRIPTION_IV_BYTES = 12;
export const PUSH_SUBSCRIPTION_GCM_TAG_BYTES = 16;
export const PUSH_SUBSCRIPTION_AUTH_BYTES = 16;
export const PUSH_SUBSCRIPTION_P256DH_BYTES = 65;
export const PUSH_SUBSCRIPTION_VAPID_BYTES = 65;
export const PUSH_SUBSCRIPTION_ENDPOINT_FINGERPRINT_ALGORITHM = "sha256-endpoint-utf8-v1";
export const PUSH_SUBSCRIPTION_VAPID_FINGERPRINT_ALGORITHM = "sha256-vapid-p256-uncompressed-v1";

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const LOWERCASE_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/u;
const POSITIVE_BIGINT_PATTERN = /^[1-9][0-9]*$/u;
const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;
const RSA_IMPORT_ALGORITHM = Object.freeze({ hash: "SHA-256", name: "RSA-OAEP" });
const RSA_ENCRYPT_OPERATION = Object.freeze({
  label: new TextEncoder().encode(PUSH_SUBSCRIPTION_RSA_LABEL_TEXT),
  name: "RSA-OAEP",
});
const AES_IMPORT_ALGORITHM = "AES-GCM";

// IANA's Special-Use registry says the designation covers each listed name
// and its subdomains. Reverse-DNS entries cannot be forward endpoint hosts.
// Keep this list aligned with the registry, not with inferred provider names.
const SPECIAL_USE_FORWARD_SUFFIXES = Object.freeze([
  "6tisch.arpa",
  "alt",
  "eap-noob.arpa",
  "eap.arpa",
  "example",
  "example.com",
  "example.net",
  "example.org",
  "home.arpa",
  "invalid",
  "ipv4only.arpa",
  "local",
  "localhost",
  "onion",
  "resolver.arpa",
  "service.arpa",
  "test",
]);

export function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function hasExactKeys(value, expectedKeys) {
  if (!isRecord(value)) return false;
  const actual = Reflect.ownKeys(value);
  if (actual.some((key) => typeof key !== "string")) return false;
  actual.sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function bytesToBinary(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return binary;
}

export function encodeBase64Url(bytes) {
  return globalThis.btoa(bytesToBinary(bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function decodeCanonicalBase64Url(value) {
  if (typeof value !== "string" || !value || !BASE64URL_PATTERN.test(value) || value.length % 4 === 1) return null;
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  let binary;
  try {
    binary = globalThis.atob(value.replaceAll("-", "+").replaceAll("_", "/") + padding);
  } catch {
    return null;
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return encodeBase64Url(bytes) === value ? bytes : null;
}

function base64UrlCharacterLength(byteLength) {
  return Math.ceil((byteLength * 8) / 6);
}

function utf8(value) {
  return new TextEncoder().encode(value);
}

async function sha256(bytes, cryptoRef) {
  return new Uint8Array(await cryptoRef.subtle.digest("SHA-256", bytes));
}

function hex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isIpLiteral(hostname) {
  return hostname.startsWith("[") || /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/u.test(hostname);
}

function isSpecialUseHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/\.$/u, "");
  return SPECIAL_USE_FORWARD_SUFFIXES.some((suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`));
}

function safePublicHostname(hostname) {
  const normalized = hostname.replace(/\.$/u, "");
  return Boolean(normalized) && normalized.includes(".") && !isIpLiteral(hostname) && !isSpecialUseHostname(hostname);
}

function parseCanonicalHttpsUrl(value) {
  if (typeof value !== "string" || !value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.hash ||
    url.port ||
    url.href !== value ||
    !safePublicHostname(url.hostname)
  ) {
    return null;
  }
  return url;
}

export function canonicalProviderOrigin(value) {
  const url = parseCanonicalHttpsUrl(`${value}/`);
  return url && typeof value === "string" && url.origin === value && url.href === `${value}/` ? value : null;
}

export async function parseCanonicalProviderOriginsPolicy(serialized, cryptoRef = globalThis.crypto) {
  try {
    const origins = JSON.parse(serialized);
    if (!Array.isArray(origins) || origins.length === 0 || origins.some((origin) => !canonicalProviderOrigin(origin))) {
      throw new Error("PUSH_PROVIDER_POLICY_INVALID");
    }
    const sortedUnique = [...new Set(origins)].sort();
    const canonical = JSON.stringify(sortedUnique);
    if (sortedUnique.length !== origins.length || canonical !== serialized) {
      throw new Error("PUSH_PROVIDER_POLICY_INVALID");
    }
    return {
      digest: await sha256(utf8(canonical), cryptoRef),
      origins: sortedUnique,
      serialized: canonical,
    };
  } catch {
    throw new Error("PUSH_PROVIDER_POLICY_INVALID");
  }
}

export function validateCanonicalEndpointStructure(endpoint) {
  if (typeof endpoint !== "string" || !endpoint || utf8(endpoint).byteLength > PUSH_SUBSCRIPTION_ENDPOINT_MAX_BYTES) {
    return null;
  }
  const url = parseCanonicalHttpsUrl(endpoint);
  return url ? endpoint : null;
}

export function validateCanonicalEndpoint(endpoint, providerOrigins) {
  const structured = validateCanonicalEndpointStructure(endpoint);
  if (!structured || !Array.isArray(providerOrigins)) return null;
  const url = new URL(structured);
  return providerOrigins.includes(url.origin) ? structured : null;
}

async function validP256Point(bytes, cryptoRef) {
  if (bytes?.byteLength !== PUSH_SUBSCRIPTION_P256DH_BYTES || bytes[0] !== 4) return false;
  try {
    await cryptoRef.subtle.importKey("raw", bytes, { name: "ECDH", namedCurve: "P-256" }, false, []);
    return true;
  } catch {
    return false;
  }
}

export async function validateCanonicalPushSubscriptionStructure(subscription, cryptoRef = globalThis.crypto) {
  if (!hasExactKeys(subscription, ["auth", "endpoint", "p256dh"])) return null;
  const endpoint = validateCanonicalEndpointStructure(subscription.endpoint);
  const auth = decodeCanonicalBase64Url(subscription.auth);
  const p256dh = decodeCanonicalBase64Url(subscription.p256dh);
  if (!endpoint || auth?.byteLength !== PUSH_SUBSCRIPTION_AUTH_BYTES || !(await validP256Point(p256dh, cryptoRef))) {
    return null;
  }
  return {
    auth: subscription.auth,
    endpoint,
    endpointFingerprint: hex(await sha256(utf8(endpoint), cryptoRef)),
    endpointFingerprintAlgorithm: PUSH_SUBSCRIPTION_ENDPOINT_FINGERPRINT_ALGORITHM,
    p256dh: subscription.p256dh,
  };
}

export async function validateCanonicalPushSubscription(subscription, providerOrigins, cryptoRef = globalThis.crypto) {
  const structured = await validateCanonicalPushSubscriptionStructure(subscription, cryptoRef);
  return structured && validateCanonicalEndpoint(structured.endpoint, providerOrigins) ? structured : null;
}

export async function vapidPublicKeyFingerprint(value, cryptoRef = globalThis.crypto) {
  const bytes = typeof value === "string" ? decodeCanonicalBase64Url(value) : value;
  if (!(bytes instanceof Uint8Array) || !(await validP256Point(bytes, cryptoRef))) return null;
  return {
    algorithm: PUSH_SUBSCRIPTION_VAPID_FINGERPRINT_ALGORITHM,
    fingerprint: hex(await sha256(bytes, cryptoRef)),
  };
}

function validUuid(value, version4Only = false) {
  return typeof value === "string" && (version4Only ? UUID_V4_PATTERN : LOWERCASE_UUID_PATTERN).test(value);
}

function validPositiveBigint(value) {
  if (typeof value !== "string" || !POSITIVE_BIGINT_PATTERN.test(value)) return false;
  try {
    return BigInt(value) <= POSTGRES_BIGINT_MAX;
  } catch {
    return false;
  }
}

function validConsentIdentity(value) {
  return (
    hasExactKeys(value, ["consentEpoch", "consentId", "consentVersion"]) &&
    validUuid(value.consentEpoch) &&
    validPositiveBigint(value.consentId) &&
    validPositiveBigint(value.consentVersion)
  );
}

function normalizedConsentIdentity(value) {
  return {
    consentEpoch: value.consentEpoch,
    consentId: value.consentId,
    consentVersion: value.consentVersion,
  };
}

export async function canonicalPushSubscriptionInnerJson(payload, cryptoRef = globalThis.crypto) {
  if (!isRecord(payload) || payload.version !== PUSH_SUBSCRIPTION_V2_VERSION) return null;
  const subscription = await validateCanonicalPushSubscriptionStructure(payload.subscription, cryptoRef);
  if (!subscription || !validUuid(payload.bindingId, true) || !validUuid(payload.deviceId, true)) return null;

  if (payload.kind === "enable") {
    if (
      !hasExactKeys(payload, [
        "bindingId",
        "cleanupTokenHash",
        "deviceId",
        "kind",
        "predecessor",
        "subscription",
        "version",
      ])
    ) {
      return null;
    }
    if (
      !SHA256_HEX_PATTERN.test(payload.cleanupTokenHash) ||
      (payload.predecessor !== null && !validConsentIdentity(payload.predecessor))
    ) {
      return null;
    }
    return JSON.stringify({
      bindingId: payload.bindingId,
      cleanupTokenHash: payload.cleanupTokenHash,
      deviceId: payload.deviceId,
      kind: "enable",
      predecessor: payload.predecessor === null ? null : normalizedConsentIdentity(payload.predecessor),
      subscription: { auth: subscription.auth, endpoint: subscription.endpoint, p256dh: subscription.p256dh },
      version: PUSH_SUBSCRIPTION_V2_VERSION,
    });
  }

  if (payload.kind === "refresh") {
    if (!hasExactKeys(payload, ["bindingId", "deviceId", "expectedConsent", "kind", "subscription", "version"]))
      return null;
    if (!validConsentIdentity(payload.expectedConsent)) return null;
    return JSON.stringify({
      bindingId: payload.bindingId,
      deviceId: payload.deviceId,
      expectedConsent: normalizedConsentIdentity(payload.expectedConsent),
      kind: "refresh",
      subscription: { auth: subscription.auth, endpoint: subscription.endpoint, p256dh: subscription.p256dh },
      version: PUSH_SUBSCRIPTION_V2_VERSION,
    });
  }
  return null;
}

function hasCanonicalRsaPublicMembers(jwk) {
  if (!isRecord(jwk) || jwk.kty !== "RSA" || typeof jwk.e !== "string" || typeof jwk.n !== "string") return false;
  const exponent = decodeCanonicalBase64Url(jwk.e);
  const modulus = decodeCanonicalBase64Url(jwk.n);
  return Boolean(exponent?.byteLength && modulus?.byteLength && exponent[0] !== 0 && modulus[0] !== 0);
}

function rsaModulusBitLength(modulus) {
  return (modulus.byteLength - 1) * 8 + 32 - Math.clz32(modulus[0]);
}

export async function pushSubscriptionRsaThumbprint(jwk, cryptoRef = globalThis.crypto) {
  if (!hasCanonicalRsaPublicMembers(jwk)) return null;
  return encodeBase64Url(await sha256(utf8(JSON.stringify({ e: jwk.e, kty: "RSA", n: jwk.n })), cryptoRef));
}

function normalizedPublicJwk(jwk) {
  return {
    alg: PUSH_SUBSCRIPTION_KEY_ALGORITHM,
    e: jwk.e,
    ext: true,
    key_ops: ["encrypt"],
    kid: jwk.kid,
    kty: "RSA",
    n: jwk.n,
  };
}

export async function validatePushSubscriptionPublicJwk(jwk, cryptoRef = globalThis.crypto) {
  if (
    !hasExactKeys(jwk, ["alg", "e", "ext", "key_ops", "kid", "kty", "n"]) ||
    !hasCanonicalRsaPublicMembers(jwk) ||
    jwk.alg !== PUSH_SUBSCRIPTION_KEY_ALGORITHM ||
    jwk.e !== "AQAB" ||
    jwk.ext !== true ||
    !Array.isArray(jwk.key_ops) ||
    jwk.key_ops.length !== 1 ||
    jwk.key_ops[0] !== "encrypt" ||
    typeof jwk.kid !== "string"
  ) {
    throw new Error("PUSH_SUBSCRIPTION_PUBLIC_KEY_INVALID");
  }
  const modulus = decodeCanonicalBase64Url(jwk.n);
  const thumbprint = await pushSubscriptionRsaThumbprint(jwk, cryptoRef);
  if (!modulus || rsaModulusBitLength(modulus) !== PUSH_SUBSCRIPTION_RSA_MODULUS_BITS || jwk.kid !== thumbprint) {
    throw new Error("PUSH_SUBSCRIPTION_PUBLIC_KEY_INVALID");
  }
  return jwk;
}

export async function canonicalPushSubscriptionPublicJwkJson(jwk, cryptoRef = globalThis.crypto) {
  await validatePushSubscriptionPublicJwk(jwk, cryptoRef);
  return JSON.stringify(normalizedPublicJwk(jwk));
}

export async function parseCanonicalPushSubscriptionPublicJwkJson(serialized, cryptoRef = globalThis.crypto) {
  try {
    const jwk = JSON.parse(serialized);
    if ((await canonicalPushSubscriptionPublicJwkJson(jwk, cryptoRef)) !== serialized) throw new Error();
    return jwk;
  } catch {
    throw new Error("PUSH_SUBSCRIPTION_PUBLIC_KEY_INVALID");
  }
}

export async function canonicalPushSubscriptionPublicKeyDocumentJson(jwk, cryptoRef = globalThis.crypto) {
  await validatePushSubscriptionPublicJwk(jwk, cryptoRef);
  return JSON.stringify({ key: normalizedPublicJwk(jwk), version: PUSH_SUBSCRIPTION_V2_VERSION });
}

export async function parseCanonicalPushSubscriptionPublicKeyDocument(serialized, cryptoRef = globalThis.crypto) {
  try {
    const document = JSON.parse(serialized);
    if (!hasExactKeys(document, ["key", "version"]) || document.version !== PUSH_SUBSCRIPTION_V2_VERSION)
      throw new Error();
    if ((await canonicalPushSubscriptionPublicKeyDocumentJson(document.key, cryptoRef)) !== serialized)
      throw new Error();
    return document.key;
  } catch {
    throw new Error("PUSH_SUBSCRIPTION_PUBLIC_KEY_DOCUMENT_INVALID");
  }
}

export function canonicalPushSubscriptionEnvelopeJson(envelope) {
  if (!hasExactKeys(envelope, ["ciphertext", "encryptedKey", "iv", "keyId", "version"]) || envelope.version !== 1)
    return null;
  const ciphertext = decodeCanonicalBase64Url(envelope.ciphertext);
  const encryptedKey = decodeCanonicalBase64Url(envelope.encryptedKey);
  const iv = decodeCanonicalBase64Url(envelope.iv);
  const keyId = decodeCanonicalBase64Url(envelope.keyId);
  if (
    !ciphertext ||
    ciphertext.byteLength < PUSH_SUBSCRIPTION_GCM_TAG_BYTES ||
    ciphertext.byteLength > PUSH_SUBSCRIPTION_CIPHERTEXT_MAX_BYTES ||
    encryptedKey?.byteLength !== PUSH_SUBSCRIPTION_RSA_CIPHERTEXT_BYTES ||
    iv?.byteLength !== PUSH_SUBSCRIPTION_IV_BYTES ||
    keyId?.byteLength !== PUSH_SUBSCRIPTION_KEY_ID_BYTES
  ) {
    return null;
  }
  return JSON.stringify({
    ciphertext: envelope.ciphertext,
    encryptedKey: envelope.encryptedKey,
    iv: envelope.iv,
    keyId: envelope.keyId,
    version: PUSH_SUBSCRIPTION_V2_VERSION,
  });
}

export function pushSubscriptionAad(authUserId) {
  if (!validUuid(authUserId)) return null;
  return utf8(`${PUSH_SUBSCRIPTION_AAD_PREFIX}${authUserId}`);
}

export async function encryptPushSubscriptionEnvelope(payload, authUserId, publicJwk, cryptoRef = globalThis.crypto) {
  const inner = await canonicalPushSubscriptionInnerJson(payload, cryptoRef);
  const aad = pushSubscriptionAad(authUserId);
  if (!inner || !aad) throw new Error("PUSH_SUBSCRIPTION_PAYLOAD_INVALID");
  await validatePushSubscriptionPublicJwk(publicJwk, cryptoRef);

  const aesKeyBytes = cryptoRef.getRandomValues(new Uint8Array(PUSH_SUBSCRIPTION_AES_KEY_BYTES));
  const iv = cryptoRef.getRandomValues(new Uint8Array(PUSH_SUBSCRIPTION_IV_BYTES));
  const plaintext = utf8(inner);
  let ciphertext;
  let encryptedKey;
  try {
    const [aesKey, rsaKey] = await Promise.all([
      cryptoRef.subtle.importKey("raw", aesKeyBytes, AES_IMPORT_ALGORITHM, false, ["encrypt"]),
      cryptoRef.subtle.importKey("jwk", publicJwk, RSA_IMPORT_ALGORITHM, false, ["encrypt"]),
    ]);
    [ciphertext, encryptedKey] = await Promise.all([
      cryptoRef.subtle.encrypt(
        { additionalData: aad, iv, name: AES_IMPORT_ALGORITHM, tagLength: 128 },
        aesKey,
        plaintext
      ),
      cryptoRef.subtle.encrypt(RSA_ENCRYPT_OPERATION, rsaKey, aesKeyBytes),
    ]);
    return {
      ciphertext: encodeBase64Url(new Uint8Array(ciphertext)),
      encryptedKey: encodeBase64Url(new Uint8Array(encryptedKey)),
      iv: encodeBase64Url(iv),
      keyId: publicJwk.kid,
      version: PUSH_SUBSCRIPTION_V2_VERSION,
    };
  } finally {
    aesKeyBytes.fill(0);
    iv.fill(0);
    plaintext.fill(0);
    aad.fill(0);
    if (ciphertext) new Uint8Array(ciphertext).fill(0);
    if (encryptedKey) new Uint8Array(encryptedKey).fill(0);
  }
}

function maximumEnableInnerPayload() {
  const prefix = "https://push-fixture.qiuka.tw/";
  return {
    bindingId: "00000000-0000-4000-8000-000000000000",
    cleanupTokenHash: "0".repeat(64),
    deviceId: "00000000-0000-4000-8000-000000000000",
    kind: "enable",
    predecessor: {
      consentEpoch: "00000000-0000-1000-8000-000000000000",
      consentId: POSTGRES_BIGINT_MAX.toString(),
      consentVersion: POSTGRES_BIGINT_MAX.toString(),
    },
    subscription: {
      auth: "A".repeat(base64UrlCharacterLength(PUSH_SUBSCRIPTION_AUTH_BYTES)),
      endpoint: prefix + "a".repeat(PUSH_SUBSCRIPTION_ENDPOINT_MAX_BYTES - utf8(prefix).byteLength),
      p256dh: "A".repeat(base64UrlCharacterLength(PUSH_SUBSCRIPTION_P256DH_BYTES)),
    },
    version: PUSH_SUBSCRIPTION_V2_VERSION,
  };
}

const MAXIMUM_ENABLE_INNER_BYTES = utf8(JSON.stringify(maximumEnableInnerPayload())).byteLength;
export const PUSH_SUBSCRIPTION_CIPHERTEXT_MAX_BYTES = MAXIMUM_ENABLE_INNER_BYTES + PUSH_SUBSCRIPTION_GCM_TAG_BYTES;
export const PUSH_SUBSCRIPTION_ENVELOPE_MAX_BYTES = utf8(
  JSON.stringify({
    ciphertext: "A".repeat(base64UrlCharacterLength(PUSH_SUBSCRIPTION_CIPHERTEXT_MAX_BYTES)),
    encryptedKey: "A".repeat(base64UrlCharacterLength(PUSH_SUBSCRIPTION_RSA_CIPHERTEXT_BYTES)),
    iv: "A".repeat(base64UrlCharacterLength(PUSH_SUBSCRIPTION_IV_BYTES)),
    keyId: "A".repeat(PUSH_SUBSCRIPTION_KEY_ID_CHARACTERS),
    version: PUSH_SUBSCRIPTION_V2_VERSION,
  })
).byteLength;
