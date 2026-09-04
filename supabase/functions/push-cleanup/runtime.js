// Local Edge Runtime also creates SB_EXECUTION_ID per invocation. Hosted
// Supabase additionally exposes deployment and region identifiers, so only
// those two values can distinguish hosted from the verified local runtime.
const HOSTED_RUNTIME_MARKERS = Object.freeze(["DENO_DEPLOYMENT_ID", "SB_REGION"]);

export function exactHttpOrigin(value) {
  if (typeof value !== "string" || !value) return "";
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return "";
    return value === url.origin ? value : "";
  } catch {
    return "";
  }
}

export function cleanupRuntimeAccess(readEnvironment) {
  const hostedRuntime = HOSTED_RUNTIME_MARKERS.some((name) => Boolean(readEnvironment(name)));
  const runtimeMode = readEnvironment("PUSH_CLEANUP_RUNTIME_MODE");
  return {
    hostedLimiterCanaryEnabled: hostedRuntime && runtimeMode === "hosted-limiter-canary-v1",
    hostedRuntime,
    localTestEnabled: !hostedRuntime && runtimeMode === "local-test-v1",
  };
}
