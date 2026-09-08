import { withNotificationDispatcherDatabase } from "../notification-outbox-dispatch/v2-database.ts";
import {
  createDispatcherV2DenoWebPushSender,
  readDispatcherV2DenoWebPushConfig,
} from "../notification-outbox-dispatch/v2-deno-web-push.ts";
import {
  createDispatcherV2LocalMockSender,
  readDispatcherV2LocalMockConfig,
} from "../notification-outbox-dispatch/v2-local-mock.js";
import { runDispatcherV2Batch, safeDispatcherV2RuntimeErrorCode } from "../notification-outbox-dispatch/v2-runtime.js";
import { createDispatcherV2ScheduledEntrypoint } from "./entrypoint.js";

function env(name: string) {
  return Deno.env.get(name) ?? "";
}

Deno.serve(
  createDispatcherV2ScheduledEntrypoint({
    createDenoSender: createDispatcherV2DenoWebPushSender,
    createLocalMockSender: createDispatcherV2LocalMockSender,
    readDenoSenderConfig: readDispatcherV2DenoWebPushConfig,
    readEnvironment: env,
    readLocalMockConfig: readDispatcherV2LocalMockConfig,
    runBatch: runDispatcherV2Batch,
    safeErrorCode: safeDispatcherV2RuntimeErrorCode,
    withDatabase: withNotificationDispatcherDatabase,
  })
);
