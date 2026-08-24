import assert from "node:assert/strict";
import test from "node:test";

import {
  readPlayType,
  readPlayTypes,
  readProfileSlotCode,
  readProfileSlotCodes,
  readSessionJoinMode,
  readSessionMessageKind,
  readSessionParticipantRole,
  readSessionParticipantStatus,
  readSessionStatus,
  readSessionVenueType,
  readSportCode,
} from "../src/data/mappers/literalGuards.ts";

const CASES = [
  ["SportCode", readSportCode, "tennis", "tennis"],
  ["PlayType", readPlayType, "雙打", "練球"],
  ["SessionStatus", readSessionStatus, "full", "expired"],
  ["SessionJoinMode", readSessionJoinMode, "instant", "approval"],
  ["SessionVenueType", readSessionVenueType, "walk_on", "candidates"],
  ["SessionParticipantRole", readSessionParticipantRole, "host", "guest"],
  ["SessionParticipantStatus", readSessionParticipantStatus, "invited", "withdrawn"],
  ["SessionMessageKind", readSessionMessageKind, "user", "system"],
  ["ProfileSlotCode", readProfileSlotCode, "we-e", null],
];

for (const [name, guard, knownValue, fallback] of CASES) {
  test(`${name} guard accepts a known value and uses its explicit fallback for an unknown value`, () => {
    assert.equal(guard(knownValue), knownValue);
    assert.equal(guard("__unknown__"), fallback);
  });
}

test("array-valued play-type and profile-slot guards omit unknown entries instead of inventing availability", () => {
  assert.deepEqual(readPlayTypes(["單打", "__unknown__", "練球"]), ["單打", "練球"]);
  assert.deepEqual(readProfileSlotCodes(["wd-m", "__unknown__", "we-e"]), ["wd-m", "we-e"]);
});
