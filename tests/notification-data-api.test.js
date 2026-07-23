import assert from "node:assert/strict";
import test from "node:test";

import { createDataApi } from "../src/dataApi.js";

test("notification settings read owner-scoped preferences and districts with explicit columns", async () => {
  const calls = [];
  const api = createDataApi({
    configured: true,
    client: {
      from(table) {
        calls.push(["from", table]);
        if (table === "notification_prefs") {
          return {
            select(columns) {
              calls.push(["select", columns]);
              return this;
            },
            maybeSingle: async () => ({
              data: {
                guest_invited_enabled: false,
                guest_request_reviewed_enabled: true,
                host_new_request_enabled: false,
              },
              error: null,
            }),
          };
        }
        return {
          order(column) {
            calls.push(["order", column]);
            return Promise.resolve({ data: [{ district: "大安區" }, { district: "內湖區" }], error: null });
          },
          select(columns) {
            calls.push(["select", columns]);
            return this;
          },
        };
      },
    },
  });

  assert.deepEqual(await api.loadNotificationPreferences(), {
    guestInvitedEnabled: false,
    guestRequestReviewedEnabled: true,
    hostNewRequestEnabled: false,
  });
  assert.deepEqual(await api.loadDistrictSubscriptions(), ["大安區", "內湖區"]);
  assert.deepEqual(calls, [
    ["from", "notification_prefs"],
    ["select", "host_new_request_enabled,guest_request_reviewed_enabled,guest_invited_enabled"],
    ["from", "district_subscriptions"],
    ["select", "district"],
    ["order", "district"],
  ]);
});

test("notification mutation mappers use only the approved RPC contracts", async () => {
  const calls = [];
  const api = createDataApi({
    configured: true,
    client: {
      async rpc(name, params) {
        calls.push([name, params]);
        return { data: "OK", error: null };
      },
    },
  });

  await api.savePushSubscription({ endpoint: "https://push.example/one", keys: { auth: "auth", p256dh: "key" } });
  await api.removePushSubscription("https://push.example/one");
  await api.saveNotificationPreferences({
    guestInvitedEnabled: false,
    guestRequestReviewedEnabled: true,
    hostNewRequestEnabled: false,
  });
  await api.saveDistrictSubscriptions(["大安區", "大安區", "內湖區"]);

  assert.deepEqual(calls, [
    ["save_push_subscription", { p_auth: "auth", p_endpoint: "https://push.example/one", p_p256dh: "key" }],
    ["remove_push_subscription", { p_endpoint: "https://push.example/one" }],
    [
      "set_notification_prefs",
      {
        p_guest_invited_enabled: false,
        p_guest_request_reviewed_enabled: true,
        p_host_new_request_enabled: false,
      },
    ],
    ["set_district_subscriptions", { p_districts: ["大安區", "內湖區"] }],
  ]);
});
