export const CLEANUP_ENVELOPE_VERSION = 1;
export const CLEANUP_KEY_ID_BYTES = 32;
export const CLEANUP_KEY_ID_CHARACTERS = Math.ceil((CLEANUP_KEY_ID_BYTES * 8) / 6);
export const CLEANUP_KEY_ALGORITHM = "RSA-OAEP-256";
export const CLEANUP_PUBLIC_KEY_DOCUMENT_BYTES = 499;
export const CLEANUP_PUBLIC_KEY_DOCUMENT_VERSION = 1;
export const CLEANUP_PUBLIC_KEY_PATH = "/push-cleanup-key-v1.json";
export const CLEANUP_RSA_LABEL_TEXT = "qiuka.tw/push-cleanup-token/v1";
export const CLEANUP_RSA_MODULUS_BITS = 2048;
export const CLEANUP_RSA_CIPHERTEXT_BYTES = CLEANUP_RSA_MODULUS_BITS / 8;
export const CLEANUP_RSA_CIPHERTEXT_CHARACTERS = Math.ceil((CLEANUP_RSA_CIPHERTEXT_BYTES * 8) / 6);
export const CLEANUP_ENVELOPE_BYTES = new TextEncoder().encode(
  JSON.stringify({
    ciphertext: "A".repeat(CLEANUP_RSA_CIPHERTEXT_CHARACTERS),
    keyId: "A".repeat(CLEANUP_KEY_ID_CHARACTERS),
    version: CLEANUP_ENVELOPE_VERSION,
  })
).byteLength;
export const CLEANUP_TOKEN_BYTES = 32;
export const CLEANUP_TOKEN_CHARACTERS = 43;

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const CLEANUP_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const RSA_OAEP_IMPORT_ALGORITHM = Object.freeze({ hash: "SHA-256", name: "RSA-OAEP" });
const RSA_OAEP_OPERATION = Object.freeze({
  label: new TextEncoder().encode(CLEANUP_RSA_LABEL_TEXT),
  name: "RSA-OAEP",
});

