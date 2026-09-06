import assert from "node:assert/strict";
import { Agent as HttpsAgent } from "node:https";
import test from "node:test";

import {
  computePushTtlSeconds,
  createPinnedHttpsAgent,
  createPinnedLookup,
  isPublicNetworkAddress,
  prepareDispatcherEgress,
  resolveDispatcherAddresses,
  validatedPublicDnsResult,
} from "../supabase/functions/notification-outbox-dispatch/v2-egress.js";

const PROVIDER_ORIGIN = "https://updates.push.services.mozilla.com";
const ENDPOINT = `${PROVIDER_ORIGIN}/wpush/v2/example-token`;

function invokeLookup(lookup, hostname, options) {
  return new Promise((resolve) => {
    lookup(hostname, options, (...args) => resolve(args));
  });
}

test("public-address policy rejects private, local, documentation, multicast, and malformed results", () => {
  for (const address of [
    "1.1.1.1",
    "8.8.8.8",
    "192.0.0.9",
    "192.31.196.1",
    "64:ff9b::808:808",
    "2001:1::1",
    "2001:20::1",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
  ]) {
    assert.equal(isPublicNetworkAddress(address, address.includes(":") ? 6 : 4), true, address);
  }

  for (const [address, family] of [
    ["0.0.0.0", 4],
    ["10.0.0.1", 4],
    ["100.64.0.1", 4],
    ["127.0.0.1", 4],
    ["169.254.1.1", 4],
    ["172.16.0.1", 4],
    ["192.0.0.11", 4],
    ["192.0.2.1", 4],
    ["192.168.1.1", 4],
    ["198.18.0.1", 4],
    ["198.51.100.1", 4],
    ["203.0.113.1", 4],
    ["224.0.0.1", 4],
    ["255.255.255.255", 4],
    ["1.2.3", 4],
    ["::", 6],
    ["::1", 6],
    ["64:ff9b:1::1", 6],
    ["100::1", 6],
    ["100:0:0:1::1", 6],
    ["2001::1", 6],
    ["2001:2::1", 6],
    ["2001:10::1", 6],
    ["2001:db8::1", 6],
    ["2002::1", 6],
    ["3fff::1", 6],
    ["fc00::1", 6],
    ["fe80::1", 6],
    ["ff02::1", 6],
    ["not-an-ip", 6],
  ]) {
    assert.equal(isPublicNetworkAddress(address, family), false, address);
  }
});

test("DNS result is exact, non-empty, entirely public, deduplicated, and deterministic", () => {
  assert.deepEqual(validatedPublicDnsResult({ ipv4: ["8.8.8.8", "1.1.1.1", "8.8.8.8"], ipv6: [] }), [
    { address: "1.1.1.1", family: 4 },
    { address: "8.8.8.8", family: 4 },
  ]);
  assert.throws(() => validatedPublicDnsResult({ ipv4: [], ipv6: [] }), /DISPATCH_DNS_RESULT_INVALID/);
  assert.throws(
    () => validatedPublicDnsResult({ ipv4: ["1.1.1.1", "127.0.0.1"], ipv6: [] }),
    /DISPATCH_DNS_RESULT_INVALID/
  );
  assert.throws(
    () => validatedPublicDnsResult({ ipv4: ["1.1.1.1"], ipv6: [], ttl: 60 }),
    /DISPATCH_DNS_RESULT_INVALID/
  );
});

test("resolver asks for both A and AAAA and treats only ENODATA as an absent family", async () => {
  const calls = [];
  assert.deepEqual(
    await resolveDispatcherAddresses("updates.push.services.mozilla.com", {
      resolve4Ref: async (hostname) => {
        calls.push(["A", hostname]);
        return ["1.1.1.1"];
      },
      resolve6Ref: async (hostname) => {
        calls.push(["AAAA", hostname]);
        const error = new Error("not returned");
        error.code = "ENODATA";
        throw error;
      },
    }),
    [{ address: "1.1.1.1", family: 4 }]
  );
  assert.deepEqual(calls, [
    ["A", "updates.push.services.mozilla.com"],
    ["AAAA", "updates.push.services.mozilla.com"],
  ]);

  await assert.rejects(
    resolveDispatcherAddresses("updates.push.services.mozilla.com", {
      resolve4Ref: async () => {
        const error = new Error("hidden resolver detail");
        error.code = "ETIMEOUT";
        throw error;
      },
      resolve6Ref: async () => ["2606:4700:4700::1111"],
    }),
    /DISPATCH_DNS_IPV4_FAILED/
  );
  await assert.rejects(
    resolveDispatcherAddresses("updates.push.services.mozilla.com", {
      resolve4Ref: async () => {
        const error = new Error("not returned");
        error.code = "ENODATA";
        throw error;
      },
      resolve6Ref: async () => {
        const error = new Error("not returned");
        error.code = "ENODATA";
        throw error;
      },
    }),
    /DISPATCH_DNS_RESULT_INVALID/
  );
});

