import assert from "node:assert/strict";
import test from "node:test";

import { notificationPushPresentation } from "../src/sessionPresentation.ts";

const PRIVATE_MARKERS = Object.freeze([
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "cleanup-secret",
  "consent-secret",
]);

test("legacy Push keeps the existing control and success-prompt rules", () => {
  assert.deepEqual(
    notificationPushPresentation({
      settings: { pushStatus: "idle", webPushConfigured: true },
      source: "legacy",
    }),
    {
      controlDisabled: false,
      controlLabel: "開啟推播",
      hint: "開啟後，只有這個裝置會收到你選擇的通知。",
      showSuccessPrompt: true,
      source: "legacy",
    }
  );
  assert.deepEqual(
    notificationPushPresentation({
      settings: { pushStatus: "enabled", webPushConfigured: true },
      source: "legacy",
    }),
    {
      controlDisabled: true,
      controlLabel: "此裝置已開啟",
      hint: "此裝置已開啟推播通知。",
      showSuccessPrompt: false,
      source: "legacy",
    }
  );
  assert.equal(
    notificationPushPresentation({
      settings: { pushStatus: "denied", webPushConfigured: true },
      source: "legacy",
    }).showSuccessPrompt,
    true
  );
  for (const settings of [
    { pushStatus: "idle", webPushConfigured: false },
    { pushStatus: "unsupported", webPushConfigured: true },
  ]) {
    const presentation = notificationPushPresentation({ settings, source: "legacy" });
    assert.equal(presentation.source, "legacy");
    assert.equal(presentation.controlDisabled, true);
    assert.equal(presentation.showSuccessPrompt, false);
  }
});

test("Push v2 maps all eight storage states without merging their authority", () => {
  const expected = {
    "auth-unverified": {
      action: { kind: "manual-reenable", label: "重新開啟" },
      stateGroup: "auth-unverified",
      statusLabel: "已暫停",
    },
    "cleanup-pending": {
      action: null,
      stateGroup: "cleanup",
      statusLabel: "正在停止舊推播",
    },
    "cleanup-required": {
      action: null,
      stateGroup: "cleanup",
      statusLabel: "正在停止舊推播",
    },
    disabled: {
      action: { kind: "enable", label: "開啟推播" },
      stateGroup: "disabled",
      statusLabel: "尚未開啟",
    },
    enabled: {
      action: null,
      stateGroup: "enabled",
      statusLabel: "本機設定已完成",
    },
    invalid: {
      action: { kind: "contact-support", label: "聯絡支援" },
      stateGroup: "invalid",
      statusLabel: "此裝置的推播資料異常",
    },
    provisioning: {
      action: { kind: "retry-provisioning", label: "繼續開啟" },
      stateGroup: "provisioning",
      statusLabel: "尚未完成開啟",
    },
    unavailable: {
      action: null,
      stateGroup: "unavailable",
      statusLabel: "此裝置目前無法讀取推播設定",
    },
  };

  for (const [kind, summary] of Object.entries(expected)) {
    const presentation = notificationPushPresentation({
      deliveryReady: false,
      source: "v2",
      state: { kind },
    });
    assert.deepEqual(
      {
        action: presentation.action,
        source: presentation.source,
        state: presentation.state,
        stateGroup: presentation.stateGroup,
        statusLabel: presentation.statusLabel,
      },
      { ...summary, source: "v2", state: kind }
    );
  }
});

test("Push v2 enabled copy requires an explicit delivery-ready gate", () => {
  const dormant = notificationPushPresentation({
    deliveryReady: false,
    source: "v2",
    state: { kind: "enabled" },
  });
  assert.equal(dormant.statusLabel, "本機設定已完成");
  assert.match(dormant.hint, /尚未正式啟用/u);
  assert.doesNotMatch(dormant.hint, /已開啟推播通知/u);

  const active = notificationPushPresentation({
    deliveryReady: true,
    source: "v2",
    state: { kind: "enabled" },
  });
  assert.equal(active.statusLabel, "此裝置已開啟");
  assert.equal(active.hint, "此裝置已開啟推播通知。");
});

test("Push v2 presentation drops device, binding, consent, and cleanup details", () => {
  const presentation = notificationPushPresentation({
    deliveryReady: false,
    source: "v2",
    state: {
      binding: {
        authUserId: PRIVATE_MARKERS[0],
        bindingId: PRIVATE_MARKERS[1],
        cleanupToken: PRIVATE_MARKERS[2],
        consent: PRIVATE_MARKERS[3],
      },
      deviceId: PRIVATE_MARKERS[0],
      kind: "enabled",
    },
  });
  const serialized = JSON.stringify(presentation);
  assert.deepEqual(Object.keys(presentation).sort(), [
    "action",
    "hint",
    "source",
    "state",
    "stateGroup",
    "statusLabel",
  ]);
  for (const marker of PRIVATE_MARKERS) assert.doesNotMatch(serialized, new RegExp(marker, "u"));
});

test("invalid offers support only and never exposes a destructive reset action", () => {
  const presentation = notificationPushPresentation({
    deliveryReady: false,
    source: "v2",
    state: { kind: "invalid" },
  });
  assert.deepEqual(presentation.action, { kind: "contact-support", label: "聯絡支援" });
  assert.doesNotMatch(JSON.stringify(presentation), /delete|reset|remove|刪除|重設/iu);
});
