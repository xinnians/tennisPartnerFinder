const HOSTED_RUNTIME_MARKERS = Object.freeze(["DENO_DEPLOYMENT_ID", "SB_REGION"]);
const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;
const CANARY_SENDER_ENVIRONMENT = Object.freeze({
  PUSH_PROVIDER_ORIGINS_V1: "NOTIFICATION_DISPATCH_V2_CANARY_PROVIDER_ORIGINS_V1",
  WEB_PUSH_TRANSPORT: "NOTIFICATION_DISPATCH_V2_CANARY_TRANSPORT",
});
const SHARED_VAPID_ENVIRONMENT = new Set([
  "WEB_PUSH_VAPID_PRIVATE_KEY",
  "WEB_PUSH_VAPID_PUBLIC_KEY",
  "WEB_PUSH_VAPID_SUBJECT",
]);

function fixedError(code) {
  return new Error(code);
}

function canonicalPositiveBigint(value) {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/u.test(value)) return false;
  try {
    return BigInt(value) <= POSTGRES_BIGINT_MAX;
  } catch {
    return false;
  }
}

function boundedSecret(value) {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    new TextEncoder().encode(value).byteLength >= 32 &&
    new TextEncoder().encode(value).byteLength <= 256
  );
}

export function dispatcherV2HostedCanaryAccess(readEnvironment) {
  if (typeof readEnvironment !== "function") throw fixedError("DISPATCH_V2_CANARY_CONFIG_INVALID");
  const hostedRuntime = HOSTED_RUNTIME_MARKERS.some((name) => Boolean(readEnvironment(name)));
  const mode = readEnvironment("NOTIFICATION_DISPATCH_V2_CANARY_MODE");
  return Object.freeze({
    enabled: (hostedRuntime && mode === "hosted-manual-canary-v1") || (!hostedRuntime && mode === "local-test-v1"),
    hostedRuntime,
  });
}

export function readDispatcherV2HostedCanaryConfig(readEnvironment) {
  const access = dispatcherV2HostedCanaryAccess(readEnvironment);
  const canarySecret = readEnvironment("NOTIFICATION_DISPATCH_V2_CANARY_SECRET");
  const connectionString = readEnvironment("NOTIFICATION_DISPATCH_V2_CANARY_DATABASE_URL");
  const expectedGeneration = readEnvironment("NOTIFICATION_DISPATCH_V2_CANARY_EXPECTED_GENERATION");
  if (
    !access.enabled ||
    !boundedSecret(canarySecret) ||
    typeof connectionString !== "string" ||
    !connectionString ||
    connectionString !== connectionString.trim() ||
    !canonicalPositiveBigint(expectedGeneration)
  ) {
    throw fixedError("DISPATCH_V2_CANARY_CONFIG_INVALID");
  }
  return Object.freeze({ canarySecret, connectionString, expectedGeneration });
}

export function createDispatcherV2HostedCanarySenderEnvironment(readEnvironment) {
  if (typeof readEnvironment !== "function") throw fixedError("DISPATCH_V2_CANARY_CONFIG_INVALID");
  return Object.freeze((name) => {
    const canaryName = CANARY_SENDER_ENVIRONMENT[name];
    if (canaryName) return readEnvironment(canaryName);
    if (SHARED_VAPID_ENVIRONMENT.has(name)) return readEnvironment(name);
    return "";
  });
}

export function readDispatcherV2HostedCanaryAction(value) {
  if (value === "database-probe" || value === "dispatch") return value;
  return null;
}
