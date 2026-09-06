const HOSTED_RUNTIME_MARKERS = Object.freeze(["DENO_DEPLOYMENT_ID", "SB_REGION"]);

export function pushSubscriptionV2RuntimeAccess(readEnvironment) {
  const hostedRuntime = HOSTED_RUNTIME_MARKERS.some((name) => Boolean(readEnvironment(name)));
  return {
    hostedRuntime,
    localTestEnabled: !hostedRuntime && readEnvironment("PUSH_SUBSCRIPTION_V2_RUNTIME_MODE") === "local-test-v1",
  };
}
