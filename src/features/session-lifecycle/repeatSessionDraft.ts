import type { MySessionSummary } from "../../domainTypes.ts";
import { isUndecidedCandidate } from "../../sessionCriteria.ts";

/** 新建與重開共用初值；重開只覆寫可沿用的活動設定。 */
export function createSessionDraft(source?: MySessionSummary, courtIds: readonly number[] = []) {
  const form = {
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
  if (!source) return form;
  const undecided = isUndecidedCandidate(source);
  const court = !undecided && source.courtId != null && courtIds.includes(source.courtId) ? source.courtId : null;
  return Object.assign(form, {
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
  });
}
