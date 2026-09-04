import {
  canonicalCleanupEnvelopeJson,
  CLEANUP_KEY_ALGORITHM,
  CLEANUP_RSA_CIPHERTEXT_BYTES,
  CLEANUP_RSA_LABEL_TEXT,
  CLEANUP_RSA_MODULUS_BITS,
  CLEANUP_TOKEN_BYTES,
  CLEANUP_TOKEN_CHARACTERS,
  decodeCanonicalBase64Url,
  decodeCanonicalCleanupToken,
  hasCanonicalRsaPublicMembers,
  hasExactKeys,
  rsaJwkThumbprint,
  rsaModulusBitLength,
} from "../_shared/push-cleanup-protocol.js";

export {
  canonicalCleanupEnvelopeJson,
  canonicalCleanupPublicJwkJson,
  canonicalCleanupPublicKeyDocumentJson,
  CLEANUP_ENVELOPE_BYTES,
  CLEANUP_ENVELOPE_VERSION,
  CLEANUP_KEY_ID_BYTES,
  CLEANUP_KEY_ID_CHARACTERS,
  CLEANUP_KEY_ALGORITHM,
  CLEANUP_PUBLIC_KEY_DOCUMENT_VERSION,
  CLEANUP_PUBLIC_KEY_DOCUMENT_BYTES,
  CLEANUP_RSA_CIPHERTEXT_BYTES,
  CLEANUP_RSA_CIPHERTEXT_CHARACTERS,
  CLEANUP_RSA_LABEL_TEXT,
  CLEANUP_RSA_MODULUS_BITS,
  CLEANUP_TOKEN_BYTES,
  CLEANUP_TOKEN_CHARACTERS,
  decodeCanonicalBase64Url,
  decodeCanonicalCleanupToken,
  encodeBase64Url,
  encryptCleanupTokenEnvelope,
  parseCanonicalCleanupPublicJwkJson,
  parseCanonicalCleanupPublicKeyDocument,
  rsaJwkThumbprint,
  validateCleanupPublicJwk,
} from "../_shared/push-cleanup-protocol.js";

export const CLEANUP_KEY_RING_LIMIT = 2;

const RSA_OAEP_IMPORT_ALGORITHM = Object.freeze({ hash: "SHA-256", name: "RSA-OAEP" });
const RSA_OAEP_OPERATION = Object.freeze({
  label: new TextEncoder().encode(CLEANUP_RSA_LABEL_TEXT),
  name: "RSA-OAEP",
});

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
  if (!validPrivateKeyShape(jwk)) throw new Error("PUSH_CLEANUP_KEY_CONFIG_INVALID");

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
