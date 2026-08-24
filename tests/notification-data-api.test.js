import assert from "node:assert/strict";
import test from "node:test";

import { createDataApi } from "../src/dataApi.js";
import {
  defaultNotificationPreferences,
  notificationPreferencesForRead,
  notificationPreferencesForWrite,
} from "../src/notificationPreferences.ts";

test("notification defaults keep read compatibility and explicit-write safety intentionally asymmetric", () => {
  assert.deepEqual(defaultNotificationPreferences(), {
    chatMessageEnabled: true,
    guestInvitedEnabled: true,
    guestRequestReviewedEnabled: true,
    hostNewRequestEnabled: true,
    sessionReminderEnabled: true,
    sessionUpdatedEnabled: true,
  });
  assert.deepEqual(notificationPreferencesForRead({ chatMessageEnabled: false }), {
    ...defaultNotificationPreferences(),
    chatMessageEnabled: false,
  });
  assert.deepEqual(notificationPreferencesForWrite({ chatMessageEnabled: true }), {
    chatMessageEnabled: true,
    guestInvitedEnabled: false,
    guestRequestReviewedEnabled: false,
    hostNewRequestEnabled: false,
    sessionReminderEnabled: false,
    sessionUpdatedEnabled: false,
  });
});

test("notification settings read all six owner-scoped preferences with explicit columns", async () => {
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
                chat_message_enabled: false,
                guest_invited_enabled: false,
                guest_request_reviewed_enabled: true,
                host_new_request_enabled: false,
                session_reminder_enabled: true,
                session_updated_enabled: false,
              },
              error: null,
            }),
          };
        }
        throw new Error(`unexpected notification table: ${table}`);
      },
    },
  });

  assert.deepEqual(await api.loadNotificationPreferences(), {
    chatMessageEnabled: false,
    guestInvitedEnabled: false,
    guestRequestReviewedEnabled: true,
    hostNewRequestEnabled: false,
    sessionReminderEnabled: true,
    sessionUpdatedEnabled: false,
  });
  assert.deepEqual(calls, [
    ["from", "notification_prefs"],
    [
      "select",
      "host_new_request_enabled,guest_request_reviewed_enabled,guest_invited_enabled,session_updated_enabled,chat_message_enabled,session_reminder_enabled",
    ],
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
    chatMessageEnabled: true,
    guestInvitedEnabled: false,
    guestRequestReviewedEnabled: true,
    hostNewRequestEnabled: false,
    sessionReminderEnabled: false,
    sessionUpdatedEnabled: true,
  });

  assert.deepEqual(calls, [
    ["save_push_subscription", { p_auth: "auth", p_endpoint: "https://push.example/one", p_p256dh: "key" }],
    ["remove_push_subscription", { p_endpoint: "https://push.example/one" }],
    [
      "set_notification_prefs",
      {
        p_chat_message_enabled: true,
        p_guest_invited_enabled: false,
        p_guest_request_reviewed_enabled: true,
        p_host_new_request_enabled: false,
        p_session_reminder_enabled: false,
        p_session_updated_enabled: true,
      },
    ],
  ]);
});

test("court subscription reads and writes use the owner-only table and RPC boundaries", async () => {
  const calls = [];
  const api = createDataApi({
    configured: true,
    client: {
      from(table) {
        calls.push(["from", table]);
        return {
          select(columns) {
            calls.push(["select", columns]);
            return this;
          },
          order(column) {
            calls.push(["order", column]);
            return Promise.resolve({ data: [{ court_id: 9 }, { court_id: 12 }], error: null });
          },
        };
      },
      async rpc(name, params) {
        calls.push([name, params]);
        return { data: "OK", error: null };
      },
    },
  });

  assert.deepEqual(await api.loadCourtSubscriptions(), [9, 12]);
  assert.deepEqual(await api.saveCourtSubscriptions(["9", 12, ""]), { outcome: "OK" });
  assert.deepEqual(calls, [
    ["from", "court_subscriptions"],
    ["select", "court_id"],
    ["order", "court_id"],
    ["set_court_subscriptions", { p_court_ids: [9, 12] }],
  ]);
});

test("presence mutation mappers use the migration's p_enabled contract and transient coordinates only", async () => {
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

  await api.setPresenceSharing(true);
  await api.setOpenToGreeting(false);
  await api.updateMyPresence({ lat: 25.067446, lng: 121.596648 });

  assert.deepEqual(calls, [
    ["set_presence_sharing", { p_enabled: true }],
    ["set_open_to_greeting", { p_enabled: false }],
    ["update_my_presence", { p_lat: 25.067446, p_lng: 121.596648 }],
  ]);
});