test("pinned lookup never resolves another hostname or an unapproved address family", async () => {
  const addresses = validatedPublicDnsResult({
    ipv4: ["1.1.1.1"],
    ipv6: ["2606:4700:4700::1111"],
  });
  const lookup = createPinnedLookup("updates.push.services.mozilla.com", addresses);

  assert.deepEqual(await invokeLookup(lookup, "updates.push.services.mozilla.com", { family: 4 }), [
    null,
    "1.1.1.1",
    4,
  ]);
  assert.deepEqual(await invokeLookup(lookup, "updates.push.services.mozilla.com", { all: true }), [
    null,
    [
      { address: "1.1.1.1", family: 4 },
      { address: "2606:4700:4700::1111", family: 6 },
    ],
  ]);

  const [hostnameError] = await invokeLookup(lookup, "attacker.invalid", {});
  assert.equal(hostnameError.code, "ENOTFOUND");
  assert.equal(hostnameError.message, "DISPATCH_DNS_PIN_MISMATCH");

  const ipv4Only = createPinnedLookup("updates.push.services.mozilla.com", [{ address: "1.1.1.1", family: 4 }]);
  const [familyError] = await invokeLookup(ipv4Only, "updates.push.services.mozilla.com", { family: 6 });
  assert.equal(familyError.code, "ENOTFOUND");
  assert.equal(familyError.message, "DISPATCH_DNS_FAMILY_UNAVAILABLE");
});

test("pinned HTTPS agent is bounded and carries only the vetted lookup", () => {
  const agent = createPinnedHttpsAgent("updates.push.services.mozilla.com", [{ address: "1.1.1.1", family: 4 }]);
  assert.equal(agent instanceof HttpsAgent, true);
  assert.equal(agent.keepAlive, false);
  assert.equal(agent.maxSockets, 1);
  assert.equal(typeof agent.options.lookup, "function");
});

test("dispatcher egress requires one canonical allowlisted origin and validates every DNS answer", async () => {
  const calls = [];
  const prepared = await prepareDispatcherEgress({
    endpoint: ENDPOINT,
    resolveAddresses: async (hostname) => {
      calls.push(hostname);
      return { ipv4: ["1.1.1.1"], ipv6: ["2606:4700:4700::1111"] };
    },
    serializedProviderOrigins: JSON.stringify([PROVIDER_ORIGIN]),
  });

  assert.deepEqual(calls, ["updates.push.services.mozilla.com"]);
  assert.equal(prepared.endpoint, ENDPOINT);
  assert.equal(prepared.hostname, "updates.push.services.mozilla.com");
  assert.match(prepared.policyDigest, /^[0-9a-f]{64}$/u);
  assert.equal(prepared.agent instanceof HttpsAgent, true);

  await assert.rejects(
    prepareDispatcherEgress({
      endpoint: "https://fcm.googleapis.com/fcm/send/example",
      resolveAddresses: async () => ({ ipv4: ["1.1.1.1"], ipv6: [] }),
      serializedProviderOrigins: JSON.stringify([PROVIDER_ORIGIN]),
    }),
    /DISPATCH_PROVIDER_POLICY_REJECTED/
  );
  await assert.rejects(
    prepareDispatcherEgress({
      endpoint: ENDPOINT,
      resolveAddresses: async () => ({ ipv4: ["1.1.1.1", "127.0.0.1"], ipv6: [] }),
      serializedProviderOrigins: JSON.stringify([PROVIDER_ORIGIN]),
    }),
    /DISPATCH_DNS_RESULT_INVALID/
  );
  await assert.rejects(
    prepareDispatcherEgress({
      endpoint: ENDPOINT,
      resolveAddresses: async () => ({ ipv4: ["1.1.1.1"], ipv6: [] }),
      serializedProviderOrigins: "[]",
    }),
    /PUSH_PROVIDER_POLICY_INVALID/
  );
});

test("TTL uses DB time and subtracts both request deadline and safety budget without guessing values", () => {
  assert.equal(
    computePushTtlSeconds({
      databaseNowMs: 1_000,
      expiresAtMs: 12_999,
      requestDeadlineMs: 2_000,
      safetyBudgetMs: 3_000,
    }),
    6
  );
  assert.equal(
    computePushTtlSeconds({
      databaseNowMs: 10_000,
      expiresAtMs: 12_000,
      requestDeadlineMs: 1_000,
      safetyBudgetMs: 1_000,
    }),
    0
  );
  assert.equal(
    computePushTtlSeconds({
      databaseNowMs: 10_000,
      expiresAtMs: 9_000,
      requestDeadlineMs: 0,
      safetyBudgetMs: 0,
    }),
    0
  );
  assert.throws(
    () =>
      computePushTtlSeconds({
        databaseNowMs: 1_000,
        expiresAtMs: 2_000,
        requestDeadlineMs: -1,
        safetyBudgetMs: 0,
      }),
    /DISPATCH_TTL_INPUT_INVALID/
  );
});
