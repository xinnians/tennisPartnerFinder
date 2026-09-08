import type {
  AuthVerificationAuthority,
  AuthVerificationFailureNotice,
} from "./features/profile-auth/authRefreshCoordinator.ts";
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

  return Object.freeze({
    installAuthVerificationAuthority,
    processAuthVerificationFailure,
    readEnabledRuntime,
  });
}
