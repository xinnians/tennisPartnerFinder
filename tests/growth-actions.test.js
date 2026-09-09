import assert from "node:assert/strict";
import test from "node:test";
import { createSessionDraft as repeatSessionDraft } from "../src/features/session-lifecycle/repeatSessionDraft.ts";
import { sessionShareSummary } from "../src/features/share/sessionShareSummary.ts";
import {
  createSessionFormCanPublish,
  createSessionFormRawInput,
  validateCreateSessionInput,
} from "../src/views/sessionFormViews.js";

const source = {
  sessionId: 42,
  courtId: 8,
  court: "台北測試球場",
  startAt: "2099-01-02T12:00:00.000Z",
  playType: "對拉",
  ntrpMin: 2.5,
  ntrpMax: 3.5,
  slotsTotal: 2,
  slotsRemaining: 1,
  joinMode: "approval",
  venueType: "booked",
  status: "open",
  decidedAt: "",
  notes: "原局備註",
  feeNote: "現場分攤",
  viewerRole: "host",
};

test("repeat draft requires a new date/time, resets booking and preserves the exact range and editable text", () => {
  const draft = repeatSessionDraft(source, [8]);
  assert.equal(draft.court, 8);
  assert.equal(draft.booked, false);
  assert.equal(draft.type, "練球");
  assert.equal(draft.need, 2);
  assert.equal(draft.instant, false);
  assert.equal(draft.note, source.notes);
  assert.equal(draft.feeNote, source.feeNote);
  assert.equal(createSessionFormCanPublish(draft), false);
  assert.equal(createSessionFormCanPublish({ ...draft, time: "20:00" }), false);
  const selected = { ...draft, dateKey: "custom", customDate: "2099-01-09", time: "20:00" };
  assert.equal(createSessionFormCanPublish(selected), true);
  const raw = createSessionFormRawInput(selected);
  const result = validateCreateSessionInput(raw);
  assert.equal(result.valid, true);
  assert.equal(result.value.startAt, "2099-01-09T12:00:00.000Z");
  assert.equal(result.value.venueType, "walk_on");
  assert.equal(result.value.ntrpMin, 2.5);
  assert.equal(result.value.ntrpMax, 3.5);
  assert.equal(createSessionFormRawInput({ ...selected, band: "any" }).ntrpMin, "");
  for (const forbidden of ["sessionId", "startAt", "participants", "hostNickname", "viewerRole"]) {
    assert.equal(Object.hasOwn(draft, forbidden), false);
  }
});

test("repeat draft requires unavailable and undecided candidate courts to be reselected", () => {
  assert.equal(repeatSessionDraft(source, []).court, null);
  const candidate = repeatSessionDraft({ ...source, venueType: "candidates", candidateCourtIds: [8, 9] }, [8, 9]);
  assert.equal(candidate.mode, "cand");
  assert.deepEqual(candidate.candCourts, {});
  assert.equal(createSessionFormCanPublish({ ...candidate, dateKey: "tomorrow", slot: "evening" }), false);
  assert.equal(repeatSessionDraft({ ...source, venueType: "candidates", decidedAt: source.startAt }, [8]).court, 8);
});

test("share summary uses public activity fields and retains Taipei time and the stable link", () => {
  const summary = sessionShareSummary(
    {
      ...source,
      notes: "private-note",
      feeNote: "private-fee",
      hostNickname: "private-name",
      profileId: "private-id",
      roster: ["private-roster"],
    },
    "https://qiuka.tw/#/session/42"
  );
  assert.match(summary, /2099-01-02 20:00（台北時間）/);
  assert.match(summary, /NTRP 2\.5–3\.5 · 缺 1 位/);
  assert.match(summary, /已訂場/);
  assert.ok(summary.endsWith("https://qiuka.tw/#/session/42"));
  assert.doesNotMatch(summary, /private-/);
});

test("candidate and closed summaries do not promise a confirmed court or available place", () => {
  const candidate = sessionShareSummary(
    { ...source, venueType: "candidates", rangeEnd: "2099-01-02T14:00:00.000Z" },
    "link"
  );
  assert.match(candidate, /20:00～22:00/);
  assert.match(candidate, /候選球場未定案/);
  assert.doesNotMatch(candidate, /台北測試球場|已訂場/);
  for (const status of ["cancelled", "played", "expired", "full"]) {
    assert.doesNotMatch(sessionShareSummary({ ...source, status }, "link"), /缺 1 位/);
  }
});
