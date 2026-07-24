import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyPushStatus,
  safePushPayload,
  toWebPushSubscription,
} from "../supabase/functions/notification-outbox-dispatch/dispatch.js";

test("push payload uses the summary allowlist and removes LINE", () => {
  const payload = safePushPayload({
    court: "大安森林公園網球場",
    line_id: "must-never-leave-the-outbox",
    message: "有人申請加入你的球局。",
    slots_remaining: 2,
    start_at: "2026-08-01T01:00:00.000Z",
    url: "#/session/123",
  });

  assert.deepEqual(payload, {
    court: "大安森林公園網球場",
    message: "有人申請加入你的球局。",
    slots_remaining: 2,
    start_at: "2026-08-01T01:00:00.000Z",
    url: "#/session/123",
  });
  assert.equal("line_id" in payload, false);
});

test("gone push endpoints are removed without retrying the outbox row", () => {
  assert.deepEqual(classifyPushStatus(410), { delivered: false, removeSubscription: true, retry: false });
  assert.deepEqual(classifyPushStatus(404), { delivered: false, removeSubscription: true, retry: false });
});

test("successful and transient push statuses keep distinct outbox outcomes", () => {
  assert.deepEqual(classifyPushStatus(201), { delivered: true, removeSubscription: false, retry: false });
  assert.deepEqual(classifyPushStatus(503), { delivered: false, removeSubscription: false, retry: true });
});

test("flat DB subscription rows are wrapped into the web-push keys shape", () => {
  // 回歸:漏掉 keys 包裝時 web-push 會在發送前拋
  // 「subscription must have 'auth' and 'p256dh' keys」,且因無 statusCode 而被靜默吞掉。
  assert.deepEqual(
    toWebPushSubscription({ auth: "auth-b64u", endpoint: "https://push.example/e1", p256dh: "p256dh-b64u", profile_id: 9 }),
    { endpoint: "https://push.example/e1", keys: { auth: "auth-b64u", p256dh: "p256dh-b64u" } },
  );
  assert.throws(() => toWebPushSubscription({ endpoint: "https://push.example/e1" }), /INVALID_PUSH_SUBSCRIPTION_ROW/);
});
