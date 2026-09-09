import type { MySessionSummary } from "../../domainTypes.ts";

export function freshCreateSessionForm() {
  return {
    band: "any",
    booked: false,
    candCourts: {} as Record<string, boolean>,
    court: null as number | null,
    customDate: "",
    dateKey: "today",
    feeNote: "",
    instant: true,
    mode: "fixed",
    need: 2,
    note: "",
    nowStart: false,
    slot: null as string | null,
    time: null as string | null,
    timeCustom: false,
    type: "雙打",
  };
}

/** 只重用活動設定；日期、訂場承諾與成員資料都留在原球局。 */
export function repeatSessionDraft(source: MySessionSummary, courtIds: readonly number[]) {
  const undecided = source.venueType === "candidates" && !source.decidedAt;
  const court = !undecided && source.courtId != null && courtIds.includes(source.courtId) ? source.courtId : null;
  return {
    ...freshCreateSessionForm(),
    band: "repeat",
    court,
    dateKey: "",
    feeNote: source.feeNote,
    instant: source.joinMode === "instant",
    mode: undecided ? "cand" : "fixed",
    need: Math.max(1, Math.min(3, source.slotsTotal ?? 1)),
    note: source.notes,
    repeatRange: { ntrpMin: source.ntrpMin, ntrpMax: source.ntrpMax },
    repeated: true,
    type: source.playType === "對拉" ? "練球" : source.playType,
  };
}
