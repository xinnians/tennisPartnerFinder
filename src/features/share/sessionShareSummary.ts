import type { SessionSummary } from "../../domainTypes.ts";
import { ntrpRange, vacancyLabel } from "../../sessionPresentation.ts";
import { taipeiClock, taipeiDateKey } from "../../taipeiTime.ts";

/** 明列分享欄位，不序列化活動物件或可能含私人文字的備註。 */
export function sessionShareSummary(session: SessionSummary, link: string): string {
  const undecided = session.venueType === "candidates" && !session.decidedAt;
  const time = `${taipeiDateKey(session.startAt) ?? "日期待確認"} ${taipeiClock(session.startAt)}`;
  const range = undecided && session.rangeEnd ? `～${taipeiClock(session.rangeEnd)}` : "";
  const capacity =
    session.status === "open"
      ? vacancyLabel(session)
      : {
          cancelled: "已取消",
          played: "已結束",
          expired: "已過期",
          full: "已額滿",
        }[session.status];
  const venue =
    session.venueType === "booked"
      ? "已訂場"
      : session.venueType === "walk_on"
        ? "現場等場，尚未訂場"
        : "已定案，訂場待確認";
  return [
    "球咖｜台北網球",
    `${time}${range}（台北時間）`,
    undecided ? "候選球場未定案（見連結）" : `${session.court || "球場待確認"} · ${venue}`,
    `${session.playType} · ${ntrpRange(session)} · ${capacity}`,
    "最新名額與場地以連結為準。",
    link,
  ].join("\n");
}
