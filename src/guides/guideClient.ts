import "./guide.css";
import { loadCourts, loadCourtGuideSessions, isSupabaseConfigured } from "../dataApi.ts";
import { isCourtGuideSlug, resolveGuideCourt } from "../features/guides/courtGuideLinks.ts";
import { ntrpRange, vacancyLabel } from "../sessionPresentation.ts";
import { taipeiClock } from "../taipeiTime.ts";

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = "", className = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}

const main = document.querySelector<HTMLElement>("[data-court-guide]");
const list = document.getElementById("guide-session-list");
const slug = main?.dataset.courtGuide;
if (main && list && isCourtGuideSlug(slug)) {
  let generation = 0;
  const render = async (restoreFocus = false) => {
    const version = ++generation;
    list.replaceChildren(element("p", "正在載入球局…", "guide-muted"));
    try {
      // Published guides never silently substitute mock sessions when configuration is absent.
      if (!isSupabaseConfigured) throw new Error("Unavailable");
      const court = resolveGuideCourt(slug, await loadCourts());
      if (!court) throw new Error("Unavailable");
      const sessions = await loadCourtGuideSessions(Number(court.id));
      if (generation !== version) return;
      const fragment = document.createDocumentFragment();
      if (!sessions.length) {
        fragment.append(element("p", "目前沒有符合範圍的公開球局。", "guide-empty"));
        const link = element("a", "在這裡開球局", "guide-button guide-button-outline");
        link.href = `/?courtGuide=${slug}&guideAction=create#tab-map`;
        fragment.append(link);
      }
      for (const session of sessions.slice(0, 3)) {
        const card = element("article", "", "guide-session-card");
        const date = new Intl.DateTimeFormat("zh-TW", {
          timeZone: "Asia/Taipei",
          month: "numeric",
          day: "numeric",
          weekday: "short",
        }).format(new Date(session.startAt));
        const time = element("time", taipeiClock(session.startAt), "guide-session-time");
        time.dateTime = session.startAt;
        const link = element("a", "查看球局 →", "guide-link");
        link.href = `/s/${session.sessionId}`;
        link.setAttribute("aria-label", `查看 ${date} ${taipeiClock(session.startAt)} ${session.playType}球局`);
        card.append(
          element("p", date, "guide-session-date"),
          time,
          element("p", `${session.playType} · ${ntrpRange(session)}`),
          element("p", session.status === "full" ? "已額滿" : vacancyLabel(session), "guide-capacity"),
          link
        );
        fragment.append(card);
      }
      if (sessions.length > 3) {
        const more = element("a", "更多球局，前往地圖查看 →", "guide-link");
        more.href = "/";
        fragment.append(more);
      }
      list.replaceChildren(fragment);
    } catch {
      if (generation !== version) return;
      const retry = element("button", "重新載入", "guide-button guide-button-outline");
      retry.type = "button";
      retry.addEventListener("click", () => {
        void render(true);
      });
      list.replaceChildren(
        element("p", "球局暫時無法載入。"),
        element("p", "請稍後重試，場地指南仍可閱讀。", "guide-muted"),
        retry
      );
    }
    if (restoreFocus && generation === version) {
      const heading = document.getElementById("guide-sessions-title");
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    }
  };
  void render();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void render();
    else generation += 1;
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) void render();
  });
}
