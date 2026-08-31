export const CLEANUP_ENVELOPE_VERSION = 1;
export const CLEANUP_KEY_ALGORITHM = "RSA-OAEP-256";
export const CLEANUP_KEY_RING_LIMIT = 2;
export const CLEANUP_RSA_LABEL_TEXT = "qiuka.tw/push-cleanup-token/v1";
export const CLEANUP_RSA_MODULUS_BITS = 2048;
export const CLEANUP_RSA_CIPHERTEXT_BYTES = CLEANUP_RSA_MODULUS_BITS / 8;
export const CLEANUP_RSA_CIPHERTEXT_CHARACTERS = Math.ceil((CLEANUP_RSA_CIPHERTEXT_BYTES * 8) / 6);
export const CLEANUP_TOKEN_BYTES = 32;
export const CLEANUP_TOKEN_CHARACTERS = 43;

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const CLEANUP_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const RSA_OAEP_IMPORT_ALGORITHM = Object.freeze({ hash: "SHA-256", name: "RSA-OAEP" });
const RSA_OAEP_OPERATION = Object.freeze({
  label: new TextEncoder().encode(CLEANUP_RSA_LABEL_TEXT),
  name: "RSA-OAEP",
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, expectedKeys) {
  if (!isRecord(value)) return false;
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  return (
    actualKeys.length === sortedExpectedKeys.length &&
    actualKeys.every((key, index) => key === sortedExpectedKeys[index])
  );
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
  if (typeof value !== "string" || value.length === 0 || !BASE64URL_PATTERN.test(value) || value.length % 4 === 1) {
    return null;
  }

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

export function decodeCanonicalCleanupToken(token) {
  if (typeof token !== "string" || !CLEANUP_TOKEN_PATTERN.test(token)) return null;
  const bytes = decodeCanonicalBase64Url(token);
  return bytes?.byteLength === CLEANUP_TOKEN_BYTES ? bytes : null;
}

function digestToHex(digest) {
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(bytes, cryptoRef) {
  return new Uint8Array(await cryptoRef.subtle.digest("SHA-256", bytes));
}

export async function cleanupTokenDigestHex(token, cryptoRef = globalThis.crypto) {
  const tokenBytes = decodeCanonicalCleanupToken(token);
  if (!tokenBytes) return null;

  try {
    return digestToHex(await sha256(tokenBytes, cryptoRef));
  } finally {
    tokenBytes.fill(0);
  }
}

function hasCanonicalRsaPublicMembers(jwk) {
  if (!isRecord(jwk) || jwk.kty !== "RSA" || typeof jwk.e !== "string" || typeof jwk.n !== "string") {
    return false;
  }
  const exponent = decodeCanonicalBase64Url(jwk.e);
  const modulus = decodeCanonicalBase64Url(jwk.n);
  return Boolean(exponent?.byteLength && modulus?.byteLength && exponent[0] !== 0 && modulus[0] !== 0);
}

export async function rsaJwkThumbprint(jwk, cryptoRef = globalThis.crypto) {
  if (!hasCanonicalRsaPublicMembers(jwk)) return null;
  const canonical = JSON.stringify({ e: jwk.e, kty: "RSA", n: jwk.n });
  return encodeBase64Url(await sha256(new TextEncoder().encode(canonical), cryptoRef));
}

function rsaModulusBitLength(modulus) {
  const firstByteBits = 32 - Math.clz32(modulus[0]);
  return (modulus.byteLength - 1) * 8 + firstByteBits;
}

function validPrivateKeyUsage(jwk) {
  return Array.isArray(jwk.key_ops) && jwk.key_ops.length === 1 && jwk.key_ops[0] === "decrypt";
}

function validPrivateKeyShape(jwk) {
  if (
    !hasExactKeys(jwk, ["alg", "d", "dp", "dq", "e", "ext", "key_ops", "kid", "kty", "n", "p", "q", "qi"]) ||
    !hasCanonicalRsaPublicMembers(jwk) ||
    jwk.alg !== CLEANUP_KEY_ALGORITHM ||
    jwk.e !== "AQAB" ||
    jwk.ext !== true ||
    typeof jwk.kid !== "string" ||
    !validPrivateKeyUsage(jwk)
  ) {
    return false;
  }

  return ["d", "dp", "dq", "p", "q", "qi"].every((name) => {
    const value = decodeCanonicalBase64Url(jwk[name]);
    return Boolean(value?.byteLength && value[0] !== 0);
  });
}

function bytesEqual(left, right) {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function selfTestPrivateKey(jwk, privateKey, cryptoRef) {
  const publicKey = await cryptoRef.subtle.importKey(
    "jwk",
    {
      alg: CLEANUP_KEY_ALGORITHM,
      e: jwk.e,
      ext: true,
      key_ops: ["encrypt"],
      kid: jwk.kid,
      kty: "RSA",
      n: jwk.n,
    },
    RSA_OAEP_IMPORT_ALGORITHM,
    false,
    ["encrypt"]
  );
  const probe = cryptoRef.getRandomValues(new Uint8Array(CLEANUP_TOKEN_BYTES));
  let ciphertext = null;
  let decrypted = null;
  try {
    ciphertext = new Uint8Array(await cryptoRef.subtle.encrypt(RSA_OAEP_OPERATION, publicKey, probe));
    decrypted = new Uint8Array(await cryptoRef.subtle.decrypt(RSA_OAEP_OPERATION, privateKey, ciphertext));
    if (!bytesEqual(probe, decrypted)) throw new Error("PUSH_CLEANUP_KEY_CONFIG_INVALID");
  } finally {
    probe.fill(0);
    ciphertext?.fill(0);
    decrypted?.fill(0);
  }
}

async function importPrivateKeyEntry(jwk, cryptoRef) {
  if (!validPrivateKeyShape(jwk)) {
    throw new Error("PUSH_CLEANUP_KEY_CONFIG_INVALID");
  }

  const expectedKeyId = await rsaJwkThumbprint(jwk, cryptoRef);
  if (jwk.kid !== expectedKeyId) throw new Error("PUSH_CLEANUP_KEY_CONFIG_INVALID");

  const modulus = decodeCanonicalBase64Url(jwk.n);
  if (!modulus || rsaModulusBitLength(modulus) !== CLEANUP_RSA_MODULUS_BITS) {
    throw new Error("PUSH_CLEANUP_KEY_CONFIG_INVALID");
  }

  const key = await cryptoRef.subtle.importKey("jwk", jwk, RSA_OAEP_IMPORT_ALGORITHM, false, ["decrypt"]);
  await selfTestPrivateKey(jwk, key, cryptoRef);
  return { key };
}

export async function loadPrivateKeyRing(serializedJwks, cryptoRef = globalThis.crypto) {
  try {
    const parsed = JSON.parse(serializedJwks);
    if (
      !hasExactKeys(parsed, ["keys"]) ||
      !Array.isArray(parsed.keys) ||
      parsed.keys.length === 0 ||
      parsed.keys.length > CLEANUP_KEY_RING_LIMIT
    ) {
      throw new Error("PUSH_CLEANUP_KEY_CONFIG_INVALID");
    }

    const ring = new Map();
    for (const jwk of parsed.keys) {
      const entry = await importPrivateKeyEntry(jwk, cryptoRef);
      if (ring.has(jwk.kid)) throw new Error("PUSH_CLEANUP_KEY_CONFIG_INVALID");
      ring.set(jwk.kid, entry);
    }
    return ring;
  } catch {
    throw new Error("PUSH_CLEANUP_KEY_CONFIG_INVALID");
  }
}

function exactEnvelopeShape(envelope) {
  return hasExactKeys(envelope, ["ciphertext", "keyId", "version"]);
}

function validKeyId(value) {
  const decoded = decodeCanonicalBase64Url(value);
  return decoded?.byteLength === 32;
}

export function canonicalCleanupEnvelopeJson(envelope) {
  if (
    !exactEnvelopeShape(envelope) ||
    envelope.version !== CLEANUP_ENVELOPE_VERSION ||
    typeof envelope.keyId !== "string" ||
    !validKeyId(envelope.keyId) ||
    typeof envelope.ciphertext !== "string"
  ) {
    return null;
  }

  const ciphertext = decodeCanonicalBase64Url(envelope.ciphertext);
  if (ciphertext?.byteLength !== CLEANUP_RSA_CIPHERTEXT_BYTES) return null;
  ciphertext.fill(0);

  return JSON.stringify({
    ciphertext: envelope.ciphertext,
    keyId: envelope.keyId,
    version: CLEANUP_ENVELOPE_VERSION,
  });
}

function envelopeCiphertext(envelope, keyRing) {
  if (!canonicalCleanupEnvelopeJson(envelope)) return { kind: "invalid" };

  const keyEntry = keyRing.get(envelope.keyId);
  if (!keyEntry) return { kind: "key-unavailable" };
  const ciphertext = decodeCanonicalBase64Url(envelope.ciphertext);
  if (ciphertext?.byteLength !== CLEANUP_RSA_CIPHERTEXT_BYTES) return { kind: "invalid" };
  return { ciphertext, keyEntry, kind: "candidate" };
}

function plaintextCleanupToken(plaintext) {
  if (plaintext.byteLength !== CLEANUP_TOKEN_CHARACTERS) return null;
  for (const byte of plaintext) {
    const isAsciiBase64Url =
      (byte >= 48 && byte <= 57) ||
      (byte >= 65 && byte <= 90) ||
      byte === 95 ||
      (byte >= 97 && byte <= 122) ||
      byte === 45;
    if (!isAsciiBase64Url) return null;
  }
  return String.fromCharCode(...plaintext);
}

// A syntactically valid envelope always produces a digest. Decryption or
// canonical-token failure uses a random digest so the HTTP layer follows the
// same DB control flow. This reduces a direct success/failure oracle; it does
// not claim constant-time behavior across RSA and database implementations.
export async function digestForCleanupEnvelope(envelope, keyRing, cryptoRef = globalThis.crypto) {
  const candidate = envelopeCiphertext(envelope, keyRing);
  if (candidate.kind !== "candidate") return candidate;

  const digestInput = cryptoRef.getRandomValues(new Uint8Array(CLEANUP_TOKEN_BYTES));
  let plaintext = null;
  let tokenBytes = null;
  let decrypted = false;
  try {
    try {
      plaintext = new Uint8Array(
        await cryptoRef.subtle.decrypt(RSA_OAEP_OPERATION, candidate.keyEntry.key, candidate.ciphertext)
      );
    } catch {
      plaintext = null;
    }

    if (plaintext) {
      const token = plaintextCleanupToken(plaintext);
      tokenBytes = token ? decodeCanonicalCleanupToken(token) : null;
      if (tokenBytes) {
        digestInput.set(tokenBytes);
        decrypted = true;
      }
    }

    return { decrypted, digestHex: digestToHex(await sha256(digestInput, cryptoRef)), kind: "digest" };
  } finally {
    candidate.ciphertext.fill(0);
    digestInput.fill(0);
    plaintext?.fill(0);
    tokenBytes?.fill(0);
  }
}

export async function encryptCleanupTokenEnvelope(token, publicJwk, cryptoRef = globalThis.crypto) {
  const tokenBytes = decodeCanonicalCleanupToken(token);
  if (!tokenBytes) throw new Error("PUSH_CLEANUP_TOKEN_INVALID");

  try {
    if (
      !hasExactKeys(publicJwk, ["alg", "e", "ext", "key_ops", "kid", "kty", "n"]) ||
      !hasCanonicalRsaPublicMembers(publicJwk) ||
      publicJwk.alg !== CLEANUP_KEY_ALGORITHM ||
      publicJwk.e !== "AQAB" ||
      publicJwk.ext !== true ||
      !Array.isArray(publicJwk.key_ops) ||
      publicJwk.key_ops.length !== 1 ||
      publicJwk.key_ops[0] !== "encrypt"
    ) {
      throw new Error("PUSH_CLEANUP_PUBLIC_KEY_INVALID");
    }

    const keyId = await rsaJwkThumbprint(publicJwk, cryptoRef);
    const modulus = decodeCanonicalBase64Url(publicJwk.n);
    if (!keyId || publicJwk.kid !== keyId || !modulus || rsaModulusBitLength(modulus) !== CLEANUP_RSA_MODULUS_BITS) {
      throw new Error("PUSH_CLEANUP_PUBLIC_KEY_INVALID");
    }

    const key = await cryptoRef.subtle.importKey("jwk", publicJwk, RSA_OAEP_IMPORT_ALGORITHM, false, ["encrypt"]);
    const plaintext = new TextEncoder().encode(token);
    try {
      const ciphertext = new Uint8Array(await cryptoRef.subtle.encrypt(RSA_OAEP_OPERATION, key, plaintext));
      return {
        ciphertext: encodeBase64Url(ciphertext),
        keyId,
        version: CLEANUP_ENVELOPE_VERSION,
      };
    } finally {
      plaintext.fill(0);
    }
  } finally {
    tokenBytes.fill(0);
  }
}
