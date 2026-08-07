import assert from "node:assert/strict";
import { test } from "node:test";

import { canReceiveFocus, shouldReleasePendingMeFocus } from "../src/meFocus.js";

/** 以最小替身模擬 root，只需要 contains 語意。 */
function fakeRoot(...contained) {
  const members = new Set(contained);
  return { contains: (node) => members.has(node) };
}

test("焦點移到 root 外的控制項時釋放待還原目標", () => {
  const outside = { id: "map-tab" };
  assert.equal(shouldReleasePendingMeFocus(fakeRoot(), outside), true);
});

test("焦點仍在 root 內移動時保留待還原目標", () => {
  const inside = { id: "presence-sharing-toggle" };
  assert.equal(shouldReleasePendingMeFocus(fakeRoot(inside), inside), false);
});

test("焦點被 disable 踢到 body（relatedTarget 為 null）時釋放待還原目標", () => {
  assert.equal(shouldReleasePendingMeFocus(fakeRoot(), null), true);
});

test("relatedTarget 為 undefined 時視同離開", () => {
  assert.equal(shouldReleasePendingMeFocus(fakeRoot(), undefined), true);
});

test("root 不存在時釋放，不得因缺 root 而永久保留殘值", () => {
  const outside = { id: "map-tab" };
  assert.equal(shouldReleasePendingMeFocus(null, outside), true);
});

test("root 存在但沒有 contains 方法時釋放，不得因 root 不完整而保留殘值", () => {
  const outside = { id: "map-tab" };
  assert.equal(shouldReleasePendingMeFocus({}, outside), true);
});

test("收合後仍在 DOM 的控件不能當還原目標", () => {
  assert.equal(canReceiveFocus({ checkVisibility: () => false }), false);
});

test("可見且未停用的控件可以接住焦點", () => {
  assert.equal(canReceiveFocus({ checkVisibility: () => true }), true);
});

test("停用的控件不能接住焦點，即使可見", () => {
  assert.equal(canReceiveFocus({ checkVisibility: () => true, disabled: true }), false);
});

test("沒有 checkVisibility 的環境退回 offsetParent 判定", () => {
  assert.equal(canReceiveFocus({ offsetParent: null }), false);
  assert.equal(canReceiveFocus({ offsetParent: {} }), true);
});

test("null 目標不能接住焦點", () => {
  assert.equal(canReceiveFocus(null), false);
});
