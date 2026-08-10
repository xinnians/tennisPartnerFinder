import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_FILTER_STATE, isDefaultFilters, countActiveFilters } from "../src/filters.js";

test("isDefaultFilters treats the untouched default state as default", () => {
  assert.equal(isDefaultFilters(DEFAULT_FILTER_STATE), true);
  assert.equal(isDefaultFilters({ ...DEFAULT_FILTER_STATE, types: new Set(), districts: new Set() }), true);
});

test("isDefaultFilters flags a changed dateKey as non-default even though it never moves the badge", () => {
  assert.equal(isDefaultFilters({ ...DEFAULT_FILTER_STATE, dateKey: "weekend" }), false);
});

test("isDefaultFilters flags a changed band as non-default even though it never moves the badge", () => {
  assert.equal(isDefaultFilters({ ...DEFAULT_FILTER_STATE, band: "pro" }), false);
});

test("isDefaultFilters flags instantOnly as non-default even though it never moves the badge", () => {
  assert.equal(isDefaultFilters({ ...DEFAULT_FILTER_STATE, instantOnly: true }), false);
});

test("isDefaultFilters flags an extra Set entry as non-default", () => {
  assert.equal(isDefaultFilters({ ...DEFAULT_FILTER_STATE, types: new Set(["單打"]) }), false);
  assert.equal(isDefaultFilters({ ...DEFAULT_FILTER_STATE, districts: new Set(["大安區"]) }), false);
});

test("isDefaultFilters treats a non-object filters value as default (no filters applied)", () => {
  assert.equal(isDefaultFilters(null), true);
  assert.equal(isDefaultFilters(undefined), true);
});

test("countActiveFilters returns 0 for default state", () => {
  assert.equal(countActiveFilters(DEFAULT_FILTER_STATE), 0);
  assert.equal(countActiveFilters({ ...DEFAULT_FILTER_STATE, types: new Set(), districts: new Set() }), 0);
});

// 批 D4a 拍板:badge N 只計 types+districts 選取數,不含 dateKey/band/instantOnly——
// 這裡直接證明「三者單獨改動時 badge 仍是 0」,不是靠沒測到就當沒問題。
test("countActiveFilters stays 0 when only dateKey/band/instantOnly change (badge excludes them by design)", () => {
  assert.equal(countActiveFilters({ ...DEFAULT_FILTER_STATE, dateKey: "today" }), 0);
  assert.equal(countActiveFilters({ ...DEFAULT_FILTER_STATE, band: "pro" }), 0);
  assert.equal(countActiveFilters({ ...DEFAULT_FILTER_STATE, instantOnly: true }), 0);
  assert.equal(
    countActiveFilters({ ...DEFAULT_FILTER_STATE, dateKey: "weekend", band: "hi", instantOnly: true }),
    0
  );
});

test("countActiveFilters sums selections across types and districts", () => {
  assert.equal(
    countActiveFilters({
      dateKey: "today",
      band: "mid",
      instantOnly: true,
      types: new Set(["單打", "雙打"]),
      districts: new Set(["大安區"]),
    }),
    3
  );
});

test("countActiveFilters returns 0 for non-object filters", () => {
  assert.equal(countActiveFilters(null), 0);
  assert.equal(countActiveFilters(undefined), 0);
});
