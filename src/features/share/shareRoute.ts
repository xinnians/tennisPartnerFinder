/** Keep server-readable links compatible with the existing hash/history owner. */
export function normalizeShareRoute(
  location: Pick<Location, "pathname" | "hash" | "search">,
  history: Pick<History, "replaceState" | "state">
): boolean {
  const match = /^\/s\/([1-9]\d*)\/?$/.exec(location.pathname);
  if (!match || !Number.isSafeInteger(Number(match[1]))) return false;
  const hash = location.hash || `#/session/${match[1]}`;
  history.replaceState(history.state, "", `/${location.search}${hash}`);
  return true;
}
