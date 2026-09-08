import assert from "node:assert/strict";
import test from "node:test";

import {
  createNotificationPushOwnerQuarantineRpc,
  NotificationPushOwnerQuarantineRpcAdapterError,
  PUSH_OWNER_QUARANTINE_RPC_ADAPTER_ERROR_CODES,
} from "../src/notificationPushOwnerQuarantineRpc.ts";
import { PUSH_OWNER_QUARANTINE_RPC_NAME } from "../src/notificationPushOwnerQuarantine.ts";

const ARGUMENTS = Object.freeze({
  p_consent_epoch: "11111111-1111-4111-8111-111111111111",
  p_device_id: "22222222-2222-4222-8222-222222222222",
  p_expected_version: "9223372036854775807",
});

function thenable(response, calls) {
  return {
    abortSignal(signal) {
      calls.push(["abort-signal", signal]);
      return Promise.resolve(response);
    },
    then(resolve, reject) {
      calls.push("then");
      return Promise.resolve(response).then(resolve, reject);
    },
  };
}

test("the exact RPC adapter is dormant and attaches the supplied signal to the PostgREST builder", async () => {
  const calls = [];
  const response = { data: "OK", error: null };
  const rpc = createNotificationPushOwnerQuarantineRpc({
    client: {
      rpc(functionName, arguments_) {
        calls.push(["rpc", functionName, arguments_]);
        return thenable(response, calls);
      },
    },
  });
  assert.deepEqual(calls, []);

  const abortController = new AbortController();
  assert.equal(await rpc(PUSH_OWNER_QUARANTINE_RPC_NAME, ARGUMENTS, abortController.signal), response);
  assert.deepEqual(calls, [
    ["rpc", PUSH_OWNER_QUARANTINE_RPC_NAME, ARGUMENTS],
    ["abort-signal", abortController.signal],
  ]);
});

test("the adapter leaves a no-signal request on the same builder", async () => {
  const calls = [];
  const response = { data: "STALE_PUSH_DEVICE", error: null };
  const rpc = createNotificationPushOwnerQuarantineRpc({
    client: {
      rpc: () => thenable(response, calls),
    },
  });

  assert.equal(await rpc(PUSH_OWNER_QUARANTINE_RPC_NAME, ARGUMENTS), response);
  assert.deepEqual(calls, ["then"]);
});

test("malformed clients, builders, function names, and signals fail with one fixed error", async () => {
  for (const options of [undefined, null, {}, { client: {} }]) {
    assert.throws(
      () => createNotificationPushOwnerQuarantineRpc(options),
      (error) =>
        error instanceof NotificationPushOwnerQuarantineRpcAdapterError &&
        error.code === PUSH_OWNER_QUARANTINE_RPC_ADAPTER_ERROR_CODES.INVALID_CONFIGURATION
    );
  }

  const rpc = createNotificationPushOwnerQuarantineRpc({ client: { rpc: () => ({}) } });
  for (const call of [
    () => rpc("other_rpc", ARGUMENTS),
    () => rpc(PUSH_OWNER_QUARANTINE_RPC_NAME, ARGUMENTS, { aborted: false }),
    () => rpc(PUSH_OWNER_QUARANTINE_RPC_NAME, ARGUMENTS),
  ]) {
    assert.throws(call, NotificationPushOwnerQuarantineRpcAdapterError);
  }
});
