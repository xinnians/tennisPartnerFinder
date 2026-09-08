import assert from "node:assert/strict";
import test from "node:test";

import {
  createNotificationPushOwnerQuarantine,
  NotificationPushOwnerQuarantineError,
  PUSH_OWNER_QUARANTINE_ERROR_CODES,
  PUSH_OWNER_QUARANTINE_RPC_NAME,
} from "../src/notificationPushOwnerQuarantine.ts";

const DEVICE_ID = "2a000000-0000-4000-8000-000000000001";
const CONSENT_EPOCH = "3b000000-0000-4000-8000-000000000001";
const MAX_POSTGRES_BIGINT = "9223372036854775807";

test("construction is dormant and rejects a missing RPC boundary with one fixed error", () => {
  let calls = 0;
  const ownerQuarantine = createNotificationPushOwnerQuarantine({
    rpc: async () => {
      calls += 1;
      throw new Error("must stay dormant");
    },
  });

  assert.equal(typeof ownerQuarantine.quarantineOwnedPushDevice, "function");
  assert.equal(calls, 0);

  assert.throws(
    () => createNotificationPushOwnerQuarantine(),
    (error) => {
      assert.ok(error instanceof NotificationPushOwnerQuarantineError);
      assert.equal(error.code, PUSH_OWNER_QUARANTINE_ERROR_CODES.INVALID_CONFIGURATION);
      return true;
    }
  );

  for (const rpc of [undefined, null, {}, "rpc"]) {
    assert.throws(
      () => createNotificationPushOwnerQuarantine({ rpc }),
      (error) => {
        assert.ok(error instanceof NotificationPushOwnerQuarantineError);
        assert.equal(error.code, PUSH_OWNER_QUARANTINE_ERROR_CODES.INVALID_CONFIGURATION);
        assert.equal(error.message, PUSH_OWNER_QUARANTINE_ERROR_CODES.INVALID_CONFIGURATION);
        return true;
      }
    );
  }
});

test("an exact OK calls the owner RPC once and preserves the maximum bigint as a string", async () => {
  const calls = [];
  const abortController = new AbortController();
  const ownerQuarantine = createNotificationPushOwnerQuarantine({
    rpc: async (functionName, arguments_, signal) => {
      calls.push({ arguments_, functionName, signal });
      return { data: "OK", error: null };
    },
  });

  assert.deepEqual(
    await ownerQuarantine.quarantineOwnedPushDevice({
      consentEpoch: CONSENT_EPOCH,
      consentVersion: MAX_POSTGRES_BIGINT,
      deviceId: DEVICE_ID,
      signal: abortController.signal,
    }),
    { kind: "completed" }
  );
  assert.deepEqual(calls, [
    {
      arguments_: {
        p_consent_epoch: CONSENT_EPOCH,
        p_device_id: DEVICE_ID,
        p_expected_version: MAX_POSTGRES_BIGINT,
      },
      functionName: PUSH_OWNER_QUARANTINE_RPC_NAME,
      signal: abortController.signal,
    },
  ]);
  assert.equal(typeof calls[0].arguments_.p_expected_version, "string");
});

test("an already-aborted signal skips the RPC and a later abort releases a non-cooperative RPC", async () => {
  const alreadyAborted = new AbortController();
  alreadyAborted.abort();
  let calls = 0;
  const skipped = createNotificationPushOwnerQuarantine({
    rpc: async () => {
      calls += 1;
      return { data: "OK", error: null };
    },
  });
  assert.deepEqual(
    await skipped.quarantineOwnedPushDevice({
      consentEpoch: CONSENT_EPOCH,
      consentVersion: "1",
      deviceId: DEVICE_ID,
      signal: alreadyAborted.signal,
    }),
    { kind: "pending" }
  );
  assert.equal(calls, 0);

  const duringRpc = new AbortController();
  let capturedSignal;
  const interrupted = createNotificationPushOwnerQuarantine({
    rpc: (_functionName, _arguments, signal) => {
      calls += 1;
      capturedSignal = signal;
      duringRpc.abort();
      return new Promise(() => {});
    },
  });
  assert.deepEqual(
    await interrupted.quarantineOwnedPushDevice({
      consentEpoch: CONSENT_EPOCH,
      consentVersion: "1",
      deviceId: DEVICE_ID,
      signal: duringRpc.signal,
    }),
    { kind: "pending" }
  );
  assert.equal(calls, 1);
  assert.equal(capturedSignal, duringRpc.signal);
});

