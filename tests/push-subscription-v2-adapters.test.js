import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { encodeBase64Url } from "../supabase/functions/_shared/push-cleanup-protocol.js";
import { pushSubscriptionRsaThumbprint } from "../supabase/functions/_shared/push-subscription-v2-protocol.js";
import { createPushSubscriptionV2RuntimePorts } from "../supabase/functions/push-subscription-v2/adapters.js";
import { pushSubscriptionV2RuntimeAccess } from "../supabase/functions/push-subscription-v2/runtime.js";

const SUPABASE_URL = "https://project.supabase.co";
const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const BINDING_ID = "22222222-2222-4222-8222-222222222222";
const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const CONSENT = Object.freeze({
  consentEpoch: "44444444-4444-4444-8444-444444444444",
  consentId: "41",
  consentVersion: "7",
});
const SUBSCRIPTION = Object.freeze({ auth: "auth-key", endpoint: "https://push.example/send", p256dh: "p256dh-key" });

async function generateRsaPrivateJwk() {
  const pair = await crypto.subtle.generateKey(
    {
      hash: "SHA-256",
      modulusLength: 2048,
      name: "RSA-OAEP",
      publicExponent: new Uint8Array([1, 0, 1]),
    },
    true,
    ["encrypt", "decrypt"]
  );
  const [publicJwk, privateJwk] = await Promise.all([
    crypto.subtle.exportKey("jwk", pair.publicKey),
    crypto.subtle.exportKey("jwk", pair.privateKey),
  ]);
  const kid = await pushSubscriptionRsaThumbprint(publicJwk);
  return { ...privateJwk, kid };
}

const privateJwk = await generateRsaPrivateJwk();
const environment = new Map([
  ["PUSH_PROVIDER_ORIGINS_V1", '["https://push.example"]'],
  ["PUSH_SUBSCRIPTION_V2_PRIVATE_JWKS_JSON", JSON.stringify({ keys: [privateJwk] })],
  ["SUPABASE_ANON_KEY", "public-project-key"],
  ["SUPABASE_SERVICE_ROLE_KEY", "service-role-key"],
  ["SUPABASE_URL", SUPABASE_URL],
  ["WEB_PUSH_VAPID_PUBLIC_KEY", encodeBase64Url(new Uint8Array(65).fill(4))],
]);

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json; charset=utf-8" },
    status,
  });
}

function ports(fetchRef, source = environment) {
  return createPushSubscriptionV2RuntimePorts({
    fetchRef,
    localTestEnabled: true,
    readEnvironment: (name) => source.get(name) ?? "",
  });
}

test("runtime access permits only the exact local mode without hosted markers", () => {
  const access = (values) => pushSubscriptionV2RuntimeAccess((name) => values[name] ?? "");
  assert.deepEqual(access({ PUSH_SUBSCRIPTION_V2_RUNTIME_MODE: "local-test-v1" }), {
    hostedRuntime: false,
    localTestEnabled: true,
  });
  assert.deepEqual(access({ PUSH_SUBSCRIPTION_V2_RUNTIME_MODE: "local-test-v1", SB_REGION: "local" }), {
    hostedRuntime: true,
    localTestEnabled: false,
  });
  assert.deepEqual(access({ PUSH_SUBSCRIPTION_V2_RUNTIME_MODE: "enabled" }), {
    hostedRuntime: false,
    localTestEnabled: false,
  });
});

test("the Edge entrypoint owns authoritative Auth, stays hosted-disabled, and has no logging", () => {
  const directory = new URL("../supabase/functions/push-subscription-v2/", import.meta.url);
  const sources = ["adapters.js", "handler.js", "index.ts", "runtime.js"].map((name) =>
    readFileSync(new URL(name, directory), "utf8")
  );
  const [adaptersSource, handlerSource, indexSource, runtimeSource] = sources;
  const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");

  assert.match(adaptersSource, /\/auth\/v1\/user/u);
  assert.match(adaptersSource, /enable_push_device_v2/u);
  assert.match(adaptersSource, /refresh_push_transport_v2/u);
  assert.match(indexSource, /pushSubscriptionV2RuntimeAccess/u);
  assert.match(indexSource, /if \(!localTestEnabled\)/u);
  assert.match(runtimeSource, /DENO_DEPLOYMENT_ID/u);
  assert.match(runtimeSource, /SB_REGION/u);
  assert.match(config, /\[functions\.push-subscription-v2\]\nverify_jwt = false/u);
  assert.doesNotMatch(`${adaptersSource}\n${handlerSource}\n${indexSource}\n${runtimeSource}`, /\bconsole\./u);
  assert.doesNotMatch(indexSource, /PUSH_PROVIDER_ORIGINS_V1\s*\|\||WEB_PUSH_VAPID_PUBLIC_KEY\s*\|\|/u);
});

test("Auth adapter performs one authoritative user lookup and never treats an API key as identity", async () => {
  const calls = [];
  const runtimePorts = ports(async (url, init) => {
    calls.push({ init, url });
    return jsonResponse({ aud: "authenticated", id: AUTH_USER_ID, role: "authenticated" });
  });
  assert.deepEqual(await runtimePorts.verifyUser("private-user-jwt"), {
    authUserId: AUTH_USER_ID,
    kind: "verified",
  });
  assert.deepEqual(calls, [
    {
      init: {
        headers: {
          accept: "application/json",
          apikey: "public-project-key",
          authorization: "Bearer private-user-jwt",
        },
        method: "GET",
        redirect: "error",
      },
      url: `${SUPABASE_URL}/auth/v1/user`,
    },
  ]);
});

