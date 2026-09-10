import { COURT_GUIDE_NAMES, isCourtGuideSlug, canStartFromGuide } from "./courtGuideLinks.ts";

const HINT_KEY = "qiuka:court-guide-subscription-hint";
const HINT_TTL = 10 * 60 * 1000;

/** Consume only the approved public slug/action pair; drafts never travel in URLs. */
export function consumeGuideEntry(location = window.location, history = window.history, storage?: Storage) {
  const url = new URL(location.href);
  const slug = url.searchParams.get("courtGuide");
  const action = url.searchParams.get("guideAction");
  const valid =
    url.searchParams.getAll("courtGuide").length === 1 &&
    url.searchParams.getAll("guideAction").length === 1 &&
    canStartFromGuide(slug) &&
    (action === "create" || action === "subscribe");
  if (!url.searchParams.has("courtGuide") && !url.searchParams.has("guideAction")) return null;
  url.searchParams.delete("courtGuide");
  url.searchParams.delete("guideAction");
  history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
  if (!valid) return null;
  if (action === "subscribe") {
    try {
      (storage ?? window.sessionStorage).setItem(
        HINT_KEY,
        JSON.stringify({ slug, createdAt: Date.now(), identity: null })
      );
    } catch {
      /* Optional hint must not block navigation. */
    }
  }
  return { slug, action };
}

/** An informational hint only: never writes subscriptions or requests permission. */
export function subscriptionGuideHint(identity: string | null, storage?: Storage, now = Date.now()): string | null {
  try {
    const hintStorage = storage ?? window.sessionStorage;
    const value: unknown = JSON.parse(hintStorage.getItem(HINT_KEY) || "null");
    if (!value || typeof value !== "object") return null;
    const hint = value as Record<string, unknown>;
    const slug: unknown = hint.slug;
    if (
      !isCourtGuideSlug(slug) ||
      typeof hint.createdAt !== "number" ||
      !Number.isFinite(hint.createdAt) ||
      now - hint.createdAt > HINT_TTL ||
      now < hint.createdAt ||
      (hint.identity && hint.identity !== identity)
    ) {
      hintStorage.removeItem(HINT_KEY);
      return null;
    }
    if (identity && !hint.identity) hintStorage.setItem(HINT_KEY, JSON.stringify({ ...hint, identity }));
    return COURT_GUIDE_NAMES[slug];
  } catch {
    return null;
  }
}
