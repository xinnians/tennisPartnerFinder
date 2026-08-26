import type { ControllerIdentifier, ControllerMySessionGroups } from "./controllerContracts.ts";

interface MySessionsCreatedFocusOptions {
  createdSessionId: ControllerIdentifier;
  groups: ControllerMySessionGroups;
  highlightSessionId: ControllerIdentifier;
  onCreatedSessionFocus(sessionId?: ControllerIdentifier): boolean;
  rootElement: HTMLElement;
}

export function scheduleMySessionsCreatedFocus({
  createdSessionId,
  groups,
  highlightSessionId,
  onCreatedSessionFocus,
  rootElement,
}: MySessionsCreatedFocusOptions): void {
  const needsAction = Array.isArray(groups.needsAction) ? groups.needsAction : [];
  const upcoming = Array.isArray(groups.upcoming) ? groups.upcoming : [];
  const focusSessionId = highlightSessionId ?? createdSessionId;
  // 批 C3-3:聚焦目標可能落在兩個互斥的清單之一——accepted(instant 加入／host
  // 自己)在 upcoming,走 SessionCard 的「查看球局」鈕;仍在等主揪審核的三種
  // outcome(approval／NTRP 缺／範圍外)在 needsAction 的 guest-request,走
  // GuestRequestCard 的「撤回申請」鈕(卡片內唯一可聚焦元素)。同一個 sessionId
  // 只會出現在其中一個群組,兩個 selector 用逗號並列,只有比對得上的那張卡會真的
  // 帶有 data-created-session。批 D6:這裡查的 needsAction/upcoming 是未過濾的
  // 完整 groups(不是 active.*)——resolveMySessionsSegment 已保證聚焦目標所在的
  // segment 就是 activeSegment,DOM 裡一定找得到,不需要重新過濾一次。
  const focusInUpcoming = upcoming.some((session) => String(session.sessionId) === String(focusSessionId));
  const focusInNeedsAction = needsAction.some(
    (entry) => entry.kind === "guest-request" && String(entry.session.sessionId) === String(focusSessionId)
  );
  if (focusSessionId && (focusInUpcoming || focusInNeedsAction)) {
    requestAnimationFrame(() => {
      const target = rootElement.querySelector<HTMLElement>(
        "[data-created-session] [data-open-my-session], [data-created-session] [data-my-action='withdraw']"
      );
      if (!target || !onCreatedSessionFocus(focusSessionId)) return;
      target.focus({ preventScroll: true });
    });
  }
}