export function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function hasExactKeys(value, expectedKeys) {
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

async function sha256(bytes, cryptoRef) {
  return new Uint8Array(await cryptoRef.subtle.digest("SHA-256", bytes));
}

export function hasCanonicalRsaPublicMembers(jwk) {
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

export function rsaModulusBitLength(modulus) {
  const firstByteBits = 32 - Math.clz32(modulus[0]);
  return (modulus.byteLength - 1) * 8 + firstByteBits;
}

function exactPublicKeyShape(publicJwk) {
  return (
    hasExactKeys(publicJwk, ["alg", "e", "ext", "key_ops", "kid", "kty", "n"]) &&
    hasCanonicalRsaPublicMembers(publicJwk) &&
    publicJwk.alg === CLEANUP_KEY_ALGORITHM &&
    publicJwk.e === "AQAB" &&
    publicJwk.ext === true &&
    Array.isArray(publicJwk.key_ops) &&
    publicJwk.key_ops.length === 1 &&
    publicJwk.key_ops[0] === "encrypt" &&
    typeof publicJwk.kid === "string"
  );
}

export async function validateCleanupPublicJwk(publicJwk, cryptoRef = globalThis.crypto) {
  if (!exactPublicKeyShape(publicJwk)) throw new Error("PUSH_CLEANUP_PUBLIC_KEY_INVALID");

  const keyId = await rsaJwkThumbprint(publicJwk, cryptoRef);
  const modulus = decodeCanonicalBase64Url(publicJwk.n);
  if (!keyId || publicJwk.kid !== keyId || !modulus || rsaModulusBitLength(modulus) !== CLEANUP_RSA_MODULUS_BITS) {
    throw new Error("PUSH_CLEANUP_PUBLIC_KEY_INVALID");
  }

  return publicJwk;
}

function normalizedPublicJwk(publicJwk) {
  return {
    alg: CLEANUP_KEY_ALGORITHM,
    e: publicJwk.e,
    ext: true,
    key_ops: ["encrypt"],
    kid: publicJwk.kid,
    kty: "RSA",
    n: publicJwk.n,
  };
}

export async function canonicalCleanupPublicJwkJson(publicJwk, cryptoRef = globalThis.crypto) {
  await validateCleanupPublicJwk(publicJwk, cryptoRef);
  return JSON.stringify(normalizedPublicJwk(publicJwk));
}

export async function parseCanonicalCleanupPublicJwkJson(serializedPublicJwk, cryptoRef = globalThis.crypto) {
  if (typeof serializedPublicJwk !== "string" || serializedPublicJwk.length === 0) {
    throw new Error("PUSH_CLEANUP_PUBLIC_KEY_INVALID");
  }

  try {
    const publicJwk = JSON.parse(serializedPublicJwk);
    const canonical = await canonicalCleanupPublicJwkJson(publicJwk, cryptoRef);
    if (canonical !== serializedPublicJwk) throw new Error("PUSH_CLEANUP_PUBLIC_KEY_INVALID");
    return publicJwk;
  } catch {
    throw new Error("PUSH_CLEANUP_PUBLIC_KEY_INVALID");
  }
}

export async function canonicalCleanupPublicKeyDocumentJson(publicJwk, cryptoRef = globalThis.crypto) {
  await validateCleanupPublicJwk(publicJwk, cryptoRef);
  return JSON.stringify({
    key: normalizedPublicJwk(publicJwk),
    version: CLEANUP_PUBLIC_KEY_DOCUMENT_VERSION,
  });
}

export async function parseCanonicalCleanupPublicKeyDocument(serializedDocument, cryptoRef = globalThis.crypto) {
  if (typeof serializedDocument !== "string" || serializedDocument.length === 0) {
    throw new Error("PUSH_CLEANUP_PUBLIC_KEY_DOCUMENT_INVALID");
  }

  try {
    const document = JSON.parse(serializedDocument);
    if (!hasExactKeys(document, ["key", "version"]) || document.version !== CLEANUP_PUBLIC_KEY_DOCUMENT_VERSION) {
      throw new Error("PUSH_CLEANUP_PUBLIC_KEY_DOCUMENT_INVALID");
    }
    const canonical = await canonicalCleanupPublicKeyDocumentJson(document.key, cryptoRef);
    if (canonical !== serializedDocument) throw new Error("PUSH_CLEANUP_PUBLIC_KEY_DOCUMENT_INVALID");
    return document.key;
  } catch {
    throw new Error("PUSH_CLEANUP_PUBLIC_KEY_DOCUMENT_INVALID");
  }
}

function exactEnvelopeShape(envelope) {
  return hasExactKeys(envelope, ["ciphertext", "keyId", "version"]);
}

function validKeyId(value) {
  const decoded = decodeCanonicalBase64Url(value);
  return decoded?.byteLength === CLEANUP_KEY_ID_BYTES;
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

export async function encryptCleanupTokenEnvelope(token, publicJwk, cryptoRef = globalThis.crypto) {
  const tokenBytes = decodeCanonicalCleanupToken(token);
  if (!tokenBytes) throw new Error("PUSH_CLEANUP_TOKEN_INVALID");

  try {
    await validateCleanupPublicJwk(publicJwk, cryptoRef);
    const key = await cryptoRef.subtle.importKey("jwk", publicJwk, RSA_OAEP_IMPORT_ALGORITHM, false, ["encrypt"]);
    const plaintext = new TextEncoder().encode(token);
    try {
      const ciphertext = new Uint8Array(await cryptoRef.subtle.encrypt(RSA_OAEP_OPERATION, key, plaintext));
      try {
        return {
          ciphertext: encodeBase64Url(ciphertext),
          keyId: publicJwk.kid,
          version: CLEANUP_ENVELOPE_VERSION,
        };
      } finally {
        ciphertext.fill(0);
      }
    } finally {
      plaintext.fill(0);
    }
  } finally {
    tokenBytes.fill(0);
  }
}
