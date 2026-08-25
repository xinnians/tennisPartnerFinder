declare const __TENNIS_E2E_TEST_HOOKS__: boolean;

/**
 * The only production-compilable read boundary for browser E2E hooks.
 * Vite replaces the guard with `false` in production so tree-shaking removes
 * both this global property access and every caller's hook-only branch.
 */
export function getE2ETestHooks<Hooks>(): Hooks | undefined {
  if (typeof __TENNIS_E2E_TEST_HOOKS__ !== "undefined" && !__TENNIS_E2E_TEST_HOOKS__) return undefined;
  return (globalThis as typeof globalThis & { __tennisE2ETestHooks?: Hooks }).__tennisE2ETestHooks;
}
