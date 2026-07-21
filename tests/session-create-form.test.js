import assert from "node:assert/strict";
import test from "node:test";

import { taipeiLocalDateTimeToIso, validateCreateSessionInput } from "../src/sessionViews.js";

test("create form converts datetime-local as Asia/Taipei instead of the browser timezone", () => {
  assert.equal(taipeiLocalDateTimeToIso("2026-07-18T09:30"), "2026-07-18T01:30:00.000Z");
  assert.equal(taipeiLocalDateTimeToIso("2026-12-01T00:05"), "2026-11-30T16:05:00.000Z");
});

test("create form rejects invalid future time, NTRP steps, reversed ranges, and oversized notes", () => {
  const result = validateCreateSessionInput(
    {
      courtId: "8",
      ntrpMax: "3.0",
      ntrpMin: "3.25",
      notes: "x".repeat(501),
      playType: "單打",
      slotsTotal: "4",
      startAtLocal: "2026-07-17T09:30",
    },
    { now: new Date("2026-07-17T02:00:00.000Z") }
  );

  assert.equal(result.valid, false);
  assert.match(result.errors.startAtLocal, /未來/);
  assert.match(result.errors.ntrpMin, /0.5/);
  assert.match(result.errors.slotsTotal, /1 到 3/);
  assert.match(result.errors.notes, /500/);
});

test("create form accepts legal optional NTRP endpoints and produces the RPC-safe payload", () => {
  const result = validateCreateSessionInput(
    {
      courtId: "8",
      ntrpMax: "4.0",
      ntrpMin: "3.5",
      notes: "自備新球",
      playType: "雙打",
      slotsTotal: "2",
      startAtLocal: "2026-07-18T09:30",
    },
    { now: new Date("2026-07-17T02:00:00.000Z") }
  );

  assert.equal(result.valid, true);
  assert.deepEqual(result.value, {
    courtId: 8,
    joinMode: "approval",
    ntrpMax: 4,
    ntrpMin: 3.5,
    notes: "自備新球",
    playType: "雙打",
    slotsTotal: 2,
    startAt: "2026-07-18T01:30:00.000Z",
  });
});

test("joinMode 預設 approval 且只接受合法值", () => {
  const base = { courtId: "101", playType: "單打", slotsTotal: "1", startAtLocal: "2099-07-18T09:30", notes: "" };
  assert.equal(validateCreateSessionInput(base).value.joinMode, "approval");
  assert.equal(validateCreateSessionInput({ ...base, joinMode: "instant" }).value.joinMode, "instant");
  const invalid = validateCreateSessionInput({ ...base, joinMode: "bogus" });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.errors.joinMode, "請選擇加入方式。");
});
