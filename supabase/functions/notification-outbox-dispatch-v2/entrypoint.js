import {
  createDispatcherV2ScheduledSenderEnvironment,
  dispatcherV2ScheduledAccess,
  readDispatcherV2ScheduledConfig,
} from "./runtime.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      pragma: "no-cache",
      "x-content-type-options": "nosniff",
    },
    status,
  });
}

function unavailableResponse() {
  return json({ error: "DISPATCH_V2_UNAVAILABLE" }, 503);
}

const unavailableHandler = () => unavailableResponse();

export function createDispatcherV2ScheduledEntrypoint({
  createDenoSender,
  createLocalMockSender,
  readDenoSenderConfig,
  readEnvironment,
  readLocalMockConfig,
  runBatch,
  safeErrorCode,
  withDatabase,
} = {}) {
  if (typeof readEnvironment !== "function") return unavailableHandler;

  let access;
  let runtimeConfig;
  try {
    access = dispatcherV2ScheduledAccess(readEnvironment);
    if (!access.hostedEnabled && !access.localTestEnabled) return unavailableHandler;
    runtimeConfig = readDispatcherV2ScheduledConfig(readEnvironment);
    if (
      typeof createDenoSender !== "function" ||
      typeof createLocalMockSender !== "function" ||
      typeof readDenoSenderConfig !== "function" ||
      typeof readLocalMockConfig !== "function" ||
      typeof runBatch !== "function" ||
      typeof safeErrorCode !== "function" ||
      typeof withDatabase !== "function"
    ) {
      return unavailableHandler;
    }
  } catch {
    return unavailableHandler;
  }

  return async function dispatchV2ScheduledRequest(request) {
    if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
    if (request.headers.get("x-notification-cron-secret") !== runtimeConfig.cronSecret) {
      return json({ error: "UNAUTHORIZED" }, 401);
    }

    try {
      const senderEnvironment = createDispatcherV2ScheduledSenderEnvironment(readEnvironment);
      const localMock = access.localTestEnabled && senderEnvironment("WEB_PUSH_TRANSPORT") === "mock";
      let senderPromise;
      const sendPrepared = async (prepared) => {
        senderPromise ??= localMock
          ? createLocalMockSender(readLocalMockConfig(senderEnvironment))
          : createDenoSender(readDenoSenderConfig(senderEnvironment));
        const sender = await senderPromise;
        return sender(prepared);
      };
      const result = await withDatabase({
        connectionString: runtimeConfig.connectionString,
        operation: (database) =>
          runBatch({
            batchSize: runtimeConfig.batchSize,
            database,
            expectedGeneration: runtimeConfig.expectedGeneration,
            sendPrepared,
          }),
      });
      return json(result);
    } catch (error) {
      return json({ error: safeErrorCode(error) }, 500);
    }
  };
}
