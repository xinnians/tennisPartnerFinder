import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_FILTER_STATE,
  countActiveFilters,
  isDefaultFilters,
  isJoinableSession,
  joinableSessionCount,
  sortSessionsForDrawer,
} from "../src/filters.js";

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
  assert.equal(countActiveFilters({ ...DEFAULT_FILTER_STATE, dateKey: "weekend", band: "hi", instantOnly: true }), 0);
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

// 2026-08-17 拍板「降級顯示」:滿員局留在探索面但不得算進「可加入」,排序沉底。
test("isJoinableSession mirrors the detail CTA full semantics", () => {
  assert.equal(isJoinableSession({ status: "open", slotsRemaining: 2 }), true);
  assert.equal(isJoinableSession({ status: "full", slotsRemaining: 0 }), false);
  assert.equal(isJoinableSession({ status: "open", slotsRemaining: 0 }), false);
  // 缺值不可誤判為滿(Number(null)=0 陷阱)。
  assert.equal(isJoinableSession({ status: "open" }), true);
  assert.equal(isJoinableSession({ status: "open", slotsRemaining: null }), true);
});

test("joinableSessionCount excludes full sessions from the joinable count", () => {
  const sessions = [
    { sessionId: 1, status: "open", slotsRemaining: 2 },
    { sessionId: 2, status: "full", slotsRemaining: 0 },
    { sessionId: 3, status: "open", slotsRemaining: 1 },
  ];
  // 掃描集非空且與總數不同,證明計數真的排除了滿員局。
  assert.equal(sessions.length, 3);
  assert.equal(joinableSessionCount(sessions), 2);
  assert.equal(joinableSessionCount([]), 0);
  assert.equal(joinableSessionCount(null), 0);
});

test("sortSessionsForDrawer sinks full sessions below joinable ones regardless of start time", () => {
  const now = new Date("2026-08-17T02:00:00Z");
  const fullEarly = { sessionId: 11, startAt: "2026-08-17T03:00:00Z", status: "full", slotsRemaining: 0 };
  const openLate = { sessionId: 12, startAt: "2026-08-17T09:00:00Z", status: "open", slotsRemaining: 2 };
  const openEarly = { sessionId: 13, startAt: "2026-08-17T05:00:00Z", status: "open", slotsRemaining: 1 };
  const sorted = sortSessionsForDrawer([fullEarly, openLate, openEarly], null, now);
  assert.deepEqual(
    sorted.map((session) => session.sessionId),
    [13, 12, 11],
    "the earliest session is full yet must sort last"
  );
});