test("Auth adapter distinguishes rejected credentials from dependency and response drift", async () => {
  for (const [fetchRef, expected] of [
    [async () => jsonResponse({ message: "invalid" }, 401), { kind: "rejected" }],
    [async () => jsonResponse({ message: "forbidden" }, 403), { kind: "rejected" }],
    [async () => jsonResponse({ message: "offline" }, 503), { kind: "unavailable" }],
    [async () => new Response("not-json", { status: 200 }), { kind: "unavailable" }],
    [async () => Promise.reject(new Error("network")), { kind: "unavailable" }],
  ]) {
    assert.deepEqual(await ports(fetchRef).verifyUser("private-user-jwt"), expected);
  }
});

test("enable adapter maps the exact domain command to the service-role-only RPC", async () => {
  const calls = [];
  const expected = { bindingId: BINDING_ID, kind: "committed", version: 1 };
  const runtimePorts = ports(async (url, init) => {
    calls.push({ init, url });
    return jsonResponse(expected);
  });
  const result = await runtimePorts.enableCommand({
    authUserId: AUTH_USER_ID,
    bindingId: BINDING_ID,
    cleanupTokenHash: "a".repeat(64),
    deviceId: DEVICE_ID,
    predecessor: CONSENT,
    subscription: SUBSCRIPTION,
    vapidFingerprint: "b".repeat(64),
  });
  assert.deepEqual(result, expected);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${SUPABASE_URL}/rest/v1/rpc/enable_push_device_v2`);
  assert.deepEqual(calls[0].init.headers, {
    accept: "application/json",
    apikey: "service-role-key",
    "content-type": "application/json",
  });
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    p_auth: SUBSCRIPTION.auth,
    p_auth_user_id: AUTH_USER_ID,
    p_cleanup_token_hash_hex: "a".repeat(64),
    p_client_binding_id: BINDING_ID,
    p_device_id: DEVICE_ID,
    p_endpoint: SUBSCRIPTION.endpoint,
    p_p256dh: SUBSCRIPTION.p256dh,
    p_predecessor_consent_epoch: CONSENT.consentEpoch,
    p_predecessor_consent_id: CONSENT.consentId,
    p_predecessor_consent_version: CONSENT.consentVersion,
    p_vapid_fingerprint_hex: "b".repeat(64),
  });
});

test("refresh adapter maps exact CAS fields and accepts the new secret-key bundle", async () => {
  const source = new Map(environment);
  source.delete("SUPABASE_SERVICE_ROLE_KEY");
  source.set("SUPABASE_SECRET_KEYS", JSON.stringify({ default: "sb_secret_current" }));
  const calls = [];
  const runtimePorts = ports(async (url, init) => {
    calls.push({ init, url });
    return jsonResponse({ kind: "stale", version: 1 });
  }, source);
  assert.deepEqual(
    await runtimePorts.refreshCommand({
      authUserId: AUTH_USER_ID,
      bindingId: BINDING_ID,
      deviceId: DEVICE_ID,
      expectedConsent: CONSENT,
      subscription: SUBSCRIPTION,
      vapidFingerprint: "b".repeat(64),
    }),
    { kind: "stale", version: 1 }
  );
  assert.equal(calls[0].url, `${SUPABASE_URL}/rest/v1/rpc/refresh_push_transport_v2`);
  assert.equal(calls[0].init.headers.apikey, "sb_secret_current");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    p_auth: SUBSCRIPTION.auth,
    p_auth_user_id: AUTH_USER_ID,
    p_client_binding_id: BINDING_ID,
    p_device_id: DEVICE_ID,
    p_endpoint: SUBSCRIPTION.endpoint,
    p_expected_consent_epoch: CONSENT.consentEpoch,
    p_expected_consent_id: CONSENT.consentId,
    p_expected_consent_version: CONSENT.consentVersion,
    p_p256dh: SUBSCRIPTION.p256dh,
    p_vapid_fingerprint_hex: "b".repeat(64),
  });
});

test("runtime loaders are dormant, key-ring aware, and fail closed on RPC or service configuration drift", async () => {
  let fetches = 0;
  const runtimePorts = ports(async () => {
    fetches += 1;
    return jsonResponse({ kind: "committed", version: 1 });
  });
  assert.equal(runtimePorts.loadProviderPolicy(), '["https://push.example"]');
  assert.equal(runtimePorts.loadServerVapidPublicKey(), environment.get("WEB_PUSH_VAPID_PUBLIC_KEY"));
  assert.equal((await runtimePorts.loadKeyRing()).size, 1);
  assert.equal(await runtimePorts.loadKeyRing(), await runtimePorts.loadKeyRing());
  assert.equal(fetches, 0);

  const unavailable = ports(async () => jsonResponse({ error: "not exposed" }, 404));
  await assert.rejects(
    unavailable.enableCommand({
      authUserId: AUTH_USER_ID,
      bindingId: BINDING_ID,
      cleanupTokenHash: "a".repeat(64),
      deviceId: DEVICE_ID,
      predecessor: null,
      subscription: SUBSCRIPTION,
      vapidFingerprint: "b".repeat(64),
    }),
    /COMMAND_UNAVAILABLE/u
  );

  const invalidSource = new Map(environment);
  invalidSource.set("SUPABASE_URL", `${SUPABASE_URL}/rest/v1`);
  await assert.rejects(
    ports(async () => jsonResponse({}), invalidSource).refreshCommand({
      authUserId: AUTH_USER_ID,
      bindingId: BINDING_ID,
      deviceId: DEVICE_ID,
      expectedConsent: CONSENT,
      subscription: SUBSCRIPTION,
      vapidFingerprint: "b".repeat(64),
    }),
    /SERVICE_CONFIG_REQUIRED/u
  );
});
