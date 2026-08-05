import assert from "node:assert/strict";
import test from "node:test";

import { taipeiLocalDateTimeToIso, validateCreateSessionInput, validateUpdateSessionInput } from "../src/sessionViews.js";

test("create form converts datetime-local as Asia/Taipei instead of the browser timezone", () => {
  assert.equal(taipeiLocalDateTimeToIso("2026-07-18T09:30"), "2026-07-18T01:30:00.000Z");
  assert.equal(taipeiLocalDateTimeToIso("2026-07-18T09:30:15.125"), "2026-07-18T01:30:15.125Z");
  assert.equal(taipeiLocalDateTimeToIso("2026-12-01T00:05"), "2026-11-30T16:05:00.000Z");
});

test("create form rejects an over-five-minute past time, invalid NTRP steps, reversed ranges, and oversized notes", () => {
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
  assert.match(result.errors.startAtLocal, /5 分鐘/);
  assert.match(result.errors.ntrpMin, /0.5/);
  assert.match(result.errors.slotsTotal, /1 到 3/);
  assert.match(result.errors.notes, /500/);
});

test("create form accepts a now-start time and the five-minute clock-skew grace", () => {
  const base = {
    courtId: "8",
    ntrpMax: "",
    ntrpMin: "",
    notes: "",
    playType: "單打",
    slotsTotal: "1",
  };
  const options = { now: new Date("2026-07-17T02:00:00.000Z") };

  assert.equal(validateCreateSessionInput({ ...base, startAtLocal: "2026-07-17T10:00" }, options).valid, true);
  assert.equal(validateCreateSessionInput({ ...base, startAtLocal: "2026-07-17T09:55" }, options).valid, true);
  const tooOld = validateCreateSessionInput({ ...base, startAtLocal: "2026-07-17T09:54" }, options);
  assert.equal(tooOld.valid, false);
  assert.match(tooOld.errors.startAtLocal, /5 分鐘/);
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
    candidateCourtIds: null,
    courtId: 8,
    feeNote: null,
    joinMode: "instant",
    ntrpMax: 4,
    ntrpMin: 3.5,
    notes: "自備新球",
    playType: "雙打",
    rangeEnd: null,
    slotsTotal: 2,
    startAt: "2026-07-18T01:30:00.000Z",
    venueType: "booked",
  });
});

test("joinMode 預設 instant 且只接受合法值", () => {
  const base = { courtId: "101", playType: "單打", slotsTotal: "1", startAtLocal: "2099-07-18T09:30", notes: "" };
  assert.equal(validateCreateSessionInput(base).value.joinMode, "instant");
  assert.equal(validateCreateSessionInput({ ...base, joinMode: "instant" }).value.joinMode, "instant");
  const invalid = validateCreateSessionInput({ ...base, joinMode: "bogus" });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.errors.joinMode, "請選擇加入方式。");
});

test("booked and walk-on creation keep candidate-only fields null while preserving the shared fee note", () => {
  const base = {
    courtId: "101",
    feeNote: "每人 150 元，現場平分",
    playType: "雙打",
    slotsTotal: "3",
    startAtLocal: "2099-07-18T09:30",
  };

  for (const venueType of ["booked", "walk_on"]) {
    const result = validateCreateSessionInput({ ...base, venueType });
    assert.equal(result.valid, true, `${venueType} should be valid`);
    assert.deepEqual(result.value, {
      candidateCourtIds: null,
      courtId: 101,
      feeNote: "每人 150 元，現場平分",
      joinMode: "instant",
      ntrpMax: null,
      ntrpMin: null,
      notes: null,
      playType: "雙打",
      rangeEnd: null,
      slotsTotal: 3,
      startAt: "2099-07-18T01:30:00.000Z",
      venueType,
    });
  }
});

test("candidate creation preserves two and three selected courts as arrays and converts the Taipei range end", () => {
  const base = {
    candidateCourtIds: ["101", "102"],
    feeNote: "",
    playType: "單打",
    rangeEndLocal: "2099-07-18T12:00",
    slotsTotal: "1",
    startAtLocal: "2099-07-18T09:30",
    venueType: "candidates",
  };

  const twoCourts = validateCreateSessionInput(base);
  assert.equal(twoCourts.valid, true);
  assert.deepEqual(twoCourts.value.candidateCourtIds, [101, 102]);
  assert.equal(twoCourts.value.courtId, null);
  assert.equal(twoCourts.value.rangeEnd, "2099-07-18T04:00:00.000Z");

  const threeCourts = validateCreateSessionInput({ ...base, candidateCourtIds: ["101", "102", "103"] });
  assert.equal(threeCourts.valid, true);
  assert.deepEqual(threeCourts.value.candidateCourtIds, [101, 102, 103]);
});

test("candidate creation rejects one, four, duplicate, invalid courts and a non-increasing range", () => {
  const base = {
    candidateCourtIds: ["101", "102"],
    playType: "單打",
    rangeEndLocal: "2099-07-18T12:00",
    slotsTotal: "1",
    startAtLocal: "2099-07-18T09:30",
    venueType: "candidates",
  };

  for (const candidateCourtIds of [["101"], ["101", "102", "103", "104"], ["101", "101"], ["101", "bogus"]]) {
    const result = validateCreateSessionInput({ ...base, candidateCourtIds });
    assert.equal(result.valid, false, JSON.stringify(candidateCourtIds));
    assert.match(result.errors.candidateCourtIds, /2 到 3 座台北市球場|不可重複/);
  }

  const invalidRange = validateCreateSessionInput({ ...base, rangeEndLocal: base.startAtLocal });
  assert.equal(invalidRange.valid, false);
  assert.match(invalidRange.errors.rangeEndLocal, /晚於範圍起點/);
});

test("single-court venue types reject candidate-only values and all shared text fields stay within 500 characters", () => {
  const result = validateCreateSessionInput({
    candidateCourtIds: ["101", "102"],
    courtId: "101",
    feeNote: "x".repeat(501),
    notes: "y".repeat(501),
    playType: "單打",
    rangeEndLocal: "2099-07-18T12:00",
    slotsTotal: "1",
    startAtLocal: "2099-07-18T09:30",
    venueType: "walk_on",
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.candidateCourtIds, /只有候選局/);
  assert.match(result.errors.rangeEndLocal, /只有候選局/);
  assert.match(result.errors.feeNote, /500/);
  assert.match(result.errors.notes, /500/);
});

test("session editing validates the nine-field RPC shape without venue type or join mode", () => {
  const result = validateUpdateSessionInput({
    courtId: "102",
    feeNote: "每人 200",
    notes: "帶新球",
    ntrpMax: "4.0",
    ntrpMin: "3.0",
    playType: "雙打",
    slotsMissing: "3",
    startAtLocal: "2099-07-18T09:30",
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.value, {
    courtId: 102,
    feeNote: "每人 200",
    notes: "帶新球",
    ntrpMax: 4,
    ntrpMin: 3,
    playType: "雙打",
    slotsMissing: 3,
    startAt: "2099-07-18T01:30:00.000Z",
  });
  assert.equal("venueType" in result.value, false);
  assert.equal("joinMode" in result.value, false);
});
