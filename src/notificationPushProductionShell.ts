import type {
  AuthVerificationAuthority,
  AuthVerificationFailureNotice,
  VerifiedAuthProof,
} from "./features/profile-auth/authRefreshCoordinator.ts";
import { isUsableAbortSignal, settleAbortableOperation } from "./abortableOperation.ts";
import type { PushSignOutBindingSnapshot } from "./notificationPushSignOutCoordinator.ts";
import type {
  createNotificationPushRuntimeComposition,
  NotificationPushRuntimeComposition,
  NotificationPushRuntimeCompositionOptions,
} from "./notificationPushRuntimeComposition.ts";

type RuntimeFactory = typeof createNotificationPushRuntimeComposition;
type RuntimeModule = { createNotificationPushRuntimeComposition: RuntimeFactory };
type RuntimeOptions = Omit<NotificationPushRuntimeCompositionOptions, "auth">;

type NotificationPushProductionShellOptions =
  | {
      readonly loadRuntime?: () => PromiseLike<RuntimeModule>;
      readonly mode: "disabled";
    }
  | {
      readonly loadRuntime?: () => PromiseLike<RuntimeModule>;
      readonly mode: "enabled";
      readonly runtimeOptions: RuntimeOptions;
    };

export const PUSH_PRODUCTION_SHELL_ERROR_CODES = Object.freeze({
  INVALID_CONFIGURATION: "PUSH_PRODUCTION_SHELL_INVALID_CONFIGURATION",
});

export class NotificationPushProductionShellError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "NotificationPushProductionShellError";
    this.code = code;
  }
}

const IGNORED_RESULT = Object.freeze({ kind: "ignored" } as const);
const COMPLETED_RESULT = Object.freeze({ kind: "completed" } as const);
const PENDING_RESULT = Object.freeze({ kind: "pending" } as const);

function shellError(): NotificationPushProductionShellError {
  return new NotificationPushProductionShellError(PUSH_PRODUCTION_SHELL_ERROR_CODES.INVALID_CONFIGURATION);
}

function validAuthority(value: unknown): value is AuthVerificationAuthority {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const authority = value as Partial<AuthVerificationAuthority>;
  return (
    typeof authority.isVerificationRevisionCurrent === "function" &&
    typeof authority.isVerifiedAuthProofCurrent === "function" &&
    typeof authority.notifyUnauthorized === "function" &&
    typeof authority.readCurrentVerifiedAuthProof === "function" &&
    typeof authority.readVerifiedAuthProof === "function"
  );
}

function validRuntime(value: unknown): value is NotificationPushRuntimeComposition {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const runtime = value as Partial<NotificationPushRuntimeComposition>;
  return Boolean(
    runtime.authCorrelation &&
    typeof runtime.authCorrelation.processAuthFailureNotice === "function" &&
    runtime.manualReenable &&
    typeof runtime.manualReenable.startManualPushReenable === "function" &&
    runtime.signOutCleanup &&
    typeof runtime.signOutCleanup.processCurrentDeviceSignOut === "function" &&
    runtime.storage &&
    typeof runtime.storage.readPushRuntimeState === "function" &&
    runtime.subscriptionCoordinator &&
    typeof runtime.subscriptionCoordinator.enableProvisioning === "function"
  );
}

function validSignOutInput(value: unknown): value is { readonly signal?: AbortSignal } {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length === 0) return true;
  return (
    keys.length === 1 &&
    keys[0] === "signal" &&
    ((value as { signal?: unknown }).signal === undefined ||
      isUsableAbortSignal((value as { signal?: unknown }).signal))
  );
}

function bindingFromRuntimeState(value: unknown, authUserId?: string): PushSignOutBindingSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const state = value as { binding?: unknown; kind?: unknown };
  if (
    state.kind !== "auth-unverified" &&
    state.kind !== "cleanup-required" &&
    state.kind !== "enabled" &&
    state.kind !== "provisioning"
  ) {
    return null;
  }
  if (!state.binding || typeof state.binding !== "object" || Array.isArray(state.binding)) return null;
  const binding = state.binding as { authUserId?: unknown; state?: unknown };
  return typeof binding.authUserId === "string" &&
    (!authUserId || binding.authUserId === authUserId) &&
    binding.state === state.kind
    ? (state.binding as PushSignOutBindingSnapshot)
    : null;
}

function exactKind(value: unknown, kind: string): boolean {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Reflect.ownKeys(value).length === 1 &&
    (value as { kind?: unknown }).kind === kind
  );
}

async function defaultLoadRuntime(): Promise<RuntimeModule> {
  return import("./notificationPushRuntimeComposition.ts");
}

