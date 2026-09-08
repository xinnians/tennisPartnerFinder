const HOSTED_RUNTIME_MARKERS = Object.freeze(["DENO_DEPLOYMENT_ID", "SB_REGION"]);
export const PUSH_SUBSCRIPTION_V2_HOSTED_RUNTIME_MODE = "hosted-v1";

export function pushSubscriptionV2RuntimeAccess(readEnvironment) {
  const hostedRuntime = HOSTED_RUNTIME_MARKERS.some((name) => Boolean(readEnvironment(name)));
  const runtimeMode = readEnvironment("PUSH_SUBSCRIPTION_V2_RUNTIME_MODE");
  return {
    hostedEnabled: hostedRuntime && runtimeMode === PUSH_SUBSCRIPTION_V2_HOSTED_RUNTIME_MODE,
    hostedRuntime,
    localTestEnabled: !hostedRuntime && runtimeMode === "local-test-v1",
  };
}
