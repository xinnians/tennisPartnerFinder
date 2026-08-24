import type { ControllerApi } from "../controllerContracts.ts";
import type { createSessionController } from "../sessionController.js";

type FactoryResult = ReturnType<typeof createSessionController>;
type MissingControllerKeys = Exclude<keyof ControllerApi, keyof FactoryResult>;
type ExtraControllerKeys = Exclude<keyof FactoryResult, keyof ControllerApi>;

/**
 * Compile-only bridge from the JavaScript assembly factory to the strict TS
 * public contract. The empty exact-key record fails when either surface drifts;
 * returning the factory result verifies every inferred method signature.
 */
export function typecheckControllerApi(controller: FactoryResult): ControllerApi {
  const missingKeys: Record<MissingControllerKeys, never> = {};
  const extraKeys: Record<ExtraControllerKeys, never> = {};
  void missingKeys;
  void extraKeys;
  return controller;
}
