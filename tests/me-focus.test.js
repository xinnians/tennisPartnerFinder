import assert from "node:assert/strict";
import { test } from "node:test";

import { canReceiveFocus } from "../src/meFocus.js";

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
