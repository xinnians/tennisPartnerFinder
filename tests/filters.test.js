import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_FILTER_STATE, isDefaultFilters, countActiveFilters } from "../src/filters.js";

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

test("countActiveFilters returns 0 for default state", () => {
  assert.equal(countActiveFilters(DEFAULT_FILTER_STATE), 0);
  assert.equal(countActiveFilters({ ...DEFAULT_FILTER_STATE, types: new Set(), venueTypes: new Set() }), 0);
});

test("countActiveFilters counts active filters: district+date = 2", () => {
  assert.equal(
    countActiveFilters({ ...DEFAULT_FILTER_STATE, district: "大安區", date: "2026-08-07" }),
    2
  );
});

test("countActiveFilters counts all six active filters", () => {
  assert.equal(
    countActiveFilters({
      district: "大安區",
      courtId: 123,
      date: "2026-08-07",
      band: "mid",
      types: new Set(["單打"]),
      venueTypes: new Set(["booked"]),
    }),
    6
  );
});

test("countActiveFilters returns 0 for non-object filters", () => {
  assert.equal(countActiveFilters(null), 0);
  assert.equal(countActiveFilters(undefined), 0);
});
