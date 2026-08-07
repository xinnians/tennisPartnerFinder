import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_FILTER_STATE, isDefaultFilters } from "../src/filters.js";

test("isDefaultFilters treats the untouched default state as default", () => {
  assert.equal(isDefaultFilters(DEFAULT_FILTER_STATE), true);
  assert.equal(isDefaultFilters({ ...DEFAULT_FILTER_STATE, types: new Set(), venueTypes: new Set() }), true);
});

test("isDefaultFilters flags a changed scalar field as non-default", () => {
  assert.equal(isDefaultFilters({ ...DEFAULT_FILTER_STATE, district: "大安區" }), false);
});

test("isDefaultFilters flags an extra Set entry as non-default", () => {
  assert.equal(
    isDefaultFilters({ ...DEFAULT_FILTER_STATE, types: new Set(["單打"]) }),
    false
  );
});

test("isDefaultFilters treats a non-object filters value as default (no filters applied)", () => {
  assert.equal(isDefaultFilters(null), true);
  assert.equal(isDefaultFilters(undefined), true);
});
