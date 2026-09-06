const HOSTED_RUNTIME_MARKERS = Object.freeze(["DENO_DEPLOYMENT_ID", "SB_REGION"]);

export function dispatcherV2CanaryRuntimeAccess(readEnvironment) {
  if (typeof readEnvironment !== "function") throw new Error("DISPATCH_CANARY_RUNTIME_INVALID");
  const hostedRuntime = HOSTED_RUNTIME_MARKERS.some((name) => Boolean(readEnvironment(name)));
  return Object.freeze({
    hostedRuntime,
    localTestEnabled: !hostedRuntime && readEnvironment("DISPATCH_V2_CANARY_RUNTIME_MODE") === "local-test-v1",
  });
}
