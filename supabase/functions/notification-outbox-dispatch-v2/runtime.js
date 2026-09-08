const HOSTED_RUNTIME_MARKERS = Object.freeze(["DENO_DEPLOYMENT_ID", "SB_REGION"]);
const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;
const SENDER_ENVIRONMENT = Object.freeze({
  PUSH_PROVIDER_ORIGINS_V1: "NOTIFICATION_DISPATCH_V2_PROVIDER_ORIGINS_V1",
  PUSH_TEST_URL: "NOTIFICATION_DISPATCH_V2_TEST_URL",
  WEB_PUSH_TRANSPORT: "NOTIFICATION_DISPATCH_V2_TRANSPORT",
});
const SHARED_VAPID_ENVIRONMENT = new Set([
  "WEB_PUSH_VAPID_PRIVATE_KEY",
  "WEB_PUSH_VAPID_PUBLIC_KEY",
  "WEB_PUSH_VAPID_SUBJECT",
]);

export const NOTIFICATION_DISPATCH_V2_HOSTED_RUNTIME_MODE = "hosted-v1";

function fixedError() {
  return new Error("DISPATCH_V2_SCHEDULED_CONFIG_INVALID");
}

function canonicalPositiveBigint(value) {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/u.test(value)) return false;
  try {
    return BigInt(value) <= POSTGRES_BIGINT_MAX;
  } catch {
    return false;
  }
}

function canonicalBatchSize(value) {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= 100 ? parsed : null;
}

function boundedSecret(value) {
  if (typeof value !== "string" || value !== value.trim()) return false;
  const length = new TextEncoder().encode(value).byteLength;
  return length >= 32 && length <= 256;
}

function exactNonempty(value) {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

export function dispatcherV2ScheduledAccess(readEnvironment) {
  if (typeof readEnvironment !== "function") throw fixedError();
  const hostedRuntime = HOSTED_RUNTIME_MARKERS.some((name) => Boolean(readEnvironment(name)));
  const mode = readEnvironment("NOTIFICATION_DISPATCH_V2_RUNTIME_MODE");
  return Object.freeze({
    hostedEnabled: hostedRuntime && mode === NOTIFICATION_DISPATCH_V2_HOSTED_RUNTIME_MODE,
    hostedRuntime,
    localTestEnabled: !hostedRuntime && mode === "local-test-v1",
  });
}

export function readDispatcherV2ScheduledConfig(readEnvironment) {
  const access = dispatcherV2ScheduledAccess(readEnvironment);
  const batchSize = canonicalBatchSize(readEnvironment("NOTIFICATION_DISPATCH_V2_BATCH_SIZE"));
  const connectionString = readEnvironment("NOTIFICATION_DISPATCH_V2_DATABASE_URL");
  const cronSecret = readEnvironment("NOTIFICATION_CRON_SECRET");
  const expectedGeneration = readEnvironment("NOTIFICATION_DISPATCH_V2_EXPECTED_GENERATION");
  if (
    (!access.hostedEnabled && !access.localTestEnabled) ||
    batchSize === null ||
    !exactNonempty(connectionString) ||
    !boundedSecret(cronSecret) ||
    !canonicalPositiveBigint(expectedGeneration)
  ) {
    throw fixedError();
  }
  return Object.freeze({ batchSize, connectionString, cronSecret, expectedGeneration });
}

export function createDispatcherV2ScheduledSenderEnvironment(readEnvironment) {
  const access = dispatcherV2ScheduledAccess(readEnvironment);
  if (!access.hostedEnabled && !access.localTestEnabled) throw fixedError();
  return Object.freeze((name) => {
    const mappedName = SENDER_ENVIRONMENT[name];
    if (mappedName) {
      if (name === "PUSH_TEST_URL" && !access.localTestEnabled) return "";
      return readEnvironment(mappedName);
    }
    if (SHARED_VAPID_ENVIRONMENT.has(name)) return readEnvironment(name);
    return "";
  });
}
