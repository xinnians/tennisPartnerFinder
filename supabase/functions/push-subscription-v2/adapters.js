import { loadPushSubscriptionPrivateKeyRing } from "./crypto.js";
import { createPushSubscriptionV2Ports } from "./ports.js";

function configuredSupabaseUrl(readEnvironment, localTestEnabled) {
  const value = readEnvironment("SUPABASE_URL");
  if (typeof value !== "string" || !value) throw new Error("PUSH_SUBSCRIPTION_SERVICE_CONFIG_REQUIRED");
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "https:" && (!localTestEnabled || url.protocol !== "http:")) ||
      url.username ||
      url.password ||
      url.origin !== value
    ) {
      throw new Error();
    }
    return value;
  } catch {
    throw new Error("PUSH_SUBSCRIPTION_SERVICE_CONFIG_REQUIRED");
  }
}

function configuredAuthApiKey(readEnvironment) {
  const value = readEnvironment("SUPABASE_ANON_KEY");
  if (typeof value !== "string" || !value) throw new Error("PUSH_SUBSCRIPTION_AUTH_CONFIG_REQUIRED");
  return value;
}

function configuredServiceKey(readEnvironment) {
  const serialized = readEnvironment("SUPABASE_SECRET_KEYS");
  if (serialized) {
    try {
      const keys = JSON.parse(serialized);
      if (typeof keys.default === "string" && keys.default) return keys.default;
    } catch {
      throw new Error("PUSH_SUBSCRIPTION_SERVICE_CONFIG_REQUIRED");
    }
    throw new Error("PUSH_SUBSCRIPTION_SERVICE_CONFIG_REQUIRED");
  }
  const legacy = readEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  if (typeof legacy === "string" && legacy) return legacy;
  throw new Error("PUSH_SUBSCRIPTION_SERVICE_CONFIG_REQUIRED");
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function parseJsonResponse(response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.split(";", 1)[0].trim().toLowerCase() !== "application/json") throw new Error();
  return response.json();
}

export function createPushSubscriptionV2RuntimePorts({
  cryptoRef = globalThis.crypto,
  fetchRef = globalThis.fetch,
  localTestEnabled = false,
  readEnvironment,
}) {
  if (
    !cryptoRef?.subtle ||
    typeof fetchRef !== "function" ||
    typeof localTestEnabled !== "boolean" ||
    typeof readEnvironment !== "function"
  ) {
    throw new Error("PUSH_SUBSCRIPTION_RUNTIME_PORTS_INVALID_CONFIGURATION");
  }

  let keyRingSource = "";
  let keyRingPromise = null;
  function loadKeyRing() {
    const serialized = readEnvironment("PUSH_SUBSCRIPTION_V2_PRIVATE_JWKS_JSON");
    if (!keyRingPromise || serialized !== keyRingSource) {
      keyRingSource = serialized;
      keyRingPromise = loadPushSubscriptionPrivateKeyRing(serialized, cryptoRef);
    }
    return keyRingPromise;
  }

  async function verifyUser(accessToken) {
    let response;
    try {
      const supabaseUrl = configuredSupabaseUrl(readEnvironment, localTestEnabled);
      response = await fetchRef(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          accept: "application/json",
          apikey: configuredAuthApiKey(readEnvironment),
          authorization: `Bearer ${accessToken}`,
        },
        method: "GET",
        redirect: "error",
      });
    } catch {
      return { kind: "unavailable" };
    }
    if (response.status === 401 || response.status === 403) return { kind: "rejected" };
    if (response.status !== 200) return { kind: "unavailable" };
    try {
      const user = await parseJsonResponse(response);
      return isRecord(user) && typeof user.id === "string"
        ? { authUserId: user.id, kind: "verified" }
        : { kind: "unavailable" };
    } catch {
      return { kind: "unavailable" };
    }
  }

  async function invokeCommand(name, body) {
    const supabaseUrl = configuredSupabaseUrl(readEnvironment, localTestEnabled);
    const response = await fetchRef(`${supabaseUrl}/rest/v1/rpc/${name}`, {
      body: JSON.stringify(body),
      headers: {
        accept: "application/json",
        apikey: configuredServiceKey(readEnvironment),
        "content-type": "application/json",
      },
      method: "POST",
      redirect: "error",
    });
    if (response.status !== 200) throw new Error("PUSH_SUBSCRIPTION_COMMAND_UNAVAILABLE");
    return parseJsonResponse(response);
  }

  return createPushSubscriptionV2Ports({
    enableCommand: (input) =>
      invokeCommand("enable_push_device_v2", {
        p_auth: input.subscription.auth,
        p_auth_user_id: input.authUserId,
        p_cleanup_token_hash_hex: input.cleanupTokenHash,
        p_client_binding_id: input.bindingId,
        p_device_id: input.deviceId,
        p_endpoint: input.subscription.endpoint,
        p_p256dh: input.subscription.p256dh,
        p_predecessor_consent_epoch: input.predecessor?.consentEpoch ?? null,
        p_predecessor_consent_id: input.predecessor?.consentId ?? null,
        p_predecessor_consent_version: input.predecessor?.consentVersion ?? null,
        p_vapid_fingerprint_hex: input.vapidFingerprint,
      }),
    loadKeyRing,
    loadProviderPolicy: () => readEnvironment("PUSH_PROVIDER_ORIGINS_V1"),
    loadServerVapidPublicKey: () => readEnvironment("WEB_PUSH_VAPID_PUBLIC_KEY"),
    refreshCommand: (input) =>
      invokeCommand("refresh_push_transport_v2", {
        p_auth: input.subscription.auth,
        p_auth_user_id: input.authUserId,
        p_client_binding_id: input.bindingId,
        p_device_id: input.deviceId,
        p_endpoint: input.subscription.endpoint,
        p_expected_consent_epoch: input.expectedConsent.consentEpoch,
        p_expected_consent_id: input.expectedConsent.consentId,
        p_expected_consent_version: input.expectedConsent.consentVersion,
        p_p256dh: input.subscription.p256dh,
        p_vapid_fingerprint_hex: input.vapidFingerprint,
      }),
    verifyUser,
  });
}