test("the exact stale outcome is returned without retrying", async () => {
  let calls = 0;
  const ownerQuarantine = createNotificationPushOwnerQuarantine({
    rpc: async () => {
      calls += 1;
      return { data: "STALE_PUSH_DEVICE", error: null };
    },
  });

  assert.deepEqual(
    await ownerQuarantine.quarantineOwnedPushDevice({
      consentEpoch: CONSENT_EPOCH,
      consentVersion: "1",
      deviceId: DEVICE_ID,
    }),
    { kind: "stale" }
  );
  assert.equal(calls, 1);
});

test("errors and non-exact responses stay pending after exactly one call", async () => {
  const cases = [
    { name: "lowercase alias", response: { data: "ok", error: null } },
    { name: "padded OK", response: { data: "OK ", error: null } },
    { name: "unknown outcome", response: { data: "UNKNOWN", error: null } },
    { name: "RPC error", response: { data: "OK", error: { message: "private database detail" } } },
    { name: "missing error field", response: { data: "OK" } },
    { name: "null response", response: null },
  ];

  for (const { name, response } of cases) {
    let calls = 0;
    const ownerQuarantine = createNotificationPushOwnerQuarantine({
      rpc: async () => {
        calls += 1;
        return response;
      },
    });
    assert.deepEqual(
      await ownerQuarantine.quarantineOwnedPushDevice({
        consentEpoch: CONSENT_EPOCH,
        consentVersion: "1",
        deviceId: DEVICE_ID,
      }),
      { kind: "pending" },
      name
    );
    assert.equal(calls, 1, name);
  }

  let thrownCalls = 0;
  const ownerQuarantine = createNotificationPushOwnerQuarantine({
    rpc: async () => {
      thrownCalls += 1;
      throw new Error(`private failure:${DEVICE_ID}`);
    },
  });
  assert.deepEqual(
    await ownerQuarantine.quarantineOwnedPushDevice({
      consentEpoch: CONSENT_EPOCH,
      consentVersion: "1",
      deviceId: DEVICE_ID,
    }),
    { kind: "pending" }
  );
  assert.equal(thrownCalls, 1);
});

test("invalid UUID or bigint input fails before the RPC with no supplied detail", async () => {
  let calls = 0;
  const ownerQuarantine = createNotificationPushOwnerQuarantine({
    rpc: async () => {
      calls += 1;
      return { data: "OK", error: null };
    },
  });
  const invalidInputs = [
    undefined,
    null,
    {},
    { consentEpoch: CONSENT_EPOCH, consentVersion: "1", deviceId: DEVICE_ID.toUpperCase() },
    { consentEpoch: CONSENT_EPOCH.replace(/.$/u, "z"), consentVersion: "1", deviceId: DEVICE_ID },
    { consentEpoch: CONSENT_EPOCH, consentVersion: 1, deviceId: DEVICE_ID },
    { consentEpoch: CONSENT_EPOCH, consentVersion: "0", deviceId: DEVICE_ID },
    { consentEpoch: CONSENT_EPOCH, consentVersion: "01", deviceId: DEVICE_ID },
    { consentEpoch: CONSENT_EPOCH, consentVersion: "+1", deviceId: DEVICE_ID },
    { consentEpoch: CONSENT_EPOCH, consentVersion: "1.0", deviceId: DEVICE_ID },
    { consentEpoch: CONSENT_EPOCH, consentVersion: "9223372036854775808", deviceId: DEVICE_ID },
    { consentEpoch: CONSENT_EPOCH, consentVersion: "1", deviceId: DEVICE_ID, signal: { aborted: false } },
  ];

  for (const input of invalidInputs) {
    await assert.rejects(ownerQuarantine.quarantineOwnedPushDevice(input), (error) => {
      assert.ok(error instanceof NotificationPushOwnerQuarantineError);
      assert.equal(error.code, PUSH_OWNER_QUARANTINE_ERROR_CODES.INVALID_INPUT);
      assert.equal(error.message, PUSH_OWNER_QUARANTINE_ERROR_CODES.INVALID_INPUT);
      assert.equal(error.message.includes(String(input?.consentVersion)), false);
      return true;
    });
  }
  assert.equal(calls, 0);
});
