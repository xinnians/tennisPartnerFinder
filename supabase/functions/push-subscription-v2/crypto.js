import {
  canonicalPushSubscriptionEnvelopeJson,
  canonicalPushSubscriptionInnerJson,
  decodeCanonicalBase64Url,
  hasExactKeys,
  PUSH_SUBSCRIPTION_AES_KEY_BYTES,
  PUSH_SUBSCRIPTION_GCM_TAG_BYTES,
  PUSH_SUBSCRIPTION_KEY_ALGORITHM,
  PUSH_SUBSCRIPTION_RSA_CIPHERTEXT_BYTES,
  PUSH_SUBSCRIPTION_RSA_LABEL_TEXT,
  PUSH_SUBSCRIPTION_RSA_MODULUS_BITS,
  pushSubscriptionAad,
  pushSubscriptionRsaThumbprint,
} from "../_shared/push-subscription-v2-protocol.js";

export const PUSH_SUBSCRIPTION_KEY_RING_LIMIT = 2;

const RSA_IMPORT_ALGORITHM = Object.freeze({ hash: "SHA-256", name: "RSA-OAEP" });
const RSA_DECRYPT_OPERATION = Object.freeze({
  label: new TextEncoder().encode(PUSH_SUBSCRIPTION_RSA_LABEL_TEXT),
  name: "RSA-OAEP",
});

function rsaModulusBitLength(modulus) {
  return (modulus.byteLength - 1) * 8 + 32 - Math.clz32(modulus[0]);
}

function validPrivateJwk(jwk) {
  if (
    !hasExactKeys(jwk, ["alg", "d", "dp", "dq", "e", "ext", "key_ops", "kid", "kty", "n", "p", "q", "qi"]) ||
    jwk.alg !== PUSH_SUBSCRIPTION_KEY_ALGORITHM ||
    jwk.e !== "AQAB" ||
    jwk.ext !== true ||
    jwk.kty !== "RSA" ||
    typeof jwk.kid !== "string" ||
    !Array.isArray(jwk.key_ops) ||
    jwk.key_ops.length !== 1 ||
    jwk.key_ops[0] !== "decrypt"
  ) {
    return false;
  }
  return ["d", "dp", "dq", "e", "n", "p", "q", "qi"].every((name) => {
    const value = decodeCanonicalBase64Url(jwk[name]);
    return Boolean(value?.byteLength && value[0] !== 0);
  });
}

async function importPrivateKey(jwk, cryptoRef) {
  if (!validPrivateJwk(jwk)) throw new Error("PUSH_SUBSCRIPTION_KEY_CONFIG_INVALID");
  const modulus = decodeCanonicalBase64Url(jwk.n);
  if (
    !modulus ||
    rsaModulusBitLength(modulus) !== PUSH_SUBSCRIPTION_RSA_MODULUS_BITS ||
    jwk.kid !== (await pushSubscriptionRsaThumbprint(jwk, cryptoRef))
  ) {
    throw new Error("PUSH_SUBSCRIPTION_KEY_CONFIG_INVALID");
  }
  return cryptoRef.subtle.importKey("jwk", jwk, RSA_IMPORT_ALGORITHM, false, ["decrypt"]);
}

export async function loadPushSubscriptionPrivateKeyRing(serialized, cryptoRef = globalThis.crypto) {
  try {
    const parsed = JSON.parse(serialized);
    if (
      !hasExactKeys(parsed, ["keys"]) ||
      !Array.isArray(parsed.keys) ||
      parsed.keys.length === 0 ||
      parsed.keys.length > PUSH_SUBSCRIPTION_KEY_RING_LIMIT
    ) {
      throw new Error();
    }
    const ring = new Map();
    for (const jwk of parsed.keys) {
      if (ring.has(jwk.kid)) throw new Error();
      ring.set(jwk.kid, await importPrivateKey(jwk, cryptoRef));
    }
    return ring;
  } catch {
    throw new Error("PUSH_SUBSCRIPTION_KEY_CONFIG_INVALID");
  }
}

function decodeOuterEnvelope(envelope) {
  if (!canonicalPushSubscriptionEnvelopeJson(envelope)) return null;
  const encryptedKey = decodeCanonicalBase64Url(envelope.encryptedKey);
  const iv = decodeCanonicalBase64Url(envelope.iv);
  const ciphertext = decodeCanonicalBase64Url(envelope.ciphertext);
  if (
    encryptedKey?.byteLength !== PUSH_SUBSCRIPTION_RSA_CIPHERTEXT_BYTES ||
    !iv ||
    !ciphertext ||
    ciphertext.byteLength < PUSH_SUBSCRIPTION_GCM_TAG_BYTES
  ) {
    return null;
  }
  return { ciphertext, encryptedKey, iv };
}

function wipeDecodedEnvelope(decoded) {
  decoded.ciphertext.fill(0);
  decoded.encryptedKey.fill(0);
  decoded.iv.fill(0);
}

export async function decryptPushSubscriptionEnvelope(
  envelope,
  authUserId,
  providerOrigins,
  keyRing,
  cryptoRef = globalThis.crypto
) {
  const decoded = decodeOuterEnvelope(envelope);
  const aad = pushSubscriptionAad(authUserId);
  if (!decoded) return { kind: "invalid" };
  if (!aad) {
    wipeDecodedEnvelope(decoded);
    return { kind: "invalid" };
  }
  const privateKey = keyRing.get(envelope.keyId);
  if (!privateKey) {
    wipeDecodedEnvelope(decoded);
    aad.fill(0);
    return { kind: "key-unavailable" };
  }

  let aesKeyBytes;
  let plaintextBytes;
  try {
    try {
      aesKeyBytes = new Uint8Array(
        await cryptoRef.subtle.decrypt(RSA_DECRYPT_OPERATION, privateKey, decoded.encryptedKey)
      );
    } catch {
      return { kind: "invalid" };
    }
    if (aesKeyBytes.byteLength !== PUSH_SUBSCRIPTION_AES_KEY_BYTES) return { kind: "invalid" };

    try {
      const aesKey = await cryptoRef.subtle.importKey("raw", aesKeyBytes, "AES-GCM", false, ["decrypt"]);
      plaintextBytes = new Uint8Array(
        await cryptoRef.subtle.decrypt(
          { additionalData: aad, iv: decoded.iv, name: "AES-GCM", tagLength: 128 },
          aesKey,
          decoded.ciphertext
        )
      );
    } catch {
      return { kind: "invalid" };
    }

    let serialized;
    try {
      serialized = new TextDecoder("utf-8", { fatal: true }).decode(plaintextBytes);
    } catch {
      return { kind: "invalid" };
    }
    let payload;
    try {
      payload = JSON.parse(serialized);
    } catch {
      return { kind: "invalid" };
    }
    if ((await canonicalPushSubscriptionInnerJson(payload, providerOrigins, cryptoRef)) !== serialized) {
      return { kind: "invalid" };
    }
    return { kind: "payload", payload };
  } finally {
    aad.fill(0);
    wipeDecodedEnvelope(decoded);
    aesKeyBytes?.fill(0);
    plaintextBytes?.fill(0);
  }
}