export function createNotificationPushProductionShell(options: NotificationPushProductionShellOptions) {
  if (
    !options ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    (options.mode !== "disabled" && options.mode !== "enabled") ||
    (options.loadRuntime !== undefined && typeof options.loadRuntime !== "function") ||
    (options.mode === "enabled" && (!options.runtimeOptions || typeof options.runtimeOptions !== "object"))
  ) {
    throw shellError();
  }

  const loadRuntime = options.loadRuntime ?? defaultLoadRuntime;
  let authority: AuthVerificationAuthority | null = null;
  let authorityGeneration = 0;
  let loadedModule: Promise<RuntimeModule> | null = null;
  let runtimeRecord: { generation: number; promise: Promise<NotificationPushRuntimeComposition | null> } | null = null;

  function installAuthVerificationAuthority(nextAuthority: AuthVerificationAuthority): void {
    if (!validAuthority(nextAuthority)) throw shellError();
    if (authority === nextAuthority) return;
    authority = nextAuthority;
    authorityGeneration += 1;
    runtimeRecord = null;
  }

  async function readEnabledRuntime(): Promise<NotificationPushRuntimeComposition | null> {
    if (options.mode === "disabled" || !authority) return null;
    if (runtimeRecord?.generation === authorityGeneration) return runtimeRecord.promise;

    const capturedAuthority = authority;
    const capturedGeneration = authorityGeneration;
    const promise = (async () => {
      try {
        loadedModule ??= Promise.resolve(loadRuntime());
        const module = await loadedModule;
        if (
          authority !== capturedAuthority ||
          authorityGeneration !== capturedGeneration ||
          typeof module?.createNotificationPushRuntimeComposition !== "function"
        ) {
          return null;
        }
        const runtime = module.createNotificationPushRuntimeComposition({
          ...options.runtimeOptions,
          auth: capturedAuthority,
        });
        return authority === capturedAuthority && authorityGeneration === capturedGeneration && validRuntime(runtime)
          ? runtime
          : null;
      } catch {
        return null;
      }
    })();
    runtimeRecord = { generation: capturedGeneration, promise };
    return promise;
  }

  async function processAuthVerificationFailure(notice: AuthVerificationFailureNotice) {
    if (options.mode === "disabled") return IGNORED_RESULT;
    const runtime = await readEnabledRuntime();
    if (!runtime) return PENDING_RESULT;
    try {
      return await runtime.authCorrelation.processAuthFailureNotice({ notice });
    } catch {
      return PENDING_RESULT;
    }
  }

  function capturedProofIsCurrent(
    capturedAuthority: AuthVerificationAuthority,
    capturedGeneration: number,
    proof: VerifiedAuthProof
  ): boolean {
    try {
      return (
        authority === capturedAuthority &&
        authorityGeneration === capturedGeneration &&
        capturedAuthority.isVerifiedAuthProofCurrent(proof)
      );
    } catch {
      return false;
    }
  }

  async function processCurrentDeviceSignOut(input?: { readonly signal?: AbortSignal }) {
    if (options.mode === "disabled") return IGNORED_RESULT;
    if (!validSignOutInput(input)) return PENDING_RESULT;
    const signal = input?.signal;
    const capturedAuthority = authority;
    const capturedGeneration = authorityGeneration;
    if (!capturedAuthority) return PENDING_RESULT;

    let proof: VerifiedAuthProof | null;
    try {
      proof = capturedAuthority.readCurrentVerifiedAuthProof();
    } catch {
      return PENDING_RESULT;
    }
    // Explicit sign-out must still close the device when Auth is unavailable.
    // In that case only the captured local binding's cleanup capability is
    // used; a newly verified account arriving during the await invalidates it.
    const contextIsCurrent = () =>
      proof
        ? capturedProofIsCurrent(capturedAuthority, capturedGeneration, proof)
        : authority === capturedAuthority &&
          authorityGeneration === capturedGeneration &&
          capturedAuthority.readCurrentVerifiedAuthProof() === null;
    if (!contextIsCurrent()) return PENDING_RESULT;

    const runtimeResult = await settleAbortableOperation(() => readEnabledRuntime(), signal);
    if (runtimeResult.kind !== "completed" || !runtimeResult.value) return PENDING_RESULT;
    const runtime = runtimeResult.value;
    if (!contextIsCurrent()) return PENDING_RESULT;

    const stateResult = await settleAbortableOperation(() => runtime.storage.readPushRuntimeState(), signal);
    if (stateResult.kind !== "completed") return PENDING_RESULT;
    const binding = bindingFromRuntimeState(stateResult.value, proof?.authUserId);
    if (!binding)
      return contextIsCurrent() && (stateResult.value as { kind?: unknown })?.kind === "disabled"
        ? COMPLETED_RESULT
        : PENDING_RESULT;
    if (!contextIsCurrent()) return PENDING_RESULT;

    const cleanupResult = await settleAbortableOperation(
      () =>
        runtime.signOutCleanup.processCurrentDeviceSignOut({
          authUserId: binding.authUserId,
          binding,
          ...(signal ? { signal } : {}),
        }),
      signal
    );
    if (cleanupResult.kind !== "completed") return PENDING_RESULT;
    return exactKind(cleanupResult.value, "completed") ? COMPLETED_RESULT : PENDING_RESULT;
  }

  return Object.freeze({
    async readState(signal?: AbortSignal) {
      const result = await settleAbortableOperation(async () => {
        const runtime = await readEnabledRuntime();
        return runtime ? runtime.userActions.readState(signal) : { kind: "unavailable" as const };
      }, signal);
      return result.kind === "completed" ? result.value : { kind: "unavailable" as const };
    },
    async enable(signal?: AbortSignal) {
      const result = await settleAbortableOperation(async () => {
        const runtime = await readEnabledRuntime();
        return runtime ? runtime.userActions.enable(signal) : { kind: "unavailable" as const };
      }, signal);
      return result.kind === "completed" ? result.value : { kind: "unavailable" as const };
    },
    installAuthVerificationAuthority,
    processAuthVerificationFailure,
    processCurrentDeviceSignOut,
    readEnabledRuntime,
  });
}
